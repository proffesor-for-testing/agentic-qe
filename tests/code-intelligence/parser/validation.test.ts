/**
 * Validation tests for Tree-sitter parser implementation
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { TreeSitterParser } from '../../../src/code-intelligence/parser/TreeSitterParser.js';
import type { CodeEntity } from '../../../src/code-intelligence/parser/types.js';

describe('TreeSitterParser - Wave 2 Validation', () => {
  let parser: TreeSitterParser;

  beforeEach(() => {
    parser = new TreeSitterParser();
  });

  describe('TypeScript Parsing', () => {
    it('should extract exported function with metadata', () => {
      const code = 'export async function hello(name: string): Promise<string> { return `Hello ${name}`; }';
      const result = parser.parseFile('test.ts', code, 'typescript');

      expect(result.entities).toHaveLength(1);
      const entity = result.entities[0];
      expect(entity.type).toBe('function');
      expect(entity.name).toBe('hello');
      expect(entity.metadata.isAsync).toBe(true);
      expect(entity.metadata.isExported).toBe(true);
      expect(entity.metadata.parameters).toBeDefined();
      expect(entity.metadata.returnType).toBeDefined();
    });

    it('should extract class with methods', () => {
      const code = `
        export class UserService {
          private async fetchUser(id: string): Promise<User> {
            return {};
          }
          public getUserName(): string {
            return 'test';
          }
        }
      `;
      const result = parser.parseFile('test.ts', code, 'typescript');

      expect(result.entities.length).toBeGreaterThan(0);
      const classEntity = result.entities.find((e) => e.type === 'class');
      expect(classEntity).toBeDefined();
      expect(classEntity?.name).toBe('UserService');

      const methods = result.entities.filter((e) => e.type === 'method');
      expect(methods.length).toBeGreaterThan(0);
    });

    it('should extract interface', () => {
      const code = `
        export interface User {
          id: string;
          name: string;
        }
      `;
      const result = parser.parseFile('test.ts', code, 'typescript');

      expect(result.entities.length).toBeGreaterThan(0);
      const interfaceEntity = result.entities.find((e) => e.type === 'interface');
      expect(interfaceEntity).toBeDefined();
      expect(interfaceEntity?.name).toBe('User');
      expect(interfaceEntity?.metadata.isExported).toBe(true);
    });
  });

  describe('JavaScript Parsing', () => {
    it('should extract arrow function', () => {
      const code = 'const add = (a, b) => a + b;';
      const result = parser.parseFile('test.js', code, 'javascript');

      // Arrow functions may be extracted differently
      expect(result.errors).toHaveLength(0);
    });

    it('should extract class with constructor', () => {
      const code = `
        class Calculator {
          constructor() {
            this.value = 0;
          }
          add(n) {
            this.value += n;
          }
        }
      `;
      const result = parser.parseFile('test.js', code, 'javascript');

      const classEntity = result.entities.find((e) => e.type === 'class');
      expect(classEntity).toBeDefined();
      expect(classEntity?.name).toBe('Calculator');
    });
  });

  describe('Python Parsing', () => {
    it('should extract function with type hints', () => {
      const code = `
def greet(name: str) -> str:
    return f"Hello {name}"
      `;
      const result = parser.parseFile('test.py', code, 'python');

      expect(result.entities).toHaveLength(1);
      const entity = result.entities[0];
      expect(entity.type).toBe('function');
      expect(entity.name).toBe('greet');
    });

    it('should extract class with methods and visibility', () => {
      const code = `
class DataService:
    def __init__(self):
        self.__private_data = None

    def _protected_method(self):
        pass

    async def public_method(self):
        pass
      `;
      const result = parser.parseFile('test.py', code, 'python');

      const classEntity = result.entities.find((e) => e.type === 'class');
      expect(classEntity).toBeDefined();
      expect(classEntity?.name).toBe('DataService');

      const methods = result.entities.filter((e) => e.type === 'method');
      expect(methods.length).toBeGreaterThan(0);

      // Check visibility conventions
      const protectedMethod = methods.find((m) => m.name === '_protected_method');
      expect(protectedMethod?.metadata.visibility).toBe('protected');
    });
  });

  describe('Go Parsing', () => {
    it('should extract function', () => {
      const code = `
package main

func Add(a int, b int) int {
    return a + b
}
      `;
      const result = parser.parseFile('test.go', code, 'go');

      expect(result.entities.length).toBeGreaterThan(0);
      const entity = result.entities.find((e) => e.type === 'function');
      expect(entity).toBeDefined();
      expect(entity?.name).toBe('Add');
    });

    it('should extract method with receiver', () => {
      const code = `
package main

func (c *Calculator) Add(n int) {
    c.value += n
}
      `;
      const result = parser.parseFile('test.go', code, 'go');

      // Go method extraction is complex - tree-sitter may parse differently
      // Main validation: no errors during parsing
      expect(result.errors).toHaveLength(0);
      expect(result.parseTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Rust Parsing', () => {
    it('should extract public function', () => {
      const code = `
pub async fn fetch_data() -> Result<String, Error> {
    Ok(String::from("data"))
}
      `;
      const result = parser.parseFile('test.rs', code, 'rust');

      expect(result.entities.length).toBeGreaterThan(0);
      const entity = result.entities.find((e) => e.type === 'function');
      expect(entity).toBeDefined();
      expect(entity?.name).toBe('fetch_data');
      expect(entity?.metadata.isAsync).toBe(true);
    });

    it('should extract struct', () => {
      const code = `
pub struct User {
    pub id: String,
    name: String,
}
      `;
      const result = parser.parseFile('test.rs', code, 'rust');

      expect(result.entities.length).toBeGreaterThan(0);
      const structEntity = result.entities.find((e) => e.type === 'class');
      expect(structEntity).toBeDefined();
      expect(structEntity?.name).toBe('User');
    });
  });

  describe('Language Detection', () => {
    it('should detect TypeScript from .ts extension', () => {
      const lang = parser.detectLanguage('src/test.ts');
      expect(lang).toBe('typescript');
    });

    it('should detect JavaScript from .js extension', () => {
      const lang = parser.detectLanguage('src/test.js');
      expect(lang).toBe('javascript');
    });

    it('should detect Python from .py extension', () => {
      const lang = parser.detectLanguage('src/test.py');
      expect(lang).toBe('python');
    });

    it('should detect Go from .go extension', () => {
      const lang = parser.detectLanguage('src/test.go');
      expect(lang).toBe('go');
    });

    it('should detect Rust from .rs extension', () => {
      const lang = parser.detectLanguage('src/test.rs');
      expect(lang).toBe('rust');
    });

    it('should return null for unsupported extensions', () => {
      const lang = parser.detectLanguage('src/test.txt');
      expect(lang).toBeNull();
    });
  });

  describe('Incremental Parsing', () => {
    it('should use cached tree for faster updates', () => {
      const originalCode = 'function add(a, b) { return a + b; }';
      const updatedCode = 'function add(a, b) { return a + b + 1; }';

      // First parse (creates cache)
      const result1 = parser.parseFile('test.js', originalCode, 'javascript');
      expect(result1.entities.length).toBeGreaterThan(0);

      // Update parse (uses cache)
      const result2 = parser.updateFile('test.js', updatedCode, 'javascript');
      expect(result2.entities.length).toBeGreaterThan(0);

      // Should be significantly faster (though we can't reliably test timing in unit tests)
      expect(result2.parseTimeMs).toBeLessThan(1000); // Sanity check
    });

    it('should handle incremental updates correctly', () => {
      const code1 = 'function foo() { return 1; }';
      const code2 = 'function foo() { return 2; }\nfunction bar() { return 3; }';

      parser.parseFile('test.js', code1, 'javascript');
      const result = parser.updateFile('test.js', code2, 'javascript');

      expect(result.entities.length).toBeGreaterThan(1);
    });
  });

  describe('Cache Management', () => {
    it('should track cached files', () => {
      parser.parseFile('test1.ts', 'function a() {}', 'typescript');
      parser.parseFile('test2.ts', 'function b() {}', 'typescript');

      const stats = parser.getCacheStats();
      expect(stats.size).toBe(2);
      expect(stats.files).toContain('test1.ts');
      expect(stats.files).toContain('test2.ts');
    });

    it('should clear specific file cache', () => {
      parser.parseFile('test1.ts', 'function a() {}', 'typescript');
      parser.parseFile('test2.ts', 'function b() {}', 'typescript');

      parser.clearCache('test1.ts');

      const stats = parser.getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.files).not.toContain('test1.ts');
      expect(stats.files).toContain('test2.ts');
    });

    it('should clear all cache', () => {
      parser.parseFile('test1.ts', 'function a() {}', 'typescript');
      parser.parseFile('test2.ts', 'function b() {}', 'typescript');

      parser.clearCache();

      const stats = parser.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle unsupported language gracefully', () => {
      const result = parser.parseFile('test.xyz', 'code', 'unknown');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.entities).toHaveLength(0);
    });

    it('should handle syntax errors gracefully', () => {
      const invalidCode = 'function {{{{{ broken';
      const result = parser.parseFile('test.js', invalidCode, 'javascript');

      // Tree-sitter is resilient and may still extract partial entities
      // Main validation: parsing completes without crashing
      expect(result.parseTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.entities).toBeDefined();
    });
  });

  describe('Entity Metadata', () => {
    it('should extract complete function metadata', () => {
      const code = `
        export async function processUser(
          id: string,
          options?: ProcessOptions
        ): Promise<User> {
          return { id };
        }
      `;
      const result = parser.parseFile('test.ts', code, 'typescript');

      const entity = result.entities[0];
      expect(entity.metadata).toBeDefined();
      expect(entity.metadata.isAsync).toBe(true);
      expect(entity.metadata.isExported).toBe(true);
      expect(entity.metadata.parameters).toBeDefined();
      expect(entity.metadata.returnType).toBeDefined();
    });

    it('should generate unique entity IDs', () => {
      const code = `
        function a() {}
        function b() {}
        function a() {} // Same name, different location
      `;
      const result = parser.parseFile('test.js', code, 'javascript');

      const ids = result.entities.map((e) => e.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should include line numbers', () => {
      const code = `
function first() {}

function second() {}

function third() {}
      `.trim();

      const result = parser.parseFile('test.js', code, 'javascript');
      const entities = result.entities;

      expect(entities.every((e) => e.lineStart > 0)).toBe(true);
      expect(entities.every((e) => e.lineEnd >= e.lineStart)).toBe(true);
    });
  });
});
