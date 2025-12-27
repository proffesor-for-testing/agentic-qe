# Binary Metadata Cache Architecture

**Version:** 1.0.0
**Status:** Design Phase (A1.1)
**Author:** System Architecture Designer
**Date:** 2025-12-12

## Executive Summary

This document defines a binary caching system for pattern metadata to achieve 10x faster test discovery by reducing pattern load time from 32ms (current SQLite baseline) to <5ms (target).

**Current State:**
- Pattern bank reads from SQLite on every query: 32ms p95 latency
- Test discovery time: 500ms average
- No caching layer between SQLite and application

**Target State:**
- Pattern load time: <5ms (6.4x improvement)
- Test discovery time: 50ms (10x improvement)
- Binary cache with graceful SQLite fallback

---

## 1. Format Selection: MessagePack vs FlatBuffers

### 1.1 Analysis Criteria

| Criterion | Weight | MessagePack | FlatBuffers |
|-----------|--------|-------------|-------------|
| **Serialization Speed** | 25% | 8/10 | 9/10 |
| **Deserialization Speed** | 30% | 7/10 | 10/10 |
| **Size Efficiency** | 15% | 9/10 | 8/10 |
| **Schema Evolution** | 15% | 6/10 | 9/10 |
| **Float32Array Support** | 10% | 7/10 | 10/10 |
| **TypeScript Integration** | 5% | 9/10 | 7/10 |
| **Weighted Score** | - | **7.45/10** | **8.85/10** |

### 1.2 Decision: FlatBuffers (Selected)

**Rationale:**

1. **Zero-Copy Access (Critical for <5ms target)**
   - FlatBuffers allows direct memory mapping without deserialization
   - No parsing overhead for reading frequently accessed fields
   - Essential for sub-5ms latency with large pattern banks (1000+ patterns)

2. **Native Float32Array Support**
   - Vector embeddings stored as binary buffers
   - No conversion overhead from JSON arrays
   - 4-8x faster embedding access than MessagePack

3. **Schema Versioning**
   - Built-in schema evolution with field deprecation
   - Forward/backward compatibility for cache migration
   - Critical for production deployments with rolling updates

4. **Benchmark Justification (Estimated):**
   ```
   Pattern Load Benchmark (1000 patterns):
   - SQLite (current):        32ms
   - MessagePack:            12-15ms  (2.1-2.7x improvement)
   - FlatBuffers:             4-6ms   (5.3-8x improvement)

   Embedding Access (768-dim vector):
   - SQLite + JSON parse:    2.5ms
   - MessagePack:            1.2ms
   - FlatBuffers (zero-copy): 0.15ms  (16x improvement)
   ```

5. **Trade-offs:**
   - **Con:** Requires schema compilation (.fbs → .ts)
   - **Con:** More complex setup than MessagePack
   - **Pro:** Future-proof for 10K+ pattern banks
   - **Pro:** Lower memory footprint with zero-copy

### 1.3 Alternative Considered: MessagePack

MessagePack was rejected due to:
- Parsing overhead for large pattern banks
- No zero-copy access for embeddings
- Limited schema evolution capabilities
- 2-3ms slower than FlatBuffers for target use case

**Use Case Suitability:**
- MessagePack: Better for <100 patterns, rapid prototyping
- FlatBuffers: Better for 1000+ patterns, production systems

---

## 2. Cache Data Structure Design

### 2.1 FlatBuffers Schema (cache.fbs)

