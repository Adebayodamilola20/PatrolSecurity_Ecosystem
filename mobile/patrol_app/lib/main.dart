import 'package:flutter/material.dart';
import 'utils/theme.dart';
import 'utils/routes.dart';
import 'utils/constants.dart';
import 'screens/splash_screen.dart';
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

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  if (!baseUrl.startsWith('https://')) {
    throw Exception(
      'SECURITY: HTTPS is required. Base URL must use https://. '
      'Current value: $baseUrl',
    );
  }

  bool loggingOut = false;
  ApiService.onUnauthorized = () {
    if (loggingOut) return;
    loggingOut = true;
    const storage = FlutterSecureStorage();
    storage.delete(key: 'patrol_token');
    storage.delete(key: 'patrol_user');
    navigatorKey.currentState?.pushNamedAndRemoveUntil(
      AppRoutes.login,
      (_) => false,
    );
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

class PatrolApp extends StatelessWidget {
  const PatrolApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: navigatorKey,
      title: 'Patrol Command',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.theme,
      initialRoute: AppRoutes.splash,
      onGenerateRoute: (settings) {
        final args = settings.arguments as Map<String, dynamic>?;
        switch (settings.name) {
          case AppRoutes.splash:
            return _route(const SplashScreen());
          case AppRoutes.login:
            return _route(const LoginScreen());
          case AppRoutes.home:
            return _route(const HomeScreen());
          case AppRoutes.scanner:
            return _route(const ScannerScreen());
          case AppRoutes.scanResult:
            return _route(
              ScanResultScreen(
                scanData: args?['scanData'] as Map<String, dynamic>?,
              ),
            );
          case AppRoutes.duties:
            return _route(const DutiesScreen());
          case AppRoutes.history:
            return _route(const HistoryScreen());
          case AppRoutes.scanDetail:
            return _route(ScanDetailScreen(scanId: args?['scanId'] as String?));
          case AppRoutes.checkpoints:
            return _route(const CheckpointsScreen());
          case AppRoutes.checkpointDetail:
            return _route(
              CheckpointDetailScreen(
                checkpointId: args?['checkpointId'] as String?,
              ),
            );
          case AppRoutes.reports:
            return _route(ReportsScreen(
              initialTab: args?['tab'] as int?,
            ));
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
            );
          case AppRoutes.patrol:
            return _route(const PatrolScreen());
          case AppRoutes.policy:
            return _route(const DutiesScreen());
          case AppRoutes.truckCheck:
            return _route(const TruckCheckScreen());
          case AppRoutes.visitorCheck:
            return _route(const VisitorCheckScreen());
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
            );
          case AppRoutes.profile:
            return _route(const ProfileScreen());
          case AppRoutes.settings:
            return _route(const SettingsScreen());
          default:
            return _route(const SplashScreen());
        }
      },
    );
  }

  MaterialPageRoute _route(Widget page) =>
      MaterialPageRoute(builder: (_) => page);
}
