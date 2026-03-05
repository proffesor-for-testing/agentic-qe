# ADR-077: Compilation Validation Loop for Generated Tests

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-077 |
| **Status** | Proposed |
| **Date** | 2026-03-04 |
| **Author** | AQE Architecture Team |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** AI-generated test code for type-strict languages (Java, C#, Rust, Go) where compilation failures are common,

**facing** the problem that generated tests frequently contain type errors, missing imports, and syntax issues that prevent them from running, significantly reducing the value of test generation for non-dynamic languages,

**we decided for** an optional compile-validate-repair loop that checks generated test code against the target language compiler (e.g., `javac`, `dotnet build`, `cargo check`, `go vet`), feeds compilation errors back to the LLM for repair, and retries up to a configurable maximum (default 3), with the feature opt-in via `compileValidation: false` by default and graceful degradation when the compiler is unavailable,

**and neglected** (1) no validation (current approach), (2) mandatory validation that blocks generation, and (3) static analysis / lint-only validation,

**to achieve** significantly higher test quality for compiled languages (research indicates 30-50% improvement from compile-repair loops), actionable feedback when tests fail to compile, and parity with commercial tools like Diffblue Cover that guarantee compilability,

**accepting that** validation requires the target language compiler to be installed on the host machine, each retry costs an additional LLM call (up to 3x cost for worst-case), the feature adds latency (2-15 seconds per retry depending on language), and some compilation errors may be unfixable by the LLM within the retry budget.

---

## Context

AI-generated tests for statically-typed languages frequently fail to compile. Common issues include incorrect import paths, wrong type annotations, missing generic parameters, and API misuse. For dynamic languages like Python and JavaScript, tests can at least be attempted even with errors. For Java, C#, Rust, and Go, a single compilation error renders the entire test file unusable.

Research from ICSE 2025 (EvoGPT) demonstrates that compile-repair loops improve generated test quality by 30-50%. The loop is straightforward: generate code, attempt compilation, extract error messages, feed errors back to the LLM as context, and regenerate. Most compilation issues are resolved within 1-2 retries.

The current AQE test generation pipeline has no validation step. Generated tests are returned as-is, with no indication of whether they would compile or run. This is acceptable for the current TS/JS-only scope (where tests are interpreted), but becomes a critical quality gap when targeting compiled languages. The multi-language upgrade plan (Section 2.5) specifies this as a Phase 3 feature.

---

## Options Considered

### Option 1: Optional Compile-Validate-Repair Loop (Selected)

Implement a `CompilationValidator` that attempts to compile generated test code using the target language's compiler. On failure, extract error messages, append them to the LLM prompt as repair context, and retry generation. The loop runs up to `maxCompileRetries` times (default 3). The feature is opt-in (`compileValidation: false` by default) and gracefully skips when the compiler is not found in PATH.

**Pros:**
- 30-50% quality improvement for compiled languages (per research)
- Opt-in design means zero impact on existing TS/JS workflows
- Graceful degradation: no compiler installed means tests are still generated (just unvalidated)
- Error messages from real compilers are highly specific and actionable for LLM repair
- Configurable retry budget balances quality vs. cost

**Cons:**
- Requires target compiler installed on host (not always available in CI)
- Each retry costs an additional LLM call (up to 3x cost worst-case)
- Adds 2-15 seconds latency per retry
- Some errors are fundamentally unfixable by LLM (missing project dependencies)

### Option 2: No Validation (Rejected)

Continue current approach: return generated test code without any compilation check.

**Why rejected:** Acceptable for dynamic languages but produces unusable output for Java, C#, Rust, and Go. Users must manually fix compilation errors, negating much of the value of automated test generation.

### Option 3: Mandatory Validation (Rejected)

Require compilation validation for all generated tests, blocking output if the compiler is unavailable.

**Why rejected:** Would prevent test generation entirely when compilers are not installed, which is common in lightweight CI environments and when analyzing code in a language the developer does not have locally. The opt-in approach is strictly better.

### Option 4: Static Analysis / Lint Only (Rejected)

Use language-specific linters (ESLint, Clippy, golangci-lint) instead of full compilation.

**Why rejected:** Linters catch style and some semantic issues but miss the most critical problems: type errors, missing imports, and incorrect API usage. A linter pass cannot determine whether `import com.example.Foo` resolves to an actual class. Only the real compiler provides this guarantee.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-005 | AI-First Test Generation | Validation loop wraps the existing generation pipeline |
| Relates To | ADR-051 | Agentic-Flow Deep Integration | LLM routing for repair calls uses the same provider system |
| Depends On | ADR-078 | Backward-Compatible Multi-Language API Extension | `compileValidation` and `maxCompileRetries` fields defined in the API |
| Relates To | ADR-076 | tree-sitter WASM Multi-Language Parser Integration | Parser identifies language to select appropriate compiler command |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| PLAN-077-A | Multi-Language Test Generation Plan | Technical Spec | [docs/multi-language-test-generation-plan.md](../../multi-language-test-generation-plan.md) |

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
- [ ] **E - Evidence**: EvoGPT (ICSE 2025) research validates compile-repair loop efficacy; Diffblue Cover prior art
- [ ] **C - Criteria**: 4 options compared (opt-in loop, no validation, mandatory, lint-only)
- [ ] **A - Agreement**: QE domain owners and LLM infrastructure team consulted
- [ ] **D - Documentation**: WH(Y) statement complete, ADR published
- [ ] **R - Review**: Review cadence set (6 months), architecture team assigned

### Extended
- [ ] **Dp - Dependencies**: ADR-005, ADR-051, ADR-076, ADR-078 relationships documented
- [ ] **Rf - References**: Plan document and research citations linked
- [ ] **M - Master**: Part of Multi-Language Test Generation initiative (ADR-075 through ADR-079)
