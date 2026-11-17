/**
 * #1423: EdgeCaseInjector put any memory entry matching `edge-case:*`,
 * `pattern:*` or the test-generation namespace into the LLM prompt. Any agent
 * can write those keys through `memory_store`, so unmeasured content reached
 * the prompt under the header "from patterns that caught real bugs". The
 * injector now follows the #1388 rule: an entry is injected only when it names
 * a stored pattern test generation may apply (built-in seed, curated by a
 * person, or with a measured success), and the prompt shows that pattern's
 * own text and numbers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EdgeCaseInjector } from '../../../../src/domains/test-generation/pattern-injection/edge-case-injector';
import { findApplicablePattern } from '../../../../src/domains/test-generation/services/applicable-patterns';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';

let db: Database.Database;
const holder = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('../../../../src/kernel/unified-memory.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/kernel/unified-memory.js')>();
  return { ...actual, getUnifiedMemory: () => ({ getDatabase: () => holder.db }) };
});

beforeEach(() => {
  db = new Database(':memory:');
  holder.db = db;
  db.exec(`
    CREATE TABLE qe_patterns (
      id TEXT PRIMARY KEY, pattern_type TEXT NOT NULL, qe_domain TEXT NOT NULL, domain TEXT NOT NULL,
      name TEXT NOT NULL, description TEXT, confidence REAL DEFAULT 0.5, usage_count INTEGER DEFAULT 0,
      success_rate REAL DEFAULT 0, quality_score REAL DEFAULT 0, context_json TEXT
    );
    CREATE TABLE qe_pattern_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT, pattern_id TEXT NOT NULL, success INTEGER NOT NULL,
      metrics_json TEXT, feedback TEXT
    );
  `);
});
afterEach(() => db.close());

interface Row { id: string; name: string; description: string; context?: unknown; confidence?: number; successRate?: number; usage?: number }
function addPattern({ id, name, description, context = {}, confidence = 0.8, successRate = 0.9, usage = 5 }: Row): void {
  db.prepare(`INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description, confidence, usage_count, success_rate, context_json)
              VALUES (?, 'test-template', 'test-generation', 'test-generation', ?, ?, ?, ?, ?, ?)`)
    .run(id, name, description, confidence, usage, successRate, JSON.stringify(context));
}
function addUsage(patternId: string, outcome: 'measured' | 'unmeasured'): void {
  db.prepare('INSERT INTO qe_pattern_usage (pattern_id, success, metrics_json) VALUES (?, 1, ?)')
    .run(patternId, JSON.stringify({ outcome }));
}

/** A memory backend whose search returns `entries`' keys and whose get returns their values. */
function memoryWith(entries: Record<string, unknown>): MemoryBackend {
  return {
    search: vi.fn(async () => Object.keys(entries)),
    get: vi.fn(async (key: string) => entries[key]),
    set: vi.fn(async () => undefined), delete: vi.fn(async () => true), has: vi.fn(async () => false),
    vectorSearch: vi.fn(async () => []),
  } as unknown as MemoryBackend;
}

const SOURCE = 'export function calculateTotal(prices: number[]): number { return prices.reduce((s, p) => s + p, 0); }\n';
const dbResolver = async (ref: string) => findApplicablePattern(db, ref);

describe('#1423 findApplicablePattern', () => {
  it('returns only patterns test generation may apply, with their stored text', () => {
    addPattern({ id: 'learned', name: 'auto-learned', description: 'from a scaffold run' });
    addUsage('learned', 'unmeasured');
    addPattern({ id: 'measured', name: 'empty-input', description: 'Empty arrays sum to 0', confidence: 0.7, successRate: 0.6, usage: 4 });
    addUsage('measured', 'measured');
    addPattern({ id: 'curated', name: 'person-curated', description: 'Curated text', context: { curation: 'user-store' } });
    addPattern({ id: 'seed', name: 'unit-test-generation', description: 'Seed text' });

    expect(findApplicablePattern(db, 'learned')).toBeNull();
    expect(findApplicablePattern(db, 'auto-learned')).toBeNull();
    expect(findApplicablePattern(db, 'nothing-stored')).toBeNull();
    expect(findApplicablePattern(db, 'empty-input')).toEqual({
      id: 'measured', name: 'empty-input', description: 'Empty arrays sum to 0', confidence: 0.7, successRate: 0.6, usageCount: 4,
    });
    expect(findApplicablePattern(db, 'curated')?.description).toBe('Curated text');
    expect(findApplicablePattern(db, 'unit-test-generation')?.description).toBe('Seed text');
  });

  it('a curation marker that is not a valid curation does not count', () => {
    addPattern({ id: 'fake', name: 'fake-curated', description: 'x', context: { curation: 'agent' } });
    expect(findApplicablePattern(db, 'fake')).toBeNull();
  });
});

