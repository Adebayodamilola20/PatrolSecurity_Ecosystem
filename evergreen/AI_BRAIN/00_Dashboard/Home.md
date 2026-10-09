# 🧠 AI Brain — PatrolSecurity Ecosystem

The shared memory for every AI agent on this project. Read this first, edit it often, keep it short.

> 🧠 **Core node:** [[AI_BRAIN]] — the center of the graph. ⚡ Per-task memories: [[09_Neurons]].
> 👑 **Lead Engineer:** [[Claude_Code]] — plans, delegates, reviews. Everyone works under the lead.

## Start Here
- 🎯 [[Current_Task]] — what we're working on **right now**
- 🗺️ [[Roadmap]] — where we're headed
- 📖 [[Overview]] — what this project is

## Project Context
- [[Architecture]] · [[Tech_Stack]] · [[Folder_Map]]

## Working Memory
- 🧩 [[Decision_Log]] — why we built it this way
- 🐞 [[Bug_Tracker]] — known issues
- ✅ [[Todo]] · [[Done]]

## Logs
- [[Session_Log]] — per-session change notes
- [[Daily_Log]] — daily summary

## Agents & Handoffs
- Agents: [[Claude_Code]] (lead) · [[Codex_CLI]] · [[Gemini_CLI]] · [[OpenCode]] · [[Antigravity]] · [[Kilo_Code]]
- Handoffs: [[Claude_To_Codex]] · [[Codex_To_Claude]] · [[Gemini_Review]] · [[OpenCode_Review]] · [[Antigravity_Review]] · [[Push_To_Kilo]]

## Prompts
- [[Master_Orchestrator_Prompt]] — start here to coordinate the fleet
- [[Claude_Code_Prompt]] · [[Codex_CLI_Prompt]] · [[Gemini_CLI_Prompt]] · [[OpenCode_Prompt]] · [[Antigravity_Prompt]] · [[Kilo_Code_Prompt]]

---

## House Rules (all agents)
1. **Read [[Current_Task]] before doing anything.**
2. Record big changes in [[Session_Log]]; architecture choices in [[Decision_Log]].
3. Log bugs in [[Bug_Tracker]], not in code comments only.
4. Keep brain files **short** — summaries, decisions, bugs, next steps. **Never paste large code blocks.**
5. Hand off work via the [[Claude_To_Codex|Handoffs]] folder so the next agent has context.

> ⚠️ Live backend is **Convex** (`resilient-buffalo-226.convex.site`). The `/backend/` Express dir is legacy. See [[Architecture]].
