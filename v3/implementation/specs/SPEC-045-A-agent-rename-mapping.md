# SPEC-045-A: Agent Rename Mapping

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-045-A |
| **Parent ADR** | [ADR-045](../adrs/ADR-045-version-agnostic-naming.md) |
| **Version** | 1.0 |
| **Status** | Implemented |
| **Last Updated** | 2026-01-14 |
| **Author** | Migration Analysis Agent |

---

## Overview

This specification documents the complete mapping of agent names from v3-prefixed naming (`v3-qe-*`) to version-agnostic semantic naming (`qe-*`). The migration covers 47 agents across 12 DDD domains plus 7 subagents.

---

## V3 Agents with v3- Prefix (Renamed)

### Test Generation Domain

| Current Name | New Name | File |
|-------------|----------|------|
| `v3-qe-test-architect` | `qe-test-architect` | `qe-test-architect.md` |
| `v3-qe-tdd-specialist` | `qe-tdd-specialist` | `qe-tdd-specialist.md` |
| `v3-qe-integration-tester` | `qe-integration-tester` | `qe-integration-tester.md` |
| `v3-qe-property-tester` | `qe-property-tester` | `qe-property-tester.md` |

### Test Execution Domain

| Current Name | New Name | File |
|-------------|----------|------|
| `v3-qe-parallel-executor` | `qe-parallel-executor` | `qe-parallel-executor.md` |
| `v3-qe-flaky-hunter` | `qe-flaky-hunter` | `qe-flaky-hunter.md` |
| `v3-qe-retry-handler` | `qe-retry-handler` | `qe-retry-handler.md` |

### Coverage Analysis Domain

| Current Name | New Name | File |
|-------------|----------|------|
| `v3-qe-coverage-specialist` | `qe-coverage-specialist` | `qe-coverage-specialist.md` |
| `v3-qe-gap-detector` | `qe-gap-detector` | `qe-gap-detector.md` |
| `v3-qe-mutation-tester` | `qe-mutation-tester` | `qe-mutation-tester.md` |

### Quality Assessment Domain

| Current Name | New Name | File |
|-------------|----------|------|
| `v3-qe-quality-gate` | `qe-quality-gate` | `qe-quality-gate.md` |
| `v3-qe-deployment-advisor` | `qe-deployment-advisor` | `qe-deployment-advisor.md` |
| `v3-qe-code-complexity` | `qe-code-complexity` | `qe-code-complexity.md` |
| `v3-qe-risk-assessor` | `qe-risk-assessor` | `qe-risk-assessor.md` |

### Defect Intelligence Domain

| Current Name | New Name | File |
|-------------|----------|------|
| `v3-qe-defect-predictor` | `qe-defect-predictor` | `qe-defect-predictor.md` |
| `v3-qe-pattern-learner` | `qe-pattern-learner` | `qe-pattern-learner.md` |
| `v3-qe-root-cause-analyzer` | `qe-root-cause-analyzer` | `qe-root-cause-analyzer.md` |
| `v3-qe-regression-analyzer` | `qe-regression-analyzer` | `qe-regression-analyzer.md` |

### Requirements Validation Domain

| Current Name | New Name | File |
|-------------|----------|------|
| `v3-qe-requirements-validator` | `qe-requirements-validator` | `qe-requirements-validator.md` |
| `v3-qe-bdd-generator` | `qe-bdd-generator` | `qe-bdd-generator.md` |

### Code Intelligence Domain

| Current Name | New Name | File |
|-------------|----------|------|
| `v3-qe-code-intelligence` | `qe-code-intelligence` | `qe-code-intelligence.md` |
| `v3-qe-dependency-mapper` | `qe-dependency-mapper` | `qe-dependency-mapper.md` |
| `v3-qe-kg-builder` | `qe-kg-builder` | `qe-kg-builder.md` |
| `v3-qe-impact-analyzer` | `qe-impact-analyzer` | `qe-impact-analyzer.md` |

### Security Compliance Domain

| Current Name | New Name | File |
|-------------|----------|------|
| `v3-qe-security-scanner` | `qe-security-scanner` | `qe-security-scanner.md` |
| `v3-qe-security-auditor` | `qe-security-auditor` | `qe-security-auditor.md` |

### Contract Testing Domain

| Current Name | New Name | File |
|-------------|----------|------|
| `v3-qe-contract-validator` | `qe-contract-validator` | `qe-contract-validator.md` |
| `v3-qe-graphql-tester` | `qe-graphql-tester` | `qe-graphql-tester.md` |

### Visual Accessibility Domain

| Current Name | New Name | File |
|-------------|----------|------|
| `v3-qe-visual-tester` | `qe-visual-tester` | `qe-visual-tester.md` |
| `v3-qe-accessibility-auditor` | `qe-accessibility-auditor` | `qe-accessibility-auditor.md` |
| `v3-qe-responsive-tester` | `qe-responsive-tester` | `qe-responsive-tester.md` |

### Chaos Resilience Domain

| Current Name | New Name | File |
|-------------|----------|------|
| `v3-qe-chaos-engineer` | `qe-chaos-engineer` | `qe-chaos-engineer.md` |
| `v3-qe-load-tester` | `qe-load-tester` | `qe-load-tester.md` |
| `v3-qe-performance-tester` | `qe-performance-tester` | `qe-performance-tester.md` |

### Learning Optimization Domain

