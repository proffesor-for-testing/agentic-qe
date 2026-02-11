# Architecture Quality Review - Agentic QE v3.6.3

**Report Date**: 2026-02-11
**Scope**: `/v3/src/` - Full codebase architecture analysis
**Codebase**: 940 TypeScript files, ~475,000 lines of code
**Architecture**: DDD with 13 bounded contexts, event-driven kernel, multi-agent coordination

---

## Executive Summary

**Architecture Health Score: B+**

The Agentic QE v3 codebase demonstrates a well-designed Domain-Driven Design architecture with strong separation of concerns, comprehensive event-driven communication, and proper use of the microkernel pattern. The layered architecture (shared -> kernel -> domains -> coordination -> cli/mcp) is consistently followed with only minor violations. The codebase excels in its domain interface abstractions, plugin system, and factory pattern usage.

Key strengths include consistent domain structure across all 13 bounded contexts, properly defined kernel interfaces with dependency inversion, and a robust event bus with middleware pipeline. The primary areas for improvement are: excessive file sizes violating the 500-line project rule (50+ files), heavy use of `console.log/warn/error` instead of structured logging (500+ occurrences), a typo propagated across 3 files in a public interface method name, and tight coupling between the coordination layer and domain implementations.

| Category | Score | Assessment |
|----------|-------|------------|
| DDD Compliance | A- | Strong domain boundaries, consistent structure, proper event communication |
| SOLID Principles | B+ | Good SRP and DIP; some ISP violations in coordinators |
| Design Patterns | A | Excellent use of Factory, Observer, Strategy, Plugin, Command patterns |
| Code Organization | B | Strong layering, but 50+ files exceed 500-line limit |
| API Design Quality | B+ | Consistent MCP tools and CLI patterns; some naming inconsistencies |
| Technical Debt | B- | 47 deprecated aliases, 35 TODO/FIXME markers, 95 `as any` casts |

---

## 1. DDD Compliance Findings

### 1.1 Domain Structure Consistency (Grade: A)

All 13 bounded contexts in `src/domains/` follow an identical, uniform structure:

```
domains/<name>/
  coordinator.ts    -- Domain orchestrator
  plugin.ts         -- Kernel plugin (extends BaseDomainPlugin)
  interfaces.ts     -- Domain-specific types and API interface
  services/         -- Domain services (business logic)
  index.ts          -- Barrel exports
```

**Verified domains** (all conforming):
- chaos-resilience, code-intelligence, contract-testing, coverage-analysis
- defect-intelligence, enterprise-integration, learning-optimization
- quality-assessment, requirements-validation, security-compliance
- test-execution, test-generation, visual-accessibility

Two domains have additional subdirectories that extend the pattern appropriately:
- `test-generation/` has `factories/`, `generators/`, `interfaces/` (Strategy pattern implementation for framework-specific generators)
- `quality-assessment/` has `coherence/` (ADR-052 integration)

### 1.2 Domain Boundary Integrity (Grade: A-)

**Cross-domain imports are properly absent.** A grep for inter-domain imports (`from '../../domains/`) within the domains directory returns zero results. Domains communicate exclusively through:

1. **Event Bus** -- Domains subscribe to typed events from other domains (e.g., `coverage-analysis.CoverageGapDetected`, `test-execution.TestRunCompleted`)
2. **Shared Kernel** -- All domains import from `../../shared/types` and `../../kernel/interfaces` only
3. **Domain-Interface Base Class** -- All plugins extend `BaseDomainPlugin` from `domains/domain-interface.ts`

**Minor boundary concern**: `domain-interface.ts` (the base class for all domain plugins) imports type-only references from the coordination layer:
```typescript
import type { QueenMinCutBridge } from '../coordination/mincut';
import type { ConsensusEngineConfig } from '../coordination/consensus';
```
While these are type-only imports (not runtime dependencies), they create a conceptual coupling from the domain layer upward to the coordination layer. These types should ideally be defined in the shared kernel or kernel interfaces layer.

**Coordination layer appropriately depends on domains**: The `task-executor.ts` in coordination imports service classes from 5 domains, which is the expected direction of dependency for an orchestration layer.

### 1.3 Ubiquitous Language (Grade: B+)

The codebase maintains consistent terminology within each bounded context:

