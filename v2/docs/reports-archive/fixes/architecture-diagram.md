# FleetManager Architecture & Mock Issue Diagram

## Current Architecture (Production Code)

```
┌─────────────────────────────────────────────────────────────────┐
│                         FleetManager                             │
│  constructor(config: FleetConfig)                                │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   EventBus   │  │   Database   │  │ MemoryManager│           │
│  │              │  │              │  │              │           │
│  │ new EventBus()│  │new Database()│  │new Manager() │           │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │
│         │                 │                 │                   │
│         ▼                 ▼                 ▼                   │
│  ┌──────────────────────────────────────────────────┐           │
│  │         Logger.getInstance()                      │           │
│  │         (Singleton Pattern)                       │           │
│  └──────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

## Initialization Call Flow

```
User Code: new FleetManager(config)
    │
    ├─► FleetManager constructor (sync)
    │   │
    │   ├─► new EventBus()
    │   │   │
    │   │   └─► EventBus constructor (sync)
    │   │       │
    │   │       └─► this.logger = Logger.getInstance()
    │   │           │
    │   │           └─► ❌ RETURNS UNDEFINED IN TESTS
    │   │
    │   ├─► new Database()
    │   │   │
    │   │   └─► Database constructor (sync)
    │   │       └─► this.logger = Logger.getInstance()
    │   │           (Not called - Logger used later)
    │   │
    │   └─► new MemoryManager(database)
    │       │
    │       └─► MemoryManager constructor (sync)
    │           └─► this.logger = Logger.getInstance()
    │               (Not called - Logger used later)
    │
    └─► User Code: await fleetManager.initialize()
        │
        ├─► database.initialize() ✅
        │
        ├─► eventBus.initialize()
        │   │
        │   └─► this.logger.info('Initializing EventBus')
        │       │
        │       └─► ❌ CRASH: this.logger is undefined
        │           TypeError: Cannot read properties of undefined (reading 'info')
```

## Test Environment - Current (Broken)

```
Test File Execution Order:
┌────────────────────────────────────────────────────────────┐
│ 1. jest.mock('../../src/utils/Logger', () => { ... })     │ ← Inline mock
│                                                            │
│ 2. import { FleetManager } from '../../src/core/...'      │
│    │                                                       │
│    └─► Import chain resolves:                             │
│        - FleetManager imports EventBus                     │
│        - EventBus imports Logger                           │
│        - Logger.getInstance registered                     │
│                                                            │
│ 3. beforeEach(() => {                                      │
│      fleetManager = new FleetManager(config)              │
│      │                                                     │
│      └─► EventBus constructor runs                        │
│          this.logger = Logger.getInstance()               │
│          │                                                 │
│          └─► ⚠️ Mock may not be applied yet              │
│              Returns: undefined                            │
│    })                                                      │
└────────────────────────────────────────────────────────────┘
```

## Test Environment - Fixed (Working)

```
Jest Module Resolution with __mocks__:
┌────────────────────────────────────────────────────────────┐
│ 0. Jest scans for __mocks__ directories (before anything) │
│    └─► Finds: tests/__mocks__/src/utils/Logger.ts        │
│    └─► Finds: tests/__mocks__/src/utils/Database.ts      │
│                                                            │
│ 1. jest.mock('../../src/utils/Logger')                    │ ← Just declare
│    └─► Jest uses __mocks__/src/utils/Logger.ts           │
│                                                            │
│ 2. jest.mock('../../src/utils/Database')                  │
│    └─► Jest uses __mocks__/src/utils/Database.ts         │
│                                                            │
│ 3. import { FleetManager } from '../../src/core/...'      │
│    │                                                       │
│    └─► Import chain resolves:                             │
│        - FleetManager imports EventBus                     │
│        - EventBus imports Logger                           │
│        - ✅ Logger is MOCKED version from __mocks__/     │
│                                                            │
│ 4. beforeEach(() => {                                      │
│      fleetManager = new FleetManager(config)              │
│      │                                                     │
│      └─► EventBus constructor runs                        │
│          this.logger = Logger.getInstance()               │
│          │                                                 │
│          └─► ✅ Returns mock logger instance              │
│              { info: jest.fn(), warn: jest.fn(), ... }    │
│    })                                                      │
└────────────────────────────────────────────────────────────┘
```

## Dependency Injection Solution (Future)

```
┌─────────────────────────────────────────────────────────────────┐
│                         FleetManager                             │
│  constructor(                                                    │
│    config: FleetConfig,                                          │
│    dependencies?: {                                              │
│      eventBus?: EventBus,                                        │
│      database?: Database,                                        │
│      logger?: Logger                                             │
│    }                                                             │
│  )                                                               │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   EventBus   │  │   Database   │  │    Logger    │           │
│  │              │  │              │  │              │           │
│  │   (injected) │  │  (injected)  │  │  (injected)  │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
│         ▲                 ▲                 ▲                   │
│         │                 │                 │                   │
│         └─────────────────┴─────────────────┘                   │
│                 Explicit Dependencies                            │
│              (Testable, No Globals)                              │
└─────────────────────────────────────────────────────────────────┘

