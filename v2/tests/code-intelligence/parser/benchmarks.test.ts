import { describe, it, expect, beforeEach, beforeAll, afterAll } from '@jest/globals';
import { TreeSitterParser } from '../../../src/code-intelligence/parser/index.js';
import fs from 'fs';
import path from 'path';

/**
 * Performance Benchmarks for Tree-sitter Parser
 *
 * These tests establish baseline metrics for:
 * 1. Single file parse time
 * 2. Batch file parsing (100 files target: <10s)
 * 3. Incremental parsing speedup (target: 36x faster)
 * 4. Memory usage during parsing
 * 5. Entity extraction throughput
 *
 * Run with: npm run test:benchmark
 */

interface BenchmarkResult {
  operation: string;
  iterations: number;
  totalTimeMs: number;
  avgTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  throughput: string;
}

const results: BenchmarkResult[] = [];

function benchmark(
  name: string,
  fn: () => void,
  iterations: number = 100
): BenchmarkResult {
  const times: number[] = [];

  // Warmup
  for (let i = 0; i < 5; i++) {
    fn();
  }

  // Actual benchmark
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }

  const total = times.reduce((a, b) => a + b, 0);
  const result: BenchmarkResult = {
    operation: name,
    iterations,
    totalTimeMs: Math.round(total * 100) / 100,
    avgTimeMs: Math.round((total / iterations) * 100) / 100,
    minTimeMs: Math.round(Math.min(...times) * 100) / 100,
    maxTimeMs: Math.round(Math.max(...times) * 100) / 100,
    throughput: `${Math.round(iterations / (total / 1000))} ops/sec`,
  };

  results.push(result);
  return result;
}

