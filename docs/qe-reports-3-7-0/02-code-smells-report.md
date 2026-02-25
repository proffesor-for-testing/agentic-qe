# Code Smells Report -- AQE v3.7.0

**Date**: 2026-02-23
**Scope**: `/workspaces/agentic-qe-new/v3/src/` (1,002 TypeScript files, ~489,405 lines)
**Baseline**: v3.6.8 metrics where available
**Reviewer**: QE Code Reviewer (claude-opus-4-6)

---

## Executive Summary

| Category | v3.6.8 Baseline | v3.7.0 Current | Delta | Severity |
|----------|----------------|----------------|-------|----------|
| `as any` casts | 103 | **1** (+ 2 comments) | -99% | Low (resolved) |
| `error instanceof Error` inline patterns | 724 | **273** (103 files) | -62% | Medium |
| `console.*` calls in src/ | 216 | **3,178** | +1,371% | Critical |
| Magic numbers | 60+ | **60+** estimated | ~0% | Medium |
| Silent catch blocks (comment-only) | ~15 | **~130** | +767% | High |
| Deep imports (4+ levels `../`) | 23+ | **0** | -100% | Low (resolved) |
| Deep imports (3 levels `../`) | n/a | **430** (142 files) | n/a | Low |
| Files over 500-line limit | n/a | **411** (41% of codebase) | n/a | High |
| TODO/FIXME/HACK markers | n/a | **25** | n/a | Low |

**Overall Code Health Grade: C+**

The codebase has made exceptional progress on type safety (`as any` down from 103 to 1) and deep imports (completely eliminated at 4+ levels). However, console.* pollution has grown dramatically, silent catch blocks have multiplied, and the 500-line file limit convention is violated by 41% of files. The `error-utils` shared module exists but adoption sits at only ~50%.

---

## 1. `as any` Casts

**Current count: 1 actual cast (down from 103)**

The v3.6.8-to-v3.7.0 cleanup was highly effective. Only one genuine `as any` cast remains in production code:

| # | File | Line | Context |
|---|------|------|---------|
| 1 | `v3/src/domains/test-generation/generators/jest-vitest-generator.ts` | 231 | `'undefined as any'` -- string literal in generated test code output |

Two additional mentions exist but are documentation comments, not casts:
- `v3/src/coordination/queen-lifecycle.ts:31` -- JSDoc: "ADR-047: Uses proper typing instead of `as any`"
- `v3/src/mcp/server.ts:12` -- JSDoc: "parameter types are assignable without `as any`"

**Verdict**: The remaining cast is in generated test output (a string template), not actual TypeScript. This category is effectively **resolved**.

---

## 2. Error Coercion Patterns

**Current count: 273 inline `error instanceof Error ?` patterns across 103 files**

### Shared Utility Adoption

The shared utility module at `/workspaces/agentic-qe-new/v3/src/shared/error-utils.ts` provides:
- `toErrorMessage(error: unknown): string` -- replaces `error instanceof Error ? error.message : String(error)`
- `toError(error: unknown): Error` -- replaces `error instanceof Error ? error : new Error(String(error))`

**Adoption status**:
- 268 files import from `error-utils.ts`
- 1,049 usages of `toErrorMessage`/`toError` in production code
- But 273 inline patterns persist across 103 files (mostly in integrations and older modules)

### Breakdown by pattern type

| Pattern | Count |
|---------|-------|
| `error instanceof Error ? error.message : String(error)` | 1 inline (+ definition in error-utils.ts) |
| `error instanceof Error ? error : new Error(String(error))` | 0 inline (only in error-utils.ts) |
| General `error instanceof Error ?` (various forms) | 273 total across 103 files |

### Top offending files (by inline error pattern count)

