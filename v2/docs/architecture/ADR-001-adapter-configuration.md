# ADR-001: Explicit Adapter Configuration

**Status**: Accepted
**Date**: 2025-11-17
**Authors**: Agentic QE Architecture Team
**Related Issues**: #52

## Context

The AgentDB adapter architecture had a critical flaw: runtime adapter selection with silent fallbacks to mock adapters. This created a risk where production systems could unknowingly use mock (in-memory) adapters instead of real database adapters, leading to data loss and unreliable behavior.

### Previous Architecture Problems

1. **Silent Fallbacks**: If real AgentDB initialization failed, the system would silently fall back to mock adapter
2. **Runtime Detection**: Adapter type was determined at runtime based on environment variables and package availability
3. **No Validation**: Configuration errors were not detected until initialization
4. **Ambiguous Errors**: Failure messages didn't provide clear troubleshooting guidance
5. **Production Risk**: No guarantee that production systems were using real database

### Example of Problematic Code

```typescript
// Old approach - PROBLEMATIC
try {
  this.adapter = createRealAgentDBAdapter({ dbPath: "..." });
  await this.adapter.initialize();
} catch (error) {
  // SILENT FALLBACK - DANGEROUS!
  console.warn("Real adapter failed, using mock");
  this.adapter = createMockAdapter();
}
```

## Decision

We will implement **explicit adapter configuration** with **fail-fast validation** to eliminate silent fallbacks and ensure production systems never accidentally use mock adapters.

### Key Principles

1. **Explicit Over Implicit**: Always require explicit adapter type configuration
2. **Fail-Fast**: Throw errors immediately on misconfiguration, don't continue with degraded behavior
3. **Clear Errors**: Provide actionable error messages with troubleshooting steps
4. **Type Safety**: Use TypeScript enums and strict types to prevent configuration mistakes
5. **Validation**: Validate configuration at startup before initialization

### New Architecture Components

#### 1. AdapterConfig (src/core/memory/AdapterConfig.ts)

Defines explicit adapter configuration with validation:

```typescript
export enum AdapterType {
  REAL = 'real',    // Production AgentDB adapter
  MOCK = 'mock',    // Mock adapter for testing
  AUTO = 'auto'     // DEPRECATED - auto-detection
}

export interface AdapterConfig {
  type: AdapterType;          // Required explicit type
  dbPath?: string;            // Required for REAL
  dimension?: number;         // Default: 384
  failFast?: boolean;         // Default: true
  validateOnStartup?: boolean; // Default: true
}
```

#### 2. AdapterFactory (src/core/memory/AdapterFactory.ts)

Creates adapters with strict type enforcement:

```typescript
export class AdapterFactory {
  static async create(config: AdapterConfig): Promise<AdapterCreationResult> {
    // Validate configuration
    AdapterConfigValidator.validateOrThrow(config);

    // Create adapter (fail-fast on errors)
    const adapter = await this.createAdapter(config);

    // Validate adapter functionality
    await this.validate(adapter);

    return { adapter, type: config.type, config };
  }
}
```

#### 3. AdapterConfigValidator

Validates configuration before initialization:

```typescript
export class AdapterConfigValidator {
  static validate(config: AdapterConfig): ValidationResult {
    const errors: string[] = [];

    // Check required fields
    if (config.type === AdapterType.REAL && !config.dbPath) {
      errors.push('dbPath is required for AdapterType.REAL');
    }

    // Check for deprecated usage
    if (config.type === AdapterType.AUTO) {
      warnings.push('AUTO is deprecated, use explicit REAL or MOCK');
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}
```

### Configuration Methods

#### Production Configuration

```typescript
import { AdapterConfigHelper, AdapterType } from './AdapterConfig';

// Explicit production configuration
const config = AdapterConfigHelper.forProduction('.agentic-qe/agentdb.db');
// Returns: { type: AdapterType.REAL, dbPath: '...', failFast: true }
```

#### Test Configuration

```typescript
// Explicit test configuration
const config = AdapterConfigHelper.forTesting();
// Returns: { type: AdapterType.MOCK, failFast: false }
```

#### Environment-Based Configuration

```bash
# Explicit environment variable
export AQE_ADAPTER_TYPE=real
export AGENTDB_PATH=.agentic-qe/agentdb.db

# Or for testing
export AQE_ADAPTER_TYPE=mock
```

```typescript
// Code reads from environment
const config = AdapterConfigHelper.fromEnvironment();
```

## Consequences

### Positive

1. **No Silent Failures**: Production systems fail immediately if adapter misconfigured
2. **Clear Intent**: Configuration explicitly declares whether to use real or mock adapter
3. **Better Errors**: Validation provides actionable error messages with troubleshooting steps
4. **Type Safety**: TypeScript enums prevent invalid adapter types
5. **Testability**: Tests must explicitly configure mock adapter, can't accidentally use real database
6. **Debuggability**: Logs clearly show which adapter was created and why

### Negative

1. **Breaking Change**: Existing code relying on silent fallbacks will break (INTENTIONAL)
2. **More Verbose**: Requires explicit configuration instead of auto-detection
3. **Migration Required**: Existing systems need to add explicit adapter configuration

### Migration Path

#### Legacy Support (Temporary)

The system provides **deprecation warnings** for legacy usage:

```typescript
// Legacy: dbPath in AgentDBConfig (DEPRECATED)
const manager = createAgentDBManager({ dbPath: '...' });
// Warning: "Using legacy dbPath configuration. Migrate to adapter config."

// Legacy: AQE_USE_MOCK_AGENTDB environment variable (DEPRECATED)
export AQE_USE_MOCK_AGENTDB=true
// Warning: "AQE_USE_MOCK_AGENTDB is deprecated. Use AQE_ADAPTER_TYPE=mock"
```

