import 'dart:async';
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
  static Future<Position?> _bestFixWithin(Duration window) async {
    Position? best;
    final completer = Completer<Position?>();
    StreamSubscription<Position>? sub;
    Timer? deadline;

    void finish() {
      if (completer.isCompleted) return;
      deadline?.cancel();
      sub?.cancel();
      completer.complete(best);
    }

    deadline = Timer(window, finish);

    sub = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.best,
        distanceFilter: 0,
      ),
    ).listen(
      (position) {
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
      final position = await _bestFixWithin(_fixWindow);
      if (position == null) {
        throw TimeoutException('No position was delivered inside the window.');
      }

      final accuracy = position.accuracy;
      if (accuracy > _maxAccuracyMeters) {
        return SafeLocationResult(
          latitude: 0,
          longitude: 0,
          accuracyMeters: accuracy,
          capturedAt: DateTime.now(),
          error:
              'GPS accuracy is too low (${accuracy.toStringAsFixed(0)}m). Move to an open area and try again.',
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
