/**
 * #1388: patterns learned from scaffold-only generation before #1387 stay in
 * users' memory.db (success_rate 1.0 from unmeasured "task completed" rows)
 * and were still applied: a Kotlin scaffold began `// Applied patterns:
 * generate-tests sourceFilessrccalckt…`. Test generation now applies a pattern
 * only when it is a built-in seed (or its cross-domain transfer), a pattern a
 * person imported, or a pattern with a measured successful usage. Every
 * automatic writer's pattern is unproven until measured. Nothing is written.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { queryApplicablePatterns } from '../../../../src/domains/test-generation/services/applicable-patterns';

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE qe_patterns (
      id TEXT PRIMARY KEY, pattern_type TEXT NOT NULL, qe_domain TEXT NOT NULL, domain TEXT NOT NULL,
      name TEXT NOT NULL, description TEXT, usage_count INTEGER DEFAULT 0, quality_score REAL DEFAULT 0,
      context_json TEXT
    );
    CREATE TABLE qe_pattern_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT, pattern_id TEXT NOT NULL, success INTEGER NOT NULL,
      metrics_json TEXT, feedback TEXT
    );
  `);
});
afterEach(() => db.close());

interface Row { id: string; name: string; type?: string; description?: string; context?: unknown; quality?: number; domain?: string }
function addPattern({ id, name, type = 'test-template', description = '', context = {}, quality = 0.5, domain = 'test-generation' }: Row): void {
  db.prepare(`INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description, quality_score, context_json)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, type, domain, domain, name, description, quality, JSON.stringify(context));
}
function addUsage(patternId: string, success: 0 | 1, metrics: unknown): void {
  db.prepare('INSERT INTO qe_pattern_usage (pattern_id, success, metrics_json) VALUES (?, ?, ?)')
    .run(patternId, success, metrics === null ? null : JSON.stringify(metrics));
}
const unmeasuredSuccess = (id: string) => addUsage(id, 1, { outcome: 'unmeasured', outcomeBasis: 'task-completed' });

const kotlinTask = 'generate-tests: {"sourceFiles":["src/Calc.kt"],"language":"kotlin","framework":"kotlin-junit"}';

/** One row per automatic writer, in the shape it stores today (all mention Calc.kt). */
const AUTOMATIC_WRITERS: Array<[string, Row]> = [
  ['experience capture (3.15.18 scaffold run)', {
    id: 'experience', name: 'generate-tests sourceFilessrcCalckt 5b78', description: `Pattern extracted from: ${kotlinTask}`,
    context: { tags: ['qe-test-generation', 'unit'], experienceOrigin: { task: kotlinTask, domain: null, patternType: 'test-template' }, testType: 'unit' },
  }],
  ['experience capture before v3.14.7 (no experienceOrigin)', {
    id: 'experience-old', name: 'generate-tests old', description: `Pattern extracted from: ${kotlinTask}`,
    context: { tags: ['qe-test-generation', 'src/Calc.kt'] },
  }],
  ['session consolidation', {
    id: 'consolidation', name: 'cli-hook-test-generation-2026-10', type: 'workflow',
    description: 'Auto-consolidated from 6 experiences. Agent: cli-hook, success rate: 100%',
    context: { tags: ['cli-hook-post-edit', 'src/Calc.kt'], sourceType: 'session-consolidation', extractedAt: '2026-10-09T17:54:33.262Z' },
  }],
  ['PostTestGeneration hook template', {
    id: 'post-test-generation', name: 'Generated tests for Calc.kt',
    description: 'Test template extracted from successful test generation for src/Calc.kt',
    context: { framework: 'kotlin-junit', language: 'kotlin', testType: 'unit', tags: ['generated', 'test-template', 'kotlin-junit', 'kotlin'] },
  }],
  ['task-completed extraction', {
    id: 'task-completed', name: 'test-generation-test-template-ab12cd',
    description: 'Auto-extracted test-template pattern from test-generation domain',
    context: { tags: ['test-generation', 'test-template', 'src/Calc.kt'] },
  }],
  ['dream insight', {
    id: 'dream', name: 'Dream Insight: novel_association',
    description: 'Calc.kt tests cluster with arithmetic helpers (confidence: 0.81)',
    context: { tags: ['dream-generated', 'novel_association', 'src/Calc.kt'], complexity: 'medium' },
  }],
  ['ReasoningBankService task pattern', {
    id: 'service-task', name: 'generate-tests-test-generation',
    description: 'Generate tests for src/Calc.kt', context: { tags: ['generate-tests', 'test-generation', 'kotlin'] },
  }],
];