Test Code:
┌────────────────────────────────────────────────────────────┐
│ const mockLogger = { info: jest.fn(), ... };              │
│ const mockDatabase = { initialize: jest.fn(), ... };      │
│ const mockEventBus = { initialize: jest.fn(), ... };      │
│                                                            │
│ const fleet = new FleetManager(config, {                  │
│   logger: mockLogger,                                      │
│   database: mockDatabase,                                  │
│   eventBus: mockEventBus                                   │
│ });                                                        │
│                                                            │
│ ✅ No global mocks needed                                 │
│ ✅ Explicit, clear dependencies                            │
│ ✅ Easy to test                                            │
└────────────────────────────────────────────────────────────┘
```

## Comparison: Singleton vs Dependency Injection

### Singleton Pattern (Current)
```typescript
// Hard to test - requires global mocks
class EventBus {
  constructor() {
    this.logger = Logger.getInstance();  // ← Hidden dependency
  }
}

// Test requires jest.mock() magic
jest.mock('../../src/utils/Logger');  // ← Must mock globally
const eventBus = new EventBus();      // ← Logger is somewhere...
```

**Pros**:
- ✅ Simple to use
- ✅ No constructor parameters

**Cons**:
- ❌ Hidden dependencies
- ❌ Hard to test
- ❌ Tight coupling
- ❌ Global state

### Dependency Injection (Recommended)
```typescript
// Easy to test - explicit dependencies
class EventBus {
  constructor(logger?: Logger) {
    this.logger = logger || Logger.getInstance();  // ← Explicit
  }
}

// Test is straightforward
const mockLogger = { info: jest.fn(), ... };
const eventBus = new EventBus(mockLogger);  // ← Clear what's mocked
```

**Pros**:
- ✅ Explicit dependencies
- ✅ Easy to test
- ✅ Loose coupling
- ✅ No global state

**Cons**:
- ⚠️ More constructor parameters
- ⚠️ Requires refactoring

## Mock File Structure

```
tests/
├── __mocks__/                    ← Jest scans this directory
│   └── src/                      ← Mirrors src/ structure
│       └── utils/
│           ├── Logger.ts         ← Mock Logger implementation
│           └── Database.ts       ← Mock Database implementation
│
├── core/
│   └── FleetManager.test.ts     ← Uses mocks via jest.mock()
│
└── helpers/
    └── cleanup.ts
```

**Why This Works**:
1. Jest automatically finds `__mocks__/` directories
2. When `jest.mock('../../src/utils/Logger')` is called, Jest uses the mock file
3. Mock is applied **before** any imports, so Logger.getInstance() works correctly

## Error Flow (Before Fix)

```
FleetManager Test
    │
    ├─► jest.mock() with inline factory
    │   └─► ⚠️ May not hoist properly
    │
    ├─► import FleetManager
    │   ├─► import EventBus
    │   │   └─► import Logger (real Logger, not mocked!)
    │   │
    │   └─► EventBus constructor runs
    │       └─► Logger.getInstance() returns undefined
    │           (Mock not applied yet)
    │
    └─► new FleetManager()
        └─► new EventBus()
            └─► this.logger = undefined
                │
                └─► Later: this.logger.info()
                    └─► ❌ TypeError: Cannot read property 'info' of undefined
```

## Success Flow (After Fix)

```
FleetManager Test
    │
    ├─► jest.mock() declaration only
    │   └─► Points to __mocks__/src/utils/Logger.ts
    │
    ├─► Jest applies mocks BEFORE any imports
    │   └─► Logger module is now the mocked version
    │
    ├─► import FleetManager
    │   ├─► import EventBus
    │   │   └─► import Logger (✅ mocked version from __mocks__/)
    │   │
    │   └─► EventBus constructor runs
    │       └─► Logger.getInstance() returns mock instance
    │           { info: jest.fn(), warn: jest.fn(), ... }
    │
    └─► new FleetManager()
        └─► new EventBus()
            └─► this.logger = { info: jest.fn(), ... }
                │
                └─► Later: this.logger.info('...')
                    └─► ✅ Mock function called successfully
```

---

**Key Takeaway**: The issue is **mock timing**, not mock content. Moving mocks to `__mocks__/` ensures they're applied before any code runs.
