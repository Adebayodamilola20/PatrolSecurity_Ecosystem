import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/auth_provider.dart';
import '../providers/scan_provider.dart';
import '../utils/routes.dart';
import '../utils/sign_out.dart';
import '../utils/theme.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    final scan = context.watch<ScanProvider>();
    final name = user?.name.isNotEmpty == true ? user!.name : 'Officer';
    final role = _displayRole(user?.role ?? 'officer');
    final accuracy = scan.totalScans > 0
        ? ((scan.totalScans -
                      scan.scans.where((item) => !item.gpsValid).length) /
                  scan.totalScans *
                  100)
              .toStringAsFixed(1)
        : '0';

    return Scaffold(
      backgroundColor: AppTheme.surface,
      appBar: AppBar(
        title: const Text('Profile'),
        backgroundColor: AppTheme.surface,
        surfaceTintColor: Colors.transparent,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 32),
        children: [
          _ProfileHero(
            name: name,
            role: role,
            initials: _initials(name),
            active: user?.active ?? true,
          ),
          const SizedBox(height: 20),
          const _ProfileSectionHeading(
            eyebrow: 'PERSONAL DETAILS',
            title: 'Contact information',
          ),
          const SizedBox(height: 11),
          _ProfileCard(
            child: Column(
              children: [
                _ProfileDetailTile(
                  icon: Icons.mail_outline_rounded,
                  label: 'Email address',
                  value: user?.email.isNotEmpty == true
                      ? user!.email
                      : 'Not set',
                ),
                const _ProfileDivider(),
                _ProfileDetailTile(
                  icon: Icons.phone_outlined,
                  label: 'Phone number',
                  value: user?.phone.isNotEmpty == true
                      ? user!.phone
                      : 'Not set',
                ),
                const _ProfileDivider(),
                _ProfileDetailTile(
                  icon: Icons.badge_outlined,
                  label: 'Access role',
                  value: role,
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          const _ProfileSectionHeading(
            eyebrow: 'PATROL OVERVIEW',
            title: 'Your activity',
          ),
          const SizedBox(height: 11),
          _ProfileCard(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 18),
            child: Row(
              children: [
                Expanded(
                  child: _ProfileStat(
                    icon: Icons.assignment_turned_in_outlined,
                    value: '${scan.totalScans}',
                    label: 'Total scans',
                  ),
                ),
                const _StatDivider(),
                Expanded(
                  child: _ProfileStat(
                    icon: Icons.trending_up_rounded,
                    value: '${scan.todayScans}',
                    label: 'This week',
                  ),
                ),
                const _StatDivider(),
                Expanded(
                  child: _ProfileStat(
                    icon: Icons.verified_rounded,
                    value: '$accuracy%',
                    label: 'Accuracy',
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          const _ProfileSectionHeading(
            eyebrow: 'ACCOUNT',
            title: 'Manage your access',
          ),
          const SizedBox(height: 11),
          _ProfileCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                _ProfileActionTile(
                  icon: Icons.settings_outlined,
                  title: 'Settings',
                  subtitle: 'Manage app preferences',
                  onTap: () => Navigator.pushNamed(context, AppRoutes.settings),
                ),
                const _ProfileDivider(indent: 70),
                _ProfileActionTile(
                  icon: Icons.logout_rounded,
                  title: 'Sign out',
                  subtitle: 'End this session securely',
                  destructive: true,
                  onTap: () => signOutAndReturnToLogin(context),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ProfileHero extends StatelessWidget {
  const _ProfileHero({
    required this.name,
    required this.role,
    required this.initials,
    required this.active,
  });

  final String name;
  final String role;
  final String initials;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF123C40), Color(0xFF0B6F5C)],
        ),
        borderRadius: BorderRadius.circular(26),
        boxShadow: [
          BoxShadow(
            color: AppTheme.onboardingInk.withValues(alpha: 0.18),
            blurRadius: 20,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Stack(
        children: [
          Positioned(
            top: -68,
            right: -36,
            child: Container(
              width: 180,
              height: 180,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: AppTheme.primary.withValues(alpha: 0.14),
              ),
            ),
          ),
          Row(
            children: [
              Container(
                width: 76,
                height: 76,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.26),
                    width: 1.5,
                  ),
                ),
                child: Center(
                  child: Text(
                    initials,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 25,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.5,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 15),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 20,
                        height: 1.12,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.3,
                      ),
                    ),
                    const SizedBox(height: 9),
                    Wrap(
                      spacing: 7,
                      runSpacing: 6,
                      children: [
                        _HeroPill(label: role.toUpperCase()),
                        _HeroPill(
                          label: active ? 'ACTIVE' : 'INACTIVE',
                          icon: Icons.circle,
                          accent: active
                              ? const Color(0xFF8DF5B7)
                              : const Color(0xFFFFD38D),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _HeroPill extends StatelessWidget {
  const _HeroPill({required this.label, this.icon, this.accent = Colors.white});

  final String label;
  final IconData? icon;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, color: accent, size: 8),
            const SizedBox(width: 5),
          ],
          Text(
            label,
            style: TextStyle(
              color: accent,
              fontSize: 9,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.8,
            ),
          ),
        ],
      ),
    );
  }
}

class _ProfileSectionHeading extends StatelessWidget {
  const _ProfileSectionHeading({required this.eyebrow, required this.title});

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

class _ProfileCard extends StatelessWidget {
  const _ProfileCard({
    required this.child,
    this.padding = const EdgeInsets.all(16),
  });

  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: AppTheme.card,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppTheme.border),
      ),
      child: child,
    );
  }
}

class _ProfileDetailTile extends StatelessWidget {
  const _ProfileDetailTile({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: AppTheme.primary.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(13),
          ),
          child: Icon(icon, color: AppTheme.primaryDark, size: 20),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: TextStyle(
                  color: AppTheme.textSecondary,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: AppTheme.text,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ProfileDivider extends StatelessWidget {
  const _ProfileDivider({this.indent = 52});

  final double indent;

  @override
  Widget build(BuildContext context) {
    return Divider(
      height: 22,
      thickness: 1,
      indent: indent,
      endIndent: 0,
      color: AppTheme.border,
    );
  }
}

class _ProfileStat extends StatelessWidget {
  const _ProfileStat({
    required this.icon,
    required this.value,
    required this.label,
  });

  final IconData icon;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Icon(icon, color: AppTheme.primaryDark, size: 21),
        const SizedBox(height: 8),
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: AppTheme.text,
            fontSize: 21,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 3),
        Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: AppTheme.textSecondary,
            fontSize: 10,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

class _StatDivider extends StatelessWidget {
  const _StatDivider();

  @override
  Widget build(BuildContext context) {
    return Container(width: 1, height: 62, color: AppTheme.border);
  }
}

class _ProfileActionTile extends StatelessWidget {
  const _ProfileActionTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.destructive = false,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final color = destructive ? AppTheme.error : AppTheme.text;
    final iconColor = destructive ? AppTheme.error : AppTheme.primaryDark;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: destructive
                    ? AppTheme.error.withValues(alpha: 0.09)
                    : AppTheme.primary.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(13),
              ),
              child: Icon(icon, color: iconColor, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: color,
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    subtitle,
                    style: TextStyle(
                      color: AppTheme.textSecondary,
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
            Icon(
              Icons.chevron_right_rounded,
              color: destructive
                  ? AppTheme.error.withValues(alpha: 0.6)
                  : AppTheme.textSecondary,
              size: 21,
            ),
          ],
        ),
      ),
    );
  }
}

String _displayRole(String rawRole) {
  final words = rawRole
      .replaceAll('-', ' ')
      .replaceAll('_', ' ')
      .trim()
      .split(RegExp(r'\s+'))
      .where((word) => word.isNotEmpty)
      .map(
        (word) => '${word[0].toUpperCase()}${word.substring(1).toLowerCase()}',
      )
      .toList();
  return words.isEmpty ? 'Officer' : words.join(' ');
}

String _initials(String name) {
  final parts = name
      .trim()
      .split(RegExp(r'\s+'))
      .where((part) => part.isNotEmpty)
      .toList();
  if (parts.isEmpty) return 'U';
  if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
  return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
}
