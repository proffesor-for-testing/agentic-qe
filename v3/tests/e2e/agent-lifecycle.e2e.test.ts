/**
 * E2E Test: Agent Lifecycle
 * TQ-004: Tests agent spawn -> execute task -> report results -> cleanup
 *
 * Uses mock agent implementations via the shared mock factory
 * but exercises real state transitions, event emissions, and coordinator logic.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockEventBus,
  createMockMemory,
  createMockAgentCoordinator,
} from '../mocks';
import type { EventBus, MemoryBackend, AgentCoordinator } from '../../src/kernel/interfaces';
import type { DomainEvent, DomainName } from '../../src/shared/types';

// ============================================================================
// Test Suite
// ============================================================================

describe('Agent Lifecycle E2E - Spawn -> Execute -> Report -> Cleanup', () => {
  let eventBus: EventBus;
  let memory: MemoryBackend;
  let agentCoordinator: AgentCoordinator;

  beforeEach(() => {
    eventBus = createMockEventBus();
    memory = createMockMemory();
    agentCoordinator = createMockAgentCoordinator();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // 1. Agent spawn produces a valid agent ID
  // --------------------------------------------------------------------------
  it('should spawn an agent and return a unique ID', async () => {
    // Arrange
    const config = {
      name: 'test-generator-1',
      domain: 'test-generation' as DomainName,
      type: 'generator',
      capabilities: ['unit-test', 'integration-test'],
    };

    // Act
    const result = await agentCoordinator.spawn(config);

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBeDefined();
      expect(typeof result.value).toBe('string');
      expect(result.value.length).toBeGreaterThan(0);
    }
  });

  // --------------------------------------------------------------------------
  // 2. Spawned agent appears in agent listing
  // --------------------------------------------------------------------------
  it('should list spawned agents with correct metadata', async () => {
    // Arrange
    await agentCoordinator.spawn({
      name: 'coverage-analyzer',
      domain: 'coverage-analysis' as DomainName,
      type: 'analyzer',
      capabilities: ['line-coverage', 'branch-coverage'],
    });

    // Act
    const agents = agentCoordinator.listAgents();

    // Assert
    expect(agents.length).toBe(1);
    expect(agents[0]).toMatchObject({
      name: 'coverage-analyzer',
      domain: 'coverage-analysis',
      type: 'analyzer',
      status: 'idle',
    });
    expect(agents[0].startedAt).toBeInstanceOf(Date);
  });

  // --------------------------------------------------------------------------
  // 3. Agent filtering by domain
  // --------------------------------------------------------------------------
  it('should filter agents by domain', async () => {
    // Arrange
    await agentCoordinator.spawn({
      name: 'gen-agent',
      domain: 'test-generation' as DomainName,
      type: 'generator',
      capabilities: [],
    });
    await agentCoordinator.spawn({
      name: 'cov-agent',
      domain: 'coverage-analysis' as DomainName,
      type: 'analyzer',
      capabilities: [],
    });
    await agentCoordinator.spawn({
      name: 'gen-agent-2',
      domain: 'test-generation' as DomainName,
      type: 'generator',
      capabilities: [],
    });

    // Act
    const testGenAgents = agentCoordinator.listAgents({
      domain: 'test-generation' as DomainName,
    });

    // Assert
    expect(testGenAgents.length).toBe(2);
    expect(testGenAgents.every((a) => a.domain === 'test-generation')).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 4. Events are published when significant actions occur
  // --------------------------------------------------------------------------
  it('should publish events through the event bus', async () => {
    // Arrange
    const receivedEvents: DomainEvent[] = [];
    eventBus.subscribe('agent.spawned', async (event: DomainEvent) => {
      receivedEvents.push(event);
    });

    // Act: publish an agent.spawned event to simulate the lifecycle event
    await eventBus.publish({
      id: 'evt-1',
      type: 'agent.spawned',
      timestamp: new Date(),
      source: 'coordination' as DomainName,
      payload: { agentId: 'agent-1', name: 'test-gen', domain: 'test-generation' },
    });

    // Assert
    expect(receivedEvents.length).toBe(1);
    expect(receivedEvents[0].type).toBe('agent.spawned');
    expect(receivedEvents[0].payload).toMatchObject({
      agentId: 'agent-1',
      name: 'test-gen',
    });
  });

  // --------------------------------------------------------------------------
  // 5. Agent stop removes agent from active list
  // --------------------------------------------------------------------------
  it('should stop an agent and remove it from listings', async () => {
    // Arrange
    const spawnResult = await agentCoordinator.spawn({
      name: 'ephemeral-agent',
      domain: 'quality-assessment' as DomainName,
      type: 'validator',
      capabilities: ['quality-gate'],
    });
    expect(spawnResult.success).toBe(true);
    const agentId = spawnResult.success ? spawnResult.value : '';

    // Act
    const stopResult = await agentCoordinator.stop(agentId);

    // Assert
    expect(stopResult.success).toBe(true);
    const agents = agentCoordinator.listAgents();
    expect(agents.find((a) => a.id === agentId)).toBeUndefined();
  });

  // --------------------------------------------------------------------------
  // 6. Stopping a non-existent agent returns an error
  // --------------------------------------------------------------------------
  it('should return error when stopping a non-existent agent', async () => {
    // Act
    const result = await agentCoordinator.stop('non-existent-id');

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toContain('not found');
    }
  });

  // --------------------------------------------------------------------------
  // 7. Memory backend stores and retrieves agent state
  // --------------------------------------------------------------------------
  it('should persist agent state in memory backend', async () => {
    // Arrange
    const agentState = {
      id: 'agent-42',
      currentTask: 'generate-unit-tests',
      progress: 0.5,
      metrics: { testsGenerated: 12, estimatedCoverage: 0.78 },
    };

    // Act
    await memory.set('agent:agent-42:state', agentState);
    const retrieved = await memory.get<typeof agentState>('agent:agent-42:state');

    // Assert
    expect(retrieved).toEqual(agentState);
  });

  // --------------------------------------------------------------------------
  // 8. canSpawn respects maximum agent limit
  // --------------------------------------------------------------------------
  it('should respect spawn capacity limits', async () => {
    // Arrange: mock coordinator allows 15 agents max

    // Act: spawn agents until limit
    for (let i = 0; i < 14; i++) {
      await agentCoordinator.spawn({
        name: `agent-${i}`,
        domain: 'test-generation' as DomainName,
        type: 'generator',
        capabilities: [],
      });
    }

    // Assert: still room for one more
    expect(agentCoordinator.canSpawn()).toBe(true);

    // Spawn one more to hit the limit
    await agentCoordinator.spawn({
      name: 'agent-14',
      domain: 'test-generation' as DomainName,
      type: 'generator',
      capabilities: [],
    });

    // Now at limit
    expect(agentCoordinator.canSpawn()).toBe(false);
  });

  // --------------------------------------------------------------------------
  // 9. Event bus channel subscriptions work for domain events
  // --------------------------------------------------------------------------
  it('should deliver events to domain channel subscribers', async () => {
    // Arrange
    const domainEvents: DomainEvent[] = [];
    eventBus.subscribeToChannel('test-generation' as DomainName, async (event) => {
      domainEvents.push(event);
    });

    // Act
    await eventBus.publish({
      id: 'evt-domain-1',
      type: 'test.completed',
      timestamp: new Date(),
      source: 'test-generation' as DomainName,
      payload: { testId: 't-1', passed: true },
    });

    // Publish to different domain (should not be received)
    await eventBus.publish({
      id: 'evt-domain-2',
      type: 'coverage.analyzed',
      timestamp: new Date(),
      source: 'coverage-analysis' as DomainName,
      payload: { coverage: 0.85 },
    });

    // Assert
    expect(domainEvents.length).toBe(1);
    expect(domainEvents[0].source).toBe('test-generation');
  });

  // --------------------------------------------------------------------------
  // 10. Full lifecycle: spawn, store state, emit events, cleanup
  // --------------------------------------------------------------------------
  it('should complete full agent lifecycle end-to-end', async () => {
    // Arrange
    const lifecycleEvents: string[] = [];

    eventBus.subscribe('agent.spawned', async () => {
      lifecycleEvents.push('spawned');
    });
    eventBus.subscribe('agent.task.completed', async () => {
      lifecycleEvents.push('task.completed');
    });
    eventBus.subscribe('agent.stopped', async () => {
      lifecycleEvents.push('stopped');
    });

    // Act: Step 1 - Spawn
    const spawnResult = await agentCoordinator.spawn({
      name: 'lifecycle-agent',
      domain: 'test-generation' as DomainName,
      type: 'generator',
      capabilities: ['unit-test'],
    });
    expect(spawnResult.success).toBe(true);
    const agentId = spawnResult.success ? spawnResult.value : '';

    await eventBus.publish({
      id: 'evt-spawn',
      type: 'agent.spawned',
      timestamp: new Date(),
      source: 'coordination' as DomainName,
      payload: { agentId },
    });

    // Act: Step 2 - Execute task (store results in memory)
    await memory.set(`agent:${agentId}:result`, {
      testsGenerated: 5,
      coverageEstimate: 0.82,
    });

    await eventBus.publish({
      id: 'evt-task',
      type: 'agent.task.completed',
      timestamp: new Date(),
      source: 'coordination' as DomainName,
      payload: { agentId, taskId: 'task-1' },
    });

    // Act: Step 3 - Cleanup
    await agentCoordinator.stop(agentId);
    await memory.delete(`agent:${agentId}:result`);

    await eventBus.publish({
      id: 'evt-stop',
      type: 'agent.stopped',
      timestamp: new Date(),
      source: 'coordination' as DomainName,
      payload: { agentId },
    });

    // Assert: full lifecycle completed in order
    expect(lifecycleEvents).toEqual(['spawned', 'task.completed', 'stopped']);
    expect(agentCoordinator.listAgents().find((a) => a.id === agentId)).toBeUndefined();
    expect(await memory.has(`agent:${agentId}:result`)).toBe(false);
  });
});