```flatbuffers
namespace AgenticQE.Cache;

// Root table: Binary cache container
table BinaryCache {
  version: uint32;              // Cache format version (1)
  timestamp: uint64;            // Generation timestamp (Unix ms)
  checksum: string;             // SHA-256 checksum for validation
  patterns: [PatternEntry];     // Pattern metadata array
  agent_configs: [AgentConfig]; // Agent configuration cache
  indexes: IndexData;           // Pre-built search indexes
}

// Pattern metadata entry
table PatternEntry {
  id: string (key);             // Pattern unique ID
  type: string;                 // Pattern type (e.g., "unit-test")
  domain: string;               // Domain (e.g., "api")
  framework: string;            // Test framework (e.g., "jest")
  embedding: [float];           // 768-dim vector (Float32Array)
  content: string;              // Pattern content/template
  metadata: PatternMetadata;    // Extended metadata
}

// Pattern metadata
table PatternMetadata {
  coverage: float;              // Code coverage score (0-1)
  flakiness_score: float;       // Flakiness probability (0-1)
  verdict: Verdict;             // Test verdict enum
  created_at: uint64;           // Creation timestamp
  last_used: uint64;            // Last usage timestamp
  usage_count: uint32;          // Usage counter
  success_count: uint32;        // Success counter
}

// Test verdict enum
enum Verdict: byte {
  Success = 0,
  Failure = 1,
  Flaky = 2,
  Unknown = 3
}

// Agent configuration
table AgentConfig {
  agent_id: string (key);       // Agent unique ID
  type: string;                 // Agent type (e.g., "test-generator")
  config_json: string;          // JSON-serialized config
  version: string;              // Config version
  updated_at: uint64;           // Last update timestamp
}

// Pre-built indexes for fast lookup
table IndexData {
  domain_index: [DomainIndex];  // Domain → pattern ID mapping
  type_index: [TypeIndex];      // Type → pattern ID mapping
  framework_index: [FrameworkIndex]; // Framework → pattern ID mapping
}

table DomainIndex {
  domain: string (key);
  pattern_ids: [string];
}

table TypeIndex {
  type: string (key);
  pattern_ids: [string];
}

table FrameworkIndex {
  framework: string (key);
  pattern_ids: [string];
}

root_type BinaryCache;
```

### 2.2 Memory Layout Optimization

**Design Principles:**
1. **Struct-of-Arrays (SoA):** Group similar data types for cache-friendly access
2. **Embedding Alignment:** 16-byte alignment for SIMD operations
3. **String Interning:** Deduplicate domain/type/framework strings
4. **Index Pre-computation:** Build domain/type/framework lookup tables at cache generation

**Memory Estimates (1000 patterns):**
```
Component                    Size per Entry    Total (1000 entries)
─────────────────────────────────────────────────────────────────
Pattern ID (string)          32 bytes         32 KB
Embedding (768-dim float32)  3072 bytes       3.07 MB
Metadata                     64 bytes         64 KB
Content (avg 500 chars)      500 bytes        500 KB
Indexes                      -                50 KB (estimated)
FlatBuffers overhead         -                100 KB (estimated)
─────────────────────────────────────────────────────────────────
Total                                         ~3.9 MB
```

**Cache Size Targets:**
- 1000 patterns: ~4 MB
- 10K patterns: ~40 MB
- 100K patterns: ~400 MB (future scaling)

---

## 3. Versioning & Checksum Validation

### 3.1 Version Strategy

**Semantic Versioning for Cache Format:**
```typescript
interface CacheVersion {
  major: number;  // Breaking schema changes (e.g., field removal)
  minor: number;  // Backward-compatible additions (new optional fields)
  patch: number;  // Non-breaking optimizations
}
```

**Current Version:** `1.0.0`

**Version Compatibility Matrix:**

| Cache Version | Code Version | Action |
|---------------|--------------|--------|
| 1.x.x         | 1.y.y        | Compatible (load cache) |
| 2.x.x         | 1.y.y        | Incompatible (rebuild cache) |
| 1.x.x         | 2.y.y        | Deprecated (rebuild cache) |

**Version Encoding:**
- Stored in `BinaryCache.version` as `uint32`
- Format: `(major << 16) | (minor << 8) | patch`
- Example: v1.2.3 → `0x00010203` (66051)

### 3.2 Checksum Validation

**Two-Level Validation:**

1. **File-Level Checksum (SHA-256):**
   ```typescript
   function computeCacheChecksum(buffer: Uint8Array): string {
     const hash = crypto.subtle.digest('SHA-256', buffer);
     return Buffer.from(hash).toString('hex');
   }
   ```

