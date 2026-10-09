# 🏛️ Architecture

## Components
| Layer | Tech | Location | Notes |
|---|---|---|---|
| Mobile app | Flutter (Android-first) | `mobile/patrol_app/` | All Dart in `lib/` |
| Web dashboard | React/Vite | `web/` | Reads Convex in real time |
| **Live backend** | **Convex** | `convex/` | Deployed at `resilient-buffalo-226.convex.site` |
| Legacy backend | Express | `backend/` | ⚠️ **Not live — do not edit** |

## Critical Rules
1. **All backend logic lives in `convex/`.** The `/backend/` Express dir is legacy/unused.
2. **After any Convex change, run `npx convex deploy`** — local edits don't reach the live `.convex.site` until deployed.
3. **Read `convex/_generated/ai/guidelines.md` before writing Convex queries/mutations** — its rules override training data.
4. Mobile app's Convex config: `mobile/patrol_app/.env.local` (`CONVEX_DEPLOYMENT`). Web API base: `web/.env.local` (`VITE_API_URL`).
5. **Never move this project to `~/Desktop`** — it's iCloud-synced and breaks builds/codesign. Canonical path: `/Users/macmini/PatrolSecurity_Ecosystem`.

## Data Flow
```
Flutter (scan + GPS)
   → Convex mutation (store scan, run alerts)
   → Convex query (real-time)
   → Web dashboard
```

## Known Gotchas
- HTTP routes read specific query-param names (e.g. `/timesheets` expects `startDate`/`endDate`, not `start`/`end`).
- `shifts.listAll` must explicitly return fields or the web gets incomplete records.

## Related
- [[Tech_Stack]] · [[Folder_Map]] · [[Decision_Log]] · [[Overview]]
- Repo refs: `SYSTEM_ARCHITECTURE.md`, `convex/PAGE_STRUCTURE.md`
