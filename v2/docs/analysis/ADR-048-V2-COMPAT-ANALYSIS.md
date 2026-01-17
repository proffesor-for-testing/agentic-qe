# ADR-048: V2-to-V3 Agent Migration - v2_compat Analysis

**Date**: 2026-01-17
**Task**: Identify v3 QE agents that need v2_compat fields
**Status**: Complete
**Author**: Research Agent

---

## Executive Summary

Analysis of 41 v3 QE agents reveals:
- **9 agents** (Tier 1): Direct upgrades - v2_compat correctly set
- **9 agents** (Tier 2): Renamed agents - v2_compat correctly set
- **7 agents** (Tier 2-CORRECTION): INCORRECT v2_compat values - **MUST FIX**
- **16 agents** (Tier 3): New in v3 - no v2_compat needed
- **3 agents** (Tier 4): V2-only agents not migrated

**ACTION REQUIRED**: Fix 7 agents with incorrect v2_compat mappings immediately.

---

## Tier 1: Direct Upgrades (Same Name)

These agents have the **same name** in v2 and v3. v2_compat field already set correctly.

| V3 Agent | V2 Agent | Status |
|----------|----------|--------|
| qe-chaos-engineer | qe-chaos-engineer | OK |
| qe-code-complexity | qe-code-complexity | OK |
| qe-code-intelligence | qe-code-intelligence | OK |
| qe-fleet-commander | qe-fleet-commander | OK |
| qe-performance-tester | qe-performance-tester | OK |
| qe-quality-gate | qe-quality-gate | OK |
| qe-requirements-validator | qe-requirements-validator | OK |
| qe-security-scanner | qe-security-scanner | OK |
| qe-visual-tester | qe-visual-tester | OK |

**Count**: 9 agents
**Action**: None - correctly implemented

---

## Tier 2: Renamed Agents (Different Name)

These agents are **renamed** in v3. v2_compat field correctly maps to v2 agent name.

| V3 Agent | V2 Agent | Status |
|----------|----------|--------|
| qe-accessibility-auditor | qe-a11y-ally | OK |
| qe-contract-validator | qe-api-contract-validator | OK |
| qe-coverage-specialist | qe-coverage-analyzer | OK |
| qe-deployment-advisor | qe-deployment-readiness | OK |
| qe-flaky-hunter | qe-flaky-test-hunter | OK |
| qe-parallel-executor | qe-test-executor | OK |
| qe-regression-analyzer | qe-regression-risk-analyzer | OK |
| qe-test-architect | qe-test-generator | OK |
| qe-qx-partner | qx-partner | OK |

**Count**: 9 agents
**Action**: None - correctly implemented

---

## Tier 2-CORRECTION: Agents With INCORRECT v2_compat

**These agents currently have INCORRECT v2_compat values. They map to other v3 agents or non-existent v2 agents instead of properly marking them as NEW.**

### Priority Fixes Required

| V3 Agent | Current v2_compat | Issue | Fix Required |
|----------|-------------------|-------|--------------|
| qe-dependency-mapper | qe-code-intelligence | Maps to v3 agent, not v2 | Change to: `v2_compat: null # New in v3` |
| qe-impact-analyzer | qe-code-intelligence | Maps to v3 agent, not v2 | Change to: `v2_compat: null # New in v3` |
| qe-kg-builder | qe-code-intelligence | Maps to v3 agent, not v2 | Change to: `v2_compat: null # New in v3` |
| qe-load-tester | qe-performance-tester | Maps to DIFFERENT v3 agent | Change to: `v2_compat: null # New in v3` |
| qe-pattern-learner | qe-learning-coordinator | Maps to non-existent v2 agent | Change to: `v2_compat: null # New in v3` |
| qe-risk-assessor | qe-regression-risk-analyzer | Maps to DIFFERENT v3 agent | Change to: `v2_compat: null # New in v3` |
| qe-root-cause-analyzer | qe-defect-predictor | Maps to NEW v3 agent | Change to: `v2_compat: null # New in v3` |

**Count**: 7 agents
**Action**: **REQUIRED - Fix all 7 agents immediately**

### Why These Are Incorrect

These agents appear to be NEW in v3 (no true v2 equivalent), but their v2_compat fields incorrectly point to:
1. Other v3 agents: qe-code-intelligence, qe-learning-coordinator
2. Different domain agents: qe-performance-tester, qe-regression-risk-analyzer
3. NEW v3 agents: qe-defect-predictor

**The v2_compat field should ONLY map to ACTUAL v2 agents that existed in version 2.0.**

---

## Tier 3: New in V3

These agents are **new in v3** with no v2 equivalent. They should have `v2_compat: null # New in v3` or similar.

| Agent | Domain | Status |
|-------|--------|--------|
| qe-bdd-generator | requirements-validation | New |
| qe-defect-predictor | defect-intelligence | New |
| qe-gap-detector | coverage-analysis | New |
| qe-graphql-tester | contract-testing | New |
| qe-integration-architect | integration | New |
| qe-integration-tester | test-execution | New |
| qe-learning-coordinator | learning-optimization | New |
| qe-metrics-optimizer | learning-optimization | New |
| qe-mutation-tester | test-generation | New |
| qe-property-tester | test-generation | New |
| qe-queen-coordinator | coordination | New |
| qe-responsive-tester | visual-accessibility | New |
| qe-retry-handler | test-execution | New |
| qe-security-auditor | security-compliance | New |
| qe-tdd-specialist | test-generation | New |
| qe-transfer-specialist | learning-optimization | New |

