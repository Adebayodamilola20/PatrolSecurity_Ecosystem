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

  Future<void> loadStatus() async {
    try {
      final data = await ApiService.getShiftStatus();
      _onDuty = data['active'] == true;
      if (data['shift'] != null && data['shift']['clockIn'] != null) {
        _clockInTime = DateTime.tryParse(data['shift']['clockIn']);
      }
      notifyListeners();
    } catch (_) {}
  }

  Future<bool> clockIn() async {
    _loading = true;
    _error = null;
    notifyListeners();

    try {
      await ApiService.clockIn();
      _onDuty = true;
      _clockInTime = DateTime.now();
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
      await ApiService.clockOut();
      _onDuty = false;
      _clockInTime = null;
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
