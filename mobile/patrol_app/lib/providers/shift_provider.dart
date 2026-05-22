import 'dart:async';
import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/location_service.dart';

class ShiftProvider extends ChangeNotifier {
  bool _onDuty = false;
  bool _loading = false;
  String? _error;
  DateTime? _clockInTime;
  DateTime? _scheduledEnd;
  String? _siteLabel;
  Timer? _positionTimer;
  bool _positionTracking = false;

  bool get onDuty => _onDuty;
  bool get loading => _loading;
  String? get error => _error;
  DateTime? get clockInTime => _clockInTime;
  DateTime? get scheduledEnd => _scheduledEnd;
  String? get siteLabel => _siteLabel;
  bool get positionTracking => _positionTracking;

  void clearData() {
    _stopPositionTracking();
    _onDuty = false;
    _loading = false;
    _error = null;
    _clockInTime = null;
    _scheduledEnd = null;
    _siteLabel = null;
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

    final active = data['active'] ??
        data['onDuty'] ??
        data['isClockedIn'] ??
        shift?['active'] ??
        shift?['onDuty'] ??
        shift?['isClockedIn'] ??
        (shift?['clockOut'] == null && shift != null);

    _onDuty = active == true || active == 1 || active == 'true';

    final clockIn = data['clockIn'] ??
        shift?['clockIn'] ??
        shift?['clockInTime'] ??
        shift?['createdAt'];
    _clockInTime = clockIn is String ? DateTime.tryParse(clockIn) : null;
    final scheduledEnd = data['scheduledEnd'] ?? shift?['scheduledEnd'];
    _scheduledEnd =
        scheduledEnd is String ? DateTime.tryParse(scheduledEnd) : null;
    _siteLabel = (data['siteLabel'] ?? shift?['siteLabel'])?.toString();
  }

  Future<void> loadStatus() async {
    try {
      final data = await ApiService.getShiftStatus();
      _error = null;
      _applyShiftPayload(data);
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
    _positionTimer?.cancel();
    _positionTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      _sendPositionUpdate();
    });
    _sendPositionUpdate();
  }

  void _stopPositionTracking() {
    _positionTracking = false;
    _positionTimer?.cancel();
    _positionTimer = null;
  }

  Future<void> _sendPositionUpdate() async {
    if (!_onDuty) return;
    final location = await LocationService.getCurrentLocation();
    if (location.position == null) return;
    await ApiService.updatePosition(
      latitude: location.position!.latitude,
      longitude: location.position!.longitude,
      accuracy: location.position!.accuracy,
      speed: location.position!.speed,
      heading: location.position!.heading,
    );
  }

  Future<bool> clockIn() async {
    _loading = true;
    _error = null;
    notifyListeners();

    try {
      final location = await LocationService.getCurrentLocation();
      final data = await ApiService.clockIn(
        latitude: location.position?.latitude,
        longitude: location.position?.longitude,
      );
      _applyShiftPayload(data);
      await loadStatus();
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
      final location = await LocationService.getCurrentLocation();
      final data = await ApiService.clockOut(
        latitude: location.position?.latitude,
        longitude: location.position?.longitude,
      );
      _applyShiftPayload(data);
      await loadStatus();
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
