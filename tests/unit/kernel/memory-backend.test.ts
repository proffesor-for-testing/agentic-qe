/**
 * Agentic QE v3 - Memory Backend Unit Tests
 * Tests for CI-001 (count) and CI-002 (hasCodeIntelligenceIndex) methods
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InMemoryBackend } from '../../../src/kernel/memory-backend';

describe('InMemoryBackend', () => {
  let backend: InMemoryBackend;

  beforeEach(async () => {
    backend = new InMemoryBackend();
    await backend.initialize();
  });

  afterEach(async () => {
    await backend.dispose();
  });

  describe('count', () => {
    it('should return 0 for empty namespace', async () => {
      const count = await backend.count('empty-namespace');
      expect(count).toBe(0);
    });

    it('should count entries in a namespace correctly', async () => {
      // Add entries to the namespace
      await backend.set('key1', { data: 'value1' }, { namespace: 'test-ns' });
      await backend.set('key2', { data: 'value2' }, { namespace: 'test-ns' });
      await backend.set('key3', { data: 'value3' }, { namespace: 'test-ns' });

      const count = await backend.count('test-ns');
      expect(count).toBe(3);
    });

    it('should not count entries from other namespaces', async () => {
      await backend.set('key1', { data: 'value1' }, { namespace: 'ns-a' });
      await backend.set('key2', { data: 'value2' }, { namespace: 'ns-a' });
      await backend.set('key3', { data: 'value3' }, { namespace: 'ns-b' });

      const countA = await backend.count('ns-a');
      const countB = await backend.count('ns-b');

      expect(countA).toBe(2);
      expect(countB).toBe(1);
    });

    it('should not count expired entries', async () => {
      // Add an entry with 1 second TTL
      await backend.set('key1', { data: 'value1' }, { namespace: 'ttl-ns', ttl: 1 });
      await backend.set('key2', { data: 'value2' }, { namespace: 'ttl-ns' });

      // Count immediately - both should be counted
      let count = await backend.count('ttl-ns');
      expect(count).toBe(2);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Count again - only non-expired entry should be counted
      count = await backend.count('ttl-ns');
      expect(count).toBe(1);
    });

    it('should handle nested namespace-like keys correctly', async () => {
      // Keys that look like they have nested namespaces
      await backend.set('node:1', { type: 'file' }, { namespace: 'code-intelligence:kg' });
      await backend.set('node:2', { type: 'function' }, { namespace: 'code-intelligence:kg' });
      await backend.set('edge:1', { type: 'calls' }, { namespace: 'code-intelligence:kg' });

      const count = await backend.count('code-intelligence:kg');
      expect(count).toBe(3);
    });

    it('should handle hierarchical namespace prefix matching correctly', async () => {
      // Note: The namespace becomes a prefix in the stored key (namespace:key)
      // So 'code-intelligence:kg:key1' starts with prefix 'code-intelligence:'
      await backend.set('key1', 'value', { namespace: 'code-intelligence:kg' });
      await backend.set('key2', 'value', { namespace: 'code-intelligence:kg-backup' });
      await backend.set('key3', 'value', { namespace: 'code-intelligence' });
      await backend.set('key4', 'value', { namespace: 'other-namespace' });

      // Specific namespace counts only their direct entries
      const kgCount = await backend.count('code-intelligence:kg');
      // code-intelligence:kg:key1 starts with 'code-intelligence:kg:'
      // code-intelligence:kg-backup:key2 starts with 'code-intelligence:kg-' (NOT 'code-intelligence:kg:')
      expect(kgCount).toBe(1);

      const backupCount = await backend.count('code-intelligence:kg-backup');
      expect(backupCount).toBe(1);

      // Parent namespace 'code-intelligence' will match all keys starting with 'code-intelligence:'
      // This includes: code-intelligence:kg:key1, code-intelligence:kg-backup:key2, code-intelligence:key3
      const baseCount = await backend.count('code-intelligence');
      expect(baseCount).toBe(3);

      // Completely different namespace
      const otherCount = await backend.count('other-namespace');
      expect(otherCount).toBe(1);
    });
  });

  describe('hasCodeIntelligenceIndex', () => {
    it('should return false when no code intelligence entries exist', async () => {
      const hasIndex = await backend.hasCodeIntelligenceIndex();
      expect(hasIndex).toBe(false);
    });

    it('should return true when code intelligence entries exist', async () => {
      // Simulate knowledge graph entries
      await backend.set('node:file:1', { path: '/src/index.ts' }, { namespace: 'code-intelligence:kg' });

      const hasIndex = await backend.hasCodeIntelligenceIndex();
      expect(hasIndex).toBe(true);
    });

    it('should return true with multiple code intelligence entries', async () => {
      // Simulate a more realistic knowledge graph with nodes and edges
      await backend.set('node:file:1', { path: '/src/index.ts', type: 'file' }, { namespace: 'code-intelligence:kg' });
      await backend.set('node:function:1', { name: 'main', type: 'function' }, { namespace: 'code-intelligence:kg' });
      await backend.set('edge:1', { from: 'file:1', to: 'function:1', type: 'contains' }, { namespace: 'code-intelligence:kg' });

      const hasIndex = await backend.hasCodeIntelligenceIndex();
      expect(hasIndex).toBe(true);
    });

    it('should return false after clearing code intelligence namespace', async () => {
      // Add entries
      await backend.set('node:1', { data: 'test' }, { namespace: 'code-intelligence:kg' });

      // Verify they exist
      let hasIndex = await backend.hasCodeIntelligenceIndex();
      expect(hasIndex).toBe(true);

      // Clear the namespace
      await backend.clear('code-intelligence:kg');

      // Verify they are gone
      hasIndex = await backend.hasCodeIntelligenceIndex();
      expect(hasIndex).toBe(false);
    });

    it('should not be affected by entries in other namespaces', async () => {
      // Add entries to other namespaces
      await backend.set('key1', 'value', { namespace: 'other-ns' });
      await backend.set('key2', 'value', { namespace: 'code-intelligence:metadata' });

      // Should still return false for the specific KG namespace
      const hasIndex = await backend.hasCodeIntelligenceIndex();
      expect(hasIndex).toBe(false);
    });
  });

  describe('integration with existing methods', () => {
    it('should work correctly with set, get, and delete operations', async () => {
      // Set entries
      await backend.set('key1', 'value1', { namespace: 'test-ns' });
      await backend.set('key2', 'value2', { namespace: 'test-ns' });

      expect(await backend.count('test-ns')).toBe(2);

      // Delete one entry
      await backend.delete('test-ns:key1');

      expect(await backend.count('test-ns')).toBe(1);

      // Verify remaining entry
      const value = await backend.get('key2', 'test-ns');
      expect(value).toBe('value2');
    });

    it('should correctly reflect stats alongside count', async () => {
      await backend.set('key1', 'value1', { namespace: 'ns-a' });
      await backend.set('key2', 'value2', { namespace: 'ns-b' });
      await backend.set('key3', 'value3', { namespace: 'ns-a' });

      const stats = backend.getStats();
      expect(stats.entries).toBe(3);

      // Individual namespace counts
      expect(await backend.count('ns-a')).toBe(2);
      expect(await backend.count('ns-b')).toBe(1);
    });
  });
});