const ids = (file: string, requested: string[] = []) => queryApplicablePatterns(db, file, requested).map((p) => p.id);

describe('#1388 automatic writers\' patterns are not applied without a measured success', () => {
  it.each(AUTOMATIC_WRITERS)('%s: not applied by the extension or the id path', (_writer, row) => {
    // language makes every row an extension match, so only the filter decides.
    addPattern({ ...row, context: { ...(row.context as object), language: 'kotlin' } });
    unmeasuredSuccess(row.id);
    unmeasuredSuccess(row.id);
    addUsage(row.id, 1, null);

    expect(ids('/p/src/Calc.kt')).toEqual([]);
    expect(ids('/p/src/Calc.kt', [row.id, row.name])).toEqual([]);
  });

  it.each(AUTOMATIC_WRITERS)('%s: applied once a measured successful usage exists', (_writer, row) => {
    addPattern({ ...row, context: { ...(row.context as object), language: 'kotlin' } });
    addUsage(row.id, 1, { outcome: 'measured', outcomeBasis: 'test-results' });

    expect(ids('/p/src/Calc.kt')).toEqual([row.id]);
    expect(ids('/p/src/Calc.kt', [row.id])).toEqual([row.id]);
  });

  it('a failed measured usage does not enable a pattern', () => {
    const [, row] = AUTOMATIC_WRITERS[0];
    addPattern(row);
    addUsage(row.id, 0, { outcome: 'measured', outcomeBasis: 'test-results' });
    expect(ids('/p/src/Calc.kt', [row.id])).toEqual([]);
  });

  it('an invented curation value does not enable a pattern', () => {
    const [, row] = AUTOMATIC_WRITERS[0];
    addPattern({ ...row, context: { ...(row.context as object), curation: 'automatic' } });
    expect(ids('/p/src/Calc.kt', [row.id])).toEqual([]);
  });
});

describe('#1388 seeds and curated patterns still apply', () => {
  it('applies a built-in seed requested by name, with usage but no measured success', () => {
    addPattern({ id: 'seed-aaa', name: 'AAA Unit Test', description: 'Arrange-Act-Assert pattern', context: { testType: 'unit', tags: ['unit-test', 'aaa'] } });
    unmeasuredSuccess('seed-aaa');
    expect(queryApplicablePatterns(db, '/p/src/Calc.kt', ['AAA Unit Test'])).toEqual([
      { id: 'seed-aaa', name: 'AAA Unit Test', structure: 'test-template', examples: 0, applicability: 0.5 },
    ]);
  });

  it('applies a ReasoningBankService seed and a seed\'s cross-domain transfer', () => {
    addPattern({ id: 'svc-seed', name: 'unit-test-generation', context: { tags: ['unit'] } });
    addPattern({ id: 'transfer', name: 'AAA Unit Test (from test-generation)', domain: 'test-execution',
      context: { tags: ['cross-domain-transfer', 'source:test-generation'] } });
    expect(ids('/p/src/Calc.kt', ['unit-test-generation', 'transfer'])).toEqual(['svc-seed', 'transfer']);
  });

  it('does not treat a learned pattern\'s transfer as a seed', () => {
    addPattern({ id: 'learned-transfer', name: 'generate-tests sourceFilessrcCalckt (from test-generation)', domain: 'test-execution',
      context: { tags: ['cross-domain-transfer'] } });
    expect(ids('/p/src/Calc.kt', ['learned-transfer'])).toEqual([]);
  });

  it('applies a pattern a person imported, by extension and by id', () => {
    addPattern({ id: 'imported', name: 'Team Kotlin template', description: `Pattern extracted from: ${kotlinTask}`,
      context: { tags: ['kotlin'], language: 'kotlin', curation: 'user-import' } });
    unmeasuredSuccess('imported');
    expect(ids('/p/src/Calc.kt')).toEqual(['imported']);
    expect(ids('/p/src/Calc.kt', ['Team Kotlin template'])).toEqual(['imported']);
  });

  it('writes nothing', () => {
    for (const [, row] of AUTOMATIC_WRITERS) { addPattern(row); unmeasuredSuccess(row.id); }
    const count = () => db.prepare('SELECT (SELECT COUNT(*) FROM qe_patterns) p, (SELECT COUNT(*) FROM qe_pattern_usage) u').get();
    const before = count();
    ids('/p/src/Calc.kt', AUTOMATIC_WRITERS.map(([, row]) => row.id));
    expect(count()).toEqual(before);
  });
});
