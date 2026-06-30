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
_None yet._

---

## Known Gotchas (not bugs, but watch out)
- HTTP routes expect exact query-param names (`startDate`/`endDate`, not `start`/`end`).
- `shifts.listAll` must explicitly return fields or web gets partial records.

## Related
- [[Decision_Log]] · [[Session_Log]] · [[OpenCode_Review]] · [[Gemini_Review]]
