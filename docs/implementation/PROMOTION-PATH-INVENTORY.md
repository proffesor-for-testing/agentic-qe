# Promotion-Path Inventory (ADR-120 first implementation task)

**Date:** 2026-07-07 · **Author:** AQE Core · **Scope:** every code path that changes fleet behavior by promoting/applying a learning artifact. Feeds ADR-120 (gateReExecutes), ADR-121 (provenance tiers), ADR-118 (flywheel accept).

Verified against `agentic-qe@3.11.5`, `working-july`, live `.agentic-qe/memory.db` (158 `qe_patterns` rows).

## Paths

| # | Path | Decision site | Write site | Sealed today? | Tier-gated today? |
|---|------|---------------|-----------|---------------|-------------------|
| P1 | **Pattern promotion** (short-term → long-term) | `src/learning/pattern-lifecycle.ts:524` `checkPromotion()` → `:551` `shouldPromote` | `:565` `promotePattern()` → `UPDATE qe_patterns SET tier='long-term', promotion_date=…` (`:572`) | No | No — reward/occurrence/success-rate/activity only; **no `provenance_tier` check** |
| P2 | **Dream-insight apply** (A8-EXT home) | `src/coordination/mincut/dream-integration.ts` insight loop | `:1405` `applied:` flag on `dream_insights` | No | No — this is the fake-`applied`-counter class ADR-120 targets |
| P3 | **GOAP action promotion** | no dedicated `promot*` site found; promotion is implicit in the GOAP executor dispatch (ADR-014/GOAP A14) | executor apply | No | No |
| P4 | **Distillation promotion** (ADR-121/ruflo ADR-174 analogue) | not yet present in AQE | — | — | — (net-new with ADR-121) |
| P5 | **Flywheel accept()** | net-new (ADR-118) | net-new | Will seal via ADR-116 | Will gate on tier (ADR-121) |

## Edge/overclaim surfaces (ADR-121 §3 overclaim guard)

`concept_edges`, `pattern_relationships`, `hypergraph_edges` — inferred relations that must be written `proxy:structural`, low confidence, `promoted=false`, and never labelled with a stronger relation type than evidence supports (ruflo's `causal_edges` → `cooccurrence` lesson).

## Schema facts (live DB)

- `qe_patterns` already has `tier` (lifecycle: `short-term`/`long-term`), `confidence`, `promotion_date`, `consecutive_failures` — **but no `provenance_tier`**. ADR-121 adds a distinct `provenance_tier` column (do NOT overload the lifecycle `tier`).
- `PatternLifecycleManager.ensureSchema` (`:255-275`) already uses the idempotent in-code `SELECT col … catch → ALTER TABLE ADD COLUMN` idiom — the safe additive migration pattern ADR-121 §5 mandates. Reuse it verbatim for `provenance_tier`.

## Retrofit order (implementation)

1. **P1** — add `provenance_tier` column + gate `shouldPromote` on `oracle:test-exec` (ADR-121), then wrap `promotePattern` write with sealed-input re-execute (ADR-120). Highest-traffic, best-understood path → do first.
2. **P2** — dream apply: seal + re-execute (closes A8-EXT structurally), tier the insight.
3. **P5** — flywheel accept() is built sealed + gated from the start (ADR-118).
4. **P3/P4** — GOAP + distillation once the shared `reExecuteGate` primitive exists.

## Shared primitive to build first

`src/validation/gate-reexecute.ts` — `reExecuteGate(ruleVersion, sealedInputs) → verdict` + `gateUnchanged` fingerprint check, conforming to `@metaharness/flywheel` `verifyReplayBundle` semantics (`/workspaces/agent-harness-generator/packages/flywheel/src/replay.ts:66-90`). Composes with `src/integrations/ruvector/proof-gate.ts` `HashChainGate` (ADR-116) for sealing. Every path above consumes it.