| Domain | Key Terms | Consistency |
|--------|-----------|-------------|
| test-generation | GenerateTestsRequest, GeneratedTest, TDDRequest, Pattern | High |
| test-execution | TestRun, FlakyTest, RetryPolicy, TestWorker | High |
| coverage-analysis | CoverageGap, FileCoverage, SublinearAnalyzer | High |
| quality-assessment | QualityScore, QualityGate, DeploymentAdvice | High |
| security-compliance | SecurityScan, Vulnerability, ComplianceResult | High |
| coordination | QueenTask, WorkflowStep, ProtocolAction | Medium |

**Issue**: The `coordination/interfaces.ts` file contains a method named `subscribeToDoamin` (typo for "Domain") that has propagated to the `cross-domain-router.ts` and `queen-coordinator.ts` implementations. This typo in a public API surface should be corrected.

### 1.4 Aggregate Roots and Value Objects (Grade: B+)

**Value Objects** (`src/shared/value-objects/index.ts`):
Five well-defined value objects with proper immutability and validation:
- `FilePath` -- Path manipulation with validation
- `Coverage` -- 0-100 range validation for all coverage dimensions
- `RiskScore` -- 0-1 normalized scoring with severity levels
- `TimeRange` -- Temporal ranges with overlap detection
- `Version` -- Semantic versioning with comparison

All value objects follow DDD principles: private constructors, static factory methods, equality by value, and immutability.

**Entity Base** (`src/shared/entities/base-entity.ts`):
- `BaseEntity<T>` provides identity, timestamps, and equality by ID
- `AggregateRoot<T>` extends with domain event collection (`addDomainEvent`, `pullDomainEvents`)

**Concern**: While the aggregate root base class is well-implemented, it appears to be underutilized. Domain entities do not extensively leverage the `AggregateRoot` pattern for collecting domain events prior to persistence. Most event publishing happens directly through the EventBus in coordinators, bypassing the aggregate root pattern.

### 1.5 Event-Driven Communication (Grade: A)

The event system is a highlight of the architecture:

- **Typed Events**: All domain events follow the `DomainEvent<T>` generic pattern with typed payloads
- **Event Factory**: `createEvent()` provides consistent event construction
- **Domain Event Constants**: Each domain defines its events as typed constants (e.g., `TestGenerationEvents.TestGenerated`)
- **Naming Convention**: Events follow `<domain>.<EventName>` pattern consistently (e.g., `test-execution.TestRunCompleted`)
- **Anti-Drift Middleware** (ADR-060): Semantic fingerprinting and drift detection built into the event bus pipeline
- **Loop Detection** (ADR-062): Automated detection of event loops with strike-based warnings

**Event Bus Performance**: The `InMemoryEventBus` uses:
- O(1) subscription indexes (by event type, by channel, wildcards)
- `CircularBuffer` for O(1) bounded history (replaces O(n) array shift)
- Middleware pipeline with ordered priority execution

---

## 2. SOLID Principle Analysis

### 2.1 Single Responsibility Principle (Grade: B)

**Positive**: The domain layer follows SRP well. Each domain separates concerns into:
- `plugin.ts` -- Lifecycle and kernel integration only
- `coordinator.ts` -- Workflow orchestration
- `services/` -- Individual business logic units

**Violations**:
- **Coordinator bloat**: Multiple coordinators exceed 1500-2000 lines and handle too many concerns:
  - `quality-assessment/coordinator.ts` (2,426 lines) -- handles quality evaluation, deployment advice, coherence, LLM integration, QESONA, Flash Attention, Decision Transformer, MinCut awareness, consensus verification, and governance
  - `code-intelligence/coordinator.ts` (2,156 lines) -- similar pattern of accumulated responsibilities
  - `learning-optimization/coordinator.ts` (2,094 lines)

  Each coordinator has accumulated multiple integration concerns (MinCut mixin, Consensus mixin, Governance mixin, QESONA, Flash Attention) that should be extracted into separate collaborating classes.

- **God objects**: `queen-coordinator.ts` (2,202 lines) and `workflow-orchestrator.ts` (2,219 lines) in the coordination layer handle too many responsibilities.

### 2.2 Open/Closed Principle (Grade: A-)

The architecture strongly supports OCP:

- **Plugin System**: New domains can be added by implementing `BaseDomainPlugin` and registering a factory function -- no modification to the kernel required
- **Strategy Pattern**: Test generators use `ITestGenerator` interface with framework-specific implementations (Jest, Vitest, Mocha, Pytest)
- **Event Subscriptions**: New behaviors can be added by subscribing to events without modifying producers
- **Consensus Strategies**: Majority, Weighted, and Unanimous strategies implement a common interface via factory
- **Middleware Pipeline**: New event processing can be added via `registerMiddleware()` on the EventBus

**Minor OCP concern**: The kernel's `DOMAIN_FACTORIES` map in `kernel.ts` requires modification when adding new domains, though this is a reasonable registry pattern.

### 2.3 Liskov Substitution Principle (Grade: B+)

All 13 domain plugins extend `BaseDomainPlugin` and can be substituted through the `DomainPlugin` interface. The kernel treats all plugins uniformly through:
- `DomainPlugin.initialize()` / `dispose()` lifecycle
- `DomainPlugin.handleEvent()` for event processing
- `DomainPlugin.getAPI<T>()` for typed API access
- Optional `executeTask()` and `canHandleTask()` for Queen integration

**Concern**: The `getAPI<T>()` method uses an unconstrained generic type parameter, requiring callers to know the concrete API type. This is a minor LSP concern since there is no compile-time guarantee that the returned type matches the actual API.

### 2.4 Interface Segregation Principle (Grade: B-)

**Good**: The kernel defines focused interfaces:
- `EventBus` -- event publishing and subscription only
- `MemoryBackend` -- storage operations only
- `AgentCoordinator` -- agent lifecycle only
- `PluginLoader` -- domain loading only

**Violations**:
- **`MemoryBackend` interface is broad**: It combines key-value storage, vector search, and counting in a single interface. Clients needing only key-value storage still depend on `vectorSearch()`, `storeVector()`, and `hasCodeIntelligenceIndex()`. The last method (`hasCodeIntelligenceIndex`) is domain-specific and does not belong in a kernel interface.

- **`QEKernel` interface has optional methods**: Six methods are marked with `?` (optional), creating ambiguity about the kernel contract:
  ```typescript
  getDomainAPIAsync?<T>(domain: DomainName): Promise<T | undefined>;
  ensureDomainLoaded?(domain: DomainName): Promise<boolean>;
  isDomainLoaded?(domain: DomainName): boolean;
  getLoadedDomains?(): DomainName[];
  getPendingDomains?(): DomainName[];
  ```
  These should either be required methods or split into a separate `LazyLoadingKernel` interface.

### 2.5 Dependency Inversion Principle (Grade: A-)

The architecture demonstrates strong DIP adherence:

- **All domain plugins depend on abstractions** (`EventBus`, `MemoryBackend`, `AgentCoordinator`) injected through constructors, never on concrete implementations
- **Factory pattern** for plugin creation ensures the kernel controls instantiation
- **Shared types** provide the abstraction layer that both kernel and domains depend on
- **Interface-first design**: Kernel interfaces are in a separate file from implementations

**Minor DIP concern**: The `QEKernelImpl` constructor directly imports all 13 domain plugin factories at the top of the file, creating a compile-time dependency on all domain implementations. A more DIP-compliant approach would use a plugin registry that domains register themselves into, or use dynamic imports.

---

## 3. Design Pattern Assessment

### 3.1 Factory Pattern (Grade: A)

Excellent use of the Factory pattern throughout:

| Factory | Location | Purpose |
|---------|----------|---------|
| `createKernel()` | `kernel/kernel.ts` | Creates configured QEKernel instances |
| `createMemoryBackend()` | `kernel/memory-factory.ts` | Polymorphic memory backend creation |
| `createTestGenerationPlugin()` | `domains/test-generation/plugin.ts` | Domain plugin construction |
| `DOMAIN_FACTORIES` map | `kernel/kernel.ts` | Central registry of all domain factories |
| `createConsensusEngine()` | `coordination/consensus/factory.ts` | Consensus engine with strategy selection |
| `createDomainCircuitBreaker()` | `coordination/circuit-breaker/index.ts` | Circuit breaker instances per domain |
| `TestGeneratorFactory` | `domains/test-generation/factories/` | Framework-specific test generator creation |

Each factory properly encapsulates construction logic, handles configuration merging, and returns abstract interfaces.

