# Google Play listing — Tarmac Security

Files in this folder: `icon-512.png` (app icon), `feature-graphic-1024x500.png` (banner).
Upload file: `flutter build appbundle --release --flavor tarmac` → `build/app/outputs/bundle/tarmacRelease/app-tarmac-release.aab`
(needs the signing key in `android/` — backup in `~/Documents/Tarmac_Release_Signing_Key_KEEP_SAFE` on the Mac mini).

## Store listing

**App name** (max 30): `Tarmac Security`

**Short description** (max 80):
`Patrol and clock-in app for Tarmac Security guards and supervisors.`

**Full description:**

> Tarmac Security is the official app for Tarmac Security Ltd guards and supervisors. Accounts are created by Tarmac; it is not for the general public.
>
> • Clock in and out at your post — your location confirms you are on site.
> • Patrol by scanning the QR code at each checkpoint.
> • See your site's post orders and instructions.
> • File incident, observation and daily activity reports with photos.
> • Press and hold the emergency button to alert the control room.
> • Scans are saved on the phone when there is no signal and sent when it returns.
>
> While you are on duty your location is shared with the Tarmac control room, with a notification shown the whole time. Tracking stops when you clock out.

**Category:** Business · **Contact website:** https://tarmacsecurity.ng
**Contact email:** _Tarmac to provide (required by Google)_
**Privacy policy URL:** https://tarmac-clients.vercel.app/privacy.html

**Screenshots:** 4–6 phone screenshots (home/duty card, scanner, reports, profile) — take after the real-phone test so they show real data.

## App content forms

**App access:** All functionality requires a login. Provide Google a reviewer guard account (created by the Tarmac admin on production) with a test site and a printable checkpoint QR, plus the note: "Clock-in only works within the site's radius; the reviewer site is set with a large radius so it can be tested from anywhere."

**Ads:** No ads.

**Target audience:** 18 and over. Not designed for children.

**Content rating questionnaire:** Utility/productivity app; no violence, sexual content, gambling, drugs or user-to-user public content → expected rating: Everyone / PEGI 3.

**Data safety:**

| Data type | Collected | Shared | Required | Purpose |
|---|---|---|---|---|
| Precise location | Yes | No* | Yes | App functionality (clock-in check, patrol records, live safety tracking while on duty) |
| Name, email, phone | Yes | No* | Yes | Account management |
| Photos | Yes | No* | Optional (user takes them) | App functionality (clock-in proof, incident evidence) |
| Other user-generated content (reports) | Yes | No* | Optional | App functionality |

\* Shown to Tarmac and to Tarmac's own client for that site; service providers processing on Tarmac's behalf don't count as "sharing" in Google's form.

- Data encrypted in transit: **Yes**
- Users can request deletion: **Yes** (through Tarmac head office; see privacy policy)
- No data sold; no advertising or analytics SDKs.

**Location / foreground service declaration:** The app uses a *location* foreground service only while the guard is clocked in, with a visible "On duty — location shared" notification, so supervisors can see guards on shift and send help in an emergency. It stops at clock-out. No background-location ("all the time") permission is requested.
