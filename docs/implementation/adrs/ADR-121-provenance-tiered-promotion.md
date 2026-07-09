# ADR-121: Provenance-tiered promotion — only oracle-tier evidence changes fleet behavior

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-121 |
| **Status** | Accepted (2026-07-08) — `provenance-tier.ts` (`tierAllowsPromotion`) + `pattern-lifecycle.ts` additive `provenance_tier` migration (conservative `proxy:structural` backfill, verified on a 158-row DB copy) + tier-gated `checkPromotion`; 16 tests. Consumed by ADR-120 `pattern-promote/v1` + ADR-118 `accept/v1`. |
| **Date** | 2026-07-07 |
| **Author** | AQE Core |
| **Review Cadence** | 3 months |
| **Supersedes** | — |
| **Related** | [ADR-113](./ADR-113-evals-are-oracles.md) (oracle:test-exec is the top tier), [ADR-119](./ADR-119-two-gate-quality-verdicts.md) (judge:llm tier), [ADR-110](./ADR-110-kept-nulls-negative-pattern-records.md) (proxy patterns kept searchable), [ADR-120](./ADR-120-gate-reexecutes-promotion-paths.md) (tier is a sealed, re-checked input), [ADR-118](./ADR-118-receipt-gated-qe-policy-flywheel.md) (harvest tags tiers). Cross-repo provenance: ruflo ADR-174 provenance-gated distillation (`/workspaces/ruflo/v3/docs/adr/ADR-174-memory-distillation-self-optimization.md`). |

---

## WH(Y) Decision Statement

**In the context of** AQE's learning writes — patterns (ADR-110), dream insights (ADR-094), consolidated memories, causal/co-occurrence edges — all landing in `memory.db` and becoming candidates for recall and promotion,

