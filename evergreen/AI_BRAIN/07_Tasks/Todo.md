# ✅ Todo

Granular, actionable items. Move finished items to [[Done]]. Big-picture direction lives in [[Roadmap]].

> Tag owners with agent links: [[Claude_Code]] [[Codex_CLI]] [[Gemini_CLI]] [[OpenCode]] [[Antigravity]]

## In Progress
- [ ] **Email sender — waiting on Chief (2026-08-08).** Client agreed
  `reports@evergreenprotectiveservices.com` and replied "noted" to the request.
  The domain is administered abroad; every change goes through a contact called
  Chief, so this is a people bottleneck, not a technical one. Two options were
  put to him — (A) add 3 DNS records, preferred, or (B) create the address as a
  normal mailbox and share the login, which is a routine request for them.
  Full detail, records, and next steps: `docs/email-sending-decision.md`.
  **If (B) is chosen it needs a code change** — Convex's default runtime cannot
  open SMTP connections, so it would need a `"use node"` action. Also unverified,
  because the user chose not to ask: whether that host permits an external
  application to send through it at all. Confirm before building anything.
  ⚠️ The earlier `mail.evergreenprotection.com` entry was **the wrong domain
  entirely** (not the company's) and has been deleted from Resend. Correct
  domain is now `evergreenprotectiveservices.com`,
  id `93425d78-771c-4f7a-8e3a-efdd674f72c7`. Until this lands, every report and
  alert reaches only the Resend account owner.
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
