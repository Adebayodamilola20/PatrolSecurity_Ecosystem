import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:provider/provider.dart';
import 'package:vibration/vibration.dart';

import '../providers/shift_provider.dart';
import '../utils/app_time.dart';
import '../utils/theme.dart';

/// Prompts around going on and off duty.
///
/// Both rise from the bottom of the screen and settle in the middle, which is
/// the same gesture the officer just made with their thumb, and neither takes
/// them off the screen they were on.

Future<bool> _vibrationEnabled() async {
  try {
    final v = await const FlutterSecureStorage().read(key: 'setting_vibration');
    return (v ?? 'true') == 'true';
  } catch (_) {
    return true;
  }
}

/// Fire-and-forget chime. The player is disposed when the clip finishes, since
/// nothing here outlives the prompt. Audio is a nice-to-have — a handset on
/// silent, or with no audio route, must never break clocking in.
Future<void> _playChime(String asset) async {
  // Honours the Alert Sound setting. It used to be written and never read, so
  // turning it off changed nothing.
  try {
    final enabled =
        await const FlutterSecureStorage().read(key: 'setting_alertsound');
    if ((enabled ?? 'true') != 'true') return;
  } catch (_) {
    // Unreadable storage shouldn't silence a confirmation the guard expects.
  }

  final player = AudioPlayer();
  try {
    await player.play(AssetSource(asset));
    await player.onPlayerComplete.first.timeout(const Duration(seconds: 3));
  } catch (_) {
    // Ignored on purpose: see above.
  } finally {
    await player.dispose().catchError((_) {});
  }
}

/// Slide up from the bottom edge and land centred, easing out so it arrives
/// gently rather than snapping into place.
Widget _riseFromBottom(Animation<double> animation, Widget child) {
  final curved = CurvedAnimation(
    parent: animation,
    curve: Curves.easeOutCubic,
    reverseCurve: Curves.easeInCubic,
  );
  return FadeTransition(
    opacity: curved,
    child: SlideTransition(
      position: Tween<Offset>(
        begin: const Offset(0, 1),
        end: Offset.zero,
      ).animate(curved),
      child: child,
    ),
  );
}

/// Runs the duty toggle and reports the outcome.
///
/// Clocking in gets the confirmation card, because the time the shift started
/// is the thing an officer wants to be certain of and a snackbar was too small
/// and too brief to carry it. Clocking out, and any failure, stays a snackbar —
/// a card in the middle of the screen would be in the way of someone who is
/// leaving.
Future<void> handleDutyToggle(BuildContext context) async {
  final shift = context.read<ShiftProvider>();
  final wasOnDuty = shift.onDuty;
  final ok = wasOnDuty ? await shift.clockOut() : await shift.clockIn();
  if (!context.mounted) return;

  if (ok && !wasOnDuty) {
    // clockIn() reloads the shift, so the time here is the server's, not the
    // handset's. The fallback only covers a payload that never carried one.
    await showClockInConfirmation(
      context,
      clockInTime: shift.clockInTime ?? DateTime.now(),
      siteLabel: shift.siteLabel,
    );
    return;
  }

  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(
        ok
            ? 'Clocked out successfully'
            : (shift.error ??
                  'Action failed. Check your connection and try again.'),
      ),
      backgroundColor: ok ? AppTheme.textSecondary : AppTheme.error,
    ),
  );
}

/// Confirms a clock-in: rises to the centre, names the time the shift started,
/// and chimes.
///
/// It closes itself after a few seconds so an officer who is already walking
/// doesn't have to dismiss it, but stays tappable so anyone who wants it gone
/// sooner can say so.
Future<void> showClockInConfirmation(
  BuildContext context, {
  required DateTime clockInTime,
  String? siteLabel,
}) async {
  unawaited(_playChime('sounds/success.wav'));
  unawaited(() async {
    if (await _vibrationEnabled()) {
      try {
        await Vibration.vibrate(duration: 60);
      } catch (_) {}
    }
  }());

  final navigator = Navigator.of(context, rootNavigator: true);
  var closed = false;
  void close() {
    if (closed) return;
    closed = true;
    if (navigator.canPop()) navigator.pop();
  }

  final timer = Timer(const Duration(seconds: 4), close);

  await showGeneralDialog<void>(
    context: context,
    barrierDismissible: true,
    barrierLabel: 'Clocked in',
    barrierColor: Colors.black54,
    transitionDuration: const Duration(milliseconds: 320),
    transitionBuilder: (_, animation, _, child) =>
        _riseFromBottom(animation, child),
    pageBuilder: (_, _, _) => Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Material(
          color: Colors.transparent,
          child: GestureDetector(
            onTap: close,
            child: Container(
              padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
              decoration: BoxDecoration(
                color: AppTheme.card,
                borderRadius: BorderRadius.circular(24),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.18),
                    blurRadius: 32,
                    offset: const Offset(0, 12),
                  ),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(
                      color: AppTheme.verified.withValues(alpha: 0.12),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.check_rounded,
                      size: 34,
                      color: AppTheme.verified,
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    "You're on duty",
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.text,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Clocked in at ${AppTime.time(clockInTime)}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 15,
                      color: AppTheme.text,
                    ),
                  ),
                  if (siteLabel != null && siteLabel.trim().isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      siteLabel,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 13,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                  ],
                  const SizedBox(height: 18),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: close,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppTheme.verified,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      child: const Text('Start patrolling'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );

  timer.cancel();
}

/// Explains that a patrol needs an open shift.
///
/// This replaces walking the officer to the scanner just to be told no: the
/// answer arrives on the screen holding the clock-in control they need. The
/// scanner keeps its own check for anything that reaches it another way.
Future<void> showClockInRequired(BuildContext context) {
  return showGeneralDialog<void>(
    context: context,
    barrierDismissible: true,
    barrierLabel: 'Clock in required',
    barrierColor: Colors.black54,
    transitionDuration: const Duration(milliseconds: 320),
    transitionBuilder: (_, animation, _, child) =>
        _riseFromBottom(animation, child),
    pageBuilder: (dialogContext, _, _) => Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Material(
          color: Colors.transparent,
          child: Container(
            padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
            decoration: BoxDecoration(
              color: AppTheme.card,
              borderRadius: BorderRadius.circular(24),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.18),
                  blurRadius: 32,
                  offset: const Offset(0, 12),
                ),
              ],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    color: AppTheme.flagged.withValues(alpha: 0.12),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.schedule_rounded,
                    size: 32,
                    color: AppTheme.flagged,
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Clock in first',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.text,
                  ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Start your shift before patrolling. Scans taken off duty '
                  'are not recorded and never reach the dashboard.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 14,
                    height: 1.4,
                    color: AppTheme.textSecondary,
                  ),
                ),
                const SizedBox(height: 18),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: () => Navigator.of(dialogContext).pop(),
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    child: const Text('Got it'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}
