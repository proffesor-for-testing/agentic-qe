/**
 * Phase 1 Integration Tests: Full Workflow
 *
 * End-to-end test of complete Phase 1 workflow including:
 * - Fleet initialization with coordination patterns
 * - Agent spawning with memory coordination
 * - Memory-driven task distribution
 * - Hook execution throughout lifecycle
 * - MCP tool usage across components
 * - Artifact creation and tracking
 * - Workflow checkpointing and recovery
 */

import { FleetManager } from '@core/FleetManager';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import { BlackboardCoordination } from '@core/coordination/BlackboardCoordination';
import { ConsensusGating } from '@core/coordination/ConsensusGating';
import { GOAPCoordination, Action, Goal } from '@core/coordination/GOAPCoordination';
import { OODACoordination } from '@core/coordination/OODACoordination';
import { VerificationHookManager, PostToolUsePersistence } from '@core/hooks/VerificationHookManager';
import { Task, TaskPriority } from '@core/Task';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';

describe('Phase 1 - Full Workflow Integration', () => {
  let memory: SwarmMemoryManager;
  let blackboard: BlackboardCoordination;
  let consensus: ConsensusGating;
  let goap: GOAPCoordination;
  let ooda: OODACoordination;
  let hooks: VerificationHookManager;
  let tempDbPath: string;
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aqe-workflow-test-'));
    tempDbPath = path.join(tempDir, 'test.db');
  });

  beforeEach(async () => {
    memory = new SwarmMemoryManager(tempDbPath);
    await memory.initialize();

    blackboard = new BlackboardCoordination(memory);
    consensus = new ConsensusGating(memory);
    goap = new GOAPCoordination(memory);
    ooda = new OODACoordination(memory);
    hooks = new VerificationHookManager(memory);
  });

  afterEach(async () => {
    await memory.close();
  });

  afterAll(async () => {
    await fs.remove(tempDir);
  });

  describe('Complete AQE Workflow', () => {
    test('should execute full quality engineering workflow', async () => {
      // ============================================================
      // PHASE 1: Fleet Initialization
      // ============================================================

      const fleet = new FleetManager({
        agents: [
          { type: 'test-generator', count: 2, config: {} },
          { type: 'test-executor', count: 2, config: {} },
          { type: 'coverage-analyzer', count: 1, config: {} }
        ]
      });

      await fleet.initialize();
      await fleet.start();

      const initialStatus = fleet.getStatus();
      expect(initialStatus.totalAgents).toBe(5);

      // ============================================================
      // PHASE 2: Pre-Task Verification with Hooks
      // ============================================================

      const preTaskResult = await hooks.executePreTaskVerification({
        task: 'generate-and-execute-tests',
        context: {}
      });

      expect(preTaskResult.passed).toBe(true);

      // ============================================================
      // PHASE 3: Build PreToolUse Context Bundle
      // ============================================================

      // Store some test artifacts for context
      await memory.store('artifact:source', {
        id: 'artifact-source',
        path: '/src/calculator.ts',
        sha256: 'source-hash'
      }, { partition: 'artifacts' });

      await memory.postHint({
        key: 'aqe/test-queue/pending',
        value: { tasksInQueue: 1 }
      });

      const bundle = await hooks.buildPreToolUseBundle({
        task: 'generate-and-execute-tests',
        maxArtifacts: 10
      });

      expect(bundle).toBeDefined();
      expect(bundle.rules).toContain('tdd-required');

      // ============================================================
      // PHASE 4: OODA Loop for Decision Making
      // ============================================================

      const cycleId = await ooda.startCycle();

      // Observe: Check current state
      await ooda.observe({
        data: {
          coverage: 75,
          failedTests: 0,
          availableAgents: 5
        },
        source: 'fleet-monitor'
      });

      // Orient: Analyze situation
      await ooda.orient(
        { needsMoreTests: true, hasCapacity: true },
        { priority: 'high' }
      );

      // Decide: Choose action
      await ooda.decide(
        ['generate-tests', 'skip', 'defer'],
        'generate-tests',
        'Low coverage and capacity available'
      );

      // ============================================================
      // PHASE 5: GOAP Planning for Task Execution
      // ============================================================

      // Register available actions
      goap.registerAction({
        id: 'generate-tests',
        cost: 10,
        preconditions: { hasCapacity: true },
        effects: { testsGenerated: true },
        execute: async () => {}
      });

      goap.registerAction({
        id: 'execute-tests',
        cost: 5,
        preconditions: { testsGenerated: true },
        effects: { testsExecuted: true },
        execute: async () => {}
      });

      goap.registerAction({
        id: 'analyze-coverage',
        cost: 3,
        preconditions: { testsExecuted: true },
        effects: { coverageAnalyzed: true },
        execute: async () => {}
      });

      await goap.updateWorldState({
        hasCapacity: true,
        testsGenerated: false,
        testsExecuted: false,
        coverageAnalyzed: false
      });

      const goal: Goal = {
        id: 'improve-coverage',
        conditions: { coverageAnalyzed: true },
        priority: 10
      };

      const plan = await goap.planForGoal(goal);

      expect(plan).not.toBeNull();
      expect(plan?.actions.length).toBeGreaterThanOrEqual(3);

      // ============================================================
      // PHASE 6: Blackboard Coordination for Task Distribution
      // ============================================================

      // Post tasks to blackboard
      await blackboard.postHint({
        key: 'aqe/tasks/available/test-gen',
        value: {
          taskId: 'test-gen-1',
          type: 'test-generation',
          target: '/src/calculator.ts'
        }
      });

      await blackboard.postHint({
        key: 'aqe/tasks/available/test-exec',
        value: {
          taskId: 'test-exec-1',
          type: 'test-execution',
          suite: 'unit'
        }
      });

      // Agents read from blackboard
      const availableTasks = await blackboard.readHints('aqe/tasks/available/*');
      expect(availableTasks).toHaveLength(2);

      // ============================================================
      // PHASE 7: Consensus for Task Assignment
      // ============================================================

      const genProposalId = await consensus.propose({
        id: 'assign-test-gen',
        decision: 'assign test-gen-1 to agent-1',
        quorum: 2,
        proposer: 'agent-1'
      });

      await consensus.vote(genProposalId, 'agent-2');
      await consensus.vote(genProposalId, 'agent-3');

      const genState = await consensus.getProposalState(genProposalId);
      expect(genState?.status).toBe('approved');

      // ============================================================
      // PHASE 8: Execute OODA Action (Task Execution)
      // ============================================================

      let taskExecuted = false;

      await ooda.act(
        'execute-plan',
        { planId: plan?.goal.id },
        async () => {
          taskExecuted = true;

          // Create task in fleet
          const task = new Task(
            'test-generation',
            'Generate unit tests',
            { target: '/src/calculator.ts' },
            {},
            TaskPriority.HIGH
          );

          await fleet.submitTask(task);

          return { success: true, taskId: task.getId() };
        }
      );

      expect(taskExecuted).toBe(true);

      // Complete OODA cycle
      await ooda.completeCycle();

      // ============================================================
      // PHASE 9: Post-Task Validation
      // ============================================================

      const postTaskResult = await hooks.executePostTaskValidation({
        task: 'test-generation',
        result: {
          coverage: 0.85,
          testsGenerated: 15,
          output: { files: ['/tests/calculator.test.ts'] }
        }
      });

      expect(postTaskResult.valid).toBe(true);

      // ============================================================
      // PHASE 10: Persist Outcomes via PostToolUse
      // ============================================================

      const outcomes: PostToolUsePersistence = {
        events: [
          { type: 'test-generation-completed', payload: { count: 15 } },
          { type: 'coverage-improved', payload: { from: 0.75, to: 0.85 } }
        ],
        patterns: [
          { pattern: 'successful-test-generation', confidence: 0.92 }
        ],
        checkpoints: [
          { step: 'test-generation', status: 'completed' },
          { step: 'coverage-analysis', status: 'completed' }
        ],
        artifacts: [
          {
            kind: 'test-file',
            path: '/tests/calculator.test.ts',
            sha256: 'test-hash-123'
          }
        ],
        metrics: [
          { metric: 'generation-time', value: 3500, unit: 'ms' },
          { metric: 'tests-generated', value: 15, unit: 'count' },
          { metric: 'coverage-improvement', value: 10, unit: 'percent' }
        ]
      };

      await hooks.persistPostToolUseOutcomes(outcomes);

      // ============================================================
      // PHASE 11: Verify All Data Persisted Correctly
      // ============================================================

      // Verify events
      const events = await memory.query('events:%', { partition: 'events' });
      expect(events.length).toBeGreaterThan(0);

      // Verify patterns
      const patterns = await memory.query('patterns:%', { partition: 'patterns' });
      expect(patterns.length).toBeGreaterThan(0);

      // Verify checkpoints
      const checkpoint = await memory.retrieve('workflow:test-generation', {
        partition: 'workflow_state'
      });
      expect(checkpoint?.status).toBe('completed');

      // Verify artifacts
      const artifacts = await memory.query('artifact:%', { partition: 'artifacts' });
      expect(artifacts.length).toBeGreaterThan(0);

      // Verify metrics
      const metrics = await memory.query('metrics:%', {
        partition: 'performance_metrics'
      });
      expect(metrics.length).toBeGreaterThan(0);

      // ============================================================
      // PHASE 12: Verify OODA Cycle History
      // ============================================================

      const cycles = await ooda.getCycleHistory(5);
      expect(cycles.length).toBeGreaterThan(0);

      const completedCycle = cycles[0];
      expect(completedCycle.endTime).toBeDefined();
      expect(completedCycle.duration).toBeGreaterThan(0);

      // ============================================================
      // PHASE 13: Session Finalization
      // ============================================================

      const finalization = await hooks.executeSessionEndFinalization({
        sessionId: 'test-session',
        duration: Date.now(),
        tasksCompleted: 2
      });

      expect(finalization.finalized).toBe(true);

      // ============================================================
      // PHASE 14: Fleet Cleanup
      // ============================================================

      await fleet.stop();

      const finalStatus = fleet.getStatus();
      expect(finalStatus.status).toBe('stopped');
    });

    test('should handle workflow checkpoint and recovery', async () => {
      // Create workflow checkpoints
      const checkpoints = [
        { step: 'initialization', status: 'completed', data: { config: 'loaded' } },
        { step: 'agent-spawn', status: 'completed', data: { agents: 5 } },
        { step: 'task-distribution', status: 'in-progress', data: { tasks: 10 } }
      ];

      for (const checkpoint of checkpoints) {
        await memory.store(`workflow:${checkpoint.step}`, checkpoint, {
          partition: 'workflow_state'
        });
      }

      // Simulate failure and recovery
      const lastCheckpoint = await memory.retrieve('workflow:agent-spawn', {
        partition: 'workflow_state'
      });

      expect(lastCheckpoint.status).toBe('completed');
      expect(lastCheckpoint.data.agents).toBe(5);

      // Resume from checkpoint
      await memory.store('workflow:task-distribution', {
        step: 'task-distribution',
        status: 'completed',
        data: { tasks: 10, recovered: true }
      }, { partition: 'workflow_state' });

      const recovered = await memory.retrieve('workflow:task-distribution', {
        partition: 'workflow_state'
      });

      expect(recovered.status).toBe('completed');
      expect(recovered.data.recovered).toBe(true);
    });

    test('should coordinate multi-agent workflow with consensus', async () => {
      const agents = ['agent-1', 'agent-2', 'agent-3', 'agent-4', 'agent-5'];

      // Step 1: Post task availability hints
      for (let i = 1; i <= 5; i++) {
        await blackboard.postHint({
          key: `aqe/tasks/available/task-${i}`,
          value: { taskId: `task-${i}`, type: 'test-execution' }
        });
      }

      // Step 2: Agents propose to take tasks
      const proposals = await Promise.all(
        agents.map((agent, idx) =>
          consensus.propose({
            id: `assign-task-${idx + 1}`,
            decision: `assign task-${idx + 1} to ${agent}`,
            quorum: 2,
            proposer: agent
          })
        )
      );

      // Step 3: Simulate voting (each proposal needs 2 more votes)
      for (const proposalId of proposals.slice(0, 3)) {
        await consensus.vote(proposalId, 'coordinator-1');
        await consensus.vote(proposalId, 'coordinator-2');
      }

      // Step 4: Verify consensus reached for first 3 tasks
      for (const proposalId of proposals.slice(0, 3)) {
        const state = await consensus.getProposalState(proposalId);
        expect(state?.status).toBe('approved');
      }

      // Step 5: Update task assignments in memory
      for (let i = 1; i <= 3; i++) {
        await memory.store(`task:${i}`, {
          id: `task-${i}`,
          status: 'assigned',
          assignedTo: agents[i - 1]
        }, { partition: 'tasks' });
      }

      // Verify assignments
      const task1 = await memory.retrieve('task:1', { partition: 'tasks' });
      expect(task1.status).toBe('assigned');
    });

    test('should integrate memory cleanup with TTL policies', async () => {
      // Store entries with different TTLs
      await memory.store('temp-event', { data: 'event' }, {
        partition: 'events',
        ttl: 1
      });

      await memory.store('temp-pattern', { pattern: 'test', confidence: 0.9 }, {
        partition: 'patterns',
        ttl: 1
      });

      await memory.store('permanent-checkpoint', { step: 'test', status: 'completed' }, {
        partition: 'workflow_state'
        // No TTL = permanent
      });

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Clean expired
      await memory.cleanExpired();

      // Verify cleanup
      const event = await memory.retrieve('temp-event', { partition: 'events' });
      const pattern = await memory.retrieve('temp-pattern', { partition: 'patterns' });
      const checkpoint = await memory.retrieve('permanent-checkpoint', {
        partition: 'workflow_state'
      });

      expect(event).toBeNull();
      expect(pattern).toBeNull();
      expect(checkpoint).not.toBeNull();
    });

    test('should track complete workflow metrics', async () => {
      const startTime = Date.now();

      // Simulate workflow with metrics
      await memory.store('metrics:workflow-start', {
        metric: 'workflow-start',
        value: startTime,
        unit: 'timestamp'
      }, { partition: 'performance_metrics' });

      // Simulate task execution
      await new Promise(resolve => setTimeout(resolve, 100));

      await memory.store('metrics:task-duration', {
        metric: 'task-duration',
        value: 100,
        unit: 'ms'
      }, { partition: 'performance_metrics' });

      await memory.store('metrics:workflow-end', {
        metric: 'workflow-end',
        value: Date.now(),
        unit: 'timestamp'
      }, { partition: 'performance_metrics' });

      // Retrieve all workflow metrics
      const metrics = await memory.query('metrics:%', {
        partition: 'performance_metrics'
      });

      expect(metrics.length).toBeGreaterThanOrEqual(3);

      const workflowMetrics = metrics.filter(m =>
        m.key.includes('workflow') || m.key.includes('task')
      );

      expect(workflowMetrics.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Error Recovery and Resilience', () => {
    test('should recover from partial workflow failure', async () => {
      // Execute workflow with checkpoints
      await memory.store('workflow:step1', {
        step: 'step1',
        status: 'completed'
      }, { partition: 'workflow_state' });

      await memory.store('workflow:step2', {
        step: 'step2',
        status: 'completed'
      }, { partition: 'workflow_state' });

      // Simulate failure at step 3
      await memory.store('workflow:step3', {
        step: 'step3',
        status: 'failed',
        error: 'Network timeout'
      }, { partition: 'workflow_state' });

      // Recovery: Rollback to last successful checkpoint
      const step2 = await memory.retrieve('workflow:step2', {
        partition: 'workflow_state'
      });

      expect(step2.status).toBe('completed');

      // Retry from step 2
      await memory.store('workflow:step3', {
        step: 'step3',
        status: 'completed',
        retried: true
      }, { partition: 'workflow_state' });

      const step3 = await memory.retrieve('workflow:step3', {
        partition: 'workflow_state'
      });

      expect(step3.status).toBe('completed');
      expect(step3.retried).toBe(true);
    });

    test('should handle consensus deadlock gracefully', async () => {
      const proposalId = await consensus.propose({
        id: 'deadlock-test',
        decision: 'test decision',
        quorum: 10, // Impossible to reach
        proposer: 'agent-1'
      });

      // Wait with timeout
      const result = await consensus.waitForConsensus(proposalId, 200);

      expect(result).toBe(false);

      // Verify proposal still exists in pending state
      const state = await consensus.getProposalState(proposalId);
      expect(state?.status).toBe('pending');
    });
  });

  describe('Performance Under Load', () => {
    test('should handle high-volume workflow execution', async () => {
      const taskCount = 50;
      const startTime = Date.now();

      // Create multiple tasks
      const tasks = Array(taskCount).fill(null).map((_, i) => ({
        id: `task-${i}`,
        type: 'test-execution',
        status: 'pending'
      }));

      // Store tasks in parallel
      await Promise.all(
        tasks.map(task =>
          memory.store(`task:${task.id}`, task, { partition: 'tasks' })
        )
      );

      const duration = Date.now() - startTime;

      // Should complete in reasonable time
      expect(duration).toBeLessThan(5000);

      // Verify all tasks stored
      const storedTasks = await memory.query('task:%', { partition: 'tasks' });
      expect(storedTasks).toHaveLength(taskCount);
    });

    test('should maintain performance with concurrent coordination', async () => {
      const operations = [];

      // Mix of operations
      for (let i = 0; i < 20; i++) {
        operations.push(
          memory.store(`key-${i}`, { data: i }, { partition: 'test' })
        );
        operations.push(
          blackboard.postHint({ key: `hint-${i}`, value: i })
        );
      }

      const startTime = Date.now();
      await Promise.all(operations);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(3000);
    });
  });
});
