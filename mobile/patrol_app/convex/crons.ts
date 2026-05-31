import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "check missed patrols and notify",
  { minutes: 5 },
  api.missedPatrolScheduler.checkAndNotify,
  {},
);

export default crons;