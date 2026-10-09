---
codename: Project Vercel Unblock
agent: [[Codex]]
status: done
created: 2026-07-06 10:11
links: [[AI_BRAIN]], [[Current_Task]]
---

# Vercel Build Fix

## What
Investigated why the GitHub push did not deploy on Vercel.

## Why
`web` production build failed TypeScript because `ClerkProvider` was rendered without the required `publishableKey`.

## Result
Removed the unused Clerk wrapper from `web/src/main.tsx` and removed `@clerk/react` from `web/package.json` and `web/package-lock.json`. Confirmed `npm run build` passes in both `web/` and `web-client/`.

## Next
Push the fix and let Vercel redeploy.
