# ADR-085: Temporal Tensor Pattern Compression for the 150K+ Pattern Database

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-085 |
| **Status** | Proposed |
| **Date** | 2026-03-15 |
| **Author** | Architecture Team |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** AQE v3's 150K+ pattern database stored as full-precision Float32 embeddings (384 dimensions per pattern, ~230 MB of raw embedding data) alongside HNSW indexes, confidence histories, and metadata in the unified memory system,

**facing** growing memory pressure as the knowledge base scales beyond 150K patterns toward a projected 500K-1M patterns, where maintaining all embeddings at full Float32 precision regardless of access frequency wastes memory on cold patterns that are rarely queried (access-frequency analysis shows ~20% of patterns serve ~80% of queries while ~50% have not been accessed in 30+ days), and where no compression exists today to reduce the footprint,

**we decided for** implementing access-pattern-tiered compression using ruvector-temporal-tensor's groupwise symmetric quantization, where embeddings are automatically quantized based on access recency: Hot patterns (accessed within 7 days) remain at 8-bit precision (~4x compression), Warm patterns (7-30 days) are quantized to 5-7 bit (~4.6-6.4x compression), and Cold patterns (30+ days) are quantized to 3-bit (~10.7x compression), with automatic promotion back to higher precision when a cold pattern is accessed,

**and neglected** (a) uniform 8-bit quantization for all patterns (rejected: wastes precision budget on cold patterns and does not achieve enough compression for patterns that may never be queried again), (b) pruning cold patterns entirely (rejected: irreversible data loss; cold patterns may become relevant when a dormant codebase area is revisited), (c) offloading cold patterns to disk-only storage (rejected: creates a cold-start latency spike when cold patterns are needed; disk I/O is orders of magnitude slower than decompressing from 3-bit in memory),

**to achieve** 4-10x memory reduction for the pattern embedding database (from ~230 MB to ~35-60 MB at current scale) while maintaining search recall above 95% for hot patterns, headroom for growth toward 500K-1M patterns within the same memory budget, automatic tiering that requires no manual configuration or pattern lifecycle management, and a migration path that preserves all existing pattern data without loss,

**accepting that** quantization introduces recall degradation (estimated <2% at 8-bit, <5% at 5-bit, <10% at 3-bit for cold patterns), the tiering algorithm must track access patterns per embedding (adding per-pattern metadata overhead), promotion from cold to hot triggers a re-quantization that adds ~1ms latency on the first access, and the migration of 150K existing patterns to the tiered system requires a careful one-time compression pass.

---

## Context

AQE v3's pattern database has grown to 150K+ patterns, each storing a 384-dimensional Float32 embedding (1,536 bytes per embedding). The raw embedding data alone occupies approximately 230 MB. With HNSW graph structure, metadata, and confidence histories, the total memory footprint approaches 400-500 MB.

This is sustainable at the current scale but poses three forward-looking problems:

1. **Growth trajectory**: As AQE learns across more projects and domains, the pattern count is projected to reach 500K-1M within 12 months. At full Float32 precision, this would require 750 MB - 1.5 GB of embedding memory alone, exceeding reasonable memory budgets for an embedded tool.

2. **Access pattern skew**: Analysis of the pattern database reveals a strong access-frequency skew:
   - ~20% of patterns (30K) serve ~80% of queries (hot tier)
   - ~30% of patterns (45K) are accessed occasionally (warm tier)
   - ~50% of patterns (75K) have not been accessed in 30+ days (cold tier)

   Full Float32 precision for all patterns treats hot and cold patterns identically, wasting memory on patterns that may never be queried again.

3. **Portable intelligence containers (ADR-073)**: Brain exports package the full pattern database into .rvf files for sharing. Compressed embeddings reduce container size by 4-10x, making transfer practical over networks and enabling smaller teams to import large knowledge bases.

ruvector-temporal-tensor provides exactly this capability:

- **Groupwise symmetric quantization**: Quantizes groups of values with a shared scale factor, preserving relative relationships within groups while reducing bit width.
- **Access-pattern tiering**: Hot/Warm/Cold tiers with configurable bit widths and promotion/demotion policies.
- **Specialized pack/unpack**: Hand-optimized pack/unpack functions for 3/5/7/8-bit widths, processing 8 values at a time for SIMD-friendly alignment.
- **Zero runtime dependencies**: Pure Rust, fully WASM-compatible, no external libraries.

