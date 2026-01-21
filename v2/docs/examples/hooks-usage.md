# AQE Hooks - Practical Usage Examples

**Version**: 1.0.2
**Last Updated**: 2025-10-07

## Table of Contents

1. [Basic Agent with Lifecycle Hooks](#basic-agent-with-lifecycle-hooks)
2. [Advanced Verification with VerificationHookManager](#advanced-verification-with-verificationhookmanager)
3. [Memory Coordination Patterns](#memory-coordination-patterns)
4. [Event-Driven Coordination](#event-driven-coordination)
5. [Error Handling Patterns](#error-handling-patterns)
6. [Performance Optimization Tips](#performance-optimization-tips)
7. [Complete Agent Examples](#complete-agent-examples)

---

## Basic Agent with Lifecycle Hooks

### Simple Test Generator Agent

This example shows a basic agent using lifecycle hooks for test generation.

```typescript
import { BaseAgent, BaseAgentConfig } from '../agents/BaseAgent';
import { TaskAssignment, QETask } from '../types';

export class SimpleTestGeneratorAgent extends BaseAgent {
  private testFramework: 'jest' | 'mocha' = 'jest';

  constructor(config: BaseAgentConfig) {
    super(config);
  }

  // ============================================================================
  // Lifecycle Hooks
  // ============================================================================

  protected async onPreInitialization(): Promise<void> {
    // Validate test framework is available
    const hasJest = await this.checkModule('jest');
    if (!hasJest) {
      throw new Error('Jest not installed');
    }

    this.logger.info('Test framework validated');
  }

  protected async onPostInitialization(): Promise<void> {
    // Load test templates from memory
    const templates = await this.retrieveMemory('test-templates');
    if (templates) {
      this.logger.info('Loaded test templates', { count: templates.length });
    }

    // Register with fleet
    await this.storeSharedMemory('status', {
      ready: true,
      framework: this.testFramework
    });
  }

  protected async onPreTask(data: { assignment: TaskAssignment }): Promise<void> {
    const { assignment } = data;

    // Load project context
    const context = await this.retrieveSharedMemory('coverage-analyzer', 'coverage-gaps');
    if (context) {
      this.logger.info('Found coverage gaps to address', { gaps: context.gaps });
    }

    // Store task start
    await this.storeMemory(`task-${assignment.id}-start`, {
      timestamp: Date.now(),
      context
    });
  }

  protected async onPostTask(data: { assignment: TaskAssignment; result: any }): Promise<void> {
    const { assignment, result } = data;

    // Store test generation results
    await this.storeSharedMemory('test-results', {
      taskId: assignment.id,
      testsGenerated: result.count,
      coverage: result.coverage,
      timestamp: Date.now()
    });

    // Emit completion event
    this.emitEvent('test:generated', {
      agentId: this.agentId,
      count: result.count,
      coverage: result.coverage
    }, 'high');

    this.logger.info('Test generation complete', { result });
  }

  protected async onTaskError(data: { assignment: TaskAssignment; error: Error }): Promise<void> {
    const { assignment, error } = data;

    // Store error details
    await this.storeMemory(`task-${assignment.id}-error`, {
      error: error.message,
      stack: error.stack,
      timestamp: Date.now()
    });

    // Notify fleet
    this.emitEvent('test:generation-failed', {
      agentId: this.agentId,
      taskId: assignment.id,
      error: error.message
    }, 'critical');

    this.logger.error('Test generation failed', { error });
  }

  // ============================================================================
  // Abstract Method Implementations
  // ============================================================================

  protected async initializeComponents(): Promise<void> {
    // Load test framework configuration
    this.testFramework = 'jest';
  }

  protected async performTask(task: QETask): Promise<any> {
    // Generate tests based on task
    const tests = await this.generateTests(task);

    return {
      count: tests.length,
      coverage: 95,
      tests
    };
  }

  protected async loadKnowledge(): Promise<void> {
    // Load test generation patterns
    const patterns = await this.retrieveMemory('patterns');
    if (patterns) {
      this.logger.debug('Loaded test patterns', { count: patterns.length });
    }
  }

  protected async cleanup(): Promise<void> {
    // No cleanup needed for this agent
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private async checkModule(moduleName: string): Promise<boolean> {
    try {
      require.resolve(moduleName);
      return true;
    } catch {
      return false;
    }
  }

  private async generateTests(task: QETask): Promise<any[]> {
    // Simplified test generation logic
    return [
      { name: 'test 1', type: 'unit' },
      { name: 'test 2', type: 'integration' }
    ];
  }
}
```

---

## Advanced Verification with VerificationHookManager

### Test Executor with Comprehensive Verification

This example shows advanced verification using VerificationHookManager.

```typescript
import { BaseAgent, BaseAgentConfig } from '../agents/BaseAgent';
import { VerificationHookManager } from '../core/hooks/VerificationHookManager';
import { TaskAssignment, QETask } from '../types';

export class TestExecutorAgent extends BaseAgent {
  private hookManager: VerificationHookManager;

  constructor(config: BaseAgentConfig) {
    super(config);
    this.hookManager = new VerificationHookManager(this.memoryStore);
  }

  // ============================================================================
  // Lifecycle Hooks with Advanced Verification
  // ============================================================================

  protected async onPreTask(data: { assignment: TaskAssignment }): Promise<void> {
    const { assignment } = data;

    // Stage 1: Pre-Task Verification (Priority 100)
    const verification = await this.hookManager.executePreTaskVerification({
      task: assignment.task.type,
      context: {
        // Environment checks
        requiredVars: ['NODE_ENV', 'TEST_DATABASE_URL'],
        minNodeVersion: '18.0.0',
        requiredModules: ['jest', '@types/jest', 'ts-jest'],

        // Resource checks
        minMemoryMB: 1024,
        minCPUCores: 2,
        minDiskSpaceMB: 500,
        maxLoadAverage: 4.0,

        // Permission checks
        files: ['package.json', 'jest.config.js', 'tsconfig.json'],
        directories: ['tests', 'src', 'dist'],
        requiredPermissions: ['read', 'write', 'execute'],

        // Configuration checks
        config: {
          testEnvironment: 'node',
          coverageThreshold: 90
        },
        requiredKeys: ['testEnvironment', 'coverageThreshold']
      }
    });

    if (!verification.passed) {
      throw new Error(
        `Pre-task verification failed (score: ${verification.score}):\n` +
        verification.checks.join('\n')
      );
    }

    this.logger.info('Pre-task verification passed', {
      score: verification.score,
      priority: verification.priority,
      checks: verification.checks
    });

    // Build context bundle for execution
    const bundle = await this.hookManager.buildPreToolUseBundle({
      task: assignment.task.type,
      maxArtifacts: 10
    });

    // Store bundle for use during execution
    await this.storeMemory(`task-${assignment.id}-bundle`, bundle);
  }

  protected async onPostTask(data: { assignment: TaskAssignment; result: any }): Promise<void> {
    const { assignment, result } = data;

    // Stage 2: Post-Task Validation (Priority 90)
    const validation = await this.hookManager.executePostTaskValidation({
      task: assignment.task.type,
      result: {
        // Output validation
        output: result,
        expectedStructure: {
          tests: Array,
          passed: Number,
          failed: Number,
          coverage: Object
        },
        expectedTypes: {
          tests: 'array',
          passed: 'number',
          failed: 'number',
          coverage: 'object'
        },
        requiredFields: ['tests', 'passed', 'failed', 'coverage'],

        // Quality validation
        metrics: {
          complexity: result.metrics?.complexity || 0,
          maintainability: result.metrics?.maintainability || 100,
          duplication: result.metrics?.duplication || 0
        },
        qualityThresholds: {
          maxComplexity: 10,
          minMaintainability: 70,
          maxDuplication: 10
        },

        // Coverage validation
        coverage: result.coverage,
        coverageThresholds: {
          lines: 90,
          branches: 85,
          functions: 90,
          statements: 90
        },
        coverageBaseline: await this.getCoverageBaseline(),

        // Performance validation
        performance: {
          executionTime: result.executionTime,
          memoryUsage: result.memoryUsage
        },
        performanceThresholds: {
          executionTime: 60000, // 1 minute max
          memoryUsage: 512 // 512 MB max
        },
        performanceBaseline: await this.getPerformanceBaseline(),
        regressionThreshold: 0.1 // 10% regression tolerance
      }
    });

    if (!validation.valid) {
      this.logger.warn('Post-task validation issues', {
        accuracy: validation.accuracy,
        priority: validation.priority,
        validations: validation.validations
      });
    } else {
      this.logger.info('Post-task validation passed', {
        accuracy: validation.accuracy
      });
    }

    // Persist outcomes
    await this.hookManager.persistPostToolUseOutcomes({
      events: [
        {
          type: 'test:executed',
          payload: {
            tests: result.tests.length,
            passed: result.passed,
            failed: result.failed
          }
        }
      ],
      patterns: [
        {
          pattern: 'test-execution-success',
          confidence: validation.accuracy
        }
      ],
      checkpoints: [
        {
          step: 'execution',
          status: validation.valid ? 'completed' : 'completed-with-warnings'
        }
      ],
      artifacts: [
        {
          kind: 'test-results',
          path: result.outputPath,
          sha256: result.hash
        }
      ],
      metrics: [
        { metric: 'tests_executed', value: result.tests.length, unit: 'count' },
        { metric: 'tests_passed', value: result.passed, unit: 'count' },
        { metric: 'tests_failed', value: result.failed, unit: 'count' },
        { metric: 'coverage_lines', value: result.coverage.lines, unit: 'percent' },
        { metric: 'execution_time', value: result.executionTime, unit: 'ms' }
      ]
    });

    // Store results in memory
    await this.storeSharedMemory('test-execution-results', {
      taskId: assignment.id,
      result,
      validation,
      timestamp: Date.now()
    });
  }

  // ============================================================================
  // Abstract Method Implementations
  // ============================================================================

  protected async initializeComponents(): Promise<void> {
    // Initialize test runner
  }

  protected async performTask(task: QETask): Promise<any> {
    // Load context bundle
    const bundle = await this.retrieveMemory(`task-${task.id}-bundle`);

    // Execute tests
    const startTime = Date.now();
    const result = await this.executeTests(task, bundle);
    const executionTime = Date.now() - startTime;

    return {
      ...result,
      executionTime,
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024 // MB
    };
  }

  protected async loadKnowledge(): Promise<void> {
    // Load test execution patterns
  }

  protected async cleanup(): Promise<void> {
    // Cleanup test artifacts
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private async getCoverageBaseline(): Promise<any> {
    const baseline = await this.retrieveMemory('coverage-baseline');
    return baseline || {
      lines: 85,
      branches: 80,
      functions: 85,
      statements: 85
    };
  }

  private async getPerformanceBaseline(): Promise<any> {
    const baseline = await this.retrieveMemory('performance-baseline');
    return baseline || {
      executionTime: 45000,
      memoryUsage: 400
    };
  }

  private async executeTests(task: QETask, bundle: any): Promise<any> {
    // Simplified test execution
    return {
      tests: [
        { name: 'test 1', status: 'passed' },
        { name: 'test 2', status: 'passed' }
      ],
      passed: 2,
      failed: 0,
      coverage: {
        lines: 95,
        branches: 90,
        functions: 92,
        statements: 94
      },
      metrics: {
        complexity: 8,
        maintainability: 75,
        duplication: 5
      },
      outputPath: 'test-results.json',
      hash: 'abc123...'
    };
  }
}
```

---

## Memory Coordination Patterns

### Producer-Consumer Pattern

```typescript
// Producer Agent (Test Generator)
export class TestGeneratorAgent extends BaseAgent {
  protected async onPostTask(data: any): Promise<void> {
    const { result } = data;

    // Store generated tests for executor
    await this.memoryStore.store('generated-tests', result.tests, {
      partition: 'test_queue',
      ttl: 3600, // 1 hour
      accessLevel: AccessLevel.SWARM
    });

    // Emit event
    this.eventBus.emit('tests:ready', {
      count: result.tests.length
    });
  }
}

// Consumer Agent (Test Executor)
export class TestExecutorAgent extends BaseAgent {
  constructor(config: BaseAgentConfig) {
    super(config);

    // Listen for tests ready event
    this.registerEventHandler({
      eventType: 'tests:ready',
      handler: async (event) => {
        // Retrieve tests from memory
        const tests = await this.memoryStore.retrieve('generated-tests', {
          partition: 'test_queue'
        });

        if (tests) {
          await this.executeTests(tests);
        }
      }
    });
  }

  private async executeTests(tests: any[]): Promise<void> {
    // Execute tests...
  }
}
```

### Coordinator-Worker Pattern

```typescript
// Coordinator Agent
export class FleetCoordinatorAgent extends BaseAgent {
  protected async performTask(task: QETask): Promise<any> {
    // Store coordination plan
    await this.memoryStore.store('coordination-plan', {
      phase: 'test-generation',
      requiredAgents: ['test-generator', 'test-executor', 'coverage-analyzer']
    }, {
      partition: 'coordination',
      accessLevel: AccessLevel.SWARM
    });

    // Broadcast to workers
    this.eventBus.emit('coordination:plan-ready', {
      phase: 'test-generation'
    });

    // Wait for workers to complete
    const results = await this.waitForWorkers();

    return results;
  }

  private async waitForWorkers(): Promise<any> {
    return new Promise((resolve) => {
      const results: any[] = [];

      this.registerEventHandler({
        eventType: 'worker:completed',
        handler: async (event) => {
          results.push(event.data);

          if (results.length === 3) {
            resolve(results);
          }
        }
      });
    });
  }
}

// Worker Agent
export class WorkerAgent extends BaseAgent {
  constructor(config: BaseAgentConfig) {
    super(config);

    this.registerEventHandler({
      eventType: 'coordination:plan-ready',
      handler: async (event) => {
        // Retrieve plan
        const plan = await this.memoryStore.retrieve('coordination-plan', {
          partition: 'coordination'
        });

        // Execute assigned work
        const result = await this.performWork(plan);

        // Report completion
        this.eventBus.emit('worker:completed', {
          agentId: this.agentId.id,
          result
        });
      }
    });
  }

  private async performWork(plan: any): Promise<any> {
    // Perform work...
    return { success: true };
  }
}
```

### Shared State Pattern

```typescript
export class SharedStateAgent extends BaseAgent {
  protected async onPreTask(data: any): Promise<void> {
    // Read shared state
    const state = await this.memoryStore.retrieve('fleet-state', {
      partition: 'shared_state',
      isSystemAgent: true // Bypass access control
    });

    this.logger.info('Current fleet state', { state });
  }

  protected async onPostTask(data: any): Promise<void> {
    // Update shared state
    await this.memoryStore.store('fleet-state', {
      phase: 'testing',
      progress: 75,
      updatedBy: this.agentId.id,
      timestamp: Date.now()
    }, {
      partition: 'shared_state',
      accessLevel: AccessLevel.PUBLIC
    });

    // Broadcast state change
    this.eventBus.emit('fleet:state-changed', {
      phase: 'testing',
      progress: 75
    });
  }
}
```

---

## Event-Driven Coordination

### Event Priority Handling

```typescript
export class PriorityHandlerAgent extends BaseAgent {
  constructor(config: BaseAgentConfig) {
    super(config);

    // Critical events (processed first)
    this.registerEventHandler({
      eventType: 'error:critical',
      handler: async (event) => {
        this.logger.error('Critical error detected', { event });
        await this.handleCriticalError(event.data);
      }
    });

    // High priority events
    this.registerEventHandler({
      eventType: 'test:failed',
      handler: async (event) => {
        this.logger.warn('Test failed', { event });
        await this.handleTestFailure(event.data);
      }
    });

    // Medium priority events
    this.registerEventHandler({
      eventType: 'test:completed',
      handler: async (event) => {
        this.logger.info('Test completed', { event });
        await this.handleTestCompletion(event.data);
      }
    });

    // Low priority events
    this.registerEventHandler({
      eventType: 'status:update',
      handler: async (event) => {
        this.logger.debug('Status update', { event });
        await this.handleStatusUpdate(event.data);
      }
    });
  }

  protected async performTask(task: QETask): Promise<any> {
    try {
      const result = await this.executeTask(task);

      // Emit with appropriate priority
      this.emitEvent('test:completed', result, 'medium');

      return result;
    } catch (error) {
      // Emit critical error
      this.emitEvent('error:critical', {
        error: error.message,
        taskId: task.id
      }, 'critical');

      throw error;
    }
  }

  private async handleCriticalError(data: any): Promise<void> {
    // Immediate action required
  }

  private async handleTestFailure(data: any): Promise<void> {
    // High priority action
  }

  private async handleTestCompletion(data: any): Promise<void> {
    // Normal processing
  }

  private async handleStatusUpdate(data: any): Promise<void> {
    // Background processing
  }

  private async executeTask(task: QETask): Promise<any> {
    return { success: true };
  }
}
```

### Event Filtering and Routing

```typescript
export class EventRouterAgent extends BaseAgent {
  constructor(config: BaseAgentConfig) {
    super(config);

    // Filter events by source
    this.registerEventHandler({
      eventType: 'test:completed',
      handler: async (event) => {
        // Only process events from test-executor agents
        if (event.source.type === 'test-executor') {
          await this.processTestCompletion(event.data);
        }
      }
    });

    // Filter events by data
    this.registerEventHandler({
      eventType: 'coverage:updated',
      handler: async (event) => {
        // Only process if coverage is below threshold
        if (event.data.coverage < 90) {
          await this.handleLowCoverage(event.data);
        }
      }
    });

    // Compound event handling
    this.registerEventHandler({
      eventType: 'test:completed',
      handler: async (event) => {
        // Wait for multiple events before processing
        await this.aggregateEvents(event);
      }
    });
  }

  private async processTestCompletion(data: any): Promise<void> {
    // Process completion
  }

  private async handleLowCoverage(data: any): Promise<void> {
    // Handle low coverage
  }

  private eventBuffer: any[] = [];

  private async aggregateEvents(event: any): Promise<void> {
    this.eventBuffer.push(event);

    // Process when we have 5 events
    if (this.eventBuffer.length >= 5) {
      await this.processBatch(this.eventBuffer);
      this.eventBuffer = [];
    }
  }

  private async processBatch(events: any[]): Promise<void> {
    // Batch processing
  }
}
```

---

## Error Handling Patterns

### Graceful Degradation

```typescript
export class ResilientAgent extends BaseAgent {
  protected async onTaskError(data: any): Promise<void> {
    const { assignment, error } = data;

    // Attempt recovery based on error type
    if (error.message.includes('ECONNREFUSED')) {
      await this.handleConnectionError(assignment);
    } else if (error.message.includes('ETIMEDOUT')) {
      await this.handleTimeoutError(assignment);
    } else if (error.message.includes('ENOMEM')) {
      await this.handleMemoryError(assignment);
    } else {
      await this.handleUnknownError(assignment, error);
    }
  }

  private async handleConnectionError(assignment: any): Promise<void> {
    // Retry with backoff
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      try {
        await this.sleep(Math.pow(2, retries) * 1000);
        const result = await this.performTask(assignment.task);

        // Success - store result
        await this.storeMemory(`task-${assignment.id}-result`, result);
        return;
      } catch (error) {
        retries++;
        this.logger.warn(`Retry ${retries}/${maxRetries}`, { error });
      }
    }

    // All retries failed - fallback
    await this.fallbackStrategy(assignment);
  }

  private async handleTimeoutError(assignment: any): Promise<void> {
    // Increase timeout and retry
    this.context.timeout = (this.context.timeout || 30000) * 2;
    await this.performTask(assignment.task);
  }

  private async handleMemoryError(assignment: any): Promise<void> {
    // Trigger garbage collection
    if (global.gc) {
      global.gc();
    }

    // Reduce batch size
    this.context.batchSize = Math.floor((this.context.batchSize || 10) / 2);

    // Retry with smaller batch
    await this.performTask(assignment.task);
  }

  private async handleUnknownError(assignment: any, error: Error): Promise<void> {
    // Store error for analysis
    await this.memoryStore.store(`errors/${assignment.id}`, {
      error: error.message,
      stack: error.stack,
      context: this.context
    }, {
      partition: 'errors',
      ttl: 604800
    });

    // Emit critical error event
    this.emitEvent('error:unknown', {
      agentId: this.agentId,
      error: error.message
    }, 'critical');
  }

  private async fallbackStrategy(assignment: any): Promise<void> {
    // Use cached results or default behavior
    this.logger.warn('Using fallback strategy', { taskId: assignment.id });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Circuit Breaker Pattern

```typescript
export class CircuitBreakerAgent extends BaseAgent {
  private circuitState: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold = 5;
  private readonly resetTimeout = 60000; // 1 minute

  protected async performTask(task: QETask): Promise<any> {
    // Check circuit state
    if (this.circuitState === 'open') {
      const timeSinceFailure = Date.now() - this.lastFailureTime;

      if (timeSinceFailure >= this.resetTimeout) {
        // Try half-open
        this.circuitState = 'half-open';
        this.logger.info('Circuit breaker half-open');
      } else {
        throw new Error('Circuit breaker open - service unavailable');
      }
    }

    try {
      const result = await this.executeWithCircuitBreaker(task);

      // Success - reset circuit
      if (this.circuitState === 'half-open') {
        this.circuitState = 'closed';
        this.failureCount = 0;
        this.logger.info('Circuit breaker closed');
      }

      return result;
    } catch (error) {
      this.handleCircuitBreakerFailure();
      throw error;
    }
  }

  private async executeWithCircuitBreaker(task: QETask): Promise<any> {
    // Actual task execution
    return { success: true };
  }

  private handleCircuitBreakerFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.circuitState = 'open';
      this.logger.error('Circuit breaker opened', {
        failureCount: this.failureCount
      });

      // Store circuit state
      this.storeMemory('circuit-state', {
        state: this.circuitState,
        failureCount: this.failureCount,
        timestamp: this.lastFailureTime
      });

      // Emit event
      this.emitEvent('circuit:opened', {
        agentId: this.agentId,
        failureCount: this.failureCount
      }, 'critical');
    }
  }
}
```

---

## Performance Optimization Tips

### Batch Operations

```typescript
export class BatchProcessorAgent extends BaseAgent {
  private batchSize = 10;
  private taskQueue: QETask[] = [];

  protected async performTask(task: QETask): Promise<any> {
    // Add to queue
    this.taskQueue.push(task);

    // Process when batch is full
    if (this.taskQueue.length >= this.batchSize) {
      return await this.processBatch();
    }

    return { queued: true };
  }

  private async processBatch(): Promise<any> {
    const batch = this.taskQueue.splice(0, this.batchSize);

    // Process all tasks in parallel
    const results = await Promise.all(
      batch.map(task => this.processTask(task))
    );

    // Store batch results
    await this.memoryStore.store(`batch-${Date.now()}`, results, {
      partition: 'batch_results',
      ttl: 3600
    });

    return { processed: results.length };
  }

  private async processTask(task: QETask): Promise<any> {
    // Individual task processing
    return { taskId: task.id, success: true };
  }
}
```

### Caching with Memory Store

```typescript
export class CachingAgent extends BaseAgent {
  protected async performTask(task: QETask): Promise<any> {
    const cacheKey = `cache:${task.type}:${task.id}`;

    // Check cache first
    const cached = await this.memoryStore.retrieve(cacheKey, {
      partition: 'cache'
    });

    if (cached) {
      this.logger.debug('Cache hit', { taskId: task.id });
      return cached;
    }

    // Cache miss - compute result
    this.logger.debug('Cache miss', { taskId: task.id });
    const result = await this.computeResult(task);

    // Store in cache with TTL
    await this.memoryStore.store(cacheKey, result, {
      partition: 'cache',
      ttl: 3600 // 1 hour
    });

    return result;
  }

  private async computeResult(task: QETask): Promise<any> {
    // Expensive computation
    return { taskId: task.id, computed: true };
  }
}
```

### Parallel Execution

```typescript
export class ParallelExecutorAgent extends BaseAgent {
  protected async performTask(task: QETask): Promise<any> {
    // Split task into subtasks
    const subtasks = this.splitTask(task);

    // Execute all subtasks in parallel
    const results = await Promise.all(
      subtasks.map(subtask => this.executeSubtask(subtask))
    );

    // Aggregate results
    return this.aggregateResults(results);
  }

  private splitTask(task: QETask): QETask[] {
    // Split logic
    return [task, task, task]; // Example: 3 subtasks
  }

  private async executeSubtask(subtask: QETask): Promise<any> {
    // Subtask execution
    return { subtaskId: subtask.id, success: true };
  }

  private aggregateResults(results: any[]): any {
    return {
      totalSubtasks: results.length,
      success: results.every(r => r.success)
    };
  }
}
```

---

## Complete Agent Examples

### Test Generator Agent (Full Implementation)

See [AQE-HOOKS-GUIDE.md](../AQE-HOOKS-GUIDE.md) for complete examples of:
- Test Generator Agent with lifecycle hooks
- Test Executor Agent with VerificationHookManager
- Coverage Analyzer Agent with memory coordination
- Quality Gate Agent with event-driven coordination

### QE Agent Types

All QE agents follow these patterns:

1. **qe-test-generator** - Uses lifecycle hooks for test generation
2. **qe-test-executor** - Uses VerificationHookManager for execution
3. **qe-coverage-analyzer** - Uses memory coordination patterns
4. **qe-quality-gate** - Uses event-driven coordination
5. **qe-performance-tester** - Uses batch processing and caching
6. **qe-security-scanner** - Uses circuit breaker pattern
7. **qe-fleet-commander** - Uses coordinator-worker pattern

---

**Next Steps**:
- Read [AQE Hooks Guide](../AQE-HOOKS-GUIDE.md) for comprehensive documentation
- Explore [Hooks API Reference](../../src/core/hooks/README.md)
- Study [Migration Plan](../HOOKS-MIGRATION-PLAN.md) for transition details

**Version**: 1.0.2
**Last Updated**: 2025-10-08
**Maintained By**: Agentic QE Fleet Team
