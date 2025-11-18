# TestExecutorAgent: Real vs Simulation Modes

## Overview

The `TestExecutorAgent` now supports two distinct modes of operation:

1. **REAL MODE (default)**: Executes actual tests via Jest/Mocha/Playwright/Cypress using child_process
2. **SIMULATION MODE (demo only)**: Simulates test results with random pass/fail for demonstration purposes

## Configuration

### Real Mode (Default - Recommended for Production)

```typescript
const agent = new TestExecutorAgent({
  // ... other config
  simulationMode: false, // Default: REAL execution
  workingDir: process.cwd() // Default: current directory
});
```

**Behavior**:
- Executes tests via `TestFrameworkExecutor` using `child_process.spawn`
- Spawns actual test runners (Jest, Mocha, Playwright, Cypress)
- Parses JSON output from test frameworks
- Returns real test results with actual pass/fail/skip counts
- Includes real coverage data when enabled
- Provides real error messages and stack traces

**Logs**:
```
[TestExecutor] ✅ REAL EXECUTION MODE - Tests will be executed via test frameworks
TestExecutorAgent test-executor-123 initializing in REAL mode with frameworks: jest, mocha, cypress, playwright
```

### Simulation Mode (Demo/Testing Only)

```typescript
const agent = new TestExecutorAgent({
  // ... other config
  simulationMode: true // Enable simulation
});
```

**Behavior**:
- **Does NOT execute real tests**
- Simulates test execution with delays based on test type
- Generates random pass/fail results (90% pass rate)
- Returns simulated coverage data
- Error messages are prefixed with `[SIMULATED]`

**Logs**:
```
[TestExecutor] ⚠️  SIMULATION MODE ENABLED - Tests will NOT be executed for real
TestExecutorAgent test-executor-123 initializing in SIMULATION mode with frameworks: jest, mocha, cypress, playwright
```

## Feature Comparison

| Feature | Real Mode | Simulation Mode |
|---------|-----------|-----------------|
| Executes actual tests | ✅ Yes | ❌ No |
| Uses test frameworks | ✅ Yes (child_process) | ❌ No |
| Real pass/fail results | ✅ Yes | ❌ Random (90% pass) |
| Real coverage data | ✅ Yes (when enabled) | ❌ Simulated |
| Framework validation | ✅ Yes (checks package.json) | ❌ Skipped |
| Test discovery | ✅ Real (glob search) | ❌ Random counts |
| Exit codes | ✅ Real | ❌ Simulated |
| Error messages | ✅ Real stack traces | ⚠️  Prefixed with `[SIMULATED]` |

## Implementation Details

### Real Test Execution Flow

```typescript
// 1. Initialize TestFrameworkExecutor (lazy loaded)
const { TestFrameworkExecutor } = await import('../utils/TestFrameworkExecutor.js');
this.testFrameworkExecutor = new TestFrameworkExecutor();

// 2. Select framework based on test type
const framework = this.selectFramework(test); // e.g., 'jest', 'mocha'

// 3. Build test pattern
const testPattern = this.buildTestPattern(test); // e.g., '**/*.test.js'

// 4. Execute with real framework
const result = await this.testFrameworkExecutor.execute({
  framework: 'jest',
  testPattern: '**/*.test.js',
  workingDir: '/path/to/tests',
  timeout: 300000,
  coverage: false,
  environment: 'test'
});

// 5. Parse results from framework JSON output
// Returns: { status, totalTests, passedTests, failedTests, tests[], coverage }
```

### Simulated Test Execution Flow

```typescript
// 1. Estimate duration based on test type
const duration = this.estimateTestDuration(test); // 100-5000ms

// 2. Simulate execution delay
await new Promise(resolve => setTimeout(resolve, duration));

// 3. Generate random result
const success = SecureRandom.randomFloat() > 0.1; // 90% pass rate

// 4. Return simulated result with [SIMULATED] prefix
return {
  status: success ? 'passed' : 'failed',
  errors: success ? [] : ['[SIMULATED] Test assertion failed'],
  metadata: { simulated: true }
};
```

## Test Discovery

### Real Mode
```typescript
// Uses glob to find actual test files
const files = await glob('**/*.test.js', {
  cwd: workingDir,
  ignore: ['**/node_modules/**']
});

// Returns: { unitTests: 45, integrationTests: 12, e2eTests: 8, simulated: false }
```

