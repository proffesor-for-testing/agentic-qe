import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  TreeSitterWASMParser,
  createWasmParsers,
  isWasmAvailable,
  _resetWasmState,
} from '../../../src/shared/parsers/tree-sitter-wasm-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/parsers');

const wasmAvailable = isWasmAvailable();

afterAll(() => {
  _resetWasmState();
});

describe('TreeSitterWASMParser', () => {
  describe('isWasmAvailable', () => {
    it('should return a boolean indicating WASM dependency status', () => {
      const result = isWasmAvailable();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('createWasmParsers', () => {
    it('should create parsers for 5 WASM-supported languages', () => {
      const parsers = createWasmParsers();
      expect(parsers.size).toBe(5);
      expect(parsers.has('python')).toBe(true);
      expect(parsers.has('java')).toBe(true);
      expect(parsers.has('csharp')).toBe(true);
      expect(parsers.has('rust')).toBe(true);
      expect(parsers.has('swift')).toBe(true);
    });

    it('should NOT create parsers for Go, Kotlin, Dart', () => {
      const parsers = createWasmParsers();
      expect(parsers.has('go')).toBe(false);
      expect(parsers.has('kotlin')).toBe(false);
      expect(parsers.has('dart')).toBe(false);
    });
  });

  describe.skipIf(!wasmAvailable)('Python WASM parser', () => {
    it('should extract functions from Python fixture', async () => {
      const content = fs.readFileSync(path.join(FIXTURES_DIR, 'sample.py'), 'utf-8');
      const parser = new TreeSitterWASMParser('python', ['.py']);
      const result = await parser.parseFile(content, 'sample.py');

      expect(result.language).toBe('python');
      expect(result.functions.length).toBeGreaterThanOrEqual(1);

      const helper = result.functions.find(f => f.name === 'helper_function');
      expect(helper).toBeDefined();
      expect(helper!.parameters).toHaveLength(1);
      expect(helper!.parameters[0].name).toBe('items');
      expect(helper!.returnType).toBe('int');
      expect(helper!.isPublic).toBe(true);
    });

    it('should extract classes with methods', async () => {
      const content = fs.readFileSync(path.join(FIXTURES_DIR, 'sample.py'), 'utf-8');
      const parser = new TreeSitterWASMParser('python', ['.py']);
      const result = await parser.parseFile(content, 'sample.py');

      expect(result.classes.length).toBeGreaterThanOrEqual(1);
      const cls = result.classes.find(c => c.name === 'UserService');
      expect(cls).toBeDefined();
      expect(cls!.methods.length).toBeGreaterThanOrEqual(2);

      const createUser = cls!.methods.find(m => m.name === 'create_user');
      expect(createUser).toBeDefined();
      expect(createUser!.isAsync).toBe(true);
    });

    it('should extract imports', async () => {
      const content = fs.readFileSync(path.join(FIXTURES_DIR, 'sample.py'), 'utf-8');
      const parser = new TreeSitterWASMParser('python', ['.py']);
      const result = await parser.parseFile(content, 'sample.py');

      expect(result.imports.length).toBeGreaterThanOrEqual(2);
      const osImport = result.imports.find(i => i.module === 'os');
      expect(osImport).toBeDefined();
      const typingImport = result.imports.find(i => i.module === 'typing');
      expect(typingImport).toBeDefined();
      expect(typingImport!.namedImports).toContain('List');
      expect(typingImport!.namedImports).toContain('Optional');
    });

    it('should identify private functions by underscore prefix', async () => {
      const code = `
def public_func():
    pass

def _private_func():
    pass
`;
      const parser = new TreeSitterWASMParser('python', ['.py']);
      const result = await parser.parseFile(code, 'test.py');
      const pub = result.functions.find(f => f.name === 'public_func');
      const priv = result.functions.find(f => f.name === '_private_func');
      expect(pub!.isPublic).toBe(true);
      expect(priv!.isPublic).toBe(false);
    });

    it('should handle edge case: code pattern inside string literal', async () => {
      const code = `
def real_function(x: int) -> str:
    code = "def fake_function(): pass"
    return code

class RealClass:
    def method(self):
        template = "class FakeClass: pass"
`;
      const parser = new TreeSitterWASMParser('python', ['.py']);
      const result = await parser.parseFile(code, 'edge_case.py');

      const funcNames = result.functions.map(f => f.name);
      expect(funcNames).toContain('real_function');
      expect(funcNames).not.toContain('fake_function');

      const classNames = result.classes.map(c => c.name);
      expect(classNames).toContain('RealClass');
      expect(classNames).not.toContain('FakeClass');
    });
  });

  describe.skipIf(!wasmAvailable)('Java WASM parser', () => {
    it('should extract classes and methods from Java fixture', async () => {
      const content = fs.readFileSync(path.join(FIXTURES_DIR, 'UserService.java'), 'utf-8');
      const parser = new TreeSitterWASMParser('java', ['.java']);
      const result = await parser.parseFile(content, 'UserService.java');

      expect(result.language).toBe('java');
      expect(result.classes.length).toBeGreaterThanOrEqual(1);
      expect(result.classes[0].name).toBe('UserService');
      expect(result.classes[0].decorators).toContain('@Service');
    });

    it('should extract imports', async () => {
      const content = fs.readFileSync(path.join(FIXTURES_DIR, 'UserService.java'), 'utf-8');
      const parser = new TreeSitterWASMParser('java', ['.java']);
      const result = await parser.parseFile(content, 'UserService.java');

      expect(result.imports.length).toBeGreaterThanOrEqual(2);
      const listImport = result.imports.find(i => i.module.includes('java.util.List'));
      expect(listImport).toBeDefined();
      expect(listImport!.namedImports).toContain('List');
    });

    it('should extract public methods with params', async () => {
      const content = fs.readFileSync(path.join(FIXTURES_DIR, 'UserService.java'), 'utf-8');
      const parser = new TreeSitterWASMParser('java', ['.java']);
      const result = await parser.parseFile(content, 'UserService.java');

      const getUser = result.functions.find(f => f.name === 'getUser');
      expect(getUser).toBeDefined();
      expect(getUser!.isPublic).toBe(true);
      expect(getUser!.parameters).toHaveLength(1);
      expect(getUser!.parameters[0].name).toBe('id');
    });

    it('should parse nested generics in return types', async () => {
      const code = `
public class GroupService {
    public Map<String, List<User>> groupUsers(List<User> users) {
        return new HashMap<>();
    }
}
`;
      const parser = new TreeSitterWASMParser('java', ['.java']);
      const result = await parser.parseFile(code, 'GroupService.java');

      const groupUsers = result.functions.find(f => f.name === 'groupUsers');
      expect(groupUsers).toBeDefined();
      expect(groupUsers!.returnType).toBe('Map<String, List<User>>');
    });

    it('should handle edge case: code in string literal', async () => {
      const code = `
public class Foo {
    public String getTemplate() {
        return "public void fakeMethod() {}";
    }
    public void realMethod(int x) {
        String cls = "class FakeClass {}";
    }
}
`;
      const parser = new TreeSitterWASMParser('java', ['.java']);
      const result = await parser.parseFile(code, 'Foo.java');

      const names = result.functions.map(f => f.name);
      expect(names).toContain('getTemplate');
      expect(names).toContain('realMethod');
      expect(names).not.toContain('fakeMethod');
    });
  });

  describe.skipIf(!wasmAvailable)('C# WASM parser', () => {
    it('should parse C# fixture file', async () => {
      const content = fs.readFileSync(path.join(FIXTURES_DIR, 'UserService.cs'), 'utf-8');
      const parser = new TreeSitterWASMParser('csharp', ['.cs']);
      const result = await parser.parseFile(content, 'UserService.cs');

      expect(result.language).toBe('csharp');
      expect(result.classes.length).toBeGreaterThanOrEqual(1);
      expect(result.classes[0].name).toBe('UserService');
    });

    it('should extract async methods', async () => {
      const content = fs.readFileSync(path.join(FIXTURES_DIR, 'UserService.cs'), 'utf-8');
      const parser = new TreeSitterWASMParser('csharp', ['.cs']);
      const result = await parser.parseFile(content, 'UserService.cs');

      const getUser = result.functions.find(f => f.name === 'GetUserAsync');
      expect(getUser).toBeDefined();
      expect(getUser!.isAsync).toBe(true);
      expect(getUser!.isPublic).toBe(true);
    });

    it('should extract using directives as imports', async () => {
      const content = fs.readFileSync(path.join(FIXTURES_DIR, 'UserService.cs'), 'utf-8');
      const parser = new TreeSitterWASMParser('csharp', ['.cs']);
      const result = await parser.parseFile(content, 'UserService.cs');

      expect(result.imports.length).toBeGreaterThanOrEqual(1);
      expect(result.imports[0].module).toBe('System.Threading.Tasks');
    });

    it('should parse C# attributes as decorators', async () => {
      const code = `
using System;

public class UserController {
    [HttpGet]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<User>> GetUser(int id) {
        return Ok(await _service.FindById(id));
    }
}
`;
      const parser = new TreeSitterWASMParser('csharp', ['.cs']);
      const result = await parser.parseFile(code, 'UserController.cs');

      const getUser = result.functions.find(f => f.name === 'GetUser');
      expect(getUser).toBeDefined();
      expect(getUser!.isPublic).toBe(true);
      expect(getUser!.isAsync).toBe(true);
    });
  });

  describe.skipIf(!wasmAvailable)('Rust WASM parser', () => {
    it('should extract functions and structs from Rust fixture', async () => {
      const content = fs.readFileSync(path.join(FIXTURES_DIR, 'user_service.rs'), 'utf-8');
      const parser = new TreeSitterWASMParser('rust', ['.rs']);
      const result = await parser.parseFile(content, 'user_service.rs');

      expect(result.language).toBe('rust');
      const pubFns = result.functions.filter(f => f.isPublic);
      expect(pubFns.length).toBeGreaterThanOrEqual(2);
      const privateFns = result.functions.filter(f => !f.isPublic);
      expect(privateFns.length).toBeGreaterThanOrEqual(1);
      expect(result.classes.length).toBeGreaterThanOrEqual(1);
      expect(result.classes[0].name).toBe('UserService');
      expect(result.classes[0].isPublic).toBe(true);
    });

    it('should detect async functions', async () => {
      const content = fs.readFileSync(path.join(FIXTURES_DIR, 'user_service.rs'), 'utf-8');
      const parser = new TreeSitterWASMParser('rust', ['.rs']);
      const result = await parser.parseFile(content, 'user_service.rs');

      const getUser = result.functions.find(f => f.name === 'get_user');
      expect(getUser).toBeDefined();
      expect(getUser!.isAsync).toBe(true);
      expect(getUser!.returnType).toBe('Result<User, Error>');
    });

    it('should extract use imports', async () => {
      const content = fs.readFileSync(path.join(FIXTURES_DIR, 'user_service.rs'), 'utf-8');
      const parser = new TreeSitterWASMParser('rust', ['.rs']);
      const result = await parser.parseFile(content, 'user_service.rs');

      expect(result.imports.length).toBeGreaterThanOrEqual(1);
      expect(result.imports.some(i => i.module.includes('std::sync::Arc'))).toBe(true);
    });

    it('should filter out self params', async () => {
      const code = `
fn standalone(x: i32) -> bool { true }
pub fn method(&self, id: i64) -> Option<User> { None }
`;
      const parser = new TreeSitterWASMParser('rust', ['.rs']);
      const result = await parser.parseFile(code, 'test.rs');
      expect(result.functions.find(f => f.name === 'standalone')!.parameters).toHaveLength(1);
      expect(result.functions.find(f => f.name === 'method')!.parameters).toHaveLength(1);
    });

    it('should handle complex lifetimes and generics', async () => {
      const code = `
pub fn get_ref<'a>(data: &'a HashMap<String, Vec<String>>) -> &'a str { "hello" }
pub fn multi_lifetime<'a, 'b: 'a>(first: &'a str, second: &'b str) -> &'a str { first }
`;
      const parser = new TreeSitterWASMParser('rust', ['.rs']);
      const result = await parser.parseFile(code, 'lifetimes.rs');

      expect(result.functions.find(f => f.name === 'get_ref')!.parameters).toHaveLength(1);
      expect(result.functions.find(f => f.name === 'multi_lifetime')!.parameters).toHaveLength(2);
    });
  });

  describe.skipIf(!wasmAvailable)('Swift WASM parser', () => {
    it('should parse Swift fixture file', async () => {
      const content = fs.readFileSync(path.join(FIXTURES_DIR, 'UserService.swift'), 'utf-8');
      const parser = new TreeSitterWASMParser('swift', ['.swift']);
      const result = await parser.parseFile(content, 'UserService.swift');

      expect(result.language).toBe('swift');
      expect(result.classes.length).toBeGreaterThanOrEqual(1);
      const userService = result.classes.find(c => c.name === 'UserService');
      expect(userService).toBeDefined();
      expect(userService!.isPublic).toBe(true);
    });

    it('should extract functions with visibility', async () => {
      const code = `
import Foundation

public class UserManager {
    public func fetchUser(id: Int) -> User? { return database.find(id) }
    private func validate(email: String) -> Bool { return email.contains("@") }
}
`;
      const parser = new TreeSitterWASMParser('swift', ['.swift']);
      const result = await parser.parseFile(code, 'UserManager.swift');

      expect(result.classes[0].name).toBe('UserManager');
      expect(result.functions.find(f => f.name === 'fetchUser')!.isPublic).toBe(true);
      expect(result.functions.find(f => f.name === 'validate')!.isPublic).toBe(false);
      expect(result.imports[0].module).toBe('Foundation');
    });
  });

  describe.skipIf(!wasmAvailable)('Cyclomatic complexity', () => {
    it('should compute complexity > 1 for branching functions', async () => {
      const code = `
def complex(x: int) -> str:
    if x > 0:
        if x > 10:
            return "big"
        return "small"
    elif x == 0:
        return "zero"
    else:
        for i in range(x):
            if i % 2 == 0:
                continue
        return "negative"
`;
      const parser = new TreeSitterWASMParser('python', ['.py']);
      const result = await parser.parseFile(code, 'complex.py');
      expect(result.functions[0].complexity).toBeGreaterThan(1);
    });

    it('should return 1 for trivial functions', async () => {
      const code = `def simple() -> int:\n    return 42\n`;
      const parser = new TreeSitterWASMParser('python', ['.py']);
      const result = await parser.parseFile(code, 'simple.py');
      expect(result.functions[0].complexity).toBe(1);
    });
  });

  describe.skipIf(!wasmAvailable)('Property extraction', () => {
    it('should extract Rust struct fields', async () => {
      const code = `pub struct Config { pub name: String, timeout: u64 }`;
      const parser = new TreeSitterWASMParser('rust', ['.rs']);
      const result = await parser.parseFile(code, 'config.rs');
      expect(result.classes.find(c => c.name === 'Config')!.properties.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe.skipIf(!wasmAvailable)('Error handling', () => {
    it('should handle empty input', async () => {
      const parser = new TreeSitterWASMParser('python', ['.py']);
      const result = await parser.parseFile('', 'empty.py');
      expect(result.language).toBe('python');
      expect(result.functions).toHaveLength(0);
    });

    it('should handle malformed code without crashing', async () => {
      const parser = new TreeSitterWASMParser('python', ['.py']);
      const result = await parser.parseFile('def broken(\nclass also {{{{', 'bad.py');
      expect(result.language).toBe('python');
    });
  });
});
