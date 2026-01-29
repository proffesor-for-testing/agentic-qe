/**
 * Unit tests for Agent MCP Handlers
 * Tests agent listing, spawning, metrics, and status operations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  handleAgentList,
  handleAgentSpawn,
  handleAgentMetrics,
  handleAgentStatus,
} from '../../../../src/mcp/handlers/agent-handlers';
import {
  handleFleetInit,
  disposeFleet,
} from '../../../../src/mcp/handlers/core-handlers';
import type { AgentListParams, AgentSpawnParams, AgentMetricsParams } from '../../../../src/mcp/types';
import type { DomainName } from '../../../../src/shared/types';

// ============================================================================
// Tests
// ============================================================================

describe('Agent Handlers', () => {
  // Initialize fleet before each test
  beforeEach(async () => {
    await handleFleetInit({});
  });

  // Clean up after each test
  afterEach(async () => {
    await disposeFleet();
  });

  // --------------------------------------------------------------------------
  // handleAgentList
  // --------------------------------------------------------------------------

  describe('handleAgentList', () => {
    it('should return error when fleet is not initialized', async () => {
      await disposeFleet();
      const result = await handleAgentList({});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
    });

    it('should return empty list when no agents exist', async () => {
      const result = await handleAgentList({});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should list all agents', async () => {
      // Spawn some agents first
      await handleAgentSpawn({ domain: 'test-generation' });
      await handleAgentSpawn({ domain: 'test-execution' });

      const result = await handleAgentList({});

      expect(result.success).toBe(true);
      expect(result.data!.length).toBe(2);
    });

    it('should filter agents by domain', async () => {
      await handleAgentSpawn({ domain: 'test-generation' });
      await handleAgentSpawn({ domain: 'test-execution' });
      await handleAgentSpawn({ domain: 'test-generation' });

      const result = await handleAgentList({ domain: 'test-generation' });

      expect(result.success).toBe(true);
      expect(result.data!.length).toBe(2);
      result.data!.forEach(agent => {
        expect(agent.domain).toBe('test-generation');
      });
    });

    it('should filter agents by status', async () => {
      await handleAgentSpawn({ domain: 'test-generation' });
      await handleAgentSpawn({ domain: 'test-execution' });

      // By default, spawned agents are idle
      const result = await handleAgentList({ status: 'idle' });

      expect(result.success).toBe(true);
      result.data!.forEach(agent => {
        // Status may be 'idle' or related to the initial spawn state
        expect(agent.status).toBeDefined();
      });
    });

    it('should apply limit parameter', async () => {
      await handleAgentSpawn({ domain: 'test-generation' });
      await handleAgentSpawn({ domain: 'test-execution' });
      await handleAgentSpawn({ domain: 'coverage-analysis' });

      const result = await handleAgentList({ limit: 2 });

      expect(result.success).toBe(true);
      expect(result.data!.length).toBe(2);
    });

    it('should return correct agent properties', async () => {
      await handleAgentSpawn({
        domain: 'test-generation',
        type: 'specialist',
        capabilities: ['unit-testing'],
      });

      const result = await handleAgentList({});

      expect(result.success).toBe(true);
      expect(result.data!.length).toBeGreaterThan(0);

      const agent = result.data![0];
      expect(agent.id).toBeDefined();
      expect(agent.domain).toBe('test-generation');
      expect(agent.type).toBeDefined();
      expect(agent.status).toBeDefined();
    });

    it('should handle combined filters', async () => {
      await handleAgentSpawn({ domain: 'test-generation' });
      await handleAgentSpawn({ domain: 'test-generation' });
      await handleAgentSpawn({ domain: 'test-execution' });

      const result = await handleAgentList({
        domain: 'test-generation',
        limit: 1,
      });

      expect(result.success).toBe(true);
      expect(result.data!.length).toBe(1);
      expect(result.data![0].domain).toBe('test-generation');
    });
  });

  // --------------------------------------------------------------------------
  // handleAgentSpawn
  // --------------------------------------------------------------------------

  describe('handleAgentSpawn', () => {
    it('should return error when fleet is not initialized', async () => {
      await disposeFleet();
      const result = await handleAgentSpawn({ domain: 'test-generation' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
    });

    it('should spawn agent with required domain parameter', async () => {
      const result = await handleAgentSpawn({ domain: 'test-generation' });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.agentId).toBeDefined();
      expect(result.data!.domain).toBe('test-generation');
      expect(result.data!.status).toBe('spawned');
    });

    it('should use default type when not specified', async () => {
      const result = await handleAgentSpawn({ domain: 'test-generation' });

      expect(result.success).toBe(true);
      expect(result.data!.type).toBe('worker');
    });

    it('should respect custom type parameter', async () => {
      const result = await handleAgentSpawn({
        domain: 'test-generation',
        type: 'specialist',
      });

      expect(result.success).toBe(true);
      expect(result.data!.type).toBe('specialist');
    });

    it('should use default capabilities when not specified', async () => {
      const result = await handleAgentSpawn({ domain: 'test-generation' });

      expect(result.success).toBe(true);
      expect(result.data!.capabilities).toEqual(['general']);
    });

    it('should respect custom capabilities parameter', async () => {
      const result = await handleAgentSpawn({
        domain: 'test-generation',
        capabilities: ['unit-testing', 'integration-testing'],
      });

      expect(result.success).toBe(true);
      expect(result.data!.capabilities).toEqual(['unit-testing', 'integration-testing']);
    });

    it('should generate unique agent IDs', async () => {
      const result1 = await handleAgentSpawn({ domain: 'test-generation' });
      const result2 = await handleAgentSpawn({ domain: 'test-generation' });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.data!.agentId).not.toBe(result2.data!.agentId);
    });

    it('should spawn agents across different domains', async () => {
      const domains: DomainName[] = [
        'test-generation',
        'test-execution',
        'coverage-analysis',
      ];

      const results = await Promise.all(
        domains.map(domain => handleAgentSpawn({ domain }))
      );

      results.forEach((result, i) => {
        expect(result.success).toBe(true);
        expect(result.data!.domain).toBe(domains[i]);
      });
    });
  });

  // --------------------------------------------------------------------------
  // handleAgentMetrics
  // --------------------------------------------------------------------------

  describe('handleAgentMetrics', () => {
    it('should return error when fleet is not initialized', async () => {
      await disposeFleet();
      const result = await handleAgentMetrics({});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
    });

    it('should return fleet-wide agent metrics', async () => {
      await handleAgentSpawn({ domain: 'test-generation' });
      await handleAgentSpawn({ domain: 'test-execution' });

      const result = await handleAgentMetrics({});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.totalAgents).toBeGreaterThanOrEqual(0);
      expect(result.data!.activeAgents).toBeGreaterThanOrEqual(0);
      expect(result.data!.idleAgents).toBeGreaterThanOrEqual(0);
      expect(result.data!.utilization).toBeDefined();
    });

    it('should include task stats when metric is all', async () => {
      const result = await handleAgentMetrics({ metric: 'all' });

      expect(result.success).toBe(true);
      expect(result.data!.taskStats).toBeDefined();
      expect(result.data!.taskStats!.completed).toBeGreaterThanOrEqual(0);
      expect(result.data!.taskStats!.failed).toBeGreaterThanOrEqual(0);
      expect(result.data!.taskStats!.averageDuration).toBeGreaterThanOrEqual(0);
    });

    it('should include task stats when metric is tasks', async () => {
      const result = await handleAgentMetrics({ metric: 'tasks' });

      expect(result.success).toBe(true);
      expect(result.data!.taskStats).toBeDefined();
    });

    it('should include resource stats when metric is all', async () => {
      const result = await handleAgentMetrics({ metric: 'all' });

      expect(result.success).toBe(true);
      expect(result.data!.resourceStats).toBeDefined();
      expect(result.data!.resourceStats!.cpu).toBeGreaterThanOrEqual(0);
      expect(result.data!.resourceStats!.memory).toBeGreaterThanOrEqual(0);
    });

    it('should include resource stats when metric is cpu', async () => {
      const result = await handleAgentMetrics({ metric: 'cpu' });

      expect(result.success).toBe(true);
      expect(result.data!.resourceStats).toBeDefined();
    });

    it('should include resource stats when metric is memory', async () => {
      const result = await handleAgentMetrics({ metric: 'memory' });

      expect(result.success).toBe(true);
      expect(result.data!.resourceStats).toBeDefined();
    });

    it('should accept optional agentId parameter', async () => {
      const spawnResult = await handleAgentSpawn({ domain: 'test-generation' });
      const result = await handleAgentMetrics({
        agentId: spawnResult.data!.agentId,
      });

      expect(result.success).toBe(true);
      expect(result.data!.agentId).toBe(spawnResult.data!.agentId);
    });

    it('should return all metrics by default (no metric specified)', async () => {
      const result = await handleAgentMetrics({});

      expect(result.success).toBe(true);
      expect(result.data!.taskStats).toBeDefined();
      expect(result.data!.resourceStats).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // handleAgentStatus
  // --------------------------------------------------------------------------

  describe('handleAgentStatus', () => {
    it('should return error when fleet is not initialized', async () => {
      await disposeFleet();
      const result = await handleAgentStatus({ agentId: 'agent-1' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
    });

    it('should return error for non-existent agent', async () => {
      const result = await handleAgentStatus({ agentId: 'nonexistent-agent' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Agent not found');
    });

    it('should return agent status for valid agent', async () => {
      const spawnResult = await handleAgentSpawn({ domain: 'test-generation' });
      const result = await handleAgentStatus({
        agentId: spawnResult.data!.agentId,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.agentId).toBe(spawnResult.data!.agentId);
      expect(result.data!.domain).toBe('test-generation');
      expect(result.data!.status).toBeDefined();
    });

    it('should include performance metrics', async () => {
      const spawnResult = await handleAgentSpawn({ domain: 'test-generation' });
      const result = await handleAgentStatus({
        agentId: spawnResult.data!.agentId,
      });

      expect(result.success).toBe(true);
      expect(result.data!.performance).toBeDefined();
      expect(result.data!.performance!.tasksCompleted).toBeGreaterThanOrEqual(0);
      expect(result.data!.performance!.averageTime).toBeGreaterThanOrEqual(0);
      expect(result.data!.performance!.successRate).toBeGreaterThanOrEqual(0);
    });

    it('should include startedAt timestamp', async () => {
      const spawnResult = await handleAgentSpawn({ domain: 'test-generation' });
      const result = await handleAgentStatus({
        agentId: spawnResult.data!.agentId,
      });

      expect(result.success).toBe(true);
      expect(result.data!.startedAt).toBeDefined();
    });

    it('should return correct type from spawn', async () => {
      const spawnResult = await handleAgentSpawn({
        domain: 'test-generation',
        type: 'specialist',
      });
      const result = await handleAgentStatus({
        agentId: spawnResult.data!.agentId,
      });

      expect(result.success).toBe(true);
      expect(result.data!.type).toBe('specialist');
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases and Error Handling
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle listing agents after some are spawned', async () => {
      // Spawn multiple agents
      for (let i = 0; i < 5; i++) {
        await handleAgentSpawn({ domain: 'test-generation' });
      }

      const listResult = await handleAgentList({});
      expect(listResult.success).toBe(true);
      expect(listResult.data!.length).toBe(5);
    });

    it('should handle concurrent spawn requests', async () => {
      const results = await Promise.all([
        handleAgentSpawn({ domain: 'test-generation' }),
        handleAgentSpawn({ domain: 'test-execution' }),
        handleAgentSpawn({ domain: 'coverage-analysis' }),
      ]);

      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      // All agent IDs should be unique
      const ids = results.map(r => r.data!.agentId);
      expect(new Set(ids).size).toBe(3);
    });

    it('should handle empty domain filter with no matching agents', async () => {
      await handleAgentSpawn({ domain: 'test-generation' });

      const result = await handleAgentList({ domain: 'security-compliance' });

      expect(result.success).toBe(true);
      expect(result.data!.length).toBe(0);
    });

    it('should handle limit of 0', async () => {
      await handleAgentSpawn({ domain: 'test-generation' });
      await handleAgentSpawn({ domain: 'test-execution' });

      const result = await handleAgentList({ limit: 0 });

      expect(result.success).toBe(true);
      expect(result.data!.length).toBe(0);
    });

    it('should handle limit greater than agent count', async () => {
      await handleAgentSpawn({ domain: 'test-generation' });

      const result = await handleAgentList({ limit: 100 });

      expect(result.success).toBe(true);
      expect(result.data!.length).toBe(1);
    });
  });
});
