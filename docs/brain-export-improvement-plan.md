# Brain Export/Import v3.0 Improvement Plan

> **Note (March 2026):** This plan references "26 tables" throughout. The actual
> `TABLE_CONFIGS` in `brain-shared.ts` contains **25 entries**. The discrepancy is
> because entry #26 in the plan (qe_pattern_embeddings JSONL gap fix) refers to a
> table already counted as entry #6. All 25 unique tables are fully implemented.

## Executive Summary

The `aqe brain export/import` system currently serializes 5 of 39 database tables and
suffers from code duplication (~250 lines), an embedding restore gap (vectors exported
but never reimported), and underutilized RuVector capabilities. This plan delivers a
phased upgrade from manifest version 1.0/2.0 to 3.0 with full round-trip fidelity.

**Measurable outcomes after all phases:**

| Metric | Before | After |
|--------|--------|-------|
| Tables exported | 5 | 26 |
| Embedding round-trip | 0% (always 0 restored) | 100% |
| Duplicated lines | ~250 | 0 |
| Manifest version | 1.0 (JSONL) / 2.0 (RVF) | 3.0 (both) |
| RVF features used | 2 (ingest, embedKernel) | 7+ |

---

## Architecture Overview

```
src/integrations/ruvector/
  brain-shared.ts          <-- NEW: shared types, merge engine, DDL, utilities
  brain-exporter.ts        <-- MODIFIED: delegates to brain-shared, adds new tables
  brain-rvf-exporter.ts    <-- MODIFIED: delegates to brain-shared, embedding restore
  rvf-native-adapter.ts    <-- MODIFIED: expose new native capabilities

src/cli/
  brain-commands.ts        <-- MODIFIED: pass new options, manifest v3 types
  handlers/brain-handler.ts <-- MODIFIED: display new table stats
```

---

## Phase 1: Extract Shared Code (De-duplication)

**Goal:** Eliminate ~250 lines of identical code between `brain-exporter.ts` and
`brain-rvf-exporter.ts` by extracting a shared module.

### Milestone 1.1: Create `brain-shared.ts`

**Affected files:**
- NEW: `src/integrations/ruvector/brain-shared.ts` (~200 lines)
- MODIFIED: `src/integrations/ruvector/brain-exporter.ts`
- MODIFIED: `src/integrations/ruvector/brain-rvf-exporter.ts`
- MODIFIED: `tests/unit/brain-exporter.test.ts`
- NEW: `tests/unit/brain-shared.test.ts`

**Extract the following from both files into `brain-shared.ts`:**

1. **Type interfaces** (move to shared, re-export from both):
   - `PatternRow`
   - `QValueRow`
   - `DreamInsightRow`
   - `WitnessRow`
   - `MergeResult`

2. **Merge functions** (identical logic in both files):
   - `mergePattern(db, pattern, strategy) -> MergeResult`
   - `mergeQValue(db, qv, strategy) -> MergeResult`
   - `mergeDreamInsight(db, insight, strategy) -> MergeResult`
   - `mergeWitnessEntry(db, entry, strategy) -> MergeResult`

3. **SQL insert/update helpers** (identical in both):
   - `insertPattern` / `updatePattern`
   - `insertQValue` / `updateQValue`
   - `insertDreamInsight` / `updateDreamInsight`
   - `insertWitnessEntry`

4. **DDL function** (nearly identical):
   - `ensureTargetTables(db)` -- merge both versions, keeping the superset of tables

5. **Utility functions** (identical):
   - `tableExists(db, name) -> boolean`
   - `queryAll(db, table, where?, params?) -> unknown[]`
   - `domainFilter(domains?) -> [clause, params]`
   - `sha256(data) -> string`

**Approach:**
- Use a data-driven merge engine: define a `TableExportConfig` interface that
  declares how each table should be queried, deduplicated, and merged.
- Each table config specifies: `tableName`, `idColumn`, `timestampColumn`,
  `confidenceColumn`, `insertFn`, `updateFn`, `ddlSql`.

```typescript
// brain-shared.ts - Core type for the data-driven merge engine
export interface TableExportConfig {
  /** SQLite table name */
  tableName: string;
  /** Column used as primary key for dedup (e.g. 'id') */
  idColumn: string;
  /** Dedup strategy: 'id' checks by PK, 'composite' uses custom check */
  dedupStrategy: 'id' | 'composite';
  /** For composite dedup: columns to check */
  compositeColumns?: string[];
  /** Column used for latest-wins comparison (e.g. 'updated_at', 'created_at') */
  timestampColumn?: string;
  /** Column used for highest-confidence comparison */
  confidenceColumn?: string;
  /** For Q-values where confidence proxy is a different field */
  confidenceProxy?: string;
  /** Whether this is an append-only log (like witness_chain) */
  appendOnly?: boolean;
  /** Whether this table has domain filtering (uses qe_domain or domain) */
  domainFilterColumn?: string;
  /** Whether this table contains BLOB embedding columns */
  embeddingColumns?: string[];
  /** JSONL filename for directory-format exports */
  jsonlFilename: string;
  /** CREATE TABLE IF NOT EXISTS DDL */
  ddl: string;
}
```

### Success Criteria for Phase 1

- [ ] Zero duplicated merge/SQL code between the two exporter files
- [ ] All 12 existing unit tests in `brain-exporter.test.ts` pass unchanged
- [ ] New `brain-shared.test.ts` has 15+ tests covering merge logic in isolation
- [ ] Both `brain-exporter.ts` and `brain-rvf-exporter.ts` import from `brain-shared.ts`
- [ ] Each file stays under 500 lines
- [ ] `npm run build` succeeds
- [ ] `npm test -- --run` passes

**Estimated complexity:** Medium (refactor-only, no new functionality)
**Estimated effort:** 4-6 hours

---

## Phase 2: Add Missing Tables to Export

**Goal:** Export 21 additional tables (26 total) that contain meaningful learning data.

### Table Priority Classification

#### Tier 1 -- HIGH (significant learning data, export first)

| # | Table | Rows | Embeddings | Why |
|---|-------|------|-----------|-----|
| 1 | `captured_experiences` | 3,730 | 132 (384d) | Past task outcomes for experience replay |
| 2 | `sona_patterns` | 1,025 | 739 (384d state_embedding) | SONA self-learning neural patterns |
| 3 | `qe_trajectories` | 335 | -- | Task execution trajectories |
| 4 | `trajectory_steps` | 2,030 | -- | Individual steps within trajectories |
| 5 | `concept_nodes` | 4,731 | BLOB col exists, 0 populated | Dream knowledge graph vertices |
| 6 | `concept_edges` | 68,517 | -- | Dream knowledge graph edges |
| 7 | `dream_cycles` | 694 | -- | Dream cycle metadata (FK parent for insights) |
| 8 | `goap_actions` | 2,325 | -- | Learned GOAP actions with success rates |
| 9 | `routing_outcomes` | 497 | -- | Model routing decision history |

#### Tier 2 -- MEDIUM (smaller but valuable for completeness)

| # | Table | Rows | Why |
|---|-------|------|-----|
| 10 | `goap_goals` | 53 | Planning goals |
| 11 | `goap_plans` | 101 | Computed plans with reuse tracking |
| 12 | `goap_plan_signatures` | 294 | Plan similarity matching |
| 13 | `qe_pattern_usage` | 238 | Pattern usage feedback log |
| 14 | `pattern_evolution_events` | 20 | Pattern change history |
| 15 | `pattern_relationships` | 6 | Cross-pattern links |
| 16 | `pattern_versions` | 8 | Historical pattern snapshots (384d) |
| 17 | `vectors` | 410 | General-purpose vector store |
| 18 | `experience_applications` | 3 | Experience reuse tracking (FK → captured_experiences) |
| 19 | `execution_results` | 530 | GOAP plan execution outcomes (success/fail, duration) |
| 20 | `executed_steps` | 705 | Per-step execution logs with agent_output and world_state |

> **Note:** `qe_pattern_embeddings` (40 rows) is already in the "Currently exported (5)"
> set. Its Tier 2 enhancement is adding JSONL export with Base64 encoding — it is NOT
> counted as a new table in the 26-table total.

#### Tier 3 -- LOW (operational/transient, skip for now)

