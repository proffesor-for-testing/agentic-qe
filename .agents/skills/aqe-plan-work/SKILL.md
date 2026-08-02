---
name: aqe-plan-work
description: Build dependency-aware execution plans for complex Agentic QE, Ruflo, integration, migration, or multi-stream engineering programs. Use when Codex must turn research or requirements into phased work, select a small AQE fleet, map critical paths and parallel streams, define acceptance gates, or sequence risky changes. Use aqe-plan-quality instead when the primary output is only a test or quality plan.
---

# Plan AQE Work

1. Read `AGENTS.md`, the objective, relevant research, affected implementation,
   tests, configuration, and public boundaries.
2. Define observable outcomes, non-goals, constraints, assumptions, and decisions
   that require human approval.
3. Decompose work into independently verifiable deliverables. Map dependencies,
   consumers, migrations, compatibility boundaries, and rollback points.
4. Select the smallest useful specialist fleet with
   [references/planning-framework.md](references/planning-framework.md). Give
   every selected specialty a concrete output; do not summon the whole fleet.
5. Arrange phases so contracts, safety controls, and durable tests precede or
   accompany implementation. Check CLI/MCP and Claude/Codex parity when shared
   capabilities cross those surfaces.
6. Identify work that can run in parallel and a clear critical path. Do not use
   unsupported precision for time estimates; size work by risk and dependency.
7. Attach acceptance criteria and the narrowest verification command to each
   deliverable. Include security, resilience, performance, accessibility, or
   data-integrity gates only when triggered by the actual scope.
8. End with prioritized milestones, risks and mitigations, open decisions, and
   a recommended first vertical slice.

Use Ruflo for persistent memory, learned routing, hooks, or multi-agent
coordination only when its operational benefit exceeds its setup overhead.
Treat Claude agent definitions as domain references; translate their workflows
into available Codex actions rather than copying Claude-only tool syntax.
