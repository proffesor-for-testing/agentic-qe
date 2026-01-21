# Streaming API Tutorial

**Version**: 1.0.5
**Last Updated**: October 16, 2025

---

## Introduction

The Streaming API provides **real-time progress updates** for long-running QE operations. Instead of waiting minutes for test generation to complete without feedback, you get live updates every second showing exactly what's happening.

### Key Benefits

- **Real-Time Visibility**: See progress as tests execute
- **Better UX**: No more black-box waiting
- **Early Error Detection**: Catch issues before completion
- **Resource Monitoring**: Track memory, CPU, test count in real-time
- **Cancellation Support**: Stop operations mid-stream

### When to Use Streaming

✅ **Use Streaming For**:
- Test generation (>50 tests)
- Test execution (>100 tests)
- Coverage analysis (>10k LOC)
- Security scanning (>5 min)
- Performance testing (load tests)

❌ **Don't Use Streaming For**:
- Quick operations (<5 seconds)
- Single unit test generation
- Simple validations
- Configuration checks

---

## Quick Start

### 1. Enable Streaming

```yaml
# .agentic-qe/config.yaml
features:
  streamingTools: true

streaming:
  enabled: true
  updateInterval: 1000  # 1 second
  bufferSize: 100
```

### 2. Basic Streaming Example

```typescript
import { FleetManager } from 'agentic-qe';

const fleet = new FleetManager();

// Subscribe to test generation stream
const stream = fleet.streamTestGeneration({
  sourceFile: 'src/services/user-service.ts',
  framework: 'jest',
  targetCoverage: 95
});

// Listen for progress updates
stream.on('progress', (update) => {
  console.log(`[${update.timestamp}] ${update.status}`);
  console.log(`Progress: ${update.progress}% (${update.completed}/${update.total})`);
  console.log(`Current: ${update.currentOperation}`);
});

// Listen for completion
stream.on('complete', (result) => {
  console.log('✓ Test generation complete!');
  console.log(`Generated ${result.testCount} tests`);
  console.log(`Coverage: ${result.coverage}%`);
});

// Handle errors
stream.on('error', (error) => {
  console.error('✗ Error:', error.message);
});

// Start the operation
await stream.start();
```

**Output**:
```
[2025-10-16T10:30:01] Analyzing source file...
Progress: 10% (1/10)
Current: Extracting functions and classes

[2025-10-16T10:30:02] Generating unit tests...
Progress: 30% (3/10)
Current: Creating tests for UserService.createUser

[2025-10-16T10:30:04] Generating integration tests...
Progress: 60% (6/10)
Current: Testing database operations

[2025-10-16T10:30:06] Running generated tests...
Progress: 90% (9/10)
Current: Calculating coverage

[2025-10-16T10:30:07] Complete!
✓ Test generation complete!
Generated 45 tests
Coverage: 96.2%
```

---

## Using Streaming Tools

### Test Generation with Streaming

```typescript
import { TestGeneratorAgent } from 'agentic-qe';

const agent = new TestGeneratorAgent();

// Create streaming request
const stream = await agent.generateTestsStreaming({
  sourceFile: 'src/utils/validator.ts',
  framework: 'jest',
  testTypes: ['unit', 'integration'],
  targetCoverage: 90
});

// Progress bar integration
const progressBar = new ProgressBar('Generating [:bar] :percent :etas', {
  total: 100,
  width: 40
});

stream.on('progress', (update) => {
  progressBar.update(update.progress / 100);
});

stream.on('metrics', (metrics) => {
  console.log('Metrics:', metrics);
  // {
  //   testsGenerated: 23,
  //   coverage: 85.5,
  //   memoryUsage: '145 MB',
  //   duration: 12300
  // }
});

const result = await stream.complete();
```

### Test Execution with Streaming

