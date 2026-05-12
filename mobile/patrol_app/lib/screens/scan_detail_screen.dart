import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/scan_provider.dart';
import '../utils/theme.dart';
import '../widgets/status_badge.dart';
import 'package:intl/intl.dart';

class ScanDetailScreen extends StatelessWidget {
  final String? scanId;
  const ScanDetailScreen({super.key, this.scanId});

  @override
  Widget build(BuildContext context) {
    final scan = context.watch<ScanProvider>().scans;
    final item = scanId != null
        ? scan.where((s) => s.id == scanId).firstOrNull
        : scan.isNotEmpty
            ? scan.first
            : null;

    if (item == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Scan Detail')),
        body: const Center(
          child: Text('Scan not found',
              style: TextStyle(color: AppTheme.textSecondary)),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Scan Detail')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  Icon(
                    item.gpsValid
                        ? Icons.check_circle_outline
                        : Icons.warning_amber_rounded,
                    size: 64,
                    color: item.gpsValid ? AppTheme.verified : AppTheme.flagged,
                  ),
                  const SizedBox(height: 8),
                  StatusBadge(verified: item.gpsValid),
                  const SizedBox(height: 16),
                  Text(
                    item.checkpointName,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.text,
                    ),
                  ),
                  Text(
                    '${item.checkpointCode} · ${item.checkpointName}',
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  _DetailRow(
                    icon: Icons.person,
                    label: 'Officer',
                    value: item.officerName,
                  ),
                  const Divider(height: 24),
                  _DetailRow(
                    icon: Icons.location_on,
                    label: 'Checkpoint',
                    value:
                        '${item.checkpointName} (${item.checkpointCode})',
                  ),
                  const Divider(height: 24),
                  _DetailRow(
                    icon: Icons.access_time,
                    label: 'Scanned At',
                    value: DateFormat('MMM d, yyyy – h:mm:ss a')
                        .format(item.scannedAt),
                  ),
                  const Divider(height: 24),
                  _DetailRow(
                    icon: Icons.my_location,
                    label: 'Distance',
                    value:
                        '${item.distanceMeters.toStringAsFixed(0)} meters ${item.gpsValid ? '✅' : '⚠️'}',
                  ),
                  const Divider(height: 24),
                  _DetailRow(
                    icon: Icons.map,
                    label: 'GPS Coordinates',
                    value:
                        '${item.gpsLatitude.toStringAsFixed(4)}, ${item.gpsLongitude.toStringAsFixed(4)}',
                  ),
                ],
              ),
            ),
          ),
          if (item.notes != null) ...[
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Row(
                      children: [
                        Icon(Icons.notes, size: 18, color: AppTheme.textSecondary),
                        SizedBox(width: 8),
                        Text(
                          'Patrol Notes',
                          style: TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 15,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      item.notes!,
                      style: const TextStyle(
                        fontSize: 14,
                        color: AppTheme.text,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _DetailRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 20, color: AppTheme.textSecondary),
        const SizedBox(width: 12),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: const TextStyle(
                    fontSize: 12, color: AppTheme.textSecondary)),
            Text(value,
                style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: AppTheme.text)),
          ],
        ),
      ],
    );
  }
}
