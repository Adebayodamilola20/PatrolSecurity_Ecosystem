# 🧩 Decision Log

Append-only record of **architecture & design decisions**. Newest first. Keep each entry to a few lines — the *why*, not the code.

> Format: `### YYYY-MM-DD — Title` → Decision / Why / Alternatives / Status / Agent

---

### 2026-06-30 — Client Portal is a separate `web-client/` app
- **Decision:** Build the client-facing portal as a standalone Vite app at `web-client/` (port 5174), not a route group inside `web/`. Same stack as `web/` (React 19 + Vite + Tailwind v4 + Zustand + react-router 7).
- **Why:** A client login can never reach an admin route/bundle; keeps permissions and tenancy clean. Backend already anticipates this (login rejects `main_account` unless `clientType: 'client'`; the staff store already evicts client roles).
- **Tenancy:** All data calls live under `/client/*` and are tenant-scoped on the SERVER — `clientId` comes from the session token, never from the request. Frontend never sends a clientId. Session storage keys namespaced (`patrol_client_*`).
- **Scope:** Read-only MVP — Overview, My Guards, Patrol Activity (Scans), Checkpoints, Reports.
- **Alternatives:** `/client` route group in `web/` (rejected — bundle/permission bleed); separate React stack (rejected — divergence).
- **Status:** 🚧 In progress — frontend scaffold done; `/client/*` backend endpoints pending (Codex handoff).
- **Agent:** [[Claude_Code]]

### 2026-06-30 — Convex is the single live backend
- **Decision:** All backend logic lives in `convex/`; the Express `backend/` dir is legacy and frozen.
- **Why:** Web + mobile both call `resilient-buffalo-226.convex.site`. Fixes in Express had no effect on live apps.
- **Status:** ✅ Active
- **Agent:** [[Claude_Code]]

### 2026-06-30 — Adopt AI_BRAIN as shared cross-tool memory
- **Decision:** Use this Obsidian-style `AI_BRAIN/` vault as shared memory for all AI CLIs.
- **Why:** Keep Claude Code, Codex, Gemini, OpenCode, Antigravity in sync via Markdown.
- **Status:** ✅ Active
- **Agent:** [[Claude_Code]]

---

## Related
- [[Architecture]] · [[Bug_Tracker]] · [[Session_Log]] · [[Current_Task]]
