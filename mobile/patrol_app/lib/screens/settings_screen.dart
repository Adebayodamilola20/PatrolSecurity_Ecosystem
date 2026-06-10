import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../providers/auth_provider.dart';
import '../providers/scan_provider.dart';
import '../providers/shift_provider.dart';
import '../utils/routes.dart';
import '../utils/theme.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  static const _storage = FlutterSecureStorage();

  bool _notificationsEnabled = true;
  bool _vibrationEnabled = true;
  bool _offlineMode = false;
  bool _darkMode = false;
  bool _autoScan = true;
  bool _alertSound = true;
  bool _compactLayout = false;
  String _sessionTimeout = '30 min';
  String _fontSize = 'Medium';
  String _syncInterval = 'Every 5 min';

  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    _notificationsEnabled =
        (await _storage.read(key: 'setting_notifications') ?? 'true') == 'true';
    _vibrationEnabled =
        (await _storage.read(key: 'setting_vibration') ?? 'true') == 'true';
    _offlineMode =
        (await _storage.read(key: 'setting_offline') ?? 'false') == 'true';
    _darkMode =
        (await _storage.read(key: 'setting_darkmode') ?? 'false') == 'true';
    _autoScan =
        (await _storage.read(key: 'setting_autoscan') ?? 'true') == 'true';
    _alertSound =
        (await _storage.read(key: 'setting_alertsound') ?? 'true') == 'true';
    _compactLayout =
        (await _storage.read(key: 'setting_compact') ?? 'false') == 'true';
    _sessionTimeout = await _storage.read(key: 'setting_timeout') ?? '30 min';
    _fontSize = await _storage.read(key: 'setting_fontsize') ?? 'Medium';
    _syncInterval =
        await _storage.read(key: 'setting_syncinterval') ?? 'Every 5 min';
    if (mounted) setState(() => _loaded = true);
  }

  Future<void> _save(String key, String value) =>
      _storage.write(key: key, value: value);

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final scan = context.watch<ScanProvider>();
    final user = auth.user;

    if (!_loaded) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          _ProfileHeader(
            userName: user?.name,
            userRole: user?.role,
            userEmail: user?.email,
            scanCount: scan.totalScans,
            todayCount: scan.todayScans,
            accuracy: scan.totalScans > 0
                ? '${((scan.totalScans - scan.scans.where((s) => !s.gpsValid).length) / scan.totalScans * 100).toStringAsFixed(0)}%'
                : '0%',
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                _SectionLabel(label: 'ACCOUNT & SECURITY'),
                const SizedBox(height: 8),
                _Card(
                  children: [
                    _SettingTile(
                      icon: Icons.lock_outline_rounded,
                      iconColor: const Color(0xFF6366F1),
                      iconBg: const Color(0xFF6366F1).withValues(alpha: 0.1),
                      title: 'Change Password',
                      subtitle: 'Update your login credentials',
                      onTap: () => _changePassword(context),
                    ),
                    _Divider(),
                    _SettingTile(
                      icon: Icons.timer_outlined,
                      iconColor: const Color(0xFFF59E0B),
                      iconBg: const Color(0xFFF59E0B).withValues(alpha: 0.1),
                      title: 'Session Timeout',
                      subtitle:
                          'Auto-lock after $_sessionTimeout of inactivity',
                      trailing: _DropdownChip(
                        value: _sessionTimeout,
                        items: ['5 min', '15 min', '30 min', '1 hour', 'Never'],
                        onChanged: (v) => setState(() {
                          _sessionTimeout = v!;
                          _save('setting_timeout', v);
                        }),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                _SectionLabel(label: 'SCANNING'),
                const SizedBox(height: 8),
                _Card(
                  children: [
                    _SettingTile(
                      icon: Icons.qr_code_scanner_rounded,
                      iconColor: AppTheme.primary,
                      iconBg: AppTheme.primary.withValues(alpha: 0.1),
                      title: 'Auto-Advance Scan',
                      subtitle: 'Return to scanner after a successful scan',
                      trailing: Switch.adaptive(
                        value: _autoScan,
                        onChanged: (v) => setState(() {
                          _autoScan = v;
                          _save('setting_autoscan', v.toString());
                        }),
                        activeTrackColor: AppTheme.primary,
                      ),
                    ),
                    _Divider(),
                    _SettingTile(
                      icon: Icons.vibration_rounded,
                      iconColor: const Color(0xFF3B82F6),
                      iconBg: const Color(0xFF3B82F6).withValues(alpha: 0.1),
                      title: 'Vibration on Scan',
                      subtitle: 'Haptic feedback when a QR code is detected',
                      trailing: Switch.adaptive(
                        value: _vibrationEnabled,
                        onChanged: (v) => setState(() {
                          _vibrationEnabled = v;
                          _save('setting_vibration', v.toString());
                        }),
                        activeTrackColor: AppTheme.primary,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                _SectionLabel(label: 'NOTIFICATIONS'),
                const SizedBox(height: 8),
                _Card(
                  children: [
                    _SettingTile(
                      icon: Icons.notifications_active_rounded,
                      iconColor: const Color(0xFFF43F5E),
                      iconBg: const Color(0xFFF43F5E).withValues(alpha: 0.1),
                      title: 'Push Notifications',
                      subtitle:
                          'Receive alerts for missed checkpoints and updates',
                      trailing: Switch.adaptive(
                        value: _notificationsEnabled,
                        onChanged: (v) => setState(() {
                          _notificationsEnabled = v;
                          _save('setting_notifications', v.toString());
                        }),
                        activeTrackColor: AppTheme.primary,
                      ),
                    ),
                    _Divider(),
                    _SettingTile(
                      icon: Icons.volume_up_rounded,
                      iconColor: const Color(0xFF8B5CF6),
                      iconBg: const Color(0xFF8B5CF6).withValues(alpha: 0.1),
                      title: 'Alert Sound',
                      subtitle: 'Play a tone for notifications',
                      trailing: Switch.adaptive(
                        value: _alertSound,
                        onChanged: (v) => setState(() {
                          _alertSound = v;
                          _save('setting_alertsound', v.toString());
                        }),
                        activeTrackColor: AppTheme.primary,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                _SectionLabel(label: 'APPEARANCE'),
                const SizedBox(height: 8),
                _Card(
                  children: [
                    _SettingTile(
                      icon: Icons.dark_mode_rounded,
                      iconColor: const Color(0xFF1E293B),
                      iconBg: const Color(0xFF1E293B).withValues(alpha: 0.08),
                      title: 'Dark Mode',
                      subtitle: 'Switch to a darker color scheme',
                      trailing: Switch.adaptive(
                        value: _darkMode,
                        onChanged: (v) => setState(() {
                          _darkMode = v;
                          _save('setting_darkmode', v.toString());
                        }),
                        activeTrackColor: AppTheme.primary,
                      ),
                    ),
                    _Divider(),
                    _SettingTile(
                      icon: Icons.view_compact_rounded,
                      iconColor: const Color(0xFF3B82F6),
                      iconBg: const Color(0xFF3B82F6).withValues(alpha: 0.1),
                      title: 'Compact Layout',
                      subtitle: 'Show more content in less space',
                      trailing: Switch.adaptive(
                        value: _compactLayout,
                        onChanged: (v) => setState(() {
                          _compactLayout = v;
                          _save('setting_compact', v.toString());
                        }),
                        activeTrackColor: AppTheme.primary,
                      ),
                    ),
                    _Divider(),
                    _SettingTile(
                      icon: Icons.text_fields_rounded,
                      iconColor: const Color(0xFFEC4899),
                      iconBg: const Color(0xFFEC4899).withValues(alpha: 0.1),
                      title: 'Font Size',
                      subtitle: 'Currently $_fontSize',
                      trailing: _DropdownChip(
                        value: _fontSize,
                        items: ['Small', 'Medium', 'Large'],
                        onChanged: (v) => setState(() {
                          _fontSize = v!;
                          _save('setting_fontsize', v);
                        }),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                _SectionLabel(label: 'DATA & STORAGE'),
                const SizedBox(height: 8),
                _Card(
                  children: [
                    _SettingTile(
                      icon: Icons.wifi_rounded,
                      iconColor: const Color(0xFF3B82F6),
                      iconBg: const Color(0xFF3B82F6).withValues(alpha: 0.1),
                      title: 'Offline Mode',
                      subtitle: 'Cache scans locally and sync when connected',
                      trailing: Switch.adaptive(
                        value: _offlineMode,
                        onChanged: (v) => setState(() {
                          _offlineMode = v;
                          _save('setting_offline', v.toString());
                        }),
                        activeTrackColor: AppTheme.primary,
                      ),
                    ),
                    if (_offlineMode) ...[
                      _Divider(),
                      _SettingTile(
                        icon: Icons.sync_rounded,
                        iconColor: AppTheme.primary,
                        iconBg: AppTheme.primary.withValues(alpha: 0.1),
                        title: 'Auto-Sync Interval',
                        subtitle: 'Upload cached scans automatically',
                        trailing: _DropdownChip(
                          value: _syncInterval,
                          items: [
                            'Every 5 min',
                            'Every 15 min',
                            'Every 30 min',
                            'Manual',
                          ],
                          onChanged: (v) => setState(() {
                            _syncInterval = v!;
                            _save('setting_syncinterval', v);
                          }),
                        ),
                      ),
                    ],
                    _Divider(),
                    _StorageTile(
                      scanCount: scan.totalScans,
                      onClear: () => _confirmClearCache(context, scan),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                _SectionLabel(label: 'SUPPORT & INFORMATION'),
                const SizedBox(height: 8),
                _Card(
                  children: [
                    _SettingTile(
                      icon: Icons.help_outline_rounded,
                      iconColor: AppTheme.primary,
                      iconBg: AppTheme.primary.withValues(alpha: 0.1),
                      title: 'Help & FAQ',
                      subtitle: 'Guides and troubleshooting',
                      onTap: () => _openUrl(
                        context,
                        'https://patrolsecurity-ecosystem.onrender.com/help',
                      ),
                    ),
                    _Divider(),
                    _SettingTile(
                      icon: Icons.privacy_tip_outlined,
                      iconColor: const Color(0xFF6366F1),
                      iconBg: const Color(0xFF6366F1).withValues(alpha: 0.1),
                      title: 'Privacy Policy',
                      onTap: () => _openUrl(
                        context,
                        'https://patrolsecurity-ecosystem.onrender.com/privacy',
                      ),
                    ),
                    _Divider(),
                    _SettingTile(
                      icon: Icons.description_outlined,
                      iconColor: const Color(0xFF8B5CF6),
                      iconBg: const Color(0xFF8B5CF6).withValues(alpha: 0.1),
                      title: 'Terms of Service',
                      onTap: () => _openUrl(
                        context,
                        'https://patrolsecurity-ecosystem.onrender.com/terms',
                      ),
                    ),
                    _Divider(),
                    _SettingTile(
                      icon: Icons.info_outline_rounded,
                      iconColor: AppTheme.textSecondary,
                      iconBg: AppTheme.textSecondary.withValues(alpha: 0.1),
                      title: 'App Version',
                      subtitle: 'Patrol Command v1.0.0',
                    ),
                  ],
                ),
                const SizedBox(height: 32),
                _LogoutButton(),
                const SizedBox(height: 24),
              ]),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _changePassword(BuildContext context) async {
    final currentCtrl = TextEditingController();
    final newCtrl = TextEditingController();
    final confirmCtrl = TextEditingController();

    final submitted = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text(
          'Change Password',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: currentCtrl,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Current password'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: newCtrl,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'New password'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: confirmCtrl,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: 'Confirm new password',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              if (newCtrl.text.length < 6) {
                ScaffoldMessenger.of(ctx).showSnackBar(
                  const SnackBar(
                    content: Text('Password must be at least 6 characters'),
                  ),
                );
                return;
              }
              if (newCtrl.text != confirmCtrl.text) {
                ScaffoldMessenger.of(ctx).showSnackBar(
                  const SnackBar(content: Text('Passwords do not match')),
                );
                return;
              }
              Navigator.pop(ctx, true);
            },
            child: const Text('Update'),
          ),
        ],
      ),
    );

    if (submitted == true && context.mounted) {
      try {
        await context.read<AuthProvider>().changePassword(
          currentCtrl.text,
          newCtrl.text,
        );
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Password updated successfully')),
          );
        }
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(e.toString().replaceFirst('Exception: ', '')),
            ),
          );
        }
      }
    }
  }

  Future<void> _openUrl(BuildContext context, String url) async {
    final uri = Uri.tryParse(url);
    if (uri != null && await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Could not open link')));
      }
    }
  }

  void _confirmClearCache(BuildContext context, ScanProvider scan) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Row(
          children: [
            Icon(
              Icons.delete_outline_rounded,
              color: Color(0xFFF59E0B),
              size: 24,
            ),
            SizedBox(width: 10),
            Text(
              'Clear Cache?',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
            ),
          ],
        ),
        content: Text(
          'Remove ${scan.totalScans} locally cached ${scan.totalScans == 1 ? 'scan' : 'scans'}? Data re-syncs from the server on next load.',
          style: const TextStyle(fontSize: 14, color: AppTheme.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              scan.clearData();
              Navigator.pop(ctx);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Cache cleared'),
                  behavior: SnackBarBehavior.floating,
                ),
              );
            },
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFFF59E0B),
            ),
            child: const Text('Clear'),
          ),
        ],
      ),
    );
  }
}

