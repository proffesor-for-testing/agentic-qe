# Dependency Injection Guide for Agentic QE v3

## Overview

This guide explains how to apply Dependency Injection (DI) patterns when creating or refactoring services in Agentic QE v3.

## Why Dependency Injection?

### Problems with Direct Instantiation

```typescript
// ❌ BAD: Tight coupling
class MyService {
  private dependency: OtherService;

  constructor(config: Config) {
    this.dependency = new OtherService(); // Hard-coded dependency
  }
}

// Problems:
// - Cannot test MyService in isolation
// - Cannot mock OtherService
// - Cannot swap implementations
// - Hard to maintain
```

### Benefits of Dependency Injection

```typescript
// ✅ GOOD: Loose coupling
interface IOtherService {
  doSomething(): void;
}

interface MyServiceDependencies {
  otherService: IOtherService;
}

class MyService {
  constructor(
    private readonly deps: MyServiceDependencies,
    config: Config
  ) {
    // Dependencies injected, not created
  }
}

// Benefits:
// ✅ Easy to test in isolation
// ✅ Easy to mock dependencies
// ✅ Can swap implementations
// ✅ Clear dependency contracts
```

## Step-by-Step Refactoring Guide

### Step 1: Identify Tight Coupling

Look for `new` keyword in constructors:

```typescript
class MyService {
  constructor(memory: MemoryBackend) {
    // 🚨 Tight coupling detected
    this.helperA = new HelperServiceA();
    this.helperB = new HelperServiceB();
    this.factory = new MyFactory();
  }
}
```

### Step 2: Extract Interfaces

Create interfaces for dependencies:

```typescript
// Define clear contracts
export interface IHelperServiceA {
  process(data: string): Result<string>;
}

export interface IHelperServiceB {
  validate(input: unknown): boolean;
}

export interface IMyFactory {
  create(type: string): SomeType;
}

// Update implementations to implement interfaces
export class HelperServiceA implements IHelperServiceA {
  process(data: string): Result<string> {
    // Implementation
  }
}
```

### Step 3: Create Dependencies Interface

```typescript
export interface MyServiceDependencies {
  memory: MemoryBackend;
  helperA?: IHelperServiceA;      // Optional with default
  helperB?: IHelperServiceB;      // Optional with default
  factory?: IMyFactory;           // Optional with default
}
```

**Why optional?**
- Provides defaults for backward compatibility
- Simplifies common use cases
- Allows gradual migration

### Step 4: Refactor Constructor

```typescript
export class MyService {
  private readonly memory: MemoryBackend;
  private readonly helperA: IHelperServiceA;
  private readonly helperB: IHelperServiceB;
  private readonly factory: IMyFactory;

  constructor(
    dependencies: MyServiceDependencies,
    config: Partial<MyServiceConfig> = {}
  ) {
    this.memory = dependencies.memory;

    // Inject or use default
    this.helperA = dependencies.helperA || new HelperServiceA();
    this.helperB = dependencies.helperB || new HelperServiceB();
    this.factory = dependencies.factory || new MyFactory();
  }
}
```

### Step 5: Create Factory Functions

```typescript
/**
 * Simple factory for common use case
 * Maintains backward compatibility
 */
export function createMyService(
  memory: MemoryBackend,
  config: Partial<MyServiceConfig> = {}
): MyService {
  return new MyService({ memory }, config);
}

/**
 * Advanced factory for custom dependencies
 * Used for testing or special scenarios
 */
export function createMyServiceWithDependencies(
  dependencies: MyServiceDependencies,
  config: Partial<MyServiceConfig> = {}
): MyService {
  return new MyService(dependencies, config);
}
```

### Step 6: Update Exports

```typescript
// services/index.ts
export {
  MyService,
  createMyService,
  createMyServiceWithDependencies,
  type IMyService,
  type MyServiceConfig,
  type MyServiceDependencies,
} from './my-service';

export {
  HelperServiceA,
  type IHelperServiceA,
} from './helper-a';

export {
  HelperServiceB,
  type IHelperServiceB,
} from './helper-b';
```

### Step 7: Update Consumers

