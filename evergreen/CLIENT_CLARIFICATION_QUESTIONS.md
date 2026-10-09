# Client Clarification Questions — Patrol Monitoring System

This document organizes the open product questions for the client and records the answers already received.

---

## 1. Already Confirmed by Client

### 1.1 Tours and real-time tracking — “zero time”

**Client answer:**

> “I meant instant GPS updates of QR Code scanning, while viewings or tracking is on need basis.”

**Meaning for implementation:**

- QR code scans must be sent immediately once captured.
- Each scan must include the officer’s GPS coordinates at the time of scan.
- The dashboard should update instantly when a QR scan is submitted.
- This does **not automatically mean continuous background GPS tracking every few seconds**.
- Live tracking/map viewing should be available when authorized users need to view it.

**Implementation decision:**

- Treat the current priority as **instant scan-based GPS updates**.
- Continuous moving GPS tracking remains a separate feature that still needs confirmation before building fully.

---

### 1.2 Immediate commencement of functions and patrol intervals

**Client answer:**

> “It also means that when you activate any function, it should allow immediate commencement of the task. However, it should also allow strict patrol intervals to be fixed according to site security needs.”

**Meaning for implementation:**

- When a patrol/tour/task/report/emergency function is activated, it should start immediately without unnecessary delay.
- The system must still support configurable patrol intervals.
- Patrol intervals should be configurable per site because different sites may have different security needs.

**Implementation decision:**

- Add or maintain site-level patrol interval settings.
- A newly activated function should become active immediately.
- Missed patrol logic should use the configured interval for that site/checkpoint.

---

### 1.3 Clock in and clock out

**Client answer:**

> “Officer clocks in, and out should be a separate function under time and attendance.”

**Meaning for implementation:**

- Clock-in/clock-out should not be mixed with QR patrol scanning.
- Time attendance should be its own module/screen/workflow.
- Patrol/tour activities should be separate from attendance records.

**Implementation decision:**

- Keep **Time & Attendance** separate from **Patrol/Tours/QR Scans**.
- Officer can clock in/out for attendance, then separately perform patrol scans.

---

## 2. Remaining Questions to Ask Client

These are the questions still recommended for confirmation.

---

## A. Live Tracking and GPS

### Q1. Should the system include continuous GPS tracking in addition to scan GPS?

The client has confirmed instant GPS update on QR scan, but continuous phone tracking is still separate.

**Question to client:**

> Apart from instant GPS updates during QR code scans, do you also want continuous live GPS tracking of officers while they are on duty, for example updating every 10–30 seconds?

**Options:**

1. No, only show GPS location when QR codes are scanned.
2. Yes, track continuously while officer is clocked in/on duty.
3. Yes, but only when Admin/Main Account opens live tracking “on need basis”.
4. Yes, but only for selected sites/officers.

---

### Q2. If continuous tracking is required, when should it start and stop?

**Question to client:**

> If continuous live GPS tracking is required, should it start when the officer clocks in, when a patrol/tour starts, or only when Admin activates tracking?

**Options:**

1. Start on clock-in and stop on clock-out.
2. Start only when patrol/tour starts and stop when patrol/tour ends.
3. Start only when Admin/Main Account activates live tracking.
4. Let each site choose its own setting.

---

### Q3. How frequent should live GPS updates be?

**Question to client:**

> If continuous live GPS tracking is enabled, how often should the officer’s phone send location updates?

**Options:**

1. Every 5 seconds.
2. Every 10 seconds.
3. Every 30 seconds.
4. Every 1 minute.
5. Configurable per site.

**Note:** Higher frequency gives more accurate movement but uses more phone battery and data.

---

### Q4. Who can view the live tracking map?

Current roles are Admin, Main Account, Supervisor, and Guard.

**Question to client:**

> Who should be allowed to view live tracking maps?

**Options:**

1. Admin only.
2. Admin and Main Account only.
3. Admin, Main Account, and Supervisors.
4. Only selected/designated users chosen by Admin.
5. Site-based access: users can only view officers assigned to their site.

---

### Q5. What does “designated personnel” mean?

**Question to client:**

> When you say designated personnel can view live tracking, should designation be based on role, site assignment, or manual selection by Admin?

**Options:**

1. By role, e.g. all Supervisors can view.
2. By site, e.g. Supervisors can only view their assigned sites.
3. Manual selection, e.g. Admin chooses specific users.
4. Combination of role and site assignment.

---

## B. Patrol Intervals and Missed Patrols

### Q6. Should patrol intervals be set per site, per checkpoint, or per officer?

Client confirmed strict patrol intervals should be fixed according to site security needs.

**Question to client:**

> Where should patrol interval rules be configured?

**Options:**