### 3.2 Observer Pattern (Grade: A)

The EventBus implements a sophisticated Observer/Pub-Sub pattern:

- **Indexed subscriptions** for O(1) event routing (by type, by channel, wildcards)
- **Middleware pipeline** (ADR-060) for cross-cutting event processing
- **Correlation tracking** for related event chains
- **Bounded history** via CircularBuffer for event replay
- **Concurrent handler execution** via `Promise.allSettled()`

Domain plugins subscribe to specific event types during initialization and publish typed events through their coordinators:
```typescript
// Producer (test-generation)
await this.eventBus.publish(createEvent('test-generation.TestGenerated', ...));

// Consumer (coverage-analysis)
this.eventBus.subscribe('test-generation.TestGenerated', handler);
```

### 3.3 Strategy Pattern (Grade: A-)

Multiple Strategy implementations:

1. **Test Generator Strategies**: `ITestGenerator` interface with `JestVitestGenerator`, `MochaGenerator`, `PytestGenerator` implementations, selected via `TestGeneratorFactory`
2. **Consensus Strategies**: `MajorityStrategy`, `WeightedStrategy`, `UnanimousStrategy` with factory-based selection
3. **Memory Backend Strategies**: `InMemoryBackend`, `HybridMemoryBackend` behind `MemoryBackend` interface
4. **Model Providers**: `ClaudeModelProvider`, `OpenAIModelProvider`, `GeminiModelProvider`, `OllamaModelProvider` behind `ModelProvider` interface

### 3.4 Command Pattern (Grade: B+)

CLI commands in `src/cli/commands/` follow a consistent pattern with 20 command modules. Each command handles argument parsing and delegates to domain APIs or MCP tools. The `CommandRegistry` in `cli/command-registry.ts` manages command registration and dispatch.

MCP tools follow a similar pattern with the `MCPToolBase` base class and `ToolRegistry` for registration.

### 3.5 Circuit Breaker Pattern (Grade: A)

Two levels of circuit breaker implementation:

1. **LLM Provider Circuit Breaker** (`shared/llm/`): Protects against LLM API failures with configurable thresholds, states (closed/open/half-open), and exponential backoff
2. **Domain Circuit Breaker** (`coordination/circuit-breaker/`): ADR-064 compliant domain-level fault isolation with criticality-based configuration and a central `DomainBreakerRegistry`

Both implementations provide proper state management, event emission on state transitions, and configurable recovery behaviors.

### 3.6 Additional Patterns

- **Plugin/Microkernel**: The entire domain architecture is based on a microkernel with hot-loadable domain plugins
- **Mixin Pattern**: `MinCutAwareDomainMixin`, `ConsensusEnabledMixin`, `GovernanceAwareDomainMixin` provide composable cross-cutting concerns
- **Anti-Corruption Layer**: The `adapters/` directory provides adapters for external protocols (A2A, AG-UI)
- **Repository Pattern**: Memory backends implement a simplified repository pattern for domain data persistence

---

## 4. Code Organization Issues

### 4.1 File Size Violations (Grade: C)

The project rule states files should be under 500 lines. **At least 70 files exceed this limit**, with the worst offenders:

| File | Lines | Excess |
|------|-------|--------|
| `quality-assessment/coordinator.ts` | 2,426 | 4.9x over limit |
| `security-compliance/services/security-auditor.ts` | 2,228 | 4.5x |
| `coordination/workflow-orchestrator.ts` | 2,219 | 4.4x |
| `coordination/queen-coordinator.ts` | 2,202 | 4.4x |
| `code-intelligence/coordinator.ts` | 2,156 | 4.3x |
| `visual-accessibility/services/accessibility-tester.ts` | 2,126 | 4.3x |
| `init/init-wizard.ts` | 2,113 | 4.2x |
| `learning-optimization/coordinator.ts` | 2,094 | 4.2x |
| `kernel/unified-memory.ts` | 2,070 | 4.1x |
| `test-generation/coordinator.ts` | 1,845 | 3.7x |

**Pattern**: Domain coordinators are the most common violators because they accumulate mixin integrations (MinCut, Consensus, Governance, QESONA, Flash Attention, Decision Transformer). Each ADR adds ~200-400 lines of integration code to existing coordinators.

### 4.2 Layered Architecture (Grade: A-)

