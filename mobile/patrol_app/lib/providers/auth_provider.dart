import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/user.dart';
import '../services/api_service.dart';

class AuthProvider extends ChangeNotifier {
  static const _userStorageKey = 'patrol_user';
  static const _storage = FlutterSecureStorage();

  User? _user;
  bool _loading = false;
  String? _error;

  User? get user => _user;
  bool get loading => _loading;
  String? get error => _error;
  bool get isLoggedIn => _user != null;

  Future<bool> login(String email, String password) async {
    _loading = true;
    _error = null;
    notifyListeners();

    try {
      final data = await ApiService.login(email, password);
      _user = User.fromJson(data['user']);
      await _storage.write(
        key: _userStorageKey,
        value: jsonEncode(_user!.toJson()),
      );
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

  Future<void> logout() async {
    await ApiService.logout();
    await _storage.delete(key: _userStorageKey);
    _user = null;
    notifyListeners();
  }

  Future<bool> restoreSession() async {
    final token = await ApiService.getToken();
    final rawUser = await _storage.read(key: _userStorageKey);
    if (token == null || rawUser == null || rawUser.isEmpty) {
      _user = null;
      notifyListeners();
      return false;
    }

    try {
      final decoded = jsonDecode(rawUser);
      if (decoded is! Map<String, dynamic>) {
        throw const FormatException('Stored user is invalid');
      }
      _user = User.fromJson(decoded);
      _error = null;
      notifyListeners();
      return true;
    } catch (_) {
      await logout();
      return false;
    }
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }
}