```typescript
import { TestExecutorAgent } from 'agentic-qe';

const executor = new TestExecutorAgent();

const stream = await executor.executeTestsStreaming({
  testFiles: 'tests/**/*.test.ts',
  parallel: true,
  maxWorkers: 8
});

// Track individual test results
stream.on('test:started', (test) => {
  console.log(`Starting: ${test.name}`);
});

stream.on('test:passed', (test) => {
  console.log(`✓ ${test.name} (${test.duration}ms)`);
});

stream.on('test:failed', (test) => {
  console.log(`✗ ${test.name}`);
  console.log(`  Error: ${test.error.message}`);
});

// Summary statistics
stream.on('progress', (stats) => {
  console.log(`Tests: ${stats.passed}/${stats.total} passed (${stats.failed} failed)`);
  console.log(`Duration: ${stats.elapsed}ms`);
  console.log(`Workers: ${stats.activeWorkers}/${stats.maxWorkers}`);
});

const results = await stream.complete();
```

### Coverage Analysis with Streaming

```typescript
import { CoverageAnalyzerAgent } from 'agentic-qe';

const analyzer = new CoverageAnalyzerAgent();

const stream = await analyzer.analyzeStreaming({
  sourcePath: 'src/',
  testPath: 'tests/',
  framework: 'jest'
});

// Live coverage updates
stream.on('file:analyzed', (file) => {
  console.log(`${file.path}: ${file.coverage}%`);
});

// Gap detection
stream.on('gap:detected', (gap) => {
  console.log(`Coverage gap in ${gap.file}:`);
  console.log(`  Lines: ${gap.uncoveredLines.join(', ')}`);
  console.log(`  Functions: ${gap.uncoveredFunctions.join(', ')}`);
});

// Real-time metrics
stream.on('metrics', (metrics) => {
  console.log(`Overall coverage: ${metrics.overall}%`);
  console.log(`Files analyzed: ${metrics.filesAnalyzed}/${metrics.totalFiles}`);
});

const report = await stream.complete();
```

---

## Integration

### Integrating with Existing Code

#### Before (Non-Streaming)

```typescript
// Old approach: No feedback until complete
async function generateTests(file: string) {
  console.log('Generating tests...');

  const result = await fleet.generateTests({ sourceFile: file });

  console.log('Done!');
  return result;
}

// User sees:
// "Generating tests..."
// [3 minutes of silence]
// "Done!"
```

#### After (Streaming)

```typescript
// New approach: Real-time updates
async function generateTests(file: string) {
  const stream = await fleet.streamTestGeneration({ sourceFile: file });

  // Show live progress
  stream.on('progress', (update) => {
    console.log(`[${update.progress}%] ${update.currentOperation}`);
  });

  // Show intermediate results
  stream.on('test:generated', (test) => {
    console.log(`✓ Generated test: ${test.name}`);
  });

  const result = await stream.complete();
  return result;
}

// User sees:
// "[10%] Analyzing source file"
// "[25%] Generating unit tests"
// "✓ Generated test: should create user with valid data"
// "✓ Generated test: should reject invalid email"
// "[50%] Generating integration tests"
// ...
```

### Migration from Non-Streaming

**Step 1**: Identify long-running operations

```typescript
// Find operations that take >5 seconds
const operations = [
  'fleet.generateTests',
  'fleet.executeTests',
  'fleet.analyzeCoverage',
  'fleet.scanSecurity'
];
```

**Step 2**: Add streaming wrapper

```typescript
// Create streaming wrapper
async function withStreaming<T>(
  operation: () => Promise<T>,
  streamFactory: () => OperationStream<T>
): Promise<T> {
  if (config.features.streamingTools) {
    const stream = streamFactory();
    attachProgressListeners(stream);
    return stream.complete();
  } else {
    // Fallback to non-streaming
    return operation();
  }
}
```

**Step 3**: Update function calls

```typescript
// Before
const result = await fleet.generateTests(options);

// After
const result = await withStreaming(
  () => fleet.generateTests(options),
  () => fleet.streamTestGeneration(options)
);
```

### CLI Integration

