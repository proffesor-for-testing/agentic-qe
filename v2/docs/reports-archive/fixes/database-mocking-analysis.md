# Database Mocking Analysis - FleetManager Tests

**Date**: 2025-10-21
**Analyst**: System Architecture Designer
**Status**: Root Cause Identified
**Severity**: Medium (Blocking FleetManager test suite)

---

## Executive Summary

The FleetManager test failures are **NOT** caused by Database mocking issues. The root cause is a **Logger mock initialization failure** in EventBus, which occurs before Database is even accessed. Additionally, the Database mock is correctly configured but contains unnecessary methods that could confuse future maintainers.

### Key Findings

1. **Actual Error**: `TypeError: Cannot read properties of undefined (reading 'info')` in EventBus.initialize() at line 81
2. **False Lead**: Initial assumption was Database mocking issue - this was incorrect
3. **Real Issue**: Logger.getInstance() returns `undefined` when EventBus constructor runs
4. **Secondary Issue**: Database mock contains redundant methods (query, exec) that are never called

---

## Root Cause Analysis

### 1. Call Stack Analysis

```
FleetManager.initialize() (line 175)
  ↓
EventBus.initialize() (line 81)
  ↓
this.logger.info('Initializing EventBus')
  ↓
CRASH: this.logger is undefined
```

### 2. Why Logger Mock Fails

**EventBus Constructor** (`src/core/EventBus.ts:65`):
```typescript
constructor() {
  super();
  this.logger = Logger.getInstance();  // Returns undefined in test!
  this.events = new Map();
  // ...
}
```

**Test Mock** (`tests/core/FleetManager.test.ts:6-29`):
```typescript
jest.mock('../../src/utils/Logger', () => {
  const mockLoggerInstance = { /* methods */ };

  return {
    Logger: {
      getInstance: jest.fn(() => mockLoggerInstance)  // This should work!
    }
  };
});
```

**Problem**: The mock is correctly defined, but Jest module resolution is not applying it properly when EventBus is instantiated inside FleetManager constructor. This is a **mock hoisting and instantiation timing issue**.

### 3. Why Database Mocking Actually Works (But Is Overcomplicated)

**FleetManager Constructor** (`src/core/FleetManager.ts:91`):
```typescript
constructor(config: FleetConfig) {
  super();
  this.id = uuidv4();
  this.agents = new Map();
  this.tasks = new Map();
  this.eventBus = new EventBus();
  this.database = new Database();  // ← This is mocked correctly
  // ...
}
```

**Current Mock** (`tests/core/FleetManager.test.ts:32-51`):
```typescript
jest.mock('../../src/utils/Database', () => {
  const mockDatabase = {
    initialize: jest.fn().mockResolvedValue(undefined),  // ✅ Used
    close: jest.fn().mockResolvedValue(undefined),       // ✅ Used
    query: jest.fn().mockReturnValue({ rows: [] }),      // ❌ Never used
    run: jest.fn().mockResolvedValue({ lastID: 1, changes: 1 }),  // ✅ Used by MemoryManager
    get: jest.fn().mockResolvedValue(undefined),         // ✅ Used by MemoryManager
    all: jest.fn().mockResolvedValue([]),                // ✅ Used by MemoryManager
    exec: jest.fn().mockReturnValue(undefined),          // ❌ Never used (exec is private)
    upsertFleet: jest.fn().mockResolvedValue(undefined), // ⚠️ Probably unused in tests
    upsertAgent: jest.fn().mockResolvedValue(undefined), // ⚠️ Probably unused in tests
    upsertTask: jest.fn().mockResolvedValue(undefined),  // ⚠️ Probably unused in tests
    insertEvent: jest.fn().mockResolvedValue(undefined), // ⚠️ Probably unused in tests
    insertMetric: jest.fn().mockResolvedValue(undefined),// ⚠️ Probably unused in tests
  };

  return {
    Database: jest.fn().mockImplementation(() => mockDatabase)
  };
});
```

**Analysis**: The Database mock is technically correct, but contains methods that are either:
- Never called (`query`, `exec`)
- Unlikely to be called in basic initialization tests (`upsertFleet`, etc.)
- This adds unnecessary complexity

---

## Architectural Issues Discovered

### 1. **Hard Dependency on Singleton Logger**

**Location**: Multiple classes (EventBus, MemoryManager, FleetManager)

**Problem**:
```typescript
// EventBus.ts:65
this.logger = Logger.getInstance();
```

