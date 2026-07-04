# 📝 Session Log

Per-session notes of **major changes**. Newest first. Short bullets only — what changed and why. No large code.

> Format: `## YYYY-MM-DD — Agent — Session title`

## 2026-06-30 — [[Claude_Code]] — Scaffolded Client Portal (`web-client/`)
- Created new standalone Vite app `web-client/` mirroring `web/` stack (config, tsconfig, eslint, vercel.json, .env.local → live Convex).
- Frontend skeleton: `App.tsx` routing + auth guard, `useClientAuthStore` (client-only, namespaced storage), `services/api.ts` (client-scoped `/client/*` contract, `clientType:'client'` login), layout (ClientLayout/Sidebar/Header), UI (Card/EmptyState), `useClientData` hook.
- Page shells with loading/empty/error states: Login, ForgotPassword, Overview, Guards, GuardDetail, Scans (date filter), Checkpoints, Reports.
- Dispatched supporting work: **Codex** → `/client/*` backend endpoints + shared tenant-filter helper + cross-tenant isolation tests; **OpenCode** → security/leak review of the scaffold.
- **Next:** implement `/client/*` routes in `convex/http.ts` + allow `clientType:'client'` login for `main_account`; then `npx convex deploy`.
- Decision recorded in [[Decision_Log]].

---

## 2026-06-30 — [[Claude_Code]] — Bootstrapped AI Brain
- Created `AI_BRAIN/` Obsidian vault (Dashboard, Context, Decisions, Bugs, Agents, Logs, Handoffs, Tasks, Prompts).
- Added `.claude/agents/` subagents (project-lead, backend/frontend/qa engineers, docs-writer).
- Appended AI Brain workflow rules to root `CLAUDE.md`.
- Decisions recorded in [[Decision_Log]].

---

## Related
- [[Daily_Log]] · [[Decision_Log]] · [[Current_Task]]

## 2026-07-02 — iOS build fix (Claude Code)
- iOS sim build failed: "Unable to find a destination" — mobile_scanner 6.x pulls Google MLKit pods with no arm64-simulator slice; Flutter wrote EXCLUDED_ARCHS=arm64 into Generated.xcconfig, leaving no valid destination on Apple Silicon iOS 26 sims.
- Fix: upgraded mobile_scanner ^6.0.0 → ^7.2.0 (v7 iOS uses native AVFoundation/Vision, no MLKit) + flutter clean + removed stale ios/Pods & Podfile.lock.
- Flutter tool also auto-migrated ios/: Podfile upgrade, Swift Package Manager integration, UIScene lifecycle.
- Verified: app builds and runs on iPhone 17 simulator (login screen renders). Device build (--no-codesign) also passes.

## 2026-07-02 — iOS device signing + pod module fix (Claude Code)
- User moved from simulator to physical iPhone 15 Pro Max (wireless). New errors surfaced in Xcode.
- "Module 'flutter_secure_storage' not found": pods were half-deleted from earlier clean. Fix: rm ios/Pods + Podfile.lock + DerivedData, flutter pub get, pod install --repo-update. Device build (--no-codesign) now passes.
- Also recreated MISSING ios/Flutter/Profile.xcconfig (Debug/Release existed, Profile didn't) — latent bug that breaks profile/archive builds; CocoaPods warned about it.
- REMAINING BLOCKER (user-side, cannot fix from CLI): Apple ID login error -1003 in Xcode → no provisioning profile for com.patrol.patrolApp. User must re-add Apple ID in Xcode > Settings > Accounts. Free personal team (Team U46T9JJS3Q) = profile expires every 7 days.

## 2026-07-02 — Live incident notifications + alert details on web (Claude Code)
- IMPORTANT DISCOVERY: real Convex functions live in mobile/patrol_app/convex/ (top-level convex/ is an empty shell). Apps all point at dev deployment resilient-buffalo-226 → push with `npx convex dev --once` from mobile/patrol_app. `npx convex deploy` goes to prod harmless-pigeon-186 which NOTHING uses.
- Backend: incidents.listForApi now returns checkpointName, siteName, latitude, longitude (from checkpoint). Deployed to resilient-buffalo-226.
- Web: new IncidentToasts popup (top-right, severity-colored, auto-dismiss, View details → /alerts) fed by new incident polling in websocket.ts fallback (every ~5s); new useAlertStore drives the sidebar Alerts badge (was hardcoded "3"!) with real open-incident count.
- Alerts page: incident cards now expandable — category, location + Google Maps link, full description, photo grid with lightbox.
- Sidebar: removed dead Reports submenu links (daily/incidents/parking-wisdom/maintenance/pass-on-logs — routes never existed).
- FUTURE (user request, not built): chat with the reporting guard from the incident detail.
- Verified: web `npm run build` passes; live API returns user's real incident with new fields.
- NOT YET PUSHED/DEPLOYED to hosted web — local changes only; user must OK Kilo push.
