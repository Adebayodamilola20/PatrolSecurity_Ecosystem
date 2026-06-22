import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:provider/provider.dart';
import '../models/checkpoint.dart';
import '../models/post_order.dart';
import '../providers/duty_provider.dart';
import '../providers/scan_provider.dart';
import '../services/api_service.dart';
import '../services/location_service.dart';
import '../utils/constants.dart';
import '../utils/routes.dart';
import '../utils/theme.dart';
import 'package:intl/intl.dart';

class ScanResultScreen extends StatefulWidget {
  final Map<String, dynamic>? scanData;
  const ScanResultScreen({super.key, this.scanData});

  @override
  State<ScanResultScreen> createState() => _ScanResultScreenState();
}

class _ScanResultScreenState extends State<ScanResultScreen> {
  bool _loading = true;
  bool _submitting = false;
  bool _success = false;
  bool _acknowledged = false;
  bool _autoSubmitAttempted = false;
  String? _checkpointName;
  double _distance = 0;
  bool _gpsValid = false;
  DateTime _timestamp = DateTime.now();
  Checkpoint? _checkpoint;
  String? _errorMessage;
  String? _scanId;
  final _notesCtrl = TextEditingController();
  bool _postOrdersDialogShown = false;
  bool _passOnLogDialogShown = false;

  @override
  void dispose() {
    _notesCtrl.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _loadCheckpoint();
  }

  List<PostOrder> _matchingOrders(List<PostOrder> orders) {
    if (_checkpoint == null) return const [];
    return orders.where((order) {
      if (!order.active) return false;
      return order.checkpointId == _checkpoint!.id;
    }).toList();
  }

