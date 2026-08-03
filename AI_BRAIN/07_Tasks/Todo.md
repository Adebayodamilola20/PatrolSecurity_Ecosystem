# ✅ Todo

Granular, actionable items. Move finished items to [[Done]]. Big-picture direction lives in [[Roadmap]].

> Tag owners with agent links: [[Claude_Code]] [[Codex_CLI]] [[Gemini_CLI]] [[OpenCode]] [[Antigravity]]

## In Progress
- [ ] **Verify `mail.evergreenprotection.com` in Resend** — waiting on user to add 3 DNS records at Namecheap (see [[Session_2026-08-03_Alert_Delivery]]). Until done, emergency email reaches ONLY adebayodamilola2007@gmail.com; any client/supervisor address 403s. Then: `POST /domains/90d6a603-ebf9-43f9-a45d-cb589648a639/verify` + set `RESEND_FROM_EMAIL=alerts@mail.evergreenprotection.com` on prod.
- [ ] Merge `fix-emergency-alert-delivery` (`d9ed518`) into `main` — already deployed to prod, just not merged.
- [ ] Rotate `NVIDIA_API_KEY` — still the leaked value; user deferred it 2026-08-03. RESEND + TERMII already rotated.
- [ ] Uptime monitoring: UptimeRobot (free) + email alerts — runbook written ([[Uptime_Monitoring]]). Waiting on user: sign up + paste 2 Vercel prod URLs.

## Backlog (production hardening — see [[Current_Task]] for detail)
- [ ] Switch to Convex prod deployment + repoint all 3 apps (owner: user)
- [ ] Copy env vars to prod deployment (esp. NVIDIA_API_KEY)
- [ ] Connect Clerk auth (replaces 123456 passwords; adds rate limit + token expiry)
- [ ] Remove/disable demo accounts *@securecorp.com before real launch
- [ ] Build + smoke-test signed release APK on real device
- [ ] Storage cleanup cron for old export CSVs (low)
- [ ] Uptime monitoring/alerting (low) → decided: UptimeRobot + email, see [[Uptime_Monitoring]]
- [ ] Decide CSV-only vs PDF exports

## Blocked
- _none_

## Related
- [[Current_Task]] · [[Roadmap]] · [[Done]] · [[Bug_Tracker]]