The intended layering is well-maintained:

```
shared/          <-- Shared Kernel (types, value objects, events, utilities)
    |
kernel/          <-- Microkernel (interfaces, event bus, memory, plugins)
    |
domains/         <-- 13 Bounded Contexts (business logic)
    |
coordination/    <-- Orchestration Layer (Queen, workflows, protocols)
    |
mcp/ + cli/      <-- API Surface (MCP tools, CLI commands)
```

**Dependency direction violations** (3 found):
1. `domain-interface.ts` imports types from `coordination/` (should be in shared/kernel)
2. `kernel/kernel.ts` imports all domain plugin factories (acceptable for composition root)
3. `learning/qe-unified-memory.ts` imports from `domains/coverage-analysis/services/hnsw-index.js` (cross-layer import that bypasses the domain plugin API)

### 4.3 Barrel Exports (Grade: B+)

184 `index.ts` barrel export files exist across the codebase. The top-level `src/index.ts` (343 lines) serves as the public API surface and properly re-exports from all major modules. It includes explicit comments about name collision avoidance using namespace exports.

**Issue**: The `index.ts` file claims "12 Bounded Contexts" in its JSDoc comment but the codebase has 13 (enterprise-integration was added later). The `ARCHITECTURE` constant should be updated.

### 4.4 Error Handling (Grade: B)

- **Result Type**: Consistent use of discriminated union `Result<T, E>` with `ok()` and `err()` helper functions
- **Error Propagation**: Domain plugins wrap errors with context before returning via Result type
- **Missing**: No structured error hierarchy. Errors are plain `Error` objects with string messages. A domain-specific error class hierarchy (e.g., `DomainError`, `ValidationError`, `TimeoutError`) would improve error handling and enable more precise error recovery.
- **Raw exceptions**: 38 files use `throw new Error()` at the kernel/shared layer, which is appropriate for invariant violations. However, domain coordinators sometimes `throw` instead of returning `Result` errors, creating inconsistent error handling patterns.

### 4.5 Logging (Grade: D)

**456 `console.log/warn/error` calls across 54 domain files** and **30 calls across 5 kernel files**. The codebase lacks a structured logging abstraction. All logging uses raw `console.*` calls, which:
- Cannot be configured (log levels, output format)
- Cannot be routed to different sinks (file, monitoring)
- Cannot include structured metadata (correlation IDs, domain context)
- Make it difficult to silence debug output in production

This is the single most impactful code quality improvement the codebase could make.

---

## 5. API Design Quality

### 5.1 MCP Tool Definitions (Grade: A-)

The MCP tool layer (`src/mcp/tools/`) provides 33 tools across 14 domains with a consistent structure:

- **Naming**: `qe/<domain>/<action>` convention (e.g., `qe/tests/generate`, `qe/coverage/analyze`)
- **Base Class**: All tools extend `MCPToolBase` providing schema validation, error handling, and metrics
- **Security**: `ToolRegistry` includes input validation (SEC-001), parameter sanitization, and name format validation
- **Registration**: Centralized `registry.ts` with `registerAllQETools()` factory function

**Minor issue**: Tool count documentation is inconsistent. The `tools/index.ts` header claims "20 Tools" but the registry manages 33 tools.

### 5.2 CLI Command Patterns (Grade: B+)

20 CLI commands in `src/cli/commands/` follow a consistent pattern:
- Argument parsing with typed options
- Delegation to kernel/MCP APIs
- Formatted console output
- Tab completion support (`cli/completions/`)

**Good**: The `CommandRegistry` pattern provides uniform command registration and help generation.

### 5.3 TypeScript Interface Design (Grade: B+)

**Strengths**:
- All public APIs are typed with explicit interfaces
- `readonly` properties on DTOs and events prevent accidental mutation
- Discriminated unions for event types and status enums
- Generic types used appropriately (`DomainEvent<T>`, `Result<T, E>`)

**Concerns**:
- **Deprecated type aliases**: `test-generation/interfaces.ts` has 21 deprecated aliases (e.g., `GenerateTestsRequest` aliasing `IGenerateTestsRequest`). A migration path to remove these should be planned.
- **95 `as any` casts** across 30 files indicate type system workarounds. Notable instances are in the coordination layer where mixin methods are accessed via `(this.consensusMixin as any).initializeConsensus()`, revealing incomplete mixin type definitions.
- **`getAPI<T>()` is unconstrained**: No way to enforce type safety between a domain name and its corresponding API type at the type level.

