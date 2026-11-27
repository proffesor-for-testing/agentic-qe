/**
 * #1388 review: the pattern upsert replaced context_json wholesale, so a later
 * automatic store with the same name/domain/type (or id) wiped the curation
 * marker of a pattern a person imported or stored. An existing marker now
 * survives an upsert whose incoming context has none, but only while the
 * template is unchanged: changed content must earn its trust again.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SQLitePatternStore } from '../../../src/learning/sqlite-persistence.js';
import type { QEPattern } from '../../../src/learning/qe-patterns.js';

let tmpDir: string;
let store: SQLitePatternStore;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1388-upsert-'));
  store = new SQLitePatternStore({ useUnified: false, dbPath: path.join(tmpDir, 'patterns.db') });
  await store.initialize();
});
afterEach(() => {
  try { store.close(); } catch { /* ignore */ }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function pattern(id: string, context: Record<string, unknown>, content = 'x'): QEPattern {
  return {
    id, patternType: 'test-template', qeDomain: 'test-generation', domain: 'test-generation',
    name: 'Team Kotlin template', description: 'd', confidence: 0.5, usageCount: 0, successRate: 0,
    qualityScore: 0, tier: 'short-term', template: { type: 'code', content, variables: [] },
    context: context as unknown as QEPattern['context'], createdAt: new Date(), lastUsedAt: new Date(), successfulUses: 0,
  } as QEPattern;
}

function contextOf(): Record<string, unknown> {
  const row = store.getDatabase()!.prepare(`SELECT context_json, description FROM qe_patterns WHERE name = 'Team Kotlin template'`).get() as { context_json: string };
  return JSON.parse(row.context_json);
}

describe('#1388 an upsert keeps an existing curation marker only for unchanged content', () => {
  it('keeps it when a later store with the same name/domain/type has none', () => {
    store.storePattern(pattern('a', { tags: ['team'], curation: 'user-import' }));
    store.storePattern(pattern('b', { tags: ['automatic'] }));

    expect(contextOf()).toEqual({ tags: ['automatic'], curation: 'user-import' });
  });

  it('keeps it when a later store with the same id has none', () => {
    store.storePattern(pattern('a', { tags: ['team'], curation: 'user-store' }));
    store.storePattern(pattern('a', { tags: ['automatic'] }));

    expect(contextOf()).toEqual({ tags: ['automatic'], curation: 'user-store' });
  });

  it('drops it when a later store with the same name/domain/type changes the template', () => {
    store.storePattern(pattern('a', { tags: ['team'], curation: 'user-import' }, 'team template'));
    store.storePattern(pattern('b', { tags: ['automatic'] }, 'automatic rewrite'));

    expect(contextOf()).toEqual({ tags: ['automatic'] });
  });

  it('drops it when a later store with the same id changes the template', () => {
    store.storePattern(pattern('a', { tags: ['team'], curation: 'user-store' }, 'team template'));
    store.storePattern(pattern('a', { tags: ['automatic'] }, 'automatic rewrite'));

    expect(contextOf()).toEqual({ tags: ['automatic'] });
  });

  it('takes the incoming marker when the later store has one', () => {
    store.storePattern(pattern('a', { tags: ['team'], curation: 'user-store' }));
    store.storePattern(pattern('b', { tags: ['team'], curation: 'user-import' }));

    expect(contextOf()).toEqual({ tags: ['team'], curation: 'user-import' });
  });

  it('adds no marker to a row that had none', () => {
    store.storePattern(pattern('a', { tags: ['automatic'] }));
    store.storePattern(pattern('b', { tags: ['automatic', 'again'] }));

    expect(contextOf()).toEqual({ tags: ['automatic', 'again'] });
  });
});
