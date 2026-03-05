# ADR-079: Language-Specific Test File Path Resolution

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-079 |
| **Status** | Accepted & Implemented |
| **Date** | 2026-03-04 |
| **Author** | AQE Architecture Team |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** generating test files for 10 programming languages, each with distinct conventions for where tests live, how test files are named, and how test runners discover them,

**facing** the reality that placing generated tests in the wrong directory or with the wrong naming pattern means they will not be discovered or executed by the language's standard test runner,

**we decided for** a `TestFileResolver` service with per-language `TestFileConvention` definitions that determine test output paths based on language-specific conventions (Java: `src/test/java/` mirror structure, Go: `*_test.go` alongside source, Rust: inline `#[cfg(test)]` modules, C#: separate `.Tests` project, Swift: `Tests/` directory, etc.),

**and neglected** (1) always placing tests alongside source files, (2) requiring users to specify the output path, and (3) a single configurable pattern for all languages,

**to achieve** generated tests that are immediately discoverable and runnable by standard build tools (Maven, Gradle, `go test`, `cargo test`, `dotnet test`, `swift test`, `flutter test`) without manual file relocation, convention compliance that matches what developers expect in each ecosystem, and special handling for Rust's unique inline-test pattern,

**accepting that** the resolver must understand build tool conventions (Maven vs. Gradle, single-module vs. multi-module), some projects may use non-standard layouts requiring user overrides, and Rust's inline test mode requires modifying the source file rather than creating a separate test file.

---

## Context

Each programming language ecosystem has evolved its own conventions for test file organization. These conventions are not arbitrary preferences; they are enforced by build tools and test runners. Maven expects Java tests under `src/test/java/` mirroring the `src/main/java/` package structure. Go requires test files to be named `*_test.go` in the same directory as the code under test. Rust uniquely places unit tests inside the source file itself using `#[cfg(test)]` modules. C# projects typically use a separate `ProjectName.Tests` project. Dart/Flutter uses a `test/` directory mirroring `lib/`.

AQE currently generates test files using a simple convention: append `.test.ts` or `.spec.ts` to the source filename and place it alongside or in a `__tests__` directory. This works for JavaScript/TypeScript but violates conventions for every other target language. A Java test placed at `src/main/java/com/example/FooTest.java` instead of `src/test/java/com/example/FooTest.java` will not be found by Maven or Gradle. A Go test named `foo_spec.go` instead of `foo_test.go` will not be executed by `go test`.

The multi-language upgrade plan (Section 2.6) defines `TestFileConvention` structures for each language. The `TestFileResolver` selects the appropriate convention based on the detected or specified language and the project structure (presence of `pom.xml`, `build.gradle`, `Cargo.toml`, `go.mod`, etc.), then computes the correct output path.

---

## Options Considered

### Option 1: TestFileResolver with Per-Language Conventions (Selected)

Implement a `TestFileResolver` that maps each `SupportedLanguage` to a `TestFileConvention` defining: naming pattern (e.g., `*_test.go`, `*Test.java`), location strategy (alongside, mirror directory, inline, separate project), and build tool awareness (Maven/Gradle detection, Cargo workspace detection). The resolver computes the output path given a source file path, language, and project root.

**Pros:**
- Generated tests are immediately runnable by standard build tools
- Matches developer expectations for each language ecosystem
- Build tool detection (Maven vs. Gradle, single vs. multi-module) produces correct paths
- Handles Rust's unique inline test pattern as a special case
- Extensible: new languages add a convention definition without changing resolver logic

**Cons:**
- Must understand multiple build tool layouts (complexity)
- Non-standard project structures may produce incorrect paths (mitigated by user override)
- Rust inline tests require source file modification, a fundamentally different operation than file creation
- Convention detection may fail for projects with custom directory structures

### Option 2: Always Place Tests Alongside Source (Rejected)

Use a universal convention: place `<filename>.test.<ext>` next to every source file, regardless of language.

**Why rejected:** Violates Java, C#, Dart, and Swift conventions. Tests placed alongside Java source files in `src/main/java/` will not be found by Maven or Gradle. C# tests alongside source require `csproj` file modifications. Convention violations mean generated tests cannot be run without manual relocation.

### Option 3: User-Specified Output Path (Rejected)

Require the user to provide the exact output path for every generated test file.

**Why rejected:** Too much friction for the common case. Most users want convention-based defaults. Requiring explicit paths for every test file defeats the purpose of automated generation and forces users to know the conventions themselves.

### Option 4: Single Configurable Pattern (Rejected)

Allow one configurable pattern like `{testDir}/{sourceFile}.test.{ext}` that applies to all languages.

**Why rejected:** Cannot handle Rust's inline test requirement (tests go inside the source file, not a separate file). Cannot handle Go's naming mandate (`*_test.go`, not `*.test.go`). Cannot handle Java's mirror directory structure. A single pattern is fundamentally insufficient for the diversity of language conventions.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-005 | AI-First Test Generation | Test file paths are part of the generation output |
| Relates To | ADR-036 | Language-Aware Result Persistence | Persisted results reference test file paths that must follow conventions |
| Depends On | ADR-075 | Unified TestFramework Type System | `SupportedLanguage` type determines which convention to apply |
| Depends On | ADR-076 | tree-sitter WASM Multi-Language Parser Integration | Parser detects language and project structure |
| Relates To | ADR-078 | Backward-Compatible Multi-Language API Extension | `projectRoot` field enables build tool detection for path resolution |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| PLAN-079-A | Multi-Language Test Generation Plan | Technical Spec | [docs/multi-language-test-generation-plan.md](../../multi-language-test-generation-plan.md) |

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
- [ ] **E - Evidence**: Convention rules validated against real Maven, Gradle, Cargo, Go, and Flutter projects
- [ ] **C - Criteria**: 4 options compared (per-language resolver, alongside, user-specified, single pattern)
- [ ] **A - Agreement**: QE domain owners and build/CI specialists consulted
- [ ] **D - Documentation**: WH(Y) statement complete, ADR published
- [ ] **R - Review**: Review cadence set (6 months), architecture team assigned

### Extended
- [ ] **Dp - Dependencies**: ADR-005, ADR-036, ADR-075, ADR-076, ADR-078 relationships documented
- [ ] **Rf - References**: Plan document linked
- [ ] **M - Master**: Part of Multi-Language Test Generation initiative (ADR-075 through ADR-079)
