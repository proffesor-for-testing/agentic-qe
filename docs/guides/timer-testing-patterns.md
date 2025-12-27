# Timer Testing Patterns: Migrating to jest.useFakeTimers()

This guide provides comprehensive patterns for migrating `setTimeout`/`setInterval` based tests to Jest's fake timers for deterministic, reliable testing.

## Table of Contents

1. [Why Migrate to Fake Timers](#why-migrate-to-fake-timers)
2. [Core Patterns](#core-patterns)
3. [Advanced Patterns](#advanced-patterns)
4. [Helper Utilities](#helper-utilities)
5. [Migration Priority List](#migration-priority-list)
6. [Common Pitfalls](#common-pitfalls)
7. [Verification Checklist](#verification-checklist)

---

## Why Migrate to Fake Timers

### Problems with Real Timers

```typescript
// PROBLEMATIC: Real timer approach
await new Promise(resolve => setTimeout(resolve, 100));
```

**Issues:**
- **Flaky tests**: Timing varies with system load
- **Slow tests**: Must wait real milliseconds
- **CI instability**: Container environments have inconsistent timing
- **Non-deterministic**: Same test may pass/fail randomly
- **Resource waste**: Blocking test execution

### Benefits of Fake Timers

```typescript
// RECOMMENDED: Fake timer approach
jest.useFakeTimers();
jest.advanceTimersByTime(100);
```

**Advantages:**
- **Deterministic**: Always executes in exact order
- **Fast**: No actual waiting
- **Reliable**: Consistent across all environments
- **Controlled**: Precise time manipulation

---

## Core Patterns

### Pattern 1: Simple Timeout Replacement

**Before (Flaky):**
```typescript
it('should expire cache after TTL', async () => {
  cache.set('key', 'value', 100); // 100ms TTL
  await new Promise(resolve => setTimeout(resolve, 150));
  expect(cache.get('key')).toBeNull();
});
```

**After (Deterministic):**
```typescript
it('should expire cache after TTL', () => {
  jest.useFakeTimers();

  cache.set('key', 'value', 100); // 100ms TTL
  jest.advanceTimersByTime(150);

  expect(cache.get('key')).toBeNull();

  jest.useRealTimers();
});
```

### Pattern 2: Multiple Time Advances

**Before (Flaky):**
```typescript
it('should handle sequential timeouts', async () => {
  const results: number[] = [];

  setTimeout(() => results.push(1), 50);
  setTimeout(() => results.push(2), 100);

  await new Promise(resolve => setTimeout(resolve, 150));
  expect(results).toEqual([1, 2]);
});
```

**After (Deterministic):**
```typescript
it('should handle sequential timeouts', () => {
  jest.useFakeTimers();
  const results: number[] = [];

  setTimeout(() => results.push(1), 50);
  setTimeout(() => results.push(2), 100);

  jest.advanceTimersByTime(50);
  expect(results).toEqual([1]);

  jest.advanceTimersByTime(50);
  expect(results).toEqual([1, 2]);

  jest.useRealTimers();
});
```

### Pattern 3: Async Operations with Timers

When dealing with promises that resolve after timeouts:

**Before (Flaky):**
```typescript
it('should wait for async operation', async () => {
  const result = await someAsyncWithTimeout();
  expect(result).toBe('success');
});
```

**After (Deterministic):**
```typescript
it('should wait for async operation', async () => {
  jest.useFakeTimers();

  const promise = someAsyncWithTimeout();

  // Run all timers including nested ones
  jest.runAllTimers();

  const result = await promise;
  expect(result).toBe('success');

  jest.useRealTimers();
});
```

### Pattern 4: Suite-Level Setup/Teardown

For test suites with many timer-based tests:

```typescript
describe('TimerBasedFeature', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('test 1', () => {
    // Fake timers already active
    jest.advanceTimersByTime(100);
  });

  it('test 2', () => {
    // Fresh fake timer state
    jest.advanceTimersByTime(200);
  });
});
```

---

## Advanced Patterns

### Pattern 5: Retry Logic with Backoff

**Before (Flaky):**
```typescript
it('should retry with exponential backoff', async () => {
  const fn = jest.fn()
    .mockRejectedValueOnce(new Error('fail'))
    .mockRejectedValueOnce(new Error('fail'))
    .mockResolvedValue('success');

  const result = await retryWithBackoff(fn, { maxRetries: 3, baseDelay: 100 });

  // Wait for backoff: 100ms + 200ms = 300ms total
  await new Promise(resolve => setTimeout(resolve, 350));

  expect(result).toBe('success');
  expect(fn).toHaveBeenCalledTimes(3);
});
```

**After (Deterministic):**
```typescript
it('should retry with exponential backoff', async () => {
  jest.useFakeTimers();

  const fn = jest.fn()
    .mockRejectedValueOnce(new Error('fail'))
    .mockRejectedValueOnce(new Error('fail'))
    .mockResolvedValue('success');

  const resultPromise = retryWithBackoff(fn, { maxRetries: 3, baseDelay: 100 });

  // First retry after 100ms
  await jest.advanceTimersByTimeAsync(100);

  // Second retry after 200ms (exponential)
  await jest.advanceTimersByTimeAsync(200);

  const result = await resultPromise;

  expect(result).toBe('success');
  expect(fn).toHaveBeenCalledTimes(3);

  jest.useRealTimers();
});
```

### Pattern 6: Interval-Based Polling

**Before (Flaky):**
```typescript
it('should poll until condition met', async () => {
  let counter = 0;
  const interval = setInterval(() => counter++, 100);

  await new Promise(resolve => setTimeout(resolve, 350));

  clearInterval(interval);
  expect(counter).toBe(3);
});
```

**After (Deterministic):**
```typescript
it('should poll until condition met', () => {
  jest.useFakeTimers();

  let counter = 0;
  const interval = setInterval(() => counter++, 100);

  jest.advanceTimersByTime(100);
  expect(counter).toBe(1);

  jest.advanceTimersByTime(100);
  expect(counter).toBe(2);

  jest.advanceTimersByTime(100);
  expect(counter).toBe(3);

  clearInterval(interval);
  jest.useRealTimers();
});
```

### Pattern 7: Debounce/Throttle Testing

**Before (Flaky):**
```typescript
it('should debounce function calls', async () => {
  const fn = jest.fn();
  const debouncedFn = debounce(fn, 100);

  debouncedFn();
  debouncedFn();
  debouncedFn();

  await new Promise(resolve => setTimeout(resolve, 150));

  expect(fn).toHaveBeenCalledTimes(1);
});
```

**After (Deterministic):**
```typescript
it('should debounce function calls', () => {
  jest.useFakeTimers();

  const fn = jest.fn();
  const debouncedFn = debounce(fn, 100);

  debouncedFn();
  debouncedFn();
  debouncedFn();

  // Before debounce completes
  jest.advanceTimersByTime(50);
  expect(fn).not.toHaveBeenCalled();

  // After debounce completes
  jest.advanceTimersByTime(100);
  expect(fn).toHaveBeenCalledTimes(1);

  jest.useRealTimers();
});
```

### Pattern 8: Mixed Async/Timer Operations

When operations mix promises and timers:

```typescript
it('should handle mixed async and timer operations', async () => {
  jest.useFakeTimers();

  const results: string[] = [];

  // Start async operation that uses timers internally
  const asyncOp = async () => {
    results.push('start');
    await new Promise(resolve => setTimeout(resolve, 100));
    results.push('after-timeout');
    return 'done';
  };

  const promise = asyncOp();

  // Flush microtasks to process the first push
  await Promise.resolve();
  expect(results).toEqual(['start']);

  // Advance time and flush microtasks
  await jest.advanceTimersByTimeAsync(100);

  const result = await promise;
  expect(results).toEqual(['start', 'after-timeout']);
  expect(result).toBe('done');

  jest.useRealTimers();
});
```

### Pattern 9: Testing Timeout Errors

```typescript
it('should throw timeout error after deadline', async () => {
  jest.useFakeTimers();

  const operationWithTimeout = async (timeoutMs: number) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout')), timeoutMs);

      // Simulate operation that never completes
      // In real code, this would resolve on success
    });
  };

  const promise = operationWithTimeout(5000);

  // Advance to just before timeout
  jest.advanceTimersByTime(4999);
  // Promise should still be pending

  // Advance past timeout
  jest.advanceTimersByTime(2);

  await expect(promise).rejects.toThrow('Timeout');

  jest.useRealTimers();
});
```

### Pattern 10: Date.now() Mocking

When code uses `Date.now()` for timing:

```typescript
it('should calculate elapsed time correctly', () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));

  const start = Date.now();

  jest.advanceTimersByTime(5000);

  const elapsed = Date.now() - start;
  expect(elapsed).toBe(5000);

  jest.useRealTimers();
});
```

---

## Helper Utilities

Use the helper utilities in `/workspaces/agentic-qe/tests/helpers/timerTestUtils.ts`:

### withFakeTimers()

Automatically manages fake timer setup and teardown:

```typescript
import { withFakeTimers } from '../helpers/timerTestUtils';

it('should test with fake timers', async () => {
  await withFakeTimers(async (timers) => {
    const cache = new Cache({ ttl: 100 });
    cache.set('key', 'value');

    timers.advance(150);

    expect(cache.get('key')).toBeNull();
  });
});
```

### advanceAndFlush()

Advances time and flushes pending promises:

```typescript
import { advanceAndFlush } from '../helpers/timerTestUtils';

it('should advance and flush', async () => {
  jest.useFakeTimers();

  const promise = asyncOperationWithTimeout();

  await advanceAndFlush(100);

  const result = await promise;
  expect(result).toBeDefined();

  jest.useRealTimers();
});
```

### runAllTimersAsync()

Runs all timers with proper async handling:

```typescript
import { runAllTimersAsync } from '../helpers/timerTestUtils';

it('should run all timers', async () => {
  jest.useFakeTimers();

  const results: number[] = [];
  setTimeout(() => results.push(1), 100);
  setTimeout(() => results.push(2), 200);

  await runAllTimersAsync();

  expect(results).toEqual([1, 2]);

  jest.useRealTimers();
});
```

---

## Migration Priority List

### Top 10 Files Requiring Migration

Based on analysis of the codebase, these files have the highest setTimeout usage and should be migrated first:

| Priority | File | setTimeout Count | Reason |
|----------|------|------------------|--------|
| 1 | `tests/integration/learning/idle-detector.test.ts` | 14 | High count, CI flaky |
| 2 | `tests/integration/agentdb-quic-sync.test.ts` | 10 | High count, long delays |
| 3 | `tests/unit/batch-operations.test.ts` | 9 | High count, affects CI |
| 4 | `tests/unit/Agent.test.ts` | 9 | Core agent tests |
| 5 | `tests/agents/context/ContextCache.test.ts` | 9 | TTL-based tests |
| 6 | `tests/integration/multi-agent-workflows.test.ts` | 7 | Integration critical |
| 7 | `tests/monitoring/ProviderHealthMonitor.test.ts` | 6 | Health monitoring |
| 8 | `tests/integration/learning/learning-engine-persistence.test.ts` | 5 | Learning system |
| 9 | `tests/memory/PatternReplicationService.test.ts` | 4 | Replication tests |
| 10 | `tests/voting/orchestrator.test.ts` | 4 | Orchestration timing |

### Files Already Using Fake Timers (Reference Examples)

These files demonstrate correct fake timer usage:

- `tests/monitoring/QuotaManager.test.ts` - Suite-level setup
- `tests/cli/providers.test.ts` - Per-test setup
- `tests/providers/LLMProviderFactory.test.ts` - Time advancement
- `tests/mcp/handlers/memory/memory-store.test.ts` - TTL testing
- `tests/mcp/handlers/memory/consensus-propose.test.ts` - Consensus timing

---

## Common Pitfalls

### Pitfall 1: Forgetting to Restore Real Timers

```typescript
// BAD: Leaks fake timers to other tests
it('test', () => {
  jest.useFakeTimers();
  // ... test code
  // Missing: jest.useRealTimers()
});

// GOOD: Always restore
it('test', () => {
  jest.useFakeTimers();
  try {
    // ... test code
  } finally {
    jest.useRealTimers();
  }
});

// BETTER: Use beforeEach/afterEach
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());
```

### Pitfall 2: Not Handling Pending Promises

```typescript
// BAD: Promise never resolves
it('test', async () => {
  jest.useFakeTimers();
  const promise = asyncWithTimeout();
  jest.advanceTimersByTime(100);
  // Promise still pending!
  const result = await promise; // Hangs
});

// GOOD: Use async variant
it('test', async () => {
  jest.useFakeTimers();
  const promise = asyncWithTimeout();
  await jest.advanceTimersByTimeAsync(100);
  const result = await promise;
});
```

### Pitfall 3: Mixing Real and Fake Operations

```typescript
// BAD: fetch() uses real timers
it('test', async () => {
  jest.useFakeTimers();
  const data = await fetch('/api'); // Times out!
});

// GOOD: Mock external dependencies
it('test', async () => {
  jest.useFakeTimers();
  jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse);
  const data = await fetch('/api');
});
```

### Pitfall 4: Incorrect Time Calculation

```typescript
// BAD: Accumulated time not considered
jest.advanceTimersByTime(50);
jest.advanceTimersByTime(50);
// Total: 100ms, not 50ms!

// GOOD: Be explicit about total time
jest.advanceTimersByTime(100); // 100ms total
// OR
let currentTime = 0;
currentTime += 50; jest.advanceTimersByTime(50);
currentTime += 50; jest.advanceTimersByTime(50);
// currentTime = 100ms
```

### Pitfall 5: Not Clearing Timers Between Tests

```typescript
// BAD: Timer from previous test fires
it('test1', () => {
  jest.useFakeTimers();
  setTimeout(() => throw new Error('boom'), 1000);
  // Test ends without advancing time
  jest.useRealTimers();
});

it('test2', () => {
  // Timer from test1 might fire here!
});

// GOOD: Clear pending timers
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});
```

---

## Verification Checklist

Before marking a migration complete, verify:

- [ ] Test passes consistently (run 10+ times)
- [ ] Test runs in < 100ms (no real waiting)
- [ ] `jest.useRealTimers()` called in afterEach/finally
- [ ] No console warnings about unhandled timers
- [ ] Works in isolation (`npm test -- --testPathPattern=file.test.ts`)
- [ ] Works with full suite (`npm run test:unit`)
- [ ] CI passes with the changes
- [ ] No timing-related flakiness in PR checks

---

## Quick Reference

| Method | Use When |
|--------|----------|
| `jest.useFakeTimers()` | Start using fake timers |
| `jest.useRealTimers()` | Restore real timers |
| `jest.advanceTimersByTime(ms)` | Advance by specific milliseconds |
| `jest.advanceTimersByTimeAsync(ms)` | Advance with promise flushing |
| `jest.runAllTimers()` | Run all pending timers |
| `jest.runOnlyPendingTimers()` | Run only currently queued timers |
| `jest.clearAllTimers()` | Clear pending timers without running |
| `jest.setSystemTime(date)` | Set Date.now() value |
| `jest.getRealSystemTime()` | Get actual system time |

---

## Related Documentation

- [Jest Timer Mocks](https://jestjs.io/docs/timer-mocks)
- [Test Cleanup Helpers](../../tests/helpers/cleanup.ts)
- [Timer Test Utilities](../../tests/helpers/timerTestUtils.ts)
