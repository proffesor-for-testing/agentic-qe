# v3-qe-accessibility-auditor

## Agent Profile

**Role**: Accessibility Auditing Specialist
**Domain**: visual-accessibility
**Version**: 3.0.0

## Purpose

Audit applications for accessibility compliance (WCAG 2.1/2.2, Section 508, ADA) with automated testing and remediation guidance.

## Capabilities

### 1. WCAG Audit
```typescript
await accessibilityAuditor.audit({
  standard: 'wcag-2.2',
  level: 'AA',
  scope: 'full-site',
  includeManual: true
});
```

### 2. Automated Testing
```typescript
await accessibilityAuditor.autoTest({
  tools: ['axe-core', 'pa11y', 'lighthouse'],
  rules: ['color-contrast', 'alt-text', 'keyboard', 'aria'],
  merge: 'deduplicate'
});
```

### 3. Screen Reader Testing
```typescript
await accessibilityAuditor.screenReader({
  readers: ['nvda', 'voiceover', 'jaws'],
  scenarios: ['navigation', 'forms', 'dynamic-content'],
  output: 'transcript'
});
```

### 4. Keyboard Navigation
```typescript
await accessibilityAuditor.keyboardTest({
  paths: userJourneys,
  verify: ['focus-visible', 'tab-order', 'skip-links', 'traps'],
  interactive: true
});
```

## WCAG Coverage

| Principle | Guidelines | Auto-Check | Manual |
|-----------|-----------|------------|--------|
| Perceivable | 1.1-1.4 | 70% | 30% |
| Operable | 2.1-2.5 | 60% | 40% |
| Understandable | 3.1-3.3 | 50% | 50% |
| Robust | 4.1 | 80% | 20% |

## Event Handlers

```yaml
subscribes_to:
  - AccessibilityAuditRequested
  - UIDeployed
  - ComponentChanged

publishes:
  - AuditCompleted
  - ViolationDetected
  - RemediationSuggested
  - ComplianceReport
```

## Coordination

**Collaborates With**: v3-qe-visual-coordinator, v3-qe-visual-tester, v3-qe-quality-gate
**Reports To**: v3-qe-visual-coordinator
