# Code Quality Analysis Report -- v3/src Code Smells

**Version**: 3.6.8
**Date**: 2026-02-16
**Scope**: `/workspaces/agentic-qe-new/v3/src/` (942 TypeScript files, 478,814 lines)

---

## Summary

| Metric | Value |
|--------|-------|
| Overall Quality Score | 5.5 / 10 |
| Files Analyzed | 942 |
| Total Issues Found | ~580+ |
| Critical Issues | 12 |
| High Severity Issues | 38 |
| Medium Severity Issues | ~230 |
| Low Severity Issues | ~300 |
| Technical Debt Estimate | 160-200 hours |

The v3 codebase has solid domain-driven structure and good use of Result types for error handling, but suffers from significant God class/file problems, pervasive `as any` casting that defeats TypeScript's type safety, a repeated consensus mixin anti-pattern across all domain coordinators, and widespread magic numbers. The coordinator classes in particular exhibit both excessive size and duplicated boilerplate.

---

## 1. God Classes / God Files (Critical)

**Severity: CRITICAL** -- 28 files exceed 1,500 lines; 85 files exceed 1,000 lines; 398 files exceed 500 lines (42% of codebase).

The project's CLAUDE.md mandates a 500-line file limit. Over 42% of source files violate this rule.

### Worst Offenders (>2,000 lines)

| File | Lines | Concern |
|------|-------|---------|
| `v3/src/domains/quality-assessment/coordinator.ts` | 2,426 | Quality assessment orchestration |
| `v3/src/kernel/unified-memory.ts` | 2,272 | Memory management + DB + CRDT |
| `v3/src/domains/security-compliance/services/security-auditor.ts` | 2,228 | Security scanning |
| `v3/src/coordination/workflow-orchestrator.ts` | 2,219 | Workflow orchestration |
| `v3/src/coordination/queen-coordinator.ts` | 2,202 | Agent coordination |
| `v3/src/domains/code-intelligence/coordinator.ts` | 2,159 | Code intelligence |
| `v3/src/domains/visual-accessibility/services/accessibility-tester.ts` | 2,126 | Accessibility testing |
| `v3/src/init/init-wizard.ts` | 2,113 | Init wizard |
| `v3/src/domains/learning-optimization/coordinator.ts` | 2,094 | Learning optimization |
| `v3/src/cli/commands/learning.ts` | 2,048 | CLI learning commands |

### Analysis

All 13 domain coordinator files are oversized, ranging from 809 lines (`enterprise-integration`) to 2,426 lines (`quality-assessment`). These coordinators violate the Single Responsibility Principle by combining initialization, disposal, consensus management, event handling, and domain-specific orchestration in a single class.

**Recommendation**: Extract consensus lifecycle, event subscription setup, and service orchestration into separate collaborators. Introduce a base coordinator class that handles the common lifecycle pattern (see Section 3 below).

---

## 2. `any` Type Usage (High)

**Severity: HIGH** -- 103 occurrences across 40 files (typed `any` declarations); 24 `as any)` casts; 7 explicit `: any` parameter/return types.

### Pattern A: `as any` Casting on Consensus Mixin (20 occurrences, 7 files)

```typescript
// Found in ALL domain coordinators:
await (this.consensusMixin as any).initializeConsensus();
await (this.consensusMixin as any).disposeConsensus();
return (this.consensusMixin as any).isConsensusAvailable?.() ?? false;
```

**Files affected**:
- `/workspaces/agentic-qe-new/v3/src/domains/visual-accessibility/coordinator.ts` (lines 269, 288, 1701)
- `/workspaces/agentic-qe-new/v3/src/domains/security-compliance/coordinator.ts` (lines 300, 373, 1349)
- `/workspaces/agentic-qe-new/v3/src/domains/defect-intelligence/coordinator.ts` (lines 219, 231)
- `/workspaces/agentic-qe-new/v3/src/domains/requirements-validation/coordinator.ts` (lines 280, 343, 1334)
- `/workspaces/agentic-qe-new/v3/src/domains/test-generation/coordinator.ts` (lines 393, 414, 1595)
- `/workspaces/agentic-qe-new/v3/src/domains/enterprise-integration/coordinator.ts` (lines 193, 207, 809)
- `/workspaces/agentic-qe-new/v3/src/domains/code-intelligence/coordinator.ts` (lines 404, 507, 2016)

