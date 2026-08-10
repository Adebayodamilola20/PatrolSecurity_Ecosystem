# Patrol Monitoring & Automated Reporting System

Real-time QR-code based patrol tracking with automated client reporting for security companies.

## Problem Statement

Security companies struggle with **limited visibility** into field operations. Control rooms lack real-time awareness of patrol officer activity, patrol verification relies on paper logs that can be falsified, and client reporting is manual and slow. This creates accountability gaps, delays in incident response, and poor client communication.

## Solution Overview

A three-tier system connecting **mobile patrol officers**, **control room supervisors**, and **clients** in real time:

- Guards scan QR codes at checkpoints using a **Flutter mobile app**
- Scans are instantly transmitted to the **backend** and reflected on the **live web dashboard**
- The system **automatically generates and emails** professional patrol reports to clients

No manual logbooks. No delayed reporting. Complete real-time accountability.

## Features

| Feature | Description |
|---|---|
| QR Code Scanning | Guards scan checkpoint QR codes to log patrol visits |
| GPS Validation | Each scan includes GPS coordinates to prevent fake check-ins |
| Real-Time Dashboard | Live view of all patrol activity — no page refresh needed |
| Automated Reports | Professional operational reports auto-generated and emailed to clients |
| Patrol History | Complete searchable history of all patrols and scans |
| Officer Accountability | Every scan is timestamped and geotagged to an officer |

## Project Structure (Monorepo)

```
patrol-monitoring/
├── web/                # React + TypeScript dashboard (this)
│   ├── src/
│   │   ├── components/ # Reusable UI components
│   │   ├── pages/      # Route pages (Dashboard, Scans, etc.)
│   │   ├── services/   # API & WebSocket clients
│   │   ├── stores/     # Zustand state management
│   │   └── types/      # TypeScript type definitions
│   ├── public/
│   └── package.json
├── mobile/             # Flutter Android app (coming next)
├── backend/            # API server (planned)
├── README.md
└── SYSTEM_ARCHITECTURE.md
```

## System Architecture

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│                     │     │                      │     │                     │
│   Flutter Mobile    │────▶│    Backend API       │────▶│   Web Dashboard     │
│   App (Android)     │     │    (Node.js/FastAPI) │     │   (React/Vue)       │
│                     │     │                      │     │                     │
└─────────────────────┘     └──────────┬───────────┘     └─────────────────────┘
                                       │
                                       ▼
                              ┌──────────────────┐
                              │                  │
                              │   Database       │
                              │   (PostgreSQL/   │
                              │    MongoDB)      │
                              │                  │
                              └────────┬─────────┘
                                       │
                                       ▼
                              ┌──────────────────┐
                              │                  │
                              │  Email Service   │
                              │  (Gmail API /    │
                              │   SendGrid)      │
                              │                  │
                              └──────────────────┘
```

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile App | Flutter (Dart) |
| Backend | Node.js (Express) or FastAPI (Python) |
| Database | PostgreSQL or MongoDB |
| Dashboard | React + TypeScript + Vite |
| Real-time | WebSockets (Socket.IO) |
| Email | Gmail API / SendGrid / SMTP |
| QR Scanning | `mobile_scanner` Flutter package |
| Auth | JWT-based authentication |

## How the System Works

1. **Setup** — QR codes are generated and placed at each checkpoint location.
2. **Scan** — Guard opens the mobile app, authenticates, and scans a checkpoint QR code.
3. **Verification** — The app captures GPS coordinates and sends the scan data (officer ID, checkpoint ID, timestamp, GPS) to the backend.
4. **Validation** — Backend validates the GPS coordinates against the checkpoint's registered location (within a configurable radius).
5. **Storage & Broadcast** — Valid scan is stored in the database and broadcast via WebSocket to the live dashboard.
6. **Notification** — Dashboard updates in real time. If configured, automated report generation is triggered.
7. **Reporting** — At scheduled intervals or on demand, the system compiles patrol data into a formatted report and emails it to the client.

## Quick Start

### First-time setup (required)

```bash
./scripts/setup.sh
```

This enables the shared git hooks and installs dependencies. If you'd rather do
it by hand, the one step you must not skip is:

```bash
git config core.hooksPath hooks
```

Git does **not** enable `hooks/` automatically on clone. Until you run that, the
`pre-commit` guard that blocks `.env` files, certificates, Firebase service
accounts and live API keys is inactive on your machine.

> **Do not keep this repo in iCloud Drive** (`~/Desktop` or `~/Documents` with
> "Desktop & Documents Folders" turned on). It corrupts `.git` and `node_modules`
> — this repo has already lost git objects and had `node_modules` silently
> gutted and duplicated into `node_modules 2` copies.

### Web Dashboard

```bash
cd web
npm install
npm run dev        # Development server on http://localhost:5173
npm run build      # Production build to dist/
```

### Mobile App (coming next)

```bash
cd mobile
flutter pub get
flutter run
```

### Backend (planned)

Refer to `backend/` for setup instructions once implemented.

## Deploy

Backend and dashboard can be deployed on any cloud platform (AWS, GCP, DigitalOcean, etc.). The dashboard builds to static files in `web/dist/`.

## Security

The system is designed with multiple layers of security to prevent fraud, unauthorized access, and data tampering:

| Layer | Mechanism |
|---|---|
| **Authentication** | JWT-based with short-lived access tokens (15 min) and refresh tokens (7 days). Tokens stored in `flutter_secure_storage` (iOS Keychain / Android EncryptedSharedPreferences). |
| **Authorization** | Role-based access control — `admin`, `supervisor`, and `officer` roles with distinct permissions. |
| **GPS Validation** | Every scan includes GPS coordinates verified against the checkpoint's registered location using Haversine distance calculation. Scans outside a configurable radius (default 50m) are flagged or rejected. |
| **QR Code Security** | Checkpoint QR codes encode cryptographically random UUIDs (not sequential IDs), making them unforgeable. The codes are meaningless without backend mapping. |
| **Server Timestamps** | Server records `received_at` timestamps that cannot be spoofed by the client, ensuring an accurate audit trail. |
| **Audit Logging** | All API calls are logged with IP address, user agent, and timestamp for complete traceability. |
| **Data in Transit** | All communication between mobile app, backend, and dashboard is encrypted via HTTPS/WSS. |
| **Session Management** | Configurable session timeout. Option for two-factor authentication (Phase 2). |

## Future Improvements

- AI-generated patrol summaries and anomaly detection
- Incident reporting with photo upload
- Advanced analytics dashboard with charts and trends
- NFC support alongside QR codes
- Shift scheduling and guard assignment
- Push notifications for missed checkpoints

## Benefits

- **Real-time visibility** — Know exactly where every officer is at all times
- **Accountability** — GPS-verified scans prevent check-in fraud
- **Speed** — Clients receive reports automatically, no manual compilation
- **Cost reduction** — Less control room staff time spent on reporting
- **Professionalism** — Consistent, branded reports delivered on schedule
- **Data-driven decisions** — Historical patrol data enables better resource allocation
