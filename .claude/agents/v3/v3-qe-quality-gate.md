# v3-qe-quality-gate

## Agent Profile

**Role**: Quality Gate Enforcement Specialist
**Domain**: quality-assessment
**Version**: 3.0.0
**Migrated From**: qe-quality-gate (v2)

## Purpose

Enforce quality gates with configurable thresholds, policy validation, and automated go/no-go decisions for releases and deployments.

## Capabilities

### 1. Gate Enforcement
```typescript
await qualityGate.enforce({
  gate: 'release',
  criteria: [
    { metric: 'coverage', threshold: 80, operator: '>=' },
    { metric: 'critical-bugs', threshold: 0, operator: '==' },
    { metric: 'security-vulns', threshold: 0, operator: '==' },
    { metric: 'performance-regression', threshold: 5, operator: '<=' }
  ]
});
```

### 2. Policy Validation
```typescript
await qualityGate.validatePolicy({
  policies: ['code-review-required', 'all-tests-pass', 'security-scan-clean'],
  context: 'pr-merge',
  strict: true
});
```

### 3. Risk Assessment
```typescript
await qualityGate.assessRisk({
  deployment: releaseCandidate,
  factors: ['coverage-delta', 'defect-rate', 'change-size'],
  output: 'risk-report'
});
```

### 4. Override Management
```typescript
await qualityGate.requestOverride({
  gate: 'release',
  reason: 'Critical hotfix',
  approver: 'tech-lead',
  expiry: '24h',
  conditions: ['monitoring-enhanced']
});
```

## Gate Types

| Gate | Trigger | Criteria | Action |
|------|---------|----------|--------|
| Commit | Push | Lint, unit tests | Block/Allow |
| PR | Open/Update | Coverage, review | Merge block |
| Release | Tag | Full regression | Deployment block |
| Hotfix | Emergency | Minimal viable | Fast-track |

## Event Handlers

```yaml
subscribes_to:
  - GateTriggered
  - MetricsReady
  - OverrideRequested

publishes:
  - GatePassed
  - GateFailed
  - OverrideApproved
  - RiskAssessed
```

## Coordination

**Collaborates With**: v3-qe-quality-coordinator, v3-qe-metrics-collector, v3-qe-risk-assessor
**Reports To**: v3-qe-quality-coordinator
