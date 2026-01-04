# Agentic QE: TypeScript to Rust Migration Plan (GOAP-Based)

## Executive Summary

This document presents a comprehensive Goal-Oriented Action Planning (GOAP) strategy for migrating the Agentic QE Fleet system from TypeScript to Rust. The migration follows an incremental approach, leveraging the existing Rust integration via `@ruvector/core` and `@ruvector/ruvllm` as a foundation.

**Key Statistics:**
- Total TypeScript Lines: ~120,000 LOC
- Key Modules: 26 agents, 100+ MCP tools, learning system, vector databases
- Existing Rust Integration: @ruvector/core (HNSW vector search), better-sqlite3 (native)
- Migration Timeline: 18-24 months (phased approach)

---

## 1. Current State Analysis

### 1.1 Codebase Structure

```
src/
├── agents/         (2.1MB, 26 agents)      - Agent orchestration
├── mcp/            (2.5MB, 100+ tools)     - MCP server & handlers
├── core/           (1.8MB)                 - Memory, hooks, strategies
├── learning/       (1.1MB)                 - RL algorithms, patterns
├── providers/      (416KB)                 - LLM routing, cost optimization
├── code-intelligence/ (724KB)             - Knowledge graph, indexing
├── planning/       (272KB)                 - GOAP planner
├── edge/           (252MB)                 - WASM, P2P, browser agents
└── [other modules]
```

### 1.2 Performance-Critical Modules (Migration Priority: HIGH)

| Module | Lines | Performance Bottleneck | Rust Benefit |
|--------|-------|----------------------|--------------|
| `RuVectorPatternStore.ts` | 1,216 | Vector search, HNSW | Already using @ruvector/core |
| `HNSWVectorMemory.ts` | 827 | Vector indexing | 170x speedup potential |
| `QuantizationManager.ts` | 335 | Memory compression | SIMD optimization |
| `LearningEngine.ts` | 1,620 | Q-table updates | Hot path optimization |
| `QLearning.ts` | 423 | RL algorithm | Numerical computation |
| `StatisticalAnalysis.ts` | 200+ | Statistical ops | SIMD vectorization |
| `EmbeddingGenerator.ts` | 566 | Embedding creation | Batch processing |

### 1.3 Memory-Intensive Modules (Migration Priority: HIGH)

| Module | Memory Pattern | Rust Benefit |
|--------|---------------|--------------|
| `SwarmMemoryManager.ts` | Large pattern storage | Zero-copy, arena allocators |
| `Database.ts` | SQLite operations | Direct FFI, no JS overhead |
| `ExperienceStore.ts` | RL replay buffers | Efficient memory layout |
| `PatternCache.ts` | LRU caching | Custom allocators |

### 1.4 Existing Rust Integration Points

The project already uses Rust via native Node.js bindings:

```typescript
// @ruvector/core - Vector database (already Rust)
import { VectorDb } from '@ruvector/core';

// @ruvector/ruvllm - LLM provider (already Rust)
import { RuvllmProvider } from '@ruvector/ruvllm';

// better-sqlite3 - Database (C++ native)
import BetterSqlite3 from 'better-sqlite3';
```

**Benchmark Results (from codebase):**
- RuVector Search p50: 1.5 microseconds (170x faster than JS fallback)
- RuVector QPS: 192,840 queries/sec (53x higher)
- Batch insert: 2,703,923 ops/sec (129x faster)
- Memory: 18% less than baseline

---

## 2. Target State Definition

### 2.1 Goal State

```yaml
goal_state:
  performance:
    vector_search_p99: "<10 microseconds"
    learning_update_throughput: ">1M updates/sec"
    memory_efficiency: ">40% reduction"
    embedding_generation: "<1ms per batch"

  architecture:
    core_engine: "Rust (native)"
    orchestration_layer: "TypeScript (retained)"
    mcp_handlers: "TypeScript with Rust FFI"
    agent_coordination: "TypeScript (retained)"

  interoperability:
    node_binding: "napi-rs"
    wasm_support: "wasm-bindgen"
    cross_platform: ["linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64", "win32-x64"]
```

### 2.2 Hybrid Architecture (Target)

