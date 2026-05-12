import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
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

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) async {
    if (capture.barcodes.isEmpty) return;
    final code = capture.barcodes.first.rawValue;
    if (code == null) return;

    controller.stop();
    final pos = await LocationService.getCurrentLocation();

    if (!mounted) return;
    Navigator.pushReplacementNamed(
      context,
      AppRoutes.scanResult,
      arguments: {
        'scanData': {
          'checkpointCode': code,
          'gpsLatitude': pos?.latitude ?? 0,
          'gpsLongitude': pos?.longitude ?? 0,
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
          onPressed: () => Navigator.pop(context),
        ),
        actions: [
          IconButton(
            icon: Icon(
              _flashlight ? Icons.flash_on : Icons.flash_off,
            ),
            onPressed: () {
              controller.toggleTorch();
              setState(() => _flashlight = !_flashlight);
            },
          ),
        ],
      ),
      body: Stack(
        children: [
          MobileScanner(
            controller: controller,
            onDetect: _onDetect,
          ),
          Center(
            child: Container(
              width: 250,
              height: 250,
              decoration: BoxDecoration(
                border: Border.all(color: Colors.white, width: 2),
                borderRadius: BorderRadius.circular(16),
              ),
              child: CustomPaint(
                painter: _CornerPainter(),
              ),
            ),
          ),
          Positioned(
            bottom: 80,
            left: 0,
            right: 0,
            child: Column(
              children: [
                Icon(Icons.my_location,
                    color: Colors.white.withOpacity(0.8), size: 18),
                const SizedBox(height: 4),
                Text(
                  'GPS: Active',
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.8),
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  'Point camera at checkpoint QR code',
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.6),
                    fontSize: 14,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
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
        Offset(s.width - len, s.height), Offset(s.width, s.height), paint);
    canvas.drawLine(
        Offset(s.width, s.height - len), Offset(s.width, s.height), paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
