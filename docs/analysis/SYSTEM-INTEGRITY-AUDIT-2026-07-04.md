# AQE System Integrity Audit — Patterns, Learning, Memory & ADR Compliance

**Date:** 2026-07-04
**Scope:** Patterns, Code Intelligence, Self-Learning, MinCut, Goal Planning (GOAP), Dream Cycles, SONA, Witness Chain, and the full `memory.db` data plane (46 tables).
**Method:** 9 parallel read-only audit agents. Every claim traced to `file:line`; every table queried live via `sqlite3 "file:...memory.db?mode=ro"`. No writes were made to any database.
**Question asked:** *Do these systems work as their ADRs define, and is data actually written/read/used when QE agents, skills, hooks, CLI, or MCP run — as a user would expect?*

---

## 1. Executive Summary

**The system records its heartbeat, not its outcomes.** Capture-side writers are alive and fresh to today (experiences, trajectories, queen metrics, dream cycles), but nearly every *learn-from-outcome* loop — the part that makes this a self-learning system — is stalled, degenerate, or was never wired:

| Subsystem | Verdict | One-line reality |
|---|---|---|
| Patterns | 🟡 PARTIAL | Storage/search work; usage feedback dead since 2026-05-14; ADR-110 nulls & co-execution never fire |
| Code Intelligence | 🟡 PARTIAL | HNSW search real (MCP only); persisted code knowledge graph does not exist; hypergraph empty |
| Self-Learning | 🔴 BROKEN loop | 20,747 experiences captured (96.5% noise), <4% reused; RL Q-loop has 1 real row; confidence structurally frozen at 40% |
| MinCut | 🔴 DEGENERATE | 701 snapshots of the same static 14-node graph, mincut always 0.0; self-healing & ADR-068 routing gate are dead code |
| GOAP | 🔴 BROKEN e2e | Real A* planner, but MCP plan→execute chain cannot succeed; executor is 100% mock; canonical step table dead |
| Dream Cycles | 🔴 WRITE-ONLY | 11,918 insights, 5.5% distinct, one insight type; live promotion path is a no-op stub; 0 dream patterns exist |
| SONA | 🟡 PARTIAL | 1,067 real patterns (stale 7 wks); EWC++ Fisher pipeline deadlocked at cold-start (0 rows, by construction) |
| Witness Chain | 🟡 INTACT/INERT | All 13,460 rows cryptographically verify clean — but signing unwired, verification never enforced, stale since 2026-05-14 |
| memory.db unification | 🟡 PARTIAL | One-DB rule holds in code; MCP-CLI parity structural; but 6+ orphan DB clones on disk and result tables silent for months |

### The five cross-cutting failures

1. **The 2026-05-14 freeze.** `qe_pattern_usage`, `sona_patterns`, and *both* witness chains all stopped writing on exactly 2026-05-14. `routing_outcomes` froze 2026-06-02. `execution_results` froze 2026-02-26. Meanwhile `captured_experiences` and `qe_trajectories` write to this very hour. Several distinct write paths died on identifiable dates while the DB stayed healthy — these are code-path regressions, not storage problems.
2. **Open loops everywhere.** Every subsystem captures; almost none feeds back. Dream insights never become patterns (stub `applyInsight`). Q-values never accumulate (1 real row vs 2,165 routing outcomes). Pattern usage is never recorded by the paths that now create patterns. Fisher matrices never consolidate. Mincut never gates routing. The "self-learning" arrows on the architecture diagram mostly point into `/dev/null`.
3. **"Status: Implemented" ADRs that aren't.** ADR-047 (self-organizing mincut), ADR-068 (mincut-gated routing), ADR-069 (RVF COW dream branching), ADR-110 (kept-nulls), ADR-036 (result persistence, silent for months) all claim implemented status while their runtime behavior is absent or contradicts the ADR's own accepted design.
4. **Degenerate data masquerading as activity.** 200 identical mincut snapshots; 94% duplicate dream insights with constant scores; 96.5% of experiences are fixed-quality `cli-hook` noise; 45% of GOAP actions are test fixtures. Row counts look healthy; information content is near zero.
5. **Parallel implementations that drifted.** `AQELearningEngine` vs `LearningService` (kills ADR-110), `goap_execution_steps` vs `executed_steps` (dead canonical schema), `embeddings` vs `vectors`, three disjoint witness subsystems, JSON `[INTELLIGENCE]` graph vs SQLite concept graph. Each split leaves one half dead.

