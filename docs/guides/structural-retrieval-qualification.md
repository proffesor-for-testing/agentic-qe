# Structural Retrieval Qualification

AQE includes a deterministic qualification corpus for measuring whether a ranker retrieves reusable test patterns across surface changes. It is an evaluation boundary; it does not change the production ranker.

`createStructuralRetrievalCorpus()` returns 100 query groups spanning rename, framework transfer, reordered steps, distractor terminology, and cross-domain transfer. Each group identifies gold relevance, a surface-similar wrong remedy, an environment-sensitive counterexample, and ordering constraints. Source families belong to exactly one of the train, calibration, or audit splits. The revision and SHA-256 lineage hash bind every pattern and query.

Pass one result for every query to `evaluateStructuralRetrieval()`. The report includes candidate recall@k, strict Hit@1, MRR, nDCG, signed gold-to-best-wrong margin, deterministic 95% bootstrap intervals, per-transformation support, ordering violations, and these attribution states:

- `not_retrieved`: the relevant pattern did not enter the top-k candidate set.
- `retrieved_misranked`: it entered the set but a wrong pattern ranked first.
- `ranked_not_used`: it ranked first but downstream execution did not apply it.
- `used_no_benefit`: it was applied but the linked outcome did not improve.
- `success`: it ranked first, was applied, and improved the linked outcome.

Use `createRetrievalReceipt()` to bind a run to its revision, representation version, embedding-space identity, candidates and scores, ranker version, applied pattern IDs, and downstream outcome reference. The receipt intentionally has no reasoning or chain-of-thought field. Missing provenance, non-finite scores, incomplete benchmark results, and corpus-lineage mismatches fail closed.

The initial lexical-overlap negative control is asserted by `tests/unit/learning/structural-retrieval.test.ts`.

## Production baseline

`npx tsx scripts/structural-retrieval-baseline.ts [--store=pattern|rvf|both] [--hash] [--json]` seeds an isolated temp database with the corpus and queries both production stores the way `QEReasoningBank.searchPatterns` does (query embedding plus its original text for FTS5). It never touches `.agentic-qe/memory.db`.

Recorded for issue #653 (ONNX `all-MiniLM-L6-v2`, 384 dimensions, k=10, both stores identical):

| Ranker | Hit@1 | MRR | nDCG | distractor/counterexample above gold |
|---|---|---|---|---|
| Vector only (FTS5 never reached from the reasoning bank) | 0.39 [0.29, 0.48] | 0.67 | 0.76 | 68 |
| Vector + FTS5 term match (#653) | 0.74 [0.65, 0.82] | 0.87 | 0.90 | 26 |

The FTS5 gain comes from term matching: passing the text through while keeping whole-query phrase matching changed nothing. The corpus is template-generated and its queries restate the gold remedy's wording, so it favours lexical scoring; `distractor-terminology` (Hit@1 0.00 → 0.25) remains the weak slice. Treat these numbers as a regression baseline, not as evidence of real-world transfer.
