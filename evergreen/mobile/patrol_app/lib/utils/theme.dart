import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Brand theme with a light (default) and dark variant.
///
/// Light mode: white/near-white background, emerald brand color, slate text.
/// Dark mode: black background, white text, same emerald/red/amber accents.
///
/// All tokens are getters resolving against [darkMode] so existing
/// `AppTheme.x` call sites pick the active palette automatically. Getters
/// cannot appear inside `const` expressions.
class AppTheme {
  AppTheme._();

  /// Whole-app dark mode flag. main.dart listens to this and rebuilds.
  static final ValueNotifier<bool> darkMode = ValueNotifier<bool>(false);

  static bool get isDark => darkMode.value;

  static void setDarkMode(bool value) {
    if (darkMode.value == value) return;
    darkMode.value = value;
    applySystemChrome();
  }

  static void applySystemChrome() {
    SystemChrome.setSystemUIOverlayStyle(
      isDark
          ? const SystemUiOverlayStyle(
              statusBarBrightness: Brightness.dark,
              statusBarIconBrightness: Brightness.light,
              systemNavigationBarColor: Color(0xFF000000),
              systemNavigationBarIconBrightness: Brightness.light,
            )
          : const SystemUiOverlayStyle(
              statusBarBrightness: Brightness.light,
              statusBarIconBrightness: Brightness.dark,
              systemNavigationBarColor: Color(0xFFF8FAFC),
              systemNavigationBarIconBrightness: Brightness.dark,
            ),
    );
  }

  static const _Palette _light = _Palette(
    background: Color(0xFFF8FAFC),
    card: Colors.white,
    muted: Color(0xFFF1F5F9),
    border: Color(0xFFE2E8F0),
    text: Color(0xFF1E293B),
    textSecondary: Color(0xFF94A3B8),
    textFaint: Color(0xFFCBD5E1),
    primary: Color(0xFF10B981),
    primaryDark: Color(0xFF059669),
    onPrimary: Colors.white,
    primarySurface: Color(0xFFEAF8F0),
    error: Color(0xFFF43F5E),
    errorSurface: Color(0xFFFFE4E8),
    verified: Color(0xFF10B981),
    verifiedSurface: Color(0xFFD1FAE5),
    flagged: Color(0xFFF59E0B),
    flaggedSurface: Color(0xFFFEF3C7),
    info: Color(0xFF3B82F6),
    infoSurface: Color(0xFFDBEAFE),
    onboardingBackground: Color(0xFFF5F7F2),
    onboardingInk: Color(0xFF102D32),
    onboardingMuted: Color(0xFF718387),
    onboardingTrack: Color(0xFFDCE7E1),
    onboardingBorder: Color(0xFFD9E4DE),
  );

  static const _Palette _dark = _Palette(
    background: Color(0xFF000000),
    card: Color(0xFF121417),
    muted: Color(0xFF1C2024),
    border: Color(0xFF2A2F34),
    text: Color(0xFFF8FAFC),
    textSecondary: Color(0xFF94A3B8),
    textFaint: Color(0xFF64748B),
    primary: Color(0xFF10B981),
    primaryDark: Color(0xFF34D399),
    onPrimary: Colors.white,
    primarySurface: Color(0xFF0B2B20),
    error: Color(0xFFFB7185),
    errorSurface: Color(0xFF35141C),
    verified: Color(0xFF34D399),
    verifiedSurface: Color(0xFF0B2B20),
    flagged: Color(0xFFFBBF24),
    flaggedSurface: Color(0xFF33270A),
    info: Color(0xFF60A5FA),
    infoSurface: Color(0xFF14263F),
    // Onboarding is a fixed one-time flow whose artwork paints onboardingInk
    // panels with white content, so its tokens keep the light-mode values.
    onboardingBackground: Color(0xFFF5F7F2),
    onboardingInk: Color(0xFF102D32),
    onboardingMuted: Color(0xFF718387),
    onboardingTrack: Color(0xFFDCE7E1),
    onboardingBorder: Color(0xFFD9E4DE),
  );

  static _Palette get _p => isDark ? _dark : _light;

  static Color get surface => _p.background;
  static Color get card => _p.card;
  static Color get muted => _p.muted;
  static Color get border => _p.border;
  static Color get text => _p.text;
  static Color get textSecondary => _p.textSecondary;
  static Color get textFaint => _p.textFaint;
  static Color get primary => _p.primary;
  static Color get primaryDark => _p.primaryDark;
  static Color get onPrimary => _p.onPrimary;
  static Color get primarySurface => _p.primarySurface;
  static Color get error => _p.error;
  static Color get errorSurface => _p.errorSurface;
  static Color get verified => _p.verified;
  static Color get verifiedSurface => _p.verifiedSurface;
  static Color get flagged => _p.flagged;
  static Color get flaggedSurface => _p.flaggedSurface;
  static Color get info => _p.info;
  static Color get infoSurface => _p.infoSurface;
  static Color get onboardingBackground => _p.onboardingBackground;
  static Color get onboardingInk => _p.onboardingInk;
  static Color get onboardingMuted => _p.onboardingMuted;
  static Color get onboardingTrack => _p.onboardingTrack;
  static Color get onboardingBorder => _p.onboardingBorder;

