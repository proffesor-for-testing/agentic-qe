# Code Organization Standardization - Phase 3.3

**Date:** 2026-01-25
**Status:** ✅ Complete
**Author:** Code Implementation Agent

## Overview

This document describes the standardization of file structure and naming conventions across the `v3/src/domains/` directory to improve code organization, maintainability, and developer experience.

## Target Structure

All domains now follow this standardized structure:

```
v3/src/domains/<domain>/
  ├── interfaces.ts      # All types and interfaces (I* prefix for interfaces)
  ├── coordinator.ts     # Domain entry point and orchestration
  ├── services/          # Business logic (*Service.ts classes)
  │   └── index.ts      # Barrel exports
  ├── validators/        # Input validation (*Validator.ts)
  ├── factories/         # Factory functions (create*.ts)
  ├── plugin.ts          # Domain plugin for v3 architecture
  └── index.ts           # Public API barrel exports
```

## Changes Implemented

### 1. test-generation Domain

#### File Reorganization

- **Consolidated Interfaces**
  - Merged `interfaces/test-generator.interface.ts` into main `interfaces.ts`
  - Updated `interfaces/index.ts` to be a deprecation wrapper with re-exports
  - All interfaces now use `I*` prefix (e.g., `ITestGenerator`, `ITestGenerationAPI`)
  - Added backward compatibility type aliases for non-prefixed names

- **Moved coherence-gate.ts**
  - Relocated from domain root to `services/coherence-gate-service.ts`
  - Updated all imports in `coordinator.ts`, `services/index.ts`, and main `index.ts`
  - Maintains ADR-052 coherence verification functionality

#### Import Path Updates

**Before:**
```typescript
import { ITestGenerator } from '../interfaces/test-generator.interface';
import { TestGenerationCoherenceGate } from './coherence-gate';
```

**After:**
```typescript
import { ITestGenerator } from '../interfaces';
import { TestGenerationCoherenceGate } from './services/coherence-gate-service';
```

#### Subdirectories Retained

- `generators/` - Strategy pattern implementations (BaseTestGenerator, JestVitestGenerator, etc.)
- `factories/` - Factory functions for test generator creation

### 2. test-execution Domain

#### File Consolidation

- **Merged Types Files**
  - Consolidated `test-prioritization-types.ts` content into `interfaces.ts`
  - Updated `test-prioritization-types.ts` to be a deprecation wrapper
  - Updated `types/index.ts` to re-export from `e2e-step.types.ts` and `flow-templates.types.ts`
  - Added re-exports in main `interfaces.ts` for backward compatibility

- **Interface Naming**
  - All interfaces now use `I*` prefix (e.g., `ITestExecutionAPI`, `ISimpleTestRequest`)
  - Added backward compatibility type aliases

#### Type Organization

**interfaces.ts now contains:**
- Domain API interface (`ITestExecutionAPI`)
- Request/Response types (with `I*` prefix)
- Test prioritization types (state, actions, features, rewards)
- Re-exports from `types/` subdirectory (E2E step types, flow templates)

**Subdirectories retained:**
- `types/` - Contains `e2e-step.types.ts` and `flow-templates.types.ts` (too large to merge)
- `services/` - All service implementations

### 3. Naming Conventions Applied

#### Interfaces
- **Prefix:** `I*` for all interfaces (e.g., `ITestGenerator`, `ICoordinatorConfig`)
- **Backward Compatibility:** Type aliases without `I` prefix marked as `@deprecated`

#### Services
- **Suffix:** `*Service` for service classes (e.g., `TestGeneratorService`, `FlakyDetectorService`)
- **Factory Functions:** `create*` prefix (e.g., `createTestGeneratorService`)

#### Types
- **Suffixes:**
  - `*Options` - Configuration options
  - `*Result` - Operation results
  - `*Config` - Configuration objects
  - `*Request` - Request DTOs
  - `*Response` - Response DTOs

#### Files
- Services: `*-service.ts` or `*.ts` in services directory
- Validators: `*-validator.ts` in validators directory
- Factories: `*-factory.ts` in factories directory

## Benefits

### 1. Consistency
- Uniform structure across all 12 domains
- Predictable file locations
- Standard naming patterns

