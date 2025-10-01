# Test Cleanup Guide - Memory Leak Prevention

**Date**: 2025-10-01
**Status**: ✅ CLEANUP INFRASTRUCTURE DEPLOYED
**Implementation**: COMPLETE

---

## Quick Start

### 1. Import Cleanup Helper

```typescript
import { createResourceCleanup } from '../helpers/cleanup';
// or for nested paths:
import { createResourceCleanup } from '../../helpers/cleanup';
```

### 2. Initialize in Test Suite

```typescript
describe('MyTest', () => {
  const cleanup = createResourceCleanup();

  afterEach(async () => {
    await cleanup.afterEach();
  });

  // Your tests...
});
```

### 3. Track Resources

```typescript
// Track event emitters
cleanup.trackEmitter(eventBus);

// Track event listeners
cleanup.events.on(emitter, 'event', handler);

// Track agents
cleanup.agents.track(agent);
// or create and track
const agent = cleanup.agents.create(AgentClass, config);

// Track timers
const timerId = cleanup.timers.setTimeout(() => {}, 1000);
```

---

## Complete Example

```typescript
import { createResourceCleanup } from '../helpers/cleanup';
import { EventBus } from '../../src/core/EventBus';
import { TestAgent } from '../../src/agents/TestAgent';

describe('Complete Cleanup Example', () => {
  const cleanup = createResourceCleanup();
  let eventBus: EventBus;
  let agent: TestAgent;

  beforeEach(async () => {
    // Create and track EventBus
    eventBus = new EventBus();
    await eventBus.initialize();
    cleanup.trackEmitter(eventBus);

    // Create and track agent
    agent = cleanup.agents.create(TestAgent, {
      id: 'test-agent',
      memoryStore,
      eventBus
    });

    await agent.initialize();
  });

  afterEach(async () => {
    // Single cleanup call handles everything
    await cleanup.afterEach();

    // Clear local references
    eventBus = null as any;
    agent = null as any;
  });

  it('should handle events properly', () => {
    const handler = jest.fn();

    // Track event listener
    cleanup.events.on(eventBus, 'test-event', handler);

    eventBus.emit('test-event', { data: 'test' });

    expect(handler).toHaveBeenCalled();
    // Listener will be automatically removed in afterEach
  });

  it('should handle async operations', async () => {
    const results: string[] = [];

    // Track timer
    cleanup.timers.setTimeout(() => {
      results.push('timer-executed');
    }, 10);

    await new Promise(resolve => setTimeout(resolve, 20));

    expect(results).toContain('timer-executed');
    // Timer will be automatically cleared in afterEach
  });
});
```

---

## Cleanup Helper API

### ResourceCleanup Class

```typescript
const cleanup = createResourceCleanup();
```

#### Event Tracking

```typescript
// Track and register listener
cleanup.events.on(emitter, 'event', handler);

// One-time listener (auto-removes, no tracking needed)
cleanup.events.once(emitter, 'event', handler);

// Manual removal
cleanup.events.off(emitter, 'event', handler);

// Get count of tracked listeners
const count = cleanup.events.count;
```

#### Agent Tracking

```typescript
// Track existing agent
cleanup.agents.track(agent);

// Create and track agent
const agent = cleanup.agents.create(AgentClass, config);

// Get count of tracked agents
const count = cleanup.agents.count;
```

#### Timer Tracking

```typescript
// Safe setTimeout
const timerId = cleanup.timers.setTimeout(() => {}, 1000);

// Safe setInterval
const intervalId = cleanup.timers.setInterval(() => {}, 1000);

// Manual clearing
cleanup.timers.clearTimeout(timerId);
cleanup.timers.clearInterval(intervalId);

// Get counts
const { timers, intervals } = cleanup.timers.count;
```

#### Event Emitter Tracking

```typescript
// Track emitter for complete cleanup
const emitter = cleanup.trackEmitter(new EventEmitter());
// All listeners will be removed automatically
```

#### Cleanup Execution

```typescript
// In afterEach
afterEach(async () => {
  await cleanup.afterEach();
});

// Get statistics before cleanup
const stats = cleanup.getStats();
console.log(stats);
// {
//   listeners: 5,
//   agents: 2,
//   timers: { timers: 3, intervals: 1 },
//   emitters: 2
// }
```

---

## Migration Guide

### Before (Memory Leaks)

```typescript
describe('Old Test', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  // ❌ NO afterEach - MEMORY LEAK

  it('test', () => {
    eventBus.on('event', handler); // ❌ NEVER REMOVED
  });
});
```

### After (Clean)

