# Phase 1 (v1.3.7) MCP Tools Test Coverage - Implementation Plan

**Issue**: #26 - MCP Tools Test Coverage Gap - 35/54 Tools Missing Unit Tests
**Target Release**: v1.3.7
**Objective**: Add comprehensive unit tests for 5 high-priority MCP tools
**Estimated Effort**: 16-20 hours
**Created**: 2025-11-01
**Owner**: Coder Agent

---

## Executive Summary

Phase 1 focuses on testing the 5 highest-priority MCP tools that form the core of the Agentic QE Fleet:
1. ✅ **fleet-init** - Already has comprehensive tests (463 lines)
2. ✅ **agent-spawn** - Already has comprehensive tests (430 lines)
3. ⚠️  **test-execute** - Needs comprehensive tests (currently 1 stub test)
4. ⚠️  **task-orchestrate** - Needs comprehensive tests (currently 1 stub test)
5. ⚠️  **quality-gate-execute** - Needs comprehensive tests (part of QualityTools suite)

**Status**: 2/5 complete, 3/5 need implementation

---

## Test File Structure Analysis

### Existing Test Pattern (from fleet-init.test.ts and agent-spawn.test.ts)

```typescript
/**
 * [Handler Name] Test Suite
 *
 * Comprehensive tests for [tool-name] MCP tool handler.
 * Tests [brief description].
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HandlerClass, HandlerArgs, HandlerResult } from '@mcp/handlers/[path]';
import { AgentRegistry } from '@mcp/services/AgentRegistry';
import { HookExecutor } from '@mcp/services/HookExecutor';

// Mock services
vi.mock('../../../src/mcp/services/AgentRegistry.js');
vi.mock('../../../src/mcp/services/HookExecutor.js');
vi.mock('../../../src/utils/SecureRandom.js', () => ({
  SecureRandom: {
    generateId: vi.fn(() => 'test-id')
  }
}));

describe('HandlerClass', () => {
  let handler: HandlerClass;
  let mockAgentRegistry: AgentRegistry;
  let mockHookExecutor: HookExecutor;

  beforeEach(() => {
    // Setup mocks
    mockAgentRegistry = { /* mock methods */ } as any;
    mockHookExecutor = { /* mock methods */ } as any;
    handler = new HandlerClass(mockAgentRegistry, mockHookExecutor);
  });

  describe('Happy Path - [Feature]', () => {
    // Success scenarios with valid inputs
  });

  describe('Input Validation', () => {
    // Test parameter validation
  });

  describe('Coordination Setup', () => {
    // Test hook integration
  });

  describe('Error Handling', () => {
    // Test error scenarios
  });

  describe('Edge Cases', () => {
    // Test boundary conditions
  });

  describe('Performance', () => {
    // Test execution time
  });
});
```

### Test Coverage Metrics (Target for Phase 1)

| Handler | Lines in Handler | Target Test Lines | Test Sections | Mock Dependencies |
|---------|------------------|-------------------|---------------|-------------------|
| fleet-init ✅ | 206 | 463 (complete) | 8 | AgentRegistry, HookExecutor, SecureRandom |
| agent-spawn ✅ | ~250 | 430 (complete) | 7 | AgentRegistry, HookExecutor, SecureRandom |
| test-execute ⚠️ | 613 | ~600 | 10 | AgentRegistry, HookExecutor, TestFrameworkExecutor |
| task-orchestrate ⚠️ | 800+ | ~750 | 10 | AgentRegistry, HookExecutor, WorkflowEngine |
| quality-gate-execute ⚠️ | 666 | ~650 | 9 | AgentRegistry, HookExecutor |

**Coverage Ratio**: ~1:1 (test lines : handler lines) for comprehensive coverage

---

## 1. test-execute Handler - Test Implementation Plan

### File Location
`/workspaces/agentic-qe-cf/tests/mcp/handlers/test-execute.test.ts`

### Handler Analysis
- **Location**: `/workspaces/agentic-qe-cf/src/mcp/handlers/test-execute.ts`
- **Lines of Code**: 613
- **Complexity**: High (parallel execution, queue management, agent coordination)
- **Key Features**:
  - Parallel and sequential test execution
  - Test suite orchestration with agents
  - Coverage analysis integration
  - Performance metrics tracking
  - Artifact generation
  - Hook integration (pre-task, post-task, notify)

### Test Scenarios (10 sections, ~600 lines)

#### Section 1: Happy Path - Test Execution (100 lines)
```typescript
describe('Happy Path - Test Execution', () => {
  it('should execute single test suite successfully', async () => {
    const args: TestExecuteArgs = {
      spec: {
        testSuites: ['tests/unit/user.test.js'],
        parallelExecution: false,
        retryCount: 1,
        timeoutSeconds: 30,
        reportFormat: 'json'
      }
    };

    const response = await handler.handle(args);

    expect(response.success).toBe(true);
    expect(response.data.status).toBe('completed');
    expect(response.data.results.summary.total).toBeGreaterThan(0);
  });

  it('should execute multiple test suites in parallel', async () => {
    const args: TestExecuteArgs = {
      spec: {
        testSuites: ['tests/unit/*.test.js', 'tests/integration/*.test.js'],
        parallelExecution: true,
        retryCount: 2,
        timeoutSeconds: 60,
        reportFormat: 'html'
      }
    };

    const response = await handler.handle(args);

    expect(response.success).toBe(true);
    expect(response.data.spec.parallelExecution).toBe(true);
    expect(response.data.results.suiteResults.length).toBe(2);
  });

  it('should execute tests sequentially', async () => {
    const args: TestExecuteArgs = {
      spec: {
        testSuites: ['suite1', 'suite2', 'suite3'],
        parallelExecution: false,
        retryCount: 0,
        timeoutSeconds: 120,
        reportFormat: 'junit'
      }
    };

    const response = await handler.handle(args);

    expect(response.success).toBe(true);
    expect(response.data.status).toBe('completed');
  });

  it('should execute tests with fleet coordination', async () => {
    const args: TestExecuteArgs = {
      spec: {
        testSuites: ['suite1', 'suite2'],
        parallelExecution: true,
        retryCount: 1,
        timeoutSeconds: 60,
        reportFormat: 'json',
        environments: ['staging', 'production']
      },
      fleetId: 'fleet-12345'
    };

    const response = await handler.handle(args);

    expect(response.success).toBe(true);
    expect(response.data.fleetId).toBe('fleet-12345');
    expect(response.data.agentAssignments.length).toBeGreaterThan(0);
  });

  it('should generate coverage reports', async () => {
    const args: TestExecuteArgs = {
      spec: {
        testSuites: ['tests/**/*.test.js'],
        parallelExecution: true,
        retryCount: 1,
        timeoutSeconds: 90,
        reportFormat: 'json'
      }
    };

    const response = await handler.handle(args);

    expect(response.data.results.coverage).toBeDefined();
    expect(response.data.results.coverage?.overall).toBeGreaterThan(0);
    expect(response.data.results.coverage?.passed).toBeDefined();
  });
});
```

