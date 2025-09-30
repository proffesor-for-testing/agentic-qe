# Quality Gates Guide

Learn how to implement intelligent quality gates that automatically assess code quality and block bad code from production.

## Overview

Quality gates are automated checks that ensure code meets your quality standards before deployment. AQE's quality gate system uses AI to:

- **Assess code quality** across multiple dimensions
- **Calculate risk scores** for deployment decisions
- **Enforce quality thresholds** automatically
- **Generate actionable reports** with specific improvements
- **Integrate with CI/CD** pipelines seamlessly

**Key Features:**
- Multi-dimensional quality assessment
- AI-powered risk scoring
- Customizable criteria and thresholds
- Real-time quality monitoring
- Automated pass/fail decisions

## What Quality Gates Check

### 1. Test Coverage

Ensures adequate test coverage across your codebase.

**Criteria:**
- Line coverage ≥ 95%
- Branch coverage ≥ 90%
- Function coverage ≥ 95%
- No critical gaps in high-risk code

### 2. Test Quality

Validates that tests are reliable and effective.

**Criteria:**
- Pass rate ≥ 98%
- Flaky test rate < 5%
- Tests have proper assertions
- No disabled/skipped critical tests

### 3. Code Quality

Checks code maintainability and best practices.

**Criteria:**
- No critical code smells
- Complexity within acceptable limits
- Proper error handling
- Documentation present

### 4. Security

Identifies security vulnerabilities and risks.

**Criteria:**
- No high/critical vulnerabilities
- Authentication properly tested
- Input validation covered
- Secrets not hardcoded

### 5. Performance

Ensures performance requirements are met.

**Criteria:**
- No performance regressions
- Response times within limits
- Memory usage acceptable
- Load test benchmarks passed

## Basic Quality Gate

### Run Quality Check

```bash
aqe analyze quality
```

**Output:**
```
🎯 Running Quality Gate Assessment...

Quality Score: 82/100 (PASS)

✅ Coverage: 93.5% (target: 90%)
   └─> Line: 93.5% ✓
   └─> Branch: 91.2% ✓
   └─> Function: 96.8% ✓

✅ Test Quality: 96.3 (target: 85)
   └─> Pass rate: 98.3% ✓
   └─> Flakiness: 2.5% ✓
   └─> Assertions: All tests have assertions ✓

⚠️  Code Quality: 78.5 (target: 80)
   └─> Complexity: 3 files exceed threshold ⚠️
   └─> Documentation: 5 functions lack docs ⚠️

✅ Security: PASS
   └─> No vulnerabilities detected ✓
   └─> Authentication covered ✓

✅ QUALITY GATE PASSED

💡 Recommendations:
   1. Reduce complexity in 3 files
   2. Add documentation to 5 functions
   3. Consider improving coverage to 95%
```

### Quality Gate Failure

```bash
aqe analyze quality
```

**Output:**
```
🎯 Running Quality Gate Assessment...

Quality Score: 68/100 (FAIL)

❌ Coverage: 78.5% (target: 90%)
   └─> Line: 78.5% ✗ (below threshold)
   └─> Branch: 72.1% ✗ (below threshold)
   └─> Function: 85.2% ✗ (below threshold)

⚠️  Test Quality: 82.3 (target: 85)
   └─> Pass rate: 94.2% ⚠️
   └─> Flakiness: 8.5% ⚠️ (3 flaky tests)

✅ Code Quality: 85.2 (target: 80)

❌ Security: FAIL
   └─> 2 high vulnerabilities detected ✗
   └─> Authentication not fully tested ✗

❌ QUALITY GATE FAILED

Critical Issues:
   1. Coverage below 90% threshold
   2. 2 high-severity security vulnerabilities
   3. Authentication tests incomplete
   4. 3 flaky tests affecting reliability

Required Actions:
   ✓ Fix security vulnerabilities (CRITICAL)
   ✓ Increase coverage to 90%
   ✓ Complete authentication tests
   ✓ Fix or remove flaky tests
```

## Custom Quality Criteria

### Define Custom Thresholds

Create a quality gate configuration:

```javascript
// aqe-quality-gate.config.js
module.exports = {
  thresholds: {
    coverage: {
      line: 95,        // 95% line coverage required
      branch: 90,      // 90% branch coverage required
      function: 95,    // 95% function coverage required
      statement: 95    // 95% statement coverage required
    },
    testQuality: {
      passRate: 98,           // 98% tests must pass
      flakinessRate: 5,       // Max 5% flaky tests
      minAssertions: 1,       // At least 1 assertion per test
      maxExecutionTime: 30000 // Max 30s per test
    },
    codeQuality: {
      maxComplexity: 10,      // Max cyclomatic complexity
      maxFileLength: 500,     // Max lines per file
      maxFunctionLength: 50,  // Max lines per function
      minDocumentation: 80    // 80% functions documented
    },
    security: {
      allowedVulnerabilities: {
        critical: 0,  // No critical vulnerabilities
        high: 0,      // No high vulnerabilities
        medium: 5,    // Max 5 medium vulnerabilities
        low: 10       // Max 10 low vulnerabilities
      }
    },
    performance: {
      maxResponseTime: 200,    // Max 200ms response time (p95)
      maxMemoryUsage: 512,     // Max 512MB memory
      allowedRegression: 5     // Max 5% performance regression
    }
  },
  scoring: {
    weights: {
      coverage: 30,      // 30% of total score
      testQuality: 25,   // 25% of total score
      codeQuality: 20,   // 20% of total score
      security: 15,      // 15% of total score
      performance: 10    // 10% of total score
    },
    passThreshold: 80    // Need 80/100 to pass
  }
};
```

### Use Custom Config

```bash
aqe analyze quality --config aqe-quality-gate.config.js
```

## Risk Scoring

### How Risk Scores Work

AQE calculates a deployment risk score (0-100):

- **0-20: Low Risk** ✅ - Safe to deploy
- **21-40: Medium Risk** ⚠️ - Review before deploying
- **41-60: High Risk** ⚠️ - Proceed with caution
- **61-100: Critical Risk** ❌ - Do not deploy

**Risk Factors:**
1. Test coverage gaps in critical code
2. Security vulnerabilities
3. Failing or flaky tests
4. Performance regressions
5. Code complexity issues
6. Lack of documentation

### Check Deployment Risk

```bash
aqe analyze risk
```

**Output:**
```
🎲 Deployment Risk Assessment:

Risk Score: 35/100 (Medium Risk)

Risk Breakdown:
  Coverage Risk:     20/100 (Low)
  Security Risk:     45/100 (Medium)
  Quality Risk:      30/100 (Low)
  Performance Risk:  40/100 (Medium)

Medium Risk Areas:
  1. Authentication service (78% coverage)
     └─> Risk: Security bypass potential
     └─> Impact: HIGH
     └─> Recommendation: Add security tests

  2. Payment processing (3 flaky tests)
     └─> Risk: Intermittent payment failures
     └─> Impact: HIGH
     └─> Recommendation: Stabilize tests

⚠️  PROCEED WITH CAUTION
   - Review medium-risk areas before deployment
   - Consider hotfix plan for authentication
   - Monitor payment processing closely
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Quality Gate

on: [pull_request]

jobs:
  quality-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install Dependencies
        run: npm install

      - name: Run Tests with Coverage
        run: aqe run --coverage

      - name: Quality Gate Check
        run: aqe analyze quality --config aqe-quality-gate.config.js

      - name: Upload Quality Report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: quality-report
          path: quality-report.html

      - name: Comment on PR
        if: failure()
        uses: actions/github-script@v6
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '❌ Quality Gate Failed. Check the [quality report](../artifacts/quality-report.html).'
            })
```

### GitLab CI Example

```yaml
quality-gate:
  stage: test
  script:
    - npm install
    - aqe run --coverage
    - aqe analyze quality --config aqe-quality-gate.config.js
  artifacts:
    when: always
    reports:
      junit: test-results/junit.xml
    paths:
      - quality-report.html
  allow_failure: false
```

### Jenkins Example

```groovy
pipeline {
  agent any
  stages {
    stage('Test') {
      steps {
        sh 'npm install'
        sh 'aqe run --coverage'
      }
    }
    stage('Quality Gate') {
      steps {
        sh 'aqe analyze quality --config aqe-quality-gate.config.js'
      }
    }
  }
  post {
    always {
      publishHTML([
        reportDir: '.',
        reportFiles: 'quality-report.html',
        reportName: 'Quality Report'
      ])
    }
    failure {
      emailext (
        subject: "Quality Gate Failed: ${env.JOB_NAME}",
        body: "Quality gate failed. Review the report.",
        to: "${env.CHANGE_AUTHOR_EMAIL}"
      )
    }
  }
}
```

## Quality Gate Strategies

### Strategy 1: Strict Gate (Production)

**Use for:** Production deployments, critical systems

**Configuration:**
```javascript
{
  thresholds: {
    coverage: { line: 95, branch: 90 },
    testQuality: { passRate: 99, flakinessRate: 2 },
    security: { allowedVulnerabilities: { critical: 0, high: 0 } }
  },
  scoring: { passThreshold: 85 }
}
```

