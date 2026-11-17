/**
 * #1423: EdgeCaseInjector put any memory entry matching `edge-case:*`,
 * `pattern:*` or the test-generation namespace into the LLM prompt. Any agent
 * can write those keys through `memory_store`, so unmeasured content reached
 * the prompt under the header "from patterns that caught real bugs". An entry
 * is now only a pointer: it is injected when it names a stored
 * test-generation pattern that a person curated or that has a measured
 * success, and the prompt shows that pattern's own text.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EdgeCaseInjector, resolveFromUnifiedMemory } from '../../../../src/domains/test-generation/pattern-injection/edge-case-injector';
import { findInjectablePatterns } from '../../../../src/domains/test-generation/services/applicable-patterns';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';

let db: Database.Database;
const holder = vi.hoisted(() => ({ db: null as unknown, getUnifiedMemory: vi.fn() }));

vi.mock('../../../../src/kernel/unified-memory.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/kernel/unified-memory.js')>();
  return { ...actual, getOpenUnifiedMemoryDatabase: () => holder.db, getUnifiedMemory: holder.getUnifiedMemory };
});

const SCHEMA = `
  CREATE TABLE qe_patterns (
    id TEXT PRIMARY KEY, pattern_type TEXT NOT NULL, qe_domain TEXT NOT NULL, domain TEXT NOT NULL,
    name TEXT NOT NULL, description TEXT, confidence REAL DEFAULT 0.5, usage_count INTEGER DEFAULT 0,
    success_rate REAL DEFAULT 0, quality_score REAL DEFAULT 0, context_json TEXT
  );
  CREATE TABLE qe_pattern_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT, pattern_id TEXT NOT NULL, success INTEGER NOT NULL,
    metrics_json TEXT, feedback TEXT
  );`;

beforeEach(() => {
  db = new Database(':memory:');
  holder.db = db;
  holder.getUnifiedMemory.mockReset();
  db.exec(SCHEMA);
});
afterEach(() => { if (db.open) db.close(); });

const curated = { curation: 'user-store' };
interface Row { id: string; name: string; description: string; context?: unknown; confidence?: number; successRate?: number; usage?: number; quality?: number; domain?: string }
function addPattern({ id, name, description, context = {}, confidence = 0.8, successRate = 0.9, usage = 5, quality = 0.5, domain = 'test-generation' }: Row): void {
  db.prepare(`INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description, confidence, usage_count, success_rate, quality_score, context_json)
              VALUES (?, 'test-template', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, domain, domain, name, description, confidence, usage, successRate, quality, JSON.stringify(context));
}
let run = 0;
function addRun(patternId: string, outcome: 'measured' | 'unmeasured', success = true): void {
  db.prepare('INSERT INTO qe_pattern_usage (pattern_id, success, metrics_json) VALUES (?, ?, ?)')
    .run(patternId, success ? 1 : 0, JSON.stringify({ outcome, runId: `r${++run}` }));
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
const dbResolver = async (refs: readonly string[]) => findInjectablePatterns(db, refs);
const injectorFor = (entries: Record<string, unknown>, config?: object) =>
  new EdgeCaseInjector(memoryWith(entries), config, dbResolver);

describe('#1423 findInjectablePatterns', () => {
  it('accepts curated and measured-success patterns, with their stored text', () => {
    addPattern({ id: 'learned', name: 'auto-learned', description: 'from a scaffold run' });
    addRun('learned', 'unmeasured');
    addPattern({ id: 'measured', name: 'empty-input', description: 'Empty arrays sum to 0', confidence: 0.7 });
    addRun('measured', 'measured', true);
    addRun('measured', 'measured', false);
    addRun('measured', 'measured', true);
    addPattern({ id: 'curated', name: 'person-curated', description: 'Curated text', context: curated });

    const found = findInjectablePatterns(db, ['learned', 'auto-learned', 'nothing-stored', 'empty-input', 'curated']);

    expect([...found.keys()].sort()).toEqual(['curated', 'empty-input']);
    // Success rate and usage from the 3 measured runs, not the success_rate/usage_count columns.
    expect(found.get('empty-input')).toEqual({
      id: 'measured', name: 'empty-input', description: 'Empty arrays sum to 0', confidence: 0.7, successRate: 2 / 3, usageCount: 3,
    });
    expect(found.get('curated')).toMatchObject({ description: 'Curated text', successRate: 0, usageCount: 0 });
  });

  it('a seed name is not evidence: anyone storing a pattern can choose it', () => {
    addPattern({ id: 'spoof1', name: 'AAA Unit Test (from evil-domain)', description: 'SPOOF via hooks learn' });
    addPattern({ id: 'spoof2', name: 'unit-test-generation', description: 'SPOOF exact seed name' });

    expect(findInjectablePatterns(db, ['AAA Unit Test (from evil-domain)', 'spoof1', 'unit-test-generation', 'spoof2']).size).toBe(0);
  });

  it('only test-generation patterns', () => {
    addPattern({ id: 'sec', name: 'cross-domain', description: 'CROSS-DOMAIN text', context: curated, domain: 'security-compliance' });
    expect(findInjectablePatterns(db, ['sec', 'cross-domain']).size).toBe(0);
  });

  it('an id match wins over a name match; name ties go to the higher quality score', () => {
    addPattern({ id: 'shared', name: 'other', description: 'BY ID', context: curated });
    addPattern({ id: 'x1', name: 'shared', description: 'BY NAME', context: curated, quality: 0.9 });
    addPattern({ id: 'y1', name: 'dup', description: 'LOW', context: curated, quality: 0.1 });
    addPattern({ id: 'y2', name: 'dup', description: 'HIGH', context: curated, quality: 0.8 });

    const found = findInjectablePatterns(db, ['shared', 'dup']);

    expect(found.get('shared')?.description).toBe('BY ID');
    expect(found.get('dup')?.description).toBe('HIGH');
  });

  it('#1426: a curated pattern whose family mostly fails its measured runs is not injected', () => {
    addPattern({ id: 'c', name: 'team-edge', description: 'Curated text', context: curated });
    addPattern({ id: 'copy', name: 'team-edge (from test-generation)', description: 'x', context: curated, domain: 'test-execution' });
    expect(findInjectablePatterns(db, ['team-edge']).size).toBe(1);
    for (let i = 0; i < 3; i++) addRun('copy', 'measured', false);
    expect(findInjectablePatterns(db, ['team-edge']).size).toBe(0);
  });

  it('a fake curation marker does not count', () => {
    addPattern({ id: 'fake', name: 'fake-curated', description: 'x', context: { curation: 'agent' } });
    expect(findInjectablePatterns(db, ['fake']).size).toBe(0);
  });

  it('looks up many references in chunks', () => {
    addPattern({ id: 'last', name: 'last', description: 'found', context: curated });
    const refs = [...Array.from({ length: 450 }, (_, i) => `missing-${i}`), 'last'];
    expect(findInjectablePatterns(db, refs).get('last')?.description).toBe('found');
  });
});

describe('#1423 EdgeCaseInjector evidence', () => {
  it('leaves out entries that name no curated or measured pattern', async () => {
    addPattern({ id: 'learned', name: 'calculateTotal-empty', description: 'stored, never measured' });
    addRun('learned', 'unmeasured');

    const result = await injectorFor({
      'edge-case:calculateTotal-empty': { name: 'calculateTotal-empty', description: 'UNMEASURED MARKER', confidence: 0.9, successRate: 1 },
      'edge-case:other': { name: 'not-stored', description: 'NOT STORED MARKER', confidence: 0.9 },
      'edge-case:seed': { name: 'unit-test-generation', description: 'SEED NAME MARKER' },
    }).getInjectionContext(SOURCE);

    expect(result.promptContext).toBe('');
    expect(result.patternsUsed).toBe(0);
    expect(result.totalConsidered).toBe(3);
    expect(result.withoutEvidence).toBe(3);
  });

  it('injects the stored pattern\'s text, not the memory entry\'s text or tags', async () => {
    addPattern({ id: 'c', name: 'team-edge', description: 'Curated text from qe_patterns', confidence: 0.6, context: curated });

    const result = await injectorFor({
      'edge-case:x': { name: 'team-edge', description: 'INJECTED BY AN AGENT', confidence: 1, successRate: 1, tags: ['trusted'] },
    }).getInjectionContext(SOURCE);

    expect(result.patternsUsed).toBe(1);
    expect(result.promptContext).toContain('Curated text from qe_patterns');
    expect(result.promptContext).not.toContain('INJECTED BY AN AGENT');
    expect(result.promptContext).not.toContain('[trusted]');
    expect(result.promptContext).not.toContain('caught real bugs');
    expect(result.promptContext).toMatch(/^## Edge Cases from stored patterns \(curated by a person, or with a measured success\):/);
  });

  it('filters by the stored confidence, not the confidence the entry claims', async () => {
    addPattern({ id: 'low', name: 'low-confidence', description: 'Low stored confidence', confidence: 0.2, context: curated });
    const result = await injectorFor({ 'edge-case:low': { name: 'low-confidence', confidence: 0.99 } }, { minConfidence: 0.5 })
      .getInjectionContext(SOURCE);
    expect(result.patternsUsed).toBe(0);
    expect(result.withoutEvidence).toBe(0);
  });

  it('resolves an entry by patternId, id, name or the last segment of its key, in one lookup', async () => {
    for (const [id, name] of [['p1', 'by-pattern-id'], ['p2', 'by-id'], ['p3', 'by-name'], ['p4', 'by-key']]) {
      addPattern({ id, name, description: `${name} text`, context: curated });
    }
    const resolver = vi.fn(dbResolver);
    const injector = new EdgeCaseInjector(memoryWith({
      'edge-case:a': { patternId: 'p1', name: 'unknown' },
      'edge-case:b': { id: 'p2' },
      'edge-case:c': { name: 'by-name' },
      'edge-case:by-key': { description: 'only the key names it' },
    }), { topN: 10 }, resolver);

    const result = await injector.getInjectionContext(SOURCE);

    expect(result.patternsUsed).toBe(4);
    for (const name of ['by-pattern-id', 'by-id', 'by-name', 'by-key']) expect(result.promptContext).toContain(`${name} text`);
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it('injects a pattern once, however many entries name it', async () => {
    addPattern({ id: 'p', name: 'shared', description: 'Shared text', context: curated });
    const result = await injectorFor({ 'edge-case:1': { name: 'shared' }, 'pattern:2': { id: 'p' } }).getInjectionContext(SOURCE);
    expect(result.patternsUsed).toBe(1);
    expect(result.promptContext.match(/Shared text/g)).toHaveLength(1);
  });

  it('fails closed when the lookup throws, e.g. on an older database without qe_pattern_usage', async () => {
    db.exec('DROP TABLE qe_pattern_usage');
    addPattern({ id: 'c', name: 'team-edge', description: 'MARKER', context: curated });

    const result = await injectorFor({ 'edge-case:x': { name: 'team-edge' } }).getInjectionContext(SOURCE);

    expect(result.promptContext).toBe('');
    expect(result.withoutEvidence).toBe(1);
  });
});

describe('#1423 default resolver', () => {
  it('reads the already-open unified memory database', async () => {
    addPattern({ id: 'm', name: 'measured-edge', description: 'Measured through unified memory' });
    addRun('m', 'measured');

    const result = await new EdgeCaseInjector(memoryWith({
      'edge-case:x': { name: 'measured-edge', description: 'entry text' },
      'edge-case:y': { name: 'unmeasured', description: 'UNMEASURED MARKER' },
    })).getInjectionContext(SOURCE);

    expect(result.promptContext).toContain('Measured through unified memory');
    expect(result.promptContext).not.toContain('UNMEASURED MARKER');
    expect(result.withoutEvidence).toBe(1);
  });

  it('injects nothing, and creates no memory instance, when unified memory is not open', async () => {
    addPattern({ id: 'c', name: 'team-edge', description: 'MARKER', context: curated });
    holder.db = null;

    expect((await resolveFromUnifiedMemory(['team-edge'])).size).toBe(0);
    const result = await new EdgeCaseInjector(memoryWith({ 'edge-case:x': { name: 'team-edge' } })).getInjectionContext(SOURCE);

    expect(result.promptContext).toBe('');
    expect(holder.getUnifiedMemory).not.toHaveBeenCalled();
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
    addRun('m', 'measured');

    const prompt = await promptFor({ 'edge-case:calculateTotal': { name: 'empty-cart', description: 'entry text' } });

    expect(prompt).toContain('MEASURED-1423: an empty cart totals 0');
    expect(prompt).not.toContain('entry text');
  });
});
