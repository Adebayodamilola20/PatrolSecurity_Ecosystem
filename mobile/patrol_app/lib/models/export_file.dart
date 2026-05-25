class ExportTotals {
  final int scans;
  final int verifiedScans;
  final int flaggedScans;
  final int shifts;
  final double totalShiftHours;

  const ExportTotals({
    required this.scans,
    required this.verifiedScans,
    required this.flaggedScans,
    required this.shifts,
    required this.totalShiftHours,
  });

  factory ExportTotals.fromJson(Map<String, dynamic> json) => ExportTotals(
        scans: json['scans'] ?? 0,
        verifiedScans: json['verifiedScans'] ?? 0,
        flaggedScans: json['flaggedScans'] ?? 0,
        shifts: json['shifts'] ?? 0,
        totalShiftHours: (json['totalShiftHours'] ?? 0).toDouble(),
      );
}

class ExportFile {
  final String id;
  final String type;
  final String date;
  final String format;
  final String status;
  final String scopeLabel;
  final String? clientId;
  final String requestedBy;
  final String requestedByName;
  final String fileName;
  final String downloadUrl;
  final DateTime? generatedAt;
  final DateTime? createdAt;
  final ExportTotals totals;

  const ExportFile({
    required this.id,
    required this.type,
    required this.date,
    required this.format,
    required this.status,
    required this.scopeLabel,
    required this.clientId,
    required this.requestedBy,
    required this.requestedByName,
    required this.fileName,
    required this.downloadUrl,
    required this.generatedAt,
    required this.createdAt,
    required this.totals,
  });

  factory ExportFile.fromJson(Map<String, dynamic> json) => ExportFile(
        id: json['id'] ?? '',
        type: json['type'] ?? '',
        date: json['date'] ?? '',
        format: json['format'] ?? 'csv',
        status: json['status'] ?? 'ready',
        scopeLabel: json['scopeLabel'] ?? '',
        clientId: json['clientId'],
        requestedBy: json['requestedBy'] ?? '',
        requestedByName: json['requestedByName'] ?? '',
        fileName: json['fileName'] ?? '',
        downloadUrl: json['downloadUrl'] ?? '',
        generatedAt: DateTime.tryParse(json['generatedAt']?.toString() ?? ''),
        createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? ''),
        totals: json['totals'] is Map<String, dynamic>
            ? ExportTotals.fromJson(json['totals'] as Map<String, dynamic>)
            : const ExportTotals(
                scans: 0,
                verifiedScans: 0,
                flaggedScans: 0,
                shifts: 0,
                totalShiftHours: 0,
              ),
      );
}
