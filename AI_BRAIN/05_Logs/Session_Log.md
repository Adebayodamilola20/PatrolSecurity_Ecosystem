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
