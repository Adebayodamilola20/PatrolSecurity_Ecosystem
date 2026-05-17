import 'package:flutter/material.dart';
import '../services/api_service.dart';

class ShiftProvider extends ChangeNotifier {
  bool _onDuty = false;
  bool _loading = false;
  String? _error;
  DateTime? _clockInTime;

  bool get onDuty => _onDuty;
  bool get loading => _loading;
  String? get error => _error;
  DateTime? get clockInTime => _clockInTime;

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
  }

  Future<void> loadStatus() async {
    try {
      final data = await ApiService.getShiftStatus();
      _error = null;
      _applyShiftPayload(data);
      notifyListeners();
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
      notifyListeners();
    }
  }

  Future<bool> clockIn() async {
    _loading = true;
    _error = null;
    notifyListeners();

    try {
      final data = await ApiService.clockIn();
      _applyShiftPayload(data);
      await loadStatus();
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
      final data = await ApiService.clockOut();
      _applyShiftPayload(data);
      await loadStatus();
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
}
