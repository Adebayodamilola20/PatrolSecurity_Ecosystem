# 🐞 Bug Tracker

Open bugs at top. Keep entries short: symptom, suspected cause, status. Link related decisions/handoffs.

> Format: `### BUG-NNN — Title` → Symptom / Repro / Suspected cause / Status / Owner

---

## 🔴 Open
_None logged yet._

<!--
### BUG-001 — Example
- **Symptom:** ...
- **Repro:** ...
- **Suspected cause:** ...
- **Status:** Open
- **Owner:** [[Codex_CLI]]
-->

## ✅ Resolved

### BUG-001 — Panic button never notified anyone (9 real events lost)
- **Symptom:** Every emergency event on prod recorded `"status": "failed"`, `delivered: 0`. Guard presses panic → event saved and shown on the admin dashboard → no email, no SMS, no visible error. Went unnoticed from 2026-06-23 to 2026-08-03 because the UI path looked healthy.
- **Repro:** `npx convex data emergencyEvents --prod` → inspect `deliveryPayload` on any row.
- **Cause:** Two independent failures. (1) `RESEND_FROM_EMAIL` pointed at `mail.evergreenprotection.com`, a domain not present in the Resend account → `403 domain is not verified`. (2) Recipient phone stored as `09032950785`; Termii returns `400 "Phone number is expected in international format"`. Neither was surfaced to any operator.
- **Fix:** `convex/lib/phone.ts` normalizes phone numbers inside `sendSms` (single choke point, so missed-patrol alerts benefit too); `RESEND_FROM_EMAIL` switched to Resend's shared sender. Verified on prod 0/2 → 2/2 delivered. Commit `d9ed518`, branch `fix-emergency-alert-delivery`.
- **Residual:** email still reaches only the Resend account owner until `mail.evergreenprotection.com` is DNS-verified — see [[Session_2026-08-03_Alert_Delivery]].
- **Status:** Resolved (SMS fully; email owner-only pending DNS)
- **Owner:** [[Claude_Code]]

---

## Known Gotchas (not bugs, but watch out)
- HTTP routes expect exact query-param names (`startDate`/`endDate`, not `start`/`end`).
- `shifts.listAll` must explicitly return fields or web gets partial records.

## Related
- [[Decision_Log]] · [[Session_Log]] · [[OpenCode_Review]] · [[Gemini_Review]]
