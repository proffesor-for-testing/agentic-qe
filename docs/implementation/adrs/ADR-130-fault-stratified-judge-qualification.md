# ADR-130: Qualify LLM judges by fault slice before automation

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-130 |
| **Status** | Proposed — P0 calibration contract implemented; corpus review pending |
| **Date** | 2026-08-30 |
| **Author** | AQE Core |
| **Review Cadence** | 3 months |
| **Supersedes** | — |
| **Related** | ADR-113, ADR-117, ADR-119, ADR-120, ADR-121, ADR-124, issue #635 |

## Decision

An aggregate judge score cannot authorize automation. AQE calibration reports
fault-type, domain, and severity slices with support, precision, recall,
false-kill, false-keep, uncertainty, and 95% Wilson intervals. A configurable
minimum support produces `abstain`; weak confidence-bounded recall or excessive
false-kill produces `human-review`; only supported slices meeting policy may
`automate`.

A failed critical/high severity slice makes the judge unqualified even when the
global result is strong. Non-critical unsupported or weak slices restrict the
judge to the explicitly automated slices. Deterministic and executed oracles
remain higher provenance than a judge verdict.

The existing `calibrate(labeled, options)` call remains compatible. Metadata and
qualification policy are additive, and callers may opt into stricter thresholds
through a third argument.

## Consequences and remaining gates

- Positive: Simpson-style aggregate masking becomes visible and enforceable.
- Positive: small samples fail safe instead of reporting unstable point estimates.
- Negative: qualification coverage is limited by corpus diversity and label quality.
- Remaining: freeze and independently review the controlled-intervention corpus;
  persist judge/prompt/config/corpus hashes; add ranking fidelity and perturbation
  lanes; expose CLI/JSON artifacts; establish scheduled multi-backbone evaluation.

This ADR remains Proposed until the corpus and operational thresholds receive
independent review. The P0 library output is diagnostic and must not by itself
be wired to irreversible promotion or release decisions.
