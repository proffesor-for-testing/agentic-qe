# ADR-078: Backward-Compatible Multi-Language API Extension

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-078 |
| **Status** | Accepted & Implemented |
| **Date** | 2026-03-04 |
| **Author** | AQE Architecture Team |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** extending the `IGenerateTestsRequest` API to support 10 programming languages while maintaining backward compatibility with ~14,000 existing tests and all MCP clients,

**facing** the constraint that the current API hardcodes `framework` as a required field with only 5 values and has no `language` field, meaning all new language support requires API changes that could break existing consumers,

**we decided for** extending `IGenerateTestsRequest` with optional `language`, `projectRoot`, `compileValidation`, and `maxCompileRetries` fields, making `framework` optional (auto-detected from language when omitted), and adding language auto-detection from file extensions and project files (pom.xml, Cargo.toml, go.mod, etc.),

**and neglected** (1) creating a new v2 API version, (2) making the language parameter required, and (3) fully automatic detection with no explicit control,

**to achieve** zero breaking changes for existing callers, intuitive defaults for new language users (just pass `sourceFiles` and `testType`), explicit override capability for edge cases, and a single API surface rather than versioned endpoints,

**accepting that** the auto-detection logic adds complexity, detection can be wrong for polyglot projects (mitigated by explicit `language` override), and the growing number of optional fields may make the interface harder to document.

---

## Context

The current `IGenerateTestsRequest` interface requires callers to specify a `framework` from exactly 5 values: `jest`, `vitest`, `mocha`, `pytest`, or `node-test`. There is no `language` field because the system only supports TypeScript/JavaScript and Python. Adding 8 new languages requires both a `language` discriminator and an expanded framework set.

AQE has approximately 14,000 tests and an unknown number of MCP client integrations that depend on the current API shape. Breaking changes would require all consumers to update simultaneously, which is impractical for an npm-distributed package. The multi-language upgrade plan (Section 2.0.2) specifies that all new fields must be optional and all existing call patterns must continue to work without modification.

The auto-detection strategy uses a layered approach: (1) file extensions map to languages (`.java` to Java, `.rs` to Rust), (2) project files in `projectRoot` disambiguate (presence of `pom.xml` confirms Java/Maven, `Cargo.toml` confirms Rust), and (3) `DEFAULT_FRAMEWORKS` maps each language to its most common test framework. This means a caller can simply pass `{ sourceFiles: ['src/Main.java'], testType: 'unit' }` and get JUnit 5 tests without specifying language or framework.

---

## Options Considered

### Option 1: Optional Field Extension with Auto-Detection (Selected)

Add `language?`, `projectRoot?`, `compileValidation?`, and `maxCompileRetries?` as optional fields. Make `framework` optional (was required). When omitted, detect language from file extensions and infer framework from language defaults. Apply `FRAMEWORK_ALIASES` for legacy values.

**Pros:**
- Zero breaking changes; all existing callers work without modification
- New language users get sensible defaults with minimal configuration
- Explicit overrides available for edge cases (polyglot projects, non-standard frameworks)
- Single API surface; no version management complexity
- MCP tool schema can accept new fields immediately without breaking existing tool calls

**Cons:**
- Auto-detection adds code complexity and potential for incorrect inference
- Growing number of optional fields makes the interface wider
- Default framework choice may not match user preference (mitigated by explicit override)

### Option 2: New API Version (v2) (Rejected)

Create a separate `IGenerateTestsRequestV2` interface with language as a required field. Maintain both v1 and v2 endpoints.

**Why rejected:** Forces all consumers to migrate to v2 to use new languages, creates maintenance burden of two parallel APIs, and the v1 API would need to be maintained indefinitely since removing it is a breaking change.

### Option 3: Language Parameter Required (Rejected)

Add `language` as a required field on the existing interface.

**Why rejected:** Immediately breaks all existing callers that do not pass `language`. The 14,000+ existing tests and MCP integrations would all need updating, which is unacceptable for what should be an additive feature.

### Option 4: Fully Automatic Detection with No Explicit Control (Rejected)

Detect everything from source file content and project structure, with no `language` or `framework` parameters.

**Why rejected:** Users need override capability. A `.jsx` file could be React or React Native. A TypeScript file could need Jest or Vitest. A Kotlin file could need JUnit or Kotest. Without explicit control, users have no recourse when auto-detection is wrong.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-005 | AI-First Test Generation | Extends the core test generation API defined by this ADR |
| Depends On | ADR-075 | Unified TestFramework Type System | `TestFramework`, `SupportedLanguage` types used in the API |
| Relates To | ADR-077 | Compilation Validation Loop | `compileValidation` and `maxCompileRetries` fields enable the validation loop |
| Relates To | ADR-079 | Language-Specific Test File Path Resolution | Auto-detected language determines file path conventions |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| PLAN-078-A | Multi-Language Test Generation Plan | Technical Spec | [docs/multi-language-test-generation-plan.md](../../multi-language-test-generation-plan.md) |

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
- [ ] **E - Evidence**: Auto-detection logic validated against sample projects in all 10 target languages
- [ ] **C - Criteria**: 4 options compared (optional extension, v2 API, required language, fully automatic)
- [ ] **A - Agreement**: MCP tool owners, test-generation domain owners, and downstream consumers consulted
- [ ] **D - Documentation**: WH(Y) statement complete, ADR published
- [ ] **R - Review**: Review cadence set (6 months), architecture team assigned

### Extended
- [ ] **Dp - Dependencies**: ADR-005, ADR-075, ADR-077, ADR-079 relationships documented
- [ ] **Rf - References**: Plan document linked
- [ ] **M - Master**: Part of Multi-Language Test Generation initiative (ADR-075 through ADR-079)
