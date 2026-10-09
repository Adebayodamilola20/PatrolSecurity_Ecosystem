# Patrol Monitoring Status

This workspace currently contains:

- Mobile app: Flutter guard/officer app
- Web app: React/Vite admin and monitoring app
- Backend: Express API with SQLite/Postgres support and Socket.IO

## Current Build State

- Mobile app analyzes without hard errors.
- Web app production build passes after fixing the unused `Shield` import that broke Vercel.
- Backend has active implementation work in progress for report notifications, emergency alerts, and pass-on-log separation.

## GM Feature List Status

Legend:

- `FULLY OPERATIONAL`: implemented end-to-end from app/backend perspective with current available inputs
- `IN PROGRESS`: code has started but is not yet complete end-to-end
- `BLOCKED`: waiting on credentials, config, or additional business answers

### Mobile / Field Operations

- `Dashboard for all users with shared operational modules`
  - Status: `FULLY OPERATIONAL`
  - Notes: Dashboard now exposes Reports, Duties, History, Checkpoints, Profile, Emergency entry.

- `Pass-On-Log and Report Templates accessible to all users`
  - Status: `IN PROGRESS`
  - Notes: UI exists in mobile app. Backend separation for pass-on-logs has now started.

- `Time and Attendance`
  - Status: `FULLY OPERATIONAL`
  - Notes: Clock in / clock out already works in current app flow.

- `Emergency button`
  - Status: `IN PROGRESS`
  - Notes: Backend emergency route and notification scaffolding started. `RESEND_FROM_EMAIL` is now available, but live delivery still depends on Termii config and final recipient scoping.

- `Post Orders attached to each Tour Stop (QR Code)`
  - Status: `IN PROGRESS`
  - Notes: Mobile app now shows checkpoint-specific post orders on the scan verification screen. Backend post-order model already exists.

- `Pass-On-Log blocks scanning until acknowledged`
  - Status: `IN PROGRESS`
  - Notes: Mobile app blocks scanner access when required acknowledgements are pending, but current gating still needs to be switched fully from post-orders to dedicated pass-on-logs.

- `10 metre QR restriction`
  - Status: `IN PROGRESS`
  - Notes: Mobile scan verification enforces a strict 10m limit. Admin-configurable per-checkpoint/site radius still needs backend/admin support.

### Reports / Notifications

- `Daily Activity Report template using 5Ws and H`
  - Status: `IN PROGRESS`
  - Notes: Mobile UI exists. Backend report submission route has now been added. Automatic email path scaffolding has started.

- `Incident Report template using 5Ws and H`
  - Status: `IN PROGRESS`
  - Notes: Incident route already existed. Automatic email notification scaffolding is now added in backend.

- `Maintenance Report template using 5Ws and H`
  - Status: `IN PROGRESS`
  - Notes: Mobile UI exists. Backend submission route has now been added.

- `Reports emailed automatically to designated emails`
  - Status: `IN PROGRESS`
  - Notes: Backend email code has started and `RESEND_FROM_EMAIL=onboarding@resend.dev` is now available. Real sending still needs designated recipient settings.

- `Excel export automatically accessible by Admin and Main Account only`
  - Status: `IN PROGRESS`
  - Notes: Mobile role visibility is enforced. Backend export request endpoint exists but real file generation and delivery still need completion.

### Roles / Access / Client Structure

- `Admin`
  - Status: `IN PROGRESS`
  - Notes: Exists already in backend.

- `Main Account (General Account)`
  - Status: `IN PROGRESS`
  - Notes: Role standardization has started conceptually with target role string `main_account`.

- `Supervisor`
  - Status: `IN PROGRESS`
  - Notes: Exists already in backend.

- `Guard`
  - Status: `IN PROGRESS`
  - Notes: Current backend still uses `officer`; planned standard response role is `guard`.

- `Client isolation and assigned-site/task visibility`
  - Status: `BLOCKED`
  - Notes: Backend still needs client/site tables and permission filtering logic.

