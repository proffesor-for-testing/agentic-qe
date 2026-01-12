# ADR-037: V3 QE Agent Naming Standardization

**Status**: Implemented
**Date**: 2026-01-11
**Author**: Claude Code
**Implementation Date**: 2026-01-12

## Context

V3 QE skills currently reference agents using V2-style short names (e.g., `'test-architect'`, `'coverage-specialist'`) while the actual V3 QE agent definitions use the full `v3-qe-*` prefix (e.g., `'v3-qe-test-architect'`, `'v3-qe-coverage-specialist'`).

This inconsistency causes:
1. Confusion about which agent version is being used
2. Potential routing errors in the Task tool
3. Documentation mismatches
4. Difficulty in agent discovery

## Decision

Standardize all V3 QE skills to use the full `v3-qe-*` agent naming convention.

### Naming Convention

```
v3-qe-{domain}-{specialty}
```

Examples:
- `v3-qe-test-architect`
- `v3-qe-coverage-specialist`
- `v3-qe-quality-gate`
- `v3-qe-defect-predictor`

### Agent Categories

1. **V3 QE Domain Agents** (47 agents): Core quality engineering agents with `v3-qe-*` prefix
2. **V3 QE Subagents** (7 agents): Specialized subagents with `v3-qe-*` prefix
3. **V3 Specialized Agents** (12 agents): Cross-cutting agents without `v3-qe-*` prefix

### Migration Map

| Legacy Name | V3 QE Name | Domain |
|-------------|------------|--------|
| test-architect | v3-qe-test-architect | test-generation |
| tdd-specialist | v3-qe-tdd-specialist | test-generation |
| tdd-red | v3-qe-tdd-red | test-generation (subagent) |
| tdd-green | v3-qe-tdd-green | test-generation (subagent) |
| tdd-refactor | v3-qe-tdd-refactor | test-generation (subagent) |
| parallel-executor | v3-qe-parallel-executor | test-execution |
| flaky-hunter | v3-qe-flaky-hunter | test-execution |
| retry-handler | v3-qe-retry-handler | test-execution |
| coverage-specialist | v3-qe-coverage-specialist | coverage-analysis |
| gap-detector | v3-qe-gap-detector | coverage-analysis |
| quality-gate | v3-qe-quality-gate | quality-assessment |
| code-complexity | v3-qe-code-complexity | quality-assessment |
| deployment-advisor | v3-qe-deployment-advisor | quality-assessment |
| security-scanner | v3-qe-security-scanner | security-compliance |
| security-auditor | v3-qe-security-auditor | security-compliance |
| contract-validator | v3-qe-contract-validator | contract-testing |
| integration-tester | v3-qe-integration-tester | contract-testing |
| graphql-tester | v3-qe-graphql-tester | contract-testing |
| visual-tester | v3-qe-visual-tester | visual-accessibility |
| accessibility-auditor | v3-qe-accessibility-auditor | visual-accessibility |
| responsive-tester | v3-qe-responsive-tester | visual-accessibility |
| performance-tester | v3-qe-performance-tester | chaos-resilience |
| load-tester | v3-qe-load-tester | chaos-resilience |
| chaos-engineer | v3-qe-chaos-engineer | chaos-resilience |
| code-intelligence | v3-qe-code-intelligence | code-intelligence |
| dependency-mapper | v3-qe-dependency-mapper | code-intelligence |
| kg-builder | v3-qe-kg-builder | code-intelligence |
| requirements-validator | v3-qe-requirements-validator | requirements-validation |
| bdd-generator | v3-qe-bdd-generator | requirements-validation |
| defect-predictor | v3-qe-defect-predictor | defect-intelligence |
| root-cause-analyzer | v3-qe-root-cause-analyzer | defect-intelligence |
| regression-analyzer | v3-qe-regression-analyzer | defect-intelligence |
| impact-analyzer | v3-qe-impact-analyzer | defect-intelligence |
| risk-assessor | v3-qe-risk-assessor | defect-intelligence |
| learning-coordinator | v3-qe-learning-coordinator | learning-optimization |
| pattern-learner | v3-qe-pattern-learner | learning-optimization |
| transfer-specialist | v3-qe-transfer-specialist | learning-optimization |
| metrics-optimizer | v3-qe-metrics-optimizer | learning-optimization |
| fleet-commander | v3-qe-fleet-commander | learning-optimization |
| queen-coordinator | v3-qe-queen-coordinator | learning-optimization |
| property-tester | v3-qe-property-tester | test-generation |
| mutation-tester | v3-qe-mutation-tester | test-generation |
| code-reviewer | v3-qe-code-reviewer | quality-assessment (subagent) |
| integration-reviewer | v3-qe-integration-reviewer | contract-testing (subagent) |
| performance-reviewer | v3-qe-performance-reviewer | chaos-resilience (subagent) |
| security-reviewer | v3-qe-security-reviewer | security-compliance (subagent) |
| qx-partner | v3-qe-qx-partner | quality-assessment |

### V3 Specialized Agents (No v3-qe prefix)

These agents are cross-cutting and don't use the `v3-qe-*` prefix:

