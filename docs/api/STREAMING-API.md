# Streaming API Reference

**Version**: 1.0.5
**Module**: `agentic-qe/streaming`

---

## Overview

The Streaming API provides real-time progress updates for long-running QE operations. It enables live feedback, cancellation support, and better resource management for test generation, execution, and analysis.

---

## Core Classes

### OperationStream

Base class for all streaming operations.

```typescript
import { OperationStream } from 'agentic-qe/streaming';

class OperationStream<T> extends EventEmitter {
  constructor(config: StreamConfig);

  // Lifecycle
  start(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  abort(): Promise<void>;
  complete(): Promise<T>;

  // State
  get state(): StreamState;
  get progress(): number;
  get isPaused(): boolean;
  get isAborted(): boolean;

  // Events
  on(event: string, handler: Function): this;
  once(event: string, handler: Function): this;
  removeListener(event: string, handler: Function): this;
  removeAllListeners(event?: string): this;

  // Piping
  pipe<U>(destination: OperationStream<U>): OperationStream<U>;
  unpipe(destination?: OperationStream<any>): this;

  // Filtering
  filter(predicate: (event: StreamEvent) => boolean): OperationStream<T>;
  map<U>(transform: (event: StreamEvent) => U): OperationStream<U>;
}
```

---

## Specialized Streams

### TestGenerationStream

Stream for test generation operations.

```typescript
class TestGenerationStream extends OperationStream<TestGenerationResult> {
  // Additional events:
  // - 'test:generated': Emitted when a test is created
  // - 'file:analyzed': Emitted when source file is analyzed
  // - 'coverage:calculated': Emitted when coverage is computed
}
```

**Example**:
```typescript
import { TestGenerationStream } from 'agentic-qe/streaming';

const stream = new TestGenerationStream({
  sourceFile: 'src/services/user-service.ts',
  framework: 'jest',
  targetCoverage: 95
});

stream.on('test:generated', (test) => {
  console.log(`✓ ${test.name}`);
});

stream.on('progress', (update) => {
  console.log(`Progress: ${update.progress}%`);
});

const result = await stream.complete();
```

---

### TestExecutionStream

Stream for test execution operations.

```typescript
class TestExecutionStream extends OperationStream<TestExecutionResult> {
  // Additional events:
  // - 'test:started': Test execution started
  // - 'test:passed': Test passed
  // - 'test:failed': Test failed
  // - 'test:skipped': Test skipped
  // - 'suite:started': Test suite started
  // - 'suite:completed': Test suite completed
}
```

**Example**:
```typescript
const stream = new TestExecutionStream({
  testFiles: 'tests/**/*.test.ts',
  parallel: true,
  maxWorkers: 8
});

stream.on('test:passed', (test) => {
  console.log(`✓ ${test.name} (${test.duration}ms)`);
});

stream.on('test:failed', (test) => {
  console.log(`✗ ${test.name}`);
  console.log(`  ${test.error.message}`);
});

const result = await stream.complete();
```

---

### CoverageAnalysisStream

Stream for coverage analysis operations.

```typescript
class CoverageAnalysisStream extends OperationStream<CoverageReport> {
  // Additional events:
  // - 'file:analyzed': File coverage analyzed
  // - 'gap:detected': Coverage gap found
  // - 'metrics:updated': Coverage metrics updated
}
```

**Example**:
```typescript
const stream = new CoverageAnalysisStream({
  sourcePath: 'src/',
  testPath: 'tests/',
  threshold: 80
});

stream.on('file:analyzed', (file) => {
  console.log(`${file.path}: ${file.coverage}%`);
});

stream.on('gap:detected', (gap) => {
  console.log(`Gap in ${gap.file}: lines ${gap.lines.join(', ')}`);
});

const report = await stream.complete();
```

---

## Interfaces

### StreamConfig

