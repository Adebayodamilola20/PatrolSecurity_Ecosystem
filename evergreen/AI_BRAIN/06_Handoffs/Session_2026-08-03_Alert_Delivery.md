# 🔁 Session Handoff — 2026-08-03 → next session

Lead: [[Claude_Code]]. Read alongside [[Session_2026-07-28_Prod_Switch_And_GPS]].

---

## 1. THE BIG ONE — the panic button has never notified anyone

All **9** emergency events on prod show `"status": "failed"`,
`"summary": { "attempted": 2, "delivered": 0, "failed": 2 }`. Real panic-button
presses by ADEJUWON TOPE, going back to 2026-06-23. The event was written to the
DB and rendered on the admin dashboard every time, so from the UI it looked like
the feature worked. Nothing surfaced the delivery failure.

Two independent causes, both now fixed:

| Channel | Error | Cause |
|---|---|---|
| Resend | `403 domain is not verified` | `RESEND_FROM_EMAIL` pointed at a domain absent from the Resend account |
| Termii | `400 Phone number is expected in international format` | Recipient stored as `09032950785` — the format an admin naturally types |

**Verified fixed on prod: 0/2 → 2/2 delivered**, with the phone still stored in
local format.

## 2. SMS — fixed in code (`d9ed518`, branch `fix-emergency-alert-delivery`)

- New `convex/lib/phone.ts` → `normalizePhoneNumber()`. Handles `0803…`,
  `+234…`, `00234…`, bare 10-digit, and strips spaces/dashes/parens.
  Country code overridable via `SMS_DEFAULT_COUNTRY_CODE` (default `234`).
- Applied **inside `sendSms`** in `convex/notifications.ts`, not at the call
  sites — every alert path (emergency + missed patrol) gets it for free, and the
  next caller can't rediscover the bug. Unnormalizable input returns a failed
  `DeliveryResult` rather than handing junk to Termii.
- `TERMII_BASE_URL` default in `env.ts` was stale (`api.ng.termii.com`) → now
  `https://v3.api.termii.com/api`. Both deployments carry an explicit value, so
  this only protects new ones.

**Branch is pushed but NOT merged to `main`.** Already deployed to prod.

## 3. Email — config, not code, and still limited

`RESEND_FROM_EMAIL` is now `onboarding@resend.dev` (Resend's shared sender).
It works, but **only delivers to the account owner, `adebayodamilola2007@gmail.com`**:

```
403 "You can only send testing emails to your own email address
     (adebayodamilola2007@gmail.com). To send emails to other recipients,
     please verify a domain..."
```

So the moment a supervisor or client email is added, that recipient fails. SMS
has no such restriction.

### In progress — domain verification
- `evergreenprotection.com` (single `t`) is the **real** domain — Namecheap
  nameservers, live site, MX on `jellyfish.systems`.
- `evergreenprotecttion.com` (double `t`, the one that was sitting in Resend) is
  **not registered at all** — it could never have verified. User deleted it.
- Free plan allows **1 domain**, which is why the dead one had to go first.
- `mail.evergreenprotection.com` added, id `90d6a603-ebf9-43f9-a45d-cb589648a639`,
  region eu-west-1, status `not_started`.
- **Waiting on the user** to add 3 records at Namecheap (Advanced DNS):
  | Type | Host | Value |
  |---|---|---|
  | TXT | `resend._domainkey.mail` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDWXAVNYab2tdHK1pzdDAT9ZEUno43cSLQLnvCzX5s3SbH7XoW2BLA09mNr9uQz7NLn5dV9BTtUPCDTMYTFQqgoinfsxCXIg0Glei9DLsOm4bWCbdkJ1HJrDsO2KP+aqv34m8V++KWtvFxpizn8A1kqhmaSuX3mRcPS2YRNlV8aqQIDAQAB` |
  | TXT | `send.mail` | `v=spf1 include:amazonses.com ~all` |
  | MX (prio 10) | `send.mail` | `feedback-smtp.eu-west-1.amazonses.com` |
- All three sit on `mail.`/`send.mail.` subdomains — they do **not** disturb the
  existing root-domain website or mail.
- **Next step once records are live:** `POST /domains/{id}/verify`, then set
  `RESEND_FROM_EMAIL=alerts@mail.evergreenprotection.com` on prod. Only then can
  the user swap their own email out for a client's.

## 4. Keys rotated (the original task)

| Var | prod | dev | verified |
|---|---|---|---|
| `RESEND_API_KEY` | ✅ | ✅ | HTTP 200, sha256 matched byte-for-byte |
| `TERMII_API_KEY` | ✅ | ✅ | HTTP 200, sha256 matched |
| `TERMII_BASE_URL` | `https://v3.api.termii.com/api` | same | live `POST /sms/send` |

`NVIDIA_API_KEY` deliberately **not** rotated — user said skip for now, so it is
still the leaked value. Termii sender ID `PatrolSec` is **active**; balance was
₦2,768.70, SMS costs ~₦5 each.

⚠️ The new keys were pasted into a chat transcript, same exposure class as the
leak that prompted the rotation.

## 5. Trap that cost time — wrong table name

`npx convex data settings --prod` returns *"There are no documents in this
table"*. That table is **not** where settings live and reading it produces a
false "nothing is configured" conclusion. The real table is
**`communicationSettings`** (keys `emergency_email_recipients`,
`emergency_phone_recipients`, `missed_patrol_*_recipients`), written by
`settings.create` and edited from the admin Settings page
(`web/src/pages/Settings.tsx`). Recipients were configured correctly all along.

## 6. Also verified this session

Guard + location delete (shipped `02f76c3`) is confirmed end-to-end on dev:
`sites:remove` cascaded the checkpoint, wrote tombstones for both site and
checkpoint, and the site row is gone. Guard path was already verified.

## Related
- [[Current_Task]] · [[Todo]] · [[Bug_Tracker]] · [[Session_2026-07-28_Prod_Switch_And_GPS]]

_Last updated: 2026-08-03_
