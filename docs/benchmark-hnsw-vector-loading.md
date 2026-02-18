# HNSW Vector Loading Performance Benchmark

## Problem

Loading 5,073 HNSW vectors (768 dimensions) at CLI startup took ~16-18 seconds due to the pure JavaScript HNSW graph construction algorithm. The `InMemoryHNSWIndex` rebuilt the full navigable small-world graph on every session start, with O(n * efConstruction * log(n) * dim) complexity.

## Solution

Replaced `InMemoryHNSWIndex` (pure JS HNSW) with `RuvectorFlatIndex` — a flat vector store that uses `@ruvector/gnn` (Rust/NAPI) for native differentiable search ranking, with pre-cached L2 norms for fast cosine similarity scoring.

Key optimizations:
- **No graph construction at load time** — vectors stored flat as `Float32Array`, O(1) per insert
- **Native Rust ranking** via `@ruvector/gnn differentiableSearch` for top-k candidate selection
- **Pre-cached norms** at insert time — cosine similarity reduces to dot product + 1 division
- **Zero-copy Float32Array** — no `Array.from()` conversions between search and scoring
- **Float32Array buffer view** for SQLite BLOB deserialization (replaces per-element `readFloatLE`)

## Benchmark Configuration

| Parameter | Value |
|-----------|-------|
| Vectors | 5,073 |
| Dimensions | 768 (MiniLM all-MiniLM-L6-v2) |
| Search queries | 100 |
| k (top results) | 5 |
| Platform | Linux aarch64, Node.js v24.13.0 |
| Native backend | @ruvector/gnn v0.1.22 (Rust/NAPI) |

## Results

| Implementation | Build (ms) | Search (ms) | Avg/query (ms) | Memory (MB) | Recall |
|---|---:|---:|---:|---:|---:|
| Pure JS HNSW (efC=200) + readFloatLE **[OLD]** | 17,951 | 234 | 2.34 | 85 | 70.2% |
| Pure JS HNSW (efC=200) + Float32Array deser | 16,062 | 390 | 3.90 | 98 | 69.8% |
| Pure JS HNSW (efC=50) + Float32Array deser | 10,612 | 258 | 2.58 | 72 | 69.2% |
| Pure JS HNSW (efC=50) + readFloatLE | 9,161 | 223 | 2.23 | 96 | 65.8% |
| @ruvector/gnn raw (Rust, no cosine scores) | 4 | 877 | 8.77 | 2 | 100.0% |
| **RuvectorFlatIndex [NEW]** | **65** | **337** | **3.37** | **25** | **100.0%** |

## Summary

| Metric | Old | New | Change |
|---|---|---|---|
| Build/load time | 17,951ms | 65ms | **276x faster** |
| Search per query | 2.34ms | 3.37ms | ~same (1.4x) |
| Recall accuracy | 70.2% | 100.0% | **Perfect** |
| Memory usage | 85MB | 25MB | **3.4x less** |

### Why search is ~same speed despite brute-force

At 5,073 vectors, the HNSW graph traversal advantage (O(log n)) is offset by:
- HNSW's JS-level cosine similarity calls during beam search
- Cache-friendly sequential Float32Array scan in flat index
- Pre-cached norms eliminating redundant norm computation

HNSW graph construction only pays off above ~50k vectors where the O(log n) search savings exceed the O(n * efConstruction) build cost.

### Why recall improved from 70% to 100%

HNSW is an **approximate** nearest neighbor algorithm. With M=16 and efSearch=100, it misses ~30% of true nearest neighbors due to the greedy graph traversal. The flat index computes exact distances against all candidates.

## Files Changed

- `v3/src/kernel/unified-memory-hnsw.ts` — Added `RuvectorFlatIndex` class with pre-cached norms
- `v3/src/kernel/unified-memory.ts` — Swapped `InMemoryHNSWIndex` to `RuvectorFlatIndex`, optimized `bufferToFloatArray`
- `v3/scripts/benchmark-hnsw-loading.ts` — Benchmark script (6 implementations compared)

## Reproducing

```bash
npm run build
npx tsx v3/scripts/benchmark-hnsw-loading.ts
```
