# Test Setup and Teardown Documentation

This directory contains comprehensive test setup and teardown procedures for the Agentic QE framework. These utilities provide robust, isolated test environments with proper resource management, performance monitoring, and cleanup procedures.

## 📋 Overview

The test setup system provides four main types of test environments:

- **Unit Tests**: Minimal setup for fast, isolated unit testing
- **Integration Tests**: Comprehensive environment with memory management, task execution, and mock services
- **E2E Tests**: Full system testing with external service simulation and scenario management
- **Performance Tests**: Specialized environment with detailed performance monitoring and benchmarking

## 🗂 File Structure

```
tests/setup/
├── README.md                    # This documentation
├── index.ts                     # Main exports and factory functions
├── global-setup.ts              # Jest global setup and teardown
├── integration-setup.ts         # Integration test environment
├── performance-setup.ts         # Performance monitoring setup
└── e2e-setup.ts                # End-to-end test environment
```

## 🚀 Quick Start

### Using Factory Functions (Recommended)

```typescript
import { createTestEnvironment, quickSetup } from '../setup';

// Quick setups for common scenarios
const unitEnv = await quickSetup.unit();
const integrationEnv = await quickSetup.integration();
const e2eEnv = await quickSetup.e2e();
const performanceEnv = await quickSetup.performance();

// Custom configuration
const customEnv = await createTestEnvironment({
  type: 'integration',
  isolation: true,
  monitoring: true,
  cleanup: {
    memory: true,
    files: true,
    processes: true,
    network: true
  }
});
```

### Using Test Hooks

```typescript
import { createTestHooks } from '../setup';

describe('My Test Suite', () => {
  const hooks = createTestHooks({
    type: 'integration',
    monitoring: true
  });

  beforeAll(hooks.beforeAll);
  afterAll(hooks.afterAll);
  beforeEach(hooks.beforeEach);
  afterEach(hooks.afterEach);

  it('should test with proper setup', async () => {
    const env = hooks.getEnvironment();
    expect(env?.isReady()).toBe(true);
  });
});
```

### Using Pre-configured Hooks

```typescript
import { integrationTestHooks, performanceTestHooks } from '../setup';

describe('Integration Test Suite', () => {
  beforeAll(integrationTestHooks.beforeAll);
  afterAll(integrationTestHooks.afterAll);
  beforeEach(integrationTestHooks.beforeEach);
  afterEach(integrationTestHooks.afterEach);

  // Your tests here...
});
```

## 🔧 Configuration Options

### TestSetupOptions

```typescript
interface TestSetupOptions {
  type: 'unit' | 'integration' | 'e2e' | 'performance';
  isolation?: boolean;              // Enable environment isolation
  monitoring?: boolean;             // Enable performance monitoring
  cleanup?: {                      // Cleanup configuration
    memory?: boolean;              // Clean up memory
    files?: boolean;               // Clean up temporary files
    processes?: boolean;           // Clean up processes
    network?: boolean;             // Clean up network mocks
  };
  thresholds?: Partial<PerformanceThresholds>;  // Performance thresholds
  timeout?: number;                // Test timeout in milliseconds
}
```

### Performance Thresholds

```typescript
interface PerformanceThresholds {
  maxMemoryMB: number;            // Maximum memory usage
  maxExecutionTimeMs: number;     // Maximum execution time
  maxGCTime: number;              // Maximum GC time
  maxResponseTimeMs: number;      // Maximum response time
  minThroughputOps: number;       // Minimum throughput
}
```

## 🧪 Test Environment Types

### Unit Test Environment

Minimal setup for fast unit testing:

```typescript
const env = await quickSetup.unit();
await env.setup();

// Clean, isolated environment
expect(env.type).toBe('unit');
expect(env.isReady()).toBe(true);

await env.teardown();
```

**Features:**
- Minimal resource usage
- Fast setup/teardown
- Mock clearing between tests
- Basic metrics tracking

### Integration Test Environment

Comprehensive environment for integration testing:

```typescript
const env = await quickSetup.integration(true); // with isolation
await env.setup();

// Full integration environment with memory, task execution, etc.
const metrics = env.getMetrics();
expect(metrics.memoryUsage).toBeDefined();
expect(metrics.taskExecution).toBeDefined();

await env.teardown();
```

