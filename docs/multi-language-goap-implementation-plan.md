# AQE Multi-Language Test Generation -- GOAP Implementation Plan

**Date**: 2026-03-04
**Status**: Ready for execution
**Prerequisite**: Read `docs/multi-language-test-generation-plan.md` for full context
**GitHub Issue**: [#319](https://github.com/proffesor-for-testing/agentic-qe/issues/319)

### Governing ADRs

| ADR | Governs Milestones |
|-----|-------------------|
| [ADR-075](../implementation/adrs/ADR-075-unified-test-framework-type-system.md) — Unified TestFramework Type System | M1.1, M1.2, M1.3 |
| [ADR-076](../implementation/adrs/ADR-076-tree-sitter-wasm-multi-language-parser.md) — tree-sitter WASM Multi-Language Parser | M1.4, M1.5, M1.5-PY, M1.11 |
| [ADR-077](../implementation/adrs/ADR-077-compilation-validation-loop.md) — Compilation Validation Loop | M1.7, M1.9 |
| [ADR-078](../implementation/adrs/ADR-078-backward-compatible-multi-language-api.md) — Backward-Compatible Multi-Language API | M1.2, M1.6, M1.9 |
| [ADR-079](../implementation/adrs/ADR-079-language-specific-test-file-path-resolution.md) — Language-Specific Test File Path Resolution | M1.8 |

---

## State Model

```
CURRENT STATE:
  languages_with_full_generation: [typescript, javascript]
  languages_with_stub_generation: [python]
  languages_with_zero_generation: [java, csharp, go, rust, swift, kotlin, dart]
  test_framework_types_divergent: true  (routing/types.ts vs interfaces.ts)
  parser_abstraction: false  (only TypeScriptParser, no ILanguageParser)
  tree_sitter_integrated: false
  language_auto_detection: false
  compilation_validation: false
  python_ast_parsing: false  (always falls back to stubs)

GOAL STATE:
  languages_with_full_generation: [typescript, javascript, python, java, csharp, go, rust, swift, kotlin, dart]
  test_framework_types_divergent: false  (single source of truth)
  parser_abstraction: true
  tree_sitter_integrated: true
  language_auto_detection: true
  compilation_validation: true  (opt-in)
  python_ast_parsing: true
```

---

## File Ownership Map

This is CRITICAL for swarm execution. Two agents must NEVER edit the same file simultaneously. Every file touched by the plan is assigned to exactly one milestone task.

### Shared Foundation Files (Phase 1 only -- must complete before any Phase 2+ work)

| File | Owner Milestone |
|------|----------------|
| `src/shared/types/test-frameworks.ts` | M1.1 |
| `src/shared/types/index.ts` | M1.1 |
| `src/domains/test-generation/interfaces.ts` | M1.2 |
| `src/routing/types.ts` | M1.2 |
| `src/domains/test-generation/factories/test-generator-factory.ts` | M1.3 |
| `src/shared/parsers/interfaces.ts` | M1.4 |
| `src/shared/parsers/typescript-parser.ts` | M1.4 |
| `src/shared/parsers/index.ts` | M1.4 |
| `src/shared/parsers/tree-sitter-parser.ts` | M1.5 |
| `src/shared/language-detector.ts` | M1.6 |
| `src/domains/test-generation/services/compilation-validator.ts` | M1.7 |
| `src/domains/test-generation/services/test-file-resolver.ts` | M1.8 |
| `src/domains/test-generation/services/test-generator.ts` | M1.9 |
| `src/domains/test-generation/prompts/language-prompts.ts` | M1.10 |
| `src/domains/test-generation/generators/index.ts` | M2.REGISTRY (after all generators created) |
| `src/shared/metrics/code-metrics.ts` | M1.11 |

### Generator Files (Phase 2-4 -- can be parallel after Phase 1)

| File | Owner Milestone |
|------|----------------|
| `src/domains/test-generation/generators/junit5-generator.ts` | M2.1 |
| `src/domains/test-generation/detectors/spring-detector.ts` | M2.1 |
| `src/domains/test-generation/generators/xunit-generator.ts` | M2.2 |
| `src/domains/test-generation/generators/go-test-generator.ts` | M2.3 |
| `src/domains/test-generation/generators/rust-test-generator.ts` | M3.1 |
| `src/shared/parsers/rust-ownership-analyzer.ts` | M3.1 |
| `src/domains/test-generation/context/rust-context-builder.ts` | M3.1 |
| `src/domains/test-generation/generators/swift-testing-generator.ts` | M4.1 |
| `src/domains/test-generation/generators/xctest-generator.ts` | M4.1 |
| `src/domains/test-generation/generators/kotlin-junit-generator.ts` | M4.2 |
| `src/domains/test-generation/generators/flutter-test-generator.ts` | M4.3 |
| `src/domains/test-generation/generators/jest-rn-generator.ts` | M4.4 |
| `src/domains/test-generation/detectors/mobile-detector.ts` | M4.5 |
| `src/domains/test-generation/generators/pytest-generator.ts` | M1.5-PY (Python AST upgrade) |

### Test Files (mirror source ownership)

| File | Owner Milestone |
|------|----------------|
| `tests/shared/types/test-frameworks.test.ts` | M1.1 |
| `tests/shared/parsers/interfaces.test.ts` | M1.4 |
| `tests/shared/parsers/tree-sitter-parser.test.ts` | M1.5 |
| `tests/shared/language-detector.test.ts` | M1.6 |
| `tests/domains/test-generation/services/compilation-validator.test.ts` | M1.7 |
| `tests/domains/test-generation/services/test-file-resolver.test.ts` | M1.8 |
| `tests/domains/test-generation/generators/junit5-generator.test.ts` | M2.1 |
| `tests/domains/test-generation/generators/xunit-generator.test.ts` | M2.2 |
| `tests/domains/test-generation/generators/go-test-generator.test.ts` | M2.3 |
| `tests/domains/test-generation/generators/rust-test-generator.test.ts` | M3.1 |
| `tests/domains/test-generation/generators/swift-testing-generator.test.ts` | M4.1 |
| `tests/domains/test-generation/generators/kotlin-junit-generator.test.ts` | M4.2 |
| `tests/domains/test-generation/generators/flutter-test-generator.test.ts` | M4.3 |
| `tests/domains/test-generation/generators/jest-rn-generator.test.ts` | M4.4 |

---

## Phase 1: Foundation (SEQUENTIAL -- blocks everything else)

All Phase 1 milestones execute in dependency order. No Phase 2+ work can begin until Phase 1 passes the risk gate.

### M1.1 -- Unified Type System ([ADR-075](../implementation/adrs/ADR-075-unified-test-framework-type-system.md))

**Goal**: Single source of truth for `TestFramework`, `SupportedLanguage`, `E2EFramework`
**Agent**: `system-architect`
**Preconditions**: None (first task)

**Actions**:
1. Create `src/shared/types/test-frameworks.ts` with:
   - `TestFramework` union type (all 18 values from plan Section 2.0.1)
   - `E2EFramework` union type (`playwright`, `cypress`, `selenium`)
   - `SupportedLanguage` union type (10 values)
   - `RecognizedLanguage` type (superset including `ruby`, `php`)
   - `DEFAULT_FRAMEWORKS` map: `Record<SupportedLanguage, TestFramework>`
   - `FRAMEWORK_ALIASES` map: `Record<string, TestFramework>` (maps `'junit'` -> `'junit5'`, `'xunit'` -> `'xunit'`, etc.)
   - `FRAMEWORK_TO_LANGUAGE` map: `Record<TestFramework, SupportedLanguage>`
   - `LANGUAGE_FILE_EXTENSIONS` map: `Record<string, SupportedLanguage>` (`.java` -> `'java'`, etc.)
2. Export from `src/shared/types/index.ts`
3. Create `tests/shared/types/test-frameworks.test.ts`:
   - Verify all aliases resolve
   - Verify all frameworks map to a language
   - Verify all old 5-value TestFramework values still exist (backward compat)

**Verification**:
```bash
npm run build && npm test -- --run tests/shared/types/test-frameworks.test.ts
```

**Files touched**: `src/shared/types/test-frameworks.ts` (NEW), `src/shared/types/index.ts` (EDIT), `tests/shared/types/test-frameworks.test.ts` (NEW)

---

### M1.2 -- Update Interfaces and Routing Types ([ADR-075](../implementation/adrs/ADR-075-unified-test-framework-type-system.md), [ADR-078](../implementation/adrs/ADR-078-backward-compatible-multi-language-api.md))

**Goal**: `IGenerateTestsRequest` gets optional `language` field; both `interfaces.ts` and `routing/types.ts` import `TestFramework` from shared
**Agent**: `system-architect`
**Preconditions**: M1.1

**Actions**:
1. Edit `src/domains/test-generation/interfaces.ts`:
   - Change line 132 (`export type TestFramework = ...`) to re-export from shared: `export type { TestFramework } from '../../shared/types/test-frameworks.js';`
   - Also re-export `SupportedLanguage` from shared
   - Update `IGenerateTestsRequest` (line 34-40): make `framework` optional (`framework?: TestFramework`), add `language?: SupportedLanguage`, add `projectRoot?: string`, `compileValidation?: boolean`, `maxCompileRetries?: number`
   - Update `IGeneratedTest`: add `language?: SupportedLanguage`, `framework?: TestFramework`, `compilationValidated?: boolean`, `compilationErrors?: string[]`
2. Edit `src/routing/types.ts`:
   - Change `ProgrammingLanguage` to re-export from shared: `export type { RecognizedLanguage as ProgrammingLanguage } from '../shared/types/test-frameworks.js';`
   - Change `TestFramework` to re-export from shared: `export type { TestFramework } from '../shared/types/test-frameworks.js';`
   - Keep `E2EFramework` as local or also re-export depending on overlap
3. Verify no TypeScript compilation errors across the entire project

**Verification**:
```bash
npm run build  # MUST pass with zero type errors
npm test -- --run  # All 14,000+ tests pass
```

**Files touched**: `src/domains/test-generation/interfaces.ts` (EDIT), `src/routing/types.ts` (EDIT)

**Risk**: This touches two high-traffic files. Every downstream import of `TestFramework` must still resolve. Run full build to confirm.

---

### M1.3 -- Update Factory with Alias Resolution

**Goal**: `TestGeneratorFactory` resolves `FRAMEWORK_ALIASES` and has placeholder `case` branches for new frameworks (throws "not yet implemented")
**Agent**: `coder`
**Preconditions**: M1.1, M1.2

**Actions**:
1. Edit `src/domains/test-generation/factories/test-generator-factory.ts`:
   - Import `FRAMEWORK_ALIASES`, `TestFramework` from shared types
   - Update `SUPPORTED_FRAMEWORKS` array to include all 18 values
   - Add alias resolution in `create()`: if framework is an alias key, resolve to canonical value
   - Add `case` branches in `createGenerator()` for new frameworks that throw `new Error('Generator for ${framework} not yet implemented')`
   - Update `supports()` to check aliases too
2. Update factory tests if they exist

**Verification**:
```bash
npm run build && npm test -- --run tests/domains/test-generation/
```

**Files touched**: `src/domains/test-generation/factories/test-generator-factory.ts` (EDIT)

---

### M1.4 -- Parser Abstraction Layer ([ADR-076](../implementation/adrs/ADR-076-tree-sitter-wasm-multi-language-parser.md))

**Goal**: Define `ILanguageParser` interface; refactor `TypeScriptParser` to implement it
**Agent**: `system-architect`
**Preconditions**: M1.1

**Actions**:
1. Create `src/shared/parsers/interfaces.ts`:
   - `ILanguageParser` interface with `language`, `supportedExtensions`, `parseFile(content, filePath): Promise<ParsedFile>`
   - `ParsedFile` interface: `functions: UniversalFunctionInfo[]`, `classes: UniversalClassInfo[]`, `imports: ImportInfo[]`, `language: SupportedLanguage`, `framework?: string`
   - `UniversalFunctionInfo`: name, parameters (reuse `ParameterInfo`), returnType, isAsync, isPublic, complexity, decorators, genericParams, body
   - `UniversalClassInfo`: name, methods (`UniversalFunctionInfo[]`), properties, isPublic, implements, extends, decorators
   - `ImportInfo`: module, namedImports, isTypeOnly
2. Create adapter: `TypeScriptLanguageParser` class wrapping existing `TypeScriptParser` and implementing `ILanguageParser`. This is a thin adapter -- calls existing parser methods and maps results to `ParsedFile`.
3. Update `src/shared/parsers/index.ts` to export new interfaces and adapter
4. Create `tests/shared/parsers/interfaces.test.ts` -- verify adapter produces correct `ParsedFile` from known TS source

**Verification**:
```bash
npm run build && npm test -- --run tests/shared/parsers/
```

**Files touched**: `src/shared/parsers/interfaces.ts` (NEW), `src/shared/parsers/typescript-parser.ts` (EDIT -- add `implements ILanguageParser` or create separate adapter), `src/shared/parsers/index.ts` (EDIT), `tests/shared/parsers/interfaces.test.ts` (NEW)

---

### M1.5 -- tree-sitter Integration ([ADR-076](../implementation/adrs/ADR-076-tree-sitter-wasm-multi-language-parser.md))

**Goal**: `web-tree-sitter` WASM integration with grammars for Python, Java, C#, Go, Rust, Swift, Kotlin, Dart
**Agent**: `coder`
**Preconditions**: M1.4

**Actions**:
1. Install dependencies:
   ```bash
   npm install web-tree-sitter
   # Grammar WASMs -- verify availability before adding
   ```
2. Create `src/shared/parsers/tree-sitter-parser.ts`:
   - `TreeSitterParserRegistry` class
   - Lazy-loads WASM grammars per language
   - Implements `ILanguageParser` for each supported language
   - Per-language query functions that extract `UniversalFunctionInfo[]` and `UniversalClassInfo[]`
   - Language-specific tree-sitter queries for: function declarations, class/struct/trait/impl declarations, parameters, return types, decorators/attributes, visibility modifiers
3. Create `tests/shared/parsers/tree-sitter-parser.test.ts`:
   - Test Python parsing (existing gap fix)
   - Test Java, Go, Rust parsing with fixture files
   - Verify `ParsedFile` output matches expected structure
4. Create fixture files: `tests/fixtures/parsers/sample.py`, `sample.java`, `sample.go`, `sample.rs`, etc.

**Verification**:
```bash
npm run build && npm test -- --run tests/shared/parsers/tree-sitter-parser.test.ts
```

**Files touched**: `src/shared/parsers/tree-sitter-parser.ts` (NEW), `tests/shared/parsers/tree-sitter-parser.test.ts` (NEW), `tests/fixtures/parsers/*` (NEW), `package.json` (EDIT -- new dep)

---

### M1.5-PY -- Fix Python AST Parsing + Upgrade PytestGenerator

**Goal**: Python files get real AST parsing via tree-sitter instead of always producing stubs
**Agent**: `coder`
**Preconditions**: M1.5

**Actions**:
1. Edit `src/domains/test-generation/generators/pytest-generator.ts`:
   - Import `ParsedFile` from parsers
   - Add method to convert `ParsedFile` (from tree-sitter) into the existing `CodeAnalysis` shape used by `generateTests()`
   - When `context.analysis` is populated (from tree-sitter), use it instead of falling back to stubs
2. Edit `src/domains/test-generation/services/test-generator.ts`:
   - In `analyzeSourceCode()`, detect `.py` files and route to tree-sitter parser instead of TypeScript compiler
   - The tree-sitter parser produces `ParsedFile` which is converted to `CodeAnalysis`
3. Create integration test with a real Python file

**Verification**:
```bash
npm run build && npm test -- --run tests/domains/test-generation/
# Manual: Generate tests for a .py file and verify real function/class extraction (not stubs)
```

**Files touched**: `src/domains/test-generation/generators/pytest-generator.ts` (EDIT), `src/domains/test-generation/services/test-generator.ts` (EDIT)

---

### M1.6 -- Language Auto-Detection ([ADR-078](../implementation/adrs/ADR-078-backward-compatible-multi-language-api.md))

**Goal**: Detect language from file extensions, detect framework from project files
**Agent**: `coder`
**Preconditions**: M1.1

**Actions**:
1. Create `src/shared/language-detector.ts`:
   - `detectLanguage(filePaths: string[]): SupportedLanguage` -- from file extensions
   - `detectFramework(language: SupportedLanguage, projectRoot?: string): TestFramework` -- from project file scanning
   - `detectProjectConfig(projectRoot: string): { buildTool: string, configPath: string, languageVersion?: string }` -- scans for pom.xml, Cargo.toml, go.mod, Package.swift, pubspec.yaml, *.csproj, package.json
   - `resolveRequest(request: Partial<IGenerateTestsRequest>): { language: SupportedLanguage, framework: TestFramework }` -- the full resolution chain from plan Section 2.0.2
   - Exclusion patterns: skip `.g.cs`, `.pb.go`, `.freezed.dart`, `*_generated.go`
2. Create `tests/shared/language-detector.test.ts`

**Verification**:
```bash
npm run build && npm test -- --run tests/shared/language-detector.test.ts
```

**Files touched**: `src/shared/language-detector.ts` (NEW), `tests/shared/language-detector.test.ts` (NEW)

---

### M1.7 -- Compilation Validation Loop ([ADR-077](../implementation/adrs/ADR-077-compilation-validation-loop.md))

**Goal**: Optional compile-check for generated tests with LLM repair loop
**Agent**: `coder`
**Preconditions**: M1.1

**Actions**:
1. Create `src/domains/test-generation/services/compilation-validator.ts`:
   - `ICompilationValidator` interface
   - `CompilationValidator` class with per-language compile commands
   - `validate(code, language, projectPath): Promise<ValidationResult>`
   - `ValidationResult`: `{ compiles: boolean, errors: CompilationError[], suggestions: string[] }`
   - Graceful fallback when compiler not found (return `{ compiles: false, errors: [{ message: 'compiler not found' }] }`)
2. Create `tests/domains/test-generation/services/compilation-validator.test.ts`

**Verification**:
```bash
npm run build && npm test -- --run tests/domains/test-generation/services/compilation-validator.test.ts
```

**Files touched**: `src/domains/test-generation/services/compilation-validator.ts` (NEW), `tests/domains/test-generation/services/compilation-validator.test.ts` (NEW)

---

### M1.8 -- Test File Path Resolver ([ADR-079](../implementation/adrs/ADR-079-language-specific-test-file-path-resolution.md))

**Goal**: Resolve correct test file output paths per language convention
**Agent**: `coder`
**Preconditions**: M1.1

**Actions**:
1. Create `src/domains/test-generation/services/test-file-resolver.ts`:
   - `TEST_FILE_CONVENTIONS` record from plan Section 4.6
   - `resolveTestFilePath(sourceFile, language, projectRoot?): string`
   - Handle: alongside, tests-directory, maven-mirror, test-project, inline (Rust)
2. Create `tests/domains/test-generation/services/test-file-resolver.test.ts`

**Verification**:
```bash
npm run build && npm test -- --run tests/domains/test-generation/services/test-file-resolver.test.ts
```

**Files touched**: `src/domains/test-generation/services/test-file-resolver.ts` (NEW), `tests/domains/test-generation/services/test-file-resolver.test.ts` (NEW)

---

### M1.9 -- Wire Foundation into TestGeneratorService

**Goal**: `TestGeneratorService` uses language detection, parser dispatch, test file resolver, and compilation validation
**Agent**: `system-architect`
**Preconditions**: M1.2, M1.3, M1.5-PY, M1.6, M1.7, M1.8

**Actions**:
1. Edit `src/domains/test-generation/services/test-generator.ts`:
   - Import language detector, test file resolver, compilation validator
   - In `generateTests()`: if `language` not in request, auto-detect it; if `framework` not in request, resolve from language
   - In `analyzeSourceCode()`: dispatch to tree-sitter for non-TS/JS files
   - In `generateTestsForFile()`: use `TestFileResolver` for test file path
   - After test generation: if `compileValidation` enabled, run validation loop
   - Add `language` and `framework` to `IGeneratedTest` output
2. Ensure all existing tests still pass (backward compat)

**Verification**:
```bash
npm run build && npm test -- --run  # Full suite must pass
```

**Files touched**: `src/domains/test-generation/services/test-generator.ts` (EDIT)

---

### M1.10 -- Language-Aware LLM Prompts

**Goal**: Per-language prompt configs for LLM enhancement
**Agent**: `coder`
**Preconditions**: M1.1

**Actions**:
1. Create `src/domains/test-generation/prompts/language-prompts.ts`:
   - `LanguagePromptConfig` interface: `systemContext`, `conventions[]`, `assertionStyle`, `mockingStyle`
   - `LANGUAGE_PROMPTS: Record<SupportedLanguage, LanguagePromptConfig>`
   - Configs for all 10 languages (see plan Section 4.3)
   - `getPromptConfig(language: SupportedLanguage): LanguagePromptConfig`

**Verification**:
```bash
npm run build
```

**Files touched**: `src/domains/test-generation/prompts/language-prompts.ts` (NEW)

---

### M1.11 -- Update Code Metrics for tree-sitter

**Goal**: `CodeMetrics` uses tree-sitter for non-TS/JS files instead of regex heuristics
**Agent**: `coder`
**Preconditions**: M1.5

**Actions**:
1. Edit `src/shared/metrics/code-metrics.ts`:
   - Add tree-sitter dispatch path for supported languages
   - TS/JS continues to use TypeScript compiler
   - Supported tree-sitter languages get proper complexity counting
   - Others fall back to existing regex heuristics

**Verification**:
```bash
npm run build && npm test -- --run tests/shared/metrics/
```

**Files touched**: `src/shared/metrics/code-metrics.ts` (EDIT)

---

### RISK GATE 1: Foundation Validation

**Before proceeding to Phase 2, ALL of the following must pass:**

```bash
# 1. Full build
npm run build

# 2. Full test suite (all 14,000+ tests)
npm test -- --run

# 3. Specific foundation tests
npm test -- --run tests/shared/types/
npm test -- --run tests/shared/parsers/
npm test -- --run tests/shared/language-detector.test.ts

# 4. Backward compatibility smoke test
# Verify existing Jest/Vitest/Mocha/Pytest/NodeTest generators still work identically
npm test -- --run tests/domains/test-generation/

# 5. Manual MCP tool test
# Call qe/tests/generate with framework: "jest" -- must produce same output as before
```

**Decision point**: If any test fails, fix before proceeding. Do NOT start Phase 2 generators on a broken foundation.

---

## Phase 2: Core Enterprise Languages (PARALLEL)

After Phase 1 risk gate passes, M2.1, M2.2, and M2.3 can run simultaneously -- they each create NEW files with no overlaps.

### Parallel Group A (can run simultaneously)

---

### M2.1 -- JUnit 5 Generator (Java)

**Goal**: Full test generation for Java with JUnit 5, Mockito, AssertJ, Spring detection
**Agent**: `coder` (Java specialist)
**Preconditions**: Phase 1 complete

**Actions**:
1. Create `src/domains/test-generation/generators/junit5-generator.ts`:
   - Extends `BaseTestGenerator`
   - `framework = 'junit5'`
   - Generates `@ExtendWith(MockitoExtension.class)` test classes
   - `@Test` + `@DisplayName` methods
   - AssertJ assertions (`assertThat(x).isEqualTo(y)`)
   - Mockito setup (`when(...).thenReturn(...)`)
   - Handles: generic types, `Optional<T>`, `CompletableFuture`, `List<T>`
   - Constructor injection detection for mock setup
2. Create `src/domains/test-generation/detectors/spring-detector.ts`:
   - Detect `@Service`, `@RestController`, `@Repository`, `@Component`
   - Route to appropriate test type: `@WebMvcTest`, `@DataJpaTest`, or plain `@ExtendWith`
3. Create `tests/domains/test-generation/generators/junit5-generator.test.ts`:
   - Test with simple class, service class, Spring controller, async methods
4. Create fixture: `tests/fixtures/parsers/UserService.java`

**Verification**:
```bash
npm run build && npm test -- --run tests/domains/test-generation/generators/junit5-generator.test.ts
```

**Files touched**: ALL NEW -- `junit5-generator.ts`, `spring-detector.ts`, test file, fixture

---

### M2.2 -- xUnit Generator (C#)

**Goal**: Full test generation for C# with xUnit, Moq, FluentAssertions
**Agent**: `coder` (C# specialist)
**Preconditions**: Phase 1 complete

**Actions**:
1. Create `src/domains/test-generation/generators/xunit-generator.ts`:
   - Extends `BaseTestGenerator`
   - `framework = 'xunit'`
   - Generates `[Fact]` and `[Theory]` / `[InlineData]` methods
   - Moq setup (`new Mock<IRepository>()`, `.Setup(...)`, `.ReturnsAsync(...)`)
   - `Assert.Equal`, `Assert.NotNull`, `Assert.ThrowsAsync`
   - Handles: `async Task`, nullable reference types, records, LINQ, `IOptions<T>`
2. Create `tests/domains/test-generation/generators/xunit-generator.test.ts`
3. Create fixture: `tests/fixtures/parsers/UserService.cs`

**Verification**:
```bash
npm run build && npm test -- --run tests/domains/test-generation/generators/xunit-generator.test.ts
```

**Files touched**: ALL NEW

---

### M2.3 -- Go Test Generator

**Goal**: Full test generation for Go with table-driven tests and interface mocks
**Agent**: `coder` (Go specialist)
**Preconditions**: Phase 1 complete

**Actions**:
1. Create `src/domains/test-generation/generators/go-test-generator.ts`:
   - Extends `BaseTestGenerator`
   - `framework = 'go-test'`
   - Generates table-driven tests (`tests := []struct { ... }`)
   - `(value, error)` return handling -- both checked in every test case
   - Mock struct generation implementing interfaces
   - `t.Run(tt.name, func(t *testing.T) { ... })` subtests
   - Handles: goroutines (basic), channels, `context.Context` parameter
   - `go.mod` module path for imports
   - `_test.go` file naming convention
2. Create `tests/domains/test-generation/generators/go-test-generator.test.ts`
3. Create fixture: `tests/fixtures/parsers/user_service.go`

**Verification**:
```bash
npm run build && npm test -- --run tests/domains/test-generation/generators/go-test-generator.test.ts
```

**Files touched**: ALL NEW

---

### M2.REGISTRY -- Register Phase 2 Generators

**Goal**: Wire JUnit5, xUnit, GoTest generators into the factory
**Agent**: `coder`
**Preconditions**: M2.1, M2.2, M2.3 all complete

**Actions**:
1. Edit `src/domains/test-generation/factories/test-generator-factory.ts`:
   - Import `JUnit5Generator`, `XUnitGenerator`, `GoTestGenerator`
   - Add `case 'junit5'`, `case 'xunit'`, `case 'go-test'` in `createGenerator()`
   - Remove "not yet implemented" throws for these three
2. Edit `src/domains/test-generation/generators/index.ts`:
   - Export `JUnit5Generator`, `XUnitGenerator`, `GoTestGenerator`
3. Run integration tests

**Verification**:
```bash
npm run build && npm test -- --run tests/domains/test-generation/
```

**Files touched**: `test-generator-factory.ts` (EDIT), `generators/index.ts` (EDIT)

---

### RISK GATE 2: Core Languages Validation

```bash
# Full build + test
npm run build && npm test -- --run

# Specific generator tests
npm test -- --run tests/domains/test-generation/generators/junit5
npm test -- --run tests/domains/test-generation/generators/xunit
npm test -- --run tests/domains/test-generation/generators/go-test

# Integration: generate tests for fixture files via TestGeneratorService
# Verify output is idiomatic (manual review)
```

---

## Phase 3: Rust (SEQUENTIAL -- complex, single agent)

### M3.1 -- Rust Test Generator with Ownership Analysis

**Goal**: Test generation for Rust with `#[test]`, `#[should_panic]`, ownership-aware mock generation
**Agent**: `coder` (Rust specialist)
**Preconditions**: Phase 1 complete (can run in parallel with Phase 2)

**Actions**:
1. Create `src/shared/parsers/rust-ownership-analyzer.ts`:
   - Analyze tree-sitter output for: `&T` vs `&mut T` vs `T` (owned), lifetimes, `Clone`/`Copy` trait bounds
   - Determine if parameters are borrowed, moved, or cloned
   - Output: ownership annotations per parameter
2. Create `src/domains/test-generation/context/rust-context-builder.ts`:
   - RUG-style bottom-up context: recursively resolve all referenced types before building test
   - Extract `use super::*` imports
   - Detect `#[cfg(test)] mod tests` placement requirement
3. Create `src/domains/test-generation/generators/rust-test-generator.ts`:
   - Extends `BaseTestGenerator`
   - `framework = 'rust-test'`
   - Generates `#[cfg(test)] mod tests { use super::*; ... }`
   - `assert!`, `assert_eq!`, `assert_ne!` macros
   - `#[should_panic(expected = "...")]` for panic tests
   - `Result<(), Box<dyn Error>>` return for `?` operator tests
   - Tokio `#[tokio::test]` for async functions
   - `mockall` crate patterns for trait-based mocking
   - NOTE: Rust tests go INLINE (same file) -- generator must produce a module, not a separate file
4. Create `tests/domains/test-generation/generators/rust-test-generator.test.ts`
5. Create fixture: `tests/fixtures/parsers/user_service.rs`

**Verification**:
```bash
npm run build && npm test -- --run tests/domains/test-generation/generators/rust-test-generator.test.ts
```

**Files touched**: ALL NEW

---

## Phase 4: Mobile Languages (PARALLEL)

M4.1, M4.2, M4.3, M4.4 can all run simultaneously -- they each create NEW files with no overlaps.

### Parallel Group B (can run simultaneously)

---

### M4.1 -- Swift Generator (Swift Testing + XCTest)

**Goal**: Test generation for Swift with both Swift Testing (5.10+) and XCTest
**Agent**: `coder`
**Preconditions**: Phase 1 complete

**Actions**:
1. Create `src/domains/test-generation/generators/swift-testing-generator.ts`:
   - `framework = 'swift-testing'`
   - `@Suite`, `@Test("description")`, `#expect(...)` macros
   - `async throws` test methods
   - Protocol-based mocking (manual stubs, no reflection mocks)
2. Create `src/domains/test-generation/generators/xctest-generator.ts`:
   - `framework = 'xctest'`
   - `XCTestCase` subclass, `func testXxx()`, `XCTAssert*`
3. Create tests and fixtures

**Files touched**: ALL NEW

---

### M4.2 -- Kotlin Generator (JUnit + MockK + Coroutines)

**Goal**: Kotlin test generation with coroutine awareness
**Agent**: `coder`
**Preconditions**: Phase 1 complete

**Actions**:
1. Create `src/domains/test-generation/generators/kotlin-junit-generator.ts`:
   - `framework = 'kotlin-junit'`
   - `@ExtendWith(MockKExtension::class)`
   - `@MockK`, `coEvery { ... }`, `coVerify { ... }` for suspend functions
   - `runTest { }` wrapper for coroutine tests
   - Turbine patterns for `Flow` testing
   - Backtick test names (`` `should do something` ``)
2. Create tests and fixtures

**Files touched**: ALL NEW

---

### M4.3 -- Flutter/Dart Generator

**Goal**: Dart test generation with widget test routing
**Agent**: `coder`
**Preconditions**: Phase 1 complete

**Actions**:
1. Create `src/domains/test-generation/generators/flutter-test-generator.ts`:
   - `framework = 'flutter-test'`
   - `test()` for unit tests, `testWidgets()` for widget tests
   - `@GenerateMocks` annotation for Mockito
   - `group()` blocks for organization
   - Widget detection: route `Widget` subclasses to `testWidgets` + `pumpWidget`
2. Create tests and fixtures

**Files touched**: ALL NEW

---

### M4.4 -- React Native Generator (extends Jest)

**Goal**: RN-specific Jest test generation
**Agent**: `coder`
**Preconditions**: Phase 1 complete

**Actions**:
1. Create `src/domains/test-generation/generators/jest-rn-generator.ts`:
   - Extends `JestVitestGenerator`
   - `framework = 'jest-rn'`
   - Imports `@testing-library/react-native` instead of `@testing-library/react`
   - Detects `Platform.OS`, `NativeModules`, `Animated` usage
   - Generates `jest.useFakeTimers()` when animations detected
   - Generates `NavigationContainer` wrapper when React Navigation detected
2. Create tests

**Files touched**: ALL NEW

---

### M4.5 -- Mobile Framework Detectors

**Goal**: Detect SwiftUI, Compose, Flutter Widget patterns for routing
**Agent**: `coder`
**Preconditions**: Phase 1 complete

**Actions**:
1. Create `src/domains/test-generation/detectors/mobile-detector.ts`:
   - `detectSwiftUIView(parsedFile)`: looks for `import SwiftUI`, `var body: some View`
   - `detectComposable(parsedFile)`: looks for `@Composable` decorator
   - `detectFlutterWidget(parsedFile)`: looks for `extends StatelessWidget` / `StatefulWidget`
   - Returns routing decision: "unit test" vs "widget/UI test"

**Files touched**: ALL NEW

---

### M4.REGISTRY -- Register Phase 3 + 4 Generators

**Goal**: Wire all remaining generators into the factory
**Agent**: `coder`
**Preconditions**: M3.1, M4.1-M4.5 all complete

**Actions**:
1. Edit `src/domains/test-generation/factories/test-generator-factory.ts`:
   - Import and register all new generators
   - Remove all remaining "not yet implemented" throws
2. Edit `src/domains/test-generation/generators/index.ts`:
   - Export all new generators
3. Run full integration tests

**Verification**:
```bash
npm run build && npm test -- --run
```

---

### RISK GATE 3: Full Language Coverage

```bash
# Full build + test
npm run build && npm test -- --run

# All generator tests
npm test -- --run tests/domains/test-generation/generators/

# Verify factory supports all 18 frameworks
# (integration test that calls factory.create() for each)

# Manual: Generate tests for at least one file per language and review output quality
```

---

## Phase 5: KG + Quality Extension (FUTURE)

Not included in this execution plan. Deferred to a follow-up after Phase 4 is stable. Covers:
- Multi-language KG indexing
- Multi-language coverage report parsing (JaCoCo, dotcover, tarpaulin, go cover)
- Routing score boost for language-matched agents
- MCP tool schema update

---

## Swarm Execution Strategy

### Swarm Configuration

```bash
npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 8 --strategy specialized
```

### Phase 1 Execution (Sequential -- 1 coordinator + 2 coders max)

Phase 1 milestones have strict dependency ordering. Use at most 2 parallel agents where dependencies allow:

```
Timeline:
  T0: M1.1 (types)
  T1: M1.2 (interfaces) + M1.4 (parser abstraction)  [parallel -- different files]
  T2: M1.3 (factory) + M1.6 (language detector) + M1.10 (prompts)  [parallel -- different files]
  T3: M1.5 (tree-sitter)  [depends on M1.4]
  T4: M1.5-PY (Python fix) + M1.7 (compilation validator) + M1.8 (test file resolver)  [parallel]
  T5: M1.9 (wire into service)  [depends on ALL above]
  T6: M1.11 (metrics update)  [depends on M1.5]
  T7: RISK GATE 1
```

### Phase 2 Execution (Parallel -- 3 coders)

```
Timeline:
  T8: M2.1 (Java) + M2.2 (C#) + M2.3 (Go)  [fully parallel -- all NEW files]
  T9: M2.REGISTRY  [depends on T8]
  T10: RISK GATE 2
```

### Phase 3 + 4 Execution (Parallel -- up to 5 coders)

```
Timeline:
  T8: M3.1 (Rust) can start same time as Phase 2  [all NEW files]
  T11: M4.1 (Swift) + M4.2 (Kotlin) + M4.3 (Flutter) + M4.4 (RN) + M4.5 (detectors)  [fully parallel]
  T12: M4.REGISTRY  [depends on M3.1 + all M4.x]
  T13: RISK GATE 3
```

### Agent Type Assignments

| Agent Type | Milestones |
|-----------|------------|
| `system-architect` | M1.1, M1.2, M1.4, M1.9 |
| `coder` | M1.3, M1.5, M1.5-PY, M1.6, M1.7, M1.8, M1.10, M1.11 |
| `coder` (Java) | M2.1 |
| `coder` (C#) | M2.2 |
| `coder` (Go) | M2.3 |
| `coder` (Rust) | M3.1 |
| `coder` (Swift) | M4.1 |
| `coder` (Kotlin) | M4.2 |
| `coder` (Dart) | M4.3 |
| `coder` (RN) | M4.4 |
| `coder` | M4.5, M2.REGISTRY, M4.REGISTRY |
| `tester` | Risk gate validation at each checkpoint |

### Maximum Parallelism Diagram

```
Phase 1 (sequential with local parallelism):
  ----[M1.1]----[M1.2 + M1.4]----[M1.3 + M1.6 + M1.10]----[M1.5]----[M1.5-PY + M1.7 + M1.8]----[M1.9]----[M1.11]----[GATE 1]

Phase 2 + 3 (parallel after Gate 1):
  ----[M2.1 Java]--------[M2.REG]----[GATE 2]
  ----[M2.2 C#  ]--------'
  ----[M2.3 Go  ]--------'
  ----[M3.1 Rust]------------------------------+
                                                |
Phase 4 (parallel, after Gate 2 or Gate 1):     |
  ----[M4.1 Swift  ]------[M4.REG]----[GATE 3] |
  ----[M4.2 Kotlin ]------'                     |
  ----[M4.3 Flutter]------'                     |
  ----[M4.4 RN     ]------'                     |
  ----[M4.5 detect ]------'--------------------'
```

---

## Summary Table

| Milestone | Phase | Agent | New Files | Edited Files | Blocks | Blocked By |
|-----------|-------|-------|-----------|-------------|--------|------------|
| M1.1 | 1 | system-architect | 2 | 1 | M1.2, M1.3, M1.6, M1.7, M1.8, M1.10 | -- |
| M1.2 | 1 | system-architect | 0 | 2 | M1.3, M1.9 | M1.1 |
| M1.3 | 1 | coder | 0 | 1 | M1.9 | M1.1, M1.2 |
| M1.4 | 1 | system-architect | 2 | 2 | M1.5 | M1.1 |
| M1.5 | 1 | coder | 2+ | 1 | M1.5-PY, M1.11 | M1.4 |
| M1.5-PY | 1 | coder | 0 | 2 | M1.9 | M1.5 |
| M1.6 | 1 | coder | 2 | 0 | M1.9 | M1.1 |
| M1.7 | 1 | coder | 2 | 0 | M1.9 | M1.1 |
| M1.8 | 1 | coder | 2 | 0 | M1.9 | M1.1 |
| M1.9 | 1 | system-architect | 0 | 1 | GATE 1 | M1.2, M1.3, M1.5-PY, M1.6, M1.7, M1.8 |
| M1.10 | 1 | coder | 1 | 0 | -- | M1.1 |
| M1.11 | 1 | coder | 0 | 1 | -- | M1.5 |
| GATE 1 | 1 | tester | 0 | 0 | Phase 2-4 | M1.9 |
| M2.1 | 2 | coder | 4 | 0 | M2.REG | GATE 1 |
| M2.2 | 2 | coder | 3 | 0 | M2.REG | GATE 1 |
| M2.3 | 2 | coder | 3 | 0 | M2.REG | GATE 1 |
| M2.REG | 2 | coder | 0 | 2 | GATE 2 | M2.1, M2.2, M2.3 |
| GATE 2 | 2 | tester | 0 | 0 | Phase 4 | M2.REG |
| M3.1 | 3 | coder | 4 | 0 | M4.REG | GATE 1 |
| M4.1 | 4 | coder | 3 | 0 | M4.REG | GATE 1 |
| M4.2 | 4 | coder | 3 | 0 | M4.REG | GATE 1 |
| M4.3 | 4 | coder | 3 | 0 | M4.REG | GATE 1 |
| M4.4 | 4 | coder | 2 | 0 | M4.REG | GATE 1 |
| M4.5 | 4 | coder | 1 | 0 | M4.REG | GATE 1 |
| M4.REG | 4 | coder | 0 | 2 | GATE 3 | M3.1, M4.1-M4.5 |
| GATE 3 | 4 | tester | 0 | 0 | Phase 5 | M4.REG |

**Total new files**: ~40
**Total edited files**: ~12 (all in Phase 1)
**Maximum concurrent agents**: 5 (during Phase 2+3+4 parallel execution)
**Estimated total milestones**: 24
