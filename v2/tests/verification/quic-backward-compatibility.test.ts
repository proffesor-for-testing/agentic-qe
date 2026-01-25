/**
 * QUIC Backward Compatibility Verification
 *
 * This test ensures that existing SwarmMemoryManager functionality
 * continues to work without QUIC integration enabled.
 */

import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import { AccessLevel } from '@core/memory/AccessControl';

describe('QUIC Backward Compatibility', () => {
  let memoryManager: SwarmMemoryManager;

  beforeAll(async () => {
    memoryManager = new SwarmMemoryManager(':memory:');
    await memoryManager.initialize();
  });

  afterAll(async () => {
    await memoryManager.close();
  });

  describe('Core functionality without QUIC', () => {
    it('should store and retrieve data', async () => {
      await memoryManager.store('test-key', { data: 'test-value' });
      const result = await memoryManager.retrieve('test-key');

      expect(result).toEqual({ data: 'test-value' });
    });

    it('should handle partitions', async () => {
      await memoryManager.store('partition-key', { data: 'partition-value' }, {
        partition: 'custom'
      });

      const result = await memoryManager.retrieve('partition-key', {
        partition: 'custom'
      });

      expect(result).toEqual({ data: 'partition-value' });
    });

    it('should handle TTL', async () => {
      await memoryManager.store('ttl-key', { data: 'ttl-value' }, {
        ttl: 1 // 1 second
      });

      // Should exist immediately
      const immediate = await memoryManager.retrieve('ttl-key');
      expect(immediate).toEqual({ data: 'ttl-value' });

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should be expired
      const expired = await memoryManager.retrieve('ttl-key');
      expect(expired).toBeNull();
    });

    it('should handle access control', async () => {
      await memoryManager.store('private-key', { data: 'private-value' }, {
        owner: 'agent-1',
        accessLevel: AccessLevel.PRIVATE
      });

      // Should retrieve without access control
      const result = await memoryManager.retrieve('private-key');
      expect(result).toEqual({ data: 'private-value' });
    });

    it('should handle hints', async () => {
      await memoryManager.postHint({
        key: 'hint-key',
        value: { hint: 'hint-value' }
      });

      const hints = await memoryManager.readHints('hint-key');
      expect(hints).toHaveLength(1);
      expect(hints[0].value).toEqual({ hint: 'hint-value' });
    });

    it('should handle events', async () => {
      const eventId = await memoryManager.storeEvent({
        type: 'test-event',
        payload: { data: 'test' },
        source: 'test-source'
      });

      expect(eventId).toBeDefined();

      const events = await memoryManager.queryEvents('test-event');
      expect(events).toHaveLength(1);
      expect(events[0].payload).toEqual({ data: 'test' });
    });

    it('should handle patterns', async () => {
      const patternId = await memoryManager.storePattern({
        pattern: 'test-pattern',
        confidence: 0.9,
        usageCount: 0
      });

      expect(patternId).toBeDefined();

      const pattern = await memoryManager.getPattern('test-pattern');
      expect(pattern.confidence).toBe(0.9);
    });

    it('should provide statistics', async () => {
      const stats = await memoryManager.stats();

      expect(stats).toHaveProperty('totalEntries');
      expect(stats).toHaveProperty('totalHints');
      expect(stats).toHaveProperty('totalEvents');
      expect(stats).toHaveProperty('totalPatterns');
      expect(stats.totalEntries).toBeGreaterThan(0);
    });
  });

  describe('QUIC methods when disabled', () => {
    it('should report QUIC as not enabled', () => {
      expect(memoryManager.isQUICEnabled()).toBe(false);
    });

    it('should return null metrics', () => {
      const metrics = memoryManager.getQUICMetrics();
      expect(metrics).toBeNull();
    });

    it('should return empty peers array', () => {
      const peers = memoryManager.getQUICPeers();
      expect(peers).toEqual([]);
    });

    it('should throw when trying to add peer', async () => {
      await expect(
        memoryManager.addQUICPeer('192.168.1.100', 9001)
      ).rejects.toThrow('QUIC integration not enabled');
    });

    it('should throw when trying to remove peer', async () => {
      await expect(
        memoryManager.removeQUICPeer('peer-id')
      ).rejects.toThrow('QUIC integration not enabled');
    });

    it('should return null integration', () => {
      const integration = memoryManager.getQUICIntegration();
      expect(integration).toBeNull();
    });
  });

  describe('Modified entries tracking (always available)', () => {
    it('should track modifications even without QUIC', async () => {
      const beforeStore = Date.now();

      await memoryManager.store('tracked-key', { data: 'tracked-value' });

      const lastModified = memoryManager.getLastModified('tracked-key');
      expect(lastModified).toBeDefined();
      expect(lastModified!).toBeGreaterThanOrEqual(beforeStore);
    });

    it('should get modified entries without QUIC', async () => {
      const since = Date.now();

      await memoryManager.store('modified-key', { data: 'modified-value' });

      const entries = await memoryManager.getModifiedEntries(since);

      expect(entries.length).toBeGreaterThanOrEqual(1);
      const found = entries.find(e => e.key === 'modified-key');
      expect(found).toBeDefined();
      expect(found?.value).toEqual({ data: 'modified-value' });
    });
  });

  describe('Performance without QUIC', () => {
    it('should handle bulk operations efficiently', async () => {
      const count = 100;
      const start = Date.now();

      for (let i = 0; i < count; i++) {
        await memoryManager.store(`bulk-${i}`, { index: i });
      }

      const duration = Date.now() - start;

      // Should complete in reasonable time (under 1 second for 100 items)
      expect(duration).toBeLessThan(1000);
    });

    it('should query efficiently without QUIC', async () => {
      const start = Date.now();

      const entries = await memoryManager.query('bulk-*');

      const duration = Date.now() - start;

      expect(entries.length).toBeGreaterThanOrEqual(100);
      expect(duration).toBeLessThan(500);
    });
  });
});

describe('QUIC Integration (opt-in)', () => {
  let memoryManager: SwarmMemoryManager;

  beforeEach(async () => {
    memoryManager = new SwarmMemoryManager(':memory:');
    await memoryManager.initialize();
  });

  afterEach(async () => {
    await memoryManager.disableQUIC();
    await memoryManager.close();
  });

  it('should enable QUIC on demand', async () => {
    expect(memoryManager.isQUICEnabled()).toBe(false);

    await memoryManager.enableQUIC();

    expect(memoryManager.isQUICEnabled()).toBe(true);
  });

  it('should continue working after enabling QUIC', async () => {
    // Store before QUIC
    await memoryManager.store('before-quic', { data: 'before' });

    // Enable QUIC
    await memoryManager.enableQUIC();

    // Store after QUIC
    await memoryManager.store('after-quic', { data: 'after' });

    // Both should be retrievable
    const before = await memoryManager.retrieve('before-quic');
    const after = await memoryManager.retrieve('after-quic');

    expect(before).toEqual({ data: 'before' });
    expect(after).toEqual({ data: 'after' });
  });

  it('should gracefully disable QUIC', async () => {
    await memoryManager.enableQUIC();
    expect(memoryManager.isQUICEnabled()).toBe(true);

    await memoryManager.disableQUIC();
    expect(memoryManager.isQUICEnabled()).toBe(false);

    // Should still work after disabling
    await memoryManager.store('after-disable', { data: 'test' });
    const result = await memoryManager.retrieve('after-disable');
    expect(result).toEqual({ data: 'test' });
  });
});
