/**
 * #1388: documented edges of the test-generation pattern allowlist.
 *
 *   - The seed check is by name: any row named like a built-in seed (or its
 *     `(from <domain>)` transfer) is applied, whoever wrote it.
 *   - `aqe brain import` copies context_json as is: a shared pattern without a
 *     curation marker stays unused, and a marker in the file is trusted,
 *     because importing that file is the person's choice.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { insertPattern } from '../../../../src/integrations/ruvector/brain-shared';
import { queryApplicablePatterns } from '../../../../src/domains/test-generation/services/applicable-patterns';

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE qe_patterns (
      id TEXT PRIMARY KEY, pattern_type TEXT NOT NULL, qe_domain TEXT NOT NULL, domain TEXT NOT NULL,
      name TEXT NOT NULL, description TEXT, confidence REAL DEFAULT 0.5, usage_count INTEGER DEFAULT 0,
      success_rate REAL DEFAULT 0.0, quality_score REAL DEFAULT 0.0, tier TEXT DEFAULT 'short-term',
      template_json TEXT, context_json TEXT, created_at TEXT, updated_at TEXT, last_used_at TEXT,
      successful_uses INTEGER DEFAULT 0, tokens_used INTEGER, input_tokens INTEGER, output_tokens INTEGER,
      latency_ms REAL, reusable INTEGER DEFAULT 0, reuse_count INTEGER DEFAULT 0,
      average_token_savings REAL DEFAULT 0, total_tokens_saved INTEGER
    );
    CREATE TABLE qe_pattern_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT, pattern_id TEXT NOT NULL, success INTEGER NOT NULL,
      metrics_json TEXT, feedback TEXT
    );
  `);
});
afterEach(() => db.close());

const shared = (id: string, name: string, context: Record<string, unknown>) => insertPattern(db, {
  id, pattern_type: 'test-template', qe_domain: 'test-generation', domain: 'test-generation', name,
  description: 'shared through aqe brain import', context_json: JSON.stringify(context),
});
const ids = (requested: string[]) => queryApplicablePatterns(db, '/p/src/Calc.kt', requested).map((p) => p.id).sort();

describe('#1388 allowlist edges', () => {
  it('the seed check is by name: a row named like a seed is applied whoever wrote it', () => {
    shared('named-like-seed', 'AAA Unit Test', { tags: ['automatic'] });
    shared('named-like-transfer', 'Dependency Mock (from test-generation)', { tags: ['automatic'] });
    expect(ids(['named-like-seed', 'named-like-transfer'])).toEqual(['named-like-seed', 'named-like-transfer']);
  });

  it('aqe brain import: an unmarked shared pattern stays unused, a marked one is trusted', () => {
    shared('unmarked', 'team pattern a', { tags: ['kotlin'], language: 'kotlin' });
    shared('marked', 'team pattern b', { tags: ['kotlin'], language: 'kotlin', curation: 'user-import' });
    expect(ids([])).toEqual(['marked']);
    expect(ids(['unmarked', 'marked'])).toEqual(['marked']);
  });
});