| Table | Rows | Reason to skip |
|-------|------|---------------|
| `kv_store` | 4,923 | Mostly operational (4,371 queen metrics). See note below. |
| `embeddings` | 0 | Cache table, regenerated on demand |
| `goap_execution_steps` | 0 | Empty, schema overlaps with executed_steps |
| `mincut_*` (6 tables) | 701 | Graph health snapshots, not portable learning |
| `hypergraph_nodes` / `hypergraph_edges` | 0 | Neural backbone internals, regenerated |
| `test_outcomes` | 0 | Test analytics, too environment-specific |
| `coverage_sessions` | 0 | Coverage analytics, environment-specific |
| `schema_version` | 1 | Internal migration tracking |

> **`kv_store` partial export consideration:** While mostly operational metrics,
> the following namespaces contain actual learning state that future phases could
> selectively export: `qe-experiences` (291), `sona-adaptation` (100),
> `rl-algorithms` (8), `rl-rewards` (4), `rl-applications` (8), `reasoning-bank` (3).
> Total: ~414 learning-relevant rows. A namespace-filtered kv_store export could
> be added in a future phase using the `domainFilterColumn` pattern with a
> namespace prefix filter.

### Milestone 2.1: Add Tier 1 Tables (9 tables)

**Affected files:**
- `src/integrations/ruvector/brain-shared.ts` (add 9 TableExportConfig entries + DDL)
  **Note:** `dream_cycles` must be imported BEFORE `dream_insights` (FK parent).
- `src/integrations/ruvector/brain-exporter.ts` (iterate over new table configs)
- `src/integrations/ruvector/brain-rvf-exporter.ts` (include new tables in kernel JSON)
- `src/cli/brain-commands.ts` (update manifest types for new stats)
- `src/cli/handlers/brain-handler.ts` (display new stats)
- `tests/unit/brain-exporter.test.ts` (add 9 table export/import tests)

**Implementation approach:**

For each new table, add a `TableExportConfig` entry in `brain-shared.ts` with:
- Full DDL from `unified-memory-schemas.ts` (authoritative source)
- Appropriate dedup strategy
- Domain filter column where applicable

Update the JSONL exporter to iterate over all registered table configs:

```typescript
// brain-exporter.ts
import { TABLE_CONFIGS, queryAll, domainFilter, writeJsonl } from './brain-shared.js';

for (const config of TABLE_CONFIGS) {
  const [where, params] = config.domainFilterColumn
    ? domainFilter(options.domains, config.domainFilterColumn)
    : [undefined, []];
  const rows = queryAll(db, config.tableName, where, params);
  writeJsonl(join(outDir, config.jsonlFilename), rows);
}
```

Update the RVF exporter to include all new tables in the kernel JSON payload.

**Key design decisions:**

1. `concept_edges` has 68,517 rows -- use streaming JSONL write (line-by-line) to
   avoid buffering the entire dataset in memory.

2. `captured_experiences` and `sona_patterns` contain BLOB embedding columns. For
   JSONL format, Base64-encode BLOBs. For RVF format, ingest embeddings into HNSW
   in addition to storing them in the kernel JSON.

3. `trajectory_steps` has a FK to `qe_trajectories`. Export `qe_trajectories` first,
   then `trajectory_steps`. On import, insert in the same order.

4. Domain filtering: `captured_experiences` uses `domain`, `sona_patterns` uses
   `domain`, `goap_actions` uses `qe_domain`, `routing_outcomes` has no domain column.

### Milestone 2.2: Add Tier 2 Tables (11 tables)

Same approach as 2.1 for the remaining 11 tables. These are smaller and simpler.

**Special handling:**
- `qe_pattern_usage` uses INTEGER AUTOINCREMENT PK -- dedup by composite
  `(pattern_id, created_at)` like `witness_chain`.
- `pattern_versions` contains embedding BLOBs -- Base64 in JSONL, ingest in RVF.
- `qe_pattern_embeddings` already exported to RVF HNSW but not to JSONL -- add JSONL
  export with Base64 encoding.
- `experience_applications` has FK to `captured_experiences` -- import after Tier 1.
- `executed_steps` has FK to `goap_plans` (via execution_id → execution_results.id) --
  import `execution_results` first, then `executed_steps`.

**FK-aware import order for all 26 tables:**
```
1.  qe_patterns              (no FK deps)
2.  rl_q_values              (no FK deps)
3.  dream_cycles             (no FK deps)
4.  dream_insights           (FK → dream_cycles)
5.  witness_chain            (no FK deps)
6.  qe_pattern_embeddings    (FK → qe_patterns)
7.  captured_experiences     (no FK deps)
8.  sona_patterns            (no FK deps)
9.  qe_trajectories          (no FK deps)
10. trajectory_steps         (FK → qe_trajectories)
11. concept_nodes            (no FK deps)
12. concept_edges            (FK → concept_nodes)
13. goap_actions             (no FK deps)
14. routing_outcomes         (no FK deps)
15. goap_goals               (no FK deps)
16. goap_plans               (FK → goap_goals)
17. goap_plan_signatures     (FK → goap_plans)
18. qe_pattern_usage         (FK → qe_patterns)
19. pattern_evolution_events (FK → qe_patterns)
20. pattern_relationships    (FK → qe_patterns)
21. pattern_versions         (FK → qe_patterns)
22. vectors                  (no FK deps)
23. experience_applications  (FK → captured_experiences)
24. execution_results        (FK → goap_plans)
25. executed_steps           (FK → execution_results)
26. (qe_pattern_embeddings JSONL gap fix — already counted above)
```

### Milestone 2.3: Update Manifest and Checksum

Update the manifest format for v3.0:

```typescript
export interface BrainExportManifest_v3 {
  readonly version: '3.0';
  readonly format: 'jsonl' | 'rvf';
  readonly exportedAt: string;
  readonly sourceDb: string;
  readonly stats: {
    // Original 5
    readonly patternCount: number;
    readonly qValueCount: number;
    readonly dreamInsightCount: number;
    readonly witnessChainLength: number;
    readonly embeddingCount: number;
    // Tier 1 additions
    readonly capturedExperienceCount: number;
    readonly sonaPatternCount: number;
    readonly trajectoryCount: number;
    readonly trajectoryStepCount: number;
    readonly conceptNodeCount: number;
    readonly conceptEdgeCount: number;
    readonly dreamCycleCount: number;
    readonly goapActionCount: number;
    readonly routingOutcomeCount: number;
    // Tier 2 additions
    readonly goapGoalCount: number;
    readonly goapPlanCount: number;
    readonly goapPlanSignatureCount: number;
    readonly patternUsageCount: number;
    readonly patternEmbeddingCount: number;
    readonly patternEvolutionEventCount: number;
    readonly patternRelationshipCount: number;
    readonly patternVersionCount: number;
    readonly vectorCount: number;
    readonly experienceApplicationCount: number;
    readonly executionResultCount: number;
    readonly executedStepCount: number;
    // Summary
    readonly totalRecords: number;
    readonly totalEmbeddings: number;
  };
  readonly domains: readonly string[];
  readonly checksum: string;
  readonly tableChecksums?: Record<string, string>;  // Per-table integrity
}
```

Update the checksum computation to include all new JSONL files in deterministic order.