---

## 2. memory.db Table Inventory (46 tables)

Verdicts: ✅ working · 🟡 working-but-stale/degraded · ⚠️ degenerate data · ⛔ empty/dead in practice

| Table | Rows | Verdict | Notes |
|---|---|---|---|
| qe_patterns | 154 | ✅ | Fresh to 2026-07-01; 13 ghost rows lack embeddings |
| qe_pattern_embeddings | 143 | ✅ | 13 patterns unindexed |
| qe_patterns_fts (+shadow) | pop. | ✅ | Trigger-maintained, BM25 search live |
| qe_pattern_usage | 306 | 🟡 | **Frozen 2026-05-14**; 273/306 orphaned; 138/154 patterns at usage 0 |
| pattern_versions | 8 | 🟡 | Feb fixtures only |
| pattern_deltas | 518 | ✅ | Genesis deltas (flag-gated) |
| pattern_evolution_events | 70 | 🟡 | Last 2026-06-08 |
| pattern_relationships | 31 | 🟡 | All 2026-02-26 |
| qe_pattern_nulls | 0 | ⛔ | ADR-110 writer structurally unreached (engine split) |
| qe_agent_co_execution | 0 | ⛔ | Needs ≥2-agent Queen executions that never ran |
| captured_experiences | 20,747 | ⚠️ | Fresh to today, but 96.5% fixed-quality hook noise |
| experience_applications | 171 | 🟡 | <4% reuse; noise correctly never reused |
| experience_consolidation_log | 719 | ✅ | Only while worker daemon is up (none running now) |
| learning_daily_snapshots | 0 | ⛔ | Writer exists only behind manual `--save-snapshot` CLI flag |
| qe_trajectories / trajectory_steps | 503/2,030 | 🟡 | Fresh; but 367/512 never judged (judge is MCP-only) |
| rl_q_values | 9 | ⛔ | 8 test seeds + **1** real row (2026-06-12). Q-loop has no throughput |
| routing_outcomes | 2,165 | 🟡 | **Frozen 2026-06-02** — route-persist regression |
| test_outcomes | 22 | 🟡 | Frozen 2026-05-14 (ADR-036 dormant) |
| coverage_sessions | 7 | 🟡 | Single burst 2026-04-30 |
| execution_results / executed_steps | 530/705 | ⚠️ | 100% mock GOAP executor output; frozen 2026-02-26 |
| goap_goals / goap_plans / goap_actions | 53/101/2,325 | ⚠️ | Stale (Feb); 45% fixture pollution; 101/101 plans stuck 'pending' |
| goap_plan_signatures | 294 | 🟡 | Reuse = exact hash only; 3/294 ever reused |
| goap_execution_steps | 0 | ⛔ | Dead canonical schema; executor invented parallel tables |
| dream_cycles | 3,163 | 🟡 | Runs on kernel scheduler; 24.7% failure rate; 2 stuck 'running' |
| dream_insights | 11,918 | ⚠️ | 5.5% distinct; single insight type; write-only in practice |
| concept_nodes / concept_edges | 4,991/70,206 | 🟡 | Dream associative graph (NOT code KG); embeddings 100% NULL |
| hypergraph_nodes / hypergraph_edges | 0 | ⛔ | Fully implemented engine; population pass never runs |
| sona_patterns | 1,067 | 🟡 | Real vectors; **frozen 2026-05-14**; last_used_at NULL on all rows |
| sona_fisher_matrices | 0 | ⛔ | EWC++ cold-start deadlock (see §8) |
| witness_chain | 13,460 | 🟡 | Cryptographically VALID end-to-end; unsigned; **frozen 2026-05-14** |
| witness_chain_receipts | 29 | 🟡 | Separate governance chain; link-valid; frozen 2026-05-14 |
| witness_chain_archive | 0 | ⛔ | archiveEntries() has zero callers (and a latent link-break bug) |
| mincut_snapshots / mincut_history | 200/501 | ⚠️ | ALL rows identical; static 14-node graph; mincut always 0.0 |
| mincut_observations/alerts/weak_vertices/healing_actions | 0 | ⛔ | Writers on never-instantiated Strange-Loop stack / never-started monitor |
| vectors | 2,760 | ✅ | The real HNSW store (384-dim, hnswlib-node per ADR-090) |
| embeddings | 0 | ⛔ | Legacy path superseded by `vectors` (benign) |
| kv_store | 5,018 | ⚠️ | 91% is `queen:metrics:<ts>` 60s telemetry, no TTL/rollup, unbounded |
| schema_version | v10 | ✅ | Matches code SCHEMA_VERSION; migration ladder consistent |