- No fallback mechanism in EventBus (unlike FleetManager which has createFallbackLogger)
- Makes testing difficult - requires global mock to work
- Violates Dependency Inversion Principle (depends on concrete Logger class)

**Impact**: High coupling, difficult to test, fragile in test environments

### 2. **Implicit Database Instantiation**

**Location**: MemoryManager constructor

**Problem**:
```typescript
// MemoryManager.ts:45
constructor(database?: Database) {
  super();
  this.database = database || new Database();  // ← Creates real Database if not provided
  this.logger = Logger.getInstance();
  // ...
}
```

**FleetManager Constructor**:
```typescript
// FleetManager.ts:91
this.database = new Database();
this.memoryManager = new MemoryManager(this.database);  // ✅ Good - passes database
```

**Analysis**: MemoryManager design is good (accepts injected Database), but FleetManager instantiates Database directly instead of accepting it as a constructor parameter.

**Impact**: Medium - works in tests because Database mock is hoisted, but couples FleetManager to Database implementation

### 3. **Test Environment Logger Fallback Only in FleetManager**

**Location**: FleetManager.ts:117-145

**Issue**: FleetManager has sophisticated fallback logger:
```typescript
private createFallbackLogger(): Logger {
  return {
    info: (msg: string, meta?: any) => {
      if (process.env.NODE_ENV !== 'test') {
        console.log(`[INFO] ${msg}`, meta || '');
      }
    },
    // ... other methods
  } as any;
}
```

**But EventBus does NOT**:
```typescript
// EventBus.ts:65
this.logger = Logger.getInstance();  // No fallback!
```

**Impact**: Inconsistent test behavior, EventBus fails where FleetManager succeeds

---

## Dependency Graph

```
FleetManager
  │
  ├─► EventBus (new EventBus())
  │     └─► Logger.getInstance() ← FAILS: returns undefined
  │
  ├─► Database (new Database())
  │     └─► Logger.getInstance() ← Would fail, but never called in constructor
  │
  └─► MemoryManager (new MemoryManager(database))
        ├─► Database (injected) ← ✅ Good design
        └─► Logger.getInstance() ← Would fail, but not called until initialize()
```

**Critical Path**: EventBus instantiation happens synchronously in FleetManager constructor, so Logger mock must be resolved BEFORE FleetManager is created.

---

## Recommended Solutions

### **Option A: Constructor Dependency Injection (Preferred)**

**Rationale**:
- Best practice for testability
- Explicit dependencies
- No hidden globals
- SOLID principles compliant

**Implementation**:

```typescript
// src/core/FleetManager.ts
export class FleetManager extends EventEmitter {
  constructor(
    config: FleetConfig,
    dependencies?: {
      eventBus?: EventBus;
      database?: Database;
      logger?: Logger;
      memoryManager?: MemoryManager;
    }
  ) {
    super();
    this.id = uuidv4();
    this.agents = new Map();
    this.tasks = new Map();

    // Use injected dependencies or create defaults
    this.eventBus = dependencies?.eventBus || new EventBus(dependencies?.logger);
    this.database = dependencies?.database || new Database();
    this.logger = dependencies?.logger || this.createFallbackLogger();
    this.config = config;
    this.memoryManager = dependencies?.memoryManager ||
      new MemoryManager(this.database, this.logger);

    this.setupEventHandlers();
  }
  // ...
}

// src/core/EventBus.ts
export class EventBus extends EventEmitter {
  constructor(logger?: Logger) {
    super();
    this.logger = logger || Logger.getInstance();
    this.events = new Map();
    // ...
  }
  // ...
}

// src/core/MemoryManager.ts
export class MemoryManager extends EventEmitter {
  constructor(database?: Database, logger?: Logger) {
    super();
    this.database = database || new Database();
    this.logger = logger || Logger.getInstance();
    // ...
  }
  // ...
}
```

**Test Implementation**:
```typescript
// tests/core/FleetManager.test.ts
describe('FleetManager', () => {
  let fleetManager: FleetManager;
  let mockEventBus: jest.Mocked<EventBus>;
  let mockDatabase: jest.Mocked<Database>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(async () => {
    // Create mocks
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      log: jest.fn()
    } as any;

    mockDatabase = {
      initialize: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue({ lastID: 1, changes: 1 }),
      get: jest.fn().mockResolvedValue(undefined),
      all: jest.fn().mockResolvedValue([])
    } as any;

    mockEventBus = {
      initialize: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      emit: jest.fn()
    } as any;

    // Inject mocks via constructor
    fleetManager = new FleetManager(mockConfig, {
      eventBus: mockEventBus,
      database: mockDatabase,
      logger: mockLogger
    });
  });

  // Tests...
});
```

