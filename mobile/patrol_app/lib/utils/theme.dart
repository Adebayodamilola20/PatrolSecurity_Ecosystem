import 'package:flutter/material.dart';

class AppTheme {
  static const Color primary = Color(0xFF10B981);
  static const Color primaryDark = Color(0xFF059669);
  static const Color surface = Color(0xFFF8FAFC);
  static const Color card = Colors.white;
  static const Color text = Color(0xFF1E293B);
  static const Color textSecondary = Color(0xFF94A3B8);
  static const Color border = Color(0xFFE2E8F0);
  static const Color error = Color(0xFFF43F5E);
  static const Color verified = Color(0xFF10B981);
  static const Color flagged = Color(0xFFF59E0B);

  static ThemeData get theme => ThemeData(
        useMaterial3: true,
        brightness: Brightness.light,
        primaryColor: primary,
        scaffoldBackgroundColor: surface,
        colorScheme: ColorScheme.light(
          primary: primary,
          secondary: primaryDark,
          surface: surface,
          error: error,
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: Colors.white,
          foregroundColor: text,
          elevation: 0,
          centerTitle: true,
          titleTextStyle: TextStyle(
            color: text,
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
        bottomNavigationBarTheme: const BottomNavigationBarThemeData(
          backgroundColor: Colors.white,
          selectedItemColor: primary,
          unselectedItemColor: textSecondary,
          type: BottomNavigationBarType.fixed,
          elevation: 8,
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: primary,
            foregroundColor: Colors.white,
            minimumSize: const Size(double.infinity, 52),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            textStyle: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: border),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: border),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: primary, width: 2),
          ),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 16,
          ),
        ),
        cardTheme: CardThemeData(
          color: card,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: const BorderSide(color: border),
          ),
        ),
      );
}
