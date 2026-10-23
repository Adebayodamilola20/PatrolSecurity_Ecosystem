import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:provider/provider.dart';

import '../providers/shift_provider.dart';
import '../utils/routes.dart';
import '../utils/theme.dart';
import 'scanner_screen.dart' show ScanCornerPainter;

/// Clocking in: the guard scans the location QR fixed at the main entrance, and
/// the server checks the code and their GPS before opening the shift.
///
/// This is its own screen rather than a mode of [ScannerScreen] because the two
/// share almost nothing past the camera. The patrol scanner refuses to open off
/// duty, waits on pass-on acknowledgements, rewrites URL codes and hands off to
/// the scan result screen; this one must open off duty, send the code exactly
/// as read, and keep the guard here until the server has answered.
///
/// Pops `true` once the guard is clocked in, so the caller can show the
/// confirmation over the home screen; anything else means no new shift.
class ClockInScannerScreen extends StatefulWidget {
  const ClockInScannerScreen({super.key});

  @override
  State<ClockInScannerScreen> createState() => _ClockInScannerScreenState();
}

class _ClockInScannerScreenState extends State<ClockInScannerScreen> {
  final controller = MobileScannerController();
  bool _flashlight = false;
  bool _processingScan = false;
  bool _usedQr = true;
  String? _failure;
  bool _alreadyOnDuty = false;

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_processingScan || _failure != null) return;
    if (capture.barcodes.isEmpty) return;
    final code = capture.barcodes.first.rawValue;
    if (code == null || code.isEmpty) return;
    _clockIn(locationCode: code);
  }

  /// Clocks in with the scanned [locationCode], or on GPS alone when it is
  /// null ("Can't scan?"). The server decides whether that is allowed.
  Future<void> _clockIn({String? locationCode}) async {
    if (_processingScan) return;
    final shift = context.read<ShiftProvider>();
    setState(() {
      _processingScan = true;
      _usedQr = locationCode != null;
    });
    // A camera that never started (permission refused) has nothing to stop;
    // that must not get in the way of the clock-in itself.
    unawaited(controller.stop().catchError((_) {}));

    final ok = await shift.clockIn(locationCode: locationCode);
    if (!mounted) return;

    if (ok) {
      Navigator.of(context).pop(true);
      return;
    }
    setState(() {
      _processingScan = false;
      _failure = shift.error ?? 'The clock-in did not go through. Try again.';
      // ShiftProvider resyncs with the server after any failure, so this is
      // the server's word: most often a 409 from a shift that is already
      // open, which the guard should hear as good news, not as a failure.
      _alreadyOnDuty = shift.onDuty;
    });
  }

  void _retry() {
    setState(() {
      _failure = null;
      _alreadyOnDuty = false;
    });
    // If the camera cannot start, MobileScanner shows why in its own error
    // state, and "Can't scan?" is still there underneath.
    unawaited(controller.start().catchError((_) {}));
  }

  void _leave() {
    // Popping the last route leaves an empty navigator (a black screen with
    // no way out), so fall back to Home when there is nothing under this one.
    final navigator = Navigator.of(context);
    if (navigator.canPop()) {
      navigator.pop(false);
    } else {
      navigator.pushNamedAndRemoveUntil(AppRoutes.home, (_) => false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final failed = _failure != null;
    return PopScope(
      // Leaving mid-request would drop the answer on the floor: the shift may
      // open with no confirmation, or fail with no reason given.
      canPop: !_processingScan,
      child: Scaffold(
        appBar: AppBar(
          title: Text(failed ? 'Clock in' : 'Scan your location QR'),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: _processingScan ? null : _leave,
          ),
          actions: [
            if (!failed)
              IconButton(
                icon: Icon(_flashlight ? Icons.flash_on : Icons.flash_off),
                onPressed: _processingScan
                    ? null
                    : () {
                        controller.toggleTorch();
                        setState(() => _flashlight = !_flashlight);
                      },
              ),
          ],
        ),
        body: Stack(
          children: [
            MobileScanner(controller: controller, onDetect: _onDetect),
            Center(
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final size = constraints.biggest.shortestSide * 0.75;
                  return Container(
                    width: size.clamp(200, 300),
                    height: size.clamp(200, 300),
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.white, width: 2),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: CustomPaint(painter: ScanCornerPainter()),
                  );
                },
              ),
            ),
            Positioned(
              bottom: 24,
              left: 24,
              right: 24,
              child: SafeArea(
                top: false,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.door_front_door_outlined,
                      color: Colors.white.withValues(alpha: 0.85),
                      size: 22,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Scan the QR code at the main entrance of your location.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.9),
                        fontSize: 15,
                        height: 1.4,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextButton(
                      onPressed: _processingScan
                          ? null
                          : () => _clockIn(locationCode: null),
                      style: TextButton.styleFrom(
                        foregroundColor: Colors.white,
                        minimumSize: const Size(48, 48),
                      ),
                      child: const Text(
                        "Can't scan? Clock in with GPS",
                        style: TextStyle(
                          fontSize: 14,
                          decoration: TextDecoration.underline,
                          decorationColor: Colors.white,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (_processingScan)
              Positioned.fill(
                child: Container(
                  color: Colors.black.withValues(alpha: 0.72),
                  child: Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          CircularProgressIndicator(color: AppTheme.primary),
                          const SizedBox(height: 16),
                          const Text(
                            'Verifying your location…',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            _usedQr
                                ? 'Checking the code and your GPS'
                                : 'Checking your GPS position',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.75),
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            if (failed)
              Positioned.fill(
                child: ClockInFailureView(
                  message: _failure!,
                  alreadyOnDuty: _alreadyOnDuty,
                  onRetry: _retry,
                  onCancel: _leave,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// What a guard sees when a clock-in does not go through: the server's exact
/// reason, a big "Retry scan" and a way back home.
///
/// When the server turns out to hold an open shift for them already (a 409, or
/// a request that timed out after it landed), there is nothing to retry — the
/// view says they are clocked in and only offers the way home.
class ClockInFailureView extends StatelessWidget {
  const ClockInFailureView({
    super.key,
    required this.message,
    required this.onRetry,
    required this.onCancel,
    this.alreadyOnDuty = false,
  });

  final String message;
  final bool alreadyOnDuty;
  final VoidCallback onRetry;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final accent = alreadyOnDuty ? AppTheme.verified : AppTheme.error;
    return ColoredBox(
      color: AppTheme.surface,
      child: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: BoxConstraints(
                minHeight: (constraints.maxHeight - 48).clamp(
                  0,
                  double.infinity,
                ),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    width: 80,
                    height: 80,
                    decoration: BoxDecoration(
                      color: accent.withValues(alpha: 0.12),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      alreadyOnDuty
                          ? Icons.check_rounded
                          : Icons.error_outline_rounded,
                      size: 44,
                      color: accent,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    alreadyOnDuty
                        ? 'You are already clocked in'
                        : 'Clock-in failed',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                      color: alreadyOnDuty ? AppTheme.text : AppTheme.error,
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (alreadyOnDuty)
                    Text(
                      'Your shift is already open. Carry on from the home '
                      'screen.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 15,
                        height: 1.45,
                        color: AppTheme.textSecondary,
                      ),
                    )
                  else
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: AppTheme.errorSurface,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: AppTheme.error.withValues(alpha: 0.25),
                        ),
                      ),
                      child: Text(
                        message,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 15,
                          height: 1.45,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.text,
                        ),
                      ),
                    ),
                  const SizedBox(height: 28),
                  if (alreadyOnDuty)
                    SizedBox(
                      width: double.infinity,
                      height: 56,
                      child: ElevatedButton.icon(
                        onPressed: onCancel,
                        icon: const Icon(Icons.home_outlined),
                        label: const Text(
                          'Back to home',
                          style: TextStyle(fontSize: 17),
                        ),
                      ),
                    )
                  else ...[
                    SizedBox(
                      width: double.infinity,
                      height: 56,
                      child: ElevatedButton.icon(
                        onPressed: onRetry,
                        icon: const Icon(Icons.qr_code_scanner),
                        label: const Text(
                          'Retry scan',
                          style: TextStyle(fontSize: 17),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: OutlinedButton(
                        onPressed: onCancel,
                        child: const Text('Cancel'),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
