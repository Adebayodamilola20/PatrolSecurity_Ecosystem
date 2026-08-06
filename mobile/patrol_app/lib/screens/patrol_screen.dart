import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/checkpoint.dart';
import '../providers/auth_provider.dart';
import '../providers/scan_provider.dart';
import '../providers/shift_provider.dart';
import '../services/api_service.dart';
import '../services/location_service.dart';
import '../utils/routes.dart';
import '../utils/theme.dart';

class PatrolScreen extends StatefulWidget {
  const PatrolScreen({super.key});

  @override
  State<PatrolScreen> createState() => _PatrolScreenState();
}

class _PatrolScreenState extends State<PatrolScreen> {
  bool _flashlight = false;
  bool _gpsAvailable = false;
  bool _internetAvailable = false;
  bool _checkingStatus = true;
  bool _sendingEmergency = false;

  static const List<Map<String, dynamic>> _emergencyTypes = [
    {
      'label': 'Armed Attack',
      'icon': Icons.security,
      'color': Color(0xFFB91C1C),
    },
    {
      'label': 'Medical Emergency',
      'icon': Icons.medical_services,
      'color': Color(0xFF059669),
    },
    {
      'label': 'Fire Emergency',
      'icon': Icons.local_fire_department,
      'color': Color(0xFFEF4444),
    },
    {'label': 'Theft', 'icon': Icons.shopping_bag, 'color': Color(0xFFD97706)},
    {
      'label': 'Suspicious Activity',
      'icon': Icons.person_search,
      'color': Color(0xFF2563EB),
    },
    {
      'label': 'Violence',
      'icon': Icons.warning_amber_rounded,
      'color': Color(0xFFDC2626),
    },
    {
      'label': 'Other Emergency',
      'icon': Icons.more_horiz,
      'color': Color(0xFF6B7280),
    },
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ScanProvider>().loadScans();
      context.read<ScanProvider>().loadCheckpoints();
      context.read<ShiftProvider>().loadStatus();
      _refreshStatus();
    });
  }

  Future<void> _refreshStatus() async {
    setState(() => _checkingStatus = true);
    final location = await LocationService.getCurrentLocation();
    var internet = false;
    try {
      final result = await InternetAddress.lookup(
        'example.com',
      ).timeout(const Duration(seconds: 4));
      internet = result.isNotEmpty && result.first.rawAddress.isNotEmpty;
    } catch (_) {
      internet = false;
    }
    if (!mounted) return;
    setState(() {
      _gpsAvailable = location.isSuccess;
      _internetAvailable = internet;
      _checkingStatus = false;
    });
  }

  Future<void> _showEmergencySheet() async {
    final category = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          children: [
            const Text(
              'Emergency Type',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 12),
            ..._emergencyTypes.map((item) {
              final color = item['color'] as Color;
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Material(
                  color: color.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(14),
                  child: ListTile(
                    leading: Icon(item['icon'] as IconData, color: color),
                    title: Text(
                      item['label'] as String,
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: color,
                      ),
                    ),
                    onTap: () => Navigator.pop(ctx, item['label'] as String),
                  ),
                ),
              );
            }),
          ],
        ),
      ),
    );
    if (category != null && mounted) {
      await _sendEmergency(category);
    }
  }

  Future<void> _sendEmergency(String category) async {
    if (_sendingEmergency) return;
    setState(() => _sendingEmergency = true);

    final messenger = ScaffoldMessenger.of(context);
    final shift = context.read<ShiftProvider>();
    final scanProvider = context.read<ScanProvider>();
    final officer =
        context.read<AuthProvider>().user?.name ?? 'Unknown officer';

    try {
      final location = await LocationService.getCurrentLocation();
      final nearest = location.isSuccess
          ? _findNearestCheckpoint(
              scanProvider.checkpoints,
              location.latitude,
              location.longitude,
            )
          : null;
      final locationText = location.isSuccess
          ? '${location.latitude.toStringAsFixed(6)}, ${location.longitude.toStringAsFixed(6)}'
          : 'GPS unavailable';
      final timestamp = DateTime.now().toIso8601String();

      await ApiService.triggerEmergency(
        checkpointId: nearest?.id,
        siteLabel: shift.siteLabel ?? '',
        category: category,
        location: locationText,
        note:
            'Emergency submitted by $officer at $timestamp. Dashboard notification requested.',
      );

      messenger.showSnackBar(
        SnackBar(
          content: Text(
            'Emergency submitted with officer, timestamp, and GPS status.',
          ),
          backgroundColor: AppTheme.verified,
        ),
      );
    } catch (e) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(e.toString().replaceFirst('Exception: ', '')),
          backgroundColor: AppTheme.error,
        ),
      );
    } finally {
      if (mounted) setState(() => _sendingEmergency = false);
    }
  }

  Checkpoint? _findNearestCheckpoint(
    List<Checkpoint> checkpoints,
    double latitude,
    double longitude,
  ) {
    Checkpoint? nearest;
    double? nearestDistance;
    for (final checkpoint in checkpoints) {
      if (checkpoint.latitude == null || checkpoint.longitude == null) {
        continue; // sub-location QR with no own coordinates
      }
      final distance = LocationService.calculateDistance(
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
    return nearest;
  }

  @override
  Widget build(BuildContext context) {
    final scan = context.watch<ScanProvider>();
    final shift = context.watch<ShiftProvider>();
    final lastScan =
        scan.lastScan ?? (scan.scans.isNotEmpty ? scan.scans.first : null);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Patrol Tour'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _refreshStatus,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await Future.wait([
            scan.loadScans(force: true),
            scan.loadCheckpoints(force: true),
            shift.loadStatus(force: true),
          ]);
          await _refreshStatus();
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _PatrolSummaryCard(
              siteLabel: shift.siteLabel,
              lastTime: lastScan?.formattedTime ?? '--:--',
              lastLocation:
                  lastScan?.checkpointName ?? 'No patrol scan recorded',
              lastDate: lastScan?.formattedDate ?? 'Pending first scan',
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: _StatusCard(
                    label: 'GPS Status',
                    value: _checkingStatus
                        ? 'Checking'
                        : _gpsAvailable
                        ? 'Available'
                        : 'Unavailable',
                    icon: Icons.my_location,
                    active: _gpsAvailable,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _StatusCard(
                    label: 'Connection',
                    value: _checkingStatus
                        ? 'Checking'
                        : _internetAvailable
                        ? 'Online'
                        : 'Offline',
                    icon: Icons.wifi,
                    active: _internetAvailable,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Card(
              child: SwitchListTile(
                value: _flashlight,
                onChanged: (value) => setState(() => _flashlight = value),
                secondary: Icon(
                  _flashlight ? Icons.flash_on : Icons.flash_off,
                  color: _flashlight
                      ? AppTheme.flagged
                      : AppTheme.textSecondary,
                ),
                title: const Text('Flashlight Toggle'),
                subtitle: const Text(
                  'Scanner uses the camera torch when available.',
                ),
              ),
            ),
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: () => Navigator.pushNamed(context, AppRoutes.scanner),
              icon: const Icon(Icons.qr_code_scanner),
              label: const Text('Scan QR Code'),
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: () => Navigator.pushNamed(context, AppRoutes.history),
              icon: const Icon(Icons.history),
              label: const Text('Previous Scans'),
            ),
            const SizedBox(height: 10),
            FilledButton.icon(
              onPressed: _sendingEmergency ? null : _showEmergencySheet,
              icon: _sendingEmergency
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.sos),
              label: Text(
                _sendingEmergency
                    ? 'Submitting Emergency...'
                    : 'Emergency Button',
              ),
              style: FilledButton.styleFrom(
                backgroundColor: AppTheme.error,
                foregroundColor: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PatrolSummaryCard extends StatelessWidget {
  final String? siteLabel;
  final String lastTime;
  final String lastLocation;
  final String lastDate;

  const _PatrolSummaryCard({
    required this.siteLabel,
    required this.lastTime,
    required this.lastLocation,
    required this.lastDate,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Last Patrol Information',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: AppTheme.text,
              ),
            ),
            const SizedBox(height: 12),
            _InfoRow(
              label: 'Site',
              value: (siteLabel ?? '').isEmpty ? 'No active site' : siteLabel!,
            ),
            _InfoRow(label: 'Last Scan Time', value: lastTime),
            _InfoRow(label: 'Last Scan Location', value: lastLocation),
            _InfoRow(label: 'Last Scan Date', value: lastDate),
          ],
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;

  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 130,
            child: Text(
              label,
              style: TextStyle(color: AppTheme.textSecondary),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                fontWeight: FontWeight.w700,
                color: AppTheme.text,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final bool active;

  const _StatusCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.active,
  });

  @override
  Widget build(BuildContext context) {
    final color = active ? AppTheme.verified : AppTheme.flagged;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color),
            const SizedBox(height: 10),
            Text(
              value,
              style: TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 16,
                color: color,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                color: AppTheme.textSecondary,
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
