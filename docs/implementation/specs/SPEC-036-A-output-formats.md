# SPEC-036-A: Output Format Matrix

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-036-A |
| **Parent ADR** | [ADR-036](../adrs/ADR-036-result-persistence.md) |
| **Version** | 1.0 |
| **Status** | Implemented |
| **Last Updated** | 2026-01-10 |
| **Author** | Architecture Team |

---

## Overview

This specification defines the output format matrix for result persistence, mapping each task type to its primary and secondary output formats.

---

## Output Format Matrix

| Task Type | Primary Format | Secondary Format | Extension Pattern |
|-----------|---------------|------------------|-------------------|
| Test Generation | Source Code | JSON manifest | Language-specific |
| Coverage Analysis | LCOV | JSON + HTML | `.lcov`, `.json`, `.html` |
| Security Scan | SARIF | JSON + MD report | `.sarif`, `.json`, `.md` |
| Quality Assessment | JSON | MD report | `.json`, `.md` |
| Code Indexing | JSON graph | GraphML | `.json`, `.graphml` |
| Defect Prediction | JSON | MD report | `.json`, `.md` |
| Contract Testing | JSON | OpenAPI diff | `.json`, `.yaml` |
| Accessibility | JSON | HTML report | `.json`, `.html` |
| Chaos/Load Test | JSON | HTML dashboard | `.json`, `.html` |

---

## Test File Extensions by Language/Framework

```typescript
const TEST_FILE_PATTERNS: Record<string, Record<string, string>> = {
  typescript: {
    jest: '.test.ts',
    vitest: '.test.ts',
    mocha: '.spec.ts',
    default: '.test.ts',
  },
  javascript: {
    jest: '.test.js',
    vitest: '.test.js',
    mocha: '.spec.js',
    default: '.test.js',
  },
  python: {
    pytest: 'test_*.py',
    unittest: '*_test.py',
    default: 'test_*.py',
  },
  java: {
    junit: '*Test.java',
    testng: '*Test.java',
    default: '*Test.java',
  },
  go: {
    testing: '*_test.go',
    default: '*_test.go',
  },
  rust: {
    cargo: '*_test.rs',
    default: '*_test.rs',
  },
  ruby: {
    rspec: '*_spec.rb',
    minitest: '*_test.rb',
    default: '*_spec.rb',
  },
  php: {
    phpunit: '*Test.php',
    pest: '*.test.php',
    default: '*Test.php',
  },
  csharp: {
    xunit: '*Tests.cs',
    nunit: '*Tests.cs',
    mstest: '*Tests.cs',
    default: '*Tests.cs',
  },
  kotlin: {
    junit: '*Test.kt',
    kotest: '*Spec.kt',
    default: '*Test.kt',
  },
  swift: {
    xctest: '*Tests.swift',
    default: '*Tests.swift',
  },
};
```

---

## Directory Structure

```
.agentic-qe/
+-- results/
|   +-- security/
|   |   +-- 2026-01-10T15-30-00_scan.sarif
|   |   +-- 2026-01-10T15-30-00_scan.json
|   |   +-- 2026-01-10T15-30-00_report.md
|   +-- coverage/
|   |   +-- 2026-01-10T15-30-00_coverage.lcov
|   |   +-- 2026-01-10T15-30-00_coverage.json
|   |   +-- 2026-01-10T15-30-00_gaps.md
|   +-- quality/
|   |   +-- 2026-01-10T15-30-00_assessment.json
|   |   +-- 2026-01-10T15-30-00_report.md
|   +-- tests/
|   |   +-- generated/
|   |   |   +-- user-service.test.ts
|   |   |   +-- test_auth_module.py
|   |   |   +-- PaymentTest.java
|   |   +-- manifest.json
|   +-- index.json  # Index of all results
```

---

## Validation Rules

| Rule ID | Description | Severity |
|---------|-------------|----------|
| SPEC-036-A-001 | Primary format must always be generated | Error |
| SPEC-036-A-002 | Test files must match language conventions | Warning |
| SPEC-036-A-003 | SARIF must conform to 2.1.0 schema | Error |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-10 | Architecture Team | Initial specification |

---

## References

- [Parent ADR](../adrs/ADR-036-result-persistence.md)
- [SARIF Spec](https://sarifweb.azurewebsites.net/)
- [LCOV Format](https://github.com/linux-test-project/lcov)
