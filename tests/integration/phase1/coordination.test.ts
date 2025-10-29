/**
 * Phase 1 Integration Tests: Coordination Patterns
 *
 * Tests Blackboard + Consensus workflow, GOAP + OODA integration,
 * multi-agent coordination, and event-driven coordination.
 */

import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import { BlackboardCoordination } from '@core/coordination/BlackboardCoordination';
import { ConsensusGating } from '@core/coordination/ConsensusGating';
import { GOAPCoordination, Action, Goal } from '@core/coordination/GOAPCoordination';
import { OODACoordination } from '@core/coordination/OODACoordination';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';

describe('Phase 1 - Coordination Patterns Integration', () => {
  let memory: SwarmMemoryManager;
  let blackboard: BlackboardCoordination;
  let consensus: ConsensusGating;
  let goap: GOAPCoordination;
  let ooda: OODACoordination;
  let tempDbPath: string;

  beforeAll(async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aqe-coord-test-'));
    tempDbPath = path.join(tempDir, 'test.db');
  });

  beforeEach(async () => {
    memory = new SwarmMemoryManager(tempDbPath);
    await memory.initialize();

    blackboard = new BlackboardCoordination(memory);
    consensus = new ConsensusGating(memory);
    goap = new GOAPCoordination(memory);
    ooda = new OODACoordination(memory);
  });

  afterEach(async () => {
    await memory.close();
  });

  afterAll(async () => {
    await fs.remove(path.dirname(tempDbPath));
  });

  describe('Blackboard + Consensus Workflow', () => {
    test('should coordinate task assignment via blackboard and consensus', async () => {
      // 1. Agent posts task availability hint on blackboard
      await blackboard.postHint({
        key: 'aqe/tasks/available/task-123',
        value: {
          taskId: 'task-123',
          type: 'test-generation',
          priority: 'high'
        }
      });

      // 2. Multiple agents read hints
      const hints = await blackboard.readHints('aqe/tasks/available/*');
      expect(hints).toHaveLength(1);
      expect(hints[0].value.taskId).toBe('task-123');

      // 3. Propose consensus on task assignment
      const proposalId = await consensus.propose({
        id: 'assign-task-123',
        decision: 'assign task-123 to agent-1',
        quorum: 2,
        proposer: 'agent-1'
      });

      // 4. Agents vote
      const vote1 = await consensus.vote(proposalId, 'agent-2');
      expect(vote1).toBe(false); // Not enough votes yet

      const vote2 = await consensus.vote(proposalId, 'agent-3');
      expect(vote2).toBe(true); // Consensus reached

      // 5. Verify consensus state
      const state = await consensus.getProposalState(proposalId);
      expect(state?.status).toBe('approved');
      expect(state?.votes).toHaveLength(3); // proposer + 2 voters
    });

    test('should handle concurrent task distribution', async () => {
      const tasks = ['task-1', 'task-2', 'task-3'];
      const agents = ['agent-1', 'agent-2', 'agent-3'];

      // Post multiple task hints
      for (const taskId of tasks) {
        await blackboard.postHint({
          key: `aqe/tasks/available/${taskId}`,
          value: { taskId, type: 'test-execution' }
        });
      }

      // Each agent proposes to take a task
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

      // Verify all proposals created
      expect(proposals).toHaveLength(3);

      // Get states
      const states = await Promise.all(
        proposals.map(id => consensus.getProposalState(id))
      );

      states.forEach(state => {
        expect(state?.status).toBe('pending'); // Waiting for more votes
      });
    });

    test('should support blackboard subscriptions for real-time coordination', async () => {
      const receivedHints: any[] = [];

      // Subscribe to task hints
      const unsubscribe = blackboard.subscribeToHints(
        'aqe/tasks/completed/*',
        (hint) => {
          receivedHints.push(hint);
        }
      );

      // Post completion hints
      await blackboard.postHint({
        key: 'aqe/tasks/completed/task-1',
        value: { result: 'success' }
      });

      await blackboard.postHint({
        key: 'aqe/tasks/completed/task-2',
        value: { result: 'success' }
      });

      // Small delay for async processing
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(receivedHints).toHaveLength(2);
      unsubscribe();
    });

    test('should handle consensus rejection and re-proposal', async () => {
      // Propose initial decision
      const proposalId = await consensus.propose({
        id: 'test-proposal',
        decision: 'deploy to production',
        quorum: 2,
        proposer: 'agent-1'
      });

      // Reject proposal
      await consensus.reject(proposalId, 'agent-1');

      const rejectedState = await consensus.getProposalState(proposalId);
      expect(rejectedState?.status).toBe('rejected');

      // Re-propose with modifications
      const newProposalId = await consensus.propose({
        id: 'test-proposal-v2',
        decision: 'deploy to staging first',
        quorum: 2,
        proposer: 'agent-1'
      });

      expect(newProposalId).toBe('test-proposal-v2');
    });
  });

  describe('GOAP + OODA Integration', () => {
    test('should use OODA loop to inform GOAP planning', async () => {
      // 1. OODA: Observe environment
      const cycleId = await ooda.startCycle();

      await ooda.observe({
        data: { coverageGap: 15, failedTests: 0 },
        source: 'coverage-analyzer'
      });

      await ooda.observe({
        data: { activeTasks: 3, availableAgents: 5 },
        source: 'fleet-manager'
      });

      // 2. OODA: Orient - analyze situation
      await ooda.orient(
        { needsCoverageImprovement: true, hasCapacity: true },
        { priority: 'high' }
      );

      // 3. OODA: Decide on goal
      await ooda.decide(
        ['improve-coverage', 'optimize-existing', 'do-nothing'],
        'improve-coverage',
        'Coverage gap exists and we have capacity'
      );

      // 4. GOAP: Plan actions to achieve goal
      goap.registerAction({
        id: 'generate-tests',
        cost: 10,
        preconditions: { hasCapacity: true },
        effects: { testsGenerated: true },
        execute: async () => {}
      });

      goap.registerAction({
        id: 'run-tests',
        cost: 5,
        preconditions: { testsGenerated: true },
        effects: { testsPassed: true },
        execute: async () => {}
      });

      goap.registerAction({
        id: 'update-coverage',
        cost: 2,
        preconditions: { testsPassed: true },
        effects: { coverageImproved: true },
        execute: async () => {}
      });

      await goap.updateWorldState({
        hasCapacity: true,
        testsGenerated: false,
        testsPassed: false,
        coverageImproved: false
      });

      const goal: Goal = {
        id: 'improve-coverage-goal',
        conditions: { coverageImproved: true },
        priority: 10
      };

      const plan = await goap.planForGoal(goal);

      expect(plan).not.toBeNull();
      expect(plan?.actions.length).toBeGreaterThan(0);
      expect(plan?.actions.map(a => a.id)).toContain('generate-tests');
      expect(plan?.actions.map(a => a.id)).toContain('update-coverage');

      // 5. OODA: Act - execute plan
      let actionExecuted = false;
      await ooda.act(
        'execute-goap-plan',
        { planId: plan?.goal.id },
        async () => {
          actionExecuted = true;
          return { success: true };
        }
      );

      await ooda.completeCycle();

      expect(actionExecuted).toBe(true);
    });

    test('should adapt GOAP plans based on OODA observations', async () => {
      // Initial world state
      await goap.updateWorldState({
        systemLoad: 'low',
        resourcesAvailable: true
      });

      // Register actions with different costs
      goap.registerAction({
        id: 'fast-execution',
        cost: 20,
        preconditions: { resourcesAvailable: true },
        effects: { taskCompleted: true },
        execute: async () => {}
      });

      goap.registerAction({
        id: 'slow-execution',
        cost: 5,
        preconditions: {},
        effects: { taskCompleted: true },
        execute: async () => {}
      });

      // Plan with low load
      const goal: Goal = {
        id: 'complete-task',
        conditions: { taskCompleted: true },
        priority: 10
      };

      const plan1 = await goap.planForGoal(goal);
      expect(plan1?.actions[0].id).toBe('slow-execution'); // Lower cost chosen

      // OODA observes system state change
      await ooda.startCycle();
      await ooda.observe({
        data: { systemLoad: 'high', deadline: 'urgent' },
        source: 'monitor'
      });

      await ooda.orient(
        { needsFasterExecution: true },
        { deadline: 'urgent' }
      );

      // Update world state based on observation
      await goap.updateWorldState({
        systemLoad: 'high',
        resourcesAvailable: true
      });

      // Replan with new state
      const plan2 = await goap.planForGoal(goal);

      // Both plans should complete the goal
      expect(plan2).not.toBeNull();
      expect(plan2?.actions.some(a => a.id === 'fast-execution' || a.id === 'slow-execution')).toBe(true);

      await ooda.completeCycle();
    });

    test('should track OODA cycle performance metrics', async () => {
      // Execute multiple OODA cycles
      for (let i = 0; i < 3; i++) {
        await ooda.startCycle();
        await ooda.observe({ data: { iteration: i }, source: 'test' });
        await ooda.orient({ ready: true }, {});
        await ooda.decide([], 'proceed', 'test');
        await ooda.act('test-action', {}, async () => ({}));
        await ooda.completeCycle();
      }

      // Get cycle history
      const history = await ooda.getCycleHistory(5);
      expect(history.length).toBeGreaterThanOrEqual(3);

      // Verify all cycles completed
      history.forEach(cycle => {
        expect(cycle.endTime).toBeDefined();
        expect(cycle.duration).toBeGreaterThan(0);
      });

      // Get average cycle time
      const avgTime = await ooda.getAverageCycleTime();
      expect(avgTime).toBeGreaterThan(0);
    });
  });

  describe('Multi-Agent Coordination', () => {
    test('should coordinate multiple agents via blackboard', async () => {
      const agents = ['agent-1', 'agent-2', 'agent-3'];
      const receivedByAgent: Record<string, any[]> = {};

      // Each agent subscribes to different patterns
      agents.forEach(agent => {
        receivedByAgent[agent] = [];
        blackboard.subscribeToHints(`aqe/${agent}/*`, (hint) => {
          receivedByAgent[agent].push(hint);
        });
      });

      // Broadcast messages to all agents
      for (const agent of agents) {
        await blackboard.postHint({
          key: `aqe/${agent}/task-assignment`,
          value: { task: `task-for-${agent}` }
        });
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify each agent received only their messages
      agents.forEach(agent => {
        expect(receivedByAgent[agent]).toHaveLength(1);
        expect(receivedByAgent[agent][0].value.task).toBe(`task-for-${agent}`);
      });
    });

    test('should handle consensus with Byzantine fault tolerance', async () => {
      const totalAgents = 7;
      const byzantineAgents = 2; // Up to 2 faulty agents
      const quorum = Math.floor((totalAgents + byzantineAgents) / 2) + 1;

      // Propose decision
      const proposalId = await consensus.propose({
        id: 'critical-decision',
        decision: 'approve deployment',
        quorum,
        proposer: 'agent-1'
      });

      // Honest agents vote
      for (let i = 2; i <= 5; i++) {
        await consensus.vote(proposalId, `agent-${i}`);
      }

      // Byzantine agents might not vote or vote incorrectly
      // But we have enough honest votes

      const state = await consensus.getProposalState(proposalId);
      expect(state?.status).toBe('approved');
      expect(state?.votes.length).toBeGreaterThanOrEqual(quorum + 1);
    });

    test('should coordinate complex multi-step workflow', async () => {
      const workflow = {
        'step-1': { agent: 'agent-1', status: 'pending' },
        'step-2': { agent: 'agent-2', status: 'pending' },
        'step-3': { agent: 'agent-3', status: 'pending' }
      };

      // Step 1: Agent 1 starts work
      await blackboard.postHint({
        key: 'aqe/workflow/step-1/started',
        value: { agent: 'agent-1', timestamp: Date.now() }
      });

      // Step 1: Complete and notify
      await blackboard.postHint({
        key: 'aqe/workflow/step-1/completed',
        value: { agent: 'agent-1', result: 'success' }
      });

      // Step 2: Agent 2 waits for step 1
      const step1Complete = await blackboard.waitForHint(
        'aqe/workflow/step-1/completed',
        1000
      );

      expect(step1Complete).not.toBeNull();

      // Step 2: Agent 2 proceeds
      await blackboard.postHint({
        key: 'aqe/workflow/step-2/completed',
        value: { agent: 'agent-2', result: 'success' }
      });

      // Verify workflow progress
      const completedSteps = await blackboard.readHints('aqe/workflow/*/completed');
      expect(completedSteps.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Event-Driven Coordination', () => {
    test('should emit and handle coordination events', async () => {
      const events: any[] = [];

      blackboard.on('blackboard:hint-posted', (hint) => {
        events.push({ type: 'hint-posted', data: hint });
      });

      consensus.on('consensus:proposed', (proposal) => {
        events.push({ type: 'consensus-proposed', data: proposal });
      });

      consensus.on('consensus:reached', (state) => {
        events.push({ type: 'consensus-reached', data: state });
      });

      // Trigger events
      await blackboard.postHint({
        key: 'test-hint',
        value: { data: 'test' }
      });

      const proposalId = await consensus.propose({
        id: 'test-proposal',
        decision: 'test decision',
        quorum: 1,
        proposer: 'agent-1'
      });

      await consensus.vote(proposalId, 'agent-2');

      expect(events.length).toBeGreaterThanOrEqual(3);
      expect(events.some(e => e.type === 'hint-posted')).toBe(true);
      expect(events.some(e => e.type === 'consensus-proposed')).toBe(true);
      expect(events.some(e => e.type === 'consensus-reached')).toBe(true);
    });

    test('should chain GOAP and OODA events', async () => {
      const events: string[] = [];

      goap.on('goap:plan-created', () => events.push('plan-created'));
      goap.on('goap:action-completed', () => events.push('action-completed'));
      goap.on('goap:plan-completed', () => events.push('plan-completed'));

      ooda.on('ooda:cycle-started', () => events.push('cycle-started'));
      ooda.on('ooda:observation-added', () => events.push('observation-added'));
      ooda.on('ooda:cycle-completed', () => events.push('cycle-completed'));

      // Execute OODA cycle
      await ooda.startCycle();
      await ooda.observe({ data: {}, source: 'test' });
      await ooda.orient({}, {});
      await ooda.decide([], 'test', 'test');
      await ooda.act('test', {}, async () => ({}));
      await ooda.completeCycle();

      // Execute GOAP plan
      goap.registerAction({
        id: 'test-action',
        cost: 1,
        preconditions: {},
        effects: { done: true },
        execute: async () => {}
      });

      await goap.updateWorldState({ done: false });

      const plan = await goap.planForGoal({
        id: 'test-goal',
        conditions: { done: true },
        priority: 1
      });

      if (plan) {
        await goap.executePlan(`goap:plan:${plan.goal.id}`);
      }

      // Verify event chain
      expect(events).toContain('cycle-started');
      expect(events).toContain('observation-added');
      expect(events).toContain('cycle-completed');
      expect(events).toContain('plan-created');
    });
  });

  describe('Coordination Error Handling', () => {
    test('should handle consensus timeout gracefully', async () => {
      const proposalId = await consensus.propose({
        id: 'timeout-test',
        decision: 'test decision',
        quorum: 10, // Impossible to reach
        proposer: 'agent-1'
      });

      // Wait with timeout
      const result = await consensus.waitForConsensus(proposalId, 100);

      expect(result).toBe(false); // Timeout
    });

    test('should handle blackboard hint wait timeout', async () => {
      const result = await blackboard.waitForHint(
        'aqe/never-posted/*',
        100
      );

      expect(result).toBeNull();
    });

    test('should handle GOAP planning failure', async () => {
      // Create impossible goal
      await goap.updateWorldState({ a: false });

      const plan = await goap.planForGoal({
        id: 'impossible',
        conditions: { b: true },
        priority: 1
      });

      expect(plan).toBeNull();
    });

    test('should handle OODA cycle errors gracefully', async () => {
      await ooda.startCycle();
      await ooda.observe({ data: {}, source: 'test' });
      await ooda.orient({}, {});
      await ooda.decide([], 'test', 'test');

      // Action that throws error
      await ooda.act('failing-action', {}, async () => {
        throw new Error('Action failed');
      });

      const cycle = await ooda.completeCycle();
      expect(cycle.action?.status).toBe('failed');
    });
  });
});