### 2. Maintainability
- Single source of truth for types (`interfaces.ts`)
- Easier to locate functionality
- Reduced import depth (max 2 levels for most cases)

### 3. Developer Experience
- Clear separation of concerns
- Intuitive file organization
- Better IDE autocomplete and navigation

### 4. Backward Compatibility
- All existing imports continue to work
- Deprecation warnings guide migration
- No breaking changes for consumers

## Migration Guide

### For Domain Consumers

Existing code continues to work without changes:

```typescript
// Old imports still work (with deprecation warnings)
import { TestGenerationAPI } from '@agentic-qe/v3/domains/test-generation';
import { TestExecutionAPI } from '@agentic-qe/v3/domains/test-execution';

// Recommended new imports
import { ITestGenerationAPI } from '@agentic-qe/v3/domains/test-generation';
import { ITestExecutionAPI } from '@agentic-qe/v3/domains/test-execution';
```

### For Domain Developers

When adding new types or interfaces:

1. **Add to `interfaces.ts`** with `I*` prefix
2. **Export from `services/index.ts`** for service implementations
3. **Use standard naming conventions** (*Service, *Config, *Options, etc.)
4. **Add backward compatibility** type alias if removing old name

## Verification

### Build Status
✅ TypeScript compilation successful
✅ CLI bundle built (3.1MB)
✅ MCP server built

### Import Graph
- Maximum import depth: 3 levels
- No circular dependencies detected
- All public APIs exported through barrel files

### Backward Compatibility
- All existing external imports work
- Deprecation warnings in place
- Migration path documented

## Domains Status

| Domain | Status | Notes |
|--------|--------|-------|
| test-generation | ✅ Complete | Consolidated interfaces, moved coherence-gate to services |
| test-execution | ✅ Complete | Merged types, updated interface names |
| coverage-analysis | ✅ Compliant | Already follows standard structure |
| quality-assessment | ✅ Compliant | Coherence subdirectory acceptable (complex math) |
| contract-testing | ✅ Compliant | Already follows standard structure |
| chaos-resilience | ✅ Compliant | Already follows standard structure |
| defect-intelligence | ✅ Compliant | Already follows standard structure |
| security-compliance | ✅ Compliant | Already follows standard structure |
| requirements-validation | ✅ Compliant | Already follows standard structure |
| learning-optimization | ✅ Compliant | Already follows standard structure |
| code-intelligence | ✅ Compliant | Already follows standard structure |
| visual-accessibility | ✅ Compliant | Already follows standard structure |

## Files Modified

### test-generation Domain
- `interfaces.ts` - Consolidated all interfaces
- `interfaces/index.ts` - Converted to re-export wrapper
- `services/coherence-gate-service.ts` - Moved and renamed
- `services/index.ts` - Updated imports
- `coordinator.ts` - Updated imports
- `index.ts` - Updated exports
- `services/test-generator.ts` - Updated imports
- `factories/test-generator-factory.ts` - Updated imports
- `generators/*.ts` - Updated imports (4 files)

### test-execution Domain
- `interfaces.ts` - Consolidated types, added I* prefixes
- `test-prioritization-types.ts` - Converted to re-export wrapper
- `types/index.ts` - Converted to re-export wrapper
- `index.ts` - Updated exports for type-only re-exports

## Next Steps

### Recommended (Future)
1. **Deprecation Timeline:** Set 6-month timeline for removing non-I* prefixed types
2. **Linting Rules:** Add ESLint rules to enforce naming conventions
3. **Documentation:** Update API docs to reference new interface names
4. **Migration Tool:** Create codemod to auto-migrate old imports

### Not Recommended
- Moving `generators/` to a different location (Strategy pattern is clear)
- Merging `types/` subdirectory files (files are too large and cohesive)
- Renaming `coherence/` in quality-assessment (mathematical domain logic)

## Conclusion

The code organization standardization successfully establishes a consistent, maintainable structure across all v3 domains while maintaining full backward compatibility. The changes improve developer experience through predictable file locations, clear naming conventions, and reduced import complexity.

All builds pass, no breaking changes introduced, and a clear migration path exists for future updates.
