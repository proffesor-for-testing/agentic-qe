# ADR-081: Native HNSW Integration via NAPI (ruvector-router-ffi)

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-081 |
| **Status** | Proposed |
| **Date** | 2026-03-15 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** AQE v3's vector search subsystem, which currently operates three fragmented HNSW implementations (ADR-071) -- a pure TypeScript HNSW, a RuvectorFlatIndex wrapping @ruvector/gnn, and a QEGNNEmbeddingIndex -- all running in JavaScript with cold-start index rebuilds from SQLite BLOBs,

**facing** a measured 150x-12,500x performance gap between AQE's JavaScript-based HNSW and the native Rust ruvector-router-ffi implementation (which achieves <0.5ms p50 at 1M vectors via SIMD-accelerated HNSW with AVX2/NEON/SIMD128), cold-start rebuild latency that grows linearly with the 150K+ pattern count, and the inability to leverage hardware-specific acceleration (AVX2, ARM NEON) from JavaScript,

**we decided for** adopting ruvector-router-ffi as the primary vector search engine via its NAPI-RS Node.js bindings, replacing all three existing JavaScript HNSW implementations with a single native backend, while maintaining a pure-JavaScript fallback (the existing TypeScript HNSW) for environments where native binaries are unavailable (CI containers, restricted platforms, WASM-only deployments),

**and neglected** (a) continuing with JavaScript-only HNSW (rejected: 150x+ performance gap is a measurable bottleneck at 150K+ patterns and will worsen as the knowledge base grows), (b) using RVF INDEX_SEG exclusively without the router-ffi layer (rejected: INDEX_SEG provides persistence but router-ffi provides the query-time SIMD acceleration; both are needed), (c) adopting an external vector database like Qdrant or Chroma (rejected: adds service dependency, does not integrate with ruvector ecosystem, and breaks the embedded deployment model),

**to achieve** sub-millisecond vector search at the current 150K+ scale with headroom to 1M+ patterns, elimination of cold-start index rebuilds via persistent HNSW state, unified vector search quality across all subsystems (patterns, QE memory, learning pipeline), and hardware-accelerated distance computation via platform-specific SIMD,

**accepting that** this introduces a native binary dependency (NAPI-RS compiled for linux-x64, darwin-arm64, win32-x64) that increases install complexity, requires maintaining a JavaScript fallback for unsupported platforms, and creates a tighter coupling to the ruvector ecosystem for a core capability.

---

## Context

AQE v3's pattern retrieval performance is bounded by its JavaScript HNSW implementations. The Six Thinking Hats analysis (2026-03-15) identified a 150x-12,500x speed gap between AQE's current vector search and ruvector-router-ffi's native Rust implementation. At the current 150K+ pattern scale, this gap manifests as:

1. **Query latency**: JavaScript HNSW delivers 10-50ms per query at 10K vectors. ruvector-router-ffi delivers <0.5ms at 1M vectors -- a 20-100x improvement on queries alone.

2. **Cold-start rebuild**: Every process restart triggers a full HNSW index reconstruction from SQLite BLOBs. At 150K patterns with 384-dimensional embeddings, this takes multiple seconds. ruvector-router-ffi persists index state natively, eliminating rebuild entirely.

3. **SIMD acceleration**: JavaScript cannot access AVX2 (256-bit), ARM NEON (128-bit), or WASM SIMD128 instructions. ruvector-router-ffi auto-detects the best available SIMD backend at runtime, achieving 4-8x speedup on distance computations compared to scalar operations.

ADR-071 already decided to unify the three HNSW implementations behind a single `HnswIndexProvider` interface backed by RVF INDEX_SEG. This ADR specifies the concrete runtime engine (ruvector-router-ffi via NAPI) that powers that interface, and defines the fallback strategy for environments where native binaries are unavailable.

### Benchmark Data (from research)

| Operation | JS HNSW (current) | ruvector-router-ffi (NAPI) | Speedup |
|-----------|-------------------|---------------------------|---------|
| 10-NN query (10K vectors) | 10-50ms | <0.1ms | 100-500x |
| 10-NN query (100K vectors) | 50-200ms | <0.3ms | 167-667x |
| 10-NN query (1M vectors) | N/A (OOM) | <0.5ms | N/A |
| Index construction (10K) | 2-5s | <100ms | 20-50x |
| Cold-start rebuild (150K) | 5-15s | 0ms (persistent) | Infinite |

---

## Options Considered

### Option 1: ruvector-router-ffi via NAPI-RS with JS Fallback (Selected)