  static Color get shadow =>
      isDark ? Colors.transparent : Colors.black.withValues(alpha: 0.04);
  static Color get scrim => isDark
      ? Colors.black.withValues(alpha: 0.72)
      : Colors.black.withValues(alpha: 0.55);

  static ThemeData get theme => _build(_light, Brightness.light);
  static ThemeData get darkTheme => _build(_dark, Brightness.dark);

  static ThemeData _build(_Palette p, Brightness brightness) {
    final isDarkTheme = brightness == Brightness.dark;
    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      applyElevationOverlayColor: false,
      primaryColor: p.primary,
      scaffoldBackgroundColor: p.background,
      colorScheme: ColorScheme(
        brightness: brightness,
        primary: p.primary,
        onPrimary: p.onPrimary,
        secondary: p.primaryDark,
        onSecondary: p.onPrimary,
        surface: p.background,
        onSurface: p.text,
        error: p.error,
        onError: isDarkTheme ? const Color(0xFF1A0509) : Colors.white,
        surfaceTint: Colors.transparent,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: p.card,
        foregroundColor: p.text,
        elevation: 0,
        centerTitle: true,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: TextStyle(
          color: p.text,
          fontSize: 18,
          fontWeight: FontWeight.w600,
        ),
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: p.card,
        selectedItemColor: p.primary,
        unselectedItemColor: p.textSecondary,
        type: BottomNavigationBarType.fixed,
        elevation: 8,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: p.primary,
          foregroundColor: p.onPrimary,
          disabledBackgroundColor: p.muted,
          disabledForegroundColor: p.textFaint,
          minimumSize: const Size(double.infinity, 52),
          elevation: 0,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle:
              const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: p.primary,
          foregroundColor: p.onPrimary,
          disabledBackgroundColor: p.muted,
          disabledForegroundColor: p.textFaint,
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: p.primary),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: p.primary,
          side: BorderSide(color: p.border),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: p.card,
        hintStyle: TextStyle(color: p.textSecondary),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: p.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: p.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: p.primary, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: p.error),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: p.error, width: 2),
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      ),
      cardTheme: CardThemeData(
        color: p.card,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(color: p.border),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: p.card,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: TextStyle(
          color: p.text,
          fontSize: 18,
          fontWeight: FontWeight.w600,
        ),
        contentTextStyle: TextStyle(color: p.text, fontSize: 15),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: p.card,
        surfaceTintColor: Colors.transparent,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor:
            isDarkTheme ? const Color(0xFF24292E) : const Color(0xFF1E293B),
        contentTextStyle: const TextStyle(color: Colors.white),
        actionTextColor: p.primaryDark,
        behavior: SnackBarBehavior.floating,
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? p.onPrimary
              : p.textSecondary,
        ),
        trackColor: WidgetStateProperty.resolveWith(
          (states) =>
              states.contains(WidgetState.selected) ? p.primary : p.muted,
        ),
        trackOutlineColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? Colors.transparent
              : p.border,
        ),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: p.primary,
        linearTrackColor: p.muted,
        circularTrackColor: p.muted,
      ),
      dividerTheme: DividerThemeData(color: p.border, thickness: 1),
      listTileTheme: ListTileThemeData(
        iconColor: p.textSecondary,
        textColor: p.text,
      ),
      iconTheme: IconThemeData(color: p.text),
      textTheme: ThemeData(brightness: brightness).textTheme.apply(
            bodyColor: p.text,
            displayColor: p.text,
          ),
    );
  }
}

class _Palette {
  const _Palette({
    required this.background,
    required this.card,
    required this.muted,
    required this.border,
    required this.text,
    required this.textSecondary,
    required this.textFaint,
    required this.primary,
    required this.primaryDark,
    required this.onPrimary,
    required this.primarySurface,
    required this.error,
    required this.errorSurface,
    required this.verified,
    required this.verifiedSurface,
    required this.flagged,
    required this.flaggedSurface,
    required this.info,
    required this.infoSurface,
    required this.onboardingBackground,
    required this.onboardingInk,
    required this.onboardingMuted,
    required this.onboardingTrack,
    required this.onboardingBorder,
  });

  final Color background;
  final Color card;
  final Color muted;
  final Color border;
  final Color text;
  final Color textSecondary;
  final Color textFaint;
  final Color primary;
  final Color primaryDark;
  final Color onPrimary;
  final Color primarySurface;
  final Color error;
  final Color errorSurface;
  final Color verified;
  final Color verifiedSurface;
  final Color flagged;
  final Color flaggedSurface;
  final Color info;
  final Color infoSurface;
  final Color onboardingBackground;
  final Color onboardingInk;
  final Color onboardingMuted;
  final Color onboardingTrack;
  final Color onboardingBorder;
}
