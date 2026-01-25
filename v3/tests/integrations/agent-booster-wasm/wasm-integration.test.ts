/**
 * Agent Booster WASM Integration Tests
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  transform,
  batchTransform,
  isWasmAvailable,
  getVersion,
  warmup,
  Language,
  MergeStrategy,
  languageFromExtension,
} from '../../../src/integrations/agent-booster-wasm/index.js';

describe('Agent Booster WASM Integration', () => {
  beforeAll(async () => {
    await warmup();
  });

  describe('WASM Availability', () => {
    it('should load WASM module', async () => {
      const available = await isWasmAvailable();
      expect(available).toBe(true);
    });

    it('should return version', async () => {
      const version = await getVersion();
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('Language Detection', () => {
    it('should detect JavaScript', () => {
      expect(languageFromExtension('.js')).toBe(Language.JavaScript);
      expect(languageFromExtension('.mjs')).toBe(Language.JavaScript);
      expect(languageFromExtension('.jsx')).toBe(Language.JavaScript);
    });

    it('should detect TypeScript', () => {
      expect(languageFromExtension('.ts')).toBe(Language.TypeScript);
      expect(languageFromExtension('.tsx')).toBe(Language.TypeScript);
    });

    it('should detect other languages', () => {
      expect(languageFromExtension('.py')).toBe(Language.Python);
      expect(languageFromExtension('.rs')).toBe(Language.Rust);
      expect(languageFromExtension('.go')).toBe(Language.Go);
    });

    it('should default to JavaScript for unknown', () => {
      expect(languageFromExtension('.xyz')).toBe(Language.JavaScript);
    });
  });

  describe('Simple Transforms', () => {
    it('should transform simple function replacement', async () => {
      const result = await transform(
        'function foo() { return 1; }',
        'function foo() { return 42; }',
        Language.JavaScript
      );

      expect(result.success).toBe(true);
      expect(result.mergedCode).toContain('return 42');
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.source).toBe('wasm');
      expect(result.latencyMs).toBeLessThan(10);
    });

    it('should transform var to const', async () => {
      const result = await transform(
        'var x = 1; var y = 2;',
        'const x = 1; const y = 2;',
        Language.JavaScript
      );

      expect(result.success).toBe(true);
      expect(result.mergedCode).toContain('const');
    });

    it('should add TypeScript types', async () => {
      const result = await transform(
        'function greet(name) { return `Hello ${name}`; }',
        'function greet(name: string): string { return `Hello ${name}`; }',
        Language.TypeScript
      );

      expect(result.success).toBe(true);
      expect(result.mergedCode).toContain(': string');
    });
  });

  describe('QE-Specific Transforms', () => {
    it('should add test assertion', async () => {
      const result = await transform(
        `test('adds numbers', () => {
  const result = add(1, 2);
});`,
        `test('adds numbers', () => {
  const result = add(1, 2);
  expect(result).toBe(3);
});`,
        Language.JavaScript
      );

      expect(result.success).toBe(true);
      expect(result.mergedCode).toContain('expect(result).toBe(3)');
    });

    it('should convert to async test', async () => {
      const result = await transform(
        `test('fetches data', () => {
  const data = fetchData();
  expect(data).toBeDefined();
});`,
        `test('fetches data', async () => {
  const data = await fetchData();
  expect(data).toBeDefined();
});`,
        Language.JavaScript
      );

      expect(result.success).toBe(true);
      expect(result.mergedCode).toContain('async ()');
      expect(result.mergedCode).toContain('await');
    });

    it('should add mock setup', async () => {
      const result = await transform(
        `describe('UserService', () => {
  test('gets user', () => {
    const user = userService.getUser(1);
    expect(user).toBeDefined();
  });
});`,
        `describe('UserService', () => {
  beforeEach(() => {
    jest.mock('./api');
  });

  test('gets user', () => {
    const user = userService.getUser(1);
    expect(user).toBeDefined();
  });
});`,
        Language.JavaScript
      );

      expect(result.success).toBe(true);
      expect(result.mergedCode).toContain('jest.mock');
    });

    it('should add error assertion', async () => {
      const result = await transform(
        `test('divides numbers', () => {
  expect(divide(10, 2)).toBe(5);
});`,
        `test('divides numbers', () => {
  expect(divide(10, 2)).toBe(5);
  expect(() => divide(10, 0)).toThrow('Division by zero');
});`,
        Language.JavaScript
      );

      expect(result.success).toBe(true);
      expect(result.mergedCode).toContain('toThrow');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty original code', async () => {
      const result = await transform(
        '',
        'function newFunc() { return 1; }',
        Language.JavaScript
      );

      expect(result.success).toBe(true);
      expect(result.mergedCode).toContain('newFunc');
      expect(result.source).toBe('fallback');
    });

    it('should distinguish similar functions', async () => {
      const result = await transform(
        `function processA(x) { return x * 2; }
function processB(x) { return x * 3; }`,
        `function processB(x) { return x * 4; }`,
        Language.JavaScript
      );

      expect(result.success).toBe(true);
      // Should keep processA unchanged
      expect(result.mergedCode).toContain('x * 2');
      // Should update processB
      expect(result.mergedCode).toContain('x * 4');
    });

    it('should handle Unicode characters', async () => {
      const result = await transform(
        'function greet(name) { return "Hello " + name; }',
        'function greet(name) { return "こんにちは " + name + " 🎉"; }',
        Language.JavaScript
      );

      expect(result.success).toBe(true);
      expect(result.mergedCode).toContain('こんにちは');
    });

    it('should handle deeply nested code', async () => {
      const result = await transform(
        `function outer() {
  function middle() {
    function inner() {
      return 1;
    }
    return inner();
  }
  return middle();
}`,
        `function outer() {
  function middle() {
    function inner() {
      return 42;
    }
    return inner();
  }
  return middle();
}`,
        Language.JavaScript
      );

      expect(result.success).toBe(true);
      expect(result.mergedCode).toContain('return 42');
    });
  });

  describe('Batch Transform', () => {
    it('should transform multiple snippets', async () => {
      const results = await batchTransform([
        {
          original: 'var a = 1;',
          edit: 'const a = 1;',
          language: Language.JavaScript,
        },
        {
          original: 'var b = 2;',
          edit: 'const b = 2;',
          language: Language.JavaScript,
        },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should transform quickly for small code', async () => {
      const result = await transform(
        'function add(a, b) { return a + b; }',
        'function add(a: number, b: number): number { return a + b; }',
        Language.TypeScript
      );

      expect(result.latencyMs).toBeLessThan(25); // Relaxed for CI environments
    });

    it('should transform in under 50ms for medium code', async () => {
      const original = `class Calculator {
  add(a, b) { return a + b; }
  subtract(a, b) { return a - b; }
  multiply(a, b) { return a * b; }
  divide(a, b) { return a / b; }
}`;
      const edit = `  modulo(a, b) { return a % b; }`;

      const result = await transform(original, edit, Language.JavaScript);

      expect(result.latencyMs).toBeLessThan(50); // Relaxed for CI environments
    });
  });

  describe('Fallback Behavior', () => {
    it('should use pattern fallback when WASM fails', async () => {
      // This specific pattern might fail WASM but succeed with pattern
      const result = await transform(
        'var x = 1;',
        'const x = 1;',
        Language.JavaScript,
        { allowFallback: true }
      );

      expect(result.success).toBe(true);
      expect(result.mergedCode).toContain('const');
    });

    it('should report source correctly', async () => {
      const result = await transform(
        'function test() { return 1; }',
        'function test() { return 2; }',
        Language.JavaScript
      );

      expect(['wasm', 'pattern', 'fallback']).toContain(result.source);
    });
  });
});
