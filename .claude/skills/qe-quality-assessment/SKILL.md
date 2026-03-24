---
name: "qe-quality-assessment"
description: "Evaluate code quality, configure quality gates, assess deployment readiness, and generate quality reports with scoring. Use when checking if a release is ready to ship or setting up quality thresholds."
---

# QE Quality Assessment

Automated quality gates, metrics aggregation, trend analysis, and deployment readiness evaluation.

## Quick Start

```bash
# Run quality assessment
aqe quality assess --scope src/ --gates all

# Check deployment readiness
aqe quality deploy-ready --environment production

# Generate quality report
aqe quality report --format dashboard --period 30d

# Compare quality between releases
aqe quality compare --from v1.0 --to v2.0
```

## Workflow

### Step 1: Assess Code Quality

```typescript
await qualityAnalyzer.assessCode({
  scope: 'src/**/*.ts',
  metrics: {
    complexity: { cyclomatic: { max: 15, warn: 10 }, cognitive: { max: 20, warn: 15 } },
    maintainability: { index: { min: 65 }, duplication: { max: 3 } },
    documentation: { publicAPIs: { min: 80 }, complexity: { min: 70 } }
  }
});
```

**Checkpoint:** Review complexity hotspots before proceeding.

### Step 2: Evaluate Quality Gates

```typescript
await qualityGate.evaluate({
  gates: {
    coverage: { min: 80, blocking: true },
    complexity: { max: 15, blocking: false },
    vulnerabilities: { critical: 0, high: 0, blocking: true },
    duplications: { max: 3, blocking: false },
    techDebt: { maxRatio: 5, blocking: false }
  },
  action: { onPass: 'proceed', onFail: 'block-merge', onWarn: 'notify' }
});
```

### Step 3: Assess Deployment Readiness

```typescript
await deploymentAdvisor.assess({
  release: 'v2.1.0',
  criteria: {
    testing: { unitTests: 'all-pass', integrationTests: 'all-pass', e2eTests: 'critical-pass', performanceTests: 'baseline-met' },
    quality: { coverage: 80, noNewVulnerabilities: true, noRegressions: true },
    documentation: { changelog: true, apiDocs: true, releaseNotes: true }
  }
});
```

## Quality Score Calculation

| Component | Weight | Metrics |
|-----------|--------|---------|
| Test Coverage | 25% | Statement, branch, function |
| Code Quality | 20% | Complexity, maintainability, duplication |
| Security | 25% | Vulnerabilities, dependencies |
| Reliability | 20% | Bug density, flaky tests, error rate |
| Documentation | 10% | API coverage, readme, changelog |

**Grades:** A (90-100), B (80-89), C (70-79), D (60-69), F (0-59)

## CI/CD Integration

```yaml
quality_check:
  stage: verify
  script:
    - aqe quality assess --gates all --output report.json
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  artifacts:
    reports:
      quality: report.json
  allow_failure:
    exit_codes: [1]  # Warnings only
```

## Run History

After each assessment, append results to `run-history.json`:

```bash
node -e "
const fs = require('fs');
const h = JSON.parse(fs.readFileSync('.claude/skills/qe-quality-assessment/run-history.json'));
h.runs.push({date: new Date().toISOString().split('T')[0], gate_result: 'PASS_OR_FAIL', failed_checks: []});
fs.writeFileSync('.claude/skills/qe-quality-assessment/run-history.json', JSON.stringify(h, null, 2));
"
```

Read `run-history.json` before each run -- alert if quality gate failed 3 of last 5 runs.

## Skill Composition

- **Before assessment** -> Run `/qe-coverage-analysis` and `/mutation-testing` first
- **If issues found** -> Use `/test-failure-investigator` to diagnose failures
- **For PR review** -> Combine with `/code-review-quality` for comprehensive review

## Gotchas

- NEVER trust agent-reported pass/fail -- 12 test failures were caught that agents claimed passing (Nagual pattern, reward 0.92)
- Completion theater: agent hardcoded version '3.0.0' instead of reading from package.json -- verify actual values
- Fix issues in priority waves (P0 -> P1 -> P2) with verification between each wave
- quality-assessment domain has 53.7% success rate -- expect failures and have fallback
- If HybridMemoryBackend fails, run `npx ruflo doctor --fix` first

## Coordination

**Primary Agents**: qe-quality-analyzer, qe-deployment-advisor, qe-metrics-collector
**Related Skills**: qe-coverage-analysis, security-testing
