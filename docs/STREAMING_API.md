# Streaming API Documentation

## Overview

The Streaming API provides real-time progress updates for long-running operations using AsyncGenerator pattern. It supports `for-await-of` compatibility and incremental result emission.

## Features

✅ **Real-time Progress Updates** - Get progress percentage and status messages as operations execute
✅ **AsyncGenerator Pattern** - Native JavaScript async iteration support
✅ **for-await-of Compatibility** - Clean, idiomatic iteration syntax
✅ **Incremental Results** - Receive partial results before operation completes
✅ **Cancellation Support** - Cancel long-running operations gracefully
✅ **Error Handling** - Structured error events with stack traces

## Architecture

```
BaseStreamHandler (abstract)
├── TestGenerateStreamHandler
├── TestExecuteStreamHandler (MCP)
└── CoverageAnalyzeStreamHandler (MCP)
```

## Usage Examples

### Basic Usage

```typescript
import { TestGenerateStreamHandler } from 'agentic-qe/streaming';

const handler = new TestGenerateStreamHandler();

for await (const event of handler.execute({
  sourceFile: './src/UserService.ts',
  framework: 'jest',
  includeEdgeCases: true
})) {
  if (event.type === 'progress') {
    console.log(`${event.percent}% - ${event.message}`);
  } else if (event.type === 'result') {
    console.log('Result:', event.data);
  }
}
```

### With Progress Tracking

```typescript
const handler = new TestExecuteStreamHandler();
let currentProgress = 0;

for await (const event of handler.execute({
  testFiles: ['test1.js', 'test2.js', 'test3.js'],
  framework: 'jest',
  parallel: true
})) {
  if (event.type === 'progress') {
    const progress = event.percent || 0;

    if (progress > currentProgress) {
      currentProgress = progress;
      updateProgressBar(progress);
    }
  }

  if (event.type === 'result' && event.metadata?.type === 'intermediate') {
    console.log('Test completed:', event.data);
  }
}
```

### Error Handling

```typescript
const handler = new CoverageAnalyzeStreamHandler();

try {
  for await (const event of handler.execute(params)) {
    if (event.type === 'error') {
      console.error('Error occurred:', event.error?.message);
      // Can continue or break depending on error
    }
  }
} catch (error) {
  console.error('Fatal error:', error);
}
```

### Cancellation

```typescript
const handler = new TestGenerateStreamHandler();

// Start processing
const processingTask = (async () => {
  for await (const event of handler.execute(params)) {
    // Process events
  }
})();

// Cancel after timeout
setTimeout(() => {
  handler.cancel();
  console.log('Operation cancelled');
}, 30000);
```

## Event Types

### Progress Event

```typescript
{
  type: 'progress',
  timestamp: number,
  percent: number,        // 0-100
  message: string,
  metadata?: {
    currentItem?: string,
    itemsProcessed?: number,
    itemsTotal?: number
  }
}
```

### Result Event

```typescript
{
  type: 'result',
  timestamp: number,
  data: any,
  metadata?: {
    type: 'intermediate' | 'final',
    progress?: number,
    total?: number
  }
}
```

### Error Event

```typescript
{
  type: 'error',
  timestamp: number,
  error: Error,
  message: string,
  metadata?: {
    errorType: string,
    stack?: string
  }
}
```

### Complete Event

```typescript
{
  type: 'complete',
  timestamp: number,
  percent: 100,
  message: string,
  metadata: {
    executionTime: number,
    executionTimeFormatted: string
  }
}
```

## Available Handlers

### TestGenerateStreamHandler

Generates tests with real-time progress updates.

```typescript
const handler = new TestGenerateStreamHandler();

for await (const event of handler.execute({
  sourceFile: './src/api.ts',
  framework: 'jest',
  testType: 'unit',
  coverage: 95,
  includeEdgeCases: true,
  generateMocks: true
})) {
  // Handle events
}
```

**Events:**
- Progress: File analysis, function extraction, test generation
- Results: Generated test for each function
- Final Result: Complete test file with all tests

### TestExecuteStreamHandler

Executes tests with test-by-test progress.

```typescript
const handler = new TestExecuteStreamHandler();

for await (const event of handler.execute({
  testFiles: ['test1.js', 'test2.js'],
  framework: 'jest',
  parallel: true,
  coverage: true
})) {
  // Handle events
}
```

**Events:**
- Progress: Test suite execution status
- Results: Individual test results
- Final Result: Complete execution summary

### CoverageAnalyzeStreamHandler

Analyzes coverage with incremental gap detection.

```typescript
const handler = new CoverageAnalyzeStreamHandler();

for await (const event of handler.execute({
  sourceFiles: ['src/**/*.ts'],
  coverageThreshold: 95,
  useJohnsonLindenstrauss: true,
  analysisDepth: 'comprehensive'
})) {
  // Handle events
}
```

**Events:**
- Progress: File analysis, gap detection
- Results: Coverage gaps per file
- Final Result: Complete coverage report

## Creating Custom Handlers

```typescript
import { BaseStreamHandler, StreamEvent } from 'agentic-qe/streaming';

class MyCustomHandler extends BaseStreamHandler {
  protected async *processTask(params: MyParams): AsyncGenerator<StreamEvent> {
    // Initial progress
    yield this.progressEvent(0, 'Starting...');

    // Process items
    for (let i = 0; i < params.items.length; i++) {
      const item = params.items[i];
      const percent = this.calculateProgress(i, params.items.length);

      yield this.progressEvent(percent, `Processing ${item.name}...`);

      // Do work
      const result = await this.processItem(item);

      // Emit intermediate result
      yield this.resultEvent(result, { type: 'intermediate' });

      // Check cancellation
      if (this.isCancelled()) {
        throw new Error('Operation cancelled');
      }
    }

    yield this.progressEvent(100, 'Complete');
  }

  private async processItem(item: any): Promise<any> {
    // Implementation
  }
}
```

## Performance

- **Event Emission**: <1ms overhead per event
- **Memory Usage**: Minimal (streaming, not buffering)
- **Cancellation**: Immediate response to cancel()
- **Error Recovery**: Graceful handling with structured errors

## Best Practices

1. **Progress Granularity**: Update progress every 5-10% for smooth UX
2. **Intermediate Results**: Emit results as soon as they're available
3. **Error Context**: Include helpful metadata in error events
4. **Cancellation Checks**: Check `isCancelled()` in long loops
5. **Resource Cleanup**: Always handle cleanup in finally blocks

## Testing

```bash
# Run streaming tests
npm run test:streaming

# Run specific handler tests
npm test tests/streaming/streaming-api.test.ts
```

## MCP Integration

Streaming handlers are integrated with MCP tools:

```typescript
// Via MCP tool
const events = await mcp__agentic_qe__test_execute_stream({
  testFiles: ['test.js'],
  framework: 'jest'
});

for await (const event of events) {
  console.log(event);
}
```

## Troubleshooting

### Progress Not Updating

- Ensure you're checking `event.type === 'progress'`
- Verify handler is emitting progress events
- Check event loop is not blocked

### Memory Leaks

- Always consume all events from AsyncGenerator
- Use `break` or `return` to exit early
- Call `handler.cancel()` when stopping

### Slow Performance

- Reduce progress update frequency
- Use buffering for high-frequency events
- Check underlying operation performance

## API Reference

See [API Documentation](./api/streaming/) for complete API reference.
