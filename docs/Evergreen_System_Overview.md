# Evergreen Security — What The System Actually Does

_Last updated: 10 August 2026_

---

## How To Read This

Every capability below is written as its own heading with a short explanation
underneath. Nothing here is aspirational — if it is in this document, it is
built, deployed to production, and running against real guards on real Nigerian
sites. The one section that describes unfinished work is clearly marked at the
end, and it is marked **INTERNAL** because it should be removed before this
document is sent to anyone outside the company.

---

## The Whole System In One Paragraph

There are three front doors and one brain. Guards carry a **mobile app**.
Supervisors and management run a **control-room dashboard**. Every client gets a
**portal of their own** showing only their sites. All three talk to one backend
that stores every patrol, shift, incident and report as a permanent record, and
decides — on the server, every single time — who is allowed to see what.

---

# PART ONE — THE GUARD'S PHONE

The mobile app is the only thing a guard installs. Everything a guard does on
duty happens here.

### Signing On

A guard logs in once with an email and password issued by the office. Sessions
last 30 minutes and renew themselves silently in the background, so a guard on a
12-hour night shift is never thrown out mid-patrol. If the phone loses signal
during a renewal, the session survives instead of dumping them at the login
screen.

### Clocking In With Proof

Clocking in is not a button that says "I'm here." The app captures a photo and
the guard's GPS position at that moment and sends both. The office can see the
face that clocked in and the coordinates it was clocked in from. A guard cannot
clock in from home.

### The Patrol Screen

Once on duty, the guard sees the points they are expected to walk, which ones are
already done, and which are still outstanding. It is a checklist of the shift,
not a blank screen they have to remember their way through.

### Scanning A Checkpoint

Each checkpoint is a printed QR code fixed at the location. The guard scans it
with the phone camera. The scan carries the guard's identity, the exact time and
their GPS coordinates.

### Why The Scan Cannot Be Faked

Three things are checked on the server before a scan is accepted. The guard must
be clocked in — a guard who has not started a shift cannot scan at all. The scan
must fall inside the geofence drawn around that site. And the guard must be
assigned to that location. A QR code photographed and sent to a friend at home
produces nothing.

### What Happens When A Scan Is Wrong

The app does not silently swallow a bad scan. A wrong code buzzes the phone and
tells the guard to try again. A successful scan plays a confirmation chime. A
scan flagged for being out of range must be re-scanned properly — it cannot be
skipped past.

### Holding The GPS Open

The receiver is kept warm for the whole shift rather than woken cold at each
scan. A cold GPS chip reports a tower estimate that can be over a kilometre off,
which used to cause honest scans to be rejected. Holding one shared position
stream open means the reading at scan time is a real satellite fix, typically
accurate to 13–25 metres.

### Post Orders That Fire On Arrival

Standing instructions can be attached to a whole site or to one specific point.
When the guard scans that point, the instruction pops up on the phone. Where the
office has marked it mandatory, the guard must acknowledge having read it before
they can continue, and that acknowledgement is stored against their name and the
time.

### The Panic Button

A guard in trouble triggers an emergency from the app. The alert goes out
immediately by email and SMS to the recipients configured by the office, and the
event is raised in the control room as active until someone resolves it.

### Incident Reports With Photos

Guards file incidents from the phone with photographs attached. The photos
upload straight to secure storage rather than being pasted into the message
body, so a report with several images does not fail on a weak connection.

### Visitor Logging

A dedicated screen for logging visitors in and out at a gate — who arrived, who
they came to see, when they left. It replaces the paper visitor book, and the
record is searchable afterwards.

### Truck And Vehicle Movement

The same idea for vehicle gates. Trucks in and out are logged on the phone,
which for warehouse and industrial clients is often the single most disputed
record on the site.

### Shift Handover

At the end of a shift the outgoing guard files a handover — what happened, what
is outstanding, what the incoming officer needs to know. The incoming guard sees
it as a pending handover and accepts it. Nothing is passed on verbally and lost.

### The Guard's Own History

Every guard can see their own scans, shifts and reports. When there is an
argument about whether someone worked a night, the guard can open their own
record rather than depending on the office to defend them.

### Guards Only

The mobile app is for field staff. A client account cannot log into it and
neither can an administrator — those tokens are refused by the server, not just
hidden by the interface.

---

# PART TWO — THE CONTROL ROOM

This is the staff dashboard. Supervisors and management run the operation from
here.

