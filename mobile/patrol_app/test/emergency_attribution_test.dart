import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:patrol_app/models/checkpoint.dart';

/// Haversine, matching LocationService.calculateDistance closely enough for
/// the only thing these tests care about: near vs far.
double _distance(double lat1, double lon1, double lat2, double lon2) {
  const earthRadius = 6371000.0;
  double toRad(double deg) => deg * math.pi / 180;
  final dLat = toRad(lat2 - lat1);
  final dLon = toRad(lon2 - lon1);
  final a =
      math.sin(dLat / 2) * math.sin(dLat / 2) +
      math.cos(toRad(lat1)) *
          math.cos(toRad(lat2)) *
          math.sin(dLon / 2) *
          math.sin(dLon / 2);
  return earthRadius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
}

Checkpoint _checkpoint({
  required String id,
  required String name,
  double? latitude,
  double? longitude,
}) {
  return Checkpoint(
    id: id,
    name: name,
    code: id.toUpperCase(),
    latitude: latitude,
    longitude: longitude,
  );
}

void main() {
  // Lagos — a real checkpoint on a real site.
  const jumiaLat = 6.4550;
  const jumiaLng = 3.3841;

  // The iOS Simulator's default fix, which is what produced the alert that
  // started all this: a guard "at Jumia Services" while the phone was
  // reporting a position in San Francisco.
  const simulatorLat = 37.785834;
  const simulatorLng = -122.406417;

  final jumia = _checkpoint(
    id: 'cp_jumia',
    name: 'Jumia Services, Ahmadu Bello Way',
    latitude: jumiaLat,
    longitude: jumiaLng,
  );

  group('nearestCheckpointWithin', () {
    test('returns the checkpoint when the guard is standing at it', () {
      final result = nearestCheckpointWithin(
        [jumia],
        jumiaLat,
        jumiaLng,
        _distance,
      );
      expect(result?.id, 'cp_jumia');
    });

    test('returns null when the only checkpoint is a continent away', () {
      // The regression. Nearest-with-no-ceiling returned Jumia here, the
      // checkpoint id rode along with the alert, and the control room was
      // shown a site and a client the guard had no connection to.
      final result = nearestCheckpointWithin(
        [jumia],
        simulatorLat,
        simulatorLng,
        _distance,
      );
      expect(result, isNull);
    });

    test('returns null just outside the radius and the checkpoint just inside', () {
      // ~0.009 degrees of latitude is roughly 1km; half that is inside 500m.
      final justOutside = nearestCheckpointWithin(
        [jumia],
        jumiaLat + 0.009,
        jumiaLng,
        _distance,
      );
      expect(justOutside, isNull);

      final justInside = nearestCheckpointWithin(
        [jumia],
        jumiaLat + 0.002,
        jumiaLng,
        _distance,
      );
      expect(justInside?.id, 'cp_jumia');
    });

    test('picks the closest of several in range', () {
      final gate = _checkpoint(
        id: 'cp_gate',
        name: 'Front gate',
        latitude: jumiaLat + 0.0005,
        longitude: jumiaLng,
      );
      final result = nearestCheckpointWithin(
        [jumia, gate],
        jumiaLat + 0.0006,
        jumiaLng,
        _distance,
      );
      expect(result?.id, 'cp_gate');
    });

    test('skips sub-locations that carry no coordinates of their own', () {
      final noCoords = _checkpoint(id: 'cp_none', name: 'Rear door');
      final result = nearestCheckpointWithin(
        [noCoords],
        jumiaLat,
        jumiaLng,
        _distance,
      );
      expect(result, isNull);
    });

    test('returns null for an empty checkpoint list', () {
      expect(
        nearestCheckpointWithin([], jumiaLat, jumiaLng, _distance),
        isNull,
      );
    });
  });
}
