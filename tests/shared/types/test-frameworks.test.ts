import { describe, it, expect } from 'vitest';
import {
  TestFramework,
  SupportedLanguage,
  DEFAULT_FRAMEWORKS,
  FRAMEWORK_ALIASES,
  FRAMEWORK_TO_LANGUAGE,
  LANGUAGE_FILE_EXTENSIONS,
  ALL_TEST_FRAMEWORKS,
  ALL_SUPPORTED_LANGUAGES,
  resolveFrameworkAlias,
  getLanguageFromExtension,
} from '../../../src/shared/types/test-frameworks.js';

describe('Unified Test Framework Type System (ADR-075)', () => {
  describe('ALL_TEST_FRAMEWORKS', () => {
    it('should contain exactly 18 frameworks', () => {
      expect(ALL_TEST_FRAMEWORKS).toHaveLength(18);
    });

    it('should contain all original 5 frameworks (backward compatibility)', () => {
      const original5: TestFramework[] = ['jest', 'vitest', 'mocha', 'pytest', 'node-test'];
      for (const fw of original5) {
        expect(ALL_TEST_FRAMEWORKS).toContain(fw);
      }
    });

    it('should contain all new frameworks', () => {
      const newFrameworks: TestFramework[] = [
        'junit5', 'testng', 'xunit', 'nunit', 'go-test',
        'rust-test', 'swift-testing', 'xctest', 'kotlin-junit',
        'flutter-test', 'jest-rn', 'playwright', 'cypress',
      ];
      for (const fw of newFrameworks) {
        expect(ALL_TEST_FRAMEWORKS).toContain(fw);
      }
    });
  });

  describe('ALL_SUPPORTED_LANGUAGES', () => {
    it('should contain exactly 10 languages', () => {
      expect(ALL_SUPPORTED_LANGUAGES).toHaveLength(10);
    });
  });

  describe('DEFAULT_FRAMEWORKS', () => {
    it('should have a default for every supported language', () => {
      for (const lang of ALL_SUPPORTED_LANGUAGES) {
        expect(DEFAULT_FRAMEWORKS[lang]).toBeDefined();
        expect(ALL_TEST_FRAMEWORKS).toContain(DEFAULT_FRAMEWORKS[lang]);
      }
    });
  });

  describe('FRAMEWORK_ALIASES', () => {
    it('should resolve all aliases to valid frameworks', () => {
      for (const [alias, framework] of Object.entries(FRAMEWORK_ALIASES)) {
        expect(ALL_TEST_FRAMEWORKS).toContain(framework);
      }
    });

    it('should resolve "junit" to "junit5"', () => {
      expect(FRAMEWORK_ALIASES['junit']).toBe('junit5');
    });

    it('should resolve "gotest" to "go-test"', () => {
      expect(FRAMEWORK_ALIASES['gotest']).toBe('go-test');
    });
  });

  describe('FRAMEWORK_TO_LANGUAGE', () => {
    it('should map every framework to a valid language', () => {
      for (const fw of ALL_TEST_FRAMEWORKS) {
        expect(FRAMEWORK_TO_LANGUAGE[fw]).toBeDefined();
        expect(ALL_SUPPORTED_LANGUAGES).toContain(FRAMEWORK_TO_LANGUAGE[fw]);
      }
    });
  });

  describe('LANGUAGE_FILE_EXTENSIONS', () => {
    it('should map .java to java', () => {
      expect(LANGUAGE_FILE_EXTENSIONS['.java']).toBe('java');
    });

    it('should map .py to python', () => {
      expect(LANGUAGE_FILE_EXTENSIONS['.py']).toBe('python');
    });

    it('should map .go to go', () => {
      expect(LANGUAGE_FILE_EXTENSIONS['.go']).toBe('go');
    });

    it('should map .rs to rust', () => {
      expect(LANGUAGE_FILE_EXTENSIONS['.rs']).toBe('rust');
    });

    it('should map .swift to swift', () => {
      expect(LANGUAGE_FILE_EXTENSIONS['.swift']).toBe('swift');
    });

    it('should map .kt to kotlin', () => {
      expect(LANGUAGE_FILE_EXTENSIONS['.kt']).toBe('kotlin');
    });

    it('should map .dart to dart', () => {
      expect(LANGUAGE_FILE_EXTENSIONS['.dart']).toBe('dart');
    });

    it('should map .cs to csharp', () => {
      expect(LANGUAGE_FILE_EXTENSIONS['.cs']).toBe('csharp');
    });
  });

  describe('resolveFrameworkAlias', () => {
    it('should resolve direct framework names', () => {
      expect(resolveFrameworkAlias('jest')).toBe('jest');
      expect(resolveFrameworkAlias('junit5')).toBe('junit5');
      expect(resolveFrameworkAlias('go-test')).toBe('go-test');
    });

    it('should resolve aliases', () => {
      expect(resolveFrameworkAlias('junit')).toBe('junit5');
      expect(resolveFrameworkAlias('gotest')).toBe('go-test');
      expect(resolveFrameworkAlias('rusttest')).toBe('rust-test');
    });

    it('should be case-insensitive', () => {
      expect(resolveFrameworkAlias('JEST')).toBe('jest');
      expect(resolveFrameworkAlias('JUnit5')).toBe('junit5');
    });

    it('should return undefined for unknown frameworks', () => {
      expect(resolveFrameworkAlias('unknown')).toBeUndefined();
      expect(resolveFrameworkAlias('')).toBeUndefined();
    });
  });

  describe('getLanguageFromExtension', () => {
    it('should return language for known extensions', () => {
      expect(getLanguageFromExtension('.ts')).toBe('typescript');
      expect(getLanguageFromExtension('.py')).toBe('python');
      expect(getLanguageFromExtension('.java')).toBe('java');
    });

    it('should handle extensions without leading dot', () => {
      expect(getLanguageFromExtension('ts')).toBe('typescript');
      expect(getLanguageFromExtension('py')).toBe('python');
    });

    it('should return undefined for unknown extensions', () => {
      expect(getLanguageFromExtension('.unknown')).toBeUndefined();
    });
  });
});
