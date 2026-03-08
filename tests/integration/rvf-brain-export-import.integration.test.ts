/**
 * RVF Brain Export/Import Integration Tests
 *
 * Tests the full brain export → RVF file → import round-trip using real
 * SQLite databases and real .rvf files on disk. No mocks.
 *
 * Skips gracefully when @ruvector/rvf-node is not installed.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, unlinkSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

import {
  isRvfNativeAvailable,
  createRvfStore,
} from '../../src/integrations/ruvector/rvf-native-adapter.js';
import {
  exportBrainToRvf,
  importBrainFromRvf,
  brainInfoFromRvf,
} from '../../src/integrations/ruvector/brain-rvf-exporter.js';
import { ensureAllBrainTables, ALL_BRAIN_TABLE_NAMES } from '../../src/integrations/ruvector/brain-table-ddl.js';

// ============================================================================
// Skip entire suite if native binding is unavailable
// ============================================================================

const NATIVE_AVAILABLE = isRvfNativeAvailable();

// Cleanup tracking
const tmpFiles: string[] = [];

function tmpRvfPath(label: string): string {
  const p = join(tmpdir(), `rvf-brain-test-${label}-${Date.now()}-${randomUUID().slice(0, 8)}.rvf`);
  tmpFiles.push(p);
  return p;
}

afterAll(() => {
  for (const p of tmpFiles) {
    try { if (existsSync(p)) unlinkSync(p); } catch { /* best effort */ }
    try { if (existsSync(`${p}.idmap.json`)) unlinkSync(`${p}.idmap.json`); } catch { /* best effort */ }
    try { if (existsSync(`${p}.manifest.json`)) unlinkSync(`${p}.manifest.json`); } catch { /* best effort */ }
  }
});

// ============================================================================
// Helpers: seed a DB with representative data
// ============================================================================

