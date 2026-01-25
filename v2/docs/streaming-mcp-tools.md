# Streaming MCP Tools - v1.0.5

## Overview

Agentic QE Fleet v1.0.5 introduces streaming support for long-running MCP operations, providing real-time progress updates for improved user experience and better visibility into test execution and coverage analysis.

## Features

### ✅ Real-Time Progress Updates
- Progress events emitted at configurable intervals (default: every 2-5 seconds)
- Per-test completion tracking with status, duration, and metrics
- Incremental file-by-file coverage analysis reporting

### ✅ Memory Efficient
- AsyncGenerator-based streaming (no buffering of entire results)
- Progressive result disclosure
- Automatic resource cleanup

### ✅ Error Resilient
- Proper error handling maintains stream integrity
- Recoverable vs non-recoverable error classification
- Session state persistence for recovery

### ✅ Backward Compatible
- Non-streaming tools continue to work unchanged
- Streaming tools can be used interchangeably with non-streaming versions
- Same input parameters as non-streaming equivalents

## Architecture

### StreamingMCPTool Base Class

```typescript
abstract class StreamingMCPTool {
  // Returns AsyncGenerator yielding StreamEvent objects
  async *execute(params: any): AsyncGenerator<StreamEvent, void, undefined>

  // Subclasses implement this with progress reporting
  protected abstract executeWithProgress(
    params: any,
    reporter: ProgressReporter
  ): Promise<any>
}
```

### Event Types

**Progress Event:**
```typescript
{
  type: 'progress',
  message: string,
  percent: number,
  currentItem?: string,
  itemsProcessed?: number,
  itemsTotal?: number,
  timestamp: string,
  metadata?: Record<string, any>
}
```

**Result Event:**
```typescript
{
  type: 'result',
  data: any,
  timestamp: string,
  executionTime?: number,
  metadata?: Record<string, any>
}
```

**Error Event:**
```typescript
{
  type: 'error',
  error: string,
  details?: any,
  timestamp: string,
  recoverable?: boolean
}
```

## Available Streaming Tools

### 1. Test Execution Stream (`test_execute_stream`)

**Use Case:** Long-running test suites (>30 seconds)

**Features:**
- Real-time test completion updates
- Per-suite and per-test progress tracking
- Status updates (passed/failed/skipped)
- Duration metrics
- Parallel execution support with coordinated progress

**Example:**
```typescript
{
  spec: {
    testSuites: ['tests/**/*.test.js'],
    parallelExecution: true,
    retryCount: 3,
    timeoutSeconds: 300,
    reportFormat: 'json'
  },
  enableRealtimeUpdates: true
}
```

**Progress Events:**
```json
{
  "type": "progress",
  "message": "Completed suite: integration-tests (45 tests)",
  "percent": 33,
  "currentItem": "integration-tests",
  "itemsProcessed": 1,
  "itemsTotal": 3,
  "metadata": {
    "suite": "integration-tests",
    "environment": "test",
    "type": "suite-complete",
    "result": {
      "status": "passed",
      "testsCount": 45,
      "duration": 8234
    }
  }
}
```

### 2. Coverage Analysis Stream (`coverage_analyze_stream`)

**Use Case:** Large codebases with many files to analyze

**Features:**
- File-by-file analysis progress
- Incremental gap detection reporting
- O(log n) Johnson-Lindenstrauss optimization for faster analysis
- Real-time recommendations as gaps are discovered

**Example:**
```typescript
{
  sourceFiles: ['src/**/*.ts'],
  coverageThreshold: 0.8,
  useJohnsonLindenstrauss: true,
  includeUncoveredLines: true,
  analysisDepth: 'detailed'
}
```

**Progress Events:**
```json
{
  "type": "progress",
  "message": "Completed: src/agents/TestExecutor.ts (87.3% coverage)",
  "percent": 45,
  "currentItem": "src/agents/TestExecutor.ts",
  "itemsProcessed": 23,
  "itemsTotal": 51,
  "metadata": {
    "type": "file-analysis-complete",
    "file": "src/agents/TestExecutor.ts",
    "coverage": 87.3,
    "gaps": 2
  }
}
```

## Usage Examples

### Basic Streaming Test Execution

```typescript
// Using MCP tool directly
const result = await mcpClient.callTool('mcp__agentic_qe__test_execute_stream', {
  spec: {
    testSuites: ['tests/integration/**/*.test.js'],
    parallelExecution: true,
    retryCount: 3
  }
});

// Result includes streaming metadata
console.log(result.streaming); // true
console.log(result.events); // Array of all progress events
console.log(result.summary); // { totalEvents: 45, progressUpdates: 42, errors: 0 }
```

### Monitoring Progress with Event Bus

```typescript
// Subscribe to streaming progress events
eventBus.on('streaming:progress', (event) => {
  console.log(`[${event.percent}%] ${event.message}`);

  if (event.metadata?.type === 'test-complete') {
    console.log(`  Test: ${event.currentItem} - ${event.metadata.status}`);
  }
});

// Execute streaming operation
await testExecuteStreamHandler.execute(params);
```

### Session State Tracking

```typescript
// Retrieve streaming session state from memory
const session = await memoryStore.get(`streaming/session-${sessionId}`);

console.log(session.status); // 'active' | 'completed' | 'failed' | 'cancelled'
console.log(session.progress.percent); // Current progress percentage
console.log(session.progress.message); // Latest progress message

// Cancel ongoing operation
await progressReporter.cancel();
```