```bash
#!/bin/bash
# streaming-test-gen.sh

# Enable streaming in CLI
export AQE_STREAMING_ENABLED=true
export AQE_STREAMING_FORMAT=fancy  # Options: simple, fancy, json

# Run with progress bar
aqe test src/services/*.ts --stream

# Output:
# Generating tests for 5 files
# ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░ 75% | 3/5 files | user-service.ts
#
# Current: Generating integration tests
# Generated: 127 tests
# Coverage: 94.2%
# Time: 00:02:34
```

### CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install dependencies
        run: npm ci

      - name: Generate tests (with streaming)
        run: |
          # Stream to GitHub Actions logs
          npx aqe test src/ --stream --format json | tee test-generation.log

      - name: Parse streaming output
        run: |
          # Extract final results from stream
          cat test-generation.log | jq -r 'select(.type == "complete") | .data'

      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: test-generation.log
```

---

## Best Practices

### 1. Buffer Management

```typescript
// Configure buffer size based on operation
const config = {
  streaming: {
    bufferSize: {
      'test-generation': 100,     // Moderate buffering
      'test-execution': 1000,     // Large buffer (many events)
      'coverage-analysis': 50,    // Small buffer
      'security-scan': 200        // Moderate buffering
    }
  }
};
```

### 2. Error Recovery

```typescript
const stream = await agent.generateTestsStreaming(options);

// Implement retry logic
stream.on('error', async (error) => {
  if (error.retryable) {
    console.log('Retrying...');
    await stream.retry();
  } else {
    console.error('Fatal error:', error.message);
    await stream.abort();
  }
});

// Automatic recovery
stream.on('connection:lost', async () => {
  console.log('Connection lost, reconnecting...');
  await stream.reconnect({ maxAttempts: 3, delay: 1000 });
});
```

### 3. Resource Cleanup

```typescript
const stream = await agent.executeTestsStreaming(options);

// Always clean up
try {
  const result = await stream.complete();
  return result;
} catch (error) {
  await stream.abort();  // Clean up resources
  throw error;
} finally {
  stream.removeAllListeners();  // Prevent memory leaks
}
```

### 4. Progress Visualization

```typescript
import chalk from 'chalk';
import ora from 'ora';

const stream = await agent.generateTestsStreaming(options);

// Spinner for operations
const spinner = ora('Analyzing source file...').start();

stream.on('progress', (update) => {
  spinner.text = `${update.currentOperation} (${update.progress}%)`;

  if (update.progress === 100) {
    spinner.succeed('Complete!');
  }
});

// Colored output for test results
stream.on('test:generated', (test) => {
  console.log(chalk.green('✓'), test.name);
});

stream.on('test:failed', (test) => {
  console.log(chalk.red('✗'), test.name);
  console.log(chalk.gray(`  ${test.error.message}`));
});
```

### 5. Performance Monitoring

```typescript
const stream = await agent.executeTestsStreaming(options);

// Track performance metrics
const metrics = {
  startTime: Date.now(),
  eventsReceived: 0,
  bandwidth: 0
};

stream.on('data', (chunk) => {
  metrics.eventsReceived++;
  metrics.bandwidth += chunk.length;
});

stream.on('complete', () => {
  const duration = Date.now() - metrics.startTime;
  console.log(`Received ${metrics.eventsReceived} events in ${duration}ms`);
  console.log(`Bandwidth: ${(metrics.bandwidth / 1024).toFixed(2)} KB`);
});
```

---

## Performance

### Overhead Analysis

| Operation | Non-Streaming | Streaming | Overhead | Worth It? |
|-----------|---------------|-----------|----------|-----------|
| Test Gen (10 tests) | 5s | 5.1s | +2% | ✗ No |
| Test Gen (100 tests) | 45s | 46s | +2% | ✓ Yes |
| Test Exec (50 tests) | 10s | 10.2s | +2% | ✓ Yes |
| Test Exec (1000 tests) | 120s | 122s | +1.6% | ✓ Yes |
| Coverage (<1k LOC) | 2s | 2.1s | +5% | ✗ No |
| Coverage (10k+ LOC) | 30s | 30.5s | +1.6% | ✓ Yes |

**Recommendation**: Use streaming for operations >5 seconds. Overhead is negligible for long operations.

### Memory Considerations

```typescript
// Configure memory limits
const stream = await agent.generateTestsStreaming({
  ...options,
  streaming: {
    maxMemory: 512 * 1024 * 1024,  // 512 MB
    enableBackpressure: true,
    highWaterMark: 16384           // 16 KB
  }
});

