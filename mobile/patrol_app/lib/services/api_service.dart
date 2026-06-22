import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../utils/constants.dart';

dynamic _decodeJsonOnWorker(String source) => jsonDecode(source);

String _base64EncodeOnWorker(Uint8List bytes) => base64Encode(bytes);

class TokenExpiredException implements Exception {
  final String message;
  const TokenExpiredException([
    this.message = 'Session expired. Please sign in again.',
  ]);
  @override
  String toString() => message;
}

class ApiService {
  static final _storage = FlutterSecureStorage();
  static final _client = http.Client();
  static final Duration _timeout = const Duration(seconds: 30);
  static bool _baseUrlVerified = false;

  static void Function()? onUnauthorized;

  static Future<T> _decodeBody<T>(String body) async {
    final decoded = body.length > 50 * 1024
        ? await compute(_decodeJsonOnWorker, body)
        : jsonDecode(body);
    return decoded as T;
  }

  static Future<String> _readFileAsBase64(File file) async {
    final bytes = await file.readAsBytes();
    if (bytes.lengthInBytes > 128 * 1024) {
      return compute(_base64EncodeOnWorker, bytes);
    }
    return base64Encode(bytes);
  }

  static void _ensureHttps() {
    if (_baseUrlVerified) return;
    if (!baseUrl.startsWith('https://')) {
      throw Exception(
        'Insecure connection: API base URL must use HTTPS. '
        'Current URL: $baseUrl',
      );
    }
    _baseUrlVerified = true;
  }

  static Exception _apiException(http.Response res, String fallback) {
    if (res.statusCode == 401) {
      onUnauthorized?.call();
      return const TokenExpiredException();
    }
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

  static Map<String, dynamic>? _decodeJwtPayload(String token) {
    try {
      final parts = token.split('.');
      if (parts.length != 3) return null;
      final payload = utf8.decode(
        base64Url.decode(base64Url.normalize(parts[1])),
      );
      return jsonDecode(payload) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  static Future<bool> isTokenExpired() async {
    final token = await getToken();
    if (token == null) return true;
    final payload = _decodeJwtPayload(token);
    if (payload == null) return true;
    final exp = payload['exp'];
    if (exp is! int) return true;
    final expiryDate = DateTime.fromMillisecondsSinceEpoch(exp * 1000);
    return DateTime.now().isAfter(expiryDate);
  }

  static Future<Map<String, dynamic>> login(
    String email,
    String password,
  ) async {
    _ensureHttps();
    final res = await _client
        .post(
          Uri.parse('$baseUrl/auth/login'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'email': email,
            'password': password,
            'clientType': 'mobile',
          }),
        )
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      try {
        final body = jsonDecode(res.body);
        if (body is Map<String, dynamic> && body['message'] is String) {
          throw Exception(body['message']);
        }
      } catch (_) {}
      throw Exception('Unable to sign in');
    }
    final data = await _decodeBody<Map<String, dynamic>>(res.body);
    await _storage.write(key: 'patrol_token', value: data['token']);
    return data;
  }

  static Future<List<dynamic>> getScans({Map<String, String>? params}) async {
    _ensureHttps();
    final uri = Uri.parse('$baseUrl/scans').replace(queryParameters: params);
    final res = await _client
        .get(uri, headers: await _headers())
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to load scans');
    }
    return _decodeBody<List<dynamic>>(res.body);
  }

