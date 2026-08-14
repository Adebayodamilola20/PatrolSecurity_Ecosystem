import 'dart:async';
import 'dart:io' show Platform;
import 'package:geolocator/geolocator.dart';

class SafeLocationResult {
  final double latitude;
  final double longitude;
  final double accuracyMeters;
  final DateTime capturedAt;
  final String? error;
  final double? speed;
  final double? heading;

  const SafeLocationResult({
    required this.latitude,
    required this.longitude,
    required this.accuracyMeters,
    required this.capturedAt,
    this.error,
    this.speed,
    this.heading,
  });

  bool get isSuccess => error == null;
  bool get isAccurate => accuracyMeters <= 100.0;

  Map<String, dynamic> toPayload() => {
    'latitude': latitude,
    'longitude': longitude,
    'accuracy': accuracyMeters,
    'capturedAt': capturedAt.toIso8601String(),
    if (speed != null) 'speed': speed,
    if (heading != null) 'heading': heading,
  };
}

class LocationService {
  static const double _maxAccuracyMeters = 100.0;
  static const Duration _maxCachedLocationAge = Duration(seconds: 8);

  /// How long to keep listening for the fix to tighten before giving up. A cold
  /// receiver indoors can take well over ten seconds to drop from a coarse
  /// network estimate to a satellite fix, so this is deliberately generous —
  /// nothing waits the full window once the reading is good enough.
  static const Duration _fixWindow = Duration(seconds: 20);
  static SafeLocationResult? _lastGoodLocation;
  static Future<SafeLocationResult>? _locationRequest;

  /// Held open for the whole shift. See [startWarmTracking].
  static StreamSubscription<Position>? _warmSubscription;

  /// Keeps the GPS receiver powered for the duration of a shift.
  ///
  /// The old design asked for a one-shot position every 30 seconds and let the
  /// receiver sleep in between. Each request therefore started cold, and a cold
  /// receiver answers with a cell-tower estimate — around 1400m — long before
  /// it has a satellite lock. That reading failed the accuracy check, the
  /// position update was dropped, and dropping it meant nothing ever kept the
  /// receiver awake. The next request started cold too. Guards sat in that loop
  /// indefinitely: same coarse number every retry, scans permanently refused.
  ///
  /// A stream that stays subscribed never lets the receiver sleep, so readings
  /// stay in the 10-25m range the hardware is actually capable of and a scan
  /// resolves immediately instead of racing a warm-up it cannot win.
  /// Fan-out for the single platform subscription. Everything that wants
  /// positions listens here rather than opening its own stream: iOS does not
  /// reliably feed two concurrent `getPositionStream` subscriptions, and when
  /// the shift-long warm stream was already running a second one opened for a
  /// scan received nothing at all until it timed out.
  static final StreamController<Position> _positions =
      StreamController<Position>.broadcast();

  /// Settings that keep the fix coming once the phone is pocketed.
  ///
  /// A plain [LocationSettings] stream is killed by the OS the moment the app
  /// leaves the screen, which is how a guard's dot ended up frozen at the spot
  /// they last had the app open — for days, through a shift they never clocked
  /// out of. Android needs a foreground service, which by law shows a
  /// persistent notification; iOS needs background updates enabled explicitly.
  /// Both keep the guard visibly informed that they are being tracked, which
  /// is the right trade: covert tracking of staff is not what this is for.
  static LocationSettings _trackingSettings() {
    if (Platform.isAndroid) {
      return AndroidSettings(
        accuracy: LocationAccuracy.best,
        distanceFilter: 0,
        forceLocationManager: false,
        foregroundNotificationConfig: const ForegroundNotificationConfig(
          notificationTitle: 'Patrol tracking active',
          notificationText:
              'Your location is shared with the control room until you clock out.',
          enableWakeLock: true,
          setOngoing: true,
        ),
      );
    }
    if (Platform.isIOS) {
      return AppleSettings(
        accuracy: LocationAccuracy.best,
        distanceFilter: 0,
        allowBackgroundLocationUpdates: true,
        // Leaves the blue status bar showing, so tracking is never silent.
        showBackgroundLocationIndicator: true,
        // iOS otherwise pauses updates when it decides the phone is stationary
        // and does not reliably resume — a guard standing a post disappears.
        pauseLocationUpdatesAutomatically: false,
      );
    }
    return const LocationSettings(
      accuracy: LocationAccuracy.best,
      distanceFilter: 0,
    );
  }

  static void _openStream() {
    if (_warmSubscription != null) return;
    _warmSubscription =
        Geolocator.getPositionStream(
          locationSettings: _trackingSettings(),
        ).listen(
          (position) {
            if (!_positions.isClosed) _positions.add(position);
            if (position.accuracy > _maxAccuracyMeters) return;
            _lastGoodLocation = SafeLocationResult(
              latitude: position.latitude,
              longitude: position.longitude,
              accuracyMeters: position.accuracy,
              capturedAt: position.timestamp,
              speed: position.speed,
              heading: position.heading,
            );
          },
          // Losing the stream must not take the app down.
          onError: (_) {},
          cancelOnError: false,
        );
  }

