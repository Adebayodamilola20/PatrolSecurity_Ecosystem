import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../providers/scan_provider.dart';
import '../utils/theme.dart';
import '../widgets/network_error_state.dart';
import '../widgets/status_badge.dart';

class ScanDetailScreen extends StatelessWidget {
  final String? scanId;

  const ScanDetailScreen({super.key, this.scanId});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<ScanProvider>();
    final scans = provider.scans;
    final item = scanId != null
        ? scans.where((s) => s.id == scanId).firstOrNull
        : scans.isNotEmpty
        ? scans.first
        : null;

    if (item == null) {
      return Scaffold(
        backgroundColor: AppTheme.surface,
        appBar: AppBar(
          title: const Text('Scan details'),
          backgroundColor: AppTheme.surface,
          surfaceTintColor: Colors.transparent,
        ),
        body: provider.scansError != null && provider.scans.isEmpty
            ? NetworkErrorState(
                message: provider.scansError!,
                onRetry: provider.loadScans,
              )
            : const Center(
                child: Text(
                  'Scan not found',
                  style: TextStyle(color: AppTheme.textSecondary),
                ),
              ),
      );
    }

    final statusColor = item.gpsValid ? AppTheme.verified : AppTheme.flagged;

    return Scaffold(
      backgroundColor: AppTheme.surface,
      appBar: AppBar(
        title: const Text('Scan details'),
        backgroundColor: AppTheme.surface,
        surfaceTintColor: Colors.transparent,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 30),
        children: [
          _ScanSummaryCard(
            checkpointName: item.checkpointName,
            checkpointCode: item.checkpointCode,
            gpsValid: item.gpsValid,
            statusColor: statusColor,
          ),
          const SizedBox(height: 20),
          const _SectionHeading(
            eyebrow: 'SCAN INFORMATION',
            title: 'Verification details',
          ),
          const SizedBox(height: 11),
          _ScanCard(
            child: Column(
              children: [
                _DetailRow(
                  icon: Icons.person_outline_rounded,
                  label: 'Officer',
                  value: item.officerName,
                ),
                const _DetailDivider(),
                _DetailRow(
                  icon: Icons.location_on_outlined,
                  label: 'Checkpoint',
                  value: '${item.checkpointName} (${item.checkpointCode})',
                ),
                const _DetailDivider(),
                _DetailRow(
                  icon: Icons.schedule_outlined,
                  label: 'Scanned at',
                  value: DateFormat(
                    'MMM d, yyyy · h:mm:ss a',
                  ).format(item.scannedAt),
                ),
                const _DetailDivider(),
                _DetailRow(
                  icon: Icons.my_location_outlined,
                  label: 'Distance from checkpoint',
                  value: '${item.distanceMeters.toStringAsFixed(0)} meters',
                  trailing: _VerificationMark(verified: item.gpsValid),
                ),
                const _DetailDivider(),
                _DetailRow(
                  icon: Icons.map_outlined,
                  label: 'GPS coordinates',
                  value:
                      '${item.gpsLatitude.toStringAsFixed(4)}, ${item.gpsLongitude.toStringAsFixed(4)}',
                ),
              ],
            ),
          ),
          if (item.notes != null) ...[
            const SizedBox(height: 20),
            const _SectionHeading(
              eyebrow: 'FIELD NOTES',
              title: 'Patrol notes',
            ),
            const SizedBox(height: 11),
            _ScanCard(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                      color: AppTheme.primary.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(
                      Icons.notes_rounded,
                      color: AppTheme.primaryDark,
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      item.notes!,
                      style: const TextStyle(
                        color: AppTheme.text,
                        fontSize: 14,
                        height: 1.5,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _ScanSummaryCard extends StatelessWidget {
  const _ScanSummaryCard({
    required this.checkpointName,
    required this.checkpointCode,
    required this.gpsValid,
    required this.statusColor,
  });

  final String checkpointName;
  final String checkpointCode;
  final bool gpsValid;
  final Color statusColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: AppTheme.border),
        boxShadow: [
          BoxShadow(
            color: statusColor.withValues(alpha: 0.08),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: statusColor.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: statusColor.withValues(alpha: 0.2)),
            ),
            child: Icon(
              gpsValid
                  ? Icons.check_circle_outline_rounded
                  : Icons.warning_amber_rounded,
              size: 38,
              color: statusColor,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                StatusBadge(verified: gpsValid),
                const SizedBox(height: 10),
                Text(
                  checkpointName,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppTheme.text,
                    fontSize: 18,
                    height: 1.15,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.3,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  'Checkpoint code · $checkpointCode',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppTheme.textSecondary,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionHeading extends StatelessWidget {
  const _SectionHeading({required this.eyebrow, required this.title});

  final String eyebrow;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          eyebrow,
          style: const TextStyle(
            color: AppTheme.primaryDark,
            fontSize: 10,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.3,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          title,
          style: const TextStyle(
            color: AppTheme.text,
            fontSize: 18,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.2,
          ),
        ),
      ],
    );
  }
}

class _ScanCard extends StatelessWidget {
  const _ScanCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppTheme.border),
      ),
      child: child,
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.icon,
    required this.label,
    required this.value,
    this.trailing,
  });

  final IconData icon;
  final String label;
  final String value;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 38,
          height: 38,
          decoration: BoxDecoration(
            color: AppTheme.primary.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, color: AppTheme.primaryDark, size: 19),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(
                  color: AppTheme.textSecondary,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                value,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: AppTheme.text,
                  fontSize: 14,
                  height: 1.3,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
        if (trailing != null) ...[const SizedBox(width: 8), trailing!],
      ],
    );
  }
}

class _DetailDivider extends StatelessWidget {
  const _DetailDivider();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.only(left: 50, top: 14, bottom: 14),
      child: Divider(height: 1, color: AppTheme.border),
    );
  }
}

class _VerificationMark extends StatelessWidget {
  const _VerificationMark({required this.verified});

  final bool verified;

  @override
  Widget build(BuildContext context) {
    return Icon(
      verified ? Icons.check_circle_rounded : Icons.warning_rounded,
      size: 17,
      color: verified ? AppTheme.verified : AppTheme.flagged,
    );
  }
}
