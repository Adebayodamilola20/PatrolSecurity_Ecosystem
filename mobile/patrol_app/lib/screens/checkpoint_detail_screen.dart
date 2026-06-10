import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/scan_provider.dart';
import '../utils/theme.dart';
import '../widgets/network_error_state.dart';

class CheckpointDetailScreen extends StatelessWidget {
  final String? checkpointId;
  const CheckpointDetailScreen({super.key, this.checkpointId});

  @override
  Widget build(BuildContext context) {
    final scan = context.watch<ScanProvider>();
    final cp = checkpointId != null
        ? scan.checkpoints.where((c) => c.id == checkpointId).firstOrNull
        : scan.checkpoints.isNotEmpty
        ? scan.checkpoints.first
        : null;

    if (cp == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Checkpoint')),
        body: scan.checkpointsError != null && scan.checkpoints.isEmpty
            ? NetworkErrorState(
                message: scan.checkpointsError!,
                onRetry: scan.loadCheckpoints,
              )
            : const Center(
                child: Text(
                  'Checkpoint not found',
                  style: TextStyle(color: AppTheme.textSecondary),
                ),
              ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: Text(cp.name)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      color: const Color(0xFF3B82F6).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: const Icon(
                      Icons.location_on,
                      color: Color(0xFF3B82F6),
                      size: 28,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    cp.name,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.text,
                    ),
                    softWrap: true,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${cp.code} · ${cp.location}',
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppTheme.textSecondary,
                    ),
                    softWrap: true,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: cp.active
                          ? const Color(0xFF10B981).withValues(alpha: 0.1)
                          : AppTheme.textSecondary.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      cp.active ? 'Active' : 'Inactive',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: cp.active
                            ? const Color(0xFF10B981)
                            : AppTheme.textSecondary,
                      ),
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
                    icon: Icons.qr_code,
                    label: 'Code',
                    value: cp.code,
                  ),
                  const Divider(height: 20),
                  _DetailRow(
                    icon: Icons.my_location,
                    label: 'GPS Coordinates',
                    value:
                        '${cp.latitude.toStringAsFixed(6)}, ${cp.longitude.toStringAsFixed(6)}',
                  ),
                  const Divider(height: 20),
                  _DetailRow(
                    icon: Icons.radio_button_checked,
                    label: 'Validation Radius',
                    value: '${cp.radiusMeters.toStringAsFixed(0)} meters',
                  ),
                  const Divider(height: 20),
                  _DetailRow(
                    icon: Icons.assignment_turned_in,
                    label: 'Total Scans',
                    value: '${cp.totalScans}',
                  ),
                  if (cp.lastScan != null) ...[
                    const Divider(height: 20),
                    _DetailRow(
                      icon: Icons.access_time,
                      label: 'Last Scan',
                      value: cp.lastScan!,
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            height: 50,
            child: ElevatedButton.icon(
              onPressed: () {},
              icon: const Icon(Icons.qr_code),
              label: const Text('Show QR Code'),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF3B82F6),
              ),
            ),
          ),
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
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(
                  fontSize: 12,
                  color: AppTheme.textSecondary,
                ),
              ),
              Text(
                value,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: AppTheme.text,
                ),
                softWrap: true,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ],
    );
  }
}
