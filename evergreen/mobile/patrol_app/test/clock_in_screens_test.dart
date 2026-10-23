import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:patrol_app/providers/shift_provider.dart';
import 'package:patrol_app/screens/clock_in_scanner_screen.dart';
import 'package:patrol_app/utils/routes.dart';
import 'package:patrol_app/utils/theme.dart';
import 'package:patrol_app/widgets/duty_prompts.dart';

void main() {
  setUp(() {
    // The confirmation card reads settings from secure storage and plays a
    // chime; answer both channels so neither throws off the test.
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(
      const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'),
      (call) async => call.method == 'readAll' ? <String, String>{} : 'false',
    );
  });

  Widget host(Widget child) => MaterialApp(
    theme: AppTheme.theme,
    home: Scaffold(body: child),
  );

  group('ClockInFailureView', () {
    const reason =
        'You are 900m away from EVERGREEN HEAD OFFICE. Go to the main '
        'entrance and scan the QR code there.';

    testWidgets('shows the exact server reason with Retry and Cancel wired', (
      tester,
    ) async {
      var retries = 0;
      var cancels = 0;
      await tester.pumpWidget(
        host(
          ClockInFailureView(
            message: reason,
            onRetry: () => retries++,
            onCancel: () => cancels++,
          ),
        ),
      );

      expect(find.text('Clock-in failed'), findsOneWidget);
      expect(find.text(reason), findsOneWidget);

      await tester.tap(find.text('Retry scan'));
      expect(retries, 1);
      expect(cancels, 0);

      await tester.tap(find.text('Cancel'));
      expect(cancels, 1);
      expect(retries, 1);
    });

    testWidgets('after a 409 it says the guard is clocked in, with no retry', (
      tester,
    ) async {
      var cancels = 0;
      await tester.pumpWidget(
        host(
          ClockInFailureView(
            message: 'Already clocked in — end current shift first',
            alreadyOnDuty: true,
            onRetry: () => fail('there is nothing to retry'),
            onCancel: () => cancels++,
          ),
        ),
      );

      expect(find.text('You are already clocked in'), findsOneWidget);
      expect(find.text('Clock-in failed'), findsNothing);
      expect(find.text('Retry scan'), findsNothing);
      // "end current shift first" is advice for a different situation; it
      // must not reach a guard whose shift is simply already open.
      expect(find.textContaining('end current shift first'), findsNothing);

      await tester.tap(find.text('Back to home'));
      expect(cancels, 1);
    });

    testWidgets('a long reason fits the smallest phone without overflow', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(320, 568);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(
        host(
          ClockInFailureView(
            message: List.filled(8, reason).join(' '),
            onRetry: () {},
            onCancel: () {},
          ),
        ),
      );
      expect(tester.takeException(), isNull);
      // The buttons are reachable by scrolling even when the text is long.
      await tester.scrollUntilVisible(find.text('Cancel'), 200);
      expect(find.text('Cancel'), findsOneWidget);
    });
  });

  group('Clock in from home', () {
    /// Stands in for the camera screen: pops with whatever the real one
    /// would, so the home-side wiring can be checked without a camera.
    Route<dynamic> routes(RouteSettings settings, {required bool clockedIn}) {
      if (settings.name == AppRoutes.clockIn) {
        return MaterialPageRoute<bool>(
          settings: settings,
          builder: (context) => Scaffold(
            body: Center(
              child: TextButton(
                onPressed: () => Navigator.of(context).pop(clockedIn),
                child: const Text('fake scanner'),
              ),
            ),
          ),
        );
      }
      return MaterialPageRoute<void>(
        settings: settings,
        builder: (context) => Scaffold(
          body: Center(
            child: TextButton(
              onPressed: () => handleDutyToggle(context),
              child: const Text('Clock in'),
            ),
          ),
        ),
      );
    }

    Widget app({required bool clockedIn}) => ChangeNotifierProvider(
      create: (_) => ShiftProvider(),
      child: MaterialApp(
        theme: AppTheme.theme,
        onGenerateRoute: (s) => routes(s, clockedIn: clockedIn),
      ),
    );

    testWidgets('tapping Clock in opens the clock-in scanner, not a clock-in', (
      tester,
    ) async {
      await tester.pumpWidget(app(clockedIn: false));
      await tester.tap(find.text('Clock in'));
      await tester.pumpAndSettle();
      expect(find.text('fake scanner'), findsOneWidget);

      // Backing out of the scanner leaves the guard where they were, with no
      // confirmation card.
      await tester.tap(find.text('fake scanner'));
      await tester.pumpAndSettle();
      expect(find.text('Clock in'), findsOneWidget);
      expect(find.text('Start patrolling'), findsNothing);
    });

    testWidgets('a successful scan comes back to the confirmation card', (
      tester,
    ) async {
      await tester.pumpWidget(app(clockedIn: true));
      await tester.tap(find.text('Clock in'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('fake scanner'));
      await tester.pumpAndSettle();

      // No checkIn details from the server: a plain "Clocked in", never
      // "Verified".
      expect(find.text('Clocked in'), findsOneWidget);
      expect(find.text('Verified'), findsNothing);

      await tester.tap(find.text('Start patrolling'));
      await tester.pumpAndSettle();
      expect(find.text('Clocked in'), findsNothing);
    });
  });

  group('showClockInConfirmation', () {
    testWidgets('names the site and shows Verified when the server says so', (
      tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.theme,
          home: Builder(
            builder: (context) => TextButton(
              onPressed: () => showClockInConfirmation(
                context,
                clockInTime: DateTime(2026, 10, 21, 8, 15),
                siteName: 'EVERGREEN HEAD OFFICE',
                verified: true,
              ),
              child: const Text('go'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('go'));
      await tester.pumpAndSettle();

      expect(find.text('Clocked in at EVERGREEN HEAD OFFICE'), findsOneWidget);
      expect(find.text('Verified'), findsOneWidget);

      // Let the card's own 4-second auto-close run out.
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();
      expect(find.text('Verified'), findsNothing);
    });
  });
}