---

## 3. Patterns

**Verdict: PARTIAL — storage and retrieval work; the feedback half is dead.**

Working as designed:
- Write path: `src/learning/sqlite-persistence.ts:423` (primary), consolidation worker (`src/workers/workers/learning-consolidation.ts:669`), dream hook (`src/cli/commands/hooks-handlers/hooks-dream-learning.ts:921`). 154 rows, real content, current.
- Retrieval: FTS5/BM25 (`sqlite-persistence.ts:610`) and vector/HNSW (`pattern-store.ts:1070`) both live. Patterns genuinely surface to users via test generation (`test-generator.ts:1122`), context sources, and task hooks (`task-hooks.ts:183` → token-savings estimates).
- RVF split per ADR-066 is clean: metadata in SQLite, vectors in `patterns.rvf`. No duplication.

Broken / not wired:
- **Usage tracking silently died 2026-05-14.** The consolidation and dream paths that now create all patterns never call `recordUsage()` (`pattern-usage-recorder.ts:86`); only the unexercised experience-capture reinforcement path does. Result: 138/154 patterns show zero usage, 273/306 usage rows are orphans (no FK cascade), and the "73% pattern success rate" banner reads a frozen 7-week-old slice.
- **ADR-110 kept-nulls is dead code in practice.** `recordNull` (`pattern-null-store.ts:53`) fires only from `AQELearningEngine.startCapture` — but production capture goes through the *other* service, `LearningService.recordExperience` (`domains/learning-optimization/plugin.ts:658`), which never populates `appliedPatterns` nor wires the recorder. 0 rows since the table shipped (2026-06-11).
- **Co-execution learning has no producer** — needs ≥2-agent Queen executions (`queen-task-management.ts:478`) that never happen.
- ReasoningBank evolution/versioning/relationships stopped ~2026-06-08 (relationships frozen at 2026-02-26).
- Provenance loss: many patterns named `unknown-general-*` with "Agent: unknown" — consolidation strips agent attribution.

---

## 4. Code Intelligence

**Verdict: PARTIAL — semantic search is real; the persisted code knowledge graph is fiction.**

Key discovery: what looks like one "knowledge graph" is **three unrelated planes**:
1. `concept_nodes`/`concept_edges` (4,991/70,206) belong to the **Dream subsystem** — QE reasoning-pattern associations, *not* code entities. All 4,991 node embeddings are NULL despite 65k "similarity" edges (embeddings computed then discarded — `src/learning/dream/concept-graph.ts:114,163`).
2. The `[INTELLIGENCE] Loaded 93 patterns, 1246 edges` session banner reads **JSON files** (`.claude/helpers/intelligence.cjs` → `.claude-flow/data/*.json`), never memory.db. It is not a memory.db health signal.
3. The actual code-intelligence domain (`src/domains/code-intelligence/services/knowledge-graph.ts`) builds in-memory Maps from files and **persists zero rows** — its `code-intelligence:kg:*` kv_store keys: 0. Its own skill doc warns "18% success rate — prefer direct grep/glob" (`.claude/skills/qe-code-intelligence/SKILL.md:224`).

Working: HNSW semantic search over `vectors` (2,760 × 384-dim) via MCP `memory_search` (`src/mcp/handlers/memory-handlers.ts:240-248`), hnswlib-node per ADR-090/071 — conformant.

Broken / not wired:
- **Hypergraph (ADR-080 dependency intelligence): fully implemented engine (`hypergraph-engine.ts`), enabled by default, tables forever empty** — the population/index pass never runs, and database-free platform installs route it to `:memory:` anyway.
- **MCP-CLI divergence:** CLI `memory search` has no vector path (keyword/LIKE only) while MCP does real HNSW — violates the project's own MCP-CLI parity rule.

