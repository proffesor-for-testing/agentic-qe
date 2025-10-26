/**
 * Phase 1 Integration Tests: MCP End-to-End
 *
 * Tests all memory MCP tools, coordination MCP tools,
 * tool chaining, and error handling.
 *
 * Note: This tests the MCP tool implementations directly without
 * requiring the MCP server to be running.
 */

import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import { BlackboardCoordination } from '@core/coordination/BlackboardCoordination';
import { ConsensusGating } from '@core/coordination/ConsensusGating';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';

describe('Phase 1 - MCP End-to-End Integration', () => {
  let memory: SwarmMemoryManager;
  let blackboard: BlackboardCoordination;
  let consensus: ConsensusGating;
  let tempDbPath: string;

  beforeAll(async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aqe-mcp-test-'));
    tempDbPath = path.join(tempDir, 'test.db');
  });

  beforeEach(async () => {
    memory = new SwarmMemoryManager(tempDbPath);
    await memory.initialize();
    blackboard = new BlackboardCoordination(memory);
    consensus = new ConsensusGating(memory);
  });

  afterEach(async () => {
    await memory.close();
  });

  afterAll(async () => {
    await fs.remove(path.dirname(tempDbPath));
  });

  describe('Memory MCP Tools', () => {
    test('should store and retrieve memory entries (memory_store/memory_retrieve)', async () => {
      // Simulate MCP tool: memory_store
      await memory.store('test-key', {
        data: 'test-value',
        metadata: { source: 'mcp-tool' }
      }, {
        partition: 'shared_state',
        ttl: 3600
      });

      // Simulate MCP tool: memory_retrieve
      const result = await memory.retrieve('test-key', {
        partition: 'shared_state'
      });

      expect(result).toEqual({
        data: 'test-value',
        metadata: { source: 'mcp-tool' }
      });
    });

    test('should query memory with patterns (memory_query)', async () => {
      await memory.store('aqe/task/1', { id: 1 }, { partition: 'shared_state' });
      await memory.store('aqe/task/2', { id: 2 }, { partition: 'shared_state' });
      await memory.store('aqe/task/3', { id: 3 }, { partition: 'shared_state' });

      // Simulate MCP tool: memory_query
      const results = await memory.query('aqe/task/%', {
        partition: 'shared_state'
      });

      expect(results).toHaveLength(3);
      expect(results.map(r => r.value.id).sort()).toEqual([1, 2, 3]);
    });

    test('should delete memory entries (memory_delete)', async () => {
      await memory.store('temp-key', { data: 'temporary' }, {
        partition: 'test'
      });

      // Simulate MCP tool: memory_delete
      await memory.delete('temp-key', 'test');

      const result = await memory.retrieve('temp-key', { partition: 'test' });
      expect(result).toBeNull();
    });

    test('should clear partition (memory_clear)', async () => {
      await memory.store('key1', { data: 1 }, { partition: 'temp' });
      await memory.store('key2', { data: 2 }, { partition: 'temp' });

      // Simulate MCP tool: memory_clear
      await memory.clear('temp');

      const key1 = await memory.retrieve('key1', { partition: 'temp' });
      const key2 = await memory.retrieve('key2', { partition: 'temp' });

      expect(key1).toBeNull();
      expect(key2).toBeNull();
    });

    test('should get memory statistics (memory_stats)', async () => {
      await memory.store('stats-key', { data: 'test' }, { partition: 'test' });
      await memory.postHint({ key: 'hint', value: 'test' });

      // Simulate MCP tool: memory_stats
      const stats = await memory.stats();

      expect(stats.totalEntries).toBeGreaterThan(0);
      expect(stats.totalHints).toBeGreaterThan(0);
      expect(stats.partitions).toContain('test');
    });
  });

  describe('Blackboard MCP Tools', () => {
    test('should post and read hints (blackboard_post_hint/blackboard_read_hints)', async () => {
      // Simulate MCP tool: blackboard_post_hint
      await blackboard.postHint({
        key: 'aqe/coordination/task-available',
        value: { taskId: 'task-123', priority: 'high' },
        ttl: 3600
      });

      // Simulate MCP tool: blackboard_read_hints
      const hints = await blackboard.readHints('aqe/coordination/%');

      expect(hints).toHaveLength(1);
      expect(hints[0].key).toBe('aqe/coordination/task-available');
      expect(hints[0].value.taskId).toBe('task-123');
    });

    test('should wait for hints (blackboard_wait_for_hint)', async () => {
      // Simulate MCP tool: blackboard_wait_for_hint with immediate post
      const waitPromise = blackboard.waitForHint('aqe/test/signal', 5000);

      // Post hint after small delay
      setTimeout(async () => {
        await blackboard.postHint({
          key: 'aqe/test/signal',
          value: { ready: true }
        });
      }, 100);

      const result = await waitPromise;

      expect(result).not.toBeNull();
      expect(result?.value.ready).toBe(true);
    });

    test('should subscribe to hints (blackboard_subscribe)', async () => {
      const received: any[] = [];

      // Simulate MCP tool: blackboard_subscribe
      const unsubscribe = blackboard.subscribeToHints(
        'aqe/notifications/%',
        (hint) => received.push(hint)
      );

      await blackboard.postHint({
        key: 'aqe/notifications/alert',
        value: { type: 'warning' }
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(received).toHaveLength(1);
      unsubscribe();
    });
  });

  describe('Consensus MCP Tools', () => {
    test('should propose and vote on decisions (consensus_propose/consensus_vote)', async () => {
      // Simulate MCP tool: consensus_propose
      const proposalId = await consensus.propose({
        id: 'deploy-decision',
        decision: 'deploy to production',
        quorum: 2,
        proposer: 'agent-1'
      });

      expect(proposalId).toBe('deploy-decision');

      // Simulate MCP tool: consensus_vote
      await consensus.vote(proposalId, 'agent-2');
      await consensus.vote(proposalId, 'agent-3');

      const state = await consensus.getProposalState(proposalId);
      expect(state?.status).toBe('approved');
    });

    test('should get proposal state (consensus_get_state)', async () => {
      const proposalId = await consensus.propose({
        id: 'test-proposal',
        decision: 'test decision',
        quorum: 1,
        proposer: 'agent-1'
      });

      // Simulate MCP tool: consensus_get_state
      const state = await consensus.getProposalState(proposalId);

      expect(state).toBeDefined();
      expect(state?.decision).toBe('test decision');
      expect(state?.proposer).toBe('agent-1');
      expect(state?.quorum).toBe(1);
    });

    test('should reject proposals (consensus_reject)', async () => {
      const proposalId = await consensus.propose({
        id: 'reject-test',
        decision: 'test decision',
        quorum: 2,
        proposer: 'agent-1'
      });

      // Simulate MCP tool: consensus_reject
      await consensus.reject(proposalId, 'agent-1');

      const state = await consensus.getProposalState(proposalId);
      expect(state?.status).toBe('rejected');
    });

    test('should wait for consensus (consensus_wait)', async () => {
      const proposalId = await consensus.propose({
        id: 'wait-test',
        decision: 'test decision',
        quorum: 2,
        proposer: 'agent-1'
      });

      // Simulate MCP tool: consensus_wait with concurrent voting
      const waitPromise = consensus.waitForConsensus(proposalId, 5000);

      setTimeout(async () => {
        await consensus.vote(proposalId, 'agent-2');
        await consensus.vote(proposalId, 'agent-3');
      }, 100);

      const result = await waitPromise;
      expect(result).toBe(true);
    });
  });

  describe('Tool Chaining', () => {
    test('should chain memory → blackboard → consensus workflow', async () => {
      // Step 1: Store task in memory
      await memory.store('task:123', {
        id: 'task-123',
        type: 'deployment',
        priority: 'high'
      }, { partition: 'tasks' });

      // Step 2: Post hint on blackboard
      const task = await memory.retrieve('task:123', { partition: 'tasks' });
      await blackboard.postHint({
        key: 'aqe/tasks/pending/task-123',
        value: task
      });

      // Step 3: Propose consensus for task assignment
      const proposalId = await consensus.propose({
        id: 'assign-task-123',
        decision: `assign task-123 to agent-1`,
        quorum: 2,
        proposer: 'agent-1'
      });

      // Step 4: Vote on proposal
      await consensus.vote(proposalId, 'agent-2');
      await consensus.vote(proposalId, 'agent-3');

      // Step 5: Update task status in memory
      const state = await consensus.getProposalState(proposalId);
      if (state?.status === 'approved') {
        await memory.store('task:123', {
          ...task,
          status: 'assigned',
          assignedTo: 'agent-1'
        }, { partition: 'tasks' });
      }

      // Verify final state
      const updatedTask = await memory.retrieve('task:123', { partition: 'tasks' });
      expect(updatedTask.status).toBe('assigned');
      expect(updatedTask.assignedTo).toBe('agent-1');
    });

    test('should chain consensus → memory → blackboard notification', async () => {
      // Step 1: Consensus decision
      const proposalId = await consensus.propose({
        id: 'config-change',
        decision: 'update timeout to 60s',
        quorum: 2,
        proposer: 'admin'
      });

      await consensus.vote(proposalId, 'agent-1');
      await consensus.vote(proposalId, 'agent-2');

      // Step 2: Store decision result in memory
      const state = await consensus.getProposalState(proposalId);
      await memory.store('config:timeout', {
        value: 60,
        approvedBy: state?.votes,
        timestamp: Date.now()
      }, { partition: 'workflow_state' });

      // Step 3: Notify via blackboard
      await blackboard.postHint({
        key: 'aqe/notifications/config-updated',
        value: { config: 'timeout', newValue: 60 }
      });

      // Verify chain
      const config = await memory.retrieve('config:timeout', {
        partition: 'workflow_state'
      });
      const hints = await blackboard.readHints('aqe/notifications/%');

      expect(config.value).toBe(60);
      expect(hints.some(h => h.key.includes('config-updated'))).toBe(true);
    });

    test('should support complex multi-tool workflows', async () => {
      // Complex workflow: Task distribution with consensus
      const tasks = ['task-1', 'task-2', 'task-3'];
      const agents = ['agent-1', 'agent-2', 'agent-3'];

      // Step 1: Store tasks in memory
      for (const taskId of tasks) {
        await memory.store(`task:${taskId}`, {
          id: taskId,
          status: 'pending'
        }, { partition: 'tasks' });
      }

      // Step 2: Post availability hints
      for (const taskId of tasks) {
        await blackboard.postHint({
          key: `aqe/tasks/available/${taskId}`,
          value: { taskId }
        });
      }

      // Step 3: Agents propose to take tasks
      const proposals = await Promise.all(
        agents.map((agent, idx) =>
          consensus.propose({
            id: `assign-${tasks[idx]}`,
            decision: `assign ${tasks[idx]} to ${agent}`,
            quorum: 1,
            proposer: agent
          })
        )
      );

      // Step 4: Auto-approve (proposer votes)
      for (const proposalId of proposals) {
        const state = await consensus.getProposalState(proposalId);
        expect(state?.votes.length).toBe(1); // proposer auto-votes
      }

      // Verify all proposals created
      expect(proposals).toHaveLength(3);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid memory operations', async () => {
      await expect(
        memory.retrieve('non-existent', { partition: 'test' })
      ).resolves.toBeNull();
    });

    test('should handle invalid consensus operations', async () => {
      await expect(
        consensus.vote('non-existent-proposal', 'agent-1')
      ).rejects.toThrow();
    });

    test('should handle blackboard timeout', async () => {
      const result = await blackboard.waitForHint('never-posted/%', 100);
      expect(result).toBeNull();
    });

    test('should handle concurrent access conflicts gracefully', async () => {
      const key = 'concurrent-key';
      const operations = [];

      // Concurrent writes
      for (let i = 0; i < 10; i++) {
        operations.push(
          memory.store(key, { value: i }, { partition: 'test' })
        );
      }

      await expect(
        Promise.all(operations)
      ).resolves.not.toThrow();

      // Final value should be one of the written values
      const result = await memory.retrieve(key, { partition: 'test' });
      expect(result.value).toBeGreaterThanOrEqual(0);
      expect(result.value).toBeLessThan(10);
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle bulk operations efficiently', async () => {
      const startTime = Date.now();

      // Store 100 entries
      for (let i = 0; i < 100; i++) {
        await memory.store(`bulk-${i}`, { id: i }, { partition: 'test' });
      }

      const duration = Date.now() - startTime;

      // Should complete in reasonable time (< 5s for 100 ops)
      expect(duration).toBeLessThan(5000);
    });

    test('should handle pattern queries on large datasets', async () => {
      // Create 50 entries
      for (let i = 0; i < 50; i++) {
        await memory.store(`aqe/data/${i}`, { value: i }, {
          partition: 'test'
        });
      }

      const startTime = Date.now();
      const results = await memory.query('aqe/data/%', { partition: 'test' });
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(50);
      expect(duration).toBeLessThan(1000); // Should be fast
    });

    test('should handle concurrent MCP tool calls', async () => {
      const operations = [
        memory.store('key1', { data: 1 }, { partition: 'test' }),
        memory.store('key2', { data: 2 }, { partition: 'test' }),
        blackboard.postHint({ key: 'hint1', value: 'test' }),
        blackboard.postHint({ key: 'hint2', value: 'test' }),
        consensus.propose({
          id: 'prop1',
          decision: 'test',
          quorum: 1,
          proposer: 'agent-1'
        })
      ];

      await expect(Promise.all(operations)).resolves.not.toThrow();
    });
  });
});
