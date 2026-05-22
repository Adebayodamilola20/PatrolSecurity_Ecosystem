const String baseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://patrolsecurity-ecosystem.onrender.com/api/v1',
);
const String defaultPassword = '123456';
const double gpsRadiusMeters = 10;
const double strictScanRadiusMeters = 10;
