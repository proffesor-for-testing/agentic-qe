/**
 * Unit tests for the tree-sitter TS/JS extractor (#511).
 *
 * Verifies code-intelligence can extract entities/imports from TypeScript and
 * JavaScript using the bundled WASM grammars — with NO `typescript` dependency.
 */

import { describe, it, expect } from 'vitest';
import { extractTsJs, isTreeSitterTsExtension } from '../../../../src/shared/parsers/treesitter-ts-extractor';

describe('treesitter-ts-extractor', () => {
  describe('isTreeSitterTsExtension', () => {
    it('should recognize ts/tsx/js/jsx/mjs/cjs and reject others', () => {
      for (const ext of ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts']) {
        expect(isTreeSitterTsExtension(ext)).toBe(true);
      }
      for (const ext of ['py', 'java', 'go', 'txt', '']) {
        expect(isTreeSitterTsExtension(ext)).toBe(false);
      }
    });
  });

  describe('extractTsJs — TypeScript', () => {
    it('should extract functions, async arrow, class+methods, interface and imports', async () => {
      // Arrange
      const code = [
        `import { add } from './math';`,
        `import def from "pkg";`,
        `export function compute(a: number): number { return add(a, 1); }`,
        `export const arrow = async (x: number) => x * 2;`,
        `export class Calc { run(y: number) { return y; } private helper() { return 1; } }`,
        `export interface Shape { area(): number; }`,
      ].join('\n');

      // Act
      const result = await extractTsJs(code, 'ts');

      // Assert
      expect(result).not.toBeNull();
      expect(result!.functions.map((f) => f.name)).toEqual(expect.arrayContaining(['compute', 'arrow']));
      expect(result!.functions.find((f) => f.name === 'arrow')!.isAsync).toBe(true);
      expect(result!.classes[0].name).toBe('Calc');
      expect(result!.classes[0].methods.map((m) => m.name)).toEqual(expect.arrayContaining(['run', 'helper']));
      expect(result!.classes[0].methods.find((m) => m.name === 'helper')!.visibility).toBe('private');
      expect(result!.interfaces.map((i) => i.name)).toContain('Shape');
      expect(result!.imports).toEqual(expect.arrayContaining(['./math', 'pkg']));
    });
  });

  describe('extractTsJs — JavaScript', () => {
    it('should extract a function, a class method, and a require() import', async () => {
      // Arrange
      const code = `const dep = require('./y');\nfunction f() {}\nclass C { m() {} }`;

      // Act
      const result = await extractTsJs(code, 'js');

      // Assert
      expect(result).not.toBeNull();
      expect(result!.functions.map((f) => f.name)).toContain('f');
      expect(result!.classes[0].methods.map((m) => m.name)).toContain('m');
      expect(result!.imports).toContain('./y');
    });
  });

  describe('extractTsJs — TSX', () => {
    it('should parse tsx and extract the exported function', async () => {
      // Arrange / Act
      const result = await extractTsJs(
        `import { X } from './x';\nexport function Widget() { return null; }`,
        'tsx'
      );

      // Assert
      expect(result).not.toBeNull();
      expect(result!.functions.map((f) => f.name)).toContain('Widget');
      expect(result!.imports).toContain('./x');
    });
  });

  describe('unsupported extension', () => {
    it('should return null for a non-TS/JS extension', async () => {
      const result = await extractTsJs('print(1)', 'py');
      expect(result).toBeNull();
    });
  });
});
