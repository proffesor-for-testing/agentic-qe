# E2E Test Execution Integration

## Overview

The E2E test runner service has been successfully integrated with the test-execution domain, enabling Vibium browser automation capabilities through the AQE v3 framework.

## Architecture

### Components

1. **E2E Test Runner Service** (`/workspaces/agentic-qe/v3/src/domains/test-execution/services/e2e-runner.ts`)
   - Executes E2E test cases using Vibium browser automation
   - Provides step-by-step execution with retry logic
   - Supports multiple execution strategies (sequential/parallel)
   - Handles hooks, screenshots, and accessibility checks

2. **Test Execution Coordinator** (`/workspaces/agentic-qe/v3/src/domains/test-execution/coordinator.ts`)
   - Orchestrates E2E test execution
   - Publishes domain events for test lifecycle
   - Integrates E2E runner with test-execution domain
   - Manages Vibium client dependency injection

3. **MCP Tool - E2E Execute** (`/workspaces/agentic-qe/v3/src/mcp/tools/test-execution/e2e-execute.ts`)
   - Exposes E2E test execution via MCP API
   - Tool name: `qe/tests/e2e/execute`
   - Supports both single test cases and test suites
   - Provides streaming progress updates

## Integration Points

### Domain API Extension

The `TestExecutionAPI` interface now includes E2E execution methods:

```typescript
export interface TestExecutionAPI {
  // ... existing methods ...

  /** Execute E2E test case */
  executeE2ETestCase?(testCase: E2ETestCase): Promise<Result<E2ETestResult, Error>>;

  /** Execute E2E test suite */
  executeE2ETestSuite?(suite: E2ETestSuite, strategy?: ExecutionStrategy): Promise<Result<E2ETestSuiteResult, Error>>;
}
```

### Coordinator Configuration

E2E capabilities are configured via coordinator config:

```typescript
export interface TestExecutionCoordinatorConfig {
  // ... existing config ...

  /** Optional E2E runner config overrides */
  e2eRunnerConfig?: Partial<E2ERunnerConfig>;

  /** Vibium client for E2E testing (dependency injection) */
  vibiumClient?: VibiumClient;
}
```

### Dependency Injection Pattern

The E2E runner follows proper dependency injection:

```typescript
// Coordinator receives Vibium client via constructor
constructor(
  private readonly eventBus: EventBus,
  memory: MemoryBackend,
  config: Partial<TestExecutionCoordinatorConfig> = {}
) {
  // ...

  // Create E2E runner if Vibium client is provided
  if (fullConfig.vibiumClient) {
    this.e2eRunner = createE2ETestRunnerService(
      fullConfig.vibiumClient,
      fullConfig.e2eRunnerConfig
    );
  }
}
```

### Event Publishing

E2E test execution publishes domain events:

- `test-execution.E2ETestStarted` - When E2E test case starts
- `test-execution.E2ETestCompleted` - When E2E test case completes
- `test-execution.E2ETestSuiteStarted` - When E2E test suite starts
- `test-execution.E2ETestSuiteCompleted` - When E2E test suite completes

## Usage

### Via MCP Tool

```typescript
// Execute single test case
const result = await mcpClient.callTool('qe/tests/e2e/execute', {
  testCase: {
    id: 'login-test',
    name: 'User Login Flow',
    baseUrl: 'https://example.com',
    steps: [
      { type: 'navigate', target: '/login' },
      { type: 'type', target: '#username', value: 'testuser' },
      { type: 'type', target: '#password', value: 'password123' },
      { type: 'click', target: '#submit' },
      { type: 'assert', assertion: 'url-contains', value: '/dashboard' }
    ]
  },
  config: {
    screenshotOnFailure: true,
    verbose: true
  }
});
```

### Via Domain API

```typescript
// Get test-execution API
const testExecutionAPI = kernel.getDomainAPI<TestExecutionAPI>('test-execution');

// Execute E2E test case
const result = await testExecutionAPI.executeE2ETestCase?.(testCase);

// Execute E2E test suite
const suiteResult = await testExecutionAPI.executeE2ETestSuite?.(suite, 'parallel');
```

### Via Coordinator Directly

```typescript
import { createVibiumClient } from '../integrations/vibium';
import { createTestExecutionCoordinator } from '../domains/test-execution';

// Create Vibium client
const vibiumClient = await createVibiumClient({ enabled: true });

// Create coordinator with Vibium client
const coordinator = createTestExecutionCoordinator(eventBus, memory, {
  vibiumClient,
  e2eRunnerConfig: {
    screenshotOnFailure: true,
    defaultStepTimeout: 30000,
  }
});

await coordinator.initialize();

// Execute E2E test
const result = await coordinator.executeE2ETestCase(testCase);
```

## File Structure

```
v3/src/
├── domains/
│   └── test-execution/
│       ├── coordinator.ts          # Orchestrates E2E + unit test execution
│       ├── interfaces.ts           # Extended with E2E methods
│       ├── plugin.ts               # Exposes E2E methods via domain API
│       ├── index.ts                # Exports E2E runner and types
│       └── services/
│           ├── e2e-runner.ts       # E2E test runner implementation
│           └── index.ts            # Service exports
├── integrations/
│   └── vibium/
│       ├── client.ts               # Vibium browser automation client
│       └── index.ts                # Client factory
└── mcp/
    └── tools/
        └── test-execution/
            ├── execute.ts          # Unit/integration test execution tool
            ├── e2e-execute.ts      # E2E test execution tool (NEW)
            └── index.ts            # Tool exports
```

## Key Design Decisions

### 1. **Integration over Separation**
- E2E runner is part of test-execution domain, not a separate domain
- Reuses existing infrastructure (coordinator, events, memory)
- Avoids duplication and complexity

### 2. **Dependency Injection**
- Vibium client injected via coordinator config
- E2E runner created only when client is available
- Optional methods (using `?`) to support environments without Vibium

### 3. **Consistent Result Pattern**
- E2E methods return `Result<T, Error>` like other domain methods
- Error handling follows domain conventions
- Integration tests can verify full pipeline

### 4. **Event-Driven Architecture**
- E2E test lifecycle published as domain events
- Other domains can react to E2E test completion
- Enables integration with coverage, quality assessment, etc.

## Integration Tests

E2E integration should be tested with:

1. **Unit Tests** - Test E2E runner service in isolation
2. **Integration Tests** - Test coordinator + E2E runner together
3. **E2E Tests** - Test full MCP tool → coordinator → runner → Vibium pipeline

Example integration test:

```typescript
describe('E2E Test Execution Integration', () => {
  it('should execute E2E test case via coordinator', async () => {
    const vibiumClient = await createVibiumClient({ enabled: true });
    const coordinator = createTestExecutionCoordinator(eventBus, memory, {
      vibiumClient,
    });

    await coordinator.initialize();

    const testCase: E2ETestCase = {
      id: 'test-1',
      name: 'Test Case',
      baseUrl: 'https://example.com',
      steps: [/* ... */],
    };

    const result = await coordinator.executeE2ETestCase(testCase);

    expect(result.success).toBe(true);
    expect(result.value.testCaseId).toBe('test-1');
  });
});
```

## Verification

TypeScript compilation: ✅ **PASSED**

```bash
npx tsc --noEmit
# 0 errors
```

All types are properly integrated and exported from the domain index.