| File | Count |
|------|-------|
| `v3/src/integrations/browser/agent-browser/client.ts` | 32 |
| `v3/src/cli/commands/hooks.ts` | 17 |
| `v3/src/cli/commands/learning.ts` | 14 |
| `v3/src/domains/code-intelligence/services/c4-model/index.ts` | 8 |
| `v3/src/mcp/http-server.ts` | 8 |
| `v3/src/domains/security-compliance/services/security-auditor.ts` | 8 |
| `v3/src/integrations/vibium/client.ts` | 8 |
| `v3/src/integrations/agentic-flow/agent-booster/adapter.ts` | 7 |
| `v3/src/adapters/a2a/auth/routes.ts` | 6 |
| `v3/src/adapters/claude-flow/pretrain-bridge.ts` | 5 |

**Recommendation**: Migrate the remaining 273 inline patterns to use `toErrorMessage()`/`toError()`. Focus on `agent-browser/client.ts` (32 occurrences) and CLI commands first.

---

## 3. `console.*` Calls in Production Code

**Current count: 3,178 console calls across TypeScript files (v3.6.8 baseline: 216)**

This is the single largest regression in v3.7.0. The count has grown by over 14x.

### Breakdown by type

| Method | Count |
|--------|-------|
| `console.log` | 2,301 |
| `console.error` | 399 |
| `console.warn` | 357 |
| `console.debug` | 102 |
| `console.info` | 19 |
| **Total** | **3,178** |

### Top 20 worst files

| # | File | Count |
|---|------|-------|
| 1 | `v3/src/cli/commands/learning.ts` | 162 |
| 2 | `v3/src/cli/index.ts` | 141 |
| 3 | `v3/src/cli/commands/migrate.ts` | 99 |
| 4 | `v3/src/cli/commands/init.ts` | 92 |
| 5 | `v3/src/cli/commands/sync.ts` | 87 |
| 6 | `v3/src/cli/commands/hooks.ts` | 81 |
| 7 | `v3/src/cli/commands/llm-router.ts` | 73 |
| 8 | `v3/src/cli/commands/token-usage.ts` | 67 |
| 9 | `v3/src/integrations/agentic-flow/model-router/example.ts` | 66 |
| 10 | `v3/src/cli/handlers/init-handler.ts` | 63 |
| 11 | `v3/src/cli/commands/validate.ts` | 54 |
| 12 | `v3/src/cli/commands/fleet.ts` | 51 |
| 13 | `v3/src/cli/commands/qe-tools.ts` | 50 |
| 14 | `v3/src/cli/handlers/status-handler.ts` | 48 |
| 15 | `v3/src/cli/commands/code.ts` | 48 |
| 16 | `v3/src/domains/chaos-resilience/services/chaos-engineer.ts` | 44 |
| 17 | `v3/src/cli/commands/eval.ts` | 40 |
| 18 | `v3/src/cli/commands/validate-swarm.ts` | 38 |
| 19 | `v3/src/cli/handlers/task-handler.ts` | 36 |
| 20 | `v3/src/cli/commands/coverage.ts` | 35 |

### Analysis

The CLI layer (`v3/src/cli/`) accounts for the vast majority of console calls. This is partially justified for a CLI tool (user-facing output), but the codebase has a `v3/src/logging/logger.ts` and `v3/src/logging/console-logger.ts` that should be the canonical output channels. Non-CLI files like `chaos-engineer.ts` (44 calls) and numerous domain coordinators using `console.log` directly represent genuine code smells.

**Recommendation**:
1. **CLI files**: Introduce a `CliOutput` abstraction that wraps `console.log` for user-facing output. This enables testing and redirection.
2. **Non-CLI files**: Replace all `console.*` calls with the structured logger from `v3/src/logging/logger.ts`.
3. Set up an ESLint rule (`no-console`) with overrides only for CLI entry points.

---

## 4. Magic Numbers

**Estimated count: 60+ significant magic numbers**

### Hardcoded timeouts

| File | Line | Value | Context |
|------|------|-------|---------|
| `v3/src/sync/cloud/tunnel-manager.ts` | 166, 215 | `1000` | Retry delay (ms) |
| `v3/src/coordination/consensus/providers/openrouter-provider.ts` | 407 | `10000` | Abort timeout (ms) |
| `v3/src/coordination/consensus/providers/ollama-provider.ts` | 570 | `5000` | Abort timeout (ms) |
| `v3/src/domains/visual-accessibility/services/accessibility-tester-browser.ts` | 158 | `10000` | Axe-core load timeout |
| `v3/src/domains/security-compliance/services/scanners/dast-scanner.ts` | 226, 317 | `30000` | DAST scan timeout |
| `v3/src/domains/security-compliance/services/security-auditor-dast.ts` | 54 | `30000` | DAST audit timeout |
| `v3/src/domains/test-execution/services/retry-handler.ts` | 588 | `1000` | Kill signal delay |

