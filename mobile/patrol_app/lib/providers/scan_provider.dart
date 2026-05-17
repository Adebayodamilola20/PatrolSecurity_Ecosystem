import 'package:flutter/material.dart';
import '../models/scan.dart';
import '../models/checkpoint.dart';
import '../services/api_service.dart';

class ScanProvider extends ChangeNotifier {
  List<Scan> _scans = [];
  List<Checkpoint> _checkpoints = [];
  bool _scansLoading = false;
  bool _checkpointsLoading = false;
  String? _scansError;
  String? _checkpointsError;
  Scan? _lastScan;

  List<Scan> get scans => _scans;
  List<Checkpoint> get checkpoints => _checkpoints;
  bool get loading => _scansLoading || _checkpointsLoading;
  bool get scansLoading => _scansLoading;
  bool get checkpointsLoading => _checkpointsLoading;
  String? get error => _scansError ?? _checkpointsError;
  String? get scansError => _scansError;
  String? get checkpointsError => _checkpointsError;
  Scan? get lastScan => _lastScan;

  int get totalScans => _scans.length;
  int get todayScans => _scans.where((s) {
        final now = DateTime.now();
        return s.scannedAt.year == now.year &&
            s.scannedAt.month == now.month &&
            s.scannedAt.day == now.day;
      }).length;

  Future<void> loadScans() async {
    _scansLoading = true;
    _scansError = null;
    notifyListeners();
    try {
      final data = await ApiService.getScans();
      _scans = data.map((j) => Scan.fromJson(j)).toList();
    } catch (e) {
      _scansError = e.toString().replaceFirst('Exception: ', '');
    }
    _scansLoading = false;
    notifyListeners();
  }

  Future<void> loadCheckpoints() async {
    _checkpointsLoading = true;
    _checkpointsError = null;
    notifyListeners();
    try {
      final data = await ApiService.getCheckpoints();
      _checkpoints = data.map((j) => Checkpoint.fromJson(j)).toList();
    } catch (e) {
      _checkpointsError = e.toString().replaceFirst('Exception: ', '');
    }
    _checkpointsLoading = false;
    notifyListeners();
  }

  Future<bool> submitScan(Map<String, dynamic> data) async {
    try {
      final result = await ApiService.submitScan(data);
      _lastScan = Scan.fromJson(result);
      _scans.insert(0, _lastScan!);
      notifyListeners();
      return true;
    } catch (e) {
      _scansError = e.toString().replaceFirst('Exception: ', '');
      notifyListeners();
      return false;
    }
  }
}
