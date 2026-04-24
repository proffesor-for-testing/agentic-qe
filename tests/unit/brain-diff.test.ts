/**
 * Tests for the brain-diff module (issue #332, C-10).
 *
 * The diff compares two JSONL exports at manifest + record level, and two
 * RVF exports (or a mixed pair) at manifest level only.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

import { exportBrain } from '../../src/integrations/ruvector/brain-exporter.js';
import { diffBrains, summarizeDiff } from '../../src/integrations/ruvector/brain-diff.js';
import { ensureTargetTables } from '../../src/integrations/ruvector/brain-shared.js';

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  ensureTargetTables(db);
  return db;
}

function insertPattern(db: Database.Database, p: {
  id: string;
  pattern_type?: string;
  qe_domain?: string;
  name?: string;
  description?: string;
  confidence?: number;
  updated_at?: string;
}): void {
  db.prepare(`
    INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description, confidence, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    p.id,
    p.pattern_type ?? 'test-template',
    p.qe_domain ?? 'test-generation',
    p.qe_domain ?? 'test-generation',
    p.name ?? 'name-' + p.id,
    p.description ?? 'desc-' + p.id,
    p.confidence ?? 0.8,
    p.updated_at ?? '2026-02-20T10:00:00Z',
  );
}

function insertWitness(db: Database.Database, w: {
  prev_hash: string;
  action_hash: string;
  action_type: string;
  timestamp: string;
  actor: string;
}): void {
  db.prepare(`
    INSERT INTO witness_chain (prev_hash, action_hash, action_type, action_data, timestamp, actor)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(w.prev_hash, w.action_hash, w.action_type, null, w.timestamp, w.actor);
}

let workDir: string;

beforeEach(() => {
  workDir = join(tmpdir(), 'aqe-brain-diff-' + randomUUID());
  mkdirSync(workDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
});

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------

describe('brain diff — JSONL↔JSONL', () => {
  it('reports identical when two exports share the same data', () => {
    const db = createTestDb();
    insertPattern(db, { id: 'p1' });
    insertPattern(db, { id: 'p2' });

    const a = join(workDir, 'a');
    const b = join(workDir, 'b');
    exportBrain(db, { outputPath: a });
    exportBrain(db, { outputPath: b });
    db.close();

    const result = diffBrains(a, b);

    expect(result.identical).toBe(true);
    expect(result.checksumMatch).toBe(true);
    expect(result.versionMatch).toBe(true);
    expect(result.recordLevel).toBe(true);
    expect(summarizeDiff(result).tablesChanged).toBe(0);
  });

  it('detects added, removed, and changed records on a PK table', () => {
    const dbA = createTestDb();
    insertPattern(dbA, { id: 'kept', description: 'original' });
    insertPattern(dbA, { id: 'removed' });
    const a = join(workDir, 'a');
    exportBrain(dbA, { outputPath: a });
    dbA.close();

    const dbB = createTestDb();
    insertPattern(dbB, { id: 'kept', description: 'changed' }); // changed
    insertPattern(dbB, { id: 'added' });                         // added
    // 'removed' intentionally absent
    const b = join(workDir, 'b');
    exportBrain(dbB, { outputPath: b });
    dbB.close();

    const result = diffBrains(a, b);

    expect(result.identical).toBe(false);
    expect(result.checksumMatch).toBe(false);
    expect(result.recordLevel).toBe(true);

    const patternDiff = result.tableDiffs.find((t) => t.tableName === 'qe_patterns');
    expect(patternDiff).toBeDefined();
    expect(patternDiff?.countA).toBe(2);
    expect(patternDiff?.countB).toBe(2);
    expect(patternDiff?.added).toEqual(['added']);
    expect(patternDiff?.removed).toEqual(['removed']);
    expect(patternDiff?.changed).toEqual(['kept']);

    const summary = summarizeDiff(result);
    expect(summary.totalAdded).toBe(1);
    expect(summary.totalRemoved).toBe(1);
    expect(summary.totalChanged).toBe(1);
    expect(summary.recordCountDelta).toBe(0);
  });

  it('does not flag append-only rows as "changed" — only added/removed', () => {
    const dbA = createTestDb();
    insertWitness(dbA, {
      prev_hash: 'h0',
      action_hash: 'h1',
      action_type: 'test',
      timestamp: '2026-03-01T00:00:00Z',
      actor: 'agent-1',
    });
    const a = join(workDir, 'a');
    exportBrain(dbA, { outputPath: a });
    dbA.close();

    const dbB = createTestDb();
    // Same identity (action_hash + timestamp) but different actor — should be
    // treated as "same row" for witness_chain because dedup columns are the
    // identity.
    insertWitness(dbB, {
      prev_hash: 'h0',
      action_hash: 'h1',
      action_type: 'test',
      timestamp: '2026-03-01T00:00:00Z',
      actor: 'agent-2',
    });
    // And a truly new row
    insertWitness(dbB, {
      prev_hash: 'h1',
      action_hash: 'h2',
      action_type: 'test',
      timestamp: '2026-03-02T00:00:00Z',
      actor: 'agent-1',
    });
    const b = join(workDir, 'b');
    exportBrain(dbB, { outputPath: b });
    dbB.close();

    const result = diffBrains(a, b);

    const witnessDiff = result.tableDiffs.find((t) => t.tableName === 'witness_chain');
    expect(witnessDiff?.added?.length).toBe(1);
    expect(witnessDiff?.removed?.length ?? 0).toBe(0);
    expect(witnessDiff?.changed?.length ?? 0).toBe(0);
  });

  it('reports domains only present in one side', () => {
    const dbA = createTestDb();
    insertPattern(dbA, { id: 'p1', qe_domain: 'test-generation' });
    const a = join(workDir, 'a');
    exportBrain(dbA, { outputPath: a });
    dbA.close();

    const dbB = createTestDb();
    insertPattern(dbB, { id: 'p2', qe_domain: 'security-compliance' });
    const b = join(workDir, 'b');
    exportBrain(dbB, { outputPath: b });
    dbB.close();

    const result = diffBrains(a, b);

    expect(result.domainsOnlyInA).toContain('test-generation');
    expect(result.domainsOnlyInB).toContain('security-compliance');
  });

  it('honours the tableFilter option', () => {
    const dbA = createTestDb();
    insertPattern(dbA, { id: 'p1' });
    const a = join(workDir, 'a');
    exportBrain(dbA, { outputPath: a });
    dbA.close();

    const dbB = createTestDb();
    insertPattern(dbB, { id: 'p1' });
    insertPattern(dbB, { id: 'p2' });
    const b = join(workDir, 'b');
    exportBrain(dbB, { outputPath: b });
    dbB.close();

    const result = diffBrains(a, b, { tableFilter: 'qe_patterns' });

    expect(result.tableDiffs).toHaveLength(1);
    expect(result.tableDiffs[0]!.tableName).toBe('qe_patterns');
    expect(result.tableDiffs[0]!.added).toEqual(['p2']);
  });

  it('throws on an unknown tableFilter', () => {
    const dbA = createTestDb();
    const a = join(workDir, 'a');
    const b = join(workDir, 'b');
    exportBrain(dbA, { outputPath: a });
    exportBrain(dbA, { outputPath: b });
    dbA.close();

    expect(() => diffBrains(a, b, { tableFilter: 'does_not_exist' })).toThrow(
      /Unknown table/,
    );
  });
});

describe('brain diff — error paths', () => {
  it('throws when a path does not exist', () => {
    expect(() => diffBrains('/no/such/path', '/also/not')).toThrow(/not found/);
  });

  it('caps per-bucket IDs via maxIdsPerBucket', () => {
    const dbA = createTestDb();
    for (let i = 0; i < 20; i++) insertPattern(dbA, { id: 'a' + i });
    const a = join(workDir, 'a');
    exportBrain(dbA, { outputPath: a });
    dbA.close();

    const dbB = createTestDb();
    for (let i = 0; i < 20; i++) insertPattern(dbB, { id: 'b' + i });
    const b = join(workDir, 'b');
    exportBrain(dbB, { outputPath: b });
    dbB.close();

    const result = diffBrains(a, b, { maxIdsPerBucket: 5 });
    const patternDiff = result.tableDiffs.find((t) => t.tableName === 'qe_patterns')!;
    expect(patternDiff.added!.length).toBe(5);
    expect(patternDiff.removed!.length).toBe(5);
  });
});
