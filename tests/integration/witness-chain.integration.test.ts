/**
 * Witness Chain Integration Tests
 *
 * Tests the SHA-256 hash-chained tamper-evident audit log with real
 * in-memory SQLite (better-sqlite3). Validates append, verify, filtering,
 * tamper detection, ordering under rapid appends, and concurrent access.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  WitnessChain,
  createWitnessChain,
  type WitnessActionType,
  type WitnessEntry,
} from '../../src/audit/witness-chain.js';
import { createHash } from 'crypto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestDb(): InstanceType<typeof Database> {
  return new Database(':memory:');
}

async function createInitializedChain(): Promise<{
  chain: WitnessChain;
  db: InstanceType<typeof Database>;
}> {
  const db = createTestDb();
  const chain = createWitnessChain(db);
  await chain.initialize();
  return { chain, db };
}

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

const ALL_ACTION_TYPES: WitnessActionType[] = [
  'PATTERN_CREATE',
  'PATTERN_UPDATE',
  'PATTERN_PROMOTE',
  'PATTERN_QUARANTINE',
  'DREAM_MERGE',
  'DREAM_DISCARD',
  'QUALITY_GATE_PASS',
  'QUALITY_GATE_FAIL',
  'ROUTING_DECISION',
];

const GENESIS_PREV_HASH = '0'.repeat(64);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WitnessChain Integration', () => {
  let chain: WitnessChain;
  let db: InstanceType<typeof Database>;

  beforeEach(async () => {
    const ctx = await createInitializedChain();
    chain = ctx.chain;
    db = ctx.db;
  });

  // =========================================================================
  // 1. Append all 9 action types and verify chain integrity
  // =========================================================================
  describe('all 9 action types with chain verification', () => {
    it('should append entries for every action type and verify() returns valid', async () => {
      for (const actionType of ALL_ACTION_TYPES) {
        const entry = chain.append(
          actionType,
          { detail: `test-${actionType}`, ts: Date.now() },
          'integration-test'
        );

        expect(entry.id).toBeGreaterThan(0);
        expect(entry.action_type).toBe(actionType);
        expect(entry.actor).toBe('integration-test');
        expect(entry.action_hash).toHaveLength(64);
        expect(entry.prev_hash).toHaveLength(64);
      }

      expect(chain.getChainLength()).toBe(9);

      const result = chain.verify();
      expect(result.valid).toBe(true);
      expect(result.entriesChecked).toBe(9);
      expect(result.brokenAt).toBeUndefined();
    });

    it('should set genesis prev_hash to all zeros for the first entry', () => {
      const first = chain.append('PATTERN_CREATE', { init: true }, 'system');
      expect(first.prev_hash).toBe(GENESIS_PREV_HASH);
    });

    it('should compute action_hash as SHA-256 of action_data JSON', () => {
      const data = { foo: 'bar', num: 42 };
      const entry = chain.append('ROUTING_DECISION', data, 'router');
      const expected = sha256(JSON.stringify(data));
      expect(entry.action_hash).toBe(expected);
    });
  });

  // =========================================================================
  // 2. Tamper detection
  // =========================================================================
  describe('tamper detection', () => {
    it('should detect tampering when a row action_data is modified', () => {
      chain.append('PATTERN_CREATE', { a: 1 }, 'actor-1');
      chain.append('PATTERN_UPDATE', { b: 2 }, 'actor-2');
      chain.append('PATTERN_PROMOTE', { c: 3 }, 'actor-3');

      // Verify chain is valid before tampering
      expect(chain.verify().valid).toBe(true);

      // Tamper: modify action_data of the second entry
      db.prepare(
        "UPDATE witness_chain SET action_data = '{\"b\":999}' WHERE id = 2"
      ).run();

      const result = chain.verify();
      expect(result.valid).toBe(false);
      // The action_hash of entry 2 no longer matches its action_data
      expect(result.brokenAt).toBe(2);
    });

    it('should detect tampering when a row action_hash is modified', () => {
      chain.append('QUALITY_GATE_PASS', { passed: true }, 'gate');
      chain.append('QUALITY_GATE_FAIL', { passed: false }, 'gate');

      db.prepare(
        "UPDATE witness_chain SET action_hash = 'deadbeef' || substr('0000000000000000000000000000000000000000000000000000000000000000', 1, 56) WHERE id = 1"
      ).run();

      const result = chain.verify();
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(1);
    });

    it('should detect tampering when prev_hash is modified', () => {
      chain.append('DREAM_MERGE', { x: 1 }, 'dream');
      chain.append('DREAM_DISCARD', { x: 2 }, 'dream');
      chain.append('ROUTING_DECISION', { x: 3 }, 'router');

      // Tamper: change prev_hash of entry 3 to something wrong
      db.prepare(
        `UPDATE witness_chain SET prev_hash = '${sha256('wrong')}' WHERE id = 3`
      ).run();

      const result = chain.verify();
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(3);
    });

    it('should detect genesis entry tampering', () => {
      chain.append('PATTERN_CREATE', { genesis: true }, 'system');
      chain.append('PATTERN_UPDATE', { seq: 2 }, 'system');

      // Change genesis prev_hash away from all-zeros
      db.prepare(
        `UPDATE witness_chain SET prev_hash = '${sha256('tampered-genesis')}' WHERE id = 1`
      ).run();

      const result = chain.verify();
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(1);
    });
  });

  // =========================================================================
  // 3. Chain ordering under rapid appends (100 entries)
  // =========================================================================
  describe('chain ordering with 100 rapid entries', () => {
    it('should maintain sequential IDs and valid hash links for 100 entries', () => {
      for (let i = 0; i < 100; i++) {
        chain.append(
          ALL_ACTION_TYPES[i % ALL_ACTION_TYPES.length],
          { index: i, payload: `data-${i}` },
          `agent-${i % 5}`
        );
      }

      expect(chain.getChainLength()).toBe(100);

      // Verify sequential IDs
      const entries = chain.getEntries();
      expect(entries).toHaveLength(100);
      for (let i = 0; i < entries.length; i++) {
        expect(entries[i].id).toBe(i + 1);
      }

      // Verify first entry has genesis hash
      expect(entries[0].prev_hash).toBe(GENESIS_PREV_HASH);

      // Manually verify a few hash links
      for (let i = 1; i < entries.length; i++) {
        const expectedPrevHash = sha256(serializeEntry(entries[i - 1]));
        expect(entries[i].prev_hash).toBe(expectedPrevHash);
      }

      // Full chain verification
      const result = chain.verify();
      expect(result.valid).toBe(true);
      expect(result.entriesChecked).toBe(100);
    });
  });

  // =========================================================================
  // 4. Filtering by action type, actor, timestamp, limit/offset
  // =========================================================================
  describe('filtering', () => {
    beforeEach(() => {
      // Append a known set of entries
      chain.append('PATTERN_CREATE', { id: 'p1' }, 'alice');
      chain.append('PATTERN_CREATE', { id: 'p2' }, 'bob');
      chain.append('PATTERN_UPDATE', { id: 'p1' }, 'alice');
      chain.append('QUALITY_GATE_PASS', { score: 95 }, 'ci');
      chain.append('QUALITY_GATE_FAIL', { score: 40 }, 'ci');
      chain.append('ROUTING_DECISION', { agent: 'tester' }, 'router');
      chain.append('PATTERN_PROMOTE', { id: 'p1' }, 'system');
    });

    it('should filter by action_type', () => {
      const creates = chain.getEntries({ action_type: 'PATTERN_CREATE' });
      expect(creates).toHaveLength(2);
      creates.forEach((e) => expect(e.action_type).toBe('PATTERN_CREATE'));

      const passes = chain.getEntries({ action_type: 'QUALITY_GATE_PASS' });
      expect(passes).toHaveLength(1);

      const fails = chain.getEntries({ action_type: 'QUALITY_GATE_FAIL' });
      expect(fails).toHaveLength(1);
    });

    it('should filter by actor', () => {
      const alice = chain.getEntries({ actor: 'alice' });
      expect(alice).toHaveLength(2);
      alice.forEach((e) => expect(e.actor).toBe('alice'));

      const ci = chain.getEntries({ actor: 'ci' });
      expect(ci).toHaveLength(2);
    });

    it('should filter by action_type AND actor combined', () => {
      const aliceCreates = chain.getEntries({
        action_type: 'PATTERN_CREATE',
        actor: 'alice',
      });
      expect(aliceCreates).toHaveLength(1);
      expect(aliceCreates[0].actor).toBe('alice');
      expect(aliceCreates[0].action_type).toBe('PATTERN_CREATE');
    });

    it('should support limit and offset', () => {
      const first3 = chain.getEntries({ limit: 3 });
      expect(first3).toHaveLength(3);
      expect(first3[0].id).toBe(1);
      expect(first3[2].id).toBe(3);

      const next3 = chain.getEntries({ limit: 3, offset: 3 });
      expect(next3).toHaveLength(3);
      expect(next3[0].id).toBe(4);
    });

    it('should return empty array for non-existent action type filter', () => {
      const result = chain.getEntries({ action_type: 'DREAM_MERGE' });
      expect(result).toHaveLength(0);
    });

    it('should return all entries when no filter is provided', () => {
      const all = chain.getEntries();
      expect(all).toHaveLength(7);
    });
  });

  // =========================================================================
  // 5. Concurrent appends (SQLite serializes, verify no corruption)
  // =========================================================================
  describe('concurrent appends', () => {
    it('should handle multiple rapid sequential appends without corruption', () => {
      // SQLite in WAL mode serializes writes; simulate "concurrent" by
      // rapid fire appends in a tight loop across different actors
      const actors = ['agent-a', 'agent-b', 'agent-c', 'agent-d', 'agent-e'];
      const actionTypes: WitnessActionType[] = [
        'PATTERN_CREATE',
        'PATTERN_UPDATE',
        'QUALITY_GATE_PASS',
        'ROUTING_DECISION',
        'DREAM_MERGE',
      ];

      for (let i = 0; i < 50; i++) {
        chain.append(
          actionTypes[i % actionTypes.length],
          { iteration: i, agent: actors[i % actors.length] },
          actors[i % actors.length]
        );
      }

      expect(chain.getChainLength()).toBe(50);

      const result = chain.verify();
      expect(result.valid).toBe(true);
      expect(result.entriesChecked).toBe(50);

      // Verify each actor's entries are present
      for (const actor of actors) {
        const entries = chain.getEntries({ actor });
        expect(entries.length).toBe(10); // 50 / 5 actors
      }
    });
  });

  // =========================================================================
  // 6. Edge cases
  // =========================================================================
  describe('edge cases', () => {
    it('should verify() as valid on an empty chain', () => {
      const result = chain.verify();
      expect(result.valid).toBe(true);
      expect(result.entriesChecked).toBe(0);
    });

    it('should verify() as valid with a single entry', () => {
      chain.append('PATTERN_CREATE', { only: true }, 'solo');

      const result = chain.verify();
      expect(result.valid).toBe(true);
      expect(result.entriesChecked).toBe(1);
    });

    it('should handle large action_data payloads', () => {
      const largeData: Record<string, unknown> = {};
      for (let i = 0; i < 100; i++) {
        largeData[`key_${i}`] = 'x'.repeat(100);
      }

      const entry = chain.append('ROUTING_DECISION', largeData, 'bulk');
      expect(entry.id).toBe(1);
      expect(entry.action_data.length).toBeGreaterThan(10000);

      const result = chain.verify();
      expect(result.valid).toBe(true);
    });

    it('should handle special characters in action_data', () => {
      const data = {
        sql: "SELECT * FROM users WHERE name = 'O\\'Brien'; DROP TABLE --",
        unicode: '\u00e9\u00e8\u00ea\u2603\ud83d\ude00',
        newlines: 'line1\nline2\ttab',
      };

      chain.append('PATTERN_CREATE', data, 'test');
      const result = chain.verify();
      expect(result.valid).toBe(true);

      const entries = chain.getEntries();
      const parsed = JSON.parse(entries[0].action_data);
      expect(parsed.unicode).toBe(data.unicode);
    });

    it('should return correct chain length after multiple operations', () => {
      expect(chain.getChainLength()).toBe(0);

      chain.append('PATTERN_CREATE', {}, 'a');
      expect(chain.getChainLength()).toBe(1);

      chain.append('PATTERN_UPDATE', {}, 'a');
      chain.append('PATTERN_PROMOTE', {}, 'a');
      expect(chain.getChainLength()).toBe(3);
    });
  });

  // =========================================================================
  // 7. Multiple independent chains on separate DBs
  // =========================================================================
  describe('independent chains', () => {
    it('should maintain separate chains on separate databases', async () => {
      const { chain: chain2 } = await createInitializedChain();

      chain.append('PATTERN_CREATE', { chain: 1 }, 'chain-1');
      chain.append('PATTERN_UPDATE', { chain: 1 }, 'chain-1');

      chain2.append('QUALITY_GATE_PASS', { chain: 2 }, 'chain-2');

      expect(chain.getChainLength()).toBe(2);
      expect(chain2.getChainLength()).toBe(1);

      expect(chain.verify().valid).toBe(true);
      expect(chain2.verify().valid).toBe(true);
    });
  });

  // =========================================================================
  // 8. Timestamp filtering
  // =========================================================================
  describe('timestamp filtering', () => {
    it('should filter entries by since/until timestamps', async () => {
      // Append with small delays to get different timestamps
      chain.append('PATTERN_CREATE', { seq: 1 }, 'ts-test');

      // Get timestamp of first entry
      const entries1 = chain.getEntries();
      const firstTimestamp = entries1[0].timestamp;

      // Append more entries
      chain.append('PATTERN_UPDATE', { seq: 2 }, 'ts-test');
      chain.append('PATTERN_PROMOTE', { seq: 3 }, 'ts-test');

      const allEntries = chain.getEntries();
      const lastTimestamp = allEntries[allEntries.length - 1].timestamp;

      // Filter since the first timestamp (should include all)
      const sinceFirst = chain.getEntries({ since: firstTimestamp });
      expect(sinceFirst.length).toBe(3);

      // Filter until the last timestamp (should include all)
      const untilLast = chain.getEntries({ until: lastTimestamp });
      expect(untilLast.length).toBe(3);

      // Filter with a future timestamp (should return nothing for "since")
      const futureDate = new Date(Date.now() + 100000).toISOString();
      const sincesFuture = chain.getEntries({ since: futureDate });
      expect(sincesFuture.length).toBe(0);
    });
  });

  // =========================================================================
  // 9. Re-initialization idempotency
  // =========================================================================
  describe('re-initialization', () => {
    it('should be idempotent when initialize() is called multiple times', async () => {
      chain.append('PATTERN_CREATE', { first: true }, 'init-test');

      // Re-initialize should not clear or duplicate entries
      await chain.initialize();
      await chain.initialize();

      expect(chain.getChainLength()).toBe(1);
      expect(chain.verify().valid).toBe(true);
    });
  });
});
