import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "check missed patrols and notify",
  { minutes: 5 },
  internal.missedPatrolScheduler.checkAndNotify,
  {},
);

// Late-scan alerts: checkpoints not scanned by their start time (WAT). Runs
// every minute so one minute late is caught; does nothing unless
// LATE_SCAN_ALERTS=on is set on the deployment.
crons.interval(
  "late scan alerts",
  { minutes: 1 },
  internal.lateScans.check,
  {},
);

// Rate-limit / load-shedding counter rows expire within seconds-to-minutes of
// their window closing. Sweep them off the hot path so the by_bucketKey lookups
// every protected request makes stay fast and the table doesn't grow unbounded.
crons.interval(
  "purge expired rate-limit counters",
  { minutes: 5 },
  internal.lib.rateLimiter.purgeExpired,
  {},
);

// A guard who goes home without clocking out stays "on patrol" indefinitely:
// their scans keep being accepted and the live map keeps presenting a fix that
// is hours old as a current position. One went 44 hours. Hourly is often
// enough — nothing happens in the gap that was not already happening.
crons.interval(
  "close shifts nobody clocked out of",
  { hours: 1 },
  internal.shifts.autoCloseStaleShifts,
  {},
);

crons.daily(
  "purge expired refresh tokens",
  { hourUTC: 3, minuteUTC: 15 },
  internal.sessions.cleanupExpired,
  {},
);

// officerPositions is the fastest-growing table in the system (a row per guard
// per GPS report, forever). Retention is GPS_POSITION_RETENTION_DAYS, default 30.
crons.daily(
  "purge GPS positions past retention",
  { hourUTC: 3, minuteUTC: 30 },
  internal.positions.purgeOldPositions,
  {},
);

// Blobs that were uploaded straight to storage but whose owning record was
// never created (app killed mid-submit) have no photoAssets row and would
// otherwise be billed forever with nothing pointing at them.
crons.daily(
  "sweep orphaned uploads",
  { hourUTC: 3, minuteUTC: 45 },
  internal.photos.sweepOrphanedUploads,
  {},
);

// Tarmac finance (Nigerian time is UTC+1). Held money whose release date has
// come is shared at 6am; the daily money check runs at 7am; ready payouts are
// sent (when automatic sending is on) and pending ones re-checked every 15 min.
crons.cron("finance: release held money on its date", "0 5 * * *", internal.finance.daily.releaseDue, {});
crons.cron("finance: daily money check", "0 6 * * *", internal.finance.daily.moneyCheck, {});
crons.interval("finance: send and re-check payouts", { minutes: 15 }, internal.finance.payouts.tick, {});

export default crons;