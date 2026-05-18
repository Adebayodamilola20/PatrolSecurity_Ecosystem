import Database from 'better-sqlite3'
import pg from 'pg'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATABASE_URL = process.env.DATABASE_URL

function convertParams(sql, params) {
  let idx = 0
  const converted = sql.replace(/\?/g, () => `$${++idx}`)
  return { sql: converted, params }
}

function createSqliteDb() {
  const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'patrol.db')
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return {
    type: 'sqlite',
    raw: db,
    query: (sql, params = []) => {
      const rows = db.prepare(sql).all(...params)
      return { rows, rowCount: rows.length }
    },
    get: (sql, params = []) => db.prepare(sql).get(...params) || null,
    all: (sql, params = []) => db.prepare(sql).all(...params),
    run: (sql, params = []) => {
      const result = db.prepare(sql).run(...params)
      return { changes: result.changes, lastInsertRowid: result.lastInsertRowid }
    },
    exec: (sql) => db.exec(sql),
    close: () => db.close(),
  }
}

function createPgDb(connectionString) {
  const pool = new pg.Pool({ connectionString })
  pool.on('error', (err) => console.error('[PG] Pool error:', err.message))
  return {
    type: 'postgres',
    raw: pool,
    query: async (sql, params = []) => {
      const c = convertParams(sql, params)
      const result = await pool.query(c.sql, c.params)
      return result
    },
    get: async (sql, params = []) => {
      const c = convertParams(sql, params)
      const result = await pool.query(c.sql, c.params)
      return result.rows[0] || null
    },
    all: async (sql, params = []) => {
      const c = convertParams(sql, params)
      const result = await pool.query(c.sql, c.params)
      return result.rows
    },
    run: async (sql, params = []) => {
      const c = convertParams(sql, params)
      const result = await pool.query(c.sql, c.params)
      return { changes: result.rowCount, lastInsertRowid: null }
    },
    exec: async (sql) => {
      await pool.query(sql)
    },
    close: () => pool.end(),
  }
}

const db = DATABASE_URL ? createPgDb(DATABASE_URL) : createSqliteDb()

const sqliteSchema = `
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
    createdAt TEXT DEFAULT (datetime('now')),
    scheduledTimeIn TEXT DEFAULT '',
    scheduledTimeOut TEXT DEFAULT ''
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
    clockInPhoto TEXT DEFAULT '',
    clockInLatitude REAL,
    clockInLongitude REAL,
    clockOutLatitude REAL,
    clockOutLongitude REAL,
    scheduledStart TEXT,
    scheduledEnd TEXT,
    createdAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (userId) REFERENCES users(id)
  );
`

