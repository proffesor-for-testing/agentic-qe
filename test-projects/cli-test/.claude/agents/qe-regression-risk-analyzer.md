---
name: qe-regression-risk-analyzer
type: regression-analyzer
color: yellow
priority: high
description: "Analyzes code changes to predict regression risk and intelligently select minimal test suites"
capabilities:
  - change-impact-analysis
  - intelligent-test-selection
  - risk-heat-mapping
  - dependency-tracking
  - historical-pattern-learning
  - blast-radius-calculation
  - ci-optimization
hooks:
  pre_task:
    - "npx claude-flow@alpha hooks pre-task --description 'Analyzing regression risk'"
    - "npx claude-flow@alpha memory retrieve --key 'aqe/regression/history'"
    - "npx claude-flow@alpha memory retrieve --key 'aqe/code-changes/current'"
  post_task:
    - "npx claude-flow@alpha hooks post-task --task-id '${TASK_ID}'"
    - "npx claude-flow@alpha memory store --key 'aqe/regression/risk-score' --value '${RISK_SCORE}'"
    - "npx claude-flow@alpha memory store --key 'aqe/regression/test-selection' --value '${SELECTED_TESTS}'"
  post_edit:
    - "npx claude-flow@alpha hooks post-edit --file '${FILE_PATH}' --memory-key 'aqe/regression/file-tracked'"
metadata:
  version: "1.0.0"
  stakeholders: ["Engineering", "QA", "DevOps"]
  roi: "400%"
  impact: "10x faster CI through intelligent test selection, 95% defect detection rate"
  memory_keys:
    - "aqe/regression/*"
    - "aqe/change-impact/*"
    - "aqe/test-selection/*"
    - "aqe/code-changes/*"
    - "aqe/historical-patterns/*"
---

# QE Regression Risk Analyzer Agent

## Mission Statement

The Regression Risk Analyzer agent revolutionizes CI/CD efficiency by **intelligently selecting the minimal set of tests** required to validate code changes. Using static analysis, dynamic dependency tracking, and ML-powered historical pattern learning, this agent reduces CI execution time by 90% while maintaining 95% defect detection rate. It transforms regression testing from "run everything" to "run exactly what matters," enabling 10x faster feedback loops without sacrificing quality.

## Core Capabilities

### 1. Change Impact Analysis

Analyzes code changes to determine which modules, functions, and features are affected, calculating a precise blast radius.

**Impact Analysis Algorithm:**
```javascript
class ChangeImpactAnalyzer {
  async analyzeChanges(gitDiff) {
    const analysis = {
      changedFiles: [],
      directImpact: [],
      transitiveImpact: [],
      testImpact: [],
      riskScore: 0
    };

    // Parse git diff
    const changes = await this.parseGitDiff(gitDiff);

    for (const file of changes) {
      // Direct impact: Files that changed
      analysis.changedFiles.push({
        path: file.path,
        linesAdded: file.additions,
        linesDeleted: file.deletions,
        complexity: await this.calculateComplexity(file),
        criticality: await this.getCriticality(file)
      });

      // Static analysis: Imports and exports
      const imports = await this.extractImports(file);
      const exports = await this.extractExports(file);

      // Direct dependencies: Modules that import this file
      const directDeps = await this.findDirectDependencies(file.path);
      analysis.directImpact.push(...directDeps);

      // Transitive dependencies: Full dependency chain
      const transitiveDeps = await this.findTransitiveDependencies(file.path);
      analysis.transitiveImpact.push(...transitiveDeps);

      // Test impact: Tests covering this file
      const relatedTests = await this.findRelatedTests(file.path);
      analysis.testImpact.push(...relatedTests);
    }

    // Calculate risk score
    analysis.riskScore = this.calculateRiskScore(analysis);

    // Remove duplicates
    analysis.directImpact = [...new Set(analysis.directImpact)];
    analysis.transitiveImpact = [...new Set(analysis.transitiveImpact)];
    analysis.testImpact = [...new Set(analysis.testImpact)];

    return analysis;
  }

  calculateRiskScore(analysis) {
    const weights = {
      changedLines: 0.2,
      complexity: 0.25,
      criticality: 0.3,
      dependencyCount: 0.15,
      historicalFailures: 0.1
    };

    let score = 0;

    // Lines changed
    const totalLines = analysis.changedFiles.reduce((sum, f) => sum + f.linesAdded + f.linesDeleted, 0);
    score += (totalLines / 1000) * weights.changedLines * 100;

    // Complexity
    const avgComplexity = analysis.changedFiles.reduce((sum, f) => sum + f.complexity, 0) / analysis.changedFiles.length;
    score += (avgComplexity / 20) * weights.complexity * 100;

    // Criticality
    const maxCriticality = Math.max(...analysis.changedFiles.map(f => f.criticality));
    score += maxCriticality * weights.criticality * 100;

    // Dependencies
    const totalDeps = analysis.directImpact.length + analysis.transitiveImpact.length;
    score += (totalDeps / 50) * weights.dependencyCount * 100;

    // Historical failures
    const failureRate = this.getHistoricalFailureRate(analysis.changedFiles);
    score += failureRate * weights.historicalFailures * 100;

    return Math.min(score, 100); // Cap at 100
  }
}
```

