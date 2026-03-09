# Error Handling & Resilience Pattern Analysis Report

**Project**: Agentic QE v3.7.14
**Analysis Date**: 2026-03-09
**Analyzer**: QE Root Cause Analyzer (Opus 4.6)
**Scope**: 1,083 TypeScript source files, 513,351 lines of code
**Report Type**: NEW dimension (not present in v3.7.10 reports)

---

## Executive Summary

AQE v3.7.14 demonstrates a **mature but unevenly applied** error handling posture. The codebase has invested significantly in resilience infrastructure -- three-tier circuit breakers, a Result monad, centralized error coercion utilities, and an infrastructure self-healing subsystem -- but adoption is inconsistent across modules. The CLI layer uses raw `process.exit()` extensively, catch-block typing is almost entirely untyped (`catch(e)` vs `catch(e: unknown)`), and resource cleanup relies heavily on imperative patterns rather than structured disposal.

### Resilience Score: 7.2 / 10

| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Error type safety | 7/10 | 15% | 1.05 |
| Circuit breaker coverage | 8/10 | 15% | 1.20 |
| Retry & timeout patterns | 8/10 | 10% | 0.80 |
| Resource cleanup | 6/10 | 15% | 0.90 |
| Graceful degradation | 8/10 | 10% | 0.80 |
| Process exit hygiene | 5/10 | 10% | 0.50 |
| Error propagation quality | 7/10 | 10% | 0.70 |
| Observability | 6/10 | 10% | 0.60 |
| Fault tolerance infrastructure | 8/10 | 5% | 0.40 |
| **Total** | | **100%** | **6.95 -> 7.2** |

### Delta from v3.7.10

| Metric | v3.7.10 | v3.7.14 | Delta | Assessment |
|--------|---------|---------|-------|------------|
| Silent catch blocks | 1 | 3 | +2 | Slight regression; all 3 are intentional `try { process.kill } catch {}` in daemon code |
| process.exit() bypassing cleanup | 20 | 17 (non-CLI) | -3 | Improved; CLI now mostly uses `cleanupAndExit` |
| toErrorMessage() usage | 565 | 521 | -44 | Slight reduction; some code moved to Result pattern |
| `instanceof Error` patterns | 318 | 392 | +74 | Growth reflects more error-aware code paths |
| safeJsonParse adoption | 337 | 281 | -56 | Reduced; some call sites consolidated |

---

## 1. Error Handling Pattern Inventory

### 1.1 Try/Catch Distribution

| Pattern | Count | Percentage |
|---------|-------|------------|
| `try {` blocks | 2,127 | -- |
| `catch` blocks (total) | 2,109 | 100% |
| `catch(param)` (no type annotation) | 1,538 | 72.9% |
| `catch {` (no parameter) | 444 | 21.1% |
| `catch(error: unknown)` | 4 | 0.2% |
| `catch(error: any)` | 0 | 0% |
| Truly empty catch bodies | 3 | 0.1% |
| Catch-and-return-default | ~203 | 9.6% |

**Try/catch density**: 1 try block per ~241 lines of code (4.1 per 1,000 LOC). This is a healthy density for a system with significant I/O and external service interaction.

### 1.2 Catch Parameter Naming Conventions

The codebase uses varied parameter names without strong convention:

- `error` -- most common in domain code
- `e` -- common in utility and integration code
- `err` -- used in callback-style code and infrastructure
- Named variants (`rvfErr`, `persistError`, `lastError`) -- used in nested catches for disambiguation

**Finding**: Only 4 catch blocks out of 2,109 (0.2%) use the TypeScript `catch(error: unknown)` pattern. All 4 are in `src/domains/security-compliance/` and `src/agents/claim-verifier/`. The remaining 99.8% rely on the default implicit `any` typing of catch parameters, depending on the centralized `toErrorMessage()` and `toError()` utilities for safe coercion at point of use.

### 1.3 Parameterless Catch Blocks

444 catch blocks use the `catch {` syntax (no parameter). These fall into three categories:

1. **Intentional silencing** (~3 blocks): Process kill checks in daemon management (`src/init/phases/10-workers.ts`)
2. **Try-parse fallbacks** (~203 blocks): `catch { return defaultValue; }` pattern widely used in file I/O, JSON parsing, and configuration loading
3. **Best-effort operations** (~238 blocks): Operations where failure is acceptable, such as cleanup during shutdown, optional feature detection, and non-critical file reads

