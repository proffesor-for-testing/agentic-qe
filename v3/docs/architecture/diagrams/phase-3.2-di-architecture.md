# Phase 3.2: Dependency Injection Architecture

## Before Refactoring (Tight Coupling)

```
┌────────────────────────────────────────┐
│     TestGeneratorService               │
│                                        │
│  constructor(memory, config) {         │
│    this.generatorFactory =             │
│      new TestGeneratorFactory()  ──────┼──► Tight coupling
│    this.tddGenerator =                 │    (hard to test)
│      new TDDGeneratorService()   ──────┼──► Tight coupling
│    this.propertyTestGenerator =        │    (hard to mock)
│      new PropertyTestGeneratorService()┼──► Tight coupling
│    this.testDataGenerator =            │    (hard to swap)
│      new TestDataGeneratorService() ───┼──► Tight coupling
│  }                                      │
└────────────────────────────────────────┘
```

## After Refactoring (Dependency Injection)

```
┌─────────────────────────────────────────────────────────┐
│              TestGeneratorDependencies                  │
│  ┌─────────────────────────────────────────────┐        │
│  │ memory: MemoryBackend                       │        │
│  │ generatorFactory?: ITestGeneratorFactory    │◄───────┼── Injectable
│  │ tddGenerator?: ITDDGeneratorService         │        │   (mockable)
│  │ propertyTestGenerator?: IPropertyTestGen... │        │
│  │ testDataGenerator?: ITestDataGeneratorSvc   │        │
│  └─────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────┘
                          │
                          │ Injected via constructor
                          ▼
┌─────────────────────────────────────────────────────────┐
│          TestGeneratorService                           │
│                                                          │
│  constructor(dependencies, config) {                    │
│    this.memory = dependencies.memory                    │
│    this.generatorFactory =                              │
│      dependencies.generatorFactory ||  ◄────────────────┼── Defaults provided
│        new TestGeneratorFactory()                       │   (backward compat)
│    this.tddGenerator =                                  │
│      dependencies.tddGenerator ||   ◄───────────────────┼── Optional DI
│        new TDDGeneratorService()                        │   (flexibility)
│    // ...                                               │
│  }                                                       │
└─────────────────────────────────────────────────────────┘
```

## Factory Pattern Integration

```
┌──────────────────────────────────────────────────────────────┐
│                    Factory Functions                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  createTestGeneratorService(memory, config)                 │
│    ↓                                                         │
│    Returns: new TestGeneratorService({ memory }, config)    │
│    ↑                                                         │
│    └─ Simple API for common use case                        │
│                                                              │
│  createTestGeneratorServiceWithDependencies(deps, config)   │
│    ↓                                                         │
│    Returns: new TestGeneratorService(deps, config)          │
│    ↑                                                         │
│    └─ Advanced API for custom dependencies                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Interface Hierarchy

```
┌─────────────────────────────────────────┐
│      ITestGenerationService             │  Main service interface
│  ┌──────────────────────────────────┐   │
│  │ generateTests(...)               │   │
│  │ generateForCoverageGap(...)      │   │
│  │ generateTDDTests(...)            │   │
│  │ generatePropertyTests(...)       │   │
│  │ generateTestData(...)            │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
              ▲
              │ implements
              │
┌─────────────┴───────────────────────────┐
│      TestGeneratorService               │
│                                         │
│  Uses ▼                                 │
└─────────────────────────────────────────┘
              │
         ┌────┴───────┬──────────────┬───────────────┐
         ▼            ▼              ▼               ▼
┌──────────────┐ ┌─────────────┐ ┌──────────────┐ ┌─────────────┐
│ITestGenerator│ │ITDD         │ │IPropertyTest │ │ITestData    │
│Factory       │ │Generator    │ │Generator     │ │Generator    │
│              │ │Service      │ │Service       │ │Service      │
└──────────────┘ └─────────────┘ └──────────────┘ └─────────────┘
      ▲                ▲                ▲                ▲
      │ implements     │ implements     │ implements     │ implements
      │                │                │                │
