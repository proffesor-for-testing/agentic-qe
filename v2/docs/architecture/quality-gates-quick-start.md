# Quality Gates Quick Start Guide

## Overview

CI/CD quality gates automatically evaluate code quality and block deployments that don't meet standards.

## Quick Setup

### 1. Run Quality Gate Locally

```bash
# TypeScript version (recommended)
npx ts-node scripts/quality-gate.ts \
  --min-coverage 80 \
  --min-pass-rate 0.95 \
  --pr-comment

# Bash version (fallback)
bash scripts/quality-gate.sh \
  --min-coverage 80 \
  --min-pass-rate 0.95
```

### 2. Add to GitHub Actions

```yaml
name: CI Pipeline

on: [push, pull_request]

jobs:
  test-and-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci
      - run: npm run build
      - run: npm run test:unit
      - run: npm run test:integration

      - name: Quality Gate
        uses: ./.github/actions/quality-gate
        with:
          min-coverage: '80'
          min-pass-rate: '0.95'
          fail-on-violation: 'true'
```

### 3. Use Dedicated Workflow

The project includes a complete quality gate workflow at `.github/workflows/quality-gate.yml`:

```yaml
# Triggers on push and PR
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]
```

## How It Works

```
Tests Run → Coverage Generated → Quality Gate Evaluates → Deployment Decision
                                          ↓
                                  ControlLoopReporter
                                          ↓
                        ┌─────────────────┴─────────────────┐
                        ↓                                   ↓
                   canDeploy: true                   canDeploy: false
                        ↓                                   ↓
                 ✅ APPROVED                          ❌ BLOCKED
```

## Default Thresholds

| Metric | Threshold | Action if Failed |
|--------|-----------|------------------|
| Test Pass Rate | ≥ 95% | Block deployment |
| Code Coverage | ≥ 80% | Block deployment |
| Critical Vulnerabilities | 0 | Block deployment |
| High Vulnerabilities | ≤ 2 | Block deployment |

## Customizing Thresholds

### Option 1: Command Line

```bash
npx ts-node scripts/quality-gate.ts \
  --min-coverage 85 \
  --min-pass-rate 0.98 \
  --max-critical-vulns 0 \
  --max-high-vulns 1
```

### Option 2: Environment Variables

```bash
export MIN_COVERAGE=85
export MIN_PASS_RATE=0.98
export MAX_CRITICAL_VULNS=0

bash scripts/quality-gate.sh
```

### Option 3: Workflow Inputs

```yaml
- uses: ./.github/actions/quality-gate
  with:
    min-coverage: '85'
    min-pass-rate: '0.98'
    max-critical-vulns: '0'
```

## Outputs

### 1. Control Loop Feedback (JSON)

**File**: `quality-reports/control-loop-feedback.json`

```json
{
  "signals": {
    "canDeploy": false,
    "criticalIssuesFound": true
  },
  "violations": [
    {
      "metric": "coverage",
      "threshold": 80,
      "actualValue": 75.5,
      "severity": "high"
    }
  ]
}
```

### 2. Human-Readable Report

**File**: `quality-reports/quality-report.txt`

```
Quality Gate Report
===================
Status: FAILED
Coverage: 75.5% (threshold: 80%)
Pass Rate: 92% (threshold: 95%)

Deployment Decision: ✗ BLOCKED
```

### 3. PR Comment (if enabled)

Automatically posted to pull requests with detailed metrics and violations.

## Integration with ControlLoopReporter

Quality gates use `ControlLoopReporter` from the reporting system:

```typescript
import { ControlLoopReporter } from '../src/reporting';

const reporter = new ControlLoopReporter({
  minPassRate: 0.95,
  minCoverage: 80
});

const feedback = reporter.report(aggregatedResults);
const canDeploy = feedback.signals.canDeploy;
```

## Monitoring & Alerting

Quality gate results integrate with Prometheus (see `config/alerting-rules.yml`):

```yaml
- alert: QualityGateFailed
  expr: aqe_quality_gate_pass_rate < 1.0
  labels:
    severity: error
  annotations:
    summary: "Quality gate evaluation failed"
```

## Troubleshooting

### No coverage data

```bash
# Ensure coverage is generated
npm run test:coverage

# Check coverage file exists
ls -la coverage/coverage-summary.json
```

### Quality gate script fails

```bash
# Check script is executable
chmod +x scripts/quality-gate.sh

# Run with verbose output
bash -x scripts/quality-gate.sh
```

### GitHub Actions permissions

Ensure workflow has required permissions:

```yaml
permissions:
  contents: read
  pull-requests: write
  checks: write
```

## Examples

### Example 1: Strict Quality Gate

```bash
# 90% coverage, 98% pass rate, zero vulnerabilities
npx ts-node scripts/quality-gate.ts \
  --min-coverage 90 \
  --min-pass-rate 0.98 \
  --max-critical-vulns 0 \
  --max-high-vulns 0
```

### Example 2: Relaxed Quality Gate

```bash
# 70% coverage, 90% pass rate
npx ts-node scripts/quality-gate.ts \
  --min-coverage 70 \
  --min-pass-rate 0.90
```

### Example 3: CI/CD Pipeline with Conditional Deploy

```yaml
jobs:
  quality-gate:
    runs-on: ubuntu-latest
    outputs:
      can-deploy: ${{ steps.gate.outputs.can-deploy }}
    steps:
      - uses: ./.github/actions/quality-gate
        id: gate

  deploy:
    needs: quality-gate
    if: needs.quality-gate.outputs.can-deploy == 'true'
    runs-on: ubuntu-latest
    steps:
      - run: ./deploy.sh
```

## Learn More

- [Full Documentation](/workspaces/agentic-qe-cf/docs/architecture/cicd-quality-gates.md)
- [ControlLoopReporter API](/workspaces/agentic-qe-cf/src/reporting/reporters/ControlLoopReporter.ts)
- [Alerting Rules](/workspaces/agentic-qe-cf/config/alerting-rules.yml)
