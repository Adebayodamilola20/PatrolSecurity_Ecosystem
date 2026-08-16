# Evergreen — patrol monitoring

Four surfaces around one backend: a Flutter app the guards carry, a control-room
dashboard, a client-facing portal, and a Convex backend holding the lot together.

Guards scan a QR code at each point on their round. The scan is accepted only if
the phone can prove where it is, and everything downstream — the live map, the
client's report, the missed-patrol alarm — is built from those scans.

This is a working system for one security operator, not a product. It is public
so the work can be read, and it is written with that in mind.

---

## Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Running it](#running-it)
- [Design decisions and their costs](#design-decisions-and-their-costs)
- [Known limitations](#known-limitations)
- [Security posture](#security-posture)
- [Not built yet](#not-built-yet)

---

## What it does

**For the guard.** Clock in (refused without a GPS fix), scan the location's QR
code on arrival, then scan the sub-locations inside it. Read pass-on
instructions and acknowledge them before scanning. File observations, incidents,
visitor and truck logs. Press a panic button that reaches the control room and
every guard on the same site.

**For the control room.** A live map of who is on shift and where, a scan feed,
missed-patrol alarms with the duration missed, timesheets from GPS-verified
clock-ins, client reports across five templates (incident, maintenance,
emergency, visitor, truck), post orders scoped to a location or a single gate,
and an emergency lifecycle — triggered → acknowledged → responding → resolved —
with a name against each step.

**For the client.** Their own locations only: what was patrolled and when, who
was on site, reports, pass-ons they write for the guards, and a panic button of
their own.

---

## Architecture

```
Flutter app (guards)  ─┐
Admin dashboard       ─┼─▶  Convex  ─┬─▶  Document store + file storage
Client portal         ─┘   HTTP API  ├─▶  Scheduled jobs (missed patrols, stale
                                     │    shifts, GPS retention, token and
                                     │    upload cleanup)
                                     └─▶  Resend (email) · Termii (SMS)
```

The backend is **Convex** — 42 modules and 37 tables. Public routes are served
from `http.ts` under `/api/v1`; everything behind it is an internal query,
mutation or action that the HTTP layer calls. Convex's own client SDK is not
used by any frontend, which keeps all three on one ordinary REST surface and
means the mobile app is not coupled to the database vendor.

| Layer | What it actually is |
|---|---|
| Backend | Convex (TypeScript) — queries, mutations, actions, cron jobs |
| Guard app | Flutter — `mobile_scanner`, `geolocator`, `flutter_map`, `flutter_secure_storage` |
| Admin dashboard | React 19 + Vite + TypeScript, Tailwind v4, Zustand, Leaflet, Recharts |
| Client portal | React 19 + Vite + TypeScript, Tailwind v4, Leaflet |
| Auth | bcrypt; 30-minute access token, 30-day refresh token with single-use rotation |
| Errors | Sentry on all four surfaces |
| Hosting | Vercel (two projects) · Convex (managed) |

---

## Repository layout

```
mobile/patrol_app/
  convex/          the backend — schema.ts, http.ts, and 40 modules beside them
  lib/             the Flutter guard app
  test/            Dart tests
web/               control-room dashboard  (design.md holds its design system)
web-client/        client portal           (design.md holds its design system)
docs/              decision records
scripts/setup.sh   first-run setup, including the git hooks path
```

The backend lives inside the Flutter app's folder for historical reasons. It is
the real one — the `convex/` directory at the repo root is a leftover and is not
what deploys.

---

## Running it

```bash
./scripts/setup.sh          # installs deps and, importantly, enables hooks/
```

`git config core.hooksPath hooks` is the step you cannot skip. Git does not
enable `hooks/` on clone, and until it is set the pre-commit guard that blocks
`.env` files, certificates and live API keys is inactive on your machine.

```bash
cd web && npm install && npm run dev          # dashboard
cd web-client && npm install && npm run dev   # client portal
cd mobile/patrol_app && flutter run           # guard app
cd mobile/patrol_app && npx vitest run        # backend tests
cd mobile/patrol_app && flutter test          # app tests
```

> Do not keep this repo in iCloud Drive. It corrupts `.git` and `node_modules`;
> this repo has already lost git objects to it once. On a Mac that also means
> `flutter build ios --release` will fail on codesign from `~/Desktop`.

---

## Design decisions and their costs

Every one of these is a trade. They are recorded with what was given up,
because a decision without a cost attached is usually one that was never made.

**A scan without a GPS fix is rejected outright.**
The permissive version — accept it, mark it unverified — is what most systems
do, and it made the whole product decorative: a guard could turn location off
and log a full night's patrol from a car park with no tampering at all. The cost
is real and lands on the guard: a phone with a broken GPS, or a basement with no
sky, means no clock-in and no scan, and someone has to deal with that at 2am.
That is a support burden the operator accepted knowingly, and it is the right
side to fail on for a system whose only product is proof.

**Convex instead of a conventional API server and Postgres.**
Bought: no infrastructure to run, transactional mutations by default, scheduled
jobs and a document store without wiring three services together. Paid: real
vendor lock-in, bcrypt cannot run inside a mutation so password hashing has to
live in the HTTP layer, and there is no query planner to save you — a full table
scan is easy to write by accident and several were, then found and fixed.

**Polling rather than push notifications.**
The guard app polls for emergencies every 30 seconds and the dashboard every 10.
This is the wrong mechanism and it is in place because the FCM and APNs
credentials do not exist yet, not because it was chosen. It costs battery, it
costs up to 30 seconds of latency on the one feature where latency matters most,
and a phone with the app backgrounded gets nothing at all. See
[Not built yet](#not-built-yet).

**Two separate React apps rather than one with role-based routing.**
Bought: a bug in the client portal cannot reach staff data, and the two can be
deployed and broken independently. Paid: genuine duplication — the wordmark, the
card primitives and the design system exist twice and have to be changed twice,
and they have already drifted once.

**Background location while clocked in.**
Bought: a guard's position stays live with the phone pocketed and the app shut,
which is the only way the live map is worth looking at. Paid: battery, an
always-on permission that is a harder sell in app review and to the guards
themselves, and a privacy obligation the operator has to honour. Tracking is
scoped to an open shift and stops at clock-out.

**Emergency attribution is capped at 500m.**
"Nearest checkpoint" with no ceiling is not a location — it is whichever pin is
least far away on the planet. It once put a guard at a site 12,000km from where
his phone said he was, and named a client he had never worked for. Outside the
cap the alert now says the position is unknown and gives the coordinates. A
vaguer alert that is true beats a precise one that is invented.

**Red is reserved for emergencies.**
No destructive button, no validation error and no overdue chip may use it — not
even a stat tile reading "4 missed patrols", which renders amber. A colour that
means one thing is readable across a control room; the moment it also means
"required field", nobody looks up for it.

---

## Known limitations

Stated plainly, because they change what this system can be trusted to do today.

- **Outbound email and SMS do not reach clients or guards.** Resend has no
  verified sending domain, so it falls back to a shared sender that only
  delivers to the account owner. Report emails and emergency alerts aimed at
  anyone else go nowhere, silently. The domain is registered and waiting on DNS
  — see [`docs/email-sending-decision.md`](docs/email-sending-decision.md). This
  is the single largest gap between what the system does and what it appears to
  do.
- **A backgrounded phone does not buzz for an emergency.** Polling only runs
  while the app is alive. See above.
- **Supervisors see every client, by design.** They are unscoped staff, matching
  admin. If a supervisor should ever be restricted to a subset of clients, that
  is a change, not a bug fix.
- **An offline scan is trusted on its own word for timing.** Scans queue on the
  phone and sync when signal returns, which is the difference between a usable
  app and a toy on a site with no coverage. The scan carries both `scannedAt`
  from the device and `receivedAt` from the server, so the gap is always visible
  — but the device clock is the only witness to when it happened, and a phone's
  clock can be changed. GPS is verified on receipt regardless. Treat a large
  gap between the two as worth a question.
- **Reports are generated on request, not on a schedule.** The scheduled-delivery
  path depends on the email gap above.

---

## Security posture

What is actually enforced, as distinct from what is aspired to.

| Area | Position |
|---|---|
| Passwords | bcrypt, cost 10. Never returned by any API, never logged. There is no plaintext-retrieval path, including for admins. |
| Sessions | 30-minute access token; 30-day refresh token, single-use, rotated on every exchange. A token presented after rotation is treated as stolen and the family is revoked. |
| Tenant isolation | Enforced server-side on every route. A client account can only read and act on its own sites; guards only see what they are posted to. Frontend filtering is treated as presentation, never as a control. |
| Scan integrity | Server-side Haversine check against the sub-location's own coordinates, falling back to the parent site's. No coordinates means rejection, not a pass. |
| QR codes | Random identifiers, meaningless without the backend mapping. |
| Abuse | Per-actor rate limits and sharded global load shedding on scans, positions, incidents, reports, exports and login, with a per-IP bucket on login. Emergencies are exempt from *global* shedding — a system under load is exactly when a panic button must still work — but keep their per-actor limit. |
| Audit | Mutating routes write an audit row with actor, action and IP. |
| Location retention | GPS breadcrumbs are purged after 30 days by a nightly job (`GPS_POSITION_RETENTION_DAYS`). Positions are only written once a guard has actually moved, so a stationary post does not accumulate identical rows. |
| Monitoring | Sentry across backend, both web apps and Flutter. |

A written assessment lives outside this repo deliberately; it is not published.

---

## Not built yet

- **Push notifications (FCM/APNs).** Blocked on credentials only the operator
  can create: a Firebase project, `google-services.json`, an APNs `.p8` key with
  its Team and Key IDs, and an FCM service-account JSON. `firebase_messaging` is
  deliberately absent from `pubspec.yaml` — adding it without the config files
  breaks the build for everyone.
- **Verified email domain.** Waiting on DNS. See above.
- **NFC checkpoints** alongside QR.

---

## Conventions

- `web/design.md` and `web-client/design.md` are binding for their app's visual
  layer. Read the relevant one before changing anything you can see.
- Comments explain why, not what. A comment restating the line beneath it is
  noise; one explaining the outage that produced the line is worth keeping.
- Backend tests use `convex-test` and address routes by bare path, without the
  `/api/v1` prefix the HTTP layer adds externally.
