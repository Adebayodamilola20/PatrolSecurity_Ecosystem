import 'dart:async';
import 'dart:io' show IOException;
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../models/clock_in_check.dart';
import '../services/api_service.dart';
import '../services/location_service.dart';
import '../utils/constants.dart';

/// What a shift needs from the phone's location hardware.
///
/// Production always uses this default, which is a straight pass-through to
/// [LocationService]. It exists as a class so tests can stand in for the GPS
/// chip; without it nothing about clocking in can be exercised off a device.
class ShiftLocationSource {
  const ShiftLocationSource();

  Future<SafeLocationResult> current({bool allowCached = true}) =>
      LocationService.getCurrentLocation(allowCached: allowCached);

  Future<bool> ensureBackgroundPermission() =>
      LocationService.ensureBackgroundPermission();

  void startWarmTracking() => LocationService.startWarmTracking();

  void stopWarmTracking() => LocationService.stopWarmTracking();
}

class ShiftProvider extends ChangeNotifier {
  ShiftProvider({ShiftLocationSource location = const ShiftLocationSource()})
    : _location = location;

  final ShiftLocationSource _location;

  bool _onDuty = false;
  bool _loading = false;
  String? _error;
  DateTime? _clockInTime;
  DateTime? _scheduledEnd;
  String? _siteLabel;
  bool? _clockInGpsValid;
  double? _clockInDistanceMeters;
  bool? _clockOutGpsValid;
  double? _clockOutDistanceMeters;
  Timer? _positionTimer;
  bool _positionTracking = false;
  /// Whether the guard granted "all the time" location at clock-in. False means
  /// their position stops updating as soon as the app is closed, which the UI
  /// should say rather than leave them assuming they are being tracked.
  bool _backgroundTrackingGranted = false;
  bool get backgroundTrackingGranted => _backgroundTrackingGranted;
  bool _sendingPosition = false;
  Future<void>? _statusLoadFuture;
  DateTime? _statusLoadedAt;

  bool get onDuty => _onDuty;
  bool get loading => _loading;
  String? get error => _error;
  DateTime? get clockInTime => _clockInTime;
  DateTime? get scheduledEnd => _scheduledEnd;
  String? get siteLabel => _siteLabel;
  bool? get clockInGpsValid => _clockInGpsValid;
  double? get clockInDistanceMeters => _clockInDistanceMeters;
  bool? get clockOutGpsValid => _clockOutGpsValid;
  double? get clockOutDistanceMeters => _clockOutDistanceMeters;
  bool get positionTracking => _positionTracking;

  /// How the server confirmed the most recent successful clock-in, or null
  /// when the server sent no details (older backend) or the last attempt
  /// failed.
  ClockInCheck? _lastCheckIn;
  ClockInCheck? get lastCheckIn => _lastCheckIn;

  void clearData() {
    _stopPositionTracking();
    _onDuty = false;
    _loading = false;
    _error = null;
    _clockInTime = null;
    _scheduledEnd = null;
    _siteLabel = null;
    _clockInGpsValid = null;
    _clockInDistanceMeters = null;
    _clockOutGpsValid = null;
    _clockOutDistanceMeters = null;
    _statusLoadedAt = null;
    _lastCheckIn = null;
    notifyListeners();
  }

  void _applyShiftPayload(Map<String, dynamic> data) {
    final shift = data['shift'] is Map<String, dynamic>
        ? data['shift'] as Map<String, dynamic>
        : data['data'] is Map<String, dynamic> &&
              (data['data'] as Map<String, dynamic>)['shift']
                  is Map<String, dynamic>
        ? (data['data'] as Map<String, dynamic>)['shift']
              as Map<String, dynamic>
        : null;

    final active =
        data['active'] ??
        data['onDuty'] ??
        data['isClockedIn'] ??
        shift?['active'] ??
        shift?['onDuty'] ??
        shift?['isClockedIn'] ??
        (shift?['clockOut'] == null && shift != null);

    _onDuty = active == true || active == 1 || active == 'true';

    final clockIn =
        data['clockIn'] ??
        shift?['clockIn'] ??
        shift?['clockInTime'] ??
        shift?['createdAt'];
    _clockInTime = clockIn is String ? DateTime.tryParse(clockIn) : null;
    final scheduledEnd = data['scheduledEnd'] ?? shift?['scheduledEnd'];
    _scheduledEnd = scheduledEnd is String
        ? DateTime.tryParse(scheduledEnd)
        : null;
    _siteLabel = (data['siteLabel'] ?? shift?['siteLabel'])?.toString();
    _clockInGpsValid = data['clockInGpsValid'] ?? shift?['clockInGpsValid'];
    _clockInDistanceMeters =
        (data['clockInDistanceMeters'] ?? shift?['clockInDistanceMeters'])
            ?.toDouble();
    _clockOutGpsValid = data['clockOutGpsValid'] ?? shift?['clockOutGpsValid'];
    _clockOutDistanceMeters =
        (data['clockOutDistanceMeters'] ?? shift?['clockOutDistanceMeters'])
            ?.toDouble();
  }

  Future<void> loadStatus({bool force = false}) {
    if (_statusLoadFuture != null) return _statusLoadFuture!;
    final loadedAt = _statusLoadedAt;
    if (!force &&
        loadedAt != null &&
        DateTime.now().difference(loadedAt) < const Duration(seconds: 20)) {
      return Future.value();
    }
    _statusLoadFuture = _loadStatus().whenComplete(() {
      _statusLoadFuture = null;
    });
    return _statusLoadFuture!;
  }

