# Test Generator Strategy Pattern

This directory contains the Strategy Pattern implementation for framework-specific test generation.

## Architecture

```
generators/
  base-test-generator.ts      # Abstract base class with shared utilities
  jest-vitest-generator.ts    # Jest/Vitest specific implementation
  mocha-generator.ts          # Mocha/Chai specific implementation
  pytest-generator.ts         # Python pytest specific implementation
  index.ts                    # Exports all generators

interfaces/
  test-generator.interface.ts # ITestGenerator strategy interface
  index.ts                    # Type exports

factories/
  test-generator-factory.ts   # Factory for creating generators
  index.ts                    # Factory exports
```

## Usage

### Basic Usage

```typescript
import { createTestGenerator } from './factories';

// Create a generator for a specific framework
const generator = createTestGenerator('jest');

// Generate tests from code analysis
const testCode = generator.generateTests({
  moduleName: 'userService',
  importPath: './user-service',
  testType: 'unit',
  patterns: [],
  analysis: {
    functions: [...],
    classes: [...]
  }
});
```

### Using the Factory

```typescript
import { TestGeneratorFactory, isValidTestFramework } from './factories';

const factory = new TestGeneratorFactory();

// Check if framework is supported
if (isValidTestFramework(userInput)) {
  const generator = factory.create(userInput);
  const tests = generator.generateTests(context);
}

// Get all supported frameworks
const frameworks = factory.getSupportedFrameworks();
// ['jest', 'vitest', 'mocha', 'pytest']
```

### Direct Generator Usage

```typescript
import { JestVitestGenerator, MochaGenerator, PytestGenerator } from './generators';

// Direct instantiation
const jestGen = new JestVitestGenerator('jest');
const vitestGen = new JestVitestGenerator('vitest');
const mochaGen = new MochaGenerator();
const pytestGen = new PytestGenerator();
```

## Generator Methods

Each generator implements the `ITestGenerator` interface:

| Method | Description |
|--------|-------------|
| `generateTests(context)` | Generate complete test file from analysis |
| `generateFunctionTests(fn, testType)` | Generate tests for a function |
| `generateClassTests(cls, testType)` | Generate tests for a class |
| `generateStubTests(context)` | Generate stub tests when no analysis available |
| `generateCoverageTests(moduleName, importPath, lines)` | Generate tests targeting specific lines |

## Extending

To add support for a new framework:

1. Create a new generator class extending `BaseTestGenerator`
2. Implement all abstract methods
3. Add the framework to `TestGeneratorFactory`
4. Update the `TestFramework` type

```typescript
import { BaseTestGenerator } from './base-test-generator';
import type { TestFramework, TestType, ... } from '../interfaces';

export class NewFrameworkGenerator extends BaseTestGenerator {
  readonly framework: TestFramework = 'newframework' as TestFramework;

  generateTests(context: TestGenerationContext): string {
    // Framework-specific implementation
  }

  // Implement other abstract methods...
}
```

## Benefits

1. **Single Responsibility**: Each generator handles one framework
2. **Open/Closed**: Easy to add new frameworks without modifying existing code
3. **Testability**: Each generator can be tested in isolation
4. **Maintainability**: Framework-specific code is separated
5. **Caching**: Factory caches generators for performance
