# ADR-120: gateReExecutes — re-execute a frozen acceptance rule from sealed inputs on every promotion path

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-120 |
| **Status** | Accepted (2026-07-08) — primitive built: `src/validation/gate-reexecute.ts` (`reExecuteGate`/`verifyPromotion`/`gateFingerprint`/`sealedHash` + frozen `accept/v1` rule composing ADR-117 no-regression + ADR-121 tier gate); 14 tests incl. A8-EXT forgery catch. Retrofit onto the P1–P5 promotion paths (see PROMOTION-PATH-INVENTORY.md) still pending. |
| **Date** | 2026-07-07 |
| **Author** | AQE Core |
| **Review Cadence** | 3 months |
| **Supersedes** | — |
| **Related** | [ADR-116](./ADR-116-proof-gate-memory-integrity.md) (HashChainGate sealing — composes directly), [ADR-117](./ADR-117-frozen-oracle-anchor-set.md) (anchor re-derived at verify time), [ADR-118](./ADR-118-receipt-gated-qe-policy-flywheel.md) (flywheel accept() is one such path), [ADR-121](./ADR-121-provenance-tiered-promotion.md) (tier is a sealed input the rule re-checks). Cross-repo provenance: MetaHarness `@metaharness/flywheel@0.1.7` `verifyReplayBundle` / `gateReExecutes` (`/workspaces/agent-harness-generator/packages/flywheel/src/replay.ts`). |

---

## WH(Y) Decision Statement

**In the context of** AQE having many paths that promote a learning artifact into fleet-changing state — pattern promotion (ADR-110), dream-insight apply (ADR-094), GOAP action promotion, distillation promotion (ADR-121), and the flywheel accept() (ADR-118) — each of which today records a verdict and trusts it,

