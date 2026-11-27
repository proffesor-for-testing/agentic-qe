/**
 * #1388 review: `aqe learning export` + `import` used to mark every imported
 * row as curated, so one backup/restore round trip re-enabled the scaffold
 * patterns #1388 stops applying. Export now writes a curation marker only for
 * a row that is applicable when exported (seed, curated or measured), import
 * keeps a valid incoming marker and marks nothing else, and `--curate` vouches
 * for every row of a file on purpose.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

const mocks = vi.hoisted(() => ({ initializeLearningSystem: vi.fn(), printJson: vi.fn(), getDbPath: vi.fn() }));
vi.mock('../../../../src/cli/commands/learning-helpers.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../../src/cli/commands/learning-helpers.js')>(),
  initializeLearningSystem: mocks.initializeLearningSystem,
  printJson: mocks.printJson,
  getDbPath: mocks.getDbPath,
}));

import { createLearningCommand } from '../../../../src/cli/commands/learning.js';
import { queryApplicablePatterns } from '../../../../src/domains/test-generation/services/applicable-patterns';

const dir = mkdtempSync(join(tmpdir(), 'aqe-1388-roundtrip-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const SCHEMA = `
  CREATE TABLE qe_patterns (
    id TEXT PRIMARY KEY, pattern_type TEXT NOT NULL, qe_domain TEXT NOT NULL, domain TEXT NOT NULL,
    name TEXT NOT NULL, description TEXT, usage_count INTEGER DEFAULT 0, quality_score REAL DEFAULT 0,
    context_json TEXT, template_json TEXT, tier TEXT DEFAULT 'short-term'
  );
  CREATE TABLE qe_pattern_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT, pattern_id TEXT NOT NULL, success INTEGER NOT NULL,
    metrics_json TEXT, feedback TEXT
  );`;

const task = 'generate-tests: {"sourceFiles":["src/Calc.kt"],"language":"kotlin"}';
const ROWS: Array<{ id: string; name: string; description: string; context: Record<string, unknown> }> = [
  { id: 'scaffold', name: 'generate-tests sourceFilessrcCalckt 5b78', description: `Pattern extracted from: ${task}`,
    context: { tags: ['qe-test-generation'], language: 'kotlin', experienceOrigin: { task, domain: null, patternType: 'test-template' } } },
  { id: 'consolidated', name: 'cli-hook-test-generation-2026-10', description: 'Auto-consolidated from 6 experiences.',
    context: { tags: ['cli-hook-post-edit'], language: 'kotlin', sourceType: 'session-consolidation' } },
  { id: 'forged', name: 'forged marker', description: 'automatic row with an invented marker',
    context: { tags: [], language: 'kotlin', curation: 'automatic' } },
  { id: 'seed', name: 'AAA Unit Test', description: 'Arrange-Act-Assert pattern', context: { tags: ['aaa'], language: 'kotlin' } },
  { id: 'curated', name: 'Team Kotlin template', description: 'team pattern', context: { tags: ['team'], language: 'kotlin', curation: 'user-import' } },
  { id: 'measured', name: 'generate-tests measured', description: `Pattern extracted from: ${task}`,
    context: { tags: ['qe-test-generation'], language: 'kotlin', experienceOrigin: { task, domain: null, patternType: 'test-template' } } },
];

function sourceDb(): string {
  const file = join(dir, `source-${Math.random().toString(36).slice(2)}.db`);
  const db = new Database(file);
  db.exec(SCHEMA);
  const insert = db.prepare(`INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description, context_json)
                             VALUES (?, 'test-template', 'test-generation', 'test-generation', ?, ?, ?)`);
  for (const row of ROWS) insert.run(row.id, row.name, row.description, JSON.stringify(row.context));
  const usage = db.prepare('INSERT INTO qe_pattern_usage (pattern_id, success, metrics_json) VALUES (?, 1, ?)');
  for (const row of ROWS) usage.run(row.id, JSON.stringify({ outcome: 'unmeasured', outcomeBasis: 'task-completed' }));
  usage.run('measured', JSON.stringify({ outcome: 'measured', outcomeBasis: 'test-results' }));
  db.close();
  return file;
}

/** A reasoning bank over a real SQLite file: searchPatterns reads it, storePattern upserts into it. */
function bankOver(file: string) {
  const db = new Database(file);
  return {
    db,
    bank: {
      searchPatterns: vi.fn(async () => ({
        success: true as const,
        value: (db.prepare('SELECT * FROM qe_patterns').all() as Array<Record<string, string>>).map((r) => ({
          pattern: {
            id: r.id, name: r.name, description: r.description, patternType: r.pattern_type, qeDomain: r.qe_domain,
            tier: r.tier, template: { type: 'code', content: 'x', variables: [] }, context: JSON.parse(r.context_json),
          },
        })),
      })),
      storePattern: vi.fn(async (o: { name: string; patternType: string; description: string; context?: unknown }) => {
        db.prepare(`INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description, context_json)
                    VALUES (?, ?, 'test-generation', 'test-generation', ?, ?, ?)`)
          .run(`imported-${o.name}`, o.patternType, o.name, o.description, JSON.stringify(o.context ?? {}));
        return { success: true as const, value: { id: `imported-${o.name}`, embedding: [0.1] } };
      }),
    },
  };
}

