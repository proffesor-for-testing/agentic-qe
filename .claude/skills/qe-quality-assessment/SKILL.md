---
name: "qe-quality-assessment"
description: "Evaluates code quality through complexity analysis, lint results, code smell detection, and test health metrics. Use when assessing deployment readiness, configuring quality gates, scoring a codebase for release, or generating quality reports with pass/fail verdicts."
trust_tier: 3
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
  eval_path: evals/qe-quality-assessment.yaml
---

# QE Quality Assessment

## Purpose

Guide the use of v3's quality assessment capabilities including automated quality gates, metrics aggregation, trend analysis, and deployment readiness evaluation.

## Activation

- When evaluating code quality
- When setting up quality gates
- When assessing deployment readiness
- When tracking quality metrics
- When generating quality reports

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

## Agent Workflow

```typescript
// Comprehensive quality assessment
Task("Assess code quality", `
  Evaluate quality for src/:
  - Code complexity (cyclomatic, cognitive)
  - Test coverage and mutation score
  - Security vulnerabilities
  - Code smells and technical debt
  - Documentation coverage
  Generate quality score and recommendations.
`, "qe-quality-analyzer")

// Deployment readiness check
Task("Check deployment readiness", `
  Evaluate if release v2.1.0 is ready for production:
  - All tests passing
  - Coverage thresholds met
  - No critical vulnerabilities
  - Performance benchmarks passed
  - Documentation updated
  Provide go/no-go recommendation.
`, "qe-deployment-advisor")
```

## Quality Dimensions

### 1. Code Quality Metrics

```typescript
await qualityAnalyzer.assessCode({
  scope: 'src/**/*.ts',
  metrics: {
    complexity: {
      cyclomatic: { max: 15, warn: 10 },
      cognitive: { max: 20, warn: 15 }
    },
    maintainability: {
      index: { min: 65 },
      duplication: { max: 3 }  // percent
    },
    documentation: {
      publicAPIs: { min: 80 },
      complexity: { min: 70 }
    }
  }
});
```

### 2. Quality Gates

```typescript
await qualityGate.evaluate({
  gates: {
    coverage: { min: 80, blocking: true },
    complexity: { max: 15, blocking: false },
    vulnerabilities: { critical: 0, high: 0, blocking: true },
    duplications: { max: 3, blocking: false },
    techDebt: { maxRatio: 5, blocking: false }
  },
  action: {
    onPass: 'proceed',
    onFail: 'block-merge',
    onWarn: 'notify'
  }
});
```

### 3. Deployment Readiness

```typescript
await deploymentAdvisor.assess({
  release: 'v2.1.0',
  criteria: {
    testing: {
      unitTests: 'all-pass',
      integrationTests: 'all-pass',
      e2eTests: 'critical-pass',
      performanceTests: 'baseline-met'
    },
    quality: {
      coverage: 80,
      noNewVulnerabilities: true,
      noRegressions: true
    },
    documentation: {
      changelog: true,
      apiDocs: true,
      releaseNotes: true
    }
  }
});
```

## Quality Score Calculation

```yaml
quality_score:
  components:
    test_coverage:
      weight: 0.25
      metrics: [statement, branch, function]

    code_quality:
      weight: 0.20
      metrics: [complexity, maintainability, duplication]

    security:
      weight: 0.25
      metrics: [vulnerabilities, dependencies]

    reliability:
      weight: 0.20
      metrics: [bug_density, flaky_tests, error_rate]

    documentation:
      weight: 0.10
      metrics: [api_coverage, readme, changelog]

  scoring:
    A: 90-100
    B: 80-89
    C: 70-79
    D: 60-69
    F: 0-59
```

## Quality Dashboard

```typescript
interface QualityDashboard {
  overallScore: number;  // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  dimensions: {
    name: string;
    score: number;
    trend: 'improving' | 'stable' | 'declining';
    issues: Issue[];
  }[];
  gates: {
    name: string;
    status: 'pass' | 'fail' | 'warn';
    value: number;
    threshold: number;
  }[];
  trends: {
    period: string;
    scores: number[];
    alerts: Alert[];
  };
  recommendations: Recommendation[];
}
```

## CI/CD Integration

```yaml
# Quality gate in pipeline
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
    exit_codes:
      - 1  # Warnings only
```

## Run History

After each quality assessment, append results to `run-history.json` in this skill directory:
```bash
node -e "
const fs = require('fs');
const h = JSON.parse(fs.readFileSync('.claude/skills/qe-quality-assessment/run-history.json'));
h.runs.push({date: new Date().toISOString().split('T')[0], gate_result: 'PASS_OR_FAIL', failed_checks: []});
fs.writeFileSync('.claude/skills/qe-quality-assessment/run-history.json', JSON.stringify(h, null, 2));
"
```
Read `run-history.json` before each run — alert if quality gate failed 3 of last 5 runs.

## Skill Composition

- **Before assessment** → Run `/qe-coverage-analysis` and `/mutation-testing` first
- **If issues found** → Use `/test-failure-investigator` to diagnose failures
- **For PR review** → Combine with `/code-review-quality` for comprehensive review

## Gotchas

- NEVER trust agent-reported pass/fail status — 12 test failures were caught that agents claimed were passing (Nagual pattern, reward 0.92)
- Completion theater: agent hardcoded version '3.0.0' instead of reading from package.json — verify actual values in output
- Fix issues in priority waves (P0 → P1 → P2) with verification between each wave — don't fix everything in parallel
- quality-assessment domain has 53.7% success rate — expect failures and have fallback
- If HybridMemoryBackend initialization fails, run `aqe health` to diagnose, or `aqe init` to re-initialize

## Coordination

**Primary Agents**: qe-quality-analyzer, qe-deployment-advisor, qe-metrics-collector
**Coordinator**: qe-quality-coordinator
**Related Skills**: qe-coverage-analysis, security-testing