  Future<void> _showPostOrdersDialog(List<PostOrder> orders) async {
    if (!mounted || orders.isEmpty || _postOrdersDialogShown) return;
    _postOrdersDialogShown = true;

    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        var acknowledging = false;
        return StatefulBuilder(
          builder: (context, setInnerState) => AlertDialog(
            title: Text('Post Orders: ${_checkpointName ?? 'Checkpoint'}'),
            content: SizedBox(
              width: double.maxFinite,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: orders.map((order) {
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  order.title,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    color: AppTheme.text,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                order.priority.toUpperCase(),
                                style: const TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: AppTheme.flagged,
                                ),
                              ),
                            ],
                          ),
                          if (order.summary.isNotEmpty) ...[
                            const SizedBox(height: 6),
                            Text(
                              order.summary,
                              style: const TextStyle(
                                color: AppTheme.textSecondary,
                                height: 1.35,
                              ),
                            ),
                          ],
                          if (order.instructions.isNotEmpty) ...[
                            const SizedBox(height: 8),
                            Text(
                              order.instructions,
                              style: const TextStyle(
                                color: AppTheme.text,
                                height: 1.4,
                              ),
                            ),
                          ],
                          if (order != orders.last) const Divider(height: 22),
                        ],
                      ),
                    );
                  }).toList(),
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: acknowledging
                    ? null
                    : () => Navigator.pop(ctx),
                child: const Text('Skip'),
              ),
              FilledButton(
                onPressed: acknowledging
                    ? null
                    : () async {
                        setInnerState(() => acknowledging = true);
                        try {
                          final orderIds = orders.map((o) => o.id).toList();
                          await ApiService.acknowledgeScanPostOrders(
                            scanId: _scanId!,
                            postOrderIds: orderIds,
                          );
                          if (mounted) {
                            setState(() {
                              _acknowledged = true;
                            });
                            if (ctx.mounted) Navigator.pop(ctx);
                          }
                        } catch (e) {
                          if (ctx.mounted) {
                            setInnerState(() => acknowledging = false);
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  'Failed to acknowledge: ${e.toString().replaceFirst("Exception: ", "")}',
                                ),
                                backgroundColor: AppTheme.flagged,
                              ),
                            );
                          }
                        }
                      },
                child: acknowledging
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Acknowledge & Continue'),
              ),
            ],
          ),
        );
      },
    );
  }

  double _haversine(double lat1, double lon1, double lat2, double lon2) {
    const R = 6371000.0;
    final dLat = (lat2 - lat1) * math.pi / 180;
    final dLon = (lon2 - lon1) * math.pi / 180;
    final sinDLat = math.sin(dLat / 2);
    final sinDLon = math.sin(dLon / 2);
    final a =
        sinDLat * sinDLat +
        math.cos(lat1 * math.pi / 180) *
            math.cos(lat2 * math.pi / 180) *
            sinDLon *
            sinDLon;
    final c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
    return R * c;
  }

  Future<void> _loadCheckpoint() async {
    final data = widget.scanData;
    if (data == null) {
      setState(() => _loading = false);
      return;
    }

    final gpsLat = (data['gpsLatitude'] as num?)?.toDouble();
    final gpsLng = (data['gpsLongitude'] as num?)?.toDouble();
    final code = data['checkpointCode'] as String? ?? '';

    final scanProvider = context.read<ScanProvider>();
    final dutyProvider = context.read<DutyProvider>();
    await scanProvider.loadCheckpoints();
    if (dutyProvider.orders.isEmpty && !dutyProvider.loading) {
      await dutyProvider.load();
    }

    Checkpoint? checkpoint;
    try {
      checkpoint = scanProvider.checkpoints.firstWhere(
        (c) => c.id == code || c.code == code,
      );
    } catch (_) {}

    if (checkpoint == null) {
      setState(() {
        _checkpointName = code;
        _errorMessage = scanProvider.error ?? 'Checkpoint not found in API.';
        _loading = false;
      });
      return;
    }

    _checkpoint = checkpoint;
    _checkpointName = checkpoint.name;
    _timestamp = DateTime.now();
    if (gpsLat == null || gpsLng == null) {
      _errorMessage =
          data['locationError'] as String? ??
          'Location unavailable. Enable GPS permission and try again.';
      _gpsValid = false;
    } else {
      _distance = _haversine(
        gpsLat,
        gpsLng,
        checkpoint.latitude,
        checkpoint.longitude,
      );
      final effectiveRadius = math.min(
        checkpoint.radiusMeters,
        strictScanRadiusMeters,
      );
      _gpsValid = _distance <= effectiveRadius;
    }

    setState(() => _loading = false);

    if (gpsLat != null && gpsLng != null && !_autoSubmitAttempted) {
      _autoSubmitAttempted = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _verify();
      });
    }
  }

  Future<void> _retryLocation() async {
    setState(() => _loading = true);
    final location = await LocationService.getCurrentLocation();
    final hasLocation = location.isSuccess;

    if (!mounted) return;
    final updatedData = <String, dynamic>{
      ...?widget.scanData,
      'gpsLatitude': hasLocation ? location.latitude : null,
      'gpsLongitude': hasLocation ? location.longitude : null,
      'locationCaptured': hasLocation,
      'locationError': location.error,
      'timestamp': DateTime.now().toIso8601String(),
    };

    Navigator.pushReplacementNamed(
      context,
      AppRoutes.scanResult,
      arguments: {'scanData': updatedData},
    );
  }

  Future<void> _verify() async {
    if (_checkpoint == null) return;
    if (_submitting || _success) return;
    final data = widget.scanData!;
    final gpsLatValue = data['gpsLatitude'];
    final gpsLngValue = data['gpsLongitude'];
    if (gpsLatValue == null || gpsLngValue == null) {
      setState(() {
        _errorMessage =
            data['locationError'] as String? ??
            'Location unavailable. Verification requires GPS.';
      });
      return;
    }

    setState(() => _submitting = true);
    final gpsLat = (gpsLatValue as num).toDouble();
    final gpsLng = (gpsLngValue as num).toDouble();

    final scanProvider = context.read<ScanProvider>();
    final ok = await scanProvider.submitScan({
      'checkpointId': _checkpoint!.id,
      'gpsLatitude': gpsLat,
      'gpsLongitude': gpsLng,
      'notes': _notesCtrl.text.trim().isEmpty
          ? 'Instant QR scan GPS update'
          : _notesCtrl.text.trim(),
    });

    if (!mounted) return;
    setState(() {
      _success = ok;
      _errorMessage = ok ? null : scanProvider.error;
      _submitting = false;
      _scanId = ok ? scanProvider.lastScan?.id : null;
    });

    if (ok && _scanId != null) {
      final dutyProvider = context.read<DutyProvider>();
      final matchingOrders = _matchingOrders(dutyProvider.orders)
          .where((o) => o.requiresAcknowledgement)
          .toList();
      if (matchingOrders.isNotEmpty) {
        await _showPostOrdersDialog(matchingOrders);
      }
    }
  }

  Future<void> _reportIncident(BuildContext context) async {
    final titleCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    final result = await showDialog<Map<String, String>>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Report Incident'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: titleCtrl,
              decoration: const InputDecoration(
                labelText: 'Title *',
                hintText: 'e.g. Suspicious activity',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: descCtrl,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Description',
                hintText: 'Describe what happened...',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              if (titleCtrl.text.trim().isEmpty) return;
              Navigator.pop(ctx, {
                'title': titleCtrl.text.trim(),
                'description': descCtrl.text.trim(),
              });
            },
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade700),
            child: const Text('Submit'),
          ),
        ],
      ),
    );

    if (result == null) return;
    if (!context.mounted) return;

    try {
      final incident = await ApiService.reportIncident(
        title: result['title']!,
        description: result['description'] ?? '',
        checkpointId: _checkpoint?.id,
      );
      if (context.mounted) {
        final reportedAt =
            DateTime.tryParse(incident['reportedAt']?.toString() ?? '') ??
            DateTime.now();
        final formattedTime = DateFormat(
          'MMM d, yyyy  h:mm a',
        ).format(reportedAt);

        await showDialog<void>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Incident Sent'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  incident['title']?.toString() ?? result['title']!,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    color: AppTheme.text,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  incident['description']?.toString().isNotEmpty == true
                      ? incident['description'].toString()
                      : 'The control room can now review this incident report.',
                  style: const TextStyle(
                    color: AppTheme.textSecondary,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 12),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppTheme.surface,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppTheme.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Severity: ${(incident['severity'] ?? 'low').toString()}',
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Checkpoint: ${_checkpointName ?? 'Unknown checkpoint'}',
                      ),
                      const SizedBox(height: 4),
                      Text('Reported: $formattedTime'),
                    ],
                  ),
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Dismiss'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Continue Patrol'),
              ),
            ],
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to report: $e'),
            backgroundColor: AppTheme.error,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final duty = context.watch<DutyProvider>();
    final matchingOrders = _matchingOrders(duty.orders);

    if (_loading) {
      return Scaffold(
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircularProgressIndicator(color: AppTheme.primary),
              const SizedBox(height: 16),
              const Text(
                'Capturing GPS and starting patrol scan...',
                style: TextStyle(color: AppTheme.textSecondary, fontSize: 16),
              ),
            ],
          ),
        ),
      );
    }

    if (_success) {
      return Scaffold(
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              children: [
                const Spacer(),
                const Icon(
                  Icons.check_circle_outline,
                  size: 80,
                  color: AppTheme.verified,
                ),
                const SizedBox(height: 16),
                const Text(
                  'Scan Verified!',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.verified,
                  ),
                ),
                if (_acknowledged) ...[
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: AppTheme.verified.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: const Text(
                      'Post Orders Acknowledged',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.verified,
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 24),
                _InfoRow(
                  icon: Icons.location_on,
                  label: 'Checkpoint',
                  value: _checkpointName ?? 'Unknown',
                ),
                const SizedBox(height: 8),
                _InfoRow(
                  icon: Icons.access_time,
                  label: 'Time',
                  value: DateFormat('MMM d, yyyy – h:mm a').format(_timestamp),
                ),
                const SizedBox(height: 8),
                _InfoRow(
                  icon: Icons.my_location,
                  label: 'Distance',
                  value: '${_distance.toStringAsFixed(0)}m from checkpoint',
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Icon(
                      _gpsValid ? Icons.check_circle : Icons.warning_amber,
                      size: 20,
                      color: _gpsValid ? AppTheme.verified : AppTheme.flagged,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      _gpsValid ? 'GPS Verified' : 'GPS Mismatch',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: _gpsValid ? AppTheme.verified : AppTheme.flagged,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: OutlinedButton.icon(
                    onPressed: () => _reportIncident(context),
                    icon: const Icon(Icons.warning_amber_rounded, size: 20),
                    label: const Text(
                      'Report Incident at this Checkpoint',
                      overflow: TextOverflow.ellipsis,
                    ),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.red.shade700,
                      side: BorderSide(color: Colors.red.shade700),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                  ),
                ),
                const Spacer(),
                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: ElevatedButton(
                    onPressed: () => Navigator.pushNamedAndRemoveUntil(
                      context,
                      AppRoutes.scanner,
                      (route) => route.settings.name == AppRoutes.home,
                    ),
                    child: const Text('Scan Next'),
                  ),
                ),
                const SizedBox(height: 12),
                TextButton(
                  onPressed: () => Navigator.pushNamedAndRemoveUntil(
                    context,
                    AppRoutes.home,
                    (_) => false,
                  ),
                  child: const Text('Back to Home'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Scan Status')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AppTheme.primary.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                children: [
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: AppTheme.primary.withValues(alpha: 0.15),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.qr_code,
                      size: 40,
                      color: AppTheme.primary,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    _checkpointName ?? 'Unknown Checkpoint',
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.text,
                    ),
                    textAlign: TextAlign.center,
                    softWrap: true,
                    overflow: TextOverflow.ellipsis,
                  ), 
                  if (_checkpoint != null)
                    Text(
                      'Code: ${_checkpoint!.code}',
                      style: const TextStyle(
                        fontSize: 14,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                ],
              ),
            ),
            SizedBox(height: 20,),
            Card(
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
                side: BorderSide(color: AppTheme.border),
              ),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    _DetailRow(
                      label: 'Latitude',
                      value:
                          widget.scanData?['gpsLatitude']?.toString() ??
                          'Unavailable',
                    ),
                    const Divider(height: 16),
                    _DetailRow(
                      label: 'Longitude',
                      value:
                          widget.scanData?['gpsLongitude']?.toString() ??
                          'Unavailable',
                    ),
                    const Divider(height: 16),
                    _DetailRow(
                      label: 'Distance',
                      value: widget.scanData?['gpsLatitude'] == null
                          ? 'Unavailable'
                          : '${_distance.toStringAsFixed(0)}m',
                    ),
                    const Divider(height: 16),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Status',
                          style: TextStyle(color: AppTheme.textSecondary),
                        ),
                        Row(
                          children: [
                            Icon(
                              widget.scanData?['gpsLatitude'] == null
                                  ? Icons.location_off
                                  : _gpsValid
                                  ? Icons.check_circle
                                  : Icons.warning_amber,
                              size: 16,
                              color: widget.scanData?['gpsLatitude'] == null
                                  ? Colors.orange
                                  : _gpsValid
                                  ? AppTheme.verified
                                  : AppTheme.flagged,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              widget.scanData?['gpsLatitude'] == null
                                  ? 'Location Required'
                                  : _gpsValid
                                  ? 'Within Range'
                                  : 'Outside ${strictScanRadiusMeters.toStringAsFixed(0)}m Limit',
                              style: TextStyle(
                                color: widget.scanData?['gpsLatitude'] == null
                                    ? Colors.orange
                                    : _gpsValid
                                    ? AppTheme.verified
                                    : AppTheme.flagged,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                    if (widget.scanData?['gpsLatitude'] != null &&
                        !_gpsValid) ...[
                      const Divider(height: 16),
                      const Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          'Policy: scans must happen within 10 metres of the assigned facility checkpoint.',
                          style: TextStyle(
                            fontSize: 12,
                            color: AppTheme.textSecondary,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            if (matchingOrders.isNotEmpty) ...[
              const SizedBox(height: 16),
              Card(
                elevation: 0,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: BorderSide(color: AppTheme.border),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Post Orders For This Tour Stop',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.text,
                        ),
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        'Read these instructions before completing the patrol scan.',
                        style: TextStyle(
                          color: AppTheme.textSecondary,
                          height: 1.4,
                        ),
                      ),
                      const SizedBox(height: 14),
                      ...matchingOrders.map(
                        (order) => Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              color: AppTheme.primary.withValues(alpha: 0.06),
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(
                                color: AppTheme.primary.withValues(alpha: 0.15),
                              ),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        order.title,
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w700,
                                          color: AppTheme.text,
                                        ),
                                      ),
                                    ),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 8,
                                        vertical: 4,
                                      ),
                                      decoration: BoxDecoration(
                                        color: AppTheme.flagged.withValues(
                                          alpha: 0.12,
                                        ),
                                        borderRadius: BorderRadius.circular(
                                          999,
                                        ),
                                      ),
                                      child: Text(
                                        order.priority.toUpperCase(),
                                        style: const TextStyle(
                                          fontSize: 10,
                                          fontWeight: FontWeight.w700,
                                          color: AppTheme.flagged,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                if (order.summary.isNotEmpty) ...[
                                  const SizedBox(height: 8),
                                  Text(
                                    order.summary,
                                    style: const TextStyle(
                                      color: AppTheme.textSecondary,
                                      height: 1.4,
                                    ),
                                  ),
                                ],
                                const SizedBox(height: 8),
                                Text(
                                  order.instructions,
                                  style: const TextStyle(
                                    color: AppTheme.text,
                                    height: 1.5,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
            if (_errorMessage != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.orange.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: Colors.orange.withValues(alpha: 0.25),
                  ),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(
                      Icons.info_outline,
                      color: Colors.orange,
                      size: 18,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _errorMessage!,
                        style: const TextStyle(
                          color: AppTheme.text,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _retryLocation,
                      icon: const Icon(Icons.my_location),
                      label: const Text('Retry GPS'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: Geolocator.openAppSettings,
                      icon: const Icon(Icons.settings),
                      label: const Text('App Settings'),
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.primary.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: AppTheme.primary.withValues(alpha: 0.2),
                ),
              ),
              child: Row(
                children: [
                  _submitting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(
                          Icons.flash_on,
                          color: AppTheme.primary,
                          size: 20,
                        ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      _submitting
                          ? 'Submitting scan immediately...'
                          : widget.scanData?['gpsLatitude'] == null
                          ? 'GPS is required before this scan can start.'
                          : 'Scan starts automatically as soon as GPS is captured.',
                      style: const TextStyle(
                        color: AppTheme.text,
                        fontSize: 13,
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton.icon(
                onPressed:
                    _submitting ||
                        _checkpoint == null ||
                        widget.scanData?['gpsLatitude'] == null ||
                        widget.scanData?['gpsLongitude'] == null
                    ? null
                    : _verify,
                icon: _submitting
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.verified),
                label: Text(_submitting ? 'Submitting...' : 'Submit Scan Now'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.verified,
                  foregroundColor: Colors.white,
                  textStyle: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _InfoRow({
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

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;
  const _DetailRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(color: AppTheme.textSecondary)),
        Flexible(
          child: Text(
            value,
            style: const TextStyle(
              fontWeight: FontWeight.w600,
              color: AppTheme.text,
            ),
            softWrap: true,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.end,
          ),
        ),
      ],
    );
  }
}
