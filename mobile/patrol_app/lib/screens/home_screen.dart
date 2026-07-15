import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/checkpoint.dart';
import '../providers/auth_provider.dart';
import '../providers/duty_provider.dart';
import '../providers/scan_provider.dart';
import '../providers/shift_provider.dart';
import '../services/api_service.dart';
import '../services/location_service.dart';
import '../models/user.dart';
import '../utils/access_control.dart';
import '../utils/routes.dart';
import '../utils/sign_out.dart';
import '../utils/theme.dart';
import '../widgets/scan_tile.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  bool _reportsExpanded = false;
  bool _passOnLogBlockerShown = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ScanProvider>().loadScans();
      context.read<ScanProvider>().loadCheckpoints();
      context.read<ShiftProvider>().loadStatus();
      context.read<DutyProvider>().load();
      _checkPassOnLogs();
    });
  }

  Future<void> _checkPassOnLogs() async {
    if (_passOnLogBlockerShown) return;
    try {
      final pending = await ApiService.checkPendingAcknowledgements();
      if (pending['hasPending'] == true && mounted) {
        _passOnLogBlockerShown = true;
        await _showPassOnLogBlocker();
      }
    } catch (_) {}
  }

  Future<void> _showPassOnLogBlocker() async {
    List<dynamic> logs;
    try {
      logs = await ApiService.getPendingPassOnLogs();
    } catch (_) {
      _passOnLogBlockerShown = false;
      return;
    }
    if (!mounted || logs.isEmpty) {
      _passOnLogBlockerShown = false;
      return;
    }

    var currentIndex = 0;
    var isAcknowledging = false;

    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setInnerState) {
            final log = logs[currentIndex] as Map<String, dynamic>;
            final isLast = currentIndex >= logs.length - 1;

            return AlertDialog(
              title: Row(
                children: [
                  const Icon(
                    Icons.receipt_long_outlined,
                    color: AppTheme.primary,
                  ),
                  const SizedBox(width: 8),
                  Text('Pass-On Log (${currentIndex + 1}/${logs.length})'),
                ],
              ),
              content: SizedBox(
                width: double.maxFinite,
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppTheme.primary.withValues(alpha: 0.06),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: AppTheme.primary.withValues(alpha: 0.15),
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              log['title'] ?? 'Untitled',
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 16,
                                color: AppTheme.text,
                              ),
                            ),
                            if ((log['priority'] ?? '').isNotEmpty) ...[
                              const SizedBox(height: 4),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 3,
                                ),
                                decoration: BoxDecoration(
                                  color: AppTheme.flagged.withValues(
                                    alpha: 0.12,
                                  ),
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: Text(
                                  (log['priority'] as String).toUpperCase(),
                                  style: const TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                    color: AppTheme.flagged,
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(height: 14),
                      const Text(
                        'Instructions',
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        log['instruction'] ??
                            log['description'] ??
                            'No details',
                        style: const TextStyle(
                          color: AppTheme.text,
                          height: 1.5,
                        ),
                      ),
                      if ((log['createdAt'] ?? '').isNotEmpty) ...[
                        const SizedBox(height: 12),
                        Text(
                          'Created: ${log['createdAt']}',
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppTheme.textSecondary,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              actions: [
                TextButton(
                  onPressed: isAcknowledging
                      ? null
                      : () {
                          currentIndex++;
                          if (currentIndex >= logs.length) {
                            _passOnLogBlockerShown = false;
                            Navigator.pop(ctx);
                          } else {
                            setInnerState(() {});
                          }
                        },
                  child: Text(isLast ? 'Skip All' : 'Skip'),
                ),
                FilledButton(
                  onPressed: isAcknowledging
                      ? null
                      : () async {
                          setInnerState(() => isAcknowledging = true);
                          try {
                            await ApiService.acknowledgePassOnLog(
                              log['id'] ?? log['_id'],
                            );
                            if (currentIndex >= logs.length - 1) {
                              _passOnLogBlockerShown = false;
                              if (ctx.mounted) Navigator.pop(ctx);
                            } else {
                              currentIndex++;
                              setInnerState(() => isAcknowledging = false);
                            }
                          } catch (e) {
                            if (ctx.mounted) {
                              setInnerState(() => isAcknowledging = false);
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text(
                                    'Failed: ${e.toString().replaceFirst("Exception: ", "")}',
                                  ),
                                  backgroundColor: AppTheme.flagged,
                                ),
                              );
                            }
                          }
                        },
                  child: isAcknowledging
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(
                          isLast
                              ? 'Acknowledge & Continue'
                              : 'Acknowledge & Next',
                        ),
                ),
              ],
            );
          },
        );
      },
    );
  }

  void _openScannerOrExplain(BuildContext context) {
    if (!canSubmitPatrol(context.read<AuthProvider>().user)) {
      Navigator.pushNamed(context, AppRoutes.patrol);
      return;
    }
    Navigator.pushNamed(context, AppRoutes.scanner);
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    final role = roleForUser(user);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Patrol Command'),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => Navigator.pushNamed(context, AppRoutes.settings),
          ),
        ],
      ),
      drawer: _buildDrawer(context, user, role),
      body: const _DashboardTab(),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _openScannerOrExplain(context),
        backgroundColor: AppTheme.primary,
        child: const Icon(Icons.route_outlined, color: Colors.white),
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
    );
  }

  Widget _buildDrawer(BuildContext context, User? user, AccountRole role) {
    final beforeReports = [
      _MenuItem(
        icon: Icons.login,
        title: 'Clock In / Out',
        onTap: () => Navigator.pop(context),
      ),
      _MenuItem(
        icon: Icons.calendar_month_outlined,
        title: 'View Schedule',
        route: AppRoutes.schedule,
      ),
      _MenuItem(
        icon: Icons.route_outlined,
        title: 'Patrol Tour',
        route: AppRoutes.patrol,
      ),
    ];

    final afterReports = [
      _MenuItem(
        icon: Icons.policy_outlined,
        title: 'Security Policy',
        route: AppRoutes.policy,
      ),
      _MenuItem(
        icon: Icons.local_shipping_outlined,
        title: 'Truck Check In / Out',
        route: AppRoutes.truckCheck,
      ),
      _MenuItem(
        icon: Icons.badge_outlined,
        title: 'Visitor Check In / Out',
        route: AppRoutes.visitorCheck,
      ),
      _MenuItem(
        icon: Icons.event_available_outlined,
        title: 'Vacation Requests',
        route: AppRoutes.vacation,
      ),
      if (role == AccountRole.admin)
        _MenuItem(
          icon: Icons.manage_accounts_outlined,
          title: 'Manage Users',
          route: AppRoutes.users,
        ),
      _MenuItem(
        icon: Icons.logout,
        title: 'Sign Out',
        destructive: true,
        onTap: () {
          Navigator.pop(context);
          signOutAndReturnToLogin(context);
        },
      ),
    ];

    final reportSubItems = [
      {'title': 'Daily Activity Report', 'tab': 0},
      {'title': 'Incident Report', 'tab': 1},
      {'title': 'Parking Violation', 'tab': 2},
      {'title': 'Maintenance Request', 'tab': 3},
      {'title': 'Pass-On Log', 'tab': 4},
    ];

    Widget tile(_MenuItem item) => ListTile(
      leading: Icon(
        item.icon,
        color: item.destructive ? AppTheme.error : AppTheme.primary,
      ),
      title: Text(
        item.title,
        style: TextStyle(
          fontWeight: FontWeight.w700,
          color: item.destructive ? AppTheme.error : AppTheme.text,
        ),
      ),
      onTap:
          item.onTap ??
          () {
            if (item.route != null) {
              Navigator.pop(context);
              Navigator.pushNamed(context, item.route!);
            }
          },
    );

    return Drawer(
      child: SafeArea(
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              color: AppTheme.primary,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CircleAvatar(
                    radius: 24,
                    backgroundColor: Colors.white.withValues(alpha: 0.2),
                    child: const Icon(
                      Icons.shield_outlined,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    user?.name ?? 'Officer',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    role.scopeLabel,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.86),
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
            ...beforeReports.map(tile),
            ListTile(
              leading: const Icon(
                Icons.description_outlined,
                color: AppTheme.primary,
              ),
              title: const Text(
                'Reports',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  color: AppTheme.text,
                ),
              ),
              trailing: Icon(
                _reportsExpanded
                    ? Icons.keyboard_arrow_up
                    : Icons.keyboard_arrow_down,
                color: AppTheme.textSecondary,
              ),
              onTap: () => setState(() => _reportsExpanded = !_reportsExpanded),
            ),
            if (_reportsExpanded)
              ...reportSubItems.map(
                (item) => ListTile(
                  contentPadding: const EdgeInsets.only(left: 72),
                  title: Text(
                    item['title'] as String,
                    style: const TextStyle(
                      fontWeight: FontWeight.w500,
                      color: AppTheme.text,
                      fontSize: 14,
                    ),
                  ),
                  onTap: () {
                    Navigator.pop(context);
                    Navigator.pushNamed(
                      context,
                      AppRoutes.reports,
                      arguments: {'tab': item['tab']},
                    );
                  },
                ),
              ),
            ...afterReports.map(tile),
          ],
        ),
      ),
    );
  }
}