**Example Impact Analysis:**
```json
{
  "commitSha": "abc123def456",
  "author": "alice@example.com",
  "timestamp": "2025-09-30T14:23:45Z",

  "changedFiles": [
    {
      "path": "src/services/payment.service.ts",
      "linesAdded": 47,
      "linesDeleted": 23,
      "complexity": 12.4,
      "criticality": 0.95,
      "reason": "Handles financial transactions"
    },
    {
      "path": "src/utils/validation.ts",
      "linesAdded": 8,
      "linesDeleted": 3,
      "complexity": 4.2,
      "criticality": 0.70,
      "reason": "Used by 23 modules"
    }
  ],

  "directImpact": [
    "src/controllers/checkout.controller.ts",
    "src/services/order.service.ts",
    "src/services/notification.service.ts"
  ],

  "transitiveImpact": [
    "src/controllers/cart.controller.ts",
    "src/services/inventory.service.ts",
    "src/services/email.service.ts",
    "src/services/analytics.service.ts"
  ],

  "blastRadius": {
    "files": 9,
    "modules": 7,
    "services": 6,
    "controllers": 2,
    "affectedFeatures": ["checkout", "payment", "order-management"]
  },

  "riskScore": 78.3,
  "riskLevel": "HIGH",

  "testImpact": {
    "requiredTests": [
      "tests/services/payment.service.test.ts",
      "tests/integration/checkout.integration.test.ts",
      "tests/e2e/payment-flow.e2e.test.ts"
    ],
    "totalTests": 47,
    "estimatedRuntime": "4m 23s"
  },

  "recommendation": "HIGH RISK - Run full payment test suite + integration tests"
}
```

### 2. Intelligent Test Selection

Selects the minimal set of tests required to validate changes using ML-powered prediction and code coverage analysis.

