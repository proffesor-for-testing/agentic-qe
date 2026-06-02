# ADR-098: Learning-Store & Routing Hardening (Ruflo Adoption Pass)

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-098 |
| **Status** | Accepted |
| **Date** | 2026-06-02 |
| **Author** | AQE Team |
| **Related Issues** | [#510](https://github.com/proffesor-for-testing/agentic-qe/issues/510) |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** an adoption pass that analysed one month of `ruvnet/ruflo`
changes (ADR-120 → ADR-143) for techniques applicable to AQE's self-learning and
routing subsystems,

**facing** three concrete defects/limitations the analysis surfaced in AQE's own
live paths — (1) routing **confidence** (`QERoutingResult.confidence`, the top
agent's combined score from `calculateAgentScores`) was structurally low (~37%
on a clean easy task, ~20% on a hard one) because the domain-match term divided
by the full count of *detected* domains, and AQE's domain detector routinely
emits 7–12 domains, washing a real single-domain match down to `(1/11)*0.4 ≈
0.04`; (2) the pattern store's confidence **decay** and stale/age
**deprecation** were *uniform*, so a proven high-success pattern was forgotten
at the same rate as noise — an influx of new low-value patterns could crowd out
historically valuable ones (catastrophic forgetting); (3) Phase-1 experience
**consolidation** merged near-duplicates by cosine similarity but had no notion
of *contradiction*, so two experiences with the same context and opposite
outcomes were silently merged, and a *used* low-quality contradictory experience
(which the merge path skips, since merge requires `application_count===0`) stayed
in retrieval and poisoned recall,

**we decided for** three targeted, reversible, behind-a-constant behavioural
changes to the live learning/routing paths, each shipped with regression tests:

1. **Domain-score de-dilution** (`src/learning/agent-routing.ts`,
   `DOMAIN_DENOM_CAP = 3`): cap the domain-match denominator at the few *truly
   relevant* domains a task has — `domainScore = min(domainMatch /
   min(detectedDomains.length, 3), 1) * 0.4`. A precise detector (1–2 domains)
   is unchanged; a broad detector no longer dilutes a real match. Measured
   recovery: a broad multi-domain route went **27.7% → 33.3%** (+5.6pp), narrow
   routes unchanged, ranking preserved. **This is a partial fix**: routing
   confidence is still structurally bounded by an immature Q-table (`qWeight`
   ramps 0→0.4 only after `QWEIGHT_RAMP_VISITS=20` visits per state) and the
   fixed `performanceScore * 0.3` term — de-dilution is the highest-leverage
   *single* lever, not a full solution to the "40% confidence" headline.

2. **EWC++ importance-weighted forgetting** (`src/learning/pattern-lifecycle.ts`,
   `EWC_DECAY_PROTECTION = 0.9`, `EWC_STALE_PROTECTION_BONUS = 2`,
   `EWC_MIN_USAGE_FOR_PROTECTION = 5`): inspired by Elastic Weight Consolidation,
   high-importance patterns (importance = clamped `success_rate` gated on
   `usage_count ≥ 5`; recency is already implied because only unused patterns
   decay/go stale) resist forgetting — decay is shielded per-row up to 10×, the
   stale window is extended up to 3×. Protection covers ONLY stale/age/decay; a
   pattern that drops below `minActiveConfidence` or starts failing is **still**
   deprecated (we blend retention, we do not permanently shield dead weight).
   Importance-0 patterns behave **identically** to before (test-locked). Honest
   framing: importance is a heuristic proxy, NOT true Fisher information — there
   are no model gradients here.

3. **Contradiction suppression in consolidation**
   (`src/learning/experience-consolidation.ts`,
   `contradictionSimilarityThreshold = 0.85`, `contradictionQualityDelta = 0.4`):
   when two experiences are highly similar but have a large quality delta
   ("same context, opposite outcome"), the lower-quality loser is **suppressed
   from retrieval** (`consolidated_into = 'contradicted'`, soft/reversible)
   instead of merged — *even if it was applied* (the recall-poisoning case the
   merge path structurally could not reach). The survivor is not boosted (a
   conflict is not a duplicate). Surfaced as `ConsolidationResult.contradicted`.

   Two pre-existing latent bugs found while doing the above were also fixed:
   `rowToPattern` dropped `consecutive_failures`, so the `'failures'`
   deprecation branch never fired (now surfaced); and the MCP server threw a
   plain object for unknown tools, losing the JSON-RPC `-32601` code (now throws
   a typed `McpError`).

**and neglected**:

- **(a) ruflo ADR-142 per-complexity-bucket Beta(α,β) routing priors.** Rejected
  because AQE's routing confidence is **not** a Beta-bandit at all — it is the
  combined static score from `calculateAgentScores`. The only Beta sampler in
  the codebase (`thompson-sampler.ts`, ADR-084) is for cross-domain *transfer*,
  keyed per domain-pair, and never feeds the confidence number. Porting the
  per-bucket fix would have changed nothing. Verified with real `aqe hooks
  pre-task` routes before writing any code.

- **(b) ruflo perf-M4 RaBitQ 1-bit signatures as a retrieval speedup.** A tested
  utility (`src/shared/utils/rabitq.ts`) was built and benchmarked, but left
  **unwired**: the 32× index-memory reduction is real, but the *speedup* is only
  ~1.2–1.5× in JS (a coarse 1-bit sign signature in 384-dim needs a large
  exact-rerank pool to preserve recall@10 ≥ 0.95), and ruflo's large win came
  from replacing a *linear scan* — AQE's main search is already native HNSW
  (sublinear), and the linear-scan spots that exist are numerically sensitive
  (no zero-regression insertion point). Kept as a documented utility / future
  memory lever, not a production change.

- **(c) Auto-restructuring the 93 QE skills into multiple lean subset bundles**
  (ruflo marketplace pattern). AQE already ships `marketplace.json` + a lean
  auto-discovery `agentic-qe-fleet` plugin; only the missing machine-checkable
  `smoke.sh` contract was added. Splitting into `aqe-security`/`aqe-browser`/…
  subset bundles is deferred — it restructures shipped npm artifacts and needs a
  distribution decision.

---

## Consequences

- **Reversible.** Every behavioural change is gated by an exported constant; set
  `DOMAIN_DENOM_CAP` high, `EWC_DECAY_PROTECTION`/`EWC_STALE_PROTECTION_BONUS` to
  0, or the contradiction thresholds out of range to restore prior behaviour.
- **Regression risk is low but non-zero and live:** #2 shifts every routing
  decision's confidence telemetry and re-weights domain relevance vs the
  performance term in *ranking*; #7 changes what consolidation removes from
  recall. Both are covered by unit tests and tunables; neither writes to the
  real DB at commit time.
- **Verification discipline:** all changes were verified with real commands
  (live routes, real MCP server boot, in-memory DBs matching production schema)
  and independently re-audited by `qe-devils-advocate`. No real `.agentic-qe`
  store was mutated during development.

## Open follow-ups (tracked in #510)

- Routing-confidence Q-maturity ceiling (the structural part #2 does not fix).
- RVF↔SQLite pattern drift (qe_patterns rows without an RVF vector → invisible to
  semantic recall) — a reconciliation/backfill is needed.
- Embedding latency (~2.3s/item via ONNX) makes synchronous embed paths slow.
- Multiple lean subset plugin bundles.