2. **Entry-Level Checksums (Optional):**
   - Per-pattern CRC32 for partial validation
   - Stored in `PatternMetadata` (future extension)

**Validation Flow:**
```
1. Read cache file
2. Extract stored checksum from BinaryCache.checksum
3. Compute actual checksum (exclude checksum field)
4. Compare checksums
   ├─ Match: Load cache
   └─ Mismatch: Log error → Fallback to SQLite
```

**Performance Impact:**
- SHA-256 computation: ~1ms for 4MB cache
- Total validation overhead: <2ms (acceptable for 5ms target)

---

## 4. Invalidation Triggers & TTL Strategy

### 4.1 Invalidation Triggers

**Event-Based Invalidation:**

| Trigger Event | Action | Priority |
|---------------|--------|----------|
| Pattern stored to SQLite | Mark cache stale | High |
| Pattern deleted | Mark cache stale | High |
| Agent config updated | Mark cache stale | Medium |
| SQLite schema migration | Force rebuild | Critical |
| Manual `aqe optimize` | Force rebuild | Low |

**Implementation:**
```typescript
interface CacheInvalidation {
  trigger: 'pattern_stored' | 'pattern_deleted' | 'config_updated' | 'schema_migration' | 'manual';
  timestamp: number;
  requiresRebuild: boolean;
}

class CacheInvalidator {
  private staleTimestamp: number = 0;

  markStale(trigger: CacheInvalidation): void {
    this.staleTimestamp = Date.now();
    if (trigger.requiresRebuild) {
      this.scheduleCacheRebuild();
    }
  }

  isCacheValid(cacheTimestamp: number): boolean {
    return cacheTimestamp > this.staleTimestamp;
  }
}
```

### 4.2 TTL Strategy

**Time-Based Expiration:**

```typescript
interface TTLConfig {
  maxAge: number;           // 3600000ms (1 hour default)
  checkInterval: number;    // 300000ms (5 min)
  backgroundRebuild: boolean; // true (rebuild in background)
}
```

**TTL Decision Matrix:**

| Scenario | TTL | Rationale |
|----------|-----|-----------|
| Development (CI/local) | 10 minutes | Frequent pattern changes |
| Staging | 1 hour | Moderate stability |
| Production | 24 hours | High stability, background rebuild |

**Background Rebuild:**
1. When cache age exceeds 80% of TTL:
   - Trigger background rebuild
   - Continue serving stale cache
   - Hot-swap cache after rebuild completes
2. Prevents cold start latency spikes

**TTL Validation:**
```typescript
function isCacheFresh(cacheTimestamp: number, ttl: number): boolean {
  const age = Date.now() - cacheTimestamp;
  return age < ttl;
}

function shouldBackgroundRebuild(cacheTimestamp: number, ttl: number): boolean {
  const age = Date.now() - cacheTimestamp;
  return age > (ttl * 0.8); // 80% threshold
}
```

---

## 5. Graceful Fallback to SQLite

### 5.1 Fallback Triggers

**Automatic Fallback Conditions:**

1. **Cache Corruption:**
   - Checksum validation failure
   - Invalid FlatBuffers structure
   - Version incompatibility

2. **Missing Cache File:**
   - First initialization
   - Manual cache deletion

3. **I/O Errors:**
   - Permission denied
   - Disk full
   - File locked by another process

4. **Performance Degradation:**
   - Cache load time > 10ms (2x target)
   - Indicates potential corruption or disk issues

### 5.2 Fallback Implementation

**Multi-Tier Architecture:**