---

## 5. Self-Learning System

**Verdict: BROKEN as a loop — capture is alive; learning-from-outcomes is dead.**

The asymmetry in one view: `captured_experiences` fresh to *today 13:06*; `routing_outcomes` frozen **2026-06-02**; the single real Q-value frozen **2026-06-12**; `qe_pattern_usage` frozen **2026-05-14**.

- **Capture (WORKING, polluted):** 20,747 rows via Claude Code PostToolUse hooks → `experience-capture.ts`. But 96.5% are `cli-hook` rows with `task='unknown:hook-<ts>'` and hardcoded quality 0.3/0.675 — noise that drowns the ~700 real qe-agent rows in every aggregate.
- **Consolidation (WORKING, daemon-gated):** 30-min worker (`10-workers.ts:77`) — but no daemon is running now; consolidation silently stopped July 1.
- **RL Q-loop (ADR-096 — BROKEN, no throughput):** wiring is complete and the Bellman update is correct with ADR-061 asymmetric rates (`hooks-dream-learning.ts:713`), but three compounding causes yield ~zero training: post-task only fires on Task/Agent tool use (rare); agent identity collapses to `'unknown'` because PostToolUse doesn't expose agent_id (`task-hooks.ts:440`); and the UPSERT collapses everything into a handful of cells. rl_q_values = 8 test seeds + 1 real row.
- **Routing confidence structurally frozen at 40%:** confidence = Q-blended-over-static (`qe-reasoning-bank.ts:596`); with an empty Q-table the blend contributes nothing, so 40% is the static ceiling and *cannot* rise until the Q-loop gets throughput.
- **Route-persist regression:** `routing_outcomes` INSERTs (`routing-hooks.ts:168`) silently stopped 2026-06-02 (best-effort catch at `:203` swallows the failure) while the same DB accepts other writes. Highest-value discrete repro in this audit.
- **learning_daily_snapshots (NOT-WIRED):** writer exists only behind manual `aqe learning --save-snapshot` (`learning.ts:531`); no worker/cron ever calls it → history/trend views permanently blank.
- **Trajectory judging:** MCP-only (`trajectory-judge.ts`); 367/512 trajectories never judged.

---

## 6. MinCut

**Verdict: DEGENERATE write-only heartbeat; the intelligent half is dead code.**

- All 200 snapshots and 501 history rows are **identical**: the static, hardcoded 14-domain topology with 11 weight-1.5 edges (`queen-integration.ts:199-307`), disconnected into 10 components ⇒ min-cut trivially **0.0** on every row, once per minute. Agent vertices are only added on `agent:spawned` events that this deployment never emits.
- **ADR-047 self-organization is unreachable:** weak-vertex/alert writers live in a health-monitor loop nothing ever starts (`mincut-health-monitor.ts:67`); healing/observation writers live on the Strange-Loop/Dream-integration stack nothing ever instantiates (`strange-loop.ts:541`, `dream-integration.ts:1068`). Alerts are additionally suppressed by `isEmptyTopology()` whenever there are no agent vertices — i.e., always.
- **ADR-068 mincut-gated model routing does not exist in the router.** Zero hits for the ADR's formula (`effectiveComplexity`, amplification) anywhere in `src/routing/`. The only mincut→routing touchpoint is the ADR-095 exploration dampener (`routing-topology-gate.ts`), a different mechanism — and it carries a latent hazard: with 14 static vertices and mincut 0, if the monitor singleton is ever initialized the gate would report critical *permanently* and clamp exploration to 0.2× based on degenerate topology.
- MCP mincut tools operate on a fresh in-memory graph and never read the 701 persisted rows; `mincut-test-optimizer` is implemented and unit-tested but has no CLI/MCP/agent caller.
- Both ADR-047 and ADR-068 are marked **"Status: Implemented."** They are not.

---

## 7. Goal Planning (GOAP)

**Verdict: real algorithm, broken product. Not integrated end-to-end.**

