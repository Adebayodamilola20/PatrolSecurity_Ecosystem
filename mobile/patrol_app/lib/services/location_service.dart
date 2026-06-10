import 'dart:async';
import 'package:geolocator/geolocator.dart';

class SafeLocationResult {
  final double latitude;
  final double longitude;
  final double accuracyMeters;
  final DateTime capturedAt;
  final String? error;
  final double? speed;
  final double? heading;

  const SafeLocationResult({
    required this.latitude,
    required this.longitude,
    required this.accuracyMeters,
    required this.capturedAt,
    this.error,
    this.speed,
    this.heading,
  });

  bool get isSuccess => error == null;
  bool get isAccurate => accuracyMeters <= 100.0;

  Map<String, dynamic> toPayload() => {
    'latitude': latitude,
    'longitude': longitude,
    'accuracy': accuracyMeters,
    'capturedAt': capturedAt.toIso8601String(),
    if (speed != null) 'speed': speed,
    if (heading != null) 'heading': heading,
  };
}

class LocationService {
  static const double _maxAccuracyMeters = 100.0;

  static Future<SafeLocationResult> getCurrentLocation() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      return SafeLocationResult(
        latitude: 0,
        longitude: 0,
        accuracyMeters: double.infinity,
        capturedAt: DateTime.now(),
        error:
            'Phone location is turned off. Enable device location and try again.',
      );
    }

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        return SafeLocationResult(
          latitude: 0,
          longitude: 0,
          accuracyMeters: double.infinity,
          capturedAt: DateTime.now(),
          error: 'Location permission was denied for this app.',
        );
      }
    }

    if (permission == LocationPermission.deniedForever) {
      return SafeLocationResult(
        latitude: 0,
        longitude: 0,
        accuracyMeters: double.infinity,
        capturedAt: DateTime.now(),
        error:
            'Location permission is blocked for this app. Allow location in Android app settings.',
      );
    }

    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          distanceFilter: 5,
          timeLimit: Duration(seconds: 12),
        ),
      );

      final accuracy = position.accuracy;
      if (accuracy > _maxAccuracyMeters) {
        return SafeLocationResult(
          latitude: 0,
          longitude: 0,
          accuracyMeters: accuracy,
          capturedAt: DateTime.now(),
          error:
              'GPS accuracy is too low (${accuracy.toStringAsFixed(0)}m). Move to an open area and try again.',
        );
      }

      return SafeLocationResult(
        latitude: position.latitude,
        longitude: position.longitude,
        accuracyMeters: accuracy,
        capturedAt: position.timestamp,
        speed: position.speed,
        heading: position.heading,
      );
    } on TimeoutException {
      final lastKnown = await Geolocator.getLastKnownPosition();
      if (lastKnown != null) {
        final accuracy = lastKnown.accuracy;
        if (accuracy <= _maxAccuracyMeters) {
          return SafeLocationResult(
            latitude: lastKnown.latitude,
            longitude: lastKnown.longitude,
            accuracyMeters: accuracy,
            capturedAt: lastKnown.timestamp,
            speed: lastKnown.speed,
            heading: lastKnown.heading,
          );
        }
      }
      return SafeLocationResult(
        latitude: 0,
        longitude: 0,
        accuracyMeters: double.infinity,
        capturedAt: DateTime.now(),
        error:
            'Could not get accurate GPS in time. Move to an open area and try again.',
      );
    } on LocationServiceDisabledException {
      return SafeLocationResult(
        latitude: 0,
        longitude: 0,
        accuracyMeters: double.infinity,
        capturedAt: DateTime.now(),
        error:
            'Phone location is turned off. Enable device location and try again.',
      );
    } catch (_) {
      final lastKnown = await Geolocator.getLastKnownPosition();
      if (lastKnown != null) {
        final accuracy = lastKnown.accuracy;
        if (accuracy <= _maxAccuracyMeters) {
          return SafeLocationResult(
            latitude: lastKnown.latitude,
            longitude: lastKnown.longitude,
            accuracyMeters: accuracy,
            capturedAt: lastKnown.timestamp,
            speed: lastKnown.speed,
            heading: lastKnown.heading,
          );
        }
      }
      return SafeLocationResult(
        latitude: 0,
        longitude: 0,
        accuracyMeters: double.infinity,
        capturedAt: DateTime.now(),
        error:
            'GPS is unavailable right now. Check app location permission and try again.',
      );
    }
  }

  static double calculateDistance(
    double lat1,
    double lng1,
    double lat2,
    double lng2,
  ) {
    return Geolocator.distanceBetween(lat1, lng1, lat2, lng2);
  }
}