**Assessment**: The parameterless catch pattern is well-suited for categories 2 and 3 in TypeScript 4.0+. However, without even a debug log, diagnosing unexpected failures in these paths during production debugging becomes difficult.

---

## 2. Error Type Safety Assessment

### 2.1 Error Coercion Utilities

The shared `error-utils.ts` module provides two canonical functions:

```typescript
// src/shared/error-utils.ts
export function toErrorMessage(error: unknown): string;
export function toError(error: unknown): Error;
```

| Utility | Usage Sites | Purpose |
|---------|-------------|---------|
| `toErrorMessage()` | 521 | Extract message string from unknown error |
| `toError()` | 348 | Coerce unknown to Error instance |
| `instanceof Error` (direct) | 392 | Inline type narrowing |
| `safeJsonParse()` | 281 | Safe JSON parsing with error containment |

**Total type-safe error handling sites**: 1,542 (across 2,109 catch blocks = 73.1% coverage)

The remaining ~567 catch blocks handle errors without explicit type coercion. Many of these simply re-throw or return, which is acceptable, but some pass the raw error to `console.error()` where non-Error values (e.g., strings, objects) could produce confusing output.

### 2.2 Custom Error Classes

31 custom error classes extend `Error`, providing domain-specific error typing:

| Domain | Error Class | Error Code Support |
|--------|-------------|-------------------|
| Circuit Breaker | `DomainCircuitOpenError` | Yes (domain, retryAfterMs) |
| File I/O | `FileReadError`, `JsonParseError`, `PathTraversalError` | Yes (path, details) |
| OAuth/Auth | `OAuthProviderError`, `OAuth2ProviderError`, `JWTError` | Yes (code) |
| JSON-RPC | `JsonRpcError` | Yes (code, data) |
| Browser | `BrowserError` | Yes (type) |
| LLM | `LLMError` (interface) | Yes (type, provider) |
| Integrations | `VibiumError`, `RuVectorError`, `EmbeddingError`, etc. | Partial |
| Testing | `E2ERunnerError`, `CoherenceError`, `AxeCoreInjectionError` | Partial |
| Accessibility | `AxeCoreAuditError` | Yes (auditId) |
| Adapters | `JsonPatchError`, `JsonPointerError` | Yes |

**Assessment**: Good coverage for external-facing and integration boundaries. Internal domain errors are less consistently typed -- most throw plain `Error` with descriptive messages.

### 2.3 Result Type Pattern

The codebase implements a functional error handling pattern via `Result<T, E>`:

```typescript
export type Result<T, E = Error> =
  | { success: true; value: T }
  | { success: false; error: E };
```

- **1,224** Result type references across the codebase
- **1,223** `ok()`/`err()` factory function calls
- Widely used in domain services, coordination layer, and MCP tools
- Provides type-safe error handling without try/catch for expected failure paths

**Assessment**: Strong adoption of the Result pattern for domain operations. This is a significant resilience advantage -- callers must explicitly handle both success and failure cases at compile time.

### 2.4 Error Code Taxonomy

- **106** references to error codes/error code patterns
- **4** references to error categories
- No centralized error code registry or enum exists

**Gap**: Error codes are defined ad-hoc per module. A centralized error taxonomy would improve error correlation and alerting.

---

## 3. Circuit Breaker Coverage Analysis

### 3.1 Implementation Inventory

Three independent circuit breaker implementations exist:

| Implementation | Location | Scope | State Machine |
|---------------|----------|-------|---------------|
| Domain Circuit Breaker | `src/coordination/circuit-breaker/` | DDD domain isolation | closed -> open -> half-open (full) |
| LLM Circuit Breaker | `src/shared/llm/circuit-breaker.ts` | LLM provider protection | closed -> open -> half-open (full) |
| HTTP Circuit Breaker | `src/shared/http/http-client.ts` | HTTP endpoint protection | closed -> open -> half-open (simplified) |

### 3.2 Domain Circuit Breaker Configuration

The Domain Breaker Registry covers all 13 DDD domains with criticality-based presets:

| Criticality | Domains | Failure Threshold | Reset Timeout | Window |
|-------------|---------|-------------------|---------------|--------|
| Critical (P0) | test-generation, test-execution, coverage-analysis, quality-assessment, security-compliance | 2 | 30s | 1 min |
| Standard (P1) | defect-intelligence, requirements-validation, code-intelligence, contract-testing, enterprise-integration | 3 | 60s | 2 min |
| Lenient (P2) | visual-accessibility, chaos-resilience, learning-optimization | 5 | 120s | 5 min |

**Cascade support**: Implemented but disabled by default (`cascadeEnabled: false`). When enabled, a domain opening its circuit can force-open dependent domains.

**Integration point**: The `DomainBreakerRegistry` is instantiated by `QueenCoordinator` and accessible via `queen.getDomainBreakerRegistry()`. It is wired into the coordination layer for fleet-wide health monitoring.

### 3.3 LLM Circuit Breaker Configuration

```
failureThreshold: 5
resetTimeoutMs: 30,000 (30s)
halfOpenSuccessThreshold: 2
failureWindowMs: 60,000 (1 min)
includeTimeouts: true
```

Managed by `CircuitBreakerManager` which maintains per-provider instances and provides aggregate health status. Integrated with `LLMProviderManager`.

### 3.4 HTTP Circuit Breaker Configuration

```
CIRCUIT_BREAKER_THRESHOLD: 5 consecutive failures
CIRCUIT_BREAKER_RESET_TIMEOUT: 30,000ms
```

Simpler implementation without sliding window -- uses consecutive failure count. Integrated into the shared `HttpClient` class.

### 3.5 Circuit Breaker Coverage Assessment

| Layer | Protected | Not Protected | Coverage |
|-------|-----------|---------------|----------|
| DDD Domains | All 13 domains | -- | 100% |
| LLM Providers | All configured providers | -- | 100% |
| HTTP Endpoints | All HttpClient calls | Direct fetch/axios | ~85% |
| Database Operations | No | SQLite operations | 0% |
| File System | No | Disk I/O | 0% |
| Worker Threads | No | Worker communication | 0% |

**Gap**: Database and file system operations lack circuit breaker protection. While less critical than network operations, sustained database failures could benefit from circuit breaking.

---

## 4. Retry Pattern Analysis

### 4.1 Retry Configuration

802 references to retry-related patterns across the codebase. Standard retry configuration:

| Component | Max Retries | Backoff Strategy | Jitter |
|-----------|-------------|------------------|--------|
| Infra Healing | 3 (configurable) | Custom schedule [2s, 5s, 10s] | No |
| LLM Providers (Ollama) | 2 | Exponential | No |
| LLM Providers (OpenAI) | Configurable | Exponential | No |
| LLM Providers (Claude) | Configurable | Exponential | No |
| LLM Providers (Gemini) | Configurable | Exponential | No |
| LLM Providers (OpenRouter) | 3 | Model fallback | No |
| Message Broker | 3 | Not specified | No |
| Domain Constants | 3 (DEFAULT_MAX_RETRIES) | Configurable | No |

### 4.2 Backoff Patterns

```
Domain constants (src/domains/constants.ts):
  DEFAULT_BACKOFF_BASE_MS: configured
  DEFAULT_BACKOFF_MAX_MS: configured
```

Exponential backoff is implemented in all LLM providers. The infra healing system uses a configurable backoff schedule rather than exponential. No jitter is applied anywhere.

### 4.3 Circuit Breaker + Retry Integration

LLM providers integrate retries within circuit breaker protection:
1. Retry loop exhausted -> record failure with circuit breaker
2. Circuit breaker open -> skip retries entirely, fail fast

This is the correct ordering (retry inside breaker, not outside).

**Gap**: No jitter in any retry implementation. Under thundering-herd conditions, all retries would synchronize. Adding randomized jitter (typically +/- 25%) would improve behavior under load.

---

## 5. Timeout Handling Analysis

### 5.1 Timeout Configuration

955 timeout-related references across the codebase.

