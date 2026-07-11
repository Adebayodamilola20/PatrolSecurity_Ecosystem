class Checkpoint {
  final String id;
  final String name;
  final String code;
  final String location;
  final String? siteId;
  final double latitude;
  final double longitude;
  final double radiusMeters;
  final int expectedIntervalMinutes;
  final String scheduledTimeIn;
  final String scheduledTimeOut;
  final bool active;
  final int totalScans;
  final String? lastScan;

  Checkpoint({
    required this.id,
    required this.name,
    required this.code,
    this.location = '',
    this.siteId,
    required this.latitude,
    required this.longitude,
    this.radiusMeters = 10,
    this.expectedIntervalMinutes = 60,
    this.scheduledTimeIn = '',
    this.scheduledTimeOut = '',
    this.active = true,
    this.totalScans = 0,
    this.lastScan,
  });

  factory Checkpoint.fromJson(Map<String, dynamic> json) => Checkpoint(
    id: json['id'] ?? '',
    name: json['name'] ?? '',
    code: json['code'] ?? '',
    location: json['location'] ?? '',
    siteId: json['siteId'],
    latitude: (json['latitude'] ?? 0).toDouble(),
    longitude: (json['longitude'] ?? 0).toDouble(),
    radiusMeters: (json['radiusMeters'] ?? 10).toDouble(),
    expectedIntervalMinutes: (json['expectedIntervalMinutes'] ?? 60).toInt(),
    scheduledTimeIn: json['scheduledTimeIn'] ?? '',
    scheduledTimeOut: json['scheduledTimeOut'] ?? '',
    active: json['active'] == true || json['active'] == 1,
    totalScans: json['totalScans'] ?? 0,
    lastScan: json['lastScan'],
  );
}