1. One interval per site.
2. Different interval per checkpoint.
3. Different interval per officer/guard.
4. Different interval per shift/time period.
5. Combination of site + checkpoint + shift.

---

### Q7. Should there be a grace period for missed patrols?

**Question to client:**

> If a checkpoint must be scanned every 30 minutes, should the officer get a grace period before the system marks it as missed?

**Options:**

1. No grace period.
2. 5 minutes grace.
3. 10 minutes grace.
4. Configurable per site.

---

### Q8. What should happen when a patrol is missed?

Current system does not fully implement missed patrol monitoring/escalation.

**Question to client:**

> When a patrol/checkpoint scan is missed, what should the system do?

**Options:**

1. Show dashboard alert only.
2. Send email alert.
3. Send SMS alert.
4. Send both email and SMS.
5. Escalate if still unresolved after another interval.

---

### Q9. Who receives missed patrol alerts?

**Question to client:**

> Who should receive missed patrol alerts?

**Options:**

1. Admin only.
2. Main Account for that client.
3. Site Supervisor.
4. Client-specific recipients.
5. Site-specific recipients.
6. All of the above depending on configuration.

---

## C. Emergency Button

### Q10. Should emergency alerts trigger immediately or require confirmation?

Current implementation triggers immediately.

**Question to client:**

> Should the emergency button send an alert immediately when pressed, or should it require confirmation to avoid accidental alerts?

**Options:**

1. Trigger immediately on tap.
2. Require confirmation dialog.
3. Require press-and-hold for 2–3 seconds.
4. Allow Admin to configure this per site.

---

### Q11. Should emergency message templates be global, per client, or per site?

**Question to client:**

> Should the emergency alert message template be the same for everyone, or customized by client/site?

**Options:**

1. One global template set by Admin.
2. One template per client.
3. One template per site.
4. Global default, with optional client/site override.

---

### Q12. Who receives emergency alerts?

**Question to client:**

> Who should receive emergency alerts when an officer presses the emergency button?

**Options:**

1. Global Admin recipients only.
2. Client-specific recipients.
3. Site-specific recipients.
4. Admin + client + site recipients.
5. Escalation chain, e.g. Supervisor first, then Admin if not acknowledged.

---

### Q13. What information must be included in emergency alerts?

**Question to client:**

> What details should every emergency alert include?

**Recommended default:**

- Officer name
- Officer phone number, if available
- Site name
- Client name
- GPS location/map link
- Time of alert
- Emergency message/template text
- Last scanned checkpoint, if available

**Question:**

> Do you want any other information included in emergency alerts?

---

## D. Reports and Exports

### Q14. How often should reports be automatically generated?

**Question to client:**

> How often should the system automatically generate and send reports?

**Options:**

1. Daily.
2. Weekly.
3. Monthly.
4. End of shift.
5. Per site custom schedule.
6. All of the above depending on client/site settings.

---

### Q15. Who receives automatic report emails?

**Question to client:**

> Should report email recipients be configured globally, per client, per site, or by report type?

**Options:**

1. Global recipients set by Admin.
2. Client-specific recipients.
3. Site-specific recipients.
4. Report-type-specific recipients.
5. Combination of the above.

---

### Q16. Which reports should trigger immediate email alerts?

**Question to client:**

> Which events should send immediate email notifications instead of waiting for scheduled reports?

**Options:**

1. Emergency alerts only.
2. Incidents only.
3. Missed patrols only.
4. Maintenance reports.
5. All critical events.
6. Configurable per client/site.

---

### Q17. Who can manually download reports?

Current implementation supports Admin and Main Account.

**Question to client:**

> Who should be allowed to manually download reports/exports?

**Options:**

1. Admin only.
2. Admin and Main Account.
3. Admin, Main Account, and Supervisors.
4. Selected/designated users only.

---

### Q18. What formats should manual downloads support?

**Question to client:**

> Should downloaded reports be available as PDF, Excel, or both?

**Options:**

1. PDF only.
2. Excel only.
3. Both PDF and Excel.
4. Depends on report type.

---

### Q19. Where should Admin/Main Account review reports?

**Question to client:**

> Should Admin/Main Account review reports inside the dashboard, by email only, or both?

**Options:**

1. Dashboard only.
2. Email only.
3. Both dashboard and email.
4. Dashboard archive with downloadable files.

---

## E. SMS / Termii Messaging

### Q20. What should SMS be used for?

Current SMS usage is mainly emergency alerts.

**Question to client:**

> Should SMS be used only for emergency alerts, or also for missed patrols, incidents, shift reminders, and report notifications?

**Options:**

1. Emergency alerts only.
2. Emergency + missed patrols.
3. Emergency + missed patrols + incidents.
4. All important notifications including shift reminders and reports.
5. Configurable per client/site.

---

### Q21. Should SMS be sent immediately or escalated?

