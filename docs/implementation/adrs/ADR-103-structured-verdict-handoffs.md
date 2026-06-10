# ADR-103: Structured JSON-Schema Verdict Handoffs

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-103 |
| **Status** | Implemented |
| **Date** | 2026-06-10 |
| **Author** | AQE Core (Fable 5 improvement initiative, issue #520) |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** handoffs between QE agents and at MCP tool boundaries, which today exchange prose and ad-hoc JSON,

**facing** unverifiable agent outputs — a quality gate's "decision" is whatever shape the producing code happened to emit, so consumers (workflows, dashboards, downstream agents) cannot validate, retry, or rank what they receive,

**we decided for** versioned, additive-only verdict envelopes (`RiskDecision`, `FindingVerdict`, `CoverageGap`) with dependency-free TypeScript validators as the source of truth (`src/contracts/verdicts.ts`), mirrored as published draft-07 JSON Schemas (`schemas/*.schema.json`), validated at the MCP boundary before emission,

**and neglected** adding zod/ajv as runtime dependencies (the package deliberately keeps installs light; the envelope subset is simple enough for hand-rolled validators) and restructuring existing MCP payloads (breaking consumers — the envelope is attached additively),

**to achieve** machine-verifiable handoffs that workflow `agent({schema})` calls can enforce with auto-retry (improvement 5) and external tooling can validate with stock ajv,

**accepting that** validators and schemas are maintained in one module and kept in lockstep by contract tests, and that only the quality-gate boundary emits an envelope so far (finding/coverage envelopes ship with their producers in improvements 5/7).

---

## Context

Part of the Fable 5 plan's "SynthLang" thread: replace prose handoffs with explicit constraint-bearing structures. ruflo's neural-trader pipeline (RegimeVerdict → SignalProposal → RiskDecision as typed gates) is the prior art. The first wired boundary is `quality_assess`: `mapToResult` derives a `RiskDecision` from the gate outcome (passed → approve, failed → block, indeterminate → escalate), validates it, and attaches it additively — both the direct and wrapped MCP handlers flow through the same config, so MCP parity is inherent.

## Options Considered

### Option 1: Dependency-free validators + published JSON Schemas (Selected)

**Pros:** zero new runtime deps; validators boundary-grade and unit-tested; schemas consumable by ajv and workflow structured-output enforcement; additive envelopes can't break existing consumers
**Cons:** two artifacts to keep in sync (enforced by contract tests + the generator script)

### Option 2: zod + zod-to-json-schema (Rejected)

**Why rejected:** adds runtime dependencies to a package with a deliberate light-install posture (and a history of supply-chain audits); the schema subset needed here is trivial.

### Option 3: Extend ADR-075's framework type system (Rejected)

**Why rejected:** ADR-075 types describe test frameworks, not verdict envelopes; grafting envelopes there couples unrelated lifecycles. Relates-to, not part-of.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Relates To | ADR-075 | Unified Test Framework Type System | Adjacent type system, deliberately not extended |
| Relates To | ADR-054 | A2A Protocol | Verdicts ride inside A2A envelopes unchanged |
| Relates To | ADR-074 | Loki-Mode Adversarial Gates | `FindingVerdict.refutations` carries refuter votes (improvement 5) |
| Part Of | — | Fable 5 / ruflo-parity initiative | Tracking issue #520, improvement 6 |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| — | Contracts + validators + schemas | Source | `src/contracts/verdicts.ts` |
| — | Boundary wiring | Source | `src/mcp/handlers/domain-handler-configs.ts` (qualityAssess `mapToResult`) |
| — | Published schemas | Artifact | `schemas/{risk-decision,finding-verdict,coverage-gap}.schema.json` |
| — | Generator | Script | `scripts/generate-verdict-schemas.mjs` |
| — | Contract tests (17) | Tests | `tests/unit/contracts/verdicts.test.ts` |

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
| Implemented | 2026-06-10 | Contracts + quality-gate boundary + published schemas + 17 contract tests; ajv round-trip verified (golden valid, mutated invalid) |

---

## Definition of Done Checklist

- [x] Evidence: 17 contract tests green; emitted envelope from the compiled boundary builder validates with stock ajv against the published schema; mutated sample rejected
- [x] Criteria: 3 options compared; additive-only rule encoded (`additionalProperties: true`, envelope `contract` discriminator)
- [x] Agreement: follows the improvement plan; ruflo typed-gate prior art
- [x] Documentation: this ADR; generator workflow documented in the script header
- [x] Review: verification record on issue #520