### Live Guard Tracking

A map showing where on-duty guards actually are, updating as they move. Guards
who have clocked out disappear from it — the map shows the live picture, never a
stale pin from six hours ago. It opens at street level with satellite view
available.

### The Dashboard

The opening screen: who is on duty right now, what has been scanned today, what
incidents are open, and what needs attention. It is the thirty-second answer to
"is everything alright."

### Monitoring

A deeper live view of activity as it lands — the running feed of the operation
rather than the summary.

### Every Scan, Permanently

Every checkpoint scan ever made is listed and searchable, and each one opens into
a detail view: which guard, which point, what time, what GPS coordinates, and
whether it fell inside the geofence. Months later, this is the proof.

### Missed Patrol Alerts

The system checks every five minutes for patrols that should have happened and
did not, and raises an alert. Nobody has to notice a gap manually — the gap
announces itself.

### Missing Clock-Ins

A specific view for guards who were expected on shift and never clocked in, so
the supervisor is chasing an absence at 22:05 rather than discovering it in the
morning.

### Timesheets

Hours worked, built from actual clock-in and clock-out records rather than from
what anyone wrote down. There is a summary view for payroll and a detailed view
per guard.

### Clients And Sites

Clients are set up with their contact details and multiple phone numbers. Each
client owns their locations, and each location carries its coordinates and its
geofence radius. The whole system's tenancy hangs off this structure.

### Checkpoints And QR Codes

Locations and sub-locations each get their own QR code, generated in the
dashboard and printed for the wall. A location has its own primary code plus
codes for individual points within it.

### Recording Who Moved A Geofence

If someone widens a geofence, the change is recorded — who moved it, and to
what. A geofence quietly enlarged to make failing scans pass is exactly the kind
of thing that must leave a trace.

### Personnel And Site Assignments

Guards and supervisors are managed here, and each guard is assigned to the
locations they cover. Those assignments are not cosmetic — they are what the
server checks before letting a guard reach any record. A guard cannot be double
assigned into a conflict by accident.

### Deleting Without Losing History

Guards and locations can be removed from active service without erasing the
patrol history attached to them. The record of what happened survives the
departure of the person who did it, and the dashboard shows the impact of a
deletion before it is confirmed.

### Post Orders

Standing instructions are written here, assigned to one or many guards, scoped to
a site or a single point, and marked mandatory where acknowledgement is required.
Completions come back with proof photos where requested.

### Proof Photo Review

Where a post order requires photographic proof, the submissions queue up for
review and are approved or rejected. Simple acknowledgements do not clutter that
queue — only real proof submissions appear in it.

### Pass-On Logs

Notes that must reach the next shift, with a record of who has acknowledged
reading them and who has not.

### Handovers

Every shift handover filed from the phone lands here, with the outgoing officer,
the incoming officer, and the state of the site at the moment of transfer.

### Reports From Ten Templates

Reports are not free text. There are ten structured templates — clock-in,
clock-out, patrol scan, location verification, incident, maintenance, daily
activity, emergency, visitor and truck — each with its own validated fields.
Choosing a category loads the right form.

### Drafting Privately, Then Sending

A report is drafted privately and sent to a chosen client when it is ready. It
does not appear in a client's portal the moment someone starts typing.

### Real PDFs

Every report renders to a proper A4 PDF, previewable in the browser before it
goes anywhere and downloadable afterwards. It is generated by the system, not
assembled by hand in Word.

### The Report Archive

Past reports are filtered by category, by client and by date range, viewable
field by field, with the PDF re-downloadable at any time.

### Analytics

Patrol performance over time — coverage, activity levels and trends, so
management is looking at the shape of the operation rather than at yesterday.

### Emergency Alert Settings

Who gets called when a panic button is pressed is configured here, per client.
The recipient list is deliberately locked down: guards and clients cannot reach
it at all, and the server enforces that rather than the interface hiding it.

### The AI Assistant

A built-in assistant that answers questions about the operation in plain
language — attendance, missed patrols, geofence problems, handovers, risk. It
reads the live operational picture, not a stale export.

### AI-Generated Reports And Client Emails

The assistant drafts eleven kinds of report — daily activity, patrol summary,
attendance, incident, emergency, maintenance, pass-on log, weekly, monthly and
client summaries — and drafts client-facing emails from the same data. A
supervisor edits and sends; the blank page is gone.

### The Knowledge Base

