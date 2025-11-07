# Code Execution Workflows Template for QE Agents

## Overview
This template provides standard patterns for code execution workflows in QE agents. Anthropic recommends code execution over direct tool calls for 98.7% token reduction (150K → 2K tokens).

## Standard Import Pattern

```javascript
// Import MCP tools for orchestration
import { TestGenerateHandler } from '../src/mcp/handlers/test-generate.js';
import { CoverageAnalyzeHandler } from '../src/mcp/handlers/analysis/coverage-analyze.js';
import { TestExecuteHandler } from '../src/mcp/handlers/test-execute.js';
import { AgentRegistry } from '../src/mcp/services/AgentRegistry.js';
import { HookExecutor } from '../src/mcp/services/HookExecutor.js';
```

## Tool Discovery Commands

### Finding Available Tools
```bash
# List all MCP handler directories
ls -la ./src/mcp/handlers/

# Test domain tools
ls -la ./src/mcp/handlers/test/
# Files: test-generate-enhanced.ts, test-execute-parallel.ts,
#        test-optimize-sublinear.ts, test-coverage-detailed.ts

# Analysis domain tools
ls -la ./src/mcp/handlers/analysis/
# Files: coverage-analyze.ts, coverage-gap-detect.ts,
#        code-quality-check.ts, dependency-analyze.ts

# Advanced domain tools
ls -la ./src/mcp/handlers/advanced/
# Files: api-breaking-changes.ts, mutation-test-execute.ts,
#        production-incident-replay.ts, requirements-validate.ts

# Coordination domain tools
ls -la ./src/mcp/handlers/coordination/
# Files: fleet-coordinate.ts, agent-sync.ts, task-distribute.ts

# Prediction domain tools
ls -la ./src/mcp/handlers/prediction/
# Files: defect-predict.ts, flaky-detect.ts, risk-assess.ts
```

## Workflow Example 1: Test Generation Orchestration

```javascript
// Initialize handlers
const registry = new AgentRegistry();
const hookExecutor = new HookExecutor();
const testGenerator = new TestGenerateHandler(registry, hookExecutor);

// Define test generation specification
const testSpec = {
  type: 'unit',
  sourceCode: {
    repositoryUrl: 'https://github.com/example/repo',
    branch: 'main',
    language: 'javascript'
  },
  frameworks: ['jest'],
  coverageTarget: 85,
  synthesizeData: true
};

// Execute test generation with error handling
try {
  const result = await testGenerator.handle({ spec: testSpec });

  if (result.success) {
    console.log(`Generated ${result.data.tests.length} tests`);
    console.log(`Coverage: ${result.data.coverage.achieved}%`);

    // Conditional logic: Check if coverage target met
    if (result.data.coverage.achieved < testSpec.coverageTarget) {
      console.log('Coverage gap detected, generating additional tests...');
      const gaps = result.data.coverage.gaps;

      // Generate additional tests for gaps
      for (const gap of gaps) {
        const additionalSpec = {
          ...testSpec,
          targetFiles: [gap.file],
          focusAreas: gap.functions
        };
        await testGenerator.handle({ spec: additionalSpec });
      }
    }
  }
} catch (error) {
  console.error('Test generation failed:', error.message);
  // Fallback strategy
  console.log('Attempting alternative test generation strategy...');
}
```

## Workflow Example 2: Coverage Analysis Pipeline

