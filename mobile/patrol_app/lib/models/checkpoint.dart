class Checkpoint {
  final String id;
  final String name;
  final String code;
  final String location;
  final String? siteId;
  // Sub-location QR points carry no coordinates of their own — they are
  // verified against the parent site's geofence on the server. Null here means
  // "no own coordinates"; do NOT default these to 0, or distance maths will
  // measure against Null Island (lat/lng 0,0) and report thousands of km.
  final double? latitude;
  final double? longitude;
  final double? radiusMeters;
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
    this.latitude,
    this.longitude,
    this.radiusMeters,
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
    latitude: (json['latitude'] as num?)?.toDouble(),
    longitude: (json['longitude'] as num?)?.toDouble(),
    radiusMeters: (json['radiusMeters'] as num?)?.toDouble(),
    expectedIntervalMinutes: (json['expectedIntervalMinutes'] ?? 60).toInt(),
    scheduledTimeIn: json['scheduledTimeIn'] ?? '',
    scheduledTimeOut: json['scheduledTimeOut'] ?? '',
    active: json['active'] == true || json['active'] == 1,
    totalScans: json['totalScans'] ?? 0,
    lastScan: json['lastScan'],
  );
}
