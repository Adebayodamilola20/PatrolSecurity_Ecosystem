# 🎯 Current Task

> **Every agent reads this file first.** Keep it to one active focus.

## Active Focus
- **PHASE 2 + PRODUCTION HARDENING — SHIPPED THROUGH 2026-07-12.** Branch
  `feature/client-structure`, latest commit `c937598`, all deployed LIVE to
  `dev:resilient-buffalo-226` and verified end-to-end. NOT merged to `main` — user review pending.
- **USER DIRECTIVE (2026-07-11): this is PRODUCTION now, not a demo.** Every new line of code
  must be production-grade. No demo shortcuts, no stubs that fake success. The remaining demo
  leftovers (demo accounts, Clerk migration, prod Convex deploy, release APK) are deliberately LAST.

## Shipped (newest first — all live-verified)
0. **`c937598` (07-12) Fix "Proof Photo Reviews" panel on admin Post Orders.**
   - Symptom: the panel showed junk rows ("Post order completion · Field Guard ·
     No checkpoint", VERIFIED/REJECTED). These were plain post-order
     ACKNOWLEDGEMENTS (the "read & press OK after scan" rows), not proof photos.
   - `postOrders.listCompletions` returned `orderTitle` (nothing read it) and no
     checkpoint name → every row fell back to the generic label. Renamed to
     `postOrderTitle` + added `checkpointId`/`checkpointName`.
   - The review queue now filters to real proof submissions
     (`status === "completed" || proofPhotoUrl`) — acknowledgements no longer
     masquerade as pending reviews. Proof `<img>` now handles absolute URLs too.
1. **`b07b956` (07-12) Report templates by category + per-point patrol history.**
   - 10 templates (clock-in, clock-out, patrol-scan, location-verification, incident,
     maintenance, daily-activity, emergency, visitor, truck) in
     `convex/lib/reportTemplates.ts` — MIRRORED at `web/src/lib/reportTemplates.ts`, keep in sync.
   - Staff Reports page: New Report → category picker → template form auto-loads → addressed to
     the owning client (+optional location; cross-client location rejected server-side) →
     `POST /reports` (`reports.createFromTemplate`, full field validation). Report lands in that
     client's portal inbox and renders in the PDF automatically.
   - Admin archive: filters by category / client / date range (`GET /reports?type=&clientId=&startDate=&endDate=`),
     View modal (field-by-field), PDF re-download. Dead clientEmail form + fake resend REMOVED.
   - Portal Locations: every location QR + sub-location has a **History** toggle → recent
     patrols (anonymized) via tenant-checked `portalScans({checkpointId, limit})`
     (`GET /client/scans?checkpointId=`; foreign/bogus ids return []).
2. **`7946df1` (07-11) Post orders fire on scan + real PDF engine.** Post orders scope to a
   location (siteId) or sub-location (checkpointId); scan responses carry triggered orders;
   mobile popup + mandatory-ack flow cover both. `convex/pdfService.ts` ("use node", pdf-lib)
   renders reports to cached A4 PDFs; `/reports/:id/pdf` + `/client/reports/:id/pdf`
   (tenant-checked, guard-anonymized INCLUDING title scrub via `lib/anonymize.ts`).
   `npx convex run reports:clearPdfCache` after PDF layout changes.
3. **`47a436e` (07-11) Production sessions.** 30-min JWTs + rotating refresh tokens (hashed,
   family revocation on reuse, purge cron); `/auth/refresh` + `/auth/logout`; password change
   revokes all sessions; Flutter proactive refresh (offline-tolerant). Portal DEMO login
   bypass removed. **PATROL_JWT_SECRET rotated** — pre-rotation tokens all dead.
   ⚠️ Mobile app must be REBUILT (old builds have no refresh → logout every 30 min).
4. **`719bd30` (07-11) Tenant isolation.** Client tokens rejected on all routes except
   /auth/me + /client/* (`allowClientPortal` opt-in). 21 staff endpoints verified 401.
5. Earlier same day: `faf2b12` CheckpointDetail redesign · `c8565e2` guard-assignment UI ·
   `668a4ed` location-own-QR (isPrimary, backfilled) · `3918fe6` portal guard-stats.

## Next steps (agreed, not started)
1. Scheduled/emailed client report delivery (Resend already configured on the deployment).
2. Portal live refresh (poll first, Convex reactive later).
3. Edit-location UI (NAFDAC "IKA" has a 5000m geofence — likely too big; fixable via PUT /sites/:id).
4. LAST (production cutover): remove demo accounts, Clerk auth, prod deploy, release APK.
   Also: `/auth/reset-password` still a stub; forgot-password sends no real email.

## Key facts / credentials (dev)
- Deploy ONLY with `npx convex dev --once` from `~/Desktop/PatrolSecurity_Ecosystem/mobile/patrol_app`
  (NEVER `convex deploy`, NEVER from the stale `~/PatrolSecurity_Ecosystem` home clone).
- API base: `https://resilient-buffalo-226.convex.site/api/v1`.
- Logins: admin `admin@securecorp.com/123456` (clientType "web") · guard `guard@securecorp.com/123456`
  ("mobile") · portal `portal@acme-test.com/AcmePortal2026` ("client"). Real client: NAFDAC /
  `nafdac@idawostr.com`, location "IKA" (6.6315449, 3.5238621, 5000m).
- Login returns `{ token, refreshToken, expiresInSeconds: 1800, user }`.
- Test data on Acme: sub-location "Front Gate" + "PO Verify Point", two deactivated
  verification post orders, one guard daily-activity report + one staff incident report
  (both have cached PDFs).
- iOS builds: use `flutter run` + hot reload; avoid `flutter clean` (user's slow-Xcode issue).

## Owner
- Lead agent: [[Claude_Code]]

## Related
- [[Roadmap]] · [[Todo]] · [[Decision_Log]] · [[Bug_Tracker]] · [[Session_Log]]

_Last updated: 2026-07-12_