```
┌─────────────────────────────────────────────────────────────┐
│                    TypeScript Layer                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │ MCP Server  │ │  Agents     │ │    CLI      │           │
│  │ (handlers)  │ │ (26 types)  │ │ (commands)  │           │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘           │
│         │               │               │                   │
│  ┌──────▼───────────────▼───────────────▼──────┐           │
│  │          Unified FFI Bridge (napi-rs)        │           │
│  └──────────────────────┬──────────────────────┘           │
└─────────────────────────┼───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                     Rust Core Layer                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │ agentic-qe- │ │ agentic-qe- │ │ agentic-qe- │           │
│  │   memory    │ │  learning   │ │  analytics  │           │
│  └─────────────┘ └─────────────┘ └─────────────┘           │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │  ruvector   │ │   ruvllm    │ │  sqlx/rusqlite│          │
│  │  (exists)   │ │  (exists)   │ │  (new)      │           │
│  └─────────────┘ └─────────────┘ └─────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. GOAP Migration Milestones

### Phase 0: Foundation (Months 1-2)
**Goal:** Establish Rust project structure and build pipeline

```yaml
milestone_0:
  name: "Rust Foundation"
  duration: "2 months"

  preconditions:
    - rust_toolchain_installed
    - napi_rs_knowledge
    - existing_ruvector_integration_working

  actions:
    - setup_workspace_cargo_toml:
        description: "Create Rust workspace structure"
        deliverables:
          - "/rust-core/Cargo.toml"
          - "/rust-core/agentic-qe-memory/"
          - "/rust-core/agentic-qe-learning/"
          - "/rust-core/agentic-qe-analytics/"
          - "/rust-core/agentic-qe-node/"  # napi-rs bindings

    - configure_napi_rs:
        description: "Setup napi-rs for Node.js bindings"
        deliverables:
          - "Cross-platform build scripts"
          - "GitHub Actions for prebuilt binaries"
          - "npm package structure"

    - create_ci_pipeline:
        description: "Establish CI/CD for Rust components"
        deliverables:
          - "Rust tests in CI"
          - "Cross-compilation matrix"
          - "Benchmark tracking"

  success_criteria:
    - cargo_build_succeeds: true
    - napi_rs_hello_world_from_typescript: true
    - ci_pipeline_green: true

  risks:
    - risk: "napi-rs version compatibility"
      mitigation: "Pin specific versions, test on all platforms"
      probability: "medium"
      impact: "medium"
```

### Phase 1: Memory Layer Migration (Months 3-5)
**Goal:** Migrate vector storage and pattern management to Rust

```yaml
milestone_1:
  name: "Memory Layer"
  duration: "3 months"

  preconditions:
    - milestone_0_complete
    - ruvector_api_stable

  actions:
    - create_agentic_qe_memory_crate:
        components:
          - "PatternStore trait (unified interface)"
          - "HNSWIndex (extend ruvector)"
          - "QuantizationEngine (scalar, binary, product)"
          - "PatternCache (LRU with metrics)"
          - "CompressionManager (zstd integration)"

    - implement_napi_bindings:
        exports:
          - "HNSWPatternStore"
          - "QuantizationManager"
          - "PatternCache"

    - create_typescript_adapter:
        description: "Create TypeScript wrapper maintaining existing API"
        files:
          - "src/core/memory/RustPatternStore.ts"
          - "src/core/memory/RustQuantization.ts"

  success_criteria:
    - benchmark_improvement:
        vector_search_speedup: ">=100x vs JS fallback"
        memory_reduction: ">=30%"
        batch_insert_throughput: ">=2M ops/sec"
    - api_compatibility: "100% backward compatible"
    - all_existing_tests_pass: true

  risks:
    - risk: "Float32Array/Vec<f32> conversion overhead"
      mitigation: "Use zero-copy buffers where possible"
      probability: "low"
      impact: "medium"