## Configuration

### StreamingConfig Options

```typescript
{
  progressInterval: 5000,      // Min time between updates (ms)
  bufferEvents: false,         // Buffer events for batching
  maxBufferSize: 10,           // Max buffer size before flush
  timeout: 600000,             // Operation timeout (10 min)
  persistSession: true         // Save session to memory
}
```

### Adjusting Progress Frequency

```typescript
// Faster updates for interactive scenarios
new TestExecuteStreamHandler(memoryStore, eventBus, {
  progressInterval: 2000  // Update every 2 seconds
});

// Slower updates to reduce overhead
new CoverageAnalyzeStreamHandler(memoryStore, eventBus, {
  progressInterval: 10000  // Update every 10 seconds
});
```

## Performance Characteristics

### Memory Usage
- **Non-Streaming:** O(n) - stores entire result before returning
- **Streaming:** O(1) - constant memory, progressive disclosure

### Responsiveness
- **Non-Streaming:** No feedback until completion
- **Streaming:** Updates every 2-5 seconds

### Network Overhead
- Minimal: Progress events are small (~200-500 bytes)
- Configurable interval prevents excessive updates
- Optional event buffering for batching

## Best Practices

### When to Use Streaming

✅ **Use Streaming For:**
- Test suites that run > 30 seconds
- Coverage analysis of > 50 files
- Parallel test execution with multiple suites
- Interactive CLI/UI applications
- Long-running integration tests

❌ **Don't Use Streaming For:**
- Quick unit tests (< 10 seconds)
- Single test execution
- Small codebases (< 10 files)
- Automated CI/CD pipelines (unless monitoring is needed)

### Error Handling

```typescript
try {
  for await (const event of handler.execute(params)) {
    if (event.type === 'error') {
      if (event.recoverable) {
        // Log and continue
        console.warn(`Recoverable error: ${event.error}`);
      } else {
        // Stop execution
        throw new Error(event.error);
      }
    }
  }
} catch (error) {
  // Handle fatal errors
  console.error('Streaming execution failed:', error);
}
```

### Resource Cleanup

```typescript
// Streaming handlers automatically cleanup on completion/error
// But you can also cancel explicitly:
const session = await handler.getSession();
if (session && session.status === 'active') {
  await reporter.cancel();
}
```

## Integration with AQE Agents

Streaming tools integrate seamlessly with TestExecutorAgent via AQE hooks:

```typescript
class TestExecutorAgent extends BaseAgent {
  protected async onPreTask(data: PreTaskData): Promise<void> {
    // Subscribe to streaming progress
    this.eventBus.on('streaming:progress', (event) => {
      this.logger.info(`Test progress: ${event.percent}%`);
    });
  }

  protected async onPostTask(data: PostTaskData): Promise<void> {
    // Store streaming session results
    await this.memoryStore.store('aqe/last-execution', {
      streaming: true,
      result: data.result
    });
  }
}
```

## Troubleshooting

### Progress Updates Not Appearing

**Check:**
1. `enableRealtimeUpdates` is set to `true`
2. Progress interval hasn't been set too high
3. Event bus listeners are properly registered
4. MCP server notifications are enabled

### Memory Leaks with Long Sessions

**Solution:**
- Set `persistSession: false` for ephemeral operations
- Implement periodic cleanup of old sessions
- Use TTL on memory store keys

### Slow Performance

**Optimization:**
- Increase `progressInterval` to reduce event overhead
- Enable `bufferEvents` for batching
- Use Johnson-Lindenstrauss optimization for coverage analysis

## API Reference

### StreamingMCPTool

```typescript
class StreamingMCPTool {
  constructor(
    memoryStore: Map<string, any>,
    eventBus: EventEmitter,
    config?: Partial<StreamingConfig>
  )

  async *execute(params: any): AsyncGenerator<StreamEvent, void>
  getSession(): StreamingSession | null
  isCancelled(): boolean
}
```

### ProgressReporter

```typescript
interface ProgressReporter {
  report(progress: Omit<ToolProgress, 'type' | 'timestamp'>): Promise<void>
  complete(result: Omit<ToolResult, 'type' | 'timestamp'>): Promise<void>
  error(error: Omit<ToolError, 'type' | 'timestamp'>): Promise<void>
  getProgress(): ToolProgress | null
  cancel(): Promise<void>
}
```

## Migration Guide

### From Non-Streaming to Streaming

**Before (non-streaming):**
```typescript
const result = await mcpClient.callTool('mcp__agentic_qe__test_execute', {
  spec: { testSuites: ['tests/**/*.test.js'] }
});
console.log(result); // All results at once
```

**After (streaming):**
```typescript
const result = await mcpClient.callTool('mcp__agentic_qe__test_execute_stream', {
  spec: { testSuites: ['tests/**/*.test.js'] },
  enableRealtimeUpdates: true
});

// Access streaming events
result.events.forEach(event => {
  if (event.type === 'progress') {
    console.log(`Progress: ${event.percent}% - ${event.message}`);
  }
});

// Final result is the same structure
console.log(result.result);
```

## Future Enhancements

- WebSocket support for push-based streaming
- Graphical progress visualization
- Advanced cancellation and pause/resume
- Distributed streaming across fleet agents
- Real-time metrics dashboard integration

---

**Version:** 1.0.5
**Last Updated:** October 2025
**Author:** Agentic QE Team
