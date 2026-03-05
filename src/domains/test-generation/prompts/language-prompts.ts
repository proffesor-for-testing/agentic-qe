/**
 * Language-Aware LLM Prompts (M1.10)
 * Per-language prompt configurations for LLM-enhanced test generation.
 */

import type { SupportedLanguage } from '../../../shared/types/test-frameworks.js';

/**
 * Language-specific prompt configuration
 */
export interface LanguagePromptConfig {
  /** System context describing the language ecosystem */
  systemContext: string;
  /** Coding conventions for this language */
  conventions: string[];
  /** Preferred assertion style */
  assertionStyle: string;
  /** Preferred mocking approach */
  mockingStyle: string;
  /** Code fence language identifier */
  codeFenceLanguage: string;
}

/**
 * Per-language prompt configurations
 */
export const LANGUAGE_PROMPTS: Record<SupportedLanguage, LanguagePromptConfig> = {
  typescript: {
    systemContext: 'TypeScript with strict typing, ESM modules, and modern ES2022+ features.',
    conventions: [
      'Use strict TypeScript types — avoid `any`',
      'Use `import type` for type-only imports',
      'Prefer `const` assertions and branded types',
      'Use async/await over raw Promises',
    ],
    assertionStyle: 'expect(value).toBe(expected) — Vitest/Jest matchers',
    mockingStyle: 'vi.mock() / jest.mock() with typed mocks',
    codeFenceLanguage: 'typescript',
  },

  javascript: {
    systemContext: 'JavaScript with ES2022+ features, CommonJS or ESM modules.',
    conventions: [
      'Use const/let, never var',
      'Use arrow functions for callbacks',
      'Prefer template literals for string interpolation',
    ],
    assertionStyle: 'expect(value).toBe(expected) — Jest matchers',
    mockingStyle: 'jest.mock() with manual mock implementations',
    codeFenceLanguage: 'javascript',
  },

  python: {
    systemContext: 'Python 3.10+ with type hints, dataclasses, and async support.',
    conventions: [
      'Follow PEP 8 naming (snake_case for functions, PascalCase for classes)',
      'Use type hints on all function signatures',
      'Use `pytest` fixtures for setup/teardown',
      'Use `@pytest.mark.asyncio` for async tests',
    ],
    assertionStyle: 'assert value == expected — plain assert with pytest',
    mockingStyle: 'unittest.mock.patch / pytest-mock fixtures',
    codeFenceLanguage: 'python',
  },

  java: {
    systemContext: 'Java 17+ with records, sealed classes, and pattern matching.',
    conventions: [
      'Use JUnit 5 @Test and @DisplayName annotations',
      'Use AssertJ fluent assertions (assertThat)',
      'Follow given-when-then structure in test methods',
      'Use @ExtendWith(MockitoExtension.class) for dependency injection',
    ],
    assertionStyle: 'assertThat(value).isEqualTo(expected) — AssertJ',
    mockingStyle: 'Mockito @Mock, @InjectMocks, when().thenReturn()',
    codeFenceLanguage: 'java',
  },

  csharp: {
    systemContext: 'C# 11+ with nullable reference types, records, and async streams.',
    conventions: [
      'Use xUnit [Fact] and [Theory] attributes',
      'Use FluentAssertions for readable assertions',
      'Follow Arrange-Act-Assert pattern',
      'Use Moq for interface mocking',
    ],
    assertionStyle: 'value.Should().Be(expected) — FluentAssertions',
    mockingStyle: 'new Mock<IService>().Setup(x => x.Method()).Returns(value)',
    codeFenceLanguage: 'csharp',
  },

  go: {
    systemContext: 'Go 1.21+ with generics, error wrapping, and context propagation.',
    conventions: [
      'Use table-driven tests with t.Run subtests',
      'Always check both value and error returns',
      'Use testify/assert for assertions (or standard testing)',
      'Mock interfaces with struct implementations',
    ],
    assertionStyle: 'assert.Equal(t, expected, actual) — testify',
    mockingStyle: 'Interface-based mock structs',
    codeFenceLanguage: 'go',
  },

  rust: {
    systemContext: 'Rust with ownership, borrowing, lifetimes, and trait-based generics.',
    conventions: [
      'Place tests in #[cfg(test)] mod tests { use super::*; }',
      'Use assert!, assert_eq!, assert_ne! macros',
      'Use #[should_panic(expected = "...")] for panic tests',
      'Use #[tokio::test] for async tests',
    ],
    assertionStyle: 'assert_eq!(value, expected) — standard macros',
    mockingStyle: 'mockall crate with #[automock] on traits',
    codeFenceLanguage: 'rust',
  },

  swift: {
    systemContext: 'Swift 5.10+ with Swift Testing framework, actors, and structured concurrency.',
    conventions: [
      'Use @Test attribute with description strings',
      'Use #expect() macro for assertions',
      'Use @Suite for grouping related tests',
      'Protocol-based mocking (manual stubs)',
    ],
    assertionStyle: '#expect(value == expected) — Swift Testing macros',
    mockingStyle: 'Protocol conformance with manual mock implementations',
    codeFenceLanguage: 'swift',
  },

  kotlin: {
    systemContext: 'Kotlin with coroutines, null safety, extension functions, and sealed classes.',
    conventions: [
      'Use backtick test names: `should return user when id is valid`',
      'Use MockK @MockK and coEvery for coroutine mocking',
      'Use runTest { } for coroutine test wrappers',
      'Use Turbine for Flow testing',
    ],
    assertionStyle: 'value shouldBe expected — Kotest matchers or JUnit assertEquals',
    mockingStyle: 'MockK coEvery { service.call() } returns result',
    codeFenceLanguage: 'kotlin',
  },

  dart: {
    systemContext: 'Dart 3+ with null safety, records, and sealed classes. Flutter widgets.',
    conventions: [
      'Use test() for unit tests, testWidgets() for widget tests',
      'Use group() for test organization',
      'Use @GenerateMocks for mockito code generation',
      'Route Widget subclasses to testWidgets with pumpWidget',
    ],
    assertionStyle: 'expect(value, equals(expected)) — matcher-based',
    mockingStyle: '@GenerateMocks([ServiceClass]) + when(mock.method()).thenReturn(value)',
    codeFenceLanguage: 'dart',
  },
};

/**
 * Get the prompt configuration for a language
 */
export function getPromptConfig(language: SupportedLanguage): LanguagePromptConfig {
  return LANGUAGE_PROMPTS[language];
}
