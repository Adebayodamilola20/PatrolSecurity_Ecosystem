import Database from 'better-sqlite3'
import pg from 'pg'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATABASE_URL = process.env.DATABASE_URL

function isLocalConnection(connectionString) {
  return connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
}

function getPgSslConfig(connectionString) {
  if (isLocalConnection(connectionString)) {
    return false
  }

  return { rejectUnauthorized: true }
}

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
  const pool = new pg.Pool({
    connectionString,
    ssl: getPgSslConfig(connectionString),
  })
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
  CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    createdAt TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sites (
    id TEXT PRIMARY KEY,
    clientId TEXT NOT NULL,
    name TEXT NOT NULL,
    location TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    createdAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (clientId) REFERENCES clients(id)
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','main_account','supervisor','guard')),
    phone TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    clientId TEXT,
    liveTracking INTEGER DEFAULT 1,
    createdAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (clientId) REFERENCES clients(id)
  );
  CREATE TABLE IF NOT EXISTS user_site_assignments (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    siteId TEXT NOT NULL,
    createdAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (userId) REFERENCES users(id),
    FOREIGN KEY (siteId) REFERENCES sites(id),
    UNIQUE(userId, siteId)
  );
  CREATE TABLE IF NOT EXISTS checkpoints (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    radiusMeters REAL DEFAULT 10,
    expectedIntervalMinutes INTEGER DEFAULT 30,
    active INTEGER DEFAULT 1,
    clientId TEXT,
    siteId TEXT,
    createdAt TEXT DEFAULT (datetime('now')),
    scheduledTimeIn TEXT DEFAULT '',
    scheduledTimeOut TEXT DEFAULT '',
    FOREIGN KEY (clientId) REFERENCES clients(id),
    FOREIGN KEY (siteId) REFERENCES sites(id)
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
  CREATE TABLE IF NOT EXISTS exportFiles (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    date TEXT NOT NULL,
    format TEXT DEFAULT 'xlsx',
    status TEXT DEFAULT 'ready',
    scopeLabel TEXT DEFAULT '',
    clientId TEXT,
    requestedBy TEXT NOT NULL,
    fileName TEXT NOT NULL,
    filePath TEXT NOT NULL,
    downloadUrl TEXT NOT NULL,
    totalsJson TEXT DEFAULT '{}',
    generatedAt TEXT DEFAULT (datetime('now')),
    createdAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (clientId) REFERENCES clients(id),
    FOREIGN KEY (requestedBy) REFERENCES users(id)
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
    siteLabel TEXT DEFAULT '',
    createdAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (userId) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS postOrders (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT DEFAULT '',
    instructions TEXT NOT NULL,
    checkpointId TEXT,
    assignedUserId TEXT,
    assignedRole TEXT DEFAULT 'guard',
    priority TEXT DEFAULT 'normal',
    active INTEGER DEFAULT 1,
    requiresAcknowledgement INTEGER DEFAULT 0,
    requiresPhotoProof INTEGER DEFAULT 1,
    createdBy TEXT NOT NULL,
    createdAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (checkpointId) REFERENCES checkpoints(id),
    FOREIGN KEY (assignedUserId) REFERENCES users(id),
    FOREIGN KEY (createdBy) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS postOrderCompletions (
    id TEXT PRIMARY KEY,
    postOrderId TEXT NOT NULL,
    userId TEXT NOT NULL,
    shiftId TEXT,
    checkpointId TEXT,
    status TEXT DEFAULT 'completed',
    acknowledgedAt TEXT,
    completedAt TEXT,
    proofPhotoUrl TEXT DEFAULT '',
    proofNote TEXT DEFAULT '',
    proofGpsLatitude REAL,
    proofGpsLongitude REAL,
    reviewStatus TEXT DEFAULT 'pending',
    reviewedBy TEXT,
    reviewedAt TEXT,
    reviewNote TEXT DEFAULT '',
    createdAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (postOrderId) REFERENCES postOrders(id),
    FOREIGN KEY (userId) REFERENCES users(id),
    FOREIGN KEY (shiftId) REFERENCES shifts(id),
    FOREIGN KEY (checkpointId) REFERENCES checkpoints(id),
    FOREIGN KEY (reviewedBy) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS handovers (
    id TEXT PRIMARY KEY,
    shiftId TEXT,
    checkpointId TEXT,
    siteLabel TEXT DEFAULT '',
    fromUserId TEXT NOT NULL,
    toUserId TEXT,
    summary TEXT NOT NULL,
    openIssues TEXT DEFAULT '',
    equipmentStatus TEXT DEFAULT '',
    photoUrl TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    acceptedNote TEXT DEFAULT '',
    createdAt TEXT DEFAULT (datetime('now')),
    acceptedAt TEXT,
    FOREIGN KEY (shiftId) REFERENCES shifts(id),
    FOREIGN KEY (checkpointId) REFERENCES checkpoints(id),
    FOREIGN KEY (fromUserId) REFERENCES users(id),
    FOREIGN KEY (toUserId) REFERENCES users(id)
  );
`

const pgSchema = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','main_account','supervisor','guard')),
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
    radiusMeters DOUBLE PRECISION DEFAULT 10,
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
  CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    createdAt TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS sites (
    id TEXT PRIMARY KEY,
    clientId TEXT NOT NULL,
    name TEXT NOT NULL,
    location TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    createdAt TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (clientId) REFERENCES clients(id)
  );
  CREATE TABLE IF NOT EXISTS exportFiles (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    date TEXT NOT NULL,
    format TEXT DEFAULT 'xlsx',
    status TEXT DEFAULT 'ready',
    scopeLabel TEXT DEFAULT '',
    clientId TEXT,
    requestedBy TEXT NOT NULL,
    fileName TEXT NOT NULL,
    filePath TEXT NOT NULL,
    downloadUrl TEXT NOT NULL,
    totalsJson TEXT DEFAULT '{}',
    generatedAt TIMESTAMPTZ DEFAULT NOW(),
    createdAt TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (clientId) REFERENCES clients(id),
    FOREIGN KEY (requestedBy) REFERENCES users(id)
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
    siteLabel TEXT DEFAULT '',
    createdAt TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (userId) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS postOrders (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT DEFAULT '',
    instructions TEXT NOT NULL,
    checkpointId TEXT,
    assignedUserId TEXT,
    assignedRole TEXT DEFAULT 'guard',
    priority TEXT DEFAULT 'normal',
    active INTEGER DEFAULT 1,
    requiresAcknowledgement INTEGER DEFAULT 0,
    requiresPhotoProof INTEGER DEFAULT 1,
    createdBy TEXT NOT NULL,
    createdAt TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (checkpointId) REFERENCES checkpoints(id),
    FOREIGN KEY (assignedUserId) REFERENCES users(id),
    FOREIGN KEY (createdBy) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS postOrderCompletions (
    id TEXT PRIMARY KEY,
    postOrderId TEXT NOT NULL,
    userId TEXT NOT NULL,
    shiftId TEXT,
    checkpointId TEXT,
    status TEXT DEFAULT 'completed',
    acknowledgedAt TIMESTAMPTZ,
    completedAt TIMESTAMPTZ,
    proofPhotoUrl TEXT DEFAULT '',
    proofNote TEXT DEFAULT '',
    proofGpsLatitude DOUBLE PRECISION,
    proofGpsLongitude DOUBLE PRECISION,
    reviewStatus TEXT DEFAULT 'pending',
    reviewedBy TEXT,
    reviewedAt TIMESTAMPTZ,
    reviewNote TEXT DEFAULT '',
    createdAt TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (postOrderId) REFERENCES postOrders(id),
    FOREIGN KEY (userId) REFERENCES users(id),
    FOREIGN KEY (shiftId) REFERENCES shifts(id),
    FOREIGN KEY (checkpointId) REFERENCES checkpoints(id),
    FOREIGN KEY (reviewedBy) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS handovers (
    id TEXT PRIMARY KEY,
    shiftId TEXT,
    checkpointId TEXT,
    siteLabel TEXT DEFAULT '',
    fromUserId TEXT NOT NULL,
    toUserId TEXT,
    summary TEXT NOT NULL,
    openIssues TEXT DEFAULT '',
    equipmentStatus TEXT DEFAULT '',
    photoUrl TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    acceptedNote TEXT DEFAULT '',
    createdAt TIMESTAMPTZ DEFAULT NOW(),
    acceptedAt TIMESTAMPTZ,
    FOREIGN KEY (shiftId) REFERENCES shifts(id),
    FOREIGN KEY (checkpointId) REFERENCES checkpoints(id),
    FOREIGN KEY (fromUserId) REFERENCES users(id),
    FOREIGN KEY (toUserId) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS user_site_assignments (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    siteId TEXT NOT NULL,
    createdAt TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (userId) REFERENCES users(id),
    FOREIGN KEY (siteId) REFERENCES sites(id),
    UNIQUE(userId, siteId)
  );
`

async function initDb() {
  if (db.type === 'sqlite') {
    db.exec(sqliteSchema)
    try { db.exec("CREATE INDEX IF NOT EXISTS idx_scans_officerId ON scans(officerId)"); } catch {}
    try { db.exec("CREATE INDEX IF NOT EXISTS idx_scans_receivedAt ON scans(receivedAt)"); } catch {}
    try { db.exec("ALTER TABLE shifts ADD COLUMN clockInPhoto TEXT DEFAULT ''"); } catch {}
    try { db.exec("ALTER TABLE shifts ADD COLUMN clockInLatitude REAL"); } catch {}
    try { db.exec("ALTER TABLE shifts ADD COLUMN clockInLongitude REAL"); } catch {}
    try { db.exec("ALTER TABLE shifts ADD COLUMN clockOutLatitude REAL"); } catch {}
    try { db.exec("ALTER TABLE shifts ADD COLUMN clockOutLongitude REAL"); } catch {}
    try { db.exec("ALTER TABLE shifts ADD COLUMN scheduledStart TEXT"); } catch {}
    try { db.exec("ALTER TABLE shifts ADD COLUMN scheduledEnd TEXT"); } catch {}
    try { db.exec("ALTER TABLE shifts ADD COLUMN siteLabel TEXT DEFAULT ''"); } catch {}
    try { db.exec("ALTER TABLE checkpoints ADD COLUMN expectedIntervalMinutes INTEGER DEFAULT 30"); } catch {}
    try { db.exec("ALTER TABLE checkpoints ADD COLUMN scheduledTimeIn TEXT DEFAULT ''"); } catch {}
    try { db.exec("ALTER TABLE checkpoints ADD COLUMN scheduledTimeOut TEXT DEFAULT ''"); } catch {}
    try { db.exec("UPDATE checkpoints SET radiusMeters = 10 WHERE radiusMeters IS NULL"); } catch {}

    try { db.exec(`CREATE TABLE IF NOT EXISTS communicationSettings (
      id TEXT PRIMARY KEY,
      scopeType TEXT DEFAULT 'global',
      scopeId TEXT DEFAULT '',
      settingKey TEXT NOT NULL,
      settingValue TEXT DEFAULT '',
      updatedBy TEXT,
      createdAt TEXT DEFAULT (datetime('now'))
    );`); } catch {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS reportSubmissions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT DEFAULT '',
      detailsJson TEXT DEFAULT '{}',
      checkpointId TEXT,
      siteLabel TEXT DEFAULT '',
      userId TEXT NOT NULL,
      status TEXT DEFAULT 'submitted',
      submittedAt TEXT DEFAULT (datetime('now')),
      emailedAt TEXT,
      deliveryPayload TEXT DEFAULT '{}',
      FOREIGN KEY (checkpointId) REFERENCES checkpoints(id),
      FOREIGN KEY (userId) REFERENCES users(id)
    );`); } catch {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS exportFiles (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      date TEXT NOT NULL,
      format TEXT DEFAULT 'xlsx',
      status TEXT DEFAULT 'ready',
      scopeLabel TEXT DEFAULT '',
      clientId TEXT,
      requestedBy TEXT NOT NULL,
      fileName TEXT NOT NULL,
      filePath TEXT NOT NULL,
      downloadUrl TEXT NOT NULL,
      totalsJson TEXT DEFAULT '{}',
      generatedAt TEXT DEFAULT (datetime('now')),
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (clientId) REFERENCES clients(id),
      FOREIGN KEY (requestedBy) REFERENCES users(id)
    );`); } catch {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS emergencyEvents (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      checkpointId TEXT,
      siteLabel TEXT DEFAULT '',
      message TEXT NOT NULL,
      note TEXT DEFAULT '',
      triggeredAt TEXT DEFAULT (datetime('now')),
      emailRecipients TEXT DEFAULT '[]',
      phoneRecipients TEXT DEFAULT '[]',
      status TEXT DEFAULT 'triggered',
      deliveryPayload TEXT DEFAULT '{}',
      FOREIGN KEY (userId) REFERENCES users(id),
      FOREIGN KEY (checkpointId) REFERENCES checkpoints(id)
    );`); } catch {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS passOnLogs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      instruction TEXT NOT NULL,
      priority TEXT DEFAULT 'normal',
      siteLabel TEXT DEFAULT '',
      checkpointId TEXT,
      requiresAcknowledgement INTEGER DEFAULT 0,
      createdBy TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (checkpointId) REFERENCES checkpoints(id),
      FOREIGN KEY (createdBy) REFERENCES users(id)
    );`); } catch {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      active INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT (datetime('now'))
    );`); } catch {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      clientId TEXT NOT NULL,
      name TEXT NOT NULL,
      location TEXT DEFAULT '',
      active INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (clientId) REFERENCES clients(id)
    );`); } catch {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS user_site_assignments (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      siteId TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(id),
      FOREIGN KEY (siteId) REFERENCES sites(id),
      UNIQUE(userId, siteId)
    );`); } catch {}
    try { db.exec("ALTER TABLE users ADD COLUMN clientId TEXT REFERENCES clients(id)"); } catch {}
    try { db.exec("ALTER TABLE users ADD COLUMN liveTracking INTEGER DEFAULT 1"); } catch {}
    try { db.exec("ALTER TABLE checkpoints ADD COLUMN clientId TEXT REFERENCES clients(id)"); } catch {}
    try { db.exec("ALTER TABLE checkpoints ADD COLUMN siteId TEXT REFERENCES sites(id)"); } catch {}
    const usersTable = db.get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    const legacyUserReference = db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND sql LIKE '%users_legacy%' LIMIT 1")
    if (
      usersTable?.sql?.includes("CHECK(role IN ('admin','supervisor','officer'))") ||
      legacyUserReference
    ) {
      const dependentTables = [
        {
          name: 'scans',
          columns: 'id, officerId, checkpointId, scannedAt, receivedAt, gpsLatitude, gpsLongitude, gpsValid, distanceMeters, notes',
          createSql: `CREATE TABLE scans (
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
          );`,
        },
        {
          name: 'shifts',
          columns: 'id, userId, clockIn, clockOut, status, clockInPhoto, clockInLatitude, clockInLongitude, clockOutLatitude, clockOutLongitude, scheduledStart, scheduledEnd, siteLabel, createdAt',
          createSql: `CREATE TABLE shifts (
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
            siteLabel TEXT DEFAULT '',
            createdAt TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (userId) REFERENCES users(id)
          );`,
        },
        {
          name: 'incidents',
          columns: 'id, officerId, checkpointId, title, description, severity, status, reportedAt, resolvedAt',
          createSql: `CREATE TABLE incidents (
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
          );`,
        },
        {
          name: 'postOrders',
          columns: 'id, title, summary, instructions, checkpointId, assignedUserId, assignedRole, priority, active, requiresAcknowledgement, requiresPhotoProof, createdBy, createdAt',
          createSql: `CREATE TABLE postOrders (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            summary TEXT DEFAULT '',
            instructions TEXT NOT NULL,
            checkpointId TEXT,
            assignedUserId TEXT,
            assignedRole TEXT DEFAULT 'guard',
            priority TEXT DEFAULT 'normal',
            active INTEGER DEFAULT 1,
            requiresAcknowledgement INTEGER DEFAULT 0,
            requiresPhotoProof INTEGER DEFAULT 1,
            createdBy TEXT NOT NULL,
            createdAt TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (checkpointId) REFERENCES checkpoints(id),
            FOREIGN KEY (assignedUserId) REFERENCES users(id),
            FOREIGN KEY (createdBy) REFERENCES users(id)
          );`,
        },
        {
          name: 'handovers',
          columns: 'id, shiftId, checkpointId, siteLabel, fromUserId, toUserId, summary, openIssues, equipmentStatus, photoUrl, status, acceptedNote, createdAt, acceptedAt',
          createSql: `CREATE TABLE handovers (
            id TEXT PRIMARY KEY,
            shiftId TEXT,
            checkpointId TEXT,
            siteLabel TEXT DEFAULT '',
            fromUserId TEXT NOT NULL,
            toUserId TEXT,
            summary TEXT NOT NULL,
            openIssues TEXT DEFAULT '',
            equipmentStatus TEXT DEFAULT '',
            photoUrl TEXT DEFAULT '',
            status TEXT DEFAULT 'pending',
            acceptedNote TEXT DEFAULT '',
            createdAt TEXT DEFAULT (datetime('now')),
            acceptedAt TEXT,
            FOREIGN KEY (shiftId) REFERENCES shifts(id),
            FOREIGN KEY (checkpointId) REFERENCES checkpoints(id),
            FOREIGN KEY (fromUserId) REFERENCES users(id),
            FOREIGN KEY (toUserId) REFERENCES users(id)
          );`,
        },
        {
          name: 'user_site_assignments',
          columns: 'id, userId, siteId, createdAt',
          createSql: `CREATE TABLE user_site_assignments (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            siteId TEXT NOT NULL,
            createdAt TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (userId) REFERENCES users(id),
            FOREIGN KEY (siteId) REFERENCES sites(id),
            UNIQUE(userId, siteId)
          );`,
        },
        {
          name: 'reportSubmissions',
          columns: 'id, type, title, summary, detailsJson, checkpointId, siteLabel, userId, status, submittedAt, emailedAt, deliveryPayload',
          createSql: `CREATE TABLE reportSubmissions (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            summary TEXT DEFAULT '',
            detailsJson TEXT DEFAULT '{}',
            checkpointId TEXT,
            siteLabel TEXT DEFAULT '',
            userId TEXT NOT NULL,
            status TEXT DEFAULT 'submitted',
            submittedAt TEXT DEFAULT (datetime('now')),
            emailedAt TEXT,
            deliveryPayload TEXT DEFAULT '{}',
            FOREIGN KEY (checkpointId) REFERENCES checkpoints(id),
            FOREIGN KEY (userId) REFERENCES users(id)
          );`,
        },
        {
          name: 'emergencyEvents',
          columns: 'id, userId, checkpointId, siteLabel, message, note, triggeredAt, emailRecipients, phoneRecipients, status, deliveryPayload',
          createSql: `CREATE TABLE emergencyEvents (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            checkpointId TEXT,
            siteLabel TEXT DEFAULT '',
            message TEXT NOT NULL,
            note TEXT DEFAULT '',
            triggeredAt TEXT DEFAULT (datetime('now')),
            emailRecipients TEXT DEFAULT '[]',
            phoneRecipients TEXT DEFAULT '[]',
            status TEXT DEFAULT 'triggered',
            deliveryPayload TEXT DEFAULT '{}',
            FOREIGN KEY (userId) REFERENCES users(id),
            FOREIGN KEY (checkpointId) REFERENCES checkpoints(id)
          );`,
        },
        {
          name: 'passOnLogs',
          columns: 'id, title, instruction, priority, siteLabel, checkpointId, requiresAcknowledgement, createdBy, active, createdAt',
          createSql: `CREATE TABLE passOnLogs (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            instruction TEXT NOT NULL,
            priority TEXT DEFAULT 'normal',
            siteLabel TEXT DEFAULT '',
            checkpointId TEXT,
            requiresAcknowledgement INTEGER DEFAULT 0,
            createdBy TEXT NOT NULL,
            active INTEGER DEFAULT 1,
            createdAt TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (checkpointId) REFERENCES checkpoints(id),
            FOREIGN KEY (createdBy) REFERENCES users(id)
          );`,
        },
        {
          name: 'postOrderCompletions',
          columns: 'id, postOrderId, userId, shiftId, checkpointId, status, acknowledgedAt, completedAt, proofPhotoUrl, proofNote, proofGpsLatitude, proofGpsLongitude, reviewStatus, reviewedBy, reviewedAt, reviewNote, createdAt',
          createSql: `CREATE TABLE postOrderCompletions (
            id TEXT PRIMARY KEY,
            postOrderId TEXT NOT NULL,
            userId TEXT NOT NULL,
            shiftId TEXT,
            checkpointId TEXT,
            status TEXT DEFAULT 'completed',
            acknowledgedAt TEXT,
            completedAt TEXT,
            proofPhotoUrl TEXT DEFAULT '',
            proofNote TEXT DEFAULT '',
            proofGpsLatitude REAL,
            proofGpsLongitude REAL,
            reviewStatus TEXT DEFAULT 'pending',
            reviewedBy TEXT,
            reviewedAt TEXT,
            reviewNote TEXT DEFAULT '',
            createdAt TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (postOrderId) REFERENCES postOrders(id),
            FOREIGN KEY (userId) REFERENCES users(id),
            FOREIGN KEY (shiftId) REFERENCES shifts(id),
            FOREIGN KEY (checkpointId) REFERENCES checkpoints(id),
            FOREIGN KEY (reviewedBy) REFERENCES users(id)
          );`,
        },
        {
          name: 'passOnLogAcknowledgements',
          columns: 'id, passOnLogId, userId, acknowledgedAt, note',
          createSql: `CREATE TABLE passOnLogAcknowledgements (
            id TEXT PRIMARY KEY,
            passOnLogId TEXT NOT NULL,
            userId TEXT NOT NULL,
            acknowledgedAt TEXT DEFAULT (datetime('now')),
            note TEXT DEFAULT '',
            FOREIGN KEY (passOnLogId) REFERENCES passOnLogs(id),
            FOREIGN KEY (userId) REFERENCES users(id)
          );`,
        },
      ]

      db.exec('PRAGMA foreign_keys = OFF')
      for (const table of dependentTables) {
        try { db.exec(`DROP TABLE IF EXISTS ${table.name}_legacy_fix`); } catch {}
        try { db.exec(`ALTER TABLE ${table.name} RENAME TO ${table.name}_legacy_fix`); } catch {}
      }

      try { db.exec('DROP TABLE IF EXISTS users_legacy_fix'); } catch {}
      try { db.exec('ALTER TABLE users RENAME TO users_legacy_fix'); } catch {}

      db.exec(`
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('admin','main_account','supervisor','guard')),
          phone TEXT DEFAULT '',
          active INTEGER DEFAULT 1,
          clientId TEXT,
          createdAt TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (clientId) REFERENCES clients(id)
        );
        INSERT INTO users (id, name, email, password, role, phone, active, clientId, createdAt)
        SELECT
          id,
          name,
          email,
          password,
          CASE lower(replace(role, ' ', '_'))
            WHEN 'officer' THEN 'guard'
            WHEN 'client_main_account' THEN 'main_account'
            WHEN 'client-main-account' THEN 'main_account'
            WHEN 'main-account' THEN 'main_account'
            ELSE lower(replace(role, ' ', '_'))
          END,
          COALESCE(phone, ''),
          COALESCE(active, 1),
          clientId,
          COALESCE(createdAt, datetime('now'))
        FROM users_legacy_fix;
        DROP TABLE users_legacy_fix;
      `)

      for (const table of dependentTables) {
        db.exec(table.createSql)
        const legacyTable = db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [`${table.name}_legacy_fix`])
        if (legacyTable) {
          db.exec(`
            INSERT INTO ${table.name} (${table.columns})
            SELECT ${table.columns} FROM ${table.name}_legacy_fix;
            DROP TABLE ${table.name}_legacy_fix;
          `)
        }
      }
      db.exec('PRAGMA foreign_keys = ON')
    }

    // --- Offline scan sync -------------------------------------------------
    // Deliberately AFTER the legacy users rebuild above: that block recreates
    // `scans` from a fixed column list, so anything added before it would be
    // dropped on the one boot the rebuild runs.
    //
    // The device stamps every scan with a clientScanId, so a queued scan that
    // gets retried (timeout, app restart, an overlapping flush) resolves to the
    // SAME row instead of inventing a second patrol record. The unique index is
    // the enforcement; NULLs stay unconstrained, so pre-offline rows and any
    // client that omits the id are unaffected.
    try { db.exec("ALTER TABLE scans ADD COLUMN clientScanId TEXT"); } catch {}
    try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_scans_clientScanId ON scans(officerId, clientScanId)"); } catch {}
    // A queued scan is filed under the time it was TAKEN, so the day-range
    // export reads scannedAt rather than receivedAt.
    try { db.exec("CREATE INDEX IF NOT EXISTS idx_scans_scannedAt ON scans(scannedAt)"); } catch {}

    try { db.exec(`CREATE TABLE IF NOT EXISTS passOnLogAcknowledgements (
      id TEXT PRIMARY KEY,
      passOnLogId TEXT NOT NULL,
      userId TEXT NOT NULL,
      acknowledgedAt TEXT DEFAULT (datetime('now')),
      note TEXT DEFAULT '',
      FOREIGN KEY (passOnLogId) REFERENCES passOnLogs(id),
      FOREIGN KEY (userId) REFERENCES users(id)
    );`); } catch {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS passwordResetTokens (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      tokenHash TEXT NOT NULL UNIQUE,
      expiresAt TEXT NOT NULL,
      usedAt TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(id)
    );`); } catch {}
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS officerPositions (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        accuracy REAL,
        speed REAL,
        heading REAL,
        capturedAt TEXT NOT NULL,
        createdAt TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (userId) REFERENCES users(id)
      );`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_officerPositions_userId ON officerPositions(userId)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_officerPositions_capturedAt ON officerPositions(capturedAt)`);
    } catch {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS aiAuditLogs (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      userRole TEXT NOT NULL,
      question TEXT NOT NULL,
      intent TEXT DEFAULT 'operations',
      dataSources TEXT DEFAULT '[]',
      sensitive INTEGER DEFAULT 0,
      status TEXT DEFAULT 'completed',
      error TEXT DEFAULT '',
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(id)
    );`); } catch {}
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_aiAuditLogs_userId_createdAt ON aiAuditLogs(userId, createdAt);`); } catch {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS aiRateLimits (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      windowKey TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      updatedAt TEXT DEFAULT (datetime('now')),
      UNIQUE(userId, windowKey)
    );`); } catch {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS aiGeneratedReports (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      reportType TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      sourceSummary TEXT DEFAULT '{}',
      status TEXT DEFAULT 'draft',
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(id)
    );`); } catch {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS aiClientEmails (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      reportId TEXT,
      clientId TEXT,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      approvedBy TEXT,
      sentAt TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(id),
      FOREIGN KEY (reportId) REFERENCES aiGeneratedReports(id),
      FOREIGN KEY (clientId) REFERENCES clients(id)
    );`); } catch {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS aiKnowledgeDocuments (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT DEFAULT 'document',
      siteId TEXT,
      clientId TEXT,
      uploadedBy TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (siteId) REFERENCES sites(id),
      FOREIGN KEY (clientId) REFERENCES clients(id),
      FOREIGN KEY (uploadedBy) REFERENCES users(id)
    );`); } catch {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS aiKnowledgeChunks (
      id TEXT PRIMARY KEY,
      documentId TEXT NOT NULL,
      chunkIndex INTEGER NOT NULL,
      content TEXT NOT NULL,
      embeddingJson TEXT DEFAULT '[]',
      embeddingModel TEXT DEFAULT '',
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (documentId) REFERENCES aiKnowledgeDocuments(id)
    );`); } catch {}
    try { db.exec(`CREATE INDEX IF NOT EXISTS idx_aiKnowledgeChunks_documentId ON aiKnowledgeChunks(documentId);`); } catch {}
  } else {
    await db.exec(pgSchema)
    try { await db.exec("CREATE INDEX IF NOT EXISTS idx_scans_officerId ON scans(officerId)"); } catch (e) { console.log('[PG] Create idx_scans_officerId:', e.message) }
    try { await db.exec("CREATE INDEX IF NOT EXISTS idx_scans_receivedAt ON scans(receivedAt)"); } catch (e) { console.log('[PG] Create idx_scans_receivedAt:', e.message) }
    try { await db.exec("CREATE INDEX IF NOT EXISTS idx_scans_scannedAt ON scans(scannedAt)"); } catch (e) { console.log('[PG] Create idx_scans_scannedAt:', e.message) }
    // See the sqlite path: clientScanId makes an offline scan's retry idempotent.
    try { await db.exec("ALTER TABLE scans ADD COLUMN IF NOT EXISTS clientScanId TEXT"); } catch (e) { console.log('[PG] Add scans.clientScanId:', e.message) }
    try { await db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_scans_clientScanId ON scans(officerId, clientScanId)"); } catch (e) { console.log('[PG] Create idx_scans_clientScanId:', e.message) }
    try { await db.exec("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check"); } catch (e) { console.log('[PG] Drop constraint:', e.message) }
    try { await db.exec("UPDATE users SET role = 'guard' WHERE role = 'officer'"); } catch (e) { console.log('[PG] Update officer->guard:', e.message) }
    try { await db.exec("UPDATE users SET role = 'main_account' WHERE role IN ('client_main_account', 'client-main-account', 'main-account')"); } catch (e) { console.log('[PG] Update legacy roles:', e.message) }
    try { await db.exec("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'main_account', 'supervisor', 'guard'))"); } catch (e) { console.log('[PG] Add constraint:', e.message) }
    try { await db.exec("ALTER TABLE shifts ADD COLUMN IF NOT EXISTS clockInPhoto TEXT DEFAULT ''"); } catch {}
    try { await db.exec("ALTER TABLE shifts ADD COLUMN IF NOT EXISTS clockInLatitude DOUBLE PRECISION"); } catch {}
    try { await db.exec("ALTER TABLE shifts ADD COLUMN IF NOT EXISTS clockInLongitude DOUBLE PRECISION"); } catch {}
    try { await db.exec("ALTER TABLE shifts ADD COLUMN IF NOT EXISTS clockOutLatitude DOUBLE PRECISION"); } catch {}
    try { await db.exec("ALTER TABLE shifts ADD COLUMN IF NOT EXISTS clockOutLongitude DOUBLE PRECISION"); } catch {}
    try { await db.exec("ALTER TABLE shifts ADD COLUMN IF NOT EXISTS scheduledStart TIMESTAMPTZ"); } catch {}
    try { await db.exec("ALTER TABLE shifts ADD COLUMN IF NOT EXISTS scheduledEnd TIMESTAMPTZ"); } catch {}
    try { await db.exec("ALTER TABLE shifts ADD COLUMN IF NOT EXISTS siteLabel TEXT DEFAULT ''"); } catch {}
    try { await db.exec("ALTER TABLE checkpoints ADD COLUMN IF NOT EXISTS expectedIntervalMinutes INTEGER DEFAULT 30"); } catch {}
    try { await db.exec("ALTER TABLE checkpoints ADD COLUMN IF NOT EXISTS scheduledTimeIn TEXT DEFAULT ''"); } catch {}
    try { await db.exec("ALTER TABLE checkpoints ADD COLUMN IF NOT EXISTS scheduledTimeOut TEXT DEFAULT ''"); } catch {}
    try { await db.exec("UPDATE checkpoints SET \"radiusMeters\" = 10 WHERE \"radiusMeters\" IS NULL"); } catch {}
    try { await db.exec(`CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      active INTEGER DEFAULT 1,
      createdAt TIMESTAMPTZ DEFAULT NOW()
    );`); } catch {}
    try { await db.exec(`CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      clientId TEXT NOT NULL,
      name TEXT NOT NULL,
      location TEXT DEFAULT '',
      active INTEGER DEFAULT 1,
      createdAt TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (clientId) REFERENCES clients(id)
    );`); } catch {}
    try { await db.exec(`CREATE TABLE IF NOT EXISTS user_site_assignments (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      siteId TEXT NOT NULL,
      createdAt TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (userId) REFERENCES users(id),
      FOREIGN KEY (siteId) REFERENCES sites(id),
      UNIQUE(userId, siteId)
    );`); } catch {}
    try { await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS clientId TEXT"); } catch {}
    try { await db.exec("ALTER TABLE checkpoints ADD COLUMN IF NOT EXISTS clientId TEXT"); } catch {}
    try { await db.exec("ALTER TABLE checkpoints ADD COLUMN IF NOT EXISTS siteId TEXT"); } catch {}

    try { await db.exec(`CREATE TABLE IF NOT EXISTS communicationSettings (
      id TEXT PRIMARY KEY,
      scopeType TEXT DEFAULT 'global',
      scopeId TEXT DEFAULT '',
      settingKey TEXT NOT NULL,
      settingValue TEXT DEFAULT '',
      updatedBy TEXT,
      createdAt TIMESTAMPTZ DEFAULT NOW()
    );`); } catch {}
    try { await db.exec(`CREATE TABLE IF NOT EXISTS reportSubmissions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT DEFAULT '',
      detailsJson TEXT DEFAULT '{}',
      checkpointId TEXT,
      siteLabel TEXT DEFAULT '',
      userId TEXT NOT NULL,
      status TEXT DEFAULT 'submitted',
      submittedAt TIMESTAMPTZ DEFAULT NOW(),
      emailedAt TIMESTAMPTZ,
      deliveryPayload TEXT DEFAULT '{}',
      FOREIGN KEY (checkpointId) REFERENCES checkpoints(id),
      FOREIGN KEY (userId) REFERENCES users(id)
    );`); } catch {}
    try { await db.exec(`CREATE TABLE IF NOT EXISTS exportFiles (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      date TEXT NOT NULL,
      format TEXT DEFAULT 'xlsx',
      status TEXT DEFAULT 'ready',
      scopeLabel TEXT DEFAULT '',
      clientId TEXT,
      requestedBy TEXT NOT NULL,
      fileName TEXT NOT NULL,
      filePath TEXT NOT NULL,
      downloadUrl TEXT NOT NULL,
      totalsJson TEXT DEFAULT '{}',
      generatedAt TIMESTAMPTZ DEFAULT NOW(),
      createdAt TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (clientId) REFERENCES clients(id),
      FOREIGN KEY (requestedBy) REFERENCES users(id)
    );`); } catch {}
    try { await db.exec(`CREATE TABLE IF NOT EXISTS emergencyEvents (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      checkpointId TEXT,
      siteLabel TEXT DEFAULT '',
      message TEXT NOT NULL,
      note TEXT DEFAULT '',
      triggeredAt TIMESTAMPTZ DEFAULT NOW(),
      emailRecipients TEXT DEFAULT '[]',
      phoneRecipients TEXT DEFAULT '[]',
      status TEXT DEFAULT 'triggered',
      deliveryPayload TEXT DEFAULT '{}',
      FOREIGN KEY (userId) REFERENCES users(id),
      FOREIGN KEY (checkpointId) REFERENCES checkpoints(id)
    );`); } catch {}
    try { await db.exec(`CREATE TABLE IF NOT EXISTS passOnLogs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      instruction TEXT NOT NULL,
      priority TEXT DEFAULT 'normal',
      siteLabel TEXT DEFAULT '',
      checkpointId TEXT,
      requiresAcknowledgement INTEGER DEFAULT 0,
      createdBy TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      createdAt TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (checkpointId) REFERENCES checkpoints(id),
      FOREIGN KEY (createdBy) REFERENCES users(id)
    );`); } catch {}
    try { await db.exec(`CREATE TABLE IF NOT EXISTS passOnLogAcknowledgements (
      id TEXT PRIMARY KEY,
      passOnLogId TEXT NOT NULL,
      userId TEXT NOT NULL,
      acknowledgedAt TIMESTAMPTZ DEFAULT NOW(),
      note TEXT DEFAULT '',
      FOREIGN KEY (passOnLogId) REFERENCES passOnLogs(id),
      FOREIGN KEY (userId) REFERENCES users(id)
    );`); } catch {}
    try { await db.exec(`CREATE TABLE IF NOT EXISTS passwordResetTokens (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      tokenHash TEXT NOT NULL UNIQUE,
      expiresAt TIMESTAMPTZ NOT NULL,
      usedAt TIMESTAMPTZ,
      createdAt TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (userId) REFERENCES users(id)
    );`); } catch {}
    try {
      await db.exec(`CREATE TABLE IF NOT EXISTS officerPositions (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        accuracy DOUBLE PRECISION,
        speed DOUBLE PRECISION,
        heading DOUBLE PRECISION,
        capturedAt TEXT NOT NULL,
        createdAt TIMESTAMPTZ DEFAULT NOW(),
        FOREIGN KEY (userId) REFERENCES users(id)
      );`);
      await db.exec(`CREATE INDEX IF NOT EXISTS idx_officerPositions_userId ON officerPositions(userId)`);
      await db.exec(`CREATE INDEX IF NOT EXISTS idx_officerPositions_capturedAt ON officerPositions(capturedAt)`);
    } catch {}
    try { await db.exec(`CREATE TABLE IF NOT EXISTS aiAuditLogs (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      userRole TEXT NOT NULL,
      question TEXT NOT NULL,
      intent TEXT DEFAULT 'operations',
      dataSources TEXT DEFAULT '[]',
      sensitive INTEGER DEFAULT 0,
      status TEXT DEFAULT 'completed',
      error TEXT DEFAULT '',
      createdAt TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (userId) REFERENCES users(id)
    );`); } catch {}
    try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_aiAuditLogs_userId_createdAt ON aiAuditLogs(userId, createdAt);`); } catch {}
    try { await db.exec(`CREATE TABLE IF NOT EXISTS aiRateLimits (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      windowKey TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      updatedAt TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(userId, windowKey)
    );`); } catch {}
    try { await db.exec(`CREATE TABLE IF NOT EXISTS aiGeneratedReports (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      reportType TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      sourceSummary TEXT DEFAULT '{}',
      status TEXT DEFAULT 'draft',
      createdAt TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (userId) REFERENCES users(id)
    );`); } catch {}
    try { await db.exec(`CREATE TABLE IF NOT EXISTS aiClientEmails (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      reportId TEXT,
      clientId TEXT,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      approvedBy TEXT,
      sentAt TIMESTAMPTZ,
      createdAt TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (userId) REFERENCES users(id),
      FOREIGN KEY (reportId) REFERENCES aiGeneratedReports(id),
      FOREIGN KEY (clientId) REFERENCES clients(id)
    );`); } catch {}
    try { await db.exec(`CREATE TABLE IF NOT EXISTS aiKnowledgeDocuments (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT DEFAULT 'document',
      siteId TEXT,
      clientId TEXT,
      uploadedBy TEXT NOT NULL,
      createdAt TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (siteId) REFERENCES sites(id),
      FOREIGN KEY (clientId) REFERENCES clients(id),
      FOREIGN KEY (uploadedBy) REFERENCES users(id)
    );`); } catch {}
    try { await db.exec(`CREATE TABLE IF NOT EXISTS aiKnowledgeChunks (
      id TEXT PRIMARY KEY,
      documentId TEXT NOT NULL,
      chunkIndex INTEGER NOT NULL,
      content TEXT NOT NULL,
      embeddingJson TEXT DEFAULT '[]',
      embeddingModel TEXT DEFAULT '',
      createdAt TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (documentId) REFERENCES aiKnowledgeDocuments(id)
    );`); } catch {}
    try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_aiKnowledgeChunks_documentId ON aiKnowledgeChunks(documentId);`); } catch {}
  }
}

try {
  await initDb()
} catch (err) {
  console.error('[DATABASE_INIT_ERROR] Failed to initialize database:', err)
  throw err
}

export default db
