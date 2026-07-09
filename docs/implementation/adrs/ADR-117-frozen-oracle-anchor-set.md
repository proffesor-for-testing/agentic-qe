# ADR-117: Frozen oracle-grade QE anchor set — a hash-pinned, constant-denominator eval set no promotion may regress

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-117 |
| **Status** | Accepted (2026-07-08) — frozen `qe-anchor-v1.json` (5 human-approved items, 10 mutants, hash `e566f31a…`) + `anchor-set.ts` loader with hash-drift refusal; 9 loader tests + 5-item oracle grounding green |
| **Date** | 2026-07-07 |
| **Author** | AQE Core |
| **Review Cadence** | 3 months |
| **Supersedes** | — |
| **Related** | [ADR-113](./ADR-113-evals-are-oracles.md) (evals-are-oracles — supplies the grading mechanism the anchor runs on), [ADR-111](./ADR-111-darwin-qe-self-learning.md) (deterministic ground-truth gate discipline), [ADR-116](./ADR-116-proof-gate-memory-integrity.md) (content-hash sealing precedent). Cross-repo provenance: ruflo ADR-176 `harness-frozen-eval` (frozen human anchor, never-regress), retort `REQUIREMENTS.json` constant-denominator checklist. |

---

## WH(Y) Decision Statement

**In the context of** AQE preparing to close a self-optimizing learning loop over `qe_patterns` (ADR-118) and to make automated promotion decisions about test-generation policy — where every one of those decisions is only as trustworthy as the yardstick it is measured against,

**facing** two failure modes that both silently corrupt the yardstick: (a) a **self-supervised proxy** that a generational loop optimizes *toward the proxy* rather than toward real QE quality (ruflo's own ADR-176 scopes self-retrieval as gameable and pairs it with a frozen human anchor for exactly this reason), and (b) a **re-labeled-per-run checklist** whose denominator moves between runs so two scores are not comparable (retort's `REQUIREMENTS.json` pins a constant denominator precisely to keep `requirement_coverage` scores commensurable across attempts),

**we decided for** a small, **human-labeled, content-hash-pinned frozen anchor set** in constant-denominator pinned-checklist format — a versioned artifact under `verification/` whose loader throws on hash drift (mirroring ruflo `harness-frozen-eval`), graded through the ADR-113 oracle mechanism, that every promotion/accept gate must evaluate and **never regress against**,

**and neglected** a self-supervised-proxy-only anchor (rejected: it optimizes the proxy — ruflo's measured scope proves this), re-labeled-per-run checklists (rejected: non-constant denominators make scores incomparable across runs — retort's design decision), and a large auto-generated anchor (rejected: an anchor the system can regenerate is an anchor the system can Goodhart; the value is that humans labeled it and it is frozen),

**to achieve** a stable, tamper-evident ground truth that anchors ADR-118's accept() gate, ADR-119's judge, and ADR-120's re-executed gates — so "the loop improved" can mean "improved on a fixed human-labeled bar," not "improved on a bar it moved,"

**accepting that** a frozen anchor set is small (hand-labeling is expensive), can go stale as the product surface evolves (requiring a deliberate, versioned re-freeze rather than silent edits), and only measures the slice of QE quality the anchor items cover — it is a floor and a no-regression tripwire, not a complete quality measure.

---

## Context