### Compression Analysis

| Tier | Bit Width | Compression | Memory per 384-dim | Memory for 150K patterns | Recall Impact |
|------|-----------|-------------|--------------------|--------------------------|-|
| Full (current) | 32-bit float | 1x | 1,536 bytes | ~230 MB | Baseline |
| Hot | 8-bit int | 4x | 384 bytes | ~57 MB (for 30K hot) | <2% degradation |
| Warm | 5-bit int | 6.4x | 240 bytes | ~10.8 MB (for 45K warm) | <5% degradation |
| Cold | 3-bit int | 10.7x | 144 bytes | ~10.8 MB (for 75K cold) | <10% degradation |
| **Tiered total** | Mixed | **~5.8x** | Mixed | **~79 MB** | **<3% weighted avg** |

The weighted average recall impact is <3% because 80% of queries hit hot patterns (which have <2% degradation), and the remaining 20% of queries are distributed across warm and cold patterns.

---

## Options Considered

### Option 1: Access-Pattern-Tiered Compression via ruvector-temporal-tensor (Selected)

Automatically classify patterns into Hot/Warm/Cold tiers based on access recency and frequency. Apply groupwise symmetric quantization at tier-appropriate bit widths. Promote patterns to higher precision on access; demote patterns as they age.

**Pros:**
- 4-10x memory reduction depending on access pattern distribution
- Automatic tiering requires no manual configuration
- Promotion on access ensures hot patterns maintain highest precision
- Specialized 3/5/7/8-bit pack/unpack is SIMD-aligned for performance
- Zero external dependencies, WASM-compatible
- Preserves all patterns (no data loss, unlike pruning)
- Reduces portable intelligence container sizes by 4-10x (ADR-073)

**Cons:**
- Quantization degrades recall (by design; controlled via tier thresholds)
- Per-pattern access tracking adds metadata overhead (~16 bytes per pattern for timestamp + count)
- Promotion from cold to hot adds ~1ms latency on first access
- Migration of 150K patterns requires careful one-time processing

### Option 2: Uniform 8-bit Quantization for All Patterns (Rejected)

Apply 8-bit quantization uniformly to all embeddings regardless of access frequency.

**Why rejected:** Achieves only 4x compression. Does not differentiate between hot patterns (where 8-bit is appropriate) and cold patterns (where 3-bit is sufficient). At 150K patterns, uniform 8-bit saves ~170 MB but tiered compression saves ~190 MB with only marginally more complexity. At 500K patterns, the difference grows to ~350 MB vs ~500 MB. Uniform quantization also misses the opportunity to give hot patterns the highest possible precision.

### Option 3: Prune Cold Patterns (Rejected)

Delete patterns that have not been accessed in 30+ days.

**Why rejected:** Irreversible data loss. Cold patterns may become relevant when a dormant area of the codebase is revisited, a new team member works on legacy code, or a similar defect pattern re-emerges. The 150K+ patterns in memory.db are described as "irreplaceable learning records" (CLAUDE.md). Pruning contradicts the data protection mandate.

### Option 4: Disk-Only Cold Storage (Rejected)

Move cold patterns out of memory to disk. Load them on demand when a query matches.

**Why rejected:** HNSW nearest-neighbor search requires all vectors to be present in the index for correct results. Cold patterns on disk are invisible to HNSW queries. Loading a cold pattern on demand defeats the purpose of the index -- the query that would have matched the cold pattern cannot find it because it is not in the index. This approach creates a silent recall gap for cold patterns.

Note: RVF's progressive HNSW (ADR-066) addresses this differently -- Layer A contains a subset of vectors for fast approximate search, but all vectors are eventually indexed in Layer C. Temporal compression works alongside progressive HNSW by reducing the memory of Layer C vectors, not removing them.

---

## Implementation

### Tiering Configuration

