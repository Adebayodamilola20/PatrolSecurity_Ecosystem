import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../utils/constants.dart';

dynamic _decodeJsonOnWorker(String source) => jsonDecode(source);

class TokenExpiredException implements Exception {
  final String message;
  const TokenExpiredException([
    this.message = 'Session expired. Please sign in again.',
  ]);
  @override
  String toString() => message;
}

/// A request the server refused on its merits, not because of a network or
/// capacity problem.
///
/// The difference matters for scans: a transient failure is queued and retried,
/// but a scan at a withdrawn location would sit in that queue being rejected
/// forever, so it must never be queued at all.
class PermanentRejectionException implements Exception {
  final String message;
  final int statusCode;
  const PermanentRejectionException(this.message, this.statusCode);
  @override
  String toString() => message;
}

// Outcome of an /auth/refresh attempt. `transientFailure` (offline, timeout)
// keeps the session; only `sessionDead` (server rejected the refresh token)
// forces a re-login.
enum _RefreshOutcome { success, transientFailure, sessionDead }

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

  // --- Photo uploads --------------------------------------------------------
  //
  // Photos never travel through the API. The bytes go straight from the phone
  // to object storage over a one-shot upload URL; the API only ever handles the
  // resulting storageId. That keeps a 5MB image off the request path (base64
  // also inflated it by a third) and out of the function's memory.

  /// Guesses the content type from the file extension. The server re-derives and
  /// re-validates this from the bytes themselves, so a wrong guess here is
  /// rejected rather than trusted.
  static String _contentTypeFor(File file) {
    final path = file.path.toLowerCase();
    if (path.endsWith('.png')) return 'image/png';
    if (path.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }

  /// Uploads one image directly to storage and returns its storageId, already
  /// validated and claimed server-side.
  ///
  /// Throws if the image is rejected (too large, not a real image), so callers
  /// surface the problem at capture time rather than on submit.
  static Future<String> uploadPhoto(File file, {required String kind}) async {
    _ensureHttps();
    final headers = await _headers();

    // 1. One-shot upload URL, scoped to this authenticated user.
    final urlRes = await _client
        .post(Uri.parse('$baseUrl/uploads/url'), headers: headers)
        .timeout(_timeout);
    if (urlRes.statusCode != 200) {
      throw _apiException(urlRes, 'Could not start photo upload');
    }
    final uploadUrl = (await _decodeBody<Map<String, dynamic>>(urlRes.body))['uploadUrl'] as String;

    // 2. Bytes go straight to storage — not through our API.
    final bytes = await file.readAsBytes();
    final uploadRes = await _client
        .post(
          Uri.parse(uploadUrl),
          headers: {'Content-Type': _contentTypeFor(file)},
          body: bytes,
        )
        .timeout(const Duration(seconds: 120));
    if (uploadRes.statusCode != 200) {
      throw Exception('Photo upload failed (${uploadRes.statusCode})');
    }
    final storageId =
        (await _decodeBody<Map<String, dynamic>>(uploadRes.body))['storageId'] as String;

    // 3. Server inspects the bytes and records ownership. An image that fails
    //    validation is deleted from storage before this returns.
    final claimRes = await _client
        .post(
          Uri.parse('$baseUrl/uploads/claim'),
          headers: headers,
          body: jsonEncode({'storageId': storageId, 'kind': kind}),
        )
        .timeout(_timeout);
    if (claimRes.statusCode != 201) {
      throw _apiException(claimRes, 'Photo was rejected');
    }
    return storageId;
  }

  /// uploadPhoto for a list, preserving order.
  static Future<List<String>> uploadPhotos(
    List<File> files, {
    required String kind,
  }) async {
    final ids = <String>[];
    for (final file in files) {
      ids.add(await uploadPhoto(file, kind: kind));
    }
    return ids;
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

  /// Runs [send], transparently retrying when the server replies 429 (this
  /// client is over its rate limit) or 503 (the server is shedding load).
  /// Honors a Retry-After header, otherwise backs off exponentially with
  /// jitter. Returns the final response — including the last 429/503 if the
  /// retries are exhausted — for the caller to handle normally.
  static Future<http.Response> _withRateLimitRetry(
    Future<http.Response> Function() send, {
    int maxRetries = 3,
  }) async {
    var attempt = 0;
    while (true) {
      final res = await send();
      final shed = res.statusCode == 429 || res.statusCode == 503;
      if (!shed || attempt >= maxRetries) return res;
      final retryAfter = res.headers['retry-after'];
      final headerMs =
          retryAfter != null ? (int.tryParse(retryAfter.trim()) ?? 0) * 1000 : 0;
      final backoffMs =
          headerMs > 0 ? headerMs : (500 * (1 << attempt)).clamp(500, 8000);
      final waitMs = (backoffMs + Random().nextInt(300)).clamp(0, 10000);
      await Future.delayed(Duration(milliseconds: waitMs));
      attempt++;
    }
  }

  static Exception _apiException(http.Response res, String fallback) {
    if (res.statusCode == 401) {
      onUnauthorized?.call();
      return const TokenExpiredException();
    }
    String? serverMessage;
    try {
      final body = jsonDecode(res.body);
      if (body is Map<String, dynamic> && body['message'] is String) {
        serverMessage = body['message'] as String;
      }
    } catch (_) {}
    // 403/404/410 are verdicts, not outages: retrying changes nothing.
    if (res.statusCode == 403 ||
        res.statusCode == 404 ||
        res.statusCode == 410) {
      return PermanentRejectionException(
        serverMessage ?? fallback,
        res.statusCode,
      );
    }
    if (serverMessage != null) return Exception(serverMessage);
    return Exception(fallback);
  }

  /// Asks the server what a scanned QR code actually is.
  ///
  /// The app only holds the checkpoints it was served, so a code missing from
  /// that list could be a withdrawn location, a post this guard does not hold,
  /// or just stale offline data — and only the server can tell them apart.
  static Future<Map<String, dynamic>> lookupCheckpoint(String code) async {
    _ensureHttps();
    final uri = Uri.parse(
      '$baseUrl/checkpoints/lookup',
    ).replace(queryParameters: {'code': code});
    final res = await _client
        .get(uri, headers: await _headers())
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Could not check this location');
    }
    return _decodeBody<Map<String, dynamic>>(res.body);
  }

  static Future<String?> getToken() async =>
      await _storage.read(key: 'patrol_token');

  // --- Session refresh ----------------------------------------------------
  // Access tokens last 30 minutes; the rotating refresh token in secure
  // storage keeps a guard signed in across a full shift. Every request goes
  // through _headers(), which refreshes proactively just before expiry.

  static Future<_RefreshOutcome>? _refreshInFlight;

  static Future<_RefreshOutcome> _refreshSession() {
    // Single-flight: concurrent callers share one /auth/refresh round trip
    // (refresh tokens are single-use, so parallel refreshes would collide).
    return _refreshInFlight ??= _doRefresh().whenComplete(() {
      _refreshInFlight = null;
    });
  }

  static Future<_RefreshOutcome> _doRefresh() async {
    final refreshToken = await _storage.read(key: 'patrol_refresh');
    if (refreshToken == null || refreshToken.isEmpty) {
      return _RefreshOutcome.sessionDead;
    }
    try {
      final res = await _client
          .post(
            Uri.parse('$baseUrl/auth/refresh'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'refreshToken': refreshToken}),
          )
          .timeout(_timeout);
      if (res.statusCode == 401) {
        // Revoked or expired server-side: this session cannot be recovered.
        await _storage.delete(key: 'patrol_token');
        await _storage.delete(key: 'patrol_refresh');
        return _RefreshOutcome.sessionDead;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return _RefreshOutcome.transientFailure;
      }
      final data = await _decodeBody<Map<String, dynamic>>(res.body);
      if (data['token'] is! String || data['refreshToken'] is! String) {
        return _RefreshOutcome.transientFailure;
      }
      await _storage.write(key: 'patrol_token', value: data['token']);
      await _storage.write(key: 'patrol_refresh', value: data['refreshToken']);
      return _RefreshOutcome.success;
    } catch (_) {
      // Network hiccup: keep the tokens so the next request can retry —
      // a guard on patrol must not be logged out by a dead spot.
      return _RefreshOutcome.transientFailure;
    }
  }

  static bool _expiresWithin(String token, Duration margin) {
    final payload = _decodeJwtPayload(token);
    final exp = payload?['exp'];
    if (exp is! int) return true;
    final expiry = DateTime.fromMillisecondsSinceEpoch(exp * 1000);
    return DateTime.now().isAfter(expiry.subtract(margin));
  }

  /// True when the session is usable: the access token is still fresh, or the
  /// refresh token can (eventually) mint a new one. Only a server-side
  /// rejection of the refresh token counts as an unrecoverable session.
  static Future<bool> hasRecoverableSession() async {
    final token = await getToken();
    if (token != null && !_expiresWithin(token, const Duration(seconds: 60))) {
      return true;
    }
    final outcome = await _refreshSession();
    if (outcome == _RefreshOutcome.success) return true;
    if (outcome == _RefreshOutcome.sessionDead) return false;
    // Transient failure (offline, timeout): keep the session alive locally;
    // requests will retry the refresh when connectivity returns.
    final stored = await _storage.read(key: 'patrol_refresh');
    return stored != null && stored.isNotEmpty;
  }

  static Future<Map<String, String>> _headers() async {
    final token = await getToken();
    if (token == null || _expiresWithin(token, const Duration(seconds: 60))) {
      await _refreshSession();
    }
    final current = await getToken();
    return {
      'Content-Type': 'application/json',
      if (current != null) 'Authorization': 'Bearer $current',
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
    // "Expired" means the SESSION is over, not just the 30-minute access
    // token — a stale access token silently refreshes here instead.
    return !(await hasRecoverableSession());
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
    if (data['refreshToken'] is String) {
      await _storage.write(key: 'patrol_refresh', value: data['refreshToken']);
    }
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
    // A scan is user-initiated and must not be lost to a transient spike, so
    // retry through throttling / load shedding (headers re-fetched each try in
    // case the token refreshes mid-backoff).
    final res = await _withRateLimitRetry(
      () async => _client
          .post(
            Uri.parse('$baseUrl/scans'),
            headers: await _headers(),
            body: jsonEncode(scanData),
          )
          .timeout(_timeout),
    );
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
    // Revoke the session server-side (kills the refresh-token family), then
    // clear locally regardless — logout must always succeed for the user.
    final refreshToken = await _storage.read(key: 'patrol_refresh');
    if (refreshToken != null && refreshToken.isNotEmpty) {
      try {
        await _client
            .post(
              Uri.parse('$baseUrl/auth/logout'),
              headers: {'Content-Type': 'application/json'},
              body: jsonEncode({'refreshToken': refreshToken}),
            )
            .timeout(const Duration(seconds: 5));
      } catch (_) {
        // Best-effort: local logout proceeds even if the server is offline.
      }
    }
    await _storage.delete(key: 'patrol_token');
    await _storage.delete(key: 'patrol_refresh');
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
      // 429/503 (throttled / shed) are intentionally NOT retried here: a fresh
      // position supersedes this one within seconds, so dropping a shed ping
      // reduces load instead of amplifying it with stale retries.
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
      body['photoStorageIds'] = await uploadPhotos(
        photos.take(5).toList(),
        kind: 'incident',
      );
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

  /// Live emergencies at the locations this guard is posted to.
  ///
  /// This is how an alarm the *client* raised reaches someone who can walk to
  /// it. Returns only this guard's own sites — the server scopes it, not us.
  static Future<List<Map<String, dynamic>>> fetchMyEmergencies() async {
    _ensureHttps();
    final res = await _client
        .get(Uri.parse('$baseUrl/emergency/mine'), headers: await _headers())
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to load emergency alerts');
    }
    final decoded = await _decodeBody<List<dynamic>>(res.body);
    return decoded.cast<Map<String, dynamic>>();
  }

  /// A quick note for the control room — a light out, a request from the
  /// client, a vehicle making a noise. Not an incident: no severity, no
  /// category, no photos, nothing to fill in but the sentence itself.
  static Future<Map<String, dynamic>> submitObservation({
    required String message,
    String? siteId,
    String? checkpointId,
  }) async {
    _ensureHttps();
    final res = await _client
        .post(
          Uri.parse('$baseUrl/observations'),
          headers: await _headers(),
          body: jsonEncode({
            'message': message,
            if (siteId != null) 'siteId': siteId,
            if (checkpointId != null) 'checkpointId': checkpointId,
          }),
        )
        .timeout(_timeout);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _apiException(res, 'Failed to send observation');
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
      body['evidenceStorageIds'] = await uploadPhotos(
        evidence.take(5).toList(),
        kind: 'maintenance',
      );
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
    final storageId = await uploadPhoto(photo, kind: 'post_order_proof');
    final res = await _client
        .post(
          Uri.parse('$baseUrl/post-orders/$orderId/complete'),
          headers: await _headers(),
          body: jsonEncode({
            'proofNote': proofNote,
            'gpsLatitude': gpsLatitude,
            'gpsLongitude': gpsLongitude,
            'photoStorageId': storageId,
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
    final storageId = photo == null
        ? null
        : await uploadPhoto(photo, kind: 'handover');

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
            'photoStorageId': storageId,
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