class _DashboardTab extends StatelessWidget {
  const _DashboardTab();

  String _formatHour(DateTime? value) {
    if (value == null) return '--:--';
    return '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';
  }

  String _emergencyResultMessage(
    Map<String, dynamic> result, {
    required bool hasGps,
  }) {
    final delivery = result['delivery'];
    if (delivery is! Map<String, dynamic>) {
      return hasGps
          ? 'Emergency alert dispatched with GPS location.'
          : 'Emergency alert dispatched. GPS was unavailable.';
    }

    final status = delivery['status']?.toString();
    final deliveries = delivery['deliveries'];
    final smsFailures = deliveries is List
        ? deliveries
              .whereType<Map>()
              .where(
                (item) =>
                    item['provider'] == 'termii' && item['success'] != true,
              )
              .toList()
        : const [];

    if (status == 'no_recipients_configured') {
      return 'Emergency recorded, but no emergency contacts are configured.';
    }
    if (smsFailures.isNotEmpty) {
      final error = smsFailures.first['error']?.toString();
      return error == null || error.isEmpty
          ? 'Emergency recorded, but SMS delivery failed.'
          : 'Emergency recorded, but SMS delivery failed: $error';
    }
    if (status == 'failed') {
      return 'Emergency recorded, but contact delivery failed. Check notification settings.';
    }
    if (status == 'partial_failure') {
      return 'Emergency recorded, but some contacts were not notified.';
    }

    return hasGps
        ? 'Emergency alert dispatched with GPS location.'
        : 'Emergency alert dispatched. GPS was unavailable.';
  }

