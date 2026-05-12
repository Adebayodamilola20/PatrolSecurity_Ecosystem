class Checkpoint {
  final String id;
  final String name;
  final String code;
  final String location;
  final double latitude;
  final double longitude;
  final double radiusMeters;
  final bool active;
  final int totalScans;
  final String? lastScan;

  Checkpoint({
    required this.id,
    required this.name,
    required this.code,
    this.location = '',
    required this.latitude,
    required this.longitude,
    this.radiusMeters = 50,
    this.active = true,
    this.totalScans = 0,
    this.lastScan,
  });

  factory Checkpoint.fromJson(Map<String, dynamic> json) => Checkpoint(
        id: json['id'] ?? '',
        name: json['name'] ?? '',
        code: json['code'] ?? '',
        location: json['location'] ?? '',
        latitude: (json['latitude'] ?? 0).toDouble(),
        longitude: (json['longitude'] ?? 0).toDouble(),
        radiusMeters: (json['radiusMeters'] ?? 50).toDouble(),
        active: json['active'] == true || json['active'] == 1,
        totalScans: json['totalScans'] ?? 0,
        lastScan: json['lastScan'],
      );
}
