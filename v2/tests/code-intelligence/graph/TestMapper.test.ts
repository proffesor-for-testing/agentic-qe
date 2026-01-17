/**
 * Unit Tests for TestMapper
 *
 * Tests mapping of test files to source files.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { TestMapper } from '../../../src/code-intelligence/graph/TestMapper.js';
import * as path from 'path';

describe('TestMapper', () => {
  let mapper: TestMapper;

  beforeEach(() => {
    mapper = new TestMapper(process.cwd());
  });

  describe('test file detection', () => {
    it('should detect .test.ts files', () => {
      expect(mapper.isTestFile('/src/utils.test.ts')).toBe(true);
      expect(mapper.isTestFile('/src/UserService.test.ts')).toBe(true);
    });

    it('should detect .spec.ts files', () => {
      expect(mapper.isTestFile('/src/utils.spec.ts')).toBe(true);
      expect(mapper.isTestFile('/src/auth.spec.tsx')).toBe(true);
    });

    it('should detect files in test directories', () => {
      expect(mapper.isTestFile('/tests/utils.ts')).toBe(true);
      expect(mapper.isTestFile('/test/helpers.ts')).toBe(true);
      expect(mapper.isTestFile('/__tests__/integration.ts')).toBe(true);
    });

    it('should not detect regular source files as tests', () => {
      expect(mapper.isTestFile('/src/utils.ts')).toBe(false);
      expect(mapper.isTestFile('/lib/helpers.ts')).toBe(false);
    });
  });

  describe('source file name extraction', () => {
    it('should extract source name from .test.ts', () => {
      expect(mapper.getSourceFileName('UserService.test.ts')).toBe('UserService.ts');
    });

    it('should extract source name from .spec.ts', () => {
      expect(mapper.getSourceFileName('auth.spec.ts')).toBe('auth.ts');
    });

    it('should handle multiple patterns', () => {
      expect(mapper.getSourceFileName('helper_test.ts')).toBe('helper.ts');
      expect(mapper.getSourceFileName('config_spec.ts')).toBe('config.ts');
    });
  });

  describe('test file mapping', () => {
    it('should map test files to source files', async () => {
      // This test uses actual project structure
      const mappings = await mapper.mapTestFiles();

      // Should return an array
      expect(Array.isArray(mappings)).toBe(true);

      // Each mapping should have required fields
      for (const mapping of mappings) {
        expect(mapping.testFile).toBeDefined();
        expect(mapping.sourceFile).toBeDefined();
        expect(mapping.confidence).toBeGreaterThan(0);
        expect(mapping.confidence).toBeLessThanOrEqual(1);
        expect(['naming', 'import', 'proximity', 'content']).toContain(mapping.matchType);
      }
    });

    it('should have high confidence for naming-based matches', async () => {
      const mappings = await mapper.mapTestFiles();

      const namingMatches = mappings.filter((m) => m.matchType === 'naming');

      for (const match of namingMatches) {
        expect(match.confidence).toBeGreaterThanOrEqual(0.9);
      }
    });
  });

  describe('file lists', () => {
    it('should separate test and source files', async () => {
      await mapper.mapTestFiles(); // This populates the lists

      const testFiles = mapper.getTestFiles();
      const sourceFiles = mapper.getSourceFiles();

      // Should have some test files
      expect(testFiles.length).toBeGreaterThan(0);
      expect(sourceFiles.length).toBeGreaterThan(0);

      // All test files should be detected as tests
      for (const file of testFiles) {
        expect(mapper.isTestFile(file)).toBe(true);
      }

      // Source files should not be tests
      for (const file of sourceFiles) {
        expect(mapper.isTestFile(file)).toBe(false);
      }
    });
  });

  describe('clear', () => {
    it('should clear cached file lists', async () => {
      await mapper.mapTestFiles();

      expect(mapper.getTestFiles().length).toBeGreaterThan(0);

      mapper.clear();

      expect(mapper.getTestFiles().length).toBe(0);
      expect(mapper.getSourceFiles().length).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle test files without matching source', async () => {
      const mappings = await mapper.mapTestFiles();

      // This is valid - not all tests may have a clear source mapping
      // Just ensure no errors
      expect(Array.isArray(mappings)).toBe(true);
    });

    it('should handle nested test directories', () => {
      expect(mapper.isTestFile('/project/tests/unit/services/auth.ts')).toBe(true);
      expect(mapper.isTestFile('/project/src/__tests__/utils/helper.ts')).toBe(true);
    });
  });
});