### Tracking / Monitoring

- `Real-time tracking from zero time`
  - Status: `BLOCKED`
  - Notes: Existing backend has Socket.IO but not full patrol position streaming and live tracking history yet.

- `Patrol interval scheduling: 5, 10, 15, 20, 25, 30, 45, 60`
  - Status: `BLOCKED`
  - Notes: Checkpoints already have `expectedIntervalMinutes`, but full admin scheduling UX and enforcement are not complete.

- `Inactivity alert = no scan on scheduled patrol interval`
  - Status: `IN PROGRESS`
  - Notes: Backend already has missed patrol detection logic, but not a full alert engine with delivery workflow.

### QR Management

- `QR generation / replacement / disable / reprint`
  - Status: `BLOCKED`
  - Notes: Admin-only policy is now known, but QR lifecycle management screens and backend controls still need completion.

## What Has Been Implemented So Far

### Mobile

- Added Reports center screen
- Added Daily Activity, Incident, Maintenance, and Pass-On-Log forms
- Added dashboard shortcuts for shared modules
- Added scanner route blocking when acknowledgement is pending or cannot be verified
- Added session restore on app restart
- Added post-order display on scan verification screen
- Added Admin/Main Account-only export visibility in Daily Activity screen
- Tightened scan verification toward the 10m rule

### Web

- Fixed Vercel build failure caused by unused `Shield` import in `DashboardLayout.tsx`

### Backend

- Confirmed existing backend routes and schema for auth, scans, checkpoints, incidents, shifts, reports, post orders, and handovers
- Added role helper module scaffold: `admin`, `main_account`, `supervisor`, `guard`
- Added notification service scaffold for Resend email and Termii SMS
- Added emergency route scaffold
- Added separate pass-on-log route scaffold
- Added report submission backend routes for daily activity and maintenance
- Added export request backend route scaffold
- Added backend schema scaffolding for:
  - `communicationSettings`
  - `reportSubmissions`
  - `emergencyEvents`
  - `passOnLogs`
  - `passOnLogAcknowledgements`

## Where Work Stopped This Turn

Work is currently stopped at backend foundation wiring.

Completed in this stage:

- backend notification service files were created
- emergency route was added
- report submission route rewrite was added
- pass-on-log route file was added
- server route mounting was updated
- new backend table creation hooks were inserted into `db.js`

Still to verify and complete next:

- backend runtime/syntax verification after these new server changes
- incident notification route verification
- actual email and SMS delivery tests
- role migration from old `officer` model to `guard` / `main_account`
- client/site assignment model
- admin-configured communication settings UI

## Still Needed From User / Ops

### Required Credentials / Config

- `RESEND_FROM_EMAIL`
  - Provided: `onboarding@resend.dev`

- `TERMII_BASE_URL`
  - Needed for Termii API calls

- `TERMII_SENDER_ID`
  - Needed for Termii SMS sender identity

### Still Unanswered / Not Finalized

- Confirm whether indoor GPS weakness should allow different radius values per checkpoint/site
  - Current status: user says `yes`, implementation still pending in backend/admin layer

- Confirm who the exact `Client designated personnel` are for live tracking access
  - Need how they are represented in the system

- Confirm how emergency recipients are scoped
  - This is a business decision, not a vendor key
  - `global`: same recipients for every emergency alert
  - `per client`: each client has its own recipient list
  - `per site`: each site has its own recipient list
  - Recommended default for patrol operations: `per_site`

## Paths

- Mobile README: [README.md](/Users/adebayostephenoluwadamilola/Desktop/Patrol_monitoring/mobile/patrol_app/README.md)
- Backend root: `/Users/adebayostephenoluwadamilola/Desktop/Patrol_monitoring/backend`
- Web root: `/Users/adebayostephenoluwadamilola/Desktop/Patrol_monitoring/web`