Company policies, SOPs and procedures can be loaded in, and the assistant answers
from them. New supervisors stop asking the same six questions.

### The Audit Log

Every privileged action is written to an audit log — who did it, when, and to
what. It is the answer to "who changed this," available months later.

### Settings

Company-level configuration, alert recipients and system preferences, in one
place.

---

# PART THREE — THE CLIENT'S PORTAL

Every client gets their own login to a portal that shows their sites and nothing
else. This is the part that wins contracts, because most competitors cannot offer
it at all.

### Their Own Overview

The client opens the portal and sees the current state of their own security —
activity, coverage, and what has been happening on their premises.

### Their Locations, And The History Of Each Point

Every location and sub-location the client owns, each with a history toggle
showing the recent patrols at that exact point. A client can check whether the
back gate was actually walked at 3am.

### Guards Stay Anonymous

Clients see coverage and verified activity — they do not see guard names. Guard
identity is stripped out of everything the portal serves, including report
titles and PDF contents. Clients get proof of work without getting a roster they
could poach from or complain about by name.

### Their Reports Inbox

Reports sent to the client land here with an unread badge, filterable, and
previewable as the real A4 PDF in the browser without downloading anything.

### Their Own Analytics

The same kind of patrol analytics management sees, scoped to that client's own
sites.

### They Cannot Reach Anything Else

A client account is refused on every staff endpoint by the server itself. There
is no URL a curious client can type that shows them another client's data,
another client's site names, or the internals of the operation.

### The Public Site In Front Of It

The portal sits behind a full marketing site — landing page, solutions, about,
contact, pricing in naira — so the link a prospect is sent looks like a company,
not a login box.

---

# PART FOUR — THE THINGS NOBODY SEES

This is the part that separates a real system from a demo. None of it is visible
in a screenshot, and all of it is the reason the system can be trusted with a
contract.

### One Client Can Never See Another

Tenant isolation is enforced in the backend on every single request. A client
token is rejected on all staff routes. A guard reaching for a record by its ID is
checked against the locations they are actually posted to. This is not a filter
applied to a list after the fact — it is a check performed immediately before the
data is read or written.

### Proven, Not Assumed

The authorization rules are covered by 37 automated tests that build two complete
rival companies and then try to cross the line between them in every direction —
wrong role, wrong tenant, swapped record ID. Those tests were verified to fail
against the old code and pass against the current code, so they are proof, not
decoration. The mobile app carries a further 120 tests.

### Sessions That Expire Properly

Access tokens live 30 minutes. Refresh tokens are single-use and rotate on every
renewal; if one is ever replayed, the entire session family is revoked
immediately. Changing a password kills every existing session. The admin
dashboard and client portal both lock themselves after 20 minutes idle.

### Photographs Are Not Public Links

Photos are never served from a permanent public URL. Viewing one mints a
short-lived authorised link that expires in ten minutes and is scoped to the
person who asked. An incident photo cannot be forwarded as a URL that works
forever.

### The System Survives Being Hammered

Per-user rate limits and global load shedding sit in front of the API. If
something floods it, ordinary users get a clear "slow down" response with a
retry time instead of the whole system falling over — and emergency traffic is
deliberately exempted so a panic alert is never the request that gets shed.

### Data That Cleans Up After Itself

GPS breadcrumbs are the fastest-growing data in the system and expire on a
retention schedule — 30 days by default — so the database stays fast without
losing the patrol proof that matters. Expired sessions are purged nightly, and
orphaned photo uploads from apps killed mid-submit are swept away rather than
being paid for forever.

### Errors Reach Us Before They Reach You

Error monitoring is live across all four surfaces — the admin dashboard, the
client portal, the mobile app and the backend. When something breaks for a guard
at 2am, it is reported automatically with the details needed to fix it, and
tokens and keys are stripped out of those reports before they are sent.

### Everything Runs On Nigerian Time

Every timestamp in the entire system renders in West Africa Time regardless of
where the viewer's browser thinks it is. A shift that started at 22:00 in Ikeja
reads 22:00 to everyone who opens it, including a client checking from abroad.

### Nigerian Addresses Actually Resolve

Address lookup uses Google Places, because the open mapping data does not find
Nigerian house numbers. "2 Ajani Olujare Street" resolves properly instead of
returning nothing.

### Built On Serverless Infrastructure