### 5.4 Versioning (Grade: B)

- Version is read dynamically from `package.json` using `createRequire()`
- `VERSION` constant is exported from the public API surface
- `ARCHITECTURE` string constant is outdated ("12 Bounded Contexts" should be "13")
- Domain plugin versions are hardcoded strings (e.g., `version: '1.0.0'`), not tied to the package version

---

## 6. Architecture Debt Items (Prioritized)

### Priority 1 -- Critical

| # | Item | Impact | Effort |
|---|------|--------|--------|
| 1 | **Introduce structured logging abstraction** | 486 console.* calls without level/sink control; impossible to manage in production | Medium |
| 2 | **Fix `subscribeToDoamin` typo in public interface** | Typo in `CrossDomainRouter.subscribeToDoamin()` propagated to 3 implementations | Low |
| 3 | **Extract mixin integrations from coordinators** | Coordinators exceed 2000 lines due to accumulated ADR integrations; SRP violation | High |

### Priority 2 -- High

| # | Item | Impact | Effort |
|---|------|--------|--------|
| 4 | **Split `MemoryBackend` interface** | ISP violation; `hasCodeIntelligenceIndex()` is domain-specific in kernel interface | Medium |
| 5 | **Move coordination types out of domain-interface.ts** | Upward dependency from domain layer to coordination layer for `QueenMinCutBridge` and `ConsensusEngineConfig` types | Low |
| 6 | **Make `QEKernel` optional methods into separate interface** | 5 optional methods create ambiguous contract; should be `LazyLoadableKernel` | Low |
| 7 | **Create domain-specific error hierarchy** | Only generic `Error` used; no structured error taxonomy for recovery decisions | Medium |
| 8 | **Resolve 95 `as any` type casts** | Type safety bypasses, particularly in mixin access patterns | Medium |

### Priority 3 -- Medium

| # | Item | Impact | Effort |
|---|------|--------|--------|
| 9 | **Update `ARCHITECTURE` constant** | Claims "12 Bounded Contexts" but there are 13 (enterprise-integration) | Trivial |
| 10 | **Plan deprecation removal for 47 type aliases** | `test-generation` and `test-execution` interfaces.ts carry deprecated aliases | Medium |
| 11 | **Add type-safe domain API accessor** | `getAPI<T>()` has no compile-time safety; consider a domain-to-API type map | Medium |
| 12 | **Fix cross-layer import in learning module** | `learning/qe-unified-memory.ts` imports directly from `domains/coverage-analysis/services/` | Low |
| 13 | **Resolve 35 TODO/FIXME markers** | Scattered across 19 files, indicating incomplete implementations | Medium |
| 14 | **Split oversized files** (70+ files > 500 lines) | Technical debt accumulation; particularly coordinators and service files | High |

### Priority 4 -- Low

| # | Item | Impact | Effort |
|---|------|--------|--------|
| 15 | **Align tool count documentation** | MCP tools/index.ts header says 20 tools but registry has 33 | Trivial |
| 16 | **Leverage AggregateRoot pattern more** | `AggregateRoot.addDomainEvent()` is implemented but rarely used in practice | Low |
| 17 | **Decouple kernel from domain plugin imports** | `kernel.ts` imports all 13 domain plugin factories at compile time | Medium |

---

## 7. Recommendations for Improvement

### R1: Introduce Structured Logging (Priority 1)

Create a `Logger` interface in `shared/` with level-based logging, structured metadata, and configurable sinks:

```typescript
// shared/logging/logger.ts
interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
}
```

Inject this logger through constructor DI in all coordinators and services. This would replace 486+ unstructured console calls.

### R2: Extract Coordinator Mixins into Composition (Priority 1)

Refactor the coordinator mixin accumulation pattern. Instead of each coordinator owning its own MinCut, Consensus, Governance, QESONA, Flash Attention, and Decision Transformer instances, create a `DomainIntegrationComposer` that wires these cross-cutting concerns:

```typescript
class DomainIntegrationComposer {
  constructor(
    private readonly minCut: MinCutAwareDomainMixin,
    private readonly consensus: ConsensusEnabledMixin,
    private readonly governance: GovernanceAwareDomainMixin,
  ) {}
  // Expose focused methods that coordinators call
}
```

