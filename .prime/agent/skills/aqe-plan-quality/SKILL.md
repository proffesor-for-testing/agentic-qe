---
name: aqe-plan-quality
description: Create risk-based quality and test plans for Agentic QE changes. Use when scoping a feature, translating requirements into verification work, selecting QE specialties, assessing testability, or deciding which `.claude/agents/v3/qe-*.md` capabilities should inform a task. Do not use merely to execute an already-defined test command.
---

# Plan AQE Quality

1. Read `AGENTS.md`, the requested change, and the affected public boundaries.
2. Inspect the closest implementation and tests before proposing work.
3. Classify the risk domains using [references/qe-routing.md](references/qe-routing.md).
4. Select only the QE specialties needed. Treat Claude agent definitions as
   domain references; do not copy their Claude-only `Task`, `SendMessage`, or
   hook syntax into Codex actions.
5. Produce a plan that covers:
   - observable requirements and acceptance criteria;
   - affected boundaries, dependencies, and failure modes;
   - durable tests first, then implementation-coupled tests;
   - security, performance, accessibility, contract, or resilience checks when
     triggered by the change;
   - the narrowest repository verification commands.
6. Flag assumptions, unavailable environments, destructive operations, and
   decisions requiring human approval.

Prefer evidence from repository code and configuration over generic test
checklists. Keep the selected fleet small and explain each specialty’s purpose.
