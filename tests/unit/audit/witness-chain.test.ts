/**
 * Tests for WitnessChain - Cryptographic Audit Trail
 * ADR-070: Witness Chain Audit Compliance
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createWitnessChain, GENESIS_PREV_HASH } from '../../../src/audit/witness-chain.js';
import type { WitnessChain, WitnessEntry } from '../../../src/audit/witness-chain.js';
import { createHash } from 'crypto';

function sha256(data: string): string {
  return createHash('sha256').update(data, 'utf-8').digest('hex');
}

function serializeEntry(entry: WitnessEntry): string {
  return JSON.stringify({
    id: entry.id,
    prev_hash: entry.prev_hash,
    action_hash: entry.action_hash,
    action_type: entry.action_type,
    action_data: entry.action_data,
    timestamp: entry.timestamp,
    actor: entry.actor,
  });
}

describe('WitnessChain', () => {
  let chain: WitnessChain;
  let db: Database.Database;

  beforeEach(async () => {
    db = new Database(':memory:');
    chain = createWitnessChain(db);
    await chain.initialize();
  });

  // --------------------------------------------------------------------------
  // Chain creation and append
  // --------------------------------------------------------------------------

  describe('append', () => {
    it('should create a genesis entry with zero prev_hash', () => {
      const entry = chain.append('PATTERN_CREATE', { patternId: 'p1' }, 'reasoning-bank');

      expect(entry.id).toBe(1);
      expect(entry.prev_hash).toBe(GENESIS_PREV_HASH);
      expect(entry.action_type).toBe('PATTERN_CREATE');
      expect(entry.actor).toBe('reasoning-bank');
      expect(entry.action_hash).toBe(sha256(JSON.stringify({ patternId: 'p1' })));
    });

    it('should chain entries with correct prev_hash', () => {
      const first = chain.append('PATTERN_CREATE', { id: '1' }, 'system');
      const second = chain.append('PATTERN_UPDATE', { id: '1', delta: 0.1 }, 'system');

      expect(second.prev_hash).toBe(sha256(serializeEntry(first)));
    });

    it('should increment IDs', () => {
      const e1 = chain.append('QUALITY_GATE_PASS', {}, 'quality-gate');
      const e2 = chain.append('QUALITY_GATE_FAIL', {}, 'quality-gate');
      const e3 = chain.append('ROUTING_DECISION', {}, 'router');

      expect(e1.id).toBe(1);
      expect(e2.id).toBe(2);
      expect(e3.id).toBe(3);
    });

    it('should store action_data as JSON', () => {
      const data = { patternId: 'abc', confidence: 0.95, tags: ['a', 'b'] };
      const entry = chain.append('PATTERN_CREATE', data, 'test');

      expect(JSON.parse(entry.action_data)).toEqual(data);
    });

    it('should record ISO timestamp', () => {
      const before = new Date().toISOString();
      const entry = chain.append('DREAM_MERGE', {}, 'dream-engine');
      const after = new Date().toISOString();

      expect(entry.timestamp >= before).toBe(true);
      expect(entry.timestamp <= after).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Hash chain integrity verification
  // --------------------------------------------------------------------------

  describe('verify', () => {
    it('should return valid for an empty chain', () => {
      const result = chain.verify();
      expect(result.valid).toBe(true);
      expect(result.entriesChecked).toBe(0);
    });

    it('should return valid for a single-entry chain', () => {
      chain.append('PATTERN_CREATE', { id: '1' }, 'system');

      const result = chain.verify();
      expect(result.valid).toBe(true);
      expect(result.entriesChecked).toBe(1);
    });

    it('should return valid for a multi-entry chain', () => {
      chain.append('PATTERN_CREATE', { id: '1' }, 'system');
      chain.append('PATTERN_UPDATE', { id: '1', conf: 0.8 }, 'system');
      chain.append('PATTERN_PROMOTE', { id: '1' }, 'system');
      chain.append('QUALITY_GATE_PASS', { gate: 'deploy' }, 'quality-gate');
      chain.append('ROUTING_DECISION', { agent: 'coder' }, 'router');

      const result = chain.verify();
      expect(result.valid).toBe(true);
      expect(result.entriesChecked).toBe(5);
    });
  });

  // --------------------------------------------------------------------------
  // Tamper detection
  // --------------------------------------------------------------------------

  describe('tamper detection', () => {
    it('should detect tampered action_data', () => {
      chain.append('PATTERN_CREATE', { id: '1' }, 'system');
      chain.append('PATTERN_UPDATE', { id: '1', conf: 0.8 }, 'system');
      chain.append('QUALITY_GATE_PASS', { gate: 'deploy' }, 'quality-gate');

      // Tamper with the second entry's action_data
      db.prepare('UPDATE witness_chain SET action_data = ? WHERE id = 2').run(
        JSON.stringify({ id: '1', conf: 0.99, tampered: true })
      );

      const result = chain.verify();
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(2);
    });

    it('should detect tampered prev_hash', () => {
      chain.append('PATTERN_CREATE', { id: '1' }, 'system');
      chain.append('PATTERN_UPDATE', { id: '1' }, 'system');

      // Tamper with prev_hash of entry 2
      db.prepare('UPDATE witness_chain SET prev_hash = ? WHERE id = 2').run('deadbeef'.repeat(8));

      const result = chain.verify();
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(2);
    });

    it('should detect tampered genesis prev_hash', () => {
      chain.append('PATTERN_CREATE', { id: '1' }, 'system');

      db.prepare('UPDATE witness_chain SET prev_hash = ? WHERE id = 1').run('abc123');

      const result = chain.verify();
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(1);
    });

    it('should detect deleted middle entry by broken hash chain', () => {
      chain.append('PATTERN_CREATE', { id: '1' }, 'system');
      chain.append('PATTERN_UPDATE', { id: '1' }, 'system');
      chain.append('PATTERN_PROMOTE', { id: '1' }, 'system');

      // Delete the middle entry
      db.prepare('DELETE FROM witness_chain WHERE id = 2').run();

      const result = chain.verify();
      // Entry 3's prev_hash was computed against entry 2, but entry 2 is gone.
      // So entry 3's prev_hash won't match hash of entry 1.
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(3);
    });
  });

  // --------------------------------------------------------------------------
  // Filtering by action_type
  // --------------------------------------------------------------------------

  describe('getEntries with filters', () => {
    beforeEach(() => {
      chain.append('PATTERN_CREATE', { id: '1' }, 'reasoning-bank');
      chain.append('QUALITY_GATE_PASS', { gate: 'ci' }, 'quality-gate');
      chain.append('PATTERN_UPDATE', { id: '1' }, 'reasoning-bank');
      chain.append('QUALITY_GATE_FAIL', { gate: 'deploy' }, 'quality-gate');
      chain.append('PATTERN_PROMOTE', { id: '1' }, 'reasoning-bank');
    });

    it('should return all entries without filter', () => {
      const entries = chain.getEntries();
      expect(entries).toHaveLength(5);
    });

    it('should filter by action_type', () => {
      const gates = chain.getEntries({ action_type: 'QUALITY_GATE_PASS' });
      expect(gates).toHaveLength(1);
      expect(gates[0].action_type).toBe('QUALITY_GATE_PASS');
    });

    it('should filter by actor', () => {
      const bankEntries = chain.getEntries({ actor: 'reasoning-bank' });
      expect(bankEntries).toHaveLength(3);
      bankEntries.forEach(e => expect(e.actor).toBe('reasoning-bank'));
    });

    it('should support limit and offset', () => {
      const page1 = chain.getEntries({ limit: 2 });
      expect(page1).toHaveLength(2);
      expect(page1[0].id).toBe(1);
      expect(page1[1].id).toBe(2);

      const page2 = chain.getEntries({ limit: 2, offset: 2 });
      expect(page2).toHaveLength(2);
      expect(page2[0].id).toBe(3);
    });
  });

  // --------------------------------------------------------------------------
  // getChainLength
  // --------------------------------------------------------------------------

  describe('getChainLength', () => {
    it('should return 0 for empty chain', () => {
      expect(chain.getChainLength()).toBe(0);
    });

    it('should return correct count after appends', () => {
      chain.append('PATTERN_CREATE', {}, 'system');
      chain.append('PATTERN_UPDATE', {}, 'system');
      chain.append('DREAM_MERGE', {}, 'dream-engine');
      expect(chain.getChainLength()).toBe(3);
    });
  });

  // --------------------------------------------------------------------------
  // Genesis entry specifics
  // --------------------------------------------------------------------------

  describe('genesis entry', () => {
    it('should have prev_hash of all zeros (64 chars)', () => {
      const entry = chain.append('PATTERN_CREATE', { genesis: true }, 'system');

      expect(entry.prev_hash).toBe('0'.repeat(64));
      expect(entry.prev_hash).toHaveLength(64);
    });

    it('should have correct action_hash', () => {
      const data = { genesis: true };
      const entry = chain.append('PATTERN_CREATE', data, 'system');

      const expectedHash = sha256(JSON.stringify(data));
      expect(entry.action_hash).toBe(expectedHash);
    });
  });

  // --------------------------------------------------------------------------
  // All action types
  // --------------------------------------------------------------------------

  describe('action types', () => {
    it('should accept all defined action types', () => {
      const types = [
        'PATTERN_CREATE',
        'PATTERN_UPDATE',
        'PATTERN_PROMOTE',
        'PATTERN_QUARANTINE',
        'DREAM_MERGE',
        'DREAM_DISCARD',
        'QUALITY_GATE_PASS',
        'QUALITY_GATE_FAIL',
        'ROUTING_DECISION',
      ] as const;

      for (const type of types) {
        const entry = chain.append(type, { type }, 'test');
        expect(entry.action_type).toBe(type);
      }

      expect(chain.getChainLength()).toBe(types.length);

      // Entire chain should still be valid
      const result = chain.verify();
      expect(result.valid).toBe(true);
    });
  });
});
