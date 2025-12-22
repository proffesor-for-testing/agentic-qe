import { ASTChunker } from '../src/code-intelligence/chunking/ASTChunker.js';
import { TreeSitterParser } from '../src/code-intelligence/parser/TreeSitterParser.js';

// Simulate benchmark test's beforeAll
const astChunker = new ASTChunker({
  maxTokens: 512,
  overlapPercent: 15,
});

const sampleCode = `
export class UserService {
  private users: Map<string, User> = new Map();
  async createUser(email: string): Promise<User> {
    return { email };
  }
}
`;

const result = astChunker.chunkFile('/src/services/UserService.ts', sampleCode, 'typescript');
console.log('ASTChunker result chunks:', result.chunks.length);

// Now simulate TreeSitterParser test's beforeAll
const parser = new TreeSitterParser();

// Now test if the parser works
const content = `
class Test {
  private static async getData(): Promise<void> {}
}
`;

const parseResult = parser.parseFile('test.ts', content, 'typescript');

console.log('\nParser test results:');
for (const e of parseResult.entities) {
  console.log('  Entity:', e.name, e.type);
  console.log('    visibility:', e.metadata?.visibility);
  console.log('    isStatic:', e.metadata?.isStatic);
  console.log('    isAsync:', e.metadata?.isAsync);
}
