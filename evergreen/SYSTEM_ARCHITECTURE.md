1# System Architecture Document

> Technical reference for developers and AI systems building the Patrol Monitoring & Automated Reporting System.

---

## 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                                 │
│  ┌─────────────────────┐         ┌──────────────────────────────┐   │
│  │  Flutter Mobile App  │         │   Web Dashboard (React/Vue) │   │
│  │  (Android)           │         │   (Control Room)            │   │
│  └─────────┬───────────┘         └──────────────┬───────────────┘   │
└────────────┼────────────────────────────────────┼───────────────────┘
             │  HTTPS (REST)                      │  WebSocket
             ▼                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       API GATEWAY / LOAD BALANCER                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       APPLICATION LAYER                             │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              Backend Server (Node.js / FastAPI)              │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │   │
│  │  │Auth      │  │Scan API  │  │Report    │  │WebSocket   │  │   │
│  │  │Module    │  │Endpoint  │  │Generator │  │Manager     │  │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                             │
              ┌──────────────┼──────────────────┐
              ▼              ▼                   ▼
┌──────────────────┐  ┌────────────────┐  ┌──────────────────────┐
│   Database       │  │   Redis        │  │   Email Service      │
│   (PostgreSQL    │  │   (Pub/Sub     │  │   (Gmail API /       │
│    or MongoDB)   │  │    + Cache)    │  │    SendGrid / SMTP)  │
└──────────────────┘  └────────────────┘  └──────────────────────┘
```

---

## 2. Data Flow

### Scan Lifecycle (End-to-End)

```
[Guard scans QR]
      │
      ▼
[Flutter App]
  - Decodes QR → gets checkpoint_id
  - Captures GPS from device
  - Builds payload: { officer_id, checkpoint_id, timestamp, gps }
  - Signs with JWT token
  - Sends POST /api/scans
      │
      ▼
[Backend - Scan Endpoint]
  - Validates JWT
  - Validates GPS against checkpoint's registered coordinates
    (distance ≤ threshold radius, e.g. 50m)
  - If invalid GPS → reject scan, return 422
  - If valid → insert scan record into database
  - Publish event to Redis Pub/Sub channel: "scan:new"
      │
      ├──────────────────────────────────────┐
      ▼                                      ▼
[WebSocket Manager]                    [Report Scheduler]
  - Listens to Redis "scan:new"         - Checks if report conditions met
  - Broadcasts to all connected           (time window, min scans, etc.)
    dashboard clients                    - If yes → trigger report generation
      │                                      │
      ▼                                      ▼
[Dashboard]                              [Report Generator]
  - Receives scan event                    - Queries patrol data
  - Updates UI in real time                - Formats PDF/HTML report
  - No manual refresh needed               - Sends via email to client
