# SPEC-041-A: Interactive Wizards

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-041-A |
| **Parent ADR** | [ADR-041](../adrs/ADR-041-v3-qe-cli-enhancement.md) |
| **Version** | 1.0 |
| **Status** | Implemented |
| **Last Updated** | 2026-01-14 |
| **Author** | Claude Code |

---

## Overview

This specification defines the four interactive wizards for the QE CLI: test generation, coverage analysis, fleet initialization, and security scanning.

---

## Wizard Commands

### Test Generation Wizard

```bash
aqe test generate --wizard
# Prompts for:
# - Source file(s) to test
# - Test type (unit/integration/e2e)
# - Coverage target (%)
# - Framework preference
# - AI enhancement level
```

### Coverage Analysis Wizard

```bash
aqe coverage analyze --wizard
# Prompts for:
# - Target directory
# - Gap detection sensitivity
# - Report format
# - Priority focus areas
```

### Fleet Initialization Wizard

```bash
aqe fleet init --wizard
# Prompts for:
# - Topology type
# - Agent count
# - Domain focus
# - Memory allocation
```

### Security Scan Wizard

```bash
aqe security scan --wizard
# Prompts for:
# - Scan type (SAST/DAST/both)
# - Target paths
# - Severity threshold
# - Report format
```

---

## Configuration

```typescript
const QE_CLI_CONFIG = {
  wizards: {
    enabled: true,
    themes: ['default', 'minimal', 'detailed'],
    defaultTheme: 'default'
  }
};
```

---

## Security Hardening

| Protection | Implementation |
|------------|----------------|
| Path traversal | Validation in test-wizard.ts |
| File size limits | YAML: 10K lines, JSON: 10MB |
| Prototype pollution | deepMerge() protection |
| Scheduler paths | home/cwd/tmp only |

---

## Implementation Files

| File | LOC | Description |
|------|-----|-------------|
| `test-wizard.ts` | ~700 | Test generation wizard |
| `coverage-wizard.ts` | ~500 | Coverage analysis wizard |
| `fleet-wizard.ts` | ~600 | Fleet initialization wizard |
| `security-wizard.ts` | ~450 | Security scan wizard |
| **Total** | 2715 | All wizards combined |

---

## Test Coverage

- 182 tests for interactive wizards
- All security validations tested
- Edge case handling verified

---

## Validation Rules

| Rule ID | Description | Severity |
|---------|-------------|----------|
| SPEC-041-A-001 | Wizard must validate all user inputs | Error |
| SPEC-041-A-002 | Path inputs must be sanitized | Error |
| SPEC-041-A-003 | Timeout must be enforced for prompts | Warning |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-14 | Claude Code | Initial specification |

---

## References

- [Parent ADR](../adrs/ADR-041-v3-qe-cli-enhancement.md)