```javascript
import { CoverageAnalyzeHandler } from '../src/mcp/handlers/analysis/coverage-analyze.js';

const coverageAnalyzer = new CoverageAnalyzeHandler(registry, hookExecutor);

// Multi-step coverage workflow
async function analyzeCoverageGaps(projectPath) {
  // Step 1: Run coverage analysis
  const coverageResult = await coverageAnalyzer.handle({
    projectPath,
    thresholds: { statements: 80, branches: 75, functions: 85 },
    includePatterns: ['src/**/*.js', 'lib/**/*.js'],
    excludePatterns: ['**/*.test.js', '**/node_modules/**']
  });

  // Step 2: Conditional gap detection
  if (!coverageResult.data.passesThresholds) {
    console.log('Coverage gaps detected:');

    // Analyze each gap
    for (const file of coverageResult.data.uncoveredFiles) {
      console.log(`File: ${file.path}`);
      console.log(`  Statements: ${file.coverage.statements}%`);
      console.log(`  Missing lines: ${file.uncoveredLines.join(', ')}`);

      // Prioritize gaps by criticality
      if (file.coverage.statements < 50) {
        console.log(`  Priority: CRITICAL - requires immediate attention`);

        // Trigger test generation for critical gaps
        await testGenerator.handle({
          spec: {
            type: 'unit',
            targetFiles: [file.path],
            coverageTarget: 80,
            sourceCode: {
              repositoryUrl: projectPath,
              branch: 'main',
              language: 'javascript'
            }
          }
        });
      }
    }
  }

  return coverageResult;
}
```

## Workflow Example 3: Parallel Test Execution

```javascript
import { TestExecuteHandler } from '../src/mcp/handlers/test-execute.js';

const testExecutor = new TestExecuteHandler(registry, hookExecutor);

// Orchestrate parallel test execution
async function runTestSuiteWithParallelization(suites) {
  const results = [];

  // Execute test suites in parallel
  const executions = suites.map(async (suite) => {
    try {
      const result = await testExecutor.handle({
        suite: suite.name,
        framework: suite.framework,
        parallel: true,
        maxWorkers: 4,
        coverage: true,
        bail: false // Continue on failure
      });

      return {
        suite: suite.name,
        success: result.success,
        stats: result.data.stats,
        failures: result.data.failures
      };
    } catch (error) {
      return {
        suite: suite.name,
        success: false,
        error: error.message
      };
    }
  });

  // Wait for all executions
  const allResults = await Promise.all(executions);

  // Analyze results
  const failedSuites = allResults.filter(r => !r.success);
  const totalTests = allResults.reduce((sum, r) => sum + (r.stats?.total || 0), 0);
  const totalFailures = allResults.reduce((sum, r) => sum + (r.stats?.failed || 0), 0);

  console.log(`Executed ${totalTests} tests across ${suites.length} suites`);
  console.log(`Failures: ${totalFailures}`);

  // Conditional retry for failed suites
  if (failedSuites.length > 0 && failedSuites.length < suites.length) {
    console.log('Retrying failed suites...');

    for (const failed of failedSuites) {
      const retryResult = await testExecutor.handle({
        suite: failed.suite,
        framework: 'jest',
        parallel: false, // Run serially on retry
        maxWorkers: 1,
        coverage: false
      });

      if (retryResult.success) {
        console.log(`Suite ${failed.suite} passed on retry`);
      }
    }
  }

  return allResults;
}
```

## Workflow Example 4: ML-Based Flaky Detection