#### Section 2: Input Validation (80 lines)
```typescript
describe('Input Validation', () => {
  it('should reject missing spec parameter', async () => {
    const args = {} as TestExecuteArgs;

    const response = await handler.handle(args);

    expect(response.success).toBe(false);
    expect(response.error).toContain('spec');
  });

  it('should reject empty test suites array', async () => {
    const args: TestExecuteArgs = {
      spec: {
        testSuites: [],
        parallelExecution: false,
        retryCount: 1,
        timeoutSeconds: 30,
        reportFormat: 'json'
      }
    };

    const response = await handler.handle(args);

    expect(response.success).toBe(false);
    expect(response.error).toMatch(/test suite.*required/i);
  });

  it('should reject invalid retry count', async () => {
    const args: TestExecuteArgs = {
      spec: {
        testSuites: ['test.js'],
        parallelExecution: false,
        retryCount: 10, // Max is 5
        timeoutSeconds: 30,
        reportFormat: 'json'
      }
    };

    const response = await handler.handle(args);

    expect(response.success).toBe(false);
    expect(response.error).toMatch(/retry.*between 0 and 5/i);
  });

  it('should reject timeout below minimum', async () => {
    const args: TestExecuteArgs = {
      spec: {
        testSuites: ['test.js'],
        parallelExecution: false,
        retryCount: 1,
        timeoutSeconds: 5, // Min is 10
        reportFormat: 'json'
      }
    };

    const response = await handler.handle(args);

    expect(response.success).toBe(false);
    expect(response.error).toMatch(/timeout.*at least 10/i);
  });

  it('should validate report format', async () => {
    const args: TestExecuteArgs = {
      spec: {
        testSuites: ['test.js'],
        parallelExecution: false,
        retryCount: 1,
        timeoutSeconds: 30,
        reportFormat: 'invalid-format' as any
      }
    };

    const response = await handler.handle(args);

    expect(response.success).toBe(false);
    expect(response.error).toMatch(/report format/i);
  });
});
```

#### Section 3: Agent Coordination (90 lines)
```typescript
describe('Agent Coordination', () => {
  it('should spawn test-executor agent', async () => {
    const args: TestExecuteArgs = {
      spec: {
        testSuites: ['test.js'],
        parallelExecution: false,
        retryCount: 1,
        timeoutSeconds: 30,
        reportFormat: 'json'
      }
    };

    const response = await handler.handle(args);

    expect(mockAgentRegistry.spawnAgent).toHaveBeenCalledWith(
      'test-executor',
      expect.objectContaining({})
    );
    expect(response.success).toBe(true);
  });

  it('should assign agents for fleet execution', async () => {
    const args: TestExecuteArgs = {
      spec: {
        testSuites: ['suite1', 'suite2', 'suite3'],
        parallelExecution: true,
        retryCount: 1,
        timeoutSeconds: 60,
        reportFormat: 'json',
        environments: ['dev', 'staging']
      },
      fleetId: 'fleet-123'
    };

    const response = await handler.handle(args);

    expect(response.data.agentAssignments).toBeDefined();
    expect(response.data.agentAssignments.length).toBe(3);
    response.data.agentAssignments.forEach(assignment => {
      expect(assignment.status).toBe('completed');
      expect(assignment.environment).toBeDefined();
    });
  });

  it('should distribute suites across agents evenly', async () => {
    const args: TestExecuteArgs = {
      spec: {
        testSuites: ['s1', 's2', 's3', 's4', 's5', 's6'],
        parallelExecution: true,
        retryCount: 0,
        timeoutSeconds: 60,
        reportFormat: 'json'
      },
      fleetId: 'fleet-123'
    };

    const response = await handler.handle(args);

    const assignments = response.data.agentAssignments;
    expect(assignments.length).toBe(6);
  });

  it('should call pre-task hook before execution', async () => {
    const args: TestExecuteArgs = {
      spec: {
        testSuites: ['test.js'],
        parallelExecution: false,
        retryCount: 1,
        timeoutSeconds: 30,
        reportFormat: 'json'
      }
    };

    await handler.handle(args);

    expect(mockHookExecutor.executePreTask).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining('Executing tests'),
        agentType: 'test-executor'
      })
    );
  });

  it('should call post-task hook after execution', async () => {
    const args: TestExecuteArgs = {
      spec: {
        testSuites: ['test.js'],
        parallelExecution: false,
        retryCount: 1,
        timeoutSeconds: 30,
        reportFormat: 'json'
      }
    };

    await handler.handle(args);

    expect(mockHookExecutor.executePostTask).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        results: expect.any(Object)
      })
    );
  });

  it('should send notify hook after completion', async () => {
    const args: TestExecuteArgs = {
      spec: {
        testSuites: ['test.js'],
        parallelExecution: false,
        retryCount: 1,
        timeoutSeconds: 30,
        reportFormat: 'json'
      }
    };

    await handler.handle(args);

    expect(mockHookExecutor.executeHook).toHaveBeenCalledWith(
      'notify',
      expect.objectContaining({
        message: expect.stringContaining('completed'),
        level: 'info'
      })
    );
  });
});
```

#### Section 4: Parallel Execution (70 lines)
```typescript
describe('Parallel Execution', () => {
  it('should execute suites in parallel', async () => {
    const args: TestExecuteArgs = {
      spec: {
        testSuites: ['suite1', 'suite2', 'suite3'],
        parallelExecution: true,
        retryCount: 1,
        timeoutSeconds: 60,
        reportFormat: 'json'
      }
    };

    const startTime = Date.now();
    const response = await handler.handle(args);
    const duration = Date.now() - startTime;

    expect(response.success).toBe(true);
    expect(response.data.results.suiteResults.length).toBe(3);
    // Parallel should be faster than sequential
    expect(duration).toBeLessThan(5000);
  });

  it('should handle partial failures in parallel execution', async () => {
    // Mock one suite to fail
    mockTestFrameworkExecutor.execute = vi.fn()
      .mockResolvedValueOnce({ status: 'passed', tests: [] })
      .mockRejectedValueOnce(new Error('Suite failed'))
      .mockResolvedValueOnce({ status: 'passed', tests: [] });

    const args: TestExecuteArgs = {
      spec: {
        testSuites: ['suite1', 'suite2', 'suite3'],
        parallelExecution: true,
        retryCount: 0,
        timeoutSeconds: 60,
        reportFormat: 'json'
      }
    };

    const response = await handler.handle(args);

    expect(response.success).toBe(true);
    expect(response.data.status).toBe('completed');
    const failedSuites = response.data.results.suiteResults.filter(s => s.status === 'failed');
    expect(failedSuites.length).toBe(1);
  });

  it('should calculate parallelism efficiency', async () => {
    const args: TestExecuteArgs = {
      spec: {
        testSuites: ['s1', 's2', 's3', 's4'],
        parallelExecution: true,
        retryCount: 0,
        timeoutSeconds: 60,
        reportFormat: 'json'
      }
    };

    const response = await handler.handle(args);

    expect(response.data.results.performance.parallelismEfficiency).toBeDefined();
    expect(response.data.results.performance.parallelismEfficiency).toBeGreaterThan(0);
  });
});
```

