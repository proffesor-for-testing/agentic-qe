# Interaction Benchmark — RUBRIC v1 (pre-registered)

**Status: PRE-REGISTERED per ADR-108 — committed before any result generation.**
The git hash of this file is recorded in every result row; changing this file
mid-run voids the run (archive partial data with the abandonment reason).

## What is measured

Whether a QE agent's qualitative output (review feedback, diagnosis) **moves a
simulated developer to fix a seeded defect** — measured primarily by ground
truth, secondarily by judged dimensions.

## Primary outcome (ground truth — no judge involved)

After an N-turn conversation with the agent-under-test, the interactor
(simulated developer) attempts a fix. The scenario's **hidden acceptance test**
(never shown to either party) is executed against the fixture:

- `fix_passes_hidden_test`: boolean, per conversation. THE headline metric.

## Secondary dimensions (judged, 1–10)

| Dimension | Definition |
|---|---|
| diagnostic_precision | Feedback targeted THIS defect in THIS code, not generic advice |
| developer_movement | The developer's own follow-ups show converging understanding |
| actionability | The developer could act without re-asking for basics |

## Judge protocol (style-neutral by construction — the Pattern Space lesson)

Verbatim judge instruction (part of this pre-registration; the runner MUST use
this text unmodified):

> You are comparing two assistant transcripts, X and Y, helping the same
> developer with the same code problem. Judge only the value delivered to the
> developer: did they end closer to understanding and fixing their actual
> problem? Ignore word count, formatting style, and persona entirely — neither
> longer nor shorter, neither structured nor conversational, is better in
> itself. Write a two-sentence analysis of what each developer gained before
> scoring. Score each dimension 1-10 per transcript, then name the overall
> winner: "X", "Y", or "tie".

Hard rules:
- No mention to the judge that any arm is special, treated, verbose,
  multi-perspective, or otherwise distinctive — in either direction.
- Judge family MUST differ from the agent-under-test family (ADR-043 routing).
  Fallback if no cross-family judge is available: same-family judging is
  allowed but the run's headline MUST be labeled evidenceClass=INFERRED and
  the judge-independence gap stated in the report.
- Two independent judging passes per item; per-item agreement published.
- X/Y assignment seeded per item id (deterministic counterbalance), never
  unseeded random.

## Aggregation & reporting (pre-registered)

- Rows failing `isGoodRow` (errors, incomplete turns, no-winner) are excluded
  by the aggregation code itself, not by manual cleanup.
- Headline: `fix_passes_hidden_test` rate per arm, with per-scenario breakdown.
- Judged comparisons: **scenario-clustered sign test** (majority winner per
  scenario; ties dropped; exact two-sided binomial) — pooled row counts may be
  shown only alongside the clustered result.
- All rows (including losing/null results) are committed. Abandoned runs keep
  their partial data in `archive/` with the reason.

## Changelog

- v1 (2026-06-11): initial pre-registration. No prior version; no data exists
  at registration time (verifiable: this file's commit precedes any
  `results-*` artifact in git history).
