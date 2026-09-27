---
inclusion: auto
name: qe-aqe-v2-v3-migration
description: Migrate Agentic QE projects from v2 to v3 with zero data loss
---

# qe-aqe-v2-v3-migration

Migrate Agentic QE projects from v2 to v3 with zero data loss

**Tags:** qe, quality-engineering

## Prerequisites

This skill requires the AQE MCP server. Ensure it is configured in `.kiro/settings/mcp.json`.

## Steps

### 1. Quick Reference

Quick Reference

### 2. Migration Command

Migration Command

### 3. What Gets Migrated

What Gets Migrated

### 4. Migration Checklist

Migration Checklist

### 5. Pre Migration

- [ ] Verify v2 installation exists (`.agentic-qe/` directory) - [ ] Check v2 version: `aqe --version` (should be 2.x.x) - [ ] Backup current data: `npm run backup` (in v2 project) - [ ] Note any custom configurations - [ ] Document current test counts and coverage

### 6. During Migration

- [ ] Update to v3: `npm install agentic-qe@latest` - [ ] Run migration: `aqe migrate` - [ ] Review migration report - [ ] Verify data transferred correctly

### 7. Post Migration

- [ ] Run v3 tests: `aqe test` - [ ] Check coverage: `aqe coverage` - [ ] Verify patterns loaded: `aqe patterns list` - [ ] Test MCP integration with Claude Code

### 8. Architecture Changes V2 V3

Architecture Changes (v2 → v3)

## MCP Tools

Use AQE tools via the `@agentic-qe` MCP server:

- `@agentic-qe/fleet_init` — Initialize the QE fleet
- `@agentic-qe/test_generate_enhanced` — Generate tests
- `@agentic-qe/coverage_analyze_sublinear` — Analyze coverage
- `@agentic-qe/quality_assess` — Assess quality gates
- `@agentic-qe/memory_store` — Store learned patterns
- `@agentic-qe/memory_query` — Query past patterns