class _ProfileHeader extends StatelessWidget {
  final String? userName;
  final String? userRole;
  final String? userEmail;
  final int scanCount;
  final int todayCount;
  final String accuracy;

  const _ProfileHeader({
    this.userName,
    this.userRole,
    this.userEmail,
    required this.scanCount,
    required this.todayCount,
    required this.accuracy,
  });

  @override
  Widget build(BuildContext context) {
    final initials = (userName ?? 'U')
        .split(' ')
        .map((n) => n.isNotEmpty ? n[0] : '')
        .join()
        .toUpperCase();
    final role = (userRole ?? 'officer').toUpperCase();

    return SliverAppBar(
      expandedHeight: 260,
      pinned: true,
      stretch: true,
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.white,
      flexibleSpace: FlexibleSpaceBar(
        stretchModes: const [StretchMode.zoomBackground],
        background: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF059669), Color(0xFF10B981), Color(0xFF34D399)],
            ),
          ),
          child: SafeArea(
            bottom: false,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Spacer(),
                Container(
                  width: 68,
                  height: 68,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.2),
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.5),
                      width: 2.5,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.12),
                        blurRadius: 16,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Center(
                    child: Text(
                      initials,
                      style: const TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                        letterSpacing: 1,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  userName ?? 'Officer',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                    letterSpacing: 0.3,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        role,
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                          letterSpacing: 1,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      width: 6,
                      height: 6,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        color: Color(0xFF6EE7B7),
                      ),
                    ),
                    const SizedBox(width: 6),
                    const Text(
                      'Active',
                      style: TextStyle(
                        fontSize: 12,
                        color: Color(0xFFA7F3D0),
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _MiniStat(label: 'Total', value: '$scanCount'),
                    _MiniStatDivider(),
                    _MiniStat(label: 'Today', value: '$todayCount'),
                    _MiniStatDivider(),
                    _MiniStat(label: 'Accuracy', value: accuracy),
                  ],
                ),
                const SizedBox(height: 16),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  final String label;
  final String value;
  const _MiniStat({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Column(
        children: [
          Text(
            value,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: TextStyle(
              fontSize: 10,
              color: Colors.white.withValues(alpha: 0.7),
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }
}

class _MiniStatDivider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 1,
      height: 28,
      color: Colors.white.withValues(alpha: 0.25),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String label;
  const _SectionLabel({required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 2),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: AppTheme.textSecondary,
          letterSpacing: 1.2,
        ),
      ),
    );
  }
}

