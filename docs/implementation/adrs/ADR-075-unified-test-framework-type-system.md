# ADR-075: Unified TestFramework Type System

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-075 |
| **Status** | Accepted & Implemented |
| **Date** | 2026-03-04 |
| **Author** | AQE Architecture Team |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** extending AQE test generation to support 8+ new programming languages and their test frameworks,

**facing** two divergent `TestFramework` type definitions (routing layer with 14 values at `src/routing/types.ts` line 36 and test-generation layer with 5 values at `src/domains/test-generation/interfaces.ts` line 132) that overlap but differ, causing potential runtime mismatches and no compile-time safety across domain boundaries,

**we decided for** a single canonical type definition at `src/shared/types/test-frameworks.ts` that exports `TestFramework` (all generatable frameworks), `E2EFramework` (routing-only browser/E2E frameworks), `SupportedLanguage`, and `FRAMEWORK_ALIASES` for backward compatibility,

**and neglected** (1) keeping separate types with runtime casts between layers, and (2) merging all values into the routing layer type,

**to achieve** compile-time type safety across all domain boundaries, a single place to add new language frameworks, clean separation between generatable and routing-only frameworks, and backward compatibility via alias mapping,

**accepting that** all existing imports of `TestFramework` from both `routing/types.ts` and `test-generation/interfaces.ts` must be updated to re-export from the shared location, requiring a coordinated migration across both bounded contexts.

---

## Context

AQE currently defines `TestFramework` in two separate locations serving two different bounded contexts. The test-generation domain defines 5 frameworks (`jest`, `vitest`, `mocha`, `pytest`, `node-test`) that it can actually generate tests for. The routing domain defines 14 values including E2E frameworks (`playwright`, `cypress`, `selenium`) and language-specific frameworks (`junit`, `go-test`, `rust-test`) that have zero generator implementations.

When a routing decision selects `junit` as the framework and passes it to the test generation domain, TypeScript cannot catch the type mismatch at compile time because they are independently defined string literal unions. This has not caused production failures yet only because routing currently defaults to Jest for unsupported languages, but the multi-language upgrade will make this a real issue as `junit5`, `xunit`, `go-test`, and `rust-test` become valid generation targets.

The multi-language upgrade plan (see `docs/multi-language-test-generation-plan.md` Section 2.0.1) adds 12 new framework values and a `SupportedLanguage` type. Without unification, these would need to be added to both type definitions and kept in sync manually, which is fragile and violates DDD's shared kernel pattern.

---

## Options Considered

### Option 1: Shared Canonical Type at `src/shared/types/test-frameworks.ts` (Selected)

Create a single source-of-truth module exporting `TestFramework`, `E2EFramework`, `SupportedLanguage`, and `FRAMEWORK_ALIASES`. Both the routing and test-generation domains re-export from this shared location. Legacy values like `'junit'` (used by routing) are mapped to canonical values like `'junit5'` (used by generation) via the alias table.

**Pros:**
- Compile-time type safety across all domain boundaries
- Single location to add new frameworks when supporting new languages
- Clean separation: `TestFramework` for generation targets, `E2EFramework` for routing-only
- `FRAMEWORK_ALIASES` provides explicit, testable backward compatibility

**Cons:**
- Requires updating all existing imports (mechanical but widespread)
- Introduces a shared kernel dependency between two bounded contexts

### Option 2: Keep Separate Types with Runtime Casting (Rejected)

Maintain independent `TestFramework` definitions in each domain. Add runtime validation at the boundary where routing passes a framework to generation.

**Why rejected:** No compile-time safety. Runtime casts are fragile and easy to forget when adding new frameworks. Violates the DRY principle for a type that fundamentally represents the same concept.

### Option 3: Merge Everything into Routing Types (Rejected)

Move all framework values into `src/routing/types.ts` and have test-generation import from there.

**Why rejected:** Couples the test-generation domain to routing infrastructure, violating DDD bounded context boundaries. The generation domain should not depend on routing for its core type definitions.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-005 | AI-First Test Generation | Defines the test generation domain where one of the divergent types lives |
| Relates To | ADR-022 | Adaptive QE Agent Routing | Defines the routing domain where the other divergent type lives |
| Relates To | ADR-076 | tree-sitter WASM Multi-Language Parser Integration | New parsers will produce `SupportedLanguage` values from this type system |
| Relates To | ADR-078 | Backward-Compatible Multi-Language API Extension | API changes depend on this unified type system |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| PLAN-075-A | Multi-Language Test Generation Plan | Technical Spec | [docs/multi-language-test-generation-plan.md](../../multi-language-test-generation-plan.md) |

---

## Governance

| Review Board | Date | Outcome | Next Review |
|--------------|------|---------|-------------|
| AQE Architecture Team | 2026-03-04 | Proposed | 2026-09-04 |

---

## Status History

| Status | Date | Notes |
|--------|------|-------|
| Proposed | 2026-03-04 | Initial creation as part of multi-language test generation initiative |

---

## Definition of Done Checklist

Before requesting approval, verify:

### Core (ECADR)
- [ ] **E - Evidence**: Type divergence documented with concrete file locations and line numbers
- [ ] **C - Criteria**: 3 options compared (shared type, runtime cast, merge into routing)
- [ ] **A - Agreement**: Routing and test-generation domain owners consulted
- [ ] **D - Documentation**: WH(Y) statement complete, ADR published
- [ ] **R - Review**: Review cadence set (6 months), architecture team assigned

### Extended
- [ ] **Dp - Dependencies**: ADR-005, ADR-022, ADR-076, ADR-078 relationships documented
- [ ] **Rf - References**: Plan document linked
- [ ] **M - Master**: Part of Multi-Language Test Generation initiative (ADR-075 through ADR-079)
