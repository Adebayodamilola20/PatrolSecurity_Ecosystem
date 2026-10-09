# PROJECT BOUNDARY: READ BEFORE ANY CHANGE

> For every AI model and every developer (Claude, Codex, Gemini, Antigravity, OpenCode, Kilo, Cursor, humans).

This repository holds **one patrol system sold to two client companies**. Each company has its **own complete copy** in its own folder. They share nothing at runtime.

| Folder | Company | Backend (Convex) | Websites (Vercel) | App |
|---|---|---|---|---|
| `evergreen/` | Evergreen Security | team "Stephen's team", project `patrol-monitoring`: `harmless-pigeon-186` (prod), `resilient-buffalo-226` (dev) | `patrol-security-ecosystem` (admin), `evergreenclient-protective` (client portal) | `com.patrol.patrol_app` |
| `tarmac/` | Tarmac Security Ltd | team/project `tarmac-security`: `unique-anteater-230` (prod, Europe), `gallant-crow-174` (dev) | `tarmac-admin`, `tarmac-clients` | `ng.tarmacsecurity.patrol` |

## Hard rules

1. **Change only the folder of the company the user named.** "Evergreen" → only `evergreen/`. "Tarmac" → only `tarmac/`. If the request does not say which, **ask first**.
2. **Never "also fix" the other company.** If the same bug exists in both, fix the named one, report the other, and wait.
3. **Run commands from inside the company's folder** (e.g. `cd tarmac/mobile/patrol_app`). Each folder has its own `.env.local`, so Convex commands target that company's backend. Check `CONVEX_DEPLOYMENT` before any `convex dev/deploy/run/env`.
4. **Never copy secrets or data between the folders or the companies' services.**
5. **Git:** everything lives on `main`. For any change: branch off `main` → change files in **one** company folder → PR → merge. A PR that touches both folders needs the user's explicit OK.
6. Each Vercel site builds only when its own folder changes, so an Evergreen change never redeploys Tarmac and vice versa.

## Company-specific decisions

See `tarmac/PROJECT_BOUNDARY.md` for Tarmac's (no SMS, own design, finance package, own Maps key).