┌─────┴──────┐   ┌────┴──────┐   ┌────┴──────┐   ┌────┴──────┐
│TestGen     │   │TDD        │   │PropertyTest│   │TestData   │
│Factory     │   │Generator  │   │Generator   │   │Generator  │
└────────────┘   └───────────┘   └────────────┘   └───────────┘
```

## Consumers Updated

```
┌────────────────────────────────────────────────────────────┐
│                    Before (Direct Instantiation)           │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Plugin:         new TestGeneratorService(memory, cfg)    │
│  Coordinator:    new TestGeneratorService(memory)         │
│  TaskExecutor:   new TestGeneratorService(memory)         │
│  MCP Tool:       new TestGeneratorService(memory, cfg)    │
│                                                            │
└────────────────────────────────────────────────────────────┘
                          │
                          ▼ Refactored to
┌────────────────────────────────────────────────────────────┐
│                  After (Factory Functions)                 │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Plugin:         createTestGeneratorService(memory, cfg)  │
│  Coordinator:    createTestGeneratorService(memory)       │
│  TaskExecutor:   createTestGeneratorService(memory)       │
│  MCP Tool:       createTestGeneratorService(memory, cfg)  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

## Testing Benefits

```
┌──────────────────────────────────────────────────────────┐
│               Unit Testing with DI                       │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  // Create mock dependencies                            │
│  const mockFactory = vi.fn()                            │
│  const mockTDD = vi.fn()                                │
│  const mockProperty = vi.fn()                           │
│  const mockData = vi.fn()                               │
│                                                          │
│  // Inject mocks                                        │
│  const service = createTestGeneratorServiceWithDeps({   │
│    memory: mockMemory,                                  │
│    generatorFactory: mockFactory,   ◄── Fully mockable  │
│    tddGenerator: mockTDD,           ◄── Isolated tests  │
│    propertyTestGenerator: mockProperty, ◄── Predictable │
│    testDataGenerator: mockData      ◄── Fast tests      │
│  })                                                     │
│                                                          │
│  // Test in isolation                                   │
│  await service.generateTests(...)                       │
│  expect(mockFactory.create).toHaveBeenCalled()          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## Key Improvements

### 1. Loose Coupling
- Services depend on abstractions (interfaces) not concrete classes
- Dependencies can be swapped without changing service code
- Follows Dependency Inversion Principle (DIP)

### 2. Testability
- All dependencies can be mocked
- Tests run in isolation
- No side effects from real implementations

### 3. Flexibility
- Runtime implementation swapping
- Custom behavior for specific scenarios
- Easy to extend

### 4. Maintainability
- Clear dependency contracts
- Single Responsibility Principle (SRP)
- Easier to understand and modify

### 5. Backward Compatibility
- Factory functions provide defaults
- Existing code works without changes
- Gradual migration path

## Comparison: Before vs After

| Aspect | Before | After |
|--------|--------|-------|
| **Coupling** | Tight (hard-coded `new`) | Loose (interface-based) |
| **Testing** | Integration tests only | Full unit test coverage |
| **Mocking** | Difficult/impossible | Easy with mocks |
| **Flexibility** | Fixed implementations | Swappable at runtime |
| **Migration** | N/A | Backward compatible |
| **Complexity** | Low | Slightly higher (worth it) |
| **Maintenance** | Hard to change | Easy to extend |

## SOLID Principles Applied

### Dependency Inversion Principle (DIP) ✅
- High-level modules (TestGeneratorService) don't depend on low-level modules
- Both depend on abstractions (interfaces)

### Single Responsibility Principle (SRP) ✅
- Each service has one clear responsibility
- Interfaces are focused and cohesive

### Open/Closed Principle (OCP) ✅
- Open for extension (new implementations)
- Closed for modification (existing code unchanged)

### Interface Segregation Principle (ISP) ✅
- Small, focused interfaces
- Clients depend only on methods they use

### Liskov Substitution Principle (LSP) ✅
- Any implementation can replace another
- Contracts enforced by interfaces