// Monitor memory usage
stream.on('memory:warning', (usage) => {
  console.warn(`High memory usage: ${usage.current}/${usage.limit}`);
});

stream.on('memory:limit', async () => {
  console.error('Memory limit reached, pausing...');
  await stream.pause();

  // Wait for GC
  await new Promise(resolve => setTimeout(resolve, 5000));

  await stream.resume();
});
```

### Scalability Tips

#### 1. Connection Pooling

```typescript
// Reuse connections for multiple streams
const pool = new StreamConnectionPool({
  maxConnections: 10,
  idleTimeout: 60000,
  reuseConnections: true
});

// All streams share the pool
const stream1 = await agent1.generateTestsStreaming({ pool });
const stream2 = await agent2.executeTestsStreaming({ pool });
```

#### 2. Batching Events

```typescript
// Batch small events to reduce overhead
const stream = await agent.generateTestsStreaming({
  ...options,
  streaming: {
    batchEvents: true,
    batchSize: 10,
    batchInterval: 500  // 500ms
  }
});

// Receive batched events
stream.on('batch', (events) => {
  // Process 10 events at once
  events.forEach(event => processEvent(event));
});
```

#### 3. Compression

```typescript
// Enable compression for large payloads
const stream = await agent.analyzeCoverageStreaming({
  ...options,
  streaming: {
    compression: 'gzip',
    compressionLevel: 6
  }
});

// Reduces bandwidth by 70-80% for coverage data
```

---

## Advanced Features

### Custom Event Handlers

```typescript
class CustomStreamHandler {
  onProgress(update: ProgressUpdate) {
    // Send to monitoring system
    monitoring.track('test_generation_progress', {
      progress: update.progress,
      operation: update.currentOperation
    });
  }

  onMetrics(metrics: Metrics) {
    // Send to metrics dashboard
    dashboard.update('test_metrics', metrics);
  }

  onError(error: Error) {
    // Send to error tracking
    sentry.captureException(error);
  }
}

// Register handler
stream.on('*', new CustomStreamHandler());
```

### Stream Composition

```typescript
// Compose multiple streams
const generateStream = await agent.generateTestsStreaming(options);
const executeStream = await agent.executeTestsStreaming(options);

// Chain streams
generateStream.pipe(executeStream).on('complete', (results) => {
  console.log('Both generation and execution complete!');
});

// Merge streams
const mergedStream = Stream.merge([
  generateStream,
  executeStream
]);

mergedStream.on('progress', (update) => {
  // Unified progress from both operations
  console.log(`Overall: ${update.progress}%`);
});
```

### Stream Filtering

```typescript
const stream = await agent.executeTestsStreaming(options);

// Filter events
const filteredStream = stream.filter((event) => {
  // Only show failed tests
  return event.type === 'test:failed';
});

filteredStream.on('data', (failedTest) => {
  console.error('Failed:', failedTest.name);
});
```

### Stream Transformation

```typescript
const stream = await agent.generateTestsStreaming(options);

// Transform events
const transformedStream = stream.map((event) => {
  // Convert to custom format
  return {
    timestamp: new Date().toISOString(),
    level: event.type.includes('error') ? 'error' : 'info',
    message: event.message,
    data: event.data
  };
});

// Send to logging system
transformedStream.on('data', (logEntry) => {
  logger.log(logEntry);
});
```

---

## Troubleshooting

### Issue 1: No Progress Updates

**Symptoms**: Stream starts but no events received

**Solutions**:

```typescript
// 1. Check if streaming is enabled
console.log('Streaming enabled:', config.features.streamingTools);

