import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'patrol.db')

const db = new Database(dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','supervisor','officer')),
    phone TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    createdAt TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS checkpoints (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    radiusMeters REAL DEFAULT 50,
    expectedIntervalMinutes INTEGER DEFAULT 30,
    active INTEGER DEFAULT 1,
    createdAt TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    officerId TEXT NOT NULL,
    checkpointId TEXT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    severity TEXT DEFAULT 'low' CHECK(severity IN ('low','medium','high','critical')),
    status TEXT DEFAULT 'open' CHECK(status IN ('open','investigating','resolved')),
    reportedAt TEXT DEFAULT (datetime('now')),
    resolvedAt TEXT,
    FOREIGN KEY (officerId) REFERENCES users(id),
    FOREIGN KEY (checkpointId) REFERENCES checkpoints(id)
  );

  CREATE TABLE IF NOT EXISTS scans (
    id TEXT PRIMARY KEY,
    officerId TEXT NOT NULL,
    checkpointId TEXT NOT NULL,
    scannedAt TEXT NOT NULL,
    receivedAt TEXT DEFAULT (datetime('now')),
    gpsLatitude REAL,
    gpsLongitude REAL,
    gpsValid INTEGER DEFAULT 1,
    distanceMeters REAL,
    notes TEXT DEFAULT '',
    FOREIGN KEY (officerId) REFERENCES users(id),
    FOREIGN KEY (checkpointId) REFERENCES checkpoints(id)
  );

  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    clientEmail TEXT NOT NULL,
    periodStart TEXT NOT NULL,
    periodEnd TEXT NOT NULL,
    format TEXT DEFAULT 'pdf',
    status TEXT DEFAULT 'pending',
    sentAt TEXT,
    createdAt TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS shifts (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    clockIn TEXT NOT NULL,
    clockOut TEXT,
    status TEXT DEFAULT 'active',
    clockInPhoto TEXT,
    clockInLatitude REAL,
    clockInLongitude REAL,
    clockOutLatitude REAL,
    clockOutLongitude REAL,
    scheduledStart TEXT,
    scheduledEnd TEXT,
    createdAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (userId) REFERENCES users(id)
  );
`)

// Migrate existing shifts: add new columns if missing
try { db.exec("ALTER TABLE shifts ADD COLUMN clockInPhoto TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE shifts ADD COLUMN clockInLatitude REAL"); } catch {}
try { db.exec("ALTER TABLE shifts ADD COLUMN clockInLongitude REAL"); } catch {}
try { db.exec("ALTER TABLE shifts ADD COLUMN clockOutLatitude REAL"); } catch {}
try { db.exec("ALTER TABLE shifts ADD COLUMN clockOutLongitude REAL"); } catch {}
try { db.exec("ALTER TABLE shifts ADD COLUMN scheduledStart TEXT"); } catch {}
try { db.exec("ALTER TABLE shifts ADD COLUMN scheduledEnd TEXT"); } catch {}
try { db.exec("ALTER TABLE checkpoints ADD COLUMN expectedIntervalMinutes INTEGER DEFAULT 30"); } catch {}

export default db
