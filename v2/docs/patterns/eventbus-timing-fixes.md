# EventBus Timing Fixes - Pattern Documentation

## Overview
This document captures the timing fix patterns applied to EventBus.test.ts to resolve async event timing issues.

## Problem
Async event timing was causing test failures in EventBus.test.ts due to:
1. Race conditions in async initialization
2. Event propagation delays not being properly awaited
3. Async listeners completing out of order

## Solution Patterns

### Pattern 1: Async Initialization with Event Propagation Delay
**Problem**: Multiple initialization calls not properly awaited
**Solution**: Add explicit async/await and setImmediate for event propagation

```typescript
it('should handle multiple initialization calls gracefully', async () => {
  // Clear mocks from beforeEach initialization
  jest.clearAllMocks();

  const newEventBus = new EventBus();
  // Await async initialization
  await newEventBus.initialize();
  await newEventBus.initialize(); // Second call should not throw

  // Wait for event propagation
  await new Promise(resolve => setImmediate(resolve));

  expect(mockLogger.info).toHaveBeenCalledTimes(2);
});
```

**Key Points**:
- Explicitly await all initialization calls
- Use `setImmediate` for event loop propagation
- Clear mocks before testing to avoid interference

### Pattern 2: Async Listener Ordering with Delays
**Problem**: Async listeners completing out of order due to race conditions
**Solution**: Add controlled delays and proper await timing

```typescript
it('should maintain event emission order with async listeners', async () => {
  const events: string[] = [];

  eventBus.on('test.event', async (data) => {
    // Add small delay to test async ordering
    await new Promise(resolve => setTimeout(resolve, 10));
    events.push(data.data.value);
  });

  await eventBus.emitFleetEvent('test.event', 'test-source', { value: 'first' });
  await eventBus.emitFleetEvent('test.event', 'test-source', { value: 'second' });

  // Wait for all async handlers
  await new Promise(resolve => setTimeout(resolve, 50));

  expect(events).toEqual(['first', 'second']);
});
```

**Key Points**:
- Add controlled 10ms delay in async listeners
- Await each event emission
- Wait 50ms for all handlers to complete (5x listener delay)
- Verify order preservation

## Timing Guidelines

### Event Propagation Delays
- **setImmediate**: For single event loop tick (< 1ms)
- **setTimeout(0)**: For minimal delay with task queue processing (1-5ms)
- **setTimeout(10)**: For controlled async operation simulation (10ms)
- **setTimeout(50)**: For multiple async operations to complete (50ms+)

### Best Practices
1. **Always await initialization**: Never assume sync completion
2. **Use setImmediate for event loop**: When testing event propagation
3. **Use setTimeout for async handlers**: When testing async listener behavior
4. **Wait 5x listener delay**: For multi-listener scenarios
5. **Clear mocks between tests**: Prevent interference from beforeEach hooks

## Test Results
All tests passed consistently across 5 runs:
- Run 1: 26/26 passed (1.15s)
- Run 2: 26/26 passed (0.658s)
- Run 3: 26/26 passed (0.647s)
- Run 4: 26/26 passed (0.600s)
- Run 5: 26/26 passed (0.665s)

**Average time**: 0.744s per run
**Consistency**: 100% pass rate

## Reusable Pattern Template

```typescript
// Template for async event timing tests
it('should handle async event operations', async () => {
  const results: any[] = [];

  // 1. Setup async listener with controlled delay
  eventBus.on('event.type', async (data) => {
    await new Promise(resolve => setTimeout(resolve, LISTENER_DELAY_MS));
    results.push(data);
  });

  // 2. Emit events sequentially with await
  await eventBus.emitFleetEvent('event.type', 'source', { value: 1 });
  await eventBus.emitFleetEvent('event.type', 'source', { value: 2 });

  // 3. Wait for all handlers (5x listener delay minimum)
  await new Promise(resolve => setTimeout(resolve, LISTENER_DELAY_MS * 5));

  // 4. Assert results
  expect(results).toEqual([{ value: 1 }, { value: 2 }]);
});
```

## AQE Memory Storage
These patterns are stored in AQE memory at:
- Key: `aqe/patterns/eventbus-timing-fixes`
- Partition: `coordination`
- TTL: 7 days (604800 seconds)

## Related Files
- `/workspaces/agentic-qe-cf/tests/unit/EventBus.test.ts` - Fixed test file
- `/workspaces/agentic-qe-cf/src/core/EventBus.ts` - EventBus implementation
- `/workspaces/agentic-qe-cf/docs/patterns/eventbus-timing-fixes.md` - This document

## Tags
#timing #async #eventbus #patterns #testing #agentic-qe

## Version
- Created: 2025-10-17
- Task: DEPLOY-005
- Status: Complete ✅
