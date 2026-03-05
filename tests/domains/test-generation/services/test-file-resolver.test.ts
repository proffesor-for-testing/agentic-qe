import { describe, it, expect } from 'vitest';
import { resolveTestFilePath, getTestFileConvention, TEST_FILE_CONVENTIONS } from '../../../../src/domains/test-generation/services/test-file-resolver.js';

describe('Test File Path Resolver (ADR-079)', () => {
  describe('TEST_FILE_CONVENTIONS', () => {
    it('should have conventions for all 10 languages', () => {
      const languages = ['typescript', 'javascript', 'python', 'java', 'csharp', 'go', 'rust', 'swift', 'kotlin', 'dart'];
      for (const lang of languages) {
        expect(TEST_FILE_CONVENTIONS[lang as keyof typeof TEST_FILE_CONVENTIONS]).toBeDefined();
      }
    });
  });

  describe('resolveTestFilePath', () => {
    it('should resolve TypeScript alongside: foo.ts -> foo.test.ts', () => {
      const result = resolveTestFilePath('src/utils.ts', 'typescript');
      expect(result).toBe('src/utils.test.ts');
    });

    it('should resolve JavaScript alongside: foo.js -> foo.test.js', () => {
      const result = resolveTestFilePath('src/utils.js', 'javascript');
      expect(result).toBe('src/utils.test.js');
    });

    it('should resolve Python tests directory: src/utils.py -> tests/test_utils.py', () => {
      const result = resolveTestFilePath('/project/src/utils.py', 'python', '/project');
      expect(result).toContain('tests');
      expect(result).toContain('test_utils.py');
    });

    it('should resolve Go alongside: handler.go -> handler_test.go', () => {
      const result = resolveTestFilePath('pkg/handler.go', 'go');
      expect(result).toBe('pkg/handler_test.go');
    });

    it('should resolve Rust inline (same file)', () => {
      const result = resolveTestFilePath('src/lib.rs', 'rust');
      expect(result).toBe('src/lib.rs');
    });

    it('should resolve Java maven mirror', () => {
      const result = resolveTestFilePath('/project/src/main/java/com/foo/UserService.java', 'java', '/project');
      expect(result).toContain('src/test/java');
      expect(result).toContain('UserServiceTest.java');
    });

    it('should resolve C# test project', () => {
      const result = resolveTestFilePath('/project/src/User.cs', 'csharp', '/project');
      expect(result).toContain('tests');
      expect(result).toContain('UserTests.cs');
    });

    it('should resolve Swift tests directory', () => {
      const result = resolveTestFilePath('/project/Sources/App.swift', 'swift', '/project');
      expect(result).toContain('Tests');
      expect(result).toContain('AppTests.swift');
    });

    it('should resolve Kotlin maven mirror', () => {
      const result = resolveTestFilePath('/project/src/main/kotlin/Service.kt', 'kotlin', '/project');
      expect(result).toContain('src/test/kotlin');
      expect(result).toContain('ServiceTest.kt');
    });

    it('should resolve Dart test directory', () => {
      const result = resolveTestFilePath('/project/lib/widget.dart', 'dart', '/project');
      expect(result).toContain('test');
      expect(result).toContain('widget_test.dart');
    });
  });

  describe('getTestFileConvention', () => {
    it('should return convention for TypeScript', () => {
      const conv = getTestFileConvention('typescript');
      expect(conv.strategy).toBe('alongside');
      expect(conv.testSuffix).toBe('.test');
    });

    it('should return convention for Rust', () => {
      const conv = getTestFileConvention('rust');
      expect(conv.strategy).toBe('inline');
    });
  });
});