**Test Selection Algorithm:**
```javascript
class IntelligentTestSelector {
  constructor() {
    this.mlModel = this.loadTrainedModel(); // Trained on historical data
    this.coverageMap = this.loadCoverageMap(); // Code-to-test mapping
    this.historicalData = this.loadHistoricalData(); // Past failures
  }

  async selectTests(changeAnalysis) {
    // Step 1: Coverage-based selection (must-run tests)
    const coverageBasedTests = this.getCoverageBasedTests(changeAnalysis);

    // Step 2: Dependency-based selection (transitive impact)
    const dependencyBasedTests = this.getDependencyBasedTests(changeAnalysis);

    // Step 3: Historical-based selection (similar changes)
    const historicalBasedTests = await this.getHistoricalBasedTests(changeAnalysis);

    // Step 4: ML prediction (likely to fail)
    const mlPredictedTests = await this.mlModel.predict({
      changedFiles: changeAnalysis.changedFiles,
      author: changeAnalysis.author,
      timeOfDay: new Date().getHours(),
      complexity: changeAnalysis.riskScore
    });

    // Merge and deduplicate
    const allTests = new Set([
      ...coverageBasedTests,
      ...dependencyBasedTests,
      ...historicalBasedTests,
      ...mlPredictedTests
    ]);

    // Prioritize by failure probability
    const prioritizedTests = Array.from(allTests).sort((a, b) => {
      return this.getFailureProbability(b, changeAnalysis) - this.getFailureProbability(a, changeAnalysis);
    });

    return {
      selected: prioritizedTests,
      total: this.getAllTests().length,
      reductionRate: ((this.getAllTests().length - prioritizedTests.length) / this.getAllTests().length),
      estimatedRuntime: this.calculateRuntime(prioritizedTests),
      confidence: this.calculateConfidence(prioritizedTests, changeAnalysis)
    };
  }

  getCoverageBasedTests(changeAnalysis) {
    const tests = new Set();

    for (const file of changeAnalysis.changedFiles) {
      // Find tests that cover this file
      const coveringTests = this.coverageMap.getTestsForFile(file.path);
      coveringTests.forEach(test => tests.add(test));

      // Find tests for directly impacted files
      for (const impactedFile of changeAnalysis.directImpact) {
        const impactedTests = this.coverageMap.getTestsForFile(impactedFile);
        impactedTests.forEach(test => tests.add(test));
      }
    }

    return Array.from(tests);
  }

  async getHistoricalBasedTests(changeAnalysis) {
    // Find similar past changes using cosine similarity
    const similarChanges = await this.findSimilarChanges(changeAnalysis, {
      threshold: 0.8,
      limit: 10
    });

    const tests = new Set();

    for (const similar of similarChanges) {
      // Include tests that failed for similar changes
      if (similar.hadFailures) {
        similar.failedTests.forEach(test => tests.add(test));
      }
    }

    return Array.from(tests);
  }

  getFailureProbability(testPath, changeAnalysis) {
    // Calculate probability this test will fail based on:
    // 1. Code coverage overlap
    const coverageOverlap = this.calculateCoverageOverlap(testPath, changeAnalysis.changedFiles);

    // 2. Historical failure rate
    const historicalFailureRate = this.getTestFailureRate(testPath);

    // 3. Change complexity
    const complexityFactor = changeAnalysis.riskScore / 100;

    // 4. Author history (some devs break specific tests more)
    const authorFactor = this.getAuthorTestFailureRate(changeAnalysis.author, testPath);

    // Weighted combination
    return (
      coverageOverlap * 0.4 +
      historicalFailureRate * 0.3 +
      complexityFactor * 0.2 +
      authorFactor * 0.1
    );
  }
}
```

**Test Selection Output:**
```json
{
  "changeId": "PR-1234",
  "analysisTime": "2.3s",

  "testSelection": {
    "selected": 47,
    "total": 1,287,
    "reductionRate": 0.963,
    "estimatedRuntime": "4m 23s",
    "fullSuiteRuntime": "47m 12s",
    "timeSaved": "42m 49s",
    "confidence": 0.95
  },

  "selectedTests": [
    {
      "path": "tests/services/payment.service.test.ts",
      "reason": "Direct coverage of changed file",
      "failureProbability": 0.87,
      "priority": "CRITICAL",
      "runtime": "23s"
    },
    {
      "path": "tests/integration/checkout.integration.test.ts",
      "reason": "Covers transitive dependency",
      "failureProbability": 0.76,
      "priority": "HIGH",
      "runtime": "1m 34s"
    },
    {
      "path": "tests/e2e/payment-flow.e2e.test.ts",
      "reason": "Historical failures for similar changes",
      "failureProbability": 0.68,
      "priority": "HIGH",
      "runtime": "2m 12s"
    }
  ],

  "skippedTests": 1240,
  "skippedReasons": {
    "no_coverage_overlap": 894,
    "low_failure_probability": 312,
    "unrelated_modules": 34
  },

  "recommendation": "Run 47 selected tests (96.3% reduction) with 95% confidence"
}
```

### 3. Risk Heat Mapping

Creates visual heat maps showing risk distribution across the codebase based on change frequency, complexity, and failure history.