```

---

## 3. API Structure

### Base URL: `/api/v1`

### Authentication

| Endpoint | Method | Description |
|---|---|---|
| `/auth/login` | POST | Authenticate user, returns JWT |
| `/auth/refresh` | POST | Refresh expiring JWT |
| `/auth/register` | POST | Create new user (admin only) |

### Scans

| Endpoint | Method | Description |
|---|---|---|
| `/scans` | POST | Submit a new scan (authenticated) |
| `/scans` | GET | List scans (paginated, filterable) |
| `/scans/:id` | GET | Get single scan detail |
| `/scans/recent` | GET | Get recent scans for real-time sync on reconnect |

### Checkpoints

| Endpoint | Method | Description |
|---|---|---|
| `/checkpoints` | GET | List all checkpoints |
| `/checkpoints` | POST | Create checkpoint (admin) |
| `/checkpoints/:id` | PUT | Update checkpoint (admin) |
| `/checkpoints/:id` | DELETE | Remove checkpoint (admin) |

### Reports

| Endpoint | Method | Description |
|---|---|---|
| `/reports` | GET | List generated reports |
| `/reports/:id` | GET | Download report file |
| `/reports/generate` | POST | Manually trigger report generation |

### WebSocket

| Channel | Direction | Payload |
|---|---|---|
| `scan:new` | Server → Client | `{ id, officer_name, checkpoint_name, timestamp, gps, status }` |
| `scan:alert` | Server → Client | `{ type: "missed_checkpoint" | "gps_mismatch", message, officer_id }` |

### Scan Payload (POST /api/v1/scans)

```json
{
  "officer_id": "uuid",
  "checkpoint_id": "uuid",
  "timestamp": "2026-05-10T14:30:00Z",
  "gps": {
    "latitude": 6.5244,
    "longitude": 3.3792
  }
}
```

### Scan Response

```json
{
  "id": "uuid",
  "status": "verified",
  "officer": { "id": "uuid", "name": "John Doe" },
  "checkpoint": { "id": "uuid", "name": "Main Gate", "code": "A1" },
  "gps_match": true,
  "distance_meters": 12,
  "timestamp": "2026-05-10T14:30:00Z"
}
```

---

## 4. Database Structure

### Option A: PostgreSQL (Relational)

#### Users Table
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| email | VARCHAR(255) | UNIQUE, NOT NULL |
| password_hash | VARCHAR(255) | NOT NULL |
| role | ENUM | `admin`, `supervisor`, `officer` |
| name | VARCHAR(255) | NOT NULL |
| phone | VARCHAR(20) | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

#### Checkpoints Table
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| name | VARCHAR(255) | NOT NULL |
| code | VARCHAR(50) | UNIQUE, e.g. "A1", "B2" |
| latitude | DOUBLE PRECISION | Registered GPS latitude |
| longitude | DOUBLE PRECISION | Registered GPS longitude |
| radius_meters | INTEGER | Acceptable verification radius, default 50 |
| active | BOOLEAN | DEFAULT true |
| created_at | TIMESTAMPTZ | |

#### Scans Table
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| officer_id | UUID | FK → users.id |
| checkpoint_id | UUID | FK → checkpoints.id |
| scanned_at | TIMESTAMPTZ | Timestamp from app |
| received_at | TIMESTAMPTZ | Server received timestamp |
| gps_latitude | DOUBLE PRECISION | Scanner's GPS at scan time |
| gps_longitude | DOUBLE PRECISION | Scanner's GPS at scan time |
| gps_valid | BOOLEAN | Whether GPS matched checkpoint |
| distance_meters | DOUBLE PRECISION | Calculated distance from checkpoint |

#### Reports Table
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| client_email | VARCHAR(255) | Recipient |
| period_start | TIMESTAMPTZ | Report coverage start |
| period_end | TIMESTAMPTZ | Report coverage end |
| format | VARCHAR(10) | `pdf` or `html` |
| file_url | TEXT | Storage URL |
| sent_at | TIMESTAMPTZ | When email was dispatched |
| status | ENUM | `pending`, `sent`, `failed` |

### Option B: MongoDB (Document)

```
Users collection:
  { _id, email, passwordHash, role, name, phone, createdAt }

Checkpoints collection:
  { _id, name, code, location: { type: "Point", coordinates: [lng, lat] }, radiusMeters, active, createdAt }

Scans collection:
  { _id, officerId, checkpointId, scannedAt, receivedAt,
    gps: { lat, lng }, gpsValid, distanceMeters }

Reports collection:
  { _id, clientEmail, periodStart, periodEnd, format, fileUrl, sentAt, status }
```

Create a **2dsphere index** on `checkpoints.location` and `scans.gps` for geospatial queries.

---

## 5. Component Responsibilities

### Mobile App (Flutter)

- **Authentication** — Login screen, JWT token storage (flutter_secure_storage)
- **QR Scanning** — Uses `mobile_scanner` package for camera-based QR decoding
- **GPS Capture** — Uses `geolocator` or `location` package to get coordinates at scan time
- **Offline Queue** — Queue scans when offline, submit when connectivity resumes
- **Scan History** — View personal scan history
- **Profile** — View/edit guard profile

### Backend

- **Auth Service** — JWT issue/verify, role-based middleware
- **Scan Service** — Validate incoming scans, GPS verification (haversine distance calculation), database insert
- **WebSocket Manager** — Maintain connections, broadcast scan events, handle reconnection
- **Report Service** — Scheduled + on-demand report generation (PDF/HTML), email dispatch
- **Redis Pub/Sub** — Decouple scan ingestion from WebSocket broadcast (horizontal scaling)
- **Cron / Scheduler** — Periodic check for report generation triggers

### Web Dashboard

- **Real-Time Feed** — WebSocket listener showing incoming scans as cards/rows
- **Map View** — Display checkpoints and live scan markers on a map (Leaflet/Mapbox)
- **History View** — Filterable, paginated scan table with search
- **Checkpoint Management** — CRUD for checkpoint locations and QR codes
- **Report Management** — View generated reports, trigger generation, resend emails
- **User Management** — Admin: create/edit users and roles

---

## 6. Real-Time Update Mechanism

### Architecture

```
[Backend] → Redis Pub/Sub (scan:new) → [WebSocket Server]
                                              │
                                              ▼
                                       [Dashboard Clients]
                                       (WebSocket connections)
