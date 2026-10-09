import 'package:flutter/services.dart' show appFlavor;

/// Which company this app build is for.
///
/// Android picks it with `--flavor tarmac|evergreen`. iOS and a plain
/// `flutter run` have no flavor, and this checkout is Tarmac's (see
/// PROJECT_BOUNDARY.md), so the default here is Tarmac. Override with
/// `--dart-define=BRAND=evergreen` if ever needed.
const String _brandDefine = String.fromEnvironment('BRAND', defaultValue: 'tarmac');
bool get isTarmacApp =>
    appFlavor == 'tarmac' || (appFlavor != 'evergreen' && _brandDefine == 'tarmac');

const String _apiBaseUrlOverride = String.fromEnvironment('API_BASE_URL');

/// Backend for this build. Each company has its own backend; an explicit
/// --dart-define=API_BASE_URL still wins for testing.
String get baseUrl {
  if (_apiBaseUrlOverride.isNotEmpty) return _apiBaseUrlOverride;
  return isTarmacApp
      ? 'https://unique-anteater-230.eu-west-1.convex.site/api/v1' // Tarmac production
      : 'https://harmless-pigeon-186.convex.site/api/v1';
}
const String defaultPassword = '123456';
const double gpsRadiusMeters = 10;
const double strictScanRadiusMeters = 10;
const int continuousGpsUpdateSeconds = int.fromEnvironment(
  'CONTINUOUS_GPS_UPDATE_SECONDS',
  defaultValue: 30,
);