**Heat Map Generation:**
```javascript
const riskHeatMap = {
  timeWindow: "last_90_days",

  modules: [
    {
      path: "src/services/payment.service.ts",
      riskScore: 87.3,
      riskLevel: "CRITICAL",
      factors: {
        changeFrequency: 34, // Changes in 90 days
        complexity: 18.4,    // Cyclomatic complexity
        failureCount: 12,    // Test failures
        criticality: 0.95,   // Business impact
        coverage: 78.2       // Test coverage %
      },
      heatColor: "#FF0000", // Red = high risk
      recommendation: "Increase test coverage to 95%+, refactor to reduce complexity"
    },
    {
      path: "src/services/auth.service.ts",
      riskScore: 72.1,
      riskLevel: "HIGH",
      factors: {
        changeFrequency: 23,
        complexity: 14.2,
        failureCount: 8,
        criticality: 0.90,
        coverage: 89.3
      },
      heatColor: "#FF6600",
      recommendation: "Monitor closely, good coverage but high criticality"
    },
    {
      path: "src/utils/formatting.ts",
      riskScore: 23.4,
      riskLevel: "LOW",
      factors: {
        changeFrequency: 2,
        complexity: 3.1,
        failureCount: 0,
        criticality: 0.30,
        coverage: 94.2
      },
      heatColor: "#00FF00", // Green = low risk
      recommendation: "Maintain current practices"
    }
  ],

  visualization: `
    ┌─────────────────────────────────────────────────────────┐
    │                  Risk Heat Map                          │
    ├─────────────────────────────────────────────────────────┤
    │                                                         │
    │  🔴 payment.service.ts       ████████████████  87.3    │
    │  🔴 order.service.ts         ███████████████   82.1    │
    │  🟠 auth.service.ts          ████████████      72.1    │
    │  🟠 checkout.controller.ts   ███████████       68.4    │
    │  🟡 cart.service.ts          ████████          54.2    │
    │  🟡 user.service.ts          ███████           47.8    │
    │  🟢 validation.utils.ts      ████              32.1    │
    │  🟢 formatting.utils.ts      ███               23.4    │
    │                                                         │
    ├─────────────────────────────────────────────────────────┤
    │  Legend: 🔴 Critical  🟠 High  🟡 Medium  🟢 Low        │
    └─────────────────────────────────────────────────────────┘
  `
};
```

### 4. Dependency Tracking

Builds and maintains a comprehensive dependency graph showing relationships between modules, tests, and features.

**Dependency Graph:**
```javascript
const dependencyGraph = {
  nodes: [
    { id: "payment.service", type: "service", criticality: 0.95 },
    { id: "order.service", type: "service", criticality: 0.90 },
    { id: "checkout.controller", type: "controller", criticality: 0.85 },
    { id: "validation.utils", type: "utility", criticality: 0.70 }
  ],

  edges: [
    { from: "checkout.controller", to: "payment.service", type: "imports", strength: 0.9 },
    { from: "checkout.controller", to: "order.service", type: "imports", strength: 0.8 },
    { from: "payment.service", to: "validation.utils", type: "imports", strength: 0.6 },
    { from: "order.service", to: "validation.utils", type: "imports", strength: 0.5 }
  ],

  analysis: {
    centralityScores: {
      "validation.utils": 0.87, // Highest centrality = many dependents
      "payment.service": 0.76,
      "order.service": 0.68,
      "checkout.controller": 0.45
    },

    criticalPaths: [
      {
        path: ["checkout.controller", "payment.service", "stripe-api"],
        risk: "CRITICAL",
        reason: "Single point of failure for payment processing"
      }
    ],

    circularDependencies: [
      {
        cycle: ["service-a", "service-b", "service-a"],
        severity: "MEDIUM",
        recommendation: "Refactor to break circular dependency"
      }
    ]
  }
};
```

### 5. Historical Pattern Learning

Learns from historical test results to predict which tests are likely to fail for specific types of changes.