| Current Name | New Name | File |
|-------------|----------|------|
| `v3-qe-learning-coordinator` | `qe-learning-coordinator` | `qe-learning-coordinator.md` |
| `v3-qe-transfer-specialist` | `qe-transfer-specialist` | `qe-transfer-specialist.md` |
| `v3-qe-metrics-optimizer` | `qe-metrics-optimizer` | `qe-metrics-optimizer.md` |

### Specialized Agents

| Current Name | New Name | File |
|-------------|----------|------|
| `v3-qe-qx-partner` | `qe-qx-partner` | `qe-qx-partner.md` |
| `v3-qe-fleet-commander` | `qe-fleet-commander` | `qe-fleet-commander.md` |
| `v3-qe-queen-coordinator` | `qe-queen-coordinator` | `qe-queen-coordinator.md` |
| `v3-integration-architect` | `qe-integration-architect` | `qe-integration-architect.md` |

---

## Subagents (7 total)

| Current Name | New Name | File |
|-------------|----------|------|
| `v3-qe-tdd-red` | `qe-tdd-red` | `subagents/qe-tdd-red.md` |
| `v3-qe-tdd-green` | `qe-tdd-green` | `subagents/qe-tdd-green.md` |
| `v3-qe-tdd-refactor` | `qe-tdd-refactor` | `subagents/qe-tdd-refactor.md` |
| `v3-qe-code-reviewer` | `qe-code-reviewer` | `subagents/qe-code-reviewer.md` |
| `v3-qe-integration-reviewer` | `qe-integration-reviewer` | `subagents/qe-integration-reviewer.md` |
| `v3-qe-performance-reviewer` | `qe-performance-reviewer` | `subagents/qe-performance-reviewer.md` |
| `v3-qe-security-reviewer` | `qe-security-reviewer` | `subagents/qe-security-reviewer.md` |

---

## Agents Without Prefix (No Change Needed)

These 11 agents already use version-agnostic naming:

| Agent Name | Location |
|------------|----------|
| `adr-architect` | `.claude/agents/v3/adr-architect.md` |
| `claims-authorizer` | `.claude/agents/v3/claims-authorizer.md` |
| `collective-intelligence-coordinator` | `.claude/agents/v3/collective-intelligence-coordinator.md` |
| `ddd-domain-expert` | `.claude/agents/v3/ddd-domain-expert.md` |
| `memory-specialist` | `.claude/agents/v3/memory-specialist.md` |
| `performance-engineer` | `.claude/agents/v3/performance-engineer.md` |
| `reasoningbank-learner` | `.claude/agents/v3/reasoningbank-learner.md` |
| `security-architect` | `.claude/agents/v3/security-architect.md` |
| `security-auditor` | `.claude/agents/v3/security-auditor.md` |
| `sparc-orchestrator` | `.claude/agents/v3/sparc-orchestrator.md` |
| `swarm-memory-manager` | `.claude/agents/v3/swarm-memory-manager.md` |

---

## Skill Directory Mapping

| Current Name | New Name |
|-------------|----------|
| `v3-qe-test-generation` | `qe-test-generation` |
| `v3-qe-test-execution` | `qe-test-execution` |
| `v3-qe-coverage-analysis` | `qe-coverage-analysis` |
| `v3-qe-quality-assessment` | `qe-quality-assessment` |
| `v3-qe-defect-intelligence` | `qe-defect-intelligence` |
| `v3-qe-requirements-validation` | `qe-requirements-validation` |
| `v3-qe-code-intelligence` | `qe-code-intelligence` |
| `v3-qe-security-compliance` | `qe-security-compliance` |
| `v3-qe-contract-testing` | `qe-contract-testing` |
| `v3-qe-visual-accessibility` | `qe-visual-accessibility` |
| `v3-qe-chaos-resilience` | `qe-chaos-resilience` |
| `v3-qe-learning-optimization` | `qe-learning-optimization` |

---

## CLI & Binary Mapping

| Current | New | Type |
|---------|-----|------|
| `aqe-v3` | `aqe` | Main binary |
| `aqe-v3-mcp` | `aqe-mcp` | MCP server |
| `.aqe-v3/` | `.aqe/` | Project config directory |
| `~/.aqe-v3/` | `~/.aqe/` | User config directory |

---

## MCP Tools (No Change Required)

MCP tools already use version-agnostic naming:

```typescript
'qe/tests/generate'
'qe/tests/execute'
'qe/coverage/analyze'
'qe/coverage/gaps'
'qe/quality/evaluate'
'qe/defects/predict'
'qe/requirements/validate'
'qe/code/analyze'
'qe/security/scan'
'qe/contracts/validate'
'qe/visual/compare'
'qe/a11y/audit'
'qe/chaos/inject'
'qe/learning/optimize'
```

---

## Summary Statistics

| Category | Count | Status |
|----------|-------|--------|
| Agents renamed | 40 | Complete |
| Subagents renamed | 7 | Complete |
| Agents unchanged | 11 | N/A |
| Skills renamed | 12 | Complete |
| CLI binaries renamed | 2 | Complete |
| Config paths renamed | 2 | Complete |
| MCP tools | 14 | No change needed |

**Total files renamed:** 59

---

## Related Specifications

| Spec ID | Title | Relationship |
|---------|-------|--------------|
| [SPEC-045-B](./SPEC-045-B-migration-strategy.md) | Migration Strategy | Implementation scripts |
| [SPEC-045-C](./SPEC-045-C-v2-compatibility.md) | V2 Compatibility | Legacy alias mapping |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-14 | Migration Agent | Initial specification |
| 1.0 | 2026-01-20 | Architecture Team | Extracted from ADR-045 |
