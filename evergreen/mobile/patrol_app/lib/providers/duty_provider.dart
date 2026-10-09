import 'dart:io';
import 'package:flutter/material.dart';
import '../models/handover.dart';
import '../models/post_order.dart';
import '../services/api_service.dart';
import '../services/location_service.dart';

class DutyProvider extends ChangeNotifier {
  List<PostOrder> _orders = [];
  List<Handover> _pendingHandovers = [];
  List<Map<String, dynamic>> _pendingPassOnLogs = [];
  bool _loading = false;
  bool _submitting = false;
  String? _error;
  int _pendingAcknowledgementCount = 0;
  Future<void>? _loadFuture;
  bool _loadedOnce = false;

  List<PostOrder> get orders => _orders;
  List<Handover> get pendingHandovers => _pendingHandovers;
  List<Map<String, dynamic>> get pendingPassOnLogs => _pendingPassOnLogs;
  bool get loading => _loading;
  bool get submitting => _submitting;
  String? get error => _error;
  int get pendingAcknowledgementCount => _pendingAcknowledgementCount;
  bool get hasPendingAcknowledgements => _pendingAcknowledgementCount > 0;
  List<Map<String, dynamic>> get pendingAcknowledgementOrders =>
      _pendingPassOnLogs;

  void clearData() {
    _orders = [];
    _pendingHandovers = [];
    _pendingPassOnLogs = [];
    _loading = false;
    _submitting = false;
    _error = null;
    _pendingAcknowledgementCount = 0;
    _loadedOnce = false;
    notifyListeners();
  }

  Future<void> load({bool force = false}) {
    if (_loadFuture != null) return _loadFuture!;
    if (!force && _loadedOnce) return Future.value();
    _loadFuture = _load().whenComplete(() {
      _loadFuture = null;
    });
    return _loadFuture!;
  }

  Future<void> _load() async {
    _loading = true;
    notifyListeners();

    final results = await Future.wait([
      ApiService.getPostOrders().catchError((_) => <dynamic>[]),
      ApiService.getPendingHandovers().catchError((_) => <dynamic>[]),
      ApiService.getPendingPassOnLogs().catchError((_) => <dynamic>[]),
    ]);

    _orders = results[0]
        .map((item) => PostOrder.fromJson(item as Map<String, dynamic>))
        .toList();
    _pendingHandovers = results[1]
        .map((item) => Handover.fromJson(item as Map<String, dynamic>))
        .toList();
    _pendingPassOnLogs = results[2]
        .map((item) => item as Map<String, dynamic>)
        .toList();
    _pendingAcknowledgementCount = _pendingPassOnLogs.length;

    _error = null;
    _loadedOnce = true;
    _loading = false;
    notifyListeners();
  }

  Future<void> checkPendingAcknowledgements() async {
    try {
      final result = await ApiService.checkPendingAcknowledgements();
      _pendingAcknowledgementCount = result['count'] as int? ?? 0;
      notifyListeners();
    } catch (_) {
      _pendingAcknowledgementCount = 0;
      notifyListeners();
    }
  }

  Future<bool> acknowledge(String orderId) async {
    _submitting = true;
    _error = null;
    notifyListeners();
    try {
      await ApiService.acknowledgePostOrder(orderId);
      await load(force: true);
      return true;
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  Future<bool> acknowledgePassOnLog(String logId, {String note = ''}) async {
    _submitting = true;
    _error = null;
    notifyListeners();
    try {
      await ApiService.acknowledgePassOnLog(logId, note: note);
      await load(force: true);
      return true;
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  Future<bool> complete({
    required String orderId,
    required File photo,
    String note = '',
  }) async {
    _submitting = true;
    _error = null;
    notifyListeners();
    try {
      final location = await LocationService.getCurrentLocation();
      await ApiService.completePostOrder(
        orderId: orderId,
        photo: photo,
        proofNote: note,
        gpsLatitude: location.isSuccess ? location.latitude : null,
        gpsLongitude: location.isSuccess ? location.longitude : null,
      );
      await load(force: true);
      return true;
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  Future<bool> createHandover({
    required String summary,
    String openIssues = '',
    String equipmentStatus = '',
    String siteLabel = '',
    String? checkpointId,
    File? photo,
  }) async {
    _submitting = true;
    _error = null;
    notifyListeners();
    try {
      await ApiService.createHandover(
        summary: summary,
        openIssues: openIssues,
        equipmentStatus: equipmentStatus,
        siteLabel: siteLabel,
        checkpointId: checkpointId,
        photo: photo,
      );
      await load(force: true);
      return true;
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  Future<bool> acceptHandover(String id, {String acceptedNote = ''}) async {
    _submitting = true;
    _error = null;
    notifyListeners();
    try {
      await ApiService.acceptHandover(id, acceptedNote: acceptedNote);
      await load(force: true);
      return true;
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
      return false;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }
}