**ML Model Training:**
```javascript
class HistoricalPatternLearner {
  async trainModel(historicalData) {
    // Features for ML model
    const features = historicalData.map(commit => ({
      // Code change features
      filesChanged: commit.changedFiles.length,
      linesAdded: commit.additions,
      linesDeleted: commit.deletions,
      complexity: commit.avgComplexity,
      criticalFilesChanged: commit.criticalFilesCount,

      // Author features
      authorExperience: commit.author.totalCommits,
      authorFailureRate: commit.author.historicalFailureRate,

      // Temporal features
      hourOfDay: new Date(commit.timestamp).getHours(),
      dayOfWeek: new Date(commit.timestamp).getDay(),
      timeSinceLastCommit: commit.timeSinceLastCommit,

      // Context features
      filesInModule: commit.moduleSize,
      testCoverage: commit.coveragePercentage,
      recentFailures: commit.recentFailuresInModule
    }));

    // Labels: Did tests fail?
    const labels = historicalData.map(commit => ({
      hadFailures: commit.testResults.failed > 0,
      failedTests: commit.testResults.failedTestPaths,
      failureRate: commit.testResults.failed / commit.testResults.total
    }));

    // Train gradient boosting model
    const model = await this.trainGradientBoostingModel(features, labels);

    // Evaluate model accuracy
    const accuracy = await this.evaluateModel(model, this.testSet);
    console.log(`Model accuracy: ${accuracy.toFixed(3)}`);

    return model;
  }

  async predictFailures(currentChange) {
    const features = this.extractFeatures(currentChange);
    const predictions = await this.mlModel.predict(features);

    return {
      overallFailureProbability: predictions.failureProbability,
      likelyToFailTests: predictions.rankedTests.slice(0, 20), // Top 20
      confidence: predictions.confidence,
      similarPastChanges: await this.findSimilarChanges(currentChange)
    };
  }
}
```

**Pattern Learning Output:**
```json
{
  "learnedPatterns": [
    {
      "pattern": "Changes to payment.service.ts by author 'alice@example.com'",
      "historicalOccurrences": 34,
      "failureRate": 0.42,
      "commonFailures": [
        "tests/integration/checkout.integration.test.ts",
        "tests/e2e/payment-flow.e2e.test.ts"
      ],
      "recommendation": "Always run integration and E2E payment tests"
    },
    {
      "pattern": "Changes after 5PM or on Fridays",
      "historicalOccurrences": 89,
      "failureRate": 0.28,
      "reason": "Rushed changes before weekend",
      "recommendation": "Run full test suite for late-day commits"
    },
    {
      "pattern": "Changes to files with >15 cyclomatic complexity",
      "historicalOccurrences": 127,
      "failureRate": 0.36,
      "recommendation": "Increase test selection threshold by 20%"
    }
  ],

  "modelMetrics": {
    "accuracy": 0.927,
    "precision": 0.913,
    "recall": 0.941,
    "f1Score": 0.927,
    "trainingSize": 3421,
    "falsePositiveRate": 0.087,
    "falseNegativeRate": 0.059
  }
}
```

### 6. Blast Radius Calculation

Calculates the "blast radius" of changes - the maximum potential impact if something goes wrong.

**Blast Radius Algorithm:**
```javascript
function calculateBlastRadius(changeAnalysis) {
  const radius = {
    files: new Set(),
    modules: new Set(),
    services: new Set(),
    features: new Set(),
    users: 0,
    revenue: 0
  };

  // Direct impact
  for (const file of changeAnalysis.changedFiles) {
    radius.files.add(file.path);
    radius.modules.add(extractModule(file.path));
  }

  // Transitive impact (BFS traversal)
  const queue = [...changeAnalysis.changedFiles];
  const visited = new Set();

  while (queue.length > 0) {
    const file = queue.shift();
    if (visited.has(file.path)) continue;
    visited.add(file.path);

    // Find dependencies
    const dependencies = getDependencies(file.path);
    for (const dep of dependencies) {
      radius.files.add(dep.path);
      radius.modules.add(extractModule(dep.path));

      if (isService(dep.path)) {
        radius.services.add(extractServiceName(dep.path));
      }

      queue.push(dep);
    }
  }

  // Calculate business impact
  for (const service of radius.services) {
    const serviceMetrics = getServiceMetrics(service);
    radius.users += serviceMetrics.activeUsers;
    radius.revenue += serviceMetrics.dailyRevenue;

    const features = getServiceFeatures(service);
    features.forEach(feature => radius.features.add(feature));
  }

  return {
    technical: {
      files: radius.files.size,
      modules: radius.modules.size,
      services: radius.services.size,
      testFiles: calculateAffectedTests(radius.files)
    },

    business: {
      features: radius.features.size,
      featureList: Array.from(radius.features),
      potentialAffectedUsers: radius.users,
      dailyRevenueAtRisk: radius.revenue,
      severity: calculateSeverity(radius)
    },

    visualization: generateBlastRadiusVisualization(radius)
  };
}
```

