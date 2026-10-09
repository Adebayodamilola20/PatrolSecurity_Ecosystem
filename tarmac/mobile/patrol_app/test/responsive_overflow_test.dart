import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:patrol_app/providers/auth_provider.dart';
import 'package:patrol_app/providers/duty_provider.dart';
import 'package:patrol_app/providers/scan_provider.dart';
import 'package:patrol_app/providers/shift_provider.dart';
import 'package:patrol_app/screens/checkpoint_detail_screen.dart';
import 'package:patrol_app/screens/checkpoints_screen.dart';
import 'package:patrol_app/screens/duties_screen.dart';
import 'package:patrol_app/screens/history_screen.dart';
import 'package:patrol_app/screens/home_screen.dart';
import 'package:patrol_app/screens/login_screen.dart';
import 'package:patrol_app/screens/onboarding_screen.dart';
import 'package:patrol_app/screens/patrol_screen.dart';
import 'package:patrol_app/screens/profile_screen.dart';
import 'package:patrol_app/screens/reports_screen.dart';
import 'package:patrol_app/screens/scan_detail_screen.dart';
import 'package:patrol_app/screens/scan_result_screen.dart';
import 'package:patrol_app/screens/settings_screen.dart';
import 'package:patrol_app/screens/truck_check_screen.dart';
import 'package:patrol_app/screens/visitor_check_screen.dart';
import 'package:patrol_app/utils/theme.dart';

/// Renders the main screens at the narrowest phone sizes we support and fails
/// on any RenderFlex overflow. The smallest is 320x568 (iPhone SE 1st gen),
/// which is narrower than anything currently in the wild — if it fits there it
/// fits everywhere.
void main() {
  const sizes = <String, Size>{
    'iPhone SE (320x568)': Size(320, 568),
    'iPhone SE 2/3 (375x667)': Size(375, 667),
    'iPhone 14 Pro (393x852)': Size(393, 852),
    'small tablet (600x800)': Size(600, 800),
  };

  setUp(() {
    // The screens read tokens and hit plugins on init; answer both so the
    // widget tree builds instead of dying before layout runs.
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
      const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'),
      (call) async => call.method == 'readAll' ? <String, String>{} : null,
    );
  });

  Widget wrap(Widget child) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(create: (_) => ScanProvider()),
        ChangeNotifierProvider(create: (_) => ShiftProvider()),
        ChangeNotifierProvider(create: (_) => DutyProvider()),
      ],
      child: MaterialApp(
        theme: AppTheme.theme,
        darkTheme: AppTheme.darkTheme,
        home: child,
      ),
    );
  }

  // Two screens are left out on purpose. WorkflowModuleScreen has no default
  // constructor and every layout it can produce is covered below.
  // SplashScreen arms a 700ms navigation timer in initState, so the binding
  // fails it for a pending timer before layout is ever asserted — and it is a
  // single centred logo with nothing to overflow.
  final screens = <String, Widget Function()>{
    'SettingsScreen': () => const SettingsScreen(),
    'HomeScreen': () => const HomeScreen(),
    'LoginScreen': () => const LoginScreen(),
    'OnboardingScreen': () => const OnboardingScreen(),
    'CheckpointsScreen': () => const CheckpointsScreen(),
    'CheckpointDetailScreen': () => const CheckpointDetailScreen(),
    'DutiesScreen': () => const DutiesScreen(),
    'HistoryScreen': () => const HistoryScreen(),
    'PatrolScreen': () => const PatrolScreen(),
    'ProfileScreen': () => const ProfileScreen(),
    'ReportsScreen': () => const ReportsScreen(),
    'ScanDetailScreen': () => const ScanDetailScreen(),
    'ScanResultScreen': () => const ScanResultScreen(),
    'TruckCheckScreen': () => const TruckCheckScreen(),
    'VisitorCheckScreen': () => const VisitorCheckScreen(),
  };

  for (final mode in [false, true]) {
    final modeLabel = mode ? 'dark' : 'light';
    for (final screen in screens.entries) {
      for (final size in sizes.entries) {
        testWidgets('${screen.key} has no overflow at ${size.key} ($modeLabel)',
            (tester) async {
          AppTheme.darkMode.value = mode;
          addTearDown(() => AppTheme.darkMode.value = false);

          tester.view.physicalSize = size.value;
          tester.view.devicePixelRatio = 1.0;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);

          // Collect everything rather than forwarding to the binding: these
          // screens hit plugins and network on init, and those failures are
          // not what this test is about.
          final overflows = <String>[];
          final others = <String>[];
          final previousOnError = FlutterError.onError;
          FlutterError.onError = (details) {
            final text = details.exceptionAsString();
            if (text.contains('overflowed by')) {
              // Keep the widget chain: the first line alone never says which
              // widget blew out.
              final chain = details.informationCollector
                      ?.call()
                      .map((n) => n.toString())
                      .firstWhere(
                        (d) => d.startsWith('debugCreator'),
                        orElse: () => '',
                      ) ??
                  '';
              overflows.add('${text.split('\n').first}\n  $chain');
            } else {
              others.add(text.split('\n').first);
            }
          };

          // A single frame is enough: RenderFlex overflow is reported during
          // layout, so it surfaces on the first pump. Pumping further would
          // advance the screens' real network timers and hang the suite.
          await tester.pumpWidget(wrap(screen.value()));

          // Restore before expect(), otherwise the binding asserts that the
          // test leaked its error handler.
          FlutterError.onError = previousOnError;
          tester.takeException();

          // Tear the tree down so the screens' controllers and timers are
          // disposed instead of leaking into the next case.
          await tester.pumpWidget(const SizedBox.shrink());
          tester.takeException();

          expect(
            overflows,
            isEmpty,
            reason: '${screen.key} overflowed at ${size.key} in $modeLabel '
                'mode:\n${overflows.join('\n')}'
                '${others.isEmpty ? '' : '\n(non-layout errors: $others)'}',
          );
        });
      }
    }
  }
}
