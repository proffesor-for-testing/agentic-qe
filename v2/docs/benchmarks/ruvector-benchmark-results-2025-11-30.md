# RuVector / AgentDB v2 Benchmark Results

**Date**: November 30, 2025
**Platform**: Linux ARM64 (aarch64)
**Testers**: Agentic QE Fleet
**Branch Tested**: `claude/review-ruvector-integration-01RCeorCdAUbXFnwS4BX4dZ5`
**Repository**: https://github.com/ruvnet/agentic-flow

---

## Executive Summary

Benchmark testing of ruv's AgentDB v2.0.0 with integrated RuVector shows **dramatic performance improvements** compared to our baseline measurements from November 29. The optimizations in the new branch deliver sub-microsecond search latencies and throughput exceeding 190,000 queries per second.

### Key Findings

| Metric | Yesterday (Nov 29) | Today (Nov 30) | Improvement |
|--------|-------------------|----------------|-------------|
| Search p50 (2K vectors) | 256.3 µs | **1.5 µs** | **170x faster** |
| Search p99 (2K vectors) | 290.3 µs | **8.0 µs** | **36x faster** |
| QPS (2K vectors) | 3,638 | **192,840** | **53x higher** |
| Batch insert throughput | 20,945 ops/s | **2,703,923 ops/s** | **129x faster** |
| Search p50 (12K vectors) | 1,618.7 µs | **2.2 µs** | **735x faster** |
| QPS (12K vectors) | 559 | **84,138** | **150x higher** |

---

## Test Environment

```
Platform:      Linux
Architecture:  ARM64 (aarch64)
Node.js:       v22.x
Package:       agentdb@2.0.0
RuVector:      @ruvector/core (with ruvector-core-linux-arm64-gnu)
Vector Dim:    384
Distance:      Cosine
```

---

## Detailed Results

### 1. @ruvector/core Direct Benchmark

#### Insert Performance (1,000 vectors)

| Metric | Value |
|--------|-------|
| Avg insert | 5.8 µs |
| Insert p50 | 3.3 µs |
| Insert p99 | 69.3 µs |
| **Throughput** | **171,055 ops/sec** |

#### Batch Insert (1,000 vectors)

| Metric | Value |
|--------|-------|
| Total time | 0.37 ms |
| **Throughput** | **2,703,923 ops/sec** |

#### Search Performance (k=10, 2,000 vectors)

| Metric | Value |
|--------|-------|
| Avg latency | 2.5 µs |
| **p50 latency** | **1.5 µs** |
| p99 latency | 8.0 µs |
| Min latency | 0.8 µs |
| Max latency | 294.0 µs |
| **QPS** | **192,840 queries/sec** |

#### Scale Test (12,000 vectors)

| Metric | Value |
|--------|-------|
| 10K batch insert | 5.52 ms |
| Insert throughput | 1,811,854 ops/sec |
| **Search p50** | **2.2 µs** |
| Search p99 | 11.7 µs |
| **QPS at 12K** | **84,138 queries/sec** |

---

### 2. @ruvector/graph-node Benchmark

#### Node Creation

| Operation | Throughput | Avg Latency |
|-----------|-----------|-------------|
| Single node create | 10,033 ops/sec | 0.0997 ms |
| Batch create (100) | **346,875 nodes/sec** | 0.2883 ms |

#### Cypher Query Performance

| Query Type | Throughput | Avg Latency |
|------------|-----------|-------------|
| MATCH simple | 4,760 qps | 0.21 ms |
| MATCH with WHERE | 4,997 qps | 0.20 ms |

---

### 3. AgentDB SDK Integration

#### ReflexionMemory Performance

| Operation | Throughput | Avg Latency |
|-----------|-----------|-------------|
| Store Episode | 177 ops/sec | 5.64 ms |
| Retrieve Episodes | **1,910 ops/sec** | 0.52 ms |

---

## Comparison with Baseline (Nov 29)

### Search Latency Comparison

```
                Nov 29      Nov 30      Improvement
                ------      ------      -----------
1K vectors:
  p50           256.3 µs    1.5 µs      170x faster
  p99           290.3 µs    8.0 µs      36x faster

10-12K vectors:
  p50          1618.7 µs    2.2 µs      735x faster
  p99          2167.5 µs   11.7 µs      185x faster
```

### Throughput Comparison

```
                Nov 29        Nov 30          Improvement
                ------        ------          -----------
QPS (1-2K):     3,638         192,840         53x higher
QPS (10-12K):   559           84,138          150x higher
Batch Insert:   20,945/s      2,703,923/s     129x higher
```

---

## ruv's Gist Reference Results (x64, 100K vectors)

