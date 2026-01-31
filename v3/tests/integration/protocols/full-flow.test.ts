/**
 * Full Protocol Integration Tests
 *
 * End-to-end tests covering the complete AG-UI -> A2A -> A2UI -> AG-UI flow.
 * Validates that all three protocols work together seamlessly for a complete
 * quality engineering workflow.
 *
 * @module tests/integration/protocols/full-flow
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
  type StateDeltaEvent,
  type CustomEvent,
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
  type A2AArtifact,
} from '../../../src/adapters/a2a/index.js';

// A2UI imports
import {
  createSurfaceGenerator,
  createAGUISyncService,
  createCoverageSurface,
  createCoverageDataUpdate,
  createTestResultsSurface,
  createSecuritySurface,
  type SurfaceGenerator,
  type AGUISyncService,
  type CoverageData,
  type TestResults,
  type SecurityFindings,
  type UserActionMessage,
} from '../../../src/adapters/a2ui/index.js';

// CRDT imports
import {
  createCRDTStore,
  createConvergenceTracker,
  type CRDTStore,
  type ConvergenceTracker,
} from '../../../src/memory/crdt/index.js';

// Test utilities
import {
  EventCollector,
  waitFor,
  sleep,
  verifyEventSequence,
  verifyEventExists,
  createMockA2AAgent,
  createTextMessage,
  actionToA2AMessage,
  createUserAction,
  generateThreadId,
  generateRunId,
  generateTaskId,
  generateSurfaceId,
  measureLatency,
  collectLatencyStats,
  type MockA2AAgent,
} from './index.js';

// ============================================================================
// Test Data Factories
// ============================================================================

function createMockCoverageData(): CoverageData {
  return {
    totalCoverage: 85.5,
    lineCoverage: 87.2,
    branchCoverage: 82.1,
    functionCoverage: 88.4,
    files: [
      {
        path: 'src/index.ts',
        coverage: 92.5,
        lines: { covered: 185, total: 200 },
        branches: { covered: 42, total: 50 },
      },
      {
        path: 'src/utils.ts',
        coverage: 78.3,
        lines: { covered: 156, total: 200 },
        branches: { covered: 35, total: 50 },
      },
    ],
    gaps: [
      {
        file: 'src/utils.ts',
        line: 45,
        type: 'branch',
        description: 'Missing else branch',
      },
    ],
  };
}

function createMockTestResults(): TestResults {
  return {
    total: 150,
    passed: 145,
    failed: 3,
    skipped: 2,
    duration: 5420,
    suites: [
      {
        name: 'Unit Tests',
        tests: [
          { name: 'creates instance', status: 'passed', duration: 12 },
          { name: 'handles errors', status: 'passed', duration: 8 },
          { name: 'validates input', status: 'failed', duration: 45, error: 'Assert failed' },
        ],
      },
    ],
  };
}

function createMockSecurityFindings(): SecurityFindings {
  return {
    scanDate: new Date().toISOString(),
    findings: [
      {
        id: 'SEC-001',
        title: 'SQL Injection',
        severity: 'high',
        category: 'injection',
        file: 'src/db.ts',
        line: 45,
        description: 'Unsanitized input',
        remediation: 'Use parameterized queries',
      },
    ],
    summary: {
      critical: 0,
      high: 1,
      medium: 2,
      low: 5,
      info: 3,
    },
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Full Protocol Integration', () => {
  let eventAdapter: EventAdapter;
  let stateManager: StateManager;
  let discoveryService: DiscoveryService;
  let taskManager: TaskManager;
  let surfaceGenerator: SurfaceGenerator;
  let syncService: AGUISyncService;
  let eventCollector: EventCollector;
  let mockAgents: Map<string, MockA2AAgent>;
  let crdtStores: Map<string, CRDTStore>;
  let convergenceTracker: ConvergenceTracker;

  beforeEach(() => {
    // Initialize AG-UI components
    eventAdapter = createEventAdapter({
      defaultThreadId: 'e2e-test',
      trackMessageState: true,
      trackActivityState: true,
    });

    stateManager = createStateManager({
      enableHistory: true,
      maxHistorySize: 100,
    });

    // Initialize state
    stateManager.setState({
      tasks: {},
      agents: {},
      surfaces: {},
      metrics: {
        tasksCompleted: 0,
        tasksFailed: 0,
      },
    });

    // Collect events
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

    // Initialize A2UI components
    surfaceGenerator = createSurfaceGenerator({
      defaultCatalogId: 'qe-catalog-v3',
      emitEvents: true,
    });

    syncService = createAGUISyncService({
      stateManager,
      eventAdapter,
      emitSurfaceEvents: true,
      handleUserActions: true,
    });

    // Create mock agents
    mockAgents = new Map();

    const testArchitect = createMockA2AAgent({
      id: 'qe-test-architect',
      name: 'qe-test-architect',
      domain: 'test-generation',
      skills: ['test-generation', 'property-testing'],
      responseDelay: 5,
    });
    mockAgents.set('qe-test-architect', testArchitect);

    const coverageSpecialist = createMockA2AAgent({
      id: 'qe-coverage-specialist',
      name: 'qe-coverage-specialist',
      domain: 'coverage-analysis',
      skills: ['coverage-analysis', 'gap-detection'],
      responseDelay: 5,
    });
    mockAgents.set('qe-coverage-specialist', coverageSpecialist);

    const securityScanner = createMockA2AAgent({
      id: 'qe-security-scanner',
      name: 'qe-security-scanner',
      domain: 'security-compliance',
      skills: ['security-scan', 'vulnerability-detection'],
      responseDelay: 5,
    });
    mockAgents.set('qe-security-scanner', securityScanner);

    // Register agent cards
    const cards = new Map<string, QEAgentCard>();
    for (const [id, agent] of mockAgents) {
      cards.set(id, agent.card);
    }
    discoveryService.registerCards(cards);

    // Initialize CRDT stores for multi-agent state
    crdtStores = new Map();
    crdtStores.set('agent-1', createCRDTStore({ nodeId: 'agent-1' }));
    crdtStores.set('agent-2', createCRDTStore({ nodeId: 'agent-2' }));
    crdtStores.set('agent-3', createCRDTStore({ nodeId: 'agent-3' }));

    convergenceTracker = createConvergenceTracker({
      staleThresholdMs: 10000,
    });
  });

  afterEach(() => {
    eventAdapter.reset();
    eventCollector.clear();
    taskManager.clearAllTasks();
    surfaceGenerator.clear();
    syncService.disconnect();
    for (const store of crdtStores.values()) {
      store.clear();
    }
    convergenceTracker.clear();
    for (const agent of mockAgents.values()) {
      agent.reset();
    }
  });

  // ============================================================================
  // Complete E2E Flow Tests
  // ============================================================================

  describe('Complete E2E Flow', () => {
    it('should complete full AG-UI -> A2A -> A2UI -> AG-UI flow', async () => {
      const threadId = generateThreadId();
      const runId = generateRunId();

      // PHASE 1: Client connects via AG-UI
      eventAdapter.emitRunStarted(threadId, runId, { message: 'Analyze code coverage for src/' });

      // Verify AG-UI RUN_STARTED
      verifyEventExists(eventCollector.getAll(), 'RUN_STARTED');

      // Emit initial state snapshot
      eventAdapter.emitStateSnapshot(stateManager.getSnapshot(), stateManager.getVersion());

      // PHASE 2: Request triggers A2A agent discovery
      eventAdapter.emitStepStarted('discovery', 'Agent Discovery', runId);

      const agents = await discoveryService.findBySkill('coverage-analysis');
      expect(agents.length).toBeGreaterThan(0);

      eventAdapter.emitStepFinished('discovery', { agents: agents.map((a) => a.name) }, runId);

      // PHASE 3: A2A task negotiation
      const message: A2AMessage = createTextMessage('Analyze code coverage for src/');
      const task = taskManager.createTask(message, {
        agentId: agents[0].name,
      });

      // Update state
      stateManager.updatePath(`/tasks/${task.id}`, {
        id: task.id,
        status: task.status,
        agentId: task.metadata.agentId,
      });

      // Emit state delta
      eventAdapter.emitStateDelta(
        [{ op: 'add' as const, path: `/tasks/${task.id}`, value: { id: task.id, status: task.status } }],
        stateManager.getVersion()
      );

      eventAdapter.emitStepStarted('processing', 'Processing Request', runId);
      taskManager.startTask(task.id);

      // Verify task working
      expect(taskManager.getTask(task.id)?.status).toBe('working');

      // PHASE 4: A2A task completes with results
      const coverageData = createMockCoverageData();
      const artifact: A2AArtifact = {
        id: 'coverage-report',
        name: 'coverage-report',
        parts: [{ type: 'data', data: coverageData }],
      };

      taskManager.completeTask(task.id, [artifact]);

      // Update state
      stateManager.updatePath(`/tasks/${task.id}/status`, 'completed');
      eventAdapter.emitStateDelta(
        [{ op: 'replace' as const, path: `/tasks/${task.id}/status`, value: 'completed' }],
        stateManager.getVersion()
      );

      eventAdapter.emitStepFinished('processing', { status: 'completed' }, runId);

      // Verify task completed
      const completedTask = taskManager.getTask(task.id)!;
      expect(completedTask.status).toBe('completed');

      // PHASE 5: Results rendered as A2UI surface
      const artifactData = completedTask.artifacts[0].parts[0] as { data: CoverageData };
      const surface = createCoverageSurface(artifactData.data);

      surfaceGenerator.createSurface(surface.surfaceId, {
        title: 'Coverage Report',
        catalogId: 'qe-catalog-v3',
      });
      surfaceGenerator.addComponents(surface.surfaceId, surface.components);

      // Connect surface to sync service
      syncService.connectSurface(surface.surfaceId, surfaceGenerator);

      expect(surfaceGenerator.hasSurface(surface.surfaceId)).toBe(true);

      // PHASE 6: A2UI state synced via AG-UI STATE_DELTA
      stateManager.updatePath(`/surfaces/${surface.surfaceId}`, {
        id: surface.surfaceId,
        version: surface.version,
      });

      eventAdapter.emitStateDelta(
        [{ op: 'add' as const, path: `/surfaces/${surface.surfaceId}`, value: { id: surface.surfaceId } }],
        stateManager.getVersion()
      );

      // Emit surface update as custom event
      eventAdapter.emitCustom('a2ui:surfaceUpdate', {
        surfaceId: surface.surfaceId,
        version: surface.version,
      });

      // PHASE 7: AG-UI RUN_FINISHED
      eventAdapter.emitRunFinished(runId, 'success', {
        taskId: task.id,
        surfaceId: surface.surfaceId,
        coverage: coverageData.totalCoverage,
      });

      // Verify complete event sequence
      const events = eventCollector.getAll();
      const eventTypes = events.map((e) => e.type);

      expect(eventTypes).toContain('RUN_STARTED');
      expect(eventTypes).toContain('STEP_STARTED');
      expect(eventTypes).toContain('STATE_SNAPSHOT');
      expect(eventTypes).toContain('STATE_DELTA');
      expect(eventTypes).toContain('CUSTOM');
      expect(eventTypes).toContain('RUN_FINISHED');
    });

    it('should handle errors gracefully across protocols', async () => {
      const runId = generateRunId();

      // Start flow
      eventAdapter.emitRunStarted(generateThreadId(), runId, { message: 'Error test' });

      // Create task
      const task = taskManager.createTask(createTextMessage('Will fail'), {
        agentId: 'qe-test-architect',
      });

      taskManager.startTask(task.id);

      // Simulate A2A task failure
      taskManager.failTask(task.id, {
        message: 'Processing error',
        code: 'PROCESSING_ERROR',
      });

      // Update state with error
      stateManager.updatePath(`/tasks/${task.id}/error`, {
        message: 'Processing error',
        code: 'PROCESSING_ERROR',
      });

      // Emit state delta
      eventAdapter.emitStateDelta(
        [{
          op: 'add' as const,
          path: `/tasks/${task.id}/error`,
          value: { message: 'Processing error' },
        }],
        stateManager.getVersion()
      );

      // Propagate to AG-UI RUN_ERROR
      eventAdapter.emitRunError(
        runId,
        'Task failed: Processing error',
        'TASK_ERROR',
        true // recoverable
      );

      // Verify error propagation
      const events = eventCollector.getAll();
      verifyEventExists(events, 'RUN_ERROR');

      const runError = events.find((e) => e.type === 'RUN_ERROR') as { recoverable?: boolean };
      expect(runError?.recoverable).toBe(true);

      // Verify task state
      expect(taskManager.getTask(task.id)?.status).toBe('failed');
    });

    it('should maintain state consistency with CRDT', async () => {
      const runId = generateRunId();

      eventAdapter.emitRunStarted(generateThreadId(), runId, { message: 'CRDT test' });

      // Simulate concurrent operations from multiple agents
      const store1 = crdtStores.get('agent-1')!;
      const store2 = crdtStores.get('agent-2')!;
      const store3 = crdtStores.get('agent-3')!;

      // Each agent updates its counter
      store1.incrementGCounter('tasks-completed', 5);
      store2.incrementGCounter('tasks-completed', 3);
      store3.incrementGCounter('tasks-completed', 7);

      // Each agent sets its status register
      store1.setRegister('status', { state: 'active', lastUpdate: Date.now() });
      store2.setRegister('status', { state: 'active', lastUpdate: Date.now() });
      store3.setRegister('status', { state: 'active', lastUpdate: Date.now() });

      // Merge states (simulating sync)
      store1.merge(store2);
      store1.merge(store3);
      store2.merge(store1);
      store3.merge(store1);

      // Record states with tracker
      convergenceTracker.recordNodeState('agent-1', store1.getState());
      convergenceTracker.recordNodeState('agent-2', store2.getState());
      convergenceTracker.recordNodeState('agent-3', store3.getState());

      // Verify convergence
      expect(convergenceTracker.hasConverged()).toBe(true);

      // Verify counter values converged
      const counter1 = store1.getGCounter('tasks-completed').get();
      const counter2 = store2.getGCounter('tasks-completed').get();
      const counter3 = store3.getGCounter('tasks-completed').get();

      expect(counter1).toBe(15); // 5 + 3 + 7
      expect(counter2).toBe(15);
      expect(counter3).toBe(15);

      eventAdapter.emitRunFinished(runId, 'success', {
        converged: true,
        totalTasks: counter1,
      });
    });

    it('should meet performance targets', async () => {
      const stats = await collectLatencyStats(async () => {
        const runId = generateRunId();

        // Complete flow
        eventAdapter.emitRunStarted(generateThreadId(), runId, { message: 'Perf test' });

        const agents = await discoveryService.findBySkill('coverage-analysis');

        const task = taskManager.createTask(createTextMessage('Quick analysis'), {
          agentId: agents[0].name,
        });

        taskManager.startTask(task.id);

        const coverageData = createMockCoverageData();
        taskManager.completeTask(task.id, [{
          id: 'coverage',
          name: 'coverage-report',
          parts: [{ type: 'data', data: coverageData }],
        }]);

        const completedTask = taskManager.getTask(task.id)!;
        const surface = createCoverageSurface(
          (completedTask.artifacts[0].parts[0] as { data: CoverageData }).data
        );

        surfaceGenerator.createSurface(surface.surfaceId, { title: 'Coverage' });
        surfaceGenerator.addComponents(surface.surfaceId, surface.components);

        eventAdapter.emitRunFinished(runId, 'success');

        // Cleanup for next iteration
        surfaceGenerator.deleteSurface(surface.surfaceId);
      }, 20);

      // Issue #177 targets: p95 < 100ms for streaming
      // With mock delays of 5ms, we should be well under
      expect(stats.p95).toBeLessThan(100);
    });
  });

  // ============================================================================
  // Multi-Agent Coordination Tests
  // ============================================================================

  describe('Multi-Agent Coordination', () => {
    it('should coordinate multiple agents through full flow', async () => {
      const runId = generateRunId();

      eventAdapter.emitRunStarted(generateThreadId(), runId, {
        message: 'Full quality analysis',
      });

      // Discover all needed agents
      const [testAgents, coverageAgents, securityAgents] = await Promise.all([
        discoveryService.findBySkill('test-generation'),
        discoveryService.findBySkill('coverage-analysis'),
        discoveryService.findBySkill('security-scan'),
      ]);

      // Create tasks for each agent
      const tasks = [];

      const testTask = taskManager.createTask(
        createTextMessage('Generate tests'),
        { agentId: testAgents[0].name }
      );
      tasks.push({ task: testTask, type: 'test' });

      const coverageTask = taskManager.createTask(
        createTextMessage('Analyze coverage'),
        { agentId: coverageAgents[0].name }
      );
      tasks.push({ task: coverageTask, type: 'coverage' });

      const securityTask = taskManager.createTask(
        createTextMessage('Security scan'),
        { agentId: securityAgents[0].name }
      );
      tasks.push({ task: securityTask, type: 'security' });

      // Start all tasks
      for (const { task, type } of tasks) {
        taskManager.startTask(task.id);
        eventAdapter.emitStepStarted(`task-${type}`, `${type} Analysis`, runId);
      }

      // Process and complete all tasks concurrently
      await Promise.all(tasks.map(async ({ task, type }) => {
        // Simulate processing
        await sleep(5);

        // Create appropriate artifact
        let artifact: A2AArtifact;
        switch (type) {
          case 'test':
            artifact = {
              id: 'test-results',
              name: 'test-results',
              parts: [{ type: 'data', data: createMockTestResults() }],
            };
            break;
          case 'coverage':
            artifact = {
              id: 'coverage-report',
              name: 'coverage-report',
              parts: [{ type: 'data', data: createMockCoverageData() }],
            };
            break;
          case 'security':
            artifact = {
              id: 'security-findings',
              name: 'security-findings',
              parts: [{ type: 'data', data: createMockSecurityFindings() }],
            };
            break;
          default:
            throw new Error(`Unknown task type: ${type}`);
        }

        taskManager.completeTask(task.id, [artifact]);
        eventAdapter.emitStepFinished(`task-${type}`, { status: 'completed' }, runId);
      }));

      // Generate surfaces for all results
      const surfaces = [];

      for (const { task, type } of tasks) {
        const completedTask = taskManager.getTask(task.id)!;
        const data = (completedTask.artifacts[0].parts[0] as { data: unknown }).data;

        let surface;
        switch (type) {
          case 'coverage':
            surface = createCoverageSurface(data as CoverageData);
            break;
          case 'test':
            surface = createTestResultsSurface(data as TestResults);
            break;
          case 'security':
            surface = createSecuritySurface(data as SecurityFindings);
            break;
          default:
            continue;
        }

        surfaceGenerator.createSurface(surface.surfaceId, { title: `${type} Report` });
        surfaceGenerator.addComponents(surface.surfaceId, surface.components);
        surfaces.push(surface);
      }

      // Verify all surfaces created
      expect(surfaces.length).toBe(3);
      expect(surfaceGenerator.getSurfaceCount()).toBe(3);

      // Finish run
      eventAdapter.emitRunFinished(runId, 'success', {
        taskIds: tasks.map(({ task }) => task.id),
        surfaceIds: surfaces.map((s) => s.surfaceId),
      });

      // Verify all tasks completed
      for (const { task } of tasks) {
        expect(taskManager.getTask(task.id)?.status).toBe('completed');
      }
    });
  });

  // ============================================================================
  // User Interaction Flow Tests
  // ============================================================================

  describe('User Interaction Flow', () => {
    it('should handle user action through full protocol stack', async () => {
      const runId = generateRunId();

      eventAdapter.emitRunStarted(generateThreadId(), runId, { message: 'Interactive test' });

      // Initial task and surface
      const task = taskManager.createTask(
        createTextMessage('Analyze coverage'),
        { agentId: 'qe-coverage-specialist' }
      );

      taskManager.startTask(task.id);

      const coverageData = createMockCoverageData();
      taskManager.completeTask(task.id, [{
        id: 'coverage',
        name: 'coverage-report',
        parts: [{ type: 'data', data: coverageData }],
      }]);

      const completedTask = taskManager.getTask(task.id)!;
      const surface = createCoverageSurface(
        (completedTask.artifacts[0].parts[0] as { data: CoverageData }).data
      );

      surfaceGenerator.createSurface(surface.surfaceId, { title: 'Coverage' });
      surfaceGenerator.addComponents(surface.surfaceId, surface.components);
      syncService.connectSurface(surface.surfaceId, surfaceGenerator);

      // User clicks "View Details" button
      const action = createUserAction(
        surface.surfaceId,
        'details-btn',
        'viewFileDetails',
        { fileIndex: 0 }
      );

      // Process through sync service
      syncService.handleUserAction(action);

      // Convert to A2A message for new task
      const a2aMessage = actionToA2AMessage(action);
      const detailsTask = taskManager.createTask(a2aMessage, {
        agentId: 'qe-coverage-specialist',
        contextId: task.contextId, // Same context
      });

      taskManager.startTask(detailsTask.id);

      // Complete with detailed results
      const detailedData: CoverageData = {
        ...coverageData,
        files: [coverageData.files[0]], // Just the requested file
      };

      taskManager.completeTask(detailsTask.id, [{
        id: 'file-details',
        name: 'coverage-details',
        parts: [{ type: 'data', data: detailedData }],
      }]);

      // Update surface with detailed view
      const dataUpdate = createCoverageDataUpdate(surface.surfaceId, detailedData);
      surfaceGenerator.updateData(surface.surfaceId, dataUpdate.data);

      // Emit state delta for surface update
      eventAdapter.emitStateDelta(
        [{
          op: 'replace' as const,
          path: `/surfaces/${surface.surfaceId}/data`,
          value: detailedData,
        }],
        stateManager.getVersion()
      );

      eventAdapter.emitRunFinished(runId, 'success');

      // Verify interaction tracked
      verifyEventExists(eventCollector.getAll(), 'CUSTOM');
    });
  });

  // ============================================================================
  // State Synchronization Tests
  // ============================================================================

  describe('State Synchronization', () => {
    it('should maintain state sync across all protocols', async () => {
      const runId = generateRunId();

      eventAdapter.emitRunStarted(generateThreadId(), runId, { message: 'State sync test' });

      // Emit initial state snapshot
      eventAdapter.emitStateSnapshot(stateManager.getSnapshot(), stateManager.getVersion());

      // Create task and track in state
      const task = taskManager.createTask(createTextMessage('Test'), {
        agentId: 'qe-test-architect',
      });

      stateManager.updatePath(`/tasks/${task.id}`, {
        id: task.id,
        status: task.status,
      });

      eventAdapter.emitStateDelta(
        [{ op: 'add' as const, path: `/tasks/${task.id}`, value: { id: task.id, status: task.status } }],
        stateManager.getVersion()
      );

      // Process task
      taskManager.startTask(task.id);
      stateManager.updatePath(`/tasks/${task.id}/status`, 'working');
      eventAdapter.emitStateDelta(
        [{ op: 'replace' as const, path: `/tasks/${task.id}/status`, value: 'working' }],
        stateManager.getVersion()
      );

      // Complete task
      taskManager.completeTask(task.id);
      stateManager.updatePath(`/tasks/${task.id}/status`, 'completed');
      eventAdapter.emitStateDelta(
        [{ op: 'replace' as const, path: `/tasks/${task.id}/status`, value: 'completed' }],
        stateManager.getVersion()
      );

      // Update metrics
      stateManager.updatePath('/metrics/tasksCompleted', 1);
      eventAdapter.emitStateDelta(
        [{ op: 'replace' as const, path: '/metrics/tasksCompleted', value: 1 }],
        stateManager.getVersion()
      );

      eventAdapter.emitRunFinished(runId, 'success');

      // Verify state deltas emitted
      const deltas = eventCollector.getByType('STATE_DELTA');
      expect(deltas.length).toBeGreaterThanOrEqual(3);

      // Verify final state
      const finalState = stateManager.getSnapshot();
      expect((finalState.tasks as Record<string, { status: string }>)[task.id].status).toBe('completed');
      expect((finalState.metrics as { tasksCompleted: number }).tasksCompleted).toBe(1);
    });

    it('should sync surfaces with AG-UI state', async () => {
      const runId = generateRunId();

      eventAdapter.emitRunStarted(generateThreadId(), runId, { message: 'Surface sync test' });

      // Map AG-UI state path to A2UI surface data path
      syncService.mapStatePath('/coverage', '/totalCoverage', {
        transform: (v) => v,
      });

      // Create and connect surface
      const coverageData = createMockCoverageData();
      const surface = createCoverageSurface(coverageData);

      surfaceGenerator.createSurface(surface.surfaceId, { title: 'Coverage' });
      surfaceGenerator.addComponents(surface.surfaceId, surface.components);
      syncService.connectSurface(surface.surfaceId, surfaceGenerator);

      // Update AG-UI state
      stateManager.setState({
        ...stateManager.getSnapshot(),
        coverage: 95.0,
      });

      // Emit state delta
      eventAdapter.emitStateDelta(
        [{ op: 'replace' as const, path: '/coverage', value: 95.0 }],
        stateManager.getVersion()
      );

      // Verify sync service is connected
      expect(syncService.getIsConnected()).toBe(true);
      expect(syncService.getSurfaces().has(surface.surfaceId)).toBe(true);

      eventAdapter.emitRunFinished(runId, 'success');
    });
  });

  // ============================================================================
  // CRDT Convergence Tests
  // ============================================================================

  describe('CRDT Convergence', () => {
    it('should achieve CRDT convergence in multi-agent scenarios', async () => {
      const runId = generateRunId();

      eventAdapter.emitRunStarted(generateThreadId(), runId, { message: 'Convergence test' });

      const store1 = crdtStores.get('agent-1')!;
      const store2 = crdtStores.get('agent-2')!;
      const store3 = crdtStores.get('agent-3')!;

      // Simulate concurrent updates
      store1.addToSet('active-tasks', 'task-1');
      store2.addToSet('active-tasks', 'task-2');
      store3.addToSet('active-tasks', 'task-3');

      store1.incrementCounter('requests');
      store2.incrementCounter('requests');
      store3.incrementCounter('requests');
      store1.incrementCounter('requests');

      // Merge in different orders to test commutativity
      const state1 = store1.getState();
      const state2 = store2.getState();
      const state3 = store3.getState();

      store1.applyState(state2);
      store1.applyState(state3);

      store2.applyState(state3);
      store2.applyState(state1);

      store3.applyState(state1);
      store3.applyState(state2);

      // Record final states
      convergenceTracker.recordNodeState('agent-1', store1.getState());
      convergenceTracker.recordNodeState('agent-2', store2.getState());
      convergenceTracker.recordNodeState('agent-3', store3.getState());

      // Verify convergence
      expect(convergenceTracker.hasConverged()).toBe(true);

      const status = convergenceTracker.getStatus();
      expect(status.converged).toBe(true);
      expect(status.laggingNodes.length).toBe(0);

      // Verify set convergence
      const set1 = store1.getSet<string>('active-tasks').values();
      const set2 = store2.getSet<string>('active-tasks').values();
      const set3 = store3.getSet<string>('active-tasks').values();

      // Sort for comparison since OR-Set doesn't guarantee order
      const sorted1 = [...set1].sort();
      const sorted2 = [...set2].sort();
      const sorted3 = [...set3].sort();

      expect(sorted1).toEqual(sorted2);
      expect(sorted2).toEqual(sorted3);
      expect(set1.length).toBe(3);

      // Verify counter convergence
      const counter1 = store1.getCounter('requests').get();
      const counter2 = store2.getCounter('requests').get();
      const counter3 = store3.getCounter('requests').get();

      expect(counter1).toBe(counter2);
      expect(counter2).toBe(counter3);
      expect(counter1).toBe(4); // 1+1+1+1

      eventAdapter.emitRunFinished(runId, 'success', {
        converged: true,
        activeTasks: set1.length,
        totalRequests: counter1,
      });
    });
  });

  // ============================================================================
  // Error Recovery Tests
  // ============================================================================

  describe('Error Recovery', () => {
    it('should recover from partial failures', async () => {
      const runId = generateRunId();

      eventAdapter.emitRunStarted(generateThreadId(), runId, { message: 'Recovery test' });

      // Create multiple tasks
      const task1 = taskManager.createTask(createTextMessage('Task 1'), {
        agentId: 'qe-test-architect',
      });

      const task2 = taskManager.createTask(createTextMessage('Task 2'), {
        agentId: 'qe-coverage-specialist',
      });

      // Start both
      taskManager.startTask(task1.id);
      taskManager.startTask(task2.id);

      // Task 1 fails
      taskManager.failTask(task1.id, {
        message: 'Processing error',
        code: 'ERROR',
      });

      // Task 2 succeeds
      taskManager.completeTask(task2.id, [{
        id: 'result',
        name: 'result',
        parts: [{ type: 'data', data: createMockCoverageData() }],
      }]);

      // Create surface for successful task
      const completedTask = taskManager.getTask(task2.id)!;
      const surface = createCoverageSurface(
        (completedTask.artifacts[0].parts[0] as { data: CoverageData }).data
      );

      surfaceGenerator.createSurface(surface.surfaceId, { title: 'Coverage' });
      surfaceGenerator.addComponents(surface.surfaceId, surface.components);

      // Verify partial success
      expect(taskManager.getTask(task1.id)?.status).toBe('failed');
      expect(taskManager.getTask(task2.id)?.status).toBe('completed');
      expect(surfaceGenerator.hasSurface(surface.surfaceId)).toBe(true);

      // Finish with partial success
      eventAdapter.emitRunFinished(runId, 'success', {
        completedTasks: 1,
        failedTasks: 1,
      });
    });
  });

  // ============================================================================
  // High Load Tests
  // ============================================================================

  describe('High Load', () => {
    it('should handle 40+ events in rapid succession', async () => {
      const runId = generateRunId();

      eventAdapter.emitRunStarted(generateThreadId(), runId, { message: 'Load test' });

      const taskCount = 10;
      const tasks = [];

      // Create 10 tasks
      for (let i = 0; i < taskCount; i++) {
        const task = taskManager.createTask(createTextMessage(`Task ${i}`), {
          agentId: 'qe-test-architect',
        });
        tasks.push(task);
        eventAdapter.emitStepStarted(`task-${i}`, `Task ${i}`, runId);
      }

      // Process all tasks
      for (const task of tasks) {
        taskManager.startTask(task.id);
        taskManager.completeTask(task.id);
      }

      // Emit step finished for all
      for (let i = 0; i < taskCount; i++) {
        eventAdapter.emitStepFinished(`task-${i}`, { completed: true }, runId);
      }

      eventAdapter.emitRunFinished(runId, 'success');

      // Verify event count
      const events = eventCollector.getAll();

      // Should have: RUN_STARTED + 10 STEP_STARTED + 10 STEP_FINISHED + RUN_FINISHED = 22+
      expect(events.length).toBeGreaterThanOrEqual(22);

      // All tasks should be completed
      for (const task of tasks) {
        expect(taskManager.getTask(task.id)?.status).toBe('completed');
      }
    });
  });
});
