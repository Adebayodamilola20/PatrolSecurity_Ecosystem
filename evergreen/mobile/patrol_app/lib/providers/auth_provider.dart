import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/user.dart';
import '../utils/access_control.dart';
import '../services/api_service.dart';

class AuthProvider extends ChangeNotifier {
  static const _userStorageKey = 'patrol_user';
  static const _tokenStorageKey = 'patrol_token';
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
      final user = User.fromJson(data['user']);

      // This is the field app. Client accounts belong in the web portal, which
      // is where their reporting lives; letting one in here would land them on
      // a scanner and duty toggle they have no business using, and the login
      // screen used to advertise "client" as a supported account type.
      if (roleFromString(user.role) == AccountRole.client) {
        await ApiService.logout();
        _error =
            'Client accounts sign in on the web portal, not the guard app.';
        _loading = false;
        notifyListeners();
        return false;
      }

      _user = user;
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
    await _storage.delete(key: _tokenStorageKey);
    _user = null;
    notifyListeners();
  }

  Future<bool> checkTokenExpiry() async {
    final expired = await ApiService.isTokenExpired();
    if (expired && _user != null) {
      await logout();
      return true;
    }
    return false;
  }

  Future<bool> restoreSession() async {
    final expired = await ApiService.isTokenExpired();
    if (expired) {
      await logout();
      return false;
    }

    final rawUser = await _storage.read(key: _userStorageKey);
    if (rawUser == null || rawUser.isEmpty) {
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

  Future<void> changePassword(
    String currentPassword,
    String newPassword,
  ) async {
    await ApiService.changePassword(currentPassword, newPassword);
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }
}
