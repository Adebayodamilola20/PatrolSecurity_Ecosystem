import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/duty_provider.dart';
import '../providers/scan_provider.dart';
import '../providers/shift_provider.dart';
import 'routes.dart';

/// Signs the officer out and returns them to the login screen.
///
/// Order is the whole point of this helper. Clearing the providers first
/// repaints the screen the officer is still looking at with empty data — every
/// counter drops to zero — and revoking the session server-side can take up to
/// five seconds on a bad connection. Done in that order the officer watches a
/// zeroed dashboard sit there with nothing to explain it, which reads as a
/// crash rather than a sign-out.
///
/// So: the progress dialog goes up first and covers the screen, the session is
/// revoked, and the providers are only emptied once nothing is left rendering
/// them. Every screen that signs out goes through here, so none of them can
/// drift back into that order or forget a provider — a missed one leaks the
/// previous officer's shift into the next officer's session.
Future<void> signOutAndReturnToLogin(BuildContext context) async {
  final navigator = Navigator.of(context, rootNavigator: true);
  final messenger = ScaffoldMessenger.of(context);
  final auth = context.read<AuthProvider>();
  final scans = context.read<ScanProvider>();
  final shifts = context.read<ShiftProvider>();
  final duty = context.read<DutyProvider>();

  showDialog<void>(
    context: context,
    barrierDismissible: false,
    useRootNavigator: true,
    builder: (_) => const PopScope(
      // Backing out mid-revoke would leave the session half torn down.
      canPop: false,
      child: AlertDialog(
        content: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            SizedBox(width: 16),
            Expanded(child: Text('Signing out…')),
          ],
        ),
      ),
    ),
  );

  try {
    // Best-effort by design: ApiService.logout swallows network failures and
    // clears the local tokens regardless, so an offline officer can still sign
    // out of a shared handset.
    await auth.logout();
  } finally {
    scans.clearData();
    shifts.clearData();
    duty.clearData();

    // Close the dialog, then drop every screen behind it — the officer must not
    // be able to swipe back into a dashboard they no longer have a token for.
    navigator.pop();
    navigator.pushNamedAndRemoveUntil(AppRoutes.login, (_) => false);
    messenger.showSnackBar(
      const SnackBar(
        content: Text('Signed out'),
        duration: Duration(seconds: 2),
      ),
    );
  }
}
