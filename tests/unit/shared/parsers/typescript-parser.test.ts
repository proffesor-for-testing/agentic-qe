/**
 * Agentic QE v3 - TypeScript Parser Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TypeScriptParser,
  typescriptParser,
  FunctionInfo,
  ClassInfo,
  ImportInfo,
  ExportInfo,
  InterfaceInfo,
} from '../../../../src/shared/parsers/typescript-parser';

describe('TypeScriptParser', () => {
  let parser: TypeScriptParser;

  beforeEach(() => {
    parser = new TypeScriptParser();
  });

  describe('parseFile', () => {
    it('should parse TypeScript source code into AST', () => {
      const code = `const x: number = 1;`;
      const ast = parser.parseFile('test.ts', code);

      expect(ast).toBeDefined();
      expect(ast.fileName).toBe('test.ts');
      expect(ast.statements.length).toBeGreaterThan(0);
    });

    it('should handle TSX files', () => {
      const code = `const Component = () => <div>Hello</div>;`;
      const ast = parser.parseFile('test.tsx', code);

      expect(ast).toBeDefined();
      expect(ast.fileName).toBe('test.tsx');
    });

    it('should handle JavaScript files', () => {
      const code = `const x = 1;`;
      const ast = parser.parseFile('test.js', code);

      expect(ast).toBeDefined();
      expect(ast.fileName).toBe('test.js');
    });
  });

  describe('extractFunctions', () => {
    it('should extract function declarations', () => {
      const code = `
        function greet(name: string): string {
          return \`Hello, \${name}!\`;
        }
      `;
      const ast = parser.parseFile('test.ts', code);
      const functions = parser.extractFunctions(ast);

      expect(functions).toHaveLength(1);
      expect(functions[0].name).toBe('greet');
      expect(functions[0].parameters).toHaveLength(1);
      expect(functions[0].parameters[0].name).toBe('name');
      expect(functions[0].parameters[0].type).toBe('string');
      expect(functions[0].returnType).toBe('string');
      expect(functions[0].isAsync).toBe(false);
      expect(functions[0].isExported).toBe(false);
    });

    it('should extract arrow functions', () => {
      const code = `
        const add = (a: number, b: number): number => a + b;
      `;
      const ast = parser.parseFile('test.ts', code);
      const functions = parser.extractFunctions(ast);

      expect(functions).toHaveLength(1);
      expect(functions[0].name).toBe('add');
      expect(functions[0].parameters).toHaveLength(2);
      expect(functions[0].returnType).toBe('number');
    });

    it('should extract async functions', () => {
      const code = `
        async function fetchData(url: string): Promise<Response> {
          return fetch(url);
        }
      `;
      const ast = parser.parseFile('test.ts', code);
      const functions = parser.extractFunctions(ast);

      expect(functions).toHaveLength(1);
      expect(functions[0].name).toBe('fetchData');
      expect(functions[0].isAsync).toBe(true);
      expect(functions[0].returnType).toBe('Promise<Response>');
    });

    it('should extract exported functions', () => {
      const code = `
        export function publicFunc(): void {}
        function privateFunc(): void {}
      `;
      const ast = parser.parseFile('test.ts', code);
      const functions = parser.extractFunctions(ast);

      expect(functions).toHaveLength(2);
      const publicFn = functions.find((f) => f.name === 'publicFunc');
      const privateFn = functions.find((f) => f.name === 'privateFunc');

      expect(publicFn?.isExported).toBe(true);
      expect(privateFn?.isExported).toBe(false);
    });

    it('should extract generator functions', () => {
      const code = `
        function* generateNumbers(): Generator<number> {
          yield 1;
          yield 2;
        }
      `;
      const ast = parser.parseFile('test.ts', code);
      const functions = parser.extractFunctions(ast);

      expect(functions).toHaveLength(1);
      expect(functions[0].isGenerator).toBe(true);
    });

    it('should extract optional and rest parameters', () => {
      const code = `
        function greet(name: string, greeting?: string, ...extras: string[]): void {}
      `;
      const ast = parser.parseFile('test.ts', code);
      const functions = parser.extractFunctions(ast);

      expect(functions[0].parameters).toHaveLength(3);
      expect(functions[0].parameters[0].isOptional).toBe(false);
      expect(functions[0].parameters[0].isRest).toBe(false);
      expect(functions[0].parameters[1].isOptional).toBe(true);
      expect(functions[0].parameters[2].isRest).toBe(true);
    });

    it('should extract default parameter values', () => {
      const code = `
        function greet(name: string = 'World'): string {
          return \`Hello, \${name}!\`;
        }
      `;
      const ast = parser.parseFile('test.ts', code);
      const functions = parser.extractFunctions(ast);

      expect(functions[0].parameters[0].defaultValue).toBe("'World'");
      expect(functions[0].parameters[0].isOptional).toBe(true);
    });

    it('should extract type parameters', () => {
      const code = `
        function identity<T>(value: T): T {
          return value;
        }
      `;
      const ast = parser.parseFile('test.ts', code);
      const functions = parser.extractFunctions(ast);

      expect(functions[0].typeParameters).toEqual(['T']);
    });

    it('should include line numbers', () => {
      const code = `function test(): void {
  // body
}`;
      const ast = parser.parseFile('test.ts', code);
      const functions = parser.extractFunctions(ast);

      expect(functions[0].startLine).toBe(1);
      expect(functions[0].endLine).toBe(3);
    });
  });

  describe('extractClasses', () => {
    it('should extract class declarations', () => {
      const code = `
        class User {
          name: string;

          constructor(name: string) {
            this.name = name;
          }

          greet(): string {
            return \`Hello, \${this.name}!\`;
          }
        }
      `;
      const ast = parser.parseFile('test.ts', code);
      const classes = parser.extractClasses(ast);

      expect(classes).toHaveLength(1);
      expect(classes[0].name).toBe('User');
      expect(classes[0].properties.length).toBeGreaterThanOrEqual(1);
      expect(classes[0].methods.length).toBeGreaterThanOrEqual(1);
    });

    it('should extract class inheritance', () => {
      const code = `
        class Animal {}
        class Dog extends Animal implements Runnable, Walkable {}
      `;
      const ast = parser.parseFile('test.ts', code);
      const classes = parser.extractClasses(ast);

      const dog = classes.find((c) => c.name === 'Dog');
      expect(dog?.extends).toBe('Animal');
      expect(dog?.implements).toEqual(['Runnable', 'Walkable']);
    });

    it('should extract abstract classes', () => {
      const code = `
        abstract class Shape {
          abstract getArea(): number;
        }
      `;
      const ast = parser.parseFile('test.ts', code);
      const classes = parser.extractClasses(ast);

      expect(classes[0].isAbstract).toBe(true);
      expect(classes[0].methods[0].isAbstract).toBe(true);
    });

    it('should extract method visibility', () => {
      const code = `
        class Service {
          public publicMethod(): void {}
          private privateMethod(): void {}
          protected protectedMethod(): void {}
        }
      `;
      const ast = parser.parseFile('test.ts', code);
      const classes = parser.extractClasses(ast);

      const methods = classes[0].methods;
      expect(methods.find((m) => m.name === 'publicMethod')?.visibility).toBe('public');
      expect(methods.find((m) => m.name === 'privateMethod')?.visibility).toBe('private');
      expect(methods.find((m) => m.name === 'protectedMethod')?.visibility).toBe('protected');
    });

    it('should extract static members', () => {
      const code = `
        class Config {
          static instance: Config;
          static getInstance(): Config {
            return this.instance;
          }
        }
      `;
      const ast = parser.parseFile('test.ts', code);
      const classes = parser.extractClasses(ast);

      expect(classes[0].properties[0].isStatic).toBe(true);
      expect(classes[0].methods[0].isStatic).toBe(true);
    });

    it('should extract readonly properties', () => {
      const code = `
        class Point {
          readonly x: number;
          readonly y: number;
        }
      `;
      const ast = parser.parseFile('test.ts', code);
      const classes = parser.extractClasses(ast);

      expect(classes[0].properties[0].isReadonly).toBe(true);
      expect(classes[0].properties[1].isReadonly).toBe(true);
    });

    it('should extract parameter properties from constructor', () => {
      const code = `
        class Service {
          constructor(
            private readonly logger: Logger,
            public name: string
          ) {}
        }
      `;
      const ast = parser.parseFile('test.ts', code);
      const classes = parser.extractClasses(ast);

      const properties = classes[0].properties;
      expect(properties.length).toBeGreaterThanOrEqual(2);

      const logger = properties.find((p) => p.name === 'logger');
      const name = properties.find((p) => p.name === 'name');

      expect(logger?.visibility).toBe('private');
      expect(logger?.isReadonly).toBe(true);
      expect(name?.visibility).toBe('public');
    });

    it('should extract async methods', () => {
      const code = `
        class ApiClient {
          async fetchData(): Promise<void> {}
        }
      `;
      const ast = parser.parseFile('test.ts', code);
      const classes = parser.extractClasses(ast);

      expect(classes[0].methods[0].isAsync).toBe(true);
    });

    it('should extract type parameters', () => {
      const code = `
        class Container<T> {
          value: T;
        }
      `;
      const ast = parser.parseFile('test.ts', code);
      const classes = parser.extractClasses(ast);

      expect(classes[0].typeParameters).toEqual(['T']);
    });
  });

  describe('extractImports', () => {
    it('should extract named imports', () => {
      const code = `
        import { Component, useState } from 'react';
      `;
      const ast = parser.parseFile('test.ts', code);
      const imports = parser.extractImports(ast);

      expect(imports).toHaveLength(1);
      expect(imports[0].module).toBe('react');
      expect(imports[0].namedImports).toHaveLength(2);
      expect(imports[0].namedImports[0].name).toBe('Component');
      expect(imports[0].namedImports[1].name).toBe('useState');
    });

    it('should extract default imports', () => {
      const code = `
        import React from 'react';
      `;
      const ast = parser.parseFile('test.ts', code);
      const imports = parser.extractImports(ast);

      expect(imports[0].defaultImport).toBe('React');
      expect(imports[0].namedImports).toHaveLength(0);
    });

    it('should extract namespace imports', () => {
      const code = `
        import * as fs from 'fs';
      `;
      const ast = parser.parseFile('test.ts', code);
      const imports = parser.extractImports(ast);

      expect(imports[0].namespaceImport).toBe('fs');
    });

    it('should extract mixed imports', () => {
      const code = `
        import React, { useState, useEffect } from 'react';
      `;
      const ast = parser.parseFile('test.ts', code);
      const imports = parser.extractImports(ast);

      expect(imports[0].defaultImport).toBe('React');
      expect(imports[0].namedImports).toHaveLength(2);
    });

    it('should extract aliased imports', () => {
      const code = `
        import { Component as Comp } from 'react';
      `;
      const ast = parser.parseFile('test.ts', code);
      const imports = parser.extractImports(ast);

      expect(imports[0].namedImports[0].name).toBe('Component');
      expect(imports[0].namedImports[0].alias).toBe('Comp');
    });

    it('should extract type-only imports', () => {
      const code = `
        import type { User } from './types';
      `;
      const ast = parser.parseFile('test.ts', code);
      const imports = parser.extractImports(ast);

      expect(imports[0].isTypeOnly).toBe(true);
    });
  });

  describe('extractExports', () => {
    it('should extract exported functions', () => {
      const code = `
        export function greet(): void {}
      `;
      const ast = parser.parseFile('test.ts', code);
      const exports = parser.extractExports(ast);

      expect(exports).toHaveLength(1);
      expect(exports[0].name).toBe('greet');
      expect(exports[0].type).toBe('function');
      expect(exports[0].isDefault).toBe(false);
    });

    it('should extract exported classes', () => {
      const code = `
        export class User {}
      `;
      const ast = parser.parseFile('test.ts', code);
      const exports = parser.extractExports(ast);

      expect(exports[0].name).toBe('User');
      expect(exports[0].type).toBe('class');
    });

    it('should extract exported variables', () => {
      const code = `
        export const config = {};
        export let counter = 0;
      `;
      const ast = parser.parseFile('test.ts', code);
      const exports = parser.extractExports(ast);

      expect(exports).toHaveLength(2);
      expect(exports[0].type).toBe('variable');
      expect(exports[1].type).toBe('variable');
    });

    it('should extract default exports', () => {
      const code = `
        export default function main() {}
      `;
      const ast = parser.parseFile('test.ts', code);
      const exports = parser.extractExports(ast);

      expect(exports[0].isDefault).toBe(true);
    });

    it('should extract named export declarations', () => {
      const code = `
        const a = 1;
        const b = 2;
        export { a, b };
      `;
      const ast = parser.parseFile('test.ts', code);
      const exports = parser.extractExports(ast);

      expect(exports).toHaveLength(2);
    });

    it('should extract re-exports', () => {
      const code = `
        export { User } from './user';
        export * from './utils';
      `;
      const ast = parser.parseFile('test.ts', code);
      const exports = parser.extractExports(ast);

      expect(exports.length).toBeGreaterThanOrEqual(2);
      const userExport = exports.find((e) => e.name === 'User');
      const starExport = exports.find((e) => e.name === '*');

      expect(userExport?.isReexport).toBe(true);
      expect(userExport?.sourceModule).toBe('./user');
      expect(starExport?.isReexport).toBe(true);
      expect(starExport?.sourceModule).toBe('./utils');
    });

    it('should extract exported interfaces', () => {
      const code = `
        export interface User {
          name: string;
        }
      `;
      const ast = parser.parseFile('test.ts', code);
      const exports = parser.extractExports(ast);

      expect(exports[0].name).toBe('User');
      expect(exports[0].type).toBe('interface');
    });

    it('should extract exported type aliases', () => {
      const code = `
        export type ID = string | number;
      `;
      const ast = parser.parseFile('test.ts', code);
      const exports = parser.extractExports(ast);

      expect(exports[0].name).toBe('ID');
      expect(exports[0].type).toBe('type');
    });

    it('should extract exported enums', () => {
      const code = `
        export enum Status {
          Active,
          Inactive
        }
      `;
      const ast = parser.parseFile('test.ts', code);
      const exports = parser.extractExports(ast);

      expect(exports[0].name).toBe('Status');
      expect(exports[0].type).toBe('enum');
    });
  });

  describe('extractInterfaces', () => {
    it('should extract interface declarations', () => {
      const code = `
        interface User {
          name: string;
          age: number;
        }
      `;
      const ast = parser.parseFile('test.ts', code);
      const interfaces = parser.extractInterfaces(ast);

      expect(interfaces).toHaveLength(1);
      expect(interfaces[0].name).toBe('User');
      expect(interfaces[0].properties).toHaveLength(2);
    });

    it('should extract optional properties', () => {
      const code = `
        interface Config {
          required: string;
          optional?: string;
        }
      `;
      const ast = parser.parseFile('test.ts', code);
      const interfaces = parser.extractInterfaces(ast);

      const required = interfaces[0].properties.find((p) => p.name === 'required');
      const optional = interfaces[0].properties.find((p) => p.name === 'optional');

      expect(required?.isOptional).toBe(false);
      expect(optional?.isOptional).toBe(true);
    });

    it('should extract readonly properties', () => {
      const code = `
        interface Point {
          readonly x: number;
          readonly y: number;
        }
      `;
      const ast = parser.parseFile('test.ts', code);
      const interfaces = parser.extractInterfaces(ast);

      expect(interfaces[0].properties[0].isReadonly).toBe(true);
      expect(interfaces[0].properties[1].isReadonly).toBe(true);
    });

    it('should extract interface methods', () => {
      const code = `
        interface Repository {
          find(id: string): Entity;
          save(entity: Entity): void;
        }
      `;
      const ast = parser.parseFile('test.ts', code);
      const interfaces = parser.extractInterfaces(ast);

      expect(interfaces[0].methods).toHaveLength(2);
      expect(interfaces[0].methods[0].name).toBe('find');
      expect(interfaces[0].methods[0].parameters).toHaveLength(1);
      expect(interfaces[0].methods[0].returnType).toBe('Entity');
    });

    it('should extract interface extension', () => {
      const code = `
        interface Entity {
          id: string;
        }
        interface User extends Entity, Auditable {
          name: string;
        }
      `;
      const ast = parser.parseFile('test.ts', code);
      const interfaces = parser.extractInterfaces(ast);

      const user = interfaces.find((i) => i.name === 'User');
      expect(user?.extends).toEqual(['Entity', 'Auditable']);
    });

    it('should extract type parameters', () => {
      const code = `
        interface Repository<T, ID> {
          find(id: ID): T;
        }
      `;
      const ast = parser.parseFile('test.ts', code);
      const interfaces = parser.extractInterfaces(ast);

      expect(interfaces[0].typeParameters).toEqual(['T', 'ID']);
    });

    it('should extract exported interfaces', () => {
      const code = `
        export interface PublicApi {}
        interface InternalApi {}
      `;
      const ast = parser.parseFile('test.ts', code);
      const interfaces = parser.extractInterfaces(ast);

      const publicApi = interfaces.find((i) => i.name === 'PublicApi');
      const internalApi = interfaces.find((i) => i.name === 'InternalApi');

      expect(publicApi?.isExported).toBe(true);
      expect(internalApi?.isExported).toBe(false);
    });
  });

  describe('default instance', () => {
    it('should export a default parser instance', () => {
      expect(typescriptParser).toBeInstanceOf(TypeScriptParser);
    });

    it('should be usable for parsing', () => {
      const code = `const x = 1;`;
      const ast = typescriptParser.parseFile('test.ts', code);
      expect(ast).toBeDefined();
    });
  });

  describe('complex scenarios', () => {
    it('should handle a full module with mixed exports', () => {
      const code = `
        import { Logger } from './logger';
        import type { Config } from './config';

        export interface Service {
          start(): void;
          stop(): void;
        }

        export abstract class BaseService implements Service {
          protected logger: Logger;

          constructor(protected config: Config) {}

          abstract start(): void;
          abstract stop(): void;
        }

        export class MyService extends BaseService {
          async start(): Promise<void> {
            this.logger.info('Starting...');
          }

          stop(): void {
            this.logger.info('Stopping...');
          }
        }

        export const createService = (config: Config): MyService => {
          return new MyService(config);
        };

        export default MyService;
      `;

      const ast = parser.parseFile('service.ts', code);

      const imports = parser.extractImports(ast);
      expect(imports).toHaveLength(2);

      const interfaces = parser.extractInterfaces(ast);
      expect(interfaces).toHaveLength(1);
      expect(interfaces[0].name).toBe('Service');

      const classes = parser.extractClasses(ast);
      expect(classes).toHaveLength(2);

      const baseService = classes.find((c) => c.name === 'BaseService');
      expect(baseService?.isAbstract).toBe(true);
      expect(baseService?.implements).toContain('Service');

      const myService = classes.find((c) => c.name === 'MyService');
      expect(myService?.extends).toBe('BaseService');

      const functions = parser.extractFunctions(ast);
      expect(functions).toHaveLength(1);
      expect(functions[0].name).toBe('createService');

      const exports = parser.extractExports(ast);
      expect(exports.length).toBeGreaterThan(0);
    });
  });
});