```

### Phase 2: Learning System Migration (Months 6-9)
**Goal:** Migrate RL algorithms and learning engine to Rust

```yaml
milestone_2:
  name: "Learning System"
  duration: "4 months"

  preconditions:
    - milestone_1_complete

  actions:
    - create_agentic_qe_learning_crate:
        components:
          - "QTable (concurrent hashmap)"
          - "ExperienceReplayBuffer (ring buffer)"
          - "QLearning algorithm"
          - "SARSA algorithm"
          - "ActorCritic framework"
          - "PPO implementation"
          - "StatisticalAnalyzer (SIMD optimized)"

    - implement_napi_bindings:
        exports:
          - "RustQLearning"
          - "RustSARSA"
          - "RustActorCritic"
          - "RustExperienceBuffer"
          - "RustStatistics"

    - migrate_state_encoding:
        description: "Move state/action encoding to Rust"
        benefit: "Eliminate JSON serialization overhead"

  success_criteria:
    - learning_update_throughput: ">=500K updates/sec"
    - experience_replay_speedup: ">=50x"
    - statistical_ops_speedup: ">=100x (SIMD)"
    - backward_compatible_api: true

  risks:
    - risk: "State serialization format changes"
      mitigation: "Support both formats during transition"
      probability: "medium"
      impact: "high"
```

### Phase 3: Database Layer Migration (Months 10-12)
**Goal:** Replace better-sqlite3 with rusqlite via napi-rs

```yaml
milestone_3:
  name: "Database Layer"
  duration: "3 months"

  preconditions:
    - milestone_2_complete

  actions:
    - create_database_crate:
        components:
          - "ConnectionPool (r2d2)"
          - "Query builder (type-safe)"
          - "Migration system"
          - "Batch operations"
          - "WAL mode optimization"

    - implement_napi_bindings:
        exports:
          - "RustDatabase"
          - "RustStatement"
          - "RustTransaction"

    - migrate_schema:
        description: "Migrate existing SQLite schema"
        compatibility: "Read existing databases"

  success_criteria:
    - query_throughput: ">=50% improvement"
    - connection_overhead: "Eliminated JS wrapper"
    - migration_compatibility: "Read v2.8.0 databases"

  risks:
    - risk: "Data migration failures"
      mitigation: "Extensive backup procedures"
      probability: "low"
      impact: "critical"
```

### Phase 4: Analytics & Metrics (Months 13-15)
**Goal:** Migrate metrics collection and analysis to Rust

```yaml
milestone_4:
  name: "Analytics Engine"
  duration: "3 months"

  preconditions:
    - milestone_3_complete

  actions:
    - create_analytics_crate:
        components:
          - "MetricsAggregator"
          - "TimeSeriesStore"
          - "AnomalyDetector"
          - "TrendAnalyzer"
          - "ReportGenerator"

    - implement_telemetry_bridge:
        description: "Connect to OpenTelemetry"
        integration: "OTLP exporter in Rust"

  success_criteria:
    - metrics_overhead: "<1% CPU"
    - aggregation_speed: ">=10x improvement"
    - opentelemetry_compatible: true
```

### Phase 5: Edge & WASM (Months 16-18)
**Goal:** Create WASM builds for browser deployment

```yaml
milestone_5:
  name: "Edge & WASM"
  duration: "3 months"

  preconditions:
    - milestone_4_complete

  actions:
    - create_wasm_bindings:
        components:
          - "agentic-qe-wasm (wasm-bindgen)"
          - "Browser PatternStore"
          - "Browser LearningEngine"
          - "Web Worker support"

    - optimize_wasm_size:
        target: "<500KB gzipped"
        techniques:
          - "wasm-opt"
          - "Feature flags"
          - "Tree shaking"

  success_criteria:
    - wasm_bundle_size: "<500KB"
    - browser_performance: ">=Native JS"
    - p2p_integration: "WebRTC ready"
```

### Phase 6: Full Integration (Months 19-24)
**Goal:** Complete migration with performance validation

```yaml
milestone_6:
  name: "Full Integration"
  duration: "6 months"

  actions:
    - consolidate_bindings:
        description: "Single unified @agentic-qe/core package"

    - deprecate_typescript_implementations:
        migration_path: "Feature flags for gradual rollout"

    - performance_validation:
        benchmarks:
          - "End-to-end latency"
          - "Memory usage under load"
          - "Concurrent operations"

    - documentation_update:
        deliverables:
          - "Migration guide"
          - "API reference"
          - "Performance tuning guide"

  success_criteria:
    - all_tests_pass: true
    - performance_targets_met: true
    - backward_compatibility: true
    - documentation_complete: true