```

- **Backend** publishes every validated scan to Redis channel `scan:new`
- **WebSocket server** (can be same process or separate) subscribes to Redis and forwards to connected browser clients
- **Redis** ensures broadcast works across multiple backend instances (horizontal scaling)
- **Fallback** — On dashboard load or WebSocket reconnect, client calls `GET /api/v1/scans/recent` to catch up on missed events

### Reconnection Protocol

1. Client disconnects (network issue, tab backgrounded, etc.)
2. On reconnect, client sends last known scan ID or timestamp
3. Server returns all scans since that ID/timestamp
4. Client replays missed events into the UI

---

## 7. Security Considerations

### GPS Validation

- Each checkpoint has **registered coordinates** and a **radius threshold** (configurable, default 50m)
- On scan submission, backend calculates **haversine distance** between checkpoint coords and submitted GPS
- If distance > radius → scan is **rejected** or **flagged** (configurable)
- Threshold should be generous enough to account for GPS inaccuracy (~10-30m)

### Authentication

- **JWT-based** with short expiry (access: 15 min, refresh: 7 days)
- Tokens stored securely in `flutter_secure_storage` (iOS Keychain / Android EncryptedSharedPreferences)
- Role-based access control (`admin`, `supervisor`, `officer`)

### QR Code Security

- QR codes encode a **cryptographically random UUID** (not sequential integers)
- Checkpoint IDs are meaningless without the backend mapping
- Prevents QR code replay/forgery

### Anti-Tampering

- Server timestamps (`received_at`) cannot be faked by the client
- GPS validation prevents scans from outside the checkpoint vicinity
- All API calls logged with IP and user agent for audit trail

---

## 8. Development Phases

### MVP (Phase 1)

**Goal:** Core scan → dashboard → email flow working end-to-end

| Component | Scope |
|---|---|
| Mobile App | Login, QR scanning, GPS capture, scan submission |
| Backend | Auth (JWT), scan endpoint with GPS validation, basic WebSocket broadcast |
| Dashboard | Real-time scan feed, simple scan list |
| Automation | Basic scheduled email report (dummy template) |
| Database | Scans, Users, Checkpoints tables |

### Phase 2

**Goal:** Production hardening, checkpoint management, polished reports

| Component | Scope |
|---|---|
| Mobile App | Offline queue, scan history, profile editing |
| Backend | Checkpoint CRUD API, report generation engine, Redis Pub/Sub |
| Dashboard | Map view, checkpoint management UI, report management, user admin |
| Automation | Professional PDF reports with branding, configurable schedules |
| Infrastructure | Docker containerization, CI/CD pipeline |

### Phase 3

**Goal:** Intelligence, advanced features, scale

| Component | Scope |
|---|---|
| AI Layer | Anomaly detection in patrol patterns, automated summary generation |
| Incident Reporting | Photo upload, incident categorization, escalation workflows |
| Analytics Dashboard | Charts, trends, officer performance metrics |
| Advanced Monitoring | Missed checkpoint alerts, SLA tracking, zone-based heatmaps |
| Multi-tenancy | Support multiple security companies on one deployment |
| Mobile App | Push notifications, NFC support, biometric auth |

---

## 9. Modular Breakdown for Build

```
patrol-monitoring/
├── backend/
│   ├── src/
│   │   ├── auth/            # JWT, login, register
│   │   ├── scans/           # Scan ingestion, GPS validation
│   │   ├── checkpoints/     # Checkpoint CRUD
│   │   ├── reports/         # Report generation & email
│   │   ├── websocket/       # WebSocket manager + Redis Pub/Sub
│   │   ├── common/          # Middleware, utils, config
│   │   └── main.ts / app.py
│   ├── tests/
│   ├── Dockerfile
│   └── package.json / requirements.txt
├── mobile/
│   └── patrol_app/
│       ├── lib/
│       │   ├── screens/     # Login, Scan, History, Profile
│       │   ├── services/    # API client, Auth, Location
│       │   ├── models/      # Data classes
│       │   └── widgets/     # Reusable UI components
│       └── pubspec.yaml
├── dashboard/
│   ├── src/
│   │   ├── components/      # ScanFeed, MapView, Tables
│   │   ├── pages/           # Dashboard, Reports, Admin
│   │   ├── services/        # API + WebSocket clients
│   │   └── App.tsx / App.vue
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
└── README.md
```

---

## 10. Key Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Real-time | WebSockets (Socket.IO) | Mature, auto-reconnect, fallback to long-polling |
| Pub/Sub | Redis | Required for horizontal scaling of WebSocket servers |
| GPS validation | Haversine formula | Simple, fast, no external API dependency |
| QR encoding | UUID v4 | Random, non-sequential, secure |
| Database | PostgreSQL (recommended) | Strong consistency, geospatial (PostGIS), relational integrity |
| Email | Gmail API | Reliable, free tier available, OAuth2 security |
| Report format | HTML → PDF (Puppeteer/Playwright) | CSS-controlled styling, easy templating |
| Auth | JWT (RS256) | Stateless, no session store needed |
