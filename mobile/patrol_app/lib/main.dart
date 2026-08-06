import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'utils/theme.dart';
import 'utils/routes.dart';
import 'utils/constants.dart';
import 'screens/splash_screen.dart';
import 'screens/onboarding_screen.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';
import 'screens/duties_screen.dart';
import 'screens/scanner_screen.dart';
import 'screens/scan_result_screen.dart';
import 'screens/history_screen.dart';
import 'screens/scan_detail_screen.dart';
import 'screens/checkpoints_screen.dart';
import 'screens/checkpoint_detail_screen.dart';
import 'screens/reports_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/patrol_screen.dart';
import 'screens/workflow_module_screen.dart';
import 'screens/visitor_check_screen.dart';
import 'screens/truck_check_screen.dart';
import 'package:provider/provider.dart';
import 'providers/auth_provider.dart';
import 'providers/scan_provider.dart';
import 'providers/shift_provider.dart';
import 'providers/duty_provider.dart';
import 'services/api_service.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Lock to portrait. The screens are designed for portrait, so rotating a
  // phone/tablet to landscape previously triggered RenderFlex "overflow"
  // stripes. Restricting orientation prevents the landscape layout (and the
  // overflow) from ever rendering.
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  if (!baseUrl.startsWith('https://')) {
    throw Exception(
      'SECURITY: HTTPS is required. Base URL must use https://. '
      'Current value: $baseUrl',
    );
  }

  // Restore the appearance choice before the first frame, otherwise a guard
  // who picked dark mode gets a white flash on every cold start. A keychain
  // read can fail on a fresh install, and appearance is not worth blocking
  // launch over, so fall back to light.
  try {
    const storage = FlutterSecureStorage();
    AppTheme.darkMode.value =
        (await storage.read(key: 'setting_darkmode')) == 'true';
  } catch (_) {
    AppTheme.darkMode.value = false;
  }
  AppTheme.applySystemChrome();

  bool loggingOut = false;
  ApiService.onUnauthorized = () {
    if (loggingOut) return;
    loggingOut = true;
    const storage = FlutterSecureStorage();
    storage.delete(key: 'patrol_token');
    storage.delete(key: 'patrol_refresh');
    storage.delete(key: 'patrol_user');
    navigatorKey.currentState?.pushNamedAndRemoveUntil(
      AppRoutes.login,
      (_) => false,
    );
    // Debounces the burst of 401s from requests already in flight, then
    // re-arms so a session that dies AFTER a re-login still bounces here.
    Future.delayed(const Duration(seconds: 3), () => loggingOut = false);
  };
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(create: (_) => ScanProvider()),
        ChangeNotifierProvider(create: (_) => ShiftProvider()),
        ChangeNotifierProvider(create: (_) => DutyProvider()),
      ],
      child: const PatrolApp(),
    ),
  );
}

class PatrolApp extends StatefulWidget {
  const PatrolApp({super.key});

  @override
  State<PatrolApp> createState() => _PatrolAppState();
}