```typescript
class PatternLoader {
  private cache: BinaryCache | null = null;
  private sqliteAdapter: SQLiteAdapter;

  async loadPattern(id: string): Promise<TestPattern | null> {
    // Tier 1: Binary cache (target: <5ms)
    if (this.cache && this.isCacheValid()) {
      try {
        return this.loadFromCache(id); // <5ms
      } catch (error) {
        this.logCacheFallback('cache_error', error);
      }
    }

    // Tier 2: SQLite fallback (baseline: 32ms)
    try {
      const pattern = await this.sqliteAdapter.getPattern(id);

      // Trigger background cache rebuild
      if (!this.cache) {
        this.scheduleCacheRebuild();
      }

      return pattern;
    } catch (error) {
      this.logFatalError('sqlite_error', error);
      return null;
    }
  }

  private logCacheFallback(reason: string, error: Error): void {
    console.warn(`[BinaryCache] Fallback to SQLite: ${reason}`, {
      error: error.message,
      timestamp: Date.now()
    });
  }
}
```

**Fallback Decision Tree:**

```
Pattern Load Request
│
├─ Cache available?
│  ├─ Yes
│  │  ├─ Cache valid?
│  │  │  ├─ Yes → Load from cache (<5ms)
│  │  │  └─ No → Fallback to SQLite (32ms) + Schedule rebuild
│  │  └─ Cache corrupt?
│  │     └─ Fallback to SQLite (32ms) + Log error
│  └─ No → Fallback to SQLite (32ms) + Build cache
```

### 5.3 Monitoring & Alerting

**Metrics to Track:**

```typescript
interface CacheMetrics {
  cacheHitRate: number;        // Target: >95%
  avgCacheLoadTime: number;    // Target: <5ms
  avgSQLiteFallbackTime: number; // Baseline: 32ms
  cacheCorruptionCount: number; // Target: 0
  cacheRebuildCount: number;   // Monitor frequency
}
```

**Alerting Rules:**

| Condition | Threshold | Action |
|-----------|-----------|--------|
| Cache hit rate | <90% | Investigate invalidation frequency |
| Avg cache load time | >10ms | Check disk I/O, consider SSD |
| Corruption count | >1/day | Investigate disk health |
| Rebuild frequency | >10/hour | Optimize invalidation logic |

---

## 6. Migration Plan from SQLite Queries

### 6.1 Migration Phases

**Phase 1: Cache Generation (Week 1)**
1. Implement FlatBuffers schema compiler integration
2. Create `BinaryCacheBuilder` to serialize SQLite data
3. Add cache file I/O with atomic writes
4. Initial cache generation on `aqe init`

**Phase 2: Read-Only Cache (Week 2)**
1. Implement `BinaryCacheReader` with zero-copy access
2. Add validation (checksum, version)
3. Integrate with existing `IPatternStore` interface
4. A/B testing in CI (50% cache, 50% SQLite)

**Phase 3: Invalidation & Rebuild (Week 3)**
1. Implement event-based invalidation hooks
2. Add TTL management with background rebuild
3. Graceful fallback to SQLite on errors
4. Performance benchmarking vs SQLite baseline

**Phase 4: Production Rollout (Week 4)**
1. Feature flag for cache enablement
2. Gradual rollout (10% → 50% → 100%)
3. Monitor cache hit rates and fallback frequency
4. Optimize based on production metrics

### 6.2 Backward Compatibility

**Dual-Mode Operation:**

```typescript
interface PatternStoreConfig {
  enableBinaryCache: boolean;  // Feature flag
  cachePath: string;           // Default: .aqe/cache/patterns.bin
  fallbackToSQLite: boolean;   // Always true for safety
}
```

**Compatibility Matrix:**

| Scenario | Behavior |
|----------|----------|
| New installation | Generate cache on first `aqe init` |
| Existing installation | Detect missing cache → Build cache → Use cache |
| Cache disabled | Use SQLite only (no performance degradation) |
| Cache corrupted | Fallback to SQLite + Log warning |

### 6.3 Data Consistency Strategy

**Write-Through Pattern (Future Extension):**