Use ruvector-router-ffi's pre-built NAPI-RS bindings (@ruvector/router-node) as the primary vector search engine. Detect native binary availability at startup. If available, use native; if not, fall back to the existing TypeScript HNSW implementation with a startup warning.

**Pros:**
- Sub-millisecond queries at 1M+ scale via SIMD-accelerated HNSW
- Persistent index state eliminates cold-start rebuild
- Auto-detection of best SIMD backend (AVX2, NEON, SIMD128, scalar)
- Graceful degradation to JavaScript when native is unavailable
- Single codebase via HnswIndexProvider interface (ADR-071)
- Integrates with RVF INDEX_SEG for persistence (ADR-066)

**Cons:**
- Pre-built binaries needed for each target platform (linux-x64, darwin-arm64, win32-x64)
- Native dependency increases npm install size (~5-15MB per platform)
- Two code paths (native + JS fallback) during transition period
- Native binary version must stay synchronized with @ruvector/rvf version

### Option 2: JavaScript-Only HNSW with Optimization (Rejected)

Optimize the existing TypeScript HNSW with WebAssembly-compiled distance functions and lazy loading.

**Why rejected:** Even with WASM distance functions, JavaScript HNSW cannot match native SIMD throughput. The V8 JIT cannot generate AVX2 vector instructions from JavaScript. Lazy loading does not solve the fundamental O(n) cold-start problem. The performance ceiling for JavaScript HNSW is approximately 10x current speed, still 15-1,250x slower than native.

### Option 3: RVF INDEX_SEG Only (Without router-ffi) (Rejected)

Use RVF's INDEX_SEG for persistence and its built-in query capabilities without the router-ffi layer.

**Why rejected:** INDEX_SEG provides persistent storage of HNSW graph structure and progressive 3-layer loading, but query execution still requires a runtime engine. ruvector-router-ffi provides the SIMD-accelerated query engine that operates on INDEX_SEG data. The two are complementary: INDEX_SEG for persistence, router-ffi for query-time acceleration.

### Option 4: External Vector Database (Rejected)

Adopt Qdrant, Chroma, or Milvus as the vector search backend.

**Why rejected:** Introduces an external service dependency (separate process, network latency, deployment complexity). Breaks AQE's embedded single-process deployment model. Does not integrate with ruvector's SONA learning pipeline, attention mechanisms, or coherence gating. Network round-trip latency (1-10ms) negates much of the native speed advantage.

---

## Implementation

### Native Detection and Fallback Strategy

```typescript
// src/vectors/native-hnsw-provider.ts
interface NativeHnswProviderConfig {
  /** Path to .rvf file for persistent index storage */
  rvfPath: string;
  /** Embedding dimensions (default: 384) */
  dimensions: number;
  /** Whether to allow JS fallback if native is unavailable */
  allowJsFallback: boolean;
  /** HNSW configuration */
  hnsw: {
    m: number;              // Default: 32
    efConstruction: number; // Default: 200
    efSearch: number;       // Default: 100
  };
}

class NativeHnswProvider implements HnswIndexProvider {
  private backend: 'native' | 'js-fallback';

  static async create(config: NativeHnswProviderConfig): Promise<NativeHnswProvider> {
    try {
      // Attempt to load native NAPI binding
      const native = require('@ruvector/router-node');
      await native.initialize({ simd: 'auto' });
      return new NativeHnswProvider(native, 'native', config);
    } catch (error) {
      if (!config.allowJsFallback) {
        throw new Error(
          'Native HNSW binary not available and JS fallback disabled. ' +
          'Install @ruvector/router-node or set allowJsFallback: true.'
        );
      }
      console.warn(
        '[AQE] Native HNSW unavailable, using JS fallback. ' +
        'Install @ruvector/router-node for 150x+ faster vector search.'
      );
      return new NativeHnswProvider(null, 'js-fallback', config);
    }
  }
}
```

### SIMD Backend Selection

ruvector-router-ffi auto-detects the best available SIMD instruction set at startup:

| Platform | SIMD Backend | Distance Throughput |
|----------|-------------|-------------------|
| x86_64 (modern) | AVX2 (256-bit) | ~2B ops/sec |
| x86_64 (older) | SSE4.2 (128-bit) | ~1B ops/sec |
| Apple Silicon | NEON (128-bit) | ~1.5B ops/sec |
| WASM | SIMD128 | ~500M ops/sec |
| Any (fallback) | Scalar | ~200M ops/sec |

### Integration with HnswIndexProvider (ADR-071)

