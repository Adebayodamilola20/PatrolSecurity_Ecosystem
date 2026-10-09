# 🧩 Decision Log

Append-only record of **architecture & design decisions**. Newest first. Keep each entry to a few lines — the *why*, not the code.

> Format: `### YYYY-MM-DD — Title` → Decision / Why / Alternatives / Status / Agent

---

### 2026-08-08 — System email sends as `reports@evergreenprotectiveservices.com`
- **Decision:** A dedicated sending address on the company's real domain. Not Gmail, not a company mailbox reused.
- **Why the earlier setup could never work:** Resend was pointed at `mail.evergreenprotection.com`, which is **not the company's domain** — that one is on Namecheap with mail via `jellyfish.systems`. The company domain is `evergreenprotectiveservices.com`: own nameservers, mail at `ezmail.…`, SPF referencing `plesk04.eznettools.net`. `eznettools.net` is the "Ezonline" the client names. The wrong domain has been deleted from Resend; correct one is id `93425d78-771c-4f7a-8e3a-efdd674f72c7`.
- **Blocked on:** a person, not a technology. The domain is administered abroad and every change goes through a contact called Chief. Client replied "noted" on 2026-08-08.
- **Two options put to him:** (A) add 3 DNS records — preferred, one-time, no code change, gives delivery reporting; (B) create the address as an ordinary mailbox and share the login — no DNS at all, and a request they already handle routinely.
- **If (B) is chosen it is not free:** Convex's default runtime cannot open SMTP connections, so it needs a `"use node"` action. And it is still unconfirmed whether that host permits an external application to send through it — the user chose not to ask. Confirm before building.
- **Fallback if Chief stalls:** register a separate domain (~$15/yr) under our own control. No dependency, no code change, but alerts arrive from a domain that is not the company's.
- **Detail:** `docs/email-sending-decision.md` (records, exact steps, why they cannot disturb existing mailboxes).
- **Status:** ⏳ Waiting on Chief
- **Agent:** [[Claude_Code]]

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
