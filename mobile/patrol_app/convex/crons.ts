import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "check missed patrols and notify",
  { minutes: 5 },
  internal.missedPatrolScheduler.checkAndNotify,
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

export default crons;