```typescript
class WriteThoughCache {
  async storePattern(pattern: TestPattern): Promise<void> {
    // 1. Write to SQLite (source of truth)
    await this.sqliteAdapter.storePattern(pattern);

    // 2. Invalidate cache (mark stale)
    this.invalidator.markStale({
      trigger: 'pattern_stored',
      timestamp: Date.now(),
      requiresRebuild: false
    });

    // 3. Optional: Hot-update cache (future optimization)
    // await this.cache.updateEntry(pattern);
  }
}
```

**Current Implementation (Phase 1-3):**
- SQLite is source of truth
- Cache is read-only, regenerated on invalidation
- No cache coherency issues (eventual consistency acceptable)

---

## 7. Performance Projections

### 7.1 Target vs Baseline Comparison

| Metric | Baseline (SQLite) | Target (Cache) | Improvement |
|--------|-------------------|----------------|-------------|
| Pattern load (single) | 2.5ms | <0.5ms | 5x faster |
| Pattern load (batch 100) | 32ms | <5ms | 6.4x faster |
| Embedding access | 2.5ms | <0.15ms | 16x faster |
| Test discovery (1000 patterns) | 500ms | <50ms | 10x faster |

### 7.2 Latency Breakdown (Projected)

**SQLite Path (Current):**
```
Total: 32ms
├─ SQLite query execution: 18ms (56%)
├─ Row deserialization: 8ms (25%)
├─ JSON parsing (embeddings): 4ms (12%)
└─ Object construction: 2ms (7%)
```

**Binary Cache Path (Target):**
```
Total: <5ms
├─ File mmap (if not cached): 2ms (40%)
├─ FlatBuffers deserialization: 0ms (zero-copy)
├─ Index lookup: 1ms (20%)
└─ Object construction: 2ms (40%)
```

### 7.3 Scaling Characteristics

**Pattern Bank Size vs Load Time:**

| Patterns | SQLite (ms) | Binary Cache (ms) | Improvement |
|----------|-------------|-------------------|-------------|
| 100      | 12          | 2                 | 6x          |
| 1,000    | 32          | 5                 | 6.4x        |
| 10,000   | 180         | 18                | 10x         |
| 100,000  | 1,800       | 80                | 22.5x       |

**Note:** FlatBuffers scales better than SQLite due to:
- Zero-copy access (no parsing overhead)
- Sequential memory layout (cache-friendly)
- Pre-built indexes (O(1) lookup vs O(log n) B-tree)

---

## 8. Risk Assessment & Mitigation

### 8.1 Risks

| Risk | Severity | Probability | Mitigation |
|------|----------|-------------|------------|
| Cache corruption | High | Low | Checksum validation + SQLite fallback |
| Version incompatibility | Medium | Medium | Semantic versioning + migration |
| Disk space exhaustion | Low | Low | Cache size limits + cleanup |
| Stale cache serving | Medium | Medium | TTL + event-based invalidation |
| Performance regression | High | Low | A/B testing + gradual rollout |

### 8.2 Mitigation Strategies

1. **Cache Corruption:**
   - SHA-256 checksum validation on load
   - Automatic fallback to SQLite
   - Background cache rebuild
   - Monitoring alerts on corruption frequency

2. **Version Incompatibility:**
   - Semantic versioning in cache header
   - Automatic cache rebuild on version mismatch
   - Migration scripts for major version changes

3. **Stale Cache:**
   - Event-based invalidation on pattern changes
   - TTL-based expiration
   - Manual cache clear via `aqe optimize`

4. **Performance Regression:**
   - Continuous benchmarking in CI
   - Feature flag for cache enablement
   - Gradual rollout (10% → 50% → 100%)
   - Instant rollback capability

---

## 9. Success Criteria

### 9.1 Functional Requirements

- ✅ Cache format specification complete (FlatBuffers)
- ✅ Versioning strategy defined (semantic versioning)
- ✅ Checksum validation strategy (SHA-256)
- ✅ Invalidation triggers documented (event-based + TTL)
- ✅ Graceful fallback to SQLite on corruption
- ✅ Migration plan with phased rollout

### 9.2 Performance Requirements

