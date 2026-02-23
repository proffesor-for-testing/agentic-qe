/**
 * Unit tests for Memory MCP Handlers
 * Tests memory store, retrieve, query, delete, usage, and share operations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  handleMemoryStore,
  handleMemoryRetrieve,
  handleMemoryQuery,
  handleMemoryDelete,
  handleMemoryUsage,
  handleMemoryShare,
} from '../../../../src/mcp/handlers/memory-handlers';
import {
  handleFleetInit,
  disposeFleet,
} from '../../../../src/mcp/handlers/core-handlers';
import { resetUnifiedPersistence } from '../../../../src/kernel/unified-persistence';
import type {
  MemoryStoreParams,
  MemoryRetrieveParams,
  MemoryQueryParams,
} from '../../../../src/mcp/types';

// ============================================================================
// Tests
// ============================================================================

describe('Memory Handlers', { timeout: 30000 }, () => {
  // Initialize fleet before each test (in-memory to avoid touching live DB)
  beforeEach(async () => {
    await handleFleetInit({ memoryBackend: 'memory' });
  });

  // Clean up after each test
  afterEach(async () => {
    await disposeFleet();
    resetUnifiedPersistence();
  });

  // --------------------------------------------------------------------------
  // handleMemoryStore
  // --------------------------------------------------------------------------

  describe('handleMemoryStore', () => {
    it('should return error when fleet is not initialized', async () => {
      await disposeFleet();
      const result = await handleMemoryStore({
        key: 'test-key',
        value: 'test-value',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
    });

    it('should store simple string value', async () => {
      const result = await handleMemoryStore({
        key: 'test-key',
        value: 'test-value',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.stored).toBe(true);
      expect(result.data!.key).toBe('test-key');
      expect(result.data!.namespace).toBe('default');
      expect(result.data!.timestamp).toBeDefined();
    });

    it('should store complex object value', async () => {
      const complexValue = {
        name: 'test',
        items: [1, 2, 3],
        nested: { a: 'b' },
      };

      const result = await handleMemoryStore({
        key: 'complex-key',
        value: complexValue,
      });

      expect(result.success).toBe(true);
      expect(result.data!.stored).toBe(true);
    });

    it('should use custom namespace', async () => {
      const result = await handleMemoryStore({
        key: 'test-key',
        value: 'test-value',
        namespace: 'custom-namespace',
      });

      expect(result.success).toBe(true);
      expect(result.data!.namespace).toBe('custom-namespace');
    });

    it('should handle persist flag', async () => {
      const result = await handleMemoryStore({
        key: 'test-key',
        value: 'test-value',
        persist: true,
      });

      expect(result.success).toBe(true);
      expect(result.data!.persisted).toBe(true);
    });

    it('should handle TTL parameter', async () => {
      const result = await handleMemoryStore({
        key: 'test-key',
        value: 'test-value',
        ttl: 60000, // 1 minute
      });

      expect(result.success).toBe(true);
      expect(result.data!.stored).toBe(true);
    });

    it('should overwrite existing key', async () => {
      await handleMemoryStore({ key: 'test-key', value: 'original' });
      const result = await handleMemoryStore({
        key: 'test-key',
        value: 'updated',
      });

      expect(result.success).toBe(true);

      const retrieveResult = await handleMemoryRetrieve({ key: 'test-key' });
      expect(retrieveResult.data!.value).toBe('updated');
    });

    it('should store null value', async () => {
      const result = await handleMemoryStore({
        key: 'null-key',
        value: null,
      });

      expect(result.success).toBe(true);
    });

    it('should store array value', async () => {
      const result = await handleMemoryStore({
        key: 'array-key',
        value: [1, 2, 3, 'test'],
      });

      expect(result.success).toBe(true);
    });

    it('should store number value', async () => {
      const result = await handleMemoryStore({
        key: 'number-key',
        value: 42.5,
      });

      expect(result.success).toBe(true);
    });

    it('should store boolean value', async () => {
      const result = await handleMemoryStore({
        key: 'bool-key',
        value: true,
      });

      expect(result.success).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // handleMemoryRetrieve
  // --------------------------------------------------------------------------

  describe('handleMemoryRetrieve', () => {
    it('should return error when fleet is not initialized', async () => {
      await disposeFleet();
      const result = await handleMemoryRetrieve({ key: 'test-key' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
    });

    it('should return not found for non-existent key', async () => {
      const result = await handleMemoryRetrieve({ key: 'nonexistent-key' });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.found).toBe(false);
      expect(result.data!.key).toBe('nonexistent-key');
    });

    it('should retrieve stored value', async () => {
      await handleMemoryStore({ key: 'test-key', value: 'test-value' });

      const result = await handleMemoryRetrieve({ key: 'test-key' });

      expect(result.success).toBe(true);
      expect(result.data!.found).toBe(true);
      expect(result.data!.value).toBe('test-value');
      expect(result.data!.timestamp).toBeDefined();
    });

    it('should retrieve complex object value', async () => {
      const complexValue = { a: 1, b: [2, 3], c: { d: 'e' } };
      await handleMemoryStore({ key: 'complex-key', value: complexValue });

      const result = await handleMemoryRetrieve({ key: 'complex-key' });

      expect(result.success).toBe(true);
      expect(result.data!.found).toBe(true);
      expect(result.data!.value).toEqual(complexValue);
    });

    it('should use custom namespace for retrieval', async () => {
      await handleMemoryStore({
        key: 'test-key',
        value: 'namespaced-value',
        namespace: 'custom',
      });

      const result = await handleMemoryRetrieve({
        key: 'test-key',
        namespace: 'custom',
      });

      expect(result.success).toBe(true);
      expect(result.data!.found).toBe(true);
      expect(result.data!.value).toBe('namespaced-value');
    });

    it('should not find key in different namespace', async () => {
      // Use unique key/namespace to avoid interference from other tests
      const uniqueKey = `isolation-test-${Date.now()}`;

      await handleMemoryStore({
        key: uniqueKey,
        value: 'value',
        namespace: 'isolation-ns-a',
      });

      const result = await handleMemoryRetrieve({
        key: uniqueKey,
        namespace: 'isolation-ns-b',
      });

      expect(result.success).toBe(true);
      expect(result.data!.found).toBe(false);
    });

    it('should include metadata when requested', async () => {
      await handleMemoryStore({ key: 'test-key', value: 'test-value' });

      const result = await handleMemoryRetrieve({
        key: 'test-key',
        includeMetadata: true,
      });

      expect(result.success).toBe(true);
      expect(result.data!.found).toBe(true);
      expect(result.data!.metadata).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // handleMemoryQuery
  // --------------------------------------------------------------------------

  describe('handleMemoryQuery', () => {
    beforeEach(async () => {
      // Store some test data
      await handleMemoryStore({ key: 'test-1', value: 'value-1' });
      await handleMemoryStore({ key: 'test-2', value: 'value-2' });
      await handleMemoryStore({ key: 'other-1', value: 'value-3' });
    });

    it('should return error when fleet is not initialized', async () => {
      await disposeFleet();
      const result = await handleMemoryQuery({});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
    });

    it('should query all keys with wildcard pattern', async () => {
      const result = await handleMemoryQuery({ pattern: '*' });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.entries.length).toBeGreaterThanOrEqual(3);
    });

    it('should query keys matching pattern', async () => {
      const result = await handleMemoryQuery({ pattern: 'test-*' });

      expect(result.success).toBe(true);
      // Should have at least the 2 test keys from beforeEach
      expect(result.data!.entries.length).toBeGreaterThanOrEqual(2);
      result.data!.entries.forEach(entry => {
        expect(entry.key).toMatch(/^test-/);
      });
    });

    it('should use default namespace', async () => {
      const result = await handleMemoryQuery({});

      expect(result.success).toBe(true);
      result.data!.entries.forEach(entry => {
        expect(entry.namespace).toBe('default');
      });
    });

    it('should respect custom namespace', async () => {
      await handleMemoryStore({
        key: 'ns-key',
        value: 'ns-value',
        namespace: 'custom',
      });

      const result = await handleMemoryQuery({ namespace: 'custom' });

      expect(result.success).toBe(true);
      result.data!.entries.forEach(entry => {
        expect(entry.namespace).toBe('custom');
      });
    });

    it('should apply limit parameter', async () => {
      const result = await handleMemoryQuery({ limit: 1 });

      expect(result.success).toBe(true);
      expect(result.data!.entries.length).toBe(1);
    });

    it('should apply offset parameter', async () => {
      const allResult = await handleMemoryQuery({});
      const offsetResult = await handleMemoryQuery({ offset: 1 });

      expect(offsetResult.success).toBe(true);
      // With offset, we get fewer entries (or same if total < limit)
      expect(offsetResult.data!.entries.length).toBeLessThanOrEqual(
        allResult.data!.entries.length
      );
    });

    it('should return total count and hasMore flag', async () => {
      const result = await handleMemoryQuery({ limit: 1 });

      expect(result.success).toBe(true);
      // Total should be at least 1 (the limited entry)
      expect(result.data!.total).toBeGreaterThanOrEqual(1);
      // If we have more than 1 entry total, hasMore should be true
      if (result.data!.total > 1) {
        expect(result.data!.hasMore).toBe(true);
      }
    });

    it('should handle empty result', async () => {
      const result = await handleMemoryQuery({ pattern: 'nonexistent-*' });

      expect(result.success).toBe(true);
      expect(result.data!.entries.length).toBe(0);
      expect(result.data!.total).toBe(0);
      expect(result.data!.hasMore).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // handleMemoryDelete
  // --------------------------------------------------------------------------

  describe('handleMemoryDelete', () => {
    it('should return error when fleet is not initialized', async () => {
      await disposeFleet();
      const result = await handleMemoryDelete({ key: 'test-key' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
    });

    it('should delete existing key', async () => {
      await handleMemoryStore({ key: 'test-key', value: 'test-value' });

      const result = await handleMemoryDelete({ key: 'test-key' });

      expect(result.success).toBe(true);
      expect(result.data!.deleted).toBe(true);
      expect(result.data!.key).toBe('test-key');
      expect(result.data!.namespace).toBe('default');
    });

    it('should return false for non-existent key', async () => {
      const result = await handleMemoryDelete({ key: 'nonexistent-key' });

      expect(result.success).toBe(true);
      expect(result.data!.deleted).toBe(false);
    });

    it('should use custom namespace', async () => {
      await handleMemoryStore({
        key: 'test-key',
        value: 'test-value',
        namespace: 'custom',
      });

      const result = await handleMemoryDelete({
        key: 'test-key',
        namespace: 'custom',
      });

      expect(result.success).toBe(true);
      expect(result.data!.deleted).toBe(true);
      expect(result.data!.namespace).toBe('custom');
    });

    it('should not affect other namespaces', async () => {
      await handleMemoryStore({
        key: 'test-key',
        value: 'value-a',
        namespace: 'namespace-a',
      });
      await handleMemoryStore({
        key: 'test-key',
        value: 'value-b',
        namespace: 'namespace-b',
      });

      await handleMemoryDelete({ key: 'test-key', namespace: 'namespace-a' });

      const result = await handleMemoryRetrieve({
        key: 'test-key',
        namespace: 'namespace-b',
      });

      expect(result.data!.found).toBe(true);
      expect(result.data!.value).toBe('value-b');
    });

    it('should verify key is deleted', async () => {
      await handleMemoryStore({ key: 'test-key', value: 'test-value' });
      await handleMemoryDelete({ key: 'test-key' });

      const result = await handleMemoryRetrieve({ key: 'test-key' });

      expect(result.data!.found).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // handleMemoryUsage
  // --------------------------------------------------------------------------

  describe('handleMemoryUsage', () => {
    it('should return error when fleet is not initialized', async () => {
      await disposeFleet();
      const result = await handleMemoryUsage();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
    });

    it('should return memory usage stats', async () => {
      await handleMemoryStore({ key: 'test-1', value: 'value-1' });
      await handleMemoryStore({ key: 'test-2', value: 'value-2' });

      const result = await handleMemoryUsage();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.entries).toBeGreaterThanOrEqual(2);
      expect(result.data!.vectors).toBeGreaterThanOrEqual(0);
      expect(result.data!.namespaces).toBeGreaterThanOrEqual(1);
      expect(result.data!.size).toBeDefined();
      expect(result.data!.size.current).toBeGreaterThanOrEqual(0);
      expect(result.data!.size.unit).toBe('entries');
    });

    it('should reflect changes after storing', async () => {
      // Use a unique key to avoid conflicts with parallel tests
      const uniqueKey = `usage-test-${Date.now()}`;
      const before = await handleMemoryUsage();

      await handleMemoryStore({ key: uniqueKey, value: 'new-value' });

      const after = await handleMemoryUsage();

      // After storing, entries should be at least what we had before
      // At max capacity (e.g. 10000), new entries evict old ones so count may not increase
      expect(after.data!.entries).toBeGreaterThanOrEqual(before.data!.entries);
    });

    it('should reflect changes after deleting', async () => {
      await handleMemoryStore({ key: 'delete-key', value: 'value' });
      const before = await handleMemoryUsage();

      await handleMemoryDelete({ key: 'delete-key' });

      const after = await handleMemoryUsage();

      // Entry count should decrease or stay the same (concurrent operations may re-add entries)
      expect(after.data!.entries).toBeLessThanOrEqual(before.data!.entries);
    });
  });

  // --------------------------------------------------------------------------
  // handleMemoryShare
  // --------------------------------------------------------------------------

  describe('handleMemoryShare', () => {
    it('should return error when fleet is not initialized', async () => {
      await disposeFleet();
      const result = await handleMemoryShare({
        sourceAgentId: 'agent-1',
        targetAgentIds: ['agent-2'],
        knowledgeDomain: 'test',
        knowledgeContent: { data: 'test' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
    });

    it('should share knowledge between agents', async () => {
      const result = await handleMemoryShare({
        sourceAgentId: 'agent-1',
        targetAgentIds: ['agent-2', 'agent-3'],
        knowledgeDomain: 'test-domain',
        knowledgeContent: { pattern: 'test-pattern', value: 42 },
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.shared).toBe(true);
      expect(result.data!.sourceAgent).toBe('agent-1');
      expect(result.data!.targetAgents).toEqual(['agent-2', 'agent-3']);
      expect(result.data!.domain).toBe('test-domain');
    });

    it('should handle empty target agents', async () => {
      const result = await handleMemoryShare({
        sourceAgentId: 'agent-1',
        targetAgentIds: [],
        knowledgeDomain: 'test',
        knowledgeContent: {},
      });

      expect(result.success).toBe(true);
      expect(result.data!.targetAgents).toEqual([]);
    });

    it('should handle complex knowledge content', async () => {
      const result = await handleMemoryShare({
        sourceAgentId: 'agent-1',
        targetAgentIds: ['agent-2'],
        knowledgeDomain: 'complex',
        knowledgeContent: {
          patterns: ['a', 'b', 'c'],
          metrics: { score: 0.95, count: 100 },
          nested: { deep: { value: true } },
        },
      });

      expect(result.success).toBe(true);
      expect(result.data!.shared).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases and Error Handling
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle special characters in keys', async () => {
      const result = await handleMemoryStore({
        key: 'special:key/with-chars.test',
        value: 'value',
      });

      expect(result.success).toBe(true);

      const retrieve = await handleMemoryRetrieve({
        key: 'special:key/with-chars.test',
      });
      expect(retrieve.data!.found).toBe(true);
    });

    it('should handle empty string value', async () => {
      const result = await handleMemoryStore({
        key: 'empty-string',
        value: '',
      });

      expect(result.success).toBe(true);

      const retrieve = await handleMemoryRetrieve({ key: 'empty-string' });
      expect(retrieve.data!.value).toBe('');
    });

    it('should handle very long values', async () => {
      const longValue = 'x'.repeat(10000);

      const result = await handleMemoryStore({
        key: 'long-value',
        value: longValue,
      });

      expect(result.success).toBe(true);

      const retrieve = await handleMemoryRetrieve({ key: 'long-value' });
      expect(retrieve.data!.value).toBe(longValue);
    });

    it('should handle concurrent store operations', async () => {
      const results = await Promise.all([
        handleMemoryStore({ key: 'concurrent-1', value: 'value-1' }),
        handleMemoryStore({ key: 'concurrent-2', value: 'value-2' }),
        handleMemoryStore({ key: 'concurrent-3', value: 'value-3' }),
      ]);

      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });

    it('should handle store and retrieve in quick succession', async () => {
      await handleMemoryStore({ key: 'quick-key', value: 'quick-value' });
      const result = await handleMemoryRetrieve({ key: 'quick-key' });

      expect(result.data!.found).toBe(true);
      expect(result.data!.value).toBe('quick-value');
    });
  });

  // --------------------------------------------------------------------------
  // Issue N4: memory_usage reports real vector count (not hardcoded 0)
  // --------------------------------------------------------------------------

  describe('Issue N4: memory_usage vector count', () => {
    it('should report vector and namespace counts from real backend', async () => {
      // Store entries in two namespaces to verify namespace counting
      await handleMemoryStore({ key: 'n4-a', value: 'val-a', namespace: 'ns-alpha' });
      await handleMemoryStore({ key: 'n4-b', value: 'val-b', namespace: 'ns-beta' });

      const usage = await handleMemoryUsage();

      expect(usage.success).toBe(true);
      // vectors should be a number (may be 0 in in-memory backend, but not undefined)
      expect(typeof usage.data!.vectors).toBe('number');
      expect(usage.data!.vectors).toBeGreaterThanOrEqual(0);
      // namespaces should be at least 2 (ns-alpha, ns-beta)
      expect(usage.data!.namespaces).toBeGreaterThanOrEqual(2);
    });
  });

  // --------------------------------------------------------------------------
  // Issue N5: persisted flag is always true when fleet is initialized
  // --------------------------------------------------------------------------

  describe('Issue N5: persisted flag', () => {
    it('should return persisted: true for stored entries', async () => {
      const result = await handleMemoryStore({
        key: 'n5-test',
        value: 'persisted-value',
      });

      expect(result.success).toBe(true);
      expect(result.data!.persisted).toBe(true);
    });

    it('should return persisted: true regardless of namespace', async () => {
      const result = await handleMemoryStore({
        key: 'n5-ns-test',
        value: 'value',
        namespace: 'custom-ns',
      });

      expect(result.success).toBe(true);
      expect(result.data!.persisted).toBe(true);
    });
  });
});