function createSeededDb(): Database.Database {
  const db = new Database(':memory:');
  ensureAllBrainTables(db);

  // Seed qe_patterns (2 rows)
  db.prepare(`INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description, confidence, usage_count, success_rate, quality_score, tier)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'pat-1', 'test-gen', 'test-generation', 'test-generation', 'JWT Auth Pattern',
    'Generates JWT auth tests', 0.85, 10, 0.9, 0.88, 'long-term',
  );
  db.prepare(`INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description, confidence, usage_count, success_rate, quality_score, tier)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'pat-2', 'security', 'security-testing', 'security-testing', 'XSS Detection',
    'Detects XSS vectors', 0.92, 5, 0.95, 0.91, 'long-term',
  );

  // Seed rl_q_values (1 row)
  db.prepare(`INSERT INTO rl_q_values (id, algorithm, agent_id, state_key, action_key, q_value, visits, domain)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'qv-1', 'sarsa', 'agent-1', 'state:auth', 'action:gen-test', 0.75, 12, 'test-generation',
  );

  // Seed dream_cycles + dream_insights (FK order)
  db.prepare(`INSERT INTO dream_cycles (id, start_time, end_time, duration_ms, concepts_processed, insights_generated, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    'dc-1', '2026-03-01T00:00:00Z', '2026-03-01T00:01:00Z', 60000, 5, 2, 'completed',
  );
  db.prepare(`INSERT INTO dream_insights (id, cycle_id, insight_type, source_concepts, description, novelty_score, confidence_score)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    'di-1', 'dc-1', 'association', '["jwt","refresh"]', 'JWT + refresh token test synergy', 0.7, 0.8,
  );

  // Seed witness_chain (1 row)
  db.prepare(`INSERT INTO witness_chain (prev_hash, action_hash, action_type, action_data, timestamp, actor)
    VALUES (?, ?, ?, ?, ?, ?)`).run(
    '0'.repeat(64), 'abc123'.padEnd(64, '0'), 'PATTERN_CREATE',
    JSON.stringify({ patternId: 'pat-1' }), '2026-03-01T00:00:00Z', 'test-actor',
  );

  // Seed captured_experiences (1 row with embedding)
  const embDim = 8;
  const embedding = new Float32Array(embDim);
  for (let i = 0; i < embDim; i++) embedding[i] = (i + 1) / embDim;
  db.prepare(`INSERT INTO captured_experiences (id, task, agent, domain, success, quality, duration_ms, started_at, completed_at, embedding, embedding_dimension)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'exp-1', 'Generate auth tests', 'agent-alpha', 'test-generation', 1, 0.88, 1500,
    '2026-03-01T10:00:00Z', '2026-03-01T10:00:01Z',
    Buffer.from(embedding.buffer), embDim,
  );

  // Seed goap_actions (1 row)
  db.prepare(`INSERT INTO goap_actions (id, name, description, agent_type, preconditions, effects, cost, category, qe_domain)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'ga-1', 'generate-unit-tests', 'Generate unit tests for a module',
    'coder', '{"hasSource":true}', '{"testsGenerated":true}', 1.5,
    'test-generation', 'test-generation',
  );

  // Seed sona_patterns (1 row with state_embedding)
  const sonaEmb = new Float32Array(embDim);
  for (let i = 0; i < embDim; i++) sonaEmb[i] = Math.sin(i);
  db.prepare(`INSERT INTO sona_patterns (id, type, domain, state_embedding, action_type, action_value, outcome_reward, outcome_success, outcome_quality, confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'sona-1', 'state-action', 'test-generation', Buffer.from(sonaEmb.buffer),
    'route', 'tier-2', 0.8, 1, 0.85, 0.9,
  );

  return db;
}

function countTable(db: Database.Database, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get() as { cnt: number };
  return row.cnt;
}

// ============================================================================
// Test suite
// ============================================================================

describe.skipIf(!NATIVE_AVAILABLE)('RVF Brain Export/Import Integration', () => {
  let sourceDb: Database.Database;

  beforeEach(() => {
    sourceDb = createSeededDb();
  });

  afterEach(() => {
    sourceDb.close();
  });

  // --------------------------------------------------------------------------
  // 1. Export creates a valid .rvf file with correct manifest
  // --------------------------------------------------------------------------

  it('exportBrainToRvf creates a .rvf file and returns accurate manifest', () => {
    const rvfPath = tmpRvfPath('export-basic');

    const manifest = exportBrainToRvf(sourceDb, {
      outputPath: rvfPath,
      dimension: 8,
    });

    // File exists on disk
    expect(existsSync(rvfPath)).toBe(true);
    expect(statSync(rvfPath).size).toBeGreaterThan(0);

    // Manifest fields
    expect(manifest.version).toBe('3.0');
    expect(manifest.format).toBe('rvf');
    expect(manifest.stats.patternCount).toBe(2);
    expect(manifest.stats.qValueCount).toBe(1);
    expect(manifest.stats.dreamInsightCount).toBe(1);
    expect(manifest.stats.witnessChainLength).toBe(1);
    expect(manifest.stats.totalRecords).toBeGreaterThanOrEqual(8); // at least our 8 seeded rows
    expect(manifest.domains).toContain('test-generation');
    expect(manifest.domains).toContain('security-testing');
    expect(manifest.checksum).toHaveLength(64); // SHA-256 hex

    // Sidecar manifest JSON written alongside .rvf
    const manifestPath = `${rvfPath}.manifest.json`;
    expect(existsSync(manifestPath)).toBe(true);
    const sidecarManifest = JSON.parse(require('fs').readFileSync(manifestPath, 'utf-8'));
    expect(sidecarManifest.version).toBe('3.0');
    expect(sidecarManifest.checksum).toBe(manifest.checksum);

    // RVF status should have vectors from embeddings
    expect(manifest.rvfStatus.fileSizeBytes).toBeGreaterThan(0);
    expect(manifest.rvfStatus.totalSegments).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // 2. brainInfoFromRvf reads manifest from .rvf without importing
  // --------------------------------------------------------------------------

  it('brainInfoFromRvf reads stats from an exported .rvf file', () => {
    const rvfPath = tmpRvfPath('info');

    exportBrainToRvf(sourceDb, { outputPath: rvfPath, dimension: 8 });

    const info = brainInfoFromRvf(rvfPath);

    expect(info.version).toBe('3.0');
    expect(info.format).toBe('rvf');
    expect(info.stats.patternCount).toBe(2);
    expect(info.stats.qValueCount).toBe(1);
    expect(info.stats.dreamInsightCount).toBe(1);
    expect(info.stats.witnessChainLength).toBe(1);
    expect(info.checksum).toHaveLength(64);
  });

  // --------------------------------------------------------------------------
  // 3. Full round-trip: export → import into empty DB
  // --------------------------------------------------------------------------

  it('round-trip: export from source, import into empty target — all rows arrive', () => {
    const rvfPath = tmpRvfPath('round-trip');

    // Export
    const manifest = exportBrainToRvf(sourceDb, { outputPath: rvfPath, dimension: 8 });

    // Import into a fresh empty DB
    const targetDb = new Database(':memory:');
    ensureAllBrainTables(targetDb);

    const result = importBrainFromRvf(targetDb, rvfPath, { mergeStrategy: 'skip-conflicts' });

    // Imported count should match totalRecords from manifest
    expect(result.imported).toBe(manifest.stats.totalRecords);
    expect(result.skipped).toBe(0);
    expect(result.conflicts).toBe(0);

    // Verify specific table counts match source
    expect(countTable(targetDb, 'qe_patterns')).toBe(2);
    expect(countTable(targetDb, 'rl_q_values')).toBe(1);
    expect(countTable(targetDb, 'dream_cycles')).toBe(1);
    expect(countTable(targetDb, 'dream_insights')).toBe(1);
    expect(countTable(targetDb, 'witness_chain')).toBe(1);
    expect(countTable(targetDb, 'captured_experiences')).toBe(1);
    expect(countTable(targetDb, 'goap_actions')).toBe(1);
    expect(countTable(targetDb, 'sona_patterns')).toBe(1);

    // Verify data integrity: check a pattern row
    const pat = targetDb.prepare('SELECT * FROM qe_patterns WHERE id = ?').get('pat-1') as Record<string, unknown>;
    expect(pat.name).toBe('JWT Auth Pattern');
    expect(pat.confidence).toBe(0.85);
    expect(pat.qe_domain).toBe('test-generation');

    // Verify Q-value row
    const qv = targetDb.prepare('SELECT * FROM rl_q_values WHERE id = ?').get('qv-1') as Record<string, unknown>;
    expect(qv.q_value).toBe(0.75);
    expect(qv.visits).toBe(12);

    // Verify dream insight
    const di = targetDb.prepare('SELECT * FROM dream_insights WHERE id = ?').get('di-1') as Record<string, unknown>;
    expect(di.insight_type).toBe('association');
    expect(di.confidence_score).toBe(0.8);

    targetDb.close();
  });

  // --------------------------------------------------------------------------
  // 4. Domain-filtered export only includes matching rows
  // --------------------------------------------------------------------------

  it('domain-filtered export includes only matching patterns and experiences', () => {
    const rvfPath = tmpRvfPath('domain-filter');

    const manifest = exportBrainToRvf(sourceDb, {
      outputPath: rvfPath,
      dimension: 8,
      domains: ['security-testing'],
    });

    // Only the security pattern should be in domains
    expect(manifest.domains).toContain('security-testing');

    // Import and verify only security pattern came through
    const targetDb = new Database(':memory:');
    ensureAllBrainTables(targetDb);

    importBrainFromRvf(targetDb, rvfPath, { mergeStrategy: 'skip-conflicts' });

    // Only pat-2 (security-testing) should be present
    expect(countTable(targetDb, 'qe_patterns')).toBe(1);
    const pat = targetDb.prepare('SELECT * FROM qe_patterns WHERE id = ?').get('pat-2') as Record<string, unknown>;
    expect(pat.name).toBe('XSS Detection');

    targetDb.close();
  });

  // --------------------------------------------------------------------------
  // 5. Import with merge strategy handles conflicts correctly
  // --------------------------------------------------------------------------

  it('importing the same RVF twice with skip-conflicts deduplicates', () => {
    const rvfPath = tmpRvfPath('dedup');

    exportBrainToRvf(sourceDb, { outputPath: rvfPath, dimension: 8 });

    const targetDb = new Database(':memory:');
    ensureAllBrainTables(targetDb);

    // First import
    const first = importBrainFromRvf(targetDb, rvfPath, { mergeStrategy: 'skip-conflicts' });
    expect(first.imported).toBeGreaterThan(0);
    expect(first.conflicts).toBe(0);

    // Second import — same data, should all be conflicts/skipped
    const second = importBrainFromRvf(targetDb, rvfPath, { mergeStrategy: 'skip-conflicts' });
    expect(second.imported).toBe(0);
    expect(second.skipped).toBeGreaterThan(0);

    // Table counts should be unchanged after second import
    expect(countTable(targetDb, 'qe_patterns')).toBe(2);
    expect(countTable(targetDb, 'rl_q_values')).toBe(1);

    targetDb.close();
  });

  // --------------------------------------------------------------------------
  // 6. Import with latest-wins replaces older rows
  // --------------------------------------------------------------------------

  it('latest-wins merge replaces rows when imported data is newer', () => {
    const rvfPath = tmpRvfPath('latest-wins');

    exportBrainToRvf(sourceDb, { outputPath: rvfPath, dimension: 8 });

    // Pre-seed target with an older version of pat-1
    const targetDb = new Database(':memory:');
    ensureAllBrainTables(targetDb);

    targetDb.prepare(`INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, confidence, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'pat-1', 'test-gen', 'test-generation', 'test-generation', 'Old Name', 0.5, '2020-01-01T00:00:00Z',
    );

    const result = importBrainFromRvf(targetDb, rvfPath, { mergeStrategy: 'latest-wins' });

    // pat-1 should have been updated (the exported version is newer)
    expect(result.conflicts).toBeGreaterThan(0);

    const pat = targetDb.prepare('SELECT * FROM qe_patterns WHERE id = ?').get('pat-1') as Record<string, unknown>;
    expect(pat.name).toBe('JWT Auth Pattern');
    expect(pat.confidence).toBe(0.85);

    targetDb.close();
  });

  // --------------------------------------------------------------------------
  // 7. Dry run reports counts without modifying DB
  // --------------------------------------------------------------------------

  it('dryRun returns expected record count without writing to DB', () => {
    const rvfPath = tmpRvfPath('dry-run');

    const manifest = exportBrainToRvf(sourceDb, { outputPath: rvfPath, dimension: 8 });

    const targetDb = new Database(':memory:');
    ensureAllBrainTables(targetDb);

    const result = importBrainFromRvf(targetDb, rvfPath, {
      mergeStrategy: 'skip-conflicts',
      dryRun: true,
    });

    expect(result.imported).toBe(manifest.stats.totalRecords);

    // DB should still be empty
    expect(countTable(targetDb, 'qe_patterns')).toBe(0);
    expect(countTable(targetDb, 'rl_q_values')).toBe(0);

    targetDb.close();
  });

  // --------------------------------------------------------------------------
  // 8. BLOB columns survive round-trip (embedding fidelity)
  // --------------------------------------------------------------------------

  it('embedding BLOBs survive export → import round-trip with byte-level fidelity', () => {
    const rvfPath = tmpRvfPath('blob-fidelity');

    exportBrainToRvf(sourceDb, { outputPath: rvfPath, dimension: 8 });

    const targetDb = new Database(':memory:');
    ensureAllBrainTables(targetDb);

    const result = importBrainFromRvf(targetDb, rvfPath, { mergeStrategy: 'skip-conflicts' });
    expect(result.embeddingsRestored).toBeGreaterThan(0);

    // Verify captured_experiences embedding round-trip
    const exp = targetDb.prepare('SELECT embedding, embedding_dimension FROM captured_experiences WHERE id = ?')
      .get('exp-1') as { embedding: Buffer | null; embedding_dimension: number };

    expect(exp.embedding).toBeInstanceOf(Buffer);
    expect(exp.embedding_dimension).toBe(8);

    // Restore Float32Array and compare values
    const restored = new Float32Array(
      exp.embedding!.buffer, exp.embedding!.byteOffset, 8,
    );
    for (let i = 0; i < 8; i++) {
      expect(restored[i]).toBeCloseTo((i + 1) / 8, 5);
    }

    // Verify sona_patterns state_embedding round-trip
    const sona = targetDb.prepare('SELECT state_embedding FROM sona_patterns WHERE id = ?')
      .get('sona-1') as { state_embedding: Buffer | null };

    expect(sona.state_embedding).toBeInstanceOf(Buffer);
    const sonaRestored = new Float32Array(
      sona.state_embedding!.buffer, sona.state_embedding!.byteOffset, 8,
    );
    for (let i = 0; i < 8; i++) {
      expect(sonaRestored[i]).toBeCloseTo(Math.sin(i), 5);
    }

    targetDb.close();
  });

  // --------------------------------------------------------------------------
  // 9. Export error when native is unavailable (mocked via non-existent path)
  // --------------------------------------------------------------------------

  it('brainInfoFromRvf throws on non-existent file', () => {
    expect(() => brainInfoFromRvf('/tmp/does-not-exist.rvf')).toThrow('not found');
  });

  // --------------------------------------------------------------------------
  // 10. Exported .rvf file has HNSW vectors from embeddings
  // --------------------------------------------------------------------------

  it('exported RVF contains HNSW vectors from pattern embeddings', () => {
    // Seed pattern embeddings
    const dim = 8;
    const emb = new Float32Array(dim);
    for (let i = 0; i < dim; i++) emb[i] = i * 0.1;

    sourceDb.prepare(`INSERT INTO qe_pattern_embeddings (pattern_id, embedding, dimension, model)
      VALUES (?, ?, ?, ?)`).run(
      'pat-1', Buffer.from(emb.buffer), dim, 'test-model',
    );

    const rvfPath = tmpRvfPath('hnsw-vectors');

    const manifest = exportBrainToRvf(sourceDb, { outputPath: rvfPath, dimension: dim });

    // Should have at least the pattern embedding + captured_experience + sona_pattern vectors
    expect(manifest.stats.embeddingCount).toBeGreaterThanOrEqual(1);
    expect(manifest.rvfStatus.totalVectors).toBeGreaterThanOrEqual(1);
  });

  // --------------------------------------------------------------------------
  // 11. v2.0 backward compat: legacy format with flat fields imports correctly
  // --------------------------------------------------------------------------

  it('imports v2.0 legacy format (flat patterns/qValues/witnessChain fields)', () => {
    const rvfPath = tmpRvfPath('v2-compat');

    // Build a v2.0-style kernel JSON with flat fields instead of `tables` map
    const legacyKernel = {
      version: '2.0',
      format: 'rvf',
      exportedAt: '2025-12-01T00:00:00Z',
      sourceDb: 'legacy.db',
      domains: ['test-generation'],
      patterns: [
        {
          id: 'legacy-pat-1', pattern_type: 'test-gen', qe_domain: 'test-generation',
          domain: 'test-generation', name: 'Legacy Pattern', description: 'From v2.0',
          confidence: 0.7, usage_count: 3, success_rate: 0.8, quality_score: 0.75, tier: 'short-term',
        },
      ],
      qValues: [
        {
          id: 'legacy-qv-1', algorithm: 'sarsa', agent_id: 'agent-legacy',
          state_key: 'state:x', action_key: 'action:y', q_value: 0.6, visits: 5, domain: 'test-generation',
        },
      ],
      dreamInsights: [
        {
          id: 'legacy-di-1', cycle_id: 'legacy-dc-1', insight_type: 'association',
          source_concepts: '["a","b"]', description: 'Legacy insight', novelty_score: 0.5, confidence_score: 0.6,
        },
      ],
      witnessChain: [
        {
          prev_hash: '0'.repeat(64), action_hash: 'dead'.padEnd(64, '0'),
          action_type: 'PATTERN_CREATE', action_data: '{"patternId":"legacy-pat-1"}',
          timestamp: '2025-12-01T00:00:00Z', actor: 'legacy-actor',
        },
      ],
    };

    // Create an RVF file and embed the legacy kernel
    const dim = 8;
    const rvf = createRvfStore(rvfPath, dim);
    rvf.embedKernel(Buffer.from(JSON.stringify(legacyKernel)));
    rvf.close();

    // Import into a fresh DB
    const targetDb = new Database(':memory:');
    ensureAllBrainTables(targetDb);

    const result = importBrainFromRvf(targetDb, rvfPath, { mergeStrategy: 'skip-conflicts' });

    expect(result.imported).toBe(4); // 1 pattern + 1 qValue + 1 insight + 1 witness
    expect(result.skipped).toBe(0);

    // Verify rows arrived in correct tables
    expect(countTable(targetDb, 'qe_patterns')).toBe(1);
    expect(countTable(targetDb, 'rl_q_values')).toBe(1);
    expect(countTable(targetDb, 'dream_insights')).toBe(1);
    expect(countTable(targetDb, 'witness_chain')).toBe(1);

    const pat = targetDb.prepare('SELECT * FROM qe_patterns WHERE id = ?').get('legacy-pat-1') as Record<string, unknown>;
    expect(pat.name).toBe('Legacy Pattern');

    targetDb.close();
  });

  // --------------------------------------------------------------------------
  // 12. Import rejects corrupted RVF (no kernel)
  // --------------------------------------------------------------------------

  it('importBrainFromRvf throws when RVF has no kernel', () => {
    const rvfPath = tmpRvfPath('no-kernel');

    // Create an RVF file with vectors but no kernel
    const dim = 8;
    const rvf = createRvfStore(rvfPath, dim);
    // Just add a dummy vector, no kernel
    rvf.ingest([{
      id: 'dummy',
      vector: new Float32Array(dim),
      metadata: { test: true },
    }]);
    rvf.close();

    const targetDb = new Database(':memory:');
    ensureAllBrainTables(targetDb);

    expect(() =>
      importBrainFromRvf(targetDb, rvfPath, { mergeStrategy: 'skip-conflicts' })
    ).toThrow(/kernel/i);

    targetDb.close();
  });
});
