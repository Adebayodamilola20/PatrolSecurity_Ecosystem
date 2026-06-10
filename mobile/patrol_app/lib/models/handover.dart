class Handover {
  final String id;
  final String summary;
  final String status;
  final String? checkpointName;
  final String? siteLabel;
  final String? fromUserName;
  final String? toUserName;
  final String? openIssues;
  final String? equipmentStatus;
  final String? photoUrl;
  final String createdAt;

  Handover({
    required this.id,
    required this.summary,
    required this.status,
    this.checkpointName,
    this.siteLabel,
    this.fromUserName,
    this.toUserName,
    this.openIssues,
    this.equipmentStatus,
    this.photoUrl,
    required this.createdAt,
  });

  factory Handover.fromJson(Map<String, dynamic> json) => Handover(
    id: json['id'] ?? '',
    summary: json['summary'] ?? '',
    status: json['status'] ?? 'pending',
    checkpointName: json['checkpointName'],
    siteLabel: json['siteLabel'],
    fromUserName: json['fromUserName'],
    toUserName: json['toUserName'],
    openIssues: json['openIssues'],
    equipmentStatus: json['equipmentStatus'],
    photoUrl: json['photoUrl'],
    createdAt: json['createdAt'] ?? '',
  );
}