The backend runs on Convex with no servers to patch and no machine to fall over,
across roughly 34 data tables and a single versioned API that all three
applications share. Production and development are separate deployments, so
nothing is ever tested on live data.

---

# PART FIVE — WHAT WAS BUILT IN THE LAST FOUR WEEKS

Roughly eighty changes shipped between mid-July and today. Grouped by what they
achieved.

### The Move To Production

The whole system was migrated onto a production backend — a full verified
snapshot of 678 documents and its stored files — with production given its own
fresh signing secret rather than inheriting the development one.

### The Client Portal Got Its Front Door

A complete marketing site was built and put in front of the portal: landing page
with a product tour, a solutions page covering the eight problems the system
solves, about and contact pages, and real product screenshots rather than stock
mockups.

### Live Guard Tracking Was Rebuilt

The map became a proper guard-tracking panel on a light street map, opening at
street level, with satellite view, showing only guards who are actually on duty.

### The GPS Problem Was Solved Properly

Scans had been failing with impossible accuracy readings. Three separate causes
were found and fixed: judging a single cold reading, dropping the position pings
that kept the receiver warm, and two parts of the app fighting over the same GPS
stream. Diagnosed from the recorded accuracy data rather than by guesswork.

### Photographs Were Locked Down

Photo access was authorised, uploads were moved to go straight to storage, and
permanent public URLs were replaced with ten-minute authorised links.

### Emergency Alerts Were Found To Be Silent — And Fixed

The panic button had never actually notified anyone. All nine emergency events on
production showed zero deliveries: email was being rejected and SMS was failing
on Nigerian phone-number formatting. Both were fixed and verified live, going
from 0 of 2 delivered to 2 of 2.

### The API Was Hardened

Per-user rate limiting and global load shedding were added, withdrawn locations
began returning a proper response instead of leaking, and the limiter was made to
fail safely rather than take requests down with it.

### A Full Security Review, And Four Vulnerabilities Closed

An authorization review found four ways a guard could reach data outside their
scope. All four were closed in the backend, next to the data, and two further
gaps found during the work were closed as well. Thirty-seven regression tests
were written to prove it and verified to catch the original flaws.

### Reports Became Real Documents

Ten structured report templates, a genuine PDF engine, in-browser preview, draft
privately then send, an archive with filters, and an unread badge in the client
portal.

### The Mobile App Was Reworked

A new onboarding flow and redesigned home, login, profile and scan screens. Scan
feedback got a success chime and a buzz with a retry prompt on a mismatch.
Flagged scans must now be re-scanned rather than skipped. The app was locked down
to guards only, and settings that did nothing were removed.

### Deletion Without Data Loss

Administrators can now retire guards and locations while keeping the patrol
history attached to them, with the impact shown before anything is confirmed.

### Error Monitoring Went Live

Sentry was wired across the dashboard, the portal, the mobile app and the
backend, and proven end to end.

### The Old Backend Was Removed

The legacy Node and SQLite backend was deleted. There is one backend now, not two
half-maintained ones.

---

# PART SIX — HONEST GAPS (INTERNAL — REMOVE BEFORE SENDING OUT)

Everything above is built and live. These are not.

### Offline Patrol Sync Is Not Shipped

Guards currently need signal to scan. The app fails honestly and tells them to
try again in range rather than pretending a scan was saved, but scans do not
queue and sync later. That work exists on a parked branch and was deliberately
kept out of production. **The public FAQ on the landing page currently claims
offline scanning works — that claim needs removing or the feature needs
shipping.**

### The Email Sending Domain Is Not Verified

Client-facing email currently only reaches the account owner's address, because
the sending domain has no DNS records in place yet. Until three records are added
at the registrar, adding any client or supervisor email address to the alert list
will fail.

### One API Key Is Still Unrotated

The AI provider key was exposed in a transcript and has not been rotated.

### Company Branding Is Still Placeholder In Places

The operating company is still recorded internally under the original seed name
and admin email. That is a production cutover item.

### Contact Details On The Public Site Are Placeholders

The sales email, phone number and street address on the contact page are
placeholders in the correct Nigerian format, and the two naira price points were
set as reasonable defaults. All five need confirming before the site is shown to
anyone.

### GPS Accuracy Is Recorded But Not Displayed

Accuracy is stored on every position ping and shown nowhere in the dashboard.
It is the highest-value monitoring gap remaining — surfacing it would have
revealed the GPS problem weeks before a scan ever failed.