**Question to client:**

> For missed patrols/incidents, should SMS be sent immediately or only after dashboard/email alerts are not acknowledged?

**Options:**

1. Send SMS immediately.
2. Send SMS only if not acknowledged after a set time.
3. Send SMS only for critical alerts.
4. Configurable per alert type.

---

## F. Staff Registration and User Management

### Q22. Should staff self-register or be created only by Admin?

Current implementation has no public self-registration endpoint. Admin creates users.

**Question to client:**

> Should staff be able to self-register with email/password, or must all accounts be created by Admin only?

**Options:**

1. Admin creates all accounts only.
2. Staff can self-register, but Admin must approve them before login.
3. Staff can self-register using an invitation link.
4. Client Main Account can create users under their own client.

---

### Q23. Can Main Account create client staff?

**Question to client:**

> Should the Main Account for a client be allowed to create Supervisors and Guards for that client, or should only Admin create users?

**Options:**

1. Admin only.
2. Admin and Main Account.
3. Admin, Main Account, and selected Supervisors.

---

### Q24. Is Main Account one per client or one general account?

Current system treats Main Account as client-specific.

**Question to client:**

> Is Main Account one account per client, or one general account that can see all clients below Admin?

**Options:**

1. One Main Account per client.
2. One general Main Account with access to all clients.
3. Both: client Main Accounts plus a higher-level operations account.

---

## G. Role Permissions and Visibility

### Q25. What should each role be allowed to see?

**Question to client:**

> Please confirm visibility rules for each role.

**Recommended default:**

- **Admin:** all clients, sites, users, reports, tracking, settings.
- **Main Account:** all sites/users/reports under their client only.
- **Supervisor:** assigned site(s) only.
- **Guard:** only their own tasks, scans, reports, shifts, and assigned sites.

**Question:**

> Is this role structure correct?

---

### Q26. Can Supervisors view all guards on their assigned site?

**Question to client:**

> Should Supervisors view live tracking, reports, incidents, and patrol history for all guards on their assigned site?

**Options:**

1. Yes, all guards on assigned site.
2. No, only their own activity.
3. Only if Admin grants permission.
4. Depends on site/client configuration.

---

## H. Post Orders and Pass-On Logs

### Q27. Should Post Orders require acknowledgement?

**Question to client:**

> When officers see Post Orders after scanning a checkpoint, should they only read/complete them, or must they explicitly acknowledge before final scan submission?

**Options:**

1. Read-only; no acknowledgement required.
2. Must acknowledge before completing scan.
3. Must complete with proof/photo/note.
4. Configurable per Post Order.

---

### Q28. Should Pass-On Logs require acknowledgement?

**Question to client:**

> Should pass-on logs ever require acknowledgement, or should they always be read-only/no acknowledgement required?

**Options:**

1. Always read-only.
2. Always require acknowledgement.
3. Optional acknowledgement depending on log priority.
4. Configurable per client/site.

---

## 3. Recommended Next Decisions Before Development

To avoid rework, these are the highest-priority client decisions to confirm next:

1. Whether continuous GPS tracking is required or only instant scan GPS updates.
2. Who exactly can view live tracking.
3. How patrol intervals are configured: per site, checkpoint, shift, or officer.
4. What happens when patrols are missed: dashboard only, email, SMS, or escalation.
5. Emergency button behavior: immediate, confirmation, or long press.
6. Emergency recipients: global, client-specific, site-specific, or escalation chain.
7. Report schedule and recipients.
8. Staff registration: Admin-only, invite-based, or self-registration with approval.

---

## 4. Short Version to Send to Client

Hello, thank you for clarifying the “zero time” requirement. We understand it as follows:

1. QR code scans should send GPS updates immediately.
2. Any activated function should start immediately.
3. Patrol intervals should still be configurable based on each site’s security needs.
4. Clock-in/clock-out should be a separate Time & Attendance function.

To finalize the remaining scope, please confirm these key points:

1. Do you want continuous live GPS tracking while officers are on duty, or only GPS updates during QR scans?
2. Who can view live tracking: Admin, Main Account, Supervisors, or only selected designated users?
3. Should patrol intervals be set per site, per checkpoint, per shift, or per officer?
4. When a patrol is missed, should the system show dashboard alert, send email, send SMS, or escalate?
5. Should the emergency button trigger immediately, require confirmation, or require press-and-hold?
6. Should emergency message templates and recipients be global, per client, or per site?
7. How often should reports be automatically generated and emailed: daily, weekly, monthly, end-of-shift, or configurable?
8. Who can manually download reports, and should downloads be PDF, Excel, or both?
9. Should SMS be used only for emergencies or also for missed patrols, incidents, and shift reminders?
10. Should staff accounts be created only by Admin, by client Main Account, or through self-registration/invitation?
