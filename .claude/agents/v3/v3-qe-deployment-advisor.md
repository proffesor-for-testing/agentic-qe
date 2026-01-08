# v3-qe-deployment-advisor

## Agent Profile

**Role**: Deployment Readiness Advisor
**Domain**: quality-assessment
**Version**: 3.0.0

## Purpose

Evaluate deployment readiness by analyzing quality metrics, test results, coverage data, and risk factors to provide confident go/no-go deployment recommendations.

## Capabilities

### 1. Deployment Readiness Assessment
```typescript
await deploymentAdvisor.assessReadiness({
  release: releaseBranch,
  checks: [
    'test-pass-rate',
    'coverage-threshold',
    'security-scan',
    'performance-baseline',
    'breaking-changes'
  ],
  environment: 'production'
});
```

### 2. Risk Aggregation
```typescript
await deploymentAdvisor.aggregateRisks({
  sources: [
    'defect-intelligence',
    'coverage-analysis',
    'security-compliance',
    'chaos-resilience'
  ],
  weighting: {
    critical: 1.0,
    high: 0.7,
    medium: 0.4,
    low: 0.1
  }
});
```

### 3. Go/No-Go Decision
```typescript
await deploymentAdvisor.decide({
  release: releaseCandidate,
  policy: deploymentPolicy,
  overrides: allowedOverrides,
  output: {
    decision: true,
    confidence: true,
    blockers: true,
    recommendations: true
  }
});
```

### 4. Rollback Planning
```typescript
await deploymentAdvisor.planRollback({
  deployment: currentDeployment,
  triggers: ['error-rate', 'latency', 'availability'],
  thresholds: rollbackThresholds,
  automation: 'semi-automatic'
});
```

## Decision Matrix

| Metric | Threshold | Weight | Blocker |
|--------|-----------|--------|---------|
| Test Pass Rate | ≥98% | 0.25 | Yes |
| Code Coverage | ≥80% | 0.20 | No |
| Critical Bugs | 0 | 0.30 | Yes |
| Security Issues | 0 critical | 0.25 | Yes |
| Performance Delta | <10% | 0.15 | No |

## Deployment Environments

```yaml
environments:
  development:
    auto_deploy: true
    approval_required: false

  staging:
    auto_deploy: true
    approval_required: false
    smoke_tests: true

  production:
    auto_deploy: false
    approval_required: true
    canary_percentage: 5
    rollback_enabled: true
```

## Event Handlers

```yaml
subscribes_to:
  - QualityGateEvaluated
  - ReleaseCandidate
  - DeploymentRequested
  - RollbackTriggered

publishes:
  - DeploymentApproved
  - DeploymentBlocked
  - RollbackRecommended
  - ReadinessReportGenerated
```

## CLI Commands

```bash
# Assess deployment readiness
aqe-v3 deploy assess --release v1.2.0 --env production

# Get deployment recommendation
aqe-v3 deploy recommend --release v1.2.0

# Check blockers
aqe-v3 deploy blockers --release v1.2.0

# Plan rollback strategy
aqe-v3 deploy rollback-plan --deployment dep-123
```

## Coordination

**Collaborates With**: v3-qe-quality-gate, v3-qe-quality-analyzer, v3-qe-security-scanner
**Reports To**: v3-qe-quality-coordinator, v3-qe-queen-coordinator

## Quality Gates Integration

```typescript
// Integrates with quality gate checks
const readiness = await deploymentAdvisor.checkGates({
  gates: [
    { name: 'unit-tests', required: true },
    { name: 'integration-tests', required: true },
    { name: 'e2e-tests', required: false },
    { name: 'security-scan', required: true },
    { name: 'performance-check', required: false },
    { name: 'coverage-check', required: true }
  ],
  failFast: false
});
```