class _Card extends StatelessWidget {
  final List<Widget> children;
  const _Card({required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        child: Column(children: children),
      ),
    );
  }
}

class _Divider extends StatelessWidget {
  @override
  Widget build(BuildContext context) =>
      const Divider(height: 1, thickness: 0.5, color: AppTheme.border);
}

class _DropdownChip extends StatelessWidget {
  final String value;
  final List<String> items;
  final ValueChanged<String?> onChanged;

  const _DropdownChip({
    required this.value,
    required this.items,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: AppTheme.primary.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: value,
          items: items
              .map(
                (t) => DropdownMenuItem(
                  value: t,
                  child: Text(
                    t,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              )
              .toList(),
          onChanged: onChanged,
          style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: AppTheme.primary,
          ),
          icon: const Icon(
            Icons.expand_more,
            size: 16,
            color: AppTheme.primary,
          ),
          isDense: true,
        ),
      ),
    );
  }
}

class _SettingTile extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final Color iconBg;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;

  const _SettingTile({
    required this.icon,
    required this.iconColor,
    required this.iconBg,
    required this.title,
    this.subtitle,
    this.trailing,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: iconBg,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, size: 20, color: iconColor),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        color: AppTheme.text,
                      ),
                    ),
                    if (subtitle != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          subtitle!,
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppTheme.textSecondary,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              if (trailing != null) trailing!,
              if (onTap != null && trailing == null)
                const Icon(
                  Icons.chevron_right_rounded,
                  size: 20,
                  color: AppTheme.textSecondary,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StorageTile extends StatelessWidget {
  final int scanCount;
  final VoidCallback onClear;

  const _StorageTile({required this.scanCount, required this.onClear});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: const Color(0xFFF59E0B).withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(
                Icons.storage_rounded,
                size: 20,
                color: Color(0xFFF59E0B),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Cached Data',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: AppTheme.text,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Text(
                        'Stored scans and checkpoints',
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                      if (scanCount > 0) ...[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 1,
                          ),
                          decoration: BoxDecoration(
                            color: const Color(
                              0xFFF59E0B,
                            ).withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            '$scanCount scans',
                            style: const TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                              color: Color(0xFFF59E0B),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
            if (scanCount > 0)
              InkWell(
                onTap: onClear,
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF59E0B).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.delete_outline_rounded,
                        size: 14,
                        color: Color(0xFFF59E0B),
                      ),
                      SizedBox(width: 4),
                      Text(
                        'Clear',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFFF59E0B),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _LogoutButton extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.error.withValues(alpha: 0.2)),
      ),
      child: Material(
        color: AppTheme.error.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: () => _confirmLogout(context),
          borderRadius: BorderRadius.circular(16),
          child: const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.logout_rounded, size: 20, color: AppTheme.error),
                SizedBox(width: 10),
                Text(
                  'Sign Out',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.error,
                    letterSpacing: 0.3,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _confirmLogout(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text(
          'Sign Out',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
        ),
        content: const Text(
          'Are you sure you want to sign out? Any unsynced scans will be lost.',
          style: TextStyle(fontSize: 14, color: AppTheme.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.pop(ctx);
              context.read<ScanProvider>().clearData();
              context.read<ShiftProvider>().clearData();
              context.read<AuthProvider>().logout();
              Navigator.pushNamedAndRemoveUntil(
                context,
                AppRoutes.login,
                (_) => false,
              );
            },
            style: FilledButton.styleFrom(backgroundColor: AppTheme.error),
            child: const Text('Sign Out'),
          ),
        ],
      ),
    );
  }
}
