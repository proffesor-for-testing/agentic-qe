/**
 * #1388: the file-extension lookup matched `context_json LIKE '%ts%'`, so a
 * `.ts` request matched every learned pattern through the "generate-tests"
 * text in its origin task: Kotlin and Python patterns were applied to a
 * TypeScript file. A pattern now matches an extension only through a file
 * reference with that exact extension or through its declared language.
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

/** A learned pattern with a measured success, so only the extension decides. */
function addLearned(id: string, sourceFile: string): void {
  const task = `generate-tests: {"sourceFiles":["${sourceFile}"]}`;
  db.prepare(`INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description, quality_score, context_json)
              VALUES (?, 'test-template', 'test-generation', 'test-generation', ?, ?, 0.6, ?)`)
    .run(id, `generate-tests ${id}`, `Pattern extracted from: ${task}`,
      JSON.stringify({ tags: ['qe-test-generation'], experienceOrigin: { task, domain: null, patternType: 'test-template' } }));
  db.prepare(`INSERT INTO qe_pattern_usage (pattern_id, success, metrics_json) VALUES (?, 1, ?)`)
    .run(id, JSON.stringify({ outcome: 'measured', outcomeBasis: 'test-results' }));
}

/** A pattern imported by a person (`aqe learning import`). */
function addCurated(id: string, context: Record<string, unknown>): void {
  db.prepare(`INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description, quality_score, context_json)
              VALUES (?, 'test-template', 'test-generation', 'test-generation', ?, 'curated', 0.5, ?)`)
    .run(id, id, JSON.stringify({ ...context, curation: 'user-import' }));
}

const ids = (file: string) => queryApplicablePatterns(db, file, []).map((p) => p.id).sort();

describe('#1388 extension lookup matches the extension, not a substring', () => {
  beforeEach(() => {
    addLearned('kt', 'src/Calc.kt');
    addLearned('py', 'src/calc.py');
    addLearned('ts', 'src/add.ts');
    addLearned('tsx', 'src/App.tsx');
    addLearned('go', 'pkg/calc.go');
  });

  it.each([
    ['/p/src/other.ts', ['ts']],
    ['/p/src/Other.tsx', ['tsx']],
    ['/p/src/other.py', ['py']],
    ['/p/src/Other.kt', ['kt']],
    ['/p/pkg/other.go', ['go']],
  ])('a %s request matches only patterns for that extension', (file, expected) => {
    expect(ids(file)).toEqual(expected);
  });

  it('does not match a .ts request through "generate-tests" or other words', () => {
    addCurated('words', { tags: ['unit-tests', 'mocks', 'happy-path', 'category'], testType: 'unit' });
    expect(ids('/p/src/x.ts')).toEqual(['ts']);
    expect(ids('/p/src/x.py')).toEqual(['py']);
    expect(ids('/p/src/x.go')).toEqual(['go']);
  });

  it('applies at most the five best exact matches, by quality', () => {
    for (let i = 0; i < 7; i++) {
      db.prepare(`INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description, quality_score, context_json)
                  VALUES (?, 'test-template', 'test-generation', 'test-generation', ?, 'curated', ?, ?)`)
        .run(`go-${i}`, `go-${i}`, 0.1 * i, JSON.stringify({ tags: [], language: 'go', curation: 'user-import' }));
    }
    // Eight .go matches: 'go' and go-6 (0.6), go-5, go-4, go-3 are the best five.
    expect(ids('/p/pkg/x.go')).toEqual(['go', 'go-3', 'go-4', 'go-5', 'go-6']);
  });

  it('matches a pattern by its declared language', () => {
    addCurated('ts-lang', { tags: [], language: 'typescript' });
    addCurated('py-lang', { tags: [], language: 'python' });
    expect(ids('/p/src/x.ts')).toEqual(['ts', 'ts-lang']);
    expect(ids('/p/src/X.tsx')).toEqual(['ts-lang', 'tsx']);
    expect(ids('/p/src/x.py')).toEqual(['py', 'py-lang']);
    expect(ids('/p/src/X.kt')).toEqual(['kt']);
  });
});
