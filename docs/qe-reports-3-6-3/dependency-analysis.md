# Dependency Analysis Report - Agentic QE v3.6.3

**Generated**: 2026-02-11
**Scope**: `/workspaces/agentic-qe-new/v3/`
**Source files analyzed**: 937 TypeScript files
**Top-level modules**: 37
**Domains**: 13 bounded contexts

---

## Executive Summary

The v3 codebase has significant architectural debt in its dependency structure. While the Domain-Driven Design intent is clear (13 bounded contexts, microkernel architecture, shared kernel), the actual import graph reveals **88 circular dependency chains** at the module level, **8 upward dependency violations** in the shared kernel, and **every domain** violating its boundary by importing directly from `coordination`, `integrations`, and other infrastructure modules.

**Critical findings**:

1. **Shared kernel (`shared/`) imports upward** into `learning/` (7 files) and `mcp/` (1 file), breaking the foundational layer.
2. **Kernel imports all 13 domain plugins directly** (hard-coded factory map), creating a massive downward coupling that defeats the plugin architecture's purpose.
3. **MCP layer has the highest instability (I=0.83)** with fan-out to 25 modules -- it acts as a "god module" that reaches into everything.
4. **All 13 domains bypass their bounded context** by importing directly from `coordination/`, `integrations/`, and sibling domain barrel files.
5. **1 high-severity vulnerability** found: `@isaacs/brace-expansion` (transitive, fixable via `npm audit fix`).
6. **335 dynamic imports** undermine tree-shaking and increase bundle unpredictability.
7. **`@faker-js/faker` is in production dependencies** -- a test data generator that adds 5.2MB to the production bundle.

---

## 1. External Dependency Analysis

### 1.1 Runtime Dependencies Inventory

| Package | Version | Purpose | Size | Risk | Notes |
|---------|---------|---------|------|------|-------|
| `better-sqlite3` | ^12.5.0 | Core persistence (unified DB) | 12MB | **HIGH** | Native C++ addon, requires node-gyp build toolchain |
| `hnswlib-node` | ^3.0.0 | HNSW vector search for embeddings | 1.1MB | **HIGH** | Native C++ addon, platform-specific binaries |
| `@xenova/transformers` | ^2.17.2 | ML inference for embeddings | **154MB** | **HIGH** | Enormous footprint; downloads models at runtime |
| `@ruvector/gnn` | 0.1.19 | Graph neural networks | 15MB (combined) | **HIGH** | Native Rust addon, pinned version, platform overrides needed |
| `@ruvector/attention` | 0.1.3 | Attention mechanisms | (in @ruvector) | **HIGH** | Native Rust addon, pinned version |
| `@ruvector/sona` | 0.1.5 | Rust neural addon | (in @ruvector) | **MEDIUM** | Native Rust addon |
| `prime-radiant-advanced-wasm` | ^0.1.3 | WASM agent booster | small | **MEDIUM** | WebAssembly module, less portable |
| `pg` | ^8.17.2 | PostgreSQL client (cloud sync) | small | **MEDIUM** | Network dependency; only needed for cloud sync |
| `vibium` | ^0.1.2 | Browser automation | small | **MEDIUM** | Integration-only, not core |
| `axe-core` | ^4.11.1 | Accessibility testing engine | 2.9MB | **LOW** | Domain-specific (visual-accessibility) |
| `@faker-js/faker` | ^10.2.0 | Test data generation | **5.2MB** | **MEDIUM** | **Should be devDependency** -- test utility in prod deps |
| `uuid` | ^9.0.0 | UUID generation | tiny | **LOW** | Stable, widely used. Note: v13.0.0 available (major) |
| `chalk` | ^5.6.2 | Terminal colors | tiny | **LOW** | ESM-only since v5 |
| `commander` | ^12.1.0 | CLI framework | tiny | **LOW** | v14 available (major bump) |
| `fast-glob` | ^3.3.3 | File globbing | tiny | **LOW** | Stable |
| `fast-json-patch` | ^3.1.1 | JSON patching | tiny | **LOW** | Stable |
| `jose` | ^6.1.3 | JWT/JWE/JWS | tiny | **LOW** | Security library, keep updated |
| `ora` | ^9.0.0 | CLI spinners | tiny | **LOW** | v9.3.0 available |
| `cli-progress` | ^3.12.0 | Progress bars | tiny | **LOW** | Stable |
| `secure-json-parse` | ^4.1.0 | Safe JSON parsing | tiny | **LOW** | Security library |
| `typescript` | ^5.9.3 | TypeScript compiler | moderate | **LOW** | Runtime use for test-generation AST analysis |
| `yaml` | ^2.8.2 | YAML parsing | tiny | **LOW** | Stable |

