import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/scan_provider.dart';
import '../providers/shift_provider.dart';
import '../utils/routes.dart';
import '../utils/theme.dart';
import '../widgets/scan_tile.dart';
import 'duties_screen.dart';
import 'history_screen.dart';
import 'profile_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _currentIndex = 0;

  final _pages = [
    const _DashboardTab(),
    const DutiesScreen(),
    const HistoryScreen(),
    const ProfileScreen(),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ShiftProvider>().loadStatus();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _pages[_currentIndex],
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (i) => setState(() => _currentIndex = i),
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.dashboard), label: 'Home'),
          BottomNavigationBarItem(icon: Icon(Icons.assignment_turned_in_outlined), label: 'Duties'),
          BottomNavigationBarItem(icon: Icon(Icons.history), label: 'History'),
          BottomNavigationBarItem(icon: Icon(Icons.person), label: 'Profile'),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => Navigator.pushNamed(context, AppRoutes.scanner),
        backgroundColor: AppTheme.primary,
        child: const Icon(Icons.qr_code_scanner, color: Colors.white),
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
    );
  }
}

class _DashboardTab extends StatelessWidget {
  const _DashboardTab();

  String _formatHour(DateTime? value) {
    if (value == null) return '--:--';
    return '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final scan = context.watch<ScanProvider>();
    final shift = context.watch<ShiftProvider>();

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
      body: RefreshIndicator(
        onRefresh: () async {
          await scan.loadScans();
          await scan.loadCheckpoints();
          await shift.loadStatus();
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
                    color: shift.onDuty ? AppTheme.verified : AppTheme.textSecondary,
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  shift.onDuty ? 'On Duty' : 'Off Duty',
                  style: TextStyle(
                    fontSize: 14,
                    color: shift.onDuty ? AppTheme.verified : AppTheme.textSecondary,
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
                    label: 'Total Scans',
                    value: '${scan.totalScans}',
                    icon: Icons.assignment_turned_in,
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
                onPressed: () =>
                    Navigator.pushNamed(context, AppRoutes.scanner),
                icon: const Icon(Icons.qr_code_scanner, size: 24),
                label: const Text('Scan QR Code'),
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
                  backgroundColor:
                      shift.onDuty ? Colors.orange : AppTheme.verified,
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
            const SizedBox(height: 20),
            Row(
              children: [
                _QuickAction(
                  icon: Icons.history,
                  label: 'History',
                  onTap: () =>
                      Navigator.pushNamed(context, AppRoutes.history),
                ),
                const SizedBox(width: 12),
                _QuickAction(
                  icon: Icons.location_on_outlined,
                  label: 'Checkpoints',
                  onTap: () =>
                      Navigator.pushNamed(context, AppRoutes.checkpoints),
                ),
                const SizedBox(width: 12),
                _QuickAction(
                  icon: Icons.person_outline,
                  label: 'Profile',
                  onTap: () =>
                      Navigator.pushNamed(context, AppRoutes.profile),
                ),
              ],
            ),
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Recent Activity',
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 16,
                  ),
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
              ...scan.scans.take(5).map((s) => ScanTile(
                    scan: s,
                    onTap: () => Navigator.pushNamed(
                      context,
                      AppRoutes.scanDetail,
                      arguments: {'scanId': s.id},
                    ),
                  )),
          ],
        ),
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
                color: color.withOpacity(0.1),
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
                    color: AppTheme.primary.withOpacity(0.1),
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
