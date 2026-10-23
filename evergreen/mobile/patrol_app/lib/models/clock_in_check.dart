/// How the server confirmed a clock-in: the `checkIn` block of a successful
/// `POST /shifts/clock-in`.
///
/// Older servers do not send it at all, so its absence means "clocked in, no
/// verification details" — never "verified".
class ClockInCheck {
  /// `qr` when the guard scanned the location's clock-in code, `gps` when the
  /// server accepted the phone's position alone.
  final String method;
  final bool verified;
  final String? siteName;

  const ClockInCheck({
    required this.method,
    required this.verified,
    this.siteName,
  });

  bool get byQr => method == 'qr';

  /// Reads the `checkIn` block from a clock-in response, or returns null when
  /// the server did not send one (or sent something unreadable).
  static ClockInCheck? fromResponse(Map<String, dynamic> data) {
    final raw = data['checkIn'];
    if (raw is! Map) return null;
    final method = raw['method'];
    final siteName = raw['siteName'];
    return ClockInCheck(
      method: method is String ? method : 'gps',
      // Only an explicit true counts. Anything else must not put a "Verified"
      // tick in front of a guard.
      verified: raw['verified'] == true,
      siteName: siteName is String && siteName.trim().isNotEmpty
          ? siteName.trim()
          : null,
    );
  }
}