**Characteristics:**
- High coverage requirements
- Zero tolerance for critical/high vulnerabilities
- Minimal flakiness allowed
- Strict pass threshold

### Strategy 2: Balanced Gate (Staging)

**Use for:** Staging environments, regular releases

**Configuration:**
```javascript
{
  thresholds: {
    coverage: { line: 90, branch: 85 },
    testQuality: { passRate: 97, flakinessRate: 5 },
    security: { allowedVulnerabilities: { critical: 0, high: 1 } }
  },
  scoring: { passThreshold: 75 }
}
```

**Characteristics:**
- Moderate coverage requirements
- Some flexibility on non-critical vulnerabilities
- Reasonable flakiness tolerance
- Moderate pass threshold

### Strategy 3: Lenient Gate (Development)

**Use for:** Development branches, feature work

**Configuration:**
```javascript
{
  thresholds: {
    coverage: { line: 80, branch: 75 },
    testQuality: { passRate: 95, flakinessRate: 10 },
    security: { allowedVulnerabilities: { critical: 0, high: 2, medium: 10 } }
  },
  scoring: { passThreshold: 65 }
}
```

**Characteristics:**
- Lower coverage requirements
- More vulnerability tolerance
- Higher flakiness tolerance
- Lower pass threshold

## Practical Examples

### Example 1: Pre-Deployment Check

```bash
#!/bin/bash
# pre-deploy.sh

echo "Running pre-deployment quality checks..."

# Run full test suite
aqe run --coverage --parallel 8

# Quality gate check
aqe analyze quality --config production-quality-gate.config.js

if [ $? -eq 0 ]; then
  echo "✅ Quality gate passed - Ready for deployment"
  exit 0
else
  echo "❌ Quality gate failed - Deployment blocked"
  echo "Review quality-report.html for details"
  exit 1
fi
```

### Example 2: Pull Request Quality Check

```bash
#!/bin/bash
# pr-quality-check.sh

# Run tests for changed files only
CHANGED_FILES=$(git diff --name-only origin/main...HEAD | grep ".ts$")

# Generate tests for new files
for file in $CHANGED_FILES; do
  aqe generate $file --coverage 95
done

# Run quality gate
aqe analyze quality --config pr-quality-gate.config.js

# Generate PR comment with results
aqe analyze quality --format markdown --output pr-comment.md
```

### Example 3: Progressive Quality Improvement

**Month 1: Baseline**
```javascript
// quality-gate-v1.config.js
{ coverage: { line: 70 }, passThreshold: 60 }
```

**Month 2: Improve**
```javascript
// quality-gate-v2.config.js
{ coverage: { line: 80 }, passThreshold: 70 }
```

**Month 3: Target**
```javascript
// quality-gate-v3.config.js
{ coverage: { line: 90 }, passThreshold: 80 }
```

## Troubleshooting

### Quality Gate Always Failing

**Problem:** Gate fails consistently

**Solutions:**
1. Check current metrics: `aqe analyze quality --detailed`
2. Adjust thresholds to realistic values
3. Generate tests to improve coverage: `aqe analyze gaps`
4. Fix security vulnerabilities: `aqe analyze security`

### Inconsistent Results

**Problem:** Gate passes/fails randomly

**Solutions:**
1. Fix flaky tests: `aqe analyze quality --path tests/`
2. Stabilize test data
3. Increase retry count: `aqe run --retry 3`

### CI/CD Integration Issues

**Problem:** Quality gate doesn't block deployment

**Solutions:**
1. Ensure exit code checked: `if [ $? -ne 0 ]; then exit 1; fi`
2. Set `allow_failure: false` in CI config
3. Verify quality gate config is correct

## Best Practices

1. **Start with lenient gates** - Gradually tighten over time
2. **Different gates for different environments** - Strict for prod, lenient for dev
3. **Monitor quality trends** - Track improvements over time
4. **Review failures quickly** - Don't let quality debt accumulate
5. **Make gates visible** - Display status in PRs and dashboards
6. **Balance strictness with velocity** - Don't block all progress
7. **Automate remediation** - Use AQE to fix issues automatically

## Next Steps

- **Learn about performance testing** → [PERFORMANCE-TESTING.md](./PERFORMANCE-TESTING.md)
- **Improve coverage** → [COVERAGE-ANALYSIS.md](./COVERAGE-ANALYSIS.md)
- **Optimize test suite** → See `aqe optimize` command

## Related Commands

```bash
aqe analyze quality --help    # Full command reference
aqe analyze risk              # Check deployment risk
aqe analyze coverage          # Coverage analysis
aqe analyze security          # Security scan
aqe status                    # Check quality gate agent status
```
