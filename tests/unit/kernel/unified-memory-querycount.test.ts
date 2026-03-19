/**
 * Issue N3: UnifiedMemoryManager.queryCount() unit tests
 *
 * Verifies the queryCount method used by fleet_status to report
 * learning metrics from the SQLite database.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { UnifiedMemoryManager, resetUnifiedMemory } from '../../../src/kernel/unified-memory';

const TEST_DB_DIR = '/tmp/aqe-querycount-test-' + Date.now();
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'memory.db');

describe('UnifiedMemoryManager.queryCount', () => {
  let um: UnifiedMemoryManager;

  beforeAll(() => {
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
    resetUnifiedMemory();
    um = new UnifiedMemoryManager();
    um.initialize(TEST_DB_PATH);
  });

  afterAll(() => {
    um.close();
    resetUnifiedMemory();
    try {
      fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  it('should return 0 for empty allowed tables', () => {
    // kv_store is in the allowlist and should exist after init
    const count = um.queryCount('kv_store');
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('should throw for disallowed table names', () => {
    expect(() => um.queryCount('users')).toThrow('not in the allowlist');
    expect(() => um.queryCount('DROP TABLE kv_store')).toThrow('not in the allowlist');
    expect(() => um.queryCount('')).toThrow('not in the allowlist');
  });

  it('should count rows in vectors table', () => {
    const count = um.queryCount('vectors');
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('should allow all expected learning tables', () => {
    // Tables guaranteed to exist after basic UnifiedMemoryManager.initialize()
    // Note: captured_experiences and experience_applications are created by
    // optional middleware (experience-capture, brain-export) — not by core schema.
    const expectedTables = [
      'qe_patterns', 'qe_trajectories',
      'dream_cycles', 'dream_insights',
      'concept_nodes', 'concept_edges', 'rl_q_values', 'vectors',
      'kv_store', 'qe_pattern_usage',
    ];

    for (const table of expectedTables) {
      // Should not throw
      expect(() => um.queryCount(table)).not.toThrow();
    }
  });

  it('should reflect data after insertion', async () => {
    const before = um.queryCount('kv_store');
    // Insert a row via the KV store API
    await um.kvSet(`querycount-test-key-${Date.now()}`, 'test-value');
    const after = um.queryCount('kv_store');

    // Count should increase (may be more than +1 if background hooks also write)
    expect(after).toBeGreaterThan(before);
  });
});