- **A\* core is genuine and competent** (`goap-planner.ts` — MinHeap, admissible heuristic, closed-set dedup, cost adjustment). This is not a stub.
- **The MCP plan→execute chain cannot succeed:** `goap_plan` computes a plan but never persists it (`savePlan` at `goap-planner.ts:999` has **zero production callers**); `goap_execute` then does `SELECT ... FROM goap_plans WHERE id=?` → null → *"Plan not found"*. DB proof: 0 of 705 executed steps reference any plan.
- **Execution is 100% fabricated:** `goap-execute.ts` unconditionally uses `createMockExecutor(successRate: 0.95)`; the real `ClaudeFlowSpawner` is never wired. Every `agent_id` is `mock-agent-*`. `detectCurrentState` returns a hardcoded default world state, so plans never reflect live coverage/test/security metrics.
- **Dead canonical schema:** `goap_execution_steps` (0 rows) has no writers/readers; the executor invented a parallel `execution_results`/`executed_steps` pair. Plan lifecycle is dead too: 101/101 plans stuck `'pending'`.
- **Data pollution:** 1,051/2,325 action rows (45%) are test fixtures ("Small Action N") because tests ran against the production DB; real library is 38 actions duplicated up to 226×.
- **Plan reuse:** exact goal-hash match only; the vector-similarity path is dead code; 3/294 signatures ever reused. All data stale since 2026-02-26.
- The ruflo `goal-planner` plugin is a **separate engine with separate storage** — it never touches AQE's `goap_*` tables. AQE's goal-planner agent definitions have no binding to `src/planning`.
- The prior `BRUTAL-HONESTY-GOAP-REVIEW.md` ("all gaps resolved") reviewed a *different subsystem* (RuVector backbone) — every gap above remains open, and its own lesson ("tests passing ≠ features working") is exactly what happened at the MCP boundary.

---

## 8. Dream Cycles

**Verdict: runs prolifically, produces near-zero value, and feeds back nothing.**

- **Triggering (WORKING, ADR-094 conformant):** kernel-side `DreamScheduler` (`kernel.ts:396-431`, on by default), plus MCP tool and CLI. 3,163 cycles over 4.5 months.
- **Reliability (POOR):** 24.7% failed (600 failed + 183 corruption + 18 abandoned), 2 cycles stuck `running` since June. June's 1,295-cycle spike aligns with the WAL-corruption incident.
- **Insight quality (BROKEN):** 11,918 insights are 5.5% distinct. Only **one** of four insight detectors ever fires (`novel_association`, 100%); pattern_merge/optimization/gap_detection are dead (`insight-generator.ts:289,432,521`). Scores are near-constant (strength always 95%, novelty always 0.75) — spreading-activation hub noise, not discovery.
- **Flow-back (BROKEN — the headline):** the executing `applyInsight` path is a **no-op stub** that mints a fake `dream-pattern-<uuid>` and never inserts into qe_patterns (`dream-engine.ts:661-701`). The hook "apply" just increments a counter on the 3 newest rows. The only real promotion is a *manual* MCP `apply` per insightId (its own comment admits the fake-ID bug, `dream.ts:412`). Ground truth: **0 dream-derived patterns exist**; 11,024 insights sit actionable-and-unapplied.
- **ADR-069 COW branching (BROKEN vs spec):** implemented as SQLite SAVEPOINTs — the exact Option 3 the ADR rejected — and the `no such savepoint` errors it predicted account for a large share of the 600 failures. The 18 `.rvf` branch files are 162-byte stubs from May 14.

---

## 9. SONA

**Verdict: PARTIAL — real data, inert inference, and a cleanly-diagnosed EWC++ deadlock.**

- Runtime is **pure in-process TypeScript** (native NAPI unavailable on ARM64); SQLite is authoritative; `brain.rvf`/`aqe.rvf` are one-way manual export snapshots (`aqe brain export`), not live sync.
- `sona_patterns` (1,067): two writer paths — engine path with real Float32 embeddings (752 rows) and a raw-SQL middleware path without embeddings (315 rows). Genuine data, but **frozen since 2026-05-14**, and `last_used_at` is NULL on **all** rows — `adaptPattern` is wired into 6 domain coordinators but essentially never lands a persisted match. Inference is inert.
- **`sona_fisher_matrices`=0 is a cold-start deadlock, not a missing feature:** consolidation fires only after 100 requests *per engine instance* (`sona-three-loop.ts:829-834`); coordinators live one CLI/MCP invocation (~1 request); the only cross-process carrier of the request count is a persisted Fisher row — which can never be written because consolidation never fires. Circular. No daemon/timer breaks the loop. Fix surface is small: persist requestCount independently, lower/decouple the threshold, or drive `backgroundConsolidate()` from a worker.
- Loop1 (instant adapt) runs in-memory and is discarded at process exit because Loop2 never persists. The `sona-learning-optimizer` agent is project-internal and invoked by nothing.

