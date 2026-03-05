import { describe, it, expect } from 'vitest';
import { TypeScriptLanguageParser } from '../../../src/shared/parsers/typescript-parser.js';
import type { ParsedFile } from '../../../src/shared/parsers/interfaces.js';

describe('TypeScriptLanguageParser (ILanguageParser adapter)', () => {
  const parser = new TypeScriptLanguageParser();

  it('should have language set to typescript', () => {
    expect(parser.language).toBe('typescript');
  });

  it('should support TypeScript and JavaScript extensions', () => {
    expect(parser.supportedExtensions).toContain('.ts');
    expect(parser.supportedExtensions).toContain('.tsx');
    expect(parser.supportedExtensions).toContain('.js');
    expect(parser.supportedExtensions).toContain('.jsx');
  });

  it('should parse a TypeScript file with functions', async () => {
    const content = `
export function greet(name: string): string {
  return \`Hello, \${name}\`;
}

export async function fetchUser(id: number): Promise<User> {
  return await db.findUser(id);
}
`;
    const result = await parser.parseFile(content, 'test.ts');

    expect(result.language).toBe('typescript');
    expect(result.functions).toHaveLength(2);
    expect(result.functions[0].name).toBe('greet');
    expect(result.functions[0].parameters).toHaveLength(1);
    expect(result.functions[0].parameters[0].name).toBe('name');
    expect(result.functions[0].parameters[0].type).toBe('string');
    expect(result.functions[0].returnType).toBe('string');
    expect(result.functions[0].isAsync).toBe(false);
    expect(result.functions[0].isPublic).toBe(true);

    expect(result.functions[1].name).toBe('fetchUser');
    expect(result.functions[1].isAsync).toBe(true);
  });

  it('should parse a TypeScript file with classes', async () => {
    const content = `
export class UserService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async getUser(id: number): Promise<User> {
    return this.db.find(id);
  }

  public createUser(name: string): User {
    return { name };
  }
}
`;
    const result = await parser.parseFile(content, 'service.ts');

    expect(result.classes).toHaveLength(1);
    const cls = result.classes[0];
    expect(cls.name).toBe('UserService');
    expect(cls.isPublic).toBe(true);
    expect(cls.methods.length).toBeGreaterThanOrEqual(2);

    const getUser = cls.methods.find(m => m.name === 'getUser');
    expect(getUser).toBeDefined();
    expect(getUser!.isAsync).toBe(true);
  });

  it('should parse imports', async () => {
    const content = `
import { Database } from './database';
import type { User } from './types';
import * as utils from './utils';
`;
    const result = await parser.parseFile(content, 'test.ts');

    expect(result.imports).toHaveLength(3);
    expect(result.imports[0].module).toBe('./database');
    expect(result.imports[0].namedImports).toContain('Database');
    expect(result.imports[1].isTypeOnly).toBe(true);
  });

  it('should detect JavaScript language from .js extension', async () => {
    const content = `export function hello() { return 'hi'; }`;
    const result = await parser.parseFile(content, 'test.js');
    expect(result.language).toBe('javascript');
  });

  it('should return empty arrays for empty file', async () => {
    const result = await parser.parseFile('', 'empty.ts');
    expect(result.functions).toHaveLength(0);
    expect(result.classes).toHaveLength(0);
    expect(result.imports).toHaveLength(0);
  });
});
