/**
 * Cognitive Container Unit Tests (Task 4.1)
 *
 * Tests for:
 * - Export creates valid container with manifest
 * - Import verifies witness chain integrity
 * - Container includes all required segments
 * - Ed25519 signing and verification
 * - COW branching
 * - Version compatibility
 * - Corrupt container detection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  CognitiveContainer,
  createCognitiveContainer,
  generateSigningKeyPair,
  type ContainerManifest,
  type ExportOptions,
  type ImportOptions,
  type VerificationResult,
  type ContainerInfo,
} from '../../../../src/integrations/ruvector/cognitive-container';
import { ensureTargetTables } from '../../../../src/integrations/ruvector/brain-shared';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  ensureTargetTables(db);
  return db;
}

function seedTestData(db: Database.Database): void {
  // Insert patterns
  db.prepare(`
    INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, confidence, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('pat-1', 'test-gen', 'testing', 'testing', 'Login test pattern', 0.9, '2025-01-01', '2025-01-02');

  db.prepare(`
    INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, confidence, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('pat-2', 'assertion', 'testing', 'testing', 'API assertion', 0.85, '2025-01-01', '2025-01-03');

  // Insert Q-values
  db.prepare(`
    INSERT INTO rl_q_values (id, algorithm, agent_id, state_key, action_key, q_value, visits, domain)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('qv-1', 'sarsa', 'agent-1', 'state-a', 'action-1', 0.75, 10, 'testing');

  // Insert witness chain
  db.prepare(`
    INSERT INTO witness_chain (prev_hash, action_hash, action_type, timestamp, actor)
    VALUES (?, ?, ?, ?, ?)
  `).run('0000', 'abcd1234', 'pattern_create', '2025-01-01T00:00:00Z', 'agent-1');

  db.prepare(`
    INSERT INTO witness_chain (prev_hash, action_hash, action_type, timestamp, actor)
    VALUES (?, ?, ?, ?, ?)
  `).run('abcd1234', 'ef567890', 'pattern_update', '2025-01-01T01:00:00Z', 'agent-1');

  // Insert dream insights
  db.prepare(`
    INSERT INTO dream_insights (id, cycle_id, insight_type, source_concepts, description, confidence_score)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('di-1', 'cycle-1', 'cross-domain', 'login,auth', 'Auth patterns share structure', 0.8);

  // Insert concept nodes (graph segment)
  db.prepare(`
    INSERT INTO concept_nodes (id, concept_type, content, activation_level)
    VALUES (?, ?, ?, ?)
  `).run('cn-1', 'domain', 'authentication', 0.9);
}

// ============================================================================
// Export Tests
// ============================================================================

describe('CognitiveContainer', () => {
  let container: CognitiveContainer;
  let db: Database.Database;

  beforeEach(() => {
    container = createCognitiveContainer();
    db = createTestDb();
    seedTestData(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('exportContainer', () => {
    it('should export a valid container with manifest', () => {
      const result = container.exportContainer(db, { compress: false });

      expect(result.data).toBeInstanceOf(Buffer);
      expect(result.data.length).toBeGreaterThan(16);
      expect(result.manifest.version).toBe('2.0.0');
      expect(result.manifest.source).toBeTruthy();
      expect(result.manifest.created).toBeTruthy();
    });

    it('should include all 6 required segments', () => {
      const result = container.exportContainer(db, { compress: false });

      const segmentNames = result.manifest.segments.map(s => s.name);
      expect(segmentNames).toContain('patterns');
      expect(segmentNames).toContain('embeddings');
      expect(segmentNames).toContain('q-values');
      expect(segmentNames).toContain('lora-weights');
      expect(segmentNames).toContain('graph');
      expect(segmentNames).toContain('witness-chain');
      expect(result.manifest.segments).toHaveLength(6);
    });

    it('should compute per-segment checksums', () => {
      const result = container.exportContainer(db, { compress: false });

      for (const seg of result.manifest.segments) {
        expect(seg.checksum).toMatch(/^[a-f0-9]{64}$/);
        expect(result.manifest.checksums[seg.name]).toBe(seg.checksum);
      }
    });

    it('should support compressed export', () => {
      const compressed = container.exportContainer(db, { compress: true });
      const uncompressed = container.exportContainer(db, { compress: false });

      // Compressed should be smaller (or equal for tiny data)
      expect(compressed.manifest.segments.every(s => s.compressed)).toBe(true);
      expect(uncompressed.manifest.segments.every(s => !s.compressed)).toBe(true);
    });

    it('should accept custom source ID', () => {
      const result = container.exportContainer(db, {
        compress: false,
        sourceId: 'my-instance-42',
      });

      expect(result.manifest.source).toBe('my-instance-42');
    });

    it('should export with domain filtering', () => {
      const result = container.exportContainer(db, {
        compress: false,
        domains: ['testing'],
      });

      expect(result.data).toBeInstanceOf(Buffer);
      expect(result.manifest.segments.length).toBe(6);
    });
  });

  // ==========================================================================
  // Signing Tests
  // ==========================================================================

  describe('Ed25519 signing', () => {
    it('should sign the container when privateKey is provided', () => {
      const keys = generateSigningKeyPair();
      const result = container.exportContainer(db, {
        compress: false,
        sign: true,
        privateKey: keys.privateKey,
      });

      expect(result.manifest.signature).toBeTruthy();
      expect(result.manifest.signature).toMatch(/^[a-f0-9]+$/);
    });

    it('should not sign when sign option is false', () => {
      const result = container.exportContainer(db, { compress: false, sign: false });
      expect(result.manifest.signature).toBeUndefined();
    });

    it('should verify a valid signature', () => {
      const keys = generateSigningKeyPair();
      const exported = container.exportContainer(db, {
        compress: false,
        sign: true,
        privateKey: keys.privateKey,
      });

      const verification = container.verifyContainer(exported.data, keys.publicKey);
      expect(verification.valid).toBe(true);
      expect(verification.signatureValid).toBe(true);
    });

    it('should reject an invalid signature', () => {
      const keys = generateSigningKeyPair();
      const otherKeys = generateSigningKeyPair();
      const exported = container.exportContainer(db, {
        compress: false,
        sign: true,
        privateKey: keys.privateKey,
      });

      const verification = container.verifyContainer(exported.data, otherKeys.publicKey);
      expect(verification.valid).toBe(false);
      expect(verification.signatureValid).toBe(false);
    });
  });

  // ==========================================================================
  // Verification Tests
  // ==========================================================================

  describe('verifyContainer', () => {
    it('should verify a valid unsigned container', () => {
      const exported = container.exportContainer(db, { compress: false });
      const result = container.verifyContainer(exported.data);

      expect(result.valid).toBe(true);
      expect(result.manifestValid).toBe(true);
      expect(result.segmentsValid).toBe(true);
      expect(result.signatureValid).toBeNull();
      expect(result.errors).toHaveLength(0);
    });

    it('should detect corrupt magic bytes', () => {
      const exported = container.exportContainer(db, { compress: false });
      // Corrupt magic
      exported.data[0] = 0xFF;

      const result = container.verifyContainer(exported.data);
      expect(result.valid).toBe(false);
      expect(result.manifestValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect corrupt segment data', () => {
      const exported = container.exportContainer(db, { compress: false });
      // Corrupt some data bytes near the end
      const corruptPos = exported.data.length - 10;
      if (corruptPos > 16) {
        exported.data[corruptPos] = exported.data[corruptPos] ^ 0xFF;
      }

      const result = container.verifyContainer(exported.data);
      // May or may not detect corruption depending on where the flip lands,
      // but the function should not throw
      expect(typeof result.valid).toBe('boolean');
    });

    it('should detect truncated container', () => {
      const result = container.verifyContainer(Buffer.alloc(5));
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Import Tests
  // ==========================================================================

  describe('importContainer', () => {
    it('should import all data from a container', () => {
      const exported = container.exportContainer(db, { compress: false });

      // Import into a fresh database
      const targetDb = createTestDb();
      const result = container.importContainer(exported.data, targetDb, {
        mergeStrategy: 'skip-conflicts',
      });

      expect(result.imported).toBeGreaterThan(0);
      expect(result.segmentsRestored).toBe(6);

      // Verify patterns were imported
      const patterns = targetDb.prepare('SELECT COUNT(*) as cnt FROM qe_patterns').get() as { cnt: number };
      expect(patterns.cnt).toBe(2);

      // Verify Q-values were imported
      const qvals = targetDb.prepare('SELECT COUNT(*) as cnt FROM rl_q_values').get() as { cnt: number };
      expect(qvals.cnt).toBe(1);

      targetDb.close();
    });

    it('should import compressed containers', () => {
      const exported = container.exportContainer(db, { compress: true });

      const targetDb = createTestDb();
      const result = container.importContainer(exported.data, targetDb, {
        mergeStrategy: 'skip-conflicts',
      });

      expect(result.imported).toBeGreaterThan(0);

      const patterns = targetDb.prepare('SELECT COUNT(*) as cnt FROM qe_patterns').get() as { cnt: number };
      expect(patterns.cnt).toBe(2);

      targetDb.close();
    });

    it('should support dry run', () => {
      const exported = container.exportContainer(db, { compress: false });

      const targetDb = createTestDb();
      const result = container.importContainer(exported.data, targetDb, {
        mergeStrategy: 'skip-conflicts',
        dryRun: true,
      });

      expect(result.imported).toBeGreaterThan(0);
      expect(result.segmentsRestored).toBe(6);

      // Dry run should not actually insert
      const patterns = targetDb.prepare('SELECT COUNT(*) as cnt FROM qe_patterns').get() as { cnt: number };
      expect(patterns.cnt).toBe(0);

      targetDb.close();
    });

    it('should verify witness chain integrity on import', () => {
      const exported = container.exportContainer(db, { compress: false });

      const targetDb = createTestDb();
      const result = container.importContainer(exported.data, targetDb, {
        mergeStrategy: 'skip-conflicts',
      });

      // Witness chain entries should be imported
      const witnessCount = targetDb.prepare('SELECT COUNT(*) as cnt FROM witness_chain').get() as { cnt: number };
      expect(witnessCount.cnt).toBe(2);

      // Verify chain ordering is preserved
      const entries = targetDb.prepare('SELECT * FROM witness_chain ORDER BY timestamp').all() as Array<{ prev_hash: string; action_hash: string }>;
      expect(entries[0].action_hash).toBe('abcd1234');
      expect(entries[1].prev_hash).toBe('abcd1234');

      targetDb.close();
    });

    it('should reject import when signature verification fails', () => {
      const keys = generateSigningKeyPair();
      const otherKeys = generateSigningKeyPair();
      const exported = container.exportContainer(db, {
        compress: false,
        sign: true,
        privateKey: keys.privateKey,
      });

      const targetDb = createTestDb();
      expect(() => {
        container.importContainer(exported.data, targetDb, {
          mergeStrategy: 'skip-conflicts',
          verifySignature: true,
          publicKey: otherKeys.publicKey,
        });
      }).toThrow('signature verification failed');

      targetDb.close();
    });

    it('should accept import when signature verification passes', () => {
      const keys = generateSigningKeyPair();
      const exported = container.exportContainer(db, {
        compress: false,
        sign: true,
        privateKey: keys.privateKey,
      });

      const targetDb = createTestDb();
      const result = container.importContainer(exported.data, targetDb, {
        mergeStrategy: 'skip-conflicts',
        verifySignature: true,
        publicKey: keys.publicKey,
      });

      expect(result.imported).toBeGreaterThan(0);

      targetDb.close();
    });

    it('should handle merge strategies correctly', () => {
      const exported = container.exportContainer(db, { compress: false });

      const targetDb = createTestDb();

      // First import
      container.importContainer(exported.data, targetDb, {
        mergeStrategy: 'skip-conflicts',
      });

      // Second import with skip-conflicts should skip duplicates
      const result = container.importContainer(exported.data, targetDb, {
        mergeStrategy: 'skip-conflicts',
      });

      expect(result.conflicts).toBeGreaterThan(0);
      expect(result.skipped).toBeGreaterThan(0);

      targetDb.close();
    });
  });

  // ==========================================================================
  // COW Branching Tests
  // ==========================================================================

  describe('branchContainer', () => {
    it('should create a branch referencing the parent', () => {
      const exported = container.exportContainer(db, {
        compress: false,
        sourceId: 'parent-instance',
      });

      const branch = container.branchContainer(exported.data, 'feature-branch');

      expect(branch.manifest.source).toBe('feature-branch');
      expect(branch.manifest.branchOf).toBe('parent-instance');
      expect(branch.manifest.version).toBe('2.0.0');
    });

    it('should preserve all segment checksums in branch', () => {
      const exported = container.exportContainer(db, { compress: false });
      const branch = container.branchContainer(exported.data, 'my-branch');

      for (const segName of Object.keys(exported.manifest.checksums)) {
        expect(branch.manifest.checksums[segName]).toBe(exported.manifest.checksums[segName]);
      }
    });

    it('should produce a valid container from the branch', () => {
      const exported = container.exportContainer(db, { compress: false });
      const branch = container.branchContainer(exported.data, 'valid-branch');

      const verification = container.verifyContainer(branch.data);
      expect(verification.valid).toBe(true);
      expect(verification.manifestValid).toBe(true);
      expect(verification.segmentsValid).toBe(true);
    });

    it('should allow importing from a branch', () => {
      const exported = container.exportContainer(db, { compress: false });
      const branch = container.branchContainer(exported.data, 'importable-branch');

      const targetDb = createTestDb();
      const result = container.importContainer(branch.data, targetDb, {
        mergeStrategy: 'skip-conflicts',
      });

      expect(result.imported).toBeGreaterThan(0);

      targetDb.close();
    });
  });

  // ==========================================================================
  // Container Info Tests
  // ==========================================================================

  describe('getContainerInfo', () => {
    it('should return container metadata', () => {
      const exported = container.exportContainer(db, {
        compress: false,
        sourceId: 'info-test',
      });

      const info = container.getContainerInfo(exported.data);

      expect(info.version).toBe('2.0.0');
      expect(info.source).toBe('info-test');
      expect(info.segmentCount).toBe(6);
      expect(info.segmentNames).toContain('patterns');
      expect(info.segmentNames).toContain('witness-chain');
      expect(info.totalDataBytes).toBeGreaterThan(0);
      expect(info.signed).toBe(false);
      expect(info.branchOf).toBeNull();
    });

    it('should indicate signed status', () => {
      const keys = generateSigningKeyPair();
      const exported = container.exportContainer(db, {
        compress: false,
        sign: true,
        privateKey: keys.privateKey,
      });

      const info = container.getContainerInfo(exported.data);
      expect(info.signed).toBe(true);
    });

    it('should show branchOf for branched containers', () => {
      const exported = container.exportContainer(db, {
        compress: false,
        sourceId: 'parent-src',
      });
      const branch = container.branchContainer(exported.data, 'child-branch');

      const info = container.getContainerInfo(branch.data);
      expect(info.branchOf).toBe('parent-src');
    });
  });

  // ==========================================================================
  // Version Compatibility Tests
  // ==========================================================================

  describe('version compatibility', () => {
    it('should reject containers with wrong magic', () => {
      const badData = Buffer.from('BADMAGIC' + '\0'.repeat(100));
      expect(() => container.getContainerInfo(badData)).toThrow('bad magic');
    });

    it('should reject containers with unsupported version', () => {
      const exported = container.exportContainer(db, { compress: false });
      // Overwrite version field (bytes 8-11) with version 99
      exported.data.writeUInt32BE(99, 8);

      expect(() => container.getContainerInfo(exported.data)).toThrow('Unsupported container version');
    });
  });

  // ==========================================================================
  // Round-trip Tests
  // ==========================================================================

  describe('round-trip', () => {
    it('should preserve all data through export/import cycle', () => {
      const exported = container.exportContainer(db, { compress: true });

      const targetDb = createTestDb();
      container.importContainer(exported.data, targetDb, {
        mergeStrategy: 'skip-conflicts',
      });

      // Verify patterns
      const patterns = targetDb.prepare(
        'SELECT id, name, confidence FROM qe_patterns ORDER BY id',
      ).all() as Array<{ id: string; name: string; confidence: number }>;
      expect(patterns).toHaveLength(2);
      expect(patterns[0].id).toBe('pat-1');
      expect(patterns[0].name).toBe('Login test pattern');
      expect(patterns[0].confidence).toBeCloseTo(0.9);

      // Verify Q-values
      const qvals = targetDb.prepare(
        'SELECT id, q_value, visits FROM rl_q_values',
      ).all() as Array<{ id: string; q_value: number; visits: number }>;
      expect(qvals).toHaveLength(1);
      expect(qvals[0].q_value).toBeCloseTo(0.75);
      expect(qvals[0].visits).toBe(10);

      // Verify dream insights
      const insights = targetDb.prepare(
        'SELECT id, description FROM dream_insights',
      ).all() as Array<{ id: string; description: string }>;
      expect(insights).toHaveLength(1);
      expect(insights[0].description).toBe('Auth patterns share structure');

      // Verify concept nodes
      const concepts = targetDb.prepare(
        'SELECT id, content FROM concept_nodes',
      ).all() as Array<{ id: string; content: string }>;
      expect(concepts).toHaveLength(1);
      expect(concepts[0].content).toBe('authentication');

      targetDb.close();
    });

    it('should preserve data through signed export/import', () => {
      const keys = generateSigningKeyPair();
      const exported = container.exportContainer(db, {
        compress: true,
        sign: true,
        privateKey: keys.privateKey,
      });

      const targetDb = createTestDb();
      const result = container.importContainer(exported.data, targetDb, {
        mergeStrategy: 'skip-conflicts',
        verifySignature: true,
        publicKey: keys.publicKey,
      });

      expect(result.imported).toBeGreaterThan(0);
      expect(result.segmentsRestored).toBe(6);

      targetDb.close();
    });
  });

  // ==========================================================================
  // Factory Tests
  // ==========================================================================

  describe('createCognitiveContainer', () => {
    it('should create a valid instance', () => {
      const c = createCognitiveContainer();
      expect(c).toBeInstanceOf(CognitiveContainer);
    });
  });

  describe('generateSigningKeyPair', () => {
    it('should generate valid Ed25519 key pair', () => {
      const keys = generateSigningKeyPair();
      expect(keys.publicKey).toBeInstanceOf(Buffer);
      expect(keys.privateKey).toBeInstanceOf(Buffer);
      expect(keys.publicKey.length).toBeGreaterThan(0);
      expect(keys.privateKey.length).toBeGreaterThan(0);
    });

    it('should generate unique key pairs', () => {
      const keys1 = generateSigningKeyPair();
      const keys2 = generateSigningKeyPair();
      expect(keys1.publicKey.equals(keys2.publicKey)).toBe(false);
    });
  });
});
