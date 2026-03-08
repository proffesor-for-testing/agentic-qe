/**
 * Brain RVF Advanced Features Tests (Phase 4)
 *
 * Tests for RuVector advanced feature support in the RVF brain exporter:
 *   4.1 — verifyWitness() graceful degradation + import validation
 *   4.2 — Ed25519 signing (opt-in)
 *   4.3 — Lineage tracking
 *   4.4 — Metadata per vector on ingest
 *   4.5 — Compact after conflict resolution
 *
 * Since the native @ruvector/rvf-node binding is not installed in this
 * environment, all tests mock the native adapter at the module level.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { ensureTargetTables } from '../../src/integrations/ruvector/brain-shared.js';

// ---------------------------------------------------------------------------
// Shared mock adapter — a single object returned by all factory functions.
// Using vi.hoisted() so the mock fns are available inside vi.mock factory.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  const ingest = vi.fn<[], { accepted: number; rejected: number }>(() => ({ accepted: 0, rejected: 0 }));
  const search = vi.fn(() => []);
  const deleteFn = vi.fn(() => 0);
  const status = vi.fn(() => ({
    totalVectors: 0, totalSegments: 1, fileSizeBytes: 4096,
    epoch: 1, witnessValid: true, witnessEntries: 0,
  }));
  const dimension = vi.fn(() => 384);
  const size = vi.fn(() => 0);
  const compact = vi.fn();
  const close = vi.fn();
  const isOpen = vi.fn(() => true);
  const path = vi.fn(() => '/tmp/test.rvf');
  const embedKernel = vi.fn(() => 1);
  const extractKernel = vi.fn<[], { header: Buffer; image: Buffer } | null>(() => null);
  const verifyWitness = vi.fn(() => ({ valid: true, totalEntries: 0, errors: [] as string[] }));
  const sign = vi.fn<[Buffer], string | null>(() => null);
  const fileId = vi.fn<[], string | null>(() => null);
  const parentId = vi.fn<[], string | null>(() => null);
  const lineageDepth = vi.fn(() => 0);
  const fork = vi.fn();

  return {
    ingest, search, delete: deleteFn, status, dimension, size,
    compact, close, isOpen, path, embedKernel, extractKernel,
    verifyWitness, sign, fileId, parentId, lineageDepth, fork,
  };
});

vi.mock('../../src/integrations/ruvector/rvf-native-adapter.js', () => {
  const adapter = {
    ingest: mocks.ingest,
    search: mocks.search,
    delete: mocks.delete,
    status: mocks.status,
    dimension: mocks.dimension,
    size: mocks.size,
    compact: mocks.compact,
    close: mocks.close,
    isOpen: mocks.isOpen,
    path: mocks.path,
    embedKernel: mocks.embedKernel,
    extractKernel: mocks.extractKernel,
    verifyWitness: mocks.verifyWitness,
    sign: mocks.sign,
    fileId: mocks.fileId,
    parentId: mocks.parentId,
    lineageDepth: mocks.lineageDepth,
    fork: mocks.fork,
  };
  return {
    createRvfStore: vi.fn(() => adapter),
    openRvfStore: vi.fn(() => adapter),
    openRvfStoreReadonly: vi.fn(() => adapter),
    isRvfNativeAvailable: vi.fn(() => true),
  };
});

// Import exporter AFTER mock registration
import {
  exportBrainToRvf,
  importBrainFromRvf,
  isRvfAvailable,
} from '../../src/integrations/ruvector/brain-rvf-exporter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  ensureTargetTables(db);
  return db;
}

function seedMinimalData(db: Database.Database): void {
  db.prepare(`
    INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description, confidence, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('p1', 'test-template', 'test-gen', 'test-gen', 'Test Pattern', 'A test', 0.9, '2026-03-01T00:00:00Z');
}

function makeBrainKernelJson(overrides?: Record<string, unknown>): string {
  const base = {
    version: '3.0',
    format: 'rvf',
    exportedAt: '2026-03-01T00:00:00Z',
    sourceDb: 'test.db',
    domains: ['test-gen'],
    tables: {
      qe_patterns: [
        { id: 'p1', pattern_type: 'test-template', qe_domain: 'test-gen', domain: 'test-gen', name: 'Test', confidence: 0.9 },
      ],
    },
    ...overrides,
  };
  return JSON.stringify(base);
}

/** Create a real temp file so existsSync() passes in importBrainFromRvf. */
function createTempRvfFile(): string {
  const p = join(tmpdir(), `brain-rvf-test-${randomUUID()}.rvf`);
  writeFileSync(p, 'placeholder', 'utf-8');
  return p;
}

function cleanupFile(p: string): void {
  try { if (existsSync(p)) unlinkSync(p); } catch { /* ignore */ }
}

