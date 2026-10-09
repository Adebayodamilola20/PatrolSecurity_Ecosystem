# 📡 Uptime Monitoring & Alerting — Runbook

> Decision (2026-07-08): **Free external ping service (UptimeRobot)** + **email alerts**.
> Rationale: zero code, zero maintenance, and independent of our own infra — an external
> monitor still fires even in a total outage, which a self-hosted Convex cron cannot.
> Scope is intentionally small/low-priority. See [[Current_Task]] · [[Todo]].

## What we monitor (3 surfaces)

| # | Surface | URL to ping | Expected | Confirmed? |
|---|---------|-------------|----------|------------|
| 1 | **Convex backend (heart)** | `https://resilient-buffalo-226.convex.site/api/v1/health` | `200` + body contains `"status":"ok"` | ✅ live 200 (2026-07-08) |
| 2 | **Web admin dashboard** | `https://<FILL-IN>.vercel.app` | `200` | ⚠ get real prod URL from Vercel dashboard — old `patrol-web.vercel.app` now 404s |
| 3 | **Client portal (web-client)** | `https://<FILL-IN>.vercel.app` | `200` | ⚠ get real prod URL from Vercel dashboard |

> ⚠ The two Vercel URLs above are placeholders. Grab the current **Production** domain for each
> project from your Vercel dashboard and paste them in before creating monitors 2 & 3.

## Setup — UptimeRobot free tier (click-through)

Free tier = 50 monitors, 5-minute checks, email alerts. Plenty for us.

1. Sign up at **https://uptimerobot.com** (free). Verify the email you want alerts sent to.
2. **Add monitor** → for the backend:
   - Type: **HTTP(s)** (or **Keyword** — preferred, see below)
   - URL: `https://resilient-buffalo-226.convex.site/api/v1/health`
   - Monitoring interval: **5 minutes**
   - **Keyword monitoring (recommended):** keyword type = "exists", keyword = `"status":"ok"`.
     This catches a subtle failure mode where the server returns 200 but a broken body.
3. Repeat **Add monitor** for surface #2 (admin) and #3 (client portal) once you have the URLs.
   These can be plain HTTP(s) monitors (just check for 200).
4. **Alert contact:** Settings → My Settings → Add Alert Contact → **Email** → your address →
   verify. Attach it to all 3 monitors (default is on).
5. (Optional) Set "SSL expiry" reminders — UptimeRobot warns before the TLS cert lapses.

## Alerting

- **Channel: Email** (per decision). UptimeRobot sends on DOWN and again on recovery (UP).
- We already have Termii (SMS) + Resend (email) keys in the backend if we ever want to
  self-notify, but for external monitoring UptimeRobot's own email is simpler and independent.

## Notes / follow-ups

- **Latency watch:** first health ping on 2026-07-08 took ~27s (cold start?); repeat pings were
  fast. UptimeRobot's response-time graph will show if slow responses are a real pattern.
- When we switch to the **Convex prod deployment** (see [[Current_Task]] hardening checklist),
  update monitor #1's URL to the new `*.convex.site` host.
- Rejected alternative: self-hosted Convex cron self-check — can't detect a full outage of the
  service it runs inside. Kept as a possible *secondary* layer only, not primary.
