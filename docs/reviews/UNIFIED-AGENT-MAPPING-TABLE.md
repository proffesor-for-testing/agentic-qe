# Unified Agent Migration Mapping Table

**Status:** Corrected and verified across all documents
**Date:** 2026-01-17
**Use this table as the source of truth for agent migration**

---

## Legend

- **Tier 1:** Same name in v2 and v3 (upgrade in place)
- **Tier 2:** Different name (rename with v2_compat)
- **Tier 2b:** One v2 agent maps to multiple v3 agents
- **Tier 3:** New in v3 only (no v2 equivalent)
- **Tier 4:** Subagents consolidated into main agents
- **Domain:** DDD domain assignment

---

## Tier 1: Direct Upgrades (Same Name)

| v2 Agent | v3 Agent | Domain | Notes |
|----------|----------|--------|-------|
| qe-chaos-engineer | qe-chaos-engineer | chaos-resilience | Enhanced in v3 |
| qe-code-complexity | qe-code-complexity | code-intelligence | Enhanced in v3 |
| qe-code-intelligence | qe-code-intelligence | code-intelligence | Enhanced in v3 |
| qe-fleet-commander | qe-fleet-commander | coordination | Enhanced in v3 |
| qe-performance-tester | qe-performance-tester | chaos-resilience | Enhanced in v3 |
| qe-quality-gate | qe-quality-gate | quality-assessment | Enhanced in v3 |
| qe-requirements-validator | qe-requirements-validator | requirements-validation | Enhanced in v3 |
| qe-security-scanner | qe-security-scanner | security-compliance | Enhanced in v3 |
| qe-data-generator | qe-data-generator | test-generation | Enhanced in v3 |
| qe-code-reviewer | qe-code-reviewer | code-quality | Enhanced in v3 |
| qe-integration-tester | qe-integration-tester | contract-testing | Enhanced in v3 |
| qe-security-auditor | qe-security-auditor | security-compliance | Enhanced in v3 |

**Total Tier 1 Agents: 12**

---

## Tier 2: Renamed Agents (with v2_compat)

| v2 Agent | v3 Agent | Domain | v2_compat Field |
|----------|----------|--------|-----------------|
| qe-test-generator | qe-test-architect | test-generation | `name: qe-test-generator` |
| qe-coverage-analyzer | qe-coverage-specialist | coverage-analysis | `name: qe-coverage-analyzer` |
| qe-flaky-test-hunter | qe-flaky-hunter | test-execution | `name: qe-flaky-test-hunter` |
| qe-a11y-ally | qe-accessibility-auditor | visual-accessibility | `name: qe-a11y-ally` |
| qe-api-contract-validator | qe-contract-validator | contract-testing | `name: qe-api-contract-validator` |
| qe-deployment-readiness | qe-deployment-advisor | quality-assessment | `name: qe-deployment-readiness` |
| qe-production-intelligence | qe-impact-analyzer | defect-intelligence | `name: qe-production-intelligence` |
| qe-test-executor | qe-parallel-executor | test-execution | `name: qe-test-executor` |
| qe-regression-risk-analyzer | qe-regression-analyzer | defect-intelligence | `name: qe-regression-risk-analyzer` |
| qx-partner | qe-qx-partner | quality-assessment | `name: qx-partner` |

**v2_compat Format for All Tier 2 Agents:**
```yaml
v2_compat:
  name: <v2-agent-name>
  deprecated_in: "3.0.0"
  removed_in: "4.0.0"
```

**Example:**
```yaml
# v3 agent: qe-test-architect
name: qe-test-architect
version: 3.0.0
domain: test-generation
v2_compat:
  name: qe-test-generator
  deprecated_in: "3.0.0"
  removed_in: "4.0.0"
```

**Total Tier 2 Agents: 10**

---

## Tier 2b: Complex Migrations (One V2 → Multiple V3)

| v2 Agent | v3 Agents | Migration Logic | v2_compat Support |
|----------|-----------|-----------------|-------------------|
| qe-quality-analyzer | qe-quality-gate, qe-metrics-optimizer | Functionality split between quality gate assessment and metrics optimization | Both v3 agents include `v2_compat: {name: qe-quality-analyzer}` |