```typescript
// Before
const service = new MyService(memory, config);

// After (simple case - backward compatible)
const service = createMyService(memory, config);

// After (advanced case - custom dependencies)
const service = createMyServiceWithDependencies({
  memory,
  helperA: customHelperA,
  helperB: customHelperB,
}, config);
```

### Step 8: Write Tests

```typescript
import { describe, it, expect, vi } from 'vitest';
import {
  createMyServiceWithDependencies,
  type MyServiceDependencies,
} from './my-service';

describe('MyService - Dependency Injection', () => {
  it('should use injected dependencies', () => {
    // Create mocks
    const mockHelperA = {
      process: vi.fn().mockReturnValue({ success: true }),
    };

    const mockHelperB = {
      validate: vi.fn().mockReturnValue(true),
    };

    // Inject mocks
    const dependencies: MyServiceDependencies = {
      memory: mockMemory,
      helperA: mockHelperA,
      helperB: mockHelperB,
    };

    const service = createMyServiceWithDependencies(dependencies);

    // Test in isolation
    service.doSomething();

    expect(mockHelperA.process).toHaveBeenCalled();
    expect(mockHelperB.validate).toHaveBeenCalled();
  });
});
```

## Common Patterns

### Pattern 1: Required Dependencies

```typescript
interface ServiceDependencies {
  memory: MemoryBackend;        // Required
  eventBus: EventBus;           // Required
}

class MyService {
  constructor(deps: ServiceDependencies) {
    this.memory = deps.memory;
    this.eventBus = deps.eventBus;
  }
}
```

### Pattern 2: Optional Dependencies with Defaults

```typescript
interface ServiceDependencies {
  memory: MemoryBackend;        // Required
  logger?: ILogger;             // Optional with default
}

class MyService {
  constructor(deps: ServiceDependencies) {
    this.memory = deps.memory;
    this.logger = deps.logger || new ConsoleLogger();
  }
}
```

### Pattern 3: Factory Dependencies

```typescript
interface ServiceDependencies {
  memory: MemoryBackend;
  helperFactory?: IHelperFactory;
}

class MyService {
  constructor(deps: ServiceDependencies) {
    this.factory = deps.helperFactory || new DefaultHelperFactory();
    this.helper = this.factory.create('type-a');
  }
}
```

### Pattern 4: Lazy Initialization

```typescript
class MyService {
  private helper: IHelper | null = null;

  constructor(
    private readonly deps: ServiceDependencies
  ) {}

  private getHelper(): IHelper {
    if (!this.helper) {
      this.helper = this.deps.helperFactory?.create() || new DefaultHelper();
    }
    return this.helper;
  }
}
```

## Real Examples from Codebase

### Example 1: TestGeneratorService

**File:** `v3/src/domains/test-generation/services/test-generator.ts`

```typescript
// Dependencies interface
export interface TestGeneratorDependencies {
  memory: MemoryBackend;
  generatorFactory?: ITestGeneratorFactory;
  tddGenerator?: ITDDGeneratorService;
  propertyTestGenerator?: IPropertyTestGeneratorService;
  testDataGenerator?: ITestDataGeneratorService;
}

// Service class
export class TestGeneratorService implements ITestGenerationService {
  constructor(
    dependencies: TestGeneratorDependencies,
    config: Partial<TestGeneratorConfig> = {}
  ) {
    this.memory = dependencies.memory;
    this.generatorFactory = dependencies.generatorFactory || new TestGeneratorFactory();
    this.tddGenerator = dependencies.tddGenerator || new TDDGeneratorService();
    // ...
  }
}

// Factory functions
export function createTestGeneratorService(
  memory: MemoryBackend,
  config: Partial<TestGeneratorConfig> = {}
): TestGeneratorService {
  return new TestGeneratorService({ memory }, config);
}
```

### Example 2: ComplexityAnalyzer (from Phase 2)

**File:** `v3/src/integrations/agentic-flow/model-router/complexity-analyzer.ts`