#### Section 5: Sequential Execution (50 lines)
```typescript
describe('Sequential Execution', () => {
  it('should execute suites sequentially', async () => {
    const executionOrder: string[] = [];

    mockTestFrameworkExecutor.execute = vi.fn().mockImplementation(async (config) => {
      executionOrder.push(config.testPattern);
      await new Promise(resolve => setTimeout(resolve, 100));
      return { status: 'passed', tests: [] };
    });

    const args: TestExecuteArgs = {
      spec: {
        testSuites: ['suite1', 'suite2', 'suite3'],
        parallelExecution: false,
        retryCount: 0,
        timeoutSeconds: 60,
        reportFormat: 'json'
      }
    };

    const response = await handler.handle(args);

    expect(response.success).toBe(true);
    expect(executionOrder).toEqual(['suite1', 'suite2', 'suite3']);
  });

  it('should stop on first failure in sequential mode (if configured)', async () => {
    mockTestFrameworkExecutor.execute = vi.fn()
      .mockResolvedValueOnce({ status: 'passed', tests: [] })
      .mockRejectedValueOnce(new Error('Suite failed'))
      .mockResolvedValueOnce({ status: 'passed', tests: [] });

    const args: TestExecuteArgs = {
      spec: {
        testSuites: ['suite1', 'suite2', 'suite3'],
        parallelExecution: false,
        retryCount: 0,
        timeoutSeconds: 60,
        reportFormat: 'json',
        stopOnFailure: true
      }
    };

    const response = await handler.handle(args);

    expect(response.data.results.suiteResults.length).toBeLessThanOrEqual(2);
  });
});
```

#### Section 6: Queue Management (60 lines)
```typescript
describe('Queue Management', () => {
  it('should queue executions when at max concurrency', async () => {
    // Start 5 concurrent executions (max)
    const promises = Array.from({ length: 6 }, (_, i) =>
      handler.handle({
        spec: {
          testSuites: [`suite${i}`],
          parallelExecution: false,
          retryCount: 0,
          timeoutSeconds: 30,
          reportFormat: 'json'
        }
      })
    );

    const results = await Promise.all(promises);

    // All should complete successfully
    results.forEach(result => {
      expect(result.success).toBe(true);
    });
  });

  it('should process queue after execution completes', async () => {
    const execution1 = await handler.handle({
      spec: {
        testSuites: ['suite1'],
        parallelExecution: false,
        retryCount: 0,
        timeoutSeconds: 30,
        reportFormat: 'json'
      }
    });

    expect(execution1.success).toBe(true);

    // Queue should be processed
    const execution2 = await handler.handle({
      spec: {
        testSuites: ['suite2'],
        parallelExecution: false,
        retryCount: 0,
        timeoutSeconds: 30,
        reportFormat: 'json'
      }
    });

    expect(execution2.success).toBe(true);
  });
});
```

#### Section 7: Results and Metrics (70 lines)
```typescript
describe('Results and Metrics', () => {
  it('should calculate test summary correctly', async () => {
    const args: TestExecuteArgs = {
      spec: {
        testSuites: ['tests/**/*.test.js'],
        parallelExecution: false,
        retryCount: 1,
        timeoutSeconds: 60,
        reportFormat: 'json'
      }
    };

    const response = await handler.handle(args);

    const summary = response.data.results.summary;
    expect(summary.total).toBeGreaterThan(0);
    expect(summary.passed + summary.failed + summary.skipped).toBe(summary.total);
  });

  it('should generate performance metrics', async () => {
    const args: TestExecuteArgs = {
      spec: {
        testSuites: ['test.js'],
        parallelExecution: true,
        retryCount: 0,
        timeoutSeconds: 60,
        reportFormat: 'json'
      }
    };

    const response = await handler.handle(args);

    const perf = response.data.results.performance;
    expect(perf.totalExecutionTime).toBeGreaterThan(0);
    expect(perf.averageTestTime).toBeGreaterThan(0);
    expect(perf.resourceUtilization).toBeDefined();
    expect(perf.resourceUtilization.cpu).toBeGreaterThan(0);
  });

  it('should generate artifacts', async () => {
    const args: TestExecuteArgs = {
      spec: {
        testSuites: ['test.js'],
        parallelExecution: false,
        retryCount: 0,
        timeoutSeconds: 60,
        reportFormat: 'html'
      }
    };

    const response = await handler.handle(args);

    const artifacts = response.data.results.artifacts;
    expect(artifacts.length).toBeGreaterThan(0);
    expect(artifacts.some(a => a.type === 'report')).toBe(true);
    expect(artifacts.some(a => a.type === 'coverage')).toBe(true);
  });
});
```

#### Section 8: Error Handling (80 lines)
```typescript
describe('Error Handling', () => {
  it('should handle registry failures gracefully', async () => {
    const mockFailingRegistry = {
      spawnAgent: vi.fn().mockRejectedValue(new Error('Registry unavailable'))
    } as any;

    const failingHandler = new TestExecuteHandler(mockFailingRegistry, mockHookExecutor);

    const args: TestExecuteArgs = {
      spec: {
        testSuites: ['test.js'],
        parallelExecution: false,
        retryCount: 1,
        timeoutSeconds: 30,
        reportFormat: 'json'
      }
    };

    const response = await failingHandler.handle(args);

    expect(response.success).toBe(false);
    expect(response.error).toContain('Registry unavailable');
  });

  it('should handle test framework executor failures', async () => {
    mockTestFrameworkExecutor.execute = vi.fn()
      .mockRejectedValue(new Error('Test execution failed'));

    const args: TestExecuteArgs = {
      spec: {
        testSuites: ['test.js'],
        parallelExecution: false,
        retryCount: 0,
        timeoutSeconds: 30,
        reportFormat: 'json'
      }
    };

    const response = await handler.handle(args);

    // Handler should complete but mark suite as failed
    expect(response.success).toBe(true);
    expect(response.data.status).toBe('completed');
    const failedSuites = response.data.results.suiteResults.filter(s => s.status === 'failed');
    expect(failedSuites.length).toBe(1);
  });

  it('should handle timeout errors', async () => {
    mockTestFrameworkExecutor.execute = vi.fn()
      .mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100000)));

    const args: TestExecuteArgs = {
      spec: {
        testSuites: ['test.js'],
        parallelExecution: false,
        retryCount: 0,
        timeoutSeconds: 1, // Will timeout
        reportFormat: 'json'
      }
    };

    const response = await handler.handle(args);

    expect(response.data.status).toBe('failed');
  });

  it('should call post-task hook on failure', async () => {
    mockAgentRegistry.spawnAgent = vi.fn()
      .mockRejectedValue(new Error('Spawn failed'));

    const args: TestExecuteArgs = {
      spec: {
        testSuites: ['test.js'],
        parallelExecution: false,
        retryCount: 0,
        timeoutSeconds: 30,
        reportFormat: 'json'
      }
    };

    await handler.handle(args);

    expect(mockHookExecutor.executePostTask).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed'
      })
    );
  });
});
```

