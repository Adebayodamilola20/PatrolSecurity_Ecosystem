import 'dart:async';
import 'package:geolocator/geolocator.dart';

class LocationResult {
  final Position? position;
  final String? error;

  const LocationResult({this.position, this.error});

  bool get isSuccess => position != null;
}

class LocationService {
  static Future<LocationResult> getCurrentLocation() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      return const LocationResult(
        error: 'Phone location is turned off. Enable device location and try again.',
      );
    }

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        return const LocationResult(
          error: 'Location permission was denied for this app.',
        );
      }
    }

    if (permission == LocationPermission.deniedForever) {
      return const LocationResult(
        error: 'Location permission is blocked for this app. Allow location in Android app settings.',
      );
    }

    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          distanceFilter: 5,
        ),
        timeLimit: const Duration(seconds: 12),
      );
      return LocationResult(position: position);
    } on TimeoutException {
      final lastKnown = await Geolocator.getLastKnownPosition();
      if (lastKnown != null) {
        return LocationResult(position: lastKnown);
      }
      return const LocationResult(
        error: 'Could not get GPS in time. Move to an open area and try again.',
      );
    } on LocationServiceDisabledException {
      return const LocationResult(
        error: 'Phone location is turned off. Enable device location and try again.',
      );
    } catch (_) {
      final lastKnown = await Geolocator.getLastKnownPosition();
      if (lastKnown != null) {
        return LocationResult(position: lastKnown);
      }
      return const LocationResult(
        error: 'GPS is unavailable right now. Check app location permission and try again.',
      );
    }
  }

  static double calculateDistance(
    double lat1, double lng1,
    double lat2, double lng2,
  ) {
    return Geolocator.distanceBetween(lat1, lng1, lat2, lng2);
  }
}