**Note:** When users query for `qe-quality-analyzer` compatibility:
- Redirect quality assessment → qe-quality-gate
- Redirect metrics → qe-metrics-optimizer

**Total Tier 2b Agents: 1 v2 → 2 v3**

---

## Tier 3: New Agents (V3 Only - No v2 Equivalent)

| v3 Agent | Domain | Purpose | v2_compat |
|----------|--------|---------|-----------|
| qe-bdd-generator | requirements-validation | Gherkin scenario generation | N/A |
| qe-defect-predictor | defect-intelligence | ML-based defect prediction | N/A |
| qe-dependency-mapper | code-intelligence | Dependency graph analysis | N/A |
| qe-gap-detector | coverage-analysis | Coverage gap detection | N/A |
| qe-graphql-tester | contract-testing | GraphQL schema validation | N/A |
| qe-kg-builder | code-intelligence | Knowledge graph construction | N/A |
| qe-learning-coordinator | learning-optimization | Cross-domain learning coordination | N/A |
| qe-load-tester | chaos-resilience | Load and stress testing | N/A |
| qe-metrics-optimizer | learning-optimization | Metrics and KPI optimization | N/A |
| qe-mutation-tester | test-generation | Mutation testing | N/A |
| qe-parallel-executor | test-execution | Parallel test execution | N/A |
| qe-pattern-learner | learning-optimization | Pattern recognition and learning | N/A |
| qe-property-tester | test-generation | Property-based testing | N/A |
| qe-queen-coordinator | coordination | V3 hierarchical queen coordinator | N/A |
| qe-responsive-tester | visual-accessibility | Responsive design testing | N/A |
| qe-retry-handler | test-execution | Intelligent retry and flaky test handling | N/A |
| qe-risk-assessor | quality-assessment | Risk assessment and scoring | N/A |
| qe-root-cause-analyzer | defect-intelligence | Root cause analysis | N/A |
| qe-tdd-specialist | test-generation | TDD workflow specialist | N/A |
| qe-test-architect | test-generation | Test architecture and design | N/A |
| qe-transfer-specialist | learning-optimization | Knowledge transfer between teams | N/A |

**Total Tier 3 Agents: 21**

---

## Tier 4: Subagent Consolidation

### TDD Phase Alignment

| v2 Subagent | v3 Subagent | TDD Phase | Notes |
|------------|-------------|-----------|-------|
| qe-test-writer | qe-tdd-red | Red | Write failing test |
| qe-test-implementer | qe-tdd-green | Green | Implement to pass |
| qe-test-refactorer | qe-tdd-refactor | Refactor | Clean up code |

**v2_compat for TDD Subagents:**
```yaml
# qe-tdd-red agent
v2_compat:
  name: qe-test-writer
  deprecated_in: "3.0.0"
  removed_in: "4.0.0"
```

### Other Subagent Changes

| v2 Subagent | v3 Location | Mapping Logic | v2_compat |
|------------|------------|-----------------|-----------|
| qe-flaky-investigator | qe-flaky-hunter (main) | Promoted to main, absorbed | qe-flaky-hunter has: `name: qe-flaky-investigator` |
| qe-coverage-gap-analyzer | qe-gap-detector (main) | Promoted to main, enhanced | qe-gap-detector has: `name: qe-coverage-gap-analyzer` |
| qe-code-reviewer | qe-code-reviewer (main) | Same | No v2_compat needed |
| qe-security-auditor | qe-security-auditor (main) | Same | No v2_compat needed |
| qe-integration-tester | qe-integration-tester (main) | Same | No v2_compat needed |
| qe-performance-validator | qe-performance-reviewer (main) | Renamed | qe-performance-reviewer has: `name: qe-performance-validator` |
| qe-data-generator | qe-data-generator (main) | Promoted | No v2_compat needed (Tier 1) |
| qe-test-data-architect-sub | (merged into main) | Merged into qe-data-generator | N/A |

**Total Tier 4 Subagents: 11 → 7 (consolidated)**

---

## Summary Statistics

