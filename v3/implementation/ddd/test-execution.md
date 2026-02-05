# Test Execution Domain

## Bounded Context Overview

**Domain**: Test Execution
**Responsibility**: Parallel test running, flaky detection, and intelligent retry
**Location**: `src/domains/test-execution/`

The Test Execution domain handles the actual running of tests, including parallel execution, flaky test detection, retry strategies, and test prioritization using reinforcement learning.

## Ubiquitous Language

| Term | Definition |
|------|------------|
| **Test Run** | A single execution session with results |
| **Flaky Test** | Test with inconsistent pass/fail results |
| **Sharding** | Strategy for distributing tests across workers |
| **Retry** | Re-execution of failed tests with backoff |
| **Prioritization** | RL-based ordering of test execution |
| **E2E Step** | Individual action in an end-to-end test |
| **User Flow** | Recorded sequence of user interactions |
| **Virtual User** | Simulated user in load testing scenarios |

## Domain Model

### Aggregates

#### TestRunResult (Aggregate Root)
Represents the complete result of a test execution session.

```typescript
interface ITestRunResult {
  runId: string;
  status: 'passed' | 'failed' | 'error';
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  failedTests: IFailedTest[];
  coverage?: ICoverageData;
}
```

#### E2ETestSuite (Aggregate Root)
Collection of end-to-end test cases.

```typescript
interface E2ETestSuite {
  id: string;
  name: string;
  testCases: E2ETestCase[];
  hooks?: E2ETestHooks;
  defaultViewport?: Viewport;
}
```

### Entities

#### FailedTest
Details of a test failure.

```typescript
interface IFailedTest {
  testId: string;
  testName: string;
  file: string;
  error: string;
  stack?: string;
  duration: number;
}
```

#### FlakyTest
Analysis of a flaky test with remediation.

```typescript
interface IFlakyTest {
  testId: string;
  testName: string;
  file: string;
  failureRate: number;
  pattern: 'timing' | 'ordering' | 'resource' | 'async' | 'unknown';
  recommendation: string;
}
```

#### E2ETestCase
Individual end-to-end test case.

```typescript
interface E2ETestCase {
  id: string;
  name: string;
  steps: E2EStep[];
  viewport?: Viewport;
  timeout?: number;
  retries?: number;
}
```

### Value Objects

#### CoverageData
Immutable coverage metrics.

```typescript
interface ICoverageData {
  readonly line: number;
  readonly branch: number;
  readonly function: number;
  readonly statement: number;
}
```

#### TestPrioritizationFeatures
Normalized feature vector for RL-based prioritization.

```typescript
interface TestPrioritizationFeatures {
  readonly failureProbability: number;  // Recent failure history
  readonly flakiness: number;           // Flakiness score
  readonly complexity: number;          // Code complexity
  readonly coverageGap: number;         // 1 - coverage
  readonly criticality: number;         // Business criticality
  readonly speed: number;               // Inverse of duration
  readonly age: number;                 // Inverse of modification time
  readonly dependencyComplexity: number; // Dependency count normalized
}
```

#### Viewport
Browser viewport configuration.

```typescript
interface Viewport {
  readonly width: number;
  readonly height: number;
  readonly deviceScaleFactor: number;
  readonly isMobile: boolean;
  readonly hasTouch: boolean;
}
```

## Domain Services

### ITestExecutionAPI
Primary API for the domain.

```typescript
interface ITestExecutionAPI {
  runTests(request: ISimpleTestRequest): Promise<Result<ITestRunResult, Error>>;
  execute(request: IExecuteTestsRequest): Promise<Result<ITestRunResult, Error>>;
  executeParallel(request: IParallelExecutionRequest): Promise<Result<ITestRunResult, Error>>;
  detectFlaky(request: IFlakyDetectionRequest): Promise<Result<IFlakyTestReport, Error>>;
  retry(request: IRetryRequest): Promise<Result<IRetryResult, Error>>;
  getStats(runId: string): Promise<Result<IExecutionStats, Error>>;
  executeE2ETestCase?(testCase: E2ETestCase): Promise<Result<E2ETestResult, Error>>;
  executeE2ETestSuite?(suite: E2ETestSuite, strategy?: ExecutionStrategy): Promise<Result<E2ETestSuiteResult, Error>>;
}
```