**facing** the fact that these writes carry **wildly different evidential strength** — a test-execution-observed outcome is ground truth, an LLM judgment is a noisy opinion (ADR-119: Haiku swung 0.33↔1.0), and a structural/co-occurrence inference is a weak guess — yet today they are stored undifferentiated, so a structural guess can be recalled and promoted with the same authority as an execution-proven fact (ruflo's ADR-174 caught its own `causal_edges` overclaiming causation when it only had weak co-occurrence),

**we decided for** ruflo's **provenance-tiered promotion**: every learning write carries an explicit evidence tier — **`oracle:test-exec` > `judge:llm` > `proxy:structural`** — and **only `oracle:test-exec` (or an explicitly-budgeted `judge:llm`) may change fleet behavior**; lower tiers are written and **searchable but never auto-promoted**; existing undifferentiated rows are **backfilled as `proxy:structural`** (the conservative default),

**and neglected** flat undifferentiated storage (rejected: lets a structural guess masquerade as proof — the ADR-174 causal-overclaim bug), promoting on judge-tier by default (rejected: ADR-119 shows a single LLM judgment is noisy; judge-tier promotes only under explicit opt-in budget), and deleting proxy-tier rows (rejected: they are valuable for recall/exploration and negative learning per ADR-110 — demote, don't discard),

**to achieve** a learning store where authority tracks evidence — execution-proven facts drive the fleet, opinions and guesses inform search but cannot silently promote — so the flywheel (ADR-118) and every promotion path (ADR-120) consume only trustworthy signal,

**accepting that** every learning write path must now assign a tier (a small but pervasive change), that the conservative backfill (`proxy:structural` for all legacy rows) will under-credit some genuinely execution-observed history until re-derived, and that `judge:llm` promotion requires a deliberate budget decision rather than being free.

---

## Context

ruflo's ADR-174 is the direct model. Its RETRIEVE→JUDGE→DISTILL→CONSOLIDATE pipeline assigns a **provenance tier** to every distilled pattern: `feedback` entries (post-edit execution outcomes) are `oracle:test-exec`; everything else is `proxy:structural`; `judge:fable` (its LLM tier) is reserved for an explicitly opt-in, cost-bounded path. **Promotion is gated in code, not prose**: "a pattern is `promoted` only if its tier is `oracle:test-exec` (or `judge:fable`). `proxy:structural` patterns are written but **never** promoted — visible for audit, excluded from promoted recall." ADR-174 also documents the failure this prevents: its `causal_edges` table name **overclaimed** causation when the service only emits weak co-occurrence, so every such edge now carries `edge_type=cooccurrence`, `provenance_tier=proxy:structural`, `confidence=0.3`, `promoted=false` — the tier is what stops a downstream system from treating a guess as proof.

AQE has the same shape. ADR-113 already produces `oracle:test-exec`-grade evidence (execution + mutation). ADR-119 adds a `judge:llm` verdict. ADR-110 keeps structural/null patterns. But these are not stored with an explicit tier that gates promotion — so this ADR imports ruflo's discipline: tier every write, gate promotion on tier, backfill legacy rows conservatively.

---

## Current state (grounded, verified 2026-07-07)

| Fact | Evidence |
|---|---|
| ruflo tiers every write and gates promotion in code | `/workspaces/ruflo/v3/docs/adr/ADR-174-memory-distillation-self-optimization.md` — "promoted only if tier is oracle:test-exec (or judge:fable); proxy:structural … never promoted … Enforced in code, not just prose" |
| ruflo's tier order | ADR-174 JUDGE: `feedback` (execution outcomes) → `oracle:test-exec`; else → `proxy:structural`; `judge:fable` opt-in/cost-bounded |
| ruflo caught a causal overclaim via tiers | ADR-174 "Relational edges are NOT causal proof" — `edge_type=cooccurrence, provenance_tier=proxy:structural, confidence=0.3, promoted=false` |
| AQE already produces oracle-grade evidence | ADR-113 `evaluateOracle` (execution + mutation kill rate) |
| AQE will produce judge-grade evidence | ADR-119 frontier judge verdict |
| AQE keeps structural/null patterns | ADR-110 kept-nulls / negative pattern records |
| AQE learning rows are not tier-gated for promotion today | no `provenance_tier` gate on `qe_patterns` promotion before this cluster |

**The core problem in one line:** AQE stores execution-proven facts, LLM opinions, and structural guesses with equal authority — so a guess can be promoted like a proof, exactly the bug ruflo's tier gate was built to stop.

---

## Options Considered

### Option 1: Three-tier provenance gate, oracle-only promotion, conservative backfill (Selected)

Add `provenance_tier ∈ {oracle:test-exec, judge:llm, proxy:structural}` to every learning write. Promotion (ADR-118/120) requires `oracle:test-exec`; `judge:llm` promotes only under an explicit budget flag; `proxy:structural` is searchable, never auto-promoted. Backfill all existing rows as `proxy:structural`. Mirror ruflo's in-code enforcement (not prose).

**Pros:**
- Authority tracks evidence strength — the fleet is driven only by execution-proven facts.
- Directly reuses ADR-113 (oracle), ADR-119 (judge), ADR-110 (kept structural) as the three tiers.
- Conservative backfill can never *over*-credit legacy rows.
- Proven upstream (ruflo ADR-174, in-code gate).

**Cons:**
- Every write path must assign a tier (pervasive).
- Backfill under-credits genuinely-executed legacy history until re-derived.

### Option 2: Flat, undifferentiated storage (Rejected — status quo)

Keep storing all learning writes without an evidence tier.

**Why rejected:** this is the configuration that produced ruflo's causal-overclaim bug — a weak co-occurrence guess recalled/promoted as if it were causal proof. Undifferentiated storage makes "how strong is this evidence?" unanswerable at promotion time.

### Option 3: Promote on judge-tier by default (Rejected)

Let LLM-judge verdicts promote automatically, same as oracle.

**Why rejected:** ADR-119 shows a single LLM judgment is noisy (Haiku 0.33↔1.0). Judge-tier is useful signal but not ground truth; auto-promoting on it re-introduces the noise the two-gate design exists to filter. Judge-tier promotion stays behind an explicit budget decision.

---

## Decision detail

### 1. Tier taxonomy (ordered)
`oracle:test-exec` (execution-observed — ADR-113) > `judge:llm` (frontier-judge verdict — ADR-119) > `proxy:structural` (co-occurrence / structural inference — ADR-110). Stored as an explicit column/field on every learning write.

### 2. Promotion gate (in code)
`oracle:test-exec` may promote. `judge:llm` promotes only when an explicit budget/opt-in flag is set. `proxy:structural` is **never** auto-promoted — searchable and available for exploration/negative-learning, excluded from promoted recall. Enforced in the promotion code path, re-checked by ADR-120's re-executed rule (tier is a sealed input).

### 3. Overclaim guard (ruflo's edge lesson)
Any inferred relation (co-occurrence, similarity edge) is written `proxy:structural` with a low confidence and `promoted=false`, and must not be labeled with a stronger relation type than the evidence supports.

### 4. Conservative backfill
A one-time migration tags all existing learning rows `proxy:structural` (the safe default — never over-credits). Rows later re-derived from execution evidence can be re-tiered upward through the normal write path; the migration never tiers *up* blindly.

### 5. Data safety (mandatory)
The backfill is additive (adds a tier field / default value) — **no `DROP`/`DELETE`/`TRUNCATE`**, row counts verified before and after, backup taken first per the unified-memory rule. Test against a copy of `memory.db`, never the original.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-113 | Evals Are Oracles | Supplies the `oracle:test-exec` top tier |
| Depends On | ADR-119 | Two-gate quality verdicts | Supplies the `judge:llm` tier |
| Relates To | ADR-110 | Kept-nulls / negative patterns | `proxy:structural` rows kept searchable, not discarded |
| Relates To | ADR-120 | gateReExecutes | Tier is a sealed input the re-executed rule re-checks |
| Consumed By | ADR-118 | QE-policy flywheel | Corpus harvest tags tiers; only oracle-tier candidates promote |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| R-1 | ruflo provenance-gated distillation (in-code tier gate) | Upstream ADR | `/workspaces/ruflo/v3/docs/adr/ADR-174-memory-distillation-self-optimization.md` |
| R-2 | ruflo causal-overclaim guard (edge tier contract) | Upstream ADR | ADR-174 "Relational edges are NOT causal proof" |
| R-3 | AQE oracle evidence source | In-repo | `src/validation/oracle-eval.ts` (ADR-113) |
| R-4 | Learning-store integrity backdrop | Issue | proffesor-for-testing/agentic-qe#554 |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| AQE Core | 2026-07-07 | Proposed | 2026-10-07 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-07-07 | Initial creation; extracted from 2026-07-07 cross-repo analysis |

---

## Definition of Done Checklist

### Core (ECADR)
- [x] **E - Evidence**: ruflo ADR-174 in-code tier gate + causal-overclaim guard verified
- [x] **C - Criteria**: 3 options compared (three-tier gate / flat storage / judge-default promotion)
- [ ] **A - Agreement**: AQE Core sign-off pending
- [x] **D - Documentation**: WH(Y) complete, ADR published
- [x] **R - Review**: 3-month cadence, AQE Core owner
### Extended
- [x] **Dp - Dependencies**: Typed relationships to ADR-113/119/110/120/118
- [x] **Rf - References**: Grounded in verified ruflo ADR-174
- [ ] **M - Master**: Part of the ADR-117…122 learning-integrity cluster
