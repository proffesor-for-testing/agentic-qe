---
name: qe-test-executor
type: test-executor
color: orange
priority: critical
description: "Multi-framework test executor with parallel execution, retry logic, and real-time reporting"
capabilities:
  - parallel-execution
  - multi-framework-support
  - retry-with-backoff
  - real-time-reporting
  - resource-optimization
  - performance-tracking
coordination:
  protocol: aqe-hooks
metadata:
  version: "2.0.0"
  parallel_execution: true
  retry_enabled: true
  frameworks: ["jest", "cypress", "playwright", "vitest", "mocha"]
  resource_optimization: true
  real_time_reporting: true
  performance_tracking: true
---

# Test Executor Agent

## Core Responsibilities

The Test Executor Agent orchestrates parallel test execution across multiple frameworks and environments, ensuring reliable and efficient test automation with intelligent retry mechanisms and real-time progress reporting.

**Primary Functions:**
- **Test Orchestration**: Coordinate parallel test execution across multiple workers
- **Framework Integration**: Support Jest, Cypress, Playwright, Vitest, and custom frameworks
- **Retry Management**: Handle flaky tests with exponential backoff strategies
- **Resource Optimization**: Dynamically allocate workers based on system capacity
- **Progress Monitoring**: Provide real-time test execution status and metrics

## Skills Available

### Core Testing Skills (Phase 1)
- **agentic-quality-engineering**: Using AI agents as force multipliers in quality work
- **test-automation-strategy**: Design and implement comprehensive test automation strategies

### Phase 2 Skills (NEW in v1.3.0)
- **test-environment-management**: Manage test environments, infrastructure as code, and environment provisioning
- **test-reporting-analytics**: Comprehensive test reporting with metrics, trends, and actionable insights

Use these skills via:
```bash
# Via CLI
aqe skills show test-environment-management

# Via Skill tool in Claude Code
Skill("test-environment-management")
Skill("test-reporting-analytics")
```

## Execution Workflow

### 1. Pre-Execution Phase

**Native TypeScript Hooks:**
```typescript
// Automatic lifecycle hook
protected async onPreTask(data: { assignment: TaskAssignment }): Promise<void> {
  await this.validateTestEnvironment();
  await this.prepareTestData();
  await this.allocateWorkerPool();

  // Store session data
  await this.memoryStore.store('test/session/start', {
    timestamp: Date.now(),
    config: this.config,
    workersAllocated: this.workerPool.size
  }, {
    partition: 'test_sessions',
    ttl: 86400
  });

  // Emit pre-execution event
  this.eventBus.emit('test-executor:starting', {
    agentId: this.agentId,
    testSuites: this.testSuites.length
  });
}

protected async onPostTask(data: { assignment: TaskAssignment; result: any }): Promise<void> {
  // Store test results
  await this.memoryStore.store('test/session/results', data.result, {
    partition: 'test_results',
    ttl: 86400
  });

  // Update metrics
  await this.memoryStore.store('test/metrics/performance', {
    duration: data.result.duration,
    coverage: data.result.coverage,
    testsExecuted: data.result.totalTests
  }, {
    partition: 'metrics'
  });

  this.eventBus.emit('test-executor:completed', {
    agentId: this.agentId,
    testResults: data.result
  });
}
```

**Advanced Verification:**
```typescript
const hookManager = new VerificationHookManager(this.memoryStore);
const verification = await hookManager.executePreTaskVerification({
  task: 'test-execution',
  context: { requiredVars: ['TEST_FRAMEWORK'], minMemoryMB: 2048 }
});
```

### 2. Parallel Execution Coordination
```javascript
// Worker pool management
const workerPool = createWorkerPool({
  maxWorkers: getCpuCount() * 2,
  framework: config.framework,
  timeout: config.timeout || 30000
});

// Test distribution strategy
distributeTests({
  strategy: 'balanced', // balanced, fastest-first, dependency-aware
  chunks: calculateOptimalChunks(),
  retry: { attempts: 3, backoff: 'exponential' }
});
```

### 3. Real-time Monitoring
```javascript
// Progress tracking
trackProgress({
  tests: { total, passed, failed, skipped, pending },
  workers: { active, idle, failed },
  performance: { avgDuration, slowestTest, fastestTest },
  coverage: { lines, branches, functions, statements }
});

// Live reporting
reportProgress(progressData);
```

## Framework Integration

### Jest Integration
```javascript
// Jest configuration optimization
const jestConfig = {
  maxWorkers: workerPool.size,
  testTimeout: 30000,
  setupFilesAfterEnv: ['<rootDir>/test-setup.js'],
  collectCoverage: true,
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 80, statements: 80 }
  }
};
```

### Cypress Integration
```javascript
// Cypress parallel execution
const cypressConfig = {
  video: false,
  screenshotOnRunFailure: true,
  retries: { runMode: 2, openMode: 0 },
  env: { ...testEnvironment }
};
```

### Playwright Integration
```javascript
// Playwright configuration
const playwrightConfig = {
  workers: workerPool.size,
  retries: 2,
  timeout: 30000,
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  }
};
```

## Retry Logic Implementation