#### Section 9: Edge Cases (60 lines)
```typescript
describe('Edge Cases', () => {
  it('should handle single test suite', async () => {
    const args: TestExecuteArgs = {
      spec: {
        testSuites: ['single-test.js'],
        parallelExecution: true,
        retryCount: 0,
        timeoutSeconds: 30,
        reportFormat: 'json'
      }
    };

    const response = await handler.handle(args);

    expect(response.success).toBe(true);
    expect(response.data.results.suiteResults.length).toBe(1);
  });

  it('should handle very large test suites', async () => {
    const suites = Array.from({ length: 100 }, (_, i) => `suite${i}.test.js`);

    const args: TestExecuteArgs = {
      spec: {
        testSuites: suites,
        parallelExecution: true,
        retryCount: 0,
        timeoutSeconds: 300,
        reportFormat: 'json'
      }
    };

    const response = await handler.handle(args);

    expect(response.success).toBe(true);
    expect(response.data.results.suiteResults.length).toBe(100);
  });

  it('should handle special characters in suite names', async () => {
    const args: TestExecuteArgs = {
      spec: {
        testSuites: ['tests/[special].test.js', 'tests/(group)/test.js'],
        parallelExecution: false,
        retryCount: 0,
        timeoutSeconds: 30,
        reportFormat: 'json'
      }
    };

    const response = await handler.handle(args);

    expect(response.success).toBe(true);
  });
});
```

#### Section 10: Performance (40 lines)
```typescript
describe('Performance', () => {
  it('should complete execution within reasonable time', async () => {
    const args: TestExecuteArgs = {
      spec: {
        testSuites: ['test1.js', 'test2.js'],
        parallelExecution: true,
        retryCount: 0,
        timeoutSeconds: 60,
        reportFormat: 'json'
      }
    };

    const startTime = Date.now();
    const response = await handler.handle(args);
    const duration = Date.now() - startTime;

    expect(response.success).toBe(true);
    expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
  });

  it('should track execution time in results', async () => {
    const args: TestExecuteArgs = {
      spec: {
        testSuites: ['test.js'],
        parallelExecution: false,
        retryCount: 0,
        timeoutSeconds: 30,
        reportFormat: 'json'
      }
    };

    const response = await handler.handle(args);

    expect(response.data.executionTime).toBeDefined();
    expect(response.data.executionTime).toBeGreaterThan(0);
  });
});
```

### Mock Requirements

```typescript
// Mock AgentRegistry
mockAgentRegistry = {
  spawnAgent: vi.fn().mockResolvedValue({
    id: 'agent-test-executor-1',
    type: 'test-executor',
    status: 'active'
  }),
  getStatistics: vi.fn().mockReturnValue({ totalAgents: 1 })
} as any;

// Mock HookExecutor
mockHookExecutor = {
  executePreTask: vi.fn().mockResolvedValue(undefined),
  executePostTask: vi.fn().mockResolvedValue(undefined),
  executeHook: vi.fn().mockResolvedValue(undefined),
  notify: vi.fn().mockResolvedValue(undefined)
} as any;

// Mock TestFrameworkExecutor
vi.mock('../../../src/utils/TestFrameworkExecutor.js', () => ({
  TestFrameworkExecutor: vi.fn().mockImplementation(() => ({
    detectFramework: vi.fn().mockResolvedValue('jest'),
    execute: vi.fn().mockResolvedValue({
      status: 'passed',
      tests: [
        {
          name: 'test 1',
          status: 'passed',
          duration: 100,
          failureMessages: []
        }
      ]
    })
  }))
}));
```

### Estimated Effort
- **Lines of Code**: ~600
- **Sections**: 10
- **Complexity**: High
- **Estimated Time**: 6-8 hours

---

## 2. task-orchestrate Handler - Test Implementation Plan

### File Location
`/workspaces/agentic-qe-cf/tests/mcp/handlers/task-orchestrate.test.ts` (replace existing stub)

### Handler Analysis
- **Location**: `/workspaces/agentic-qe-cf/src/mcp/handlers/task-orchestrate.ts`
- **Lines of Code**: 800+
- **Complexity**: Very High (workflow orchestration, dependencies, DAG execution)
- **Key Features**:
  - Complex workflow orchestration with dependencies
  - Parallel, sequential, and adaptive execution strategies
  - Task priority management
  - Agent task assignments
  - Progress tracking
  - Workflow step execution with DAG resolution

### Test Scenarios (10 sections, ~750 lines)

#### Section 1: Happy Path - Task Orchestration (100 lines)
```typescript
describe('Happy Path - Task Orchestration', () => {
  it('should orchestrate comprehensive-testing task successfully', async () => {
    const args: TaskOrchestrateArgs = {
      task: {
        type: 'comprehensive-testing',
        priority: 'high',
        strategy: 'parallel',
        maxAgents: 5,
        timeoutMinutes: 30
      },
      context: {
        project: 'test-project',
        branch: 'main',
        environment: 'development'
      }
    };

    const response = await handler.handle(args);

    expect(response.success).toBe(true);
    expect(response.data.type).toBe('comprehensive-testing');
    expect(response.data.status).toBe('completed');
    expect(response.data.workflow.length).toBeGreaterThan(0);
  });

  it('should orchestrate quality-gate task', async () => {
    const args: TaskOrchestrateArgs = {
      task: {
        type: 'quality-gate',
        priority: 'critical',
        strategy: 'sequential',
        maxAgents: 3,
        timeoutMinutes: 15
      }
    };

    const response = await handler.handle(args);

    expect(response.success).toBe(true);
    expect(response.data.type).toBe('quality-gate');
  });

  it('should orchestrate defect-prevention task', async () => {
    const args: TaskOrchestrateArgs = {
      task: {
        type: 'defect-prevention',
        priority: 'medium',
        strategy: 'adaptive',
        maxAgents: 4,
        timeoutMinutes: 20
      }
    };

    const response = await handler.handle(args);

    expect(response.success).toBe(true);
    expect(response.data.strategy).toBe('adaptive');
  });

  it('should orchestrate performance-validation task', async () => {
    const args: TaskOrchestrateArgs = {
      task: {
        type: 'performance-validation',
        priority: 'high',
        strategy: 'parallel',
        maxAgents: 6,
        timeoutMinutes: 45
      }
    };

    const response = await handler.handle(args);

    expect(response.success).toBe(true);
    expect(response.data.results.summary.success).toBeDefined();
  });
});
```

