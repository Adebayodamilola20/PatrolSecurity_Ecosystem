import 'post_order.dart';

class Scan {
  final String id;
  final String officerId;
  final String officerName;
  final String checkpointId;
  final String checkpointName;
  final String checkpointCode;
  final DateTime scannedAt;
  final DateTime receivedAt;
  final double gpsLatitude;
  final double gpsLongitude;
  final bool gpsValid;
  final double distanceMeters;
  final String? photoUrl;
  final String? notes;
  // The post orders this scan triggered, straight from the server's verdict.
  // Only present on the response to a freshly submitted scan.
  final List<PostOrder> postOrders;

  Scan({
    required this.id,
    required this.officerId,
    required this.officerName,
    required this.checkpointId,
    required this.checkpointName,
    required this.checkpointCode,
    required this.scannedAt,
    required this.receivedAt,
    required this.gpsLatitude,
    required this.gpsLongitude,
    required this.gpsValid,
    required this.distanceMeters,
    this.photoUrl,
    this.notes,
    this.postOrders = const [],
  });

  factory Scan.fromJson(Map<String, dynamic> json) => Scan(
    id: json['id'] ?? '',
    officerId: json['officerId'] ?? '',
    officerName: json['officerName'] ?? '',
    checkpointId: json['checkpointId'] ?? '',
    checkpointName: json['checkpointName'] ?? '',
    checkpointCode: json['checkpointCode'] ?? '',
    scannedAt: DateTime.tryParse(json['scannedAt'] ?? '') ?? DateTime.now(),
    receivedAt: DateTime.tryParse(json['receivedAt'] ?? '') ?? DateTime.now(),
    gpsLatitude: (json['gpsLatitude'] ?? 0).toDouble(),
    gpsLongitude: (json['gpsLongitude'] ?? 0).toDouble(),
    gpsValid: json['gpsValid'] == true || json['gpsValid'] == 1,
    distanceMeters: (json['distanceMeters'] ?? 0).toDouble(),
    photoUrl: json['photoUrl'],
    notes: json['notes'],
    postOrders: json['postOrders'] is List
        ? (json['postOrders'] as List)
              .whereType<Map<String, dynamic>>()
              .map(PostOrder.fromJson)
              .toList()
        : const [],
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'officerId': officerId,
    'officerName': officerName,
    'checkpointId': checkpointId,
    'checkpointName': checkpointName,
    'checkpointCode': checkpointCode,
    'scannedAt': scannedAt.toIso8601String(),
    'receivedAt': receivedAt.toIso8601String(),
    'gpsLatitude': gpsLatitude,
    'gpsLongitude': gpsLongitude,
    'gpsValid': gpsValid,
    'distanceMeters': distanceMeters,
    'photoUrl': photoUrl,
    'notes': notes,
  };

  String get formattedTime =>
      '${scannedAt.hour.toString().padLeft(2, '0')}:${scannedAt.minute.toString().padLeft(2, '0')}';

  String get formattedDate =>
      '${scannedAt.year}-${scannedAt.month.toString().padLeft(2, '0')}-${scannedAt.day.toString().padLeft(2, '0')}';
}