```typescript
// Dependencies interface
export interface ComplexityAnalyzerDependencies {
  signalCollector: ISignalCollector;
  scoreCalculator: IScoreCalculator;
  tierRecommender: ITierRecommender;
}

// Service class
export class ComplexityAnalyzer {
  constructor(private readonly deps: ComplexityAnalyzerDependencies) {}

  async analyze(context: AnalysisContext): Promise<ComplexityResult> {
    const signals = await this.deps.signalCollector.collect(context);
    const scores = this.deps.scoreCalculator.calculate(signals);
    const tier = this.deps.tierRecommender.recommend(scores);
    return { signals, scores, tier };
  }
}

// Factory function
export function createComplexityAnalyzer(): ComplexityAnalyzer {
  return new ComplexityAnalyzer({
    signalCollector: new DefaultSignalCollector(),
    scoreCalculator: new DefaultScoreCalculator(),
    tierRecommender: new DefaultTierRecommender(),
  });
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Service Locator

```typescript
// ❌ DON'T DO THIS
class MyService {
  constructor() {
    this.helper = ServiceLocator.get('HelperService');
  }
}
```

**Why bad:**
- Hidden dependencies
- Hard to test
- Violates Dependency Inversion Principle

**Do this instead:**
```typescript
// ✅ DO THIS
class MyService {
  constructor(deps: { helper: IHelper }) {
    this.helper = deps.helper;
  }
}
```

### Anti-Pattern 2: Conditional Creation

```typescript
// ❌ DON'T DO THIS
class MyService {
  constructor(useCache: boolean) {
    if (useCache) {
      this.storage = new CachedStorage();
    } else {
      this.storage = new DirectStorage();
    }
  }
}
```

**Why bad:**
- Constructor doing too much
- Hard to extend
- Violates Open/Closed Principle

**Do this instead:**
```typescript
// ✅ DO THIS
interface MyServiceDependencies {
  storage: IStorage;
}

class MyService {
  constructor(deps: MyServiceDependencies) {
    this.storage = deps.storage;
  }
}

// Let caller decide implementation
const service = new MyService({
  storage: useCache ? new CachedStorage() : new DirectStorage()
});
```

### Anti-Pattern 3: Constructor Side Effects

```typescript
// ❌ DON'T DO THIS
class MyService {
  constructor(deps: Dependencies) {
    this.helper = deps.helper;
    this.helper.initialize(); // Side effect!
    this.loadData();          // Side effect!
  }
}
```

**Why bad:**
- Hard to test
- Unexpected behavior
- Constructor should only wire dependencies

**Do this instead:**
```typescript
// ✅ DO THIS
class MyService {
  constructor(deps: Dependencies) {
    this.helper = deps.helper;
  }

  async initialize(): Promise<void> {
    await this.helper.initialize();
    await this.loadData();
  }
}
```

## Testing Strategies

### Strategy 1: Full Mock

```typescript
it('should use all mocked dependencies', () => {
  const mocks = {
    memory: createMockMemory(),
    helperA: createMockHelperA(),
    helperB: createMockHelperB(),
  };

  const service = createMyServiceWithDependencies(mocks);

  // Test in complete isolation
});
```

### Strategy 2: Partial Mock

```typescript
it('should use real memory but mocked helpers', () => {
  const deps = {
    memory: realMemoryBackend,
    helperA: createMockHelperA(),
    helperB: createMockHelperB(),
  };

  const service = createMyServiceWithDependencies(deps);

  // Integration test with some real components
});
```

### Strategy 3: Spy on Defaults

```typescript
it('should use default implementations', () => {
  const service = createMyService(mockMemory);

  // Service uses default implementations
  // Can spy on method calls
  vi.spyOn(service['helperA'], 'process');
});
```

## Checklist for DI Refactoring

- [ ] Identify all `new` keywords in constructor
- [ ] Extract interfaces for all dependencies
- [ ] Create `*Dependencies` interface
- [ ] Make dependencies optional with defaults
- [ ] Update constructor to accept dependencies
- [ ] Create factory functions (simple + advanced)
- [ ] Update all consumers to use factory
- [ ] Export interfaces and factories
- [ ] Write unit tests with mocks
- [ ] Update documentation

## Resources

- [SOLID Principles](https://en.wikipedia.org/wiki/SOLID)
- [Dependency Inversion Principle](https://en.wikipedia.org/wiki/Dependency_inversion_principle)
- [Constructor Injection](https://en.wikipedia.org/wiki/Dependency_injection#Constructor_injection)
- Phase 2 DI Implementation (complexity-analyzer, cve-prevention)
- Phase 3.2 DI Implementation (test-generation services)