**Pros**:
✅ Clean, testable architecture
✅ No global mocks needed
✅ Explicit dependencies
✅ Easy to understand
✅ Follows SOLID principles

**Cons**:
⚠️ Requires changes to multiple classes
⚠️ Breaking change for existing code

**Migration Impact**: **Medium** - Requires updating:
- FleetManager constructor and all instantiation sites
- EventBus constructor
- MemoryManager constructor (minor)
- All tests that create FleetManager instances

---

### **Option B: Fix Mock Hoisting (Quick Fix)**

**Rationale**:
- Minimal code changes
- No breaking changes
- Fixes immediate test failures

**Implementation**:

```typescript
// tests/core/FleetManager.test.ts

// Move mocks to separate file for proper hoisting
import { mockLogger, mockDatabase } from '../mocks/core-mocks';

// Or use manual mock files
// __mocks__/Logger.ts
const mockLoggerInstance = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  log: jest.fn()
};

export const Logger = {
  getInstance: jest.fn(() => mockLoggerInstance)
};

export const LogLevel = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
};

// __mocks__/Database.ts
export class Database {
  initialize = jest.fn().mockResolvedValue(undefined);
  close = jest.fn().mockResolvedValue(undefined);
  run = jest.fn().mockResolvedValue({ lastID: 1, changes: 1 });
  get = jest.fn().mockResolvedValue(undefined);
  all = jest.fn().mockResolvedValue([]);
}

// tests/core/FleetManager.test.ts
jest.mock('../../src/utils/Logger');
jest.mock('../../src/utils/Database');

import { FleetManager } from '../../src/core/FleetManager';
// ...
```

**Pros**:
✅ No breaking changes
✅ Quick to implement
✅ Minimal code impact

**Cons**:
❌ Doesn't fix architectural issues
❌ Still relies on global mocks
❌ Hard to debug
❌ Fragile in complex scenarios

**Migration Impact**: **Low** - Only test files need updates

---

### **Option C: Hybrid Approach (Recommended for Gradual Migration)**

**Rationale**:
- Fix immediate issue with Option B
- Gradually migrate to Option A
- No breaking changes during transition

**Phase 1: Quick Fix (Week 1)**
- Implement Option B to unblock tests
- Add test coverage for existing behavior

**Phase 2: Refactor (Week 2-3)**
- Add optional dependency injection to constructors (backward compatible)
- Update tests to use injection
- Deprecate global singleton pattern with warnings

**Phase 3: Cleanup (Week 4)**
- Remove global singleton usage
- Update documentation
- Remove deprecation warnings

**Pros**:
✅ Immediate test fix
✅ Gradual, safe refactoring
✅ No breaking changes
✅ Better architecture long-term

**Cons**:
⚠️ Longer timeline
⚠️ More complex migration

**Migration Impact**: **Low to Medium** - Spread over multiple releases

---

## Database Mock Cleanup Recommendations

**Current mock has 12 methods, but only 5 are used:**

### Essential Methods (Keep)
```typescript
const mockDatabase = {
  initialize: jest.fn().mockResolvedValue(undefined),  // Called by MemoryManager
  close: jest.fn().mockResolvedValue(undefined),       // Called by FleetManager.stop()
  run: jest.fn().mockResolvedValue({ lastID: 1, changes: 1 }),  // Used by MemoryManager
  get: jest.fn().mockResolvedValue(undefined),         // Used by MemoryManager
  all: jest.fn().mockResolvedValue([])                 // Used by MemoryManager
};
```

### Remove These (Unused)
- `query()` - Does not exist in Database class
- `exec()` - Private method, never called externally
- `upsertFleet()` - Not called in basic initialization tests
- `upsertAgent()` - Not called in basic initialization tests
- `upsertTask()` - Not called in basic initialization tests
- `insertEvent()` - Not called in basic initialization tests
- `insertMetric()` - Not called in basic initialization tests

**Recommendation**: Start with minimal mock (5 methods), add others as tests require them.

---

## Testing Strategy

### 1. **Unit Tests** (FleetManager in isolation)
```typescript
// Mock all dependencies
const mockDependencies = {
  eventBus: createMockEventBus(),
  database: createMockDatabase(),
  logger: createMockLogger(),
  memoryManager: createMockMemoryManager()
};

const fleet = new FleetManager(config, mockDependencies);
```