describe('#1423 EdgeCaseInjector evidence', () => {
  it('leaves out an entry that names no applicable stored pattern', async () => {
    addPattern({ id: 'learned', name: 'calculateTotal-empty', description: 'stored, never measured' });
    addUsage('learned', 'unmeasured');
    const injector = new EdgeCaseInjector(memoryWith({
      'edge-case:calculateTotal-empty': { name: 'calculateTotal-empty', description: 'UNMEASURED MARKER', confidence: 0.9, successRate: 1 },
      'edge-case:other': { name: 'not-stored', description: 'NOT STORED MARKER', confidence: 0.9 },
    }), undefined, dbResolver);

    const result = await injector.getInjectionContext(SOURCE);

    expect(result.promptContext).toBe('');
    expect(result.patternsUsed).toBe(0);
    expect(result.totalConsidered).toBe(2);
    expect(result.withoutEvidence).toBe(2);
  });

  it('injects the stored pattern\'s text and numbers, not the memory entry\'s', async () => {
    addPattern({ id: 'seed', name: 'unit-test-generation', description: 'Seed text from qe_patterns', confidence: 0.6, successRate: 0.2, usage: 3 });
    const injector = new EdgeCaseInjector(memoryWith({
      'edge-case:x': { name: 'unit-test-generation', description: 'INJECTED BY AN AGENT', confidence: 1, successRate: 1, tags: ['trusted'] },
    }), undefined, dbResolver);

    const result = await injector.getInjectionContext(SOURCE);

    expect(result.patternsUsed).toBe(1);
    expect(result.promptContext).toContain('Seed text from qe_patterns');
    expect(result.promptContext).not.toContain('INJECTED BY AN AGENT');
    expect(result.promptContext).not.toContain('[trusted]');
    expect(result.promptContext).not.toContain('caught real bugs');
    expect(result.promptContext).toMatch(/^## Edge Cases from stored patterns \(built-in, curated by a person, or with a measured success\):/);
    // The stored success rate (0.2), not the entry's claimed 1.0, drives the remediation notes.
    expect(result.promptContext).toContain('## Remediation Notes');
  });

  it('filters by the stored confidence, not the confidence the entry claims', async () => {
    addPattern({ id: 'low', name: 'low-confidence', description: 'Low stored confidence', confidence: 0.2, context: { curation: 'user-import' } });
    const injector = new EdgeCaseInjector(memoryWith({
      'edge-case:low': { name: 'low-confidence', confidence: 0.99 },
    }), { minConfidence: 0.5 }, dbResolver);

    const result = await injector.getInjectionContext(SOURCE);

    expect(result.patternsUsed).toBe(0);
    expect(result.withoutEvidence).toBe(0);
  });

  it('resolves an entry by patternId, id, name or the last segment of its key', async () => {
    for (const [id, name] of [['p1', 'by-pattern-id'], ['p2', 'by-id'], ['p3', 'by-name'], ['p4', 'by-key']]) {
      addPattern({ id, name, description: `${name} text`, context: { curation: 'user-store' } });
    }
    const injector = new EdgeCaseInjector(memoryWith({
      'edge-case:a': { patternId: 'p1', name: 'unknown' },
      'edge-case:b': { id: 'p2' },
      'edge-case:c': { name: 'by-name' },
      'edge-case:by-key': { description: 'only the key names it' },
    }), { topN: 10 }, dbResolver);

    const result = await injector.getInjectionContext(SOURCE);

    expect(result.patternsUsed).toBe(4);
    for (const name of ['by-pattern-id', 'by-id', 'by-name', 'by-key']) expect(result.promptContext).toContain(`${name} text`);
  });

  it('injects a pattern once, however many entries name it', async () => {
    addPattern({ id: 'p', name: 'shared', description: 'Shared text', context: { curation: 'user-store' } });
    const injector = new EdgeCaseInjector(memoryWith({
      'edge-case:1': { name: 'shared' }, 'pattern:2': { id: 'p' },
    }), undefined, dbResolver);

    const result = await injector.getInjectionContext(SOURCE);

    expect(result.patternsUsed).toBe(1);
    expect(result.promptContext.match(/Shared text/g)).toHaveLength(1);
  });

  it('fails closed when the pattern lookup throws', async () => {
    const injector = new EdgeCaseInjector(memoryWith({
      'edge-case:x': { name: 'anything', description: 'MARKER' },
    }), undefined, async () => { throw new Error('database locked'); });

    const result = await injector.getInjectionContext(SOURCE);

    expect(result.promptContext).toBe('');
    expect(result.withoutEvidence).toBe(1);
  });

  it('the default resolver reads qe_patterns through unified memory', async () => {
    addPattern({ id: 'm', name: 'measured-edge', description: 'Measured through unified memory' });
    addUsage('m', 'measured');
    const injector = new EdgeCaseInjector(memoryWith({
      'edge-case:x': { name: 'measured-edge', description: 'entry text' },
      'edge-case:y': { name: 'unmeasured', description: 'UNMEASURED MARKER' },
    }));

    const result = await injector.getInjectionContext(SOURCE);

    expect(result.promptContext).toContain('Measured through unified memory');
    expect(result.promptContext).not.toContain('UNMEASURED MARKER');
    expect(result.withoutEvidence).toBe(1);
  });
});

describe('#1423 LLM prompt of TestGeneratorService', () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  async function promptFor(entries: Record<string, unknown>): Promise<string> {
    const { TestGeneratorService } = await import('../../../../src/domains/test-generation/services/test-generator');
    const dir = mkdtempSync(join(tmpdir(), 'aqe-1423-'));
    directories.push(dir);
    const sourceFile = join(dir, 'cart.ts');
    writeFileSync(sourceFile, SOURCE);
    const prompts: string[] = [];
    const router = {
      chat: vi.fn(async (request: { messages: Array<{ role: string; content: string }> }) => {
        prompts.push(request.messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n'));
        return { content: "import { describe, it, expect } from 'vitest';\ndescribe('x', () => { it('y', () => { expect(1).toBe(1); }); });" };
      }),
    };
    const service = new TestGeneratorService(
      { memory: memoryWith(entries), llmRouter: router as never },
      { enableLLMEnhancement: true, enableEdgeCaseInjection: true },
    );
    await service.generateTests({ sourceFiles: [sourceFile], testType: 'unit', framework: 'vitest', language: 'typescript' });
    expect(prompts).toHaveLength(1);
    return prompts[0];
  }

  it('an entry written through memory_store, never measured, does not reach the prompt', async () => {
    const prompt = await promptFor({
      'edge-case:calculateTotal-empty': { name: 'calculateTotal empty input', description: 'UNMEASURED-1423-MARKER', confidence: 0.9 },
    });

    expect(prompt).not.toContain('UNMEASURED-1423-MARKER');
    expect(prompt).not.toContain('Edge Cases');
    expect(prompt).toContain('calculateTotal');
  });

  it('an entry naming a pattern with a measured success reaches the prompt with the stored text', async () => {
    addPattern({ id: 'm', name: 'empty-cart', description: 'MEASURED-1423: an empty cart totals 0' });
    addUsage('m', 'measured');

    const prompt = await promptFor({ 'edge-case:calculateTotal': { name: 'empty-cart', description: 'entry text' } });

    expect(prompt).toContain('MEASURED-1423: an empty cart totals 0');
    expect(prompt).not.toContain('entry text');
  });
});