### 1.2 Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@types/better-sqlite3` | ^7.6.13 | Type definitions |
| `@types/node` | ^20.10.0 | Node.js type definitions (v25 available -- major gap) |
| `@types/pg` | ^8.16.0 | PostgreSQL type definitions |
| `@types/uuid` | ^10.0.0 | UUID type definitions |
| `@types/ws` | ^8.18.1 | WebSocket type definitions |
| `@vitest/coverage-v8` | ^4.0.16 | V8 coverage provider |
| `esbuild` | ^0.27.2 | Bundle builder for CLI/MCP |
| `glob` | ^13.0.0 | File matching |
| `msw` | ^2.12.7 | Mock Service Worker for tests |
| `tsx` | ^4.21.0 | TypeScript execution |
| `vitest` | ^4.0.16 | Test framework |

### 1.3 Optional Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@claude-flow/browser` | ^3.0.0 | Browser integration |
| `@claude-flow/guidance` | ^3.0.0-alpha.1 | Guidance integration |
| `@ruvector/attention-darwin-arm64` | 0.1.3 | macOS ARM native binary |
| `@ruvector/attention-linux-arm64-gnu` | 0.1.3 | Linux ARM native binary |
| `@ruvector/gnn-darwin-arm64` | 0.1.19 | macOS ARM native binary |
| `@ruvector/gnn-linux-arm64-gnu` | 0.1.19 | Linux ARM native binary |

### 1.4 Security Vulnerabilities

