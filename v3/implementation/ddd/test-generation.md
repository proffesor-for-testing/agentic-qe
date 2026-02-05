# Test Generation Domain

## Bounded Context Overview

**Domain**: Test Generation
**Responsibility**: AI-powered test creation and pattern learning
**Location**: `src/domains/test-generation/`

The Test Generation domain is responsible for automatically generating high-quality tests using AI, AST analysis, and learned patterns from existing codebases.

## Ubiquitous Language

| Term | Definition |
|------|------------|
| **Generated Test** | An automatically created test file with assertions |
| **Test Framework** | Target testing framework (jest, vitest, mocha, pytest) |
| **Test Type** | Category of test: unit, integration, or e2e |
| **TDD Phase** | Red-Green-Refactor workflow phase |
| **Property Test** | Test that validates properties hold for generated inputs |
| **Pattern** | Learned testing approach extracted from existing tests |
| **Code Analysis** | AST-based extraction of functions and classes |
| **Test Generator** | Strategy implementation for framework-specific test output |

## Domain Model

### Aggregates

#### GeneratedTests (Aggregate Root)
Represents the output of a test generation request.

```typescript
interface IGeneratedTests {
  tests: IGeneratedTest[];      // Collection of generated tests
  coverageEstimate: number;     // Estimated coverage percentage
  patternsUsed: string[];       // Patterns applied during generation
}
```

### Entities

#### GeneratedTest
Individual generated test with metadata.

```typescript
interface IGeneratedTest {
  id: string;                   // Unique identifier
  name: string;                 // Test suite/describe name
  sourceFile: string;           // File being tested
  testFile: string;             // Generated test file path
  testCode: string;             // Generated test source code
  type: TestType;               // unit | integration | e2e
  assertions: number;           // Number of assertions
  llmEnhanced?: boolean;        // Whether LLM improved the test
}
```

### Value Objects

#### FunctionInfo
Immutable representation of a function from AST analysis.

```typescript
interface IFunctionInfo {
  readonly name: string;
  readonly parameters: IParameterInfo[];
  readonly returnType: string | undefined;
  readonly isAsync: boolean;
  readonly isExported: boolean;
  readonly complexity: number;
  readonly startLine: number;
  readonly endLine: number;
}
```

#### ClassInfo
Immutable representation of a class from AST analysis.

```typescript
interface IClassInfo {
  readonly name: string;
  readonly methods: IFunctionInfo[];
  readonly properties: IPropertyInfo[];
  readonly isExported: boolean;
  readonly hasConstructor: boolean;
  readonly constructorParams?: IParameterInfo[];
}
```

#### Pattern
Learned testing pattern with applicability scoring.

```typescript
interface IPattern {
  readonly id: string;
  readonly name: string;
  readonly structure: string;       // Template structure
  readonly examples: number;        // Number of examples seen
  readonly applicability: number;   // 0-1 applicability score
}
```

#### TestCase
Test case definition for generation.

```typescript
interface ITestCase {
  readonly description: string;
  readonly type: 'happy-path' | 'edge-case' | 'error-handling' | 'boundary';
  readonly setup?: string;
  readonly action: string;
  readonly assertion: string;
}
```

## Domain Services

### ITestGenerationAPI
Primary API for the domain.

```typescript
interface ITestGenerationAPI {
  generateTests(request: IGenerateTestsRequest): Promise<Result<IGeneratedTests, Error>>;
  generateTDDTests(request: ITDDRequest): Promise<Result<ITDDResult, Error>>;
  generatePropertyTests(request: IPropertyTestRequest): Promise<Result<IPropertyTests, Error>>;
  generateTestData(request: ITestDataRequest): Promise<Result<ITestData, Error>>;
  learnPatterns(request: ILearnPatternsRequest): Promise<Result<ILearnedPatterns, Error>>;
}
```

### ITestGenerator (Strategy Pattern)
Framework-specific test generation strategy.

```typescript
interface ITestGenerator {
  readonly framework: TestFramework;
  generateTests(context: ITestGenerationContext): string;
  generateFunctionTests(fn: IFunctionInfo, testType: TestType): string;
  generateClassTests(cls: IClassInfo, testType: TestType): string;
  generateStubTests(context: ITestGenerationContext): string;
  generateCoverageTests(moduleName: string, importPath: string, lines: number[]): string;
}
```

### ITestGeneratorFactory
Factory for creating framework-specific generators.

```typescript
interface ITestGeneratorFactory {
  create(framework: TestFramework): ITestGenerator;
  supports(framework: string): framework is TestFramework;
  getDefault(): TestFramework;
}
```

## Domain Events

| Event | Trigger | Payload |
|-------|---------|---------|
| `TestsGeneratedEvent` | Tests successfully generated | `{ testIds, sourceFiles, coverage }` |
| `TDDPhaseCompletedEvent` | TDD phase completed | `{ phase, testCode?, implementationCode? }` |
| `PatternsLearnedEvent` | New patterns extracted | `{ patternIds, confidence }` |

## Context Integration

### Upstream Dependencies
- **Code Intelligence**: AST analysis, import resolution
- **Learning Optimization**: Pattern storage and retrieval

### Downstream Consumers
- **Test Execution**: Executes generated tests
- **Coverage Analysis**: Measures coverage of generated tests

### Anti-Corruption Layer
The domain uses the `ITestGeneratorFactory` to isolate framework-specific code generation from the core domain logic.

## Task Handlers

Task types handled by this domain for Queen coordination:

| Task Type | Handler | Description |
|-----------|---------|-------------|
| `generate-tests` | `generateTests()` | Generate tests for source files |
| `generate-tdd` | `generateTDDTests()` | TDD workflow generation |
| `generate-property` | `generatePropertyTests()` | Property-based test generation |
| `learn-patterns` | `learnPatterns()` | Extract patterns from tests |

## Configuration

```typescript
const TEST_GENERATION_DEFAULTS = {
  framework: 'vitest',
  testType: 'unit',
  coverageTarget: 80,
  maxTestsPerFunction: 5,
  includeEdgeCases: true,
  includeBoundaryTests: true
};
```

## ADR References

- **ADR-051**: LLM-powered test enhancement
- **ADR-001**: Integration with agentic-flow patterns