### Simulation Mode
```typescript
// Returns random counts
return {
  unitTests: Math.floor(SecureRandom.randomFloat() * 50) + 10,
  integrationTests: Math.floor(SecureRandom.randomFloat() * 20) + 5,
  summary: '[SIMULATED] Discovered 65 tests...',
  simulated: true
};
```

## Result Metadata

Test results include metadata to identify execution mode:

### Real Mode Metadata
```json
{
  "framework": "jest",
  "retries": 0,
  "totalTests": 45,
  "passedTests": 43,
  "failedTests": 2,
  "exitCode": 1
}
```

### Simulation Mode Metadata
```json
{
  "framework": "jest",
  "retries": 0,
  "simulated": true
}
```

## Usage Examples

### Production Use (Real Mode)
```typescript
import { TestExecutorAgent } from './agents/TestExecutorAgent';

const executor = new TestExecutorAgent({
  frameworks: ['jest', 'mocha'],
  maxParallelTests: 8,
  timeout: 300000,
  retryAttempts: 3,
  simulationMode: false, // REAL execution (default)
  workingDir: '/path/to/project'
});

const result = await executor.execute({
  type: 'parallel-test-execution',
  payload: {
    testSuite: {
      id: 'test-suite-1',
      tests: [/* test objects */]
    }
  }
});

// result.optimizationApplied: true
// result.results: [/* real test results */]
```

### Demo/Testing Use (Simulation Mode)
```typescript
const simulator = new TestExecutorAgent({
  frameworks: ['jest'],
  simulationMode: true, // SIMULATION mode
  maxParallelTests: 8
});

const result = await simulator.execute({
  type: 'test-discovery',
  payload: {
    searchPath: './tests'
  }
});

// result.simulated: true
// result.summary: '[SIMULATED] Discovered 65 tests...'
```

## Environment Variables

The agent respects the following environment variables:

- `NODE_ENV=test`: Affects execution environment
- `AQE_USE_MOCK_AGENTDB=true`: Uses mock AgentDB adapter (affects logging, not execution)

## Migration Guide

### Before (v1.7.0 and earlier)
All test execution was simulated with no way to run real tests:

```typescript
// OLD: Always simulated
const agent = new TestExecutorAgent({
  frameworks: ['jest']
});
// Always returned random results
```

### After (v1.8.0+)
Real execution by default, simulation mode optional:

```typescript
// NEW: Real execution by default
const agent = new TestExecutorAgent({
  frameworks: ['jest'],
  simulationMode: false // Explicit (but default)
});
// Returns real test results

// NEW: Simulation mode available for demos
const simulator = new TestExecutorAgent({
  frameworks: ['jest'],
  simulationMode: true
});
// Returns simulated results with [SIMULATED] prefix
```

## Best Practices

1. **Production**: Always use Real Mode (`simulationMode: false` or omit)
2. **CI/CD**: Verify `simulationMode: false` in agent configuration
3. **Demos**: Use Simulation Mode for presentations without requiring test infrastructure
4. **Testing**: Use Simulation Mode for unit tests of agent coordination logic
5. **Validation**: Check `metadata.simulated` flag to detect simulation mode results

## Troubleshooting

### "Framework 'jest' not found in package.json dependencies"

**Cause**: Real Mode requires test frameworks to be installed.

**Solution**:
```bash
npm install --save-dev jest  # or mocha, playwright, cypress
```

### Tests return `[SIMULATED]` prefix in errors

**Cause**: Agent is running in Simulation Mode.

**Solution**: Check configuration and set `simulationMode: false`.

### No test frameworks validated during initialization

**Cause**: Agent is in Simulation Mode.

**Solution**: Framework validation is skipped in Simulation Mode. Switch to Real Mode if validation is needed.

## Related Files

- Implementation: `/workspaces/agentic-qe-cf/src/agents/TestExecutorAgent.ts`
- Test Framework Executor: `/workspaces/agentic-qe-cf/src/utils/TestFrameworkExecutor.ts`
- Issue: [GitHub Issue #52](https://github.com/proffesor-for-testing/agentic-qe/issues/52)

---

**Version**: 1.8.0
**Last Updated**: 2025-11-17
**Status**: Production Ready
