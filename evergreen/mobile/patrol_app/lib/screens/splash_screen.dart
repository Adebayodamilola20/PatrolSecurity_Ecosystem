import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../providers/auth_provider.dart';
import '../providers/duty_provider.dart';
import '../providers/scan_provider.dart';
import '../providers/shift_provider.dart';
import '../utils/routes.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  static const _storage = FlutterSecureStorage();

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final minimumSplash = Future.delayed(const Duration(milliseconds: 700));

    final auth = context.read<AuthProvider>();
    final scan = context.read<ScanProvider>();
    final shift = context.read<ShiftProvider>();
    final duty = context.read<DutyProvider>();

    final restored = await auth.restoreSession();

    if (!mounted) return;
    final onboardingComplete =
        await _storage.read(key: 'patrol_onboarding_complete') == 'true';
    if (!mounted) return;

    // Onboarding is a first-run product introduction, so it takes priority
    // over an already-restored session. The active-session flag lets the last
    // onboarding action return existing users to Home instead of asking them
    // to sign in again.
    if (!onboardingComplete) {
      await minimumSplash;
      if (!mounted) return;
      Navigator.pushReplacementNamed(
        context,
        AppRoutes.onboarding,
        arguments: {'hasActiveSession': restored},
      );
      return;
    }

    if (restored) {
      await Future.wait([
        scan.loadScans(),
        scan.loadCheckpoints(),
        scan.loadPendingScans(),
        shift.loadStatus(),
        duty.load(),
        minimumSplash,
      ]);
      if (!mounted) return;
      Navigator.pushReplacementNamed(context, AppRoutes.home);
    } else {
      await minimumSplash;
      if (!mounted) return;
      Navigator.pushReplacementNamed(context, AppRoutes.login);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        width: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF064E3B), Color(0xFF0F766E)],
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(24),
              ),
              child: const Icon(
                Icons.shield_outlined,
                size: 64,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 24),
            const Text(
              'Patrol Command',
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.bold,
                color: Colors.white,
                letterSpacing: 1,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Security Patrol System',
              style: TextStyle(
                fontSize: 14,
                color: Colors.white.withValues(alpha: 0.7),
              ),
            ),
            const SizedBox(height: 48),
            SizedBox(
              width: 120,
              child: LinearProgressIndicator(
                backgroundColor: Colors.white.withValues(alpha: 0.2),
                valueColor: const AlwaysStoppedAnimation(Colors.white),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Loading...',
              style: TextStyle(
                fontSize: 12,
                color: Colors.white.withValues(alpha: 0.5),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