Maintain **backward compatibility**: when importing a v1.0 or v2.0 manifest, handle
missing tables gracefully (skip those that don't exist in the export).

### Success Criteria for Phase 2

- [ ] All 26 tables successfully export to both JSONL and RVF formats
- [ ] Round-trip test: export from populated DB, import into empty DB, verify row counts
      match for all 26 tables
- [ ] BLOB columns (embeddings) survive round-trip with byte-level fidelity
- [ ] Domain filtering works for tables with `qe_domain` or `domain` columns
- [ ] Tables without domain columns export fully regardless of domain filter
- [ ] Import order respects FK constraints (parents before children)
- [ ] Backward compatibility: can still import v1.0 and v2.0 exports
- [ ] Memory usage stays bounded for large tables (concept_edges streaming)
- [ ] 30+ new tests covering new table export/import
- [ ] `npm run build` and `npm test -- --run` pass

**Estimated complexity:** High (many tables, BLOB handling, FK ordering)
**Estimated effort:** 8-12 hours

---

## Phase 3: Fix Embedding Restore Gap

**Goal:** Achieve 100% round-trip fidelity for all embedding vectors across all tables.

### Problem Analysis

Currently during RVF export:
1. `qe_pattern_embeddings` vectors are ingested into HNSW via `rvf.ingest()`
2. Full brain data (including patterns, Q-values, etc.) is stored as kernel JSON
3. On import, the kernel JSON is extracted and deserialized
4. But `rvf.ingest()` vectors are NOT extracted back -- `embeddingsRestored` is always 0

The fundamental issue: the RVF HNSW index is write-only during import. The native
binding supports `query()` (search) but there is no `extractAll()` bulk read.

### Solution Strategy

**Approach A (Recommended): Store embeddings in the kernel JSON alongside row data**

Instead of relying on HNSW extraction, include embedding BLOBs as Base64 strings
within the kernel JSON for each table that has embeddings. The HNSW ingest is kept
for semantic search within the RVF file, but import reads from the kernel.

For JSONL format, embeddings are already Base64-encoded per Phase 2.

```typescript
// During RVF export, for each table with embeddings:
const experiences = queryAll(db, 'captured_experiences');
for (const exp of experiences) {
  if (exp.embedding) {
    exp._embedding_b64 = Buffer.from(exp.embedding).toString('base64');
  }
}
// Store in kernel JSON -- embeddings travel with the data
brainData.capturedExperiences = experiences;

// ALSO ingest into HNSW for semantic search capability within the RVF file:
const embeddingEntries = experiences
  .filter(e => e.embedding && e.embedding_dimension === 384)
  .map(e => ({
    id: `exp:${e.id}`,
    vector: new Float32Array(e.embedding.buffer, e.embedding.byteOffset, 384)
  }));
rvf.ingest(embeddingEntries);
```

```typescript
// During RVF import:
for (const exp of brainData.capturedExperiences) {
  if (exp._embedding_b64) {
    exp.embedding = Buffer.from(exp._embedding_b64, 'base64');
    delete exp._embedding_b64;
  }
  mergeExperience(db, exp, options.mergeStrategy);
}
```

### Milestone 3.1: BLOB Serialization Utilities

**New in `brain-shared.ts`:**

```typescript
/** Serialize a row for export, converting BLOB columns to Base64 */
export function serializeRowForExport(
  row: Record<string, unknown>,
  blobColumns: string[]
): Record<string, unknown> {
  const result = { ...row };
  for (const col of blobColumns) {
    if (result[col] instanceof Buffer) {
      result[`_${col}_b64`] = (result[col] as Buffer).toString('base64');
      delete result[col];
    }
  }
  return result;
}

/** Deserialize a row on import, converting Base64 back to Buffer */
export function deserializeRowForImport(
  row: Record<string, unknown>,
  blobColumns: string[]
): Record<string, unknown> {
  const result = { ...row };
  for (const col of blobColumns) {
    const b64Key = `_${col}_b64`;
    if (typeof result[b64Key] === 'string') {
      result[col] = Buffer.from(result[b64Key] as string, 'base64');
      delete result[b64Key];
    }
  }
  return result;
}
```

### Milestone 3.2: Embedding Tables Round-Trip

**Tables with embedding BLOBs to handle:**

| Table | BLOB Columns | Dimension | Count |
|-------|-------------|-----------|-------|
| `qe_pattern_embeddings` | `embedding` | 384 | 40 |
| `captured_experiences` | `embedding` | 384 | 132 |
| `sona_patterns` | `state_embedding`, `action_embedding` | 384 | 739 |
| `pattern_versions` | `embedding` | variable | 8 |
| `concept_nodes` | `embedding` | variable | 0 (column exists but unpopulated) |
| `vectors` | `embedding` | variable | 410 |

For each table:
1. On export: serialize BLOBs to Base64 in both JSONL and kernel JSON
2. On import: deserialize Base64 back to Buffer, INSERT into SQLite
3. For RVF: additionally ingest 384d vectors into HNSW with namespaced IDs
   (e.g., `exp:{id}`, `sona:{id}`, `pattern:{id}`)

### Milestone 3.3: Verify Fidelity

Write a dedicated round-trip fidelity test:

```typescript
it('should preserve embedding BLOBs through full round-trip', () => {
  // Create source DB with known embedding values
  const embedding = Buffer.alloc(384 * 4);
  const floats = new Float32Array(embedding.buffer);
  for (let i = 0; i < 384; i++) floats[i] = Math.random();

  sourceDb.prepare(`
    INSERT INTO qe_pattern_embeddings (pattern_id, embedding, dimension)
    VALUES (?, ?, ?)
  `).run('p1', embedding, 384);

  // Export
  const outDir = makeTempDir();
  exportBrain(sourceDb, { outputPath: outDir });

  // Import into empty DB
  const targetDb = createTestDb();
  const result = importBrain(targetDb, outDir, { mergeStrategy: 'skip-conflicts' });

  // Verify embedding bytes match exactly
  const row = targetDb.prepare(
    'SELECT embedding FROM qe_pattern_embeddings WHERE pattern_id = ?'
  ).get('p1') as { embedding: Buffer };

  expect(Buffer.compare(row.embedding, embedding)).toBe(0);
});
```

### Success Criteria for Phase 3

- [ ] `embeddingsRestored` count matches `embeddingCount` for RVF imports
- [ ] BLOB round-trip fidelity: `Buffer.compare(original, imported) === 0` for all
      embedding columns across all 6 tables
- [ ] JSONL format correctly Base64-encodes/decodes BLOBs
- [ ] RVF format stores BLOBs in kernel AND ingests 384d vectors into HNSW
- [ ] Backward compatibility: importing v1.0/v2.0 exports (which lack embeddings)
      still works with `embeddingsRestored: 0`
- [ ] 10+ new tests for BLOB serialization and round-trip fidelity
- [ ] `npm run build` and `npm test -- --run` pass

**Estimated complexity:** Medium-High (BLOB handling, dual storage in RVF)
**Estimated effort:** 6-8 hours

---

## Phase 4: Leverage RuVector Advanced Features

**Goal:** Use RVF capabilities for integrity, lineage, signing, and compaction.

### Milestone 4.1: Witness Chain Verification

**Current state:** `rvf-native-adapter.ts` exposes `status()` which checks for
witness segments, but does not call the native `verify_witness()` function.

**Change:** Add `verifyWitness()` to the adapter and call it during import to
validate RVF file integrity before deserializing the kernel.

```typescript
// rvf-native-adapter.ts additions
interface RvfNativeAdapter {
  // ... existing methods ...

  /** Verify the RVF witness chain (cryptographic integrity) */
  verifyWitness(): { valid: boolean; entries: number; error?: string };

  /** Get HNSW index statistics */
  indexStats(): { dimension: number; vectorCount: number; levels: number; entryPoint: number };
}
```

```typescript
// brain-rvf-exporter.ts import path
const witnessResult = rvf.verifyWitness();
if (!witnessResult.valid) {
  throw new Error(
    `RVF witness chain verification failed: ${witnessResult.error}. ` +
    'The file may have been tampered with or corrupted.'
  );
}
```

### Milestone 4.2: Ed25519 Signed Exports

**Use case:** When sharing brain exports across teams, Ed25519 signing provides
non-repudiation and tamper detection beyond SHA-256 checksums.

```typescript
// brain-rvf-exporter.ts
export interface RvfBrainExportOptions {
  // ... existing ...
  readonly signing?: {
    /** Ed25519 private key (32 bytes) for signing the export */
    privateKey: Buffer;
    /** Signer identifier (e.g., email or team name) */
    signer: string;
  };
}

// During export:
if (options.signing) {
  const rvf = createRvfStore(outPath, dimension, {
    signing: {
      key: options.signing.privateKey,
      signer: options.signing.signer,
    },
  });
}
```

This is **opt-in** -- unsigned exports continue to work as before.

### Milestone 4.3: Brain Lineage Tracking

**Use case:** Track the ancestry of brain exports (which brain was this derived from?).

```typescript
// brain-rvf-exporter.ts - kernel data additions
const brainData = {
  version: '3.0',
  format: 'rvf',
  // ... existing fields ...
  lineage: {
    fileId: rvf.fileId(),        // Unique ID for this RVF file
    parentId: rvf.parentId(),    // null for fresh exports, set for derived
    lineageDepth: rvf.lineageDepth(), // 0 for root, N for Nth derivative
    derivedAt: options.deriveFrom ? new Date().toISOString() : undefined,
  },
};
```

**New CLI command:** `aqe brain derive`

```bash
# Create an incremental brain export derived from an existing one
aqe brain derive -i base-brain.rvf -o child-brain.rvf --db .agentic-qe/memory.db
```

Uses `rvf.derive(childPath)` for COW (copy-on-write) branching, then ingests only
the delta vectors and updates the kernel with new/changed data.

### Milestone 4.4: RVF Metadata Per Vector

**Use case:** Store structured metadata alongside each vector for filtered search.

Currently vectors are ingested as `{ id, vector }`. With `RvfMetadataEntry`, each
vector can carry metadata:

```typescript
const entries = embeddings.map(row => ({
  id: row.pattern_id,
  vector: vec,
  metadata: {
    table: 'qe_pattern_embeddings',
    domain: patternDomainMap.get(row.pattern_id) ?? 'unknown',
    confidence: patternConfidenceMap.get(row.pattern_id) ?? 0.5,
  },
}));

rvf.ingest(entries);

// Later: filtered search within the brain
const results = rvf.search(queryVec, 10, {
  filter: { table: 'sona_patterns', domain: 'test-generation' },
});
```

This enables `aqe brain search` -- semantic search within a brain export file.

### Milestone 4.5: Compact After Conflict Resolution

During import with `latest-wins` or `highest-confidence`, some vectors in the HNSW
index become stale (the row they reference was overwritten). Call `rvf.compact()`
after import to reclaim space:

```typescript
// At end of importBrainFromRvf, if we had any conflicts:
if (conflicts > 0 && !options.dryRun) {
  rvf.compact();
}
```

### Success Criteria for Phase 4

- [ ] `verifyWitness()` called on import, throws on invalid files
- [ ] Signed exports can be verified (opt-in, non-breaking)
- [ ] `aqe brain info` displays lineage information when present
- [ ] Metadata stored per vector enables filtered search
- [ ] `compact()` called after conflict resolution
- [ ] All existing tests pass, 15+ new tests for advanced features
- [ ] Feature-gated behind `isRvfAvailable()` -- JSONL format unaffected

**Estimated complexity:** Medium (wrapping existing native capabilities)
**Estimated effort:** 6-8 hours

---

## Phase 5: Manifest v3.0, CLI Polish, and Documentation

**Goal:** Finalize the v3.0 manifest format, update CLI output, and ensure
backward compatibility.

### Milestone 5.1: Manifest Version Bump

- JSONL format: `version: '3.0'` (was `'1.0'`)
- RVF format: `version: '3.0'` (was `'2.0'`)
- Both formats share the same `BrainExportManifest_v3` type

**Backward-compatible import logic:**

```typescript
function importByVersion(manifest: unknown): void {
  const version = (manifest as { version?: string }).version ?? '1.0';

  switch (version) {
    case '1.0':
      // Original 5-table JSONL format
      importV1(manifest);
      break;
    case '2.0':
      // Original 5-table RVF format (kernel JSON)
      importV2(manifest);
      break;
    case '3.0':
      // Full 26-table format with embeddings
      importV3(manifest);
      break;
    default:
      throw new Error(`Unsupported brain export version: ${version}`);
  }
}
```

### Milestone 5.2: CLI Output Improvements

Update `brain-handler.ts` to display comprehensive stats:

```
  Brain Export Info

  Version:       3.0
  Format:        rvf
  Exported:      2026-03-08T14:22:00.000Z
  Source DB:     memory.db

  Learning Data:
    Patterns:      15,634
    Experiences:    3,730
    SONA Patterns:  1,025
    Trajectories:     335 (2,030 steps)
    Dream Insights: 3,940 (694 cycles)
    Concept Graph:  4,731 nodes, 68,517 edges
    GOAP:           2,325 actions, 53 goals, 101 plans
    Q-Values:            8
    Routing:           488 outcomes

  Embeddings:
    Total Vectors:    1,329
    Dimensions:       384

  Integrity:
    Checksum:      a1b2c3d4...
    Witness Chain: 12,857 entries (verified)
    Lineage:       root (no parent)
    Signed:        no

  RVF File:
    Size:          12.4 MB
    Segments:      47
    HNSW Vectors:  1,329

  Output:         /path/to/brain.rvf
```

### Milestone 5.3: `aqe brain diff` Command (Optional)

Compare two brain exports to show what changed:

```bash
aqe brain diff -a brain-v1.rvf -b brain-v2.rvf

  Brain Diff: brain-v1.rvf vs brain-v2.rvf

  Patterns:    +42 new, ~18 modified, -3 removed
  Experiences: +120 new
  SONA:        +35 new, ~12 modified
  ...
```

### Milestone 5.4: Backward Compatibility Test Suite

Create a dedicated test file `tests/unit/brain-backward-compat.test.ts` that:
1. Creates v1.0 format exports (JSONL, 5 tables)
2. Creates v2.0 format exports (simulated RVF kernel with 5 tables)
3. Imports both into a fresh database
4. Verifies all data restored correctly
5. Verifies no errors on missing tables

### Success Criteria for Phase 5

- [ ] Manifest version is `'3.0'` for both JSONL and RVF
- [ ] v1.0 and v2.0 imports continue to work
- [ ] CLI displays all 26 table stats grouped logically
- [ ] `aqe brain info` works for v1.0, v2.0, and v3.0 exports
- [ ] Backward compatibility test suite with 10+ tests
- [ ] `npm run build` and `npm test -- --run` pass
- [ ] All files under 500 lines

**Estimated complexity:** Medium
**Estimated effort:** 4-6 hours

---

## Phase 6: Full ADR-070 Witness Chain Audit Compliance

**Goal:** Complete the ADR-070 vision — upgrade the witness chain from SHA-256 application
logging to SHAKE-256 + Ed25519 cryptographic audit trail with per-mutation provenance,
key management, and retroactive backfill.

### Current State

A `WitnessChain` class exists at `src/audit/witness-chain.ts` (384 lines) with:
- SHA-256 hash-chained append-only log in SQLite `witness_chain` table
- 12,857 entries recording `PATTERN_CREATE`, `PATTERN_UPDATE`, `PATTERN_PROMOTE`,
  `PATTERN_QUARANTINE`, `DREAM_MERGE`, `DREAM_DISCARD`, `QUALITY_GATE_PASS/FAIL`,
  `ROUTING_DECISION`
- `verify()` method that walks the full chain checking hash linkage
- `crossVerifyWithRvf()` for dual-chain comparison
- Integration into `QEReasoningBank` (create, update, promote) and
  `QualityAssessmentCoordinator` (gate pass/fail)

**Gaps vs ADR-070:**
- Uses SHA-256; ADR-070 specifies SHAKE-256 (NIST SP 800-185)
- No Ed25519 signing on entries (no `signature` field)
- No key management (generation, rotation, revocation)
- Missing integration points: Dream Engine merge/discard, agent branch merges,
  Hebbian penalty events (ADR-061), routing decisions
- No retroactive backfill for patterns created before witness chain existed
- No `getPatternLineage()` or `getActorHistory()` query methods
- No archival/compaction for old entries

### Milestone 6.1: Upgrade Hash Algorithm (SHA-256 → SHAKE-256)

**Affected files:**
- `src/audit/witness-chain.ts`
- `tests/unit/witness-chain.test.ts`

Replace `createHash('sha256')` with SHAKE-256 from `rvf-crypto` (via `@ruvector/rvf-node`)
or a pure-JS fallback. SHAKE-256 produces variable-length output; use 256-bit (32 bytes)
for backward compatibility with existing 64-char hex hashes.

```typescript
import { createHash } from 'crypto';

/**
 * Compute SHAKE-256 (256-bit output) hex digest.
 * Falls back to SHA-256 if SHAKE-256 is unavailable (Node <18).
 */
function shake256(data: string): string {
  try {
    // Node.js 18+ supports SHAKE via 'shake256' with XOF output length
    const hash = createHash('shake256', { outputLength: 32 });
    return hash.update(data, 'utf-8').digest('hex');
  } catch {
    // Fallback: SHA-256 (same output length, different algorithm)
    return createHash('sha256').update(data, 'utf-8').digest('hex');
  }
}
```

**Migration strategy:** New entries use SHAKE-256. The `verify()` method detects the
algorithm boundary: entries created before the upgrade have SHA-256 hashes, entries
after use SHAKE-256. The `prev_hash` of the first SHAKE-256 entry is the SHAKE-256 of
the last SHA-256 entry — this creates a one-time bridge.

Store the hash algorithm in a new `hash_algo` column (default `'sha256'`, new entries
use `'shake256'`). The verifier checks each entry's algorithm to use the correct hash.

### Milestone 6.2: Ed25519 Signing

**Affected files:**
- NEW: `src/audit/witness-key-manager.ts` (~150 lines)
- `src/audit/witness-chain.ts`
- `tests/unit/witness-key-manager.test.ts`
- `tests/unit/witness-chain.test.ts`

**Schema addition:**

```sql
ALTER TABLE witness_chain ADD COLUMN signature TEXT;     -- Ed25519 sig (128 hex chars)
ALTER TABLE witness_chain ADD COLUMN signer_key_id TEXT; -- Key ID that signed this entry
ALTER TABLE witness_chain ADD COLUMN hash_algo TEXT DEFAULT 'sha256';
```

**Key management** (`src/audit/witness-key-manager.ts`):

```typescript
import { generateKeyPairSync, sign, verify, createHash } from 'crypto';

export interface WitnessKeyManager {
  /** Generate a new Ed25519 keypair, store in .agentic-qe/witness-keys/ */
  generateKeyPair(): { keyId: string; publicKey: Buffer };

  /** Sign a witness entry payload */
  sign(data: Buffer, keyId?: string): { signature: Buffer; keyId: string };

  /** Verify a signature against a public key */
  verify(data: Buffer, signature: Buffer, keyId: string): boolean;

  /** Rotate the active signing key */
  rotateKey(): { oldKeyId: string; newKeyId: string };

  /** Get the active key ID */
  getActiveKeyId(): string;
}
```

- Keys stored in `.agentic-qe/witness-keys/` as PEM files
- Key rotation records a `KEY_ROTATION` entry in the witness chain itself
- Node.js `crypto.generateKeyPairSync('ed25519')` — no native dependency needed
- Signing is **opt-in** via `AQE_WITNESS_SIGNING=true` env var or config flag
- Unsigned entries remain valid (signature field is NULL)

**Updated `append()` flow:**

```typescript
append(actionType, actionData, actor): WitnessEntry {
  const actionDataStr = JSON.stringify(actionData);
  const actionHash = shake256(actionDataStr);
  const prevHash = lastEntry ? shake256(serializeEntry(lastEntry)) : GENESIS_PREV_HASH;

  // Sign if key manager is available and signing is enabled
  let signature: string | null = null;
  let signerKeyId: string | null = null;
  if (this.keyManager) {
    const payload = Buffer.from(`${prevHash}:${actionHash}:${actionType}:${actor}`);
    const result = this.keyManager.sign(payload);
    signature = result.signature.toString('hex');
    signerKeyId = result.keyId;
  }

  // INSERT with new columns
  db.prepare(`
    INSERT INTO witness_chain
      (prev_hash, action_hash, action_type, action_data, timestamp, actor,
       signature, signer_key_id, hash_algo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(prevHash, actionHash, actionType, actionDataStr, timestamp, actor,
         signature, signerKeyId, 'shake256');
}
```

### Milestone 6.3: Expand Integration Points

**Affected files:**
- `src/learning/qe-reasoning-bank.ts` — add `PATTERN_QUARANTINE` recording
- `src/learning/real-qe-reasoning-bank.ts` — quarantine logic at line ~787-790
- `src/learning/pattern-lifecycle.ts` — `quarantinePattern()` at line ~773
- `src/learning/dream/dream-engine.ts` — add `DREAM_MERGE`, `DREAM_DISCARD` recording (lines ~516-520)
- `src/learning/dream/rvcow-branch-manager.ts` — add `BRANCH_MERGE` recording (line ~294)
- `src/learning/asymmetric-learning.ts` — add `HEBBIAN_PENALTY` recording
- `src/routing/qe-task-router.ts` — add `ROUTING_DECISION` recording
  (**Note:** `src/optimization/model-router.ts` does NOT exist. The actual routing
  code is in `src/routing/qe-task-router.ts`, `src/shared/llm/router/hybrid-router.ts`,
  and `src/integrations/agentic-flow/model-router/router.ts`. The `qe-task-router.ts`
  is the primary integration point for QE routing decisions.)
- `src/integrations/coherence/engines/witness-adapter.ts` — verify compatibility with schema changes
- `src/domains/quality-assessment/coordinator.ts` — already integrated (pass/fail)

Currently, only 3 of the 5 integration points specified by ADR-070 are wired:

| Integration Point | Status | Action Type |
|------------------|--------|-------------|
| ReasoningBank: create | Done | `PATTERN_CREATE` |
| ReasoningBank: update | Done | `PATTERN_UPDATE` |
| ReasoningBank: promote | Done | `PATTERN_PROMOTE` |
| ReasoningBank: quarantine | **Missing** | `PATTERN_QUARANTINE` |
| Quality gates: pass/fail | Done | `QUALITY_GATE_PASS/FAIL` |
| Dream Engine: merge | **Missing** | `DREAM_MERGE` |
| Dream Engine: discard | **Missing** | `DREAM_DISCARD` |
| Agent branches: merge | **Missing** | Needs new `BRANCH_MERGE` type |
| Hebbian penalty (ADR-061) | **Missing** | Needs new `HEBBIAN_PENALTY` type |
| Routing decisions | **Missing** | `ROUTING_DECISION` |

Add the missing integrations. Each is a 3-5 line addition at the mutation site:

```typescript
// Example: Dream Engine merge
const wc = await getWitnessChain();
wc.append('DREAM_MERGE', {
  cycleId: dreamCycle.id,
  patternsConsolidated: mergedPatternIds,
  insightsGenerated: insights.length,
}, `dream-engine:${dreamCycle.id}`);
```

Add two new action types to `WitnessActionType`:

```typescript
export type WitnessActionType =
  | 'PATTERN_CREATE' | 'PATTERN_UPDATE' | 'PATTERN_PROMOTE' | 'PATTERN_QUARANTINE'
  | 'DREAM_MERGE' | 'DREAM_DISCARD'
  | 'QUALITY_GATE_PASS' | 'QUALITY_GATE_FAIL'
  | 'ROUTING_DECISION'
  | 'BRANCH_MERGE'      // NEW: agent branch merge-back
  | 'HEBBIAN_PENALTY'   // NEW: asymmetric learning penalty event
  | 'KEY_ROTATION';     // NEW: witness key rotation
```

### Milestone 6.4: Query Methods

**Affected files:**
- `src/audit/witness-chain.ts`

Add the ADR-070 specified query methods:

```typescript
/** Get all witness entries for a specific pattern (lineage view) */
getPatternLineage(patternId: string): WitnessEntry[] {
  // Use json_extract for indexed lookup instead of LIKE scan
  return this.db.prepare(
    `SELECT * FROM witness_chain
     WHERE json_extract(action_data, '$.patternId') = ?
        OR json_extract(action_data, '$.pattern_id') = ?
     ORDER BY id ASC`
  ).all(patternId, patternId);
}

/** Get all actions by a specific actor */
getActorHistory(actorId: string, since?: string): WitnessEntry[] {
  if (since) {
    return this.db.prepare(
      'SELECT * FROM witness_chain WHERE actor = ? AND timestamp >= ? ORDER BY id ASC'
    ).all(actorId, since);
  }
  return this.db.prepare(
    'SELECT * FROM witness_chain WHERE actor = ? ORDER BY id ASC'
  ).all(actorId);
}
```

### Milestone 6.5: Retroactive Backfill

**Affected files:**
- NEW: `src/audit/witness-backfill.ts` (~100 lines)
- NEW: CLI command `aqe witness backfill`

For patterns that existed before the witness chain was introduced, create genesis entries:

```typescript
export async function backfillWitnessChain(
  db: Database.Database,
  witnessChain: WitnessChain
): Promise<{ created: number; skipped: number }> {
  // Step 1: Build a set of pattern IDs that already have PATTERN_CREATE entries.
  // Uses json_extract for indexed lookup instead of LIKE scan (~200x faster).
  db.exec(`
    CREATE TEMP TABLE IF NOT EXISTS _backfill_existing AS
    SELECT DISTINCT json_extract(action_data, '$.patternId') as pid
    FROM witness_chain
    WHERE action_type = 'PATTERN_CREATE'
      AND json_extract(action_data, '$.patternId') IS NOT NULL
  `);

  // Step 2: LEFT JOIN to find patterns missing witness entries
  const patternsWithoutWitness = db.prepare(`
    SELECT p.id, p.qe_domain, p.confidence, p.name, p.created_at
    FROM qe_patterns p
    LEFT JOIN _backfill_existing e ON e.pid = p.id
    WHERE e.pid IS NULL
    ORDER BY p.created_at ASC
  `).all() as Array<{ id: string; qe_domain: string; confidence: number; name: string; created_at: string }>;

  db.exec('DROP TABLE IF EXISTS _backfill_existing');

  let created = 0;
  for (const pattern of patternsWithoutWitness) {
    witnessChain.append('PATTERN_CREATE', {
      patternId: pattern.id,
      domain: pattern.qe_domain,
      confidence: pattern.confidence,
      name: pattern.name,
      backfilled: true,
      originalCreatedAt: pattern.created_at,
    }, 'system:backfill');
    created++;
  }

  return { created, skipped: patternsWithoutWitness.length === 0 ? 0 : 0 };
}
```

Run via CLI: `aqe witness backfill [--db <path>]`

**Safety:** Backfill only creates `PATTERN_CREATE` entries for patterns that have no
existing witness entry. Idempotent — running twice creates zero new entries.

### Milestone 6.6: Archival / Compaction

**Affected files:**
- `src/audit/witness-chain.ts`

The chain grows monotonically. For databases with 100K+ patterns, the chain could reach
millions of entries. Add an archival method:

```typescript
/** Archive entries older than cutoff to a separate table */
archiveEntries(olderThan: string): { archived: number } {
  // Move old entries to witness_chain_archive (same schema)
  this.db.exec(`
    CREATE TABLE IF NOT EXISTS witness_chain_archive AS
    SELECT * FROM witness_chain WHERE 0
  `);

  const result = this.db.prepare(`
    INSERT INTO witness_chain_archive SELECT * FROM witness_chain
    WHERE timestamp < ? AND id > 1
  `).run(olderThan);

  this.db.prepare(`
    DELETE FROM witness_chain WHERE timestamp < ? AND id > 1
  `).run(olderThan);

  return { archived: result.changes };
}
```

**Note:** The genesis entry (id=1) is never archived — it anchors the chain.

### Milestone 6.7: Enhanced Verification with Signature Checking

**Affected files:**
- `src/audit/witness-chain.ts`

Upgrade `verify()` to also check Ed25519 signatures when present:

```typescript
verify(options?: { checkSignatures?: boolean }): VerifyResult {
  // ... existing hash chain verification ...

  // Additionally verify signatures if requested
  if (options?.checkSignatures && this.keyManager) {
    for (const entry of entries) {
      if (entry.signature && entry.signer_key_id) {
        const payload = Buffer.from(
          `${entry.prev_hash}:${entry.action_hash}:${entry.action_type}:${entry.actor}`
        );
        const sigBuffer = Buffer.from(entry.signature, 'hex');
        if (!this.keyManager.verify(payload, sigBuffer, entry.signer_key_id)) {
          return {
            valid: false,
            brokenAt: entry.id,
            entriesChecked: i + 1,
            signatureInvalid: true,
          };
        }
      }
    }
  }
}
```

### Success Criteria for Phase 6

- [ ] New entries use SHAKE-256 hashing (with SHA-256 fallback for Node <18)
- [ ] Ed25519 signing works when enabled via `AQE_WITNESS_SIGNING=true`
- [ ] Key generation, rotation, and verification work end-to-end
- [ ] All 11 action types have integration points wired
- [ ] `getPatternLineage(patternId)` returns chronological mutation history
- [ ] `getActorHistory(actorId)` returns all actions by that actor
- [ ] Backfill creates genesis entries for patterns missing witness records
- [ ] Backfill is idempotent (safe to run multiple times)
- [ ] Archival moves old entries without breaking chain verification
- [ ] `verify({ checkSignatures: true })` validates Ed25519 sigs
- [ ] Existing 12,857 SHA-256 entries remain valid after upgrade
- [ ] Brain export includes the new columns (`signature`, `signer_key_id`, `hash_algo`)
- [ ] 25+ new tests covering crypto, key management, backfill, and archival
- [ ] `npm run build` and `npm test -- --run` pass

**Estimated complexity:** High (cryptography, schema migration, 6+ integration points)
**Estimated effort:** 10-14 hours

---

## Implementation Order and Dependencies

```
Phase 1 (Shared Code)
   |
   v
Phase 2 (Missing Tables)  ---->  Phase 3 (Embedding Restore)
   |                                  |
   v                                  v
Phase 4 (RuVector Features)      Phase 5 (Manifest v3, CLI)
                                      |
                                      v
                                 Phase 6 (ADR-070 Witness Chain)
```

Phases 2 and 3 can be worked in parallel after Phase 1 completes.
Phase 4 and Phase 5 can be worked in parallel after Phases 2 and 3.
Phase 6 depends on Phase 5 (manifest v3.0 must include new witness columns)
and Phase 4.1 (verify_witness() in RVF adapter). Phase 6 milestones 6.1-6.7
are sequential within the phase.

## Total Estimated Effort

| Phase | Hours | Risk |
|-------|-------|------|
| Phase 1: Shared Code | 4-6 | Low |
| Phase 2: Missing Tables (21 new → 26 total) | 9-13 | Medium (FK ordering, kernel size, large tables) |
| Phase 3: Embedding Restore | 6-8 | Medium (BLOB handling) |
| Phase 4: RuVector Features | 6-8 | Low (wrapping existing APIs) |
| Phase 5: Manifest v3.0, CLI | 4-6 | Low |
| Phase 6: ADR-070 Witness Chain | 10-14 | High (crypto, schema migration, 8 integration files) |
| **Total** | **39-55** | |

## Risk Mitigation

1. **Large table memory pressure** (`concept_edges` with 68K rows):
   Use streaming JSONL writes and chunked kernel JSON construction.
   Test with 100K synthetic rows to validate memory bounds.

2. **BLOB serialization size inflation** (Base64 is 33% larger):
   For JSONL: acceptable, compression recommended for transfer.
   For RVF: BLOBs go in kernel (not HNSW), so no HNSW size impact.

3. **FK ordering during import** (8 FK chains across 26 tables):
   Define import order explicitly in the table config array (see Milestone 2.2).
   Wrap full import in a single SQLite transaction.
   Key chains: `dream_cycles` → `dream_insights`, `qe_trajectories` → `trajectory_steps`,
   `concept_nodes` → `concept_edges`, `goap_goals` → `goap_plans` → `goap_plan_signatures`,
   `captured_experiences` → `experience_applications`, `goap_plans` → `execution_results`
   → `executed_steps`.

4. **Native binding unavailability** (`@ruvector/rvf-node` optional):
   All Phase 4 features are gated behind `isRvfAvailable()`.
   JSONL format always works as fallback.

5. **Backward compatibility regression**:
   Dedicated test suite (Phase 5.4) with frozen v1.0/v2.0 test fixtures.

6. **SHAKE-256 availability** (Phase 6):
   Node.js 18+ supports `shake256` in `crypto.createHash()`. For older runtimes,
   fall back to SHA-256 with a logged warning. The `hash_algo` column tracks which
   algorithm was used per entry, so verification works across the boundary.

7. **Witness chain schema migration** (Phase 6):
   Three new nullable columns (`signature`, `signer_key_id`, `hash_algo`) are added
   via `ALTER TABLE ADD COLUMN` — SQLite supports this without data migration.
   Existing entries have NULL for new columns, which is the expected state.

8. **Backfill performance** (Phase 6.5):
   15,634 patterns need genesis entries. At ~0.2ms per insert (hash + write),
   this takes ~3 seconds. Run inside a single transaction for atomicity.
   Show a progress bar in the CLI for user feedback.

9. **Kernel JSON size for RVF format** (Phase 2):
   With 26 tables, the kernel JSON could exceed 25MB (`concept_edges` alone ≈ 14MB,
   `qe_patterns` ≈ 8MB). Mitigation: for tables with >10K rows, use chunked kernel
   encoding — split into multiple KERNEL_SEG segments keyed by table name, or
   compress the kernel JSON with gzip before `embedKernel()`. Alternatively, set a
   per-table row limit for the kernel and fall back to streaming JSONL within the RVF
   for oversized tables. Test with actual `embedKernel()` to determine buffer limits.

10. **Import rollback on partial failure** (Phase 2/3):
    SQLite transaction handles SQLite-side atomicity, but RVF HNSW ingest has no
    rollback. Strategy: perform all SQLite inserts first (inside transaction), commit,
    then ingest into HNSW as a best-effort step. If HNSW fails, SQLite data is still
    intact and HNSW can be rebuilt. Log a warning, do not fail the import.

11. **Backfill query performance** (Phase 6.5):
    The `NOT EXISTS` with `LIKE '%"patternId":"..."'%'` scans witness_chain (12K rows)
    per pattern (15K patterns) = ~200M string comparisons. Use a set-based approach
    instead: extract all existing PATTERN_CREATE pattern IDs into a temp table first,
    then LEFT JOIN to find gaps. See revised query in Milestone 6.5.

12. **`witness-adapter.ts` compatibility** (Phase 6):
    `src/integrations/coherence/engines/witness-adapter.ts` wraps the witness chain.
    When schema changes (new columns, SHAKE-256), verify the adapter still works.
    Add it to Phase 6.3 affected files list.

## Testing Strategy

| Test Type | Count | Focus |
|-----------|-------|-------|
| Unit (brain-shared) | 20+ | Merge logic, BLOB serialization, DDL, FK ordering |
| Unit (brain-exporter) | 18+ | JSONL export/import for all 26 tables |
| Unit (brain-rvf-exporter) | 12+ | RVF export/import, embedding round-trip, kernel size |
| Integration (round-trip) | 12+ | Full export-import cycle, fidelity checks |
| Backward compat | 10+ | v1.0/v2.0 import into v3.0 |
| Edge cases | 10+ | Empty DB, missing tables, corrupted data, partial failure |
| Unit (witness-chain) | 15+ | SHAKE-256, Ed25519 sign/verify, hash algo boundary |
| Unit (witness-key-manager) | 10+ | Key generation, rotation, PEM storage |
| Integration (witness) | 8+ | Backfill, archival, cross-verify with RVF, witness-adapter |
| **Total new tests** | **115+** | |

## Files Modified Summary

| File | Action | Lines Delta |
|------|--------|-------------|
| `src/integrations/ruvector/brain-shared.ts` | NEW | +350 |
| `src/integrations/ruvector/brain-exporter.ts` | MODIFY | -200, +100 |
| `src/integrations/ruvector/brain-rvf-exporter.ts` | MODIFY | -200, +150 |
| `src/integrations/ruvector/rvf-native-adapter.ts` | MODIFY | +40 |
| `src/cli/brain-commands.ts` | MODIFY | +20 |
| `src/cli/handlers/brain-handler.ts` | MODIFY | +60 |
| `src/audit/witness-chain.ts` | MODIFY | +120 |
| `src/audit/witness-key-manager.ts` | NEW | +150 |
| `src/audit/witness-backfill.ts` | NEW | +100 |
| `src/learning/qe-reasoning-bank.ts` | MODIFY | +5 |
| `src/learning/real-qe-reasoning-bank.ts` | MODIFY | +10 |
| `src/learning/pattern-lifecycle.ts` | MODIFY | +5 |
| `src/learning/dream/dream-engine.ts` | MODIFY | +15 |
| `src/learning/dream/rvcow-branch-manager.ts` | MODIFY | +10 |
| `src/learning/asymmetric-learning.ts` | MODIFY | +10 |
| `src/routing/qe-task-router.ts` | MODIFY | +10 |
| `src/integrations/coherence/engines/witness-adapter.ts` | MODIFY | +5 |
| `tests/unit/brain-shared.test.ts` | NEW | +300 |
| `tests/unit/brain-exporter.test.ts` | MODIFY | +200 |
| `tests/unit/brain-backward-compat.test.ts` | NEW | +150 |
| `tests/unit/witness-chain.test.ts` | MODIFY | +200 |
| `tests/unit/witness-key-manager.test.ts` | NEW | +150 |
| **Net** | | **+1,255** |

---

## Appendix A: RuVector v2.0.5 Feature Inventory

Research conducted 2026-03-08 against https://github.com/ruvnet/ruvector (v2.0.5, 2026-02-26).

### RVF Format — 24 Segment Types

The `.rvf` file is an append-only container with 24 segment types:

| Segment | ID | Purpose | AQE Relevance |
|---------|-----|---------|---------------|
| `MANIFEST_SEG` | 0x01 | 4KB root manifest, two-phase boot | Core — always present |
| `VEC_SEG` | 0x02 | Vector embeddings (fp16/fp32/int8/binary) | **HIGH** — brain embeddings |
| `INDEX_SEG` | 0x03 | Progressive 3-layer HNSW (A/B/C) | **HIGH** — semantic search |
| `META_SEG` | 0x04 | Key-value metadata per vector | **HIGH** — domain/type tags |
| `META_IDX_SEG` | 0x05 | Filtered search indexes | **MEDIUM** — filtered brain search |
| `OVERLAY_SEG` | 0x06 | LoRA adapter deltas | Future — SONA fine-tuning |
| `GRAPH_SEG` | 0x07 | GNN state | Future — concept graph in RVF |
| `QUANT_SEG` | 0x08 | Quantization codebooks | **MEDIUM** — compressed embeddings |
| `WITNESS_SEG` | 0x0A | Tamper-evident audit chain (SHAKE-256) | **HIGH** — integrity verification |
| `CRYPTO_SEG` | 0x0C | ML-DSA-65/Ed25519 signatures | **HIGH** — signed exports |
| `KERNEL_SEG` | 0x0E | Embedded Linux microkernel | Already used for brain data |
| `EBPF_SEG` | 0x0F | XDP/TC programs | Low — not needed for brain |
| `WASM_SEG` | 0x10 | Query microkernel (5.5KB) | Future — browser brain search |
| `COW_MAP_SEG` | 0x20 | Cluster ownership for COW branches | **HIGH** — incremental exports |
| `REFCOUNT_SEG` | 0x21 | Reference counting | Internal |
| `MEMBERSHIP_SEG` | 0x22 | Vector visibility filters | **MEDIUM** — domain scoping |
| `DELTA_SEG` | 0x23 | Sparse patch deltas | Future — incremental updates |
| `TRANSFER_PRIOR` | 0x30 | Transfer learning state | Future — cross-project learning |
| `POLICY_KERNEL` | 0x31 | Thompson Sampling state | Future — solver integration |
| `COST_CURVE` | 0x32 | Solver cost/reward curves | Future — solver integration |
| `PROFILE_SEG` | — | Domain configuration | **MEDIUM** — brain profiles |
| `HOT_SEG` | — | Temperature-promoted hot data | Low — runtime optimization |
| `SKETCH_SEG` | — | VQE/quantum state | Low — quantum simulation |
| `DASHBOARD_SEG` | — | Embedded UI bundle | Future — brain viewer |

### rvf-node N-API — Full API (v0.1.4)

```typescript
class RvfDatabase {
  // Factory
  static create(path: string, options: RvfOptions): RvfDatabase
  static open(path: string): RvfDatabase
  static open_readonly(path: string): RvfDatabase

  // Data operations
  ingest_batch(vectors: Float32Array, ids: i64[], metadata?: RvfMetadataEntry[]): RvfIngestResult
  query(vector: Float32Array, k: u32, options?: RvfQueryOptions): RvfSearchResult[]
  delete(ids: i64[]): RvfDeleteResult
  delete_by_filter(filter_json: string): RvfDeleteResult
  compact(): RvfCompactionResult

  // Kernel/eBPF embedding
  embed_kernel(arch, type, flags, image: Buffer, port, cmdline?): i64
  extract_kernel(): { header: Buffer, image: Buffer } | null
  embed_ebpf(type, attach, dim, bytecode: Buffer, btf?): i64
  extract_ebpf(): { header: Buffer, payload: Buffer } | null

  // Lineage
  file_id(): string
  parent_id(): string
  lineage_depth(): u32
  derive(child_path: string, options?: RvfOptions): RvfDatabase

  // Inspection
  segments(): RvfSegmentInfo[]
  dimension(): u32
  metric(): string
  index_stats(): RvfIndexStats
  status(): RvfStatus
  verify_witness(): RvfWitnessResult

  // Lifecycle
  freeze(): u32
  close(): void
}

interface RvfOptions {
  dimension: u32;
  metric?: string;           // "l2" | "cosine" | "ip"
  profile?: u32;             // 0-3 hardware profile
  compression?: string;      // "none" | "scalar" | "product"
  signing?: boolean;         // Enable Ed25519 segment signing
  m?: u32;                   // HNSW max edges (default 16)
  ef_construction?: u32;     // HNSW beam width (default 200)
}

interface RvfQueryOptions {
  ef_search?: u32;
  filter?: string;           // JSON metadata filter
  timeout_ms?: u32;
}

interface RvfMetadataEntry {
  field_id: u32;
  value_type: string;
  value: string;
}

interface RvfIngestResult { accepted: i64; rejected: i64; epoch: u32 }
interface RvfSearchResult { id: i64; distance: f64 }
interface RvfDeleteResult { deleted: i64; epoch: u32 }
interface RvfCompactionResult { segments_compacted: u32; bytes_reclaimed: i64; epoch: u32 }
interface RvfStatus {
  total_vectors: i64; total_segments: u32; file_size: i64;
  current_epoch: u32; profile_id: u32; compaction_state: string;
  dead_space_ratio: f64; read_only: boolean;
}
interface RvfIndexStats {
  indexed_vectors: i64; layers: u32; m: u32;
  ef_construction: u32; needs_rebuild: boolean;
}
interface RvfWitnessResult { valid: boolean; entries: u32; error?: string }
interface RvfSegmentInfo { id: i64; offset: i64; payload_length: i64; seg_type: string }
```

### Currently Used vs Available in rvf-native-adapter.ts

| Method | Used? | Phase to Add |
|--------|-------|-------------|
| `create()` / `open()` / `open_readonly()` | Yes | — |
| `ingest_batch()` (via `ingestBatch`) | Yes | — |
| `query()` | Yes (as search) | — |
| `status()` | Yes | — |
| `segments()` | Yes | — |
| `dimension()` | Yes | — |
| `embed_kernel()` | Yes | — |
| `extract_kernel()` | Yes | — |
| `close()` | Yes | — |
| `compact()` | Adapter method exists but unused | Phase 4.5 |
| `delete()` | Adapter method exists but unused | — |
| `fork()` (COW copy) | Adapter method exists but unused | Phase 4.3 |
| **`verify_witness()`** | **NOT exposed** | **Phase 4.1** |
| **`index_stats()`** | **NOT exposed** | **Phase 4.1** |
| **`freeze()`** | **NOT exposed** | **Phase 4.2** |
| **`derive()`** | **NOT exposed** | **Phase 4.3** |
| **`file_id()`** | **NOT exposed** | **Phase 4.3** |
| **`parent_id()`** | **NOT exposed** | **Phase 4.3** |
| **`lineage_depth()`** | **NOT exposed** | **Phase 4.3** |
| **`metric()`** | **NOT exposed** | Nice-to-have |
| **`embed_ebpf()`** | **NOT exposed** | Future |
| **`extract_ebpf()`** | **NOT exposed** | Future |
| **`delete_by_filter()`** | **NOT exposed** | Future |
| **`RvfMetadataEntry`** on ingest | **NOT used** | **Phase 4.4** |
| **`RvfQueryOptions.filter`** | **NOT used** | **Phase 4.4** |
| **`RvfOptions.signing`** | **NOT used** | **Phase 4.2** |
| **`RvfOptions.compression`** | **NOT used** | Future (scalar/product quant) |

### Other RuVector Crates of Interest

| Crate | Relevance to AQE Brain |
|-------|----------------------|
| `rvf-crypto` | `create_witness_chain()`, `verify_witness_chain()`, Ed25519 signing, SHAKE-256 — integrity |
| `sona` | Native SONA engine with MicroLoRA, EWC++, ReasoningBank — compare with our TS SONA |
| `ruvector-coherence` | `evaluate_batch()`, `contradiction_rate()`, spectral coherence — quality validation |
| `ruvector-gnn` + `ruvector-gnn-node` | GNN layers, differentiable search — concept graph analysis |
| `ruvector-delta-consensus` | CRDTs (`GCounter`, `ORSet`, `LWWRegister`), delta gossip — multi-brain merge |
| `rvf-quant` | Scalar (4x), Product (8-16x), Binary (32x) quantization — compressed brain exports |
| `rvf-import` | JSON/CSV/NumPy importers — batch brain ingestion |
| `ruvector-attention` | 46+ attention types — potential brain search quality improvements |

### Version History Summary

| Version | Date | Key Changes |
|---------|------|-------------|
| 2.0.5 | 2026-02-26 | Fixed fatal `abort()` in NAPI/WASM, mmap bounds checking |
| 2.0.4 | 2026-02-25 | Security Hardened RVF v3.0, CWE-22 path traversal fix |
| 0.3.0 | 2026-02-21 | Major: 8 new crates, Ed25519, WASM segments, AGI container |
| 0.2.6 | 2025-12-09 | PostgreSQL extension, SPARQL, GNN v2, Docker infra |

---

## Plan Revision History

| Date | Changes |
|------|---------|
| 2026-03-08 | Initial 5-phase plan created. |
| 2026-03-08 | Added Phase 6 (ADR-070 witness chain audit compliance). |
| 2026-03-08 | Post-review revision: 11 issues addressed (see below). |

### Revision: 2026-03-08 Post-Review

Cross-referenced plan against actual codebase. Changes made:

1. **Tables: 23 → 26.** Added `experience_applications` (3 rows, FK → `captured_experiences`),
   `execution_results` (530 rows), `executed_steps` (705 rows) to Tier 2. These were
   previously dismissed as "derived from plans" but contain significant execution outcome
   data that provides learning context for GOAP plans.

2. **Fixed `qe_pattern_embeddings` double-count.** Was listed in both "Currently exported (5)"
   and Tier 2. Added clarifying note that Tier 2 enhancement is JSONL export gap fix,
   not a new table.

3. **Fixed wrong file path `src/optimization/model-router.ts`.** File does not exist. Corrected
   to `src/routing/qe-task-router.ts` with notes about other routing files.

4. **Expanded Phase 6.3 affected files** from 4 to 10 files. Added `real-qe-reasoning-bank.ts`,
   `pattern-lifecycle.ts`, `rvcow-branch-manager.ts`, `asymmetric-learning.ts`,
   `witness-adapter.ts`.

5. **Fixed `concept_nodes` embedding count.** Was "variable / subset", actual is 0 (column
   exists but never populated). Updated Milestone 3.2 table.

6. **Added kernel JSON size risk (#9).** With 26 tables, kernel could exceed 25MB.
   Mitigation strategies documented.

7. **Added import rollback strategy (#10).** SQLite transaction for atomicity, HNSW as
   best-effort step after commit.

8. **Fixed backfill query performance (#11).** Replaced O(n×m) LIKE scan with set-based
   `json_extract` + temp table approach (~200x faster).

9. **Fixed `getPatternLineage` query.** Replaced LIKE with `json_extract` for consistency.

10. **Added `kv_store` partial export note.** Documented 414 learning-relevant rows across
    6 namespaces as future consideration.

11. **Added explicit FK-aware import order** for all 26 tables in Milestone 2.2.

12. **Updated totals:** effort 39-55h (was 38-54h), tests 115+ (was 105+), net lines +1,255
    (was +1,180).
