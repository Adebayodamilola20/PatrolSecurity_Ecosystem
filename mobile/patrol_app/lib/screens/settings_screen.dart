import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
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
  bool _notificationsEnabled = true;
  bool _vibrationEnabled = true;
  bool _offlineMode = false;
  bool _darkMode = false;
  bool _autoScan = true;
  bool _strictGps = true;
  double _scanRadius = 50;
  String _sessionTimeout = '30 min';

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user;

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          _ProfileHeader(userName: user?.name, userRole: user?.role, userEmail: user?.email),
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
                      onTap: () => _showComingSoon(context, 'Change Password'),
                    ),
                    _Divider(),
                    _SettingTile(
                      icon: Icons.fingerprint_rounded,
                      iconColor: const Color(0xFF8B5CF6),
                      iconBg: const Color(0xFF8B5CF6).withValues(alpha: 0.1),
                      title: 'Biometric Login',
                      subtitle: 'Use fingerprint or face to sign in',
                      trailing: Switch.adaptive(
                        value: false,
                        onChanged: (_) => _showComingSoon(context, 'Biometric Login'),
                        activeTrackColor: AppTheme.primary,
                      ),
                    ),
                    _Divider(),
                    _SettingTile(
                      icon: Icons.timer_outlined,
                      iconColor: const Color(0xFFF59E0B),
                      iconBg: const Color(0xFFF59E0B).withValues(alpha: 0.1),
                      title: 'Session Timeout',
                      subtitle: 'Auto-lock after $_sessionTimeout of inactivity',
                      trailing: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppTheme.primary.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: DropdownButtonHideUnderline(
                          child: DropdownButton<String>(
                            value: _sessionTimeout,
                            items: ['5 min', '15 min', '30 min', '1 hour', 'Never']
                                .map((t) => DropdownMenuItem(value: t, child: Text(t, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600))))
                                .toList(),
                            onChanged: (v) => setState(() => _sessionTimeout = v!),
                            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppTheme.primary),
                            icon: const Icon(Icons.expand_more, size: 16, color: AppTheme.primary),
                            isDense: true,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                _SectionLabel(label: 'SCANNING PREFERENCES'),
                const SizedBox(height: 8),
                _Card(
                  children: [
                    _SettingTile(
                      icon: Icons.qr_code_scanner_rounded,
                      iconColor: AppTheme.primary,
                      iconBg: AppTheme.primary.withValues(alpha: 0.1),
                      title: 'Auto-Advance Scan',
                      subtitle: 'Automatically return to scanner after a successful scan',
                      trailing: Switch.adaptive(
                        value: _autoScan,
                        onChanged: (v) => setState(() => _autoScan = v),
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
                        onChanged: (v) => setState(() => _vibrationEnabled = v),
                        activeTrackColor: AppTheme.primary,
                      ),
                    ),
                    _Divider(),
                    _SettingTile(
                      icon: Icons.gps_fixed_rounded,
                      iconColor: const Color(0xFF10B981),
                      iconBg: const Color(0xFF10B981).withValues(alpha: 0.1),
                      title: 'Strict GPS Validation',
                      subtitle: 'Reject scans outside the configured radius',
                      trailing: Switch.adaptive(
                        value: _strictGps,
                        onChanged: (v) => setState(() => _strictGps = v),
                        activeTrackColor: AppTheme.primary,
                      ),
                    ),
                    _Divider(),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFEC4899).withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: const Icon(Icons.near_me_rounded, size: 18, color: Color(0xFFEC4899)),
                              ),
                              const SizedBox(width: 12),
                              const Text('Scan Radius', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                              const Spacer(),
                              Text('${_scanRadius.toInt()}m', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.primary)),
                            ],
                          ),
                          const SizedBox(height: 4),
                          SliderTheme(
                            data: SliderTheme.of(context).copyWith(
                              activeTrackColor: AppTheme.primary,
                              inactiveTrackColor: AppTheme.primary.withValues(alpha: 0.15),
                              thumbColor: AppTheme.primary,
                              overlayColor: AppTheme.primary.withValues(alpha: 0.12),
                              trackHeight: 4,
                              thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 8),
                            ),
                            child: Slider(
                              value: _scanRadius,
                              min: 10,
                              max: 200,
                              divisions: 19,
                              label: '${_scanRadius.toInt()}m',
                              onChanged: (v) => setState(() => _scanRadius = v),
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.only(left: 4),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text('10m', style: TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
                                Text('200m', style: TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
                              ],
                            ),
                          ),
                        ],
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
                      subtitle: 'Receive alerts for missed checkpoints and updates',
                      trailing: Switch.adaptive(
                        value: _notificationsEnabled,
                        onChanged: (v) => setState(() => _notificationsEnabled = v),
                        activeTrackColor: AppTheme.primary,
                      ),
                    ),
                    _Divider(),
                    _SettingTile(
                      icon: Icons.volume_up_rounded,
                      iconColor: const Color(0xFF8B5CF6),
                      iconBg: const Color(0xFF8B5CF6).withValues(alpha: 0.1),
                      title: 'Alert Sound',
                      subtitle: 'Play a tone for critical notifications',
                      trailing: Switch.adaptive(
                        value: true,
                        onChanged: (_) {},
                        activeTrackColor: AppTheme.primary,
                      ),
                    ),
                    _Divider(),
                    _SettingTile(
                      icon: Icons.priority_high_rounded,
                      iconColor: const Color(0xFFF59E0B),
                      iconBg: const Color(0xFFF59E0B).withValues(alpha: 0.1),
                      title: 'Critical Alerts Only',
                      subtitle: 'Only receive emergency and high-priority notifications',
                      trailing: Switch.adaptive(
                        value: false,
                        onChanged: (_) {},
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
                        onChanged: (v) => setState(() => _darkMode = v),
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
                        value: false,
                        onChanged: (_) {},
                        activeTrackColor: AppTheme.primary,
                      ),
                    ),
                    _Divider(),
                    _SettingTile(
                      icon: Icons.text_fields_rounded,
                      iconColor: const Color(0xFFEC4899),
                      iconBg: const Color(0xFFEC4899).withValues(alpha: 0.1),
                      title: 'Font Size',
                      subtitle: 'Adjust text size throughout the app',
                      trailing: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          border: Border.all(color: AppTheme.border),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.text_fields, size: 14, color: AppTheme.textSecondary),
                            SizedBox(width: 4),
                            Icon(Icons.arrow_drop_down, size: 16, color: AppTheme.textSecondary),
                          ],
                        ),
                      ),
                      onTap: () => _showComingSoon(context, 'Font Size'),
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
                        onChanged: (v) => setState(() => _offlineMode = v),
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
                        subtitle: 'Automatically upload cached scans',
                        trailing: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppTheme.primary.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: const Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text('Every 5 min', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppTheme.primary)),
                              SizedBox(width: 2),
                              Icon(Icons.expand_more, size: 16, color: AppTheme.primary),
                            ],
                          ),
                        ),
                        onTap: () => _showComingSoon(context, 'Sync Interval'),
                      ),
                    ],
                    _Divider(),
                    _StorageTile(
                      icon: Icons.storage_rounded,
                      iconColor: const Color(0xFFF59E0B),
                      iconBg: const Color(0xFFF59E0B).withValues(alpha: 0.1),
                      title: 'Cached Data',
                      subtitle: 'Stored scans and checkpoints',
                      storageLabel: '2.4 MB',
                      onClear: () => _confirmClearCache(context),
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
                      onTap: () => _showComingSoon(context, 'Help & FAQ'),
                    ),
                    _Divider(),
                    _SettingTile(
                      icon: Icons.privacy_tip_outlined,
                      iconColor: const Color(0xFF6366F1),
                      iconBg: const Color(0xFF6366F1).withValues(alpha: 0.1),
                      title: 'Privacy Policy',
                      onTap: () => _showComingSoon(context, 'Privacy Policy'),
                    ),
                    _Divider(),
                    _SettingTile(
                      icon: Icons.description_outlined,
                      iconColor: const Color(0xFF8B5CF6),
                      iconBg: const Color(0xFF8B5CF6).withValues(alpha: 0.1),
                      title: 'Terms of Service',
                      onTap: () => _showComingSoon(context, 'Terms of Service'),
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

  void _showComingSoon(BuildContext context, String feature) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('$feature — coming soon'),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  void _confirmClearCache(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Row(
          children: [
            Icon(Icons.delete_outline_rounded, color: Color(0xFFF59E0B), size: 24),
            SizedBox(width: 10),
            Text('Clear Cache?', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
          ],
        ),
        content: const Text('This will remove locally cached scans and checkpoint data. You can re-sync from the server.', style: TextStyle(fontSize: 14, color: AppTheme.textSecondary)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              Navigator.pop(ctx);
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: const Text('Cache cleared'),
                  behavior: SnackBarBehavior.floating,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
              );
            },
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFFF59E0B)),
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

  const _ProfileHeader({this.userName, this.userRole, this.userEmail});

  @override
  Widget build(BuildContext context) {
    final initials = (userName ?? 'U')
        .split(' ')
        .map((n) => n.isNotEmpty ? n[0] : '')
        .join()
        .toUpperCase();
    final role = (userRole ?? 'officer').toUpperCase();

    return SliverAppBar(
      expandedHeight: 200,
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
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.2),
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white.withValues(alpha: 0.5), width: 2.5),
                    boxShadow: [
                      BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 16, offset: const Offset(0, 4)),
                    ],
                  ),
                  child: Center(
                    child: Text(
                      initials,
                      style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold, color: Colors.white, letterSpacing: 1),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  userName ?? 'Officer',
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.white, letterSpacing: 0.3),
                ),
                const SizedBox(height: 4),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(role, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white, letterSpacing: 1)),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      width: 6, height: 6,
                      decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0xFF6EE7B7)),
                    ),
                    const SizedBox(width: 6),
                    const Text('Active', style: TextStyle(fontSize: 12, color: Color(0xFFA7F3D0), fontWeight: FontWeight.w500)),
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

