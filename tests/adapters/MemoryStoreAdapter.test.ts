/**
 * Tests for MemoryStoreAdapter
 * Verifies type-safe bridge between MemoryStore and ISwarmMemoryManager
 */

import { MemoryStoreAdapter } from '../../src/adapters/MemoryStoreAdapter';
import { MemoryStore } from '../../src/types';

describe('MemoryStoreAdapter', () => {
  let mockMemoryStore: MemoryStore;
  let adapter: MemoryStoreAdapter;

  beforeEach(() => {
    // Create mock MemoryStore with all required methods
    mockMemoryStore = {
      store: jest.fn().mockResolvedValue(undefined),
      retrieve: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(true),
      clear: jest.fn().mockResolvedValue(undefined)
    };

    adapter = new MemoryStoreAdapter(mockMemoryStore);
  });

  describe('Compatibility Validation', () => {
    it('should validate MemoryStore has required methods', () => {
      expect(() => new MemoryStoreAdapter(mockMemoryStore)).not.toThrow();
    });

    it('should throw error if MemoryStore missing required methods', () => {
      const incompleteStore = {
        store: jest.fn(),
        retrieve: jest.fn()
        // Missing other required methods
      } as unknown as MemoryStore;

      expect(() => new MemoryStoreAdapter(incompleteStore)).toThrow(
        /missing required methods/i
      );
    });

    it('should identify specific missing methods in error', () => {
      const incompleteStore = {
        store: jest.fn(),
        retrieve: jest.fn()
      } as unknown as MemoryStore;

      try {
        new MemoryStoreAdapter(incompleteStore);
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('set');
        expect(error.message).toContain('get');
        expect(error.message).toContain('delete');
        expect(error.message).toContain('clear');
      }
    });
  });

  describe('Basic Operations', () => {
    it('should initialize successfully', async () => {
      await expect(adapter.initialize()).resolves.toBeUndefined();
    });

    it('should store values with partition support', async () => {
      await adapter.store('test-key', { data: 'value' }, { partition: 'test-partition' });

      expect(mockMemoryStore.store).toHaveBeenCalledWith(
        'test-partition:test-key',
        { data: 'value' },
        undefined
      );
    });

    it('should store values with default partition', async () => {
      await adapter.store('test-key', { data: 'value' });

      expect(mockMemoryStore.store).toHaveBeenCalledWith(
        'test-key',
        { data: 'value' },
        undefined
      );
    });

    it('should store values with TTL', async () => {
      await adapter.store('test-key', { data: 'value' }, { ttl: 3600 });

      expect(mockMemoryStore.store).toHaveBeenCalledWith(
        'test-key',
        { data: 'value' },
        3600
      );
    });

    it('should retrieve values with partition support', async () => {
      mockMemoryStore.retrieve = jest.fn().mockResolvedValue({ data: 'value' });

      const result = await adapter.retrieve('test-key', { partition: 'test-partition' });

      expect(mockMemoryStore.retrieve).toHaveBeenCalledWith('test-partition:test-key');
      expect(result).toEqual({ data: 'value' });
    });

    it('should delete values with partition support', async () => {
      await adapter.delete('test-key', 'test-partition');

      expect(mockMemoryStore.delete).toHaveBeenCalledWith('test-partition:test-key');
    });

    it('should clear partition', async () => {
      await adapter.clear('test-partition');

      expect(mockMemoryStore.clear).toHaveBeenCalledWith('test-partition');
    });
  });

  describe('Query Operations', () => {
    it('should return empty array for query (not supported by basic MemoryStore)', async () => {
      const results = await adapter.query('test:*', { partition: 'test' });
      expect(results).toEqual([]);
    });

    it('should return empty array for readHints (not supported by basic MemoryStore)', async () => {
      const hints = await adapter.readHints('hint:*');
      expect(hints).toEqual([]);
    });
  });

  describe('Hint Operations', () => {
    it('should post hint with namespaced key', async () => {
      await adapter.postHint({ key: 'test-hint', value: 'hint-value', ttl: 60 });

      expect(mockMemoryStore.store).toHaveBeenCalledWith(
        'hint:test-hint',
        'hint-value',
        60
      );
    });

    it('should post hint without TTL', async () => {
      await adapter.postHint({ key: 'test-hint', value: 'hint-value' });

      expect(mockMemoryStore.store).toHaveBeenCalledWith(
        'hint:test-hint',
        'hint-value',
        undefined
      );
    });
  });

  describe('Event Operations', () => {
    it('should store event with generated ID', async () => {
      const event = {
        type: 'test-event',
        payload: { data: 'test' },
        source: 'test-agent'
      };

      const eventId = await adapter.storeEvent(event);

      expect(eventId).toMatch(/^event-\d+$/);
      // Note: adapter adds 'events:' prefix, then stores with partition 'events',
      // which results in 'events:events:event-id' key
      expect(mockMemoryStore.store).toHaveBeenCalledWith(
        expect.stringMatching(/^events:events:event-\d+$/),
        event,
        undefined
      );
    });

    it('should store event with custom ID', async () => {
      const event = {
        id: 'custom-event-id',
        type: 'test-event',
        payload: { data: 'test' },
        source: 'test-agent'
      };

      const eventId = await adapter.storeEvent(event);

      expect(eventId).toBe('custom-event-id');
    });

    it('should store event with TTL', async () => {
      const event = {
        type: 'test-event',
        payload: { data: 'test' },
        source: 'test-agent',
        ttl: 3600
      };

      await adapter.storeEvent(event);

      expect(mockMemoryStore.store).toHaveBeenCalledWith(
        expect.any(String),
        event,
        3600
      );
    });
  });

  describe('Workflow Operations', () => {
    it('should store workflow state', async () => {
      const workflow = {
        id: 'workflow-1',
        step: 'test-step',
        status: 'in_progress' as const,
        checkpoint: { data: 'checkpoint' },
        sha: 'abc123'
      };

      await adapter.storeWorkflowState(workflow);

      // Note: adapter stores with partition 'workflow_state', resulting in key 'workflow_state:workflow:workflow-1'
      expect(mockMemoryStore.store).toHaveBeenCalledWith(
        'workflow_state:workflow:workflow-1',
        workflow,
        undefined
      );
    });

    it('should retrieve workflow state', async () => {
      const workflow = {
        id: 'workflow-1',
        step: 'test-step',
        status: 'in_progress' as const,
        checkpoint: { data: 'checkpoint' },
        sha: 'abc123'
      };

      mockMemoryStore.retrieve = jest.fn().mockResolvedValue(workflow);

      const result = await adapter.getWorkflowState('workflow-1');

      expect(result).toEqual(workflow);
      expect(mockMemoryStore.retrieve).toHaveBeenCalledWith('workflow_state:workflow:workflow-1');
    });

    it('should throw error if workflow not found', async () => {
      mockMemoryStore.retrieve = jest.fn().mockResolvedValue(null);

      await expect(adapter.getWorkflowState('missing-workflow'))
        .rejects.toThrow('Workflow state not found: missing-workflow');
    });

    it('should update workflow state', async () => {
      const existingWorkflow = {
        id: 'workflow-1',
        step: 'step-1',
        status: 'in_progress' as const,
        checkpoint: { data: 'checkpoint-1' },
        sha: 'abc123'
      };

      mockMemoryStore.retrieve = jest.fn().mockResolvedValue(existingWorkflow);

      await adapter.updateWorkflowState('workflow-1', {
        step: 'step-2',
        status: 'completed'
      });

      expect(mockMemoryStore.store).toHaveBeenCalledWith(
        'workflow_state:workflow:workflow-1',
        expect.objectContaining({
          id: 'workflow-1',
          step: 'step-2',
          status: 'completed',
          checkpoint: { data: 'checkpoint-1' },
          sha: 'abc123'
        }),
        undefined
      );
    });
  });

  describe('Stats Operations', () => {
    it('should return basic stats structure', async () => {
      const stats = await adapter.stats();

      expect(stats).toEqual({
        totalEntries: 0,
        totalHints: 0,
        totalEvents: 0,
        totalWorkflows: 0,
        totalPatterns: 0,
        totalConsensus: 0,
        totalMetrics: 0,
        totalArtifacts: 0,
        totalSessions: 0,
        totalAgents: 0,
        totalGOAPGoals: 0,
        totalGOAPActions: 0,
        totalGOAPPlans: 0,
        totalOODACycles: 0,
        partitions: ['default'],
        accessLevels: {}
      });
    });
  });

  describe('Cleanup Operations', () => {
    it('should clean expired entries (no-op)', async () => {
      const result = await adapter.cleanExpired();
      expect(result).toBe(0);
    });

    it('should close connection (no-op)', async () => {
      await expect(adapter.close()).resolves.toBeUndefined();
    });
  });
});
