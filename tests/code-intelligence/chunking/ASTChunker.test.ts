/**
 * Tests for AST-aware code chunker
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ASTChunker, SimpleTokenCounter } from '../../../src/code-intelligence/chunking/ASTChunker.js';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('ASTChunker', () => {
  let chunker: ASTChunker;

  beforeEach(() => {
    chunker = new ASTChunker();
  });

  describe('Configuration', () => {
    it('should use default configuration', async () => {
      const config = chunker.getConfig();
      expect(config.minTokens).toBe(256);
      expect(config.maxTokens).toBe(512);
      expect(config.overlapPercent).toBe(15);
      expect(config.preserveSemanticBoundaries).toBe(true);
      expect(config.splitLargeEntities).toBe(true);
    });

    it('should allow custom configuration', async () => {
      const customChunker = new ASTChunker({
        minTokens: 128,
        maxTokens: 256,
        overlapPercent: 20,
      });

      const config = customChunker.getConfig();
      expect(config.minTokens).toBe(128);
      expect(config.maxTokens).toBe(256);
      expect(config.overlapPercent).toBe(20);
    });

    it('should calculate overlap tokens from percentage', async () => {
      const customChunker = new ASTChunker({
        maxTokens: 500,
        overlapPercent: 10,
      });

      const config = customChunker.getConfig();
      expect(config.overlapTokens).toBe(50); // 10% of 500
    });

    it('should allow updating configuration', async () => {
      chunker.setConfig({ maxTokens: 1024 });
      const config = chunker.getConfig();
      expect(config.maxTokens).toBe(1024);
    });
  });

  describe('Simple Token Counter', () => {
    it('should count tokens approximately', async () => {
      const counter = new SimpleTokenCounter();
      const text = 'function test() { return 42; }'; // 30 chars
      const tokens = counter.count(text);
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThanOrEqual(30); // ~4 chars per token
    });
  });

  describe('Basic Chunking', () => {
    it('should chunk a simple TypeScript file', async () => {
      const code = `
function add(a: number, b: number): number {
  return a + b;
}

function multiply(a: number, b: number): number {
  return a * b;
}

export class Calculator {
  add(a: number, b: number): number {
    return add(a, b);
  }

  multiply(a: number, b: number): number {
    return multiply(a, b);
  }
}
`;

      const result = await chunker.chunkFile('test.ts', code, 'typescript');

      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.stats.totalChunks).toBe(result.chunks.length);
      expect(result.stats.semanticPreservation).toBeGreaterThan(0);

      // Verify all chunks have required fields
      result.chunks.forEach((chunk) => {
        expect(chunk.id).toBeDefined();
        expect(chunk.content).toBeDefined();
        expect(chunk.filePath).toBe('test.ts');
        expect(chunk.language).toBe('typescript');
        expect(chunk.lineStart).toBeGreaterThan(0);
        expect(chunk.lineEnd).toBeGreaterThanOrEqual(chunk.lineStart);
        expect(chunk.tokenCount).toBeGreaterThan(0);
        expect(chunk.entityType).toBeDefined();
        expect(chunk.metadata).toBeDefined();
      });
    });

    it('should preserve semantic boundaries', async () => {
      const code = `
function complete() {
  const x = 1;
  const y = 2;
  return x + y;
}
`;

      const result = await chunker.chunkFile('test.ts', code, 'typescript');

      // Should have at least one chunk
      expect(result.chunks.length).toBeGreaterThan(0);

      // Find function chunk
      const functionChunk = result.chunks.find((c) => c.entityType === 'function');
      expect(functionChunk).toBeDefined();

      // Function should be complete (not split mid-function)
      if (functionChunk) {
        expect(functionChunk.metadata.isComplete).toBe(true);
        expect(functionChunk.content).toContain('function complete');
        expect(functionChunk.content).toContain('return x + y');
      }
    });

    it('should handle empty files', async () => {
      const result = await chunker.chunkFile('empty.ts', '', 'typescript');

      expect(result.chunks.length).toBe(0);
      expect(result.stats.totalChunks).toBe(0);
    });

    it('should handle single-line functions', async () => {
      const code = 'const add = (a: number, b: number) => a + b;';

      const result = await chunker.chunkFile('test.ts', code, 'typescript');

      expect(result.chunks.length).toBeGreaterThan(0);
      const chunk = result.chunks[0];
      expect(chunk.lineStart).toBe(chunk.lineEnd);
    });
  });

  describe('Large Entity Splitting', () => {
    it('should split very large functions', async () => {
      // Create a large function with many lines
      const lines: string[] = ['function largeFunction() {'];
      for (let i = 0; i < 200; i++) {
        lines.push(`  const var${i} = ${i};`);
      }
      lines.push('  return true;');
      lines.push('}');

      const code = lines.join('\n');
      const result = await chunker.chunkFile('test.ts', code, 'typescript');

      // Should create multiple chunks for the large function
      expect(result.chunks.length).toBeGreaterThan(1);

      // Verify split metadata
      const splitChunks = result.chunks.filter((c) => c.metadata.splitIndex !== undefined);
      if (splitChunks.length > 0) {
        splitChunks.forEach((chunk) => {
          expect(chunk.metadata.totalSplits).toBeGreaterThan(1);
          expect(chunk.metadata.isComplete).toBe(false);
        });
      }
    });

    it('should respect max token limit', async () => {
      const lines: string[] = ['function test() {'];
      for (let i = 0; i < 300; i++) {
        lines.push(`  console.log('Line ${i}');`);
      }
      lines.push('}');

      const code = lines.join('\n');
      const result = await chunker.chunkFile('test.ts', code, 'typescript');

      // All chunks should respect max token limit (with some tolerance for overlap)
      result.chunks.forEach((chunk) => {
        expect(chunk.tokenCount).toBeLessThanOrEqual(chunker.getConfig().maxTokens! * 1.5);
      });
    });
  });

  describe('Multiple Languages', () => {
    it('should chunk Python files', async () => {
      const code = `
def add(a, b):
    return a + b

class Calculator:
    def multiply(self, a, b):
        return a * b
`;

      const result = await chunker.chunkFile('test.py', code, 'python');

      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks[0].language).toBe('python');
    });

    it('should chunk JavaScript files', async () => {
      const code = `
function greet(name) {
  return 'Hello ' + name;
}

export default greet;
`;

      const result = await chunker.chunkFile('test.js', code, 'javascript');

      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks[0].language).toBe('javascript');
    });
  });

  describe('Metadata Completeness', () => {
    it('should include all required metadata fields', async () => {
      const code = `
export function testFunction(param1: string, param2: number): boolean {
  return param1.length > param2;
}
`;

      const result = await chunker.chunkFile('test.ts', code, 'typescript');

      const chunk = result.chunks.find((c) => c.entityType === 'function');
      expect(chunk).toBeDefined();

      if (chunk) {
        expect(chunk.metadata.filePath).toBe('test.ts');
        expect(chunk.metadata.language).toBe('typescript');
        expect(chunk.metadata.lineStart).toBeDefined();
        expect(chunk.metadata.lineEnd).toBeDefined();
        expect(chunk.metadata.entityType).toBe('function');
        expect(chunk.metadata.isComplete).toBeDefined();
      }
    });

    it('should include parent entity for methods', async () => {
      const code = `
class TestClass {
  testMethod() {
    return true;
  }
}
`;

      const result = await chunker.chunkFile('test.ts', code, 'typescript');

      const methodChunk = result.chunks.find((c) => c.entityType === 'method');

      if (methodChunk) {
        expect(methodChunk.parentEntity).toBe('TestClass');
        expect(methodChunk.metadata.parentClass).toBe('TestClass');
      }
    });
  });

  describe('Statistics', () => {
    it('should calculate correct statistics', async () => {
      const code = `
function test1() { return 1; }
function test2() { return 2; }
function test3() { return 3; }
`;

      const result = await chunker.chunkFile('test.ts', code, 'typescript');

      expect(result.stats.totalChunks).toBe(result.chunks.length);
      expect(result.stats.avgTokens).toBeGreaterThan(0);
      expect(result.stats.minTokens).toBeGreaterThan(0);
      expect(result.stats.maxTokens).toBeGreaterThanOrEqual(result.stats.minTokens);
      expect(result.stats.semanticPreservation).toBeGreaterThanOrEqual(0);
      expect(result.stats.semanticPreservation).toBeLessThanOrEqual(100);
      // totalTokens should be based on original tokens (before overlap)
      expect(result.stats.totalTokens).toBeGreaterThan(0);
      // Total with overlap should be >= original total
      const totalWithOverlap = result.chunks.reduce((sum, c) => sum + c.tokenCount, 0);
      expect(totalWithOverlap).toBeGreaterThanOrEqual(result.stats.totalTokens);
    });

    it('should calculate high semantic preservation for simple code', async () => {
      const code = `
function simple() {
  return 42;
}
`;

      const result = await chunker.chunkFile('test.ts', code, 'typescript');

      // Simple functions should have high semantic preservation
      expect(result.stats.semanticPreservation).toBeGreaterThan(50);
    });
  });

  describe('Edge Cases', () => {
    it('should handle files with only imports', async () => {
      const code = `
import { test } from '@jest/globals';
import { expect } from 'chai';
`;

      const result = await chunker.chunkFile('test.ts', code, 'typescript');

      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks[0].entityType).toBe('module');
    });

    it('should handle files with only comments', async () => {
      const code = `
// This is a comment
/* Multi-line
   comment */
`;

      const result = await chunker.chunkFile('test.ts', code, 'typescript');

      // Should create at least one chunk for module-level content
      expect(result.chunks.length).toBeGreaterThan(0);
    });

    it('should handle nested classes', async () => {
      const code = `
class Outer {
  class Inner {
    method() {
      return true;
    }
  }
}
`;

      const result = await chunker.chunkFile('test.ts', code, 'typescript');

      expect(result.chunks.length).toBeGreaterThan(0);
    });
  });

  describe('Fallback Chunking', () => {
    it('should use fallback for unsupported languages', async () => {
      const code = `
Some random text
that is not valid code
but should still be chunked
`;

      const result = await chunker.chunkFile('test.txt', code, 'unknown');

      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks[0].metadata.isFallback).toBe(true);
    });
  });
});