```typescript
// src/learning/compression/temporal-tier-config.ts
interface TemporalTierConfig {
  tiers: {
    hot: {
      maxAgeDays: number;         // Default: 7
      bitWidth: 8;                // Fixed: 8-bit for hot
      promotionThreshold: number; // Accesses to promote from warm (default: 3)
    };
    warm: {
      maxAgeDays: number;         // Default: 30
      bitWidth: 5 | 6 | 7;       // Default: 5
    };
    cold: {
      bitWidth: 3 | 4;           // Default: 3
    };
  };
  /** How often to run tiering pass (hours) */
  tieringIntervalHours: number;   // Default: 24
  /** Minimum patterns before enabling compression */
  minPatternsForCompression: number; // Default: 10000
}
```

### Compression Service

```typescript
// src/learning/compression/temporal-compression-service.ts
interface TemporalCompressionService {
  /** Run a tiering pass: re-classify all patterns by access recency */
  runTieringPass(): Promise<TieringResult>;

  /** Compress an embedding to the specified bit width */
  compress(
    embedding: Float32Array,
    bitWidth: 3 | 5 | 7 | 8
  ): Promise<CompressedEmbedding>;

  /** Decompress an embedding back to Float32 */
  decompress(compressed: CompressedEmbedding): Promise<Float32Array>;

  /** Promote a pattern from cold/warm to hot (triggered on access) */
  promotePattern(patternId: string): Promise<void>;

  /** Get compression statistics */
  getStats(): CompressionStats;
}

interface CompressedEmbedding {
  data: Uint8Array;           // Packed quantized values
  bitWidth: number;           // 3, 5, 7, or 8
  scaleFactors: Float32Array; // Per-group scale factors for dequantization
  groupSize: number;          // Values per quantization group (default: 8)
  originalDimensions: number; // 384
}

interface TieringResult {
  hotCount: number;
  warmCount: number;
  coldCount: number;
  promotions: number;       // Patterns moved to higher tier
  demotions: number;        // Patterns moved to lower tier
  memoryBefore: number;     // Bytes
  memoryAfter: number;      // Bytes
  compressionRatio: number; // Overall ratio
  durationMs: number;
}

interface CompressionStats {
  totalPatterns: number;
  tierDistribution: {
    hot: { count: number; memoryBytes: number; avgBitWidth: number };
    warm: { count: number; memoryBytes: number; avgBitWidth: number };
    cold: { count: number; memoryBytes: number; avgBitWidth: number };
  };
  overallCompressionRatio: number;
  totalMemorySaved: number;        // Bytes saved vs uncompressed
  lastTieringPass: number;         // Unix timestamp
  avgPromotionLatencyMs: number;   // Time to decompress + re-index on access
}
```

### Integration with HNSW (ADR-081)

The compressed embeddings integrate with the native HNSW provider:

```typescript
// Extension to HnswIndex for compressed vectors
interface CompressedHnswIndex extends HnswIndex {
  /** Insert a compressed vector */
  insertCompressed(id: string, compressed: CompressedEmbedding): Promise<void>;

  /** Search with automatic decompression */
  searchWithDecompression(
    query: Float32Array,
    k: number
  ): Promise<SearchResult[]>;

  /** Get current memory usage breakdown by tier */
  getMemoryBreakdown(): Promise<TierMemoryBreakdown>;
}
```

### Migration Safety Requirements

The migration of 150K existing patterns to the tiered compression system must follow strict safety rules (per CLAUDE.md data protection mandate):

```typescript
// src/learning/compression/compression-migration.ts
interface CompressionMigration {
  /** Phase 1: Analyze access patterns without modifying data */
  analyzeAccessPatterns(): Promise<AccessPatternAnalysis>;

  /** Phase 2: Create backup before migration */
  createBackup(): Promise<BackupHandle>;

  /** Phase 3: Compress patterns in batches with verification */
  migrateBatch(
    batchSize: number,
    tier: 'warm' | 'cold'
  ): Promise<BatchMigrationResult>;

  /** Phase 4: Verify migration integrity */
  verifyMigration(backup: BackupHandle): Promise<VerificationResult>;

  /** Rollback: restore from backup if verification fails */
  rollback(backup: BackupHandle): Promise<void>;
}

interface BatchMigrationResult {
  patternsProcessed: number;
  patternsCompressed: number;
  patternsFailed: number;      // Compression errors (should be 0)
  recallBefore: number;        // Measured on sample queries
  recallAfter: number;
  memoryBefore: number;
  memoryAfter: number;
}
```

