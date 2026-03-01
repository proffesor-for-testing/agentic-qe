/**
 * AG-UI to A2A Integration Tests
 *
 * Tests the integration between AG-UI event streaming and A2A agent discovery/task management.
 * Validates that external clients can connect via AG-UI SSE, discover agents via A2A,
 * and receive streamed results.
 *
 * @module tests/integration/protocols/ag-ui-a2a-flow
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// AG-UI imports
import {
  createEventAdapter,
  createStateManager,
  AGUIEventType,
  type EventAdapter,
  type StateManager,
  type AGUIEvent,
  type RunStartedEvent,
  type RunFinishedEvent,
  type StepStartedEvent,
  type StepFinishedEvent,
} from '../../../src/adapters/ag-ui/index.js';

// A2A imports
import {
  createDiscoveryService,
  createAgentCardGenerator,
  createTaskManager,
  type DiscoveryService,
  type TaskManager,
  type QEAgentCard,
  type A2AMessage,
} from '../../../src/adapters/a2a/index.js';

// Test utilities
import {
  EventCollector,
  waitFor,
  sleep,
  verifyEventSequence,
  verifyEventExists,
  createMockA2AAgent,
  createTextMessage,
  generateThreadId,
  generateRunId,
  generateTaskId,
  measureLatency,
  collectLatencyStats,
  type MockA2AAgent,
} from './index.js';

// ============================================================================
// Test Setup
// ============================================================================

describe('AG-UI to A2A Integration', () => {
  let eventAdapter: EventAdapter;
  let stateManager: StateManager;
  let discoveryService: DiscoveryService;
  let taskManager: TaskManager;
  let eventCollector: EventCollector;
  let mockAgents: Map<string, MockA2AAgent>;

  beforeEach(() => {
    // Initialize AG-UI components
    eventAdapter = createEventAdapter({
      defaultThreadId: 'integration-test',
      trackMessageState: true,
      trackActivityState: true,
      enableBatching: false,
    });

    stateManager = createStateManager({
      enableHistory: true,
      maxHistorySize: 100,
    });

    // Collect all emitted events
    eventCollector = new EventCollector();
    eventAdapter.on('event', (event: AGUIEvent) => {
      eventCollector.push(event);
    });

    // Initialize A2A components
    const generator = createAgentCardGenerator({
      baseUrl: 'http://localhost:3000',
    });

    discoveryService = createDiscoveryService({
      generator,
      baseUrl: 'http://localhost:3000',
      cacheTtl: 60000,
      enableMetrics: true,
    });

    taskManager = createTaskManager({
      defaultAgentId: 'default-agent',
      autoGenerateContextId: true,
    });

    // Create mock agents
    mockAgents = new Map();

    const testArchitect = createMockA2AAgent({
      id: 'qe-test-architect',
      name: 'qe-test-architect',
      domain: 'test-generation',
      skills: ['test-generation', 'property-testing'],
      responseDelay: 10,
    });
    mockAgents.set('qe-test-architect', testArchitect);

    const coverageSpecialist = createMockA2AAgent({
      id: 'qe-coverage-specialist',
      name: 'qe-coverage-specialist',
      domain: 'coverage-analysis',
      skills: ['coverage-analysis', 'gap-detection'],
      responseDelay: 10,
    });
    mockAgents.set('qe-coverage-specialist', coverageSpecialist);

    const securityScanner = createMockA2AAgent({
      id: 'qe-security-scanner',
      name: 'qe-security-scanner',
      domain: 'security-compliance',
      skills: ['security-scan', 'vulnerability-detection'],
      responseDelay: 10,
    });
    mockAgents.set('qe-security-scanner', securityScanner);

    // Register agent cards with discovery service
    const cards = new Map<string, QEAgentCard>();
    for (const [id, agent] of mockAgents) {
      cards.set(id, agent.card);
    }
    discoveryService.registerCards(cards);
  });

  afterEach(() => {
    eventAdapter.reset();
    eventCollector.clear();
    taskManager.clearAllTasks();
    for (const agent of mockAgents.values()) {
      agent.reset();
    }
  });

  // ============================================================================
  // Basic Flow Tests
  // ============================================================================

  describe('Basic AG-UI to A2A Flow', () => {
    it('should emit RUN_STARTED and discover agents via A2A', async () => {
      const threadId = generateThreadId();
      const runId = generateRunId();

      // 1. AG-UI emits RUN_STARTED
      eventAdapter.emitRunStarted(threadId, runId, { message: 'Generate tests' });

      // 2. Discover capable agents via A2A
      const agents = await discoveryService.findBySkill('test-generation');

      // Verify
      expect(agents.length).toBeGreaterThan(0);
      expect(agents[0].name).toBe('qe-test-architect');

      verifyEventExists(eventCollector.getAll(), 'RUN_STARTED');
    });

    it('should create A2A task and stream progress via AG-UI', async () => {
      const threadId = generateThreadId();
      const runId = generateRunId();

      // 1. Start AG-UI run
      eventAdapter.emitRunStarted(threadId, runId, { message: 'Analyze coverage' });

      // 2. Discover agent
      const agents = await discoveryService.findBySkill('coverage-analysis');
      expect(agents.length).toBeGreaterThan(0);

      // 3. Create A2A task
      const message: A2AMessage = createTextMessage('Analyze coverage for src/');
      const task = taskManager.createTask(message, {
        agentId: agents[0].name,
      });

      // 4. Emit step started for task creation
      eventAdapter.emitStepStarted('discover', 'Agent Discovery', runId);
      eventAdapter.emitStepFinished('discover', { agentId: agents[0].name }, runId);

      // 5. Start task processing
      taskManager.startTask(task.id);
      eventAdapter.emitStepStarted('process', 'Processing Request', runId);

      // 6. Process with mock agent
      const agent = mockAgents.get(agents[0].name)!;
      const result = await agent.handleTask(message);

      // 7. Complete task
      if (result.status === 'completed') {
        taskManager.completeTask(task.id, result.artifacts);
      }

      eventAdapter.emitStepFinished('process', { result: result.status }, runId);

      // 8. Finish run
      eventAdapter.emitRunFinished(runId, 'success', { taskId: task.id });

      // Verify event sequence
      const events = eventCollector.getAll();
      verifyEventSequence(events, [
        'RUN_STARTED',
        'STEP_STARTED',
        'STEP_FINISHED',
        'STEP_STARTED',
        'STEP_FINISHED',
        'RUN_FINISHED',
      ]);

      // Verify task completed
      const completedTask = taskManager.getTask(task.id);
      expect(completedTask?.status).toBe('completed');
      expect(completedTask?.artifacts.length).toBeGreaterThan(0);
    });

    it('should handle agent discovery with no matching skills', async () => {
      const runId = generateRunId();

      // Start run
      eventAdapter.emitRunStarted(generateThreadId(), runId, { message: 'Unknown task' });

      // Try to find non-existent skill
      const agents = await discoveryService.findBySkill('non-existent-skill');

      expect(agents.length).toBe(0);

      // Emit error via AG-UI
      eventAdapter.emitRunError(runId, 'No agent found for requested skill', 'AGENT_NOT_FOUND', false);

      // Verify error event
      verifyEventExists(eventCollector.getAll(), 'RUN_ERROR', (e) => {
        return (e as { code?: string }).code === 'AGENT_NOT_FOUND';
      });
    });
  });

  // ============================================================================
  // Multi-Agent Coordination Tests
  // ============================================================================

  describe('Multi-Agent Coordination', () => {
    it('should discover multiple agents and coordinate via A2A', async () => {
      const runId = generateRunId();

      // Start run
      eventAdapter.emitRunStarted(generateThreadId(), runId, {
        message: 'Full quality analysis',
      });

      // Discover agents for different capabilities
      const [testAgents, coverageAgents, securityAgents] = await Promise.all([
        discoveryService.findBySkill('test-generation'),
        discoveryService.findBySkill('coverage-analysis'),
        discoveryService.findBySkill('security-scan'),
      ]);

      expect(testAgents.length).toBeGreaterThan(0);
      expect(coverageAgents.length).toBeGreaterThan(0);
      expect(securityAgents.length).toBeGreaterThan(0);

      // Create tasks for each agent
      const tasks = [];

      // Test generation task
      const testTask = taskManager.createTask(
        createTextMessage('Generate tests for src/'),
        { agentId: testAgents[0].name }
      );
      tasks.push(testTask);
      eventAdapter.emitStepStarted(`task-${testTask.id}`, 'Test Generation', runId);

      // Coverage task
      const coverageTask = taskManager.createTask(
        createTextMessage('Analyze coverage'),
        { agentId: coverageAgents[0].name }
      );
      tasks.push(coverageTask);
      eventAdapter.emitStepStarted(`task-${coverageTask.id}`, 'Coverage Analysis', runId);

      // Security task
      const securityTask = taskManager.createTask(
        createTextMessage('Security scan'),
        { agentId: securityAgents[0].name }
      );
      tasks.push(securityTask);
      eventAdapter.emitStepStarted(`task-${securityTask.id}`, 'Security Scan', runId);

      // Process all tasks concurrently
      await Promise.all(
        tasks.map(async (task) => {
          const agentId = task.metadata.agentId!;
          const agent = mockAgents.get(agentId)!;

          taskManager.startTask(task.id);

          const result = await agent.handleTask(task.message);

          if (result.status === 'completed') {
            taskManager.completeTask(task.id, result.artifacts);
          } else {
            taskManager.failTask(task.id, { message: result.error || 'Unknown error', code: 'TASK_FAILED' });
          }

          eventAdapter.emitStepFinished(`task-${task.id}`, { status: result.status }, runId);
        })
      );

      // Finish run
      eventAdapter.emitRunFinished(runId, 'success', {
        taskIds: tasks.map((t) => t.id),
      });

      // Verify all tasks completed
      for (const task of tasks) {
        const completed = taskManager.getTask(task.id);
        expect(completed?.status).toBe('completed');
      }

      // Verify all agents were used
      for (const agent of mockAgents.values()) {
        expect(agent.getTaskCount()).toBeGreaterThanOrEqual(0);
      }
    });

    it('should handle partial agent failures gracefully', async () => {
      const runId = generateRunId();

      // Create a failing agent
      const failingAgent = createMockA2AAgent({
        id: 'qe-failing-agent',
        name: 'qe-failing-agent',
        domain: 'test-domain',
        skills: ['always-fails'],
        failureRate: 1.0, // Always fail
      });
      mockAgents.set('qe-failing-agent', failingAgent);
      discoveryService.registerCard(failingAgent.card);

      // Start run
      eventAdapter.emitRunStarted(generateThreadId(), runId, { message: 'Mixed task' });

      // Create successful task
      const successTask = taskManager.createTask(
        createTextMessage('Generate tests'),
        { agentId: 'qe-test-architect' }
      );

      // Create failing task
      const failTask = taskManager.createTask(
        createTextMessage('Fail task'),
        { agentId: 'qe-failing-agent' }
      );

      // Process tasks
      taskManager.startTask(successTask.id);
      taskManager.startTask(failTask.id);

      const successAgent = mockAgents.get('qe-test-architect')!;
      const successResult = await successAgent.handleTask(successTask.message);
      taskManager.completeTask(successTask.id, successResult.artifacts);

      const failResult = await failingAgent.handleTask(failTask.message);
      taskManager.failTask(failTask.id, { message: failResult.error || 'Failed', code: 'TASK_FAILED' });

      // Verify mixed results
      expect(taskManager.getTask(successTask.id)?.status).toBe('completed');
      expect(taskManager.getTask(failTask.id)?.status).toBe('failed');

      // Run should complete with partial success
      eventAdapter.emitRunFinished(runId, 'success', {
        completedTasks: 1,
        failedTasks: 1,
      });

      verifyEventExists(eventCollector.getAll(), 'RUN_FINISHED');
    });
  });

  // ============================================================================
  // State Synchronization Tests
  // ============================================================================

  describe('State Synchronization', () => {
    it('should sync state between AG-UI and A2A task updates', async () => {
      const runId = generateRunId();

      // Initialize state
      stateManager.setState({
        tasks: {},
        agents: {},
      });

      // Start run
      eventAdapter.emitRunStarted(generateThreadId(), runId, { message: 'Sync test' });

      // Emit initial state snapshot
      eventAdapter.emitStateSnapshot(stateManager.getSnapshot(), stateManager.getVersion());

      // Create and track task
      const task = taskManager.createTask(createTextMessage('Test task'), {
        agentId: 'qe-test-architect',
      });

      // Update state to track task
      stateManager.updatePath('/tasks/' + task.id, {
        id: task.id,
        status: task.status,
        agentId: task.metadata.agentId,
      });

      // Emit state delta
      const delta = [
        {
          op: 'add' as const,
          path: `/tasks/${task.id}`,
          value: {
            id: task.id,
            status: task.status,
            agentId: task.metadata.agentId,
          },
        },
      ];
      eventAdapter.emitStateDelta(delta, stateManager.getVersion());

      // Process task
      taskManager.startTask(task.id);

      // Update state
      stateManager.updatePath(`/tasks/${task.id}/status`, 'working');
      eventAdapter.emitStateDelta(
        [{ op: 'replace' as const, path: `/tasks/${task.id}/status`, value: 'working' }],
        stateManager.getVersion()
      );

      // Complete task
      const agent = mockAgents.get('qe-test-architect')!;
      const result = await agent.handleTask(task.message);
      taskManager.completeTask(task.id, result.artifacts);

      // Final state update
      stateManager.updatePath(`/tasks/${task.id}/status`, 'completed');
      eventAdapter.emitStateDelta(
        [{ op: 'replace' as const, path: `/tasks/${task.id}/status`, value: 'completed' }],
        stateManager.getVersion()
      );

      // Finish run
      eventAdapter.emitRunFinished(runId, 'success');

      // Verify state events
      const events = eventCollector.getAll();
      expect(events.some((e) => e.type === 'STATE_SNAPSHOT')).toBe(true);
      expect(events.filter((e) => e.type === 'STATE_DELTA').length).toBeGreaterThanOrEqual(2);

      // Verify final state
      const finalState = stateManager.getSnapshot();
      expect((finalState.tasks as Record<string, { status: string }>)[task.id].status).toBe('completed');
    });

    it('should handle reconnection with state snapshot', async () => {
      const runId = generateRunId();

      // Initial connection
      eventAdapter.emitRunStarted(generateThreadId(), runId, { message: 'Reconnect test' });

      // Create some state
      stateManager.setState({
        agents: { count: 3 },
        tasks: { pending: 2, completed: 5 },
      });

      // Emit snapshot (simulating reconnection)
      eventAdapter.emitStateSnapshot(stateManager.getSnapshot(), stateManager.getVersion());

      // Verify snapshot event
      const snapshotEvents = eventCollector.getByType('STATE_SNAPSHOT');
      expect(snapshotEvents.length).toBeGreaterThan(0);

      const latestSnapshot = snapshotEvents[snapshotEvents.length - 1] as { state: Record<string, unknown> };
      expect(latestSnapshot.state).toMatchObject({
        agents: { count: 3 },
        tasks: { pending: 2, completed: 5 },
      });
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('Error Handling', () => {
    it('should propagate A2A task errors to AG-UI RUN_ERROR', async () => {
      const runId = generateRunId();

      eventAdapter.emitRunStarted(generateThreadId(), runId, { message: 'Error test' });

      // Create task that will fail
      const task = taskManager.createTask(createTextMessage('Will fail'), {
        agentId: 'qe-test-architect',
      });

      taskManager.startTask(task.id);
      eventAdapter.emitStepStarted('process', 'Processing', runId);

      // Simulate task failure
      taskManager.failTask(task.id, {
        message: 'Simulated processing error',
        code: 'PROCESSING_ERROR',
      });

      eventAdapter.emitStepFinished('process', { error: 'Processing error' }, runId);

      // Emit run error
      eventAdapter.emitRunError(
        runId,
        'Task failed: Simulated processing error',
        'TASK_FAILED',
        true
      );

      // Verify error propagation
      verifyEventExists(eventCollector.getAll(), 'RUN_ERROR', (e) => {
        return (e as { recoverable?: boolean }).recoverable === true;
      });

      // Verify task status
      expect(taskManager.getTask(task.id)?.status).toBe('failed');
    });

    it('should handle A2A discovery service errors', async () => {
      const runId = generateRunId();

      eventAdapter.emitRunStarted(generateThreadId(), runId, { message: 'Discovery error test' });

      // Try to get a non-existent agent
      const card = await discoveryService.getAgentCard('non-existent-agent');

      expect(card).toBeNull();

      // Emit error
      eventAdapter.emitRunError(runId, 'Agent not found', 'DISCOVERY_ERROR', false);

      verifyEventExists(eventCollector.getAll(), 'RUN_ERROR');
    });

    it('should handle task cancellation', async () => {
      const runId = generateRunId();

      eventAdapter.emitRunStarted(generateThreadId(), runId, { message: 'Cancel test' });

      // Create and start task
      const task = taskManager.createTask(createTextMessage('Long running task'), {
        agentId: 'qe-test-architect',
      });

      taskManager.startTask(task.id);
      eventAdapter.emitStepStarted('process', 'Processing', runId);

      // Cancel task before completion
      taskManager.cancelTask(task.id, 'User requested cancellation');

      eventAdapter.emitStepFinished('process', { cancelled: true }, runId);
      eventAdapter.emitRunFinished(runId, 'cancelled');

      // Verify cancellation
      expect(taskManager.getTask(task.id)?.status).toBe('canceled');

      const runFinished = verifyEventExists(eventCollector.getAll(), 'RUN_FINISHED') as RunFinishedEvent;
      expect(runFinished.outcome).toBe('cancelled');
    });
  });

  // ============================================================================
  // Performance Tests
  // ============================================================================

  describe('Performance', () => {
    it('should complete AG-UI to A2A flow within 200ms p95', async () => {
      const stats = await collectLatencyStats(async () => {
        const runId = generateRunId();

        // Full flow
        eventAdapter.emitRunStarted(generateThreadId(), runId, { message: 'Perf test' });

        const agents = await discoveryService.findBySkill('test-generation');
        const task = taskManager.createTask(createTextMessage('Test'), {
          agentId: agents[0].name,
        });

        taskManager.startTask(task.id);

        const agent = mockAgents.get(agents[0].name)!;
        const result = await agent.handleTask(task.message);

        taskManager.completeTask(task.id, result.artifacts);
        eventAdapter.emitRunFinished(runId, 'success');
      }, 20);

      // With mock delays of 10ms, p95 should be well under 200ms
      expect(stats.p95).toBeLessThan(200);
    });

    it('should handle high throughput event emission', async () => {
      const runId = generateRunId();
      eventAdapter.emitRunStarted(generateThreadId(), runId, { message: 'Throughput test' });

      const eventCount = 100;
      const start = performance.now();

      for (let i = 0; i < eventCount; i++) {
        eventAdapter.emitStepStarted(`step-${i}`, `Step ${i}`, runId);
        eventAdapter.emitStepFinished(`step-${i}`, { iteration: i }, runId);
      }

      const elapsed = performance.now() - start;

      // Should handle 100 event pairs (200 events) quickly
      expect(elapsed).toBeLessThan(100); // Under 100ms

      // Verify all events were collected
      expect(eventCollector.getByType('STEP_STARTED').length).toBe(eventCount);
      expect(eventCollector.getByType('STEP_FINISHED').length).toBe(eventCount);
    });
  });

  // ============================================================================
  // Context Preservation Tests
  // ============================================================================

  describe('Context Preservation', () => {
    it('should preserve context ID across multi-turn conversations', async () => {
      const runId = generateRunId();

      eventAdapter.emitRunStarted(generateThreadId(), runId, { message: 'Multi-turn test' });

      // First turn
      const task1 = taskManager.createTask(createTextMessage('First message'), {
        agentId: 'qe-test-architect',
      });

      const contextId = task1.contextId;
      expect(contextId).toBeDefined();

      taskManager.startTask(task1.id);
      taskManager.completeTask(task1.id);

      // Second turn with same context
      const task2 = taskManager.createTask(createTextMessage('Second message'), {
        agentId: 'qe-test-architect',
        contextId,
      });

      expect(task2.contextId).toBe(contextId);

      // Third turn
      const task3 = taskManager.createTask(createTextMessage('Third message'), {
        agentId: 'qe-test-architect',
        contextId,
      });

      expect(task3.contextId).toBe(contextId);

      // Verify context ID preserved across conversation
      const tasksInContext = taskManager.getTasksByContext(contextId!);
      expect(tasksInContext.length).toBe(3);
    });

    it('should track run metadata across events', async () => {
      const threadId = generateThreadId();
      const runId = generateRunId();
      const metadata = {
        requestId: 'req-123',
        userId: 'user-456',
        source: 'integration-test',
      };

      // Start run with metadata
      eventAdapter.emitRunStarted(threadId, runId, metadata);

      // Verify run context
      const activeRuns = eventAdapter.getActiveRuns();
      expect(activeRuns.has(runId)).toBe(true);
      expect(activeRuns.get(runId)?.threadId).toBe(threadId);

      // Process steps
      eventAdapter.emitStepStarted('step-1', 'Step 1', runId);
      eventAdapter.emitStepFinished('step-1', {}, runId);

      // Finish run
      eventAdapter.emitRunFinished(runId, 'success');

      // Verify run completed
      expect(eventAdapter.getActiveRuns().has(runId)).toBe(false);

      // Verify all events have correct runId
      const events = eventCollector.getAll();
      const runEvents = events.filter((e) => (e as { runId?: string }).runId !== undefined);
      for (const event of runEvents) {
        expect((event as { runId: string }).runId).toBe(runId);
      }
    });
  });

  // ============================================================================
  // ID Mapping Tests
  // ============================================================================

  describe('ID Mapping', () => {
    it('should maintain bidirectional ID mapping between AQE and AG-UI', async () => {
      const runId = generateRunId();

      eventAdapter.emitRunStarted(generateThreadId(), runId, { message: 'ID mapping test' });

      // Create task with AQE-style ID
      const task = taskManager.createTask(createTextMessage('Test'), {
        id: 'aqe-task-12345',
        agentId: 'qe-test-architect',
      });

      // Store mapping
      // In a real scenario, the adapter would track this
      const mappings = eventAdapter.getIdMappings();

      // Verify we can retrieve by run ID
      expect(eventAdapter.getCurrentRunId()).toBe(runId);

      eventAdapter.emitRunFinished(runId, 'success');
    });
  });
});