```typescript
interface StreamConfig {
  // Buffer settings
  bufferSize?: number;
  dropOldest?: boolean;

  // Update settings
  updateInterval?: number;
  batchEvents?: boolean;
  batchSize?: number;

  // Connection settings
  timeout?: number;
  keepAlive?: boolean;
  keepAliveInterval?: number;

  // Ordering
  ordered?: boolean;
  sequenceNumbers?: boolean;

  // Memory management
  maxMemory?: number;
  enableBackpressure?: boolean;
  highWaterMark?: number;

  // Compression
  compression?: 'none' | 'gzip' | 'brotli';
  compressionLevel?: number;
}
```

---

### StreamEvent

```typescript
interface StreamEvent {
  // Identity
  type: string;
  timestamp: number;
  sequence?: number;

  // Data
  data: any;

  // Metadata
  metadata?: {
    duration?: number;
    progress?: number;
    [key: string]: any;
  };
}
```

---

### StreamState

```typescript
type StreamState =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'aborted'
  | 'error';

interface StreamStateInfo {
  state: StreamState;
  startTime?: number;
  endTime?: number;
  duration?: number;
  eventsEmitted: number;
  bytesTransferred: number;
}
```

---

### ProgressUpdate

```typescript
interface ProgressUpdate {
  // Progress
  progress: number;  // 0-100
  completed: number;
  total: number;

  // Status
  status: string;
  currentOperation: string;

  // Timing
  timestamp: number;
  elapsed: number;
  remaining?: number;

  // Metrics
  metrics?: {
    testsGenerated?: number;
    testsPassed?: number;
    testsFailed?: number;
    coverage?: number;
    [key: string]: any;
  };
}
```

---

## Event Types

### Common Events

All streams emit these events:

#### `progress`

Emitted periodically with progress updates.

```typescript
stream.on('progress', (update: ProgressUpdate) => {
  console.log(`${update.progress}% - ${update.currentOperation}`);
});
```

---

#### `metrics`

Emitted when metrics are updated.

```typescript
stream.on('metrics', (metrics: Metrics) => {
  console.log('Metrics:', metrics);
});
```

---

#### `complete`

Emitted when operation completes successfully.

```typescript
stream.on('complete', (result: T) => {
  console.log('Operation complete:', result);
});
```

---

#### `error`

Emitted when an error occurs.

```typescript
stream.on('error', (error: Error) => {
  console.error('Error:', error.message);
});
```

---

#### `abort`

Emitted when operation is aborted.

```typescript
stream.on('abort', (reason?: string) => {
  console.log('Operation aborted:', reason);
});
```

---

### Connection Events

#### `connection:open`

Connection established.

```typescript
stream.on('connection:open', () => {
  console.log('Connection opened');
});
```

---

#### `connection:lost`

Connection lost.

```typescript
stream.on('connection:lost', () => {
  console.log('Connection lost, reconnecting...');
});
```

---

#### `connection:restored`

Connection restored.

```typescript
stream.on('connection:restored', () => {
  console.log('Connection restored');
});
```

---

### Memory Events

#### `memory:warning`

Memory usage high.

```typescript
stream.on('memory:warning', (usage: MemoryUsage) => {
  console.warn(`High memory: ${usage.current}/${usage.limit}`);
});
```

---

#### `memory:limit`

Memory limit reached.

```typescript
stream.on('memory:limit', async () => {
  console.error('Memory limit reached, pausing...');
  await stream.pause();
});
```

---

## Methods

### start()

Start the streaming operation.

```typescript
async start(): Promise<void>
```

**Example**:
```typescript
const stream = new TestGenerationStream(options);

// Attach listeners first
stream.on('progress', handleProgress);
stream.on('test:generated', handleTest);

// Then start
await stream.start();
```

---

### pause()

Pause the operation.

```typescript
async pause(): Promise<void>
```

**Example**:
```typescript
stream.on('memory:warning', async () => {
  await stream.pause();
  await gc(); // Wait for garbage collection
  await stream.resume();
});
```

---

### resume()

Resume a paused operation.

```typescript
async resume(): Promise<void>
```

**Example**:
```typescript
await stream.pause();
// ... do something ...
await stream.resume();
```

---

### abort()

Abort the operation.

```typescript
async abort(reason?: string): Promise<void>
```