The July 2026 system-integrity remediation resurrected several learning loops that had been silently dead — `consolidate`-style stubs that wrote hardcoded zeros and fake `applied` counters that incremented without doing work (tracked in proffesor-for-testing/agentic-qe#554). The lesson generalized: **a learning loop with no external, frozen yardstick will drift or fake progress and nothing will notice.** ADR-118 proposes to close a real generational loop over `qe_patterns`; before that loop is allowed to change fleet behavior, it needs a yardstick it cannot author, move, or regenerate.

Two upstream repos converged on the same primitive from opposite directions. ruflo's ADR-176 self-optimizing harness loop keeps a **frozen human anchor** (`harness-frozen-eval`, a content-hashed eval set) as a hard no-regression guard alongside its gameable self-retrieval score; its accept() gate refuses any candidate that regresses the anchor. retort's spec gate scores against a **pinned `REQUIREMENTS.json` checklist with a constant denominator** so that `requirement_coverage` is comparable run-to-run and passes only at `1.0`. Both are saying: the measurement artifact must be frozen and external to the optimizer.

AQE already has the grading *mechanism* (ADR-113 oracle: run the generated test against a reference impl and its mutants; mutation kill rate is the signal) and the sealing *primitive* (ADR-116 content-hash chain). What it lacks is the frozen, human-labeled *content* those mechanisms should be pointed at when a promotion decision is on the line. This ADR defines that content and its integrity contract.

---

## Current state (grounded, verified 2026-07-07)

| Fact | Evidence |
|---|---|
| AQE grades tests by running them, not keyword-matching | ADR-113 `src/validation/oracle-eval.ts` `evaluateOracle` — mutation kill rate is the pass signal |
| No frozen, human-labeled anchor exists for promotion gates | ADR-113 evals live per-skill (`.claude/skills/*/evals`); none is content-hash-pinned or designated a no-regression anchor |
| ruflo froze a human anchor for exactly this role | `/workspaces/ruflo/v3/@claude-flow/cli/src/services/harness-flywheel-generations.ts:42-43` — `anchorTasks` + `humanEvalHash` "content hash of the FROZEN human eval set"; `harness-frozen-eval.ts` |
| ruflo's accept() refuses anchor regression | same file `:225-229` "constrained (Pareto) selection: best self-retrieval on TRAIN subject to no anchor regression"; `:229` `if (anchorMean(c) < baseAnchor - ANCHOR_TOL) continue` |
| retort pins a constant-denominator checklist | `/workspaces/retort/src/retort/cli.py:1267` `_spec_conformance_passes` reads `requirement_coverage`, passes only at `== 1.0` against pinned `REQUIREMENTS.json` |
| Fake-progress failure class is live in AQE history | proffesor-for-testing/agentic-qe#554; dead `consolidate` stub + fake `applied` counters (ADR-174 root-cause finding mirrors the same class in ruflo) |

**The core problem in one line:** AQE is about to let a loop change its own behavior, but has no frozen human-labeled bar that the loop cannot move — so "it got better" would be unfalsifiable.

---

## Options Considered

### Option 1: Frozen human-labeled, hash-pinned, constant-denominator anchor set (Selected)

A small versioned artifact — `verification/anchors/qe-anchor-v1.json` — of human-labeled QE items (each: an input under test, a reference implementation, a pinned checklist of requirements with a **fixed denominator**, and the expected mutation-kill set). A loader (`src/validation/anchor-set.ts`) computes the content hash on load and **throws on drift**; the hash is recorded in every promotion receipt (ADR-118/120). Graded through the ADR-113 oracle. Re-freezing is a deliberate, reviewed bump to `-v2` with a new hash, never an in-place edit.

**Pros:**
- The yardstick is external to the optimizer and cannot be Goodharted by it (the §10/§12 trap of ADR-111 is structurally avoided for the anchor).
- Constant denominator ⇒ scores are comparable across runs and generations (retort's proven property).
- Hash-pinning makes silent edits impossible and makes "which anchor did this promotion clear?" auditable (composes with ADR-116 sealing).
- Small and cheap to evaluate ⇒ can run on every accept() and every re-executed gate.

**Cons:**
- Hand-labeling is expensive; the set stays small.
- Covers only the labeled slice of QE quality — a floor, not a full measure.
- Staleness requires disciplined, versioned re-freezes.

### Option 2: Self-supervised-proxy-only anchor (Rejected)

Derive the anchor automatically from the corpus (e.g., title-withheld retrieval over `qe_patterns`, doc-id labels — ruflo's self-supervised harvest).

**Why rejected:** ruflo's own ADR-176 scopes self-retrieval as **gameable** ("fitness reduces to 'beats npm test' — gameable") and never lets it stand alone — it is always paired with the frozen human anchor as the no-regression guard. A proxy-only anchor optimizes the proxy, which is precisely the drift this ADR exists to prevent.

### Option 3: Re-labeled-per-run checklists (Rejected)

Regenerate the checklist (and thus the denominator) for each evaluation run.

**Why rejected:** retort demonstrates that a **non-constant denominator makes scores incomparable** across runs — you cannot say generation N+1 beat generation N if the bar's size changed underneath. A moving denominator would make ADR-118's held-out-beats-baseline comparison meaningless.

---

## Decision detail

### 1. Artifact format (constant denominator, pinned)
`verification/anchors/qe-anchor-v1.json`: a list of anchor items, each `{ id, inputUnderTest, referenceImpl, requirements: [pinned checklist], expectedMutantKills }`. The requirement count per item is **fixed at freeze time** — the denominator. `schemaVersion` + `contentHash` (SHA-256 over canonicalized items) are recorded in the file header.

### 2. Loader with hash-drift refusal
`src/validation/anchor-set.ts` `loadAnchorSet(path)` recomputes the content hash on load and **throws** if it does not match the recorded `contentHash` (mirrors ruflo `harness-frozen-eval`). No promotion path may read the anchor except through this loader.

### 3. Grading is the ADR-113 oracle
Each anchor item is graded by `evaluateOracle` (run against reference + mutants; kill rate is the score). The anchor mean is `Σ score / N` with **N constant** — the constant-denominator property.

### 4. No-regression contract
The anchor set exposes `anchorMean(policy)`. ADR-118's accept() and ADR-120's re-executed gates both require `candidateAnchorMean >= baselineAnchorMean - ANCHOR_TOL` (Pareto no-regression — ruflo's `:229` rule). A candidate that regresses the anchor is rejected regardless of any other gain.

### 5. Re-freeze is versioned, never in-place
Product-surface evolution is handled by authoring `qe-anchor-v2.json` with a new hash and a reviewed diff, then repointing gates. In-place edits are forbidden (they would break every prior receipt's hash reference).

### 6. Data safety
The anchor artifact is a plain JSON file under version control — it does **not** live in `memory.db` and involves no DB writes. Promotion receipts that *reference* its hash follow the unified-memory append-only rule (ADR-116).

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-113 | Evals Are Oracles | Anchor items are graded by the oracle mechanism (run vs reference + mutants) |
| Relates To | ADR-116 | Proof-Gate memory integrity | Same content-hash sealing discipline; promotion receipts cite the anchor hash |
| Relates To | ADR-111 | Darwin-for-QE self-learning | Frozen anchor is the deterministic ground-truth gate that immunizes against the §10/§12 Goodhart trap |
| Required By | ADR-118 | Receipt-gated QE-policy flywheel | The accept() gate is meaningless without this no-regression anchor |
| Required By | ADR-119 | Two-gate quality verdicts | The pinned-checklist judge grades against this constant-denominator artifact |
| Required By | ADR-120 | gateReExecutes | Re-executed gates re-derive the anchor mean from the sealed anchor hash |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| R-1 | ruflo frozen human anchor (`anchorTasks`, `humanEvalHash`) | Prior art | `/workspaces/ruflo/v3/@claude-flow/cli/src/services/harness-flywheel-generations.ts:42-43,225-229` |
| R-2 | ruflo `harness-frozen-eval` (hash-drift refusal) | Prior art | `/workspaces/ruflo/v3/@claude-flow/cli/src/services/harness-frozen-eval.ts` |
| R-3 | retort constant-denominator spec gate | Prior art | `/workspaces/retort/src/retort/cli.py:1267` `_spec_conformance_passes` |
| R-4 | ruflo ADR-176 (frozen human anchor never regresses) | Upstream ADR | `/workspaces/ruflo/v3/docs/adr/ADR-176-proven-self-benchmarking-harness-loop.md` |
| R-5 | Resurrected-dead-loop / fake-counter failure class | Issue | proffesor-for-testing/agentic-qe#554 |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| AQE Core | 2026-07-07 | Proposed | 2026-10-07 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-07-07 | Initial creation; extracted from 2026-07-07 cross-repo analysis of ruflo/MetaHarness/retort |

---

## Definition of Done Checklist

### Core (ECADR)
- [x] **E - Evidence**: Prior art verified in ruflo (`harness-frozen-eval`, `anchorTasks`/`humanEvalHash`) and retort (`REQUIREMENTS.json` constant denominator)
- [x] **C - Criteria**: 3 options compared (frozen human anchor vs proxy-only vs re-labeled-per-run)
- [x] **A - Agreement**: signed off in the 2026-07-08 labeling session — all 5 items approved; pass bar "High" (mutation kill ≥ 0.8 AND checklist coverage = 1.0); ANCHOR_TOL = 0.0 (never drop)
- [x] **D - Documentation**: WH(Y) statement complete, ADR published
- [x] **R - Review**: 3-month cadence set, AQE Core owner
### Extended
- [x] **Dp - Dependencies**: Typed relationships to ADR-113/116/111/118/119/120 documented
- [x] **Rf - References**: Grounded in verified cross-repo file paths
- [ ] **M - Master**: Part of the ADR-117…122 learning-integrity cluster
