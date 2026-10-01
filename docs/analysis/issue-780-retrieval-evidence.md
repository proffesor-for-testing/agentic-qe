# Issue #780 retrieval evidence

The MCP RealQEReasoningBank ranker now merges FTS5 relevance with HNSW candidates.
Ranking score is distinct from measured vector similarity. Query-term coverage
weights lexical boosts; lexical-only matches have similarity zero, type `lexical`,
and cannot authorize reuse. Text-only fallback and list-all results also never
claim vector similarity or reuse eligibility. An explicit `minSimilarity` requires vector evidence,
so a rejected vector cannot return through the lexical branch.

The service preserves this evidence through both `task_orchestrate` task and
workflow inputs. Quality score and long-term tier no longer substitute for
similarity and reuse eligibility. Vector reuse requires the shared default
similarity, successful-use, age, and explicit reusable criteria.

`QEReasoningBank.routeTask` supplies the provenance recorded for the exact provider
vector. Hash fallbacks and resized vectors use text-only retrieval even if another
caller initialized a global provider identity. The same guard covers searchPatterns. The RVF fallback
scans all stored embeddings and admits only those belonging to that space.
Neither path silently treats unknown or different spaces as comparable vectors.
The Hopfield exact-recall path validates provenance before recall, honors disabled
vector search, and resets its cache whenever the embedding space changes.

Experience reinforcement uses a separate exact task/domain/type identity stored
in pattern context, with a full SHA-256 identifier in the generated pattern name
and tags. It does not depend on lexical similarity or authorize vector reuse.
This preserves promotion on repeated observations, including after SQLite reopen,
and prevents truncated-name collisions from combining unrelated experiences.

## Measured structural retrieval

Run on the checked-in `aqe-structural-transfer-2026-09-06` corpus, 384-dimensional
Xenova/all-MiniLM-L6-v2 ONNX embeddings and native hnswlib-node, k=10:

```sh
NODE_USE_ENV_PROXY=1 npx tsx scripts/structural-retrieval-baseline.ts --store=real --vector-only --json
NODE_USE_ENV_PROXY=1 npx tsx scripts/structural-retrieval-baseline.ts --store=real --json
```

`--vector-only` disables FTS lookup in the isolated test store to reproduce the
previous vector-only ranker. Both runs use real embeddings, persisted SQLite
patterns and the native HNSW index. No project learning database is used.

| Metric | Vector-only | Hybrid |
|---|---:|---:|
| Recall@10 | 1.000 | 1.000 |
| Hit@1 | 0.390 | 0.440 |
| MRR | 0.67393 | 0.70583 |
| nDCG | 0.75810 | 0.78215 |
| Top-1 margin | -0.02938 | -0.02406 |
| Relation violations | 68 | 64 |

This is a modest ranking improvement on one qualification corpus, not a claim
that structural distractors are solved; 64 relation violations remain.

## Regressions

- `pattern-search-text-hybrid.test.ts`: real routing with a provenance-enforcing
  store, lexical-only safety including phrase queries, weak common-word boosts,
  and RVF fallback beyond the old arbitrary prefix while excluding alien spaces.
  Removing the routing space identity makes the routing regression fail with no
  pattern evidence; restoring it passes.
- `experience-capture.integration.test.ts`: memory and isolated SQLite persistence,
  repeated exact observations promote and stay promoted on the fourth capture,
  SQLite reopen preserves origin identity, and shared task prefixes and different
  domains produce distinct patterns without upgrading lexical reuse.
- `task-orchestrate-pattern-provenance.test.ts`: stream JSON-RPC protocol through
  handler, service, enhanced adapter, SQLite and native HNSW. Controlled embedding
  fixtures isolate vector evidence from lexical-only alien-space rows. Both task
  and workflow payloads preserve measured evidence; a vector threshold excludes
  lexical-only candidates.

The protocol fixture controls the external embedding provider and task execution
sink; the separate baseline above exercises the actual ONNX provider.
