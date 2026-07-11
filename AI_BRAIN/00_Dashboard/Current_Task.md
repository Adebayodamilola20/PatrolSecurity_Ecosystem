# 🎯 Current Task

> **Every agent reads this file first.** Keep it to one active focus.

## Active Focus
- **PHASE 2: CLIENT-CENTRIC RESTRUCTURE — CORE SHIPPED (2026-07-10).** Branch
  `feature/client-structure` (commits `81866aa` → `780beeb` → `82af6ea`), deployed LIVE to
  `dev:resilient-buffalo-226` and verified end-to-end. NOT yet merged to `main` — user review pending.
- AGM's new model: **Admin creates client accounts (email+password) → client owns Locations
  (sites, with address + GPS + geofence radius) → Locations own Sub-locations (checkpoints,
  plain QR, NO coordinates)**. Everything nests under the client account in the admin web app;
  the client portal mirrors it read-only.

## What shipped (2026-07-10)
1. **Atomic client creation**: `POST /clients` now requires a password and provisions the
   company + `main_account` portal login in one transaction. The `123456` default is gone.
2. **Admin web**: sidebar "Checkpoints" → **"Clients"**. New pages `Clients.tsx` (list +
   create modal) and `ClientDetail.tsx` (client info, add locations w/ Leaflet map + geofence,
   add sub-locations name-only → QR auto-generated + download/print, per-point scan activity).
   `/checkpoints` redirects to `/clients`; `CheckpointDetail` kept for printed-QR deep links.
3. **Scan verification rework** (`scans.ts`): checkpoint w/ own GPS → legacy reject behavior;
   checkpoint w/o GPS → guard's ping vs parent site geofence → recorded either way, flagged
   `gpsValid` true/false (**Verified/Unverified badge, not a 403**). Site w/o GPS → scan-only.
   Clock-in geofence (`shifts.ts`) prefers site coords, falls back to legacy checkpoint coords.
4. **Portal endpoints REBUILT** — the July-4 `/client/*` routes were lost in the git accident
   (wiped from source AND live deploy; all 404'd). Rebuilt: `/client/sites` (hierarchy),
   `/client/overview` (guard NUMBERS only — AGM privacy rule), `/client/scans` (guard names
   anonymized to "On-duty guard"), `/client/reports`. Portal has new read-only `Locations.tsx`;
   `/checkpoints` → `/locations`. NOTE: `/client/guards` deliberately NOT rebuilt (AGM: clients
   never see guard identities) — portal Guards/GuardDetail pages still call it → next package.
5. **`POST/DELETE /site-assignments`** (admin/supervisor): assign guards to sites — without an
   assignment every scan at a new location is rejected. No admin UI for this yet → next package.

## Live verification (2026-07-10, all on dev:resilient-buffalo-226)
- Created client "Acme Estates" (`portal@acme-test.com` / `AcmePortal2026`) → portal login OK.
- Location "Acme Head Office" (6.4541, 3.3947, 150m) → sub-location "Front Gate" (QR, no GPS).
- Demo guard assigned via /site-assignments; scan at 16m → `gpsValid: true`; scan at 2546m →
  **recorded** with `gpsValid: false`. Both visible in admin client detail (2 scans / 1
  verified) and portal (`/client/sites`, `/client/overview`, anonymized `/client/scans`).
- Convex typechecks clean; `web/` and `web-client/` build clean.
- Test data left in place as a demo example (deactivate via PUT /clients/:id if unwanted).

## Next package (discussed with user, not started)
- Admin UI for guard↔site assignment (backend route exists).
- Portal Guards page → stats card ("4 / 7 Guards Present"), remove GuardDetail (AGM rule 8/9).
- Report template system (AGM rule 5/6) + client report inbox grouping.
- Real-time refresh for portal (poll first, Convex reactive later).
- Then the existing production-hardening checklist (Clerk, prod deploy, release APK…).

## Context / Constraints
- Real backend = `mobile/patrol_app/convex/` (NOT top-level `/convex/`, NEVER `/backend/`).
- Deploy with `npx convex dev --once` from `mobile/patrol_app` (dev deployment IS live).
- Canonical repo = `~/Desktop/PatrolSecurity_Ecosystem`; work is on branch
  `feature/client-structure`. The `~/PatrolSecurity_Ecosystem` clone carries the same feature
  branch (commit `81866aa`) but is otherwise stale — don't push from it.
- Demo accounts: admin@securecorp.com / client@securecorp.com / guard@securecorp.com (all `123456`).
- ⚠ If Claude Code loses Desktop file access again (EPERM): quit/reopen Ghostty, run
  `claude --continue`, click Allow on the macOS Files-and-Folders popup.

## Owner
- Lead agent: [[Claude_Code]]

## Related
- [[Roadmap]] · [[Todo]] · [[Decision_Log]] · [[Bug_Tracker]] · [[Session_Log]]

_Last updated: 2026-07-10_