function resetAllMocks(): void {
  vi.clearAllMocks();
  // Reset default return values
  mocks.ingest.mockReturnValue({ accepted: 0, rejected: 0 });
  mocks.status.mockReturnValue({
    totalVectors: 0, totalSegments: 1, fileSizeBytes: 4096,
    epoch: 1, witnessValid: true, witnessEntries: 0,
  });
  mocks.verifyWitness.mockReturnValue({ valid: true, totalEntries: 0, errors: [] });
  mocks.sign.mockReturnValue(null);
  mocks.fileId.mockReturnValue(null);
  mocks.parentId.mockReturnValue(null);
  mocks.lineageDepth.mockReturnValue(0);
  mocks.extractKernel.mockReturnValue(null);
  mocks.dimension.mockReturnValue(384);
  mocks.isOpen.mockReturnValue(true);
}

// ============================================================================
// Tests
// ============================================================================

describe('Brain RVF Advanced Features (Phase 4)', () => {
  let db: Database.Database;

  beforeEach(() => {
    resetAllMocks();
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  // --------------------------------------------------------------------------
  // 4.1 — verifyWitness
  // --------------------------------------------------------------------------

  describe('4.1 — verifyWitness', () => {
    let tmpFile: string;

    beforeEach(() => { tmpFile = createTempRvfFile(); });
    afterEach(() => { cleanupFile(tmpFile); });

    it('should call verifyWitness during import and proceed when valid', () => {
      mocks.extractKernel.mockReturnValue({
        header: Buffer.from('hdr'),
        image: Buffer.from(makeBrainKernelJson()),
      });

      const result = importBrainFromRvf(db, tmpFile, {
        mergeStrategy: 'latest-wins',
      });

      expect(mocks.verifyWitness).toHaveBeenCalledOnce();
      expect(result.imported).toBeGreaterThanOrEqual(0);
    });

    it('should throw when verifyWitness reports invalid', () => {
      mocks.verifyWitness.mockReturnValue({
        valid: false,
        totalEntries: 5,
        errors: ['corrupted segment at offset 0x1A'],
      });
      mocks.extractKernel.mockReturnValue({
        header: Buffer.from('hdr'),
        image: Buffer.from(makeBrainKernelJson()),
      });

      expect(() =>
        importBrainFromRvf(db, tmpFile, { mergeStrategy: 'latest-wins' })
      ).toThrow(/witness verification failed/i);
    });

    it('should include error details in the thrown message', () => {
      mocks.verifyWitness.mockReturnValue({
        valid: false,
        totalEntries: 0,
        errors: ['bad checksum', 'missing leaf node'],
      });
      mocks.extractKernel.mockReturnValue({
        header: Buffer.from('hdr'),
        image: Buffer.from(makeBrainKernelJson()),
      });

      expect(() =>
        importBrainFromRvf(db, tmpFile, { mergeStrategy: 'latest-wins' })
      ).toThrow(/bad checksum; missing leaf node/);
    });

    it('should gracefully degrade when verifyWitness returns default (no native method)', () => {
      // Default mock returns { valid: true, totalEntries: 0, errors: [] }
      // which is the graceful degradation path
      mocks.extractKernel.mockReturnValue({
        header: Buffer.from('hdr'),
        image: Buffer.from(makeBrainKernelJson()),
      });

      const result = importBrainFromRvf(db, tmpFile, {
        mergeStrategy: 'latest-wins',
      });

      expect(mocks.verifyWitness).toHaveBeenCalledOnce();
      expect(result.imported).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // 4.2 — Ed25519 Signing
  // --------------------------------------------------------------------------

  describe('4.2 — Ed25519 Signing', () => {
    it('should not include signature when sign option is false', () => {
      seedMinimalData(db);

      const manifest = exportBrainToRvf(db, {
        outputPath: '/tmp/test-export.rvf',
        sign: false,
      });

      expect(manifest.signature).toBeUndefined();
      expect(manifest.signerKeyId).toBeUndefined();
      expect(mocks.sign).not.toHaveBeenCalled();
    });

    it('should not include signature when sign option is omitted', () => {
      seedMinimalData(db);

      const manifest = exportBrainToRvf(db, {
        outputPath: '/tmp/test-export.rvf',
      });

      expect(manifest.signature).toBeUndefined();
      expect(mocks.sign).not.toHaveBeenCalled();
    });

    it('should include signature when sign is true and native supports it', () => {
      seedMinimalData(db);
      mocks.sign.mockReturnValue('deadbeef0123456789abcdef');

      const manifest = exportBrainToRvf(db, {
        outputPath: '/tmp/test-export.rvf',
        sign: true,
        signerKeyId: 'my-key-v1',
      });

      expect(mocks.sign).toHaveBeenCalledOnce();
      expect(manifest.signature).toBe('deadbeef0123456789abcdef');
      expect(manifest.signerKeyId).toBe('my-key-v1');
    });

    it('should use default signerKeyId when not provided', () => {
      seedMinimalData(db);
      mocks.sign.mockReturnValue('abcd1234');

      const manifest = exportBrainToRvf(db, {
        outputPath: '/tmp/test-export.rvf',
        sign: true,
      });

      expect(manifest.signature).toBe('abcd1234');
      expect(manifest.signerKeyId).toBe('default');
    });

    it('should not include signature when native sign returns null', () => {
      seedMinimalData(db);
      mocks.sign.mockReturnValue(null);

      const manifest = exportBrainToRvf(db, {
        outputPath: '/tmp/test-export.rvf',
        sign: true,
      });

      expect(mocks.sign).toHaveBeenCalledOnce();
      expect(manifest.signature).toBeUndefined();
      expect(manifest.signerKeyId).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // 4.3 — Lineage Tracking
  // --------------------------------------------------------------------------

  describe('4.3 — Lineage Tracking', () => {
    it('should include lineage when native fileId is available', () => {
      seedMinimalData(db);
      mocks.fileId.mockReturnValue('rvf-abc-123');
      mocks.parentId.mockReturnValue('rvf-parent-456');
      mocks.lineageDepth.mockReturnValue(3);

      const manifest = exportBrainToRvf(db, {
        outputPath: '/tmp/test-export.rvf',
      });

      expect(manifest.lineage).toEqual({
        fileId: 'rvf-abc-123',
        parentId: 'rvf-parent-456',
        lineageDepth: 3,
      });
    });

    it('should not include lineage when native fileId returns null', () => {
      seedMinimalData(db);
      mocks.fileId.mockReturnValue(null);

      const manifest = exportBrainToRvf(db, {
        outputPath: '/tmp/test-export.rvf',
      });

      expect(manifest.lineage).toBeUndefined();
    });

    it('should handle lineage with null parentId (root file)', () => {
      seedMinimalData(db);
      mocks.fileId.mockReturnValue('rvf-root-001');
      mocks.parentId.mockReturnValue(null);
      mocks.lineageDepth.mockReturnValue(0);

      const manifest = exportBrainToRvf(db, {
        outputPath: '/tmp/test-export.rvf',
      });

      expect(manifest.lineage).toEqual({
        fileId: 'rvf-root-001',
        parentId: null,
        lineageDepth: 0,
      });
    });
  });

  // --------------------------------------------------------------------------
  // 4.4 — Metadata Per Vector
  // --------------------------------------------------------------------------

  describe('4.4 — Metadata Per Vector', () => {
    it('should include metadata when ingesting pattern embeddings', () => {
      seedMinimalData(db);
      // Add an embedding for the pattern
      const embedding = Buffer.alloc(384 * 4);
      new Float32Array(embedding.buffer).fill(0.1);
      db.prepare(`
        INSERT INTO qe_pattern_embeddings (pattern_id, embedding, dimension, model)
        VALUES (?, ?, ?, ?)
      `).run('p1', embedding, 384, 'test-model');

      mocks.ingest.mockReturnValue({ accepted: 1, rejected: 0 });

      exportBrainToRvf(db, { outputPath: '/tmp/test-export.rvf' });

      expect(mocks.ingest).toHaveBeenCalledOnce();
      const entries = mocks.ingest.mock.calls[0][0];
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('pe:p1');
      expect(entries[0].metadata).toEqual({ tableName: 'qe_pattern_embeddings' });
    });

    it('should include domain and confidence metadata for captured experiences', () => {
      seedMinimalData(db);
      const embedding = Buffer.alloc(384 * 4);
      new Float32Array(embedding.buffer).fill(0.2);
      db.prepare(`
        INSERT INTO captured_experiences (id, task, agent, domain, embedding, embedding_dimension, quality)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('exp1', 'test-task', 'test-agent', 'test-gen', embedding, 384, 0.85);

      mocks.ingest.mockReturnValue({ accepted: 1, rejected: 0 });

      exportBrainToRvf(db, { outputPath: '/tmp/test-export.rvf' });

      expect(mocks.ingest).toHaveBeenCalledOnce();
      const entries = mocks.ingest.mock.calls[0][0];
      const expEntry = entries.find((e: { id: string }) => e.id === 'exp:exp1');
      expect(expEntry).toBeDefined();
      expect(expEntry.metadata).toEqual({
        tableName: 'captured_experiences',
        domain: 'test-gen',
        confidence: 0.85,
      });
    });

    it('should include domain and confidence metadata for sona patterns', () => {
      seedMinimalData(db);
      const stateEmb = Buffer.alloc(384 * 4);
      new Float32Array(stateEmb.buffer).fill(0.3);
      db.prepare(`
        INSERT INTO sona_patterns (id, type, domain, action_type, state_embedding, confidence)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('sona1', 'test', 'test-gen', 'explore', stateEmb, 0.77);

      mocks.ingest.mockReturnValue({ accepted: 1, rejected: 0 });

      exportBrainToRvf(db, { outputPath: '/tmp/test-export.rvf' });

      expect(mocks.ingest).toHaveBeenCalledOnce();
      const entries = mocks.ingest.mock.calls[0][0];
      const sonaEntry = entries.find((e: { id: string }) => e.id === 'sona:sona1');
      expect(sonaEntry).toBeDefined();
      expect(sonaEntry.metadata).toEqual({
        tableName: 'sona_patterns',
        domain: 'test-gen',
        confidence: 0.77,
      });
    });
  });

  // --------------------------------------------------------------------------
  // 4.5 — Compact After Conflict Resolution
  // --------------------------------------------------------------------------

  describe('4.5 — Compact After Conflict Resolution', () => {
    let tmpFile: string;

    beforeEach(() => { tmpFile = createTempRvfFile(); });
    afterEach(() => { cleanupFile(tmpFile); });

    it('should call compact when there are conflicts during import', () => {
      // Pre-populate the DB with a conflicting pattern
      seedMinimalData(db);
      mocks.extractKernel.mockReturnValue({
        header: Buffer.from('hdr'),
        image: Buffer.from(makeBrainKernelJson()),
      });

      const result = importBrainFromRvf(db, tmpFile, {
        mergeStrategy: 'skip-conflicts',
      });

      // There should be 1 conflict (p1 already exists, skip-conflicts)
      expect(result.conflicts).toBe(1);
      expect(mocks.compact).toHaveBeenCalledOnce();
    });

    it('should NOT call compact when there are no conflicts', () => {
      // Empty DB, no conflicts expected
      mocks.extractKernel.mockReturnValue({
        header: Buffer.from('hdr'),
        image: Buffer.from(makeBrainKernelJson()),
      });

      const result = importBrainFromRvf(db, tmpFile, {
        mergeStrategy: 'latest-wins',
      });

      expect(result.conflicts).toBe(0);
      expect(mocks.compact).not.toHaveBeenCalled();
    });

    it('should not fail if compact throws an error', () => {
      seedMinimalData(db);
      mocks.compact.mockImplementation(() => {
        throw new Error('compact not supported');
      });
      mocks.extractKernel.mockReturnValue({
        header: Buffer.from('hdr'),
        image: Buffer.from(makeBrainKernelJson()),
      });

      // Should not throw — compact is best-effort
      const result = importBrainFromRvf(db, tmpFile, {
        mergeStrategy: 'skip-conflicts',
      });

      expect(result.conflicts).toBe(1);
      expect(result.imported).toBe(0);
      expect(mocks.compact).toHaveBeenCalledOnce();
    });
  });

  // --------------------------------------------------------------------------
  // Integration: all features together
  // --------------------------------------------------------------------------

  describe('Integration — all features together', () => {
    it('should produce a manifest with signature and lineage when all features are enabled', () => {
      seedMinimalData(db);
      mocks.sign.mockReturnValue('abcdef1234567890');
      mocks.fileId.mockReturnValue('rvf-file-xyz');
      mocks.parentId.mockReturnValue(null);
      mocks.lineageDepth.mockReturnValue(0);

      const manifest = exportBrainToRvf(db, {
        outputPath: '/tmp/test-export.rvf',
        sign: true,
        signerKeyId: 'integration-key',
      });

      expect(manifest.version).toBe('3.0');
      expect(manifest.format).toBe('rvf');
      expect(manifest.signature).toBe('abcdef1234567890');
      expect(manifest.signerKeyId).toBe('integration-key');
      expect(manifest.lineage).toEqual({
        fileId: 'rvf-file-xyz',
        parentId: null,
        lineageDepth: 0,
      });
      expect(manifest.checksum).toBeDefined();
      expect(manifest.stats.patternCount).toBe(1);
    });

    it('should degrade gracefully when no native features are available', () => {
      seedMinimalData(db);
      // All native methods return null/default (graceful degradation)
      mocks.sign.mockReturnValue(null);
      mocks.fileId.mockReturnValue(null);

      const manifest = exportBrainToRvf(db, {
        outputPath: '/tmp/test-export.rvf',
        sign: true,
      });

      // No signature, no lineage — but export still works
      expect(manifest.signature).toBeUndefined();
      expect(manifest.lineage).toBeUndefined();
      expect(manifest.version).toBe('3.0');
      expect(manifest.stats.patternCount).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // isRvfAvailable
  // --------------------------------------------------------------------------

  describe('isRvfAvailable', () => {
    it('should return true when native adapter is available', () => {
      expect(isRvfAvailable()).toBe(true);
    });
  });
});
