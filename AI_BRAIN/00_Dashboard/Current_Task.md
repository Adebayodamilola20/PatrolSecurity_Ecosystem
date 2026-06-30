# 🎯 Current Task

> **Every agent reads this file first.** Keep it to one active focus.

## Active Focus
- **Plan a new Client Web portal** — a separate, client-facing site where each client
  (the company that hires our guards) logs in and views **only their own** guards,
  scans, patrol activity, and reports. The existing `web/` app is the internal
  supervisor/admin dashboard; this is a new, scoped, mostly read-only experience.
- **Right now we are gathering suggestions**, not building yet. Each AI gives ideas
  in its own CLI → see [[Client_Web_Suggestions]]. **Gemini is excluded this round.**

## Acceptance Criteria
- [ ] Codex, OpenCode, Antigravity each add a suggestion block to [[Client_Web_Suggestions]]
- [ ] Claude has logged its own suggestions there
- [ ] Kilo Code has pushed current pending changes to GitHub (see [[Push_To_Kilo]])
- [ ] We pick an approach and write it into [[Decision_Log]] before any code

## Context / Constraints
- Live backend = Convex; deploy with `npx convex deploy` (see [[Architecture]]).
- Don't touch `/backend/` (legacy).
- Reuse the existing `web/` stack: React 19 + Vite + Tailwind v4 + Zustand + react-router 7.
- **Multi-tenant isolation is the hard requirement**: a client must never see another
  client's guards or data.

## Owner
- Lead agent: [[Claude_Code]]

## Related
- [[Roadmap]] · [[Todo]] · [[Decision_Log]] · [[Bug_Tracker]]

_Last updated: 2026-06-30_
