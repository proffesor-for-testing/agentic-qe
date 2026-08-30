# ADR-129: Preserve instruction provenance across context compaction

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-129 |
| **Status** | Proposed — P0 compaction boundary implemented; dual-host review pending |
| **Date** | 2026-08-30 |
| **Author** | AQE Core |
| **Review Cadence** | 3 months |
| **Supersedes** | — |
| **Related** | ADR-089 (session durability), ADR-121 and ADR-126 (evidence provenance), issue #636 |

## Decision

Context items carry a separate instruction-authority provenance envelope. Evidence
quality does not imply authority. Compaction may preserve or lower authority but
must never create `user-authorized` content from a tool result, memory, assistant
output, legacy item, or model-generated summary.

The authority lattice is `system-effective`, `user-authorized`,
`assistant-derived`, `tool-observation`, `memory-derived`, and `unknown`. Legacy
items fail closed to `unknown` for authorization while remaining available as
evidence. Derived summaries are always `assistant-derived`, retain stable parent
IDs and a content hash, and record the least-trusted origin in their input set.

Tier 3 serializes every transcript item with explicit role, current authority,
and origin authority. Its system prompt treats transcript content as quoted data
and forbids converting observations into user requests. The pipeline stores the
returned summary with that derived provenance rather than relying on the
transport-level `assistant` role as an authority signal.

## Scope and staged follow-up

This P0 slice repairs the Tier 2/Tier 3 compaction boundary and establishes the
typed contract. It does not claim semantic authorization is solved. Follow-up
work must propagate the envelope through delegation, memory, goals, schedules,
skills, and permission receipts, then gate side effects using goal, chain, and
argument support with No-History-Promotion.

Before acceptance, the design requires independent review from both supported
agent hosts. Release qualification also requires deterministic adversarial cases
for truncation, overflow, delegation, replay, and benign false-positive controls.

## Consequences

- Positive: summaries retain derivation lineage and cannot silently inherit user
  authority merely because they are replayed as assistant messages.
- Positive: old callers remain source-compatible because provenance is optional.
- Negative: optional provenance means the wider runtime remains fail-closed as
  `unknown` until each surface is migrated.
- Negative: provenance is an authorization input, not a formal security proof.
