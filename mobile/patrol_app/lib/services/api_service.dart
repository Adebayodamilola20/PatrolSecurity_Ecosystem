import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../utils/constants.dart';

class ApiService {
  static final _storage = FlutterSecureStorage();
  static final _client = http.Client();

  static Exception _apiException(http.Response res, String fallback) {
    try {
      final body = jsonDecode(res.body);
      if (body is Map<String, dynamic> && body['message'] is String) {
        return Exception(body['message']);
      }
    } catch (_) {}
    return Exception(fallback);
  }

  static Future<String?> getToken() async =>
      await _storage.read(key: 'patrol_token');

  static Future<Map<String, String>> _headers() async {
    final token = await getToken();
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  static Future<Map<String, dynamic>> login(
      String email, String password) async {
    final res = await _client.post(
      Uri.parse('$baseUrl/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );
    if (res.statusCode != 200) {
      throw _apiException(res, 'Unable to sign in');
    }
    final data = jsonDecode(res.body);
    await _storage.write(key: 'patrol_token', value: data['token']);
    return data;
  }

  static Future<List<dynamic>> getScans({Map<String, String>? params}) async {
    final uri = Uri.parse('$baseUrl/scans').replace(queryParameters: params);
    final res = await _client.get(uri, headers: await _headers());
    if (res.statusCode != 200) throw _apiException(res, 'Failed to load scans');
    return jsonDecode(res.body);
  }

  static Future<Map<String, dynamic>> submitScan(
      Map<String, dynamic> scanData) async {
    final res = await _client.post(
      Uri.parse('$baseUrl/scans'),
      headers: await _headers(),
      body: jsonEncode(scanData),
    );
    if (res.statusCode != 201) {
      throw _apiException(res, 'Failed to submit scan');
    }
    return jsonDecode(res.body);
  }

  static Future<List<dynamic>> getCheckpoints() async {
    final res = await _client.get(
      Uri.parse('$baseUrl/checkpoints'),
      headers: await _headers(),
    );
    if (res.statusCode != 200) {
      throw _apiException(res, 'Failed to load checkpoints');
    }
    return jsonDecode(res.body);
  }

  static Future<void> logout() async {
    await _storage.delete(key: 'patrol_token');
  }

  static Future<Map<String, dynamic>> clockIn() async {
    final res = await _client.post(
      Uri.parse('$baseUrl/shifts/clock-in'),
      headers: await _headers(),
    );
    if (res.statusCode != 201) throw _apiException(res, 'Failed to clock in');
    return jsonDecode(res.body);
  }

  static Future<Map<String, dynamic>> clockOut() async {
    final res = await _client.post(
      Uri.parse('$baseUrl/shifts/clock-out'),
      headers: await _headers(),
    );
    if (res.statusCode != 200) {
      throw _apiException(res, 'Failed to clock out');
    }
    return jsonDecode(res.body);
  }

  static Future<Map<String, dynamic>> getShiftStatus() async {
    final res = await _client.get(
      Uri.parse('$baseUrl/shifts/status'),
      headers: await _headers(),
    );
    if (res.statusCode != 200) {
      throw _apiException(res, 'Failed to get shift status');
    }
    return jsonDecode(res.body);
  }
}