class _PatrolAppState extends State<PatrolApp> with WidgetsBindingObserver {
  static const _storage = FlutterSecureStorage();
  bool _checkingSession = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // The session is only validated on cold start (splash). An app left open for
  // hours never re-checks, so a session that died in the background used to
  // stay on a "signed-in" screen until the next tap failed. Re-validate on
  // resume: if the session is unrecoverable, bounce to login proactively.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _revalidateSession();
    }
  }

  Future<void> _revalidateSession() async {
    if (_checkingSession) return;
    _checkingSession = true;
    try {
      // No refresh token means the user is already signed out (e.g. sitting on
      // the login screen) — nothing to bounce.
      final refresh = await _storage.read(key: 'patrol_refresh');
      if (refresh == null || refresh.isEmpty) return;
      // hasRecoverableSession() refreshes proactively and only returns false
      // when the server has actually rejected the session (not on a transient
      // network failure, which keeps the guard signed in).
      final ok = await ApiService.hasRecoverableSession();
      if (!ok) ApiService.onUnauthorized?.call();
    } finally {
      _checkingSession = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    // AppTheme's colour tokens are read directly by the screens rather than
    // through Theme.of(context), so the whole app has to rebuild when the mode
    // flips — not just the widgets that happen to depend on an InheritedWidget.
    return ValueListenableBuilder<bool>(
      valueListenable: AppTheme.darkMode,
      builder: (context, isDark, _) => _buildApp(isDark),
    );
  }

  Widget _buildApp(bool isDark) {
    return MaterialApp(
      navigatorKey: navigatorKey,
      title: 'Patrol Command',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.theme,
      darkTheme: AppTheme.darkTheme,
      themeMode: isDark ? ThemeMode.dark : ThemeMode.light,
      initialRoute: AppRoutes.splash,
      onGenerateRoute: (settings) {
        final args = settings.arguments as Map<String, dynamic>?;
        switch (settings.name) {
          case AppRoutes.splash:
            return _route(const SplashScreen(), settings);
          case AppRoutes.onboarding:
            return _route(
              OnboardingScreen(
                hasActiveSession: args?['hasActiveSession'] as bool? ?? false,
              ),
              settings,
            );
          case AppRoutes.login:
            return _route(const LoginScreen(), settings);
          case AppRoutes.home:
            return _route(const HomeScreen(), settings);
          case AppRoutes.scanner:
            return _route(const ScannerScreen(), settings);
          case AppRoutes.scanResult:
            return _route(
              ScanResultScreen(
                scanData: args?['scanData'] as Map<String, dynamic>?,
              ),
              settings,
            );
          case AppRoutes.duties:
            return _route(const DutiesScreen(), settings);
          case AppRoutes.history:
            return _route(const HistoryScreen(), settings);
          case AppRoutes.scanDetail:
            return _route(
              ScanDetailScreen(scanId: args?['scanId'] as String?),
              settings,
            );
          case AppRoutes.checkpoints:
            return _route(const CheckpointsScreen(), settings);
          case AppRoutes.checkpointDetail:
            return _route(
              CheckpointDetailScreen(
                checkpointId: args?['checkpointId'] as String?,
              ),
              settings,
            );
          case AppRoutes.reports:
            return _route(
              ReportsScreen(initialTab: args?['tab'] as int?),
              settings,
            );
          case AppRoutes.schedule:
            return _route(
              const WorkflowModuleScreen(
                title: 'View Schedule',
                icon: Icons.calendar_month_outlined,
                capabilities: [
                  'Review assigned shifts and post coverage.',
                  'Client accounts can view schedules across assigned sites.',
                  'Admins can review schedule coverage globally.',
                ],
                visibleFor: ['Admin', 'Client Account', 'Site Account'],
              ),
              settings,
            );
          case AppRoutes.patrol:
            return _route(const PatrolScreen(), settings);
          case AppRoutes.policy:
            return _route(const DutiesScreen(), settings);
          case AppRoutes.truckCheck:
            return _route(const TruckCheckScreen(), settings);
          case AppRoutes.visitorCheck:
            return _route(const VisitorCheckScreen(), settings);
          case AppRoutes.vacation:
            return _route(
              const WorkflowModuleScreen(
                title: 'Vacation Requests',
                icon: Icons.event_available_outlined,
                capabilities: [
                  'Submit time-off requests for supervisor review.',
                  'Review request history and approval status.',
                  'Admins can monitor requests across clients and sites.',
                ],
                visibleFor: ['Admin', 'Client Account', 'Site Account'],
              ),
              settings,
            );
          case AppRoutes.users:
            return _route(
              const WorkflowModuleScreen(
                title: 'User Management',
                icon: Icons.manage_accounts_outlined,
                capabilities: [
                  'Manage admin, client account, and site account users.',
                  'Assign client and site access.',
                  'Control active status and role visibility.',
                ],
                visibleFor: ['Admin'],
              ),
              settings,
            );
          case AppRoutes.profile:
            return _route(const ProfileScreen(), settings);
          case AppRoutes.settings:
            return _route(const SettingsScreen(), settings);
          default:
            return _route(const SplashScreen(), settings);
        }
      },
    );
  }

  // The settings MUST be carried onto the route: they hold the route name, and
  // navigation like pushNamedAndRemoveUntil(..., until name == home) silently
  // clears the whole stack when every route's name is null.
  MaterialPageRoute _route(Widget page, RouteSettings settings) =>
      MaterialPageRoute(builder: (_) => page, settings: settings);
}
