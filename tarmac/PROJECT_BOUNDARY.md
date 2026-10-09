# PROJECT BOUNDARY: READ BEFORE ANY CHANGE

> **Strict rule for every AI model and every developer** (Claude, Codex, Gemini, Antigravity, OpenCode, Kilo, Cursor, humans).
> Breaking these rules can put one company's changes, or data, into another company's live system.

## This folder is TARMAC SECURITY

| | |
|---|---|
| Company | **Tarmac Security Ltd** (client of Andril) |
| This folder | `tarmac/` in the PatrolSecurity_Ecosystem repo (locally `~/PatrolSecurity_Ecosystem/tarmac`) |
| Git | lives on `main`; branch off `main` for each change, touch only `tarmac/` |
| Convex **production** (live) | `unique-anteater-230` (Europe/Ireland) — app + websites point here |
| Convex development (testing) | `gallant-crow-174` |
| Vercel | `tarmac-admin` (root `tarmac/web`), `tarmac-clients` (root `tarmac/web-client`) |

The Evergreen company lives in `../evergreen/`. The repo-wide rules are in `../PROJECT_BOUNDARY.md`.

## Hard rules

1. **Change only this folder** when the user says "Tarmac". Never edit, build, deploy or run commands in `../evergreen/` while working on Tarmac. If the request does not say which company, ask first.
2. **Never "also fix" Evergreen.** Report it and wait.
3. **Before any Convex command**, run it from `tarmac/mobile/patrol_app` and check its `.env.local` names a Tarmac deployment (`gallant-crow-174` dev; `--prod` = `unique-anteater-230`). Never `resilient-buffalo-226` or `harmless-pigeon-186` (Evergreen).
4. **Before any web or app deploy**, confirm it is a Tarmac project pointing at the Tarmac backend.
5. **Never copy secrets or data** between Tarmac and Evergreen.

## Tarmac-specific decisions

- **Google Maps:** Tarmac has its own browser key (Google Cloud project "Tarmac Security"), set as `VITE_GOOGLE_MAPS_API_KEY` on Vercel `tarmac-admin`. Never use Evergreen's.
- **No SMS on Tarmac.** The Tarmac deployment has no `TERMII_*` settings; SMS is skipped automatically (`isSmsConfigured()` in `convex/env.ts`). Do not add Termii keys to Tarmac.
- **Own design.** Tarmac gets its own visual identity, not the Evergreen look.
- **Finance features** (payment sharing via Monnify, invoices, payroll) are Tarmac-only and must be switched on by setting, never by default for Evergreen.

## If you are about to break a rule

Stop. Tell the user what you were about to do and in which project, and wait for a clear yes.
