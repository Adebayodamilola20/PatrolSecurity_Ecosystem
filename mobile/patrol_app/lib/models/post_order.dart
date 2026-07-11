class PostOrderCompletion {
  final String id;
  final String status;
  final String reviewStatus;
  final String? completedAt;
  final String? acknowledgedAt;
  final String? proofPhotoUrl;
  final String? proofNote;

  PostOrderCompletion({
    required this.id,
    required this.status,
    required this.reviewStatus,
    this.completedAt,
    this.acknowledgedAt,
    this.proofPhotoUrl,
    this.proofNote,
  });

  factory PostOrderCompletion.fromJson(Map<String, dynamic> json) =>
      PostOrderCompletion(
        id: json['id'] ?? '',
        status: json['status'] ?? 'pending',
        reviewStatus: json['reviewStatus'] ?? 'pending',
        completedAt: json['completedAt'],
        acknowledgedAt: json['acknowledgedAt'],
        proofPhotoUrl: json['proofPhotoUrl'],
        proofNote: json['proofNote'],
      );
}

class PostOrder {
  final String id;
  final String title;
  final String summary;
  final String instructions;
  final String? checkpointId;
  final String? checkpointName;
  final String? siteId;
  final String? siteName;
  final String priority;
  final bool active;
  final bool requiresAcknowledgement;
  final bool requiresPhotoProof;
  final PostOrderCompletion? latestCompletion;

  PostOrder({
    required this.id,
    required this.title,
    required this.summary,
    required this.instructions,
    this.checkpointId,
    this.checkpointName,
    this.siteId,
    this.siteName,
    required this.priority,
    required this.active,
    required this.requiresAcknowledgement,
    required this.requiresPhotoProof,
    this.latestCompletion,
  });

  factory PostOrder.fromJson(Map<String, dynamic> json) => PostOrder(
    id: json['id'] ?? '',
    title: json['title'] ?? '',
    summary: json['summary'] ?? '',
    instructions: json['instructions'] ?? '',
    checkpointId: json['checkpointId'],
    checkpointName: json['checkpointName'],
    siteId: json['siteId'],
    siteName: json['siteName'],
    priority: json['priority'] ?? 'normal',
    active: json['active'] == true || json['active'] == 1,
    requiresAcknowledgement:
        json['requiresAcknowledgement'] == true ||
        json['requiresAcknowledgement'] == 1,
    requiresPhotoProof:
        json['requiresPhotoProof'] == true || json['requiresPhotoProof'] == 1,
    latestCompletion: json['latestCompletion'] is Map<String, dynamic>
        ? PostOrderCompletion.fromJson(
            json['latestCompletion'] as Map<String, dynamic>,
          )
        : null,
  );
}
