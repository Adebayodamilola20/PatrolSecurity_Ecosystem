import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:patrol_app/providers/shift_provider.dart';
import 'package:patrol_app/services/api_service.dart';
import 'package:patrol_app/services/location_service.dart';

/// A GPS chip that always has a good fix and never touches the platform.
class _FakeLocation extends ShiftLocationSource {
  const _FakeLocation();

  @override
  Future<SafeLocationResult> current({bool allowCached = true}) async =>
      SafeLocationResult(
        latitude: 6.4550,
        longitude: 3.3841,
        accuracyMeters: 8,
        capturedAt: DateTime.now(),
      );

  @override
  Future<bool> ensureBackgroundPermission() async => true;

  @override
  void startWarmTracking() {}

  @override
  void stopWarmTracking() {}
}

http.Response _json(Object body, int status) => http.Response(
  jsonEncode(body),
  status,
  headers: {'content-type': 'application/json'},
);

final _openShift = {
  'active': true,
  'shift': {
    'id': 'shift_1',
    'clockIn': '2026-10-21T07:58:00.000Z',
    'clockOut': null,
    'scheduledEnd': null,
    'siteLabel': '',
    'status': 'active',
  },
};

void main() {
  late ShiftProvider shift;

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    shift = ShiftProvider(location: const _FakeLocation());
  });

  tearDown(() => shift.dispose());

  test(
    'a 409 "already clocked in" resyncs with the server, so the app shows on '
    'duty instead of leaving the guard stuck off duty',
    () async {
      ApiService.httpClientForTesting = MockClient((req) async {
        if (req.url.path.endsWith('/shifts/clock-in')) {
          return _json({
            'message': 'Already clocked in — end current shift first',
          }, 409);
        }
        if (req.url.path.endsWith('/shifts/status')) {
          return _json(_openShift, 200);
        }
        return _json({}, 201); // position pings once tracking starts
      });

      final ok = await shift.clockIn();

      expect(ok, isFalse);
      expect(shift.onDuty, isTrue);
      expect(shift.error, 'Already clocked in — end current shift first');
      expect(shift.loading, isFalse);
    },
  );

  test('a failed resync never replaces the reason the server gave', () async {
    ApiService.httpClientForTesting = MockClient((req) async {
      if (req.url.path.endsWith('/shifts/clock-in')) {
        return _json({
          'message':
              'You are 900m away from EVERGREEN HEAD OFFICE. Clock in at the site.',
        }, 403);
      }
      // The status call fails too — its message must not win.
      return _json({'message': 'Internal server error'}, 500);
    });

    final ok = await shift.clockIn();

    expect(ok, isFalse);
    expect(shift.onDuty, isFalse);
    expect(
      shift.error,
      'You are 900m away from EVERGREEN HEAD OFFICE. Clock in at the site.',
    );
  });

  test('a QR clock-in sends the code and exposes the verified check-in', () async {
    Map<String, dynamic>? clockInBody;
    ApiService.httpClientForTesting = MockClient((req) async {
      if (req.url.path.endsWith('/shifts/clock-in')) {
        clockInBody = jsonDecode(req.body) as Map<String, dynamic>;
        return _json({
          ..._openShift,
          'checkIn': {
            'method': 'qr',
            'verified': true,
            'siteName': 'EVERGREEN HEAD OFFICE',
          },
        }, 201);
      }
      if (req.url.path.endsWith('/shifts/status')) {
        return _json(_openShift, 200);
      }
      return _json({}, 201);
    });

    final ok = await shift.clockIn(locationCode: 'EVG-MAIN-001');

    expect(ok, isTrue);
    expect(clockInBody?['locationCode'], 'EVG-MAIN-001');
    expect(clockInBody?['gpsLatitude'], 6.4550);
    expect(shift.onDuty, isTrue);
    expect(shift.lastCheckIn?.verified, isTrue);
    expect(shift.lastCheckIn?.siteName, 'EVERGREEN HEAD OFFICE');
    expect(shift.error, isNull);
  });

  test('an older server with no checkIn still clocks in, unverified', () async {
    ApiService.httpClientForTesting = MockClient((req) async {
      if (req.url.path.endsWith('/shifts/clock-in')) {
        return _json(_openShift, 201);
      }
      if (req.url.path.endsWith('/shifts/status')) {
        return _json(_openShift, 200);
      }
      return _json({}, 201);
    });

    final ok = await shift.clockIn(locationCode: 'EVG-MAIN-001');

    expect(ok, isTrue);
    expect(shift.onDuty, isTrue);
    expect(shift.lastCheckIn, isNull);
  });

  test('a dropped connection reads as a plain no-connection message', () async {
    ApiService.httpClientForTesting = MockClient((req) async {
      throw http.ClientException('Connection closed', req.url);
    });

    final ok = await shift.clockIn();

    expect(ok, isFalse);
    expect(shift.onDuty, isFalse);
    expect(shift.error, 'No connection. Check your internet and try again.');
  });
}
