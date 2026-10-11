> ⛔ **THIS IS THE TARMAC SECURITY FOLDER** (`tarmac/`). Read `../PROJECT_BOUNDARY.md` and `PROJECT_BOUNDARY.md` before any change. Never edit or deploy `../evergreen/` from here.

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

# Git workflow — NON-NEGOTIABLE

**Never commit or push to `main`.** Not for a one-line fix, not for a typo, not
because the change is obviously safe. `main` is merged by the repo owner and by
nobody else.

Every change goes:

1. `git checkout -b <type>/<short-name>` off an up-to-date `main`
   (`fix/`, `feat/`, `chore/`, `docs/`).
2. Commit on that branch.
3. `git push -u origin <branch>`
4. `gh pr create` with a body that says **what changed and why** — the reason
   the change exists, what it cost, and anything the owner has to do by hand
   (a Convex deploy, an app rebuild, a new env var). Not a list of files.
5. Stop. The owner reviews and merges. Do not merge your own PR.

If you have already committed to `main` locally by mistake, do not push. Move
the commits onto a branch:

```bash
git branch <type>/<name>          # save the work
git reset --hard origin/main      # put main back
git checkout <type>/<name>
```

---

# Project Second Brain — PatrolSecurity Ecosystem

## What This Project Is
A **Patrol Monitoring & Automated Reporting System**. Security guards scan QR codes at checkpoints using a Flutter mobile app. The system logs scans, tracks patrol routes, and generates reports for supervisors via a web dashboard.

## Architecture at a Glance (Tarmac)
- **Mobile app**: Flutter — `tarmac/mobile/patrol_app/` (build with `--flavor tarmac`)
- **Admin web**: React — `tarmac/web/` (Vercel `tarmac-admin`)
- **Client portal**: React — `tarmac/web-client/` (Vercel `tarmac-clients`)
- **Backend code**: Convex — `tarmac/mobile/patrol_app/convex/` (this is what gets deployed)
- **Live backend (production)**: `unique-anteater-230` — `https://unique-anteater-230.eu-west-1.convex.site`
- **Test backend (development)**: `gallant-crow-174`
- ⚠️ `resilient-buffalo-226` and `harmless-pigeon-186` are **Evergreen's** servers. Never use them from this folder.

## Key Rules — Read Before Touching Anything
1. **Run Convex commands from `tarmac/mobile/patrol_app/`** and check its `.env.local` says `gallant-crow-174` first.
2. **After a Convex change**, deploy to production with `npx convex deploy` (from that folder). Edits don't go live otherwise.
3. **Always read `convex/_generated/ai/guidelines.md`** before writing Convex queries/mutations.
4. **Do not delete files** without asking the user first.
5. **Explain before changing any database schema or logic.**
6. **Run tests after edits** when possible.
7. **Desktop is iCloud-synced** — never move this project to ~/Desktop. It lives at `/Users/macmini/PatrolSecurity_Ecosystem/tarmac/`.

## Scan Data Flow (Mental Model)
```
Guard scans QR at checkpoint
  → Flutter app decodes checkpoint_id + captures GPS
  → POST to Convex mutation with { officer_id, checkpoint_id, timestamp, gps }
  → Convex stores scan, triggers any alerts
  → Web dashboard reads via Convex queries (real-time)
```

## Folder Map
```
tarmac/
├── mobile/patrol_app/          ← Flutter app (lib/) + Convex backend (convex/)
├── web/                        ← Admin dashboard (tarmac-admin)
├── web-client/                 ← Client portal (tarmac-clients) — also serves /privacy.html
├── docs/play-store/            ← Play Store listing, icon, banner
└── PROJECT_BOUNDARY.md         ← Tarmac rules (read with ../PROJECT_BOUNDARY.md)
```

## Common Commands
```bash
cd tarmac/mobile/patrol_app
npx convex deploy                              # backend → Tarmac production
flutter build apk --release --flavor tarmac    # test APK
flutter build appbundle --release --flavor tarmac   # Play Store upload (needs the signing key)
npx vitest run                                 # backend tests
```

---

# 🧠 AI Brain Workflow (shared memory)

This project keeps a shared, Obsidian-style memory in `AI_BRAIN/` used by all AI agents (Claude Code, Codex CLI, Gemini CLI, OpenCode, Antigravity). **As Claude Code, follow these rules:**

1. **Always read `AI_BRAIN/00_Dashboard/Current_Task.md` before starting any work.**
2. **Update `AI_BRAIN/05_Logs/Session_Log.md` after major changes** (short bullets — what changed and why).
3. **Update `AI_BRAIN/02_Decisions/Decision_Log.md` whenever an architecture decision is made** (the *why*, alternatives, status).
4. **When handing testing work to Codex, write the handoff in `AI_BRAIN/06_Handoffs/Claude_To_Codex.md`** (what changed, files, how to test — no code dumps).
5. **Keep all AI_BRAIN files short and useful** to reduce token usage.
6. **Never dump large code into brain files** — only summaries, decisions, bugs, and next steps.

Also log bugs in `AI_BRAIN/03_Bugs/Bug_Tracker.md`, and move finished items from `AI_BRAIN/07_Tasks/Todo.md` to `Done.md`. Start at `AI_BRAIN/00_Dashboard/Home.md` for the full map.

Specialist subagents live in `.claude/agents/` (`project-lead`, `backend-engineer`, `frontend-engineer`, `qa-engineer`, `docs-writer`) — delegate to them for focused work.

---

# 🤝 You are the LEAD of an AI team (auto-dispatch)

A team of CLIs runs alongside you in other terminal tabs: **Gemini** (architecture review/research), **Codex** (tests/bug finding), **OpenCode** (refactor/second opinion), and **Kilo Code** (Git/GitHub pushes). They each run a watcher that listens to `AI_BRAIN/inbox/<agent>.md`.

**When the user gives you a build/feature/fix task, after you understand it:**
1. Distribute the supporting work by running (from the project root):
   ```bash
   python3 /Users/macmini/ai-orchestrator/orchestrator.py dispatch "<concise one-line task>"
   ```
   This drops a role-specific prompt into Gemini/Codex/OpenCode inboxes; their tabs run automatically and stream output live.
2. **You** do the actual code implementation (you are the only agent that edits code — the others are suggest-only). This keeps "one AI edits at a time."
3. While they work, keep implementing. Then **read their results** in `AI_BRAIN/outbox/{gemini,codex,opencode}.md` and integrate what's useful.
4. When code is ready to ship, queue a push for Kilo in `AI_BRAIN/06_Handoffs/Push_To_Kilo.md` (never push without the user's OK).
5. Log the round in `AI_BRAIN/05_Logs/team-log.md` and create a neuron in `AI_BRAIN/09_Neurons/`.

Override who gets a task with `--agents`, e.g. `dispatch "..." --agents codex,opencode`. Ask the user before any destructive command.