**Example**:
```typescript
// Cancel button clicked
cancelButton.addEventListener('click', async () => {
  await stream.abort('User cancelled');
});

// Timeout
setTimeout(async () => {
  if (stream.state === 'running') {
    await stream.abort('Timeout exceeded');
  }
}, 300000); // 5 minutes
```

---

### complete()

Wait for operation to complete and get result.

```typescript
async complete(): Promise<T>
```

**Example**:
```typescript
try {
  const result = await stream.complete();
  console.log('Success:', result);
} catch (error) {
  console.error('Failed:', error);
} finally {
  stream.removeAllListeners();
}
```

---

### pipe()

Pipe events to another stream.

```typescript
pipe<U>(destination: OperationStream<U>): OperationStream<U>
```

**Example**:
```typescript
const genStream = new TestGenerationStream(options);
const execStream = new TestExecutionStream(options);

// Pipe generation to execution
genStream.pipe(execStream);

// When generation completes, execution starts
const finalResult = await execStream.complete();
```

---

### filter()

Filter events.

```typescript
filter(predicate: (event: StreamEvent) => boolean): OperationStream<T>
```

**Example**:
```typescript
// Only show failed tests
const failedOnly = stream.filter(event =>
  event.type === 'test:failed'
);

failedOnly.on('data', (event) => {
  console.error('Failed:', event.data.name);
});
```

---

### map()

Transform events.

```typescript
map<U>(transform: (event: StreamEvent) => U): OperationStream<U>
```

**Example**:
```typescript
// Transform to custom format
const formatted = stream.map(event => ({
  timestamp: new Date(event.timestamp).toISOString(),
  level: event.type.includes('error') ? 'error' : 'info',
  message: formatMessage(event)
}));

formatted.on('data', (log) => {
  logger.log(log);
});
```

---

## Error Types

### StreamConnectionError

```typescript
class StreamConnectionError extends Error {
  constructor(message: string, public retryable: boolean);
}
```

---

### StreamAbortedError

```typescript
class StreamAbortedError extends Error {
  constructor(message: string, public reason?: string);
}
```

---

### StreamTimeoutError

```typescript
class StreamTimeoutError extends Error {
  constructor(message: string, public timeout: number);
}
```

---

### StreamMemoryError

```typescript
class StreamMemoryError extends Error {
  constructor(message: string, public usage: MemoryUsage);
}
```

---

## Advanced Features

### Reconnection

Automatic reconnection on connection loss.

```typescript
const stream = new TestGenerationStream({
  ...options,
  reconnection: {
    enabled: true,
    maxAttempts: 5,
    delay: 1000,
    backoff: true,
    maxDelay: 30000
  }
});

stream.on('connection:lost', () => {
  console.log('Connection lost, will retry...');
});

stream.on('connection:restored', () => {
  console.log('Connection restored');
});
```

---

### Buffering

Control event buffering.

```typescript
const stream = new TestGenerationStream({
  ...options,
  bufferSize: 1000,
  dropOldest: true,  // Drop old events when buffer full
  batchEvents: true,  // Batch events to reduce overhead
  batchSize: 10,
  batchInterval: 500
});

// Receive batched events
stream.on('batch', (events: StreamEvent[]) => {
  events.forEach(event => processEvent(event));
});
```

---

### Compression

Enable compression for large payloads.

```typescript
const stream = new CoverageAnalysisStream({
  ...options,
  compression: 'gzip',
  compressionLevel: 6
});

// Reduces bandwidth by 70-80% for coverage data
```

---

### Backpressure

Handle slow consumers.

```typescript
const stream = new TestExecutionStream({
  ...options,
  enableBackpressure: true,
  highWaterMark: 16384
});

stream.on('backpressure', async () => {
  console.log('Consumer slow, pausing...');
  await stream.pause();

  // Wait for consumer to catch up
  await processBacklog();

  await stream.resume();
});
```

---

## Integration Examples

### With Progress Bar

```typescript
import ProgressBar from 'progress';

const stream = new TestGenerationStream(options);

const bar = new ProgressBar('Generating [:bar] :percent :etas', {
  total: 100,
  width: 40
});

stream.on('progress', (update) => {
  bar.update(update.progress / 100);
});

const result = await stream.complete();
bar.terminate();
```