  static void startWarmTracking() {
    _warmTrackingRequested = true;
    _openStream();
  }

  /// Asks for the "Allow all the time" permission, which is what actually keeps
  /// the fix coming once the phone is locked and in a pocket.
  ///
  /// Android will not grant it in the same prompt as while-using-the-app: it
  /// has to be a second, separate request, and from Android 11 the system
  /// sends the guard to Settings rather than showing a dialog. Returns whether
  /// background tracking is available so the caller can say so plainly instead
  /// of promising tracking it is not going to get.
  static Future<bool> ensureBackgroundPermission() async {
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.always) return true;
    if (permission == LocationPermission.whileInUse) {
      // Prompting again is what escalates while-in-use to always. If the guard
      // declines, the shift still runs — it just stops updating once the app
      // is closed, and the map now shows that position as stale rather than
      // pretending it is current.
      permission = await Geolocator.requestPermission();
      return permission == LocationPermission.always;
    }
    return false;
  }

  /// Releases the receiver once the guard is off duty, so an idle phone is not
  /// holding GPS open for the rest of the day.
  static void stopWarmTracking() {
    _warmTrackingRequested = false;
    _warmSubscription?.cancel();
    _warmSubscription = null;
  }

  /// True while a shift is holding the receiver open.
  static bool _warmTrackingRequested = false;

  static Future<SafeLocationResult> getCurrentLocation({
    bool allowCached = true,
  }) {
    final cached = _lastGoodLocation;
    if (allowCached &&
        cached != null &&
        DateTime.now().difference(cached.capturedAt) <= _maxCachedLocationAge) {
      return Future.value(cached);
    }
    final activeRequest = _locationRequest;
    if (activeRequest != null) return activeRequest;

    _locationRequest = _resolveCurrentLocation()
        .then((location) {
          if (location.isSuccess) {
            _lastGoodLocation = location;
          }
          return location;
        })
        .whenComplete(() {
          _locationRequest = null;
        });
    return _locationRequest!;
  }

  /// Purpose key matching `NSLocationTemporaryUsageDescriptionDictionary` in
  /// Info.plist. iOS silently refuses the prompt if the two disagree.
  static const String _fullAccuracyPurposeKey = 'PatrolScan';

  /// Detects the iOS "precise location off" state and tries to get out of it.
  ///
  /// Returns `null` when accuracy is precise (or the platform has no such
  /// concept), or a populated error result naming the actual setting when the
  /// system is still withholding precise location. Never throws: a plugin that
  /// doesn't implement this should not block a scan on a device where the
  /// reading would have been fine.
  static Future<SafeLocationResult?> _ensurePreciseAccuracy() async {
    try {
      var status = await Geolocator.getLocationAccuracy();
      if (status == LocationAccuracyStatus.precise) return null;

      // One chance to grant it for this session without leaving the app.
      status = await Geolocator.requestTemporaryFullAccuracy(
        purposeKey: _fullAccuracyPurposeKey,
      );
      if (status == LocationAccuracyStatus.precise) return null;

      return SafeLocationResult(
        latitude: 0,
        longitude: 0,
        accuracyMeters: double.infinity,
        capturedAt: DateTime.now(),
        error:
            'Precise Location is turned off for this app, so the phone only '
            'reports a rough area. Turn on Settings > Privacy & Security > '
            'Location Services > Patrol > Precise Location, then try again.',
      );
    } catch (_) {
      // Unsupported platform or plugin error — fall through to a normal fix
      // attempt rather than refusing a scan that might well have worked.
      return null;
    }
  }

  /// Returns the tightest fix the receiver produces inside [window].
  ///
  /// A phone's first reading is nearly always a coarse cell/wifi estimate that
  /// tightens over the next several seconds as satellites lock. Asking for a
  /// single position the instant the scan screen opens therefore reports
  /// hundreds — or thousands — of metres of error even outdoors with precise
  /// location granted, and the guard is told to "move to an open area" when
  /// they are already standing in one. Sampling the stream and keeping the best
  /// reading fixes that. It returns the moment a fix clears the accuracy bar,
  /// so a good receiver still resolves in well under a second.
  static Future<Position?> _bestFixWithin(
    Duration window, {
    void Function(double accuracy)? onSample,
  }) async {
    Position? best;
    final completer = Completer<Position?>();
    StreamSubscription<Position>? sub;
    Timer? deadline;

    void finish() {
      if (completer.isCompleted) return;
      deadline?.cancel();
      sub?.cancel();
      // Only release the receiver if no shift is holding it open.
      if (!_warmTrackingRequested) {
        _warmSubscription?.cancel();
        _warmSubscription = null;
      }
      completer.complete(best);
    }

    deadline = Timer(window, finish);

    // Listen to the shared fan-out, then make sure the one platform stream is
    // running. Opening a second platform stream here is what starved this path
    // of events whenever a shift already had one open.
    sub = _positions.stream.listen(
      (position) {
        onSample?.call(position.accuracy);
        final current = best;
        if (current == null || position.accuracy < current.accuracy) {
          best = position;
        }
        // Good enough — don't make the guard wait out the rest of the window.
        if (position.accuracy <= _maxAccuracyMeters) finish();
      },
      // A stream error shouldn't discard a good reading already in hand; the
      // caller falls back to the last known position when nothing arrived.
      onError: (_) => finish(),
      cancelOnError: false,
    );

    _openStream();

    return completer.future;
  }

  static Future<SafeLocationResult> _resolveCurrentLocation() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      return SafeLocationResult(
        latitude: 0,
        longitude: 0,
        accuracyMeters: double.infinity,
        capturedAt: DateTime.now(),
        error:
            'Phone location is turned off. Enable device location and try again.',
      );
    }

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        return SafeLocationResult(
          latitude: 0,
          longitude: 0,
          accuracyMeters: double.infinity,
          capturedAt: DateTime.now(),
          error: 'Location permission was denied for this app.',
        );
      }
    }

    if (permission == LocationPermission.deniedForever) {
      return SafeLocationResult(
        latitude: 0,
        longitude: 0,
        accuracyMeters: double.infinity,
        capturedAt: DateTime.now(),
        error:
            'Location permission is blocked for this app. Allow location in Android app settings.',
      );
    }

    // iOS lets the user grant location while withholding *precise* location. In
    // that mode Core Location returns a deliberately fuzzed point with a fixed
    // accuracy around 1400m — it never improves, no matter how long you sample
    // or how open the sky is. Waiting for it to tighten is futile and telling
    // the guard to "move to an open area" is actively misleading, so detect the
    // state and ask for precise access instead.
    final reducedAccuracyError = await _ensurePreciseAccuracy();
    if (reducedAccuracyError != null) return reducedAccuracyError;

    try {
      final samples = <double>[];
      final position = await _bestFixWithin(_fixWindow, onSample: samples.add);
      if (position == null) {
        // TEMPORARY diagnostic: distinguishes "the receiver said nothing at
        // all" from "it answered and every answer was too coarse".
        throw TimeoutException(
          'No position in ${_fixWindow.inSeconds}s. Samples seen: ${samples.length}.',
        );
      }

      final accuracy = position.accuracy;
      if (accuracy > _maxAccuracyMeters) {
        // TEMPORARY diagnostic: the sample trail shows whether the fix was
        // tightening at all, or pinned at one value the whole window.
        final trail = samples.map((a) => a.toStringAsFixed(0)).join(' > ');
        return SafeLocationResult(
          latitude: 0,
          longitude: 0,
          accuracyMeters: accuracy,
          capturedAt: DateTime.now(),
          error:
              'GPS never got below ${_maxAccuracyMeters.toStringAsFixed(0)}m in '
              '${_fixWindow.inSeconds}s. Best ${accuracy.toStringAsFixed(0)}m '
              'from ${samples.length} readings [$trail].',
        );
      }

      return SafeLocationResult(
        latitude: position.latitude,
        longitude: position.longitude,
        accuracyMeters: accuracy,
        capturedAt: position.timestamp,
        speed: position.speed,
        heading: position.heading,
      );
    } on TimeoutException {
      final lastKnown = await Geolocator.getLastKnownPosition();
      if (lastKnown != null) {
        final accuracy = lastKnown.accuracy;
        if (accuracy <= _maxAccuracyMeters) {
          return SafeLocationResult(
            latitude: lastKnown.latitude,
            longitude: lastKnown.longitude,
            accuracyMeters: accuracy,
            capturedAt: lastKnown.timestamp,
            speed: lastKnown.speed,
            heading: lastKnown.heading,
          );
        }
      }
      return SafeLocationResult(
        latitude: 0,
        longitude: 0,
        accuracyMeters: double.infinity,
        capturedAt: DateTime.now(),
        error:
            'Could not get accurate GPS in time. Move to an open area and try again.',
      );
    } on LocationServiceDisabledException {
      return SafeLocationResult(
        latitude: 0,
        longitude: 0,
        accuracyMeters: double.infinity,
        capturedAt: DateTime.now(),
        error:
            'Phone location is turned off. Enable device location and try again.',
      );
    } catch (_) {
      final lastKnown = await Geolocator.getLastKnownPosition();
      if (lastKnown != null) {
        final accuracy = lastKnown.accuracy;
        if (accuracy <= _maxAccuracyMeters) {
          return SafeLocationResult(
            latitude: lastKnown.latitude,
            longitude: lastKnown.longitude,
            accuracyMeters: accuracy,
            capturedAt: lastKnown.timestamp,
            speed: lastKnown.speed,
            heading: lastKnown.heading,
          );
        }
      }
      return SafeLocationResult(
        latitude: 0,
        longitude: 0,
        accuracyMeters: double.infinity,
        capturedAt: DateTime.now(),
        error:
            'GPS is unavailable right now. Check app location permission and try again.',
      );
    }
  }

  static double calculateDistance(
    double lat1,
    double lng1,
    double lat2,
    double lng2,
  ) {
    return Geolocator.distanceBetween(lat1, lng1, lat2, lng2);
  }
}
