# 🧰 Tech Stack

## Frontend
- **Mobile:** Flutter / Dart (`mobile/patrol_app/`), Android-first
- **Web:** React + Vite (`web/`)

## Backend
- **Convex** (live) — serverless functions, queries, mutations, schema in `convex/`
- Express (`backend/`) — **legacy, unused**

## Infra / Tooling
- Convex deployment: `resilient-buffalo-226.convex.site`
- Node / npm (root `package.json`)
- Deploy hint: `render.yaml` present (legacy backend hosting)

## Key Commands
```bash
npx convex deploy                 # deploy live backend changes
cd mobile/patrol_app && flutter run
npx convex ai-files install       # install Convex AI skill files
```

## Env Files
- `web/.env.local` → `VITE_API_URL`
- `mobile/patrol_app/.env.local` → `CONVEX_DEPLOYMENT`

## Related
- [[Architecture]] · [[Folder_Map]] · [[Overview]]
