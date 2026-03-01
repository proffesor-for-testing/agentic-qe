AQE Hooks Directory
====================

Claude Code hooks are configured in .claude/settings.json (not as files here).
This directory contains supporting infrastructure for the learning system.

Configured hook types: PreToolUse, PostToolUse, UserPromptSubmit, SessionStart, Stop

Files:
  settings.json  — Hook definitions (in parent .claude/ directory)
  v3-qe-bridge.sh — Bridge script connecting Claude Code events to QE learning
  v3-domain-workers.json — Domain worker configuration
  cross-phase-memory.yaml — QCSD feedback loop configuration

Manual testing:
  npx agentic-qe hooks session-start --session-id test --json
  npx agentic-qe hooks route --task "generate tests" --json
  npx agentic-qe hooks post-edit --file src/example.ts --success --json
