# SPEC-045-C: V2 Compatibility Aliases

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-045-C |
| **Parent ADR** | [ADR-045](../adrs/ADR-045-version-agnostic-naming.md) |
| **Version** | 1.0 |
| **Status** | Implemented |
| **Last Updated** | 2026-01-14 |
| **Author** | Migration Analysis Agent |

---

## Overview

This specification documents the V2 agent name aliases for backward compatibility. V2 agents that have equivalent V3 agents are mapped to their new version-agnostic names.

---

## V2 to New Name Mapping

### Direct Aliases

These V2 agent names map directly to their V3 equivalents:

```yaml
v2-aliases:
  qe-test-generator: qe-test-architect
  qe-coverage-analyzer: qe-coverage-specialist
  qe-flaky-test-hunter: qe-flaky-hunter
  qe-test-executor: qe-parallel-executor
  qe-deployment-readiness: qe-deployment-advisor
  qe-api-contract-validator: qe-contract-validator
  qe-regression-risk-analyzer: qe-regression-analyzer
  qe-a11y-ally: qe-accessibility-auditor
```

### Conflicting Names (V3 Inherits)

These names existed in both V2 and V3. V3 agents now use the canonical name:

| Agent Name | V2 Agent | V3 Agent | Resolution |
|------------|----------|----------|------------|
| `qe-quality-gate` | V2 implementation | V3 implementation | V3 inherits name |
| `qe-security-scanner` | V2 implementation | V3 implementation | V3 inherits name |
| `qe-chaos-engineer` | V2 implementation | V3 implementation | V3 inherits name |
| `qe-visual-tester` | V2 implementation | V3 implementation | V3 inherits name |
| `qe-code-intelligence` | V2 implementation | V3 implementation | V3 inherits name |
| `qe-requirements-validator` | V2 implementation | V3 implementation | V3 inherits name |
| `qe-code-complexity` | V2 implementation | V3 implementation | V3 inherits name |
| `qe-performance-tester` | V2 implementation | V3 implementation | V3 inherits name |
| `qe-fleet-commander` | V2 implementation | V3 implementation | V3 inherits name |

### V2-Only Agents (Kept Separate)

These V2 agents have no direct V3 equivalent and retain their original names:

| Agent Name | Description | Status |
|------------|-------------|--------|
| `qe-quality-analyzer` | Quality metrics analysis | Kept as separate agent |
| `qe-production-intelligence` | Production data analysis | Kept as separate agent |
| `qe-test-data-architect` | Test data generation | New agent needed in V3 |

---

## V2 Skills Added to V3

The following V2 QE skills were added to V3 with their original (version-agnostic) names:

| Skill Name | Description |
|------------|-------------|
| `accessibility-testing` | WCAG accessibility testing |
| `tdd-london-chicago` | TDD methodology skills |
| `api-testing-patterns` | API testing patterns |
| `contract-testing` | Consumer-driven contracts |
| `chaos-engineering-resilience` | Chaos engineering |
| `performance-testing` | Load and stress testing |
| `security-testing` | Security vulnerability testing |
| `exploratory-testing-advanced` | Session-based testing |
| `mutation-testing` | Test quality validation |
| `regression-testing` | Regression test selection |

**Total V2 skills added:** 36 QE-related skills

---

## Alias Resolution Logic

```typescript
// Agent alias resolution
function resolveAgentAlias(name: string): string {
  const aliases: Record<string, string> = {
    'qe-test-generator': 'qe-test-architect',
    'qe-coverage-analyzer': 'qe-coverage-specialist',
    'qe-flaky-test-hunter': 'qe-flaky-hunter',
    'qe-test-executor': 'qe-parallel-executor',
    'qe-deployment-readiness': 'qe-deployment-advisor',
    'qe-api-contract-validator': 'qe-contract-validator',
    'qe-regression-risk-analyzer': 'qe-regression-analyzer',
    'qe-a11y-ally': 'qe-accessibility-auditor',
  };

  return aliases[name] || name;
}
```

---

## Naming Convention Comparison

| Aspect | V2 Pattern | V3 Pattern |
|--------|-----------|-----------|
| Prefix | `qe-` | `qe-` |
| Version indicator | None | None (removed v3-) |
| Domain hint | Implicit | Explicit where helpful |
| Function | Varied (`-generator`, `-analyzer`) | Standardized (`-specialist`, `-architect`) |

### Examples

| V2 Name | V3 Name | Notes |
|---------|---------|-------|
| `qe-test-generator` | `qe-test-architect` | Elevated role terminology |
| `qe-coverage-analyzer` | `qe-coverage-specialist` | Consistent -specialist suffix |
| `qe-flaky-test-hunter` | `qe-flaky-hunter` | Simplified |

---

## Implementation Notes

### What Was Implemented

- V2 skill files copied to V3 assets (36 skills)
- Alias resolution available in agent registry
- V2 agents with conflicting names superseded by V3

### What Was Not Implemented (Per User Decision)

- Deprecation warnings when using V2 names
- Automatic V2-to-V3 name translation at runtime
- Backward compatibility symlinks for CLI

---

## Related Specifications

| Spec ID | Title | Relationship |
|---------|-------|--------------|
| [SPEC-045-A](./SPEC-045-A-agent-rename-mapping.md) | Agent Mapping | V3 agent names |
| [SPEC-045-B](./SPEC-045-B-migration-strategy.md) | Migration Strategy | Implementation details |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-14 | Migration Agent | Initial specification |
| 1.0 | 2026-01-20 | Architecture Team | Extracted from ADR-045 |
