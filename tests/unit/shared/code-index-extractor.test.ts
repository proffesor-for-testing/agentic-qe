/**
 * Tests for the lightweight code entity extractor.
 * Validates regex patterns for functions, classes, interfaces,
 * arrow exports, methods, and imports.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { extractCodeIndex } from '../../../src/shared/code-index-extractor';

// ============================================================================
// Test Setup
// ============================================================================

const TEMP_DIR = join('/tmp', `extractor-test-${Date.now()}`);

beforeEach(() => {
  mkdirSync(TEMP_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEMP_DIR, { recursive: true, force: true });
});

function writeTemp(name: string, content: string): string {
  const filePath = join(TEMP_DIR, name);
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

// ============================================================================
// Tests
// ============================================================================

describe('extractCodeIndex', () => {
  it('should extract named function declarations', async () => {
    const file = writeTemp('funcs.ts', `
export function doSomething() {}
async function fetchData() {}
export default function handleRequest() {}
function privateHelper() {}
`);

    const result = await extractCodeIndex([file]);
    const entities = result.files[0].entities;
    const names = entities.map(e => e.name);

    expect(names).toContain('doSomething');
    expect(names).toContain('fetchData');
    expect(names).toContain('handleRequest');
    expect(names).toContain('privateHelper');
    expect(entities.every(e => e.type === 'function')).toBe(true);
  });

  it('should extract arrow function exports', async () => {
    const file = writeTemp('arrows.ts', `
export const createHandler = (req: Request) => {};
const processItems = async (items: string[]) => {};
export const validate = (input: unknown): boolean => true;
`);

    const result = await extractCodeIndex([file]);
    const names = result.files[0].entities.map(e => e.name);

    expect(names).toContain('createHandler');
    expect(names).toContain('processItems');
    expect(names).toContain('validate');
  });

  it('should extract class declarations', async () => {
    const file = writeTemp('classes.ts', `
export class UserService {}
abstract class BaseHandler {}
export default class MainApp {}
class PrivateHelper {}
`);

    const result = await extractCodeIndex([file]);
    const entities = result.files[0].entities;
    const names = entities.map(e => e.name);

    expect(names).toContain('UserService');
    expect(names).toContain('BaseHandler');
    expect(names).toContain('MainApp');
    expect(names).toContain('PrivateHelper');
    expect(entities.every(e => e.type === 'class')).toBe(true);
  });

  it('should extract interface declarations', async () => {
    const file = writeTemp('interfaces.ts', `
export interface UserProfile {
  name: string;
}
interface InternalConfig {
  debug: boolean;
}
`);

    const result = await extractCodeIndex([file]);
    const entities = result.files[0].entities;
    const names = entities.map(e => e.name);

    expect(names).toContain('UserProfile');
    expect(names).toContain('InternalConfig');
    expect(entities.every(e => e.type === 'interface')).toBe(true);
  });

  it('should extract class method definitions', async () => {
    const file = writeTemp('methods.ts', `
class MyService {
  async initialize(): Promise<void> {
  }
  public static create(config: Config): MyService {
  }
  private doWork(input: string): string {
  }
}
`);

    const result = await extractCodeIndex([file]);
    const names = result.files[0].entities
      .filter(e => e.type === 'function')
      .map(e => e.name);

    expect(names).toContain('initialize');
    expect(names).toContain('create');
    expect(names).toContain('doWork');
  });

  it('should not extract control flow keywords as methods', async () => {
    const file = writeTemp('control.ts', `
class Foo {
  doWork() {
    if (true) {
    }
    for (const x of items) {
    }
    while (running) {
    }
    switch (value) {
    }
  }
}
`);

    const result = await extractCodeIndex([file]);
    const names = result.files[0].entities.map(e => e.name);

    expect(names).not.toContain('if');
    expect(names).not.toContain('for');
    expect(names).not.toContain('while');
    expect(names).not.toContain('switch');
  });

  it('should extract relative imports', async () => {
    const file = writeTemp('imports.ts', `
import { foo } from './utils';
import bar from '../lib/bar';
import { baz } from 'external-package';
`);

    const result = await extractCodeIndex([file]);
    const imports = result.files[0].imports;

    expect(imports).toContain('./utils');
    expect(imports).toContain('../lib/bar');
    // External package imports should NOT be included
    expect(imports).not.toContain('external-package');
  });

  it('should record correct line numbers', async () => {
    const file = writeTemp('lines.ts', `// line 1
// line 2
export function thirdLine() {}
// line 4
class FifthLine {}
`);

    const result = await extractCodeIndex([file]);
    const entities = result.files[0].entities;

    expect(entities.find(e => e.name === 'thirdLine')?.lineStart).toBe(3);
    expect(entities.find(e => e.name === 'FifthLine')?.lineStart).toBe(5);
  });

  it('should skip unreadable files without failing', async () => {
    const goodFile = writeTemp('good.ts', 'export function works() {}');
    const badPath = join(TEMP_DIR, 'nonexistent.ts');

    const result = await extractCodeIndex([goodFile, badPath]);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].entities[0].name).toBe('works');
  });

  it('should handle empty file list', async () => {
    const result = await extractCodeIndex([]);
    expect(result.files).toHaveLength(0);
  });

  it('should handle file with no entities', async () => {
    const file = writeTemp('empty.ts', '// just a comment\nconst x = 42;\n');
    const result = await extractCodeIndex([file]);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].entities).toHaveLength(0);
  });

  it('should process multiple files', async () => {
    const file1 = writeTemp('a.ts', 'export function funcA() {}');
    const file2 = writeTemp('b.ts', 'export class ClassB {}');
    const file3 = writeTemp('c.ts', 'export interface InterfaceC {}');

    const result = await extractCodeIndex([file1, file2, file3]);

    expect(result.files).toHaveLength(3);
    expect(result.files[0].entities[0].name).toBe('funcA');
    expect(result.files[1].entities[0].name).toBe('ClassB');
    expect(result.files[2].entities[0].name).toBe('InterfaceC');
  });
});
