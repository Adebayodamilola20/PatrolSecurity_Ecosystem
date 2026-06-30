# 🗂️ Folder Map

```
PatrolSecurity_Ecosystem/
├── convex/             ← LIVE backend (mutations, queries, schema)
│   ├── _generated/ai/guidelines.md   ← READ before writing Convex code
│   └── PAGE_STRUCTURE.md
├── mobile/patrol_app/  ← Flutter app
│   └── lib/            ← all Dart code
├── web/                ← React/Vite dashboard
├── backend/            ← LEGACY Express — do NOT edit
├── docs/               ← documentation
├── AI_BRAIN/           ← shared AI memory (you are here)
├── .claude/agents/     ← Claude Code subagent definitions
├── CLAUDE.md           ← Claude Code project instructions
├── AGENTS.md           ← cross-tool agent instructions
└── SYSTEM_ARCHITECTURE.md
```

## Where Things Go
- Backend fix → `convex/` (then `npx convex deploy`)
- Mobile fix → `mobile/patrol_app/lib/`
- Web fix → `web/`
- A decision → [[Decision_Log]]
- A bug → [[Bug_Tracker]]

## Related
- [[Architecture]] · [[Tech_Stack]] · [[Overview]]