**facing** the exact failure the July 2026 remediation exposed: the **A8-EXT fake-`applied`-counter** incident, where a promotion path incremented an "applied" count and logged success without the underlying change ever happening — a **logged verdict that lied** (the whole class tracked in proffesor-for-testing/agentic-qe#554),

**we decided for** MetaHarness's **`gateReExecutes` discipline**: every promotion/apply path must, at verification time, **re-execute a versioned frozen acceptance rule against the sealed inputs** and trust *the re-run's verdict*, not the logged one — if the frozen rule cannot be re-executed against the sealed inputs to reproduce the recorded PASS, the promotion is invalid,

**and neglected** trusting the logged verdict (rejected: that is precisely what the fake-counter incident exploited), re-deriving the verdict from *current* (mutable) state instead of sealed inputs (rejected: current state can drift after the fact — the inputs must be sealed at decision time, ADR-116), and re-implementing the check per path (rejected: divergent copies of the "rule" defeat the point — one frozen, fingerprinted rule, re-executed everywhere),

**to achieve** a promotion layer where a forged or stale verdict cannot survive verification — the accept decision is only as good as re-running its frozen rule on the sealed evidence reproduces, closing the fake-`applied` class of bug structurally rather than by code review,

**accepting that** every promotion path must **seal its inputs** (ADR-116) and carry the frozen-rule fingerprint, that re-execution costs compute at verify time (bounded — the rule is deterministic and the inputs are small), and that changing an acceptance rule now requires a **versioned rule bump** (old receipts re-execute against the rule version they were sealed under, never a silently-swapped rule).

---

## Context

MetaHarness's `@metaharness/flywheel` draws a sharp line that AQE needs: **trust the re-run, not the log.** Its `verifyReplayBundle` walks a promotion bundle and, among other checks (`receipts`, `reachesRoot`, `contiguousParents`, `allPromoted`, `gateUnchanged`), computes `gateReExecutes`: it re-executes the frozen acceptance rule against the sealed scores and asserts it reproduces the recorded promotion. If the wrong rule is supplied, or the rule fails to reproduce the verdict on the sealed inputs, `gateReExecutes = false` and the bundle is rejected (`replay.ts:66-90`). A separate `gateUnchanged` check pins the rule's fingerprint so a swapped rule is caught too.

This is the direct antidote to the fake-`applied`-counter incident AQE's July 2026 remediation found (A8-EXT): a promotion path that reported success via a counter without doing the work. A logged "applied: true" is self-assertion; a re-executed frozen rule on sealed inputs is external evidence. ADR-116 already gives AQE the sealing primitive (HashChainGate content-bound receipts). This ADR mandates that *every* promotion path compose that sealing with a re-executed frozen rule, generalizing MetaHarness's per-bundle check into an AQE-wide promotion invariant.

---

## Current state (grounded, verified 2026-07-07)

| Fact | Evidence |
|---|---|
| Fake-`applied`-counter incident is real and recently fixed | A8-EXT (July 2026 remediation); proffesor-for-testing/agentic-qe#554; dream `applied` counter had been a fake incrementer |
| AQE has multiple independent promotion paths | pattern promotion (ADR-110), dream-insight apply (ADR-094), GOAP promotion, ADR-118 accept(), ADR-121 distillation |
| MetaHarness re-executes the gate, doesn't trust the log | `/workspaces/agent-harness-generator/packages/flywheel/src/replay.ts:66` `let gateReExecutes = true`; `:71` "wrong rule supplied — cannot re-execute the run's gate"; `:86` `if (!gateReExecutes) failures.push('gateReExecutes')` |
| MetaHarness also pins the rule fingerprint | `replay.ts:90` `checks: { …, gateUnchanged, gateReExecutes }`; `cli.ts:44` `--gate-fingerprint` |
| MetaHarness ADR for this | `/workspaces/agent-harness-generator/docs/adrs/ADR-235-re-executing-verifiers-and-honest-null-replay.md` |
| AQE already seals write receipts | ADR-116 `HashChainGate` content-bound receipts into `memory.db` |

**The core problem in one line:** AQE's promotion paths trust a recorded verdict, and the fake-`applied` incident proved a recorded verdict can be forged — the fix is to re-execute a frozen rule on sealed inputs and trust that instead.

---

## Options Considered

### Option 1: One versioned frozen rule, re-executed from sealed inputs on every promotion path (Selected)

`src/validation/gate-reexecute.ts`: `reExecuteGate(ruleVersion, sealedInputs) → verdict`. Every promotion path (a) seals its decision inputs via ADR-116, (b) records the frozen-rule fingerprint, and (c) at verification time re-executes `reExecuteGate` and accepts the promotion **only if** the re-run reproduces the recorded PASS. Conform to `@metaharness/flywheel` `verifyReplayBundle` semantics via a parity test.

**Pros:**
- Structurally closes the fake-counter class — a forged verdict cannot reproduce under re-execution.
- Composes with ADR-116 sealing already in the tree.
- One rule, fingerprinted and versioned ⇒ no divergent per-path copies; rule changes are explicit version bumps.
- Verified against a proven upstream implementation.

**Cons:**
- Every promotion path must seal inputs + carry the fingerprint (retrofit work across ADR-110/094/GOAP/118/121).
- Re-execution compute at verify time.

### Option 2: Trust the logged verdict (Rejected — status quo)

Keep recording `applied: true` / `promoted: true` and trust it.

**Why rejected:** this is exactly what A8-EXT exploited. A self-asserted verdict is unfalsifiable; the incident proved it can be wrong and go unnoticed.

### Option 3: Re-derive the verdict from current state (Rejected)

Re-check acceptance against the *live* database at verify time.

**Why rejected:** current state can drift between decision and verification (concurrent writes, later edits), so a re-derivation from live state answers "does it pass now?" not "did the recorded decision actually pass on its evidence?" The inputs must be **sealed at decision time** (ADR-116) for the re-execution to be meaningful.

---

## Decision detail

### 1. The invariant
No artifact changes fleet behavior unless a **versioned frozen acceptance rule, re-executed against the decision's sealed inputs, reproduces the recorded PASS.** The logged verdict is advisory; the re-execution is authoritative.

### 2. Sealed inputs (compose ADR-116)
Each promotion path seals its decision inputs (candidate, baseline, anchor hash, scores, provenance tier) into an ADR-116 content-bound receipt at decision time. The rule fingerprint (hash of the rule version) is recorded alongside.

### 3. Re-execution + fingerprint pin
Verification recomputes the verdict via `reExecuteGate(ruleVersion, sealedInputs)`. Two checks, both required: `gateUnchanged` (recorded fingerprint == current rule-version fingerprint) and `gateReExecutes` (re-run reproduces recorded PASS). Failure of either invalidates the promotion.

### 4. Coverage — all paths
Retrofit: ADR-118 flywheel accept(), ADR-110 pattern promotion, ADR-094 dream-insight apply, GOAP action promotion, ADR-121 distillation promotion. Each gets sealing + fingerprint + a re-execute check. An inventory of promotion paths is the first implementation task.

### 5. Rule versioning
Acceptance rules are versioned; old receipts re-execute against the rule version they were sealed under. A rule change is a new version, never an in-place swap (which `gateUnchanged` would flag).

### 6. Conformance + data safety
Parity test against `@metaharness/flywheel` `verifyReplayBundle` on identical bundles. All receipts append-only to `memory.db`; no destructive ops.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-116 | Proof-Gate memory integrity | Supplies the sealing primitive for decision inputs |
| Relates To | ADR-117 | Frozen oracle anchor set | Anchor hash is a sealed input the re-executed rule re-derives |
| Verifies | ADR-118 | QE-policy flywheel | The flywheel accept() is re-executed from sealed inputs, not trusted |
| Relates To | ADR-121 | Provenance-tiered promotion | Evidence tier is a sealed input the rule re-checks at verify time |
| Guards | ADR-110 | Kept-nulls / pattern promotion | Pattern promotion path sealed + re-executed |
| Guards | ADR-094 | Kernel-side dream cycles | Dream-insight apply path sealed + re-executed (closes A8-EXT class) |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| R-1 | MetaHarness `gateReExecutes` / `verifyReplayBundle` | Prior art | `/workspaces/agent-harness-generator/packages/flywheel/src/replay.ts:23,66-90` |
| R-2 | MetaHarness re-executing verifiers ADR | Upstream ADR | `/workspaces/agent-harness-generator/docs/adrs/ADR-235-re-executing-verifiers-and-honest-null-replay.md` |
| R-3 | MetaHarness CLI gate-fingerprint pin | Prior art | `/workspaces/agent-harness-generator/packages/flywheel/src/cli.ts:44` |
| R-4 | A8-EXT fake-`applied`-counter incident class | Issue | proffesor-for-testing/agentic-qe#554 |
| R-5 | AQE sealing primitive | In-repo | `src/integrations/ruvector/proof-gate.ts` (ADR-116) |

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
- [x] **E - Evidence**: MetaHarness `gateReExecutes`/`verifyReplayBundle` verified in `replay.ts`; A8-EXT incident real
- [x] **C - Criteria**: 3 options compared (re-execute frozen rule / trust log / re-derive from current state)
- [ ] **A - Agreement**: AQE Core sign-off pending
- [x] **D - Documentation**: WH(Y) complete, ADR published
- [x] **R - Review**: 3-month cadence, AQE Core owner
### Extended
- [x] **Dp - Dependencies**: Typed relationships to ADR-116/117/118/121/110/094
- [x] **Rf - References**: Grounded in verified MetaHarness file paths
- [ ] **M - Master**: Part of the ADR-117…122 learning-integrity cluster