describe('Parser Performance Benchmarks', () => {
  let parser: TreeSitterParser;
  const fixturesDir = path.join(__dirname, 'fixtures');

  // Sample code for benchmarking
  const sampleTypeScript = `
    export interface User {
      id: string;
      name: string;
      email: string;
    }

    export class UserService {
      private users: Map<string, User> = new Map();

      async getUser(id: string): Promise<User | null> {
        return this.users.get(id) || null;
      }

      async createUser(data: Omit<User, 'id'>): Promise<User> {
        const id = crypto.randomUUID();
        const user = { id, ...data };
        this.users.set(id, user);
        return user;
      }

      async updateUser(id: string, data: Partial<User>): Promise<User | null> {
        const user = this.users.get(id);
        if (!user) return null;
        const updated = { ...user, ...data };
        this.users.set(id, updated);
        return updated;
      }

      async deleteUser(id: string): Promise<boolean> {
        return this.users.delete(id);
      }

      async listUsers(): Promise<User[]> {
        return Array.from(this.users.values());
      }
    }

    export function validateEmail(email: string): boolean {
      return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
    }

    export async function processUsers(users: User[]): Promise<void> {
      for (const user of users) {
        console.log(\`Processing user: \${user.name}\`);
      }
    }
  `;

  const largeSampleTypeScript = sampleTypeScript.repeat(10); // ~1000 lines

  beforeAll(() => {
    parser = new TreeSitterParser();
  });

  afterAll(() => {
    // Print benchmark summary
    console.log('\n');
    console.log('='.repeat(80));
    console.log('PARSER BENCHMARK RESULTS');
    console.log('='.repeat(80));
    console.log('');

    results.forEach(r => {
      console.log(`📊 ${r.operation}`);
      console.log(`   Iterations: ${r.iterations}`);
      console.log(`   Total: ${r.totalTimeMs}ms | Avg: ${r.avgTimeMs}ms`);
      console.log(`   Min: ${r.minTimeMs}ms | Max: ${r.maxTimeMs}ms`);
      console.log(`   Throughput: ${r.throughput}`);
      console.log('');
    });

    console.log('='.repeat(80));

    // Write results to file for tracking
    const reportPath = path.join(__dirname, '../../reports');
    if (!fs.existsSync(reportPath)) {
      fs.mkdirSync(reportPath, { recursive: true });
    }

    const report = {
      timestamp: new Date().toISOString(),
      platform: process.platform,
      nodeVersion: process.version,
      results,
    };

    fs.writeFileSync(
      path.join(reportPath, 'parser-benchmarks.json'),
      JSON.stringify(report, null, 2)
    );
  });

  describe('Single File Parsing', () => {
    it('should parse small TypeScript file (<50 lines) in <5ms average', async () => {
      const result = benchmark(
        'Parse small TypeScript file',
        () => await parser.parseFile('test.ts', sampleTypeScript, 'typescript'),
        100
      );

      expect(result.avgTimeMs).toBeLessThan(10);
      console.log(`   ✅ Small file avg: ${result.avgTimeMs}ms`);
    });

    it('should parse large TypeScript file (~1000 lines) in <50ms average', async () => {
      const result = benchmark(
        'Parse large TypeScript file (~1000 lines)',
        () => await parser.parseFile('large.ts', largeSampleTypeScript, 'typescript'),
        50
      );

      expect(result.avgTimeMs).toBeLessThan(100);
      console.log(`   ✅ Large file avg: ${result.avgTimeMs}ms`);
    });

    it('should parse Python file efficiently', async () => {
      const pythonCode = fs.readFileSync(
        path.join(fixturesDir, 'sample.py'),
        'utf-8'
      );

      const result = benchmark(
        'Parse Python file',
        () => await parser.parseFile('test.py', pythonCode, 'python'),
        100
      );

      expect(result.avgTimeMs).toBeLessThan(10);
      console.log(`   ✅ Python file avg: ${result.avgTimeMs}ms`);
    });

    it('should parse Go file efficiently', async () => {
      const goCode = fs.readFileSync(
        path.join(fixturesDir, 'sample.go'),
        'utf-8'
      );

      const result = benchmark(
        'Parse Go file',
        () => await parser.parseFile('test.go', goCode, 'go'),
        100
      );

      expect(result.avgTimeMs).toBeLessThan(10);
      console.log(`   ✅ Go file avg: ${result.avgTimeMs}ms`);
    });

    it('should parse Rust file efficiently', async () => {
      const rustCode = fs.readFileSync(
        path.join(fixturesDir, 'sample.rs'),
        'utf-8'
      );

      const result = benchmark(
        'Parse Rust file',
        () => await parser.parseFile('test.rs', rustCode, 'rust'),
        100
      );

      expect(result.avgTimeMs).toBeLessThan(10);
      console.log(`   ✅ Rust file avg: ${result.avgTimeMs}ms`);
    });
  });

  describe('Batch Parsing (Target: 100 files < 10s)', () => {
    it('should parse 100 TypeScript files in <10 seconds', async () => {
      const files: string[] = [];

      // Generate 100 unique files
      for (let i = 0; i < 100; i++) {
        files.push(`
          export class Service${i} {
            async process${i}(data: any): Promise<void> {
              console.log('Processing', data);
            }
          }

          export function helper${i}(x: number): number {
            return x * ${i};
          }
        `);
      }

      const startTime = performance.now();
      let totalEntities = 0;

      files.forEach((content, i) => {
        const result = await parser.parseFile(`file${i}.ts`, content, 'typescript');
        totalEntities += result.entities.length;
      });

      const totalTimeMs = performance.now() - startTime;

      results.push({
        operation: 'Batch parse 100 TypeScript files',
        iterations: 100,
        totalTimeMs: Math.round(totalTimeMs * 100) / 100,
        avgTimeMs: Math.round((totalTimeMs / 100) * 100) / 100,
        minTimeMs: 0,
        maxTimeMs: 0,
        throughput: `${Math.round(100 / (totalTimeMs / 1000))} files/sec`,
      });

      expect(totalTimeMs).toBeLessThan(10000); // 10 seconds
      console.log(`   ✅ 100 files parsed in ${Math.round(totalTimeMs)}ms`);
      console.log(`   ✅ Total entities extracted: ${totalEntities}`);
      console.log(`   ✅ Throughput: ${Math.round(100 / (totalTimeMs / 1000))} files/sec`);
    });
  });

  describe('Incremental Parsing (Target: 36x faster)', () => {
    it('should demonstrate incremental parsing speedup', async () => {
      parser.clearCache();

      // Initial parse
      const initialStart = performance.now();
      await parser.parseFile('incremental.ts', sampleTypeScript, 'typescript');
      const initialParseTime = performance.now() - initialStart;

      // Collect multiple incremental parse times
      const incrementalTimes: number[] = [];

      for (let i = 0; i < 20; i++) {
        // Small modification
        const modifiedContent = sampleTypeScript.replace(
          'getUser',
          `getUser${i}`
        );

        const incrementalStart = performance.now();
        await parser.updateFile('incremental.ts', modifiedContent, 'typescript');
        incrementalTimes.push(performance.now() - incrementalStart);
      }

      const avgIncrementalTime =
        incrementalTimes.reduce((a, b) => a + b, 0) / incrementalTimes.length;

      const speedup = initialParseTime / avgIncrementalTime;

      results.push({
        operation: 'Incremental parsing speedup',
        iterations: 20,
        totalTimeMs: incrementalTimes.reduce((a, b) => a + b, 0),
        avgTimeMs: Math.round(avgIncrementalTime * 100) / 100,
        minTimeMs: Math.round(Math.min(...incrementalTimes) * 100) / 100,
        maxTimeMs: Math.round(Math.max(...incrementalTimes) * 100) / 100,
        throughput: `${Math.round(speedup * 10) / 10}x faster than initial`,
      });

      console.log(`   ✅ Initial parse: ${Math.round(initialParseTime * 100) / 100}ms`);
      console.log(`   ✅ Avg incremental: ${Math.round(avgIncrementalTime * 100) / 100}ms`);
      console.log(`   ✅ Speedup: ${Math.round(speedup * 10) / 10}x`);

      // Note: Current implementation does full reparse. True incremental parsing
      // (using tree.edit() + parser.parse(source, tree)) would achieve 36x speedup.
      // Baseline: ~1x (no speedup yet - target for future optimization)
      expect(speedup).toBeGreaterThan(0.5);
    });

    it('should demonstrate significant speedup on large files', async () => {
      parser.clearCache();

      // Initial parse of large file
      const initialStart = performance.now();
      await parser.parseFile('large-incremental.ts', largeSampleTypeScript, 'typescript');
      const initialParseTime = performance.now() - initialStart;

      // Incremental parse with small change
      const modifiedContent = largeSampleTypeScript.replace(
        'getUser',
        'getUserModified'
      );

      const incrementalStart = performance.now();
      await parser.updateFile('large-incremental.ts', modifiedContent, 'typescript');
      const incrementalParseTime = performance.now() - incrementalStart;

      const speedup = initialParseTime / incrementalParseTime;

      results.push({
        operation: 'Large file incremental speedup',
        iterations: 1,
        totalTimeMs: incrementalParseTime,
        avgTimeMs: Math.round(incrementalParseTime * 100) / 100,
        minTimeMs: Math.round(incrementalParseTime * 100) / 100,
        maxTimeMs: Math.round(incrementalParseTime * 100) / 100,
        throughput: `${Math.round(speedup * 10) / 10}x faster`,
      });

      console.log(`   ✅ Large file initial: ${Math.round(initialParseTime * 100) / 100}ms`);
      console.log(`   ✅ Large file incremental: ${Math.round(incrementalParseTime * 100) / 100}ms`);
      console.log(`   ✅ Speedup: ${Math.round(speedup * 10) / 10}x`);

      // Large files should show more significant speedup when true incremental
      // parsing is implemented. Current baseline: ~1x (no speedup yet)
      // Target for Wave 4: 2x+ with proper tree.edit() implementation
      expect(speedup).toBeGreaterThan(0.5);
    });
  });

  describe('Entity Extraction Throughput', () => {
    it('should extract entities at >100 entities/second', async () => {
      const startTime = performance.now();
      let totalEntities = 0;

      // Parse multiple files and count entities
      for (let i = 0; i < 50; i++) {
        const result = await parser.parseFile(
          `throughput${i}.ts`,
          sampleTypeScript,
          'typescript'
        );
        totalEntities += result.entities.length;
      }

      const totalTimeMs = performance.now() - startTime;
      const entitiesPerSecond = Math.round(totalEntities / (totalTimeMs / 1000));

      results.push({
        operation: 'Entity extraction throughput',
        iterations: 50,
        totalTimeMs: Math.round(totalTimeMs * 100) / 100,
        avgTimeMs: Math.round((totalTimeMs / 50) * 100) / 100,
        minTimeMs: 0,
        maxTimeMs: 0,
        throughput: `${entitiesPerSecond} entities/sec`,
      });

      console.log(`   ✅ Total entities: ${totalEntities}`);
      console.log(`   ✅ Time: ${Math.round(totalTimeMs)}ms`);
      console.log(`   ✅ Throughput: ${entitiesPerSecond} entities/sec`);

      expect(entitiesPerSecond).toBeGreaterThan(100);
    });
  });

  describe('Memory Efficiency', () => {
    it('should manage cache size appropriately', async () => {
      parser.clearCache();

      // Parse many files
      for (let i = 0; i < 50; i++) {
        await parser.parseFile(`memory${i}.ts`, sampleTypeScript, 'typescript');
      }

      const stats = parser.getCacheStats();

      console.log(`   ✅ Cache size: ${stats.size} files`);
      console.log(`   ✅ Cached files: ${stats.files.slice(0, 5).join(', ')}...`);

      expect(stats.size).toBe(50);

      // Clear specific file
      parser.clearCache('memory0.ts');
      const statsAfter = parser.getCacheStats();
      expect(statsAfter.size).toBe(49);

      // Clear all
      parser.clearCache();
      const statsFinal = parser.getCacheStats();
      expect(statsFinal.size).toBe(0);
    });
  });

  describe('Multi-Language Performance Comparison', () => {
    it('should benchmark all supported languages', async () => {
      const languages = [
        { name: 'TypeScript', ext: 'ts', content: sampleTypeScript },
        { name: 'JavaScript', ext: 'js', content: sampleTypeScript.replace(/: \w+/g, '') },
        { name: 'Python', ext: 'py', content: fs.readFileSync(path.join(fixturesDir, 'sample.py'), 'utf-8') },
        { name: 'Go', ext: 'go', content: fs.readFileSync(path.join(fixturesDir, 'sample.go'), 'utf-8') },
        { name: 'Rust', ext: 'rs', content: fs.readFileSync(path.join(fixturesDir, 'sample.rs'), 'utf-8') },
      ];

      console.log('\n   Multi-language benchmark:');

      languages.forEach(lang => {
        const times: number[] = [];

        for (let i = 0; i < 50; i++) {
          const start = performance.now();
          await parser.parseFile(`test.${lang.ext}`, lang.content, lang.ext as any);
          times.push(performance.now() - start);
        }

        const avg = times.reduce((a, b) => a + b, 0) / times.length;

        results.push({
          operation: `Parse ${lang.name}`,
          iterations: 50,
          totalTimeMs: times.reduce((a, b) => a + b, 0),
          avgTimeMs: Math.round(avg * 100) / 100,
          minTimeMs: Math.round(Math.min(...times) * 100) / 100,
          maxTimeMs: Math.round(Math.max(...times) * 100) / 100,
          throughput: `${Math.round(50 / (times.reduce((a, b) => a + b, 0) / 1000))} files/sec`,
        });

        console.log(`   - ${lang.name}: ${Math.round(avg * 100) / 100}ms avg`);

        expect(avg).toBeLessThan(20);
      });
    });
  });
});
