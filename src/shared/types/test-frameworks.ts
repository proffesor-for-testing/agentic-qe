/**
 * Unified Test Framework Type System (ADR-075)
 * Single source of truth for all test framework and language types.
 */

// All supported programming languages for test generation
export type SupportedLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'java'
  | 'csharp'
  | 'go'
  | 'rust'
  | 'swift'
  | 'kotlin'
  | 'dart';

// Superset including recognized but not fully supported languages
export type RecognizedLanguage = SupportedLanguage | 'ruby' | 'php';

// All test frameworks (18 values)
export type TestFramework =
  | 'jest'
  | 'vitest'
  | 'mocha'
  | 'pytest'
  | 'node-test'
  | 'junit5'
  | 'testng'
  | 'xunit'
  | 'nunit'
  | 'go-test'
  | 'rust-test'
  | 'swift-testing'
  | 'xctest'
  | 'kotlin-junit'
  | 'flutter-test'
  | 'jest-rn'
  | 'playwright'
  | 'cypress';

// E2E frameworks
export type E2EFramework = 'playwright' | 'cypress' | 'selenium';

// Default framework per language
export const DEFAULT_FRAMEWORKS: Record<SupportedLanguage, TestFramework> = {
  typescript: 'vitest',
  javascript: 'jest',
  python: 'pytest',
  java: 'junit5',
  csharp: 'xunit',
  go: 'go-test',
  rust: 'rust-test',
  swift: 'swift-testing',
  kotlin: 'kotlin-junit',
  dart: 'flutter-test',
};

// Alias resolution map (common alternative names -> canonical framework)
export const FRAMEWORK_ALIASES: Record<string, TestFramework> = {
  junit: 'junit5',
  'junit-5': 'junit5',
  'junit-4': 'junit5', // We only generate JUnit 5
  nunit: 'nunit',
  'x-unit': 'xunit',
  xunit: 'xunit',
  gotest: 'go-test',
  'go_test': 'go-test',
  rusttest: 'rust-test',
  'rust_test': 'rust-test',
  'swift_testing': 'swift-testing',
  swifttesting: 'swift-testing',
  'kotlin_junit': 'kotlin-junit',
  kotlinjunit: 'kotlin-junit',
  'flutter_test': 'flutter-test',
  fluttertest: 'flutter-test',
  'jest_rn': 'jest-rn',
  'jest-react-native': 'jest-rn',
  'react-native': 'jest-rn',
};

// Reverse map: framework -> language
export const FRAMEWORK_TO_LANGUAGE: Record<TestFramework, SupportedLanguage> = {
  jest: 'javascript',
  vitest: 'typescript',
  mocha: 'javascript',
  pytest: 'python',
  'node-test': 'javascript',
  junit5: 'java',
  testng: 'java',
  xunit: 'csharp',
  nunit: 'csharp',
  'go-test': 'go',
  'rust-test': 'rust',
  'swift-testing': 'swift',
  xctest: 'swift',
  'kotlin-junit': 'kotlin',
  'flutter-test': 'dart',
  'jest-rn': 'javascript',
  playwright: 'typescript',
  cypress: 'javascript',
};

// File extension -> language mapping
export const LANGUAGE_FILE_EXTENSIONS: Record<string, SupportedLanguage> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.java': 'java',
  '.cs': 'csharp',
  '.go': 'go',
  '.rs': 'rust',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.dart': 'dart',
};

// All valid TestFramework values as an array (useful for validation)
export const ALL_TEST_FRAMEWORKS: readonly TestFramework[] = [
  'jest', 'vitest', 'mocha', 'pytest', 'node-test',
  'junit5', 'testng', 'xunit', 'nunit', 'go-test',
  'rust-test', 'swift-testing', 'xctest', 'kotlin-junit',
  'flutter-test', 'jest-rn', 'playwright', 'cypress',
] as const;

// All supported languages as an array
export const ALL_SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  'typescript', 'javascript', 'python', 'java', 'csharp',
  'go', 'rust', 'swift', 'kotlin', 'dart',
] as const;

/**
 * Resolve a framework string (possibly an alias) to a canonical TestFramework.
 * Returns undefined if the string is not a known framework or alias.
 */
export function resolveFrameworkAlias(input: string): TestFramework | undefined {
  const lower = input.toLowerCase().trim();
  // Direct match
  if (ALL_TEST_FRAMEWORKS.includes(lower as TestFramework)) {
    return lower as TestFramework;
  }
  // Alias match
  return FRAMEWORK_ALIASES[lower];
}

/**
 * Get the language for a given file extension.
 * Returns undefined if the extension is not recognized.
 */
export function getLanguageFromExtension(ext: string): SupportedLanguage | undefined {
  return LANGUAGE_FILE_EXTENSIONS[ext.startsWith('.') ? ext : `.${ext}`];
}
