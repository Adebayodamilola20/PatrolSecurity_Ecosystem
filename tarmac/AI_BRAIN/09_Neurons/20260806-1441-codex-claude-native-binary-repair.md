---
codename: Project Resocket
agent: [[Codex]]
status: done
created: 2026-08-06 14:41 WAT
links: [[AI_BRAIN]], [[Current_Task]]
---

# Claude Code Native Binary Repair

## What
Investigated `claude` / `claude --continue` failing with `Error: claude native binary not installed`.

## Why
The global Claude Code wrapper existed, but the macOS x64 optional native package was missing, leaving only the placeholder binary.

## Result
Installed `@anthropic-ai/claude-code-darwin-x64@2.1.222`, ran the wrapper postinstall, restored `~/.local/bin/claude`, and verified `claude --version` returns `2.1.222 (Claude Code)`.

## Next
User can retry `claude --continue` from the project terminal.
