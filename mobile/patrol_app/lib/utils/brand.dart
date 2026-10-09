import 'package:flutter/material.dart';

import 'constants.dart' show isTarmacApp;

/// Company branding for this build, chosen by `--flavor`.
/// Evergreen keeps its original look; Tarmac gets its crest, name and colours.
class Brand {
  Brand._();

  static String get appName => isTarmacApp ? 'Tarmac Security' : 'Patrol Command';
  static String get appNameCaps => appName.toUpperCase();
  static String get tagline =>
      isTarmacApp ? 'Guard Operations' : 'Security Patrol System';
  static String get taglineCaps =>
      isTarmacApp ? 'GUARD OPERATIONS' : 'SECURITY OPERATIONS';

  /// Tarmac's single brand colour. Tarmac surfaces use it flat, no gradients.
  static const Color tarmacBlue = Color(0xFF1E3A8A);

  /// Splash background: flat Tarmac blue; Evergreen keeps its green gradient.
  static List<Color> get splashGradient => isTarmacApp
      ? const [tarmacBlue, tarmacBlue]
      : const [Color(0xFF064E3B), Color(0xFF0F766E)];

  /// Pick the Tarmac colour on Tarmac builds, otherwise the original.
  static Color accent(Color evergreen, Color tarmac) =>
      isTarmacApp ? tarmac : evergreen;

  /// The company mark: Tarmac's crest, or the original widget for Evergreen.
  static Widget mark({required double size, required Widget fallback}) {
    if (!isTarmacApp) return fallback;
    return ClipOval(
      child: Image.asset(
        'assets/images/tarmac_crest.png',
        width: size,
        height: size,
        fit: BoxFit.cover,
      ),
    );
  }
}
