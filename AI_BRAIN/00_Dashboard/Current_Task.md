# 🎯 Current Task

> **Every agent reads this file first.** Keep it to one active focus.

## Active Focus
- **DEMO READINESS: ✅ COMPLETE (2026-07-04).** AGM-approved demo is a GO. The system was
  audited end-to-end, all blockers fixed, and everything verified against the LIVE backend
  (`dev:resilient-buffalo-226`, HTTP at `resilient-buffalo-226.convex.site/api/v1`).
- **Next phase: PRODUCTION HARDENING.** Work the checklist below (also mirrored in [[Todo]]).
  Auth is intentionally deferred — the plan is to connect **Clerk** (user's decision, not yet).

## Demo verification results (2026-07-04)
- Guard workflow **16/16 green**: login → pass-on ack → clock-in (GPS) → QR scan → post
  orders → visitor in/out → truck in/out → incident → maintenance → emergency → DAR → clock-out.
- Admin: all 29 GET endpoints 200. Client portal: 8/8 views 200 (tenant-scoped).
- **Exports verified** (user's explicit ask): POST/GET `/scans/export/daily` (CSV generates +
  downloads), GET `/activity-summary/export` (CSV). Reports land in `/reports` → `submissions` key.
- AI assistant `/ai/chat` (field is `message`, not `question`) answers from live data.
- **Load test: 50 concurrent guard logins + startup calls = 300/300 requests OK in 9.3s.**
  Login ~2.2s median (bcrypt cost — intentional), everything else ≤1.3s p95.
- API keys all set on live deployment: Termii ✓ Resend ✓ NVIDIA ✓ JWT ✓.
  (⚠ prod deployment is missing NVIDIA_API_KEY — copy envs when switching.)
- Builds: `web/` ✓, `web-client/` ✓, `flutter analyze` ✓ (1 cosmetic unused field remains in
  `lib/screens/scan_result_screen.dart:39` — user declined the auto-fix, leave unless asked).

## Fixes shipped & deployed today (2026-07-04)
1. `convex/http.ts` — double clock-in now returns **409** (was 500); scan at unassigned site
   returns **403** (was 500). Business errors from mutations are caught and mapped.
2. `convex/dev.ts` — `ensureDemoContent` now also assigns the demo guard to the checkpoint's
   site (userSiteAssignments), so QR scans work out of the box.
3. **Security: dev endpoints locked down.** `/dev/seed` requires `Bearer <DEV_SEED_SECRET>`
   (env var set on the deployment, random 64-hex; endpoint 404s if env unset) AND an empty
   users table. `/dev/demo-content` requires a real authenticated **admin** JWT.
   Verified live: fake headers → 401; real admin → 200.
4. ⚠ **These convex/ changes are NOT committed to git yet** (user hasn't said commit).

## Production-hardening checklist (before real launch)
- [ ] Switch to Convex **prod deployment** + repoint mobile/web/web-client (user will handle)
- [ ] Copy all env vars to prod (esp. NVIDIA_API_KEY) during the switch
- [ ] Connect **Clerk** for auth (user's plan; replaces `123456` passwords, adds rate limiting + token expiry)
- [ ] Remove/disable demo accounts `*@securecorp.com` before real users
- [x] Lock down `/dev/seed` + `/dev/demo-content` (done 2026-07-04)
- [ ] Build + smoke-test signed release APK on a real device
- [ ] Storage cleanup cron for old export CSVs (low priority)
- [ ] Uptime monitoring/alerting (low priority)
- [ ] Decide CSV-only vs PDF exports (`/reports/{id}/pdf` is a stub by design)

## Demo accounts (live)
admin@securecorp.com / 123456 (web) · client@securecorp.com / 123456 (portal, clientType "client")
· guard@securecorp.com / 123456 (mobile, clientType "mobile")

## Context / Constraints
- Real backend = `mobile/patrol_app/convex/` (NOT top-level `/convex/`, NEVER `/backend/`).
- Deploy with `npx convex dev --once` (the dev deployment IS live; `npx convex deploy` goes to
  the unused prod deployment).
- Only `/api/v1/*` paths work on convex.site (bare paths 404 — harmless).
- Canonical repo = `~/Desktop/PatrolSecurity_Ecosystem` (the `~/PatrolSecurity_Ecosystem` clone is stale).
- Test scripts live in Claude's session scratchpad: `guard_flow.py`, `admin_verify.py`, `load_test.py`.

## Owner
- Lead agent: [[Claude_Code]]

## Related
- [[Roadmap]] · [[Todo]] · [[Decision_Log]] · [[Bug_Tracker]] · [[Session_Log]]

_Last updated: 2026-07-04_
