import { SwarmMemoryManager } from '@memory/SwarmMemoryManager';
import * as fs from 'fs';
import * as path from 'path';

describe('SwarmMemoryManager', () => {
  const testDbPath = path.join(__dirname, '../../.aqe/test-memory.db');
  let memory: SwarmMemoryManager;

  beforeEach(async () => {
    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Ensure directory exists
    const dir = path.dirname(testDbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    memory = new SwarmMemoryManager(testDbPath);
    await memory.initialize();
  });

  afterEach(async () => {
    if (memory) {
      await memory.close();
    }

    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('12-Table Schema', () => {
    test('should create shared_state table with TTL 1800s', async () => {
      const tables = await memory.getTables();
      expect(tables).toContain('shared_state');

      const schema = await memory.getTableSchema('shared_state');
      expect(schema).toHaveProperty('key');
      expect(schema).toHaveProperty('value');
      expect(schema).toHaveProperty('ttl');
      expect(schema).toHaveProperty('owner');
      expect(schema).toHaveProperty('timestamp');
      expect(schema).toHaveProperty('expiresAt');
    });

    test('should create all 12 required tables', async () => {
      const requiredTables = [
        'shared_state',
        'events',
        'workflow_state',
        'patterns',
        'consensus_state',
        'performance_metrics',
        'artifacts',
        'sessions',
        'agent_registry',
        'memory_store',
        'neural_patterns',
        'swarm_status'
      ];

      const tables = await memory.getTables();
      requiredTables.forEach(table => {
        expect(tables).toContain(table);
      });

      expect(tables.length).toBe(requiredTables.length);
    });

    test('should create proper indexes for shared_state table', async () => {
      const indexes = await memory.getTableIndexes('shared_state');
      expect(indexes).toContain('idx_shared_state_key');
      expect(indexes).toContain('idx_shared_state_expires');
    });

    test('should enable WAL mode for concurrent access', async () => {
      const journalMode = await memory.getJournalMode();
      expect(journalMode.toLowerCase()).toBe('wal');
    });
  });

  describe('Blackboard Pattern (shared_state)', () => {
    test('should post hint to shared_state with TTL 1800s', async () => {
      await memory.postHint({
        key: 'aqe/test-queue/next',
        value: { priority: 'high', module: 'auth' },
        ttl: 1800
      });

      const hints = await memory.readHints('aqe/test-queue/*');
      expect(hints).toHaveLength(1);
      expect(hints[0].value.priority).toBe('high');
      expect(hints[0].value.module).toBe('auth');
      expect(hints[0].ttl).toBe(1800);
    });

    test('should post hint with default TTL if not specified', async () => {
      await memory.postHint({
        key: 'aqe/coordination/status',
        value: { phase: '1.1', ready: true }
      });

      const hints = await memory.readHints('aqe/coordination/*');
      expect(hints).toHaveLength(1);
      expect(hints[0].ttl).toBe(1800); // Default for shared_state
    });

    test('should read hints with wildcard pattern', async () => {
      await memory.postHint({ key: 'aqe/agent/coder', value: { status: 'working' } });
      await memory.postHint({ key: 'aqe/agent/tester', value: { status: 'idle' } });
      await memory.postHint({ key: 'aqe/agent/reviewer', value: { status: 'working' } });

      const hints = await memory.readHints('aqe/agent/*');
      expect(hints).toHaveLength(3);
    });

    test('should overwrite hint with same key', async () => {
      await memory.postHint({ key: 'aqe/status', value: { state: 'starting' } });
      await memory.postHint({ key: 'aqe/status', value: { state: 'running' } });

      const hints = await memory.readHints('aqe/status');
      expect(hints).toHaveLength(1);
      expect(hints[0].value.state).toBe('running');
    });

    test('should not return expired hints', async () => {
      await memory.postHint({
        key: 'aqe/temp/data',
        value: { data: 'test' },
        ttl: 1 // 1 second
      });

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      const hints = await memory.readHints('aqe/temp/*');
      expect(hints).toHaveLength(0);
    });
  });

  describe('TTL Policy', () => {
    test('should apply correct default TTLs per policy', async () => {
      // artifacts: 0 (never expire)
      await memory.store('artifact:test', { type: 'report' }, { partition: 'artifacts' });
      const artifact = await memory.retrieve('artifact:test', { partition: 'artifacts' });
      expect(artifact.ttl).toBe(0);

      // shared_state: 1800 (30 minutes)
      await memory.store('shared:test', { status: 'active' }, { partition: 'shared_state' });
      const shared = await memory.retrieve('shared:test', { partition: 'shared_state' });
      expect(shared.ttl).toBe(1800);

      // patterns: 604800 (7 days)
      await memory.store('pattern:test', { type: 'coordination' }, { partition: 'patterns' });
      const pattern = await memory.retrieve('pattern:test', { partition: 'patterns' });
      expect(pattern.ttl).toBe(604800);

      // events: 2592000 (30 days)
      await memory.store('event:test', { type: 'task_completed' }, { partition: 'events' });
      const event = await memory.retrieve('event:test', { partition: 'events' });
      expect(event.ttl).toBe(2592000);

      // workflow_state: 0 (never expire)
      await memory.store('workflow:test', { step: 1 }, { partition: 'workflow_state' });
      const workflow = await memory.retrieve('workflow:test', { partition: 'workflow_state' });
      expect(workflow.ttl).toBe(0);

      // consensus_state: 604800 (7 days)
      await memory.store('consensus:test', { votes: 5 }, { partition: 'consensus_state' });
      const consensus = await memory.retrieve('consensus:test', { partition: 'consensus_state' });
      expect(consensus.ttl).toBe(604800);
    });

    test('should allow custom TTL override', async () => {
      await memory.store('custom:test', { data: 'value' }, {
        partition: 'shared_state',
        ttl: 3600 // 1 hour instead of default 30 minutes
      });

      const entry = await memory.retrieve('custom:test', { partition: 'shared_state' });
      expect(entry.ttl).toBe(3600);
    });

    test('should calculate expiresAt correctly for non-zero TTL', async () => {
      const beforeTime = Date.now();

      await memory.store('expires:test', { data: 'test' }, {
        partition: 'shared_state',
        ttl: 1800
      });

      const entry = await memory.retrieve('expires:test', { partition: 'shared_state' });
      const afterTime = Date.now();

      // expiresAt should be approximately now + 1800 seconds (with small margin)
      const expectedExpiry = beforeTime + (1800 * 1000);
      expect(entry.expiresAt).toBeGreaterThanOrEqual(expectedExpiry - 100);
      expect(entry.expiresAt).toBeLessThanOrEqual(afterTime + (1800 * 1000) + 100);
    });

    test('should not expire entries with TTL 0', async () => {
      await memory.store('permanent:test', { data: 'forever' }, {
        partition: 'artifacts',
        ttl: 0
      });

      const entry = await memory.retrieve('permanent:test', { partition: 'artifacts' });
      expect(entry.expiresAt).toBeNull();
    });
  });

  describe('TTL Cleanup', () => {
    test('should automatically clean up expired entries', async () => {
      // Store entry with 1 second TTL
      await memory.store('cleanup:test1', { data: 'temp1' }, {
        partition: 'shared_state',
        ttl: 1
      });

      await memory.store('cleanup:test2', { data: 'temp2' }, {
        partition: 'shared_state',
        ttl: 1
      });

      // Verify entries exist
      let entries = await memory.query('cleanup:*', { partition: 'shared_state' });
      expect(entries.length).toBe(2);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Force cleanup
      await memory.cleanupExpiredEntries();

      // Verify entries are gone
      entries = await memory.query('cleanup:*', { partition: 'shared_state' });
      expect(entries.length).toBe(0);
    });

    test('should start automatic cleanup on initialize', async () => {
      // Cleanup interval should be set
      const hasCleanupJob = memory.hasActiveCleanupJob();
      expect(hasCleanupJob).toBe(true);
    });

    test('should stop cleanup on close', async () => {
      await memory.close();

      const hasCleanupJob = memory.hasActiveCleanupJob();
      expect(hasCleanupJob).toBe(false);
    });
  });

  describe('Performance & Concurrency', () => {
    test('should handle concurrent writes without corruption', async () => {
      const promises = [];

      for (let i = 0; i < 100; i++) {
        promises.push(
          memory.store(`concurrent:${i}`, { index: i }, { partition: 'shared_state' })
        );
      }

      await Promise.all(promises);

      const entries = await memory.query('concurrent:*', { partition: 'shared_state' });
      expect(entries.length).toBe(100);
    });

    test('should use indexes for efficient queries', async () => {
      // Store many entries
      for (let i = 0; i < 1000; i++) {
        await memory.store(`perf:${i}`, { value: i }, { partition: 'shared_state' });
      }

      // Query should be fast due to index
      const start = Date.now();
      const results = await memory.query('perf:500', { partition: 'shared_state' });
      const duration = Date.now() - start;

      expect(results.length).toBe(1);
      expect(duration).toBeLessThan(100); // Should be very fast with index
    });
  });

  describe('Error Handling', () => {
    test('should throw error for invalid partition', async () => {
      await expect(
        memory.store('test', { data: 'value' }, { partition: 'invalid_table' })
      ).rejects.toThrow();
    });

    test('should handle database connection errors gracefully', async () => {
      await memory.close();

      await expect(
        memory.store('test', { data: 'value' })
      ).rejects.toThrow();
    });

    test('should validate required fields on store', async () => {
      await expect(
        memory.store('', { data: 'value' })
      ).rejects.toThrow('Key is required');
    });
  });
});
