import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  TreeSitterParserRegistry,
  PythonParser,
  JavaParser,
  GoParser,
  RustParser,
  SwiftParser,
  KotlinParser,
  CSharpParser,
  DartParser,
} from '../../../src/shared/parsers/multi-language-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/parsers');

describe('TreeSitterParserRegistry (Multi-Language Parser)', () => {
  const registry = new TreeSitterParserRegistry();

  describe('registry', () => {
    it('should support 8 languages', () => {
      expect(registry.getSupportedLanguages()).toHaveLength(8);
    });

    it('should support python, java, csharp, go, rust, swift, kotlin, dart', () => {
      for (const lang of [
        'python',
        'java',
        'csharp',
        'go',
        'rust',
        'swift',
        'kotlin',
        'dart',
      ] as const) {
        expect(registry.supportsLanguage(lang)).toBe(true);
      }
    });

    it('should not support typescript (handled by TypeScriptParser)', () => {
      expect(registry.supportsLanguage('typescript' as any)).toBe(false);
    });

    it('should return parser for supported language', () => {
      const parser = registry.getParser('python');
      expect(parser).toBeDefined();
      expect(parser!.language).toBe('python');
    });

    it('should return undefined for unsupported language', () => {
      const parser = registry.getParser('typescript' as any);
      expect(parser).toBeUndefined();
    });
  });

  describe('Python parser', () => {
    it('should extract functions from Python code', async () => {
      const content = fs.readFileSync(
        path.join(FIXTURES_DIR, 'sample.py'),
        'utf-8',
      );
      const result = await registry.parseFile(content, 'sample.py', 'python');

      expect(result).toBeDefined();
      expect(result!.language).toBe('python');
      expect(result!.functions.length).toBeGreaterThanOrEqual(1);

      const helper = result!.functions.find(
        (f) => f.name === 'helper_function',
      );
      expect(helper).toBeDefined();
      expect(helper!.parameters).toHaveLength(1);
      expect(helper!.parameters[0].name).toBe('items');
      expect(helper!.returnType).toBe('int');
      expect(helper!.isPublic).toBe(true);
    });

    it('should extract classes from Python code', async () => {
      const content = fs.readFileSync(
        path.join(FIXTURES_DIR, 'sample.py'),
        'utf-8',
      );
      const result = await registry.parseFile(content, 'sample.py', 'python');

      expect(result!.classes.length).toBeGreaterThanOrEqual(1);
      const cls = result!.classes.find((c) => c.name === 'UserService');
      expect(cls).toBeDefined();
      expect(cls!.methods.length).toBeGreaterThanOrEqual(2);

      // Check async method
      const createUser = cls!.methods.find((m) => m.name === 'create_user');
      expect(createUser).toBeDefined();
      expect(createUser!.isAsync).toBe(true);
    });

    it('should extract imports', async () => {
      const content = fs.readFileSync(
        path.join(FIXTURES_DIR, 'sample.py'),
        'utf-8',
      );
      const result = await registry.parseFile(content, 'sample.py', 'python');

      expect(result!.imports.length).toBeGreaterThanOrEqual(2);
      const osImport = result!.imports.find((i) => i.module === 'os');
      expect(osImport).toBeDefined();
      const typingImport = result!.imports.find(
        (i) => i.module === 'typing',
      );
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
      const parser = new PythonParser();
      const result = await parser.parseFile(code, 'test.py');
      const pub = result.functions.find((f) => f.name === 'public_func');
      const priv = result.functions.find((f) => f.name === '_private_func');
      expect(pub!.isPublic).toBe(true);
      expect(priv!.isPublic).toBe(false);
    });
  });

  describe('Java parser', () => {
    it('should extract classes and methods from Java code', async () => {
      const content = fs.readFileSync(
        path.join(FIXTURES_DIR, 'UserService.java'),
        'utf-8',
      );
      const result = await registry.parseFile(
        content,
        'UserService.java',
        'java',
      );

      expect(result).toBeDefined();
      expect(result!.language).toBe('java');
      expect(result!.classes.length).toBeGreaterThanOrEqual(1);
      expect(result!.classes[0].name).toBe('UserService');
      expect(result!.classes[0].decorators).toContain('@Service');
    });

    it('should extract imports', async () => {
      const content = fs.readFileSync(
        path.join(FIXTURES_DIR, 'UserService.java'),
        'utf-8',
      );
      const result = await registry.parseFile(
        content,
        'UserService.java',
        'java',
      );

      expect(result!.imports.length).toBeGreaterThanOrEqual(2);
      const listImport = result!.imports.find((i) =>
        i.module.includes('java.util.List'),
      );
      expect(listImport).toBeDefined();
      expect(listImport!.namedImports).toContain('List');
    });

    it('should extract public methods', async () => {
      const content = fs.readFileSync(
        path.join(FIXTURES_DIR, 'UserService.java'),
        'utf-8',
      );
      const result = await registry.parseFile(
        content,
        'UserService.java',
        'java',
      );

      const getUser = result!.functions.find((f) => f.name === 'getUser');
      expect(getUser).toBeDefined();
      expect(getUser!.isPublic).toBe(true);
      expect(getUser!.parameters).toHaveLength(1);
      expect(getUser!.parameters[0].name).toBe('id');
    });

    it('should parse multi-line Java method signatures', async () => {
      const code = `
public class UserService {
    public Optional<User> findUser(
        @NotNull Long id,
        @Valid UserFilter filter,
        Pageable pageable
    ) {
        return repository.find(id);
    }
}
`;
      const parser = new JavaParser();
      const result = await parser.parseFile(code, 'UserService.java');

      const findUser = result.functions.find((f) => f.name === 'findUser');
      expect(findUser).toBeDefined();
      expect(findUser!.parameters).toHaveLength(3);
      expect(findUser!.parameters[0].name).toBe('id');
      expect(findUser!.parameters[1].name).toBe('filter');
      expect(findUser!.parameters[2].name).toBe('pageable');
      expect(findUser!.isPublic).toBe(true);
    });

    it('should parse nested generics in return types', async () => {
      const code = `
public class GroupService {
    public Map<String, List<User>> groupUsers(List<User> users) {
        return new HashMap<>();
    }
}
`;
      const parser = new JavaParser();
      const result = await parser.parseFile(code, 'GroupService.java');

      const groupUsers = result.functions.find((f) => f.name === 'groupUsers');
      expect(groupUsers).toBeDefined();
      expect(groupUsers!.returnType).toBe('Map<String, List<User>>');
      expect(groupUsers!.parameters).toHaveLength(1);
      expect(groupUsers!.parameters[0].name).toBe('users');
    });
  });

  describe('Go parser', () => {
    it('should extract functions and structs from Go code', async () => {
      const content = fs.readFileSync(
        path.join(FIXTURES_DIR, 'user_service.go'),
        'utf-8',
      );
      const result = await registry.parseFile(
        content,
        'user_service.go',
        'go',
      );

      expect(result).toBeDefined();
      expect(result!.language).toBe('go');

      const newFn = result!.functions.find(
        (f) => f.name === 'NewUserService',
      );
      expect(newFn).toBeDefined();
      expect(newFn!.isPublic).toBe(true);

      const getFn = result!.functions.find((f) => f.name === 'GetUser');
      expect(getFn).toBeDefined();
      expect(getFn!.isPublic).toBe(true);

      expect(result!.classes.length).toBeGreaterThanOrEqual(1);
      expect(result!.classes[0].name).toBe('UserService');
    });

    it('should extract multi-line imports', async () => {
      const content = fs.readFileSync(
        path.join(FIXTURES_DIR, 'user_service.go'),
        'utf-8',
      );
      const result = await registry.parseFile(
        content,
        'user_service.go',
        'go',
      );

      expect(result!.imports.length).toBeGreaterThanOrEqual(2);
      expect(result!.imports.some((i) => i.module === 'context')).toBe(
        true,
      );
      expect(result!.imports.some((i) => i.module === 'errors')).toBe(
        true,
      );
    });

    it('should detect exported vs unexported by casing', async () => {
      const code = `package main

func ExportedFunc() {}
func unexportedFunc() {}
`;
      const parser = new GoParser();
      const result = await parser.parseFile(code, 'test.go');
      const exp = result.functions.find(
        (f) => f.name === 'ExportedFunc',
      );
      const unexp = result.functions.find(
        (f) => f.name === 'unexportedFunc',
      );
      expect(exp!.isPublic).toBe(true);
      expect(unexp!.isPublic).toBe(false);
    });

    it('should filter nested Go closures and only capture top-level functions', async () => {
      const code = `package main

import "fmt"
import "net/http"

func Handler(w http.ResponseWriter, r *http.Request) {
    go func() {
        fmt.Println("background")
    }()
    http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        fmt.Fprintf(w, "Hello")
    })
}

func AnotherTopLevel() {
}
`;
      const parser = new GoParser();
      const result = await parser.parseFile(code, 'handler.go');

      const names = result.functions.map((f) => f.name);
      expect(names).toContain('Handler');
      expect(names).toContain('AnotherTopLevel');
      expect(names).toHaveLength(2);
    });
  });

  describe('Rust parser', () => {
    it('should extract functions and structs from Rust code', async () => {
      const content = fs.readFileSync(
        path.join(FIXTURES_DIR, 'user_service.rs'),
        'utf-8',
      );
      const result = await registry.parseFile(
        content,
        'user_service.rs',
        'rust',
      );

      expect(result).toBeDefined();
      expect(result!.language).toBe('rust');

      const pubFns = result!.functions.filter((f) => f.isPublic);
      expect(pubFns.length).toBeGreaterThanOrEqual(2);

      const privateFns = result!.functions.filter((f) => !f.isPublic);
      expect(privateFns.length).toBeGreaterThanOrEqual(1);

      expect(result!.classes.length).toBeGreaterThanOrEqual(1);
      expect(result!.classes[0].name).toBe('UserService');
      expect(result!.classes[0].isPublic).toBe(true);
    });

    it('should detect async functions', async () => {
      const content = fs.readFileSync(
        path.join(FIXTURES_DIR, 'user_service.rs'),
        'utf-8',
      );
      const result = await registry.parseFile(
        content,
        'user_service.rs',
        'rust',
      );

      const getUser = result!.functions.find(
        (f) => f.name === 'get_user',
      );
      expect(getUser).toBeDefined();
      expect(getUser!.isAsync).toBe(true);
      expect(getUser!.returnType).toBe('Result<User, Error>');
    });

    it('should extract use imports', async () => {
      const content = fs.readFileSync(
        path.join(FIXTURES_DIR, 'user_service.rs'),
        'utf-8',
      );
      const result = await registry.parseFile(
        content,
        'user_service.rs',
        'rust',
      );

      expect(result!.imports.length).toBeGreaterThanOrEqual(1);
      expect(
        result!.imports.some((i) => i.module.includes('std::sync::Arc')),
      ).toBe(true);
    });

    it('should filter out self params', async () => {
      const parser = new RustParser();
      const code = `
fn standalone(x: i32) -> bool {
    true
}

pub fn method(&self, id: i64) -> Option<User> {
    None
}
`;
      const result = await parser.parseFile(code, 'test.rs');
      const standalone = result.functions.find(
        (f) => f.name === 'standalone',
      );
      expect(standalone!.parameters).toHaveLength(1);
      expect(standalone!.parameters[0].name).toBe('x');

      const method = result.functions.find((f) => f.name === 'method');
      expect(method!.parameters).toHaveLength(1);
      expect(method!.parameters[0].name).toBe('id');
    });

    it('should parse Rust functions with lifetime annotations', async () => {
      const code = `
pub fn get_ref<'a>(data: &'a HashMap<String, Vec<String>>) -> &'a str {
    "hello"
}

pub fn multi_lifetime<'a, 'b: 'a>(first: &'a str, second: &'b str) -> &'a str {
    first
}
`;
      const parser = new RustParser();
      const result = await parser.parseFile(code, 'lifetimes.rs');

      const getRef = result.functions.find((f) => f.name === 'get_ref');
      expect(getRef).toBeDefined();
      expect(getRef!.isPublic).toBe(true);
      expect(getRef!.parameters).toHaveLength(1);
      expect(getRef!.parameters[0].name).toBe('data');
      expect(getRef!.parameters[0].type).toBe("&'a HashMap<String, Vec<String>>");
      expect(getRef!.returnType).toBe("&'a str");

      const multiLifetime = result.functions.find((f) => f.name === 'multi_lifetime');
      expect(multiLifetime).toBeDefined();
      expect(multiLifetime!.parameters).toHaveLength(2);
    });
  });

  describe('C# parser', () => {
    it('should parse C# class and methods', async () => {
      const code = `
using System;
using System.Collections.Generic;

public class UserController {
    public async Task<User> GetUser(int id) {
        return await _service.FindById(id);
    }

    private void InternalMethod() {
        // do something
    }
}
`;
      const parser = new CSharpParser();
      const result = await parser.parseFile(code, 'UserController.cs');

      expect(result.language).toBe('csharp');
      expect(result.classes.length).toBeGreaterThanOrEqual(1);
      expect(result.classes[0].name).toBe('UserController');

      expect(result.imports).toHaveLength(2);
      expect(result.imports[0].module).toBe('System');
    });

    it('should parse multi-line C# attributes and methods', async () => {
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
      const parser = new CSharpParser();
      const result = await parser.parseFile(code, 'UserController.cs');

      const getUser = result.functions.find((f) => f.name === 'GetUser');
      expect(getUser).toBeDefined();
      expect(getUser!.isPublic).toBe(true);
      expect(getUser!.isAsync).toBe(true);
      expect(getUser!.decorators).toContain('[HttpGet]');
      expect(getUser!.decorators).toContain('[Authorize(Roles = "Admin")]');
      expect(getUser!.decorators).toHaveLength(2);
    });
  });

  describe('Swift parser', () => {
    it('should parse Swift functions and classes', async () => {
      const code = `
import Foundation

public class UserManager {
    public func fetchUser(id: Int) -> User? {
        return database.find(id)
    }

    private func validate(email: String) -> Bool {
        return email.contains("@")
    }
}
`;
      const parser = new SwiftParser();
      const result = await parser.parseFile(code, 'UserManager.swift');

      expect(result.language).toBe('swift');
      expect(result.classes.length).toBeGreaterThanOrEqual(1);
      expect(result.classes[0].name).toBe('UserManager');

      const fetchUser = result.functions.find(
        (f) => f.name === 'fetchUser',
      );
      expect(fetchUser).toBeDefined();
      expect(fetchUser!.isPublic).toBe(true);

      const validate = result.functions.find(
        (f) => f.name === 'validate',
      );
      expect(validate).toBeDefined();
      expect(validate!.isPublic).toBe(false);

      expect(result.imports).toHaveLength(1);
      expect(result.imports[0].module).toBe('Foundation');
    });
  });

  describe('Kotlin parser', () => {
    it('should parse Kotlin functions and classes', async () => {
      const code = `
import kotlinx.coroutines.flow.Flow

data class User(val id: Long, val name: String)

class UserRepository {
    suspend fun getUser(id: Long): User? {
        return database.findById(id)
    }

    fun getAllUsers(): List<User> {
        return database.findAll()
    }

    private fun validate(user: User): Boolean {
        return user.name.isNotBlank()
    }
}
`;
      const parser = new KotlinParser();
      const result = await parser.parseFile(
        code,
        'UserRepository.kt',
      );

      expect(result.language).toBe('kotlin');
      expect(result.classes.length).toBeGreaterThanOrEqual(1);

      const getUser = result.functions.find(
        (f) => f.name === 'getUser',
      );
      expect(getUser).toBeDefined();
      expect(getUser!.isAsync).toBe(true); // suspend

      const validate = result.functions.find(
        (f) => f.name === 'validate',
      );
      expect(validate).toBeDefined();
      expect(validate!.isPublic).toBe(false);

      expect(result.imports).toHaveLength(1);
    });

    it('should parse Kotlin suspend function with multi-line generic params', async () => {
      const code = `
import kotlinx.coroutines.flow.Flow

suspend fun fetchUsers(
    filter: Map<String, List<String>>,
    page: Int
): Flow<List<User>> {
    return flow { emit(emptyList()) }
}
`;
      const parser = new KotlinParser();
      const result = await parser.parseFile(code, 'UserApi.kt');

      const fetchUsers = result.functions.find((f) => f.name === 'fetchUsers');
      expect(fetchUsers).toBeDefined();
      expect(fetchUsers!.isAsync).toBe(true);
      expect(fetchUsers!.parameters).toHaveLength(2);
      expect(fetchUsers!.parameters[0].name).toBe('filter');
      expect(fetchUsers!.parameters[0].type).toBe('Map<String, List<String>>');
      expect(fetchUsers!.parameters[1].name).toBe('page');
      expect(fetchUsers!.parameters[1].type).toBe('Int');
      expect(fetchUsers!.returnType).toBe('Flow<List<User>>');
    });
  });

  describe('Dart parser', () => {
    it('should parse Dart functions and classes', async () => {
      const code = `
import 'package:flutter/material.dart';

class UserWidget extends StatefulWidget {
    String title;

    Widget build(BuildContext context) {
        return Container();
    }

    Future<User> fetchUser(int id) async {
        return await api.getUser(id);
    }
}
`;
      const parser = new DartParser();
      const result = await parser.parseFile(code, 'user_widget.dart');

      expect(result.language).toBe('dart');
      expect(result.classes.length).toBeGreaterThanOrEqual(1);
      expect(result.classes[0].name).toBe('UserWidget');
      expect(result.classes[0].extends).toBe('StatefulWidget');

      expect(result.imports).toHaveLength(1);
      expect(result.imports[0].module).toBe(
        'package:flutter/material.dart',
      );
    });
  });

  describe('parseFile with unknown language', () => {
    it('should return undefined for unsupported language', async () => {
      const result = await registry.parseFile(
        'code',
        'file.ts',
        'typescript',
      );
      expect(result).toBeUndefined();
    });
  });
});