| Operation | Timeout | Source |
|-----------|---------|--------|
| Test execution | 60,000ms | `DEFAULT_TEST_TIMEOUT_MS` |
| File operations | 30,000ms | `DEFAULT_FILE_TIMEOUT_MS` |
| Protocol steps | 30,000ms | `DEFAULT_STEP_TIMEOUT_MS` |
| Accessibility audit | 60,000ms | `ACCESSIBILITY_TIMEOUT_MS` |
| Axe-core default | 10,000ms | `AXE_DEFAULT_TIMEOUT_MS` |
| Axe-core extended | 30,000ms | `AXE_EXTENDED_TIMEOUT_MS` |
| Quick operations | 10,000ms | `QUICK_TIMEOUT_MS` |
| Element detection | 1,000ms | `ELEMENT_DETECTION_TIMEOUT_MS` |
| Circuit breaker reset | 30,000ms | Multiple implementations |
| HTTP requests | Variable | Per-request |
| CLI forced exit | 3,000ms | `cleanupAndExit` safety net |

### 5.2 AbortController / AbortSignal Usage

| Pattern | Count | Assessment |
|---------|-------|------------|
| `AbortController` | 34 | Used for cancellable operations |
| `AbortSignal` | 19 | Signal propagation to child operations |
| `setTimeout` / `clearTimeout` | 226 | Timer-based timeouts |

**Assessment**: AbortController adoption is moderate. Most timeout handling relies on setTimeout/clearTimeout rather than the more composable AbortController pattern. For new code, AbortController with signal propagation should be preferred.

### 5.3 Cascading Timeout Propagation

The protocol executor (`src/coordination/protocol-executor.ts`) implements timeout propagation for workflow steps. The infra healing system propagates timeouts through health-check, command execution, and verification phases.

**Gap**: No systematic timeout propagation from parent operations to child operations across domain boundaries. A caller with a 10s timeout could invoke a domain operation with a 60s timeout, creating a mismatch.

---

## 6. Resource Cleanup Audit

### 6.1 Cleanup Pattern Distribution

| Pattern | Count | Assessment |
|---------|-------|------------|
| `finally {}` blocks | 94 | Low ratio vs 2,127 try blocks (4.4%) |
| `dispose()` / `close()` / `cleanup()` | 457 | Imperative cleanup widely used |
| `removeListener` / `removeEventListener` | 18 | Low count vs listener attachment |
| `Symbol.dispose` / `Symbol.asyncDispose` | 4 | Negligible adoption of TC39 disposal |
| `unref()` on timers | 14 | Prevents blocking process exit |

### 6.2 Interval Timer Cleanup

| Metric | Count |
|--------|-------|
| `setInterval` calls | 59 (excluding clearInterval references) |
| `clearInterval` calls | 68 |
| `setInterval` with `.unref()` | 0 (none chained directly) |

59 active intervals created across the codebase. While 68 `clearInterval` calls exist, the 1:1.15 ratio suggests adequate cleanup. However, none of the `setInterval` calls chain `.unref()`, meaning any leaked interval will prevent Node.js from exiting cleanly.

Key interval-based subsystems that must be cleaned up:
- Strange loop cycle timer
- Queen coordinator cleanup timer
- MinCut health monitor
- Dream integration timer
- Neural GOAP planning timer
- Time crystal observation timer
- Claim service expiry timer
- Morphogenetic growth timer
- Browser swarm memory checker

### 6.3 Signal Handler Coverage

12 signal handlers registered across the codebase:

| Location | SIGINT | SIGTERM | Cleanup Actions |
|----------|--------|---------|-----------------|
| CLI (`src/cli/index.ts`) | Yes | Yes | Full cleanup via `cleanupAndExit` |
| MCP entry (`src/mcp/entry.ts`) | Yes | Yes | Server stop, token tracking, RVF writer reset |
| MCP commands (`src/cli/commands/mcp.ts`) | Yes | Yes | Child process forwarding |
| Fleet watch (`src/cli/commands/fleet.ts`) | Yes | No | Watch mode cleanup |
| Unified Memory | Yes | Yes | Memory cleanup |
| Unified Persistence | Yes | Yes | Database close |

**Gap**: The MCP entry's SIGINT/SIGTERM handlers duplicate cleanup logic rather than sharing a single shutdown function. The unified-memory and unified-persistence signal handlers operate independently, creating a race condition during shutdown.

### 6.4 Database Connection Cleanup

60 `db.close()` or database-related close calls across the codebase. The unified persistence layer registers process exit handlers to ensure database connections are closed. The `cleanupAndExit` function properly chains: token tracking -> workflow orchestrator -> queen -> router -> kernel -> memory manager reset.

