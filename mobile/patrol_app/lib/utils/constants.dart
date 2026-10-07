import 'package:flutter/services.dart' show appFlavor;

/// Which company this app build is for (set by `--flavor`).
bool get isTarmacApp => appFlavor == 'tarmac';

const String _apiBaseUrlOverride = String.fromEnvironment('API_BASE_URL');

/// Backend for this build. Each company has its own backend; an explicit
/// --dart-define=API_BASE_URL still wins for testing.
String get baseUrl {
  if (_apiBaseUrlOverride.isNotEmpty) return _apiBaseUrlOverride;
  return isTarmacApp
      ? 'https://gallant-crow-174.convex.site/api/v1'
      : 'https://harmless-pigeon-186.convex.site/api/v1';
}
const String defaultPassword = '123456';
const double gpsRadiusMeters = 10;
const double strictScanRadiusMeters = 10;
const int continuousGpsUpdateSeconds = int.fromEnvironment(
  'CONTINUOUS_GPS_UPDATE_SECONDS',
  defaultValue: 30,
);