This indicates the `ConsensusEnabledMixin` interface does not properly expose `initializeConsensus()`, `disposeConsensus()`, and `isConsensusAvailable()` on the mixed-in type, forcing every consumer to cast to `any`.

### Pattern B: `as any` on MCP Tool Registration (6 occurrences, 1 file)

```typescript
// /workspaces/agentic-qe-new/v3/src/mcp/server.ts (lines 677-702)
this.registry.register(tool.definition, tool.handler as any);
```

Repeated 6 times in `initialize()` for CORE_TOOLS, TASK_TOOLS, AGENT_TOOLS, DOMAIN_TOOLS, MEMORY_TOOLS, CROSS_PHASE_TOOLS. The tool handler type does not match the registry's expected signature.

### Pattern C: Database Query Results as `any[]` (15 occurrences)

```typescript
// Example from multiple files:
`).all(this.config.maxOutcomesInMemory) as any[];
```

**Files affected**:
- `/workspaces/agentic-qe-new/v3/src/feedback/test-outcome-tracker.ts` (line 130)
- `/workspaces/agentic-qe-new/v3/src/feedback/coverage-learner.ts` (line 128)
- `/workspaces/agentic-qe-new/v3/src/routing/routing-feedback.ts` (line 114)
- `/workspaces/agentic-qe-new/v3/src/learning/real-qe-reasoning-bank.ts` (line 1220)
- `/workspaces/agentic-qe-new/v3/src/integrations/rl-suite/persistence/q-value-store.ts` (lines 319, 341, 420, 421)
- `/workspaces/agentic-qe-new/v3/src/integrations/agentic-flow/reasoning-bank/pattern-evolution.ts` (lines 487, 606, 790, 806)
- `/workspaces/agentic-qe-new/v3/src/integrations/agentic-flow/reasoning-bank/experience-replay.ts` (line 750)
- `/workspaces/agentic-qe-new/v3/src/integrations/agentic-flow/reasoning-bank/trajectory-tracker.ts` (lines 397, 648)

**Recommendation**: Define row-type interfaces for each SQL query and use typed wrappers around `better-sqlite3` `.all()` / `.get()` calls.

### Pattern D: Monkey-Patching with `as any` (8 occurrences, 1 file)

```typescript
// /workspaces/agentic-qe-new/v3/src/performance/optimizer.ts
(eventAdapter as any).emit = (event: string, ...args: unknown[]) => { ... };
(eventAdapter as any).getOptimizationStats = () => ({ ... });
(taskManager as any).getTask = (id: string) => { ... };
(surfaceGenerator as any).getSurface = (id: string) => { ... };
```

This is runtime monkey-patching that completely bypasses the type system. Use interface augmentation or wrapper classes instead.

### Pattern E: Typed `any` Properties (2 occurrences)

```typescript
// /workspaces/agentic-qe-new/v3/src/governance/continue-gate-integration.ts:43
private guidanceContinueGate: any = null;

// /workspaces/agentic-qe-new/v3/src/governance/memory-write-gate-integration.ts:44
private guidanceMemoryGate: any = null;
```

---

## 3. Code Duplication (High)

**Severity: HIGH** -- Significant structural duplication across domain coordinators and error handling.

### Pattern A: Coordinator Lifecycle Boilerplate (13 files)

All 13 domain coordinators follow the exact same lifecycle pattern:

```typescript
async initialize(): Promise<void> {
  // ... domain-specific setup ...
  await (this.consensusMixin as any).initializeConsensus();
  // ... event subscriptions ...
}