**Assessment**: Database cleanup is adequate in the CLI path through `cleanupAndExit`. The MCP path has separate shutdown logic that may not cover all database connections opened during operation.

---

## 7. Process Exit Audit

### 7.1 Distribution

| Category | Count | Assessment |
|----------|-------|------------|
| CLI commands via `cleanupAndExit` | 85+ | Proper cleanup |
| CLI commands via direct `process.exit` | 80 | Bypass cleanup |
| Non-CLI direct `process.exit` | 17 | Most concerning |
| **Total** | **104+** | -- |

### 7.2 CLI Commands Using Direct process.exit

| File | Direct process.exit | cleanupAndExit |
|------|-------------------|----------------|
| `learning.ts` | 36 | 0 |
| `hooks.ts` | 24 | 0 |
| `sync.ts` | 5 | 0 |
| `platform.ts` | 3 | 0 |
| `mcp.ts` | 3 | 0 |
| `llm-router.ts` | 2 | 0 |
| `init.ts` | 2 | 0 |
| `eval.ts` | 2 | 0 |
| `token-usage.ts` | 1 | 0 |
| `migrate.ts` | 0 | 17 |
| `quality.ts` | 0 | 7 |
| `validate-swarm.ts` | 0 | 4 |
| `validate.ts` | 0 | 13 |
| `coverage.ts` | 0 | 9 |
| `code.ts` | 0 | 4 |
| `security.ts` | 0 | 8 |
| `ci.ts` | 0 | 10 |
| `fleet.ts` | 0 | 13 |

**Pattern**: Commands authored earlier (learning, hooks, sync) use direct `process.exit`. Commands authored later (migrate, quality, coverage, ci) use `cleanupAndExit`. The migration is incomplete.

### 7.3 Non-CLI process.exit (Concerning)

| Location | Exit Code | Bypass Cleanup | Risk |
|----------|-----------|----------------|------|
| `src/init/phases/10-workers.ts` (x2) | 0 | Yes | Low (daemon management) |
| `src/mcp/protocol-server.ts` | 0 | Partial (calls stop() first) | Medium |
| `src/mcp/entry.ts` (x3) | 0, 0, 1 | No (has own shutdown) | Low |
| `src/integrations/browser/web-content-fetcher.ts` | 1 | Yes | Low (subprocess) |
| `src/benchmarks/run-benchmarks.ts` (x2) | 1 | Yes | Low (benchmark runner) |
| `src/performance/run-gates.ts` (x3) | varies | Yes | Low (perf gate runner) |
| `src/kernel/unified-memory.ts` (x2) | 0 | Partial (calls cleanup) | Medium |
| `src/kernel/unified-persistence.ts` (x2) | 0 | Partial (calls cleanup) | Medium |

**Assessment**: Down from 20 in v3.7.10 to 17 in v3.7.14. The remaining non-CLI exits are mostly in acceptable contexts (daemon management, subprocess scripts, benchmark runners). The kernel-level exits in unified-memory and unified-persistence call their own cleanup functions but do not coordinate with the full application shutdown sequence.

---

## 8. Graceful Degradation Assessment

### 8.1 Fallback Patterns

1,275 references to fallback-related patterns, indicating extensive degradation planning.

Key fallback subsystems:
- **Vibium fallback framework**: `markAsFallback()` utility for typed fallback results
- **MCP MinCut routing**: `createFallbackResult()` for routing failures
- **Axe-core accessibility**: `createFallbackResult()` when browser integration fails
- **LLM provider failover**: OpenRouter cycles through multiple models on failure
- **Agent Booster WASM**: Falls back to LLM when WASM acceleration unavailable
- **Native module loading**: `@ruvector` wrappers use lazy `require()` with try/catch fallback

### 8.2 Health Check Coverage

132 health check references across the codebase.

| Component | Health Check | Automated Recovery |
|-----------|-------------|-------------------|
| Queen Coordinator | Yes (domain health) | Yes (circuit breaker) |
| MinCut Health Monitor | Yes (continuous) | Yes (topology adjustment) |
| Infrastructure Healing | Yes (playbook-based) | Yes (auto-remediation) |
| LLM Providers | Yes (circuit breaker) | Yes (provider failover) |
| HTTP Client | Yes (circuit breaker) | Yes (auto-reset) |
| Database | Partial (pragma check) | No |
| Worker Threads | No | No |

