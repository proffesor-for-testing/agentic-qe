/**
 * Tests for the brain-search module (issue #332, C-09).
 *
 * Offline, filtered search over a JSONL brain export directory.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

import { exportBrain } from '../../src/integrations/ruvector/brain-exporter.js';
import { searchBrain } from '../../src/integrations/ruvector/brain-search.js';
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
    p.confidence ?? 0.5,
    p.updated_at ?? '2026-02-20T10:00:00Z',
  );
}

let workDir: string;
let exportPath: string;

beforeEach(() => {
  workDir = join(tmpdir(), 'aqe-brain-search-' + randomUUID());
  mkdirSync(workDir, { recursive: true });
  exportPath = join(workDir, 'export');
});

afterEach(() => {
  if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
});

function buildExport(build: (db: Database.Database) => void): string {
  const db = createTestDb();
  build(db);
  exportBrain(db, { outputPath: exportPath });
  db.close();
  return exportPath;
}

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------

describe('brain search — filters', () => {
  it('returns all qe_patterns when no filters are provided', () => {
    buildExport((db) => {
      insertPattern(db, { id: 'p1' });
      insertPattern(db, { id: 'p2' });
      insertPattern(db, { id: 'p3' });
    });

    const result = searchBrain(exportPath);

    expect(result.totalScanned).toBe(3);
    expect(result.totalMatched).toBe(3);
    expect(result.hits.map((h) => h.id).sort()).toEqual(['p1', 'p2', 'p3']);
  });

  it('filters by a single domain', () => {
    buildExport((db) => {
      insertPattern(db, { id: 'p1', qe_domain: 'test-generation' });
      insertPattern(db, { id: 'p2', qe_domain: 'security-compliance' });
      insertPattern(db, { id: 'p3', qe_domain: 'coverage-analysis' });
    });

    const result = searchBrain(exportPath, { domains: ['test-generation'] });

    expect(result.totalMatched).toBe(1);
    expect(result.hits[0]?.id).toBe('p1');
  });

  it('filters by multiple domains', () => {
    buildExport((db) => {
      insertPattern(db, { id: 'p1', qe_domain: 'test-generation' });
      insertPattern(db, { id: 'p2', qe_domain: 'security-compliance' });
      insertPattern(db, { id: 'p3', qe_domain: 'coverage-analysis' });
    });

    const result = searchBrain(exportPath, {
      domains: ['test-generation', 'coverage-analysis'],
    });

    expect(result.totalMatched).toBe(2);
    expect(result.hits.map((h) => h.id).sort()).toEqual(['p1', 'p3']);
  });

  it('filters by pattern_type', () => {
    buildExport((db) => {
      insertPattern(db, { id: 'p1', pattern_type: 'unit-test' });
      insertPattern(db, { id: 'p2', pattern_type: 'integration-test' });
      insertPattern(db, { id: 'p3', pattern_type: 'unit-test' });
    });

    const result = searchBrain(exportPath, { patternType: 'unit-test' });

    expect(result.totalMatched).toBe(2);
    expect(result.hits.map((h) => h.id).sort()).toEqual(['p1', 'p3']);
  });

  it('filters by date range (since + until)', () => {
    buildExport((db) => {
      insertPattern(db, { id: 'old', updated_at: '2026-01-01T00:00:00Z' });
      insertPattern(db, { id: 'mid', updated_at: '2026-02-15T00:00:00Z' });
      insertPattern(db, { id: 'new', updated_at: '2026-04-01T00:00:00Z' });
    });

    const result = searchBrain(exportPath, {
      since: '2026-02-01T00:00:00Z',
      until: '2026-03-01T00:00:00Z',
    });

    expect(result.totalMatched).toBe(1);
    expect(result.hits[0]?.id).toBe('mid');
  });

  it('matches query against name (case-insensitive)', () => {
    buildExport((db) => {
      insertPattern(db, { id: 'p1', name: 'OAuth2 flow' });
      insertPattern(db, { id: 'p2', name: 'JWT validation' });
      insertPattern(db, { id: 'p3', name: 'oauth helper' });
    });

    const result = searchBrain(exportPath, { query: 'OAUTH' });

    expect(result.totalMatched).toBe(2);
    expect(result.hits.map((h) => h.id).sort()).toEqual(['p1', 'p3']);
  });

  it('matches query against description', () => {
    buildExport((db) => {
      insertPattern(db, { id: 'p1', name: 'alpha', description: 'Checks CSRF tokens' });
      insertPattern(db, { id: 'p2', name: 'beta', description: 'Nothing special' });
    });

    const result = searchBrain(exportPath, { query: 'csrf' });

    expect(result.totalMatched).toBe(1);
    expect(result.hits[0]?.id).toBe('p1');
  });

  it('combines filters (AND semantics)', () => {
    buildExport((db) => {
      insertPattern(db, {
        id: 'p1',
        qe_domain: 'security-compliance',
        pattern_type: 'unit-test',
        name: 'OAuth2 check',
      });
      insertPattern(db, {
        id: 'p2',
        qe_domain: 'security-compliance',
        pattern_type: 'integration-test',
        name: 'OAuth2 flow',
      });
      insertPattern(db, {
        id: 'p3',
        qe_domain: 'test-generation',
        pattern_type: 'unit-test',
        name: 'OAuth2 helper',
      });
    });

    const result = searchBrain(exportPath, {
      domains: ['security-compliance'],
      patternType: 'unit-test',
      query: 'oauth',
    });

    expect(result.totalMatched).toBe(1);
    expect(result.hits[0]?.id).toBe('p1');
  });

  it('applies the limit but reports the true total match count', () => {
    buildExport((db) => {
      for (let i = 0; i < 10; i++) insertPattern(db, { id: 'p' + i });
    });

    const result = searchBrain(exportPath, { limit: 3 });

    expect(result.totalMatched).toBe(10);
    expect(result.hits.length).toBe(3);
    expect(result.truncated).toBe(true);
  });

  it('populates display fields for CLI rendering', () => {
    buildExport((db) => {
      insertPattern(db, {
        id: 'p1',
        name: 'n',
        description: 'd',
        confidence: 0.77,
        pattern_type: 'unit-test',
        qe_domain: 'test-generation',
        updated_at: '2026-02-20T10:00:00Z',
      });
    });

    const result = searchBrain(exportPath);

    const hit = result.hits[0];
    expect(hit).toBeDefined();
    expect(hit!.display.name).toBe('n');
    expect(hit!.display.description).toBe('d');
    expect(hit!.display.confidence).toBeCloseTo(0.77);
    expect(hit!.display.patternType).toBe('unit-test');
    expect(hit!.display.domain).toBe('test-generation');
    expect(hit!.display.updatedAt).toBe('2026-02-20T10:00:00Z');
  });

  it('supports searching a non-default table', () => {
    buildExport((db) => {
      db.prepare(`
        INSERT INTO rl_q_values (id, algorithm, agent_id, state_key, action_key, q_value, visits, domain, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('qv1', 'sarsa', 'agent-1', 's', 'a', 0.5, 10, 'test-generation', '2026-02-20T00:00:00Z');
    });

    const result = searchBrain(exportPath, { table: 'rl_q_values' });

    expect(result.table).toBe('rl_q_values');
    expect(result.totalMatched).toBe(1);
    expect(result.hits[0]?.id).toBe('qv1');
  });
});

describe('brain search — error paths', () => {
  it('throws when the path does not exist', () => {
    expect(() => searchBrain('/no/such/path')).toThrow(/Path not found/);
  });

  it('throws when pointed at a .rvf file', () => {
    const rvfPath = join(workDir, 'brain.rvf');
    writeFileSync(rvfPath, 'pretend-rvf');
    expect(() => searchBrain(rvfPath)).toThrow(/does not support RVF/);
  });

  it('throws for an unknown table', () => {
    buildExport((db) => {
      insertPattern(db, { id: 'p1' });
    });

    expect(() => searchBrain(exportPath, { table: 'nope' })).toThrow(/Unknown table/);
  });

  it('throws when the directory has no manifest', () => {
    const fakeDir = join(workDir, 'not-a-brain');
    mkdirSync(fakeDir, { recursive: true });

    expect(() => searchBrain(fakeDir)).toThrow(/Manifest not found/);
  });
});
