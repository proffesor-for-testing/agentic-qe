/**
 * Unit Tests for CLI File Discovery (Fix #280)
 *
 * Tests the shared walkSourceFiles utility that replaced
 * duplicated inline walkers in test/coverage/security/code commands.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { walkSourceFiles } from '../../../../src/cli/utils/file-discovery';

describe('walkSourceFiles (Fix #280)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `aqe-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should find TypeScript files', () => {
    writeFileSync(join(tempDir, 'index.ts'), 'export const x = 1;');
    writeFileSync(join(tempDir, 'app.tsx'), 'export default App;');

    const files = walkSourceFiles(tempDir);
    expect(files.length).toBe(2);
    expect(files.some(f => f.endsWith('.ts'))).toBe(true);
    expect(files.some(f => f.endsWith('.tsx'))).toBe(true);
  });

  it('should find Python files', () => {
    writeFileSync(join(tempDir, 'main.py'), 'print("hello")');
    writeFileSync(join(tempDir, 'util.pyw'), 'pass');

    const files = walkSourceFiles(tempDir);
    expect(files.length).toBe(2);
  });

  it('should find Go files', () => {
    writeFileSync(join(tempDir, 'main.go'), 'package main');

    const files = walkSourceFiles(tempDir);
    expect(files.length).toBe(1);
    expect(files[0]).toContain('.go');
  });

  it('should find Rust files', () => {
    writeFileSync(join(tempDir, 'lib.rs'), 'fn main() {}');

    const files = walkSourceFiles(tempDir);
    expect(files.length).toBe(1);
    expect(files[0]).toContain('.rs');
  });

  it('should find Java and Kotlin files', () => {
    writeFileSync(join(tempDir, 'App.java'), 'class App {}');
    writeFileSync(join(tempDir, 'Main.kt'), 'fun main() {}');

    const files = walkSourceFiles(tempDir);
    expect(files.length).toBe(2);
  });

  it('should find C/C++ files', () => {
    writeFileSync(join(tempDir, 'main.c'), 'int main() {}');
    writeFileSync(join(tempDir, 'lib.cpp'), 'class Lib {};');
    writeFileSync(join(tempDir, 'lib.h'), '#pragma once');

    const files = walkSourceFiles(tempDir);
    expect(files.length).toBe(3);
  });

  it('should skip node_modules', () => {
    const nmDir = join(tempDir, 'node_modules', 'pkg');
    mkdirSync(nmDir, { recursive: true });
    writeFileSync(join(nmDir, 'index.ts'), 'export {};');
    writeFileSync(join(tempDir, 'src.ts'), 'export {};');

    const files = walkSourceFiles(tempDir);
    expect(files.length).toBe(1);
    expect(files[0]).toContain('src.ts');
  });

  it('should skip dist and build dirs', () => {
    for (const dir of ['dist', 'build']) {
      const d = join(tempDir, dir);
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, 'bundle.js'), 'var x;');
    }
    writeFileSync(join(tempDir, 'app.js'), 'const x = 1;');

    const files = walkSourceFiles(tempDir);
    expect(files.length).toBe(1);
  });

  it('should skip __pycache__ and .venv', () => {
    for (const dir of ['__pycache__', '.venv']) {
      const d = join(tempDir, dir);
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, 'mod.py'), 'pass');
    }
    writeFileSync(join(tempDir, 'main.py'), 'pass');

    const files = walkSourceFiles(tempDir);
    expect(files.length).toBe(1);
  });

  it('should exclude test files when includeTests is false', () => {
    writeFileSync(join(tempDir, 'app.ts'), 'export {};');
    writeFileSync(join(tempDir, 'app.test.ts'), 'it("works", () => {});');
    writeFileSync(join(tempDir, 'app.spec.ts'), 'describe("app", () => {});');

    const files = walkSourceFiles(tempDir, { includeTests: false });
    expect(files.length).toBe(1);
    expect(files[0]).toContain('app.ts');
  });

  it('should include test files when includeTests is true', () => {
    writeFileSync(join(tempDir, 'app.ts'), 'export {};');
    writeFileSync(join(tempDir, 'app.test.ts'), 'it("works", () => {});');

    const files = walkSourceFiles(tempDir, { includeTests: true });
    expect(files.length).toBe(2);
  });

  it('should return only test files when testsOnly is true', () => {
    writeFileSync(join(tempDir, 'app.ts'), 'export {};');
    writeFileSync(join(tempDir, 'app.test.ts'), 'it("works", () => {});');
    writeFileSync(join(tempDir, 'app.spec.js'), 'describe("x", () => {});');
    writeFileSync(join(tempDir, 'test_main.py'), 'def test_x(): pass');

    const files = walkSourceFiles(tempDir, { testsOnly: true });
    expect(files.length).toBe(3);
    expect(files.every(f =>
      f.includes('.test.') || f.includes('.spec.') || f.includes('test_')
    )).toBe(true);
  });

  it('should respect maxDepth option', () => {
    const deep = join(tempDir, 'a', 'b', 'c');
    mkdirSync(deep, { recursive: true });
    writeFileSync(join(tempDir, 'root.ts'), 'export {};');
    writeFileSync(join(tempDir, 'a', 'level1.ts'), 'export {};');
    writeFileSync(join(tempDir, 'a', 'b', 'level2.ts'), 'export {};');
    writeFileSync(join(deep, 'level3.ts'), 'export {};');

    const files = walkSourceFiles(tempDir, { maxDepth: 2 });
    expect(files.length).toBe(3); // root + level1 + level2
  });

  it('should handle non-existent path gracefully', () => {
    const files = walkSourceFiles(join(tempDir, 'nonexistent'));
    expect(files).toEqual([]);
  });

  it('should handle single file path', () => {
    const filePath = join(tempDir, 'single.ts');
    writeFileSync(filePath, 'export {};');

    const files = walkSourceFiles(filePath);
    expect(files.length).toBe(1);
    expect(files[0]).toBe(filePath);
  });

  it('should ignore non-source extensions', () => {
    writeFileSync(join(tempDir, 'readme.md'), '# Hello');
    writeFileSync(join(tempDir, 'data.json'), '{}');
    writeFileSync(join(tempDir, 'styles.css'), 'body {}');
    writeFileSync(join(tempDir, 'image.png'), 'binary');

    const files = walkSourceFiles(tempDir);
    expect(files.length).toBe(0);
  });
});