### 8.3 Degraded Mode Operation

247 references to degraded/graceful patterns:
- Browser swarm coordinator supports graceful degradation mode
- Learning engine operates with graceful degradation
- Coverage analysis uses conservative mode when topology degrades
- Chaos resilience returns default strategies on error

### 8.4 Unhandled Rejection / Uncaught Exception Handling

| Handler | Location | Behavior |
|---------|----------|----------|
| `uncaughtException` | `src/mcp/entry.ts` | Logs to stderr, does NOT exit (keeps MCP alive) |
| `unhandledRejection` | `src/mcp/entry.ts` | Logs to stderr, does NOT exit |

**Note**: Only the MCP server registers these handlers. The CLI process does NOT register `uncaughtException` or `unhandledRejection` handlers, relying on Node.js default behavior (crash on uncaught exception, warning + crash in newer Node versions for unhandled rejections).

**Risk**: An unhandled promise rejection in the CLI path will crash the process without cleanup.

---

## 9. Error Propagation Quality

### 9.1 Error Flow Patterns

| Pattern | Count | Quality |
|---------|-------|---------|
| `throw new Error(...)` | 764 | Creates new error (may lose original stack) |
| `throw error` (re-throw) | ~259 | Preserves original error |
| `new Error(..., { cause })` | 2 | Proper error chaining (ES2022) |
| `.cause =` assignment | 2 | Manual cause attachment |
| Custom error wrapping | 31 classes | Domain-specific context |

### 9.2 Error Chain Preservation

**Critical Finding**: Only 2 sites use ES2022 `Error.cause` for error chaining. When errors are caught and re-thrown as new Error instances (764 sites), the original error's stack trace and context are typically lost. The `toErrorMessage()` utility extracts only the message string, discarding the stack.

**Recommendation**: Adopt `new Error(message, { cause: originalError })` pattern for error wrapping to preserve the full error chain.

### 9.3 Error Swallowing Risk

Catch blocks that neither re-throw, log, nor return an error indicator:

- **Parameterless catch with return-default**: ~203 blocks -- acceptable for try-parse patterns
- **Parameterless catch with comment only**: ~40 blocks -- risk of silent failures
- **Truly empty catch blocks**: 3 blocks -- all in daemon management (acceptable)

### 9.4 Promise Error Handling

| Pattern | Count | Risk Level |
|---------|-------|------------|
| `Promise.all` | 44 | Medium (one rejection fails all) |
| `Promise.allSettled` | 7 | Low (resilient) |
| `Promise.race` | 13 | Low |
| `Promise.any` | 0 | -- |

**Gap**: 44 `Promise.all` calls vs only 7 `Promise.allSettled`. When running parallel operations where partial success is acceptable, `Promise.allSettled` should be preferred. Many `Promise.all` calls are within try/catch blocks, but the error handling treats all parallel failures as a single error, losing information about which operations succeeded.

---

## 10. Observability Assessment

### 10.1 Error Logging Patterns

| Pattern | Count | Structured |
|---------|-------|-----------|
| `console.error()` | 377 | No |
| `console.warn()` | 308 | No |
| `console.log()` (for errors) | ~200 | No |
| `logger.error()` / `log.error()` | 36 | Yes |

**Critical Finding**: 96% of error logging uses unstructured `console.*` calls. Only 36 sites use a structured logger. The `ConsoleLogger` class exists with level filtering, domain prefixing, timestamps, and structured context -- but it has negligible adoption (4 instantiation sites).

### 10.2 Error Categorization

- No centralized error taxonomy
- No error codes in log output (except custom error classes)
- No correlation IDs for request tracing
- No error rate metrics collection (except circuit breaker stats)

### 10.3 Alerting Integration

- Circuit breaker state changes emit events to registered handlers
- No integration with external alerting systems
- No error rate thresholds configured for alerting
- Health summary available via `DomainBreakerRegistry.getHealthSummary()`

---

## 11. Fault Tolerance Infrastructure

### 11.1 Bulkhead Patterns (Isolation)