#### Section 2: Execution Strategies (120 lines)
```typescript
describe('Execution Strategies', () => {
  it('should execute parallel strategy correctly', async () => {
    const args: TaskOrchestrateArgs = {
      task: {
        type: 'comprehensive-testing',
        priority: 'high',
        strategy: 'parallel',
        maxAgents: 5,
        timeoutMinutes: 30
      }
    };

    const response = await handler.handle(args);

    expect(response.data.strategy).toBe('parallel');
    expect(response.data.assignments.length).toBeGreaterThan(0);
    // Check that independent steps ran in parallel
    const stepDurations = response.data.workflow.map(s => s.estimatedDuration);
    const totalDuration = response.data.results.summary.totalDuration;
    const sequentialDuration = stepDurations.reduce((sum, d) => sum + d, 0);
    expect(totalDuration).toBeLessThan(sequentialDuration);
  });

  it('should execute sequential strategy correctly', async () => {
    const args: TaskOrchestrateArgs = {
      task: {
        type: 'quality-gate',
        priority: 'high',
        strategy: 'sequential',
        maxAgents: 3,
        timeoutMinutes: 20
      }
    };

    const response = await handler.handle(args);

    expect(response.data.strategy).toBe('sequential');
    // Verify steps completed in order
    const completedSteps = response.data.workflow.filter(s => s.status === 'completed');
    expect(completedSteps.length).toBe(response.data.workflow.length);
  });

  it('should execute adaptive strategy based on complexity', async () => {
    const args: TaskOrchestrateArgs = {
      task: {
        type: 'comprehensive-testing',
        priority: 'medium',
        strategy: 'adaptive',
        maxAgents: 4,
        timeoutMinutes: 25
      }
    };

    const response = await handler.handle(args);

    expect(response.data.strategy).toBe('adaptive');
    // Adaptive should optimize based on dependencies
    expect(response.data.results.metrics.strategyEfficiency).toBeGreaterThan(0.8);
  });

  it('should respect maxAgents limit', async () => {
    const args: TaskOrchestrateArgs = {
      task: {
        type: 'comprehensive-testing',
        priority: 'high',
        strategy: 'parallel',
        maxAgents: 2, // Limit to 2 agents
        timeoutMinutes: 30
      }
    };

    const response = await handler.handle(args);

    const activeAgents = response.data.assignments.filter(a => a.status !== 'assigned').length;
    expect(activeAgents).toBeLessThanOrEqual(2);
  });
});
```

#### Section 3: Workflow Dependencies (100 lines)
```typescript
describe('Workflow Dependencies', () => {
  it('should resolve workflow DAG correctly', async () => {
    const args: TaskOrchestrateArgs = {
      task: {
        type: 'comprehensive-testing',
        priority: 'high',
        strategy: 'parallel',
        maxAgents: 5,
        timeoutMinutes: 30
      }
    };

    const response = await handler.handle(args);

    // Verify dependencies were respected
    response.data.workflow.forEach(step => {
      if (step.dependencies.length > 0) {
        step.dependencies.forEach(depId => {
          const depStep = response.data.workflow.find(s => s.id === depId);
          expect(depStep?.status).toBe('completed');
        });
      }
    });
  });

  it('should execute dependent steps after prerequisites', async () => {
    const args: TaskOrchestrateArgs = {
      task: {
        type: 'quality-gate',
        priority: 'high',
        strategy: 'sequential',
        maxAgents: 3,
        timeoutMinutes: 20
      }
    };

    const response = await handler.handle(args);

    // Find steps with dependencies
    const dependentSteps = response.data.workflow.filter(s => s.dependencies.length > 0);
    dependentSteps.forEach(step => {
      expect(step.status).toMatch(/completed|failed/);
    });
  });

  it('should skip steps when dependencies fail', async () => {
    // Mock a step failure
    mockWorkflowEngine.executeStep = vi.fn()
      .mockResolvedValueOnce({ status: 'failed' })
      .mockResolvedValueOnce({ status: 'skipped' });

    const args: TaskOrchestrateArgs = {
      task: {
        type: 'comprehensive-testing',
        priority: 'high',
        strategy: 'sequential',
        maxAgents: 3,
        timeoutMinutes: 20
      }
    };

    const response = await handler.handle(args);

    const skippedSteps = response.data.workflow.filter(s => s.status === 'skipped');
    expect(skippedSteps.length).toBeGreaterThan(0);
  });
});
```

#### Section 4: Agent Assignment (90 lines)
```typescript
describe('Agent Assignment', () => {
  it('should assign agents based on task type', async () => {
    const args: TaskOrchestrateArgs = {
      task: {
        type: 'comprehensive-testing',
        priority: 'high',
        strategy: 'parallel',
        maxAgents: 5,
        timeoutMinutes: 30
      }
    };

    const response = await handler.handle(args);

    expect(response.data.assignments.length).toBeGreaterThan(0);
    response.data.assignments.forEach(assignment => {
      expect(assignment.agentId).toBeDefined();
      expect(assignment.agentType).toBeDefined();
      expect(assignment.tasks.length).toBeGreaterThan(0);
    });
  });

  it('should balance workload across agents', async () => {
    const args: TaskOrchestrateArgs = {
      task: {
        type: 'comprehensive-testing',
        priority: 'high',
        strategy: 'parallel',
        maxAgents: 4,
        timeoutMinutes: 30
      },
      fleetId: 'fleet-123'
    };

    const response = await handler.handle(args);

    // Check that tasks are distributed relatively evenly
    const taskCounts = response.data.assignments.map(a => a.tasks.length);
    const maxTasks = Math.max(...taskCounts);
    const minTasks = Math.min(...taskCounts);
    expect(maxTasks - minTasks).toBeLessThanOrEqual(2);
  });

  it('should track agent assignment status', async () => {
    const args: TaskOrchestrateArgs = {
      task: {
        type: 'quality-gate',
        priority: 'high',
        strategy: 'sequential',
        maxAgents: 3,
        timeoutMinutes: 15
      }
    };

    const response = await handler.handle(args);

    response.data.assignments.forEach(assignment => {
      expect(['assigned', 'running', 'completed', 'failed']).toContain(assignment.status);
      if (assignment.status === 'completed') {
        expect(assignment.completedAt).toBeDefined();
      }
    });
  });
});
```

#### Section 5: Progress Tracking (80 lines)
```typescript
describe('Progress Tracking', () => {
  it('should track overall progress', async () => {
    const args: TaskOrchestrateArgs = {
      task: {
        type: 'comprehensive-testing',
        priority: 'high',
        strategy: 'parallel',
        maxAgents: 5,
        timeoutMinutes: 30
      }
    };

    const response = await handler.handle(args);

    expect(response.data.progress.overall).toBeGreaterThanOrEqual(0);
    expect(response.data.progress.overall).toBeLessThanOrEqual(100);
    expect(response.data.progress.completedSteps).toBe(response.data.workflow.filter(s => s.status === 'completed').length);
  });

  it('should track progress by step', async () => {
    const args: TaskOrchestrateArgs = {
      task: {
        type: 'quality-gate',
        priority: 'high',
        strategy: 'sequential',
        maxAgents: 3,
        timeoutMinutes: 20
      }
    };

    const response = await handler.handle(args);

    expect(response.data.progress.byStep).toBeDefined();
    Object.values(response.data.progress.byStep).forEach(progress => {
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(100);
    });
  });

  it('should estimate completion time', async () => {
    const args: TaskOrchestrateArgs = {
      task: {
        type: 'comprehensive-testing',
        priority: 'high',
        strategy: 'parallel',
        maxAgents: 5,
        timeoutMinutes: 30
      }
    };

    const response = await handler.handle(args);

    expect(response.data.progress.estimatedCompletion).toBeDefined();
    const estimatedDate = new Date(response.data.progress.estimatedCompletion);
    expect(estimatedDate.getTime()).toBeGreaterThan(Date.now());
  });
});
```