class _SectionLabel extends StatelessWidget {
  final String label;
  const _SectionLabel({required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 2),
      child: Text(
        label,
        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.textSecondary, letterSpacing: 1.2),
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
          BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 8, offset: const Offset(0, 2)),
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
  Widget build(BuildContext context) {
    return const Divider(height: 1, thickness: 0.5, color: AppTheme.border);
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
                    Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: AppTheme.text)),
                    if (subtitle != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(subtitle!, style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                      ),
                  ],
                ),
              ),
              if (trailing != null) trailing!,
              if (onTap != null && trailing == null)
                const Icon(Icons.chevron_right_rounded, size: 20, color: AppTheme.textSecondary),
            ],
          ),
        ),
      ),
    );
  }
}

class _StorageTile extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final Color iconBg;
  final String title;
  final String subtitle;
  final String storageLabel;
  final VoidCallback onClear;

  const _StorageTile({
    required this.icon,
    required this.iconColor,
    required this.iconBg,
    required this.title,
    required this.subtitle,
    required this.storageLabel,
    required this.onClear,
  });

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
              decoration: BoxDecoration(color: iconBg, borderRadius: BorderRadius.circular(10)),
              child: Icon(icon, size: 20, color: iconColor),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: AppTheme.text)),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Text(subtitle, style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF59E0B).withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(storageLabel, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Color(0xFFF59E0B))),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            InkWell(
              onTap: onClear,
              borderRadius: BorderRadius.circular(8),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: const Color(0xFFF59E0B).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.delete_outline_rounded, size: 14, color: Color(0xFFF59E0B)),
                    SizedBox(width: 4),
                    Text('Clear', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFFF59E0B))),
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
        title: const Row(
          children: [
            Icon(Icons.logout_rounded, color: AppTheme.error, size: 24),
            SizedBox(width: 10),
            Text('Sign Out', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
          ],
        ),
        content: const Text('Are you sure you want to sign out? Any unsynced scans will be lost.', style: TextStyle(fontSize: 14, color: AppTheme.textSecondary)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              Navigator.pop(ctx);
              context.read<ScanProvider>().clearData();
              context.read<ShiftProvider>().clearData();
              context.read<AuthProvider>().logout();
              Navigator.pushNamedAndRemoveUntil(context, AppRoutes.login, (_) => false);
            },
            style: FilledButton.styleFrom(backgroundColor: AppTheme.error),
            child: const Text('Sign Out'),
          ),
        ],
      ),
    );
  }
}
