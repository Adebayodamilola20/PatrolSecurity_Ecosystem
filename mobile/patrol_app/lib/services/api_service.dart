import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../utils/constants.dart';

class ApiService {
  static final _storage = FlutterSecureStorage();
  static final _client = http.Client();
  static const _timeout = Duration(seconds: 20);

  static Future<void> _ensureOnline() async {
    try {
      final result =
          await InternetAddress.lookup('example.com').timeout(
        const Duration(seconds: 6),
      );
      if (result.isEmpty || result.first.rawAddress.isEmpty) {
        throw const SocketException('No route to internet');
      }
    } catch (_) {
      throw Exception(
        'No internet or slow connection. Please reconnect and try again.',
      );
    }
  }

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
    await _ensureOnline();
    final res = await _client.post(
      Uri.parse('$baseUrl/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    ).timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Unable to sign in');
    }
    final data = jsonDecode(res.body);
    await _storage.write(key: 'patrol_token', value: data['token']);
    return data;
  }

  static Future<List<dynamic>> getScans({Map<String, String>? params}) async {
    await _ensureOnline();
    final uri = Uri.parse('$baseUrl/scans').replace(queryParameters: params);
    final res = await _client
        .get(uri, headers: await _headers())
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to load scans');
    }
    return jsonDecode(res.body);
  }

  static Future<Map<String, dynamic>> submitScan(
      Map<String, dynamic> scanData) async {
    await _ensureOnline();
    final res = await _client.post(
      Uri.parse('$baseUrl/scans'),
      headers: await _headers(),
      body: jsonEncode(scanData),
    ).timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to submit scan');
    }
    return jsonDecode(res.body);
  }

  static Future<List<dynamic>> getCheckpoints() async {
    await _ensureOnline();
    final res = await _client.get(
      Uri.parse('$baseUrl/checkpoints'),
      headers: await _headers(),
    ).timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to load checkpoints');
    }
    return jsonDecode(res.body);
  }

  static Future<void> logout() async {
    await _storage.delete(key: 'patrol_token');
  }

  static Future<Map<String, dynamic>> clockIn() async {
    await _ensureOnline();
    final res = await _client.post(
      Uri.parse('$baseUrl/shifts/clock-in'),
      headers: await _headers(),
    ).timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to clock in');
    }
    return jsonDecode(res.body);
  }

  static Future<Map<String, dynamic>> clockOut() async {
    await _ensureOnline();
    final res = await _client.post(
      Uri.parse('$baseUrl/shifts/clock-out'),
      headers: await _headers(),
    ).timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to clock out');
    }
    return jsonDecode(res.body);
  }

  static Future<Map<String, dynamic>> getShiftStatus() async {
    await _ensureOnline();
    final res = await _client.get(
      Uri.parse('$baseUrl/shifts/status'),
      headers: await _headers(),
    ).timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to get shift status');
    }
    return jsonDecode(res.body);
  }

  static Future<Map<String, dynamic>> reportIncident({
    required String title,
    String? description,
    String? checkpointId,
    String severity = 'low',
  }) async {
    await _ensureOnline();
    final res = await _client.post(
      Uri.parse('$baseUrl/incidents'),
      headers: await _headers(),
      body: jsonEncode({
        'title': title,
        'description': description ?? '',
        'checkpointId': checkpointId,
        'severity': severity,
      }),
    ).timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to report incident');
    }
    return jsonDecode(res.body);
  }

  static Future<List<dynamic>> getPostOrders() async {
    await _ensureOnline();
    final res = await _client.get(
      Uri.parse('$baseUrl/post-orders'),
      headers: await _headers(),
    ).timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to load post orders');
    }
    return jsonDecode(res.body);
  }

  static Future<Map<String, dynamic>> acknowledgePostOrder(String id) async {
    await _ensureOnline();
    final res = await _client.post(
      Uri.parse('$baseUrl/post-orders/$id/acknowledge'),
      headers: await _headers(),
    ).timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to acknowledge post order');
    }
    return jsonDecode(res.body);
  }

  static Future<Map<String, dynamic>> completePostOrder({
    required String orderId,
    required File photo,
    String proofNote = '',
    double? gpsLatitude,
    double? gpsLongitude,
  }) async {
    await _ensureOnline();
    final token = await getToken();
    final request = http.MultipartRequest(
      'POST',
      Uri.parse('$baseUrl/post-orders/$orderId/complete'),
    );
    if (token != null) request.headers['Authorization'] = 'Bearer $token';
    request.fields['proofNote'] = proofNote;
    if (gpsLatitude != null) request.fields['gpsLatitude'] = gpsLatitude.toString();
    if (gpsLongitude != null) request.fields['gpsLongitude'] = gpsLongitude.toString();
    request.files.add(await http.MultipartFile.fromPath('photo', photo.path));
    final streamed = await request.send().timeout(_timeout);
    final res = await http.Response.fromStream(streamed);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to complete post order');
    }
    return jsonDecode(res.body);
  }

  static Future<List<dynamic>> getPendingHandovers() async {
    await _ensureOnline();
    final res = await _client.get(
      Uri.parse('$baseUrl/handovers/pending'),
      headers: await _headers(),
    ).timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to load pending handovers');
    }
    return jsonDecode(res.body);
  }

  static Future<Map<String, dynamic>> createHandover({
    required String summary,
    String openIssues = '',
    String equipmentStatus = '',
    String siteLabel = '',
    String? checkpointId,
    File? photo,
  }) async {
    await _ensureOnline();
    final token = await getToken();
    final request = http.MultipartRequest('POST', Uri.parse('$baseUrl/handovers'));
    if (token != null) request.headers['Authorization'] = 'Bearer $token';
    request.fields['summary'] = summary;
    request.fields['openIssues'] = openIssues;
    request.fields['equipmentStatus'] = equipmentStatus;
    request.fields['siteLabel'] = siteLabel;
    if (checkpointId != null) request.fields['checkpointId'] = checkpointId;
    if (photo != null) {
      request.files.add(await http.MultipartFile.fromPath('photo', photo.path));
    }
    final streamed = await request.send().timeout(_timeout);
    final res = await http.Response.fromStream(streamed);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to send handover');
    }
    return jsonDecode(res.body);
  }

  static Future<Map<String, dynamic>> acceptHandover(
    String id, {
    String acceptedNote = '',
  }) async {
    await _ensureOnline();
    final res = await _client.patch(
      Uri.parse('$baseUrl/handovers/$id/accept'),
      headers: await _headers(),
      body: jsonEncode({'acceptedNote': acceptedNote}),
    ).timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to accept handover');
    }
    return jsonDecode(res.body);
  }
}