```

---

## 4. Module Dependency Analysis

### 4.1 Migration Order (Topological)

Based on dependency analysis, migrate in this order:

```
Level 0 (No dependencies - migrate first):
├── StatisticalAnalysis
├── QuantizationManager
└── EmbeddingCache

Level 1 (Depends on Level 0):
├── RuVectorPatternStore (extends existing @ruvector/core)
├── HNSWVectorMemory
└── PatternCache

Level 2 (Depends on Level 1):
├── LearningEngine
├── QLearning
├── SARSA
└── ActorCritic

Level 3 (Depends on Level 2):
├── SwarmMemoryManager
├── Database (SQLite layer)
└── ExperienceStore

Level 4 (Depends on Level 3):
├── BaseAgent
├── MCP Handlers
└── Providers
```

### 4.2 High-Coupling Modules (Keep in TypeScript)

These modules have extensive integrations and should remain in TypeScript:

| Module | Reason | Recommendation |
|--------|--------|----------------|
| `BaseAgent.ts` | Event handling, lifecycle | Keep TS, call Rust |
| `MCP Server` | Protocol handling | Keep TS |
| `CLI commands` | User interaction | Keep TS |
| `Agent coordination` | Async orchestration | Keep TS |

---

## 5. Interoperability Strategy

### 5.1 napi-rs Configuration

```toml
# rust-core/agentic-qe-node/Cargo.toml
[package]
name = "agentic-qe-node"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
napi = { version = "2", features = ["async", "napi8"] }
napi-derive = "2"
agentic-qe-memory = { path = "../agentic-qe-memory" }
agentic-qe-learning = { path = "../agentic-qe-learning" }

[build-dependencies]
napi-build = "2"

[profile.release]
lto = true
opt-level = 3
```

### 5.2 Example Binding

```rust
// rust-core/agentic-qe-node/src/lib.rs
use napi::bindgen_prelude::*;
use napi_derive::napi;
use agentic_qe_learning::QLearning as RustQLearning;

#[napi]
pub struct QLearning {
    inner: RustQLearning,
}

#[napi]
impl QLearning {
    #[napi(constructor)]
    pub fn new(config: JsQLearningConfig) -> Result<Self> {
        Ok(Self {
            inner: RustQLearning::new(config.into()),
        })
    }

    #[napi]
    pub fn update(&mut self, state: String, action: String, reward: f64, next_state: String) -> Result<()> {
        self.inner.update(&state, &action, reward, &next_state);
        Ok(())
    }

    #[napi]
    pub fn get_q_value(&self, state: String, action: String) -> f64 {
        self.inner.get_q_value(&state, &action)
    }
}
```

### 5.3 TypeScript Adapter

```typescript
// src/learning/RustQLearning.ts
import { QLearning as NativeQLearning } from '@agentic-qe/core';
import type { TaskExperience, AgentAction, TaskState } from './types';

export class RustQLearningAdapter implements AbstractRLLearner {
  private native: NativeQLearning;

  constructor(config: RLConfig) {
    this.native = new NativeQLearning(config);
  }

  update(experience: TaskExperience): void {
    this.native.update(
      this.encodeState(experience.state),
      this.encodeAction(experience.action),
      experience.reward,
      this.encodeState(experience.nextState)
    );
  }

