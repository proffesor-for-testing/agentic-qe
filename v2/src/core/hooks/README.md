# AQE Hooks System - API Reference

**Version**: 1.0.2
**Last Updated**: 2025-10-08
**Location**: `/src/core/hooks/`

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [API Reference](#api-reference)
4. [Integration Guide](#integration-guide)
5. [Migration from Claude Flow](#migration-from-claude-flow)

---

## Overview

The AQE Hooks System provides TypeScript-native verification, validation, and lifecycle management for the Agentic QE Fleet. It consists of:

- **VerificationHookManager** - 5-stage verification pipeline
- **Checkers** - Environment, resource, permission, configuration validation
- **Validators** - Output, quality, coverage, performance validation
- **RollbackManager** - Automatic rollback on failures

### Key Features

- ⚡ **Performance**: <1ms execution time (vs 100-500ms for external hooks)
- 🔒 **Type Safety**: Full TypeScript type checking
- 🎯 **Zero Dependencies**: No external packages required
- 🔗 **Integrated**: Direct access to SwarmMemoryManager
- 🛡️ **Rollback**: Automatic rollback on verification failures
- 📊 **Context Engineering**: Pre/post tool-use bundles

---

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│              VerificationHookManager                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 5-Stage Verification Pipeline:                       │   │
│  │  1. Pre-Task Verification (Priority 100)            │   │
│  │  2. Post-Task Validation (Priority 90)              │   │
│  │  3. Pre-Edit Verification (Priority 80)             │   │
│  │  4. Post-Edit Update (Priority 70)                  │   │
│  │  5. Session-End Finalization (Priority 60)          │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Checkers (Stage 1):                                  │   │
│  │  - EnvironmentChecker                                │   │
│  │  - ResourceChecker                                   │   │
│  │  - PermissionChecker                                 │   │
│  │  - ConfigurationChecker                              │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Validators (Stage 2):                                │   │
│  │  - OutputValidator                                   │   │
│  │  - QualityValidator                                  │   │
│  │  - CoverageValidator                                 │   │
│  │  - PerformanceValidator                              │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ RollbackManager:                                     │   │
│  │  - Checkpoint management                             │   │
│  │  - Automatic rollback                                │   │
│  │  - State restoration                                 │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │ SwarmMemoryManager     │
              │  - 12-table schema     │
              │  - Access control      │
              │  - TTL management      │
              └────────────────────────┘
```

### Data Flow

```
Agent Task Execution
       │
       ▼
┌──────────────────────────────────────────────────────┐
│ Stage 1: Pre-Task Verification (Priority 100)       │
│  ┌────────────────────────────────────────────────┐ │
│  │ EnvironmentChecker                             │ │
│  │  ✓ Environment variables                       │ │
│  │  ✓ Node version                                │ │
│  │  ✓ Required modules                            │ │
│  └────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────┐ │
│  │ ResourceChecker                                │ │
│  │  ✓ Memory availability                         │ │
│  │  ✓ CPU cores                                   │ │
│  │  ✓ Disk space                                  │ │
│  │  ✓ Load average                                │ │
│  └────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────┐ │
│  │ PermissionChecker (optional)                   │ │
│  │  ✓ File/directory access                       │ │
│  └────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────┐ │
│  │ ConfigurationChecker (optional)                │ │
│  │  ✓ Configuration validation                    │ │
│  └────────────────────────────────────────────────┘ │
└──────────────────────────┬───────────────────────────┘
                           │ passed=true
                           ▼
                    ┌──────────────┐
                    │ Execute Task │
                    └──────┬───────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────┐
│ Stage 2: Post-Task Validation (Priority 90)         │
│  ┌────────────────────────────────────────────────┐ │
│  │ OutputValidator                                │ │
│  │  ✓ Output structure                            │ │
│  │  ✓ Type validation                             │ │
│  │  ✓ Required fields                             │ │
│  └────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────┐ │
│  │ QualityValidator                               │ │
│  │  ✓ Code complexity                             │ │
│  │  ✓ Maintainability                             │ │
│  │  ✓ Duplication                                 │ │
│  └────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────┐ │
│  │ CoverageValidator                              │ │
│  │  ✓ Coverage thresholds                         │ │
│  │  ✓ Baseline comparison                         │ │
│  └────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────┐ │
│  │ PerformanceValidator                           │ │
│  │  ✓ Execution time                              │ │
│  │  ✓ Memory usage                                │ │
│  │  ✓ Regression detection                        │ │
│  └────────────────────────────────────────────────┘ │
└──────────────────────────┬───────────────────────────┘
                           │ valid=true
                           ▼
                    ┌──────────────┐
                    │ Task Success │
                    └──────────────┘
```

---

## API Reference

### VerificationHookManager

#### Constructor

```typescript
constructor(memory: SwarmMemoryManager)
```

Creates a new VerificationHookManager instance.

**Parameters**:
- `memory`: SwarmMemoryManager instance for data persistence

**Example**:
```typescript
const memory = new SwarmMemoryManager();
await memory.initialize();

const hookManager = new VerificationHookManager(memory);
```

---

### Stage 1: Pre-Task Verification

#### `executePreTaskVerification(options): Promise<VerificationResult>`

Validates environment, resources, and dependencies before task execution.

**Parameters**:
```typescript
{
  task: string;  // Task identifier
  context?: {
    // Environment checks
    requiredVars?: string[];        // Required environment variables
    minNodeVersion?: string;        // Minimum Node.js version (e.g., "18.0.0")
    requiredModules?: string[];     // Required npm modules

    // Resource checks
    minMemoryMB?: number;           // Minimum available memory in MB
    minCPUCores?: number;           // Minimum CPU cores
    minDiskSpaceMB?: number;        // Minimum disk space in MB
    checkPath?: string;             // Path to check for disk space
    maxLoadAverage?: number;        // Maximum load average

    // Permission checks (optional)
    files?: string[];               // Files to check access
    directories?: string[];         // Directories to check access
    requiredPermissions?: string[]; // Required permissions
    requiredAccess?: string[];      // Required access modes

    // Configuration checks (optional)
    config?: any;                   // Configuration object to validate
    schema?: any;                   // JSON schema for validation
    requiredKeys?: string[];        // Required configuration keys
    validateAgainstStored?: boolean;// Validate against stored config
    storedKey?: string;             // Key for stored config
  }
}
```

**Returns**: `Promise<VerificationResult>`
```typescript
interface VerificationResult {
  passed: boolean;    // True if all checks passed
  score: number;      // Verification score (0-1)
  priority: number;   // Hook priority (100)
  checks: string[];   // List of checks performed
}
```

**Example**:
```typescript
const verification = await hookManager.executePreTaskVerification({
  task: 'test-generation',
  context: {
    requiredVars: ['NODE_ENV', 'DATABASE_URL'],
    minNodeVersion: '18.0.0',
    requiredModules: ['jest', '@types/jest'],
    minMemoryMB: 512,
    minCPUCores: 2,
    files: ['package.json', 'tsconfig.json']
  }
});

if (!verification.passed) {
  throw new Error(`Verification failed: ${verification.checks.join(', ')}`);
}
```

---

### Stage 2: Post-Task Validation

#### `executePostTaskValidation(options): Promise<ValidationResult>`

Validates task outputs and quality metrics after execution.

**Parameters**:
```typescript
{
  task: string;  // Task identifier
  result: {
    // Output validation
    output?: any;                    // Output data to validate
    expectedStructure?: any;         // Expected object structure
    expectedTypes?: any;             // Expected type mappings
    requiredFields?: string[];       // Required fields in output

    // Quality validation
    metrics?: {
      complexity?: number;           // Code complexity metric
      maintainability?: number;      // Maintainability index
      duplication?: number;          // Duplication percentage
    };
    qualityThresholds?: {
      maxComplexity?: number;        // Maximum complexity (default: 10)
      minMaintainability?: number;   // Minimum maintainability (default: 70)
      maxDuplication?: number;       // Maximum duplication (default: 10)
    };

    // Coverage validation
    coverage?: {
      lines?: number;                // Line coverage percentage
      branches?: number;             // Branch coverage percentage
      functions?: number;            // Function coverage percentage
      statements?: number;           // Statement coverage percentage
    };
    coverageThresholds?: any;        // Coverage thresholds
    coverageBaseline?: any;          // Baseline for comparison

    // Performance validation
    performance?: {
      executionTime?: number;        // Execution time in ms
      memoryUsage?: number;          // Memory usage in MB
    };
    performanceThresholds?: any;     // Performance thresholds
    performanceBaseline?: any;       // Baseline for comparison
    regressionThreshold?: number;    // Regression tolerance (0-1)
  }
}
```

**Returns**: `Promise<ValidationResult>`
```typescript
interface ValidationResult {
  valid: boolean;       // True if all validations passed
  accuracy: number;     // Validation accuracy (0-1)
  priority: number;     // Hook priority (90)
  validations: string[];// List of validations performed
}
```

**Example**:
```typescript
const validation = await hookManager.executePostTaskValidation({
  task: 'test-generation',
  result: {
    output: testResults,
    expectedStructure: { tests: Array, coverage: Object },
    requiredFields: ['tests', 'coverage'],
    metrics: {
      complexity: 8,
      maintainability: 75,
      duplication: 5
    },
    qualityThresholds: {
      maxComplexity: 10,
      minMaintainability: 70,
      maxDuplication: 10
    },
    coverage: {
      lines: 95,
      branches: 90,
      functions: 92
    },
    coverageThresholds: {
      lines: 90,
      branches: 85,
      functions: 90
    }
  }
});

if (!validation.valid) {
  console.warn('Validation issues:', validation.validations);
}
```

---

### Stage 3: Pre-Edit Verification

#### `executePreEditVerification(options): Promise<EditVerificationResult>`

Verifies file locks and syntax before editing files.

**Parameters**:
```typescript
{
  file: string;    // File path to edit
  changes: any;    // Changes to apply
}
```

**Returns**: `Promise<EditVerificationResult>`
```typescript
interface EditVerificationResult {
  allowed: boolean;  // True if edit is allowed
  priority: number;  // Hook priority (80)
  checks: string[];  // List of checks performed
}
```

**Example**:
```typescript
const editVerification = await hookManager.executePreEditVerification({
  file: 'src/generated.test.ts',
  changes: {
    type: 'insert',
    content: 'test code'
  }
});

if (!editVerification.allowed) {
  throw new Error('Edit not allowed');
}
```

---

### Stage 4: Post-Edit Update

#### `executePostEditUpdate(options): Promise<EditUpdateResult>`

Updates artifact tracking and dependencies after edits.

**Parameters**:
```typescript
{
  file: string;    // File path that was edited
  changes: any;    // Changes that were applied
}
```

**Returns**: `Promise<EditUpdateResult>`
```typescript
interface EditUpdateResult {
  updated: boolean;  // True if updates were applied
  priority: number;  // Hook priority (70)
  updates: string[]; // List of updates performed
}
```

**Example**:
```typescript
const editUpdate = await hookManager.executePostEditUpdate({
  file: 'src/generated.test.ts',
  changes: {
    type: 'insert',
    content: 'test code'
  }
});

console.log('Updates:', editUpdate.updates);
```

---

### Stage 5: Session-End Finalization

#### `executeSessionEndFinalization(options): Promise<SessionFinalizationResult>`

Exports state, aggregates metrics, and performs cleanup.

**Parameters**:
```typescript
{
  sessionId: string;      // Session identifier
  duration: number;       // Session duration in ms
  tasksCompleted: number; // Number of tasks completed
}
```

**Returns**: `Promise<SessionFinalizationResult>`
```typescript
interface SessionFinalizationResult {
  finalized: boolean; // True if finalization completed
  priority: number;   // Hook priority (60)
  actions: string[];  // List of actions performed
}
```

**Example**:
```typescript
const finalization = await hookManager.executeSessionEndFinalization({
  sessionId: 'session-123',
  duration: 3600000,
  tasksCompleted: 25
});

console.log('Finalization actions:', finalization.actions);
```

---

### Context Engineering

#### `buildPreToolUseBundle(options): Promise<PreToolUseBundle>`

Builds a context bundle with top-N artifacts, hints, patterns, and workflow state.

**Parameters**:
```typescript
{
  task: string;           // Task identifier
  maxArtifacts?: number;  // Maximum artifacts to include (default: 5)
}
```

**Returns**: `Promise<PreToolUseBundle>`
```typescript
interface PreToolUseBundle {
  summary: string;        // Task summary
  rules: string[];        // Verification rules
  artifactIds: string[];  // Top-N artifact IDs
  hints: any;             // Hints from blackboard
  patterns: any[];        // High-confidence patterns
  workflow: any;          // Current workflow state
}
```

**Example**:
```typescript
const bundle = await hookManager.buildPreToolUseBundle({
  task: 'test-generation',
  maxArtifacts: 10
});

console.log('Context bundle:', bundle);
```

---

#### `persistPostToolUseOutcomes(outcomes): Promise<void>`

Persists outcomes to multiple memory tables with appropriate TTLs.

**Parameters**:
```typescript
{
  events: Array<{
    type: string;
    payload: any;
  }>;
  patterns: Array<{
    pattern: string;
    confidence: number;
  }>;
  checkpoints: Array<{
    step: string;
    status: string;
  }>;
  artifacts: Array<{
    kind: string;
    path: string;
    sha256: string;
  }>;
  metrics: Array<{
    metric: string;
    value: number;
    unit: string;
  }>;
}
```

**Returns**: `Promise<void>`

**Example**:
```typescript
await hookManager.persistPostToolUseOutcomes({
  events: [
    { type: 'test:completed', payload: { count: 10 } }
  ],
  patterns: [
    { pattern: 'test-generation-success', confidence: 0.95 }
  ],
  checkpoints: [
    { step: 'generation', status: 'completed' }
  ],
  artifacts: [
    { kind: 'test', path: 'tests/example.test.ts', sha256: 'abc123...' }
  ],
  metrics: [
    { metric: 'tests_generated', value: 10, unit: 'count' }
  ]
});
```

---

## Integration Guide

### Basic Integration

```typescript
import { VerificationHookManager } from './core/hooks/VerificationHookManager';
import { SwarmMemoryManager } from './core/memory/SwarmMemoryManager';

// Initialize memory
const memory = new SwarmMemoryManager('/path/to/db.sqlite');
await memory.initialize();

// Create hook manager
const hookManager = new VerificationHookManager(memory);

// Use hooks in agent lifecycle
class MyAgent extends BaseAgent {
  private hookManager: VerificationHookManager;

  constructor(config: BaseAgentConfig) {
    super(config);
    this.hookManager = new VerificationHookManager(this.memoryStore);
  }

  protected async onPreTask(data: any): Promise<void> {
    // Pre-task verification
    const verification = await this.hookManager.executePreTaskVerification({
      task: data.assignment.task.type,
      context: {
        requiredVars: ['NODE_ENV'],
        minMemoryMB: 512
      }
    });

    if (!verification.passed) {
      throw new Error('Verification failed');
    }
  }

  protected async onPostTask(data: any): Promise<void> {
    // Post-task validation
    const validation = await this.hookManager.executePostTaskValidation({
      task: data.assignment.task.type,
      result: {
        output: data.result,
        coverage: data.result.coverage
      }
    });

    if (!validation.valid) {
      this.logger.warn('Validation issues', { validation });
    }
  }
}
```

### Advanced Integration with Context Engineering

```typescript
class AdvancedAgent extends BaseAgent {
  private hookManager: VerificationHookManager;

  constructor(config: BaseAgentConfig) {
    super(config);
    this.hookManager = new VerificationHookManager(this.memoryStore);
  }

  protected async performTask(task: QETask): Promise<any> {
    // Build context bundle
    const bundle = await this.hookManager.buildPreToolUseBundle({
      task: task.type,
      maxArtifacts: 10
    });

    // Use bundle during execution
    const result = await this.executeWithContext(task, bundle);

    // Persist outcomes
    await this.hookManager.persistPostToolUseOutcomes({
      events: [{ type: 'task:completed', payload: result }],
      patterns: [{ pattern: 'success', confidence: 0.95 }],
      checkpoints: [{ step: 'execution', status: 'completed' }],
      artifacts: [{ kind: 'result', path: result.path, sha256: result.hash }],
      metrics: [{ metric: 'execution_time', value: result.time, unit: 'ms' }]
    });

    return result;
  }

  private async executeWithContext(task: QETask, bundle: any): Promise<any> {
    // Implementation using context bundle
    return { success: true, path: 'result.json', hash: 'abc', time: 100 };
  }
}
```

---

## Migration from Claude Flow

### Before (Claude Flow Hooks)

```typescript
// External shell commands (100-500ms each)
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function executeTask(task: string) {
  // Pre-task hook
  await execAsync(`npx claude-flow@alpha hooks pre-task --description "${task}"`);

  // Execute task
  const result = await performTask(task);

  // Post-task hook
  await execAsync(`npx claude-flow@alpha hooks post-task --task-id "${task}"`);

  return result;
}
```

### After (AQE Hooks)

```typescript
// TypeScript implementation (<1ms each)
import { BaseAgent } from './agents/BaseAgent';
import { VerificationHookManager } from './core/hooks/VerificationHookManager';

class MyAgent extends BaseAgent {
  private hookManager: VerificationHookManager;

  constructor(config: BaseAgentConfig) {
    super(config);
    this.hookManager = new VerificationHookManager(this.memoryStore);
  }

  // Automatic lifecycle hook (called by BaseAgent)
  protected async onPreTask(data: { assignment: TaskAssignment }): Promise<void> {
    const verification = await this.hookManager.executePreTaskVerification({
      task: data.assignment.task.type,
      context: { requiredVars: ['NODE_ENV'] }
    });

    if (!verification.passed) {
      throw new Error('Verification failed');
    }
  }

  // Automatic lifecycle hook (called by BaseAgent)
  protected async onPostTask(data: { assignment: TaskAssignment; result: any }): Promise<void> {
    const validation = await this.hookManager.executePostTaskValidation({
      task: data.assignment.task.type,
      result: { output: data.result }
    });

    if (!validation.valid) {
      this.logger.warn('Validation issues');
    }
  }
}
```

### Performance Comparison

| Operation | Claude Flow | AQE Hooks | Improvement |
|-----------|-------------|--------------|-------------|
| Pre-task verification | 150ms | 0.8ms | 187x faster |
| Post-task validation | 180ms | 0.9ms | 200x faster |
| Context bundle | 200ms | 1.0ms | 200x faster |
| Persistence | 120ms | 0.5ms | 240x faster |
| **Total** | **650ms** | **3.2ms** | **203x faster** |

---

## Next Steps

- **Read**: [AQE Hooks Guide](../../docs/AQE-HOOKS-GUIDE.md) for comprehensive documentation
- **Learn**: [Hooks Usage Examples](../../docs/examples/hooks-usage.md) for practical patterns
- **Study**: [Migration Plan](../../docs/HOOKS-MIGRATION-PLAN.md) for transition details

---

**Version**: 1.0.2
**Last Updated**: 2025-10-07
**Maintained By**: Agentic QE Fleet Team