### Hardcoded intervals

| File | Line | Value | Context |
|------|------|-------|---------|
| `v3/src/shared/llm/cost-tracker.ts` | 336 | `60000` | Alert check interval |
| `v3/src/shared/llm/metrics/cost-metrics.ts` | 375 | `60000` | Alert check interval (duplicate) |
| `v3/src/mcp/security/rate-limiter.ts` | 475 | `60000` | Cleanup interval |

### Notable observations

The project has a `v3/src/kernel/constants.ts` file with 22 exported constants, but many modules bypass it with inline literals. The `60000` (1-minute interval) appears in at least 3 separate files with no shared constant.

**Recommendation**: Centralize timeout/interval/threshold constants into domain-specific config objects or extend `kernel/constants.ts`. At minimum, extract:
- `DEFAULT_RETRY_DELAY_MS = 1000`
- `DEFAULT_ABORT_TIMEOUT_MS = 10000`
- `DAST_SCAN_TIMEOUT_MS = 30000`
- `ALERT_CHECK_INTERVAL_MS = 60000`

---

## 5. Silent Catch Blocks

**Current count: ~130 catch blocks with comment-only bodies (no logging or re-throw)**

The v3.6.8 baseline reported ~15 silent catches. The count has grown significantly, though many now include inline comments explaining the rationale.

### Categorization

| Type | Count | Example |
|------|-------|---------|
| Comment-only, intentional (non-critical) | ~95 | `// Non-critical: cleanup errors during shutdown` |
| Comment-only, questionable | ~25 | `// Handle task failure` (no actual handling) |
| Comment-only, data-swallowing | ~10 | `// Skip duplicates or other errors` |

### Top files with silent catches

| File | Count | Notes |
|------|-------|-------|
| `v3/src/integrations/ruvector/sona-persistence.ts` | 4 | Graceful degradation patterns |
| `v3/src/coordination/task-executor.ts` | 4 | Mix of valid and questionable |
| `v3/src/integrations/browser/agent-browser/client.ts` | 4 | Cleanup/daemon teardown |
| `v3/src/integrations/browser/web-content-fetcher.ts` | 4 | Cleanup and cookie handling |
| `v3/src/coordination/protocols/security-audit.ts` | 4 | Scanner fallback paths |
| `v3/src/sync/cloud/postgres-writer.ts` | 4 | Batch retry and parsing |
| `v3/src/adapters/claude-flow/pretrain-bridge.ts` | 4 | Claude Flow unavailable fallbacks |
| `v3/src/integrations/coherence/engines/spectral-adapter.ts` | 3 | WASM error fallbacks |

### Problematic examples

```typescript
// v3/src/validation/swarm-skill-validator.ts:467
} catch (error) {
  // Handle task failure
}
// ^ Comment says "handle" but nothing is handled

// v3/src/workers/workers/learning-consolidation.ts:409
} catch (error) {
  // Skip duplicates or other errors
}
// ^ Silently swallowing ALL errors including data corruption
```

### Acceptable examples

```typescript
// v3/src/kernel/hybrid-backend.ts:401
} catch (e) {
  // Non-critical -- don't fail cleanup
}
// ^ Intentional: shutdown cleanup should not propagate errors
```

**Recommendation**:
1. Add `logger.debug()` calls to all "non-critical" catch blocks so errors are traceable in debug mode.
2. Review and fix the ~25 questionable catch blocks that claim to "handle" errors but do nothing.
3. The ~10 data-swallowing catches (e.g., "skip duplicates") should at minimum increment a metric counter.

---

## 6. Deep Relative Imports

### 4+ levels of `../` (target metric)