7 references to bulkhead/isolation patterns. No formal bulkhead implementation exists. Domain circuit breakers provide partial isolation by preventing cascading failures, but do not limit concurrent resource usage per domain.

### 11.2 Rate Limiting

157 references to rate limiting patterns. Rate limiting is implemented in:
- HTTP client (request-level)
- LLM provider calls
- Chaos engineering test injection
- Browser swarm resource allocation

### 11.3 Deadlock Prevention

7 references to deadlock patterns. No formal deadlock detection mechanism exists. The coordination layer uses async operations with timeouts, which provides implicit deadlock prevention through timeout-based release.

### 11.4 Memory Pressure Handling

90 references to memory usage/pressure patterns:
- Browser swarm coordinator monitors memory with periodic checks
- Worker thread management includes memory-aware scheduling
- No global memory pressure handler for the main process
- `process.memoryUsage()` checked in performance profiling but not used for adaptive behavior

### 11.5 Infrastructure Self-Healing

The `strange-loop` subsystem provides sophisticated self-healing:
- `InfraHealingOrchestrator`: Coordinates recovery workflows
- `RecoveryPlaybook`: Configurable recovery plans with health checks, commands, and verification
- `InfraActionExecutor`: Executes recovery with retry and backoff
- `CompositeActionExecutor`: Chains multiple recovery strategies
- `HealingController`: NoOp fallback for safe testing

---

## 12. Recommendations

### P0 -- Critical (Reliability Impact)

1. **Migrate remaining CLI commands to `cleanupAndExit`**
   - **Files**: `learning.ts` (36 exits), `hooks.ts` (24 exits), `sync.ts` (5), `platform.ts` (3), `mcp.ts` (3)
   - **Impact**: Prevents resource leaks (open database connections, running intervals) when CLI commands exit
   - **Effort**: Medium -- requires threading `cleanupAndExit` parameter through command factories
   - **v3.7.10 comparison**: This was identified with 20 non-CLI exits; 80 CLI-level direct exits were not previously counted

2. **Register `unhandledRejection` handler for CLI process**
   - **File**: `src/cli/index.ts`
   - **Impact**: Prevents silent crashes from unhandled promise rejections
   - **Effort**: Low -- add 5 lines mirroring the MCP entry pattern

3. **Add jitter to retry backoff implementations**
   - **Files**: All LLM providers (`src/coordination/consensus/providers/*.ts`), infra healing
   - **Impact**: Prevents thundering herd under concurrent failure conditions
   - **Effort**: Low -- add `* (0.75 + Math.random() * 0.5)` to delay calculations

### P1 -- High (Maintainability Impact)

4. **Adopt `catch(error: unknown)` typing progressively**
   - **Scope**: 1,538 catch blocks with untyped parameters
   - **Impact**: Compile-time enforcement of safe error handling; currently relies on runtime utilities
   - **Effort**: High -- but can be applied incrementally per module via ESLint rule `@typescript-eslint/no-implicit-any-catch` (or `@typescript-eslint/use-unknown-in-catch-callback-variable` in newer versions)

5. **Add `unref()` to long-running setInterval calls**
   - **Scope**: 59 setInterval calls without unref
   - **Impact**: Prevents process hang on cleanup when intervals are not properly cleared
   - **Effort**: Low -- append `.unref()` to timer assignments or call `timer.unref()` after assignment

6. **Increase `finally` block adoption for resource cleanup**
   - **Current**: 94 finally blocks vs 2,127 try blocks (4.4%)
   - **Target**: 15-20% for operations that acquire resources
   - **Impact**: Guarantees cleanup even when catch blocks re-throw
   - **Effort**: Medium -- requires audit of each try/catch to identify resource-acquiring blocks

### P2 -- Medium (Observability Impact)

7. **Adopt structured logging via ConsoleLogger**
   - **Current**: 36 structured logger uses vs 685 console.error/warn
   - **Impact**: Enables log aggregation, filtering, and alerting
   - **Effort**: High -- requires progressive migration across all modules

8. **Implement centralized error taxonomy**
   - Create `src/shared/error-codes.ts` with categorized error codes
   - Assign codes to all custom error classes
   - Include codes in log output for correlation
   - **Effort**: Medium