---

## 10. Witness Chain

**Verdict: cryptographically INTACT, operationally INERT.**

- **Good news first — a full-chain verification of all 13,460 rows passed:** every `action_hash` recomputes, every `prev_hash` links, genesis is correct, IDs are contiguous, with one clean SHA-256→SHAKE-256 algorithm transition at id 12858 (matches ADR-070's history). AQE does **not** have the metaharness "verify regressed to no-op" bug — `verify()` does real work.
- But every tamper-evidence *guarantee* is dormant:
  - **Ed25519 signing never wired:** 0/13,460 rows signed. `WitnessKeyManager` exists but no production construction site passes it (`witness-chain.ts:177,322`). ADR-070's attribution guarantee is unmet (the ADR itself admits this).
  - **Verification is never enforced:** no CI workflow, package script, or publish gate runs any chain verification. Tamper detection is entirely latent.
  - **`aqe audit verify` checks the wrong chain:** it verifies only the 29-row governance receipts chain, not the 13,460-row mutation chain an operator would assume.
  - **Three disjoint witness subsystems** (audit chain, governance receipts, ADR-116 proof gate in `__proofgate__` kv namespace) share no chain.
  - **ADR-116 proof gate:** implemented and wired into `kvSet/kvDelete`, but off by default, fail-soft, and referenced by no CI — not enforced in practice.
  - **Archival:** `archiveEntries()` has zero callers (hence archive=0) and carries a latent bug — its DELETE would break link recomputation if ever invoked.
  - **Fire-and-forget appends:** witness writes are `.then().catch(warn)` (`qe-reasoning-bank.ts:353,453`) — failures silently drop records.
- **Both chains stale since 2026-05-14** despite `useWitnessChain` defaulting true — witnessing stopped with the same freeze that hit pattern usage and SONA.

---

## 11. memory.db Unification & Access Paths

**Verdict: PARTIAL — architecture holds; hygiene and result persistence don't.**

- **One-DB rule (ADR-038): holds in shipping code.** Every sqlite open targets memory.db/`:memory:`/readonly copies. `.swarm/` and `.hive-mind/` DBs belong to the separate Claude Flow platform and are not written by AQE src. Two files bypass the mandated `safe-db.ts` wrapper (`cli/commands/audit.ts:93`, `embedder-identity-store.ts:69`) — drift, not violation.
- **REAL GAP — CWD pollution:** 6+ orphan full-schema `.agentic-qe/memory.db` clones exist under `src/cli/commands/hooks-handlers/`, `docs/implementation/adrs/`, `docs/metaharness/…`, `docs/qe-reports/…`, `.test-tmp/…`, created by the CWD-relative root resolver (`pattern-store.ts:11`, Issue #516). **These absorb writes that never reach the canonical DB** — a plausible contributor to the silent result tables.
- **MCP-CLI parity: structurally TRUE** for memory — the CLI imports the MCP handler functions directly (`cli/commands/memory.ts:61`), so they cannot diverge. (Exceptions found elsewhere: CLI search lacks the vector path §4; GOAP's MCP chain broken §7.)
- **ADR-036 result persistence: dormant.** Writers exist and are wired (`handler-factory.ts:919`, `command-hooks.ts:65,109`), yet `execution_results` silent 4.3 months, `test_outcomes` 7 weeks, `coverage_sessions` one afternoon in April. Contrast: `queen:metrics` kv writes every 60s to this minute.
- **ADR-072 (RVF primary): status Proposed, correctly not adopted** — live state is the ADR-065 hybrid, SQLite authoritative, dual-write scoped to patterns only, no back-sync. `brain.rvf` 5 weeks stale while `aqe.rvf` is current confirms per-path updates.
- **kv_store as dumping ground:** 91% (4,564/5,018) is `queen:metrics:<epoch>` 60-second telemetry with no TTL (the `expires_at` column sits unused) — ~1,440 rows/day unbounded in a generic KV table.
- Schema v10 matches code; the migration ladder (`unified-memory.ts:508-579`) accounts for all 46 tables; no dead *schema* — the dead things are write paths.
- Stale artifact: `scripts/sync-claude-flow.cjs:10` targets a nonexistent `v3/.agentic-qe/memory.db` path.

---

## 12. Prioritized Recommendations

### P0 — Regressions to reproduce and fix (discrete, high-value)
1. **The 2026-05-14 write freeze** — bisect what change killed `qe_pattern_usage`, `sona_patterns`, and both witness chains on the same day. One root cause likely restores four systems.
2. **Route-persist regression (2026-06-02)** — run the UserPromptSubmit route hook with a real stdin event and watch `routing-hooks.ts:168` INSERT vs the swallowed catch at `:203`.
3. **ADR-036 result persistence dormant** — trace one real MCP test-execution through `handler-factory.ts:919`; check whether results are landing in the orphan CWD DBs instead.
4. **CWD pollution (Issue #516 family)** — make the `.agentic-qe/` root resolver anchor to the project root; sweep and merge/delete the 6+ orphan clones (with row-count-verified backup first, per data-protection policy).

### P1 — Close the loops (the "self-learning" promise)
5. **Dream flow-back:** replace the `applyInsight` stub with the real promotion the MCP `apply` action already implements; fix the three dead insight detectors or stop generating 94%-duplicate associations. Clear the 2 stuck cycles.
6. **Q-loop throughput (ADR-096):** capture agent identity (SubagentStop or session correlation) instead of collapsing to `'unknown'`; widen training triggers beyond Task/Agent tool-use. Routing confidence cannot move until this runs.
7. **Pattern usage feedback:** call `recordUsage` from the consolidation/dream creation paths, or from retrieval sites; add FK/cascade cleanup for the 273 orphaned usage rows and 13 ghost patterns.
8. **SONA EWC++ deadlock:** persist `requestCount` independently of Fisher rows or drive `backgroundConsolidate()` from the 30-min worker.
9. **ADR-110 kept-nulls:** wire the null recorder into `LearningService.recordExperience` (the path that actually runs) and populate `appliedPatterns` there.

### P2 — Honesty, hygiene, enforcement
10. **Re-status the ADRs:** ADR-047, ADR-068, ADR-069 do not match runtime reality and should be downgraded from "Implemented" or the features finished/removed. Update ADR-036's status note with the dormancy finding.
11. **Enforce witness verification:** add a CI/publish gate that runs full-chain verify on the 13,460-row audit chain (not just the 29 receipts); wire the key manager for signing; fix the archival link-break bug before anyone calls it.
12. **GOAP:** either persist plans from `goap_plan` so `goap_execute` can find them and wire the real spawner — or mark the tools experimental. Purge the 45% fixture pollution (tests must not run against the production DB). Drop dead `goap_execution_steps` schema or migrate the executor onto it.
13. **Noise control:** stop minting fixed-quality experiences on every Bash/Edit (or tag and filter them); add TTL/rollup for `queen:metrics` kv telemetry.
14. **Mincut:** either emit `agent:spawned` events so the graph reflects reality, or stop the 1/min snapshot heartbeat of a constant graph; guard the ADR-095 exploration gate against the degenerate-topology false-critical hazard.
15. **CLI-MCP search parity:** add the vector path to CLI `memory search`.
16. **Daemon-gated learning:** consolidation and (future) snapshots should not silently stop when the daemon is down — surface daemon-down in `aqe health`, and schedule `saveSnapshot` from the worker instead of a manual CLI flag.

---

## Appendix: Audit provenance

Nine read-only audit agents (patterns, code-intelligence, self-learning, mincut, GOAP, dream-cycles, SONA, witness-chain, memory-unification) ran in parallel on 2026-07-04, each tracing ADR → code → live DB. The witness-chain agent replicated `verify()` in full over all 13,460 rows (script preserved in session scratchpad). All database access used `?mode=ro`; no writes were performed against any `.db` file.
