import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:provider/provider.dart';
import '../providers/duty_provider.dart';
import '../providers/shift_provider.dart';
import '../services/location_service.dart';
import '../utils/routes.dart';
import '../utils/theme.dart';

class ScannerScreen extends StatefulWidget {
  const ScannerScreen({super.key});

  @override
  State<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends State<ScannerScreen> {
  final controller = MobileScannerController();
  bool _flashlight = false;
  bool _processingScan = false;
  bool _checkingAccess = true;
  bool _ready = false;
  String? _blockedMessage;

  @override
  void initState() {
    super.initState();
    _prepareScanner();
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  Future<void> _prepareScanner() async {
    final duty = context.read<DutyProvider>();
    final shift = context.read<ShiftProvider>();

    // Off duty means no patrol: the server refuses to record a scan without an
    // open shift, so stop it here with an answer the guard can act on rather
    // than letting them scan into an error.
    await shift.loadStatus(force: true);
    if (!mounted) return;
    if (!shift.onDuty) {
      setState(() {
        _blockedMessage =
            'You are not clocked in. Clock in from the home screen before '
            'scanning — scans taken off duty are not recorded.';
        _checkingAccess = false;
        _ready = false;
      });
      return;
    }

    await duty.load(force: true);
    await duty.checkPendingAcknowledgements();
    if (!mounted) return;

    if (duty.hasPendingAcknowledgements) {
      setState(() {
        _blockedMessage = duty.pendingAcknowledgementCount == 1
            ? 'You have 1 pass-on log that needs to be acknowledged before scanning.'
            : 'You have ${duty.pendingAcknowledgementCount} pass-on logs that need to be acknowledged before scanning.';
        _checkingAccess = false;
        _ready = false;
      });
      return;
    }

    setState(() {
      _blockedMessage = null;
      _checkingAccess = false;
      _ready = true;
    });
    unawaited(LocationService.getCurrentLocation());
  }

  void _onDetect(BarcodeCapture capture) async {
    if (_processingScan) return;
    if (!_ready) return;
    if (capture.barcodes.isEmpty) return;
    String? code = capture.barcodes.first.rawValue;
    if (code == null || code.isEmpty) return;

    // If the scanned QR code is a URL, extract the ID from the end of it
    if (code.startsWith('http') && code.contains('/')) {
      code = code.split('/').last;
    }

    setState(() => _processingScan = true);
    controller.stop();
    final location = await LocationService.getCurrentLocation();
    final hasLocation = location.isSuccess;

    if (!mounted) return;
    Navigator.pushReplacementNamed(
      context,
      AppRoutes.scanResult,
      arguments: {
        'scanData': {
          'checkpointCode': code,
          'gpsLatitude': hasLocation ? location.latitude : null,
          'gpsLongitude': hasLocation ? location.longitude : null,
          'locationCaptured': hasLocation,
          'locationError': location.error,
          'timestamp': DateTime.now().toIso8601String(),
        },
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Scan QR Code'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          // Popping the last route leaves an empty navigator (a black screen
          // with no way out), so fall back to Home when there is nothing under
          // this screen.
          onPressed: () {
            if (Navigator.canPop(context)) {
              Navigator.pop(context);
            } else {
              Navigator.pushNamedAndRemoveUntil(
                context,
                AppRoutes.home,
                (_) => false,
              );
            }
          },
        ),
        actions: [
          IconButton(
            icon: Icon(_flashlight ? Icons.flash_on : Icons.flash_off),
            onPressed: () {
              controller.toggleTorch();
              setState(() => _flashlight = !_flashlight);
            },
          ),
        ],
      ),
      body: _checkingAccess
          ? const Center(child: CircularProgressIndicator())
          : _blockedMessage != null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.assignment_late_outlined,
                      size: 56,
                      color: AppTheme.flagged,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      _blockedMessage!,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: AppTheme.text,
                        fontSize: 15,
                        height: 1.5,
                      ),
                    ),
                    const SizedBox(height: 20),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: () => Navigator.pushReplacementNamed(
                          context,
                          AppRoutes.duties,
                        ),
                        icon: const Icon(Icons.assignment_turned_in_outlined),
                        label: const Text('Open Duties'),
                      ),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton(
                        onPressed: _prepareScanner,
                        child: const Text('Re-check Access'),
                      ),
                    ),
                  ],
                ),
              ),
            )
          : Stack(
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
                        child: CustomPaint(painter: _CornerPainter()),
                      );
                    },
                  ),
                ),
                Positioned(
                  bottom: 80,
                  left: 0,
                  right: 0,
                  child: Column(
                    children: [
                      Icon(
                        Icons.my_location,
                        color: Colors.white.withValues(alpha: 0.8),
                        size: 18,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'GPS captured during scan',
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.8),
                          fontSize: 13,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'Point camera at checkpoint QR code',
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.6),
                          fontSize: 14,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
                if (_processingScan)
                  Positioned.fill(
                    child: Container(
                      color: Colors.black.withValues(alpha: 0.72),
                      child: Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            CircularProgressIndicator(color: AppTheme.primary),
                            const SizedBox(height: 16),
                            const Text(
                              'Processing scan...',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              'Getting GPS and verifying checkpoint',
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
              ],
            ),
    );
  }
}

class _CornerPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = AppTheme.primary
      ..strokeWidth = 4
      ..style = PaintingStyle.stroke;

    const len = 30.0;
    final s = size;
    canvas.drawLine(Offset(0, 0), Offset(len, 0), paint);
    canvas.drawLine(Offset(0, 0), Offset(0, len), paint);
    canvas.drawLine(Offset(s.width - len, 0), Offset(s.width, 0), paint);
    canvas.drawLine(Offset(s.width, 0), Offset(s.width, len), paint);
    canvas.drawLine(Offset(0, s.height - len), Offset(0, s.height), paint);
    canvas.drawLine(Offset(0, s.height), Offset(len, s.height), paint);
    canvas.drawLine(
      Offset(s.width - len, s.height),
      Offset(s.width, s.height),
      paint,
    );
    canvas.drawLine(
      Offset(s.width, s.height - len),
      Offset(s.width, s.height),
      paint,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