**Features:**
- QEMemory system with session management
- TaskExecutor with resource limits
- Network mocking and isolation
- Temporary file system isolation
- Comprehensive metrics collection
- Automatic resource cleanup

### E2E Test Environment

Full system testing environment:

```typescript
const env = await quickSetup.e2e();
await env.setup();

// Complete system with external services
const services = env.externalServices.getServiceStatus();
expect(services).toHaveLength(3); // api-gateway, database, cache

// Execute test scenarios
const scenario = await env.scenario.loadScenario('user-registration');
const result = await env.scenario.executeScenario(scenario);
expect(result.success).toBe(true);

await env.teardown();
```

**Features:**
- External service simulation
- Scenario management and execution
- System validation (security, performance, data integrity)
- Network mocking with realistic responses
- Artifact collection and archiving
- Comprehensive validation reporting

### Performance Test Environment

Specialized environment for performance testing:

```typescript
const env = await quickSetup.performance({
  maxMemoryMB: 256,
  maxExecutionTimeMs: 5000
});
await env.setup();

// Performance monitoring active
env.markStart('test-operation');
// ... perform operation ...
const duration = env.markEnd('test-operation');

const report = await env.stopMonitoring();
expect(report.warnings).toHaveLength(0);

await env.teardown();
```

**Features:**
- Real-time performance monitoring
- Memory and CPU tracking
- GC time measurement
- Performance marks and measures
- Bottleneck detection
- Automated recommendations
- Threshold violation warnings

## 📊 Metrics and Monitoring

### Accessing Metrics

```typescript
const env = hooks.getEnvironment();
const metrics = env?.getMetrics();

// Check different metric types
if (metrics.type === 'integration') {
  console.log('Memory entries:', metrics.memoryUsage.entries);
  console.log('Tasks completed:', metrics.taskExecution.completed);
}

if (metrics.performance) {
  console.log('Heap used:', metrics.performance.memory.heapUsed);
  console.log('Operations:', metrics.performance.operations.completed);
}
```

### Performance Reports

```typescript
// Automatic performance reporting
describe('Performance Test', () => {
  beforeAll(() => performanceTestHooks.beforeAll('My Performance Test'));
  afterAll(performanceTestHooks.afterAll); // Generates report

  it('should complete within thresholds', async () => {
    // Test implementation
  });
});
```

Sample performance report output:
```
📊 Performance Report for My Performance Test:
Duration: 1247ms
Memory Peak: 89.3MB
Operations: 150
Avg Operation Time: 8.3ms

⚠️ Performance Warnings:
  - None detected

💡 Performance Recommendations:
  - Consider caching for repeated operations
```

## 🔍 Validation and Quality Gates

### System Validation

```typescript
const env = await quickSetup.e2e();
await env.setup();

// Comprehensive system validation
const validation = await env.validate.validateSystemState();
expect(validation.memory).toBe(true);
expect(validation.processes).toBe(true);
expect(validation.network).toBe(true);
expect(validation.filesystem).toBe(true);
```

### Data Integrity Validation

```typescript
const dataValidation = await env.validate.validateDataIntegrity();
expect(dataValidation.integrity).toBe(true);
expect(dataValidation.consistency).toBe(true);
expect(dataValidation.completeness).toBe(true);
```

### Security Validation

```typescript
const securityValidation = await env.validate.validateSecurity();
expect(securityValidation.authentication).toBe(true);
expect(securityValidation.authorization).toBe(true);
expect(securityValidation.dataProtection).toBe(true);
```

## 🧹 Cleanup and Resource Management

### Automatic Cleanup

All test environments automatically handle:

- Memory cleanup (clear caches, sessions, temporary data)
- File system cleanup (remove temporary directories and files)
- Process cleanup (terminate child processes)
- Network cleanup (restore mocked services, close connections)
- Handle cleanup (clear timers, event listeners)

### Manual Cleanup

```typescript
const env = await createTestEnvironment({ type: 'integration' });
await env.setup();

try {
  // Test operations
} finally {
  // Ensure cleanup even on test failure
  await env.teardown();
}
```

### Resource Leak Detection

The setup system automatically detects and warns about:

- Memory leaks (heap usage above thresholds)
- Hanging handles (timers, file descriptors)
- Active network connections
- Unclosed processes

## 🚧 Error Handling

### Setup Failures