| Severity | Package | Advisory | Status |
|----------|---------|----------|--------|
| **HIGH** | `@isaacs/brace-expansion@5.0.0` | [GHSA-7h2j-956f-4vf2](https://github.com/advisories/GHSA-7h2j-956f-4vf2) - Uncontrolled Resource Consumption | Fix available via `npm audit fix` |

### 1.5 Outdated Packages

| Package | Current | Latest | Gap |
|---------|---------|--------|-----|
| `@faker-js/faker` | 10.2.0 | 10.3.0 | Patch |
| `@ruvector/attention` | 0.1.3 | 0.1.4 | Patch |
| `@ruvector/gnn` | 0.1.19 | 0.1.22 | Patch |
| `@types/node` | 20.19.30 | 25.2.3 | **Major** |
| `commander` | 12.1.0 | 14.0.3 | **Major** |
| `ora` | 9.0.0 | 9.3.0 | Minor |
| `pg` | 8.17.2 | 8.18.0 | Patch |
| `uuid` | 9.0.1 | 13.0.0 | **Major** |
| `vibium` | 0.1.4 | 0.1.7 | Patch |

### 1.6 Dependency Overrides (Supply Chain Risk)

The project uses `overrides` in package.json to remap musl-based Rust native binaries to gnu equivalents:

```json
"overrides": {
    "@ruvector/gnn-linux-x64-musl": "npm:@ruvector/gnn-linux-x64-gnu@0.1.19",
    "@ruvector/gnn-linux-arm64-musl": "npm:@ruvector/gnn-linux-arm64-gnu@0.1.19",
    "tar": ">=7.5.7"
}
```

This is a **fragile pattern** -- if the musl/gnu ABIs diverge, runtime crashes will occur silently.

### 1.7 Native Module Installation Matrix

| Package | Linux x64 | Linux ARM64 | macOS ARM64 | Windows | Alpine (musl) |
|---------|-----------|-------------|-------------|---------|---------------|
| `better-sqlite3` | Build | Build | Build | Build | Build |
| `hnswlib-node` | Build | Build | Build | Build | Build |
| `@ruvector/gnn` | Prebuilt | Optional | Optional | N/A | Override to gnu |
| `@ruvector/attention` | Prebuilt | Optional | Optional | N/A | N/A |

---

## 2. Internal Module Dependency Graph

### 2.1 Module-Level Coupling Metrics

| Module | Ca (Afferent) | Ce (Efferent) | I (Instability) | Files | Risk |
|--------|:---:|:---:|:---:|:---:|:---:|
| **shared** | 30 | 2 | 0.06 | 61 | MEDIUM (high Ca = fragile) |
| **kernel** | 28 | 17 | 0.38 | 14 | MEDIUM (high Ce for core) |
| **integrations** | 22 | 4 | 0.15 | 113 | MEDIUM (high Ca = fragile) |
| **coordination** | 18 | 13 | 0.42 | 88 | MEDIUM |
| **learning** | 17 | 7 | 0.29 | 28 | MEDIUM |
| **domains** (barrel) | 16 | 16 | 0.50 | 3 | MEDIUM |
| **mcp** | 5 | 25 | **0.83** | 89 | **HIGH** (god module) |
| domains/visual-accessibility | 5 | 6 | 0.55 | 15 | MEDIUM |
| domains/code-intelligence | 5 | 5 | 0.50 | 15 | LOW |
| domains/learning-optimization | 5 | 6 | 0.55 | 9 | MEDIUM |
| **optimization** | 4 | 3 | 0.43 | 8 | LOW |
| **routing** | 4 | 1 | 0.20 | 9 | LOW |
| **memory** | 3 | 2 | 0.40 | 10 | LOW |
| **governance** | 3 | 1 | 0.25 | 16 | LOW |
| **adapters** | 3 | 4 | 0.57 | 74 | MEDIUM |
| **hooks** | 3 | 3 | 0.50 | 6 | LOW |
| **init** | 3 | 3 | 0.50 | 35 | LOW |
| **strange-loop** | 3 | 1 | 0.25 | 19 | LOW |
| **workers** | 1 | 6 | 0.86 | 17 | MEDIUM |
| **cli** | 0 | 13 | 1.00 | 50 | MEDIUM (leaf) |
| **index** | 0 | 15 | 1.00 | 1 | MEDIUM (entry point) |

**Legend**: Ca = afferent coupling (who depends on me), Ce = efferent coupling (who I depend on), I = instability (Ce / (Ca+Ce)), closer to 1.0 = more unstable.

### 2.2 Top 30 High Fan-In Files (Fragile Points)

These files are depended upon by the most other files. Changes here have the widest blast radius.

| Dependents | File | Risk |
|:---:|------|:---:|
| 137 | `kernel/interfaces` | **CRITICAL** |
| 128 | `shared/types` | **CRITICAL** |
| 85 | `shared/types/index` | **CRITICAL** |
| 42 | `learning/qe-patterns` | **HIGH** |
| 39 | `mcp/types` | HIGH |
| 31 | `integrations/rl-suite/interfaces` | HIGH |
| 29 | `mcp/tools/base` | HIGH |
| 27 | `shared/value-objects/index` | HIGH |
| 20 | `kernel/unified-memory` | HIGH |
| 20 | `shared/llm/interfaces` | HIGH |
| 18 | `coordination/mincut/queen-integration` | MEDIUM |
| 17 | `domains/test-generation/interfaces` | MEDIUM |
| 17 | `coordination/mincut/interfaces` | MEDIUM |
| 17 | `cli/handlers/interfaces` | MEDIUM |
| 16 | `init/types` | MEDIUM |
| 16 | `shared/events/domain-events` | MEDIUM |
| 16 | `workers/interfaces` | MEDIUM |
| 15 | `learning/token-tracker` | MEDIUM |
| 15 | `init/phases/phase-interface` | MEDIUM |
| 15 | `domains/domain-interface` | MEDIUM |
| 15 | `coordination/mixins/mincut-aware-domain` | MEDIUM |
| 15 | `coordination/mixins/consensus-enabled-domain` | MEDIUM |
| 15 | `coordination/consensus/domain-findings` | MEDIUM |
| 15 | `shared/utils/vector-math` | MEDIUM |
| 14 | `domains/visual-accessibility/interfaces` | LOW |
| 14 | `integrations/embeddings/base/types` | LOW |
| 14 | `coordination/consensus/interfaces` | LOW |
| 14 | `governance/feature-flags` | LOW |
| 13 | `integrations/coherence/types` | LOW |
| 13 | `coordination/mixins/governance-aware-domain` | LOW |

### 2.3 Top 30 High Fan-Out Files (Complexity Points)

These files import the most other files. They are complex and hard to test in isolation.

| Dependencies | File | Risk |
|:---:|------|:---:|
| 39 | `cli/index.ts` | **HIGH** |
| 25 | `coordination/queen-coordinator.ts` | **HIGH** |
| 24 | `kernel/kernel.ts` | **HIGH** |
| 23 | `domains/code-intelligence/coordinator.ts` | HIGH |
| 21 | `mcp/tools/registry.ts` | HIGH |
| 20 | `learning/index.ts` | HIGH |
| 19 | `coordination/index.ts` | HIGH |
| 19 | `mcp/tools/index.ts` | HIGH |
| 18 | `index.ts` | MEDIUM |
| 18 | `domains/test-execution/coordinator.ts` | MEDIUM |
| 18 | `domains/quality-assessment/coordinator.ts` | MEDIUM |
| 17 | `domains/contract-testing/coordinator.ts` | MEDIUM |
| 17 | `domains/test-generation/coordinator.ts` | MEDIUM |
| 17 | `domains/security-compliance/coordinator.ts` | MEDIUM |
| 17 | `integrations/ruvector/index.ts` | MEDIUM |
| 16 | `domains/coverage-analysis/coordinator.ts` | MEDIUM |
| 16 | `domains/learning-optimization/coordinator.ts` | MEDIUM |
| 16 | `domains/requirements-validation/coordinator.ts` | MEDIUM |
| 15 | `domains/chaos-resilience/coordinator.ts` | MEDIUM |
| 15 | `domains/visual-accessibility/coordinator.ts` | MEDIUM |
| 15 | `coordination/mincut/index.ts` | MEDIUM |
| 15 | `governance/index.ts` | MEDIUM |
| 14 | `init/phases/index.ts` | LOW |
| 14 | `domains/index.ts` | LOW |
| 14 | `mcp/handlers/core-handlers.ts` | LOW |
| 14 | `cli/handlers/init-handler.ts` | LOW |
| 12 | `domains/defect-intelligence/coordinator.ts` | LOW |
| 12 | `coordination/task-executor.ts` | LOW |
| 12 | `shared/index.ts` | LOW |
| 12 | `cli/commands/fleet.ts` | LOW |

---

## 3. Circular Dependencies

### 3.1 Module-Level Circular Dependencies (Critical)

The analysis detected **88 circular dependency chains** at the module level. Below are the **fundamental cycles** that generate all the transitive cycles:

| # | Cycle | Severity | Root Cause |
|---|-------|----------|------------|
| 1 | `kernel <-> memory` | **CRITICAL** | kernel/unified-memory imports memory/crdt; memory imports kernel |
| 2 | `kernel <-> domains/*` (all 13) | **CRITICAL** | kernel.ts hard-imports all domain plugin factories |
| 3 | `coordination <-> domains/code-intelligence` | **HIGH** | queen-coordinator imports domain; domain imports coordination mixins |
| 4 | `coordination <-> domains/defect-intelligence` | **HIGH** | Same pattern as above |
| 5 | `shared <-> mcp` | **HIGH** | shared/io/file-reader imports mcp/security/cve-prevention |
| 6 | `shared <-> learning` | **HIGH** | 7 LLM providers import learning/token-tracker |
| 7 | `learning <-> feedback` | MEDIUM | feedback loop integration |
| 8 | `learning <-> domains/coverage-analysis` | MEDIUM | HNSW index usage |
| 9 | `learning <-> adapters` | MEDIUM | claude-flow adapter |
| 10 | `integrations <-> kernel` | MEDIUM | kernel imports via migrations; integrations import kernel |
| 11 | `domains/* <-> domains` (barrel) | MEDIUM | domain-interface.ts imports coordination types; domains/index.ts re-exports all |

**Impact**: These cycles mean that changing any file in `kernel/`, `shared/`, or `coordination/` can trigger recompilation of the entire codebase. They also prevent proper code splitting and lazy loading.

### 3.2 File-Level Circular Dependencies (Direct A<->B)

| # | File A | File B | Module |
|---|--------|--------|--------|
| 1 | `coordination/queen-coordinator.ts` | `coordination/mincut/queen-integration.ts` | coordination |
| 2 | `learning/v2-to-v3-migration.ts` | `learning/qe-unified-memory.ts` | learning |
| 3 | `agents/claim-verifier/index.ts` | `agents/claim-verifier/verifiers/output-verifier.ts` | agents |
| 4 | `agents/claim-verifier/index.ts` | `agents/claim-verifier/verifiers/file-verifier.ts` | agents |
| 5 | `adapters/a2a/notifications/webhook-service.ts` | `adapters/a2a/notifications/subscription-store.ts` | adapters |

---

## 4. Domain Boundary Analysis

### 4.1 Domain Boundary Violations

Every domain violates its bounded context boundary by importing directly from infrastructure modules. In a proper DDD architecture, domains should only depend on `shared/` (shared kernel) and `kernel/` (interfaces). Communication between domains and infrastructure should happen through the event bus or dependency injection.

| Domain | Violations (imports from) |
|--------|--------------------------|
| chaos-resilience | coordination, integrations, mcp, domains(barrel) |
| code-intelligence | coordination, integrations, domains(barrel) |
| contract-testing | coordination, integrations, domains(barrel) |
| coverage-analysis | coordination, integrations, domains(barrel) |
| defect-intelligence | coordination, integrations, causal-discovery, domains(barrel) |
| enterprise-integration | coordination, domains(barrel) |
| learning-optimization | coordination, integrations, learning, domains(barrel) |
| quality-assessment | coordination, integrations, agents, domains(barrel) |
| requirements-validation | coordination, integrations, domains(barrel) |
| security-compliance | coordination, integrations, domains(barrel) |
| test-execution | coordination, integrations, strange-loop, domains(barrel) |
| test-generation | coordination, integrations, domains(barrel) |
| visual-accessibility | coordination, integrations, adapters, domains(barrel) |

**Common violations across all domains**:
- **`coordination/`**: Every domain imports `coordination/mixins/` (governance-aware-domain, consensus-enabled-domain, mincut-aware-domain). These mixins couple domains to the coordination infrastructure.
- **`integrations/`**: Domains import `integrations/coherence/`, `integrations/rl-suite/`, and `integrations/embeddings/` directly instead of through injected interfaces.
- **`domains/` barrel**: Domains import from their parent barrel file (`../domain-interface.js`, `../../constants.js`), which is structurally acceptable but creates coupling to the barrel file's transitive dependencies.

### 4.2 Shared Kernel Upward Dependencies (Layering Violations)

The shared kernel (`shared/`) is supposed to be the lowest layer with zero upward dependencies. It currently violates this:

| File | Imports From | Problem |
|------|-------------|---------|
| `shared/llm/providers/bedrock.ts` | `learning/token-tracker` | Shared depends on learning |
| `shared/llm/providers/ollama.ts` | `learning/token-tracker` | Shared depends on learning |
| `shared/llm/providers/azure-openai.ts` | `learning/token-tracker` | Shared depends on learning |
| `shared/llm/providers/openai.ts` | `learning/token-tracker` | Shared depends on learning |
| `shared/llm/providers/gemini.ts` | `learning/token-tracker` | Shared depends on learning |
| `shared/llm/providers/claude.ts` | `learning/token-tracker` | Shared depends on learning |
| `shared/llm/providers/openrouter.ts` | `learning/token-tracker` | Shared depends on learning |
| `shared/io/file-reader.ts` | `mcp/security/cve-prevention` | Shared depends on MCP |

**Root cause**: `TokenMetricsCollector` is defined in `learning/` but is used by all 7 LLM providers in `shared/`. It should either live in `shared/` or be injected via an interface.

### 4.3 Cross-Domain Communication Patterns

| Pattern | Observed Usage | Conformance |
|---------|---------------|-------------|
| Event Bus | kernel/event-bus.ts provides InMemoryEventBus | Correct but underutilized |
| Direct Import | All 13 domains import coordination mixins directly | **Violation** |
| Plugin DI | Kernel injects EventBus + MemoryBackend into domains | Correct |
| Shared Kernel Types | All domains import from shared/types | Correct |
| Coordination Mixins | Domains extend governance/consensus/mincut mixins | **Architectural smell** |

### 4.4 External Package Usage by Domain

| Domain | External Packages Used |
|--------|----------------------|
| chaos-resilience | uuid, net, child_process |
| code-intelligence | path, fs, uuid, child_process |
| contract-testing | uuid |
| coverage-analysis | uuid, fs, path |
| defect-intelligence | uuid |
| enterprise-integration | uuid |
| learning-optimization | uuid |
| quality-assessment | uuid |
| requirements-validation | uuid, path, fs |
| security-compliance | uuid, path, fs, child_process, util |
| test-execution | uuid, path, fs, child_process |
| test-generation | uuid, @faker-js/faker, fs, path, typescript, chai |
| visual-accessibility | uuid, fs, module |

**Concern**: `test-generation` imports `@faker-js/faker` and `chai` -- test libraries that should not be in production domain code unless they are generating test files as output (which is the domain's purpose, so this is acceptable).

---

## 5. Build and Bundle Analysis

### 5.1 Module System Configuration

```
Target: ES2022
Module: ESNext
Module Resolution: bundler
ESM: Yes (package.json "type": "module")
Build: tsc + esbuild (CLI/MCP bundles)
```

The project is ESM-native, which is good for tree-shaking. However, the actual tree-shaking effectiveness is undermined by:

### 5.2 Tree-Shaking Risks

**Barrel files with excessive star re-exports** (prevent tree-shaking of unused exports):

| File | Star Re-exports | Risk |
|------|:---:|:---:|
| `shared/index.ts` | 11 | **HIGH** -- everything in shared gets pulled in |
| `index.ts` (root) | 8 | HIGH -- root entry pulls everything |
| `domains/test-execution/services/index.ts` | 8 | MEDIUM |
| `coordination/protocols/index.ts` | 6 | MEDIUM |
| `governance/index.ts` | 5 | MEDIUM |
| `coordination/index.ts` | 4 | LOW |
| `integrations/browser/agent-browser/index.ts` | 4 | LOW |

### 5.3 Dynamic Imports

**335 dynamic imports/requires** were detected. While some are intentional for lazy loading (e.g., `better-sqlite3` in init wizard), many undermine static analysis:

- `init/init-wizard.ts`: 13 dynamic imports (acceptable -- lazy loading heavy deps during initialization)
- `mcp/` handlers: Multiple dynamic imports for domain handlers (acceptable -- on-demand loading)
- `integrations/`: Dynamic `require()` calls for native modules (necessary for optional deps)

### 5.4 Bundle Size Impact (node_modules)

| Component | Size | Notes |
|-----------|------|-------|
| **Total node_modules** | **865MB** | |
| `@xenova/transformers` | 154MB | 17.8% of total -- ML model inference |
| `@ruvector/*` | 15MB | Native Rust binaries |
| `better-sqlite3` | 12MB | Native C++ |
| `@faker-js/faker` | 5.2MB | Should be devDep |
| `axe-core` | 2.9MB | Accessibility engine |
| `hnswlib-node` | 1.1MB | Native C++ |

### 5.5 Side Effects

No bare side-effect imports (`import "x"`) were found, which is positive for tree-shaking. However, the heavy use of barrel files with `export *` largely negates this benefit.

---

## 6. Architectural Risk Assessment

### 6.1 Dependency Depth (Critical Paths)

```
User Request
  -> mcp/server.ts
    -> mcp/tools/registry.ts (21 deps)
      -> kernel/kernel.ts (24 deps)
        -> domains/*/plugin.ts (each 15-18 deps)
          -> coordination/mixins/* (15 deps each)
            -> shared/types (128 dependents)
              -> learning/token-tracker (CYCLE!)
```

Maximum dependency chain depth from MCP entry point to leaf: **6-7 levels**.

### 6.2 Stability vs. Abstractness (Zone Analysis)

Using Robert C. Martin's dependency metrics:

| Zone | Modules | Assessment |
|------|---------|------------|
| **Zone of Pain** (stable + concrete) | `shared/`, `kernel/interfaces` | Too many dependents AND too concrete. Changes here are expensive. |
| **Zone of Uselessness** (abstract + unstable) | None detected | No purely abstract unused modules |
| **Main Sequence** (balanced) | `coordination/`, `governance/`, `routing/` | Appropriate balance |
| **Zone of Instability** (unstable + concrete) | `mcp/`, `cli/`, `workers/` | High fan-out, but acceptable as edge modules |

### 6.3 Kernel Architecture Issues

The kernel (`kernel/kernel.ts`) hard-imports all 13 domain plugin factories:

```typescript
import { createTestGenerationPlugin } from '../domains/test-generation/plugin';
import { createTestExecutionPlugin } from '../domains/test-execution/plugin';
// ... 11 more
```

This creates a **static dependency from the kernel to every domain**, defeating the microkernel's purpose of dynamic loading. The `PluginLoader` class exists and supports factory registration, but the kernel pre-imports everything.

**Recommendation**: Move plugin factory registration to a configuration file or dynamic import map. The kernel should discover plugins at runtime, not compile-time.

---

## 7. Recommendations

### 7.1 Critical (Address Immediately)

| # | Issue | Fix | Effort |
|---|-------|-----|--------|
| 1 | **Run `npm audit fix`** | Fix `@isaacs/brace-expansion` vulnerability | 5 min |
| 2 | **Move `@faker-js/faker` to devDependencies** | `npm install --save-dev @faker-js/faker` and update test-generation domain imports | 30 min |
| 3 | **Move `TokenMetricsCollector` to shared** | Extract interface to `shared/metrics/` or `shared/types/`, keep implementation in `learning/` and inject | 2-4 hrs |
| 4 | **Move `validatePath` to shared** | Extract `mcp/security/cve-prevention` path validation to `shared/security/` | 1 hr |

### 7.2 High Priority (Plan for Next Sprint)

| # | Issue | Fix | Effort |
|---|-------|-----|--------|
| 5 | **Break kernel -> domains cycle** | Replace static imports in `kernel.ts` with dynamic plugin discovery or a registry pattern | 4-8 hrs |
| 6 | **Extract coordination mixins to interfaces** | Create `shared/coordination-interfaces/` with mixin interfaces; domains depend on interfaces, not implementations | 8-16 hrs |
| 7 | **Reduce MCP fan-out** | Split `mcp/` into sub-modules with clear facades; use lazy loading for domain handlers | 8-16 hrs |
| 8 | **Fix file-level circulars** | 5 direct A<->B cycles need extraction of shared types or mediator patterns | 4-8 hrs |

### 7.3 Medium Priority (Technical Debt Reduction)

| # | Issue | Fix | Effort |
|---|-------|-----|--------|
| 9 | **Replace barrel `export *` with named exports** | Especially in `shared/index.ts` (11 star re-exports) -- use explicit named exports for tree-shaking | 4 hrs |
| 10 | **Make `@xenova/transformers` optional** | Lazy-load only when embedding features are used; add graceful fallback | 4-8 hrs |
| 11 | **Enforce domain boundary rules in CI** | Add ESLint rule or custom linter to prevent domains from importing coordination/integrations directly | 4 hrs |
| 12 | **Update major dependencies** | `uuid@9 -> 13`, `commander@12 -> 14`, `@types/node@20 -> 25` | 4-8 hrs |
| 13 | **Review 335 dynamic imports** | Audit each for necessity; convert unnecessary dynamic imports to static for better static analysis | 8 hrs |

### 7.4 Long-Term Architecture Improvements

| # | Improvement | Description |
|---|-------------|-------------|
| 14 | **Domain event bus adoption** | Domains should communicate exclusively through domain events, not direct imports |
| 15 | **Proper Anti-Corruption Layers** | Each domain should have an ACL for external integrations instead of importing `integrations/` directly |
| 16 | **Dependency injection container** | Introduce a DI container at the kernel level to decouple all cross-module dependencies |
| 17 | **Package-level modules** | Consider splitting into npm workspaces: `@aqe/kernel`, `@aqe/shared`, `@aqe/domains-*` for hard boundary enforcement |
| 18 | **Native dependency strategy** | Document and test all platform combinations for native modules; consider pure-JS fallbacks |

---

## Appendix A: Full Module Dependency Edges

```
adapters -> integrations, kernel, learning, shared
agents -> shared
benchmarks -> shared
causal-discovery -> integrations, learning
cli -> coordination, domains/requirements-validation, domains/visual-accessibility,
       init, integrations, kernel, learning, mcp, migration, optimization, shared, sync, validation
coordination -> domains, domains/code-intelligence, domains/defect-intelligence,
               domains/learning-optimization, domains/security-compliance, governance,
               hooks, integrations, kernel, learning, mcp, routing, shared
domains/chaos-resilience -> coordination, domains, integrations, kernel, mcp, shared
domains/code-intelligence -> coordination, domains, integrations, kernel, shared
domains/contract-testing -> coordination, domains, integrations, kernel, shared
domains/coverage-analysis -> coordination, domains, integrations, kernel, shared
domains/defect-intelligence -> causal-discovery, coordination, domains, integrations, kernel, shared
domains/enterprise-integration -> coordination, domains, kernel, shared
domains/learning-optimization -> coordination, domains, integrations, kernel, learning, shared
domains/quality-assessment -> agents, coordination, domains, integrations, kernel, shared
domains/requirements-validation -> coordination, domains, integrations, kernel, shared
domains/security-compliance -> coordination, domains, integrations, kernel, shared
domains/test-execution -> coordination, domains, integrations, kernel, shared, strange-loop
domains/test-generation -> coordination, domains, integrations, kernel, shared
domains/visual-accessibility -> adapters, coordination, domains, integrations, kernel, shared
feedback -> learning, routing
governance -> shared
hooks -> learning, memory, types
init -> kernel, learning, optimization
integrations -> kernel, learning, migrations, shared
kernel -> coordination, domains/* (all 13), memory, migrations, shared
learning -> adapters, domains/coverage-analysis, feedback, governance,
           integrations, kernel, shared
mcp -> adapters, coordination, domains (multiple), governance, hooks, init,
      integrations, kernel, learning, memory, optimization, planning, routing,
      shared, strange-loop, types
memory -> kernel, types
optimization -> kernel, learning, workers
planning -> kernel, learning
routing -> learning
shared -> learning (!), mcp (!)
strange-loop -> integrations
sync -> integrations, kernel
test-scheduling -> domains/code-intelligence, kernel
validation -> learning
workers -> domains/learning-optimization, domains/quality-assessment,
          domains/test-execution, kernel, learning, shared
```

## Appendix B: External Package Usage Map

| Module | Packages |
|--------|----------|
| adapters | events, uuid, fs, path, jose, fast-json-patch, crypto |
| cli | chalk, commander, fs, path, readline, os, ora, cli-progress, secure-json-parse |
| coordination | uuid, crypto, fs, path |
| domains (all) | uuid (primary), fs, path, child_process (some) |
| init | fs, path, module, url, chalk, child_process |
| integrations | better-sqlite3, uuid, path, fs, child_process, @xenova/transformers, hnswlib-node, @ruvector/* |
| kernel | better-sqlite3, fs, path, uuid |
| learning | uuid, better-sqlite3, crypto |
| mcp | uuid, http, crypto, path, fs, events, ws |
| planning | better-sqlite3, crypto |
| sync | path, fs, secure-json-parse, better-sqlite3, uuid |

---

*Report generated by QE Dependency Mapper v3 -- 2026-02-11*
