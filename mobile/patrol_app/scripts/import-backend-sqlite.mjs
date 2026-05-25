import Database from "better-sqlite3";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env.local");
const dbPath =
  process.argv[2] ||
  "/Users/adebayostephenoluwadamilola/Desktop/Patrol_monitoring/backend/patrol.db";

if (!fs.existsSync(envPath)) throw new Error(`Missing ${envPath}`);
if (!fs.existsSync(dbPath)) throw new Error(`Missing ${dbPath}`);

const env = Object.fromEntries(
  fs.readFileSync(envPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const idx = line.indexOf("=");
      return [line.slice(0, idx), line.slice(idx + 1).split(" #")[0].trim()];
    }),
);

const client = new ConvexHttpClient(env.CONVEX_URL);
const db = new Database(dbPath, { readonly: true });

function all(table) {
  return db.prepare(`SELECT * FROM ${table}`).all();
}

async function importTable(label, fn, rows) {
  for (const record of rows) {
    await client.mutation(fn, { record });
  }
  console.log(`imported ${rows.length} ${label}`);
}

await importTable("clients", api.importer.upsertClient, all("clients"));
await importTable("sites", api.importer.upsertSite, all("sites"));
await importTable("users", api.importer.upsertUser, all("users"));
await importTable("user_site_assignments", api.importer.upsertUserSiteAssignment, all("user_site_assignments"));
await importTable("checkpoints", api.importer.upsertCheckpoint, all("checkpoints"));
await importTable("shifts", api.importer.upsertShift, all("shifts"));
await importTable("scans", api.importer.upsertScan, all("scans"));
await importTable("incidents", api.importer.upsertIncident, all("incidents"));
await importTable("reportSubmissions", api.importer.upsertReportSubmission, all("reportSubmissions"));
await importTable("exportFiles", api.importer.upsertExportFile, all("exportFiles"));
await importTable("communicationSettings", api.importer.upsertCommunicationSetting, all("communicationSettings"));
await importTable("emergencyEvents", api.importer.upsertEmergencyEvent, all("emergencyEvents"));
await importTable("passOnLogs", api.importer.upsertPassOnLog, all("passOnLogs"));
await importTable("passOnLogAcknowledgements", api.importer.upsertPassOnLogAcknowledgement, all("passOnLogAcknowledgements"));
await importTable("postOrders", api.importer.upsertPostOrder, all("postOrders"));
await importTable("postOrderCompletions", api.importer.upsertPostOrderCompletion, all("postOrderCompletions"));
await importTable("handovers", api.importer.upsertHandover, all("handovers"));
await importTable("officerPositions", api.importer.upsertOfficerPosition, all("officerPositions"));

console.log("SQLite import into Convex completed.");