  Future<void> _loadStatus() async {
    try {
      final data = await ApiService.getShiftStatus();
      _error = null;
      _applyShiftPayload(data);
      _statusLoadedAt = DateTime.now();
      if (_onDuty && !_positionTracking) {
        _startPositionTracking();
      } else if (!_onDuty && _positionTracking) {
        _stopPositionTracking();
      }
      notifyListeners();
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
      notifyListeners();
    }
  }

  void _startPositionTracking() {
    _positionTracking = true;
    // Hold the receiver open for the shift. Without this each 30s tick starts
    // from a cold chip, reads a ~1400m cell-tower estimate, fails the accuracy
    // check and drops the update — which is what kept it cold in the first
    // place. Guards could not break out of that loop by retrying.
    _location.startWarmTracking();
    _positionTimer?.cancel();
    _positionTimer = Timer.periodic(
      const Duration(seconds: continuousGpsUpdateSeconds),
      (_) {
        _sendPositionUpdate();
      },
    );
    _sendPositionUpdate();
  }

  void _stopPositionTracking() {
    _positionTracking = false;
    _location.stopWarmTracking();
    _positionTimer?.cancel();
    _positionTimer = null;
  }

  Future<void> _sendPositionUpdate() async {
    if (!_onDuty) return;
    if (_sendingPosition) return;
    _sendingPosition = true;
    final location = await _location.current();
    try {
      if (!location.isSuccess) return;
      await ApiService.updatePosition(
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracyMeters,
        speed: location.speed,
        heading: location.heading,
        mocked: location.isMocked,
      );
    } finally {
      _sendingPosition = false;
    }
  }

  /// Clocks in. [locationCode] is the exact text of the location QR the guard
  /// scanned at the main entrance; without it the server judges the clock-in
  /// on GPS alone, and decides whether that is allowed.
  Future<bool> clockIn({String? locationCode}) async {
    _loading = true;
    _error = null;
    _lastCheckIn = null;
    notifyListeners();

    try {
      final location = await _location.current(allowCached: false);
      // Stop here rather than sending a clock-in the server will refuse. The
      // location service has already asked for permission and turned the
      // system prompt on by this point, so the guard has seen the dialog —
      // what they need now is a plain sentence about what to do next.
      if (!location.isSuccess) {
        return _clockInFailed(
          location.error?.isNotEmpty == true
              ? location.error!
              : 'Turn on location for this app, allow it while using the app, '
                    'then clock in again.',
        );
      }
      // Ask for "all the time" here, at the start of the shift, because this
      // is the only moment the request makes sense to a guard: they are
      // clocking on, and tracking runs until they clock off. Declining does
      // not block the shift — it just means the position stops updating once
      // the app is closed.
      _backgroundTrackingGranted =
          await _location.ensureBackgroundPermission();

      final data = await ApiService.clockIn(
        latitude: location.latitude,
        longitude: location.longitude,
        mocked: location.isMocked,
        locationCode: locationCode,
      );
      _applyShiftPayload(data);
      _lastCheckIn = ClockInCheck.fromResponse(data);
      await loadStatus(force: true);
      _startPositionTracking();
      _loading = false;
      notifyListeners();
      return true;
    } catch (e) {
      return _clockInFailed(_clockInErrorMessage(e));
    }
  }

  /// Ends a failed clock-in with the app matching the server.
  ///
  /// Whatever went wrong, the server may still hold an open shift for this
  /// guard: a 409 "Already clocked in" means it certainly does, and a timeout
  /// can land after the shift was written. Without this resync the app went on
  /// showing "Off duty" while every clock-in was refused as a duplicate, and
  /// the guard had no way forward. The resync can itself fail (it is usually
  /// the same dead connection) and it also clears [error] on success, so the
  /// reason is put back afterwards — the guard must see why the clock-in
  /// failed, not what happened to the status check.
  Future<bool> _clockInFailed(String message) async {
    try {
      await loadStatus(force: true);
    } catch (_) {
      // loadStatus already catches its own errors; this is belt and braces so
      // nothing here can replace the original reason.
    }
    _error = message;
    _loading = false;
    notifyListeners();
    return false;
  }

  Future<bool> clockOut() async {
    _loading = true;
    _error = null;
    notifyListeners();

    try {
      final location = await _location.current(allowCached: false);
      final data = await ApiService.clockOut(
        latitude: location.isSuccess ? location.latitude : null,
        longitude: location.isSuccess ? location.longitude : null,
      );
      _applyShiftPayload(data);
      await loadStatus(force: true);
      _stopPositionTracking();
      _loading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
      _loading = false;
      notifyListeners();
      return false;
    }
  }

  /// The sentence a guard sees when a clock-in request fails.
  ///
  /// Server refusals carry their own guard-facing message, which is passed
  /// through untouched. Transport failures are replaced: their text is a stack
  /// of URLs and socket codes, and the only useful thing to say is that there
  /// is no connection.
  static String _clockInErrorMessage(Object e) {
    if (e is IOException ||
        e is TimeoutException ||
        e is http.ClientException) {
      return 'No connection. Check your internet and try again.';
    }
    final text = e.toString();
    return text.startsWith('Exception: ')
        ? text.substring('Exception: '.length)
        : text;
  }

  @override
  void dispose() {
    _stopPositionTracking();
    super.dispose();
  }
}
