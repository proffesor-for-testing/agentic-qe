/**
 * CodeSignatureGenerator Tests
 * Phase 2 (v1.1.0) - Pattern Extraction Specialist
 */

import { CodeSignatureGenerator } from '../../../src/reasoning/CodeSignatureGenerator';
import { PatternType } from '../../../src/types/pattern.types';

describe('CodeSignatureGenerator', () => {
  let generator: CodeSignatureGenerator;

  beforeEach(() => {
    generator = new CodeSignatureGenerator();
  });

  describe('generate', () => {
    it('should generate signature for simple function', async () => {
      const code = `
function add(a: number, b: number): number {
  return a + b;
}
      `;

      const signature = await generator.generate(code);

      expect(signature.id).toBeDefined();
      expect(signature.functionSignature).toContain('add');
      expect(signature.parameterTypes).toHaveLength(2);
      expect(signature.returnType).toBeTruthy();
      expect(signature.sourceHash).toBeDefined();
      expect(signature.createdAt).toBeInstanceOf(Date);
    });

    it('should extract parameter types correctly', async () => {
      const code = `
function process(name: string, age: number, active?: boolean): void {
  console.log(name, age, active);
}
      `;

      const signature = await generator.generate(code);

      expect(signature.parameterTypes).toHaveLength(3);
      expect(signature.parameterTypes[0].name).toBe('name');
      expect(signature.parameterTypes[0].type).toBe('string');
      expect(signature.parameterTypes[1].name).toBe('age');
      expect(signature.parameterTypes[1].type).toBe('number');
      expect(signature.parameterTypes[2].optional).toBe(true);
    });

    it('should calculate cyclomatic complexity', async () => {
      const simpleCode = `
function simple(x: number): number {
  return x * 2;
}
      `;

      const complexCode = `
function complex(x: number): number {
  if (x > 0) {
    if (x < 10) {
      return x * 2;
    } else {
      return x * 3;
    }
  } else {
    return 0;
  }
}
      `;

      const simpleSignature = await generator.generate(simpleCode);
      const complexSignature = await generator.generate(complexCode);

      expect(simpleSignature.complexity).toBe(1);
      expect(complexSignature.complexity).toBeGreaterThan(simpleSignature.complexity);
    });

    it('should identify async patterns', async () => {
      const code = `
async function fetchData(): Promise<any> {
  const response = await fetch('/api/data');
  return await response.json();
}
      `;

      const signature = await generator.generate(code);

      const asyncPattern = signature.patterns.find(p => p.type === PatternType.ASYNC_PATTERN);
      expect(asyncPattern).toBeDefined();
      expect(asyncPattern!.confidence).toBeGreaterThan(0.9);
    });

    it('should identify error handling patterns', async () => {
      const code = `
function riskyOperation(): void {
  try {
    dangerousCall();
  } catch (error) {
    handleError(error);
  }
}
      `;

      const signature = await generator.generate(code);

      const errorPattern = signature.patterns.find(p => p.type === PatternType.ERROR_HANDLING);
      expect(errorPattern).toBeDefined();
      expect(errorPattern!.confidence).toBeGreaterThan(0.8);
    });

    it('should identify boundary check patterns', async () => {
      const code = `
function validate(value: number): boolean {
  return value >= 0 && value <= 100;
}
      `;

      const signature = await generator.generate(code);

      const boundaryPattern = signature.patterns.find(p => p.type === PatternType.BOUNDARY_CONDITION);
      expect(boundaryPattern).toBeDefined();
    });

    it('should extract dependencies', async () => {
      const code = `
import { Logger } from './logger';
import * as fs from 'fs';
const path = require('path');

function processFile(filePath: string): void {
  Logger.log(filePath);
}
      `;

      const signature = await generator.generate(code);

      expect(signature.dependencies).toContain('./logger');
      expect(signature.dependencies).toContain('fs');
      expect(signature.dependencies).toContain('path');
    });

    it('should extract node types', async () => {
      const code = `
function example(x: number): number {
  if (x > 0) {
    return x * 2;
  }
  return 0;
}
      `;

      const signature = await generator.generate(code);

      expect(signature.nodeTypes).toContain('FunctionDeclaration');
      expect(signature.nodeTypes).toContain('IfStatement');
      expect(signature.nodeTypes).toContain('ReturnStatement');
    });

    it('should generate unique hash for different code', async () => {
      const code1 = 'function a() { return 1; }';
      const code2 = 'function b() { return 2; }';

      const sig1 = await generator.generate(code1);
      const sig2 = await generator.generate(code2);

      expect(sig1.sourceHash).not.toBe(sig2.sourceHash);
      expect(sig1.id).not.toBe(sig2.id);
    });

    it('should handle arrow functions', async () => {
      const code = `
const add = (a: number, b: number): number => a + b;
      `;

      const signature = await generator.generate(code);

      expect(signature.functionSignature).toBeDefined();
      expect(signature.parameterTypes).toHaveLength(2);
    });

    it('should handle class methods', async () => {
      const code = `
class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }
}
      `;

      const signature = await generator.generate(code);

      expect(signature.functionSignature).toContain('add');
      expect(signature.parameterTypes).toHaveLength(2);
    });

    it('should handle complex control flow', async () => {
      const code = `
function complex(items: number[]): number {
  let sum = 0;
  for (const item of items) {
    if (item > 0) {
      sum += item;
    } else if (item < 0) {
      sum -= item;
    }
  }
  while (sum > 100) {
    sum /= 2;
  }
  return sum;
}
      `;

      const signature = await generator.generate(code);

      expect(signature.complexity).toBeGreaterThan(5);
      expect(signature.nodeTypes).toContain('ForOfStatement');
      expect(signature.nodeTypes).toContain('WhileStatement');
    });
  });

  describe('performance', () => {
    it('should generate signatures quickly', async () => {
      const code = `
function testFunc(a: number, b: string, c: boolean): any {
  if (a > 0) {
    return b + c.toString();
  }
  return null;
}
      `;

      const iterations = 100;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await generator.generate(code);
      }

      const duration = Date.now() - startTime;
      const avgTime = duration / iterations;

      // Should be fast - avg < 50ms per generation
      expect(avgTime).toBeLessThan(50);
    });
  });
});