function freshDb(): ReturnType<typeof bankOver> {
  const file = join(dir, `target-${Math.random().toString(36).slice(2)}.db`);
  const db = new Database(file);
  db.exec(SCHEMA);
  db.close();
  return bankOver(file);
}

const run = (args: string[]) => createLearningCommand().exitOverride().parseAsync(['node', 'learning', ...args]);

async function roundTrip(exportCommand: string, importCommand: string, importFlags: string[] = []): Promise<string[]> {
  const source = sourceDb();
  mocks.getDbPath.mockReturnValue(source);
  const exported = bankOver(source);
  mocks.initializeLearningSystem.mockResolvedValue(exported.bank);
  const file = join(dir, `${exportCommand}-${Math.random().toString(36).slice(2)}.json`);
  await run([exportCommand, '-o', file]);
  exported.db.close();

  const target = freshDb();
  mocks.initializeLearningSystem.mockResolvedValue(target.bank);
  await run([importCommand, '-i', file, '--json', ...importFlags]);
  const applied = queryApplicablePatterns(target.db, '/p/src/Calc.kt', ROWS.map((r) => r.name))
    .map((p) => p.name).sort();
  target.db.close();
  return applied;
}

describe('#1388 export → import does not re-enable unproven patterns', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['export', 'import'],
    ['export', 'import-merge'],
    ['export-full', 'import'],
    ['export-full', 'import-merge'],
  ])('%s then %s applies only the seed, the curated and the measured pattern', async (exportCommand, importCommand) => {
    expect(await roundTrip(exportCommand, importCommand)).toEqual(['AAA Unit Test', 'Team Kotlin template', 'generate-tests measured']);
  });

  it('export writes a marker only for rows applicable at export time', async () => {
    const source = sourceDb();
    mocks.getDbPath.mockReturnValue(source);
    const exported = bankOver(source);
    mocks.initializeLearningSystem.mockResolvedValue(exported.bank);
    const file = join(dir, 'markers.json');
    await run(['export', '-o', file]);
    exported.db.close();

    const byName = Object.fromEntries((JSON.parse(readFileSync(file, 'utf8')).patterns as Array<{ name: string; context: Record<string, unknown> }>)
      .map((p) => [p.name, p.context.curation]));
    expect(byName).toEqual({
      'generate-tests sourceFilessrcCalckt 5b78': undefined,
      'cli-hook-test-generation-2026-10': undefined,
      'forged marker': undefined,
      'AAA Unit Test': 'user-import',
      'Team Kotlin template': 'user-import',
      'generate-tests measured': 'user-import',
    });
  });

  it('import --curate vouches for every row of the file', async () => {
    expect(await roundTrip('export', 'import', ['--curate'])).toEqual(ROWS.map((r) => r.name).sort());
  });

  it('import-merge --curate vouches for every row of the file', async () => {
    expect(await roundTrip('export-full', 'import-merge', ['--curate'])).toEqual(ROWS.map((r) => r.name).sort());
  });
});
