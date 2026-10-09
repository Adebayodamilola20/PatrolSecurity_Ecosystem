import 'package:intl/intl.dart';

/// Time formatting for a Nigerian security operation.
///
/// The backend serialises every timestamp with `toISOString()`, so what arrives
/// is UTC. `DateTime.parse` on that returns a UTC `DateTime`, and `DateFormat`
/// renders whatever it is handed — so formatting the parsed value directly
/// printed UTC and a guard who clocked in at 11:00 saw 10:00. Nothing in the app
/// called `toLocal()`.
///
/// Converting to device-local time would fix the common case but leaves the
/// displayed hour at the mercy of the handset's clock settings: a phone set to
/// the wrong region would quietly mis-stamp patrol evidence. These times are
/// operational facts about a Nigerian site, so they are pinned to Nigerian time
/// regardless of the device.
///
/// West Africa Time is UTC+1 year-round — Nigeria has never observed daylight
/// saving — so a fixed offset is exact here and avoids shipping a timezone
/// database for one zone.
class AppTime {
  const AppTime._();

  static const Duration _watOffset = Duration(hours: 1);

  /// Shifts [value] onto the Nigerian wall clock.
  ///
  /// The result is a `DateTime` whose *fields* read as Nigerian local time. It is
  /// for display only — never send one back to the server or compare it against
  /// a real instant, or the offset gets applied twice.
  static DateTime toLagos(DateTime value) => value.toUtc().add(_watOffset);

  /// e.g. `3:20 PM`
  static String time(DateTime value) =>
      DateFormat('h:mm a').format(toLagos(value));

  /// e.g. `15:20`
  static String time24(DateTime value) =>
      DateFormat('HH:mm').format(toLagos(value));

  /// e.g. `Jul 29, 2026 – 3:20 PM`
  static String dateTime(DateTime value) =>
      DateFormat('MMM d, yyyy – h:mm a').format(toLagos(value));

  /// e.g. `Jul 29, 2026`
  static String date(DateTime value) =>
      DateFormat('MMM d, yyyy').format(toLagos(value));

  /// Today's date on the Nigerian clock, for report/export day boundaries. Using
  /// the device date here would roll a shift into the wrong day either side of
  /// midnight.
  static DateTime todayInLagos() {
    final now = toLagos(DateTime.now());
    return DateTime(now.year, now.month, now.day);
  }
}