#### Recommended Migration

```typescript
// OLD (DEPRECATED)
const manager = createAgentDBManager({
  dbPath: '.agentic-qe/agentdb.db'
});

// NEW (RECOMMENDED)
import { AdapterType } from './AdapterConfig';

const manager = createAgentDBManager({
  adapter: {
    type: AdapterType.REAL,
    dbPath: '.agentic-qe/agentdb.db',
    failFast: true,
    validateOnStartup: true
  }
});
```

## Implementation

### Files Modified

- `src/core/memory/AdapterConfig.ts` (NEW) - Adapter configuration and validation
- `src/core/memory/AdapterFactory.ts` (NEW) - Adapter creation with fail-fast
- `src/core/memory/AgentDBManager.ts` (MODIFIED) - Use explicit configuration
- `src/core/memory/index.ts` (MODIFIED) - Export new configuration types

### Error Handling Flow

```
1. Configuration Provided
   ↓
2. AdapterConfigValidator.validate()
   ↓ (errors found)
   ✗ Throw AdapterConfigurationError with:
     - List of validation errors
     - Troubleshooting steps
     - Configuration examples

   ↓ (valid)
3. AdapterFactory.create()
   ↓ (creation fails)
   ✗ Throw Error with:
     - Root cause
     - Current configuration
     - Troubleshooting guide
     - Link to documentation

   ↓ (success)
4. AdapterFactory.validate()
   ↓ (validation fails)
   ✗ Throw Error with adapter validation details

   ↓ (success)
5. Adapter Ready
```

### Example Error Messages

```
AdapterConfigurationError: Invalid adapter configuration:
  - dbPath is required for AdapterType.REAL
  - Invalid dimension: must be greater than 0

Failed to initialize AgentDBManager:
  agentdb package not installed

Current configuration:
  Adapter Type: real
  Database Path: .agentic-qe/agentdb.db
  Fail Fast: true

Troubleshooting:
  1. For production: Set AQE_ADAPTER_TYPE=real and ensure agentdb is installed
  2. For testing: Set AQE_ADAPTER_TYPE=mock
  3. Check database file permissions and disk space
  4. See docs/architecture/adapters.md for configuration guide
```

## Testing Strategy

### Unit Tests

```typescript
describe('AdapterConfig', () => {
  it('should fail-fast on missing dbPath for REAL adapter', () => {
    const config = { type: AdapterType.REAL };
    expect(() => AdapterConfigValidator.validateOrThrow(config))
      .toThrow('dbPath is required');
  });

  it('should allow MOCK adapter without dbPath', () => {
    const config = { type: AdapterType.MOCK };
    expect(() => AdapterConfigValidator.validateOrThrow(config))
      .not.toThrow();
  });
});
```

### Integration Tests

```typescript
describe('AgentDBManager', () => {
  it('should throw on invalid adapter configuration', async () => {
    const manager = new AgentDBManager({
      adapter: { type: AdapterType.REAL } // Missing dbPath
    });

    await expect(manager.initialize()).rejects.toThrow(AdapterConfigurationError);
  });

  it('should use MOCK adapter when explicitly configured', async () => {
    const manager = new AgentDBManager({
      adapter: { type: AdapterType.MOCK }
    });

    await manager.initialize();
    // Verify mock adapter is used
  });
});
```

## Documentation

### User Guide

Location: `docs/guides/adapter-configuration.md`

Topics:
- Why explicit configuration matters
- How to configure for production
- How to configure for testing
- Environment variable reference
- Migration from legacy configuration
- Troubleshooting common errors

### API Reference

Location: `docs/api/adapter-config.md`

Topics:
- AdapterConfig interface
- AdapterType enum
- AdapterConfigHelper utilities
- AdapterFactory methods
- Error types and handling

## Alternatives Considered

### 1. Keep Silent Fallbacks with Warnings

**Rejected**: Silent fallbacks are inherently unsafe. Even with warnings, production systems could unknowingly use mock adapters.

### 2. Auto-Detection Only

**Rejected**: Auto-detection hides configuration errors until runtime and makes debugging difficult.

### 3. Adapter Type as String

**Rejected**: TypeScript enums provide better type safety and IDE autocomplete.

## References

- Issue #52: Adapter Architecture Fix
- AgentDB Documentation: https://github.com/ruvnet/agentdb
- TypeScript Enum Best Practices
- Fail-Fast Design Pattern

## Appendix: Configuration Examples

### Production Deployment

```typescript
import { createAgentDBManager, AdapterConfigHelper } from '@/core/memory';

const manager = createAgentDBManager({
  adapter: AdapterConfigHelper.forProduction('/data/agentdb.db'),
  enableQUICSync: false,
  enableLearning: true,
  cacheSize: 10000
});

await manager.initialize();
```

### Docker Container

```dockerfile
ENV AQE_ADAPTER_TYPE=real
ENV AGENTDB_PATH=/data/agentdb.db
ENV AGENTDB_FAIL_FAST=true
```

### Kubernetes ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: agentdb-config
data:
  AQE_ADAPTER_TYPE: "real"
  AGENTDB_PATH: "/data/agentdb.db"
  AGENTDB_FAIL_FAST: "true"
```

### Unit Tests

```typescript
import { AdapterConfigHelper } from '@/core/memory';

describe('MyService', () => {
  let manager: AgentDBManager;

  beforeEach(async () => {
    manager = createAgentDBManager({
      adapter: AdapterConfigHelper.forTesting()
    });
    await manager.initialize();
  });

  afterEach(async () => {
    await manager.close();
  });
});
```

---

**Decision**: Accepted
**Implementation Status**: Complete
**Next Review**: 2025-12-17 (30 days)