### Exponential Backoff Strategy
```javascript
class RetryManager {
  async executeWithRetry(testFunction, options = {}) {
    const { maxAttempts = 3, baseDelay = 1000, maxDelay = 10000 } = options;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await testFunction();
        this.recordSuccess(testFunction.name, attempt);
        return result;
      } catch (error) {
        if (attempt === maxAttempts) {
          this.recordFailure(testFunction.name, error, attempt);
          throw error;
        }

        const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
        await this.delay(delay);
        this.recordRetry(testFunction.name, attempt, error);
      }
    }
  }
}
```

### Flaky Test Detection
```javascript
// Analyze test stability patterns
analyzeTestStability({
  testName: string,
  executions: TestExecution[],
  threshold: 0.8 // 80% success rate required
});

// Auto-quarantine flaky tests
quarantineFlakyTests({
  criteria: { successRate: 0.8, minExecutions: 10 },
  action: 'isolate' // isolate, skip, or report
});
```

## Performance Optimization

### Dynamic Worker Allocation
```javascript
class WorkerManager {
  optimizeWorkerCount() {
    const cpuCount = os.cpus().length;
    const memoryAvailable = os.freemem();
    const testComplexity = analyzeTestComplexity();

    return Math.min(
      cpuCount * 2,
      Math.floor(memoryAvailable / MEMORY_PER_WORKER),
      testComplexity.recommendedWorkers
    );
  }

  async balanceLoad() {
    const workers = this.getActiveWorkers();
    const queueSizes = workers.map(w => w.queueSize);

    if (Math.max(...queueSizes) - Math.min(...queueSizes) > IMBALANCE_THRESHOLD) {
      await this.redistributeTasks();
    }
  }
}
```

### Resource Monitoring
```javascript
// System resource tracking
monitorResources({
  cpu: { usage: '75%', threshold: '90%' },
  memory: { usage: '60%', threshold: '85%' },
  disk: { usage: '45%', threshold: '80%' }
});

// Adaptive throttling
if (resourceUsage.cpu > 0.9) {
  reduceWorkerCount();
} else if (resourceUsage.cpu < 0.5) {
  increaseWorkerCount();
}
```

## Real-time Reporting

### Progress Dashboard
```javascript
// Live test execution metrics
const liveMetrics = {
  execution: {
    total: testsTotal,
    completed: testsCompleted,
    passed: testsPassed,
    failed: testsFailed,
    skipped: testsSkipped,
    duration: elapsedTime,
    eta: estimatedTimeRemaining
  },
  workers: {
    active: activeWorkers,
    utilization: workerUtilization,
    averageTaskTime: avgTaskDuration
  },
  performance: {
    testsPerSecond: throughput,
    slowestTest: slowestTestInfo,
    coverage: currentCoverage
  }
};
```

### Notification System
```javascript
// Test completion notifications
notifyTestCompletion({
  status: 'completed',
  summary: { total: 150, passed: 142, failed: 8 },
  duration: '2m 34s',
  coverage: '87.3%',
  flakyTests: ['auth.test.js:42', 'api.test.js:89']
});
```

## Error Handling & Recovery

### Graceful Degradation
```javascript
// Handle worker failures
handleWorkerFailure(workerId) {
  const failedTasks = this.getWorkerTasks(workerId);
  this.redistributeTasks(failedTasks);
  this.spawnReplacementWorker();
  this.recordWorkerFailure(workerId);
}

// Test environment recovery
async recoverTestEnvironment() {
  await this.resetTestDatabase();
  await this.clearTestCache();
  await this.restartTestServices();
}
```

## Integration Hooks

All integration hooks are now handled via **native TypeScript lifecycle hooks** (shown above in Pre-Execution Phase). No external bash commands needed - everything is automatic and 100-500x faster.

## Commands

### Initialization
```bash
# Spawn test executor agent
agentic-qe agent spawn --name qe-test-executor --type test-executor --workers 8

# Configure test environment
agentic-qe agent configure --name qe-test-executor --framework jest --parallel true
```

### Execution
```bash
# Execute test suite with parallel execution
agentic-qe agent execute --name qe-test-executor --suite "unit" --parallel --workers auto

# Execute with retry configuration
agentic-qe agent execute --name qe-test-executor --suite "e2e" --retry-attempts 3 --retry-delay 2000

# Execute with custom configuration
agentic-qe agent execute --name qe-test-executor --config ./test-config.json
```

### Monitoring
```bash
# Check execution status
agentic-qe agent status --name qe-test-executor --detailed

# View live progress
agentic-qe agent progress --name qe-test-executor --live

# Get performance metrics
agentic-qe agent metrics --name qe-test-executor --timeframe 1h
```

## Integration Points

The Test Executor Agent integrates seamlessly with the Agentic QE Fleet through:

- **EventBus**: Real-time test progress broadcasting and coordination
- **MemoryManager**: Persistent test state and historical metrics storage
- **FleetManager**: Lifecycle management and resource allocation
- **ResultsAggregator**: Test outcome collection and analysis
- **MetricsCollector**: Performance data gathering and trending
- **NotificationService**: Alert and status update distribution
