/**
 * Demo script for Tree-sitter Parser
 * Shows how to parse code from 5 different languages
 */

import { TreeSitterParser } from '../../src/code-intelligence/parser/index.js';

const parser = new TreeSitterParser();

console.log('=== Tree-sitter Parser Demo ===\n');

// TypeScript Example
console.log('1. TypeScript Function:');
const tsCode = `
export async function processUser(id: string, options?: ProcessOptions): Promise<User> {
  const user = await fetchUser(id);
  return transformUser(user, options);
}
`;
const tsResult = parser.parseFile('example.ts', tsCode, 'typescript');
console.log('Entities found:', tsResult.entities.length);
console.log('Parse time:', tsResult.parseTimeMs, 'ms');
if (tsResult.entities[0]) {
  const entity = tsResult.entities[0];
  console.log('Function:', entity.name);
  console.log('  - Type:', entity.type);
  console.log('  - Lines:', entity.lineStart, '-', entity.lineEnd);
  console.log('  - Async:', entity.metadata.isAsync);
  console.log('  - Exported:', entity.metadata.isExported);
  console.log('  - Parameters:', entity.metadata.parameters?.length || 0);
}
console.log('');

// JavaScript Class
console.log('2. JavaScript Class:');
const jsCode = `
class DataService {
  constructor(config) {
    this.config = config;
  }

  async fetchData(id) {
    return this.api.get(id);
  }

  static create(config) {
    return new DataService(config);
  }
}
`;
const jsResult = parser.parseFile('service.js', jsCode, 'javascript');
console.log('Entities found:', jsResult.entities.length);
jsResult.entities.forEach((e) => {
  console.log(`  - ${e.type}: ${e.name} (line ${e.lineStart})`);
});
console.log('');

// Python Class with Methods
console.log('3. Python Class:');
const pyCode = `
class UserRepository:
    def __init__(self, db):
        self.__db = db

    def _validate(self, user):
        return user is not None

    async def get_user(self, user_id: str) -> User:
        user = await self.__db.query(user_id)
        return user
`;
const pyResult = parser.parseFile('repository.py', pyCode, 'python');
console.log('Entities found:', pyResult.entities.length);
pyResult.entities.forEach((e) => {
  console.log(
    `  - ${e.type}: ${e.name} (visibility: ${e.metadata.visibility || 'public'})`
  );
});
console.log('');

// Go Function
console.log('4. Go Function:');
const goCode = `
package main

import "fmt"

func ProcessData(input string, options Options) (string, error) {
    if input == "" {
        return "", fmt.Errorf("empty input")
    }
    return transform(input, options), nil
}
`;
const goResult = parser.parseFile('processor.go', goCode, 'go');
console.log('Entities found:', goResult.entities.length);
if (goResult.entities[0]) {
  const entity = goResult.entities[0];
  console.log('Function:', entity.name);
  console.log('  - Visibility:', entity.name[0] === entity.name[0].toUpperCase() ? 'public' : 'private');
}
console.log('');

// Rust Struct
console.log('5. Rust Struct:');
const rustCode = `
pub struct User {
    pub id: String,
    name: String,
}

impl User {
    pub async fn fetch(id: &str) -> Result<User, Error> {
        let user = query_db(id).await?;
        Ok(user)
    }

    fn validate(&self) -> bool {
        !self.id.is_empty()
    }
}
`;
const rustResult = parser.parseFile('user.rs', rustCode, 'rust');
console.log('Entities found:', rustResult.entities.length);
rustResult.entities.forEach((e) => {
  console.log(`  - ${e.type}: ${e.name}`);
});
console.log('');

// Incremental Parsing Demo
console.log('6. Incremental Parsing (36x faster):');
const code1 = 'function add(a, b) { return a + b; }';
const code2 = 'function add(a, b) { return a + b; }\nfunction subtract(a, b) { return a - b; }';

const result1 = parser.parseFile('calc.js', code1, 'javascript');
console.log('Initial parse:', result1.parseTimeMs, 'ms');

const result2 = parser.updateFile('calc.js', code2, 'javascript');
console.log('Incremental update:', result2.parseTimeMs, 'ms');
console.log('Entities found:', result2.entities.length);
console.log('');

// Cache Stats
console.log('7. Cache Statistics:');
const stats = parser.getCacheStats();
console.log('Cached files:', stats.size);
console.log('Files:', stats.files.join(', '));
console.log('');

console.log('=== Demo Complete ===');