async dispose(): Promise<void> {
  await (this.consensusMixin as any).disposeConsensus();
  // ... cleanup subscriptions ...
}
```

**Files**: All `v3/src/domains/*/coordinator.ts` (13 files)

This boilerplate should be extracted into a `BaseDomainCoordinator` abstract class with template method hooks.

### Pattern B: Error Coercion Pattern (298 occurrences across 150 files)

```typescript
error instanceof Error ? error.message : String(error)
```

Found 298 times. This should be a shared utility function (e.g., `toErrorMessage(error: unknown): string`).

### Pattern C: Error Wrapping Pattern (426 occurrences across 129 files)

```typescript
error instanceof Error ? error : new Error(String(error))
```

Found 426 times. Same recommendation -- extract to shared utility.

### Pattern D: MCP Tool Registration Loop (6 identical loops)

```typescript
// /workspaces/agentic-qe-new/v3/src/mcp/server.ts (lines 676-703)
for (const tool of CORE_TOOLS) {
  this.registry.register(tool.definition, tool.handler as any);
}
for (const tool of TASK_TOOLS) {
  this.registry.register(tool.definition, tool.handler as any);
}
// ... repeated 4 more times
```

Could be a single loop over `[...CORE_TOOLS, ...TASK_TOOLS, ...AGENT_TOOLS, ...]`.

---

## 4. Magic Numbers and Strings (Medium)

**Severity: MEDIUM** -- 60+ occurrences of hardcoded numeric constants scattered across files.

### Positive Finding

The codebase has `/workspaces/agentic-qe-new/v3/src/kernel/constants.ts` which centralizes many constants. However, numerous files still use inline magic numbers instead of referencing these constants.

### Examples

```typescript
// /workspaces/agentic-qe-new/v3/src/validation/parallel-eval-runner.ts:65-67
timeout: 30000,
progressIntervalMs: 5000,

// /workspaces/agentic-qe-new/v3/src/kernel/unified-persistence.ts:52-54
mmapSize: 64 * 1024 * 1024, // 64MB
busyTimeout: 5000,

// /workspaces/agentic-qe-new/v3/src/performance/optimizer.ts:129-143
poolSize: 1000,
maxSize: 10000,
ttl: 60000, // 1 minute
threshold: 1024, // 1KB

// /workspaces/agentic-qe-new/v3/src/integrations/ruvector/persistent-q-router.ts:102-103
lambda: 1000,
consolidationInterval: 5 * 60 * 1000, // 5 minutes

// /workspaces/agentic-qe-new/v3/src/kernel/memory-factory.ts:234-247
cleanupInterval: 60000,
busyTimeout: 10000,
```

**Recommendation**: Migrate all timeout, size, and interval values to `kernel/constants.ts` or to module-level named constants. The constants file already has `BUSY_TIMEOUT_MS: 5000` and `CLEANUP_INTERVAL_MS: 60000`, but not all call sites use them.

---

## 5. Swallowed / Silent Error Handling (Medium)

**Severity: MEDIUM** -- ~15 catch blocks suppress errors silently or return without logging.

### Pattern A: "Non-critical" Catch-and-Ignore (10+ occurrences)

```typescript
// /workspaces/agentic-qe-new/v3/src/kernel/unified-persistence.ts:312-313
} catch (error) {
  // Non-critical: cleanup errors during shutdown
}

// /workspaces/agentic-qe-new/v3/src/kernel/unified-memory.ts:2137-2138
} catch (error) {
  // Non-critical: file stat errors during storage stats
}

// /workspaces/agentic-qe-new/v3/src/kernel/hybrid-backend.ts:376-377
} catch (e) {
  // Non-critical
}
```

While some of these are legitimately non-critical, the pattern of catching and completely discarding errors makes debugging difficult. At minimum, log at `debug` level.

### Pattern B: Silent Return (1 occurrence)

```typescript
// /workspaces/agentic-qe-new/v3/src/sync/readers/sqlite-reader.ts:159-160
} catch (error) {
  return 0;
}
```

Silently returns a default value on error with no logging.

---

## 6. TODO/FIXME Markers -- Incomplete Implementation (Medium)

**Severity: MEDIUM** -- 15 TODO comments indicating unfinished features.

| File | Line | TODO |
|------|------|------|
| `v3/src/cli/commands/learning.ts` | 554 | `// TODO: Implement actual promotion via reasoningBank` |
| `v3/src/domains/visual-accessibility/services/browser-swarm-coordinator.ts` | 522 | `// TODO: Integrate with axe-core or similar` |
| `v3/src/mcp/http-server.ts` | 489 | `// TODO: Wire to actual MCP tool handlers` |
| `v3/src/mcp/transport/websocket/connection-manager.ts` | 484 | `totalReconnections: 0, // TODO: track reconnections` |
| `v3/src/integrations/ruvector/server-client.ts` | 402 | `// TODO: Parse actual health response` |
| `v3/src/integrations/ruvector/server-client.ts` | 450 | `// TODO: When server API becomes available` |
| `v3/src/integrations/browser/client-factory.ts` | 64 | `// TODO: Implement Vibium availability check` |
| `v3/src/integrations/browser/client-factory.ts` | 270 | `// TODO: Return real Vibium client when implemented` |
| `v3/src/integrations/browser/client-factory.ts` | 279 | `// TODO: Return real Vibium client when implemented` |
| `v3/src/integrations/agentic-flow/reasoning-bank/index.ts` | 319 | `similarity: 0.8, // TODO: Calculate actual similarity` |
| `v3/src/learning/qe-unified-memory.ts` | 1129 | `// TODO: Implement JSON migration` |
| `v3/src/learning/v2-to-v3-migration.ts` | 419 | `// TODO: Migrate embeddings if available` |

The `// TODO: Wire to actual MCP tool handlers` in `http-server.ts` is concerning as it suggests the HTTP transport may not be functional.

---

## 7. Inappropriate Intimacy / Deep Coupling (Medium)

**Severity: MEDIUM**

### Deep Import Paths (23 occurrences)

Files reaching 4+ levels deep into other modules via relative imports:

```typescript
// /workspaces/agentic-qe-new/v3/src/domains/security-compliance/services/scanners/dast-scanner.ts:7
import { Result, ok, err } from '../../../../shared/types/index.js';

// /workspaces/agentic-qe-new/v3/src/domains/test-execution/services/e2e/e2e-coordinator.ts:11-12
import type { VibiumClient, ... } from '../../../../integrations/vibium';
import type { IBrowserClient } from '../../../../integrations/browser';

// /workspaces/agentic-qe-new/v3/src/domains/code-intelligence/services/c4-model/index.ts:13-15
import { Result, ok, err, Severity, Priority } from '../../../../shared/types';
import type { MemoryBackend, StoreOptions } from '../../../../kernel/interfaces';
import { NomicEmbedder, ... } from '../../../../shared/embeddings';
```

These deep relative paths are fragile and indicate either missing barrel exports or overly nested directory structures.

**Recommendation**: Use TypeScript path aliases (e.g., `@kernel/interfaces`, `@shared/types`) or ensure barrel exports exist at module boundaries.

---

## 8. Console Logging Instead of Structured Logging (Medium)

**Severity: MEDIUM** -- 216 `console.log/warn/error` calls spread across 30+ files.

The codebase has a logging module at `v3/src/logging/`, but many files bypass it and use `console.*` directly. Worst offenders:

| File | console.* calls |
|------|----------------|
| `v3/src/performance/run-gates.ts` | 29 |
| `v3/src/learning/dream/dream-scheduler.ts` | 22 |
| `v3/src/learning/real-qe-reasoning-bank.ts` | 21 |
| `v3/src/strange-loop/strange-loop.ts` | 15 |
| `v3/src/kernel/unified-memory-migration.ts` | 14 |
| `v3/src/learning/qe-reasoning-bank.ts` | 13 |
| `v3/src/learning/qe-unified-memory.ts` | 13 |

**Recommendation**: Replace `console.*` calls with the structured logger from `v3/src/logging/`. This enables log level filtering, structured metadata, and consistent formatting.

---

## 9. Shotgun Surgery Pattern (Medium)

**Severity: MEDIUM** -- Changes to the consensus mixin or domain coordinator lifecycle require edits to 13+ files.

### Consensus Mixin Changes

Any change to how consensus is initialized, disposed, or queried requires modifying all 13 coordinator files because of the duplicated `(this.consensusMixin as any).*` pattern. This is the textbook definition of shotgun surgery.

### Error Handling Changes

With 298+ copies of `error instanceof Error ? error.message : String(error)` and 426+ copies of the wrapping variant, any change to error handling strategy requires updating hundreds of files.

### Domain Event Schema Changes

Adding a new standard field to domain events would require changes across all coordinator files and their associated service files.

---

## 10. Long Parameter Lists (Low)

**Severity: LOW** -- Only 3 instances found of functions with 5+ parameters.

```typescript
// /workspaces/agentic-qe-new/v3/src/integrations/rl-suite/algorithms/ddpg.ts:287
private generateReasoning(state: RLState, action: RLAction, value: number, original: number, noisy: number): string
```

The WASM binding declarations in `agent_booster_wasm_bg.wasm.d.ts` have 7-parameter functions, but those are auto-generated and not actionable.

The codebase generally uses config objects for complex parameter sets, which is good practice.

---

## Positive Findings

1. **Result Type Usage**: The codebase uses `Result<T>` with `ok()` / `err()` wrappers consistently across domain services, providing explicit error handling without exceptions.

2. **Domain-Driven Structure**: Clear bounded contexts in `v3/src/domains/` with coordinator + services + plugin patterns per domain.

3. **Constants File Exists**: `v3/src/kernel/constants.ts` centralizes many named constants with documentation -- the issue is incomplete adoption.

4. **Event-Driven Architecture**: The `EventBus` and domain event system provides loose coupling between domains for cross-cutting concerns.

5. **Lazy Initialization**: Persistent resources (DB connections, CRDT stores) use lazy `init()` patterns with `| null` types, avoiding unnecessary resource allocation.

6. **Config Objects**: Most complex constructors use typed configuration interfaces rather than long parameter lists.

7. **Explicit Error Logging in Catch Blocks**: Most catch blocks log warnings with context (`[ModuleName] description:, error`) rather than silently swallowing.

---

## Refactoring Priorities

### Priority 1: Fix Consensus Mixin Typing (Est. 8 hours)
- Fix the `ConsensusEnabledMixin` type definition to properly expose `initializeConsensus()`, `disposeConsensus()`, and `isConsensusAvailable()`.
- Eliminate all 20 `(this.consensusMixin as any)` casts across 7 coordinator files.
- This also reduces shotgun surgery risk.

### Priority 2: Extract Base Domain Coordinator (Est. 16 hours)
- Create `BaseDomainCoordinator` abstract class with template methods for `onInitialize()`, `onDispose()`.
- Move consensus lifecycle, event subscription management, and health check patterns into the base class.
- Reduces 13 coordinator files by 100-200 lines each.

### Priority 3: Shared Error Utilities (Est. 4 hours)
- Create `toErrorMessage(error: unknown): string` and `toError(error: unknown): Error`.
- Replace 700+ duplicated inline patterns.

### Priority 4: Typed Database Row Interfaces (Est. 12 hours)
- Define row-type interfaces for all SQL queries.
- Replace 15+ `as any[]` casts on database results with typed alternatives.

### Priority 5: Split God Files (Est. 40 hours)
- Target files > 1,500 lines first (28 files).
- `unified-memory.ts` (2,272 lines) should split into memory manager, DB layer, and CRDT integration.
- `workflow-orchestrator.ts` (2,219 lines) should split workflow types, execution engine, and step management.
- Domain coordinators will shrink via Priority 2.

### Priority 6: Consolidate Magic Numbers (Est. 8 hours)
- Audit all timeout/size/interval constants.
- Move to `kernel/constants.ts` or domain-specific constant files.
- Update all call sites to reference named constants.

### Priority 7: Replace Console Logging (Est. 12 hours)
- Replace 216 `console.*` calls with structured logger.
- Ensure all catch blocks use the logger rather than `console.warn/error`.

---

## Technical Debt Distribution by Module

| Module | Issues | Dominant Smell |
|--------|--------|----------------|
| `domains/` (13 coordinators) | ~95 | God classes, duplicated lifecycle, `as any` consensus |
| `kernel/` | ~25 | God files (unified-memory), magic numbers |
| `coordination/` | ~30 | God files (workflow-orchestrator, queen-coordinator) |
| `learning/` | ~25 | Console logging, `as any[]` DB queries |
| `mcp/` | ~20 | `as any` tool registration, TODO stubs |
| `performance/` | ~15 | `as any` monkey-patching, magic numbers |
| `governance/` | ~10 | `any`-typed properties |
| `integrations/` | ~25 | `as any[]` DB queries, TODOs |
| `cli/` | ~15 | `as any` casts, God file (learning.ts) |
| `feedback/` | ~10 | Duplicated tracker patterns |

---

*Report generated by Code Quality Analyzer on 2026-02-16*