### 2. **Integration Tests** (Real Database, Real EventBus)
```typescript
// Use real implementations with in-memory database
const fleet = new FleetManager(config, {
  database: new Database(':memory:')
});
```

### 3. **E2E Tests** (Full system)
```typescript
// No mocks, real everything
const fleet = new FleetManager(config);
```

---

## Security Considerations

**None identified** - This is purely a testing/architecture issue.

---

## Performance Impact

**None** - These changes only affect test execution, not production code.

---

## Backward Compatibility

| Solution | Breaking Change? | Migration Effort |
|----------|------------------|------------------|
| **Option A** | Yes | Medium (1-2 weeks) |
| **Option B** | No | Low (1-2 days) |
| **Option C** | No | Medium (3-4 weeks) |

---

## Recommended Action Plan

### Immediate (This Week)
1. **Implement Option B** - Fix mock hoisting with `__mocks__` files
2. **Simplify Database mock** - Remove unused methods
3. **Add Logger fallback to EventBus** - Match FleetManager pattern
4. **Add test coverage** - Ensure mocks are working

### Short-term (Next Sprint)
1. **Add optional dependency injection** - Start Option C Phase 2
2. **Update documentation** - Document testing patterns
3. **Create test helpers** - `createMockFleetDependencies()`

### Long-term (Next Quarter)
1. **Remove singleton pattern** - Complete Option A
2. **Enforce dependency injection** - ESLint rules
3. **Update all tests** - Use new pattern consistently

---

## Code Examples

### Quick Fix (Option B Implementation)

**Create: `tests/__mocks__/src/utils/Logger.ts`**
```typescript
const mockLoggerInstance = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  log: jest.fn(),
  child: jest.fn(function() { return this; }),
  setLevel: jest.fn(),
  getLevel: jest.fn(() => 'info')
};

export const Logger = {
  getInstance: jest.fn(() => mockLoggerInstance)
};

export const LogLevel = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
};
```

**Create: `tests/__mocks__/src/utils/Database.ts`**
```typescript
export class Database {
  initialize = jest.fn().mockResolvedValue(undefined);
  close = jest.fn().mockResolvedValue(undefined);
  run = jest.fn().mockResolvedValue({ lastID: 1, changes: 1 });
  get = jest.fn().mockResolvedValue(undefined);
  all = jest.fn().mockResolvedValue([]);
}
```

**Update: `tests/core/FleetManager.test.ts`**
```typescript
// Remove inline mocks (lines 6-51), replace with:
jest.mock('../../src/utils/Logger');
jest.mock('../../src/utils/Database');

import { FleetManager } from '../../src/core/FleetManager';
import { Config } from '../../src/utils/Config';
import { createResourceCleanup } from '../helpers/cleanup';

// Rest of test remains the same...
```

---

## Conclusion

The Database mocking is **not the problem** - it's actually working correctly. The real issue is **Logger mock initialization failure** in EventBus.

**Recommended Immediate Action**: Implement Option B (mock hoisting fix) to unblock tests within 1-2 days.

**Recommended Long-term Action**: Implement Option C (hybrid approach) to gradually improve architecture over 3-4 weeks.

---

## Appendix A: Full Dependency Chain

```
FleetManager Constructor (sync)
  │
  ├─► new EventBus()
  │     └─► Logger.getInstance() ← CRASH HERE (returns undefined)
  │
  ├─► new Database()
  │     ├─► Logger.getInstance() (not called in constructor, safe)
  │     └─► dbPath = './data/fleet.db'
  │
  └─► new MemoryManager(database)
        ├─► database (injected, good)
        └─► Logger.getInstance() (not called in constructor, safe)

FleetManager.initialize() (async)
  │
  ├─► database.initialize()
  │     └─► Creates SQLite connection
  │
  ├─► eventBus.initialize()
  │     └─► this.logger.info() ← Would crash here if Logger was undefined
  │
  └─► memoryManager.initialize()
        └─► database.initialize() (already initialized)
```

---

## Appendix B: Jest Mock Hoisting Rules

Jest hoists `jest.mock()` calls to the top of the file, **before imports**. However:

1. **Inline mocks** (using arrow functions) may not be hoisted properly
2. **`__mocks__` directory** is always hoisted correctly
3. **Module factory functions** must not reference out-of-scope variables

**Current test uses inline mocks** → May cause hoisting issues
**Solution: Use `__mocks__` directory** → Guaranteed hoisting

---

**Document Version**: 1.0
**Last Updated**: 2025-10-21
**Next Review**: After fix implementation

---
