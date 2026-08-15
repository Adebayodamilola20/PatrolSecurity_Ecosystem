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

/// Which checkpoint an emergency should be attributed to, if any.
///
/// Lives here, once, because there were two copies of this walk — one in the
/// home screen and one in the patrol screen — and both had the same hole.
Checkpoint? nearestCheckpointWithin(
  List<Checkpoint> checkpoints,
  double latitude,
  double longitude,
  double Function(double, double, double, double) distanceBetween, {
  double radiusMeters = emergencyAttributionRadiusMeters,
}) {
  Checkpoint? nearest;
  double? nearestDistance;

  for (final checkpoint in checkpoints) {
    if (checkpoint.latitude == null || checkpoint.longitude == null) {
      continue; // sub-location QR with no own coordinates
    }
    final distance = distanceBetween(
      latitude,
      longitude,
      checkpoint.latitude!,
      checkpoint.longitude!,
    );
    if (nearestDistance == null || distance < nearestDistance) {
      nearest = checkpoint;
      nearestDistance = distance;
    }
  }

  // "Nearest" with no ceiling is not a location — it is whichever pin happens
  // to be least far away on the whole planet. A phone reporting a fix in San
  // Francisco was attributed to a checkpoint in Lagos about 12,000km off, and
  // because the checkpoint id rides along with the alert, the control room was
  // shown a site and a client the guard has no connection to. Out of range
  // means unknown, and unknown gets reported as unknown.
  if (nearest == null ||
      nearestDistance == null ||
      nearestDistance > radiusMeters) {
    return null;
  }
  return nearest;
}

/// How close a checkpoint must be before an emergency may be attributed to it.
const double emergencyAttributionRadiusMeters = 500;
