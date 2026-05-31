import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/scan.dart';
import '../models/checkpoint.dart';
import '../services/api_service.dart';
import '../services/location_service.dart';
import '../utils/constants.dart';

class ScanProvider extends ChangeNotifier {
  static const _pendingScansKey = 'patrol_pending_scans';
  static const _storage = FlutterSecureStorage();

  List<Scan> _scans = [];
  List<Checkpoint> _checkpoints = [];
  List<Map<String, dynamic>> _pendingScans = [];
  bool _scansLoading = false;
  bool _checkpointsLoading = false;
  String? _scansError;
  String? _checkpointsError;
  Scan? _lastScan;

  List<Scan> get scans => _scans;
  List<Checkpoint> get checkpoints => _checkpoints;
  List<Map<String, dynamic>> get pendingScans => _pendingScans;
  bool get loading => _scansLoading || _checkpointsLoading;
  bool get scansLoading => _scansLoading;
  bool get checkpointsLoading => _checkpointsLoading;
  String? get error => _scansError ?? _checkpointsError;
  String? get scansError => _scansError;
  String? get checkpointsError => _checkpointsError;
  Scan? get lastScan => _lastScan;

  void clearData() {
    _scans = [];
    _checkpoints = [];
    _lastScan = null;
    _scansError = null;
    _checkpointsError = null;
    _scansLoading = false;
    _checkpointsLoading = false;
    notifyListeners();
  }

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
      _scansError = null;
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

  Checkpoint? _resolveCheckpoint(String? checkpointId) {
    if (checkpointId == null || checkpointId.isEmpty) return null;
    return _checkpoints.where((c) => c.id == checkpointId).firstOrNull;
  }

  String? _validateScanData(Map<String, dynamic> data) {
    final checkpointId = data['checkpointId'] as String?;
    if (checkpointId == null || checkpointId.isEmpty) {
      return 'Checkpoint ID is required';
    }

    final checkpoint = _resolveCheckpoint(checkpointId);
    if (checkpoint == null) {
      return 'Unknown checkpoint: $checkpointId. Load checkpoints first.';
    }

    final lat = data['gpsLatitude'];
    final lng = data['gpsLongitude'];
    if (lat is! double || lng is! double) {
      return 'Valid GPS coordinates are required';
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return 'GPS coordinates are out of valid range';
    }

    return null;
  }

  Future<bool> submitScan(Map<String, dynamic> data) async {
    final validationError = _validateScanData(data);
    if (validationError != null) {
      _scansError = validationError;
      notifyListeners();
      return false;
    }

    try {
      final result = await ApiService.submitScan(data);
      _lastScan = Scan.fromJson(result);
      _scans.insert(0, _lastScan!);
      notifyListeners();
      return true;
    } catch (e) {
      await _addPendingScan(data);
      _scansError = e.toString().replaceFirst('Exception: ', '');
      notifyListeners();
      return false;
    }
  }

  Future<void> _addPendingScan(Map<String, dynamic> data) async {
    _pendingScans.add(Map<String, dynamic>.from(data));
    await _persistPendingScans();
  }

  Future<void> loadPendingScans() async {
    try {
      final raw = await _storage.read(key: _pendingScansKey);
      if (raw != null && raw.isNotEmpty) {
        final decoded = jsonDecode(raw);
        if (decoded is List) {
          _pendingScans = decoded.cast<Map<String, dynamic>>();
        }
      }
    } catch (_) {
      _pendingScans = [];
    }
  }

  Future<void> _persistPendingScans() async {
    await _storage.write(
      key: _pendingScansKey,
      value: jsonEncode(_pendingScans),
    );
  }

  Future<void> syncPendingScans() async {
    if (_pendingScans.isEmpty) return;

    final unsynced = List<Map<String, dynamic>>.from(_pendingScans);
    _pendingScans.clear();
    await _persistPendingScans();

    for (final data in unsynced) {
      final validationError = _validateScanData(data);
      if (validationError != null) {
        _scansError = validationError;
        notifyListeners();
        continue;
      }

      try {
        final result = await ApiService.submitScan(data);
        _lastScan = Scan.fromJson(result);
        _scans.insert(0, _lastScan!);
        notifyListeners();
      } catch (e) {
        _pendingScans.add(data);
        await _persistPendingScans();
        _scansError = 'Some scans failed to sync and will be retried.';
        notifyListeners();
      }
    }
  }
}
