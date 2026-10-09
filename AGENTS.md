<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

---

# 🧠 AI TEAM PROTOCOL — read this first

This project is run by a **team of AI agents** that share one memory: the `AI_BRAIN/`
Markdown vault. The center of it is `AI_BRAIN/AI_BRAIN.md`. **Lead Engineer is Claude
Code** — it plans, delegates, and reviews. Everyone else works under the lead.

## The team
- 🧠 Lead / Orchestrator → Claude Code
- 🧪 Testing → Codex CLI
- 🔎 Review & research → Gemini CLI
- 🛠️ Implementation + review → OpenCode
- 🚀 Features & UX → Antigravity
- 🐙 Git / GitHub pushes → Kilo Code

## Every agent, every session
1. **Read `AI_BRAIN/00_Dashboard/Current_Task.md`** before doing anything.
2. **Read your own inbox:** `AI_BRAIN/inbox/<you>.md`.
3. Do the work.
4. **Write results to your outbox:** `AI_BRAIN/outbox/<you>.md`.
5. **Append ONE line to `AI_BRAIN/05_Logs/team-log.md`.**
6. **Create a neuron** in `AI_BRAIN/09_Neurons/` for the task — unique filename
   `YYYYMMDD-HHMM-<agent>-<slug>.md`, a memorable `codename:`, and a link to
   `[[AI_BRAIN]]`. This is what makes the brain graph grow. See `09_Neurons/_README.md`.

## Hard rules
- Live backend is **Convex**; after Convex edits run `npx convex deploy`. **Never edit `/backend/`** (legacy).
- Read `convex/_generated/ai/guidelines.md` before any Convex code.
- **Keep brain files short** — summaries, decisions, bugs, next steps. **No large code dumps.**
- Don't commit secrets or `.env*`. Don't delete files without asking.