  static Future<Map<String, dynamic>> submitScan(
    Map<String, dynamic> scanData,
  ) async {
    _ensureHttps();
    final res = await _client
        .post(
          Uri.parse('$baseUrl/scans'),
          headers: await _headers(),
          body: jsonEncode(scanData),
        )
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to submit scan');
    }
    return _decodeBody<Map<String, dynamic>>(res.body);
  }

  static Future<List<dynamic>> getCheckpoints() async {
    _ensureHttps();
    final res = await _client
        .get(Uri.parse('$baseUrl/checkpoints'), headers: await _headers())
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to load checkpoints');
    }
    return _decodeBody<List<dynamic>>(res.body);
  }

  static Future<Map<String, dynamic>> changePassword(
    String currentPassword,
    String newPassword,
  ) async {
    _ensureHttps();
    final res = await _client
        .post(
          Uri.parse('$baseUrl/auth/change-password'),
          headers: await _headers(),
          body: jsonEncode({
            'currentPassword': currentPassword,
            'newPassword': newPassword,
          }),
        )
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to change password');
    }
    return _decodeBody<Map<String, dynamic>>(res.body);
  }

  static Future<void> logout() async {
    await _storage.delete(key: 'patrol_token');
  }

  static Future<Map<String, dynamic>> clockIn({
    double? latitude,
    double? longitude,
  }) async {
    _ensureHttps();
    final body = <String, dynamic>{};
    if (latitude != null) body['gpsLatitude'] = latitude;
    if (longitude != null) body['gpsLongitude'] = longitude;
    final res = await _client
        .post(
          Uri.parse('$baseUrl/shifts/clock-in'),
          headers: await _headers(),
          body: jsonEncode(body),
        )
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to clock in');
    }
    return _decodeBody<Map<String, dynamic>>(res.body);
  }

  static Future<Map<String, dynamic>> clockOut({
    double? latitude,
    double? longitude,
  }) async {
    _ensureHttps();
    final body = <String, dynamic>{};
    if (latitude != null) body['gpsLatitude'] = latitude;
    if (longitude != null) body['gpsLongitude'] = longitude;
    final res = await _client
        .post(
          Uri.parse('$baseUrl/shifts/clock-out'),
          headers: await _headers(),
          body: jsonEncode(body),
        )
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to clock out');
    }
    return _decodeBody<Map<String, dynamic>>(res.body);
  }

  static Future<void> updatePosition({
    required double latitude,
    required double longitude,
    double? accuracy,
    double? speed,
    double? heading,
  }) async {
    _ensureHttps();
    try {
      final res = await _client
          .post(
            Uri.parse('$baseUrl/positions'),
            headers: await _headers(),
            body: jsonEncode({
              'latitude': latitude,
              'longitude': longitude,
              'accuracy': accuracy,
              'speed': speed,
              'heading': heading,
              'capturedAt': DateTime.now().toIso8601String(),
            }),
          )
          .timeout(const Duration(seconds: 10));
      if (res.statusCode == 401) {
        onUnauthorized?.call();
      }
    } catch (_) {
      // Position updates are non-critical; silently ignore failures
    }
  }

  static Future<Map<String, dynamic>> getShiftStatus() async {
    _ensureHttps();
    final res = await _client
        .get(Uri.parse('$baseUrl/shifts/status'), headers: await _headers())
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to get shift status');
    }
    return _decodeBody<Map<String, dynamic>>(res.body);
  }

  static Future<Map<String, dynamic>> reportIncident({
    required String title,
    String? description,
    String? checkpointId,
    String severity = 'low',
    String category = 'Security Incident',
    List<File>? photos,
  }) async {
    _ensureHttps();
    final body = <String, dynamic>{
      'title': title,
      'description': description ?? '',
      'checkpointId': checkpointId,
      'severity': severity,
      'category': category,
    };
    if (photos != null && photos.isNotEmpty) {
      final photoBase64 = <String>[];
      for (final photo in photos.take(5)) {
        photoBase64.add(await _readFileAsBase64(photo));
      }
      body['photoBase64'] = photoBase64;
    }
    final res = await _client
        .post(
          Uri.parse('$baseUrl/incidents'),
          headers: await _headers(),
          body: jsonEncode(body),
        )
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to report incident');
    }
    return _decodeBody<Map<String, dynamic>>(res.body);
  }

  static Future<Map<String, dynamic>> submitDailyActivityReport({
    required String summary,
    String activities = '',
    String openIssues = '',
    String siteLabel = '',
    String? checkpointId,
    String shiftWindow = '',
  }) async {
    _ensureHttps();
    final res = await _client
        .post(
          Uri.parse('$baseUrl/reports/daily-activity'),
          headers: await _headers(),
          body: jsonEncode({
            'summary': summary,
            'activities': activities,
            'openIssues': openIssues,
            'siteLabel': siteLabel,
            'checkpointId': checkpointId,
            'shiftWindow': shiftWindow,
          }),
        )
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to submit daily activity report');
    }
    return _decodeBody<Map<String, dynamic>>(res.body);
  }

  static Future<Map<String, dynamic>> submitMaintenanceReport({
    required String title,
    required String issue,
    String assetName = '',
    String severity = 'medium',
    String? checkpointId,
    List<File>? evidence,
  }) async {
    _ensureHttps();
    final body = <String, dynamic>{
      'title': title,
      'issue': issue,
      'equipment': assetName,
      'severity': severity,
      'checkpointId': checkpointId,
    };
    if (evidence != null && evidence.isNotEmpty) {
      final evidenceBase64 = <String>[];
      for (final item in evidence.take(5)) {
        evidenceBase64.add(await _readFileAsBase64(item));
      }
      body['evidenceBase64'] = evidenceBase64;
    }
    final res = await _client
        .post(
          Uri.parse('$baseUrl/reports/maintenance'),
          headers: await _headers(),
          body: jsonEncode(body),
        )
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to submit maintenance report');
    }
    return _decodeBody<Map<String, dynamic>>(res.body);
  }

  static Future<Map<String, dynamic>> triggerEmergency({
    String? checkpointId,
    String siteLabel = '',
    String category = '',
    String note = '',
    String location = '',
  }) async {
    _ensureHttps();
    final res = await _client
        .post(
          Uri.parse('$baseUrl/emergency/trigger'),
          headers: await _headers(),
          body: jsonEncode({
            'checkpointId': checkpointId,
            'siteLabel': siteLabel,
            'category': category,
            'note': note,
            'location': location,
          }),
        )
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to trigger emergency alert');
    }
    return _decodeBody<Map<String, dynamic>>(res.body);
  }

  static Future<Map<String, dynamic>> submitPassOnLog({
    required String title,
    required String instruction,
    String priority = 'normal',
    String siteLabel = '',
    String? checkpointId,
    bool requiresAcknowledgement = false,
  }) async {
    _ensureHttps();
    final res = await _client
        .post(
          Uri.parse('$baseUrl/pass-on-logs'),
          headers: await _headers(),
          body: jsonEncode({
            'title': title,
            'instruction': instruction,
            'priority': priority,
            'siteLabel': siteLabel,
            'checkpointId': checkpointId,
            'requiresAcknowledgement': requiresAcknowledgement,
          }),
        )
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to create pass-on log');
    }
    return _decodeBody<Map<String, dynamic>>(res.body);
  }

  static Future<Map<String, dynamic>> requestDailyTourExport({
    required String date,
  }) async {
    _ensureHttps();
    final res = await _client
        .post(
          Uri.parse('$baseUrl/scans/export/daily'),
          headers: await _headers(),
          body: jsonEncode({'date': date, 'format': 'csv'}),
        )
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to request daily tour export');
    }
    return _decodeBody<Map<String, dynamic>>(res.body);
  }

  static Future<List<dynamic>> getDailyTourExports() async {
    _ensureHttps();
    final res = await _client
        .get(
          Uri.parse('$baseUrl/scans/export/daily'),
          headers: await _headers(),
        )
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to load export archive');
    }
    return _decodeBody<List<dynamic>>(res.body);
  }

  static Future<List<dynamic>> getActivitySummary({
    String? activityType,
    String? startDate,
    String? endDate,
    String? siteId,
    int limit = 500,
  }) async {
    _ensureHttps();
    final params = <String, String>{'limit': limit.toString()};
    if (activityType != null) params['activityType'] = activityType;
    if (startDate != null) params['startDate'] = startDate;
    if (endDate != null) params['endDate'] = endDate;
    if (siteId != null) params['siteId'] = siteId;
    final uri = Uri.parse(
      '$baseUrl/activity-summary',
    ).replace(queryParameters: params);
    final res = await _client
        .get(uri, headers: await _headers())
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to load activity summary');
    }
    return _decodeBody<List<dynamic>>(res.body);
  }

  static Future<Map<String, dynamic>> acknowledgeScanPostOrders({
    required String scanId,
    required List<String> postOrderIds,
  }) async {
    _ensureHttps();
    final res = await _client
        .post(
          Uri.parse('$baseUrl/scans/$scanId/acknowledge-post-orders'),
          headers: await _headers(),
          body: jsonEncode({'postOrderIds': postOrderIds}),
        )
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to acknowledge post orders for scan');
    }
    return _decodeBody<Map<String, dynamic>>(res.body);
  }

  static Future<List<dynamic>> getPassOnLogs() async {
    _ensureHttps();
    final res = await _client
        .get(Uri.parse('$baseUrl/pass-on-logs'), headers: await _headers())
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to load pass-on logs');
    }
    return _decodeBody<List<dynamic>>(res.body);
  }

  static Future<Map<String, dynamic>> checkPendingAcknowledgements() async {
    _ensureHttps();
    final res = await _client
        .get(
          Uri.parse('$baseUrl/pass-on-logs/pending-acknowledgements'),
          headers: await _headers(),
        )
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      return {'hasPending': false, 'count': 0};
    }
    return _decodeBody<Map<String, dynamic>>(res.body);
  }

  static Future<List<dynamic>> getPendingPassOnLogs() async {
    _ensureHttps();
    final res = await _client
        .get(
          Uri.parse('$baseUrl/pass-on-logs/pending'),
          headers: await _headers(),
        )
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to load pending pass-on logs');
    }
    return _decodeBody<List<dynamic>>(res.body);
  }

  static Future<Map<String, dynamic>> acknowledgePassOnLog(
    String id, {
    String note = '',
  }) async {
    _ensureHttps();
    final res = await _client
        .post(
          Uri.parse('$baseUrl/pass-on-logs/$id/acknowledge'),
          headers: await _headers(),
          body: jsonEncode({'note': note}),
        )
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to acknowledge pass-on log');
    }
    return _decodeBody<Map<String, dynamic>>(res.body);
  }

  static Future<List<dynamic>> getPostOrders() async {
    _ensureHttps();
    final res = await _client
        .get(Uri.parse('$baseUrl/post-orders'), headers: await _headers())
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to load post orders');
    }
    return _decodeBody<List<dynamic>>(res.body);
  }

  static Future<Map<String, dynamic>> acknowledgePostOrder(String id) async {
    _ensureHttps();
    final res = await _client
        .post(
          Uri.parse('$baseUrl/post-orders/$id/acknowledge'),
          headers: await _headers(),
        )
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to acknowledge post order');
    }
    return _decodeBody<Map<String, dynamic>>(res.body);
  }

  static Future<List<dynamic>> getVisitors({String? status}) async {
    _ensureHttps();
    final params = <String, String>{};
    if (status != null) params['status'] = status;
    final uri = Uri.parse('$baseUrl/visitors').replace(queryParameters: params);
    final res = await _client
        .get(uri, headers: await _headers())
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to load visitor logs');
    }
    return _decodeBody<List<dynamic>>(res.body);
  }

  static Future<Map<String, dynamic>> visitorCheckIn({
    required String visitorName,
    String visitorPhone = '',
    String hostName = '',
    String purpose = '',
    String vehiclePlate = '',
    String idNumber = '',
    String? siteId,
    String notes = '',
  }) async {
    _ensureHttps();
    final res = await _client
        .post(
          Uri.parse('$baseUrl/visitors'),
          headers: await _headers(),
          body: jsonEncode({
            'visitorName': visitorName,
            'visitorPhone': visitorPhone,
            'hostName': hostName,
            'purpose': purpose,
            'vehiclePlate': vehiclePlate,
            'idNumber': idNumber,
            'siteId': siteId,
            'notes': notes,
          }),
        )
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to check in visitor');
    }
    return _decodeBody<Map<String, dynamic>>(res.body);
  }

  static Future<Map<String, dynamic>> visitorCheckOut(String id) async {
    _ensureHttps();
    final res = await _client
        .post(
          Uri.parse('$baseUrl/visitors/$id/check-out'),
          headers: await _headers(),
        )
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to check out visitor');
    }
    return _decodeBody<Map<String, dynamic>>(res.body);
  }

  static Future<List<dynamic>> getTruckLogs({String? status}) async {
    _ensureHttps();
    final params = <String, String>{};
    if (status != null) params['status'] = status;
    final uri = Uri.parse('$baseUrl/trucks').replace(queryParameters: params);
    final res = await _client
        .get(uri, headers: await _headers())
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to load truck logs');
    }
    return _decodeBody<List<dynamic>>(res.body);
  }

  static Future<Map<String, dynamic>> truckCheckIn({
    required String driverName,
    String plateNumber = '',
    String company = '',
    String purpose = '',
    String cargoDescription = '',
    String? siteId,
    String notes = '',
  }) async {
    _ensureHttps();
    final res = await _client
        .post(
          Uri.parse('$baseUrl/trucks'),
          headers: await _headers(),
          body: jsonEncode({
            'driverName': driverName,
            'plateNumber': plateNumber,
            'company': company,
            'purpose': purpose,
            'cargoDescription': cargoDescription,
            'siteId': siteId,
            'notes': notes,
          }),
        )
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to check in truck');
    }
    return _decodeBody<Map<String, dynamic>>(res.body);
  }

  static Future<Map<String, dynamic>> truckCheckOut(String id) async {
    _ensureHttps();
    final res = await _client
        .post(
          Uri.parse('$baseUrl/trucks/$id/check-out'),
          headers: await _headers(),
        )
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to check out truck');
    }
    return _decodeBody<Map<String, dynamic>>(res.body);
  }

  static Future<Map<String, dynamic>> completePostOrder({
    required String orderId,
    required File photo,
    String proofNote = '',
    double? gpsLatitude,
    double? gpsLongitude,
  }) async {
    _ensureHttps();
    final photoBase64 = await _readFileAsBase64(photo);
    final res = await _client
        .post(
          Uri.parse('$baseUrl/post-orders/$orderId/complete'),
          headers: await _headers(),
          body: jsonEncode({
            'proofNote': proofNote,
            'gpsLatitude': gpsLatitude,
            'gpsLongitude': gpsLongitude,
            'photoBase64': photoBase64,
            'photoName': photo.uri.pathSegments.isNotEmpty
                ? photo.uri.pathSegments.last
                : 'proof.jpg',
          }),
        )
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to complete post order');
    }
    return _decodeBody<Map<String, dynamic>>(res.body);
  }

  static Future<List<dynamic>> getPendingHandovers() async {
    _ensureHttps();
    final res = await _client
        .get(Uri.parse('$baseUrl/handovers/pending'), headers: await _headers())
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to load pending handovers');
    }
    return _decodeBody<List<dynamic>>(res.body);
  }

  static Future<Map<String, dynamic>> createHandover({
    required String summary,
    String openIssues = '',
    String equipmentStatus = '',
    String siteLabel = '',
    String? checkpointId,
    File? photo,
  }) async {
    _ensureHttps();
    String? photoBase64;
    String? photoName;
    if (photo != null) {
      photoBase64 = await _readFileAsBase64(photo);
      photoName = photo.uri.pathSegments.isNotEmpty
          ? photo.uri.pathSegments.last
          : 'handover.jpg';
    }

    final res = await _client
        .post(
          Uri.parse('$baseUrl/handovers'),
          headers: await _headers(),
          body: jsonEncode({
            'summary': summary,
            'openIssues': openIssues,
            'equipmentStatus': equipmentStatus,
            'siteLabel': siteLabel,
            'checkpointId': checkpointId,
            'photoBase64': photoBase64,
            'photoName': photoName,
          }),
        )
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to send handover');
    }
    return _decodeBody<Map<String, dynamic>>(res.body);
  }

  static Future<Map<String, dynamic>> acceptHandover(
    String id, {
    String acceptedNote = '',
  }) async {
    _ensureHttps();
    final res = await _client
        .patch(
          Uri.parse('$baseUrl/handovers/$id/accept'),
          headers: await _headers(),
          body: jsonEncode({'acceptedNote': acceptedNote}),
        )
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to accept handover');
    }
    return _decodeBody<Map<String, dynamic>>(res.body);
  }
}
