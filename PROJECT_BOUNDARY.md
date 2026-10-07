# PROJECT BOUNDARY: READ BEFORE ANY CHANGE

> **Strict rule for every AI model and every developer** (Claude, Codex, Gemini, Antigravity, OpenCode, Kilo, Cursor, humans).
> Breaking these rules can put one company's changes, or data, into another company's live system.

## This folder is TARMAC SECURITY

| | |
|---|---|
| Company | **Tarmac Security Ltd** (client of Andril) |
| This folder | `/Users/macmini/PatrolSecurity_Tarmac` |
| Git branch | `feature/tarmac` |
| Convex team / project | `Tarmac Security` / `tarmac-security` (its own deployment) |

## Other projects that are OFF-LIMITS from here

| Project | Folder | Backend | Rule |
|---|---|---|---|
| **Evergreen** (PatrolSecurity) | `/Users/macmini/PatrolSecurity_Ecosystem` | Convex `resilient-buffalo-226` (dev) / `harmless-pigeon-186` (prod), team "Stephen's team", project `patrol-monitoring` | **Never edit, build, deploy or run commands there while working on Tarmac.** |
| Duplicate copy | `/Users/macmini/Desktop/PatrolSecurity_Ecosystem` | — | Never touch. |
| Tarmac planning docs | `/Users/macmini/Projects/tarmac-portal` | none | Docs only. Edit only when asked to update Tarmac documents. |

## Hard rules

1. **Change only the project the user named.** If the user says "Tarmac", every edit, command and deploy happens inside `/Users/macmini/PatrolSecurity_Tarmac`. If the user says "Evergreen", only inside `/Users/macmini/PatrolSecurity_Ecosystem`.
2. **If the request does not say which project, ask first.** Never guess.
3. **Never "also fix" the other project.** Even if the same bug exists in Evergreen, report it and wait. Do not apply it there.
4. **Before any Convex command** (`convex dev`, `convex deploy`, `convex run`, `convex env set`), confirm the deployment it targets:
   - run it from this folder only;
   - check `CONVEX_DEPLOYMENT` in this folder's `.env.local` is the **Tarmac** deployment, never `resilient-buffalo-226` or `harmless-pigeon-186`;
   - if unsure, stop and ask.
5. **Before any web or app deploy** (Vercel, Play Store, APK), confirm it is the **Tarmac** project and points at the **Tarmac** backend URL.
6. **Never copy secrets between projects.** Tarmac has its own `PATROL_JWT_SECRET` and `DEV_SEED_SECRET`. Never reuse Evergreen's.
7. **Never copy data between projects** (users, guards, clients, scans, payments).
8. **Git:** commit and push only to `feature/tarmac` (or branches made from it). Never push Tarmac work to Evergreen's `main` without the user's explicit OK.
9. **Shared code changes** (anything Evergreen would also receive later, e.g. bug fixes in `convex/`) must stay safe for both companies: optional behaviour is controlled by environment settings, not by deleting features.

## Tarmac-specific decisions

- **No SMS on Tarmac.** The Tarmac deployment has no `TERMII_*` settings; SMS is skipped automatically (`isSmsConfigured()` in `convex/env.ts`). Do not add Termii keys to Tarmac.
- **Own design.** Tarmac gets its own visual identity, not the Evergreen look.
- **Finance features** (payment sharing via Monnify, invoices, payroll) are Tarmac-only and must be switched on by setting, never by default for Evergreen.

## If you are about to break a rule

Stop. Tell the user what you were about to do and in which project, and wait for a clear yes.