**Migration protocol:**

1. **Backup**: `cp memory.db memory.db.bak-$(date +%s)` (per CLAUDE.md)
2. **Access analysis**: Read access timestamps from pattern metadata. Classify into tiers.
3. **Cold patterns first**: Compress the ~75K cold patterns in batches of 1,000. After each batch, run 100 sample queries and verify recall >= 90%.
4. **Warm patterns**: Compress the ~45K warm patterns. Verify recall >= 95%.
5. **Hot patterns remain uncompressed** during initial migration. Enable 8-bit hot compression only after the tiering system is validated.
6. **Integrity check**: `sqlite3 memory.db "PRAGMA integrity_check; SELECT COUNT(*) FROM qe_patterns;"` (per CLAUDE.md)
7. **Rollback**: If any verification step fails, restore from backup and abort migration.

### Access Tracking

```typescript
// src/learning/compression/access-tracker.ts
interface AccessTracker {
  /** Record an access to a pattern */
  recordAccess(patternId: string): void;

  /** Get access metadata for a pattern */
  getAccessInfo(patternId: string): AccessInfo;

  /** Classify a pattern into its current tier */
  classifyTier(patternId: string): 'hot' | 'warm' | 'cold';
}

interface AccessInfo {
  lastAccessTimestamp: number;    // Unix epoch ms
  accessCount30Days: number;     // Accesses in last 30 days
  currentTier: 'hot' | 'warm' | 'cold';
  currentBitWidth: number;
}
```

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-081 | Native HNSW Integration via NAPI | Compressed vectors stored in native HNSW index |
| Depends On | ADR-066 | RVF-backed Pattern Store with Progressive HNSW | Progressive HNSW layers work with compressed vectors |
| Relates To | ADR-065 | RVF Integration Strategy -- Hybrid Architecture | Compression reduces RVF file sizes |
| Relates To | ADR-073 | Portable Intelligence Containers | Compressed embeddings reduce container transfer sizes |
| Relates To | ADR-069 | RVCOW Dream Cycle Branching | Dream cycles operate on compressed data |
| Relates To | ADR-038 | Memory Unification | Compression applies to unified memory's embedding store |
| Part Of | MADR-001 | V3 Implementation Initiative | RVF integration -- Phase 1 Foundation |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| RES-001 | RuVector Advanced Systems Research | Research Report | `docs/research/ruvector-advanced-systems.md` |
| RES-002 | Six Thinking Hats Analysis | Analysis | `docs/research/six-thinking-hats-aqe-ruvector-analysis.md` |
| RES-003 | RuVector Core & Infrastructure Research | Research Report | `docs/research/ruvector-core-infrastructure.md` |
| EXT-001 | ruvector-temporal-tensor | Rust Crate | Access-pattern-tiered tensor compression |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| Architecture Team | 2026-03-15 | Proposed | 2026-09-15 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-03-15 | Initial creation from Six Thinking Hats analysis Phase 1 recommendation. Access-pattern-tiered compression for the 150K+ pattern embedding database using ruvector-temporal-tensor. |

---

## Definition of Done Checklist

Before requesting approval, verify:

### Core (ECADR)
- [ ] **E - Evidence**: Compression achieves >= 4x memory reduction on 150K patterns with <= 3% weighted recall degradation
- [ ] **C - Criteria**: 4 options compared (tiered, uniform 8-bit, pruning, disk offload)
- [ ] **A - Agreement**: Data protection review confirms migration safety
- [ ] **D - Documentation**: WH(Y) statement complete, ADR published
- [ ] **R - Review**: Review cadence set, owner assigned

### Extended
- [ ] **Dp - Dependencies**: ADR-081, ADR-066, ADR-065, ADR-073, ADR-069, ADR-038 relationships documented
- [ ] **Rf - References**: Research reports linked, compression benchmarks cited
- [ ] **M - Master**: Linked to MADR-001 V3 Implementation Initiative