| Agent ID | Description |
|----------|-------------|
| adr-architect | Architecture Decision Record specialist |
| claims-authorizer | Claims-based authorization specialist |
| collective-intelligence-coordinator | Hive-mind collective intelligence |
| ddd-domain-expert | Domain-Driven Design specialist |
| memory-specialist | Memory optimization specialist |
| performance-engineer | Performance engineering specialist |
| reasoningbank-learner | ReasoningBank integration specialist |
| security-architect | Security Architecture specialist |
| security-auditor | General security auditor (V2 compat) |
| sparc-orchestrator | SPARC methodology orchestrator |
| swarm-memory-manager | Swarm memory manager |
| v3-integration-architect | V3 integration specialist |

## Implementation

### Files Updated

1. **`v3/src/routing/qe-agent-registry.ts`** - Updated agent registry with:
   - All V3 QE agents using `v3-qe-*` prefix (47 agents)
   - New V3 QE Subagents section (7 agents)
   - Updated `getAgentCounts()` function
   - Updated header documentation

### Registry Structure

```typescript
// V3 QE Domain Agents (47 agents with v3-qe-* prefix)
const v3QEAgents: QEAgentProfile[] = [
  // Test Generation, Test Execution, Coverage Analysis,
  // Quality Assessment, Security, Contract Testing,
  // Visual & Accessibility, Performance & Chaos,
  // Code Intelligence, Requirements & Defect,
  // Learning & Optimization, Property-Based & Mutation
];

// V3 QE Subagents (7 agents with v3-qe-* prefix)
const v3QESubagents: QEAgentProfile[] = [
  // TDD Phase Subagents (red, green, refactor)
  // Review Subagents (code, integration, performance, security)
];

// V3 Specialized (12 agents without v3-qe prefix)
const v3SpecializedAgents: QEAgentProfile[] = [
  // Cross-cutting specialized agents
];
```

## Backward Compatibility

### Legacy Mappings

For backward compatibility, the following mappings are maintained:

```typescript
// Legacy QE agent IDs (deprecated, use v3-qe-* instead)
const legacyMappings: Record<string, string> = {
  'qe-test-generator': 'v3-qe-tdd-specialist',
  'qe-test-writer': 'v3-qe-tdd-red',
  'qe-test-implementer': 'v3-qe-tdd-green',
  'qe-test-refactorer': 'v3-qe-tdd-refactor',
  'qe-test-executor': 'v3-qe-parallel-executor',
  'qe-flaky-test-hunter': 'v3-qe-flaky-hunter',
  'qe-flaky-investigator': 'v3-qe-flaky-hunter',
  'qe-coverage-analyzer': 'v3-qe-coverage-specialist',
  'qe-coverage-gap-analyzer': 'v3-qe-gap-detector',
  'qe-quality-gate': 'v3-qe-quality-gate',
  'qe-quality-analyzer': 'v3-qe-quality-gate',
  'qe-deployment-readiness': 'v3-qe-deployment-advisor',
  'qe-code-reviewer': 'v3-qe-code-reviewer',
  'qe-code-complexity': 'v3-qe-code-complexity',
  'qe-security-scanner': 'v3-qe-security-scanner',
  'qe-security-auditor': 'v3-qe-security-auditor',
  'qe-api-contract-validator': 'v3-qe-contract-validator',
  'qe-integration-tester': 'v3-qe-integration-tester',
  'qe-visual-tester': 'v3-qe-visual-tester',
  'qe-a11y-ally': 'v3-qe-accessibility-auditor',
  'qe-performance-tester': 'v3-qe-performance-tester',
  'qe-performance-validator': 'v3-qe-performance-tester',
  'qe-chaos-engineer': 'v3-qe-chaos-engineer',
  'qe-test-data-architect': 'v3-qe-tdd-specialist',
  'qe-data-generator': 'v3-qe-tdd-specialist',
  'qe-code-intelligence': 'v3-qe-code-intelligence',
  'qe-requirements-validator': 'v3-qe-requirements-validator',
  'qe-production-intelligence': 'v3-qe-defect-predictor',
  'qe-regression-risk-analyzer': 'v3-qe-regression-analyzer',
  'qe-fleet-commander': 'v3-qe-fleet-commander',
  'qx-partner': 'v3-qe-qx-partner',
};
```

## Consequences

### Positive
- Consistent naming across all V3 QE artifacts
- Clear distinction between V2 and V3 agents
- Better agent routing and discovery
- Improved documentation clarity
- All 47 V3 QE domain agents now use `v3-qe-*` prefix
- 7 V3 QE subagents properly categorized
- Skills files already using correct naming

### Negative
- Breaking change for existing workflows using old `qe-*` names
- Requires updating any remaining references to legacy names

### Mitigation
- Legacy mappings documented for backward compatibility awareness
- Skills already updated to use `v3-qe-*` prefix
- Registry updated with proper naming

## Related ADRs

- ADR-022: Adaptive QE Agent Routing
- ADR-038: V3 QE Memory Unification
- ADR-039: V3 QE MCP Optimization

## Implementation Status

- [x] Updated `v3/src/routing/qe-agent-registry.ts` with V3 QE naming
- [x] Added 47 V3 QE domain agents with `v3-qe-*` prefix
- [x] Added 7 V3 QE subagents section
- [x] Updated `getAgentCounts()` function
- [x] Updated header documentation
- [x] Documented backward compatibility mappings
- [x] Updated ADR-037 with implementation status