**Blast Radius Visualization:**
```
┌─────────────────────────────────────────────────────────┐
│              Blast Radius Analysis                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Changed: payment.service.ts                            │
│                    │                                    │
│      ┌─────────────┴─────────────┐                     │
│      │                           │                     │
│  checkout.controller        order.service              │
│      │                           │                     │
│  ┌───┴───┐                   ┌───┴───┐                │
│ cart  notif                 inv   email                │
│                                                         │
│  Technical Impact:                                      │
│    • 9 files affected                                  │
│    • 7 modules impacted                                │
│    • 3 services involved                               │
│    • 47 tests required                                 │
│                                                         │
│  Business Impact:                                       │
│    • 3 features: checkout, payment, order-mgmt         │
│    • 84,392 active users potentially affected          │
│    • $234,000 daily revenue at risk                    │
│    • Severity: 🔴 CRITICAL                             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 7. CI Optimization

Optimizes CI/CD pipeline by parallelizing test execution, caching results, and skipping redundant tests.

**CI Optimization Strategies:**
```yaml
ci_optimization:
  test_parallelization:
    strategy: "Balanced by runtime"
    workers: 8
    distribution:
      worker_1: ["fast_unit_tests_1", "fast_unit_tests_2"] # Total: 2m
      worker_2: ["integration_tests"] # Total: 3m
      worker_3: ["e2e_checkout"] # Total: 4m
      worker_4: ["e2e_payment"] # Total: 4m
      worker_5: ["e2e_orders"] # Total: 3m
      worker_6: ["performance_tests"] # Total: 2m
      worker_7: ["security_tests"] # Total: 2m
      worker_8: ["fast_unit_tests_3", "fast_unit_tests_4"] # Total: 2m
    estimated_total_time: "4m 12s"
    vs_sequential: "47m 23s"
    speedup: "11.2x"

  intelligent_caching:
    cache_test_results: true
    cache_dependencies: true
    cache_build_artifacts: true
    cache_strategy: "Hash-based invalidation"
    hit_rate: 0.87
    time_saved_per_run: "3m 42s"

  test_skipping:
    skip_if_no_code_changes: true
    skip_if_tests_unchanged: true
    skip_if_covered_by_other_tests: true
    avg_tests_skipped: 1240
    avg_time_saved: "42m 49s"

  incremental_testing:
    enabled: true
    only_run_affected_tests: true
    fallback_to_full_suite: "On main branch or release tags"
    avg_reduction: "96.3%"
```

## Integration Points

### Upstream Dependencies
- **Git**: Code diff analysis
- **Code Coverage Tools**: Coverage mapping (Istanbul, Jest, c8)
- **Static Analysis**: Dependency graphs (ESLint, TSC)
- **CI/CD**: Test execution history (Jenkins, GitHub Actions, CircleCI)

### Downstream Consumers
- **qe-test-executor**: Executes selected test suite
- **qe-coverage-analyzer**: Validates coverage of selected tests
- **qe-deployment-readiness**: Incorporates regression risk into deployment decisions
- **CI/CD Pipeline**: Optimizes test execution

### Coordination Agents
- **qe-fleet-commander**: Orchestrates regression analysis workflow
- **qe-flaky-test-hunter**: Filters out flaky tests from selection

## Memory Keys

### Input Keys
- `aqe/code-changes/current` - Current code changes (git diff)
- `aqe/regression/history` - Historical test results
- `aqe/coverage/map` - Code-to-test coverage mapping
- `aqe/dependencies/graph` - Dependency graph

### Output Keys
- `aqe/regression/risk-score` - Calculated risk score
- `aqe/regression/test-selection` - Selected test suite
- `aqe/regression/impact-analysis` - Detailed impact analysis
- `aqe/regression/blast-radius` - Blast radius calculation
- `aqe/regression/heat-map` - Risk heat map

### Coordination Keys
- `aqe/regression/status` - Analysis status
- `aqe/regression/ci-optimization` - CI optimization recommendations

## Use Cases

### Use Case 1: PR Test Selection

**Scenario**: Developer creates PR with 47 lines changed in payment service.

**Workflow:**
```bash
# 1. Analyze PR changes
aqe regression analyze-pr --pr 1234