**Current count: 0 (down from 23+ in v3.6.8)**

This category is fully resolved. No imports with 4 or more `../` levels exist.

### 3 levels of `../` (informational)

**Current count: 430 imports across 142 files**

These are concentrated in deeply nested module structures:

| Directory pattern | Approximate count |
|-------------------|-------------------|
| `domains/*/services/*.ts` importing from `../../shared/` | ~180 |
| `integrations/*/` importing from `../../shared/` or `../../kernel/` | ~100 |
| `mcp/tools/*/` importing from domain coordinators | ~80 |
| Other | ~70 |

While 3-level imports are within the acceptable range, the high volume suggests the project could benefit from TypeScript path aliases (already partially adopted with `@shared/`).

**Recommendation**: Expand `@shared/`, `@kernel/`, `@domains/` path aliases to reduce 3-level imports incrementally.

---

## 7. Duplicated Patterns

### MCP Tool Registration

The `v3/src/mcp/protocol-server.ts` file (1,106 lines) contains **40+ `this.registerTool()` calls** in a monolithic registration method. Each follows an identical pattern:

```typescript
this.registerTool({
  name: 'tool_name',
  description: '...',
  inputSchema: { ... },
  handler: async (params) => { ... }
});
```

While the v3.6.8 report cited "6 identical loops," the current structure uses individual registrations rather than loops. However, the boilerplate per tool is significant and the file is 2x over the 500-line limit.

### Domain Coordinator Boilerplate

All 13 domain coordinators follow a nearly identical structure:
- Constructor with dependency injection
- `initialize()` method
- `handleTask()` dispatcher
- Error handling and logging patterns

Each coordinator file ranges from 800-1,750 lines. The `base-domain-coordinator.ts` exists (only 5 `console.error` calls itself) but coordinators override extensively rather than composing.

### Error Handling in MCP Handlers

Files in `v3/src/mcp/handlers/` share a repeated try/catch pattern:

| File | `getErrorMessage`/`toError` usage count |
|------|----------------------------------------|
| `memory-handlers.ts` | 9 |
| `task-handlers.ts` | 11 |
| `team-handlers.ts` | 7 |
| `handler-factory.ts` | 5 |
| `agent-handlers.ts` | 5 |
| `core-handlers.ts` | 4 |

These could benefit from a shared error-handling middleware/wrapper.

**Recommendation**:
1. Extract `protocol-server.ts` tool registration into a registry pattern with auto-discovery.
2. Create a `withErrorHandling()` higher-order function for MCP handler wrapping.
3. Consider code-generating domain coordinator scaffolding.

---

## 8. Dead Code Indicators

### TODO/FIXME/HACK Markers

**Count: 25 across 16 files**

| Marker | Count |
|--------|-------|
| TODO | ~18 |
| FIXME | ~5 |
| HACK | ~2 |

These are at a healthy low level and are not flagged as a concern.

### Underscore-prefixed catch parameters

Only 1 file uses `catch(_error)` pattern (suppressing the unused variable):
- `v3/src/domains/quality-assessment/coordinator.ts`

This is healthy -- most catch blocks name their parameter and should use it.

### Files Exceeding 500-Line Convention

**411 files (41% of the codebase) exceed the 500-line limit.**

Top 10 offenders:

| File | Lines | Over limit by |
|------|-------|---------------|
| `v3/src/coordination/task-executor.ts` | 2,173 | 1,673 (4.3x) |
| `v3/src/learning/qe-reasoning-bank.ts` | 1,941 | 1,441 (3.9x) |
| `v3/src/domains/requirements-validation/qcsd-refinement-plugin.ts` | 1,861 | 1,361 (3.7x) |
| `v3/src/domains/contract-testing/services/contract-validator.ts` | 1,824 | 1,324 (3.6x) |
| `v3/src/domains/test-generation/services/pattern-matcher.ts` | 1,769 | 1,269 (3.5x) |
| `v3/src/domains/learning-optimization/coordinator.ts` | 1,750 | 1,250 (3.5x) |
| `v3/src/cli/completions/index.ts` | 1,730 | 1,230 (3.5x) |
| `v3/src/coordination/mincut/time-crystal.ts` | 1,713 | 1,213 (3.4x) |
| `v3/src/domains/chaos-resilience/coordinator.ts` | 1,701 | 1,201 (3.4x) |
| `v3/src/domains/requirements-validation/qcsd-ideation-plugin.ts` | 1,698 | 1,198 (3.4x) |