  static const List<Map<String, dynamic>> _emergencyCategories = [
    {'icon': Icons.gavel, 'label': 'Armed Robbery', 'color': Color(0xFFB91C1C)},
    {'icon': Icons.shopping_bag, 'label': 'Theft', 'color': Color(0xFFD97706)},
    {
      'icon': Icons.people,
      'label': 'Fight / Disturbance',
      'color': Color(0xFFDC2626),
    },
    {
      'icon': Icons.local_fire_department,
      'label': 'Fire Outbreak',
      'color': Color(0xFFEF4444),
    },
    {
      'icon': Icons.medical_services,
      'label': 'Medical Emergency',
      'color': Color(0xFF059669),
    },
    {
      'icon': Icons.directions_car,
      'label': 'Suspicious Vehicle',
      'color': Color(0xFF7C3AED),
    },
    {
      'icon': Icons.person_search,
      'label': 'Suspicious Person',
      'color': Color(0xFF2563EB),
    },
    {
      'icon': Icons.power_off,
      'label': 'Power Outage',
      'color': Color(0xFF92400E),
    },
    {
      'icon': Icons.flood,
      'label': 'Flood / Water Leak',
      'color': Color(0xFF0284C7),
    },
    {
      'icon': Icons.lock_open,
      'label': 'Breach / Intrusion',
      'color': Color(0xFFBE123C),
    },
    {'icon': Icons.more_horiz, 'label': 'Other', 'color': Color(0xFF6B7280)},
  ];