const pgSchema = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','supervisor','officer')),
    phone TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    createdAt TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS checkpoints (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    radiusMeters DOUBLE PRECISION DEFAULT 50,
    expectedIntervalMinutes INTEGER DEFAULT 30,
    active INTEGER DEFAULT 1,
    createdAt TIMESTAMPTZ DEFAULT NOW(),
    scheduledTimeIn TEXT DEFAULT '',
    scheduledTimeOut TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    officerId TEXT NOT NULL,
    checkpointId TEXT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    severity TEXT DEFAULT 'low' CHECK(severity IN ('low','medium','high','critical')),
    status TEXT DEFAULT 'open' CHECK(status IN ('open','investigating','resolved')),
    reportedAt TIMESTAMPTZ DEFAULT NOW(),
    resolvedAt TIMESTAMPTZ,
    FOREIGN KEY (officerId) REFERENCES users(id),
    FOREIGN KEY (checkpointId) REFERENCES checkpoints(id)
  );
  CREATE TABLE IF NOT EXISTS scans (
    id TEXT PRIMARY KEY,
    officerId TEXT NOT NULL,
    checkpointId TEXT NOT NULL,
    scannedAt TIMESTAMPTZ NOT NULL,
    receivedAt TIMESTAMPTZ DEFAULT NOW(),
    gpsLatitude DOUBLE PRECISION,
    gpsLongitude DOUBLE PRECISION,
    gpsValid INTEGER DEFAULT 1,
    distanceMeters DOUBLE PRECISION,
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
    sentAt TIMESTAMPTZ,
    createdAt TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS shifts (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    clockIn TIMESTAMPTZ NOT NULL,
    clockOut TIMESTAMPTZ,
    status TEXT DEFAULT 'active',
    clockInPhoto TEXT DEFAULT '',
    clockInLatitude DOUBLE PRECISION,
    clockInLongitude DOUBLE PRECISION,
    clockOutLatitude DOUBLE PRECISION,
    clockOutLongitude DOUBLE PRECISION,
    scheduledStart TIMESTAMPTZ,
    scheduledEnd TIMESTAMPTZ,
    createdAt TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (userId) REFERENCES users(id)
  );
`

async function initDb() {
  if (db.type === 'sqlite') {
    db.exec(sqliteSchema)
    try { db.exec("ALTER TABLE shifts ADD COLUMN clockInPhoto TEXT DEFAULT ''"); } catch {}
    try { db.exec("ALTER TABLE shifts ADD COLUMN clockInLatitude REAL"); } catch {}
    try { db.exec("ALTER TABLE shifts ADD COLUMN clockInLongitude REAL"); } catch {}
    try { db.exec("ALTER TABLE shifts ADD COLUMN clockOutLatitude REAL"); } catch {}
    try { db.exec("ALTER TABLE shifts ADD COLUMN clockOutLongitude REAL"); } catch {}
    try { db.exec("ALTER TABLE shifts ADD COLUMN scheduledStart TEXT"); } catch {}
    try { db.exec("ALTER TABLE shifts ADD COLUMN scheduledEnd TEXT"); } catch {}
    try { db.exec("ALTER TABLE checkpoints ADD COLUMN expectedIntervalMinutes INTEGER DEFAULT 30"); } catch {}
    try { db.exec("ALTER TABLE checkpoints ADD COLUMN scheduledTimeIn TEXT DEFAULT ''"); } catch {}
    try { db.exec("ALTER TABLE checkpoints ADD COLUMN scheduledTimeOut TEXT DEFAULT ''"); } catch {}
  } else {
    await db.exec(pgSchema)
    try { await db.exec("ALTER TABLE shifts ADD COLUMN IF NOT EXISTS clockInPhoto TEXT DEFAULT ''"); } catch {}
    try { await db.exec("ALTER TABLE shifts ADD COLUMN IF NOT EXISTS clockInLatitude DOUBLE PRECISION"); } catch {}
    try { await db.exec("ALTER TABLE shifts ADD COLUMN IF NOT EXISTS clockInLongitude DOUBLE PRECISION"); } catch {}
    try { await db.exec("ALTER TABLE shifts ADD COLUMN IF NOT EXISTS clockOutLatitude DOUBLE PRECISION"); } catch {}
    try { await db.exec("ALTER TABLE shifts ADD COLUMN IF NOT EXISTS clockOutLongitude DOUBLE PRECISION"); } catch {}
    try { await db.exec("ALTER TABLE shifts ADD COLUMN IF NOT EXISTS scheduledStart TIMESTAMPTZ"); } catch {}
    try { await db.exec("ALTER TABLE shifts ADD COLUMN IF NOT EXISTS scheduledEnd TIMESTAMPTZ"); } catch {}
    try { await db.exec("ALTER TABLE checkpoints ADD COLUMN IF NOT EXISTS expectedIntervalMinutes INTEGER DEFAULT 30"); } catch {}
    try { await db.exec("ALTER TABLE checkpoints ADD COLUMN IF NOT EXISTS scheduledTimeIn TEXT DEFAULT ''"); } catch {}
    try { await db.exec("ALTER TABLE checkpoints ADD COLUMN IF NOT EXISTS scheduledTimeOut TEXT DEFAULT ''"); } catch {}
  }
}

await initDb()

export default db
