/**
 * Brain Backward Compatibility Tests
 *
 * Verifies that v3.0 importers can read v1.0 exports, handles missing files
 * gracefully, and round-trips correctly across versions.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import {
  exportBrain,
  importBrain,
  brainInfo,
  computeChecksum,
  type BrainExportManifest,
} from '../../src/integrations/ruvector/brain-exporter.js';
import {
  ensureTargetTables,
  writeJsonl,
  sha256,
  TABLE_CONFIGS,
} from '../../src/integrations/ruvector/brain-shared.js';

// ============================================================================
// Helpers
// ============================================================================

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  ensureTargetTables(db);
  return db;
}

function seedTestData(db: Database.Database): void {
  db.prepare(`
    INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description, confidence, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('p1', 'test-template', 'test-generation', 'test-generation', 'AAA Test', 'Arrange-Act-Assert', 0.8, '2026-02-20T10:00:00Z');

  db.prepare(`
    INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description, confidence, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('p2', 'mock-pattern', 'coverage-analysis', 'coverage-analysis', 'Coverage Strategy', 'Risk-based', 0.6, '2026-02-20T11:00:00Z');

  db.prepare(`
    INSERT INTO rl_q_values (id, algorithm, agent_id, state_key, action_key, q_value, visits, domain, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('qv1', 'sarsa', 'agent-1', 'state-a', 'action-x', 0.75, 10, 'test-generation', '2026-02-20T10:00:00Z');

  db.prepare(`
    INSERT INTO dream_cycles (id, start_time, status)
    VALUES (?, ?, ?)
  `).run('dc1', '2026-02-20T09:00:00Z', 'completed');

  db.prepare(`
    INSERT INTO dream_insights (id, cycle_id, insight_type, source_concepts, description, confidence_score)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('di1', 'dc1', 'cross-pattern', '["p1","p2"]', 'AAA and coverage are related', 0.7);

  db.prepare(`
    INSERT INTO witness_chain (prev_hash, action_hash, action_type, action_data, timestamp, actor)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('0'.repeat(64), 'abc123', 'PATTERN_CREATE', '{"patternId":"p1"}', '2026-02-20T10:00:00Z', 'reasoning-bank');
}

let tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = join(tmpdir(), `brain-compat-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

/**
 * Create a synthetic v1.0-style export directory with only the 4 original files.
 * This simulates what an older AQE version would have produced.
 */
function createV1Export(dir: string, data: {
  patterns?: unknown[];
  qValues?: unknown[];
  dreamInsights?: unknown[];
  witnessChain?: unknown[];
}): void {
  const patterns = data.patterns ?? [];
  const qValues = data.qValues ?? [];
  const dreamInsights = data.dreamInsights ?? [];
  const witnessChain = data.witnessChain ?? [];

  mkdirSync(dir, { recursive: true });

  writeJsonl(join(dir, 'patterns.jsonl'), patterns);
  writeJsonl(join(dir, 'q-values.jsonl'), qValues);
  writeJsonl(join(dir, 'dream-insights.jsonl'), dreamInsights);
  writeJsonl(join(dir, 'witness-chain.jsonl'), witnessChain);

  // Create empty files for all other TABLE_CONFIGS entries so checksum works
  const v1Files = new Set(['patterns.jsonl', 'q-values.jsonl', 'dream-insights.jsonl', 'witness-chain.jsonl']);
  for (const config of TABLE_CONFIGS) {
    if (!v1Files.has(config.fileName)) {
      writeJsonl(join(dir, config.fileName), []);
    }
  }

  const checksum = computeChecksum(dir);

  const manifest: BrainExportManifest = {
    version: '1.0',
    exportedAt: '2025-06-01T00:00:00Z',
    sourceDb: 'legacy-memory.db',
    stats: {
      patternCount: patterns.length,
      vectorCount: 0,
      qValueCount: qValues.length,
      dreamInsightCount: dreamInsights.length,
      witnessChainLength: witnessChain.length,
      totalRecords: patterns.length + qValues.length + dreamInsights.length + witnessChain.length,
    },
    domains: [],
    checksum,
  };

  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
}

