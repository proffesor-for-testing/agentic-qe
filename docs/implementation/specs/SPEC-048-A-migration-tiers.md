# SPEC-048-A: V2-to-V3 Agent Migration Tiers

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-048-A |
| **Parent ADR** | [ADR-048](../adrs/ADR-048-v2-v3-agent-migration.md) |
| **Version** | 1.0 |
| **Status** | Implemented |
| **Last Updated** | 2026-01-17 |
| **Author** | Architecture Team |

---

## Overview

This specification details the 5-tier migration strategy for upgrading V2 agents to V3, including compatibility mappings and CLI commands.

---

## Agent Counts

| Category | V2 Count | V3 Count | Notes |
|----------|----------|----------|-------|
| Main QE Agents | 21 | 41 | +20 new agents |
| QE Subagents | 11 | 7 | Consolidated |
| **Total** | **32** | **48** | Net +16 |

---

## Tier 1: Direct Upgrades (7 agents)

Agents that keep the same name get in-place replacement:

| Agent Name | Notes |
|------------|-------|
| `qe-flaky-hunter` | V3 enhanced version |
| `qe-performance-tester` | V3 enhanced version |
| `qe-security-auditor` | V3 enhanced version |
| `qe-integration-tester` | V3 enhanced version |
| `qe-code-reviewer` | V3 enhanced version |
| `qe-chaos-engineer` | V3 enhanced version |
| `qe-data-generator` | V3 enhanced version |

---

## Tier 2: Renamed Agents (14 agents)

Agents with new names include `v2_compat` field:

```yaml
# v3/qe-test-architect.md
name: qe-test-architect
v2_compat:
  name: qe-test-generator
  deprecated_in: "3.0.0"
  removed_in: "4.0.0"
description: Enhanced test generation with AI pattern learning
```

### Mapping Table

| V2 Agent | V3 Agent | Domain |
|----------|----------|--------|
| `qe-coverage-analyzer` | `qe-coverage-specialist` | coverage-analysis |
| `qe-test-generator` | `qe-test-architect` | test-generation |
| `qe-test-writer` | `qe-tdd-red` | test-generation |
| `qe-test-implementer` | `qe-tdd-green` | test-generation |
| `qe-test-refactorer` | `qe-tdd-refactor` | test-generation |
| `qe-gap-detector` | `qe-coverage-specialist` | coverage-analysis |
| `qe-visual-tester` | `qe-visual-accessibility` | visual-accessibility |
| `qe-graphql-tester` | `qe-contract-validator` | contract-testing |
| `qe-api-contract-validator` | `qe-contract-testing` | contract-testing |
| `qe-deployment-advisor` | `qe-quality-gate` | quality-assessment |
| `qe-parallel-executor` | `qe-test-executor` | test-execution |
| `qe-defect-predictor` | `qe-defect-intelligence` | defect-intelligence |
| `qe-root-cause-analyzer` | `qe-defect-intelligence` | defect-intelligence |
| `qe-learning-coordinator` | `qe-learning-optimization` | learning-optimization |

---

## Tier 2b: Complex Migrations (One V2 -> Multiple V3)

| V2 Agent | V3 Agents | Reason |
|----------|-----------|--------|
| `qe-quality-analyzer` | `qe-quality-gate`, `qe-metrics-optimizer` | Functionality split |
| `qe-code-intelligence` | `qe-kg-builder`, `qe-dependency-mapper`, `qe-impact-analyzer` | Specialized focus |

---

## Tier 3: New V3-Only Agents (21 agents)

No V2 equivalent:
- `qe-test-architect`, `qe-tdd-specialist`, `qe-property-tester`, `qe-mutation-tester`
- `qe-requirements-validator`, `qe-bdd-generator`, `qe-knowledge-manager`
- `qe-code-intelligence`, `qe-dependency-mapper`, `qe-impact-analyzer`
- `qe-load-tester`, `qe-resilience-tester`
- `qe-pattern-learner`, `qe-transfer-specialist`, `qe-metrics-optimizer`
- `qe-fleet-commander`, `qe-quality-analyst`, `qe-regression-analyzer`
- `qe-responsive-tester`, `qe-security-reviewer`, `qe-accessibility-auditor`

---

## Tier 4: Consolidated Subagents (11 V2 -> 7 V3)

| V2 Subagent | V3 Location | Notes |
|-------------|-------------|-------|
| `qe-test-writer` | `qe-tdd-red` | TDD Red phase |
| `qe-test-implementer` | `qe-tdd-green` | TDD Green phase |
| `qe-test-refactorer` | `qe-tdd-refactor` | TDD Refactor phase |
| `coverage-gap-detector` | `qe-coverage-specialist` | Merged |
| `test-prioritizer` | `qe-test-architect` | Merged |
| `flaky-test-analyzer` | `qe-flaky-hunter` | Merged |
| `regression-identifier` | `qe-regression-analyzer` | Merged |

---

## Tier 5: Deprecated (None)

No agents deprecated in V3. V2 agents remain functional via compatibility layer until V4.0.0.

---

## CLI Commands

```bash
# Check migration status
aqe migrate status

# Run full migration with backup
aqe migrate run --backup

# Migrate specific components
aqe migrate run --target agents
aqe migrate run --target skills
aqe migrate run --target config
aqe migrate run --target memory

# Verify migration
aqe migrate verify

# Rollback if needed
aqe migrate rollback
```

---

## Directory Restructure

**Before:**
```
.claude/agents/
├── v3/            # Remove this nesting
│   └── qe-*.md
└── qe-*.md        # v2 agents
```

**After:**
```
.claude/agents/
├── qe-*.md        # Unified v3 agents (with v2_compat)
└── deprecated/    # v2 agents archived
    └── qe-*.md.v2
```

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-17 | Architecture Team | Initial specification |

---

## References

- [Parent ADR](../adrs/ADR-048-v2-v3-agent-migration.md)
- [ADR-045: Version-Agnostic Naming](../adrs/ADR-045-version-agnostic-naming.md)