#### Sections 6-10: Input Validation, Error Handling, Edge Cases, Performance, Timeline
(Similar structure to test-execute, ~310 lines total)

### Mock Requirements

```typescript
// Mock AgentRegistry
mockAgentRegistry = {
  spawnAgent: vi.fn().mockResolvedValue({
    id: 'agent-orchestrator-1',
    type: 'task-orchestrator',
    status: 'active'
  }),
  listAgents: vi.fn().mockResolvedValue([])
} as any;

// Mock HookExecutor
mockHookExecutor = {
  executePreTask: vi.fn().mockResolvedValue(undefined),
  executePostTask: vi.fn().mockResolvedValue(undefined)
} as any;

// Mock WorkflowEngine
vi.mock('../../../src/mcp/services/WorkflowEngine.js', () => ({
  WorkflowEngine: vi.fn().mockImplementation(() => ({
    resolveDAG: vi.fn().mockReturnValue([]),
    executeStep: vi.fn().mockResolvedValue({ status: 'completed' }),
    executeWorkflow: vi.fn().mockResolvedValue({ success: true })
  }))
}));
```

### Estimated Effort
- **Lines of Code**: ~750
- **Sections**: 10
- **Complexity**: Very High
- **Estimated Time**: 8-10 hours

---

## 3. quality-gate-execute Handler - Test Implementation Plan

### File Location
`/workspaces/agentic-qe-cf/tests/mcp/handlers/quality/quality-gate-execute.test.ts`

### Handler Analysis
- **Location**: `/workspaces/agentic-qe-cf/src/mcp/handlers/quality/quality-gate-execute.ts`
- **Lines of Code**: 666
- **Complexity**: High (policy evaluation, risk assessment, multi-factor decisions)
- **Key Features**:
  - Quality gate policy enforcement
  - Multi-metric evaluation (coverage, tests, security, performance, code quality)
  - Risk assessment and scoring
  - Decision making (PASS/FAIL/ESCALATE)
  - Recommendation generation

### Test Scenarios (9 sections, ~650 lines)

#### Section 1: Happy Path - Quality Gate Execution (110 lines)
```typescript
describe('Happy Path - Quality Gate Execution', () => {
  it('should pass quality gate with good metrics', async () => {
    const args: QualityGateExecuteArgs = {
      projectId: 'test-project',
      buildId: 'build-123',
      environment: 'development',
      metrics: {
        coverage: { line: 85, branch: 80, function: 90, statement: 85 },
        testResults: { total: 100, passed: 98, failed: 2, skipped: 0 },
        security: { vulnerabilities: 2, critical: 0, high: 0, medium: 2, low: 0 },
        performance: { averageResponseTime: 150, throughput: 1000, errorRate: 0.01 },
        codeQuality: { complexity: 10, maintainability: 85, duplication: 5 }
      }
    };

    const response = await handler.handle(args);

    expect(response.success).toBe(true);
    expect(response.data.decision).toBe('PASS');
    expect(response.data.score).toBeGreaterThan(80);
    expect(response.data.policyCompliance.compliant).toBe(true);
  });

  it('should fail quality gate with critical security vulnerabilities', async () => {
    const args: QualityGateExecuteArgs = {
      projectId: 'test-project',
      buildId: 'build-124',
      environment: 'production',
      metrics: {
        coverage: { line: 85, branch: 80, function: 90, statement: 85 },
        testResults: { total: 100, passed: 95, failed: 5, skipped: 0 },
        security: { vulnerabilities: 5, critical: 2, high: 3, medium: 0, low: 0 }, // Critical!
        performance: { averageResponseTime: 150, throughput: 1000, errorRate: 0.05 },
        codeQuality: { complexity: 15, maintainability: 80, duplication: 8 }
      }
    };

    const response = await handler.handle(args);

    expect(response.success).toBe(true);
    expect(response.data.decision).toBe('FAIL');
    expect(response.data.policyCompliance.compliant).toBe(false);
    expect(response.data.policyCompliance.violations.length).toBeGreaterThan(0);
  });

  it('should escalate with high risk factors', async () => {
    const args: QualityGateExecuteArgs = {
      projectId: 'test-project',
      buildId: 'build-125',
      environment: 'production',
      metrics: {
        coverage: { line: 78, branch: 75, function: 80, statement: 77 }, // Below threshold
        testResults: { total: 100, passed: 90, failed: 10, skipped: 0 },
        security: { vulnerabilities: 3, critical: 0, high: 3, medium: 0, low: 0 },
        performance: { averageResponseTime: 200, throughput: 800, errorRate: 0.08 },
        codeQuality: { complexity: 20, maintainability: 70, duplication: 12 }
      },
      context: {
        deploymentTarget: 'production',
        criticality: 'critical'
      }
    };

    const response = await handler.handle(args);

    expect(response.success).toBe(true);
    expect(response.data.decision).toMatch(/ESCALATE|FAIL/);
    expect(response.data.riskAssessment.level).toMatch(/high|critical/);
  });
});
```

#### Section 2: Policy Evaluation (100 lines)
```typescript
describe('Policy Evaluation', () => {
  it('should evaluate default policy correctly', async () => {
    const args: QualityGateExecuteArgs = {
      projectId: 'test-project',
      buildId: 'build-126',
      environment: 'development',
      metrics: {
        coverage: { line: 85, branch: 80, function: 90, statement: 85 },
        testResults: { total: 100, passed: 98, failed: 2, skipped: 0 },
        security: { vulnerabilities: 0, critical: 0, high: 0, medium: 0, low: 0 },
        performance: { averageResponseTime: 100, throughput: 1200, errorRate: 0.01 },
        codeQuality: { complexity: 8, maintainability: 90, duplication: 3 }
      }
    };

    const response = await handler.handle(args);

    expect(response.data.policyCompliance.compliant).toBe(true);
    expect(response.data.metadata.policyVersion).toBe('1.0.0');
  });

  it('should evaluate custom policy', async () => {
    const customPolicy: QualityGatePolicy = {
      name: 'strict-policy',
      version: '2.0.0',
      thresholds: {
        coverage: 0.90, // Stricter
        testSuccess: 0.99,
        securityVulns: 0,
        performanceRegression: 0.05,
        codeQuality: 0.85
      },
      rules: [
        {
          id: 'rule-strict-coverage',
          name: 'Strict Coverage',
          condition: 'coverage.line >= 90',
          action: 'block',
          severity: 'critical',
          description: 'Line coverage must be at least 90%'
        }
      ],
      enforcement: 'strict'
    };

    const args: QualityGateExecuteArgs = {
      projectId: 'test-project',
      buildId: 'build-127',
      environment: 'production',
      policy: customPolicy,
      metrics: {
        coverage: { line: 85, branch: 80, function: 90, statement: 85 }, // Fails strict policy
        testResults: { total: 100, passed: 99, failed: 1, skipped: 0 },
        security: { vulnerabilities: 0, critical: 0, high: 0, medium: 0, low: 0 },
        performance: { averageResponseTime: 100, throughput: 1200, errorRate: 0.01 },
        codeQuality: { complexity: 8, maintainability: 90, duplication: 3 }
      }
    };

    const response = await handler.handle(args);

    expect(response.data.policyCompliance.compliant).toBe(false);
    expect(response.data.metadata.policyVersion).toBe('2.0.0');
  });

  it('should check all policy rules', async () => {
    const args: QualityGateExecuteArgs = {
      projectId: 'test-project',
      buildId: 'build-128',
      environment: 'development',
      metrics: {
        coverage: { line: 75, branch: 70, function: 80, statement: 75 },
        testResults: { total: 100, passed: 92, failed: 8, skipped: 0 },
        security: { vulnerabilities: 1, critical: 0, high: 1, medium: 0, low: 0 },
        performance: { averageResponseTime: 250, throughput: 600, errorRate: 0.15 },
        codeQuality: { complexity: 25, maintainability: 65, duplication: 15 }
      }
    };

    const response = await handler.handle(args);

    // Should have multiple violations
    expect(response.data.policyCompliance.violations.length).toBeGreaterThan(1);
    expect(response.data.policyCompliance.warnings.length).toBeGreaterThan(0);
  });
});
```