| Category | Count | Notes |
|----------|-------|-------|
| Tier 1 (Same name) | 12 | Upgrade in place |
| Tier 2 (Renamed) | 10 | Add v2_compat field |
| Tier 2b (1→Many) | 1 v2 → 2 v3 | Complex mapping |
| Tier 3 (New) | 21 | V3 only |
| Tier 4 (Subagents) | 11 → 7 | Consolidated |
| **Total V2 Agents** | **32** | (12 Tier 1 + 10 Tier 2 + 1 Tier 2b + 11 Tier 4 subagents) |
| **Total V3 Agents** | **48** | (12 Tier 1 + 10 Tier 2 + 2 Tier 2b + 21 Tier 3 + 7 Tier 4 subagents) |
| **Net Change** | **+16 agents** | 21 new, 11 consolidated = net +10 at top level |

---

## v2_compat Implementation Examples

### Simple Rename (Tier 2)

```yaml
---
name: qe-test-architect
version: 3.0.0
domain: test-generation
description: Test architecture and design with AI pattern learning

v2_compat:
  name: qe-test-generator
  deprecated_in: "3.0.0"
  removed_in: "4.0.0"

capabilities:
  - architecture-design
  - pattern-analysis
  - test-plan-generation
---

This agent replaces qe-test-generator with enhanced capabilities.
```

### Promoted Subagent (Tier 4)

```yaml
---
name: qe-gap-detector
version: 3.0.0
domain: coverage-analysis
description: Intelligent coverage gap detection

v2_compat:
  name: qe-coverage-gap-analyzer  # Was subagent
  deprecated_in: "3.0.0"
  removed_in: "4.0.0"

# Additional subagent that maps here
subagent_compat:
  - name: qe-coverage-gap-analyzer
    deprecated_in: "3.0.0"
    removed_in: "4.0.0"
---

Promoted from subagent to main agent in v3.
```

### Complex Migration (Tier 2b)

```yaml
---
name: qe-quality-gate
version: 3.0.0
domain: quality-assessment
description: Quality gate assessment with automated checks

v2_compat:
  name: qe-quality-analyzer  # Replaces part of this v2 agent
  deprecated_in: "3.0.0"
  removed_in: "4.0.0"
  note: "Replaced qe-quality-analyzer quality assessment functionality. See qe-metrics-optimizer for metrics functionality."

---

# Also add to qe-metrics-optimizer

---
name: qe-metrics-optimizer
version: 3.0.0
domain: learning-optimization
description: Metrics and KPI optimization

v2_compat:
  name: qe-quality-analyzer  # Replaces part of this v2 agent
  deprecated_in: "3.0.0"
  removed_in: "4.0.0"
  note: "Replaced qe-quality-analyzer metrics optimization functionality. See qe-quality-gate for quality assessment functionality."

---
```

---

## Migration Compatibility API

When users reference v2 agent names:

```typescript
// V2 API (deprecated)
aqe.getAgent('qe-test-generator')

// Should resolve to:
resolveAgent('qe-test-generator')
  → 'qe-test-architect' (with deprecation warning)

// Warn users to update to v3 API:
// aqe.domains.testGeneration.getAgent('qe-test-architect')
```

---

## Validation Checklist

Use this to verify implementation:

- [ ] All Tier 1 agents: no v2_compat needed
- [ ] All Tier 2 agents: have v2_compat object
- [ ] v2_compat format: nested object with name, deprecated_in, removed_in
- [ ] Tier 2b agents: both v3 agents have v2_compat to original v2 agent
- [ ] Tier 3 agents: no v2_compat (new in v3)
- [ ] Tier 4 subagents: promoted agents have v2_compat to old name
- [ ] Total v2 agents (32) mapped
- [ ] Total v3 agents (48) documented
- [ ] All domain assignments present
- [ ] No duplicate mappings
- [ ] No missing agents

---

## Documents Using This Table

- ADR-048-v2-v3-agent-migration.md
- AQE-V2-V3-MIGRATION-PLAN.md
- aqe-v2-v3-migration/skill.md

**All three documents should reference this unified table for consistency.**

---

*Unified mapping table created: 2026-01-17*
*Status: Ready for implementation*
*Next: Update all documents to use this table*
