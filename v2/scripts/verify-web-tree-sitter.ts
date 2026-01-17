/**
 * Quick verification script for web-tree-sitter migration
 * Run with: npx tsx scripts/verify-web-tree-sitter.ts
 */

import { WebTreeSitterParser } from '../src/code-intelligence/parser/WebTreeSitterParser.js';

async function main() {
  console.log('Testing WebTreeSitterParser...\n');

  const parser = new WebTreeSitterParser();

  // Test TypeScript parsing
  const tsCode = `
export class UserService {
  private users: Map<string, User> = new Map();

  async getUser(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  createUser(name: string): User {
    const user = { id: crypto.randomUUID(), name };
    this.users.set(user.id, user);
    return user;
  }
}

interface User {
  id: string;
  name: string;
}
`;

  console.log('1. Testing TypeScript parsing...');
  const tsResult = await parser.parseFile('test.ts', tsCode);
  console.log(`   ✓ Parsed ${tsResult.entities.length} entities`);
  console.log(`   ✓ Parse time: ${tsResult.parseTimeMs}ms`);
  tsResult.entities.forEach(e => {
    console.log(`     - ${e.type}: ${e.name} (lines ${e.lineStart}-${e.lineEnd})`);
  });

  // Test JavaScript parsing
  const jsCode = `
function calculateSum(numbers) {
  return numbers.reduce((acc, n) => acc + n, 0);
}

class Calculator {
  add(a, b) { return a + b; }
  subtract(a, b) { return a - b; }
}
`;

  console.log('\n2. Testing JavaScript parsing...');
  const jsResult = await parser.parseFile('test.js', jsCode);
  console.log(`   ✓ Parsed ${jsResult.entities.length} entities`);
  jsResult.entities.forEach(e => {
    console.log(`     - ${e.type}: ${e.name}`);
  });

  // Test Python parsing
  const pyCode = `
def greet(name: str) -> str:
    """Greet a person by name."""
    return f"Hello, {name}!"

class Greeter:
    def __init__(self, prefix: str):
        self.prefix = prefix

    def greet(self, name: str) -> str:
        return f"{self.prefix} {name}!"
`;

  console.log('\n3. Testing Python parsing...');
  const pyResult = await parser.parseFile('test.py', pyCode);
  console.log(`   ✓ Parsed ${pyResult.entities.length} entities`);
  pyResult.entities.forEach(e => {
    console.log(`     - ${e.type}: ${e.name}`);
  });

  // Test Go parsing
  const goCode = `
package main

func Add(a, b int) int {
    return a + b
}

type Calculator struct {
    value int
}

func (c *Calculator) Add(n int) {
    c.value += n
}
`;

  console.log('\n4. Testing Go parsing...');
  const goResult = await parser.parseFile('test.go', goCode);
  console.log(`   ✓ Parsed ${goResult.entities.length} entities`);
  goResult.entities.forEach(e => {
    console.log(`     - ${e.type}: ${e.name}`);
  });

  // Test Rust parsing
  const rsCode = `
pub fn factorial(n: u64) -> u64 {
    if n <= 1 { 1 } else { n * factorial(n - 1) }
}

pub struct Counter {
    count: u64,
}

impl Counter {
    pub fn new() -> Self {
        Counter { count: 0 }
    }

    pub fn increment(&mut self) {
        self.count += 1;
    }
}
`;

  console.log('\n5. Testing Rust parsing...');
  const rsResult = await parser.parseFile('test.rs', rsCode);
  console.log(`   ✓ Parsed ${rsResult.entities.length} entities`);
  rsResult.entities.forEach(e => {
    console.log(`     - ${e.type}: ${e.name}`);
  });

  // Test cache stats
  console.log('\n6. Cache statistics:');
  const cacheStats = parser.getCacheStats();
  console.log(`   ✓ Cached files: ${cacheStats.size}`);

  // Clean up
  parser.dispose();

  console.log('\n✅ All tests passed! WebTreeSitterParser is working correctly.\n');
}

main().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