// ============================================================================
// Tests
// ============================================================================

describe('Brain Backward Compatibility', () => {
  let sourceDb: Database.Database;

  beforeEach(() => {
    sourceDb = createTestDb();
    seedTestData(sourceDb);
    tempDirs = [];
  });

  afterEach(() => {
    sourceDb.close();
    for (const dir of tempDirs) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  // --------------------------------------------------------------------------
  // v1.0 backward compat
  // --------------------------------------------------------------------------

  it('should import a v1.0-style export with 4 JSONL files', () => {
    const dir = makeTempDir();
    createV1Export(dir, {
      patterns: [
        { id: 'p1', pattern_type: 'test', qe_domain: 'test-gen', domain: 'test-gen', name: 'Pattern 1', confidence: 0.8 },
        { id: 'p2', pattern_type: 'test', qe_domain: 'coverage', domain: 'coverage', name: 'Pattern 2', confidence: 0.6 },
      ],
      qValues: [
        { id: 'qv1', algorithm: 'sarsa', agent_id: 'a1', state_key: 's1', action_key: 'a1', q_value: 0.5, visits: 3 },
      ],
      dreamInsights: [
        { id: 'di1', cycle_id: 'dc1', insight_type: 'cross-pattern', source_concepts: '[]', description: 'test' },
      ],
      witnessChain: [
        { prev_hash: '0'.repeat(64), action_hash: 'hash1', action_type: 'CREATE', timestamp: '2025-06-01T00:00:00Z', actor: 'test' },
      ],
    });

    const targetDb = createTestDb();
    const result = importBrain(targetDb, dir, { mergeStrategy: 'skip-conflicts' });

    expect(result.imported).toBe(5); // 2 patterns + 1 qvalue + 1 dream_insight + 1 witness
    expect(result.skipped).toBe(0);

    const patternCount = (targetDb.prepare('SELECT COUNT(*) as cnt FROM qe_patterns').get() as { cnt: number }).cnt;
    expect(patternCount).toBe(2);

    const qvCount = (targetDb.prepare('SELECT COUNT(*) as cnt FROM rl_q_values').get() as { cnt: number }).cnt;
    expect(qvCount).toBe(1);

    targetDb.close();
  });

  it('should read v1.0 manifest via brainInfo()', () => {
    const dir = makeTempDir();
    createV1Export(dir, {
      patterns: [
        { id: 'p1', pattern_type: 'test', qe_domain: 'test-gen', domain: 'test-gen', name: 'P1' },
      ],
    });

    const info = brainInfo(dir);

    expect(info.version).toBe('1.0');
    expect(info.stats.patternCount).toBe(1);
    expect(info.stats.qValueCount).toBe(0);
    expect(info.sourceDb).toBe('legacy-memory.db');
    expect(info.exportedAt).toBe('2025-06-01T00:00:00Z');
  });

  it('should only import the 4 v1.0 tables even if other files exist', () => {
    const dir = makeTempDir();
    createV1Export(dir, {
      patterns: [
        { id: 'p1', pattern_type: 'test', qe_domain: 'test-gen', domain: 'test-gen', name: 'P1' },
      ],
    });

    // Add extra data to a non-v1.0 file that should be ignored
    writeJsonl(join(dir, 'captured-experiences.jsonl'), [
      { id: 'exp1', task: 'task', agent: 'agent', domain: 'test', success: 1, quality: 0.9, duration_ms: 100, completed_at: '2025-06-01T00:00:00Z' },
    ]);

    // Recompute checksum and update manifest
    const checksum = computeChecksum(dir);
    const manifestPath = join(dir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    manifest.checksum = checksum;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    const targetDb = createTestDb();
    const result = importBrain(targetDb, dir, { mergeStrategy: 'skip-conflicts' });

    // Should only import from the 4 v1.0 tables
    expect(result.imported).toBe(1); // 1 pattern
    const expCount = (targetDb.prepare('SELECT COUNT(*) as cnt FROM captured_experiences').get() as { cnt: number }).cnt;
    expect(expCount).toBe(0); // Should NOT have imported captured_experiences

    targetDb.close();
  });

  it('should handle missing files in v1.0 export without crashing', () => {
    const dir = makeTempDir();
    createV1Export(dir, {
      patterns: [
        { id: 'p1', pattern_type: 'test', qe_domain: 'test-gen', domain: 'test-gen', name: 'P1' },
      ],
    });

    // Remove q-values.jsonl to simulate a partial export
    const qvPath = join(dir, 'q-values.jsonl');
    rmSync(qvPath);
    // Write back empty so checksum still works (readJsonl returns [] for missing files)
    // But we want to test missing file behavior - readJsonl handles that

    // Recompute checksum (now q-values is missing, computeChecksum handles that by hashing empty string)
    const checksum = computeChecksum(dir);
    const manifestPath = join(dir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    manifest.checksum = checksum;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    const targetDb = createTestDb();
    // Should not throw
    const result = importBrain(targetDb, dir, { mergeStrategy: 'skip-conflicts' });
    expect(result.imported).toBe(1); // 1 pattern, no q-values
    targetDb.close();
  });

  // --------------------------------------------------------------------------
  // v3.0 exports
  // --------------------------------------------------------------------------

  it('should produce v3.0 manifest from exportBrain()', () => {
    const outDir = makeTempDir();
    const manifest = exportBrain(sourceDb, { outputPath: outDir });

    expect(manifest.version).toBe('3.0');
    expect(manifest.stats.patternCount).toBe(2);
    expect(manifest.stats.totalRecords).toBeGreaterThan(0);
    expect(manifest.tableRecordCounts).toBeDefined();
  });

  it('should include all TABLE_CONFIGS files in v3.0 export', () => {
    const outDir = makeTempDir();
    exportBrain(sourceDb, { outputPath: outDir });

    for (const config of TABLE_CONFIGS) {
      expect(existsSync(join(outDir, config.fileName))).toBe(true);
    }
  });

  it('should import v3.0 export into fresh DB correctly', () => {
    const outDir = makeTempDir();
    const manifest = exportBrain(sourceDb, { outputPath: outDir });

    const targetDb = createTestDb();
    const result = importBrain(targetDb, outDir, { mergeStrategy: 'skip-conflicts' });

    expect(result.imported).toBe(manifest.stats.totalRecords);
    expect(result.skipped).toBe(0);
    expect(result.conflicts).toBe(0);

    // Verify specific counts
    const patternCount = (targetDb.prepare('SELECT COUNT(*) as cnt FROM qe_patterns').get() as { cnt: number }).cnt;
    expect(patternCount).toBe(manifest.stats.patternCount);

    const qvCount = (targetDb.prepare('SELECT COUNT(*) as cnt FROM rl_q_values').get() as { cnt: number }).cnt;
    expect(qvCount).toBe(manifest.stats.qValueCount);

    const insightCount = (targetDb.prepare('SELECT COUNT(*) as cnt FROM dream_insights').get() as { cnt: number }).cnt;
    expect(insightCount).toBe(manifest.stats.dreamInsightCount);

    const witnessCount = (targetDb.prepare('SELECT COUNT(*) as cnt FROM witness_chain').get() as { cnt: number }).cnt;
    expect(witnessCount).toBe(manifest.stats.witnessChainLength);

    targetDb.close();
  });

  // --------------------------------------------------------------------------
  // Round-trip tests
  // --------------------------------------------------------------------------

  it('should round-trip v3.0: export, import into fresh DB, verify counts match', () => {
    const outDir = makeTempDir();
    const manifest = exportBrain(sourceDb, { outputPath: outDir });

    const targetDb = createTestDb();
    importBrain(targetDb, outDir, { mergeStrategy: 'skip-conflicts' });

    // Re-export from target and compare manifests
    const outDir2 = makeTempDir();
    const manifest2 = exportBrain(targetDb, { outputPath: outDir2 });

    expect(manifest2.stats.patternCount).toBe(manifest.stats.patternCount);
    expect(manifest2.stats.qValueCount).toBe(manifest.stats.qValueCount);
    expect(manifest2.stats.dreamInsightCount).toBe(manifest.stats.dreamInsightCount);
    expect(manifest2.stats.witnessChainLength).toBe(manifest.stats.witnessChainLength);
    expect(manifest2.stats.totalRecords).toBe(manifest.stats.totalRecords);

    targetDb.close();
  });

  it('should handle double import without duplicating data', () => {
    const outDir = makeTempDir();
    exportBrain(sourceDb, { outputPath: outDir });

    const targetDb = createTestDb();
    const result1 = importBrain(targetDb, outDir, { mergeStrategy: 'skip-conflicts' });
    expect(result1.imported).toBeGreaterThan(0);

    // Import same data again
    const result2 = importBrain(targetDb, outDir, { mergeStrategy: 'skip-conflicts' });
    expect(result2.imported).toBe(0);
    expect(result2.skipped).toBeGreaterThan(0);

    targetDb.close();
  });

  // --------------------------------------------------------------------------
  // Unknown version handling
  // --------------------------------------------------------------------------

  it('should warn but attempt import for unknown manifest versions', () => {
    const dir = makeTempDir();
    createV1Export(dir, {
      patterns: [
        { id: 'p1', pattern_type: 'test', qe_domain: 'test-gen', domain: 'test-gen', name: 'P1' },
      ],
    });

    // Override version to something unknown
    const manifestPath = join(dir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    manifest.version = '99.0';
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    const targetDb = createTestDb();
    // Should not throw — just warn and attempt import
    const result = importBrain(targetDb, dir, { mergeStrategy: 'skip-conflicts' });
    expect(result.imported).toBeGreaterThanOrEqual(1);

    targetDb.close();
  });

  // --------------------------------------------------------------------------
  // Dry run with version detection
  // --------------------------------------------------------------------------

  it('should support dry-run on v1.0 exports', () => {
    const dir = makeTempDir();
    createV1Export(dir, {
      patterns: [
        { id: 'p1', pattern_type: 'test', qe_domain: 'test-gen', domain: 'test-gen', name: 'P1' },
        { id: 'p2', pattern_type: 'test', qe_domain: 'test-gen', domain: 'test-gen', name: 'P2' },
      ],
      qValues: [
        { id: 'qv1', algorithm: 'sarsa', agent_id: 'a1', state_key: 's1', action_key: 'a1', q_value: 0.5, visits: 3 },
      ],
    });

    const targetDb = createTestDb();
    const result = importBrain(targetDb, dir, { mergeStrategy: 'skip-conflicts', dryRun: true });

    // Dry run reports what would be imported
    expect(result.imported).toBe(3); // 2 patterns + 1 qvalue (only v1.0 tables scanned)

    // Database should be unchanged
    const patternCount = (targetDb.prepare('SELECT COUNT(*) as cnt FROM qe_patterns').get() as { cnt: number }).cnt;
    expect(patternCount).toBe(0);

    targetDb.close();
  });

  it('should checksum v1.0 export correctly', () => {
    const dir = makeTempDir();
    createV1Export(dir, {
      patterns: [
        { id: 'p1', pattern_type: 'test', qe_domain: 'test-gen', domain: 'test-gen', name: 'P1' },
      ],
    });

    const info = brainInfo(dir);
    const actualChecksum = computeChecksum(dir);
    expect(info.checksum).toBe(actualChecksum);
  });
});