| Requirement | Target | Validation Method |
|-------------|--------|-------------------|
| Pattern load time | <5ms | Benchmark suite |
| Test discovery time | <50ms | End-to-end test |
| Cache hit rate | >95% | Production metrics |
| Embedding access | <0.15ms | Microbenchmark |
| Memory footprint (1000 patterns) | <10MB | Memory profiler |

### 9.3 Quality Attributes

- **Reliability:** Checksum validation + fallback ensures zero data loss
- **Maintainability:** Schema evolution via FlatBuffers versioning
- **Scalability:** Supports 100K+ patterns with linear scaling
- **Observability:** Metrics for cache hit rate, fallback frequency, rebuild count

---

## 10. Next Steps (A1.2 Implementation)

1. **Setup FlatBuffers Toolchain:**
   - Install `flatc` compiler
   - Integrate schema compilation into build process
   - Generate TypeScript bindings

2. **Implement Core Interfaces:**
   - `BinaryCacheBuilder`: SQLite → FlatBuffers serialization
   - `BinaryCacheReader`: Zero-copy cache access
   - `CacheValidator`: Checksum + version validation

3. **Integration Testing:**
   - Unit tests for serialization/deserialization
   - Integration tests for SQLite fallback
   - Performance benchmarks vs baseline

4. **CI/CD Integration:**
   - Cache generation in `aqe init`
   - Benchmark regression tests
   - Feature flag for gradual rollout

---

## Appendix A: FlatBuffers vs MessagePack Benchmarks

**Methodology:**
- Benchmark tool: `npm run benchmark:serialization`
- Dataset: 1000 test patterns with 768-dim embeddings
- Hardware: 8-core CPU, 16GB RAM, NVMe SSD

**Results (Projected):**

| Operation | MessagePack | FlatBuffers | Winner |
|-----------|-------------|-------------|--------|
| Serialize 1000 patterns | 45ms | 38ms | FlatBuffers (1.2x) |
| Deserialize 1000 patterns | 62ms | 8ms | FlatBuffers (7.8x) |
| Access single embedding | 1.2ms | 0.15ms | FlatBuffers (8x) |
| Memory usage (1000 patterns) | 4.8MB | 3.9MB | FlatBuffers (1.2x) |
| Schema evolution support | Limited | Full | FlatBuffers |

**Conclusion:** FlatBuffers is the clear winner for our use case due to zero-copy deserialization and native Float32Array support.

---

## Appendix B: Cache File Format Specification

**File Layout:**
```
┌─────────────────────────────────────────────────────┐
│ File Header (64 bytes)                              │
├─────────────────────────────────────────────────────┤
│ Magic Number: 0x41514543 ("AQEC")           4 bytes│
│ Format Version: 0x00010000 (1.0.0)           4 bytes│
│ Checksum: SHA-256 hash                      32 bytes│
│ Timestamp: Unix milliseconds                 8 bytes│
│ Reserved                                    16 bytes│
├─────────────────────────────────────────────────────┤
│ FlatBuffers Payload (variable)                      │
├─────────────────────────────────────────────────────┤
│ - BinaryCache root table                            │
│ - PatternEntry array                                │
│ - AgentConfig array                                 │
│ - IndexData tables                                  │
└─────────────────────────────────────────────────────┘
```

**File Naming Convention:**
- Path: `.aqe/cache/patterns.bin`
- Versioned: `.aqe/cache/patterns-v1.bin` (future)
- Backup: `.aqe/cache/patterns.bin.bak`

---

## Appendix C: Glossary

- **Zero-Copy:** Direct memory mapping without deserialization overhead
- **HNSW:** Hierarchical Navigable Small World (vector search algorithm)
- **TTL:** Time-To-Live (cache expiration time)
- **MMR:** Maximal Marginal Relevance (diversity-aware search)
- **FlatBuffers:** Memory-efficient serialization library by Google
- **MessagePack:** Binary JSON-like serialization format

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-12 | Initial design specification |

---

**End of Document**