  getQValue(state: TaskState, action: AgentAction): number {
    return this.native.getQValue(
      this.encodeState(state),
      this.encodeAction(action)
    );
  }
}
```

---

## 6. Risk Assessment

### 6.1 Risk Matrix

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| napi-rs API changes | Medium | Medium | Pin versions, maintain compatibility layer |
| Cross-platform build failures | Medium | High | Extensive CI matrix, prebuilt binaries |
| Memory safety at FFI boundary | Low | Critical | Extensive testing, fuzzing |
| Performance regression | Low | High | Continuous benchmarking, A/B testing |
| Data migration failures | Low | Critical | Backup procedures, rollback plan |
| TypeScript API breaking changes | Medium | High | Semantic versioning, deprecation warnings |
| Developer productivity decrease | Medium | Medium | Good documentation, examples |

### 6.2 Rollback Strategy

Each phase includes rollback capability:

1. **Feature flags** to toggle Rust/TS implementations
2. **Database version compatibility** (read old formats)
3. **npm package versioning** (major version for breaking changes)
4. **CI/CD validation** gates before deployment

---

## 7. Success Metrics

### 7.1 Performance Targets

| Metric | Current (TS) | Target (Rust) | Measurement |
|--------|--------------|---------------|-------------|
| Vector search p50 | 255 microseconds | <10 microseconds | Benchmark suite |
| Vector search p99 | 1.2 ms | <50 microseconds | Benchmark suite |
| Learning update/sec | ~10K | >500K | Throughput test |
| Memory per 1M vectors | 3.2 GB | <2 GB | Memory profiler |
| WASM bundle size | N/A | <500 KB | Build output |
| Cold start time | 2.5s | <500ms | Startup benchmark |

### 7.2 Quality Targets

| Metric | Target |
|--------|--------|
| Test coverage | >90% |
| API backward compatibility | 100% |
| Documentation coverage | 100% |
| Zero-day security issues | 0 |

---

## 8. Recommended Tooling

### 8.1 Build & Development

| Tool | Purpose | Version |
|------|---------|---------|
| napi-rs | Node.js bindings | 2.x |
| wasm-bindgen | WASM bindings | 0.2.x |
| cargo-workspaces | Monorepo management | Latest |
| cross | Cross-compilation | Latest |
| cargo-criterion | Benchmarking | Latest |

### 8.2 Testing

| Tool | Purpose |
|------|---------|
| cargo-nextest | Fast test runner |
| cargo-fuzz | Fuzz testing |
| proptest | Property-based testing |
| miri | Undefined behavior detection |

### 8.3 CI/CD

| Tool | Purpose |
|------|---------|
| GitHub Actions | CI/CD pipeline |
| cargo-deny | Dependency auditing |
| cargo-audit | Security scanning |
| codecov | Coverage reporting |

---

## 9. Implementation Checklist

### Phase 0 Checklist
- [ ] Create `/rust-core/Cargo.toml` workspace
- [ ] Setup napi-rs project structure
- [ ] Configure GitHub Actions for Rust
- [ ] Create cross-platform build matrix
- [ ] Document development setup

### Phase 1 Checklist
- [ ] Implement `PatternStore` trait
- [ ] Extend ruvector with custom methods
- [ ] Create quantization engine
- [ ] Implement pattern cache
- [ ] Export via napi-rs
- [ ] Create TypeScript adapters
- [ ] Benchmark against JS baseline

### Phase 2 Checklist
- [ ] Implement Q-table data structure
- [ ] Port QL-learning algorithm
- [ ] Port SARSA algorithm
- [ ] Port Actor-Critic
- [ ] Implement experience replay buffer
- [ ] Add SIMD-optimized statistics
- [ ] Export via napi-rs
- [ ] Benchmark learning throughput

(Additional phases follow similar pattern)

---

## 10. Conclusion

This GOAP-based migration plan provides a pragmatic, incremental approach to migrating Agentic QE from TypeScript to Rust. Key principles:

1. **Leverage existing Rust** - Build on @ruvector/core foundation
2. **Performance-first migration** - Prioritize hot paths
3. **Maintain compatibility** - TypeScript API unchanged
4. **Incremental rollout** - Feature flags for gradual adoption
5. **Continuous validation** - Benchmarks at every phase

The hybrid architecture allows TypeScript to handle orchestration while Rust provides high-performance computation, achieving the best of both worlds.

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| GOAP | Goal-Oriented Action Planning |
| HNSW | Hierarchical Navigable Small World |
| napi-rs | Rust to Node.js N-API bindings |
| SIMD | Single Instruction Multiple Data |
| FFI | Foreign Function Interface |
| RL | Reinforcement Learning |

## Appendix B: References

- [napi-rs Documentation](https://napi.rs/)
- [wasm-bindgen Guide](https://rustwasm.github.io/wasm-bindgen/)
- [RuVector Documentation](https://github.com/ruvnet/ruvector)
- [Agentic QE Architecture](./ARCHITECTURE.md)

---

*Document Version: 1.0.0*
*Created: 2026-01-04*
*Author: Agentic QE Architecture Team*
