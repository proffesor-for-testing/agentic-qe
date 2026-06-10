# ADR-099: Reasoning-Tag Scrubbing for Pattern Embedding Sanitization

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-099 |
| **Status** | Implemented |
| **Date** | 2026-06-10 |
| **Author** | AQE Core (Fable 5 improvement initiative, issue #520) |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** the ReasoningBank learning pipeline (trajectory tracking, experience distillation, and HNSW pattern embeddings in `memory.db`),

**facing** reasoning-capable models (Fable 5 era) that emit large extended-thinking scratchpad blocks inside task results and step actions, which — embedded verbatim — contaminate the 384-dim pattern vectors and degrade retrieval quality,

**we decided for** a boundary-gated scrubber (`scrubReasoningBlocks` / `scrubReasoningDeep` in `src/shared/reasoning-scrub.ts`) applied at every learning-pipeline ingestion and embedding point,

**and neglected** scrubbing at each CLI/MCP entry flag (too many entry points, easy to miss new ones) and a one-time `memory.db` rewrite of historical rows (violates data-protection rules),

**to achieve** clean pattern embeddings whose signal reflects what a step actually did rather than how the model deliberated, with legacy rows cleaned as they flow forward through embedding backfill,

**accepting that** already-embedded contaminated vectors decay naturally rather than being purged, and a small per-write regex cost is added to trajectory persistence.

---

## Context

Adopted from ruflo's Hermes-Agent tier-1 audit (ruflo PR #2237, `scrubReasoningBlocks()` before DISTILL). AQE's pipeline embedded trajectory text as-is: `ExperienceReplay.storeExperience()` built embedding text from raw `task + strategy + keyActions`, `TrajectoryTracker.recordStep()` persisted raw `action`/`result` payloads, and the init-time embedding backfills re-embedded raw historical rows.

Fable 5 makes this acute: extended thinking is emitted far more often and at greater length than prior models, so every fleet run dilutes the patterns the self-learning loop depends on. The scrub is boundary-gated — only well-formed `<tag>…</tag>` pairs are removed, so prose that merely *mentions* a tag (e.g. test documentation about `<thinking>` blocks — common in a QE codebase) survives intact.

## Options Considered

### Option 1: Scrub at learning-pipeline ingestion + embedding points (Selected)

Sanitize inside `TrajectoryTracker` (task, step action, result data/error), `ExperienceReplay` (distillation, inserts, embedding backfills, query embeddings).

**Pros:**
- Single utility, applied where data crosses into persistence — new entry points (hooks, MCP, middleware) are covered automatically
- Backfill scrubbing cleans legacy rows as they get (re-)embedded, without rewriting `memory.db`
- Query-side scrub keeps retrieval symmetric with stored vectors

**Cons:**
- Regex cost on every step write (negligible: short-circuit on `<` absence)
- Stored historical text rows keep their scratchpads until re-embedded

### Option 2: Scrub at each CLI flag / MCP param (Rejected)

**Why rejected:** dozens of entry points (hooks, middleware, MCP tools) and every future one would need to remember the scrub; one missed path re-contaminates the bank.

### Option 3: One-time memory.db migration scrubbing historical rows (Rejected)

**Why rejected:** rewriting 1K+ irreplaceable learning records violates the project's data-protection rules for marginal benefit; forward-flow cleaning via backfill achieves the goal safely.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Relates To | ADR-051 | Agentic-Flow Integration | ReasoningBank/trajectory pipeline being sanitized |
| Relates To | ADR-061 | Asymmetric Learning Rates | Consumes the same pattern store |
| Relates To | ADR-071/081/090 | HNSW implementation | Embedding index whose quality this protects |
| Part Of | — | Fable 5 / ruflo-parity initiative | Tracking issue #520, improvement 1 |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| — | Scrubber implementation | Source | `src/shared/reasoning-scrub.ts` |
| — | Ingestion application | Source | `src/integrations/agentic-flow/reasoning-bank/trajectory-tracker.ts`, `experience-replay.ts` |
| — | Unit tests (15) | Tests | `tests/unit/shared/reasoning-scrub.test.ts` |
| — | ruflo prior art | External | ruvnet/ruflo PR #2237 (Hermes tier-1, reasoning scrub) |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| AQE Core | 2026-06-10 | Implemented | 2026-12-10 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-06-10 | From Fable 5 improvement plan (issue #520) |
| Implemented | 2026-06-10 | Scrubber + ingestion/backfill/query application + 15 unit tests |

---

## Definition of Done Checklist

- [x] Evidence: 15 unit tests green; tsc clean; boundary-gating verified (prose-mention tests)
- [x] Criteria: no `<thinking>` content reaches new embeddings; clean input returned byte-identical
- [x] Agreement: follows ruflo #2237 prior art per improvement plan
- [x] Documentation: this ADR + plan doc (`docs/implementation/fable5-improvement-plan.md`)
- [x] Review: verification record on issue #520