// 2. Verify event listeners are attached BEFORE starting
stream.on('progress', handler);
await stream.start();  // Start AFTER attaching listeners

// 3. Check update interval
const stream = await agent.generateTestsStreaming({
  ...options,
  streaming: {
    updateInterval: 1000  // Increase if too frequent
  }
});
```

### Issue 2: Connection Timeouts

**Symptoms**: Stream disconnects during long operations

**Solutions**:

```typescript
// 1. Increase timeout
const stream = await agent.generateTestsStreaming({
  ...options,
  streaming: {
    timeout: 600000,  // 10 minutes
    keepAlive: true,
    keepAliveInterval: 30000  // 30 seconds
  }
});

// 2. Enable automatic reconnection
stream.on('connection:lost', async () => {
  await stream.reconnect({ maxAttempts: 5, backoff: true });
});
```

### Issue 3: Memory Leaks

**Symptoms**: Memory usage grows continuously

**Solutions**:

```typescript
// 1. Always remove listeners
stream.on('complete', () => {
  stream.removeAllListeners();
});

// 2. Limit buffer size
const stream = await agent.generateTestsStreaming({
  ...options,
  streaming: {
    bufferSize: 100,  // Limit buffered events
    dropOldest: true   // Drop old events when full
  }
});

// 3. Use weak references for handlers
const handler = new WeakRef(() => {
  // Handler logic
});
stream.on('progress', handler);
```

### Issue 4: Events Out of Order

**Symptoms**: Progress updates arrive in wrong order

**Solutions**:

```typescript
// 1. Enable ordering
const stream = await agent.generateTestsStreaming({
  ...options,
  streaming: {
    ordered: true,
    sequenceNumbers: true
  }
});

// 2. Buffer and sort events
const buffer: Event[] = [];
stream.on('data', (event) => {
  buffer.push(event);
  buffer.sort((a, b) => a.sequence - b.sequence);

  // Process in order
  while (buffer.length > 0 && buffer[0].sequence === nextExpected) {
    processEvent(buffer.shift());
    nextExpected++;
  }
});
```

---

## FAQ

### Q: Can I use streaming with non-streaming MCP tools?

**A**: Yes, streaming is backward compatible:

```typescript
// Works with both streaming and non-streaming
const result = config.features.streamingTools
  ? await agent.generateTestsStreaming(options).complete()
  : await agent.generateTests(options);
```

### Q: Does streaming work in CI/CD?

**A**: Yes, but format output appropriately:

```bash
# JSON format for parsing
aqe test --stream --format json > results.json

# Simple format for logs
aqe test --stream --format simple
```

### Q: What's the performance impact?

**A**: Minimal (~2% overhead) for operations >5 seconds. See [Performance](#performance) section.

### Q: Can I cancel a streaming operation?

**A**: Yes:

```typescript
stream.on('progress', (update) => {
  if (shouldCancel) {
    stream.abort();
  }
});
```

### Q: How do I test streaming in unit tests?

**A**: Use mock streams:

```typescript
import { MockStream } from 'agentic-qe/testing';

const mockStream = new MockStream();
mockStream.emit('progress', { progress: 50 });
mockStream.emit('complete', { result: 'success' });

// Test your handler
await myHandler(mockStream);
```

---

## Next Steps

1. **Enable Streaming**: Update config with `streamingTools: true`
2. **Try Examples**: Run code samples from this guide
3. **Monitor Performance**: Check overhead in your use case
4. **Integrate**: Add streaming to long operations
5. **Learn More**: Read [API Reference: Streaming API](../api/STREAMING-API.md)

---

## Related Documentation

- [Multi-Model Router Guide](MULTI-MODEL-ROUTER.md)
- [Cost Optimization Best Practices](COST-OPTIMIZATION.md)
- [Migration Guide](MIGRATION-V1.0.5.md)
- [API Reference: Streaming API](../api/STREAMING-API.md)

---

**Questions?** Open an issue: https://github.com/proffesor-for-testing/agentic-qe/issues