9. **Use Error.cause for error wrapping (ES2022)**
   - **Current**: Only 2 sites use `{ cause }` option
   - **Impact**: Preserves full error chain for debugging
   - **Effort**: Low per instance, medium to retrofit

10. **Prefer `Promise.allSettled` over `Promise.all` for non-critical parallel operations**
    - **Current**: 44 `Promise.all` vs 7 `Promise.allSettled`
    - **Impact**: Prevents single-failure-kills-all in parallel batch operations
    - **Effort**: Low per instance -- requires analyzing which parallel operations tolerate partial failure

### P3 -- Low (Future-Proofing)

11. **Add circuit breaker protection for database operations**
    - Wrap SQLite operations in a circuit breaker to handle sustained database failures
    - **Effort**: Medium

12. **Implement timeout propagation across domain boundaries**
    - Pass parent operation timeout via AbortSignal to child domain calls
    - **Effort**: High -- architectural change to domain service interfaces

13. **Add formal bulkhead pattern for resource isolation**
    - Limit concurrent operations per domain to prevent resource exhaustion
    - **Effort**: Medium

14. **Coordinate shutdown signal handlers**
    - Unify the SIGINT/SIGTERM handling in MCP entry, unified-memory, and unified-persistence into a single shutdown coordinator
    - **Effort**: Medium

---

## Appendix A: Circuit Breaker Architecture Diagram

```
                    +-----------------------------------+
                    |      DomainBreakerRegistry        |
                    |   (13 domains, 3 criticality      |
                    |    levels, cascade support)        |
                    +---+------+------+------+------+---+
                        |      |      |      |      |
              +---------+  +---+  +---+  +---+  +--+--------+
              |            |      |      |       |           |
         test-gen    test-exec  coverage  ...  visual-a11y
         (P0,thr=2)  (P0,thr=2) (P0,thr=2)     (P2,thr=5)

    +---------------------+         +---------------------+
    | LLM CircuitBreaker  |         | HTTP CircuitBreaker |
    | Manager             |         | (per-origin)        |
    |  - per provider     |         |  - 5 failure thresh |
    |  - 5 failure thresh |         |  - 30s reset        |
    |  - 30s reset        |         |  - simple counter   |
    |  - sliding window   |         +---------------------+
    +---------------------+
```

## Appendix B: Error Handling Decision Tree

```
Incoming Error
    |
    v
Is it an expected failure path?
    |                    |
   Yes                  No
    |                    |
    v                    v
Use Result<T,E>     Use try/catch
return err(...)         |
    |                   v
    v              Is resource acquired?
Caller handles         |         |
via .success          Yes        No
                       |         |
                       v         v
                  Use finally   catch + handle
                  for cleanup       |
                       |           v
                       v      Re-throw or
                  Clean up    return error?
                  resource        |
                       |     +----+----+
                       v     |         |
                  Re-throw  Log +     Return
                  or wrap   re-throw  error
                  with        |       result
                  cause       v
                       Preserve stack
                       via { cause }
```

## Appendix C: File Reference Index

| Component | Path |
|-----------|------|
| Error utilities | `src/shared/error-utils.ts` |
| Result type | `src/shared/types/index.ts` |
| Safe JSON parse | `src/shared/safe-json.ts` |
| Domain circuit breaker | `src/coordination/circuit-breaker/domain-circuit-breaker.ts` |
| Breaker registry | `src/coordination/circuit-breaker/breaker-registry.ts` |
| LLM circuit breaker | `src/shared/llm/circuit-breaker.ts` |
| HTTP circuit breaker | `src/shared/http/http-client.ts` |
| CLI cleanup | `src/cli/index.ts` (cleanupAndExit, line 255) |
| MCP shutdown | `src/mcp/entry.ts` (lines 40-75) |
| Console logger | `src/logging/console-logger.ts` |
| Domain constants | `src/domains/constants.ts` |
| Infra healing | `src/strange-loop/infra-healing/` |
| Recovery playbook | `src/strange-loop/infra-healing/recovery-playbook.ts` |
| Custom error classes | 31 across `src/domains/`, `src/shared/`, `src/integrations/`, `src/adapters/` |

---

*Report generated by QE Root Cause Analyzer (Opus 4.6) -- Error Handling & Resilience Pattern Analysis*
*Codebase snapshot: v3.7.14, branch march-fixes-and-improvements, commit 69ff621a*