**Count**: 16 agents
**Action**: Verify they all have `v2_compat: null # New in v3` or similar marking

---

## Tier 4: V2-Only Agents (Not Migrated)

These agents exist in v2 but have **NO equivalent in v3**. Requires migration strategy.

| V2 Agent | Status | Notes |
|----------|--------|-------|
| qe-production-intelligence | Not migrated | No v3 equivalent - needs strategy |
| qe-quality-analyzer | Partially merged | Functionality split across other agents |
| qe-test-data-architect | Migrated to subagents | Functionality distributed |

**Count**: 3 agents
**Action**: TODO - Define migration strategy for users upgrading from v2

---

## Summary Statistics

| Category | Count |
|----------|-------|
| Tier 1 - Direct Upgrades (OK) | 9 |
| Tier 2 - Renamed (OK) | 9 |
| Tier 2 - Needing Correction | 7 |
| Tier 3 - New in V3 | 16 |
| Tier 4 - V2-Only Agents | 3 |
| **Total V3 QE Agents** | 41 |
| **Total V2 QE Agents** | 21 |
| **Agents Requiring Fixes** | 7 |

---

## Implementation Checklist

### Phase 1: Fix Incorrect v2_compat Fields (PRIORITY)

- [ ] Fix qe-dependency-mapper: Change v2_compat to null
- [ ] Fix qe-impact-analyzer: Change v2_compat to null
- [ ] Fix qe-kg-builder: Change v2_compat to null
- [ ] Fix qe-load-tester: Change v2_compat to null
- [ ] Fix qe-pattern-learner: Change v2_compat to null
- [ ] Fix qe-risk-assessor: Change v2_compat to null
- [ ] Fix qe-root-cause-analyzer: Change v2_compat to null

### Phase 2: Verify Tier 1 & 2 Agents

- [ ] Audit all 18 Tier 1 & 2 agents for correct v2_compat
- [ ] Verify v2_compat format is consistent
- [ ] Test migration compatibility layer

### Phase 3: Verify Tier 3 Agents

- [ ] Confirm all 16 new agents have `v2_compat: null # New in v3`
- [ ] Document in agent descriptions they are new

### Phase 4: Handle V2-Only Agents

- [ ] Define strategy for qe-production-intelligence
- [ ] Define strategy for qe-quality-analyzer
- [ ] Define strategy for qe-test-data-architect
- [ ] Create migration guide for users

---

## Files to Modify

### Agents Needing Fixes (7 files)

```
/workspaces/agentic-qe/.claude/agents/v3/qe-dependency-mapper.md
/workspaces/agentic-qe/.claude/agents/v3/qe-impact-analyzer.md
/workspaces/agentic-qe/.claude/agents/v3/qe-kg-builder.md
/workspaces/agentic-qe/.claude/agents/v3/qe-load-tester.md
/workspaces/agentic-qe/.claude/agents/v3/qe-pattern-learner.md
/workspaces/agentic-qe/.claude/agents/v3/qe-risk-assessor.md
/workspaces/agentic-qe/.claude/agents/v3/qe-root-cause-analyzer.md
```

---

## Complete Mapping Table

### V2 Agent Name → V3 Agent Name

All renamed agents (17 total):

| V2 Name | V3 Name | Type |
|---------|---------|------|
| qe-a11y-ally | qe-accessibility-auditor | Renamed |
| qe-api-contract-validator | qe-contract-validator | Renamed |
| qe-coverage-analyzer | qe-coverage-specialist | Renamed |
| qe-deployment-readiness | qe-deployment-advisor | Renamed |
| qe-flaky-test-hunter | qe-flaky-hunter | Renamed |
| qe-test-executor | qe-parallel-executor | Renamed |
| qe-regression-risk-analyzer | qe-regression-analyzer | Renamed |
| qe-test-generator | qe-test-architect | Renamed |
| qx-partner | qe-qx-partner | Renamed |
| qe-chaos-engineer | qe-chaos-engineer | Direct upgrade |
| qe-code-complexity | qe-code-complexity | Direct upgrade |
| qe-code-intelligence | qe-code-intelligence | Direct upgrade |
| qe-fleet-commander | qe-fleet-commander | Direct upgrade |
| qe-performance-tester | qe-performance-tester | Direct upgrade |
| qe-quality-gate | qe-quality-gate | Direct upgrade |
| qe-requirements-validator | qe-requirements-validator | Direct upgrade |
| qe-security-scanner | qe-security-scanner | Direct upgrade |
| qe-visual-tester | qe-visual-tester | Direct upgrade |

---

## References

- Migration Plan: `/workspaces/agentic-qe/docs/plans/AQE-V2-V3-MIGRATION-PLAN.md`
- V3 Agents: `/workspaces/agentic-qe/.claude/agents/v3/qe-*.md`
- V2 Agents: `/workspaces/agentic-qe/.claude/agents/qe-*.md`
- V3 Subagents: `/workspaces/agentic-qe/.claude/agents/v3/subagents/`
- V2 Subagents: `/workspaces/agentic-qe/.claude/agents/subagents/`
