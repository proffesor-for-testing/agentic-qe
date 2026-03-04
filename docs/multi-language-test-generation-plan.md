# AQE Multi-Language Test Generation & Analysis — Upgrade Plan

**Date**: 2026-03-04
**Status**: Draft v2 — Critical gaps addressed per QE Requirements Validator (score: 59→target 75+)
**Scope**: Extend AQE to support Java, C#, Rust, Go, Swift/iOS, Kotlin/Android, React Native, Flutter/Dart, and fix Python AST gap
**GitHub Issue**: [#319](https://github.com/proffesor-for-testing/agentic-qe/issues/319)
**GOAP Execution Plan**: [multi-language-goap-implementation-plan.md](./multi-language-goap-implementation-plan.md)

### Architecture Decision Records

| ADR | Title | Status | Governs |
|-----|-------|--------|---------|
| [ADR-075](../implementation/adrs/ADR-075-unified-test-framework-type-system.md) | Unified TestFramework Type System | Proposed | Section 2.0.1 — Single source of truth for types |
| [ADR-076](../implementation/adrs/ADR-076-tree-sitter-wasm-multi-language-parser.md) | tree-sitter WASM Multi-Language Parser | Proposed | Section 2.1, 2.2, 4.1 — Parser abstraction + tree-sitter |
| [ADR-077](../implementation/adrs/ADR-077-compilation-validation-loop.md) | Compilation Validation Loop | Proposed | Section 4.2 — Compile-validate-repair loop |
| [ADR-078](../implementation/adrs/ADR-078-backward-compatible-multi-language-api.md) | Backward-Compatible Multi-Language API | Proposed | Section 2.0.2, 2.0.3, 2.0.4 — API extension |
| [ADR-079](../implementation/adrs/ADR-079-language-specific-test-file-path-resolution.md) | Language-Specific Test File Path Resolution | Proposed | Section 4.6 — Test file conventions |

---

## 1. Current State Analysis

### What AQE Supports Today

| Capability | Languages | Details |
|---|---|---|
| **AST Parsing** | TypeScript, JavaScript | TypeScript Compiler API (`ts.createSourceFile`) |
| **Test Generation** | TS/JS, Python (stubs only) | 5 frameworks: `jest`, `vitest`, `mocha`, `pytest`, `node-test` |
| **Code Metrics** | TS/JS (full), others (regex heuristic) | Cyclomatic, cognitive, Halstead, maintainability index |
| **Knowledge Graph** | TS/JS only | Functions, classes, interfaces, imports, exports |
| **Coverage Analysis** | Language-agnostic (parses reports) | HNSW-indexed gap detection, risk scoring |
| **Routing Metadata** | 11 languages declared | `ProgrammingLanguage` type in `src/routing/types.ts` — but no generators exist beyond TS/JS/Python |

### Key Gaps

1. **Python AST analysis not implemented** — `.py` files always produce stub tests because `analyzeSourceCode()` uses the TypeScript compiler
2. **JUnit/xUnit/go-test/rust-test** appear in routing `types.ts` and skill schemas but have **zero generator implementations**
3. **LLM prompts are TypeScript-framed** even when generating pytest output
4. **No language detection** — framework is always caller-supplied with no auto-detection
5. **No compilation validation loop** — generated tests are never checked for compilability
6. **Two divergent `TestFramework` types** — routing (`src/routing/types.ts`) and test-generation (`src/domains/test-generation/interfaces.ts`) define separate type unions with overlapping but different values, causing potential runtime mismatches

---

## 2. Architecture: Multi-Language Extension Design

### 2.0 Critical: Unified Type System & Backward Compatibility

> **Gap addressed**: The requirements validator identified that two separate `TestFramework` types exist with different values, the `IGenerateTestsRequest` API has no `language` field, and there is no backward compatibility story. This section resolves all three.
>
> **Governing ADRs**: [ADR-075](../implementation/adrs/ADR-075-unified-test-framework-type-system.md) (type unification), [ADR-078](../implementation/adrs/ADR-078-backward-compatible-multi-language-api.md) (API extension)

#### 2.0.1 Unified `TestFramework` Type (Single Source of Truth)

Currently there are **two divergent type definitions**:

```typescript
// src/domains/test-generation/interfaces.ts (line 132) — GENERATION layer
type TestFramework = 'jest' | 'vitest' | 'mocha' | 'pytest' | 'node-test';

// src/routing/types.ts (line 36) — ROUTING layer
type TestFramework = 'jest' | 'vitest' | 'mocha' | 'pytest' | 'junit' | 'testng'
  | 'go-test' | 'rust-test' | 'xunit' | 'rspec' | 'phpunit'
  | 'playwright' | 'cypress' | 'selenium';
```

**Resolution**: Create a single canonical type in a shared location, imported by both layers:

```typescript
// src/shared/types/test-frameworks.ts — THE SINGLE SOURCE OF TRUTH

/**
 * All test frameworks AQE can generate tests for.
 * Grouped by language ecosystem for clarity.
 */
export type TestFramework =
  // JavaScript/TypeScript
  | 'jest' | 'vitest' | 'mocha' | 'node-test'
  // Python
  | 'pytest'
  // Java
  | 'junit5' | 'testng'
  // C#
  | 'xunit' | 'nunit' | 'mstest'
  // Go
  | 'go-test'
  // Rust
  | 'rust-test'
  // Swift/iOS
  | 'xctest' | 'swift-testing'
  // Kotlin/Android
  | 'kotlin-junit' | 'kotlin-kotest'
  // Flutter/Dart
  | 'flutter-test'
  // React Native (extends Jest with RN-specific setup)
  | 'jest-rn';

/**
 * E2E/browser test frameworks — routing-only, not test generation targets.
 * These are used for agent capability matching but have no generator.
 */
export type E2EFramework =
  | 'playwright' | 'cypress' | 'selenium'
  | 'detox' | 'espresso' | 'xcuitest';

/**
 * Legacy framework aliases for backward compatibility.
 * 'junit' (routing) maps to 'junit5' (generation).
 */
export const FRAMEWORK_ALIASES: Record<string, TestFramework> = {
  'junit': 'junit5',      // routing used 'junit', generation uses 'junit5'
  'rspec': 'jest',         // Ruby not yet supported, route to closest
  'phpunit': 'jest',       // PHP not yet supported, route to closest
};

/**
 * All programming languages AQE supports for test generation.
 */
export type SupportedLanguage =
  | 'typescript' | 'javascript' | 'python'
  | 'java' | 'csharp' | 'go' | 'rust'
  | 'swift' | 'kotlin' | 'dart';

/**
 * Languages recognized by routing but without generators yet.
 * Kept for agent capability matching.
 */
export type RecognizedLanguage = SupportedLanguage | 'ruby' | 'php';
```

**Migration steps**:
1. Create `src/shared/types/test-frameworks.ts` with the canonical types above
2. Update `src/domains/test-generation/interfaces.ts` line 132 to: `export { TestFramework } from '../../shared/types/test-frameworks.js';`
3. Update `src/routing/types.ts` line 36 to: `export { TestFramework, E2EFramework, RecognizedLanguage as ProgrammingLanguage } from '../shared/types/test-frameworks.js';`
4. Add `FRAMEWORK_ALIASES` lookup in `TestGeneratorFactory.create()` so old routing values (`'junit'`) resolve to new generation values (`'junit5'`)
5. All existing consumers of the 5-value `TestFramework` continue to work because the new type is a superset

#### 2.0.2 Updated `IGenerateTestsRequest` API Contract

The current interface has no `language` field and hardcodes 5 frameworks:

```typescript
// CURRENT (src/domains/test-generation/interfaces.ts line 34-40)
export interface IGenerateTestsRequest {
  sourceFiles: string[];
  testType: 'unit' | 'integration' | 'e2e';
  framework: 'jest' | 'vitest' | 'mocha' | 'pytest' | 'node-test';
  coverageTarget?: number;
  patterns?: string[];
}
```

**New contract** (backward-compatible — all new fields are optional):

```typescript
// PROPOSED — all new fields optional for backward compat
export interface IGenerateTestsRequest {
  sourceFiles: string[];
  testType: 'unit' | 'integration' | 'e2e';
  framework?: TestFramework;         // NOW OPTIONAL — auto-detected from language if omitted
  language?: SupportedLanguage;      // NEW — auto-detected from file extensions if omitted
  coverageTarget?: number;
  patterns?: string[];
  // New optional fields for multi-language support
  projectRoot?: string;              // for build tool / project file detection
  compileValidation?: boolean;       // enable compilation validation loop (default: false)
  maxCompileRetries?: number;        // max repair attempts (default: 3)
}
```

**Resolution logic** when fields are omitted:
```
1. If language is missing → detect from file extensions of sourceFiles
2. If framework is missing → use DEFAULT_FRAMEWORKS[language]
3. If both are missing → detect language, then infer framework
4. If framework is provided but language is missing → infer language from framework
5. If framework is a legacy alias (e.g., 'junit') → resolve via FRAMEWORK_ALIASES
```

**Backward compatibility guarantee**: Existing callers passing `{ sourceFiles, testType: 'unit', framework: 'jest' }` work exactly as before — `language` defaults to `'typescript'`/`'javascript'` based on file extensions, and `'jest'` is still a valid `TestFramework` value.

#### 2.0.3 Updated `IGeneratedTest` Response

```typescript
export interface IGeneratedTest {
  id: string;
  name: string;
  sourceFile: string;
  testFile: string;
  testCode: string;
  type: 'unit' | 'integration' | 'e2e';
  assertions: number;
  llmEnhanced?: boolean;
  qualityGateResult?: TestQualityGateResult;
  // New fields
  language?: SupportedLanguage;           // language of the generated test
  framework?: TestFramework;              // framework used
  compilationValidated?: boolean;         // whether test passed compilation check
  compilationErrors?: string[];           // errors if validation failed
}
```

#### 2.0.4 MCP Tool Contract Changes

The `qe/tests/generate` MCP tool input schema must accept the new optional fields from day one (Phase 1), not Phase 5:

```json
{
  "name": "qe/tests/generate",
  "inputSchema": {
    "type": "object",
    "required": ["sourceFiles", "testType"],
    "properties": {
      "sourceFiles": { "type": "array", "items": { "type": "string" } },
      "testType": { "enum": ["unit", "integration", "e2e"] },
      "framework": {
        "description": "Test framework. Auto-detected from language if omitted.",
        "enum": ["jest", "vitest", "mocha", "pytest", "node-test",
                 "junit5", "testng", "xunit", "nunit", "mstest",
                 "go-test", "rust-test", "xctest", "swift-testing",
                 "kotlin-junit", "kotlin-kotest", "flutter-test", "jest-rn"]
      },
      "language": {
        "description": "Programming language. Auto-detected from file extensions if omitted.",
        "enum": ["typescript", "javascript", "python", "java", "csharp",
                 "go", "rust", "swift", "kotlin", "dart"]
      },
      "coverageTarget": { "type": "number", "default": 80 },
      "compileValidation": { "type": "boolean", "default": false },
      "projectRoot": { "type": "string" }
    }
  }
}
```

**Backward compatibility**: `framework` is no longer required. Existing MCP clients that always pass `framework: "jest"` continue working. New clients can omit `framework` and let auto-detection handle it.

### 2.1 Parser Abstraction Layer ([ADR-076](../implementation/adrs/ADR-076-tree-sitter-wasm-multi-language-parser.md))

Introduce a universal parser interface that all language parsers implement:

```typescript
// src/shared/parsers/interfaces.ts

interface ILanguageParser {
  language: SupportedLanguage;
  supportedExtensions: string[];
  parseFile(content: string, filePath: string): Promise<ParsedFile>;
}

interface ParsedFile {
  functions: UniversalFunctionInfo[];
  classes: UniversalClassInfo[];
  imports: ImportInfo[];
  language: SupportedLanguage;
  framework?: DetectedFramework;  // e.g., Spring, ASP.NET, SwiftUI
}

interface UniversalFunctionInfo {
  name: string;
  parameters: ParameterInfo[];
  returnType: string;
  isAsync: boolean;
  isPublic: boolean;
  complexity: number;
  decorators: string[];       // @Test, #[test], @Composable, etc.
  genericParams?: string[];   // <T extends Foo>, <T: Display + Clone>
  body?: string;              // for LLM context
}
```

### 2.2 Two-Tier Parsing Strategy

| Tier | Tool | Provides | Use Case |
|---|---|---|---|
| **Syntactic** (all languages) | **tree-sitter** via `tree-sitter-wasms` npm | Function/class names, signatures, structure | Fast structural extraction, language detection |
| **Semantic** (where available) | Language-specific (TS compiler, Roslyn sidecar, rust-analyzer LSP) | Type resolution, imports, generics, trait bounds | Deep analysis for high-quality test generation |

**Why tree-sitter as the foundation:**
- 160+ language grammars available
- WASM builds run in Node.js without native compilation
- Incremental parsing, error recovery
- Consistent query API across all languages
- Already proven at scale (40+ languages, Dropstone Research)

**What tree-sitter cannot do** (requires language-specific tools):
- Semantic type resolution
- Import/module resolution
- Borrow check / lifetime analysis (Rust)
- Generic type parameter resolution

### 2.3 Generator Registry

Extend `TestGeneratorFactory` with a pluggable registry:

```typescript
// Extended TestFramework type
type TestFramework =
  // Existing
  | 'jest' | 'vitest' | 'mocha' | 'pytest' | 'node-test'
  // Java
  | 'junit5' | 'testng'
  // C#
  | 'xunit' | 'nunit' | 'mstest'
  // Rust
  | 'rust-test'
  // Go
  | 'go-test'
  // Swift/iOS
  | 'xctest' | 'swift-testing'
  // Kotlin/Android
  | 'kotlin-junit' | 'kotlin-kotest'
  // Flutter/Dart
  | 'flutter-test'
  // React Native (uses existing jest generator + RN-specific setup)
  | 'jest-rn';

// Language-to-framework default mapping
const DEFAULT_FRAMEWORKS: Record<SupportedLanguage, TestFramework> = {
  typescript: 'vitest',
  javascript: 'jest',
  python: 'pytest',
  java: 'junit5',
  csharp: 'xunit',
  rust: 'rust-test',
  go: 'go-test',
  swift: 'swift-testing',
  kotlin: 'kotlin-junit',
  dart: 'flutter-test',
};
```

### 2.4 Language Auto-Detection

Add a detection layer that infers language + framework from file context:

```typescript
// src/shared/language-detector.ts

interface DetectionResult {
  language: SupportedLanguage;
  framework: TestFramework;
  buildTool?: string;           // maven, gradle, cargo, go mod, etc.
  projectConfig?: string;       // path to pom.xml, Cargo.toml, etc.
  languageVersion?: string;     // Java 21, Go 1.22, Swift 5.10, etc.
}

// Detection heuristics:
// 1. File extension → language
// 2. Project file scan → build tool + version
//    - pom.xml / build.gradle → Java (+ Maven/Gradle)
//    - *.csproj / *.sln → C# (+ .NET version)
//    - Cargo.toml → Rust (+ edition)
//    - go.mod → Go (+ go version)
//    - Package.swift → Swift
//    - build.gradle.kts + android {} → Kotlin/Android
//    - pubspec.yaml → Flutter/Dart
//    - package.json + react-native → React Native
// 3. Import analysis → framework detection
//    - @SpringBootTest → Spring
//    - @Composable → Jetpack Compose
//    - SwiftUI import → SwiftUI
```

---

## 3. Language-by-Language Implementation Plan

### 3.1 Java (JUnit 5 + Mockito)

**Priority: HIGH** — Most requested enterprise language

**Parser**: tree-sitter-java (syntactic) + optional JavaParser sidecar (semantic)

**Generator output pattern**:
```java
@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private UserService sut;

    @Test
    @DisplayName("should return user when ID exists")
    void findById_whenIdExists_returnsUser() {
        // Arrange
        var user = new User(1L, "Alice");
        when(userRepository.findById(1L)).thenReturn(Optional.of(user));

        // Act
        var result = sut.findById(1L);

        // Assert
        assertThat(result).isPresent();
        assertThat(result.get().getName()).isEqualTo("Alice");
    }
}
```

**Key challenges to handle**:
- Spring stereotype detection (`@Service`, `@Repository`, `@Controller`, `@Component`)
- Constructor vs field injection → determines mock setup strategy
- Generic type resolution (e.g., `List<User>`, `Optional<T>`, wildcards)
- `CompletableFuture` / reactive types → async test patterns
- Maven vs Gradle detection for test runner commands
- AssertJ preferred over Hamcrest for modern Java

**Spring-aware test routing**:
| Detected Annotation | Generated Test Type |
|---|---|
| `@Service` | Unit test with `@ExtendWith(MockitoExtension.class)` |
| `@RestController` | `@WebMvcTest` with `MockMvc` |
| `@Repository` | `@DataJpaTest` with embedded DB |
| `@Component` (generic) | Unit test with manual DI |

**Estimated effort**: Medium-High (Spring detection adds complexity)

---

### 3.2 C# (xUnit + Moq)

**Priority: HIGH** — Second most requested enterprise language

**Parser**: tree-sitter-c-sharp (syntactic). Roslyn API requires a .NET sidecar process — defer to Phase 2.

**Generator output pattern**:
```csharp
public class UserServiceTests
{
    private readonly Mock<IUserRepository> _mockRepository;
    private readonly UserService _sut;

    public UserServiceTests()
    {
        _mockRepository = new Mock<IUserRepository>();
        _sut = new UserService(_mockRepository.Object);
    }

    [Fact]
    public async Task GetUser_WhenExists_ReturnsUser()
    {
        // Arrange
        var user = new User { Id = 1, Name = "Alice" };
        _mockRepository.Setup(r => r.GetByIdAsync(1))
            .ReturnsAsync(user);

        // Act
        var result = await _sut.GetUserAsync(1);

        // Assert
        Assert.NotNull(result);
        Assert.Equal("Alice", result.Name);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public async Task GetUser_WhenInvalidId_ThrowsArgumentException(int id)
    {
        await Assert.ThrowsAsync<ArgumentException>(
            () => _sut.GetUserAsync(id));
    }
}
```

**Key challenges to handle**:
- `async Task` test methods — xUnit handles natively, NUnit needs `AsyncTestDelegate`
- Nullable reference types (C# 8+) → generate null-passing edge case tests
- Record types → use positional construction in test data
- LINQ expressions → test with both empty and populated collections
- ASP.NET Core DI → `WebApplicationFactory<Program>` for integration tests
- `IOptions<T>` pattern → generate `Options.Create(config)` in test setup

**Estimated effort**: Medium

---

### 3.3 Go (built-in `testing` package)

**Priority: HIGH** — Strong demand, unique idioms

**Parser**: tree-sitter-go (sufficient — Go's type system is simpler than Java/C#)

**Generator output pattern**:
```go
func TestUserService_FindByID(t *testing.T) {
    tests := []struct {
        name     string
        id       int
        mockUser *User
        mockErr  error
        wantErr  bool
    }{
        {
            name:     "existing user",
            id:       1,
            mockUser: &User{ID: 1, Name: "Alice"},
            wantErr:  false,
        },
        {
            name:    "not found",
            id:      999,
            mockErr: ErrNotFound,
            wantErr: true,
        },
        {
            name:    "zero ID",
            id:      0,
            mockErr: ErrInvalidID,
            wantErr: true,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            repo := &MockUserRepository{
                users: map[int]*User{tt.id: tt.mockUser},
                err:   tt.mockErr,
            }
            svc := NewUserService(repo)

            got, err := svc.FindByID(tt.id)

            if (err != nil) != tt.wantErr {
                t.Errorf("FindByID() error = %v, wantErr %v", err, tt.wantErr)
                return
            }
            if !tt.wantErr && got.Name != tt.mockUser.Name {
                t.Errorf("FindByID() = %v, want %v", got.Name, tt.mockUser.Name)
            }
        })
    }
}
```

**Key challenges to handle**:
- **Table-driven tests are mandatory** — any generator not producing this pattern will face rejection
- `(value, error)` return tuple → both must be checked in every test case
- Interface-based DI → generate mock struct implementing the interface
- `go.mod` parsing for module path and Go version
- `*_test.go` file naming convention (same package or `_test` package)
- Goroutine/channel testing → `testing/synctest` (Go 1.24+) or `errgroup` patterns
- No generics in pre-1.18 codebases → detect from `go.mod`

**Estimated effort**: Medium (table-driven template is mechanical, but interface mock generation is complex)

---

### 3.4 Rust (built-in `#[test]`)

**Priority: MEDIUM** — Growing demand, unique challenges

**Parser**: tree-sitter-rust (syntactic) + rust-analyzer LSP queries for type resolution

**Generator output pattern**:
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn find_by_id_returns_user_when_exists() {
        let repo = MockUserRepository::new(vec![
            User { id: 1, name: "Alice".to_string() },
        ]);
        let service = UserService::new(Box::new(repo));

        let result = service.find_by_id(1);

        assert!(result.is_some());
        assert_eq!(result.unwrap().name, "Alice");
    }

    #[test]
    fn find_by_id_returns_none_when_not_found() {
        let repo = MockUserRepository::new(vec![]);
        let service = UserService::new(Box::new(repo));

        let result = service.find_by_id(999);

        assert!(result.is_none());
    }

    #[test]
    #[should_panic(expected = "ID must be positive")]
    fn find_by_id_panics_on_zero() {
        let repo = MockUserRepository::new(vec![]);
        let service = UserService::new(Box::new(repo));

        service.find_by_id(0);
    }

    #[test]
    fn find_by_id_async() -> Result<(), Box<dyn std::error::Error>> {
        let rt = tokio::runtime::Runtime::new()?;
        rt.block_on(async {
            let repo = MockUserRepository::new(vec![]);
            let service = UserService::new(Box::new(repo));
            let result = service.find_by_id_async(1).await?;
            assert!(result.is_some());
            Ok(())
        })
    }
}
```

**Key challenges to handle**:
- **Ownership/borrowing** — the #1 reason LLM-generated Rust tests fail to compile
  - Solution: follow RUG paper's approach — extract full type signatures with resolved ownership, inject into prompt
- **Lifetime annotations** — functions returning `&str` or `&[u8]` require lifetime-aware test setup
- **Trait bounds** — `fn process<T: Display + Clone>(item: T)` requires selecting a concrete type satisfying all bounds
- `#[cfg(test)] mod tests` placement — tests go in the same file, at the bottom
- `use super::*` as the standard import
- `#[should_panic(expected = "...")]` for panic-testing functions
- `Result<(), Box<dyn Error>>` return type for tests using `?` operator
- `unsafe` blocks require careful invariant setup
- `mockall` crate for trait-based mocking

**Critical insight from RUG (ICSE 2025)**: Semantic-aware bottom-up context construction (resolve all referenced types recursively before prompting) achieves 71.37% coverage — comparable to human-written tests (73.18%). This should be the approach for Rust.

**Estimated effort**: High (ownership analysis is the hardest problem)

---

### 3.5 Swift/iOS (Swift Testing + XCTest)

**Priority: MEDIUM** — iOS is a large market, Swift Testing is the modern path

**Parser**: tree-sitter-swift

**Generator output pattern (Swift Testing — Swift 5.10+)**:
```swift
import Testing
@testable import MyApp

@Suite("UserService Tests")
struct UserServiceTests {
    let mockRepository: MockUserRepository
    let sut: UserService

    init() {
        mockRepository = MockUserRepository()
        sut = UserService(repository: mockRepository)
    }

    @Test("returns user when ID exists")
    func findByIdSuccess() async throws {
        mockRepository.stubbedUser = User(id: 1, name: "Alice")

        let result = try await sut.findById(1)

        #expect(result.name == "Alice")
    }

    @Test("throws when user not found")
    func findByIdNotFound() async {
        await #expect(throws: UserError.notFound) {
            try await sut.findById(999)
        }
    }
}
```

**Key challenges**:
- **Swift Testing vs XCTest detection** — check Swift version from `Package.swift` (5.10+ = Swift Testing)
- Protocol-based mocking (Swift has no reflection-based mock libraries like Mockito)
- `@Observable` / `ObservableObject` → ViewModel testing pattern
- `async throws` in test methods
- SwiftUI `View` types → route to ViewModel testing (Views are not directly unit-testable)
- `@MainActor` isolation → tests may need `@MainActor` annotation

**Estimated effort**: Medium

---

### 3.6 Kotlin/Android (JUnit + MockK + Coroutines)

**Priority: MEDIUM** — Android is massive, coroutine testing is complex

**Parser**: tree-sitter-kotlin

**Generator output pattern**:
```kotlin
@ExtendWith(MockKExtension::class)
class UserViewModelTest {

    @MockK
    private lateinit var repository: UserRepository

    private lateinit var sut: UserViewModel

    @BeforeEach
    fun setUp() {
        sut = UserViewModel(repository)
    }

    @Test
    fun `loads users successfully`() = runTest {
        coEvery { repository.getUsers() } returns listOf(
            User(1, "Alice"),
            User(2, "Bob")
        )

        sut.loadUsers()

        assertEquals(2, sut.users.value.size)
        coVerify(exactly = 1) { repository.getUsers() }
    }

    @Test
    fun `user flow emits correctly`() = runTest {
        val expectedUser = User(1, "Alice")
        coEvery { repository.getUserFlow() } returns flowOf(expectedUser)

        repository.getUserFlow().test {
            assertEquals(expectedUser, awaitItem())
            awaitComplete()
        }
    }
}
```

**Key challenges**:
- **`suspend` function detection** → wrap tests in `runTest { }`
- `coEvery` / `coVerify` (MockK) instead of `every` / `verify` for suspending functions
- `Flow` return types → generate Turbine test patterns (`flow.test { awaitItem() }`)
- `@Composable` functions → Compose testing rule (`createComposeRule()`)
- `ViewModel` → `InstantTaskExecutorRule` or `StandardTestDispatcher` setup
- Kotlin Multiplatform → `commonTest` source set with `kotlin.test`

**Estimated effort**: Medium-High (coroutine + Flow + Compose = three distinct patterns)

---

### 3.7 React Native (Jest + RNTL)

**Priority: LOW-MEDIUM** — Mostly reuses existing Jest generator

**Parser**: Existing TypeScript compiler (React Native uses TS/JS)

**Generator**: Extend existing `JestVitestGenerator` with RN-specific setup

**Key additions needed**:
1. Import `@testing-library/react-native` instead of `@testing-library/react`
2. Detect `Platform.OS` usage → generate platform mock
3. Detect `NativeModules` imports → generate module mocks
4. Detect React Navigation → generate `NavigationContainer` wrapper
5. `jest.useFakeTimers()` for Animated/LayoutAnimation

**Estimated effort**: Low (80% reuse of existing Jest generator)

---

### 3.8 Flutter/Dart (`flutter_test`)

**Priority: LOW-MEDIUM** — Growing ecosystem

**Parser**: tree-sitter-dart

**Generator output pattern**:
```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';

@GenerateMocks([UserRepository])
void main() {
  late MockUserRepository mockRepository;
  late UserService sut;

  setUp(() {
    mockRepository = MockUserRepository();
    sut = UserService(repository: mockRepository);
  });

  group('findById', () {
    test('returns user when exists', () async {
      when(mockRepository.findById(1))
          .thenAnswer((_) async => User(id: 1, name: 'Alice'));

      final result = await sut.findById(1);

      expect(result.name, equals('Alice'));
      verify(mockRepository.findById(1)).called(1);
    });

    test('throws when not found', () {
      when(mockRepository.findById(999))
          .thenThrow(NotFoundException());

      expect(() => sut.findById(999), throwsA(isA<NotFoundException>()));
    });
  });
}
```

**Widget test routing**:
```dart
testWidgets('displays user name', (tester) async {
  await tester.pumpWidget(MaterialApp(
    home: UserCard(name: 'Alice'),
  ));
  expect(find.text('Alice'), findsOneWidget);
});
```

**Key challenges**:
- Widget vs service/repository routing — different test patterns
- `@GenerateMocks` annotation + `build_runner` codegen step
- `pumpWidget` + `pump()` for advancing animation frames
- State management (Bloc, Riverpod, Provider) requires specific setup

**Estimated effort**: Medium

---

## 4. Cross-Cutting Infrastructure

### 4.1 tree-sitter Integration ([ADR-076](../implementation/adrs/ADR-076-tree-sitter-wasm-multi-language-parser.md))

**Package**: `web-tree-sitter` (WASM-based, runs in Node.js)

```typescript
// src/shared/parsers/tree-sitter-parser.ts
import Parser from 'web-tree-sitter';

class TreeSitterParserRegistry {
  private parsers: Map<string, Parser> = new Map();

  async getParser(language: SupportedLanguage): Promise<Parser> {
    if (!this.parsers.has(language)) {
      await Parser.init();
      const parser = new Parser();
      const lang = await Parser.Language.load(
        `tree-sitter-${language}.wasm`
      );
      parser.setLanguage(lang);
      this.parsers.set(language, parser);
    }
    return this.parsers.get(language)!;
  }

  extractFunctions(tree: Parser.Tree, language: string): UniversalFunctionInfo[] {
    // Language-specific tree-sitter queries
    const queries = FUNCTION_QUERIES[language];
    // ... extract and normalize to UniversalFunctionInfo
  }
}
```

**WASM grammars needed** (npm packages):
- `tree-sitter-java`
- `tree-sitter-c-sharp`
- `tree-sitter-rust`
- `tree-sitter-go`
- `tree-sitter-swift`
- `tree-sitter-kotlin`
- `tree-sitter-dart`

### 4.2 Compilation Validation Loop ([ADR-077](../implementation/adrs/ADR-077-compilation-validation-loop.md))

The single biggest quality improvement for AI test generation:

```typescript
// src/domains/test-generation/services/compilation-validator.ts

interface ICompilationValidator {
  validate(code: string, language: SupportedLanguage, projectPath: string): Promise<ValidationResult>;
}

interface ValidationResult {
  compiles: boolean;
  errors: CompilationError[];
  suggestions: string[];  // fed back to LLM for repair
}

// Language-specific validators
const COMPILE_COMMANDS: Record<SupportedLanguage, string> = {
  java: 'javac -d /tmp/aqe-validate {file}',
  csharp: 'dotnet build --no-restore',
  rust: 'cargo check --message-format=json',
  go: 'go vet ./...',
  swift: 'swift build --skip-tests',
  kotlin: 'kotlinc -nowarn {file}',
  dart: 'dart analyze {file}',
  typescript: 'tsc --noEmit {file}',
};

// Repair loop
async function generateWithValidation(
  request: IGenerateTestsRequest,
  maxAttempts: number = 3
): Promise<GeneratedTest> {
  let code = await generateTest(request);

  for (let i = 0; i < maxAttempts; i++) {
    const result = await validator.validate(code, request.language, request.projectPath);
    if (result.compiles) return { code, validated: true };

    // Re-prompt LLM with errors
    code = await repairTest(code, result.errors, request);
  }

  return { code, validated: false, warnings: ['Failed compilation validation'] };
}
```

**Research backing**: Diffblue Cover's entire competitive advantage is compilation guarantees. EvoGPT (ICSE 2025) showed 30-50% improvement from compile-repair loops.

### 4.3 Language-Aware LLM Prompting

Current AQE prompts are TypeScript-framed. Each language needs tailored prompts:

```typescript
// src/domains/test-generation/prompts/language-prompts.ts

const LANGUAGE_PROMPTS: Record<SupportedLanguage, LanguagePromptConfig> = {
  java: {
    systemContext: 'You are an expert Java test engineer using JUnit 5, Mockito, and AssertJ.',
    conventions: [
      'Use @ExtendWith(MockitoExtension.class) for mock injection',
      'Use @DisplayName for readable test names',
      'Prefer AssertJ assertions over JUnit assertions',
      'Use given/when/then or arrange/act/assert pattern',
      'Detect Spring stereotypes and use appropriate slice test annotations',
    ],
    assertionStyle: 'assertj',  // assertThat(x).isEqualTo(y)
    mockingStyle: 'mockito',    // when(...).thenReturn(...)
  },
  rust: {
    systemContext: 'You are an expert Rust test engineer. Pay extreme attention to ownership, borrowing, and lifetimes.',
    conventions: [
      'Place tests in #[cfg(test)] mod tests { } at the bottom of the file',
      'Use use super::*; to import items from parent module',
      'Clone values when they need to be used after being passed to a function',
      'Use #[should_panic(expected = "...")] for panic tests',
      'Return Result<(), Box<dyn Error>> for tests using the ? operator',
    ],
    assertionStyle: 'assert_eq',
    mockingStyle: 'mockall',
  },
  // ... etc for each language
};
```

### 4.4 Knowledge Graph Extension

Extend KG indexing to support multi-language codebases:

```typescript
// Extend CodeIntelligencePluginConfig
interface KnowledgeGraphConfig {
  // Existing
  maxFiles: number;
  maxFileSize: number;
  // New
  parsers: Record<SupportedLanguage, ILanguageParser>;
  enableTreeSitter: boolean;
  treeSitterLanguages: SupportedLanguage[];
}
```

The KG currently only indexes TS/JS files (hardcoded in `KnowledgeGraphService`). This needs to be parameterized to index any supported language, creating language-tagged nodes that can be queried for cross-language dependency analysis.

### 4.5 Code Metrics Extension

Extend `CodeMetricsAnalyzer` to use tree-sitter for non-TS/JS files:

```typescript
// Current: TS/JS → TypeScript compiler, others → regex heuristics
// Proposed: TS/JS → TypeScript compiler, supported languages → tree-sitter, others → regex

analyzeFile(content: string, filePath: string): FileMetrics {
  const ext = path.extname(filePath).slice(1);

  if (['ts', 'tsx', 'js', 'jsx'].includes(ext)) {
    return this.analyzeWithTypeScriptCompiler(content, filePath);
  }

  const treeSitterLang = EXT_TO_LANGUAGE[ext];
  if (treeSitterLang && this.treeSitterRegistry.supports(treeSitterLang)) {
    return this.analyzeWithTreeSitter(content, filePath, treeSitterLang);
  }

  return this.analyzeWithRegexHeuristics(content, filePath);
}
```

---

## 5. Implementation Phases

### Phase 1: Foundation

**Goal**: Unified type system, parser abstraction, tree-sitter integration, language detection, compilation validation infrastructure, Python AST fix

| Task | Files | Notes |
|---|---|---|
| Create unified `TestFramework` + `SupportedLanguage` types | `src/shared/types/test-frameworks.ts` | Single source of truth (Section 2.0.1) |
| Update `IGenerateTestsRequest` with optional `language` field | `src/domains/test-generation/interfaces.ts` | Backward-compatible (Section 2.0.2) |
| Add `FRAMEWORK_ALIASES` resolution to `TestGeneratorFactory` | `src/domains/test-generation/factories/test-generator-factory.ts` | Maps `'junit'` → `'junit5'` etc. |
| Migrate routing types to import from shared | `src/routing/types.ts` | Remove duplicate `TestFramework` definition |
| Update MCP `qe/tests/generate` tool schema | `src/mcp/tools/test-generate-tool.ts` | Accept `language` param from day one (Section 2.0.4) |
| Define `ILanguageParser` interface | `src/shared/parsers/interfaces.ts` | Universal parser contract |
| Refactor `TypeScriptParser` to implement `ILanguageParser` | `src/shared/parsers/typescript-parser.ts` | Existing callers unaffected |
| Integrate `web-tree-sitter` with WASM grammars | `src/shared/parsers/tree-sitter-parser.ts` | Lazy-loaded per language |
| **Fix Python AST parsing** (tree-sitter-python) | `src/shared/parsers/tree-sitter-parser.ts` | Resolves existing gap — Python gets real AST, not stubs |
| **Upgrade `PytestGenerator` to use parsed AST** | `src/domains/test-generation/generators/pytest-generator.ts` | Use `ParsedFile` from tree-sitter instead of regex fallback |
| Build language auto-detection | `src/shared/language-detector.ts` | Extension → language → framework resolution chain |
| Build compilation validation loop (cross-cutting) | `src/domains/test-generation/services/compilation-validator.ts` | Optional, graceful fallback when compiler missing |
| Update `CodeMetricsAnalyzer` to use tree-sitter | `src/shared/metrics/code-metrics.ts` | TS/JS → TS compiler, supported → tree-sitter, others → regex |
| Add generated code exclusion patterns | `src/shared/language-detector.ts` | Skip `.g.cs`, `.pb.go`, `.freezed.dart`, `*_generated.go` |
| Tests for foundation layer | `tests/shared/parsers/`, `tests/shared/language-detector/` | Parser, detection, backward compat |

### Phase 2: Core Languages — Java + C# + Go

**Goal**: Full test generation for the three highest-demand enterprise languages

| Task | Files | Notes |
|---|---|---|
| `JUnit5Generator` (implements `ITestGenerator`) | `src/domains/test-generation/generators/junit5-generator.ts` | See Section 3.1 |
| Spring stereotype detection | `src/domains/test-generation/detectors/spring-detector.ts` | `@Service`, `@RestController`, `@Repository`, `@Component` |
| `XUnitGenerator` | `src/domains/test-generation/generators/xunit-generator.ts` | See Section 3.2 |
| `GoTestGenerator` (table-driven template) | `src/domains/test-generation/generators/go-test-generator.ts` | See Section 3.3 |
| Language-specific LLM prompt configs (Java, C#, Go) | `src/domains/test-generation/prompts/` | See Section 4.3 |
| Test file path resolver per language convention | `src/domains/test-generation/services/test-file-resolver.ts` | See Section 4.6 (new) |
| Register new generators in factory | `src/domains/test-generation/factories/test-generator-factory.ts` | Wire into existing registry |
| Tests for all three generators | `tests/domains/test-generation/generators/` | Include compilation validation tests |

### Phase 3: Systems Languages — Rust

**Goal**: Rust test generation with ownership-aware context construction

| Task | Files | Notes |
|---|---|---|
| `RustTestGenerator` | `src/domains/test-generation/generators/rust-test-generator.ts` | See Section 3.4 |
| Ownership/borrow analysis (via tree-sitter + heuristics) | `src/shared/parsers/rust-ownership-analyzer.ts` | Detect moves, borrows, lifetimes from signatures |
| RUG-style bottom-up context builder | `src/domains/test-generation/context/rust-context-builder.ts` | Recursive type resolution before prompting |
| Rust-specific LLM prompt config | `src/domains/test-generation/prompts/` | Ownership-aware instructions |
| Tests | `tests/domains/test-generation/generators/rust-test-generator.test.ts` | Include ownership edge cases |

### Phase 4: Mobile — Swift + Kotlin + Flutter + React Native

**Goal**: Mobile development test generation across all major platforms

| Task | Files | Notes |
|---|---|---|
| `SwiftTestingGenerator` + `XCTestGenerator` | `src/domains/test-generation/generators/swift-*.ts` | Detect Swift version for framework choice |
| `KotlinJUnitGenerator` (with coroutine/Flow awareness) | `src/domains/test-generation/generators/kotlin-junit-generator.ts` | `runTest{}`, MockK, Turbine |
| `FlutterTestGenerator` (widget vs unit routing) | `src/domains/test-generation/generators/flutter-test-generator.ts` | `testWidgets` vs `test` routing |
| `JestRNGenerator` (extends JestVitestGenerator) | `src/domains/test-generation/generators/jest-rn-generator.ts` | Extends existing, adds RN mocks |
| Mobile framework detectors (SwiftUI, Compose, Flutter) | `src/domains/test-generation/detectors/` | Detect `@Composable`, `@Observable`, `Widget` |
| Mobile-specific LLM prompt configs | `src/domains/test-generation/prompts/` | Swift, Kotlin, Dart, RN |
| Tests for all mobile generators | `tests/domains/test-generation/generators/` | Include framework-specific patterns |

### Phase 5: KG + Quality Extension

**Goal**: Multi-language code intelligence and quality assessment

| Task | Files | Notes |
|---|---|---|
| Extend KG indexing to multi-language via tree-sitter | `src/domains/code-intelligence/` | Remove hardcoded `['typescript', 'javascript']` |
| Extend embedding generation for non-TS code | `src/domains/code-intelligence/services/` | Language-tagged vector nodes |
| Multi-language coverage report parsing | `src/domains/coverage-analysis/` | JaCoCo (Java), dotcover (C#), tarpaulin (Rust), go cover |
| Update routing to prefer language-matched agents | `src/routing/qe-task-router.ts` | Boost score for language match |

### 4.6 Test File Path Resolution Per Language ([ADR-079](../implementation/adrs/ADR-079-language-specific-test-file-path-resolution.md))

Each language has different conventions for test file placement. The generator must produce the correct output path:

```typescript
// src/domains/test-generation/services/test-file-resolver.ts

const TEST_FILE_CONVENTIONS: Record<SupportedLanguage, TestFileConvention> = {
  typescript: {
    // src/utils.ts → src/utils.test.ts (or __tests__/utils.test.ts)
    pattern: '{base}.test.{ext}',
    location: 'alongside',  // same directory as source
  },
  javascript: {
    pattern: '{base}.test.{ext}',
    location: 'alongside',
  },
  python: {
    // src/utils.py → tests/test_utils.py (or test_utils.py alongside)
    pattern: 'test_{base}.py',
    location: 'tests-directory',  // tests/ mirror directory
  },
  java: {
    // src/main/java/com/app/UserService.java → src/test/java/com/app/UserServiceTest.java
    pattern: '{base}Test.java',
    location: 'maven-mirror',  // src/main → src/test mirror
  },
  csharp: {
    // MyProject/UserService.cs → MyProject.Tests/UserServiceTests.cs
    pattern: '{base}Tests.cs',
    location: 'test-project',  // separate .Tests project
  },
  go: {
    // user_service.go → user_service_test.go (SAME directory, always)
    pattern: '{base}_test.go',
    location: 'alongside',
  },
  rust: {
    // Tests go INSIDE the source file in #[cfg(test)] mod tests { }
    pattern: null,  // no separate file for unit tests
    location: 'inline',
  },
  swift: {
    // Sources/UserService.swift → Tests/UserServiceTests.swift
    pattern: '{base}Tests.swift',
    location: 'tests-directory',
  },
  kotlin: {
    // src/main/kotlin/UserService.kt → src/test/kotlin/UserServiceTest.kt
    pattern: '{base}Test.kt',
    location: 'maven-mirror',
  },
  dart: {
    // lib/user_service.dart → test/user_service_test.dart
    pattern: '{base}_test.dart',
    location: 'test-directory',  // test/ at project root
  },
};
```

### 4.7 Error Handling & Fallback Strategy

Every layer has a defined fallback when things go wrong:

| Failure | Fallback | User Feedback |
|---|---|---|
| tree-sitter WASM grammar not installed for language | Fall back to regex heuristic parsing | Warning: "Full AST analysis unavailable for {lang}, using heuristic mode" |
| tree-sitter parse fails (syntax error in source) | tree-sitter's error recovery produces partial AST; use successfully parsed portions | Warning: "Partial parse — {N} of {M} functions extracted" |
| Compiler not installed for validation (`javac`, `cargo`, etc.) | Skip compilation validation, return test as `compilationValidated: false` | Warning: "{compiler} not found — test not compilation-validated" |
| Compilation validation fails after max retries | Return best-effort test with errors attached | `compilationErrors: [...]` in response |
| Language auto-detection fails (ambiguous or unknown) | Prompt user to specify `language` explicitly | Error: "Cannot detect language for {file} — please specify `language` parameter" |
| No generator registered for detected framework | Fall back to LLM-only generation with language-specific prompt (no structural template) | Warning: "No structural generator for {framework}, using LLM-only mode" |
| LLM unavailable or times out | Return stub tests (current Python behavior, but for all languages) | Warning: "LLM unavailable — returning stub tests" |

---

## 6. New Dependencies

| Package | Purpose | Size Impact |
|---|---|---|
| `web-tree-sitter` | WASM-based multi-language parser | ~2MB (runtime) |
| `tree-sitter-python.wasm` | Python grammar (fixes existing stub-only gap) | ~200KB |
| `tree-sitter-java.wasm` | Java grammar | ~200KB |
| `tree-sitter-c-sharp.wasm` | C# grammar | ~250KB |
| `tree-sitter-rust.wasm` | Rust grammar | ~200KB |
| `tree-sitter-go.wasm` | Go grammar | ~150KB |
| `tree-sitter-swift.wasm` | Swift grammar | ~200KB |
| `tree-sitter-kotlin.wasm` | Kotlin grammar | ~200KB |
| `tree-sitter-dart.wasm` | Dart grammar | ~150KB |

**Total estimated size increase**: ~3.5MB (WASM grammars can be lazy-loaded)

**No native compilation required** — all WASM, runs anywhere Node.js runs.

---

## 7. Risk Assessment

| # | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| R1 | tree-sitter WASM grammars lag behind language versions | Medium | Medium | Pin grammar versions, contribute upstream fixes, have regex fallback |
| R2 | LLM hallucinations on less-common languages (Rust, Dart) | High | High | Compilation validation loop + language-specific prompt engineering |
| R3 | Build tool detection false positives (monorepo with multiple languages) | Medium | Medium | Walk up from source file to nearest project file; never search globally |
| R4 | Package size bloat from WASM grammars (~3.5MB) | Low | Low | Lazy-load grammars on first use; consider `@agentic-qe/languages` optional package |
| R5 | Ownership analysis for Rust is genuinely hard | High | High | Start with heuristic-only (tree-sitter), add rust-analyzer LSP later |
| R6 | Mobile test generation requires device/simulator | Medium | Low | Focus on unit + widget tests (no E2E device testing) |
| R7 | **Breaking API changes for existing users** | High | High | `framework` is now optional (not removed); new type is a superset of old; `FRAMEWORK_ALIASES` handles old routing values |
| R8 | **Compiler/toolchain not installed for validation** | High | High | Compilation validation is opt-in (`compileValidation: false` by default); graceful skip with warning when compiler missing (Section 4.7) |
| R9 | **LLM cost increase from compilation repair loop** | Medium | Medium | Max 3 retries; cache compilation results per function signature; batch repairs where possible |
| R10 | **Test maintenance burden for 17+ framework generators** | Medium | Medium | Extract shared `BaseTestGenerator` patterns; snapshot testing for output format; per-language benchmark corpus |
| R11 | **WASM grammar npm packages missing or broken** (e.g., tree-sitter-kotlin, tree-sitter-dart) | Medium | Medium | Verify WASM builds exist before committing to grammar; fall back to regex for languages without working WASM |
| R12 | **Test file placement conventions vary within a language** (e.g., Java Maven vs Gradle vs Bazel) | Low | Medium | Detect build tool first, then apply convention; allow `testOutputDir` override in request |

---

## 8. Success Metrics

### 8.1 Definition: "Full Test Generation"

A language has **full test generation** when ALL of the following are true:
1. **AST parsing**: tree-sitter (or native compiler API) extracts functions, classes, parameters, return types, and decorators from source files
2. **Structural generator**: An `ITestGenerator` implementation produces framework-idiomatic test code (not just LLM-generated freeform text)
3. **Mock generation**: Dependencies are detected and mock/stub setup code is generated automatically
4. **Edge case coverage**: At least 3 test cases per function (happy path, error/null case, boundary condition)
5. **Correct imports**: Import block is generated deterministically from source analysis (not LLM-guessed)
6. **Test file placement**: Output file path follows language convention (Section 4.6)

### 8.2 Measurable Targets

| Metric | Target | How Measured | Baseline |
|---|---|---|---|
| Languages with full test generation (per 8.1) | 11 (from 2) | Automated check: each language has a registered generator, parser, and prompt config | TS/JS = 2 today |
| Generated test compilation rate (with validation loop) | >85% per language | Run generator against a benchmark corpus of 50 source files per language; count `compilationValidated: true` / total | 0% today (no validation exists) |
| Generated test compilation rate (without validation) | >60% per language | Same corpus, `compileValidation: false` | Unmeasured |
| Generated test pass rate (on correct source code) | >70% per language | Of tests that compile, run them against unmodified source; count passing / total | ~80% for TS/JS (estimated) |
| AST parsing success rate | >95% of files per supported language | Run tree-sitter on 100 real-world files per language; count files with >0 extracted functions / total | 100% for TS/JS, 0% for all others |
| Code metrics accuracy | Cyclomatic complexity within ±15% of reference tool | Compare against: `eslint` (TS/JS), `radon` (Python), `gocyclo` (Go), `clippy` (Rust) | TS/JS = baseline, others = regex heuristic only |
| KG cross-language indexing | >80% of public functions indexed as KG nodes | Run KG indexer on polyglot test repo; count indexed functions / total public functions | 100% for TS/JS, 0% for others |
| Backward compatibility | 0 breaking changes for existing TS/JS/Python users | Run full existing test suite + MCP tool smoke tests before/after upgrade | All 14,000+ tests pass |

### 8.3 Benchmark Corpus

Each language target requires a benchmark corpus of **50 real-world source files** sourced from:
- Popular open-source projects (Spring Boot, ASP.NET samples, Go stdlib, Rust crates, etc.)
- Mix of complexities: 10 simple (1-3 functions), 25 moderate (4-10 functions), 15 complex (10+ functions, generics, async)
- Stored in `tests/fixtures/benchmark-corpus/{language}/`

---

## 9. Research References

- **RUG (ICSE 2025)**: Semantic-aware bottom-up context for Rust — 71.37% coverage ([paper](https://taesoo.kim/pubs/2025/cheng:rug.pdf))
- **PALM (2025)**: Program analysis + LLM synergy for Rust coverage ([arxiv](https://arxiv.org/pdf/2506.09002))
- **EvoGPT (ICSE 2025)**: Hybrid genetic + LLM test generation for Java — 10% improvement ([arxiv](https://arxiv.org/abs/2505.12424))
- **JUnitGenie (2025)**: JavaParser + SootUp + LLM for path-sensitive test synthesis
- **gotests**: Canonical Go table-driven test generator ([github](https://github.com/cweill/gotests))
- **Dropstone Research**: tree-sitter across 40 languages ([blog](https://www.dropstone.io/blog/ast-parsing-tree-sitter-40-languages))
- **Diffblue Cover**: RL-based Java test generation with guaranteed compilation ([diffblue.com](https://www.diffblue.com/))
- **Go 1.24 synctest**: Controlled goroutine testing ([blog](https://go.dev/blog/synctest))
- **Swift Testing**: Modern replacement for XCTest ([apple docs](https://developer.apple.com/documentation/testing))
- **Kotlin coroutines-test**: `runTest` and virtual time control ([android docs](https://developer.android.com/kotlin/coroutines/test))
