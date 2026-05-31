import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "check missed patrols and notify",
  { minutes: 5 },
  internal.missedPatrolScheduler.checkAndNotify,
  {},
);

export default crons;