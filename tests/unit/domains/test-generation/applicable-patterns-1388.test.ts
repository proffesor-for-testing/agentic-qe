/**
 * #1388: patterns learned from scaffold-only generation before #1387 stay in
 * users' memory.db (success_rate 1.0 from unmeasured "task completed" rows)
 * and were still applied: a Kotlin scaffold began `// Applied patterns:
 * generate-tests sourceFilessrccalckt…`. A learned pattern is applied to test
 * generation only once a measured successful usage exists. Nothing is written:
 * the rows stay as they are and the filter is read-only.
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

interface Row { id: string; name: string; description?: string; context?: unknown; quality?: number; domain?: string }
function addPattern({ id, name, description = 'curated', context = {}, quality = 0.5, domain = 'test-generation' }: Row): void {
  db.prepare(`INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description, quality_score, context_json)
              VALUES (?, 'test-template', ?, ?, ?, ?, ?, ?)`)
    .run(id, domain, domain, name, description, quality, JSON.stringify(context));
}
function addUsage(patternId: string, success: 0 | 1, metrics: unknown): void {
  db.prepare('INSERT INTO qe_pattern_usage (pattern_id, success, metrics_json) VALUES (?, ?, ?)')
    .run(patternId, success, metrics === null ? null : JSON.stringify(metrics));
}

const kotlinTask = 'generate-tests: {"sourceFiles":["src/Calc.kt"],"language":"kotlin","framework":"kotlin-junit"}';
/** The shape 3.15.18 stored after a scaffold-only MCP run. */
function addScaffoldLearned(id: string, task = kotlinTask, withOrigin = true): void {
  addPattern({
    id,
    name: `generate-tests ${id}`,
    description: `Pattern extracted from: ${task}`,
    quality: 0.654,
    context: withOrigin
      ? { tags: ['qe-test-generation', 'unit'], experienceOrigin: { task, domain: null, patternType: 'test-template' }, testType: 'unit' }
      : { tags: ['qe-test-generation', 'unit'], testType: 'unit' },
  });
  addUsage(id, 1, { outcome: 'unmeasured', outcomeBasis: 'task-completed', runId: `run-${id}-1` });
  addUsage(id, 1, { outcome: 'unmeasured', outcomeBasis: 'task-completed', runId: `run-${id}-2` });
}

const ids = (file: string, requested: string[] = []) => queryApplicablePatterns(db, file, requested).map((p) => p.id);

describe('#1388 learned patterns without a measured success are not applied', () => {
  it('skips a scaffold-learned pattern found by file extension', () => {
    addScaffoldLearned('scaffold-kt');
    expect(ids('/p/src/Calc.kt')).toEqual([]);
  });

  it('skips it when it is requested by id or by name (hook, QESONA and matcher ids)', () => {
    addScaffoldLearned('scaffold-kt');
    expect(ids('/p/src/Calc.kt', ['scaffold-kt', 'generate-tests scaffold-kt'])).toEqual([]);
  });

  it('skips a pre-3.14.7 learned pattern that has no experienceOrigin', () => {
    addScaffoldLearned('old-kt', kotlinTask, false);
    expect(ids('/p/src/Calc.kt', ['old-kt'])).toEqual([]);
  });

  it('skips a learned pattern whose only successes have no outcome tag', () => {
    addScaffoldLearned('null-metrics');
    addUsage('null-metrics', 1, null);
    addUsage('null-metrics', 1, { outcome: 'garbage' });
    expect(ids('/p/src/Calc.kt', ['null-metrics'])).toEqual([]);
  });

  it('skips a learned pattern whose measured usage failed', () => {
    addScaffoldLearned('measured-fail');
    addUsage('measured-fail', 0, { outcome: 'measured', outcomeBasis: 'test-results' });
    expect(ids('/p/src/Calc.kt', ['measured-fail'])).toEqual([]);
  });

  it('applies a learned pattern once a measured successful usage exists', () => {
    addScaffoldLearned('measured-ok');
    addUsage('measured-ok', 1, { outcome: 'measured', outcomeBasis: 'test-results' });
    expect(ids('/p/src/Calc.kt')).toEqual(['measured-ok']);
    expect(ids('/p/src/Calc.kt', ['measured-ok'])).toEqual(['measured-ok']);
  });

  it('still applies a curated seed requested by name', () => {
    addPattern({ id: 'seed-aaa', name: 'AAA Unit Test', description: 'Arrange-Act-Assert pattern', context: { testType: 'unit', tags: ['unit-test', 'aaa'] } });
    const applied = queryApplicablePatterns(db, '/p/src/Calc.kt', ['AAA Unit Test']);
    expect(applied).toEqual([{ id: 'seed-aaa', name: 'AAA Unit Test', structure: 'test-template', examples: 0, applicability: 0.5 }]);
  });

  it('still applies a curated pattern that names the file extension', () => {
    addPattern({ id: 'seed-kt', name: 'Kotlin seed', context: { tags: ['kotlin'], example: 'src/Calc.kt' } });
    expect(ids('/p/src/Calc.kt')).toEqual(['seed-kt']);
  });

  it('writes nothing', () => {
    addScaffoldLearned('scaffold-kt');
    const before = db.prepare('SELECT (SELECT COUNT(*) FROM qe_patterns) p, (SELECT COUNT(*) FROM qe_pattern_usage) u').get();
    ids('/p/src/Calc.kt', ['scaffold-kt']);
    expect(db.prepare('SELECT (SELECT COUNT(*) FROM qe_patterns) p, (SELECT COUNT(*) FROM qe_pattern_usage) u').get()).toEqual(before);
  });
});