```javascript
import { FlakyDetectHandler } from '../src/mcp/handlers/prediction/flaky-detect.js';

const flakyDetector = new FlakyDetectHandler(registry, hookExecutor);

// Orchestrate flaky test detection and stabilization
async function detectAndStabilizeFlakyTests(testResults) {
  // Step 1: Analyze test results for flakiness patterns
  const flakyAnalysis = await flakyDetector.handle({
    testResults,
    analysisWindow: 50, // Last 50 runs
    confidenceThreshold: 0.85,
    mlModel: 'random-forest',
    features: ['duration_variance', 'failure_rate', 'timing_dependencies']
  });

  // Step 2: Process detected flaky tests
  if (flakyAnalysis.data.flakyTests.length > 0) {
    console.log(`Detected ${flakyAnalysis.data.flakyTests.length} flaky tests`);

    for (const flakyTest of flakyAnalysis.data.flakyTests) {
      console.log(`Test: ${flakyTest.name}`);
      console.log(`  Confidence: ${flakyTest.confidence}`);
      console.log(`  Patterns: ${flakyTest.patterns.join(', ')}`);

      // Step 3: Conditional auto-stabilization
      if (flakyTest.confidence > 0.9 && flakyTest.autoFixable) {
        console.log('  Applying auto-stabilization...');

        // Apply stabilization strategies
        const stabilizationResult = await applyStabilization(flakyTest);

        if (stabilizationResult.success) {
          console.log('  ✓ Test stabilized successfully');

          // Re-run test to verify
          const verifyResult = await testExecutor.handle({
            suite: flakyTest.suite,
            testPattern: flakyTest.name,
            runs: 10, // Run 10 times to verify stability
            parallel: false
          });

          const stabilityScore = verifyResult.data.stats.passed / verifyResult.data.stats.total;
          console.log(`  Stability score: ${stabilityScore * 100}%`);
        }
      } else {
        console.log('  Manual intervention required');
        console.log(`  Recommendations: ${flakyTest.recommendations.join(', ')}`);
      }
    }
  }

  return flakyAnalysis;
}

async function applyStabilization(flakyTest) {
  // Apply pattern-specific fixes
  const strategies = {
    'timing-dependency': async () => {
      // Add explicit waits
      console.log('    Adding explicit waits...');
    },
    'race-condition': async () => {
      // Add synchronization
      console.log('    Adding synchronization...');
    },
    'resource-leak': async () => {
      // Add cleanup hooks
      console.log('    Adding cleanup hooks...');
    }
  };

  for (const pattern of flakyTest.patterns) {
    if (strategies[pattern]) {
      await strategies[pattern]();
    }
  }

  return { success: true };
}
```

## Workflow Example 5: Quality Gate Validation

```javascript
import { QualityGateHandler } from '../src/mcp/handlers/quality/quality-gate.js';

const qualityGate = new QualityGateHandler(registry, hookExecutor);

// Comprehensive quality gate orchestration
async function validateDeploymentReadiness(deploymentSpec) {
  const checks = [];

  // 1. Run code coverage check
  console.log('Running coverage check...');
  const coverageCheck = await coverageAnalyzer.handle({
    projectPath: deploymentSpec.projectPath,
    thresholds: { statements: 80, branches: 75, functions: 85 }
  });
  checks.push({
    name: 'coverage',
    passed: coverageCheck.data.passesThresholds,
    details: coverageCheck.data
  });

  // 2. Run test execution check
  console.log('Running test suite...');
  const testCheck = await testExecutor.handle({
    suite: 'all',
    framework: 'jest',
    parallel: true,
    coverage: false
  });
  checks.push({
    name: 'tests',
    passed: testCheck.data.stats.failed === 0,
    details: testCheck.data.stats
  });

  // 3. Run flaky test detection
  console.log('Detecting flaky tests...');
  const flakyCheck = await flakyDetector.handle({
    testResults: testCheck.data.results,
    confidenceThreshold: 0.85
  });
  checks.push({
    name: 'flaky-tests',
    passed: flakyCheck.data.flakyTests.length === 0,
    details: { flakyCount: flakyCheck.data.flakyTests.length }
  });

  // 4. Aggregate quality gate results
  const qualityGateResult = await qualityGate.handle({
    checks,
    policy: 'strict', // All checks must pass
    environment: deploymentSpec.environment
  });

  // 5. Conditional deployment decision
  if (qualityGateResult.data.passed) {
    console.log('✓ Quality gate PASSED - Deployment approved');
    console.log(`  Score: ${qualityGateResult.data.score}/100`);
    return { approved: true, results: qualityGateResult };
  } else {
    console.log('✗ Quality gate FAILED - Deployment blocked');
    console.log('Failed checks:');

    for (const check of qualityGateResult.data.failedChecks) {
      console.log(`  - ${check.name}: ${check.reason}`);
    }

    // Generate remediation plan
    console.log('\nRemediation plan:');
    for (const recommendation of qualityGateResult.data.recommendations) {
      console.log(`  ${recommendation.priority}: ${recommendation.action}`);
    }

    return { approved: false, results: qualityGateResult };
  }
}
```

## Error Handling Patterns

