# Six Thinking Hats Analysis: AQE Implementation & OpenClaw Improvement Strategy

**Date:** 2026-03-09
**Subject:** Current AQE v3.7.14 implementation assessed against 18 proposed improvements from OpenClaw deep research
**Method:** Edward de Bono's Six Thinking Hats — parallel thinking for comprehensive analysis

---

## AQE Baseline Snapshot

| Metric | Value |
|--------|-------|
| Version | 3.7.14 |
| Source files | 1,088 (.ts/.js/.mjs) |
| Source LOC | 514,991 |
| Test files | 649 |
| Test LOC | 335,223 |
| MCP tools | 42 |
| QE agents | 60 (qe-*.md) |
| QE skills | 96 |
| Bounded contexts | 13 (DDD) |
| Learned patterns | 15,634 in memory.db |
| Captured experiences | 3,695 |
| Trajectories | 335 |
| DB size | 56 MB (43 tables) |
| RL algorithms | 9 implemented |
| Hook events | 16 |
| Security scanners | SAST + DAST + deps + secrets |
| Coverage approach | O(log n) sublinear with ML gap detection |

---

## White Hat — Facts & Data

*What do we KNOW about the current state and the proposed changes?*

### Current Learning System Facts

| Component | Implementation | Key Thresholds |
|-----------|---------------|----------------|
| Pattern promotion | `shouldPromotePattern()` in qe-patterns.ts | 3 successful uses, 70% success rate, 60% confidence, coherence < 0.4 |
| Pattern lifecycle | `PatternLifecycleConfig` in pattern-lifecycle.ts | **2** min occurrences (INCONSISTENT with qe-patterns' 3) |
| Confidence decay | Daily decay via `applyConfidenceDecay()` | 1% per day, minimum 30% to stay active, max age 90 days |
| Experience capture | `ExperienceConfig` in experience-capture.ts | Min quality 0.7 for extraction, similarity 0.85, max 1,000/domain |
| Search | HNSW vector index (384-dim, all-MiniLM-L6-v2) | Vector-only — NO FTS5, NO hybrid search |
| Routing feedback | EMA calibration + auto-escalation | 10,000 max in-memory, 20,000 DB retention |
| Test generation | Multi-candidate via DecisionTransformer | Coherence gate optional (0.4 threshold) |
| Edge case injection | Regex keyword extraction + pattern search | Top 3 patterns, min confidence 0.5 |
| Hooks | 16 events covering test/coverage/routing/quality/learning | No pre-compaction hook, no deprecation hook |
| SQLite schema | 5 core tables (patterns, embeddings, usage, trajectories, reuse) | No FTS5 virtual table |

### Proposed Improvements (from OpenClaw Research v2)

| # | Improvement | Effort | Impact | AQE Component Affected |
|---|------------|--------|--------|----------------------|
| 1 | Hybrid search (70/30 vector/FTS5) | Low | High | sqlite-persistence.ts, qe-reasoning-bank.ts |
| 2 | Binary reward assignment (+1/-1/0) | Low | High | experience-capture.ts, pattern-lifecycle.ts |
| 3 | At-least-one learning guarantee | Low | High | experience-capture.ts |
| 4 | Temporal decay on search results | Low | High | qe-reasoning-bank.ts |
| 5 | Temporal window on promotion (30 days) | Low | Medium | qe-patterns.ts |
| 6 | Auto-promotion alignment (3+ uses, 2+ projects) | Low | Medium | qe-patterns.ts, pattern-lifecycle.ts |
| 7 | OPD remediation hints | Medium | High | edge-case-injector.ts, experience-capture.ts |
| 8 | Pre-compaction flush hook | Medium | High | qe-hooks.ts |
| 9 | YAML deterministic QE pipelines | Medium | High | NEW: pipeline engine |
| 10 | Token-free heartbeat scheduling | Medium | Medium | NEW: scheduler |
| 11 | GRPO group-relative advantages | Medium | High | routing-feedback.ts, coordinator.ts |
| 12 | Per-agent tool scoping | Medium | Medium | MCP server, agent config |
| 13 | Proof-of-Quality command | Medium | Medium | NEW: CLI command |
| 14 | Daily log tier (Markdown) | Low | Medium | experience-capture.ts |
| 15 | Session reuse for repeated operations | Medium | Medium | fleet management |
| 16 | Task ledger with dependency tracking | Medium | Medium | task orchestration |
| 17 | Adversarial test-code co-training (UTRL) | High | High | rl-suite, test-generation |
| 18 | ClawWork economic model for routing | High | Medium | routing-feedback.ts |

### Data Gaps (What We Don't Know)

- Actual false positive rate of generated tests (not tracked)
- Flakiness rate of generated tests (not tracked)
- How many patterns are actively used vs. stale (decay may be cleaning dead patterns)
- Token cost per test generation session (partial tracking via ADR-042)
- Real-world mutation kill rate of generated tests (not measured)
- Only 40 pattern embeddings exist for 15,634 patterns (embedding coverage: 0.26%)

---

## Red Hat — Emotions & Intuition

*What do we FEEL about the current system and the proposed changes? No justification required.*

### Confidence

- **High confidence:** The DDD architecture with 13 bounded contexts is solid. The MCP tool surface (42 tools) is comprehensive.
- **High confidence:** The RL suite with 9 algorithms feels like real infrastructure, not a toy.
- **Confident:** The pattern lifecycle system (promotion/deprecation/quarantine) is more sophisticated than anything in OpenClaw.

### Anxiety

- **Anxious:** Only 40 embeddings for 15,634 patterns. The HNSW index is nearly empty — search quality must be poor for most patterns.
- **Anxious:** The promotion threshold inconsistency (2 vs 3) feels like a bug that's been there a while. What else is inconsistent?
- **Anxious:** No FTS5 means exact-match queries for error codes, function names, and specific patterns are failing silently. Users are getting zero results and don't know why.
- **Uneasy:** 9 RL algorithms implemented but binary reward assignment (the simplest, most impactful signal) is missing. The system has sophisticated plumbing but no water.

### Excitement

- **Excited:** Binary RL rewards (+1 catches bug, -1 flaky) could transform test quality learning with minimal code changes.
- **Excited:** Hybrid search (FTS5 + vector) is a straightforward SQLite addition that would immediately improve pattern discovery.
- **Excited:** The OpenClaw plugin integration could expose AQE to 247k+ users — orders of magnitude beyond current npm reach.

### Frustration

- **Frustrated:** The coherence gate is optional. If it's important enough to build (ADR-052), it should be on by default.
- **Frustrated:** Hooks are fire-and-forget with silent failures. When learning fails, nobody knows.

---

## Black Hat — Risks & Cautions

*What could go WRONG with the current system and the proposed changes?*

### Critical Risks in Current Implementation

| Risk | Severity | Evidence |
|------|----------|---------|
| **Promotion threshold inconsistency** | HIGH | `pattern-lifecycle.ts` uses `promotionMinOccurrences: 2` but `qe-patterns.ts` uses `successfulUses >= 3`. Patterns may promote too early or never promote depending on which code path executes. |
| **Near-empty embedding index** | HIGH | 40 embeddings for 15,634 patterns = 0.26% coverage. HNSW search returns effectively random results for 99.7% of patterns. |
| **No binary reward signal** | HIGH | Experience capture records quality scores (0-1) but never maps test execution outcomes to binary rewards. The RL infrastructure has no ground-truth signal to learn from. |
| **Silent search failures** | MEDIUM | Vector-only search returns nothing for exact keyword queries. Users searching for "NullPointerException" or "CORS" get zero results even if patterns exist. No fallback, no warning. |
| **No pre-compaction knowledge preservation** | MEDIUM | When context is compacted, in-flight pattern candidates are lost. OpenClaw solved this in 2025; AQE has no equivalent. |
| **Optional coherence gate** | MEDIUM | Contradictory patterns can be promoted to long-term storage when the gate is off. This degrades future recommendations silently. |

### Risks in Proposed Improvements

| Proposal | Risk | Mitigation |
|----------|------|-----------|
| **#1 Hybrid FTS5** | FTS5 index adds DB size and write latency. May slow bulk pattern inserts. | Benchmark insert overhead; FTS5 is lightweight (~10-15% overhead). Acceptable trade-off. |
| **#2 Binary rewards** | Requires mutation testing infrastructure to generate ground-truth. Without it, rewards are guesses. | Start with simple heuristics (pass/fail on known-good code) before adding mutation testing. |
| **#7 OPD hints** | Generating textual remediation requires an LLM call per failed test — token cost. | Gate behind quality threshold: only generate hints for patterns with reward < -0.5. |
| **#9 YAML pipelines** | New engine is a significant maintenance surface. Could become a framework-within-a-framework. | Keep it minimal (sequential + conditions + approval gates). No parallelism. Copy Lobster's 134-line sub-workflow design. |
| **#11 GRPO advantages** | Requires generating multiple test candidates per prompt — multiplies token cost by group size (typically 4-16x). | Start with group size 4. Only for high-value test generation tasks, not every call. |
| **#17 UTRL adversarial** | Highest complexity proposal. Requires co-training loop, mutation infrastructure, and evaluation harness. Long development cycle. | Defer until binary rewards (#2) and group advantages (#11) are proven. UTRL is Phase 3+ work. |

### What Could Kill the OpenClaw Integration

| Threat | Probability | Impact |
|--------|------------|--------|
| OpenClaw plugin API breaking changes (pre-1.0 SDK) | Medium | HIGH — requires rewrite |
| ClawHub security review rejection (exec access needed) | Low | MEDIUM — resubmit with justification |
| ClawHavoc fallout causes ClawHub to restrict new publishers | Low | LOW — AQE has legitimate security credentials |
| OpenClaw moves to foundation, governance slows plugin acceptance | Medium | LOW — MCP works without plugin approval |
| IronClaw/ZeroClaw fragment the ecosystem | High | LOW — MCP protocol is universal across all three |

---

## Yellow Hat — Benefits & Opportunities

*What's GOOD about the current system and the proposed changes?*

### Strengths of Current AQE

| Strength | Why It Matters |
|----------|---------------|
| **13 bounded contexts (DDD)** | Clean separation means improvements to learning don't break security scanning. Each proposed change affects 1-2 files, not the whole system. |
| **9 RL algorithms already implemented** | The plumbing exists. Binary rewards (#2) and GRPO (#11) are wiring, not architecture. Compare to OpenClaw which has zero RL infrastructure. |
| **42 MCP tools** | Full quality engineering surface area. OpenClaw has zero native QE tools. AQE fills a real gap. |
| **15,634 learned patterns** | Rich training data already exists. Binary reward retrocomputation on historical data is possible. |
| **3,695 captured experiences** | Experience replay infrastructure ready for RL training loops. |
| **Pattern lifecycle with quarantine/rehab** | More sophisticated than anything in OpenClaw or competitors. Quarantine prevents bad patterns from harming users while preserving them for future rehabilitation. |
| **Asymmetric learning (ADR-061)** | Learns more from failures than successes — correct behavior for test quality where false positives are costlier than false negatives. |
| **O(log n) sublinear coverage** | Unique differentiator. No other QE tool offers logarithmic-time coverage gap detection. |

### Highest-Value Improvements (ROI Analysis)

| # | Improvement | Implementation Cost | Expected Value | ROI |
|---|------------|-------------------|---------------|-----|
| 1 | Hybrid FTS5 search | ~50 LOC in sqlite-persistence.ts | Fixes silent search failures for 99.7% of patterns | **Extreme** |
| 2 | Binary rewards | ~100 LOC in experience-capture.ts | Enables outcome-based learning (currently heuristic-only) | **Extreme** |
| 3 | At-least-one guarantee | ~20 LOC in experience-capture.ts | Prevents zero-learning sessions | **Extreme** |
| 6 | Promotion alignment | ~10 LOC fix inconsistency | Eliminates a bug | **Extreme** |
| 4 | Temporal decay | ~30 LOC in search scoring | Fresh patterns surface first | **Very High** |
| 8 | Pre-compaction flush | ~80 LOC in qe-hooks.ts | Prevents knowledge loss in long sessions | **Very High** |
| 7 | OPD hints | ~200 LOC new module | Transforms "bad" to "bad because X, fix by Y" | **High** |

### OpenClaw Integration Opportunity

- **247k+ potential users** via ClawHub (vs. current npm-only distribution)
- **AQE fills a gap OpenClaw can't fill** — no native quality gates, no security scanning of skills, no test generation, no coverage analysis
- **ClawHub security differentiation** — 36.82% of skills have flaws; AQE can scan them
- **Enterprise positioning** — AQE adds compliance audit trails OpenClaw lacks (1.2/5 enterprise readiness)
- **Multi-runtime reach** — MCP protocol works on OpenClaw, IronClaw, AND ZeroClaw with zero code changes
- **Revenue potential** — ClawHub supports paid skills (70/30 split). Enterprise QE features could generate direct revenue.

---

## Green Hat — Creativity & Alternatives

*What ELSE could we try? What innovative approaches exist?*

### Creative Improvement Ideas

#### 1. Retroactive Reward Computation
Instead of waiting for new test execution data, retroactively compute binary rewards for the 3,695 existing experiences:
- Parse stored `quality_score` and `success` fields
- Map to binary: `quality >= 0.7 && success ? +1 : quality < 0.3 || !success ? -1 : 0`
- Instantly bootstrap the reward model with historical data
- **Effort:** ~50 LOC batch script. **Impact:** Immediate RL foundation.

#### 2. Embedding Backfill Campaign
Only 40/15,634 patterns have embeddings. Run a one-time backfill:
- Process in batches of 100 using all-MiniLM-L6-v2
- Store embeddings in `qe_pattern_embeddings` table
- Rebuild HNSW index
- **Effort:** ~30 LOC script + overnight compute. **Impact:** Fixes the 99.7% search blind spot.

#### 3. "Ghost Pattern" Detection
Patterns with zero embeddings are invisible to search (ghosts). Create a health check:
```sql
SELECT COUNT(*) as ghost_count FROM qe_patterns p
LEFT JOIN qe_pattern_embeddings e ON p.id = e.pattern_id
WHERE e.id IS NULL;
```
Surface ghost count in `aqe_health` MCP tool. Alert when > 10% are ghosts.

#### 4. Cascading Search Strategy
Instead of vector-only OR FTS5, implement cascading:
1. **Stage 1:** FTS5 exact match (fastest, <1ms)
2. **Stage 2:** If <3 results, vector similarity search (HNSW, ~5ms)
3. **Stage 3:** If <3 results, fuzzy FTS5 with stemming (~2ms)
4. **Merge:** Deduplicate and rank by combined score (70% vector + 30% FTS5)

This outperforms both pure-vector and simple hybrid approaches by adapting to query type.

#### 5. Test Quality Thermometer
A single aggregate metric visible in `aqe_health`:
```
Test Quality Index (TQI) = (
  bug_detection_rate * 0.35 +
  (1 - false_positive_rate) * 0.25 +
  branch_coverage * 0.20 +
  (1 - flakiness_rate) * 0.15 +
  pattern_reuse_rate * 0.05
)
```
Track TQI over time. Display as ASCII thermometer in CLI output.

#### 6. "Learning Heartbeat" Instead of Hooks
Replace fire-and-forget hooks with a 30-minute heartbeat (inspired by OpenClaw's HEARTBEAT.md):
- Every 30 minutes, scan for: patterns needing promotion, stale patterns, unflushed experiences
- Run as background service, zero LLM tokens
- Log actions to `memory/YYYY-MM-DD.md` daily log

#### 7. Skill-as-Skill: AQE Scanning AQE
Use AQE's own security scanning to audit its own ClawHub skill before publishing:
```bash
aqe security-scan --target ./clawhub-skill/ --format clawhub-submission
```
Dog-fooding as a trust signal for ClawHub reviewers.

#### 8. Pattern Genealogy
Track parent-child relationships between patterns:
- When OPD generates a remediation hint from a failed pattern, link them
- Visualize pattern evolution: `pattern-A (failed) → hint → pattern-B (successful)`
- Enable "show me the lineage" queries in memory_query

#### 9. Competitive Benchmark Mode
Create a benchmark that compares AQE's test generation against baseline (no patterns):
```bash
aqe benchmark --mode competitive --iterations 100
```
Output: "AQE-generated tests caught 47% more mutations than baseline (p < 0.01)"
Publishable proof-of-value for ClawHub listing.

#### 10. Zero-Token QE Pipeline
Combine Lobster-inspired YAML with DevClaw's token-free heartbeat:
```yaml
name: ci-quality-gate
trigger: git-push
steps:
  - id: lint
    command: npx eslint --format json
    # No LLM tokens — pure tool execution
  - id: coverage
    command: aqe coverage-gaps --json
  - id: gate
    condition: $coverage.json.score >= 0.8
    # Deterministic pass/fail — no LLM needed
  - id: report
    command: aqe quality-report --stdin
    stdin: $coverage.stdout
```
Every step is deterministic. LLM only invoked for test generation (the creative part).

---

## Blue Hat — Process & Action Plan

*What should we DO? In what order? Who owns what?*

### Priority Classification

Based on all hats, improvements cluster into four action tiers:

#### Tier 0: Bug Fixes (Do Immediately)

| # | Action | Why | LOC | Files |
|---|--------|-----|-----|-------|
| 6 | **Fix promotion threshold inconsistency** | `pattern-lifecycle.ts` says 2, `qe-patterns.ts` says 3. Pick one (recommend 3). | ~10 | pattern-lifecycle.ts |
| — | **Embedding backfill** | 99.7% of patterns invisible to search. Run batch embedding job. | ~30 | Script + qe-pattern-embeddings |
| — | **Ghost pattern health check** | Add to `aqe_health` tool so the blind spot is visible. | ~20 | health handler |

#### Tier 1: Quick Wins (This Sprint, <100 LOC each)

| # | Action | Impact | LOC | Files |
|---|--------|--------|-----|-------|
| 1 | **Add FTS5 virtual table + hybrid search** | Fixes silent search failures; enables exact-match queries | ~80 | sqlite-persistence.ts, qe-reasoning-bank.ts |
| 2 | **Binary reward assignment** | Outcome-based learning from test execution results | ~100 | experience-capture.ts |
| 3 | **At-least-one learning guarantee** | Warn/error when session produces zero experiences | ~20 | experience-capture.ts |
| 4 | **Temporal decay on search** | Recent patterns rank higher. `score *= exp(-0.693 * days / 30)` | ~30 | qe-reasoning-bank.ts search method |
| 5 | **Temporal window on promotion** | Require activity within last 30 days for promotion | ~15 | qe-patterns.ts shouldPromotePattern() |
| — | **Enable coherence gate by default** | Stop contradictory patterns from promoting silently | ~5 | coordinator.ts config default |

#### Tier 2: Medium Investments (Next 2 Sprints, 100-300 LOC each)

| # | Action | Impact | LOC | Files |
|---|--------|--------|-----|-------|
| 8 | **Pre-compaction flush hook** | Prevents knowledge loss in long sessions | ~80 | qe-hooks.ts |
| 7 | **OPD remediation hints** | "Bad because X, fix by Y" feedback loop | ~200 | New module + edge-case-injector.ts |
| 12 | **Per-agent tool scoping** | Security isolation between agent types | ~150 | MCP server config |
| 14 | **Daily log tier (Markdown)** | Human-readable audit trail + OpenClaw bridge | ~100 | experience-capture.ts |
| 13 | **Proof-of-Quality command** | `aqe quality prove` with hash verification | ~200 | New CLI command |

#### Tier 3: Strategic Investments (Next Quarter)

| # | Action | Impact | LOC | Dependencies |
|---|--------|--------|-----|-------------|
| 9 | **YAML deterministic QE pipelines** | Token-free quality gates | ~500 | Tier 1 complete |
| 10 | **Token-free heartbeat scheduling** | Background QE dispatch without LLM | ~300 | Tier 2 complete |
| 11 | **GRPO group-relative advantages** | Multi-candidate comparison scoring | ~400 | Binary rewards (#2) proven |
| 15 | **Session reuse** | 40-60% token savings | ~200 | Fleet management |
| — | **OpenClaw plugin + ClawHub publish** | 247k user reach | ~800 | Tiers 1-2 complete |
| 17 | **UTRL adversarial co-training** | Frontier test quality via RL | ~1000+ | GRPO (#11) proven |
| 18 | **Economic routing model** | Quality-weighted cost optimization | ~300 | Binary rewards (#2) + routing feedback |

### Execution Sequence

```
Week 1-2: Tier 0 (bug fixes) + Tier 1 (quick wins)
  ├─ Fix promotion inconsistency (10 LOC)
  ├─ Embedding backfill campaign (30 LOC script)
  ├─ Add FTS5 hybrid search (80 LOC)
  ├─ Binary reward assignment (100 LOC)
  ├─ At-least-one guarantee (20 LOC)
  ├─ Temporal decay (30 LOC)
  ├─ Temporal window (15 LOC)
  └─ Enable coherence gate default (5 LOC)
  Total: ~290 LOC

Week 3-6: Tier 2 (medium investments)
  ├─ Pre-compaction flush hook (80 LOC)
  ├─ OPD remediation hints (200 LOC)
  ├─ Per-agent tool scoping (150 LOC)
  ├─ Daily log tier (100 LOC)
  └─ Proof-of-Quality command (200 LOC)
  Total: ~730 LOC

Week 7-12: Tier 3 (strategic)
  ├─ YAML QE pipelines (500 LOC)
  ├─ Token-free heartbeat (300 LOC)
  ├─ GRPO advantages (400 LOC)
  ├─ OpenClaw plugin build (800 LOC)
  └─ ClawHub skill publish
  Total: ~2000 LOC
```

### Success Metrics

| Metric | Current | After Tier 0+1 | After Tier 2 | After Tier 3 |
|--------|---------|----------------|-------------|-------------|
| Pattern embedding coverage | 0.26% | 100% | 100% | 100% |
| Search result quality (exact match) | Poor (vector-only) | Good (hybrid) | Good | Good |
| Learning sessions with zero output | Unknown | 0 (guaranteed) | 0 | 0 |
| Promotion threshold consistency | Broken (2 vs 3) | Fixed (3) | Fixed | Fixed |
| Reward signal type | Heuristic (0-1) | Binary (+1/-1/0) | Binary + OPD hints | GRPO group-relative |
| Pre-compaction knowledge loss | 100% (no flush) | 100% | 0% (flush hook) | 0% |
| Distribution reach | npm only | npm | npm | npm + ClawHub (247k) |
| QE pipeline determinism | LLM-orchestrated | LLM-orchestrated | LLM-orchestrated | YAML deterministic |

### Key Decisions Needed

1. **Promotion threshold:** Standardize on 2 or 3? Recommend **3** (matches OpenClaw's self-improving-agent and is more conservative).
2. **Coherence gate default:** Turn on by default? Recommend **yes** — it was built for a reason.
3. **Hybrid search weights:** 70/30 (OpenClaw default) or custom? Recommend **70/30 as starting point**, tune later with A/B data.
4. **OpenClaw plugin vs. MCP-only:** Build full plugin (hooks + memory bridge) or MCP server only? Recommend **MCP-only first** (works immediately, no SDK dependency), then plugin for richer integration.
5. **GRPO group size:** How many test candidates per prompt? Recommend **4** (4x token cost is acceptable; 16x is not for most users).

---

## Critical Finding: Disconnected Persistence Architecture

### Root Cause Analysis: Why 99.7% of Patterns Have No Embeddings

The investigation revealed this is **not a backfill problem** — it's an **architectural disconnection** introduced during the Issue #258 refactor that removed kv_store duplication. The persistence and search layers were split but never properly reconnected.

#### The Two Disconnected Stores

| Operation | PatternStore (in-memory) | SQLitePatternStore (on disk) |
|-----------|------------------------|------------------------------|
| **Create** | `PatternStore.store()` writes to memory + HNSW | **NOT called** — no persistence |
| **Load on restart** | `loadPatterns()` is a **no-op** (empty function) | Has 15,634 rows sitting unused |
| **Search** | HNSW vector search (empty after restart) | Never queried for search |
| **Promote** | Updates memory | Forwarded via `setSqliteStore()` |
| **Delete** | Updates memory | Forwarded via `setSqliteStore()` |
| **Embeddings** | In HNSW (memory, lost on restart) | Only 40 rows (from `RealQEReasoningBank`) |

#### The Code Path That Fails

```
QEReasoningBank.storePattern()
  → this.embed(text)              // Generates embedding (hash or ONNX)
  → this.patternStore.create()    // PatternStore (in-memory only!)
    → PatternStore.store()
      → indexPattern()            // In-memory cache ✅
      → hnsw.insert()            // In-memory HNSW ✅
      → [NO SQLite write]        // ❌ Embedding never persisted!
```

The comment at `pattern-store.ts:528-530` says: *"Patterns are persisted to qe_patterns table by SQLitePatternStore. PatternStore only maintains in-memory cache + HNSW index."* But `PatternStore.store()` never calls `SQLitePatternStore.storePattern()`.

#### The Load Path That Fails

```
PatternStore.initialize()
  → loadPatterns()               // NO-OP! Empty function body.
                                  // Comment says: "populated via indexPattern()
                                  // calls from the ReasoningBank when it loads
                                  // from the relational store"

QEReasoningBank.initialize()
  → patternStore.initialize()    // loadPatterns = no-op
  → loadPretrainedPatterns()     // Only creates hardcoded foundational patterns
                                  // when patternStore is empty (every restart!)
                                  // NEVER loads 15,634 patterns from SQLite
```

#### Consequences

1. **On every process restart:** HNSW index starts empty. 15,634 SQLite patterns are invisible to search.
2. **`loadPretrainedPatterns()`** creates ~20-30 hardcoded patterns every restart (in-memory only), then returns because `totalPatterns > 0`.
3. **Embeddings generated during a session** live only in HNSW memory — lost on next restart.
4. **The 40 embeddings in `qe_pattern_embeddings`** were written by `RealQEReasoningBank` (which directly calls `sqliteStore.storePattern(pattern, embedding)`), confirming the main `QEReasoningBank` never persists embeddings.
5. **The ONNX fallback is a secondary issue:** Even when ONNX works and generates real 384-dim embeddings, they're stored in HNSW memory and lost on restart. The hash-based fallback at least produces something, but it too is ephemeral.

#### The Fix (3 Parts)

**Part A: Connect store → SQLite for creates** (`pattern-store.ts`)
```typescript
// In PatternStore.store(), after indexPattern() and HNSW insert:
if (this.sqliteStore) {
  this.sqliteStore.storePattern(pattern, pattern.embedding);
}
```

**Part B: Load SQLite → memory on startup** (`pattern-store.ts`)
```typescript
// In loadPatterns(), replace no-op with actual loading:
private async loadPatterns(): Promise<void> {
  if (!this.sqliteStore) return;
  const patterns = this.sqliteStore.getAllPatterns(); // needs implementing
  for (const pattern of patterns) {
    this.indexPattern(pattern);
    // HNSW loaded separately via getAllEmbeddings() in ensureHNSW()
  }
}
```

**Part C: Ensure HNSW loads from SQLite embeddings** (verify `ensureHNSW()` calls `sqliteStore.getAllEmbeddings()`)

This is **not a new feature** — it's reconnecting two halves of a system that were accidentally disconnected. Without this fix, all other improvements (FTS5, temporal decay, binary rewards) are building on a broken foundation.

---

## Decisions Made

| Question | Decision | Rationale |
|----------|----------|-----------|
| **Promotion threshold** | Standardize on **3** | Matches OpenClaw's self-improving-agent; more conservative |
| **Coherence gate default** | **On by default** | Built for a reason (ADR-052); contradictory patterns shouldn't promote |
| **Hybrid search weights** | **75/25** (vector/FTS5) | Need data before committing to 70/30; slightly more vector-weighted to start |
| **OpenClaw integration** | **Full plugin** (not MCP-only) | Hooks + memory bridge increase adoption beyond bare tool exposure |
| **GRPO group size** | **4**, opt-in | 4x token cost acceptable; must be explicit opt-in, not default |

---

## Synthesis: Cross-Hat Insights

### Where Hats Agree
- **All hats:** FTS5 hybrid search (#1) and promotion fix (#6) are unambiguous wins. Zero risk, high impact, low effort.
- **White + Black + Yellow:** Binary rewards (#2) are the single highest-leverage change. The RL infrastructure exists but has no ground-truth signal.
- **Red + Green:** The 0.26% embedding coverage is both alarming (Red) and a massive opportunity (Green). Backfilling creates immediate value from existing data.

### Where Hats Disagree
- **Yellow vs. Black on YAML pipelines (#9):** Yellow sees token savings and determinism; Black sees maintenance burden and framework-creep. Resolution: Keep it minimal (Lobster's 134-line design, not a full engine).
- **Red vs. Green on UTRL (#17):** Red feels excited about frontier test quality; Black warns it's the highest-complexity change. Resolution: Defer until simpler RL (#2, #11) proves value.
- **Yellow vs. Black on OpenClaw integration:** Yellow sees 247k users; Black sees SDK instability and ClawHavoc fallout. Resolution: MCP-first (universal, SDK-independent), plugin later.

### The One Thing That Changes Everything
**Binary reward assignment (#2)** is the keystone improvement. It unlocks:
- Outcome-based pattern promotion (not just heuristic quality scores)
- GRPO group advantages (#11) — needs rewards to compare
- OPD remediation hints (#7) — needs failure classification to generate hints
- UTRL adversarial training (#17) — needs reward signal as training target
- Proof-of-Quality (#13) — needs measurable quality metrics

Without binary rewards, the RL suite's 9 algorithms have no reliable training signal. With them, every downstream improvement becomes viable.

---

## Appendix: File-Level Impact Map

| File | Changes Needed | Proposals Affected |
|------|---------------|-------------------|
| `src/learning/sqlite-persistence.ts` | Add FTS5 virtual table, hybrid query | #1 |
| `src/learning/qe-reasoning-bank.ts` | Hybrid search scoring, temporal decay | #1, #4 |
| `src/learning/experience-capture.ts` | Binary rewards, at-least-one guarantee, daily log | #2, #3, #14 |
| `src/learning/qe-patterns.ts` | Fix threshold, temporal window | #5, #6 |
| `src/learning/pattern-lifecycle.ts` | Align promotion threshold | #6 |
| `src/learning/qe-hooks.ts` | Pre-compaction flush hook | #8 |
| `src/domains/test-generation/pattern-injection/edge-case-injector.ts` | OPD hint injection | #7 |
| `src/domains/test-generation/coordinator.ts` | Enable coherence gate, multi-candidate for GRPO | #11 |
| `src/routing/routing-feedback.ts` | Group-relative scoring, economic model | #11, #18 |
| `src/mcp/` | Per-agent tool scoping | #12 |
| NEW: `src/pipelines/` | YAML pipeline engine | #9 |
| NEW: `src/cli/commands/prove.ts` | Proof-of-Quality command | #13 |
| NEW: `packages/openclaw-agentic-qe/` | OpenClaw plugin package | Integration |