The native provider implements the same `HnswIndexProvider` interface defined in ADR-071, maintaining named indexes:

```typescript
class NativeHnswProvider implements HnswIndexProvider {
  async getIndex(name: string, config?: IndexConfig): Promise<HnswIndex> {
    if (this.backend === 'native') {
      return new NativeHnswIndex(this.native, name, config);
    }
    return new TypeScriptHnswIndex(name, config); // JS fallback
  }

  async getLayerStatus(name: string): Promise<LayerStatus> {
    if (this.backend === 'native') {
      // Native provides progressive layer status from INDEX_SEG
      return this.native.getLayerStatus(name);
    }
    // JS fallback has a single layer (always fully loaded)
    return { layerA: { ready: true, recall: 1.0, latencyMs: 10 },
             layerB: { ready: true, recall: 1.0, latencyMs: 10 },
             layerC: { ready: true, recall: 1.0, latencyMs: 10 } };
  }
}
```

### Migration Path

1. **Week 1**: Add @ruvector/router-node as an optional dependency. Implement NativeHnswProvider with fallback.
2. **Week 2**: Wire NativeHnswProvider behind `useNativeHnsw` feature flag (default: false). Shadow mode: run both native and JS, compare results.
3. **Week 3**: Validate recall parity (top-10 results match >98% between native and JS). Benchmark latency improvement.
4. **Week 4**: Enable native by default for new installations. Existing installations opt-in via feature flag.
5. **Week 6**: Remove feature flag. Native is default. JS remains as automatic fallback.

### Observability

```typescript
interface HnswMetrics {
  backend: 'native' | 'js-fallback';
  simdBackend: 'avx2' | 'neon' | 'sse42' | 'simd128' | 'scalar';
  queryLatencyP50Ms: number;
  queryLatencyP99Ms: number;
  indexSizeVectors: number;
  coldStartMs: number;      // 0 for native (persistent index)
  fallbackCount: number;    // Times native was unavailable
}
```

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Implements | ADR-071 | HNSW Implementation Unification | Provides the concrete native backend for the unified HnswIndexProvider |
| Depends On | ADR-066 | RVF-backed Pattern Store with Progressive HNSW | Uses INDEX_SEG for persistent index storage |
| Depends On | ADR-065 | RVF Integration Strategy -- Hybrid Architecture | Native HNSW operates within the hybrid persistence architecture |
| Extends | ADR-050 | RuVector Neural Backbone | Replaces JS HNSW wrappers with native ruvector engine |
| Relates To | ADR-060 | Semantic Anti-Drift | Anti-drift embedding computation benefits from native speed |
| Relates To | ADR-038 | Memory Unification | Unified memory HNSW migrates to native backend |
| Part Of | MADR-001 | V3 Implementation Initiative | RVF integration -- Phase 1 Foundation |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| RES-001 | RuVector Core & Infrastructure Research | Research Report | `docs/research/ruvector-core-infrastructure.md` |
| RES-002 | RuVector Router, SONA & Utilities Research | Research Report | `docs/research/ruvector-routing-sona-utilities.md` |
| RES-003 | Six Thinking Hats Analysis | Analysis | `docs/research/six-thinking-hats-aqe-ruvector-analysis.md` |
| EXT-001 | ruvector-router-ffi | npm Package | @ruvector/router-node NAPI-RS bindings |
| EXT-002 | ruvector-core HNSW | Technical Spec | ruvector-core HNSW documentation |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-03-15 | Proposed | 2026-09-15 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-03-15 | Initial creation from Six Thinking Hats analysis Phase 1 recommendation. Specifies ruvector-router-ffi via NAPI as the native HNSW engine for ADR-071's unified HnswIndexProvider. |

---

## Definition of Done Checklist

Before requesting approval, verify:

### Core (ECADR)
- [ ] **E - Evidence**: Benchmark validates >100x speedup over JS HNSW at 150K vectors
- [ ] **C - Criteria**: 4 options compared (native NAPI, JS-only, INDEX_SEG-only, external DB)
- [ ] **A - Agreement**: Relevant stakeholders consulted
- [ ] **D - Documentation**: WH(Y) statement complete, ADR published
- [ ] **R - Review**: Review cadence set, owner assigned

### Extended
- [ ] **Dp - Dependencies**: ADR-071, ADR-066, ADR-065, ADR-050 relationships documented
- [ ] **Rf - References**: Research reports linked, benchmark data cited
- [ ] **M - Master**: Linked to MADR-001 V3 Implementation Initiative
