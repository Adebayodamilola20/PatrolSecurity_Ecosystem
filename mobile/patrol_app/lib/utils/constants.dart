const String baseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://resilient-buffalo-226.convex.site/api/v1',
);
const String defaultPassword = '123456';
const double gpsRadiusMeters = 10;
const double strictScanRadiusMeters = 10;
const int continuousGpsUpdateSeconds = int.fromEnvironment(
  'CONTINUOUS_GPS_UPDATE_SECONDS',
  defaultValue: 30,
);
