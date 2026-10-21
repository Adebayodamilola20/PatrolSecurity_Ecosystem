import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:patrol_app/models/clock_in_check.dart';
import 'package:patrol_app/services/api_service.dart';

void main() {
  late List<http.Request> sent;

  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    sent = [];
  });

  void serverReplies(int status, Object body) {
    ApiService.httpClientForTesting = MockClient((req) async {
      sent.add(req);
      return http.Response(
        jsonEncode(body),
        status,
        headers: {'content-type': 'application/json'},
      );
    });
  }

  Map<String, dynamic> sentBody() =>
      jsonDecode(sent.single.body) as Map<String, dynamic>;

  group('ApiService.clockIn request body', () {
    test('carries the scanned code, exactly as read, as locationCode', () async {
      serverReplies(201, {'active': true});

      await ApiService.clockIn(
        latitude: 6.455,
        longitude: 3.3841,
        mocked: false,
        locationCode: 'EVG-MAIN-ENTRANCE-001',
      );

      expect(sent.single.method, 'POST');
      expect(sent.single.url.path, endsWith('/shifts/clock-in'));
      expect(sentBody(), {
        'gpsLatitude': 6.455,
        'gpsLongitude': 3.3841,
        'gpsMocked': false,
        'locationCode': 'EVG-MAIN-ENTRANCE-001',
      });
    });

    test('leaves locationCode out entirely when nothing was scanned', () async {
      serverReplies(201, {'active': true});

      await ApiService.clockIn(latitude: 6.455, longitude: 3.3841, mocked: true);

      expect(sentBody().containsKey('locationCode'), isFalse);
      expect(sentBody(), {
        'gpsLatitude': 6.455,
        'gpsLongitude': 3.3841,
        'gpsMocked': true,
      });
    });
  });

  group('ApiService.clockIn responses', () {
    test('a 403 refusal surfaces the server reason word for word', () async {
      serverReplies(403, {
        'message':
            'That is a patrol point, not the clock-in code. Scan the QR at the main entrance.',
      });

      await expectLater(
        ApiService.clockIn(latitude: 1, longitude: 1, locationCode: 'CP-7'),
        throwsA(
          isA<PermanentRejectionException>().having(
            (e) => e.message,
            'message',
            'That is a patrol point, not the clock-in code. Scan the QR at the main entrance.',
          ),
        ),
      );
    });

    test('a 409 carries the already-clocked-in message', () async {
      serverReplies(409, {
        'message': 'Already clocked in — end current shift first',
      });

      await expectLater(
        ApiService.clockIn(latitude: 1, longitude: 1),
        throwsA(
          predicate(
            (e) =>
                e.toString() ==
                'Exception: Already clocked in — end current shift first',
          ),
        ),
      );
    });
  });

  group('ClockInCheck.fromResponse', () {
    test('reads a verified QR check-in', () {
      final check = ClockInCheck.fromResponse({
        'active': true,
        'checkIn': {
          'method': 'qr',
          'verified': true,
          'siteName': 'EVERGREEN HEAD OFFICE',
        },
      })!;
      expect(check.byQr, isTrue);
      expect(check.verified, isTrue);
      expect(check.siteName, 'EVERGREEN HEAD OFFICE');
    });

    test('is null for an older server that sends no checkIn', () {
      expect(ClockInCheck.fromResponse({'active': true, 'shift': {}}), isNull);
    });

    test('never counts anything but an explicit true as verified', () {
      final check = ClockInCheck.fromResponse({
        'checkIn': {'method': 'gps', 'verified': 'yes', 'siteName': '  '},
      })!;
      expect(check.verified, isFalse);
      expect(check.siteName, isNull);
    });
  });
}
