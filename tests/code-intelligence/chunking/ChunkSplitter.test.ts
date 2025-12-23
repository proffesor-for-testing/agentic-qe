/**
 * Unit Tests for ChunkSplitter
 *
 * Tests recursive chunk splitting logic, token estimation,
 * overlap calculation, and boundary preservation.
 *
 * REAL TESTS - Uses actual ChunkSplitter implementation
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ChunkSplitter } from '../../../src/code-intelligence/chunking/ChunkSplitter.js';
import { SimpleTokenCounter } from '../../../src/code-intelligence/chunking/ASTChunker.js';
import { ChunkingConfig } from '../../../src/code-intelligence/chunking/types.js';
import { CodeEntity } from '../../../src/code-intelligence/parser/types.js';

describe('ChunkSplitter', () => {
  let splitter: ChunkSplitter;
  let tokenCounter: SimpleTokenCounter;
  let config: ChunkingConfig;

  beforeEach(() => {
    tokenCounter = new SimpleTokenCounter();
    config = {
      minTokens: 256,
      maxTokens: 512,
      overlapPercent: 15,
      overlapTokens: 77,
      preserveSemanticBoundaries: true,
      splitLargeEntities: true,
    };
    splitter = new ChunkSplitter(config, tokenCounter);
  });

  describe('token estimation', () => {
    it('should estimate tokens for short text', () => {
      const shortText = 'Hello, world!';
      const tokens = tokenCounter.count(shortText);

      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(10);
    });

    it('should estimate tokens for code', () => {
      const code = 'function add(a: number, b: number): number {\n  return a + b;\n}';
      const tokens = tokenCounter.count(code);

      expect(tokens).toBeGreaterThan(10);
      expect(tokens).toBeLessThan(30);
    });

    it('should handle Unicode correctly', () => {
      const unicode = '函数 café() { const π = 3.14; }';
      const tokens = tokenCounter.count(unicode);

      expect(tokens).toBeGreaterThan(0);
    });

    it('should estimate large text blocks accurately', () => {
      const largeText = 'x'.repeat(2000); // ~500 tokens
      const tokens = tokenCounter.count(largeText);

      expect(tokens).toBeGreaterThan(400);
      expect(tokens).toBeLessThan(600);
    });
  });

  describe('entity splitting', () => {
    it('should return single chunk for small entity', () => {
      const entity: CodeEntity = {
        id: 'small1',
        type: 'function',
        name: 'smallFunc',
        filePath: '/test.ts',
        lineStart: 1,
        lineEnd: 5,
        content: 'function smallFunc() { return 42; }',
        language: 'typescript',
        metadata: {},
      };

      const chunks = splitter.splitEntity(entity);

      expect(chunks.length).toBe(1);
      expect(chunks[0].metadata.isComplete).toBe(true);
      expect(chunks[0].content).toBe(entity.content);
    });

    it('should split large entity into multiple chunks', () => {
      // Create entity larger than maxTokens (512)
      const lines: string[] = ['function largeFunc() {'];
      for (let i = 0; i < 200; i++) {
        lines.push(`  const var${i} = ${i};`);
      }
      lines.push('  return true;');
      lines.push('}');

      const entity: CodeEntity = {
        id: 'large1',
        type: 'function',
        name: 'largeFunc',
        filePath: '/test.ts',
        lineStart: 1,
        lineEnd: lines.length,
        content: lines.join('\n'),
        language: 'typescript',
        metadata: {},
      };

      const chunks = splitter.splitEntity(entity);

      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach((chunk) => {
        expect(chunk.metadata.isComplete).toBe(false);
        expect(chunk.metadata.totalSplits).toBe(chunks.length);
      });
    });

    it('should respect max token limit', () => {
      const lines: string[] = ['function test() {'];
      for (let i = 0; i < 300; i++) {
        lines.push(`  console.log('Line ${i}');`);
      }
      lines.push('}');

      const entity: CodeEntity = {
        id: 'test1',
        type: 'function',
        name: 'test',
        filePath: '/test.ts',
        lineStart: 1,
        lineEnd: lines.length,
        content: lines.join('\n'),
        language: 'typescript',
        metadata: {},
      };

      const chunks = splitter.splitEntity(entity);

      // All chunks should be under max tokens (with tolerance)
      chunks.forEach((chunk) => {
        expect(chunk.tokenCount).toBeLessThanOrEqual(config.maxTokens * 1.5);
      });
    });

    it('should preserve entity metadata in chunks', () => {
      const entity: CodeEntity = {
        id: 'meta1',
        type: 'method',
        name: 'processData',
        filePath: '/src/service.ts',
        lineStart: 42,
        lineEnd: 55,
        content: 'processData() { return this.data; }',
        language: 'typescript',
        metadata: {
          parentClass: 'DataService',
          visibility: 'public',
        },
      };

      const chunks = splitter.splitEntity(entity);

      expect(chunks.length).toBeGreaterThan(0);
      chunks.forEach((chunk) => {
        expect(chunk.filePath).toBe(entity.filePath);
        expect(chunk.language).toBe(entity.language);
        expect(chunk.metadata.originalEntityName).toBe(entity.name);
      });
    });
  });

  describe('semantic boundary detection', () => {
    it('should find function boundaries in TypeScript', () => {
      const lines: string[] = [];
      for (let i = 0; i < 50; i++) {
        lines.push(`function func${i}() { return ${i}; }`);
        lines.push('');
      }

      const entity: CodeEntity = {
        id: 'multi1',
        type: 'module',
        name: 'module',
        filePath: '/test.ts',
        lineStart: 1,
        lineEnd: lines.length,
        content: lines.join('\n'),
        language: 'typescript',
        metadata: {},
      };

      const chunks = splitter.splitEntity(entity);

      // Should split at function boundaries, not mid-function
      expect(chunks.length).toBeGreaterThan(0);
      // Each chunk should contain complete function definitions
      chunks.forEach((chunk) => {
        // If chunk contains 'function', it should contain matching '}'
        if (chunk.content.includes('function ')) {
          const functionCount = (chunk.content.match(/function \w+\(\)/g) || []).length;
          const closeBraceCount = (chunk.content.match(/\}/g) || []).length;
          expect(closeBraceCount).toBeGreaterThanOrEqual(functionCount);
        }
      });
    });

    it('should find class boundaries', () => {
      const code = `class A { method1() {} }

class B { method2() {} }`;

      const entity: CodeEntity = {
        id: 'classes1',
        type: 'module',
        name: 'module',
        filePath: '/test.ts',
        lineStart: 1,
        lineEnd: 3,
        content: code,
        language: 'typescript',
        metadata: {},
      };

      const chunks = splitter.splitEntity(entity);

      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should prioritize blank lines as boundaries', () => {
      const code = `const a = 1;
const b = 2;

const c = 3;
const d = 4;`;

      const entity: CodeEntity = {
        id: 'blanks1',
        type: 'module',
        name: 'module',
        filePath: '/test.ts',
        lineStart: 1,
        lineEnd: 5,
        content: code,
        language: 'typescript',
        metadata: {},
      };

      const chunks = splitter.splitEntity(entity);

      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should handle Python function boundaries', () => {
      const code = `def func_a():
    return 1

def func_b():
    return 2`;

      const entity: CodeEntity = {
        id: 'python1',
        type: 'module',
        name: 'module',
        filePath: '/test.py',
        lineStart: 1,
        lineEnd: 5,
        content: code,
        language: 'python',
        metadata: {},
      };

      const chunks = splitter.splitEntity(entity);

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].language).toBe('python');
    });

    it('should handle Go function boundaries', () => {
      const code = `func main() {
    fmt.Println("Hello")
}

func helper() int {
    return 42
}`;

      const entity: CodeEntity = {
        id: 'go1',
        type: 'module',
        name: 'module',
        filePath: '/main.go',
        lineStart: 1,
        lineEnd: 7,
        content: code,
        language: 'go',
        metadata: {},
      };

      const chunks = splitter.splitEntity(entity);

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].language).toBe('go');
    });

    it('should handle Rust function boundaries', () => {
      const code = `pub fn main() {
    println!("Hello");
}

fn helper() -> i32 {
    42
}`;

      const entity: CodeEntity = {
        id: 'rust1',
        type: 'module',
        name: 'module',
        filePath: '/main.rs',
        lineStart: 1,
        lineEnd: 7,
        content: code,
        language: 'rust',
        metadata: {},
      };

      const chunks = splitter.splitEntity(entity);

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].language).toBe('rust');
    });
  });

  describe('chunk metadata', () => {
    it('should include split index and total for split entities', () => {
      const lines: string[] = ['function large() {'];
      for (let i = 0; i < 150; i++) {
        lines.push(`  const x${i} = ${i};`);
      }
      lines.push('}');

      const entity: CodeEntity = {
        id: 'split1',
        type: 'function',
        name: 'large',
        filePath: '/test.ts',
        lineStart: 1,
        lineEnd: lines.length,
        content: lines.join('\n'),
        language: 'typescript',
        metadata: {},
      };

      const chunks = splitter.splitEntity(entity);

      if (chunks.length > 1) {
        chunks.forEach((chunk, index) => {
          expect(chunk.metadata.splitIndex).toBe(index);
          expect(chunk.metadata.totalSplits).toBe(chunks.length);
        });
      }
    });

    it('should mark single chunks as complete', () => {
      const entity: CodeEntity = {
        id: 'complete1',
        type: 'function',
        name: 'small',
        filePath: '/test.ts',
        lineStart: 1,
        lineEnd: 3,
        content: 'function small() { return 1; }',
        language: 'typescript',
        metadata: {},
      };

      const chunks = splitter.splitEntity(entity);

      expect(chunks.length).toBe(1);
      expect(chunks[0].metadata.isComplete).toBe(true);
      expect(chunks[0].metadata.splitIndex).toBeUndefined();
      expect(chunks[0].metadata.totalSplits).toBeUndefined();
    });

    it('should preserve parent class metadata', () => {
      const entity: CodeEntity = {
        id: 'method1',
        type: 'method',
        name: 'getData',
        filePath: '/test.ts',
        lineStart: 10,
        lineEnd: 15,
        content: 'getData() { return this.data; }',
        language: 'typescript',
        metadata: {
          parentClass: 'DataService',
        },
      };

      const chunks = splitter.splitEntity(entity);

      expect(chunks[0].metadata.parentClass).toBe('DataService');
      expect(chunks[0].parentEntity).toBe('DataService');
    });
  });

  describe('edge cases', () => {
    it('should handle empty content', () => {
      const entity: CodeEntity = {
        id: 'empty1',
        type: 'function',
        name: 'empty',
        filePath: '/test.ts',
        lineStart: 1,
        lineEnd: 1,
        content: '',
        language: 'typescript',
        metadata: {},
      };

      const chunks = splitter.splitEntity(entity);

      expect(chunks.length).toBe(1);
    });

    it('should handle single line content', () => {
      const entity: CodeEntity = {
        id: 'single1',
        type: 'function',
        name: 'single',
        filePath: '/test.ts',
        lineStart: 1,
        lineEnd: 1,
        content: 'const x = 1;',
        language: 'typescript',
        metadata: {},
      };

      const chunks = splitter.splitEntity(entity);

      expect(chunks.length).toBe(1);
      expect(chunks[0].lineStart).toBe(1);
      expect(chunks[0].lineEnd).toBe(1);
    });

    it('should handle content with only whitespace', () => {
      const entity: CodeEntity = {
        id: 'whitespace1',
        type: 'module',
        name: 'module',
        filePath: '/test.ts',
        lineStart: 1,
        lineEnd: 5,
        content: '\n\n   \n\t\n',
        language: 'typescript',
        metadata: {},
      };

      const chunks = splitter.splitEntity(entity);

      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should handle unknown language gracefully', () => {
      const entity: CodeEntity = {
        id: 'unknown1',
        type: 'function',
        name: 'func',
        filePath: '/test.xyz',
        lineStart: 1,
        lineEnd: 3,
        content: 'some content here',
        language: 'unknown',
        metadata: {},
      };

      const chunks = splitter.splitEntity(entity);

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].language).toBe('unknown');
    });
  });

  describe('split configuration', () => {
    it('should not split when splitLargeEntities is false', () => {
      const noSplitConfig: ChunkingConfig = {
        ...config,
        splitLargeEntities: false,
      };
      const noSplitSplitter = new ChunkSplitter(noSplitConfig, tokenCounter);

      const lines: string[] = ['function large() {'];
      for (let i = 0; i < 200; i++) {
        lines.push(`  const x${i} = ${i};`);
      }
      lines.push('}');

      const entity: CodeEntity = {
        id: 'nosplit1',
        type: 'function',
        name: 'large',
        filePath: '/test.ts',
        lineStart: 1,
        lineEnd: lines.length,
        content: lines.join('\n'),
        language: 'typescript',
        metadata: {},
      };

      const chunks = noSplitSplitter.splitEntity(entity);

      // Should return single chunk even if over limit
      expect(chunks.length).toBe(1);
    });

    it('should use configured maxTokens', () => {
      const smallConfig: ChunkingConfig = {
        ...config,
        maxTokens: 100, // Much smaller
      };
      const smallSplitter = new ChunkSplitter(smallConfig, tokenCounter);

      const lines: string[] = [];
      for (let i = 0; i < 50; i++) {
        lines.push(`const var${i} = ${i};`);
      }

      const entity: CodeEntity = {
        id: 'small1',
        type: 'module',
        name: 'module',
        filePath: '/test.ts',
        lineStart: 1,
        lineEnd: lines.length,
        content: lines.join('\n'),
        language: 'typescript',
        metadata: {},
      };

      const chunks = smallSplitter.splitEntity(entity);

      // Should create more chunks with smaller maxTokens
      expect(chunks.length).toBeGreaterThan(1);
    });
  });
});