## Domain Events

| Event | Trigger | Payload |
|-------|---------|---------|
| `TestRunStartedEvent` | Execution begins | `{ runId, testFiles, workers }` |
| `TestRunCompletedEvent` | Execution finishes | `{ runId, status, results }` |
| `FlakyTestDetectedEvent` | Flaky test identified | `{ testId, failureRate, pattern }` |
| `TestRetryEvent` | Test being retried | `{ testId, attempt, reason }` |

## Reinforcement Learning Integration

### Test Prioritization with Decision Trees

The domain uses RL to optimize test execution order:

```typescript
// State representation
interface TestPrioritizationState {
  id: string;
  features: number[];           // 8-dimensional feature vector
  filePath: string;
  testName: string;
  complexity: number;
  estimatedDuration: number;
  coverage: number;
  failureRate: number;
  flakinessScore: number;
  // ... additional state
}

// Actions
type PriorityAction = 'critical' | 'high' | 'standard' | 'low' | 'defer';

// Reward calculation
function calculatePrioritizationReward(context, result): TestPrioritizationReward {
  return {
    earlyDetection: result.failedEarly ? 0.5 : 0,
    timeEfficiency: Math.max(0, 1 - result.executionTime / context.availableTime) * 0.3,
    coverageGain: result.coverageImproved ? 0.2 : 0,
    flakinessReduction: result.flakyDetected ? 0.1 : 0,
    total: // sum of above
  };
}
```

## Context Integration

### Upstream Dependencies
- **Test Generation**: Provides tests to execute
- **Code Intelligence**: Dependency analysis for ordering

### Downstream Consumers
- **Coverage Analysis**: Receives execution coverage data
- **Quality Assessment**: Uses results for quality gates
- **Defect Intelligence**: Analyzes failure patterns

### Anti-Corruption Layer
The domain isolates test framework specifics through the `ExecutionStrategy` pattern, allowing different runners (Jest, Vitest, Mocha, pytest) to be used interchangeably.

## Task Handlers

| Task Type | Handler | Description |
|-----------|---------|-------------|
| `execute-tests` | `execute()` | Run test suite |
| `execute-parallel` | `executeParallel()` | Parallel execution |
| `detect-flaky` | `detectFlaky()` | Flaky test detection |
| `retry-failed` | `retry()` | Retry failed tests |

## Configuration Constants

```typescript
const TEST_EXECUTION_CONSTANTS = {
  DEFAULT_TEST_TIMEOUT_MS: 60000,
  DEFAULT_FILE_TIMEOUT_MS: 30000,
  MAX_WORKERS: 32,
  MAX_TESTS_TRACKED: 10000,
  MAX_EXECUTION_HISTORY: 100,
  ANALYSIS_CACHE_TTL_MS: 3600000,
};

const RETRY_CONSTANTS = {
  BASE_DELAY_MS: 1000,
  MAX_DELAY_MS: 30000,
  DEFAULT_FLAKY_RATE: 0.3,
  DEFAULT_FLAKY_PASS_RATE: 0.7,
};
```

## E2E Step Types

The domain supports rich E2E step definitions:

| Step Type | Purpose |
|-----------|---------|
| `navigate` | Navigate to URL |
| `click` | Click element |
| `type` | Type text into input |
| `wait` | Wait for condition |
| `assert` | Verify assertion |
| `screenshot` | Capture screenshot |
| `a11y-check` | Run accessibility check |

## ADR References

- **ADR-051**: LLM-powered flaky test analysis
- **ADR-047**: MinCut topology for distributed execution