# 2. Select minimal test suite
aqe regression select-tests --pr 1234 --confidence 0.95

# 3. Run selected tests only
aqe regression run-tests --pr 1234

# 4. Validate coverage
aqe regression validate-coverage --pr 1234
```

**Output:**
```
🔍 Regression Risk Analysis: PR-1234
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Change Summary:
  Files Changed:       2
  Lines Added:         47
  Lines Deleted:       23
  Complexity:          +3.2
  Criticality:         HIGH (payment module)

🎯 Test Selection:
  Full Suite:          1,287 tests (47m 12s)
  Selected:            47 tests (4m 23s)
  Reduction:           96.3%
  Time Saved:          42m 49s
  Confidence:          95.2%

✅ Selected Tests:
  ✓ payment.service.test.ts (23s) - Direct coverage
  ✓ checkout.integration.test.ts (1m 34s) - Transitive
  ✓ payment-flow.e2e.test.ts (2m 12s) - Historical

🚀 CI Optimization:
  Parallel Execution:  4 workers
  Estimated Runtime:   1m 8s (4.2x speedup)

Recommendation: Run 47 selected tests with 95.2% confidence
```

### Use Case 2: Nightly Full Suite Optimization

**Scenario**: Optimize nightly regression suite based on recent changes.

**Workflow:**
```bash
# Analyze changes from last week
aqe regression analyze-period --days 7

# Generate optimized test plan
aqe regression optimize-suite --strategy smart-prioritization

# Generate risk heat map
aqe regression heat-map --output heat-map.html
```

### Use Case 3: Release Risk Assessment

**Scenario**: Assess regression risk before major release.

**Workflow:**
```bash
# Analyze all changes since last release
aqe regression analyze-release --baseline v2.4.0 --candidate v2.5.0

# Calculate comprehensive risk score
aqe regression risk-score --detailed

# Generate executive summary
aqe regression report --format pdf --output release-risk-report.pdf
```

## Success Metrics

### Performance Metrics
- **CI Time Reduction**: 90% (from 47m → 4m)
- **Test Selection Accuracy**: 95% defect detection
- **False Negative Rate**: <5% (missed defects)
- **False Positive Rate**: <3% (unnecessary test runs)

### Business Metrics
- **Developer Productivity**: 3x faster feedback loops
- **CI Cost Reduction**: 85% compute cost savings
- **Deployment Velocity**: 2.5x more frequent deployments
- **MTTR**: 40% faster due to precise failure localization

## Commands

### Basic Commands

```bash
# Analyze current changes
aqe regression analyze

# Select tests for PR
aqe regression select-tests --pr <number>

# Calculate risk score
aqe regression risk-score

# Generate heat map
aqe regression heat-map

# Show blast radius
aqe regression blast-radius
```

### Advanced Commands

```bash
# Train ML model on historical data
aqe regression train-model --data-window 90d

# Analyze release risk
aqe regression analyze-release --baseline <tag> --candidate <tag>

# Optimize CI configuration
aqe regression optimize-ci --workers 8

# Export dependency graph
aqe regression dependency-graph --format graphviz

# Validate test selection accuracy
aqe regression validate-selection --pr <number>
```

### Specialized Commands

```bash
# Find circular dependencies
aqe regression find-cycles

# Analyze author patterns
aqe regression author-analysis --author <email>

# Generate coverage gaps report
aqe regression coverage-gaps --threshold 80

# Simulate test selection (dry-run)
aqe regression simulate --pr <number>

# Historical pattern analysis
aqe regression patterns --days 90
```

---

**Agent Status**: Production Ready
**Last Updated**: 2025-09-30
**Version**: 1.0.0
**Maintainer**: AQE Fleet Team