This would reduce coordinator sizes by 400-800 lines each.

### R3: Segregate Memory Interface (Priority 2)

Split `MemoryBackend` into focused interfaces:

```typescript
interface KeyValueStore { set, get, delete, has, search, count }
interface VectorStore { vectorSearch, storeVector }
interface MemoryBackend extends KeyValueStore, VectorStore { ... }
```

Remove `hasCodeIntelligenceIndex()` from the kernel interface and move it to the code-intelligence domain.

### R4: Establish Domain Error Hierarchy (Priority 2)

Create a base `DomainError` class and domain-specific subtypes:

```typescript
class DomainError extends Error { domain: DomainName; code: string; }
class ValidationError extends DomainError { ... }
class TimeoutError extends DomainError { ... }
class ResourceExhaustedError extends DomainError { ... }
```

This enables structured error handling and recovery strategies.

### R5: Type-Safe Domain API Access (Priority 3)

Create a compile-time mapping from domain names to their API types:

```typescript
interface DomainAPIMap {
  'test-generation': TestGenerationAPI;
  'test-execution': TestExecutionAPI;
  // ...
}

getDomainAPI<K extends DomainName>(domain: K): DomainAPIMap[K] | undefined;
```

This would eliminate the unconstrained generic parameter and provide autocompletion.

---

## Appendix A: Codebase Metrics

| Metric | Value |
|--------|-------|
| Total TypeScript files | 940 |
| Total lines of code | ~475,000 |
| Bounded contexts | 13 + coordination |
| Barrel export files (index.ts) | 184 |
| Files over 500 lines | ~70+ |
| Largest file | `quality-assessment/coordinator.ts` (2,426 lines) |
| `console.*` calls in domains | 456 across 54 files |
| `console.*` calls in kernel | 30 across 5 files |
| `as any` type casts | 95 across 30 files |
| Deprecated type aliases | 47 across 15 files |
| TODO/FIXME markers | 35 across 19 files |
| Value objects | 5 (FilePath, Coverage, RiskScore, TimeRange, Version) |
| MCP tools | 33 |
| CLI commands | 20 |
| Consensus strategy implementations | 3 (Majority, Weighted, Unanimous) |
| Model provider implementations | 6 (Claude, OpenAI, Gemini, OpenRouter, Ollama, NativeLearning) |
| Domain events defined | ~40 event types |

## Appendix B: Architecture Diagram (Text)

```
+------------------------------------------------------------------+
|                        PUBLIC API SURFACE                          |
|  src/index.ts  |  src/mcp/  (33 tools)  |  src/cli/  (20 cmds)  |
+------------------------------------------------------------------+
                              |
+------------------------------------------------------------------+
|                      COORDINATION LAYER                           |
|  queen-coordinator | workflow-orchestrator | cross-domain-router  |
|  consensus | circuit-breaker | agent-teams | fleet-tiers | mincut |
+------------------------------------------------------------------+
                              |
+------------------------------------------------------------------+
|                     13 BOUNDED CONTEXTS                           |
|  test-generation | test-execution | coverage-analysis            |
|  quality-assessment | defect-intelligence | code-intelligence     |
|  requirements-validation | security-compliance | contract-testing |
|  visual-accessibility | chaos-resilience | learning-optimization  |
|  enterprise-integration                                          |
|  [Each: plugin.ts + coordinator.ts + interfaces.ts + services/]  |
+------------------------------------------------------------------+
                              |
+------------------------------------------------------------------+
|                        KERNEL LAYER                               |
|  QEKernel | EventBus | PluginLoader | AgentCoordinator           |
|  MemoryBackend (Hybrid/InMemory) | UnifiedMemoryManager          |
|  Anti-Drift Middleware (ADR-060)                                  |
+------------------------------------------------------------------+
                              |
+------------------------------------------------------------------+
|                      SHARED KERNEL                                |
|  types | value-objects | entities | events | embeddings           |
|  llm | parsers | security | metrics | utils | git | http         |
+------------------------------------------------------------------+
```

---

*Report generated by Code Analyzer Agent on 2026-02-11*
*Architecture: DDD with 13 Bounded Contexts, Event-Driven Microkernel*
*Version: v3.6.3*
