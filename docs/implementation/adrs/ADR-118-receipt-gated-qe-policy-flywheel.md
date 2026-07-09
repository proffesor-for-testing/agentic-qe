# ADR-118: Receipt-gated QE-policy flywheel over `qe_patterns` — generational tuning behind a conjunctive frozen accept() gate

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-118 |
| **Status** | Accepted (2026-07-08) — core built `src/learning/qe-flywheel/` (policy, Ed25519 receipt, generation loop): frozen `accept/v1` gate via ADR-120, anchor no-regression via ADR-117, provenance tier via ADR-121, compounding lineage, honest-null, drift canary + reversible pointer; 17 tests. Corpus scorer (harvest `qe_patterns` + retrieval eval + anchor grading) is the injected seam, wired separately (the DB/model-touching part). |
| **Date** | 2026-07-07 |
| **Author** | AQE Core |
| **Review Cadence** | 3 months |
| **Supersedes** | — |
| **Related** | [ADR-117](./ADR-117-frozen-oracle-anchor-set.md) (the anchor the gate can't regress), [ADR-116](./ADR-116-proof-gate-memory-integrity.md) (receipt sealing), [ADR-113](./ADR-113-evals-are-oracles.md)/[ADR-114](./ADR-114-conservation-layer.md) (oracle grading + surface stability), [ADR-111](./ADR-111-darwin-qe-self-learning.md) (headroom/ceiling precondition). Cross-repo provenance: ruflo ADR-176 (receipt-backed evolution), MetaHarness `@metaharness/flywheel@0.1.7`, MetaHarness ADR-234 (capability ceiling). |

---

## WH(Y) Decision Statement

**In the context of** AQE recording thousands of `qe_patterns` rows but never *optimizing its retrieval/test-generation policy against a QE objective* — the same "record everything, distill nothing" gap ruflo found (ADR-174: 6,000+ commits of self-learning that consolidated 0 rows) and the same class of dead loops the July 2026 remediation just resurrected in AQE (proffesor-for-testing/agentic-qe#554),

**facing** the choice of *how* to build a closed generational loop that changes fleet behavior — and the hard-won upstream lesson that a loop authorized by a single scalar objective or by self-assertion will drift, Goodhart, or fake progress (ruflo ADR-176's "no transition is authorized by self-assertion"), plus MetaHarness ADR-234's honest-null ceiling: **a flywheel recovers preventable loss, it cannot create capability the base solver lacks**,

**we decided for** a **receipt-gated QE-policy flywheel**: a generational loop over `qe_patterns` retrieval/selection policy, gated by a **conjunctive frozen `accept()`** (held-out > baseline, red/blue, drift, deterministic replay, 100% receipt coverage, bootstrap 95% CI-low > 0, and the ADR-117 anchor never regresses), with **Ed25519 receipts + lineage DAG**, a **reversible active-policy pointer** with rollback, **serve-then-shadow + drift canary auto-rollback**, and a **capability-headroom precondition** — built as a **dependency-free TypeScript port** of the algorithm (ADR-116 precedent), not a runtime dependency,

**and neglected** importing claude-flow's shipped flywheel modules as a runtime dependency (rejected: no CLI/MCP surface to consume and the ADR-116 fragile-ecosystem lesson — weigh honestly, but AQE's unified-store + MCP-CLI-parity constraints make a port cleaner), consuming `@metaharness/flywheel` as the engine (rejected as the *primary* build, kept as a **conformance oracle** for our port's gate semantics), a single-scalar fitness (rejected: gameable — ruflo/ADR-111 §10/§12), and an always-on loop with no headroom check (rejected: ADR-234 — no headroom means no promotions and wasted spend),

**to achieve** a real, auditable, reversible self-improvement loop for QE policy that changes fleet behavior *only* on conjunctive external evidence — turning AQE's dormant `qe_patterns` corpus into measured lift without repeating the dead-stub/fake-counter failures,

**accepting that** the loop is **opt-in and $0 by default** (no spend unless enabled), that it may **honestly produce zero promotions** when there is no headroom (MetaHarness's SWE-bench outcome — that is a correct result, not a failure), that a dependency-free port must be kept faithful by a parity test against `@metaharness/flywheel`, and that every generation costs held-out evaluation compute even when it promotes nothing.

---

## Context

ruflo's ADR-174 found its intelligence substrate completely empty after thousands of commits because the `consolidate` worker was a stub writing hardcoded zeros. AQE's July 2026 remediation found the identical class of failure in its own tree (dead consolidate-style stubs, fake `applied` counters). The remediation *resurrected* those loops; this ADR governs the one that is riskiest — a loop that changes fleet behavior. The precondition for that loop is ADR-117's frozen anchor; the governance is the receipt-backed discipline both ruflo (ADR-176) and MetaHarness (`@metaharness/flywheel`) independently arrived at.

ruflo's `harness-flywheel-generations.ts` implements the reference version: `anchorTasks` + `humanEvalHash`, Pareto-constrained selection ("best self-retrieval on TRAIN subject to no anchor regression"), a `redblue` verdict, a **separate** drift canary on the real evolving store that auto-rolls-back, and a signed replay bundle. MetaHarness's `@metaharness/flywheel@0.1.7` generalizes the *gate* into a dependency-free engine: `meetsPromotionRule`, `makeSigner` (Ed25519), `verifyReplayBundle`, and a **re-executing verifier** (see ADR-120). Its ADR-234/236 record the honest-null discipline: a real SWE-bench run promoted **0** candidates because there was no headroom — proving the mechanism without inventing capability.

The build question is the same one ADR-116 answered for proof-gate: **port or depend?** claude-flow's npm publishing is healthier than the `@ruvector/*` ecosystem ADR-116 rejected, so this must be weighed honestly rather than reflexively. But two AQE constraints tip it toward a port: (1) the flywheel modules ship in `@claude-flow/cli` with **no CLI/MCP surface** — there is nothing importable that is contract-stable for a library consumer; (2) AQE's unified-store mandate means the lineage/receipts must persist into `memory.db`, not a competing store, which requires AQE-side wiring regardless.

---

## Current state (grounded, verified 2026-07-07)

| Fact | Evidence |
|---|---|
| `qe_patterns` is recorded but not policy-optimized | July 2026 remediation memories; ADR-110 wired null/negative pattern records but no generational loop tunes retrieval over them |
| Dead-loop / fake-counter failure class is real in AQE | proffesor-for-testing/agentic-qe#554; mirrors ruflo ADR-174 stub root-cause |
| ruflo reference flywheel exists and is verified | `/workspaces/ruflo/v3/@claude-flow/cli/src/services/harness-flywheel-generations.ts` (21KB); anchor Pareto selection `:225-229`; drift canary auto-rollback `:259-302` |
| claude-flow ships the modules with no CLI/MCP surface | `@claude-flow/cli@3.25.2` (`/workspaces/ruflo/v3/@claude-flow/cli/package.json`); `harness-corpus-harvester.ts`, `harness-frozen-eval.ts`, `config/harness-feedback-applier.ts` present; no exported CLI verb / MCP tool |
| MetaHarness generic gate engine exists, dependency-free | `@metaharness/flywheel@0.1.7` (`/workspaces/agent-harness-generator/packages/flywheel/package.json`); `verifyReplayBundle`, `makeSigner`, `meetsPromotionRule` exported (`src/index.ts`) |
| Honest-null ceiling is a documented real outcome | MetaHarness ADR-234 + ADR-236 (`docs/adrs/ADR-236-swebench-domain-run-honest-null.md`) — 0 promotions, "recovers preventable loss, cannot create capability the base lacks" |
| ADR-116 established the port-vs-depend precedent | ADR-116 — dependency-free TS port of `ruvector-proof-gate` over a fragile npm ecosystem |

**The core problem in one line:** AQE has a dormant `qe_patterns` corpus and a just-resurrected loop culture; to safely close a behavior-changing loop it needs the receipt-backed accept() discipline both upstreams proved — ported, not blindly depended upon, and only run where headroom exists.

---

## Options Considered

### Option 1: Dependency-free TypeScript port, gate-conformance-tested against `@metaharness/flywheel` (Selected)

Port the generational loop + conjunctive `accept()` into `src/learning/qe-flywheel/`, persisting lineage + Ed25519 receipts into `memory.db` (append-only, unified store). Keep `@metaharness/flywheel` as a **devDependency conformance oracle**: a parity test feeds identical sealed scores to our `accept()` and to `meetsPromotionRule`/`verifyReplayBundle` and asserts identical verdicts — so the port cannot silently diverge from the proven gate.

**Pros:**
- Honors the unified-store mandate (lineage in `memory.db`, no competing DB) and MCP-CLI parity (one AQE-owned surface).
- No runtime dependency on a module set that ships with no consumer-facing surface.
- Follows the ADR-116 precedent that worked; parity test bounds the fidelity risk.
- $0/opt-in wiring is under our control.

**Cons:**
- Port must be kept faithful (mitigated by the conformance test).
- Duplicates algorithm code that exists upstream.

### Option 2: Import claude-flow's shipped flywheel modules as a runtime dependency (Rejected)

Depend on `@claude-flow/cli@3.25.2` and call `harness-flywheel-generations` / `harness-frozen-eval` directly.

**Why rejected:** the modules ship **compiled inside the CLI package with no CLI/MCP surface** — there is no stable, documented import contract for a library consumer, so we would be reaching into internals of a package that publishes for a different purpose. claude-flow's publishing is healthier than `@ruvector/*` (ADR-116), so this was weighed honestly — but "healthier publisher" does not create an import contract that isn't there, and the lineage still has to land in `memory.db` regardless.

### Option 3: Consume `@metaharness/flywheel` as the primary engine (Rejected as primary; kept as conformance oracle)

Use `@metaharness/flywheel@0.1.7` as the runtime gate engine.

**Why rejected as primary:** it is a **generic** promote-gate engine over abstract score maps; the QE-specific corpus harvest, anchor grading (ADR-113 oracle), and `qe_patterns`/`memory.db` persistence are still AQE-owned work. Taking it as a runtime dep buys the gate math but not the loop, while adding a dependency. It is far more valuable as a **frozen conformance oracle** for our ported gate — which is how Option 1 uses it.

---

## Decision detail

### 1. Preconditions (checked before any generation runs)
- **Headroom check (ADR-234).** Measure baseline anchor + held-out headroom first. If the base policy already saturates the anchor, the loop **must not run** — it would spend compute for structurally-zero promotions. Honest-null is an acceptable, logged outcome; spending on a no-headroom loop is not.
- **Anchor loaded and hash-valid (ADR-117).** `loadAnchorSet` must succeed (throws on drift) before a generation is admitted.

### 2. Corpus harvest (self-supervised, provenance-tagged)
Harvest training candidates from `qe_patterns` with title-withheld queries / doc-id labels (ruflo's self-supervised pattern), each tagged with its provenance tier (ADR-121). Self-retrieval is the **train** signal only — never the accept signal.

### 3. Conjunctive frozen `accept()` (all must hold)
`heldOut > baseline` ∧ `redblue == PASS` ∧ `!drifted` ∧ `deterministicReplay OK` ∧ `receiptCoverage == 100%` ∧ `bootstrap 95% CI-low > 0` ∧ **`anchorMean >= baseline - ANCHOR_TOL` (ADR-117)**. A single failing conjunct rejects the candidate. The rule is **frozen and versioned**; ADR-120 re-executes it from sealed inputs at verification time.

### 4. Receipts + lineage DAG
Every generation (promoted or rejected) emits an Ed25519-signed receipt into a lineage DAG persisted in `memory.db` (append-only). Rejected mutations are retained as negative learning (ruflo's anti-pattern DB; AQE's ADR-110 kept-nulls discipline).

### 5. Reversible active-policy pointer + serve-then-shadow + drift canary
The active policy is a single reversible pointer with a rollback target. A promoted policy is **served then shadowed**; a **separate drift canary** on the real evolving store auto-rolls-back if served score OR anchor score drifts below the predecessor (ruflo `:259-302`).

### 6. Build + conformance
Ported into `src/learning/qe-flywheel/`; `@metaharness/flywheel` is a devDependency conformance oracle (parity test on gate verdicts + replay-bundle verification). MCP-CLI parity: any user-facing verb ships on both surfaces.

### 7. Default posture + data safety
**OFF by default, $0 unless explicitly enabled.** All writes append-only to `memory.db`; no `DROP`/`DELETE`/schema-destructive ops; row counts verified before/after per the unified-memory rule.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-117 | Frozen oracle anchor set | The accept() gate is meaningless without a no-regression anchor |
| Depends On | ADR-116 | Proof-Gate memory integrity | Ed25519 receipts + hash sealing of generation inputs |
| Depends On | ADR-113 | Evals Are Oracles | Held-out + anchor items graded by the oracle mechanism |
| Relates To | ADR-114 | Conservation Layer | Promoted policy must not break user-facing surfaces |
| Relates To | ADR-111 | Darwin-for-QE | Headroom/ceiling precondition; deterministic gate immunizes Goodhart |
| Relates To | ADR-121 | Provenance-tiered promotion | Corpus candidates carry evidence tiers; only oracle-tier promotes |
| Verified By | ADR-120 | gateReExecutes | The frozen accept() is re-executed from sealed inputs, not trusted from log |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| R-1 | ruflo reference flywheel (generations, anchor Pareto, drift canary) | Prior art | `/workspaces/ruflo/v3/@claude-flow/cli/src/services/harness-flywheel-generations.ts` |
| R-2 | ruflo ADR-176 receipt-backed evolution | Upstream ADR | `/workspaces/ruflo/v3/docs/adr/ADR-176-proven-self-benchmarking-harness-loop.md` |
| R-3 | MetaHarness generic gate engine | Prior art | `/workspaces/agent-harness-generator/packages/flywheel` (`@metaharness/flywheel@0.1.7`) |
| R-4 | MetaHarness honest-null ceiling | Upstream ADR | `/workspaces/agent-harness-generator/docs/adrs/ADR-234-ruvllm-microloop-under-flywheel-macroloop.md`, `ADR-236-swebench-domain-run-honest-null.md` |
| R-5 | claude-flow shipped modules (no CLI/MCP surface) | Package | `@claude-flow/cli@3.25.2`, `harness-corpus-harvester.ts` / `harness-frozen-eval.ts` |
| R-6 | Dead-loop / fake-counter failure class | Issue | proffesor-for-testing/agentic-qe#554 |

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
- [x] **E - Evidence**: ruflo reference flywheel + MetaHarness engine verified; honest-null ceiling documented upstream
- [x] **C - Criteria**: 3 build options compared (port / import claude-flow / consume MetaHarness)
- [ ] **A - Agreement**: AQE Core sign-off pending
- [x] **D - Documentation**: WH(Y) complete, ADR published
- [x] **R - Review**: 3-month cadence, AQE Core owner
### Extended
- [x] **Dp - Dependencies**: Typed relationships to ADR-117/116/113/114/111/121/120
- [x] **Rf - References**: Grounded in verified cross-repo file paths + package versions
- [ ] **M - Master**: Part of the ADR-117…122 learning-integrity cluster
