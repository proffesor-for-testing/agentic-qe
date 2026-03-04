# ADR-076: tree-sitter WASM Multi-Language Parser Integration

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-076 |
| **Status** | Proposed |
| **Date** | 2026-03-04 |
| **Author** | AQE Architecture Team |
| **Review Cadence** | 6 months |

---

## WH(Y) Decision Statement

**In the context of** extending AQE code analysis and test generation to Java, C#, Go, Rust, Swift, Kotlin, Dart, and fixing the Python stub-only gap,

**facing** the need to parse 8+ new languages for function extraction, class discovery, and structural analysis without requiring users to install language-specific toolchains,

**we decided for** `web-tree-sitter` (WASM) as the universal syntactic parser behind an `ILanguageParser` abstraction interface, while retaining the TypeScript Compiler API for TS/JS semantic analysis,

**and neglected** (1) language-specific native parsers (JavaParser, Roslyn, etc.), (2) regex-only heuristics, and (3) LSP-based parsing,

**to achieve** accurate syntactic parsing for all target languages with zero native dependencies, portable WASM execution, a single abstraction interface for all parsers, and incremental language addition by loading new `.wasm` grammar files,

**accepting that** tree-sitter provides syntactic but not semantic analysis (no type resolution, no cross-file imports), WASM grammars add approximately 2-5 MB to the package per language, and initial grammar loading has a one-time ~100ms cold start.

---

## Context

AQE currently parses source code exclusively through the TypeScript Compiler API (`ts.createSourceFile`), which provides both syntactic and semantic analysis for TypeScript and JavaScript. Python files are recognized but produce only stub tests because the TS compiler cannot parse Python syntax. The remaining 8 target languages (Java, C#, Go, Rust, Swift, Kotlin, Dart, React Native/JSX) have no parsing support at all.

For test generation, AQE needs to extract function signatures, class hierarchies, method bodies, and import structures from source files. The TypeScript Compiler API excels at this for TS/JS because it provides full semantic information (type resolution, symbol tables). However, no single tool provides equivalent semantic depth for all 8+ languages.

tree-sitter is a parser generator that produces WASM-compiled parsers for 100+ languages. Its `web-tree-sitter` package runs in any Node.js environment without native compilation. While it produces concrete syntax trees (CST) rather than semantically-resolved ASTs, the structural information (function declarations, class definitions, parameter lists) is sufficient for test generation prompt construction. The TypeScript Compiler API remains the best choice for TS/JS where semantic depth matters for quality.

---

## Options Considered

### Option 1: web-tree-sitter (WASM) with ILanguageParser Abstraction (Selected)

Use `web-tree-sitter` for all non-TS/JS languages. Define an `ILanguageParser` interface that both the tree-sitter adapter and the existing TS compiler adapter implement. Each language gets a tree-sitter `.wasm` grammar file loaded on demand.

**Pros:**
- Zero native dependencies; WASM runs everywhere Node.js runs
- 100+ language grammars available, only load what is needed
- Single interface (`ILanguageParser`) for all consumers
- Incremental: add a new language by adding a grammar file and a query set
- Battle-tested in VS Code, Neovim, GitHub Linguist

**Cons:**
- Syntactic only; no type resolution or cross-file semantic analysis
- WASM grammars are 2-5 MB each (mitigated by lazy loading)
- Tree-sitter query language has a learning curve for new contributors
- ~100ms cold start per grammar (one-time, cached thereafter)

### Option 2: Language-Specific Native Parsers (Rejected)

Use JavaParser for Java, Roslyn for C#, go/parser for Go, syn for Rust, etc. Each language gets its own native parser with full semantic capabilities.

**Why rejected:** Requires sidecar processes or native binaries for each language. Users would need Java, .NET, Go, and Rust toolchains installed just to analyze code. Non-portable, complex setup, and each parser has a different API requiring unique integration work.

### Option 3: Regex-Only Heuristics (Rejected)

Use regular expressions to extract function signatures and class definitions from source code, similar to the existing code-metrics regex fallback.

**Why rejected:** Insufficient accuracy for structural analysis. Cannot handle nested classes, multi-line signatures, generics, or language-specific syntax (Rust lifetimes, Go multiple return values, C# attributes). Would produce low-quality prompts leading to poor test generation.

### Option 4: LSP-Based Parsing (Rejected)

Connect to Language Server Protocol servers for each language to extract structural information.

**Why rejected:** LSP servers are designed for interactive editing, not batch analysis. They require the corresponding language toolchain installed, take seconds to initialize per project, and consume significant memory. Overkill for syntactic extraction and impractical for CI/headless environments.

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends On | ADR-005 | AI-First Test Generation | Parser output feeds into test generation prompts |
| Depends On | ADR-075 | Unified TestFramework Type System | `SupportedLanguage` type determines which parser to invoke |
| Relates To | ADR-077 | Compilation Validation Loop | Parsed structure informs validation strategy |
| Relates To | ADR-079 | Language-Specific Test File Path Resolution | Parser detects language conventions that influence file placement |

---

## References

| Ref ID | Title | Type | Location |
|--------|-------|------|----------|
| PLAN-076-A | Multi-Language Test Generation Plan | Technical Spec | [docs/multi-language-test-generation-plan.md](../../multi-language-test-generation-plan.md) |

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
- [ ] **E - Evidence**: tree-sitter WASM validated with PoC parsing Java, Go, and Rust files
- [ ] **C - Criteria**: 4 options compared (tree-sitter, native parsers, regex, LSP)
- [ ] **A - Agreement**: QE domain owners and infrastructure team consulted
- [ ] **D - Documentation**: WH(Y) statement complete, ADR published
- [ ] **R - Review**: Review cadence set (6 months), architecture team assigned

### Extended
- [ ] **Dp - Dependencies**: ADR-005, ADR-075, ADR-077, ADR-079 relationships documented
- [ ] **Rf - References**: Plan document linked
- [ ] **M - Master**: Part of Multi-Language Test Generation initiative (ADR-075 through ADR-079)
