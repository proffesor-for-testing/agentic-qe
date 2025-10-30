# Complete Testing Workflow with MCP Tools

Comprehensive guide to building end-to-end testing workflows using Agentic QE MCP tools.

---

## Table of Contents

1. [Overview](#overview)
2. [Basic Workflow](#basic-workflow)
3. [Advanced Patterns](#advanced-patterns)
4. [CI/CD Integration](#cicd-integration)
5. [Error Handling](#error-handling)
6. [Performance Optimization](#performance-optimization)

---

## Overview

A complete testing workflow typically involves:

1. **Fleet Initialization** - Setup agent coordination
2. **Agent Spawning** - Create specialized agents
3. **Test Generation** - AI-powered test creation
4. **Test Execution** - Parallel test running
5. **Coverage Analysis** - Gap detection and optimization
6. **Quality Analysis** - Comprehensive metrics
7. **Reporting** - Generate reports for stakeholders

---

## Basic Workflow

### Step 1: Initialize Fleet

```javascript
const fleet = await mcp__agentic_qe__fleet_init({
  config: {
    topology: 'hierarchical',
    maxAgents: 10,
    testingFocus: ['unit', 'integration'],
    environments: ['development'],
    frameworks: ['jest']
  },
  projectContext: {
    repositoryUrl: 'https://github.com/company/project',
    language: 'typescript',
    buildSystem: 'npm'
  }
});

console.log(`Fleet initialized: ${fleet.fleetId}`);
console.log(`Capacity: ${fleet.maxAgents} agents`);
```

### Step 2: Spawn Specialized Agents

```javascript
// Test generator for creating tests
const testGen = await mcp__agentic_qe__agent_spawn({
  spec: {
    type: 'test-generator',
    name: 'test-gen-001',
    capabilities: [
      'unit-tests',
      'integration-tests',
      'data-synthesis'
    ]
  },
  fleetId: fleet.fleetId
});

// Coverage analyzer for gap detection
const coverageAnalyzer = await mcp__agentic_qe__agent_spawn({
  spec: {
    type: 'coverage-analyzer',
    name: 'coverage-001',
    capabilities: [
      'gap-detection',
      'sublinear-analysis',
      'recommendations'
    ]
  },
  fleetId: fleet.fleetId
});

// Quality gate for validation
const qualityGate = await mcp__agentic_qe__agent_spawn({
  spec: {
    type: 'quality-gate',
    name: 'qg-001',
    capabilities: [
      'policy-enforcement',
      'risk-assessment',
      'decision-making'
    ]
  },
  fleetId: fleet.fleetId
});

console.log('Agents ready:', [testGen.name, coverageAnalyzer.name, qualityGate.name]);
```

### Step 3: Generate Tests

```javascript
// Generate comprehensive test suite
const generation = await mcp__agentic_qe__test_generate({
  spec: {
    type: 'unit',
    sourceCode: {
      repositoryUrl: 'https://github.com/company/project',
      branch: 'develop',
      language: 'typescript',
      testPatterns: [
        'src/**/*.ts',
        '!src/**/*.test.ts',
        '!src/**/*.spec.ts'
      ]
    },
    coverageTarget: 85,
    frameworks: ['jest'],
    synthesizeData: true
  },
  agentId: testGen.agentId
});

console.log(`Generated ${generation.generatedTests} tests`);
console.log(`Test files: ${generation.testFiles.length}`);
console.log(`Estimated coverage: ${generation.estimatedCoverage}%`);

// Store test plan in memory for other agents
await mcp__agentic_qe__memory_store({
  key: 'aqe/test-plan/generated',
  value: {
    testFiles: generation.testFiles,
    metadata: generation.metadata,
    timestamp: Date.now()
  },
  namespace: 'coordination',
  ttl: 86400 // 24 hours
});
```

### Step 4: Execute Tests

```javascript
// Execute tests with parallel execution
const execution = await mcp__agentic_qe__test_execute({
  spec: {
    testSuites: generation.testFiles.map(f => f.path),
    environments: ['development'],
    parallelExecution: true,
    retryCount: 3,
    timeoutSeconds: 300,
    reportFormat: 'json'
  },
  fleetId: fleet.fleetId
});

console.log(`Tests completed: ${execution.results.passed}/${execution.results.total}`);
console.log(`Duration: ${execution.results.duration}ms`);
console.log(`Success rate: ${(execution.results.passed / execution.results.total * 100).toFixed(2)}%`);

// Store results for coverage analysis
await mcp__agentic_qe__memory_store({
  key: 'aqe/test-results/latest',
  value: execution.results,
  namespace: 'coordination',
  ttl: 86400
});
```

### Step 5: Analyze Coverage

```javascript
// Retrieve test results from memory
const testResults = await mcp__agentic_qe__memory_retrieve({
  key: 'aqe/test-results/latest',
  namespace: 'coordination'
});

// Analyze coverage with sublinear algorithms
const coverageAnalysis = await mcp__agentic_qe__coverage_analyze_sublinear({
  sourceFiles: generation.testFiles.map(f => f.path.replace('.test.', '.')),
  coverageThreshold: 0.85,
  useJohnsonLindenstrauss: true,
  includeUncoveredLines: true
});

console.log(`Coverage: ${coverageAnalysis.coverage.overall}%`);
console.log(`Gaps detected: ${coverageAnalysis.gaps.length}`);

// Detect gaps and prioritize
const gaps = await mcp__agentic_qe__coverage_gaps_detect({
  coverageData: coverageAnalysis.coverage,
  prioritization: 'criticality'
});

console.log('Top priority gaps:');
gaps.prioritizedGaps.slice(0, 5).forEach(gap => {
  console.log(`  - ${gap.file}: ${gap.uncoveredLines.length} lines (priority: ${gap.priority})`);
});
```

### Step 6: Quality Analysis

```javascript
// Comprehensive quality analysis
const qualityAnalysis = await mcp__agentic_qe__quality_analyze({
  params: {
    scope: 'all',
    metrics: [
      'coverage',
      'test-quality',
      'code-complexity',
      'maintainability'
    ],
    thresholds: {
      coverage: 85,
      'test-quality': 80,
      'code-complexity': 10,
      maintainability: 70
    },
    generateRecommendations: true,
    historicalComparison: true
  },
  dataSource: {
    testResults: execution.report,
    codeMetrics: './reports/code-metrics.json'
  }
});

console.log(`Overall quality score: ${qualityAnalysis.analysis.overallScore}/100`);

if (qualityAnalysis.recommendations) {
  console.log('\nRecommendations:');
  qualityAnalysis.recommendations.forEach(rec => {
    console.log(`  - ${rec}`);
  });
}
```

### Step 7: Generate Report

```javascript
// Generate comprehensive HTML report
const report = await mcp__agentic_qe__test_report_comprehensive({
  results: execution.results,
  format: 'html',
  includeCharts: true,
  includeTrends: true,
  includeSummary: true,
  includeDetails: true,
  historicalData: [] // Add historical data if available
});

// Save report
const fs = require('fs');
fs.writeFileSync('test-report.html', report.report);

console.log('Report generated: test-report.html');
```

---

## Advanced Patterns

### Pattern 1: Streaming Execution for Large Suites

```javascript
// Use streaming for real-time progress on large test suites
const stream = await mcp__agentic_qe__test_execute_stream({
  spec: {
    testSuites: largeTestSuite,
    parallelExecution: true,
    retryCount: 3
  },
  enableRealtimeUpdates: true
});

let currentProgress = 0;
for await (const event of stream) {
  if (event.type === 'progress') {
    if (event.percent > currentProgress + 5) {
      currentProgress = event.percent;
      console.log(`Progress: ${event.percent}% - ${event.message}`);
      console.log(`  Current: ${event.currentTest}`);
      console.log(`  ETA: ${Math.round(event.estimatedTimeRemaining / 1000)}s`);
    }
  } else if (event.type === 'result') {
    console.log('Completed!');
    console.log(`Final results: ${event.data.results.passed}/${event.data.results.total}`);
  }
}
```

### Pattern 2: Agent Coordination with Memory

```javascript
// Coordinator agent creates test plan
await mcp__agentic_qe__memory_store({
  key: 'aqe/coordination/test-plan',
  value: {
    phase: 'generation',
    target: { unit: 80, integration: 70, e2e: 60 },
    priority: 'high'
  },
  namespace: 'coordination'
});

// Share with all agents
await mcp__agentic_qe__memory_share({
  sourceKey: 'aqe/coordination/test-plan',
  sourceNamespace: 'coordination',
  targetAgents: [testGen.agentId, coverageAnalyzer.agentId, qualityGate.agentId],
  permissions: ['read']
});

// Post progress to blackboard
await mcp__agentic_qe__blackboard_post({
  topic: 'test-generation',
  message: 'Unit tests completed, starting integration tests',
  priority: 'medium',
  agentId: testGen.agentId,
  metadata: {
    completed: 150,
    total: 200,
    coverage: 82
  }
});

// Agents read from blackboard
const hints = await mcp__agentic_qe__blackboard_read({
  topic: 'test-generation',
  agentId: coverageAnalyzer.agentId,
  minPriority: 'medium',
  limit: 10
});

console.log(`Received ${hints.hints.length} coordination hints`);
```

### Pattern 3: Workflow with Checkpoints

```javascript
// Create workflow with checkpoints
const workflow = await mcp__agentic_qe__workflow_create({
  name: 'comprehensive-testing',
  description: 'Full testing workflow with checkpoints',
  steps: [
    {
      id: 'generate',
      name: 'Generate Tests',
      type: 'test-generation',
      dependencies: [],
      config: { coverageTarget: 85 }
    },
    {
      id: 'execute',
      name: 'Execute Tests',
      type: 'test-execution',
      dependencies: ['generate'],
      config: { parallelExecution: true }
    },
    {
      id: 'analyze',
      name: 'Analyze Quality',
      type: 'quality-analysis',
      dependencies: ['execute'],
      config: { generateRecommendations: true }
    }
  ],
  checkpoints: {
    enabled: true,
    frequency: 'after-each-step'
  }
});

// Execute workflow
const workflowExec = await mcp__agentic_qe__workflow_execute({
  workflowId: workflow.workflowId,
  oodaEnabled: true,
  autoCheckpoint: true
});

// If execution fails, resume from checkpoint
if (!workflowExec.success) {
  const checkpoint = workflowExec.lastCheckpoint;
  console.log(`Resuming from checkpoint: ${checkpoint.stepId}`);

  const resumed = await mcp__agentic_qe__workflow_resume({
    checkpointId: checkpoint.checkpointId,
    context: {
      skipFailedSteps: false
    }
  });
}
```

### Pattern 4: Consensus-Based Quality Gate

```javascript
// Create proposal for deployment
const proposal = await mcp__agentic_qe__consensus_propose({
  proposalId: 'deploy-v2.1.0',
  topic: 'deployment-approval',
  proposal: {
    version: 'v2.1.0',
    environment: 'production',
    metrics: qualityAnalysis.metrics
  },
  votingAgents: [testGen.agentId, coverageAnalyzer.agentId, qualityGate.agentId],
  quorum: 0.67, // 67% approval required
  timeout: 300
});

// Each agent votes based on their analysis
const votes = await Promise.all([
  mcp__agentic_qe__consensus_vote({
    proposalId: proposal.proposalId,
    agentId: testGen.agentId,
    vote: 'approve',
    rationale: 'All tests generated and passing'
  }),
  mcp__agentic_qe__consensus_vote({
    proposalId: proposal.proposalId,
    agentId: coverageAnalyzer.agentId,
    vote: 'approve',
    rationale: 'Coverage exceeds threshold'
  }),
  mcp__agentic_qe__consensus_vote({
    proposalId: proposal.proposalId,
    agentId: qualityGate.agentId,
    vote: qualityAnalysis.analysis.overallScore >= 80 ? 'approve' : 'reject',
    rationale: `Quality score: ${qualityAnalysis.analysis.overallScore}`
  })
]);

const finalVote = votes[votes.length - 1];
if (finalVote.consensusReached && finalVote.approved) {
  console.log('✅ Deployment approved by consensus');
} else {
  console.log('❌ Deployment rejected');
}
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
# .github/workflows/test.yml
name: AQE Testing Workflow

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Start MCP Server
        run: npm run mcp:start &

      - name: Run AQE Workflow
        run: node scripts/aqe-workflow.js
        env:
          FLEET_TOPOLOGY: hierarchical
          MAX_AGENTS: 10
          COVERAGE_TARGET: 85

      - name: Upload Reports
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-reports
          path: |
            test-report.html
            coverage/
```

```javascript
// scripts/aqe-workflow.js
async function runCIWorkflow() {
  // Initialize fleet
  const fleet = await mcp__agentic_qe__fleet_init({
    config: {
      topology: process.env.FLEET_TOPOLOGY || 'hierarchical',
      maxAgents: parseInt(process.env.MAX_AGENTS) || 10,
      testingFocus: ['unit', 'integration'],
      frameworks: ['jest']
    }
  });

  // Orchestrate full testing
  const orchestration = await mcp__agentic_qe__task_orchestrate({
    task: {
      type: 'comprehensive-testing',
      priority: 'high',
      strategy: 'adaptive'
    },
    context: {
      project: process.env.GITHUB_REPOSITORY,
      branch: process.env.GITHUB_REF,
      environment: 'ci'
    },
    fleetId: fleet.fleetId
  });

  // Wait for completion
  let status;
  do {
    await new Promise(resolve => setTimeout(resolve, 5000));
    status = await mcp__agentic_qe__task_status({
      taskId: orchestration.orchestrationId,
      includeDetails: true
    });
    console.log(`Status: ${status.status} (${status.progress}%)`);
  } while (status.status === 'running');

  // Check quality gate
  if (status.status === 'completed') {
    console.log('✅ All tests passed');
    process.exit(0);
  } else {
    console.log('❌ Tests failed');
    process.exit(1);
  }
}

runCIWorkflow().catch(err => {
  console.error('Workflow failed:', err);
  process.exit(1);
});
```

---

## Error Handling

### Retry Pattern

```javascript
async function executeWithRetry(operation, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxAttempts) throw error;

      if (error.retryable) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
        if (error.suggestion) {
          console.log(`Suggestion: ${error.suggestion}`);
        }
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error; // Don't retry non-retryable errors
      }
    }
  }
}

// Usage
const result = await executeWithRetry(() =>
  mcp__agentic_qe__test_execute({
    spec: { testSuites: ['tests/'], parallelExecution: true }
  })
);
```

### Graceful Degradation

```javascript
async function executewithFallback() {
  try {
    // Try parallel execution first
    return await mcp__agentic_qe__test_execute({
      spec: {
        testSuites: ['tests/'],
        parallelExecution: true,
        retryCount: 3
      }
    });
  } catch (error) {
    if (error.code === 'INSUFFICIENT_AGENTS') {
      console.log('Falling back to sequential execution...');
      // Fall back to sequential
      return await mcp__agentic_qe__test_execute({
        spec: {
          testSuites: ['tests/'],
          parallelExecution: false,
          retryCount: 1
        }
      });
    }
    throw error;
  }
}
```

---

## Performance Optimization

### Optimize Test Suite

```javascript
// 1. Analyze current suite
const analysis = await mcp__agentic_qe__coverage_analyze_sublinear({
  sourceFiles: glob.sync('tests/**/*.test.ts'),
  coverageThreshold: 0.85,
  useJohnsonLindenstrauss: true
});

// 2. Optimize with sublinear algorithms
const optimized = await mcp__agentic_qe__test_optimize_sublinear({
  testSuite: {
    tests: analysis.tests
  },
  algorithm: 'johnson-lindenstrauss',
  targetReduction: 0.4, // Reduce to 40%
  maintainCoverage: 0.90, // Keep 90% coverage
  preserveCritical: true
});

console.log(`Reduced from ${optimized.metrics.originalSize} to ${optimized.metrics.optimizedSize} tests`);
console.log(`Time savings: ${optimized.metrics.estimatedTimeReduction}%`);

// 3. Execute optimized suite
const result = await mcp__agentic_qe__test_execute({
  spec: {
    testSuites: optimized.optimizedSuite.tests.map(t => t.path),
    parallelExecution: true
  }
});
```

### Parallel Agent Coordination

```javascript
// Spawn agents in parallel
const agents = await Promise.all([
  mcp__agentic_qe__agent_spawn({
    spec: { type: 'test-generator', capabilities: ['unit'] }
  }),
  mcp__agentic_qe__agent_spawn({
    spec: { type: 'coverage-analyzer', capabilities: ['analysis'] }
  }),
  mcp__agentic_qe__agent_spawn({
    spec: { type: 'quality-gate', capabilities: ['validation'] }
  })
]);

// Execute tasks in parallel
const results = await Promise.all([
  mcp__agentic_qe__test_generate({ agentId: agents[0].agentId, spec: { ... } }),
  mcp__agentic_qe__coverage_analyze_sublinear({ ... }),
  mcp__agentic_qe__quality_analyze({ ... })
]);
```

---

## Complete Example

See [examples/mcp/complete-workflow.js](../../examples/mcp/complete-workflow.js) for a runnable example.

---

**Next Steps**:
- [Quality Gates Guide](./quality-gates.md)
- [Performance Testing](./performance-testing.md)
- [Agent Coordination Patterns](./agent-coordination.md)
