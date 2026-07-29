# 🎯 Current Task

> **Every agent reads this file first.** Keep it to one active focus.

## Active Focus

> ⚠️ **2026-07-28 — READ [[Session_2026-07-28_Prod_Switch_And_GPS]] FIRST.**
> Everything below this box predates the production switch and is partly stale.
>
> - **We are on PROD Convex now: `harmless-pigeon-186`.** `dev:resilient-buffalo-226`
>   is a fallback and nothing points at it. Full 678-doc snapshot migration, verified.
> - Convex source is **`mobile/patrol_app/convex/`**, not the repo-root `convex/`.
> - `main` is at `cdf19cf`. Today shipped: password-reset removal, the GPS
>   cold-receiver fix, Google Places address search, prod repointing.
> - **Offline cache is PAUSED and parked on `offline-work-paused` (`8950b51`).**
>   Do not merge it. It was compiling into builds and the user does not want it.
> - `flutter build ios --release` **fails** — repo sits in an iCloud-synced Desktop
>   and `codesign` rejects `com.apple.FinderInfo`. Debug builds are fine. The user
>   has declined to move the repo; don't re-raise it.
> - **Outstanding:** rotate `RESEND_API_KEY`, `TERMII_API_KEY`, `NVIDIA_API_KEY`
>   (leaked in transcript; only the user can do it).

- **PHASE 2 + PRODUCTION HARDENING — SHIPPED + MERGED TO `main` THROUGH 2026-07-12.**
  Latest commit `660968e` on `main` (feature/client-structure fast-forwarded in and
  pushed to origin/main). All deployed LIVE to `dev:resilient-buffalo-226`.
  Dev DB has been purged of all seed/test tenants — only real data remains
  (admin, guards Adebayo+Adejuwon, client NAFDAC + site IKA).
- **USER DIRECTIVE (2026-07-11): this is PRODUCTION now, not a demo.** Every new line of code
  must be production-grade. No demo shortcuts, no stubs that fake success. The remaining demo
  leftovers (demo accounts, Clerk migration, prod Convex deploy, release APK) are deliberately LAST.

## Shipped (newest first — all live-verified)
-1. **`660968e` (07-12) Personnel page fix + seed/test-tenant DB purge.**
   - Personnel/Team page was listing `main_account` (client portal) logins as if
     they were staff — NAFDAC/Acme/"Client Admin" showed next to real guards.
     Fixed: `web/src/pages/Users.tsx` now filters to guard+supervisor only;
     removed main_account from the role filter and Add-Personnel form.
   - Purged ALL seed/test tenants from `dev:resilient-buffalo-226` via a one-off
     `clients.purgeSeedTenants` cascade mutation (added, run, then REMOVED — not
     in the codebase). Deleted the SecureCorp-as-client
     (`j97eh65v3xn9p6zt61…`) and Acme (`j971dfmmpyahdqms9m…`) tenants +
     dependents: 2 clients, 4 sites, 6 checkpoints, 3 users (Field Guard,
     Client Admin, Acme Estates portal), 6 Field-Guard scans, 5 reportSubmissions
     (+PDF blobs), 113 auditLogs, 30 siteActivityEvents, 27 officerPositions, etc.
   - KEPT (verified): admin@securecorp.com (clientId=None), guards ADEBAYO STEPHEN
     + ADEJUWON TOPE (clientId=None), NAFDAC client + IKA site, and the real
     guards' scans. Real staff/admin have clientId=None so were structurally
     excluded from the purge.
   - STILL PRESENT (flagged, not deleted — user didn't approve): two orphan
     checkpoints `OWT-322` and `Jumia Services, Ahmadu Bello Way` (clientId/siteId
     null, no scans) + `Ishawo, Ikorodu` (kept — holds Adebayo's real scans, but
     also orphaned with no client). Legacy pre-restructure data.
   - NOTE: the operating company is still seed-branded "SecureCorp Nigeria" /
     admin@securecorp.com — real company name + admin email is production-cutover work.
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