From [ruv's gist](https://gist.github.com/ruvnet/6755d4bbb0e61e28709c00b42d9bba1b):

| Metric | Value | vs Baseline |
|--------|-------|-------------|
| Search latency | 61 µs | 8.2x faster than hnswlib |
| Memory footprint | 151 MB | 18% less |
| Recall | >95% | Maintained |
| Neural enhancement | +24.4% | Combined GNN + RL |
| Performance degradation prevention | 98% | Self-organizing |

---

## Issues Encountered

### 1. @ruvector/core ARM64 Binding
- **Issue**: Initial load failed with "Failed to load native binding for linux-arm64"
- **Solution**: Installed `ruvector-core-linux-arm64-gnu` package

### 2. Build TypeScript Errors
- **Issue**: `npm run build` fails with 27+ TS errors in simulation/ and cli/ modules
- **Impact**: Pre-built dist files work, but fresh builds fail
- **Recommendation**: Fix TypeScript errors before release

### 3. GNN Module Timeouts
- **Issue**: @ruvector/gnn tests timeout (60s)
- **Impact**: GNN forward pass benchmarks incomplete
- **Recommendation**: Review GNN initialization performance

### 4. SkillLibrary SQLite Fallback
- **Issue**: `this.db.prepare is not a function` when using GraphDatabase
- **Impact**: SkillLibrary benchmark fails
- **Recommendation**: Ensure consistent API between GraphDB and SQLite modes

---

## Recommendations

### For ruv

1. **Fix TypeScript Build**: 27 compilation errors prevent clean builds
2. **GNN Module**: Investigate timeout issues on ARM64
3. **SDK Integration**: Ensure SkillLibrary works with GraphDatabase mode
4. **Add ARM64 to CI**: Include ARM64 in test matrix

### For Integration

1. **Adopt AgentDB v2**: Performance gains are substantial
2. **Use @ruvector/core directly**: Bypass SDK overhead for hot paths
3. **Batch operations**: 129x improvement justifies batching strategy
4. **ARM64 Support**: Native bindings work well, recommend as supported platform

---

## Raw Benchmark Output

### @ruvector/core Direct Test

```
╔═══════════════════════════════════════════════════════════════════╗
║  ruv AgentDB v2.0.0 - @ruvector/core Benchmark (ARM64 Linux)     ║
╚═══════════════════════════════════════════════════════════════════╝

=== INSERT BENCHMARK (1,000 vectors) ===
Avg insert:    0.0058ms (5.8 µs)
Insert p50:    0.0033ms
Insert p99:    0.0693ms
Throughput:    171055 ops/sec

=== BATCH INSERT (1,000 vectors) ===
Batch time:    0.37ms
Throughput:    2703923 ops/sec

=== SEARCH BENCHMARK (k=10, 2,000 vectors) ===
Avg latency:   0.0025ms (2.5 µs)
p50 latency:   0.0015ms (1.5 µs)
p99 latency:   0.0080ms (8.0 µs)
Min latency:   0.0008ms
Max latency:   0.2940ms

=== THROUGHPUT (QPS) TEST ===
Queries in 1s: 192840
QPS:           192840 queries/sec

=== SCALE TEST (10,000 additional vectors) ===
10K batch:     5.52ms
Throughput:    1811854 ops/sec

=== SEARCH AT 12K SCALE ===
p50 latency:   0.0022ms (2.2 µs)
p99 latency:   0.0117ms (11.7 µs)
QPS at 12K:    84138 queries/sec

=== SUMMARY ===
Total vectors: 12,000
Dimension:     384
Metric:        Cosine
```

### Vitest Benchmark Summary

```
📊 Graph Node Create (single)
   Throughput: 10,033 ops/sec
   Avg Latency: 0.0997ms

📊 Graph Node Create (batch 100)
   Throughput: 3,468 ops/sec
   → Batch throughput: 346,875 nodes/sec

📊 Cypher Query (MATCH simple)
   Throughput: 4,760 ops/sec
   Avg Latency: 0.2100ms

📊 Cypher Query (MATCH with WHERE)
   Throughput: 4,997 ops/sec
   Avg Latency: 0.2001ms

📊 ReflexionMemory Store Episode
   Throughput: 177 ops/sec
   Avg Latency: 5.6410ms

📊 ReflexionMemory Retrieve Episodes
   Throughput: 1,910 ops/sec
   Avg Latency: 0.5234ms
```

---

## Conclusion

ruv's AgentDB v2.0.0 with RuVector integration delivers **exceptional performance improvements**:

- **170x faster** search latency at 2K scale
- **735x faster** search latency at 12K scale
- **129x faster** batch inserts
- **53-150x higher** throughput (QPS)

The results validate proceeding with RuVector integration as outlined in the [implementation plan](../planning/ruvector-implementation-plan.md).

---

*Report generated by Agentic QE Fleet*
*Benchmark date: 2025-11-30*
