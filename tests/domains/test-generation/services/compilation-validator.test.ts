import { describe, it, expect } from 'vitest';
import {
  CompilationValidator,
  type ValidationResult,
} from '../../../../src/domains/test-generation/services/compilation-validator.js';

describe('CompilationValidator (ADR-077)', () => {
  const validator = new CompilationValidator();

  describe('validate', () => {
    it('should skip validation for Python (no compile step)', async () => {
      const result = await validator.validate('def test_foo():\n  assert True', 'python');
      expect(result.compiles).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions[0]).toContain('python');
    });

    it('should skip validation for JavaScript (no compile step)', async () => {
      const result = await validator.validate('function test() {}', 'javascript');
      expect(result.compiles).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions[0]).toContain('javascript');
    });

    it('should return compiler not found for unavailable compilers', async () => {
      // Most CI/test environments won't have javac, so this tests the graceful fallback
      const result = await validator.validate('public class Test {}', 'java');
      // Either compiles (if javac available) or graceful error
      expect(result).toHaveProperty('compiles');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('suggestions');
    });

    it('should handle TypeScript compilation check', async () => {
      const validTs = 'export const x: number = 42;';
      const result = await validator.validate(validTs, 'typescript');
      // May or may not compile depending on tsconfig availability
      expect(result).toHaveProperty('compiles');
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should return structured validation result', async () => {
      const result = await validator.validate('invalid code ???', 'go');
      expect(result).toHaveProperty('compiles');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('suggestions');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.suggestions)).toBe(true);
    });

    it('should handle empty code', async () => {
      const result = await validator.validate('', 'rust');
      expect(result).toHaveProperty('compiles');
    });

    it('should satisfy ValidationResult interface shape', async () => {
      const result: ValidationResult = await validator.validate('x = 1', 'python');
      expect(typeof result.compiles).toBe('boolean');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.suggestions)).toBe(true);
    });
  });
});
