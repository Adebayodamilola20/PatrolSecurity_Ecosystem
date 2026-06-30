# 📖 Overview

## What This Is
**PatrolSecurity Ecosystem** — a Patrol Monitoring & Automated Reporting System. Security guards scan QR codes at checkpoints with a Flutter mobile app. The system logs scans, tracks patrol routes, and generates reports for supervisors via a web dashboard.

## Who Uses It
- **Guards / Officers** — Flutter mobile app: scan checkpoints, capture GPS, run shifts.
- **Supervisors / Admins** — web dashboard: monitor patrols in real time, view timesheets and reports.

## Core Flow
```
Guard scans QR at checkpoint
  → Flutter decodes checkpoint_id + captures GPS
  → Convex mutation stores { officer_id, checkpoint_id, timestamp, gps }
  → Convex triggers alerts if needed
  → Web dashboard reads via Convex queries (real-time)
```

## The One Thing To Remember
The **live backend is Convex** (`resilient-buffalo-226.convex.site`), **not** the Express `/backend/` dir. Details in [[Architecture]] and [[Tech_Stack]].

## Related
- [[Architecture]] · [[Tech_Stack]] · [[Folder_Map]] · [[Roadmap]]
