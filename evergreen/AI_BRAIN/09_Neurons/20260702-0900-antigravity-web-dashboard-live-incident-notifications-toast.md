---
codename: "Verdant Relay"
agent: "antigravity"
status: done
date: 2026-07-02
task: 20260702-090006
---

# ⚡ Web dashboard: live incident notifications (toast + real ale

**Core:** [[AI_BRAIN]] · **Task:** [[Current_Task]] · **Agent:** [[Antigravity]]

## Goal
- Web dashboard: live incident notifications (toast + real alert badge), incident detail with photos+location in Alerts, remove dead Reports submenu links

## What happened
- Reviewed `Header.tsx`, `Sidebar.tsx`, `IncidentToasts.tsx`, and `Alerts.tsx`.
- Confirmed that dead Reports submenu links were successfully removed in a prior commit.
- Identified that `Header.tsx`'s alert badge is static and does not listen to Zustand `useAlertStore`, suggesting its replacement with the live store value.

## Result
- Reviewed architecture for live incident notifications and verified dead links removal. Suggested path forward for Header's static alert count.

## Next
- Deliver architectural recommendations to the user and Claude Code, then handover to OpenCode.

## Links
- Core: [[AI_BRAIN]] · Decisions: [[Decision_Log]] · Bugs: [[Bug_Tracker]]
