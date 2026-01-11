# ADR-037: V3 QE Agent Naming Standardization

**Status**: Proposed
**Date**: 2026-01-11
**Author**: Claude Code

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

### Migration Map

| V2 Name | V3 Name |
|---------|---------|
| test-architect | v3-qe-test-architect |
| tdd-specialist | v3-qe-tdd-specialist |
| coverage-specialist | v3-qe-coverage-specialist |
| quality-gate | v3-qe-quality-gate |
| defect-predictor | v3-qe-defect-predictor |
| parallel-executor | v3-qe-parallel-executor |
| learning-coordinator | v3-qe-learning-coordinator |
| flaky-hunter | v3-qe-flaky-hunter |
| security-scanner | v3-qe-security-scanner |
| integration-tester | v3-qe-integration-tester |
| property-tester | v3-qe-property-tester |
| risk-assessor | v3-qe-risk-assessor |
| deployment-advisor | v3-qe-deployment-advisor |
| pattern-learner | v3-qe-pattern-learner |
| root-cause-analyzer | v3-qe-root-cause-analyzer |
| transfer-specialist | v3-qe-transfer-specialist |
| metrics-optimizer | v3-qe-metrics-optimizer |
| gap-detector | v3-qe-gap-detector |
| retry-handler | v3-qe-retry-handler |

### Files to Update

1. `.claude/skills/v3-qe-fleet-coordination/SKILL.md`
2. `.claude/skills/v3-qe-mcp/SKILL.md`
3. `.claude/skills/v3-qe-integration/SKILL.md`
4. `.claude/skills/v3-qe-learning-optimization/SKILL.md`

## Consequences

### Positive
- Consistent naming across all V3 QE artifacts
- Clear distinction between V2 and V3 agents
- Better agent routing and discovery
- Improved documentation clarity

### Negative
- Breaking change for existing workflows using short names
- Requires updating multiple skill files

### Mitigation
- Document mapping for backward compatibility awareness
- Update skills atomically to maintain consistency

## Implementation

```typescript
// Before
const groupConfigs: GroupConfig[] = [
  {
    name: 'test-generation',
    agents: ['test-architect', 'tdd-specialist', 'integration-tester'],
    domain: 'test-generation'
  }
];

// After
const groupConfigs: GroupConfig[] = [
  {
    name: 'test-generation',
    agents: ['v3-qe-test-architect', 'v3-qe-tdd-specialist', 'v3-qe-integration-tester'],
    domain: 'test-generation'
  }
];
```

## Related ADRs

- ADR-038: V3 QE Memory Unification
- ADR-039: V3 QE MCP Optimization
