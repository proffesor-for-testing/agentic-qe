---
inclusion: auto
name: qe-verification-quality
description: Verify agent-written changes before they are kept: run the tests, measure coverage, scan for vulnerabilities, apply AQE's fail-closed quality gate, and revert with git when the verdict is a failure.
---

# qe-verification-quality

Verify agent-written changes before they are kept: run the tests, measure coverage, scan for vulnerabilities, apply AQE's fail-closed quality gate, and revert with git when the verdict is a failure.

**Tags:** verification, quality-gate, quality, rollback, metrics, ci-cd, qe, quality-engineering, quality-assurance

## Prerequisites

This skill requires the AQE MCP server. Ensure it is configured in `.kiro/settings/mcp.json`.

## Steps

### 1. What This Skill Does

Turn "the agent says it works" into a measured verdict: run the tests, measure coverage, scan the change, then ask `aqe quality --gate` for a verdict. A missing metric is insufficient evidence, never a pass.

### 2. Quick Start

Produce evidence, scan, and ask for a verdict

### 3. Quality Gate

Read the gate's exit code: 0 pass, 1 failed, 2 narrow pass, 3 not evaluated

### 4. Verification Checks

Tests, coverage and security checks

### 5. Rollback

Revert a failed change with git

### 6. Ci Integration

Gate CI on measured evidence

## MCP Tools

Use AQE tools via the `@agentic-qe` MCP server:

- `@agentic-qe/fleet_init` — Initialize the QE fleet
- `@agentic-qe/test_generate_enhanced` — Generate tests
- `@agentic-qe/coverage_analyze_sublinear` — Analyze coverage
- `@agentic-qe/quality_assess` — Assess quality gates
- `@agentic-qe/memory_store` — Store learned patterns
- `@agentic-qe/memory_query` — Query past patterns
