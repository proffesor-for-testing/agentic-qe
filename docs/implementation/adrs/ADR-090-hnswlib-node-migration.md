# ADR-090: Migrate Native HNSW Backend from @ruvector/router to hnswlib-node

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-090 |
| **Status** | Accepted |
| **Date** | 2026-04-06 |
| **Author** | AQE Team |
| **Supersedes** | ADR-081 (Native HNSW via @ruvector/router NAPI), in part |
| **Related Issues** | [#399](https://github.com/proffesor-for-testing/agentic-qe/issues/399) |
| **Review Cadence** | 6 months, or on next @ruvector/router stable release |

---

## WH(Y) Decision Statement

**In the context of** AQE v3's `NativeHnswBackend`, which was adopted by ADR-081 to provide sub-millisecond HNSW vector search via the `@ruvector/router` Rust NAPI binding for the unified HNSW provider (ADR-071),

**facing** four serious bugs in `@ruvector/router 0.1.28` discovered during issue #399 investigation — (1) the HNSW graph walk returns essentially random non-neighbors with recall@10 ≈ 0–10% on textbook fixtures, (2) the `VectorDb` constructor unconditionally writes a `vectors.db` redb file to the current working directory in violation of the unified memory architecture (CLAUDE.md: "all data goes through SQLite — one DB, one schema"), (3) only one `VectorDb` instance can exist per process due to a process-wide redb file lock, and (4) the NAPI dispose path does not synchronously release the redb lock, causing the v3.9.5 futex deadlock when the indexer tried to recreate after reset,

**we decided to** rewrite `NativeHnswBackend` to wrap `hnswlib-node@^3.0.0` (the canonical Node.js binding for Yury Malkov's reference C++ Hnswlib implementation, used by Pinecone, Weaviate, Qdrant, LangChain, ChromaDB and the broader ecosystem) instead of `@ruvector/router`,

**and rejected** (a) waiting for an upstream `@ruvector/router` fix (rejected: timeline unknown, four independent bugs imply systemic issues, AQE users with large codebases need working HNSW now), (b) tuning `efSearch` to compensate (rejected: empirical sweep showed `efSearch=N` was required for usable recall, defeating HNSW's purpose), (c) replacing `NativeHnswBackend` with brute-force in TS (rejected: AQE's intended use case includes user codebases with 100k+ source files where brute-force is unacceptable), (d) adding a hybrid threshold (rejected: doesn't fix the underlying broken HNSW; users still need real HNSW above the threshold),

**to achieve** correct nearest-neighbor search at native speed for users with large code intelligence indexes, elimination of the four `@ruvector/router` bugs in a single dependency swap, no new dependency addition (`hnswlib-node` was already in `package.json`), and re-enablement of `useNativeHNSW: true` as the default flag value (reverting the v3.9.5 hotfix),

**accepting that** the `@ruvector/router` package remains in `package.json` for other ruvector ecosystem features (`@ruvector/sona`, `@ruvector/gnn`, `@ruvector/learning-wasm`, `@ruvector/router`'s `SemanticRouter` higher-level wrapper) — only the `VectorDb` HNSW path is replaced, and that existing user installations will have orphaned `vectors.db` files in their project roots which we surface as a warning during `aqe init` but never delete automatically per CLAUDE.md data protection rules.

---

## Context

`NativeHnswBackend` was added by ADR-081 (March 2026) to provide native-speed HNSW vector search for AQE's pattern store, code intelligence index, and learning pipeline. ADR-081 adopted `@ruvector/router`'s `VectorDb` because it was already in the ruvector dependency tree, advertised SIMD acceleration, and offered a NAPI binding.

In v3.9.5 (April 2026), the `useNativeHNSW` default flag was hotfix-flipped from `true` to `false` because `@ruvector/router` was deadlocking on certain inputs (futex contention inside the Rust-side HNSW). The JS `ProgressiveHnswBackend` became the safe default — correct but `O(N)` per query, fine for AQE's own ~2.5k-vector code-intelligence index but unacceptable for users running AQE on large codebases.

Issue #399 was opened to track an exact-match recall test that had been failing intermittently in CI (`tests/integration/ruvector/phase1-integration.test.ts:222` — `should store 1000 vectors via HnswAdapter and search with correct ranking`). The original diagnosis attributed it to "approximate HNSW vs strict-equality test assumption" and skipped the test as a workaround.

A fresh investigation in April 2026 reproduced the failure deterministically on a linux-arm64 codespace devcontainer and drilled into `@ruvector/router 0.1.28`'s actual behavior with diagnostic scripts (`scripts/diagnose-issue-399*.mjs`). The drill-down revealed not one bug but four, of which the broken HNSW search was only the most visible.

---

## The four `@ruvector/router 0.1.28` bugs

### Bug 1: HNSW search returns essentially random results

Empirical test on 1000 vectors at 384 dimensions, M=16, efConstruction=200, efSearch=100, cosine metric, querying with the stored vector at `id=42` (so the expected top-1 is `id=42` with score 1.0):

| Fixture | Recall@10 | Top-1 returned | Top-1 expected | Self-vector found? |
|---|---|---|---|---|
| FNV-hashed sine waves (project test fixture) | 0% | id=812 (rank 13 by brute-force) | id=42 | NO |
| Unit-Gaussian random vectors (textbook HNSW eval) | 10% | id=999 (rank 7 by brute-force) | id=42 | NO |
| Unit-Gaussian + Euclidean metric | 0% | id=982 (not in top-10) | id=42 | NO |

Pumping `efSearch` to 1000 (= N, effectively brute-force) restored 100% recall on the FNV fixture but defeated HNSW's purpose. Increasing `M=64, efC=800` only got to 60% recall@10 sequential. Random insertion order improved recall vs sequential, indicating @ruvector/router's level-assignment is not properly randomized — a real HNSW implementation should be approximately order-invariant.

### Bug 2: CWD pollution via auto-created `vectors.db`

`VectorDb`'s constructor unconditionally writes a `vectors.db` redb file to the current working directory if `storagePath` is not provided. AQE never passes `storagePath`. So every `aqe init`, every test run, and every CLI invocation that touches `NativeHnswBackend` silently litters the user's project root with a 3.5MB+ redb file outside `.agentic-qe/`, in a non-SQLite format that no AQE migration or backup tooling knows about. Verified by direct test (`scripts/diagnose-issue-399.mjs`).

### Bug 3: Process-wide singleton lock

Only one `VectorDb` instance can exist per process. Subsequent constructors throw `Database error: Database already open. Cannot acquire lock.` This blocked the original diagnostic script's attempt to sweep multiple HNSW configurations in one process and is the same lock that prevents test cleanup from creating fresh backends. Workaround was to run each diagnostic config in a separate Node process.

### Bug 4: NAPI dispose does not release the redb file lock

The `dispose()` method sets `nativeDb = null` and relies on NAPI garbage collection to reclaim the Rust-side `VectorDb`. NAPI GC is not synchronous, so the redb file lock outlives `dispose()`. This is the root cause of the v3.9.5 futex deadlock — when `resetUnifiedMemory()` tried to recreate the indexer after a reset, the new `VectorDb` constructor blocked forever waiting for a lock the old (already-disposed) instance still held.

### Why these are connected

Bugs 2, 3, and 4 are all consequences of `@ruvector/router` storing every `VectorDb` in a redb file by default rather than in process memory. Bug 1 is independent — it's a graph-walk correctness issue in the underlying Rust HNSW implementation that the redb file design happens to obscure.

---

## Why hnswlib-node

`hnswlib-node@^3.0.0` is the canonical Node.js binding for [Hnswlib](https://github.com/nmslib/hnswlib), the C++ reference HNSW implementation by Yury Malkov (the HNSW paper's primary author). It is:

- **Correct**: 100% recall@10 at default M=16, efConstruction=200, efSearch=100 on the same Gaussian fixture where `@ruvector/router` returns 10%. Empirical verification: `scripts/diagnose-issue-399-hnswlib.mjs`.
- **Fast**: Insert ~324ms for 1000 vectors (vs `@ruvector/router`'s ~430ms — *faster*). Search ~0.35ms per query.
- **In production at scale**: Used by Pinecone, Weaviate, Qdrant, LangChain, ChromaDB.
- **Already a direct dependency**: `hnswlib-node@^3.0.0` is in `package.json` and `node_modules` — the legacy `src/integrations/embeddings/index/HNSWIndex.ts` already wraps it correctly. No new dependency to add.
- **Better API for AQE's needs**: native filter function support (`searchKnn(query, k, filter)`), runtime `setEf()` for query-time tuning, `resizeIndex()` for growth past initial capacity, `markDelete()` with `allowReplaceDeleted` for slot reuse, no auto-persistence (explicit `writeIndex(filename)` only).
- **No process-wide locks**: multiple `HierarchicalNSW` instances coexist freely — verified by `tests/integration/ruvector/native-hnsw-real-fixture.test.ts`.
- **No CWD pollution**: persistence is opt-in via `writeIndex(filename)`. The constructor allocates only in the C++ heap.

### Comparison

| | `@ruvector/router 0.1.28` | `hnswlib-node 3.0.0` |
|---|---|---|
| **Recall@10 on 1k vectors (default params)** | 10% | **100%** |
| **Self-vector found in top-10?** | NO | **YES** |
| **Insert latency (1k × 384 dim)** | ~430ms | **~324ms** |
| **Search latency** | ~0.21ms (wrong results) | **~0.35ms (correct)** |
| **Auto-creates files in CWD?** | YES (`vectors.db`) | **NO** |
| **Multiple instances per process?** | NO (singleton lock) | **YES** |
| **Dispose releases resources?** | NO (NAPI GC dependency) | **YES (immediate JS-side null)** |
| **Native filter functions?** | NO | **YES** |
| **Runtime efSearch tuning?** | NO | **YES (`setEf`)** |
| **Resize past initial capacity?** | NO | **YES (`resizeIndex`)** |

---

## Decision

1. **Rewrite `src/kernel/native-hnsw-backend.ts`** to wrap `hnswlib-node`'s `HierarchicalNSW`. Drop the local `vectorStore` mirror and `bruteForceSearch` fallback (no longer needed because `hnswlib-node` returns correct distances directly). Honor `metric: 'cosine' | 'euclidean'` via the `'cosine'` and `'l2'` space names. Use `setEf()` for runtime efSearch. Use `resizeIndex()` to double in place when the live id count meets the current `maxElements`. Start `INITIAL_MAX_ELEMENTS = 10_000`. Keep the same `IHnswIndexProvider` interface and `NativeHnswMetrics` field set so consumers don't break.

2. **Keep the legacy `NativeHnswMetrics` fallback fields** (`fallbackSearchCount`, `bruteForceSearchCount`, `nativeSearchCount`, `fallbackRate`, `allSearchesBruteForce`) but document them as no-op since hnswlib-node has no fallback path. They will be removed in the next major version. This preserves the existing type-conformance tests.

3. **Flip `useNativeHNSW` default back to `true`** in `src/integrations/ruvector/feature-flags.ts`. The native backend now actually works — users who upgrade get sublinear HNSW search automatically. Update the flag's docstring to record the v3.9.5 → #399 history.

4. **Un-skip the two #399 tests** in `tests/integration/ruvector/phase1-integration.test.ts` (`should store 1000 vectors via HnswAdapter and search with correct ranking` at line 222, and the compression round-trip variant at line 1185). They now pass against the new backend.

5. **Add a real-fixture recall test** that loads the project's own `qe-kernel` namespace from `.agentic-qe/memory.db` (~2.5k real sentence-transformer embeddings written by the kernel) and asserts top-1 == self with recall@10 ≥ 0.9 across 5 deterministic queries. Skip gracefully when `memory.db` is unavailable. See `tests/integration/ruvector/native-hnsw-real-fixture.test.ts`.

6. **Add a regression guard test for `vectors.db` CWD pollution**: construct `NativeHnswBackend` in a tmp directory, run a full add/search/remove/clear/dispose lifecycle, assert no new files were created in CWD.

7. **Add a regression guard test for concurrent instances**: construct three `NativeHnswBackend` instances in the same process and confirm they all accept inserts independently — guards against any future regression introducing a singleton lock.

8. **Add a stale `vectors.db` warning** to `src/init/phases/04-database.ts`: on `aqe init`, if `./vectors.db` exists in the project root, log a one-time warning that it is orphan data from `@ruvector/router` (pre-#399) and suggest `rm vectors.db`. **Do not delete automatically** — CLAUDE.md data protection rules forbid touching `.db` files without explicit user confirmation.

9. **Keep the four diagnostic scripts** (`scripts/diagnose-issue-399.mjs`, `-realistic.mjs`, `-direct.mjs`, `-hnswlib.mjs`). They reproduce the four bugs and the hnswlib-node verification, and pay for themselves any time `@ruvector/router` or `hnswlib-node` is upgraded.

10. **Do not remove `@ruvector/router` from `package.json`**. Other code paths may still depend on it (e.g. `SemanticRouter` higher-level wrapper, or transitive deps). Removal is out of scope for this PR; it can be done as a follow-up after a `grep`-driven audit.

---

## Consequences

### Positive

- **Correctness**: code-intelligence semantic search now returns nearest neighbors instead of random non-neighbors. Pattern matching, dream insights, and KG search become more accurate. (This is a behavior change as well as a fix — downstream consumers may see *better* but *different* results for the same queries.)
- **Scale**: real sublinear HNSW for users with large codebases. The 10k initial `maxElements` doubles in place via `resizeIndex` so 100k+ user indexes work without code changes.
- **Architecture cleanup**: no more `vectors.db` in user project roots. The unified memory architecture (everything in `.agentic-qe/memory.db`) is restored.
- **No new dependency**: `hnswlib-node` was already in `package.json` from a separate code path.
- **Lock-free**: multiple HNSW instances coexist, fixing the v3.9.5 futex deadlock at the root.
- **Faster inserts** (~25% improvement at 1k scale).

### Negative

- **Behavior change**: search results will differ from the (broken) `@ruvector/router` results. Tests written against the broken behavior may need updating — verified during this PR by running the full unit suite.
- **Memory**: `hnswlib-node` holds the full graph in C++ heap. For AQE's largest current index (~2.5k vectors at 384 dim) that's ~2 MB. For a hypothetical 100k user index it's ~tens of MB. Acceptable.
- **Resize timing**: `resizeIndex()` doubles in place via memcpy. At 100k vectors that's a low-millisecond pause. Amortized O(1).
- **Existing user `vectors.db` files become orphans**: 3.5–50MB+ of dead data sits in user project roots until the user manually deletes it. We warn but do not delete.

### Neutral

- **`@ruvector/router` package stays in `package.json`** for other consumers. If a future audit shows nothing else uses it, a follow-up PR can remove it.

---

## Verification

### Recall test on real fixture

`tests/integration/ruvector/native-hnsw-real-fixture.test.ts` — 8 tests including:

- `should return self with score 1.0 for self-query on real qe-kernel embeddings` (1857ms)
- `should hit recall@10 >= 0.9 and top-1 == self on real qe-kernel embeddings` (1621ms)
- `should preserve descending score order in real-fixture results` (965ms)
- `should handle resize past initial maxElements with real-shaped vectors` (4584ms — exercises `resizeIndex` doubling)
- `should not create vectors.db in CWD when constructed`
- `should not create vectors.db after add/search/dispose lifecycle`
- `should not create any unexpected files in CWD across full lifecycle`
- `should support multiple concurrent instances without lock contention`

All 8 pass. The recall test runs against 2,000 real sentence-transformer embeddings from `.agentic-qe/memory.db`'s `qe-kernel` namespace.

### Unit test suite

`tests/unit/kernel/native-hnsw-backend.test.ts` — 48 tests including IHnswIndexProvider contract, search accuracy, concurrent access, edge cases (zero vector, single element, k=0, large batch), and metadata handling. All 48 pass against the new backend.

### Integration test suite

`tests/integration/ruvector/phase1-integration.test.ts` — 49 tests, all pass with zero skipped (the two #399 tests are now un-skipped and green).

### Diagnostic reproduction

```
$ node scripts/diagnose-issue-399-hnswlib.mjs 100
========== hnswlib-node M=16 efC=200 efS=100 ==========
brute-force top-1: id=42 score=1.000000
hnswlib-node top-10:
  1. id=42 sim=1.000000 (brute-force rank 1)
  2. id=794 sim=0.162582 (brute-force rank 2)
  ... (all 10 in correct order)
recall@10: 100%
top-1 == self(42): YES
```

vs. the same fixture against `@ruvector/router 0.1.28`: 10% recall@10, top-1 = id=999 (wrong), self-vector not in top-10.

---

## Migration guide for users

**If you upgrade from a pre-#399 version of AQE**, you may have a `vectors.db` file in your project root left over from the previous `@ruvector/router`-backed `NativeHnswBackend`. This file:

- is not used by anything in AQE anymore
- never contained reliably-retrievable data anyway (the broken HNSW search couldn't find what was stored)
- is safe to delete

`aqe init` will warn you if it detects the file. To remove it:

```bash
rm vectors.db
```

If you set `RUVECTOR_USE_NATIVE_HNSW=false` as a workaround for v3.9.5's deadlock, you can remove that environment variable. The native backend now works correctly.

No data migration is required. The unified `memory.db` is the source of truth and is unchanged.

---

## References

- Issue: [#399](https://github.com/proffesor-for-testing/agentic-qe/issues/399)
- Superseded part of: ADR-081 (Native HNSW via @ruvector/router NAPI)
- Related: ADR-071 (HNSW Implementation Unification)
- Diagnostic scripts: `scripts/diagnose-issue-399.mjs`, `-realistic.mjs`, `-direct.mjs`, `-hnswlib.mjs`
- hnswlib-node: https://github.com/yoshoku/hnswlib-node
- Hnswlib (C++): https://github.com/nmslib/hnswlib
- HNSW paper: Malkov & Yashunin, "Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs", 2016. https://arxiv.org/abs/1603.09320
