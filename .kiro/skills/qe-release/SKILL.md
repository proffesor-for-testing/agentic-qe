---
inclusion: auto
name: qe-release
description: End-to-end npm release workflow with verification gates and hardcoded-version protection
---

# qe-release

End-to-end npm release workflow with verification gates and hardcoded-version protection

**Tags:** qe, quality-engineering, release-management

## Prerequisites

This skill requires the AQE MCP server. Ensure it is configured in `.kiro/settings/mcp.json`.

## Steps

### 1. Architecture

This project has a **dual-package structure** — both must stay in sync:

### 2. Arguments

- `<version>` — Target version (e.g., `3.5.5`). If omitted, prompt the user.

### 3. Steps

Steps

### 4. Pre Flight Ensure Clean State

1. Pre-Flight: Ensure Clean State

### 5. Version Audit

Read the current version from `package.json` (source of truth). Then grep the ENTIRE codebase for hardcoded version strings — current version, old versions, and any version-like patterns. Check both package.json files are in sync.

### 6. Bump Version

Update both package.json files to the target version:

### 7. Update Changelog

Add a new section to `v3/CHANGELOG.md` following Keep a Changelog format:

### 8. Version   Yyyy Mm Dd

[<version>] - YYYY-MM-DD

## MCP Tools

Use AQE tools via the `@agentic-qe` MCP server:

- `@agentic-qe/fleet_init` — Initialize the QE fleet
- `@agentic-qe/test_generate_enhanced` — Generate tests
- `@agentic-qe/coverage_analyze_sublinear` — Analyze coverage
- `@agentic-qe/quality_assess` — Assess quality gates
- `@agentic-qe/memory_store` — Store learned patterns
- `@agentic-qe/memory_query` — Query past patterns
