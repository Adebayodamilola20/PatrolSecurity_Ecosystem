# 💡 Suggestion Round — Client Web Portal

**Read [[Current_Task]] first.** This is an *ideas* round, not a build round.

## The ask (for every AI except Gemini)
We want to build a **new client-facing web portal**. The client = the company that
hires our security firm. When they log in they should see **only their own**:
guards, live/last patrol activity, scan history, checkpoints on their site(s),
alerts/incidents, and downloadable reports.

The existing `web/` app stays as the **internal supervisor/admin dashboard**.
This new portal is separate, scoped per-client, and mostly read-only.

**Each AI: add your own `## Suggestions — <YourName>` block below, in your own CLI.**
Keep it short — approach, key screens, data/tenancy concerns, risks. No code dumps.
Gemini is sitting this one out — do not prompt it.

### Constraints to respect
- Stack: React 19 + Vite + Tailwind v4 + Zustand + react-router 7 (match `web/`).
- Backend is Convex. Multi-tenant isolation is mandatory — no cross-client leakage.
- Don't touch `/backend/` (legacy). Deploy Convex changes with `npx convex deploy`.

---

## Suggestions — Claude_Code (lead)

**Approach — separate app, shared Convex, tenant-scoped queries.**
- New `web-client/` Vite app (or a `/client` route group) rather than bolting onto the
  admin app — keeps the admin bundle and permissions clean. Lean toward a **separate app**
  so a client login can never reach an admin route.
- Add a `clientId` (org/tenant) concept in Convex. Every guard, checkpoint and scan must
  resolve to a `clientId`. Client portal queries take the logged-in user's `clientId`
  from the session and filter server-side — **never** trust a client-supplied id.
- Auth: separate "client" user role. Reuse existing auth flow but gate role = `client`.

**MVP screens (in order):**
1. **Overview** — # guards on duty now, last scan time per site, today's coverage %.
2. **My Guards** — list + status (on-shift / off), last seen, assigned site.
3. **Patrol Activity / Scans** — filterable by date + guard + checkpoint (reuse the
   filtering work already done on the admin Scans/History pages).
4. **Checkpoints / Map** — their sites and checkpoint hit-rate (Leaflet is already in `web/`).
5. **Reports** — date-range PDF/CSV export, read-only.

**Tenancy / risk notes:**
- The single biggest risk is a query that forgets the `clientId` filter → data leak.
  Put tenant filtering in **one shared Convex helper** so it can't be skipped per-query.
- Keep it read-only first; no client should be able to edit guards or checkpoints.
- Don't reuse admin Zustand stores directly — they assume full-data access.

---

## Suggestions — Codex_CLI
_(Codex: add your block here.)_

---

## Suggestions — OpenCode
_(OpenCode: add your block here.)_

---

## Suggestions — Antigravity
_(Antigravity: add your block here.)_

---

Once everyone has weighed in, [[Claude_Code]] consolidates → [[Decision_Log]] → build.
Related: [[Current_Task]] · [[Roadmap]] · [[Decision_Log]]
