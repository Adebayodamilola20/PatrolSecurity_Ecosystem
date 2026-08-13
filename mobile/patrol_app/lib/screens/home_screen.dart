import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/checkpoint.dart';
import '../models/scan.dart';
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
import '../widgets/duty_prompts.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  bool _reportsExpanded = false;
  bool _passOnLogBlockerShown = false;

  // Live emergencies at the sites this guard is posted to — including ones
  // the client raised, which is the whole reason for polling: nobody presses
  // refresh while a break-in is in progress.
  List<Map<String, dynamic>> _emergencies = [];
  final Set<String> _announcedEmergencies = {};
  Timer? _emergencyTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ScanProvider>().loadScans();
      context.read<ScanProvider>().loadCheckpoints();
      context.read<ShiftProvider>().loadStatus();
      context.read<DutyProvider>().load();
      _checkPassOnLogs();
      _pollEmergencies();
      // Ask for location the moment the guard lands in the app, not at the
      // first clock-in. Clock-in is refused without a fix, and discovering
      // that while standing at a gate at the start of a shift is the worst
      // possible moment to be sent into Android settings.
      unawaited(LocationService.getCurrentLocation());
    });
    _emergencyTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => _pollEmergencies(),
    );
  }

  @override
  void dispose() {
    _emergencyTimer?.cancel();
    super.dispose();
  }

  Future<void> _pollEmergencies() async {
    try {
      final alerts = await ApiService.fetchMyEmergencies();
      if (!mounted) return;
      setState(() => _emergencies = alerts);
      // Announce each alert once. Re-showing the same dialog every 30 seconds
      // would make it impossible to use the app during the emergency it is
      // warning about.
      for (final alert in alerts) {
        final id = alert['id'] as String? ?? '';
        if (id.isEmpty || _announcedEmergencies.contains(id)) continue;
        _announcedEmergencies.add(id);
        if (mounted) await _showEmergencyDialog(alert);
      }
    } catch (_) {
      // Offline or a transient failure: the banner keeps whatever it had
      // rather than blanking, and the next tick tries again.
    }
  }

  /// Deliberately nothing like the ordinary dialogs in this app: full red,
  /// its own words, and it does not dismiss by tapping outside.
  Future<void> _showEmergencyDialog(Map<String, dynamic> alert) async {
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.flagged,
        title: const Row(
          children: [
            Icon(Icons.warning_amber_rounded, color: Colors.white),
            SizedBox(width: 8),
            Expanded(
              child: Text(
                'CODE RED',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1.2,
                ),
              ),
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              alert['message'] as String? ?? 'Emergency alert',
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              'Reason: ${alert['reason'] ?? 'Not stated'}',
              style: const TextStyle(color: Colors.white),
            ),
            const SizedBox(height: 6),
            Text(
              [
                alert['checkpointName'] ?? alert['siteName'] ?? '',
                if ((alert['source'] as String? ?? '') == 'client')
                  'Raised by the client',
              ].where((part) => (part as String).isNotEmpty).join(' · '),
              style: const TextStyle(color: Colors.white70, fontSize: 12),
            ),
          ],
        ),
        actions: [
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Colors.white,
              foregroundColor: AppTheme.flagged,
            ),
            onPressed: () => Navigator.pop(ctx),
            child: const Text('I am responding'),
          ),
        ],
      ),
    );
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
                  Icon(
                    Icons.receipt_long_outlined,
                    color: AppTheme.primary,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Pass-On Log (${currentIndex + 1}/${logs.length})',
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
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
                              style: TextStyle(
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
                                  style: TextStyle(
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
                      Text(
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
                        style: TextStyle(
                          color: AppTheme.text,
                          height: 1.5,
                        ),
                      ),
                      if ((log['createdAt'] ?? '').isNotEmpty) ...[
                        const SizedBox(height: 12),
                        Text(
                          'Created: ${log['createdAt']}',
                          style: TextStyle(
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
    // Answer here instead of walking the officer to the scanner just to turn
    // them away. The scanner re-checks on arrival for anything that reaches it
    // another way, and the server refuses off-duty scans regardless.
    if (!context.read<ShiftProvider>().onDuty) {
      showClockInRequired(context);
      return;
    }
    Navigator.pushNamed(context, AppRoutes.scanner);
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    final role = roleForUser(user);

    return Scaffold(
      backgroundColor: AppTheme.surface,
      appBar: AppBar(
        title: const Text('Dashboard'),
        backgroundColor: AppTheme.card,
        surfaceTintColor: Colors.transparent,
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => Navigator.pushNamed(context, AppRoutes.settings),
          ),
        ],
      ),
      drawer: _buildDrawer(context, user, role),
      body: Column(
        children: [
          // Stays on screen for as long as the alert is live, so a guard who
          // dismissed the popup still has it in front of them.
          if (_emergencies.isNotEmpty)
            Material(
              color: AppTheme.flagged,
              child: InkWell(
                onTap: () => _showEmergencyDialog(_emergencies.first),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 12,
                  ),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.warning_amber_rounded,
                        color: Colors.white,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _emergencies.length == 1
                                  ? 'CODE RED — EMERGENCY ALERT'
                                  : 'CODE RED — ${_emergencies.length} EMERGENCY ALERTS',
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 0.8,
                              ),
                            ),
                            Text(
                              _emergencies.first['reason'] as String? ?? '',
                              style: const TextStyle(
                                color: Colors.white70,
                                fontSize: 12,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          const Expanded(child: _DashboardTab()),
        ],
      ),
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
              leading: Icon(
                Icons.description_outlined,
                color: AppTheme.primary,
              ),
              title: Text(
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
                    style: TextStyle(
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
                        color: AppTheme.border,
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
                    Padding(
                      padding: EdgeInsets.fromLTRB(20, 0, 20, 12),
                      child: Text(
                        'Select the type of emergency',
                        style: TextStyle(fontSize: 14, color: AppTheme.textSecondary),
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
      SnackBar(
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

    return _buildModernDashboard(context, auth, duty, scan, shift, role);
  }

  Widget _buildModernDashboard(
    BuildContext context,
    AuthProvider auth,
    DutyProvider duty,
    ScanProvider scan,
    ShiftProvider shift,
    AccountRole role,
  ) {
    final canPatrol = canSubmitPatrol(auth.user);

    return RefreshIndicator(
      color: AppTheme.primaryDark,
      backgroundColor: AppTheme.card,
      onRefresh: () async {
        await Future.wait([
          scan.loadScans(force: true),
          scan.loadCheckpoints(force: true),
          shift.loadStatus(force: true),
          duty.load(force: true),
        ]);
      },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 112),
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Good ${_greeting()},',
                      style: TextStyle(
                        color: AppTheme.textSecondary,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      auth.user?.name ?? 'Officer',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: AppTheme.text,
                        fontSize: 27,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.7,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      '${role.label} · ${role.scopeLabel}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: AppTheme.primaryDark,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: AppTheme.primary.withValues(alpha: 0.13),
                  borderRadius: BorderRadius.circular(15),
                ),
                child: Icon(
                  role == AccountRole.admin
                      ? Icons.admin_panel_settings_outlined
                      : role == AccountRole.client
                      ? Icons.business_outlined
                      : Icons.location_city_outlined,
                  color: AppTheme.primaryDark,
                  size: 23,
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          _ShiftOverviewCard(
            onDuty: shift.onDuty,
            time:
                '${_formatHour(shift.clockInTime)} - ${_formatHour(shift.scheduledEnd)}',
            siteLabel: shift.siteLabel,
            clockInTime: shift.clockInTime,
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _StatCard(
                  label: 'Scans today',
                  value: '${scan.todayScans}',
                  icon: Icons.qr_code_rounded,
                  color: AppTheme.primary,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _StatCard(
                  label: 'Post orders',
                  value: '${duty.orders.length}',
                  icon: Icons.assignment_late_outlined,
                  color: const Color(0xFF3B82F6),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          const _SectionLabel(
            eyebrow: 'QUICK START',
            title: 'Keep your patrol moving',
          ),
          const SizedBox(height: 12),
          _PrimaryPatrolAction(
            enabled: canPatrol,
            onTap: () => context
                .findAncestorStateOfType<_HomeScreenState>()
                ?._openScannerOrExplain(context),
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
          _ShiftControlCard(
            onDuty: shift.onDuty,
            loading: shift.loading,
            gpsValid: shift.clockInGpsValid,
            distanceMeters: shift.clockInDistanceMeters,
            onTap: shift.loading
                ? null
                : () => handleDutyToggle(context),
          ),
          const SizedBox(height: 24),
          const _SectionLabel(
            eyebrow: 'SHORTCUTS',
            title: 'Everything within reach',
          ),
          const SizedBox(height: 12),
          GridView.count(
            crossAxisCount: 3,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisSpacing: 10,
            mainAxisSpacing: 10,
            childAspectRatio: 1.08,
            children: [
              _QuickAction(
                icon: Icons.description_outlined,
                label: 'Reports',
                onTap: () => Navigator.pushNamed(context, AppRoutes.reports),
              ),
              _QuickAction(
                icon: Icons.assignment_turned_in_outlined,
                label: 'Duties',
                onTap: () => Navigator.pushNamed(context, AppRoutes.duties),
              ),
              _QuickAction(
                icon: Icons.history,
                label: 'History',
                onTap: () => Navigator.pushNamed(context, AppRoutes.history),
              ),
              _QuickAction(
                icon: Icons.location_on_outlined,
                label: 'Checkpoints',
                onTap: () =>
                    Navigator.pushNamed(context, AppRoutes.checkpoints),
              ),
              _QuickAction(
                icon: Icons.sos_outlined,
                label: 'Emergency',
                onTap: () => _confirmEmergencyAction(context),
              ),
              _QuickAction(
                icon: Icons.person_outline,
                label: 'Profile',
                onTap: () => Navigator.pushNamed(context, AppRoutes.profile),
              ),
            ],
          ),
          const SizedBox(height: 26),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              const Expanded(
                child: _SectionLabel(
                  eyebrow: 'LATEST',
                  title: 'Recent activity',
                ),
              ),
              TextButton(
                onPressed: () =>
                    Navigator.pushNamed(context, AppRoutes.history),
                style: TextButton.styleFrom(
                  foregroundColor: AppTheme.primaryDark,
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                ),
                child: const Text(
                  'View all',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
          if (scan.scans.isEmpty)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.only(top: 12),
              padding: const EdgeInsets.symmetric(vertical: 28),
              decoration: BoxDecoration(
                color: AppTheme.card,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: AppTheme.border),
              ),
              child: Column(
                children: [
                  Icon(
                    Icons.history_toggle_off_rounded,
                    color: AppTheme.textSecondary.withValues(alpha: 0.65),
                    size: 30,
                  ),
                  const SizedBox(height: 9),
                  Text(
                    'No scans yet',
                    style: TextStyle(
                      color: AppTheme.text,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    'Start a patrol to see activity here.',
                    style: TextStyle(
                      color: AppTheme.textSecondary,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            )
          else
            ...scan.scans
                .take(5)
                .map(
                  (s) => _DashboardScanTile(
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

class _ShiftOverviewCard extends StatelessWidget {
  const _ShiftOverviewCard({
    required this.onDuty,
    required this.time,
    required this.siteLabel,
    required this.clockInTime,
  });

  final bool onDuty;
  final String time;
  final String? siteLabel;
  final DateTime? clockInTime;

  @override
  Widget build(BuildContext context) {
    final foreground = onDuty ? Colors.white : AppTheme.text;
    final muted = onDuty
        ? Colors.white.withValues(alpha: 0.68)
        : AppTheme.textSecondary;
    final accent = onDuty ? AppTheme.primary : AppTheme.primaryDark;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: onDuty ? AppTheme.onboardingInk : AppTheme.card,
        borderRadius: BorderRadius.circular(20),
        border: onDuty ? null : Border.all(color: AppTheme.border),
        boxShadow: onDuty
            ? [
                BoxShadow(
                  color: AppTheme.onboardingInk.withValues(alpha: 0.16),
                  blurRadius: 18,
                  offset: const Offset(0, 9),
                ),
              ]
            : null,
      ),
      child: Row(
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: onDuty
                  ? Colors.white.withValues(alpha: 0.12)
                  : AppTheme.primary.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(15),
            ),
            child: Icon(
              onDuty ? Icons.shield_rounded : Icons.schedule_outlined,
              color: accent,
              size: 24,
            ),
          ),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  onDuty ? 'CURRENT SHIFT' : 'SHIFT STATUS',
                  style: TextStyle(
                    color: muted,
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.2,
                  ),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: onDuty ? accent : AppTheme.textSecondary,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 7),
                    Flexible(
                      child: Text(
                        onDuty ? 'On duty' : 'Off duty',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: foreground,
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ],
                ),
                if (onDuty && (siteLabel ?? '').isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    siteLabel!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: muted,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 10),
          // Flexible, not a bare Column: the elapsed-time label grows with the
          // shift and would otherwise squeeze the status column off-screen.
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  onDuty ? time : 'Ready',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: foreground,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                if (onDuty && clockInTime != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    'Since ${clockInTime!.hour.toString().padLeft(2, '0')}:${clockInTime!.minute.toString().padLeft(2, '0')}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: muted, fontSize: 10),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PrimaryPatrolAction extends StatelessWidget {
  const _PrimaryPatrolAction({required this.enabled, required this.onTap});

  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppTheme.onboardingInk,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Padding(
          padding: const EdgeInsets.all(17),
          child: Row(
            children: [
              Container(
                width: 50,
                height: 50,
                decoration: BoxDecoration(
                  color: AppTheme.primary,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Icon(
                  enabled ? Icons.qr_code_scanner_rounded : Icons.route_rounded,
                  color: AppTheme.onboardingInk,
                  size: 26,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      enabled ? 'Start a patrol' : 'Review patrol tour',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      enabled
                          ? 'Scan a checkpoint QR code to check in.'
                          : 'Review the assigned route for this account.',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.68),
                        fontSize: 12,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Icon(
                Icons.arrow_forward_rounded,
                color: Colors.white,
                size: 22,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ShiftControlCard extends StatelessWidget {
  const _ShiftControlCard({
    required this.onDuty,
    required this.loading,
    required this.gpsValid,
    required this.distanceMeters,
    required this.onTap,
  });

  final bool onDuty;
  final bool loading;
  final bool? gpsValid;
  final double? distanceMeters;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final actionColor = onDuty ? const Color(0xFFD97706) : AppTheme.verified;
    final gpsColor = gpsValid == true ? AppTheme.verified : AppTheme.flagged;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: actionColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(13),
                ),
                child: Icon(
                  onDuty ? Icons.logout_rounded : Icons.login_rounded,
                  color: actionColor,
                  size: 21,
                ),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      onDuty ? 'End your shift' : 'Start your shift',
                      style: TextStyle(
                        color: AppTheme.text,
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      onDuty
                          ? 'Clock out when you leave site.'
                          : 'Clock in when you arrive on site.',
                      style: TextStyle(
                        color: AppTheme.textSecondary,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
              SizedBox(
                width: 104,
                height: 42,
                child: ElevatedButton(
                  onPressed: onTap,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: actionColor,
                    foregroundColor: Colors.white,
                    disabledBackgroundColor: actionColor.withValues(
                      alpha: 0.45,
                    ),
                    elevation: 0,
                    padding: EdgeInsets.zero,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: loading
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : Text(
                          onDuty ? 'Clock out' : 'Clock in',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                ),
              ),
            ],
          ),
          if (onDuty && gpsValid != null) ...[
            const SizedBox(height: 11),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  gpsValid! ? Icons.check_circle_rounded : Icons.warning_amber,
                  size: 14,
                  color: gpsColor,
                ),
                const SizedBox(width: 5),
                Flexible(
                  child: Text(
                    gpsValid!
                        ? 'Geofence verified'
                        : distanceMeters != null
                        ? '${distanceMeters!.toStringAsFixed(0)}m from checkpoint'
                        : 'Outside geofence',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: gpsColor,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.eyebrow, required this.title});

  final String eyebrow;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          eyebrow,
          style: TextStyle(
            color: AppTheme.primaryDark,
            fontSize: 10,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.3,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          title,
          style: TextStyle(
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

class _DashboardScanTile extends StatelessWidget {
  const _DashboardScanTile({required this.scan, required this.onTap});

  final Scan scan;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final statusColor = scan.gpsValid ? AppTheme.verified : AppTheme.error;

    return Container(
      margin: const EdgeInsets.only(top: 8),
      decoration: BoxDecoration(
        color: AppTheme.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.border),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  scan.gpsValid
                      ? Icons.check_circle_rounded
                      : Icons.warning_rounded,
                  color: statusColor,
                  size: 20,
                ),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      scan.checkpointName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: AppTheme.text,
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      '${scan.checkpointCode} · ${scan.officerName}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: AppTheme.textSecondary,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    scan.formattedTime,
                    style: TextStyle(
                      color: AppTheme.text,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    '${scan.distanceMeters.toStringAsFixed(0)}m',
                    style: TextStyle(
                      color: AppTheme.textSecondary,
                      fontSize: 10,
                    ),
                  ),
                ],
              ),
            ],
          ),
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
    return SizedBox(
      height: 118,
      child: Card(
        margin: EdgeInsets.zero,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(17),
          side: BorderSide(color: AppTheme.border),
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 35,
                height: 35,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(11),
                ),
                child: Icon(icon, color: color, size: 19),
              ),
              const Spacer(),
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    value,
                    style: TextStyle(
                      fontSize: 25,
                      height: 1,
                      fontWeight: FontWeight.w800,
                      color: color,
                    ),
                  ),
                  const SizedBox(width: 7),
                  Flexible(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 11,
                        color: AppTheme.textSecondary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
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
    return Card(
      margin: EdgeInsets.zero,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: AppTheme.border),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 13),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: AppTheme.primary.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: AppTheme.primaryDark, size: 21),
              ),
              const SizedBox(height: 8),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 11,
                  color: AppTheme.textSecondary,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