  Future<String?> _showEmergencyCategorySheet(BuildContext context) async {
    final customController = TextEditingController();
    final result = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        String? selectedCustom;
        return StatefulBuilder(
          builder: (context, setSheetState) {
            return Padding(
              padding: EdgeInsets.only(
                bottom: MediaQuery.of(context).viewInsets.bottom,
              ),
              child: SizedBox(
                height: MediaQuery.of(context).size.height * 0.65,
                child: Column(
                  children: [
                    Container(
                      margin: const EdgeInsets.only(top: 12),
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: Colors.grey[300],
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                    const Padding(
                      padding: EdgeInsets.fromLTRB(20, 20, 20, 4),
                      child: Text(
                        'Emergency Category',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    const Padding(
                      padding: EdgeInsets.fromLTRB(20, 0, 20, 12),
                      child: Text(
                        'Select the type of emergency',
                        style: TextStyle(fontSize: 14, color: Colors.grey),
                      ),
                    ),
                    Expanded(
                      child: ListView(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        children: [
                          ..._emergencyCategories.map((cat) {
                            final icon = cat['icon'] as IconData;
                            final label = cat['label'] as String;
                            final color = cat['color'] as Color;
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: Material(
                                color: color.withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(14),
                                child: InkWell(
                                  borderRadius: BorderRadius.circular(14),
                                  onTap: () => Navigator.pop(ctx, label),
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 16,
                                      vertical: 14,
                                    ),
                                    child: Row(
                                      children: [
                                        Icon(icon, color: color, size: 22),
                                        const SizedBox(width: 14),
                                        Text(
                                          label,
                                          style: TextStyle(
                                            fontSize: 15,
                                            fontWeight: FontWeight.w600,
                                            color: color,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            );
                          }),
                          const SizedBox(height: 8),
                          TextField(
                            controller: customController,
                            decoration: InputDecoration(
                              hintText: 'Or type a custom reason...',
                              prefixIcon: const Icon(Icons.edit_outlined),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(14),
                              ),
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 14,
                              ),
                            ),
                            onChanged: (v) =>
                                setSheetState(() => selectedCustom = v),
                          ),
                          if ((selectedCustom ?? '').trim().isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: SizedBox(
                                width: double.infinity,
                                child: ElevatedButton(
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: AppTheme.error,
                                    foregroundColor: Colors.white,
                                    padding: const EdgeInsets.symmetric(
                                      vertical: 14,
                                    ),
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(14),
                                    ),
                                  ),
                                  onPressed: () => Navigator.pop(
                                    ctx,
                                    selectedCustom!.trim(),
                                  ),
                                  child: const Text(
                                    'Send Custom Alert',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          const SizedBox(height: 16),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
    customController.dispose();
    return result;
  }

  Future<void> _triggerEmergency(
    BuildContext context, {
    String category = '',
  }) async {
    final messenger = ScaffoldMessenger.of(context);
    final shift = context.read<ShiftProvider>();
    final scanProvider = context.read<ScanProvider>();

    messenger.showSnackBar(
      const SnackBar(
        content: Text(
          'Emergency alert triggered. Getting GPS and notifying response contacts...',
        ),
        duration: Duration(seconds: 3),
        backgroundColor: AppTheme.error,
      ),
    );

    try {
      final location = await LocationService.getCurrentLocation();
      final hasLocation = location.isSuccess;
      final nearestCheckpoint = !hasLocation
          ? null
          : _findNearestCheckpoint(
              scanProvider.checkpoints,
              location.latitude,
              location.longitude,
            );
      final locationText = !hasLocation
          ? ''
          : nearestCheckpoint == null
          ? '${location.latitude.toStringAsFixed(6)}, ${location.longitude.toStringAsFixed(6)}'
          : '${nearestCheckpoint.name} '
                '(${location.latitude.toStringAsFixed(6)}, ${location.longitude.toStringAsFixed(6)})';
      final note = location.error == null
          ? nearestCheckpoint == null
                ? 'Emergency button pressed from mobile patrol app.'
                : 'Emergency button pressed from mobile patrol app near ${nearestCheckpoint.name}.'
          : 'Emergency button pressed from mobile patrol app. GPS note: ${location.error}';

      final result = await ApiService.triggerEmergency(
        checkpointId: nearestCheckpoint?.id,
        siteLabel: shift.siteLabel ?? '',
        category: category,
        note: note,
        location: locationText,
      );

      final message = _emergencyResultMessage(result, hasGps: hasLocation);
      messenger.showSnackBar(
        SnackBar(
          content: Text(message),
          duration: const Duration(seconds: 5),
          backgroundColor:
              message.contains('failed') ||
                  message.contains('not configured') ||
                  message.contains('not notified')
              ? AppTheme.flagged
              : AppTheme.verified,
        ),
      );
    } catch (e) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            'Emergency alert failed: ${e.toString().replaceFirst('Exception: ', '')}',
          ),
          duration: const Duration(seconds: 6),
          backgroundColor: AppTheme.error,
        ),
      );
    }
  }

  Future<void> _confirmEmergencyAction(BuildContext context) async {
    final category = await _showEmergencyCategorySheet(context);
    if (category != null && category.trim().isNotEmpty && context.mounted) {
      await _triggerEmergency(context, category: category);
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
    final auth = context.watch<AuthProvider>();
    final duty = context.watch<DutyProvider>();
    final scan = context.watch<ScanProvider>();
    final shift = context.watch<ShiftProvider>();
    final role = roleForUser(auth.user);

    return RefreshIndicator(
      onRefresh: () async {
        await Future.wait([
          scan.loadScans(force: true),
          scan.loadCheckpoints(force: true),
          shift.loadStatus(force: true),
          duty.load(force: true),
        ]);
      },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Good ${_greeting()}, ${auth.user?.name ?? 'Officer'}',
            style: const TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: AppTheme.text,
            ),
            softWrap: true,
            overflow: TextOverflow.ellipsis,
            maxLines: 2,
          ),
          const SizedBox(height: 4),
          if (shift.onDuty) ...[
            Text(
              '${_formatHour(shift.clockInTime)} - ${_formatHour(shift.scheduledEnd)}',
              style: const TextStyle(
                fontSize: 15,
                color: AppTheme.text,
                fontWeight: FontWeight.w700,
              ),
            ),
            if ((shift.siteLabel ?? '').isNotEmpty)
              Text(
                shift.siteLabel!,
                style: const TextStyle(
                  fontSize: 13,
                  color: AppTheme.primary,
                  fontWeight: FontWeight.w600,
                ),
                softWrap: true,
                overflow: TextOverflow.ellipsis,
              ),
            const SizedBox(height: 8),
          ],
          Row(
            children: [
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: shift.onDuty
                      ? AppTheme.verified
                      : AppTheme.textSecondary,
                ),
              ),
              const SizedBox(width: 6),
              Text(
                shift.onDuty ? 'On Duty' : 'Off Duty',
                style: TextStyle(
                  fontSize: 14,
                  color: shift.onDuty
                      ? AppTheme.verified
                      : AppTheme.textSecondary,
                  fontWeight: FontWeight.w500,
                ),
              ),
              if (shift.clockInTime != null) ...[
                const SizedBox(width: 12),
                Text(
                  'Since ${shift.clockInTime!.hour.toString().padLeft(2, '0')}:${shift.clockInTime!.minute.toString().padLeft(2, '0')}',
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppTheme.textSecondary,
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 20),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Icon(
                    role == AccountRole.admin
                        ? Icons.admin_panel_settings_outlined
                        : role == AccountRole.client
                        ? Icons.business_outlined
                        : Icons.location_city_outlined,
                    color: AppTheme.primary,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          role.label,
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            color: AppTheme.text,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          role.scopeLabel,
                          style: const TextStyle(color: AppTheme.textSecondary),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _StatCard(
                  label: 'Scans Today',
                  value: '${scan.todayScans}',
                  icon: Icons.qr_code,
                  color: AppTheme.primary,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _StatCard(
                  label: 'Post Orders',
                  value: '${duty.orders.length}',
                  icon: Icons.assignment_late_outlined,
                  color: const Color(0xFF3B82F6),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            height: 56,
            child: ElevatedButton.icon(
              onPressed: canSubmitPatrol(auth.user)
                  ? () => context
                        .findAncestorStateOfType<_HomeScreenState>()
                        ?._openScannerOrExplain(context)
                  : () => Navigator.pushNamed(context, AppRoutes.patrol),
              icon: const Icon(Icons.qr_code_scanner, size: 24),
              label: Text(
                canSubmitPatrol(auth.user)
                    ? 'Scan QR Code'
                    : 'View Patrol Tour',
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primary,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
                textStyle: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          _EmergencyHoldButton(
            onConfirmed: () async {
              final cat = await _showEmergencyCategorySheet(context);
              if (cat != null && cat.trim().isNotEmpty && context.mounted) {
                await _triggerEmergency(context, category: cat);
              }
            },
          ),
          const SizedBox(height: 12),
          Column(
            children: [
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton.icon(
                  onPressed: shift.loading
                      ? null
                      : () async {
                          final wasOnDuty = shift.onDuty;
                          final ok = wasOnDuty
                              ? await shift.clockOut()
                              : await shift.clockIn();
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  ok
                                      ? (wasOnDuty
                                            ? 'Clocked out successfully'
                                            : 'Clocked in successfully')
                                      : (shift.error ??
                                            'Action failed. Check your connection and try again.'),
                                ),
                                backgroundColor: ok
                                    ? (wasOnDuty
                                          ? AppTheme.textSecondary
                                          : AppTheme.verified)
                                    : AppTheme.error,
                              ),
                            );
                          }
                        },
                  icon: Icon(
                    shift.onDuty ? Icons.logout : Icons.login,
                    size: 20,
                  ),
                  label: Text(
                    shift.loading
                        ? 'Processing...'
                        : shift.onDuty
                        ? 'Clock Out'
                        : 'Clock In',
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: shift.onDuty
                        ? Colors.orange
                        : AppTheme.verified,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                    textStyle: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
              if (shift.onDuty && shift.clockInGpsValid != null) ...[
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      shift.clockInGpsValid!
                          ? Icons.check_circle
                          : Icons.warning_amber,
                      size: 14,
                      color: shift.clockInGpsValid!
                          ? AppTheme.verified
                          : AppTheme.flagged,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      shift.clockInGpsValid!
                          ? 'Geofence verified'
                          : shift.clockInDistanceMeters != null
                          ? '${shift.clockInDistanceMeters!.toStringAsFixed(0)}m from checkpoint'
                          : 'Outside geofence',
                      style: TextStyle(
                        fontSize: 11,
                        color: shift.clockInGpsValid!
                            ? AppTheme.verified
                            : AppTheme.flagged,
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              _QuickAction(
                icon: Icons.description_outlined,
                label: 'Reports',
                onTap: () => Navigator.pushNamed(context, AppRoutes.reports),
              ),
              const SizedBox(width: 12),
              _QuickAction(
                icon: Icons.assignment_turned_in_outlined,
                label: 'Duties',
                onTap: () => Navigator.pushNamed(context, AppRoutes.duties),
              ),
              const SizedBox(width: 12),
              _QuickAction(
                icon: Icons.history,
                label: 'History',
                onTap: () => Navigator.pushNamed(context, AppRoutes.history),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _QuickAction(
                icon: Icons.location_on_outlined,
                label: 'Checkpoints',
                onTap: () =>
                    Navigator.pushNamed(context, AppRoutes.checkpoints),
              ),
              const SizedBox(width: 12),
              _QuickAction(
                icon: Icons.sos_outlined,
                label: 'Emergency',
                onTap: () => _confirmEmergencyAction(context),
              ),
              const SizedBox(width: 12),
              _QuickAction(
                icon: Icons.person_outline,
                label: 'Profile',
                onTap: () => Navigator.pushNamed(context, AppRoutes.profile),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Recent Activity',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
              ),
              TextButton(
                onPressed: () =>
                    Navigator.pushNamed(context, AppRoutes.history),
                child: const Text('View All'),
              ),
            ],
          ),
          if (scan.scans.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Center(
                child: Text(
                  'No scans yet. Start patrolling!',
                  style: TextStyle(color: AppTheme.textSecondary),
                ),
              ),
            )
          else
            ...scan.scans
                .take(5)
                .map(
                  (s) => ScanTile(
                    scan: s,
                    onTap: () => Navigator.pushNamed(
                      context,
                      AppRoutes.scanDetail,
                      arguments: {'scanId': s.id},
                    ),
                  ),
                ),
        ],
      ),
    );
  }

  String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'morning';
    if (h < 17) return 'afternoon';
    return 'evening';
  }
}

class _MenuItem {
  final IconData icon;
  final String title;
  final String? route;
  final VoidCallback? onTap;
  final bool destructive;

  const _MenuItem({
    required this.icon,
    required this.title,
    this.route,
    this.onTap,
    this.destructive = false,
  });
}

class _EmergencyHoldButton extends StatefulWidget {
  final Future<void> Function() onConfirmed;

  const _EmergencyHoldButton({required this.onConfirmed});

  @override
  State<_EmergencyHoldButton> createState() => _EmergencyHoldButtonState();
}

class _EmergencyHoldButtonState extends State<_EmergencyHoldButton> {
  bool _holding = false;
  bool _sending = false;

  Future<void> _confirmEmergency() async {
    if (_sending) return;
    setState(() => _sending = true);
    try {
      await widget.onConfirmed();
    } finally {
      if (mounted) {
        setState(() {
          _holding = false;
          _sending = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onLongPressStart: (_) => setState(() => _holding = true),
      onLongPressCancel: () => setState(() => _holding = false),
      onLongPressEnd: (_) => _confirmEmergency(),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        decoration: BoxDecoration(
          color: _holding ? const Color(0xFFB91C1C) : AppTheme.error,
          borderRadius: BorderRadius.circular(18),
          boxShadow: [
            BoxShadow(
              color: AppTheme.error.withValues(alpha: 0.32),
              blurRadius: 18,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.18),
                shape: BoxShape.circle,
              ),
              child: _sending
                  ? const Padding(
                      padding: EdgeInsets.all(12),
                      child: CircularProgressIndicator(
                        strokeWidth: 2.4,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.sos, color: Colors.white, size: 26),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _sending ? 'Sending emergency alert...' : 'EMERGENCY ALERT',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.5,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    _sending
                        ? 'Do not close the app.'
                        : 'Press and hold to notify designated contacts.',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.86),
                      fontSize: 12.5,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.touch_app_outlined, color: Colors.white, size: 22),
          ],
        ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  const _StatCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
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
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: color, size: 20),
            ),
            const SizedBox(height: 12),
            Text(
              value,
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
            Text(
              label,
              style: const TextStyle(
                fontSize: 12,
                color: AppTheme.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _QuickAction({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Card(
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: AppTheme.border),
        ),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Column(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppTheme.primary.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(icon, color: AppTheme.primary, size: 24),
                ),
                const SizedBox(height: 8),
                Text(
                  label,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppTheme.textSecondary,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
