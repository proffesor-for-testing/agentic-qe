# Domain Structure Guide

Quick reference for v3 domain organization and naming conventions.

## Standard Domain Structure

```
v3/src/domains/<domain-name>/
├── interfaces.ts           # All types and interfaces
├── coordinator.ts          # Domain orchestration
├── plugin.ts              # Plugin registration
├── index.ts               # Public API exports
├── services/              # Business logic
│   ├── index.ts          # Service exports
│   ├── *-service.ts      # Service implementations
│   └── ...
├── validators/            # Input validation (optional)
│   ├── index.ts
│   └── *-validator.ts
└── factories/             # Factory functions (optional)
    ├── index.ts
    └── create-*.ts
```

## Naming Conventions

### Interfaces & Types

```typescript
// ✅ DO: Use I* prefix for interfaces
export interface ITestGenerator { ... }
export interface ICoordinatorConfig { ... }
export interface ITestExecutionAPI { ... }

// ✅ DO: Use descriptive suffixes for types
export type TestGeneratorOptions = { ... }
export type GenerateTestsRequest = { ... }
export type TestRunResult = { ... }
export type ModelRouterConfig = { ... }

// ❌ DON'T: Mix naming styles
export interface TestGenerator { ... }  // Missing I prefix
export type ITestOptions = { ... }      // Type shouldn't have I prefix
```

### Services

```typescript
// ✅ DO: Use *Service suffix for service classes
export class TestGeneratorService implements ITestGenerationService { ... }
export class CoverageAnalyzerService implements ICoverageAnalyzer { ... }

// ✅ DO: Use create* prefix for factory functions
export function createTestGeneratorService(config: Config): TestGeneratorService { ... }
export function createCoordinator(deps: Dependencies): ICoordinator { ... }

// ❌ DON'T: Inconsistent naming
export class TestGeneration { ... }        // Missing Service suffix
export function makeGenerator() { ... }    // Use create* prefix
```

### Files

```typescript
// ✅ DO: Consistent file naming
services/test-generator-service.ts
services/coverage-analyzer-service.ts
validators/input-validator.ts
factories/create-coordinator.ts

// ❌ DON'T: Inconsistent extensions or naming
services/testGenerator.ts
services/coverage.service.ts
validators/validate.ts
```

## Import Patterns

### Importing from a Domain

```typescript
// ✅ DO: Import from domain index (public API)
import {
  ITestGenerationAPI,
  TestGeneratorService,
  createTestGeneratorService,
} from '@agentic-qe/v3/domains/test-generation';

// ✅ DO: Import types separately if needed
import type {
  ITestGenerator,
  TestFramework,
} from '@agentic-qe/v3/domains/test-generation';

// ❌ DON'T: Deep imports bypass public API
import { TestGeneratorService } from '@agentic-qe/v3/domains/test-generation/services/test-generator';
```

### Within a Domain

```typescript
// ✅ DO: Relative imports within domain
import type { ITestGenerator } from '../interfaces';
import { TestGeneratorService } from './test-generator-service';
import { createValidator } from '../validators';

// ✅ DO: Import from subdirectory index
import { PatternMatcherService } from '../services';
import { createTestGenerator } from '../factories';
```

## interfaces.ts Structure

Every domain's `interfaces.ts` should follow this structure:

```typescript
/**
 * Domain Interfaces
 * All types and interfaces for the <domain-name> domain
 */

import { Result } from '../../shared/types';

// ============================================================================
// Domain API
// ============================================================================

/** Main domain API interface */
export interface I<Domain>API {
  // Public methods
}

// ============================================================================
// Request/Response Types
// ============================================================================

export interface I<Operation>Request { ... }
export interface I<Operation>Response { ... }
export interface I<Operation>Result { ... }

// ============================================================================
// Service Interfaces
// ============================================================================

export interface I<Service>Service { ... }
export interface I<Service>Config { ... }

// ============================================================================
// Domain-Specific Types
// ============================================================================

export type <Domain>Options = { ... }
export type <Domain>Status = 'active' | 'idle' | 'error';

// ============================================================================
// Backward Compatibility (if needed)
// ============================================================================

/** @deprecated Use I<Interface> */
export type <Interface> = I<Interface>;
```

## index.ts Structure

Every domain's `index.ts` should follow this structure:

```typescript
/**
 * <Domain> Domain
 * Public API exports
 */

// ============================================================================
// Plugin (Primary Export)
// ============================================================================

export {
  <Domain>Plugin,
  create<Domain>Plugin,
} from './plugin';

// ============================================================================
// Coordinator
// ============================================================================

export {
  <Domain>Coordinator,
  type I<Domain>Coordinator,
} from './coordinator';

// ============================================================================
// Services
// ============================================================================

export {
  <Service>Service,
  create<Service>Service,
  type I<Service>Service,
} from './services/<service>';

// ============================================================================
// Interfaces (Types Only)
// ============================================================================

export type {
  I<Domain>API,
  I<Operation>Request,
  I<Operation>Result,
} from './interfaces';
```

## Common Patterns

### Service with Dependency Injection

```typescript
// interfaces.ts
export interface ITestGeneratorService {
  generateTests(request: IGenerateTestsRequest): Promise<Result<Tests, Error>>;
}

export interface TestGeneratorServiceConfig {
  framework: TestFramework;
  timeout: number;
}

export interface TestGeneratorServiceDeps {
  memory: IMemoryBackend;
  modelRouter: IModelRouter;
}

// services/test-generator-service.ts
export class TestGeneratorService implements ITestGeneratorService {
  constructor(
    private readonly config: TestGeneratorServiceConfig,
    private readonly deps: TestGeneratorServiceDeps
  ) {}

  async generateTests(request: IGenerateTestsRequest): Promise<Result<Tests, Error>> {
    // Implementation
  }
}

// Factory function
export function createTestGeneratorService(
  config: TestGeneratorServiceConfig,
  deps: TestGeneratorServiceDeps
): TestGeneratorService {
  return new TestGeneratorService(config, deps);
}
```

### Coordinator Pattern

```typescript
// interfaces.ts
export interface I<Domain>Coordinator {
  initialize(): Promise<void>;
  process(request: Request): Promise<Result>;
  shutdown(): Promise<void>;
}

// coordinator.ts
export class <Domain>Coordinator implements I<Domain>Coordinator {
  constructor(
    private readonly services: {
      service1: IService1;
      service2: IService2;
    }
  ) {}

  async initialize(): Promise<void> { ... }
  async process(request: Request): Promise<Result> { ... }
  async shutdown(): Promise<void> { ... }
}
```

## Quick Checklist

When adding a new domain or modifying an existing one:

- [ ] `interfaces.ts` contains all types with `I*` prefix for interfaces
- [ ] Services use `*Service` suffix
- [ ] Factory functions use `create*` prefix
- [ ] File names use kebab-case
- [ ] Service files in `services/` directory
- [ ] Public API exported through `index.ts`
- [ ] No deep imports from outside the domain
- [ ] Backward compatibility aliases if renaming
- [ ] TSDoc comments on public interfaces
- [ ] Barrel exports in subdirectory `index.ts` files

## Examples

See these domains for reference implementations:

- **test-generation** - Complex domain with generators, factories, and coherence gate
- **test-execution** - Multiple type files consolidated into interfaces.ts
- **coverage-analysis** - Standard structure with services only
- **quality-assessment** - Includes coherence subdirectory for mathematical logic

## Questions?

See `/workspaces/agentic-qe/v3/docs/CODE-ORGANIZATION-STANDARDIZATION.md` for detailed migration information.
