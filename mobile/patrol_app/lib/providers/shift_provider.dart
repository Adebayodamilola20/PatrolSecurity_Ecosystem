import 'dart:async';
import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/location_service.dart';
import '../utils/constants.dart';

class ShiftProvider extends ChangeNotifier {
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
    LocationService.startWarmTracking();
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
    LocationService.stopWarmTracking();
    _positionTimer?.cancel();
    _positionTimer = null;
  }

  Future<void> _sendPositionUpdate() async {
    if (!_onDuty) return;
    if (_sendingPosition) return;
    _sendingPosition = true;
    final location = await LocationService.getCurrentLocation();
    try {
      if (!location.isSuccess) return;
      await ApiService.updatePosition(
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracyMeters,
        speed: location.speed,
        heading: location.heading,
      );
    } finally {
      _sendingPosition = false;
    }
  }

  Future<bool> clockIn() async {
    _loading = true;
    _error = null;
    notifyListeners();

    try {
      final location = await LocationService.getCurrentLocation(
        allowCached: false,
      );
      final data = await ApiService.clockIn(
        latitude: location.isSuccess ? location.latitude : null,
        longitude: location.isSuccess ? location.longitude : null,
      );
      _applyShiftPayload(data);
      await loadStatus(force: true);
      _startPositionTracking();
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

  Future<bool> clockOut() async {
    _loading = true;
    _error = null;
    notifyListeners();

    try {
      final location = await LocationService.getCurrentLocation(
        allowCached: false,
      );
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

  @override
  void dispose() {
    _stopPositionTracking();
    super.dispose();
  }
}
