# ADR-105: Evidence-Class Labels on QE Findings

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-105 |
| **Status** | Proposed |
| **Date** | 2026-06-11 |
| **Author** | AQE Core (Pattern Space cross-pollination initiative, gist `3efec1f`) |
| **Review Cadence** | 6 months |
| **Related** | ADR-102 (adversarial verification), ADR-103 (structured verdict handoffs), ADR-070 (witness chain — witness entries record the evidence class of findings that triggered pattern mutations), PR trust tiers |

---

## WH(Y) Decision Statement

**In the context of** QE agents emitting findings (defects, risks, coverage gaps, quality verdicts) whose single biggest trust problem is fabricated confidence — an LLM stating a pattern-matched guess in the same voice as a measured fact,

**facing** the absence of any per-finding evidence discipline in the report layer (verified 2026-06-11: shipped reports in `docs/qe-reports-3-6-3/` carry severity and impact but no evidence class; no `epistemic`/`evidence_level`/`verified_by` field exists in `src/types`), and inspired by Pattern Space's `⟦founded / defensible / conjecture / overreach⟧` per-claim label schema — whose 100% application across 101 files is what made its claims auditable in a single afternoon,

**we decided for** a mandatory `evidence` field on every finding emitted by QE agents and report generators, with four values: **EXECUTED** (reproduced by running a real command; output artifact attached), **STATIC** (derived from coverage/AST/lcov/lockfile data), **INFERRED** (LLM reasoning over code, no execution), **CONJECTURE** (pattern-matched heuristic or extrapolation) — enforced at the type level in the finding schema, instructed in every shipped `qe-*.md` agent definition, and consumed by quality gates: **only EXECUTED and STATIC findings may pass or block a release**; INFERRED findings route to the QCSD adversarial-verification stage (ADR-102) for promotion or demotion before they can gate anything,

**and neglected** a numeric confidence score (false precision — LLM self-reported confidence is uncalibrated; an enum of *evidence provenance* is checkable, a percentage is not), per-agent rather than per-finding labeling (the existing PR trust tiers already cover agents; the consumer of a report needs provenance at the finding level), and a free-text provenance field (unparseable, ungateable),

**to achieve** reports where every claim's epistemic weight is machine-readable, quality-gate verdicts that cannot rest on unverified inference, and a promotion pipeline (CONJECTURE → INFERRED → EXECUTED) that gives verification agents a defined job,

**accepting that** agents will need re-prompting discipline to label honestly (the label is itself LLM-emitted; the mitigation is spot-audit — a verifier re-runs a sample of EXECUTED claims and demotes agents whose labels lie, feeding the learning loop per ADR-110), and that existing stored reports remain unlabeled (no retroactive migration).

---

## Options Considered

### Option 1: Four-value evidence enum, gate-enforced (Selected)
**Pros:** provenance is checkable (an EXECUTED claim must carry its command + output); maps onto the existing trust-tier vocabulary; plugs directly into ADR-102's verification stage; cheap to implement (one field + gate filter + agent-definition edits).

### Option 2: Numeric confidence scores (Rejected)
**Why rejected:** uncalibrated self-reporting dressed as measurement — exactly the failure mode Pattern Space's v0.4 purged from its own docs ("illustrative numbers wearing a lab coat").

### Option 3: Status quo — severity-only findings (Rejected)
**Why rejected:** the AQE assessment of Pattern Space succeeded *because* the agents distinguished "recomputed from raw data" from "inferred from byte counts"; AQE's own products do not encode that distinction, so consumers can't.

## Implementation Sketch

1. Add `evidenceClass: 'EXECUTED' | 'STATIC' | 'INFERRED' | 'CONJECTURE'` (+ optional `evidenceArtifact`) to the finding types; require it in validation pipeline schemas. (Field named `evidenceClass`, not `evidence` — `StepResult.evidence: string[]` already exists with a different meaning.)
2. Quality-gate domain: filter gating inputs to EXECUTED/STATIC; INFERRED triggers verification dispatch.
3. Update shipped `qe-*.md` agent definitions (`.claude/agents/v3/` and `assets/agents/v3/`) with the labeling rule — protected as an invariant block per ADR-107.
4. Spot-audit worker: sample N EXECUTED findings per release, re-run their commands, record label fidelity into the learning DB.