### Pattern 1: Retry with Backoff
```javascript
async function executeWithRetry(handler, args, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await handler.handle(args);
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Failed after ${maxRetries} attempts: ${lastError.message}`);
}
```

### Pattern 2: Graceful Degradation
```javascript
async function executeWithFallback(primaryHandler, fallbackHandler, args) {
  try {
    return await primaryHandler.handle(args);
  } catch (error) {
    console.log('Primary handler failed, using fallback:', error.message);
    return await fallbackHandler.handle(args);
  }
}
```

### Pattern 3: Circuit Breaker
```javascript
class CircuitBreaker {
  constructor(handler, threshold = 5, timeout = 60000) {
    this.handler = handler;
    this.failureCount = 0;
    this.threshold = threshold;
    this.timeout = timeout;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.nextAttempt = Date.now();
  }

  async execute(args) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await this.handler.handle(args);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failureCount++;

    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.timeout;
      console.log('Circuit breaker opened');
    }
  }
}
```

## Best Practices

### 1. Tool Discovery Before Execution
Always discover available tools before importing:
```bash
# List all available handlers
find ./src/mcp/handlers -name "*.ts" -type f

# Check specific domain
ls -la ./src/mcp/handlers/[domain]/
```

### 2. Type-Safe Imports
Import with proper TypeScript types:
```javascript
import type { TestGenerationSpec } from '../src/mcp/tools.js';
import type { HandlerResponse } from '../src/mcp/handlers/base-handler.js';
```

### 3. Error Boundary Pattern
Wrap all orchestration in try-catch:
```javascript
async function safeOrchestration() {
  try {
    // Orchestration logic
  } catch (error) {
    console.error('Orchestration failed:', error);
    // Cleanup or rollback
  }
}
```

### 4. Progress Tracking
Use logging for long-running operations:
```javascript
console.log('Step 1/5: Analyzing source code...');
// ... step 1
console.log('Step 2/5: Generating tests...');
// ... step 2
```

### 5. Resource Cleanup
Always cleanup resources:
```javascript
try {
  // Orchestration
} finally {
  await registry.cleanup();
  await hookExecutor.finalize();
}
```

## Integration with Agent Hooks

All code execution workflows should integrate with agent hooks:

```javascript
// Before orchestration
await hookExecutor.executePreTask({
  description: 'Test generation workflow',
  agentType: 'test-generator',
  agentId: registry.getCurrentAgentId()
});

// After orchestration
await hookExecutor.executePostTask({
  taskId: registry.getCurrentAgentId(),
  results: {
    testsGenerated: results.length,
    coverage: coverageResult.achieved
  }
});
```

## Memory Coordination

Store results in memory for agent coordination:

```javascript
import { MemoryStore } from '../src/memory/MemoryStore.js';

const memoryStore = new MemoryStore();

// Store results
await memoryStore.store('aqe/test-generation/results', {
  suiteId: testSuite.id,
  testsGenerated: testSuite.tests.length,
  coverage: testSuite.coverage.achieved
}, {
  partition: 'agent_results',
  ttl: 86400 // 24 hours
});

// Retrieve shared context
const context = await memoryStore.retrieve('aqe/context', {
  partition: 'coordination'
});
```

## Performance Optimization

### Batch Operations
```javascript
// Instead of sequential
for (const file of files) {
  await processFile(file);
}

// Use parallel
await Promise.all(files.map(file => processFile(file)));
```

### Caching Results
```javascript
const cache = new Map();

async function getCachedResult(key, generator) {
  if (cache.has(key)) {
    return cache.get(key);
  }

  const result = await generator();
  cache.set(key, result);
  return result;
}
```

### Streaming Large Results
```javascript
import { TestExecuteStreamHandler } from '../src/mcp/streaming/TestExecuteStreamHandler.js';

const streamHandler = new TestExecuteStreamHandler();

for await (const event of streamHandler.execute(params)) {
  if (event.type === 'progress') {
    console.log(`Progress: ${event.percent}%`);
  } else if (event.type === 'result') {
    processResult(event.data);
  }
}
```

---

**Template Version**: 1.0.0
**Last Updated**: 2025-11-07
**Compatible with**: Agentic QE v1.3.0+
