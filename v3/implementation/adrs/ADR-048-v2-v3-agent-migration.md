# ADR-048: V2-to-V3 Agent Migration Upgrade Strategy

**Status:** Implemented
**Date:** 2026-01-17
**Decision Makers:** Architecture Team
**Context Owner:** Migration Lead

---

## Context

When v3 becomes the main release, existing v2 users (thousands of users) should receive **upgraded agents/skills**, not duplicates of both versions. Currently, v3 agents are stored separately in `.claude/agents/v3/` which would result in users having both:
- v2 agents: `qe-coverage-analyzer.md`, `qe-test-generator.md`, etc.
- v3 agents: `v3/qe-coverage-specialist.md`, `v3/qe-test-architect.md`, etc.

This violates user expectations that upgrades should replace old versions, not add duplicates.

### Analysis from claude-flow v2→v3 Migration

Studied claude-flow repository approach:
- Zero-breaking-changes migration
- `v2_compat` field in v3 agents maps to v2 equivalent
- Compatibility layers for tool names, APIs, and parameters
- Automated migration CLI commands with rollback support

### Current Agent Counts (QE-Only)

| Category | V2 Count | V3 Count | Notes |
|----------|----------|----------|-------|
| Main QE Agents | 21 | 41 | +20 new agents |
| QE Subagents | 11 | 7 | Consolidated |
| **Total** | **32** | **48** | Net +16 |

---

## Decision

**Implement claude-flow-style upgrade-in-place migration with compatibility layers and automated tooling.**

### Strategy: 5-Tier Migration

#### Tier 1: Direct Upgrades (Same Name - 7 agents)
Agents that keep the same name get in-place replacement:
- `qe-flaky-hunter` → v3 enhanced version
- `qe-performance-tester` → v3 enhanced version
- `qe-security-auditor` → v3 enhanced version
- `qe-integration-tester` → v3 enhanced version
- `qe-code-reviewer` → v3 enhanced version
- `qe-chaos-engineer` → v3 enhanced version
- `qe-data-generator` → v3 enhanced version

#### Tier 2: Renamed Agents (with Compatibility - 14 agents)
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

Mapping (V2 → V3):
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

#### Tier 2b: Complex Migrations (One V2 → Multiple V3)
Some V2 agents are split into multiple specialized V3 agents:

| V2 Agent | V3 Agents | Reason |
|----------|-----------|--------|
| `qe-quality-analyzer` | `qe-quality-gate`, `qe-metrics-optimizer` | Functionality split: gates vs metrics |
| `qe-code-intelligence` | `qe-kg-builder`, `qe-dependency-mapper`, `qe-impact-analyzer` | Specialized focus areas |

#### Tier 3: New V3-Only Agents
21 new agents added in v3 (no v2 equivalent):
- `qe-test-architect` (new role)
- `qe-tdd-specialist`
- `qe-property-tester`
- `qe-mutation-tester`
- `qe-requirements-validator`
- `qe-bdd-generator`
- `qe-knowledge-manager`
- `qe-code-intelligence`
- `qe-dependency-mapper`
- `qe-impact-analyzer`
- `qe-load-tester`
- `qe-resilience-tester`
- `qe-pattern-learner`
- `qe-transfer-specialist`
- `qe-metrics-optimizer`
- `qe-fleet-commander`
- `qe-quality-analyst`
- `qe-regression-analyzer`
- `qe-responsive-tester`
- `qe-security-reviewer`
- `qe-accessibility-auditor`

#### Tier 4: Consolidated Subagents (11 V2 → 7 V3)
V2 subagents merged into main agents with enhanced capabilities:

| V2 Subagent | V3 Location | Notes |
|-------------|-------------|-------|
| `qe-test-writer` | `qe-tdd-red` | TDD Red phase specialist |
| `qe-test-implementer` | `qe-tdd-green` | TDD Green phase specialist |
| `qe-test-refactorer` | `qe-tdd-refactor` | TDD Refactor phase specialist |
| `coverage-gap-detector` | `qe-coverage-specialist` | Merged into main coverage agent |
| `test-prioritizer` | `qe-test-architect` | Merged into architect planning |
| `flaky-test-analyzer` | `qe-flaky-hunter` | Merged into main flaky detector |
| `regression-identifier` | `qe-regression-analyzer` | Merged into regression analysis |

#### Tier 5: Deprecated (None Currently)
No agents deprecated in v3. V2 agents remain functional via compatibility layer until v4.0.0.

---

## Implementation

### Phase 1: Add v2_compat Fields (This ADR)
```yaml
# Each v3 agent that replaces a v2 agent includes:
v2_compat:
  name: <v2-agent-name>
  deprecated_in: "3.0.0"
  removed_in: "4.0.0"
```

### Phase 2: Compatibility Layer
```typescript
// src/migration/agent-compat.ts
export const v2AgentMapping: Record<string, string> = {
  'qe-test-writer': 'qe-tdd-red',
  'qe-test-implementer': 'qe-tdd-green',
  'qe-gap-detector': 'qe-coverage-specialist',
  // ... full mapping
};

export function resolveAgentName(name: string): string {
  return v2AgentMapping[name] || name;
}
```

### Phase 3: Migration CLI
```bash
# Check migration status
aqe migrate status

# Run full migration with backup
aqe migrate run --backup

# Migrate specific components
aqe migrate run --target agents    # Migrate agent configs only
aqe migrate run --target skills    # Migrate skills only
aqe migrate run --target config    # Migrate project config only
aqe migrate run --target memory    # Migrate memory/patterns only

# Verify migration
aqe migrate verify

# Rollback if needed
aqe migrate rollback
```

### Phase 4: Agent Directory Restructure
Move from:
```
.claude/agents/
├── v3/            # Remove this nesting
│   └── qe-*.md
└── qe-*.md        # v2 agents
```

To:
```
.claude/agents/
├── qe-*.md        # Unified v3 agents (with v2_compat)
└── deprecated/    # v2 agents archived
    └── qe-*.md.v2
```

---

## Rationale

**Pros:**
- Users get seamless upgrades without duplicates
- Backward compatibility maintained via `v2_compat`
- Clear deprecation path to v4
- CLI tooling automates migration
- Rollback support reduces risk

**Cons:**
- Requires v2_compat fields in all renamed agents
- Directory restructuring during release
- Additional testing for compatibility layer

**Alternatives Considered:**
1. **Keep both versions** - Rejected: User confusion, storage bloat
2. **Force immediate migration** - Rejected: Too disruptive
3. **Manual migration only** - Rejected: Error-prone at scale

---

## Success Metrics

- [ ] All 12 renamed agents have `v2_compat` field
- [ ] Compatibility layer resolves 100% of v2 agent names
- [ ] `aqe migrate verify` passes on test projects
- [ ] Migration CLI has rollback capability
- [ ] Documentation updated with migration guide

---

## Related Documents

- [Migration Plan](../../../docs/plans/AQE-V2-V3-MIGRATION-PLAN.md)
- [Migration Skill](../../../.claude/skills/aqe-v2-v3-migration/skill.md)
- [ADR-045: Version-Agnostic Naming](./ADR-045-version-agnostic-naming.md)

---

*ADR Version: 1.0.0 | Created: 2026-01-17*