---

### With React

```typescript
import { useState, useEffect } from 'react';

function TestGenerator({ options }) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [tests, setTests] = useState([]);

  useEffect(() => {
    const stream = new TestGenerationStream(options);

    stream.on('progress', (update) => {
      setProgress(update.progress);
      setStatus(update.currentOperation);
    });

    stream.on('test:generated', (test) => {
      setTests(prev => [...prev, test]);
    });

    stream.start();

    return () => {
      stream.abort();
      stream.removeAllListeners();
    };
  }, [options]);

  return (
    <div>
      <progress value={progress} max={100} />
      <div>{status}</div>
      <ul>
        {tests.map(test => <li key={test.id}>{test.name}</li>)}
      </ul>
    </div>
  );
}
```

---

### With Node.js Streams

```typescript
import { Writable } from 'stream';

const stream = new TestExecutionStream(options);

// Write to Node.js stream
const writable = new Writable({
  write(chunk, encoding, callback) {
    console.log(chunk.toString());
    callback();
  }
});

stream.on('data', (event) => {
  writable.write(JSON.stringify(event) + '\n');
});

await stream.complete();
writable.end();
```

---

## Performance

### Memory Usage

```typescript
// Monitor memory usage
const stream = new TestGenerationStream({
  ...options,
  maxMemory: 512 * 1024 * 1024,  // 512 MB
  enableBackpressure: true
});

stream.on('metrics', (metrics) => {
  console.log(`Memory: ${metrics.memory.used}/${metrics.memory.limit}`);
});
```

---

### Throughput

```typescript
// Optimize for throughput
const stream = new TestExecutionStream({
  ...options,
  bufferSize: 10000,
  batchEvents: true,
  batchSize: 100,
  compression: 'gzip'
});

// Can handle 1000+ events/second
```

---

## Best Practices

### 1. Always Clean Up

```typescript
async function executeWithCleanup() {
  const stream = new TestGenerationStream(options);

  try {
    stream.on('progress', handleProgress);
    const result = await stream.complete();
    return result;
  } finally {
    stream.removeAllListeners();
  }
}
```

---

### 2. Handle Errors Gracefully

```typescript
stream.on('error', async (error) => {
  if (error instanceof StreamConnectionError && error.retryable) {
    console.log('Retrying...');
    await stream.retry();
  } else {
    console.error('Fatal error:', error);
    await stream.abort();
  }
});
```

---

### 3. Monitor Resource Usage

```typescript
stream.on('memory:warning', async () => {
  console.warn('High memory, pausing...');
  await stream.pause();
  await gc();
  await stream.resume();
});

stream.on('connection:lost', () => {
  console.log('Connection lost, will retry...');
});
```

---

### 4. Use Appropriate Buffer Sizes

```typescript
// Small operations: small buffer
const smallStream = new TestGenerationStream({
  ...options,
  bufferSize: 10
});

// Large operations: large buffer
const largeStream = new TestExecutionStream({
  ...options,
  bufferSize: 1000
});
```

---

## Migration Guide

### From Non-Streaming

**Before**:
```typescript
console.log('Generating tests...');
const result = await fleet.generateTests(options);
console.log('Done!');
```

**After**:
```typescript
const stream = await fleet.streamTestGeneration(options);

stream.on('progress', (update) => {
  console.log(`${update.progress}% - ${update.currentOperation}`);
});

stream.on('test:generated', (test) => {
  console.log(`✓ ${test.name}`);
});

const result = await stream.complete();
console.log('Done!');
```

---

## Related Documentation

- [Streaming API Tutorial](../guides/STREAMING-API.md)
- [Multi-Model Router Guide](../guides/MULTI-MODEL-ROUTER.md)
- [Migration Guide](../guides/MIGRATION-V1.0.5.md)
- [Routing API Reference](ROUTING-API.md)

---

**Questions?** Open an issue: https://github.com/proffesor-for-testing/agentic-qe/issues