#### Sections 3-9: Risk Assessment, Evaluations, Input Validation, Error Handling, Edge Cases, Performance, Recommendations
(Similar structure, ~440 lines total)

### Mock Requirements

```typescript
// Mock AgentRegistry
mockAgentRegistry = {
  spawnAgent: vi.fn().mockResolvedValue({
    id: 'agent-quality-gate-1',
    type: 'quality-gate',
    status: 'active'
  })
} as any;

// Mock HookExecutor
mockHookExecutor = {
  executePreTask: vi.fn().mockResolvedValue(undefined),
  executePostTask: vi.fn().mockResolvedValue(undefined),
  executePostEdit: vi.fn().mockResolvedValue(undefined),
  notify: vi.fn().mockResolvedValue(undefined)
} as any;
```

### Estimated Effort
- **Lines of Code**: ~650
- **Sections**: 9
- **Complexity**: High
- **Estimated Time**: 6-8 hours

---

## Test Template

Create a reusable test template at `/workspaces/agentic-qe-cf/tests/mcp/handlers/_test-template.test.ts`:

```typescript
/**
 * [Handler Name] Test Suite
 *
 * Comprehensive tests for [tool-name] MCP tool handler.
 * Tests [brief description of handler functionality].
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HandlerClass, HandlerArgs, HandlerResult } from '@mcp/handlers/[handler-path]';
import { AgentRegistry } from '@mcp/services/AgentRegistry';
import { HookExecutor } from '@mcp/services/HookExecutor';

// Mock services
vi.mock('../../../src/mcp/services/AgentRegistry.js');
vi.mock('../../../src/mcp/services/HookExecutor.js');
vi.mock('../../../src/utils/SecureRandom.js', () => ({
  SecureRandom: {
    generateId: vi.fn(() => 'test-random-id'),
    randomFloat: vi.fn(() => 0.5)
  }
}));

describe('HandlerClass', () => {
  let handler: HandlerClass;
  let mockAgentRegistry: AgentRegistry;
  let mockHookExecutor: HookExecutor;

  beforeEach(() => {
    // Setup mock AgentRegistry
    mockAgentRegistry = {
      spawnAgent: vi.fn().mockResolvedValue({
        id: 'agent-test-1',
        type: 'test-agent',
        status: 'active'
      }),
      getStatistics: vi.fn().mockReturnValue({ totalAgents: 1 }),
      // Add other methods as needed
    } as any;

    // Setup mock HookExecutor
    mockHookExecutor = {
      executePreTask: vi.fn().mockResolvedValue(undefined),
      executePostTask: vi.fn().mockResolvedValue(undefined),
      executeHook: vi.fn().mockResolvedValue(undefined),
      notify: vi.fn().mockResolvedValue(undefined)
    } as any;

    // Initialize handler with mocks
    handler = new HandlerClass(mockAgentRegistry, mockHookExecutor);
  });

  describe('Happy Path - [Primary Feature]', () => {
    it('should handle valid input successfully', async () => {
      const args: HandlerArgs = {
        // Valid input parameters
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      // Add specific assertions
    });

    it('should [second success scenario]', async () => {
      // Additional success test
    });
  });

  describe('Input Validation', () => {
    it('should reject missing required parameter', async () => {
      const args = {} as HandlerArgs;

      const response = await handler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should reject invalid parameter values', async () => {
      const args: HandlerArgs = {
        // Invalid parameters
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toMatch(/expected error pattern/i);
    });
  });

  describe('Hook Integration', () => {
    it('should call pre-task hook before execution', async () => {
      const args: HandlerArgs = {
        // Valid parameters
      };

      await handler.handle(args);

      expect(mockHookExecutor.executePreTask).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.any(String),
          agentType: expect.any(String)
        })
      );
    });

    it('should call post-task hook after execution', async () => {
      const args: HandlerArgs = {
        // Valid parameters
      };

      await handler.handle(args);

      expect(mockHookExecutor.executePostTask).toHaveBeenCalledWith(
        expect.objectContaining({
          results: expect.any(Object)
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle registry failures gracefully', async () => {
      const mockFailingRegistry = {
        spawnAgent: vi.fn().mockRejectedValue(new Error('Registry unavailable'))
      } as any;

      const failingHandler = new HandlerClass(mockFailingRegistry, mockHookExecutor);

      const args: HandlerArgs = {
        // Valid parameters
      };

      const response = await failingHandler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toContain('Registry unavailable');
    });

    it('should handle hook execution failures', async () => {
      const mockFailingHook = {
        executePreTask: vi.fn().mockRejectedValue(new Error('Hook failed')),
        executePostTask: vi.fn()
      } as any;

      const failingHandler = new HandlerClass(mockAgentRegistry, mockFailingHook);

      const args: HandlerArgs = {
        // Valid parameters
      };

      const response = await failingHandler.handle(args);

      expect(response.success).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle edge case scenario', async () => {
      const args: HandlerArgs = {
        // Edge case parameters
      };

      const response = await handler.handle(args);

      expect(response).toHaveProperty('success');
    });

    it('should handle concurrent requests', async () => {
      const promises = Array.from({ length: 10 }, () =>
        handler.handle({
          // Valid parameters
        })
      );

      const results = await Promise.all(promises);

      const successCount = results.filter(r => r.success).length;
      expect(successCount).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    it('should complete within reasonable time', async () => {
      const args: HandlerArgs = {
        // Valid parameters
      };

      const startTime = Date.now();
      const response = await handler.handle(args);
      const endTime = Date.now();

      expect(response.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(1000); // Adjust threshold
    });
  });
});
```

---

## Implementation Order & Dependencies

### Phase 1A: Setup and Templates (1-2 hours)
1. Create test template file
2. Review existing test patterns
3. Set up shared mock utilities
4. Document mock patterns

### Phase 1B: test-execute Tests (6-8 hours)
**Dependencies**: None (fleet-init and agent-spawn already complete)

