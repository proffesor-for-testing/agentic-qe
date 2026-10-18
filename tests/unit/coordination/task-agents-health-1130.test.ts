/**
 * #1130: fleet_status stayed `degraded` after an MCP test run. A caller-owned
 * task finishes through the TaskCompleted/TaskFailed events, which never
 * stopped its agent, and the MinCut topology kept every spawned agent: one
 * agent hanging off its domain is a min cut of 1, below the warning threshold.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  handleTaskCompleted, handleTaskFailed, type QueenEventHandlerContext,
} from '../../../src/coordination/queen-event-handlers.js';
import { createQueenMinCutBridge } from '../../../src/coordination/mincut/queen-integration.js';
import { DefaultAgentCoordinator } from '../../../src/kernel/agent-coordinator.js';
import type { QueenHealth } from '../../../src/coordination/queen-types.js';
import type { TaskExecution } from '../../../src/coordination/queen-types.js';
import type { DomainEvent, EventBus } from '../../../src/shared/types/index.js';

async function spawnAgent(coordinator: DefaultAgentCoordinator): Promise<string> {
  const spawned = await coordinator.spawn({ name: 'test-execution-booster', domain: 'test-execution', type: 'booster', capabilities: [] });
  if (!spawned.success) throw spawned.error;
  return spawned.value;
}

function eventContext(coordinator: DefaultAgentCoordinator, agentId: string) {
  const tasks = new Map<string, TaskExecution>([['t1', {
    taskId: 't1',
    task: {
      id: 't1', type: 'execute-tests', priority: 'p1', targetDomains: ['test-execution'], payload: {},
      timeout: 10000, createdAt: new Date(), executionOwner: 'caller',
    },
    status: 'running', assignedDomain: 'test-execution', assignedAgents: [agentId], retryCount: 0, startedAt: new Date(),
  } as TaskExecution]]);
  return {
    config: { taskRetryLimit: 3 }, tasks, agentCoordinator: coordinator,
    runningTaskCounter: 1, tasksCompleted: 0, tasksFailed: 0,
    taskDurations: { push: vi.fn(), average: vi.fn(() => 0) },
    auditLogger: { logComplete: vi.fn(), logFail: vi.fn() },
    domainBreakerRegistry: null, traceCollector: null, taskTraceContexts: new Map(),
    taskCompletedHook: null, hypothesisManager: null, domainLastActivity: new Map(),
    processQueue: vi.fn(async () => {}), enqueueTask: vi.fn(),
  } as unknown as QueenEventHandlerContext;
}

describe('a finished caller-owned task releases its agent (#1130)', () => {
  it.each([
    ['TaskCompleted', handleTaskCompleted, { taskId: 't1', result: {} }],
    ['TaskFailed', handleTaskFailed, { taskId: 't1', error: 'boom' }],
  ] as const)('stops the agent on %s', async (type, handle, payload) => {
    const coordinator = new DefaultAgentCoordinator();
    const agentId = await spawnAgent(coordinator);

    await handle(eventContext(coordinator, agentId), { type, payload } as unknown as DomainEvent);

    expect(coordinator.listAgents().map(agent => agent.status)).toEqual(['completed']);
    expect(coordinator.getActiveCount()).toBe(0);
  });
});

function bridgeWithEvents(coordinator: DefaultAgentCoordinator) {
  const handlers = new Map<string, (event: DomainEvent) => Promise<void>>();
  const eventBus = {
    publish: vi.fn(async () => {}), unsubscribe: vi.fn(),
    subscribe: vi.fn((type: string, handler: (event: DomainEvent) => Promise<void>) => {
      handlers.set(type, handler);
      return { unsubscribe: vi.fn() };
    }),
  } as unknown as EventBus;
  const bridge = createQueenMinCutBridge(eventBus, coordinator, { persistData: false, autoUpdateFromEvents: true });
  const announce = (agentId: string, taskId?: string) => handlers.get('QueenAgentSpawned')!({
    type: 'QueenAgentSpawned',
    payload: { agentId, domain: 'test-execution', type: 'booster', capabilities: [], ...(taskId ? { taskId } : {}) },
  } as unknown as DomainEvent);
  return { bridge, announce };
}

const base = { status: 'healthy', issues: [] } as unknown as QueenHealth;

describe('MinCut health of the fleet leaves task-scoped agents out (#1130)', () => {
  it('stays healthy while a task runs and keeps the raw MinCut visible', async () => {
    const coordinator = new DefaultAgentCoordinator();
    const { bridge, announce } = bridgeWithEvents(coordinator);
    await bridge.initialize();

    const agentId = await spawnAgent(coordinator);
    await announce(agentId, 'task-1');
    const during = bridge.extendQueenHealth(base);

    expect(during.status).toBe('healthy');
    expect(during.issues).toEqual([]);
    // The raw reading still counts the task agent; only the fleet reading drops it.
    expect(during.minCut).toMatchObject({ status: 'critical', fleetStatus: 'idle', taskAgents: 1 });
    expect(during.minCut?.minCutValue).toBe(bridge.getMinCutValue());
    expect(bridge.getGraph().hasVertex(`agent:${agentId}`)).toBe(true);
    await bridge.dispose();
  });

  it('returns the fleet to healthy and drops the agent vertex once the task agent has stopped', async () => {
    const coordinator = new DefaultAgentCoordinator();
    const { bridge, announce } = bridgeWithEvents(coordinator);
    await bridge.initialize();
    const agentId = await spawnAgent(coordinator);
    await announce(agentId, 'task-1');

    await coordinator.stop(agentId);
    const after = bridge.extendQueenHealth(base);

    expect(after.status).toBe('healthy');
    expect(after.minCut).toMatchObject({ status: 'idle', fleetStatus: 'idle', taskAgents: 0 });
    expect(bridge.getGraph().hasVertex(`agent:${agentId}`)).toBe(false);
    await bridge.dispose();
  });

  it('keeps the status degraded when a domain is unhealthy, even while a task runs', async () => {
    const coordinator = new DefaultAgentCoordinator();
    const { bridge, announce } = bridgeWithEvents(coordinator);
    await bridge.initialize();
    const agentId = await spawnAgent(coordinator);
    await announce(agentId, 'task-1');

    // Queen derives `degraded` from an unhealthy domain before MinCut is added.
    const health = bridge.extendQueenHealth({ ...base, status: 'degraded' } as QueenHealth);

    expect(health.status).toBe('degraded');
    expect(health.minCut).toMatchObject({ fleetStatus: 'idle', taskAgents: 1 });
    await bridge.dispose();
  });

  it('still degrades when the fleet topology itself is below threshold', async () => {
    const coordinator = new DefaultAgentCoordinator();
    const { bridge, announce } = bridgeWithEvents(coordinator);
    await bridge.initialize();

    // An agent spawned without a task (agent_spawn) is part of the fleet. The
    // domain scaffold has domains with no edges, so this topology is critical.
    const longLived = await spawnAgent(coordinator);
    await announce(longLived);
    const taskAgent = await spawnAgent(coordinator);
    await announce(taskAgent, 'task-1');
    const health = bridge.extendQueenHealth(base);

    expect(health.status).toBe('degraded');
    expect(health.minCut).toMatchObject({ fleetStatus: 'critical', taskAgents: 1 });
    await bridge.dispose();
  });
});

// #1130 review: pruning must never hide an outage.
describe('a failed agent keeps the fleet degraded (#1130)', () => {
  it('a crashed long-lived agent keeps its vertex, raises an issue and keeps the fleet degraded', async () => {
    const coordinator = new DefaultAgentCoordinator();
    const { bridge, announce } = bridgeWithEvents(coordinator);
    await bridge.initialize();
    const agentId = await spawnAgent(coordinator);
    await announce(agentId);
    expect(bridge.extendQueenHealth(base).status).toBe('degraded');

    coordinator.markFailed(agentId);
    const health = bridge.extendQueenHealth(base);

    // Review repro: this used to turn `healthy` with 0 issues.
    expect(health.status).toBe('degraded');
    expect(health.issues.map(issue => issue.message)).toContain(`Agent ${agentId} (booster) failed`);
    expect(bridge.getGraph().hasVertex(`agent:${agentId}`)).toBe(true);
    await bridge.dispose();
  });

  it('a crashed task agent degrades the fleet although task agents are left out of the MinCut reading', async () => {
    const coordinator = new DefaultAgentCoordinator();
    const { bridge, announce } = bridgeWithEvents(coordinator);
    await bridge.initialize();
    const agentId = await spawnAgent(coordinator);
    await announce(agentId, 'task-1');
    expect(bridge.extendQueenHealth(base).status).toBe('healthy');

    coordinator.markFailed(agentId);
    const health = bridge.extendQueenHealth(base);

    expect(health.status).toBe('degraded');
    expect(health.issues.map(issue => issue.message)).toContain(`Agent ${agentId} (booster) failed`);
    await bridge.dispose();
  });
});

describe('agents already running when the bridge initializes (#1130)', () => {
  it('are pruned once they complete, like agents spawned later', async () => {
    const coordinator = new DefaultAgentCoordinator();
    const agentId = await spawnAgent(coordinator);
    const { bridge } = bridgeWithEvents(coordinator);
    await bridge.initialize(); // builds the graph from the coordinator's agents
    expect(bridge.getGraph().hasVertex(`agent:${agentId}`)).toBe(true);
    expect(bridge.extendQueenHealth(base).status).toBe('degraded');

    await coordinator.stop(agentId);
    const health = bridge.extendQueenHealth(base);

    expect(bridge.getGraph().hasVertex(`agent:${agentId}`)).toBe(false);
    expect(health.status).toBe('healthy');
    await bridge.dispose();
  });
});
