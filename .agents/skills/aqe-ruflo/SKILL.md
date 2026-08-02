---
name: aqe-ruflo
description: Add optional Ruflo development-time orchestration to an Agentic QE workflow. Use when a task benefits from coordinated swarms, persistent cross-session memory, routing, or Ruflo hooks. Do not use for a one-shot edit, and never add Ruflo to shipped AQE runtime dependencies.
---

# Orchestrate AQE with Ruflo

Keep the ownership boundary explicit:

- AQE owns quality specialization, test evidence, gates, and verdicts.
- Ruflo owns development-time task coordination, handoffs, hooks, routing, and
  cross-session orchestration memory.
- Never import Ruflo from product code or add `ruflo`, `claude-flow`, or
  `@claude-flow/cli` as an AQE runtime dependency.

Before using Ruflo, confirm that multi-agent coordination is worth its overhead.
Prefer a small, risk-selected QE fleet over activating every agent.

For projects that explicitly want Ruflo, initialize or inspect it through its
external CLI:

```bash
npx ruflo doctor
npx ruflo discover-plugins
```

Use the installed Ruflo MCP tools when available. Treat their absence as
graceful degradation: AQE quality workflows must continue to work without
Ruflo installed.
