import 'dart:io';
import 'package:flutter/material.dart';
import '../models/handover.dart';
import '../models/post_order.dart';
import '../services/api_service.dart';
import '../services/location_service.dart';

class DutyProvider extends ChangeNotifier {
  List<PostOrder> _orders = [];
  List<Handover> _pendingHandovers = [];
  bool _loading = false;
  bool _submitting = false;
  String? _error;

  List<PostOrder> get orders => _orders;
  List<Handover> get pendingHandovers => _pendingHandovers;
  List<PostOrder> get pendingAcknowledgementOrders => _orders.where((order) {
        return false;
      }).toList();
  bool get loading => _loading;
  bool get submitting => _submitting;
  String? get error => _error;
  bool get hasPendingAcknowledgements => pendingAcknowledgementOrders.isNotEmpty;

  Future<void> load() async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      final results = await Future.wait([
        ApiService.getPostOrders(),
        ApiService.getPendingHandovers(),
      ]);
      _orders = results[0].map((item) => PostOrder.fromJson(item as Map<String, dynamic>)).toList();
      _pendingHandovers = results[1].map((item) => Handover.fromJson(item as Map<String, dynamic>)).toList();
    } catch (e) {
      _error = e.toString().replaceFirst('Exception: ', '');
    }
    _loading = false;
    notifyListeners();
  }

  Future<bool> acknowledge(String orderId) async {
    _submitting = true;
    _error = null;
    notifyListeners();
    try {
      await ApiService.acknowledgePostOrder(orderId);
      await load();
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
        gpsLatitude: location.position?.latitude,
        gpsLongitude: location.position?.longitude,
      );
      await load();
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
      await load();
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
      await load();
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