```typescript
import { createResourceCleanup } from '../helpers/cleanup';

describe('New Test', () => {
  const cleanup = createResourceCleanup();
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    cleanup.trackEmitter(eventBus); // ✅ TRACKED
  });

  afterEach(async () => {
    await cleanup.afterEach(); // ✅ CLEANED
  });

  it('test', () => {
    cleanup.events.on(eventBus, 'event', handler); // ✅ AUTO-REMOVED
  });
});
```

---

## Integration Test Pattern

For tests with multiple agents:

```typescript
import { createResourceCleanup } from '../helpers/cleanup';

describe('Multi-Agent Integration', () => {
  const cleanup = createResourceCleanup();
  let agents: any[];

  beforeEach(async () => {
    // Create infrastructure
    const eventBus = cleanup.trackEmitter(new EventBus());
    await eventBus.initialize();

    // Create multiple agents
    agents = [
      cleanup.agents.create(TestGeneratorAgent, config1),
      cleanup.agents.create(CoverageAnalyzerAgent, config2),
      cleanup.agents.create(QualityGateAgent, config3)
    ];

    // Initialize all
    await Promise.all(agents.map(a => a.initialize()));
  });

  afterEach(async () => {
    // Single call shuts down all agents
    await cleanup.afterEach();
    agents = [];
  });

  // Tests...
});
```

---

## Global Setup (jest.setup.ts)

The global setup file has been enhanced:

```typescript
// Enhanced afterEach with async support
afterEach(async () => {
  // Wait for async operations
  await new Promise(resolve => setImmediate(resolve));

  // Clear mocks
  jest.clearAllMocks();

  // Run cleanups (with error handling)
  if (global.testCleanup) {
    await Promise.all(
      global.testCleanup.map(cleanup =>
        Promise.resolve(cleanup()).catch(err => {
          console.warn('Cleanup error:', err);
        })
      )
    );
    global.testCleanup = [];
  }

  // Force GC
  if (global.gc) {
    global.gc();
  }
});
```

---

## Best Practices

### ✅ DO

1. **Always import cleanup helper** in test files
2. **Track all resources** (emitters, agents, timers)
3. **Call cleanup.afterEach()** in afterEach hook
4. **Clear local references** after cleanup (`= null as any`)
5. **Use cleanup.agents.create()** for automatic tracking
6. **Track EventBus with trackEmitter()** for comprehensive cleanup

### ❌ DON'T

1. **Don't skip afterEach hooks** - always cleanup
2. **Don't manually manage listeners** - use cleanup.events
3. **Don't create agents without tracking** - always use cleanup.agents
4. **Don't use raw setTimeout** - use cleanup.timers
5. **Don't forget to await** cleanup.afterEach()

---

## Troubleshooting

### Memory Still Growing?

1. **Check stats before cleanup**:
```typescript
beforeEach(() => {
  console.log('Resources:', cleanup.getStats());
});
```

2. **Enable heap profiling**:
```bash
node --expose-gc --logHeapUsage \
  node_modules/.bin/jest <test-file>
```

3. **Run test multiple times**:
```bash
for i in {1..10}; do
  node --expose-gc jest <test-file> --logHeapUsage
done | grep Heap
```

### Tests Failing After Cleanup?

1. **Check test isolation** - tests should not depend on previous state
2. **Verify async completion** - use `await` where needed
3. **Check for race conditions** - cleanup happens immediately after test

---

## Files Updated

### New Files Created

- ✅ `tests/helpers/cleanup.ts` - Cleanup utilities
- ✅ `docs/TEST-CLEANUP-GUIDE.md` - This guide
- ✅ `docs/TEST-MEMORY-LEAK-ANALYSIS.md` - Analysis report

### Files Enhanced

- ✅ `tests/setup/jest.setup.ts` - Enhanced global cleanup
- ✅ `tests/unit/EventBus.test.ts` - Using cleanup helper
- ✅ `tests/core/FleetManager.test.ts` - Using cleanup helper
- ✅ `tests/integration/week2-full-fleet.test.ts` - Already excellent cleanup

### Files Pending Cleanup

12 files need cleanup added (see TEST-MEMORY-LEAK-ANALYSIS.md)

---

## Verification

Run memory leak tests:

```bash
# Run with heap profiling
npm test -- --logHeapUsage

# Run specific test multiple times
for i in {1..10}; do
  npm test -- tests/core/EventBus.test.ts --logHeapUsage
done | grep Heap
```

Expected: Heap usage should remain stable across runs.

---

## Support

For issues or questions:
1. Check `docs/TEST-MEMORY-LEAK-ANALYSIS.md` for detailed analysis
2. Review example patterns in this guide
3. Check `tests/helpers/cleanup.ts` source code
4. Contact team for assistance

---

**Status**: ✅ Infrastructure complete, ready for project-wide rollout