This is a systemic issue. Many of these files combine multiple responsibilities (e.g., `task-executor.ts` handles execution, metrics recording, and test running).

---

## 9. Additional Code Smells

### 9a. Logger Module Underutilization

The codebase has a proper logging infrastructure:
- `v3/src/logging/logger.ts`
- `v3/src/logging/console-logger.ts`

Yet 3,178 raw `console.*` calls bypass it. The logger module itself has only 1 `console.log` call (appropriate for the console logger implementation). The disconnect between having a logger and not using it is a significant architecture smell.

### 9b. Inconsistent Error Utility Adoption

The `error-utils.ts` module is imported by 268 files with 1,049 usages, but 273 inline `error instanceof Error` patterns persist. This creates two code paths for the same operation, making refactoring harder.

### 9c. 3-Level Import Depth in Domain Services

With 430 three-level imports across 142 files, the module boundary abstraction is leaky. The partially adopted `@shared/` path alias (used in ~20 files like `e2e-coordinator.ts`) demonstrates the solution but adoption is incomplete.

### 9d. Protocol Server Monolith

`v3/src/mcp/protocol-server.ts` at 1,106 lines with 40+ tool registrations is a single-point-of-change bottleneck. Every new MCP tool requires modifying this file.

---

## Severity-Ranked Action Items

### Critical (P0) -- Address before next release

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 1 | **3,178 console.* calls** -- Replace non-CLI calls with structured logger | Observability, testing, production hygiene | High |

### High (P1) -- Address within 2 sprints

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 2 | **411 files over 500 lines** -- Split top 20 largest files | Maintainability, review velocity | High |
| 3 | **~130 silent catch blocks** -- Add debug logging or metric counters | Debuggability, error visibility | Medium |
| 4 | **273 inline error patterns** -- Migrate to `toErrorMessage()`/`toError()` | Consistency, maintainability | Low |

### Medium (P2) -- Address within 1 quarter

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 5 | **Magic numbers** -- Centralize timeout/interval constants | Configurability, readability | Low |
| 6 | **Protocol server monolith** -- Extract tool registration | Modularity, developer experience | Medium |
| 7 | **430 three-level imports** -- Expand path aliases | Readability, refactoring safety | Medium |

### Low (P3) -- Track for future improvement

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 8 | **MCP handler boilerplate** -- Create error-handling HOF | DRY, consistency | Low |
| 9 | **Domain coordinator boilerplate** -- Better base class composition | DRY, velocity | Medium |

---

## Comparison to v3.6.8 Baseline

| Metric | v3.6.8 | v3.7.0 | Trend |
|--------|--------|--------|-------|
| `as any` casts | 103 | 1 | Excellent improvement |
| Error coercion (inline) | 724 | 273 | Good improvement (62% reduction) |
| `console.*` calls | 216 | 3,178 | Significant regression |
| Magic numbers | 60+ | 60+ | No change |
| Silent catches | ~15 | ~130 | Regression (codebase grew) |
| Deep imports (4+ `../`) | 23+ | 0 | Fully resolved |
| MCP registration duplication | 6 loops | 40+ individual calls | Structural change, not worse |

### Net assessment

Two categories saw **outstanding improvement** (`as any` elimination and deep import cleanup). Error coercion is trending in the right direction with the shared utility at ~50% adoption. The major regression is `console.*` proliferation, likely due to rapid CLI feature additions in v3.7.0 without enforcing the logger abstraction. Silent catch blocks scaled with codebase growth but the proportion remains similar.

---

*Report generated by QE Code Reviewer agent. All counts are based on static grep/ripgrep analysis of the source tree at commit `52b7926c` on branch `working-branch-feb`.*
