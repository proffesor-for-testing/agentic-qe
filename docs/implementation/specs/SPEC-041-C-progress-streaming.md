# SPEC-041-C: Progress Indicators and Streaming

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-041-C |
| **Parent ADR** | [ADR-041](../adrs/ADR-041-v3-qe-cli-enhancement.md) |
| **Version** | 1.0 |
| **Status** | Implemented |
| **Last Updated** | 2026-01-14 |
| **Author** | Claude Code |

---

## Overview

This specification defines the progress indicator and streaming output systems for real-time feedback during CLI operations.

---

## Progress Indicators

### Multi-Bar Progress Display

```
Fleet Progress ----[========================================]---- 100%

Agent Progress:
  qe-test-architect     ----[============================]---- 100% OK
  qe-coverage-specialist ----[============================]---- 100% OK
  qe-quality-gate        ----[============================]---- 100% OK
  qe-security-scanner    ----[=======================     ]----  78% ...
  qe-defect-predictor    ----[==================          ]----  65% ...

ETA: 12s | Tests: 847/1171 | Coverage: 87.3%
```

---

## Streaming Test Output

```bash
$ aqe test execute --stream

OK UserService.test.ts
  OK should create user (12ms)
  OK should validate email (3ms)
  OK should hash password (8ms)

OK AuthService.test.ts
  OK should authenticate user (15ms)
  OK should refresh token (5ms)
  -- should handle MFA (skipped)

FAIL PaymentService.test.ts
  OK should process payment (23ms)
  FAIL should handle declined card (45ms)
    Expected: "DECLINED"
    Received: undefined

Tests: 8 passed, 1 failed, 1 skipped
Time:  1.234s
```

---

## Configuration

```typescript
const QE_CLI_CONFIG = {
  progress: {
    style: 'multi-bar',
    updateIntervalMs: 100,
    showETA: true,
    colors: true
  },

  streaming: {
    enabled: true,
    bufferSize: 100,
    updateIntervalMs: 50
  }
};
```

---

## Performance Targets

| Metric | Current | Target | Achieved |
|--------|---------|--------|----------|
| Startup time | ~1.2s | <400ms | Yes |
| Completion response | ~300ms | <50ms | Yes |
| Progress update rate | 1/s | 10/s | Yes |
| Wizard navigation | ~200ms/step | <50ms/step | Yes |

---

## Implementation Files

| File | LOC | Description |
|------|-----|-------------|
| `progress.ts` | ~250 | Multi-bar progress system |
| `streaming.ts` | ~200 | Real-time output streaming |

---

## Test Coverage

- 34 tests for progress indicators
- 40 tests for streaming output
- Performance benchmarks included

---

## Validation Rules

| Rule ID | Description | Severity |
|---------|-------------|----------|
| SPEC-041-C-001 | Progress updates must not exceed 100Hz | Warning |
| SPEC-041-C-002 | ETA calculation must handle edge cases | Warning |
| SPEC-041-C-003 | Streaming must handle backpressure | Error |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-14 | Claude Code | Initial specification |

---

## References

- [Parent ADR](../adrs/ADR-041-v3-qe-cli-enhancement.md)