```typescript
try {
  const env = await createTestEnvironment({ type: 'integration' });
  await env.setup();
} catch (error) {
  console.error('Setup failed:', error);
  // Environment automatically cleans up on setup failure
}
```

### Test Failures

```typescript
describe('Test Suite', () => {
  const hooks = createTestHooks({ type: 'integration' });

  beforeAll(hooks.beforeAll);
  afterAll(hooks.afterAll); // Always runs, even if tests fail

  it('might fail', () => {
    throw new Error('Test failure');
    // Environment still cleans up properly
  });
});
```

### Timeout Handling

```typescript
const env = await createTestEnvironment({
  type: 'integration',
  timeout: 10000 // 10 second timeout
});

// Setup and teardown respect timeout limits
// Tests that exceed timeout are automatically terminated
```

## 🎯 Best Practices

### 1. Choose the Right Environment Type

- **Unit tests**: Use `unit` type for fast, isolated tests
- **Integration tests**: Use `integration` type for testing component interactions
- **E2E tests**: Use `e2e` type for full system testing
- **Performance tests**: Use `performance` type for benchmarking

### 2. Enable Monitoring for Critical Tests

```typescript
const hooks = createTestHooks({
  type: 'integration',
  monitoring: true, // Enable for performance-critical tests
  isolation: true   // Enable for tests that modify global state
});
```

### 3. Use Appropriate Cleanup Levels

```typescript
// For tests that create files
const env = await createTestEnvironment({
  type: 'integration',
  cleanup: {
    files: true,     // Clean up test files
    memory: true,    // Clean up memory
    processes: false, // Keep processes for debugging
    network: true    // Clean up network mocks
  }
});
```

### 4. Set Realistic Performance Thresholds

```typescript
const env = await quickSetup.performance({
  maxMemoryMB: 128,        // Realistic for your tests
  maxExecutionTimeMs: 5000, // Allow for actual operation time
  maxGCTime: 50,           // Account for garbage collection
  maxResponseTimeMs: 1000   // Set based on SLA requirements
});
```

### 5. Handle Async Operations Properly

```typescript
describe('Async Test Suite', () => {
  const hooks = createTestHooks({ type: 'integration' });

  beforeAll(async () => {
    await hooks.beforeAll();
    // Additional async setup if needed
  });

  afterAll(async () => {
    // Custom cleanup before standard teardown
    await hooks.afterAll();
  });
});
```

## 📈 Examples and Templates

See `tests/examples/setup-usage-examples.test.ts` for comprehensive examples of:

- Basic setup and teardown patterns
- Error handling scenarios
- Performance monitoring usage
- Custom configuration examples
- Hook integration patterns

## 🔗 Integration with Jest

The setup system integrates seamlessly with Jest through:

- Global setup/teardown functions
- Custom test environment configuration
- Enhanced matchers and utilities
- Coverage threshold enforcement
- CI/CD optimizations

### Jest Configuration

```javascript
// jest.config.js
module.exports = {
  globalSetup: '<rootDir>/tests/setup/global-setup.ts',
  globalTeardown: '<rootDir>/tests/setup/global-setup.ts',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  // ... other configuration
};
```

## 🎛 Environment Variables

The setup system respects these environment variables:

- `NODE_ENV`: Set to 'test' automatically
- `QE_TEST_MODE`: Set to 'true' during testing
- `QE_LOG_LEVEL`: Controls logging verbosity
- `QE_TEST_TYPE`: Current test type (unit/integration/e2e/performance)
- `CI`: Enables stricter settings in CI environments

## 🆘 Troubleshooting

### Common Issues

1. **Memory leaks**: Check for unclosed resources, use isolation mode
2. **Slow tests**: Enable performance monitoring to identify bottlenecks
3. **Flaky tests**: Use proper setup/teardown and state isolation
4. **Resource exhaustion**: Adjust thresholds and cleanup settings

### Debug Mode

```typescript
// Enable debug logging
process.env.QE_LOG_LEVEL = 'debug';

const env = await createTestEnvironment({
  type: 'integration',
  // Additional debugging options
});
```

### Analyzing Performance Reports

Performance reports are saved to `tmp/performance-reports/` and include:

- Detailed timing breakdowns
- Memory usage patterns
- GC analysis
- Bottleneck identification
- Optimization recommendations

For more information, refer to the inline documentation in each setup file and the comprehensive examples provided.