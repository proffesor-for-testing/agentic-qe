# ADR-124: QE-Court — Adversarial Review Protocol and the Hosted `/v1/qe/verdict` Service

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-124 |
| **Status** | Proposed |
| **Date** | 2026-07-18 |
| **Author** | AQE Core / Cognitum QE |
| **Review Cadence** | 3 months |
| **Supersedes** | — (composes ADR-117..122; extends ADR-123 to a QE verdict surface) |
| **Related** | [ADR-117](./ADR-117-frozen-oracle-anchor.md) (frozen anchor), [ADR-118](./ADR-118-receipt-gated-qe-policy-flywheel.md) (receipt-gated flywheel + witness signing), [ADR-119](./ADR-119-two-gate-llm-judge.md) (two-gate judge), [ADR-120](./ADR-120-gate-reexecute-forgery-catch.md) (gate re-execute / forgery catch), [ADR-121](./ADR-121-provenance-tiers.md) (provenance tiers), [ADR-122](./ADR-122-doe-harness.md) (DoE/ANOVA harness), [ADR-123](./ADR-123-billing-aware-llm-execution.md) (billing-aware LLM + Cognitum provider). Strategy: `docs/analysis/AQE-RUFLO-COGNITUM-INTEGRATION-SIX-HATS-2026-07-18.md`. Skill: `.claude/skills/qe-court/`. |

---

## WH(Y) Decision Statement

**In the context of** AQE having independently built a rigorous learning-integrity stack — a frozen oracle anchor (ADR-117), receipt-gated flywheel with Ed25519 witness signing (ADR-118), a two-gate LLM-judge with cross-model writer≠evaluator separation (ADR-119), gate re-execution that catches forged verdicts (ADR-120), provenance tiers that grade evidence `oracle:test-exec > judge:llm > proxy:structural` (ADR-121), and a DoE/ANOVA harness that produces honest nulls (ADR-122) — but with these capabilities scattered across skills, agents, and ADRs and **never assembled into a single review protocol a user or a customer can invoke against a delivery**,

**facing** (1) a concrete product pull — a demoed "adversarial court" where deliveries are attacked by independent AI reviewers with their own probe sets and a shallow `91/100 SHIP` verdict was *overturned* by a deeper independent review ("Einstein vs. Einstein vs. Einstein, with you in the loop"); (2) ruflo's Cognitum funnel (ADR-301..319) defining the `api.cognitum.one` public contract right now with **no QE namespace reserved** and no hosted eval/oracle endpoint (the closest surface is meta-llm `/v1/microlora/evolve`, an adaptation endpoint, not a verdict one); and (3) AQE's own documented failure mode where the reduced 3-dimension QCSD *workflow* can falsely rate SHIP because it skips security/mutation/defect lanes,

**we decided for** a single named protocol, **QE-Court**, delivered in two coordinated forms:

1. **The QE-Court protocol** — a delivery (diff / PR / test-suite / artifact) faces: a **Defense** that states the case-for-ship from evidence; an independent **Prosecution panel** of specialized reviewers (`brutal-honesty-review`, `qe-devils-advocate`, `sherlock-review`, `qe-security-scanner`, `qe-mutation-tester`), each with its **own probe set** and blind to the others until filing; a **blind-refuter kill round** (`src/verification/adversarial-verify`) that discards weak charges; a **Jury** = the two-gate judge (ADR-119) run cross-model (writer≠any juror, ADR-120); an **Overturn round** — the new mechanic — where a `SHIP` must *survive* escalating deeper reviewers **loop-until-dry** (K consecutive deeper rounds finding nothing new), any surviving fatal charge flips the verdict; a **signed court record** (provenance-tiered per ADR-121, witness-signed per ADR-118); and a **human judge** who sees the strongest case *for* and *against* and rules.
2. **Three-valued verdicts** — `SHIP` (survived overturn) · `REMAND` (fixable charges, return to author) · `BLOCK` (fatal charge survived) — never a bare pass/fail, mirroring the two-gate judge's output.
3. **Anti-collusion rules as protocol invariants** — writer ≠ any juror; prosecutors file blind; overturn is **asymmetric** (a SHIP must survive escalation, a BLOCK needs one surviving fatal charge); and a reported **score is DoE-gated** (ADR-122) — the scoring rubric must pass an ANOVA screen before a numeric score is emitted, so we never ship a "91/100" that is noise.
4. **Reserve `/v1/qe/*` on Cognitum** and stand up **`/v1/qe/verdict`** as the hosted embodiment: customers POST a delivery and receive a signed, overturn-tested verdict without running the fleet locally — the commercial "jury waiting for everything you ship." The OSS `qe-court` skill (this ADR's Phase 0) is the reference implementation and the API's local sibling.
5. **Court records chain to the Cognitum witness key** via `src/learning/qe-flywheel/platform-signer.ts` (`QE_WITNESS_SIGNING_KEY`, Stage-B key held in the private `cognitum-one/qe-harness` repo), making verdicts externally attestable — a compliance/audit selling point.

**and neglected** using the reduced 3-dimension QCSD workflow as the court engine (rejected — it can falsely SHIP by skipping security/mutation/defect; QE-Court MUST spawn the specialized `qe-*` prosecutors); single-model self-grading (rejected — a model may not grade its own or its writer's output, ADR-119/120); binary pass/fail verdicts (rejected — hides the REMAND path that most deliveries actually need); emitting a numeric score before the rubric is DoE-validated (rejected — that is exactly the un-validated "compounding promotions" pattern flagged in the strategy report); and building the hosted endpoint before the OSS protocol is proven (deferred — Phase 0 skill first, Phase 2 endpoint after),

**to achieve** an assembled, invocable adversarial review that a developer can run today on their own fleet and a customer can later call as a service; a QE seat at the Cognitum API table before the funnel surface ossifies; and verdicts whose "is this real?" rigor is the product's actual differentiator,

**accepting that** a multi-agent panel plus an overturn loop costs more tokens and wall-clock than a single review (bounded by budget caps from ADR-123 and a configurable overturn depth `K`); the overturn loop is non-deterministic in exact charges found (bounded, not eliminated — the *verdict class* is stable even when the specific charges vary); the human-judge step keeps a human in the loop by design (this is a feature, not latency to remove); and the hosted `/v1/qe/verdict` depends on the still-open question of whether `api.cognitum.one`'s inference and funnel surfaces share a backend (tracked in the strategy report, to be resolved by live probe before Phase 2).

---

## Context

The strategy session (`docs/analysis/AQE-RUFLO-COGNITUM-INTEGRATION-SIX-HATS-2026-07-18.md`)
established that AQE and ruflo built parallel learning-integrity machinery with
near-zero code reuse: AQE owns the *rigor* (frozen anchor, two-gate judge, DoE),
ruflo owns the *reach* (Cognitum auth, signed meta-proxy, billing, funnel). The
"adversarial court" Colby demoed is the same idea as a hosted QE verdict service,
described from the user-facing end. QE-Court is the assembly step: it turns
AQE's scattered rigor into one protocol with an **overturn** mechanic AQE did not
previously have — a passing grade must *survive* escalating independent attackers.

The one genuinely new capability over today's verification is **overturn
asymmetry via loop-until-dry**: existing AQE verification confirms or refutes
individual findings; it does not run an escalating tournament where SHIP is the
claim under attack. That is what prevents the demoed "shallow 91/100 SHIP
overturned by a deeper review" failure.

## Delivery phases

| Phase | Scope | Type | Status |
|-------|-------|------|--------|
| **0** | `qe-court` OSS skill — composes existing prosecutors + blind-refuter + two-gate jury + overturn loop; emits a signed court-record markdown + 3-valued verdict. Wired into `aqe init`, shipped in `assets/skills/`. | OSS-AQE | **This ADR** |
| **1** | Court record chained through `platform-signer.ts` → Cognitum witness key → attestable verdicts. | Both | Planned |
| **2** | `/v1/qe/verdict` hosted on `api.cognitum.one` (reserve `/v1/qe/*`); OSS client library. | Cognitum-commercial | Planned |

## Consequences

- **Positive:** one invocable protocol; QE namespace reserved on Cognitum; overturn closes the false-SHIP gap; verdicts are attestable evidence; the skill increases the count of QE capabilities shipped to users.
- **Negative / cost:** higher token + wall-clock per review (budget-capped, depth-capped); non-deterministic charge sets (verdict class stable); hosted phase gated on the inference-vs-funnel-backend question.
- **Neutral:** keeps a human as final judge by design.

## Verification

- Phase 0 done when: `qe-court` skill installs via `aqe init`, `check-skill-parity` passes, and a court run on a seeded-bug fixture **overturns** a naive SHIP (durable acceptance test — a mutant that a shallow single-reviewer pass misses must be caught by the overturn round).
- The reported score must not appear unless its rubric passed the ADR-122 ANOVA screen (guard test).