**Implementation Steps**:
1. Create test file structure (30 min)
2. Implement Happy Path tests (1 hour)
3. Implement Input Validation tests (1 hour)
4. Implement Agent Coordination tests (1.5 hours)
5. Implement Parallel/Sequential Execution tests (1 hour)
6. Implement Queue Management tests (1 hour)
7. Implement Results and Metrics tests (1 hour)
8. Implement Error Handling tests (1 hour)
9. Implement Edge Cases tests (30 min)
10. Implement Performance tests (30 min)

**Files to Create**:
- `/workspaces/agentic-qe-cf/tests/mcp/handlers/test-execute.test.ts` (replace stub)

**Mocks Needed**:
- AgentRegistry (spawn, getStatistics)
- HookExecutor (executePreTask, executePostTask, executeHook, notify)
- TestFrameworkExecutor (detectFramework, execute)

### Phase 1C: quality-gate-execute Tests (6-8 hours)
**Dependencies**: test-execute tests (reuse patterns)

**Implementation Steps**:
1. Create test file structure (30 min)
2. Implement Happy Path tests (1.5 hours)
3. Implement Policy Evaluation tests (1.5 hours)
4. Implement Risk Assessment tests (1 hour)
5. Implement Multi-metric Evaluation tests (1 hour)
6. Implement Input Validation tests (1 hour)
7. Implement Error Handling tests (1 hour)
8. Implement Edge Cases tests (30 min)
9. Implement Performance tests (30 min)

**Files to Create**:
- `/workspaces/agentic-qe-cf/tests/mcp/handlers/quality/quality-gate-execute.test.ts`

**Mocks Needed**:
- AgentRegistry (spawnAgent)
- HookExecutor (executePreTask, executePostTask, executePostEdit, notify)

### Phase 1D: task-orchestrate Tests (8-10 hours)
**Dependencies**: test-execute and quality-gate-execute tests (reuse patterns)

**Implementation Steps**:
1. Create test file structure (30 min)
2. Implement Happy Path tests (1.5 hours)
3. Implement Execution Strategies tests (2 hours)
4. Implement Workflow Dependencies tests (1.5 hours)
5. Implement Agent Assignment tests (1.5 hours)
6. Implement Progress Tracking tests (1 hour)
7. Implement Input Validation tests (1 hour)
8. Implement Error Handling tests (1 hour)
9. Implement Edge Cases tests (30 min)
10. Implement Performance tests (30 min)

**Files to Create**:
- `/workspaces/agentic-qe-cf/tests/mcp/handlers/task-orchestrate.test.ts` (replace stub)

**Mocks Needed**:
- AgentRegistry (spawnAgent, listAgents)
- HookExecutor (executePreTask, executePostTask)
- WorkflowEngine (resolveDAG, executeStep, executeWorkflow)

---

## Total Effort Estimate

| Task | Hours | Dependencies |
|------|-------|--------------|
| Setup & Templates | 1-2 | None |
| test-execute tests | 6-8 | Templates |
| quality-gate-execute tests | 6-8 | test-execute |
| task-orchestrate tests | 8-10 | quality-gate-execute |
| **Total** | **21-28** | Sequential |

**Recommended Timeline**:
- **Week 1**: Setup + test-execute (7-10 hours)
- **Week 2**: quality-gate-execute + task-orchestrate (14-18 hours)
- **Buffer**: 2-4 hours for debugging and adjustments

**Target Completion**: 2-3 weeks (part-time) or 1 week (full-time)

---

## Success Criteria

### Coverage Metrics
- ✅ Each handler test suite has >90% branch coverage
- ✅ All critical paths are tested
- ✅ All error scenarios are covered
- ✅ All edge cases are documented and tested

### Code Quality
- ✅ Tests follow existing patterns (fleet-init, agent-spawn)
- ✅ Clear, descriptive test names
- ✅ Proper mock setup and teardown
- ✅ No flaky tests (deterministic assertions)

### Documentation
- ✅ Each test file has comprehensive header comments
- ✅ Each test section has clear description
- ✅ Complex scenarios have inline comments
- ✅ Mock patterns are documented

### Integration
- ✅ All tests pass in CI/CD pipeline
- ✅ Tests run in <5 seconds per file
- ✅ No memory leaks in test execution
- ✅ Tests can run in parallel

---

## Phase 2 Preview (v1.3.8)

**Medium Priority Tools** (11 tools, est. 30-40 hours):
1. test-generate-enhanced
2. coverage-analyze-sublinear
3. coverage-gaps-detect
4. test-optimize-sublinear
5. regression-risk-analyze
6. flaky-test-detect
7. deployment-readiness-check
8. api-breaking-changes
9. requirements-validate
10. production-incident-replay
11. mutation-test-execute

---

## Phase 3 Preview (v1.4.0)

**Comprehensive Coverage** (19 tools, est. 50-60 hours):
- All remaining analysis tools
- All remaining coordination tools
- All remaining integration tools
- All remaining prediction tools
- All remaining advanced tools

---

## Appendix: Mock Utility Library

Create shared mock utilities at `/workspaces/agentic-qe-cf/tests/mcp/utils/test-mocks.ts`:

```typescript
import { vi } from 'vitest';

export const createMockAgentRegistry = (overrides = {}) => ({
  spawnAgent: vi.fn().mockResolvedValue({
    id: 'agent-test-1',
    type: 'test-agent',
    status: 'active'
  }),
  getAgent: vi.fn().mockResolvedValue(null),
  listAgents: vi.fn().mockResolvedValue([]),
  getStatistics: vi.fn().mockReturnValue({ totalAgents: 0 }),
  ...overrides
});

export const createMockHookExecutor = (overrides = {}) => ({
  executePreTask: vi.fn().mockResolvedValue(undefined),
  executePostTask: vi.fn().mockResolvedValue(undefined),
  executeHook: vi.fn().mockResolvedValue(undefined),
  executePostEdit: vi.fn().mockResolvedValue(undefined),
  notify: vi.fn().mockResolvedValue(undefined),
  ...overrides
});

export const createMockTestFrameworkExecutor = (overrides = {}) => ({
  detectFramework: vi.fn().mockResolvedValue('jest'),
  execute: vi.fn().mockResolvedValue({
    status: 'passed',
    tests: [
      {
        name: 'test 1',
        status: 'passed',
        duration: 100,
        failureMessages: []
      }
    ]
  }),
  ...overrides
});
```

---

## Conclusion

This implementation plan provides a comprehensive roadmap for Phase 1 (v1.3.7) test coverage. The plan includes:

- ✅ Detailed test scenarios for 3 high-priority handlers
- ✅ Code examples and patterns
- ✅ Mock requirements and setup
- ✅ Clear implementation order
- ✅ Realistic effort estimates
- ✅ Success criteria

**Next Steps**:
1. Review and approve this plan
2. Create test template and mock utilities
3. Implement tests in order: test-execute → quality-gate-execute → task-orchestrate
4. Run tests and validate coverage
5. Create PR for v1.3.7 with test improvements

**Ready for handoff to coder agent for implementation.**
