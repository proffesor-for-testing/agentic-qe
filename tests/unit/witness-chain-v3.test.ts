/**
 * Witness Chain V3 Tests - SHAKE-256, Ed25519, Backfill, Archival
 * ADR-070: Witness Chain Audit Compliance (Phase 6)
 *
 * 25+ tests covering:
 * - SHAKE-256 hashing with SHA-256 fallback
 * - Hash algorithm detection in verify()
 * - Ed25519 key generation, signing, verification
 * - Key rotation with KEY_ROTATION witness entry
 * - Signature verification in verify({ checkSignatures: true })
 * - getPatternLineage
 * - getActorHistory with and without since parameter
 * - Backfill creates missing entries, is idempotent
 * - Archival moves old entries, preserves genesis
 * - New action types accepted
 * - Mixed SHA-256/SHAKE-256 chain verification
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import {
  createWitnessChain,
  GENESIS_PREV_HASH,
  sha256,
  shake256,
  hashWith,
  serializeEntry,
  type WitnessChain,
  type WitnessEntry,
  type WitnessActionType,
} from '../../src/audit/witness-chain.js';
import { WitnessKeyManager } from '../../src/audit/witness-key-manager.js';
import { backfillWitnessChain } from '../../src/audit/witness-backfill.js';

// ============================================================================
// Helpers
// ============================================================================

function createTestDb(): Database.Database {
  return new Database(':memory:');
}

async function makeChain(
  db?: Database.Database,
  keyManager?: WitnessKeyManager
): Promise<{ chain: WitnessChain; db: Database.Database }> {
  const database = db ?? createTestDb();
  const chain = createWitnessChain(database, keyManager);
  await chain.initialize();
  return { chain, db: database };
}

function createPatternsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS qe_patterns (
      id TEXT PRIMARY KEY,
      pattern_type TEXT NOT NULL DEFAULT 'test',
      qe_domain TEXT NOT NULL DEFAULT 'test-domain',
      domain TEXT NOT NULL DEFAULT 'test-domain',
      name TEXT NOT NULL DEFAULT 'Test Pattern',
      description TEXT,
      confidence REAL DEFAULT 0.5,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

// ============================================================================
// 6.1: SHAKE-256 Hash Algorithm Upgrade
// ============================================================================

describe('6.1: SHAKE-256 Hash Algorithm', () => {
  it('should compute SHAKE-256 hash with 32-byte output', () => {
    const hash = shake256('test data');
    expect(hash).toHaveLength(64); // 32 bytes = 64 hex chars
    // Verify it differs from SHA-256
    const sha = sha256('test data');
    expect(hash).not.toBe(sha);
  });

  it('should compute SHA-256 hash correctly', () => {
    const hash = sha256('test data');
    const expected = createHash('sha256').update('test data', 'utf-8').digest('hex');
    expect(hash).toBe(expected);
  });

  it('should use hashWith to dispatch by algorithm name', () => {
    const data = 'hello world';
    expect(hashWith('sha256', data)).toBe(sha256(data));
    expect(hashWith('shake256', data)).toBe(shake256(data));
  });

  it('should set hash_algo to shake256 on new entries', async () => {
    const { chain } = await makeChain();
    const entry = chain.append('PATTERN_CREATE', { id: 'p1' }, 'system');

    expect(entry.hash_algo).toBe('shake256');
    expect(entry.action_hash).toBe(shake256(JSON.stringify({ id: 'p1' })));
  });

  it('should detect hash algorithm per entry in verify()', async () => {
    const { chain, db } = await makeChain();

    // Insert a legacy SHA-256 entry directly
    const actionData = JSON.stringify({ legacy: true });
    const actionHash = sha256(actionData);
    db.prepare(
      `INSERT INTO witness_chain
       (prev_hash, action_hash, action_type, action_data, timestamp, actor, hash_algo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(GENESIS_PREV_HASH, actionHash, 'PATTERN_CREATE', actionData, new Date().toISOString(), 'system', 'sha256');

    // Append a SHAKE-256 entry through the API
    chain.append('PATTERN_UPDATE', { updated: true }, 'system');

    const result = chain.verify();
    expect(result.valid).toBe(true);
    expect(result.entriesChecked).toBe(2);
  });

  it('should verify a mixed SHA-256/SHAKE-256 chain', async () => {
    const { chain, db } = await makeChain();

    // Insert 3 legacy SHA-256 entries manually
    const ts = new Date().toISOString();
    const data1 = JSON.stringify({ step: 1 });
    const hash1 = sha256(data1);
    db.prepare(
      `INSERT INTO witness_chain
       (prev_hash, action_hash, action_type, action_data, timestamp, actor, hash_algo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(GENESIS_PREV_HASH, hash1, 'PATTERN_CREATE', data1, ts, 'legacy', 'sha256');

    const entry1 = db.prepare('SELECT * FROM witness_chain WHERE id = 1').get() as WitnessEntry;
    const data2 = JSON.stringify({ step: 2 });
    const hash2 = sha256(data2);
    const prevHash2 = sha256(serializeEntry(entry1));
    db.prepare(
      `INSERT INTO witness_chain
       (prev_hash, action_hash, action_type, action_data, timestamp, actor, hash_algo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(prevHash2, hash2, 'PATTERN_UPDATE', data2, ts, 'legacy', 'sha256');

    // Now append a SHAKE-256 entry via the API
    chain.append('PATTERN_PROMOTE', { step: 3 }, 'modern');

    const result = chain.verify();
    expect(result.valid).toBe(true);
    expect(result.entriesChecked).toBe(3);
  });
});

// ============================================================================
// 6.2: Ed25519 Signing
// ============================================================================

describe('6.2: Ed25519 Signing', () => {
  it('should generate an Ed25519 key pair', () => {
    const km = new WitnessKeyManager();
    const keyId = km.getActiveKeyId();
    expect(keyId).toHaveLength(16); // truncated SHA-256 of public key
    expect(km.getKeyCount()).toBe(1);
  });

  it('should sign and verify data', () => {
    const km = new WitnessKeyManager();
    const data = Buffer.from('test data to sign');
    const { signature, keyId } = km.sign(data);

    expect(signature).toBeInstanceOf(Buffer);
    expect(signature.length).toBe(64); // Ed25519 signatures are 64 bytes
    expect(km.verify(data, signature, keyId)).toBe(true);
  });

  it('should reject invalid signatures', () => {
    const km = new WitnessKeyManager();
    const data = Buffer.from('original data');
    const { signature, keyId } = km.sign(data);

    const tamperedData = Buffer.from('tampered data');
    expect(km.verify(tamperedData, signature, keyId)).toBe(false);
  });

  it('should reject unknown key IDs', () => {
    const km = new WitnessKeyManager();
    const data = Buffer.from('test');
    expect(km.verify(data, Buffer.alloc(64), 'unknown-key-id')).toBe(false);
  });

  it('should sign entries when keyManager is provided', async () => {
    const km = new WitnessKeyManager();
    const { chain } = await makeChain(undefined, km);

    const entry = chain.append('PATTERN_CREATE', { id: 'signed-1' }, 'signer');

    expect(entry.signature).toBeTruthy();
    expect(entry.signer_key_id).toBe(km.getActiveKeyId());
    expect(typeof entry.signature).toBe('string');
  });

  it('should not sign entries when no keyManager is provided', async () => {
    const { chain } = await makeChain();
    const entry = chain.append('PATTERN_CREATE', { id: 'unsigned' }, 'system');

    expect(entry.signature).toBeNull();
    expect(entry.signer_key_id).toBeNull();
  });

  it('should verify signatures with verify({ checkSignatures: true })', async () => {
    const km = new WitnessKeyManager();
    const { chain } = await makeChain(undefined, km);

    chain.append('PATTERN_CREATE', { id: 'p1' }, 'agent-a');
    chain.append('PATTERN_UPDATE', { id: 'p1' }, 'agent-b');
    chain.append('QUALITY_GATE_PASS', { score: 0.9 }, 'gate');

    const result = chain.verify({ checkSignatures: true });
    expect(result.valid).toBe(true);
    expect(result.signatureFailures).toBe(0);
    expect(result.entriesChecked).toBe(3);
  });

  it('should detect tampered signatures', async () => {
    const km = new WitnessKeyManager();
    const db = createTestDb();
    const { chain } = await makeChain(db, km);

    chain.append('PATTERN_CREATE', { id: 'p1' }, 'agent');
    chain.append('PATTERN_UPDATE', { id: 'p1' }, 'agent');

    // Tamper with the signature of entry 2
    db.prepare("UPDATE witness_chain SET signature = 'deadbeef' || substr(signature, 9) WHERE id = 2").run();

    const result = chain.verify({ checkSignatures: true });
    expect(result.valid).toBe(false);
    expect(result.signatureFailures).toBeGreaterThan(0);
  });

  it('should support key rotation', () => {
    const km = new WitnessKeyManager();
    const oldKeyId = km.getActiveKeyId();

    const { oldKeyId: returned, newKeyId } = km.rotateKey();
    expect(returned).toBe(oldKeyId);
    expect(newKeyId).not.toBe(oldKeyId);
    expect(km.getActiveKeyId()).toBe(newKeyId);
    expect(km.getKeyCount()).toBe(2);

    // Old key should still verify old signatures
    const data = Buffer.from('signed with old');
    const { signature } = km.sign(data, oldKeyId);
    expect(km.verify(data, signature, oldKeyId)).toBe(true);
  });

  it('should record KEY_ROTATION in witness chain', async () => {
    const km = new WitnessKeyManager();
    const { chain } = await makeChain(undefined, km);

    const { oldKeyId, newKeyId } = km.rotateKey();
    chain.append('KEY_ROTATION', { oldKeyId, newKeyId }, 'key-manager');

    const entries = chain.getEntries({ action_type: 'KEY_ROTATION' });
    expect(entries).toHaveLength(1);
    const data = JSON.parse(entries[0].action_data);
    expect(data.oldKeyId).toBe(oldKeyId);
    expect(data.newKeyId).toBe(newKeyId);
  });
});

// ============================================================================
// 6.3: Expanded Action Types
// ============================================================================

describe('6.3: Expanded Action Types', () => {
  it('should accept BRANCH_MERGE action type', async () => {
    const { chain } = await makeChain();
    const entry = chain.append('BRANCH_MERGE', { branchId: 'b-1' }, 'dream-engine');
    expect(entry.action_type).toBe('BRANCH_MERGE');
  });

  it('should accept HEBBIAN_PENALTY action type', async () => {
    const { chain } = await makeChain();
    const entry = chain.append('HEBBIAN_PENALTY', { patternId: 'p-1', penalty: -0.05 }, 'hebbian');
    expect(entry.action_type).toBe('HEBBIAN_PENALTY');
  });

  it('should accept KEY_ROTATION action type', async () => {
    const { chain } = await makeChain();
    const entry = chain.append('KEY_ROTATION', { oldKey: 'k1', newKey: 'k2' }, 'key-mgr');
    expect(entry.action_type).toBe('KEY_ROTATION');
  });

  it('should maintain valid chain with all 12 action types', async () => {
    const { chain } = await makeChain();
    const allTypes: WitnessActionType[] = [
      'PATTERN_CREATE', 'PATTERN_UPDATE', 'PATTERN_PROMOTE', 'PATTERN_QUARANTINE',
      'DREAM_MERGE', 'DREAM_DISCARD',
      'QUALITY_GATE_PASS', 'QUALITY_GATE_FAIL',
      'ROUTING_DECISION',
      'BRANCH_MERGE', 'HEBBIAN_PENALTY', 'KEY_ROTATION',
    ];

    for (const t of allTypes) {
      chain.append(t, { type: t }, 'test');
    }

    expect(chain.getChainLength()).toBe(12);
    const result = chain.verify();
    expect(result.valid).toBe(true);
    expect(result.entriesChecked).toBe(12);
  });
});

// ============================================================================
// 6.4: Query Methods
// ============================================================================

describe('6.4: Query Methods', () => {
  describe('getPatternLineage', () => {
    it('should return all entries for a given pattern ID (patternId key)', async () => {
      const { chain } = await makeChain();
      chain.append('PATTERN_CREATE', { patternId: 'p-abc' }, 'system');
      chain.append('PATTERN_UPDATE', { patternId: 'p-abc', conf: 0.8 }, 'system');
      chain.append('PATTERN_CREATE', { patternId: 'p-other' }, 'system');
      chain.append('PATTERN_PROMOTE', { patternId: 'p-abc' }, 'system');

      const lineage = chain.getPatternLineage('p-abc');
      expect(lineage).toHaveLength(3);
      lineage.forEach((e) => {
        expect(JSON.parse(e.action_data).patternId).toBe('p-abc');
      });
    });

    it('should return entries using pattern_id key', async () => {
      const { chain } = await makeChain();
      chain.append('PATTERN_CREATE', { pattern_id: 'p-snake' }, 'system');
      chain.append('PATTERN_UPDATE', { pattern_id: 'p-snake' }, 'system');

      const lineage = chain.getPatternLineage('p-snake');
      expect(lineage).toHaveLength(2);
    });

    it('should return empty array for non-existent pattern', async () => {
      const { chain } = await makeChain();
      chain.append('PATTERN_CREATE', { patternId: 'p-exists' }, 'system');

      expect(chain.getPatternLineage('p-does-not-exist')).toHaveLength(0);
    });
  });

  describe('getActorHistory', () => {
    it('should return all entries for a given actor', async () => {
      const { chain } = await makeChain();
      chain.append('PATTERN_CREATE', { id: '1' }, 'alice');
      chain.append('PATTERN_CREATE', { id: '2' }, 'bob');
      chain.append('PATTERN_UPDATE', { id: '1' }, 'alice');
      chain.append('QUALITY_GATE_PASS', { score: 0.9 }, 'bob');

      const aliceHistory = chain.getActorHistory('alice');
      expect(aliceHistory).toHaveLength(2);
      aliceHistory.forEach((e) => expect(e.actor).toBe('alice'));

      const bobHistory = chain.getActorHistory('bob');
      expect(bobHistory).toHaveLength(2);
    });

    it('should filter by since parameter', async () => {
      const { chain } = await makeChain();
      chain.append('PATTERN_CREATE', { id: '1' }, 'alice');
      const entries = chain.getEntries();
      const firstTs = entries[0].timestamp;

      // Small delay to get a different timestamp
      const futureTs = new Date(Date.now() + 1000).toISOString();
      chain.append('PATTERN_UPDATE', { id: '1' }, 'alice');

      const sinceFirst = chain.getActorHistory('alice', firstTs);
      expect(sinceFirst).toHaveLength(2);

      const sinceFuture = chain.getActorHistory('alice', futureTs);
      expect(sinceFuture).toHaveLength(0);
    });

    it('should return empty for unknown actor', async () => {
      const { chain } = await makeChain();
      chain.append('PATTERN_CREATE', { id: '1' }, 'known-actor');
      expect(chain.getActorHistory('unknown-actor')).toHaveLength(0);
    });
  });
});

// ============================================================================
// 6.5: Retroactive Backfill
// ============================================================================

describe('6.5: Backfill', () => {
  it('should create PATTERN_CREATE entries for uncovered patterns', async () => {
    const db = createTestDb();
    const { chain } = await makeChain(db);
    createPatternsTable(db);

    // Insert patterns without witness entries
    db.prepare("INSERT INTO qe_patterns (id, name) VALUES ('p-1', 'Pattern 1')").run();
    db.prepare("INSERT INTO qe_patterns (id, name) VALUES ('p-2', 'Pattern 2')").run();

    const result = backfillWitnessChain(db, chain);
    expect(result.created).toBe(2);
    expect(result.skipped).toBe(0);

    // Verify the witness entries
    const entries = chain.getEntries({ action_type: 'PATTERN_CREATE' });
    expect(entries).toHaveLength(2);

    const data = JSON.parse(entries[0].action_data);
    expect(data.backfilled).toBe(true);
    expect(data.patternId).toBe('p-1');
  });

  it('should be idempotent (running twice creates zero new entries)', async () => {
    const db = createTestDb();
    const { chain } = await makeChain(db);
    createPatternsTable(db);

    db.prepare("INSERT INTO qe_patterns (id, name) VALUES ('p-1', 'Pattern 1')").run();

    const first = backfillWitnessChain(db, chain);
    expect(first.created).toBe(1);

    const second = backfillWitnessChain(db, chain);
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(1);
  });

  it('should skip patterns that already have witness entries', async () => {
    const db = createTestDb();
    const { chain } = await makeChain(db);
    createPatternsTable(db);

    // Insert pattern and its witness entry
    db.prepare("INSERT INTO qe_patterns (id, name) VALUES ('p-covered', 'Covered')").run();
    chain.append('PATTERN_CREATE', { patternId: 'p-covered' }, 'system');

    // Insert uncovered pattern
    db.prepare("INSERT INTO qe_patterns (id, name) VALUES ('p-new', 'New')").run();

    const result = backfillWitnessChain(db, chain);
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('should return zero counts when qe_patterns table does not exist', async () => {
    const db = createTestDb();
    const { chain } = await makeChain(db);
    // Don't create qe_patterns table

    const result = backfillWitnessChain(db, chain);
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it('should maintain valid chain after backfill', async () => {
    const db = createTestDb();
    const { chain } = await makeChain(db);
    createPatternsTable(db);

    db.prepare("INSERT INTO qe_patterns (id, name) VALUES ('p-1', 'P1')").run();
    db.prepare("INSERT INTO qe_patterns (id, name) VALUES ('p-2', 'P2')").run();
    db.prepare("INSERT INTO qe_patterns (id, name) VALUES ('p-3', 'P3')").run();

    backfillWitnessChain(db, chain);

    const result = chain.verify();
    expect(result.valid).toBe(true);
    expect(result.entriesChecked).toBe(3);
  });
});

// ============================================================================
// 6.6: Archival / Compaction
// ============================================================================

describe('6.6: Archival', () => {
  it('should archive entries older than the threshold', async () => {
    const { chain, db } = await makeChain();

    // Insert entries with old timestamps
    const oldTs = '2020-01-01T00:00:00.000Z';
    const newTs = new Date().toISOString();

    chain.append('PATTERN_CREATE', { id: '1' }, 'system'); // id=1, genesis
    // Manually backdate entries 2 and 3
    db.prepare(
      `INSERT INTO witness_chain
       (prev_hash, action_hash, action_type, action_data, timestamp, actor, hash_algo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run('a'.repeat(64), sha256('{}'), 'PATTERN_UPDATE', '{}', oldTs, 'old-actor', 'sha256');
    db.prepare(
      `INSERT INTO witness_chain
       (prev_hash, action_hash, action_type, action_data, timestamp, actor, hash_algo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run('b'.repeat(64), sha256('{}'), 'PATTERN_PROMOTE', '{}', oldTs, 'old-actor', 'sha256');

    // Add a recent entry via the API
    chain.append('QUALITY_GATE_PASS', { recent: true }, 'new-actor');

    expect(chain.getChainLength()).toBe(4);

    const result = chain.archiveEntries('2021-01-01T00:00:00.000Z');
    expect(result.archived).toBe(2);

    // Main table should have genesis + the new entry
    expect(chain.getChainLength()).toBe(2);

    // Archive table should have the 2 old entries
    const archived = db.prepare('SELECT COUNT(*) as count FROM witness_chain_archive').get() as { count: number };
    expect(archived.count).toBe(2);
  });

  it('should never archive the genesis entry (id=1)', async () => {
    const { chain, db } = await makeChain();

    // Genesis entry with old timestamp
    chain.append('PATTERN_CREATE', { genesis: true }, 'system');
    // Backdate the genesis entry
    db.prepare("UPDATE witness_chain SET timestamp = '2000-01-01T00:00:00.000Z' WHERE id = 1").run();

    const result = chain.archiveEntries('2025-01-01T00:00:00.000Z');
    expect(result.archived).toBe(0);

    // Genesis still in main table
    expect(chain.getChainLength()).toBe(1);
  });

  it('should return zero when no entries qualify', async () => {
    const { chain } = await makeChain();
    chain.append('PATTERN_CREATE', { id: '1' }, 'system');

    const result = chain.archiveEntries('1999-01-01T00:00:00.000Z');
    expect(result.archived).toBe(0);
  });

  it('should be idempotent (archiving twice does not double-archive)', async () => {
    const { chain, db } = await makeChain();

    chain.append('PATTERN_CREATE', { genesis: true }, 'system');
    db.prepare(
      `INSERT INTO witness_chain
       (prev_hash, action_hash, action_type, action_data, timestamp, actor, hash_algo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run('x'.repeat(64), sha256('{}'), 'PATTERN_UPDATE', '{}', '2020-06-01T00:00:00.000Z', 'old', 'sha256');

    chain.archiveEntries('2021-01-01T00:00:00.000Z');
    const secondResult = chain.archiveEntries('2021-01-01T00:00:00.000Z');
    expect(secondResult.archived).toBe(0);

    const archived = db.prepare('SELECT COUNT(*) as count FROM witness_chain_archive').get() as { count: number };
    expect(archived.count).toBe(1);
  });
});

// ============================================================================
// Cross-cutting: Database schema migration
// ============================================================================

// ============================================================================
// 6.2b: Key Persistence (PEM files)
// ============================================================================

describe('6.2b: Key Persistence', () => {
  let tmpKeyDir: string;

  beforeEach(() => {
    const { mkdtempSync } = require('fs');
    const { join } = require('path');
    const os = require('os');
    tmpKeyDir = mkdtempSync(join(os.tmpdir(), 'witness-keys-'));
  });

  it('should persist keys to PEM files and reload them', () => {
    // Create manager with keyDir — auto-generates a key and persists
    const km1 = new WitnessKeyManager({ keyDir: tmpKeyDir });
    const keyId1 = km1.getActiveKeyId();
    expect(km1.getKeyCount()).toBe(1);

    // Sign something with the first manager
    const data = Buffer.from('hello witness', 'utf-8');
    const { signature } = km1.sign(data);

    // Create a second manager from the same keyDir — should load without generating
    const km2 = new WitnessKeyManager({ keyDir: tmpKeyDir });
    expect(km2.getKeyCount()).toBe(1);
    expect(km2.getActiveKeyId()).toBe(keyId1);

    // Verify the signature from km1 using km2
    expect(km2.verify(data, signature, keyId1)).toBe(true);
  });

  it('should persist rotated keys and restore active key pointer', () => {
    const km1 = new WitnessKeyManager({ keyDir: tmpKeyDir });
    const firstKeyId = km1.getActiveKeyId();
    const { newKeyId } = km1.rotateKey();
    expect(km1.getKeyCount()).toBe(2);

    // Reload from disk
    const km2 = new WitnessKeyManager({ keyDir: tmpKeyDir });
    expect(km2.getKeyCount()).toBe(2);
    expect(km2.getActiveKeyId()).toBe(newKeyId);
    expect(km2.hasKey(firstKeyId)).toBe(true);
  });

  it('should not auto-generate if keys already exist on disk', () => {
    // First manager creates a key
    new WitnessKeyManager({ keyDir: tmpKeyDir });

    // Second manager should load from disk, not generate a new one
    const km2 = new WitnessKeyManager({ keyDir: tmpKeyDir });
    expect(km2.getKeyCount()).toBe(1);
  });

  it('should work without keyDir (in-memory only)', () => {
    const km = new WitnessKeyManager();
    expect(km.getKeyCount()).toBe(1);
    const data = Buffer.from('test', 'utf-8');
    const { signature, keyId } = km.sign(data);
    expect(km.verify(data, signature, keyId)).toBe(true);
  });
});

describe('Schema migration', () => {
  it('should add new columns to existing table without data loss', async () => {
    const db = createTestDb();

    // Create table without new columns (simulating old schema)
    db.exec(`
      CREATE TABLE witness_chain (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prev_hash TEXT NOT NULL,
        action_hash TEXT NOT NULL,
        action_type TEXT NOT NULL,
        action_data TEXT,
        timestamp TEXT NOT NULL,
        actor TEXT NOT NULL
      )
    `);

    // Insert a legacy entry
    db.prepare(
      `INSERT INTO witness_chain (prev_hash, action_hash, action_type, action_data, timestamp, actor)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(GENESIS_PREV_HASH, sha256('{}'), 'PATTERN_CREATE', '{}', new Date().toISOString(), 'legacy');

    // Initialize chain (should add missing columns)
    const chain = createWitnessChain(db);
    await chain.initialize();

    // Legacy entry should still be there
    expect(chain.getChainLength()).toBe(1);

    // New entry should work with new columns
    const entry = chain.append('PATTERN_UPDATE', { migrated: true }, 'system');
    expect(entry.hash_algo).toBe('shake256');
    expect(chain.getChainLength()).toBe(2);
  });
});
