# Client Portal (`web-client/`)

A separate, client-facing web app where each **client** (the company that hires
our security firm) logs in and views **only their own** guards, patrol activity,
checkpoints, and reports. It is mostly **read-only**.

This is distinct from `web/` (the internal staff/admin dashboard). It is a
separate Vite app so a client login can never reach an admin route or bundle.

## Stack
React 19 · Vite · Tailwind v4 · Zustand · react-router 7 — matches `web/`.

## Run
```bash
cd web-client
npm install
npm run dev      # http://localhost:5174
```
Points at the live Convex backend via `VITE_API_URL` in `.env.local`.

## Security model (read before adding endpoints)
- Login sends `clientType: 'client'`; only `main_account` (client) accounts may sign in here.
- Every data call lives under `/client/*` and is **tenant-scoped on the server**:
  the backend resolves `clientId` from the session token and filters by it.
- The frontend NEVER sends a `clientId`, and the server must NEVER trust one.
- Auth/session storage keys are namespaced (`patrol_client_*`) so they don't
  collide with the staff dashboard.

## Status
Frontend scaffold is in place (routing, auth, layout, page shells with
loading/empty/error states). The `/client/*` backend endpoints are pending —
see `AI_BRAIN/06_Handoffs` (Codex handoff) for the backend contract.

## Structure
```
src/
  App.tsx                 routes + auth guard
  services/api.ts         client-scoped API client (/client/*)
  stores/useClientAuthStore.ts
  components/layout/       ClientLayout, Sidebar, Header
  components/ui/           Card, EmptyState
  hooks/useClientData.ts   tiny fetch hook (loading/error/reload)
  pages/                   Login, ForgotPassword, Overview, Guards,
                           GuardDetail, Scans, Checkpoints, Reports
  types/index.ts           read-only response shapes
```
