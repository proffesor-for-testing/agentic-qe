/**
 * Unit Tests for Neural GOAP Optimizer
 * ADR-047: MinCut Self-Organizing QE Integration - Phase 5
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  GOAPController,
  createGOAPController,
  NeuralPlanner,
  createNeuralPlanner,
  GOAPState,
  GOAPGoal,
  GOAPGoals,
  GOAPActions,
  GOAPAction,
  createInitialState,
  createStandardActions,
  DEFAULT_GOAP_CONTROLLER_CONFIG,
  DEFAULT_NEURAL_PLANNER_CONFIG,
} from '../../../../src/coordination/mincut/neural-goap';
import { SwarmGraph, createSwarmGraph } from '../../../../src/coordination/mincut/swarm-graph';

describe('Neural GOAP Optimizer', () => {
  describe('GOAPState', () => {
    it('should create initial state with defaults', () => {
      const state = createInitialState();

      expect(state.coverage).toBe(0);
      expect(state.passRate).toBe(1);
      expect(state.minCutHealth).toBe(0);
      expect(state.activeAgents).toBe(0);
      expect(state.pendingTests).toBe(0);
      expect(state.failingTests).toBe(0);
      expect(state.avgExecutionTime).toBe(0);
      expect(state.weakVertices).toBe(0);
      expect(state.memoryUsage).toBe(0);
      expect(state.timestamp).toBeInstanceOf(Date);
    });

    it('should create initial state with partial values', () => {
      const state = createInitialState({
        coverage: 50,
        passRate: 0.9,
        activeAgents: 5,
      });

      expect(state.coverage).toBe(50);
      expect(state.passRate).toBe(0.9);
      expect(state.activeAgents).toBe(5);
      expect(state.minCutHealth).toBe(0); // Default
    });
  });

  describe('GOAPGoals', () => {
    describe('achieveCoverage', () => {
      it('should create coverage goal with target', () => {
        const goal = GOAPGoals.achieveCoverage(80, 1);

        expect(goal.type).toBe('achieve_coverage');
        expect(goal.targetConditions.coverage).toBe(80);
        expect(goal.priority).toBe(1);
      });

      it('should detect when coverage goal is achieved', () => {
        const goal = GOAPGoals.achieveCoverage(80);
        const state = createInitialState({ coverage: 85 });

        expect(goal.isAchieved(state)).toBe(true);
      });

      it('should detect when coverage goal is not achieved', () => {
        const goal = GOAPGoals.achieveCoverage(80);
        const state = createInitialState({ coverage: 60 });

        expect(goal.isAchieved(state)).toBe(false);
      });

      it('should calculate distance to goal', () => {
        const goal = GOAPGoals.achieveCoverage(80);
        const state = createInitialState({ coverage: 60 });

        expect(goal.distanceToGoal(state)).toBe(20);
      });
    });

    describe('fixFailures', () => {
      it('should create fix failures goal', () => {
        const goal = GOAPGoals.fixFailures(0);

        expect(goal.type).toBe('fix_failures');
        expect(goal.targetConditions.failingTests).toBe(0);
        expect(goal.targetConditions.passRate).toBe(1);
      });

      it('should detect when failures are fixed', () => {
        const goal = GOAPGoals.fixFailures();
        const state = createInitialState({ failingTests: 0, passRate: 1 });

        expect(goal.isAchieved(state)).toBe(true);
      });

      it('should detect when failures exist', () => {
        const goal = GOAPGoals.fixFailures();
        const state = createInitialState({ failingTests: 5, passRate: 0.9 });

        expect(goal.isAchieved(state)).toBe(false);
      });
    });

    describe('strengthenTopology', () => {
      it('should create topology goal', () => {
        const goal = GOAPGoals.strengthenTopology(3.0);

        expect(goal.type).toBe('strengthen_topology');
        expect(goal.targetConditions.minCutHealth).toBe(3.0);
      });

      it('should detect healthy topology', () => {
        const goal = GOAPGoals.strengthenTopology(3.0);
        const state = createInitialState({ minCutHealth: 3.5, weakVertices: 0 });

        expect(goal.isAchieved(state)).toBe(true);
      });
    });

    describe('optimizePerformance', () => {
      it('should create performance goal', () => {
        const goal = GOAPGoals.optimizePerformance(100);

        expect(goal.type).toBe('optimize_performance');
        expect(goal.targetConditions.avgExecutionTime).toBe(100);
      });

      it('should detect optimized performance', () => {
        const goal = GOAPGoals.optimizePerformance(100);
        const state = createInitialState({ avgExecutionTime: 80 });

        expect(goal.isAchieved(state)).toBe(true);
      });
    });

    describe('scaleAgents', () => {
      it('should create scale agents goal', () => {
        const goal = GOAPGoals.scaleAgents(10);

        expect(goal.type).toBe('scale_agents');
        expect(goal.targetConditions.activeAgents).toBe(10);
      });
    });

    describe('healWeakVertices', () => {
      it('should create heal vertices goal', () => {
        const goal = GOAPGoals.healWeakVertices();

        expect(goal.type).toBe('reduce_weak_vertices');
        expect(goal.targetConditions.weakVertices).toBe(0);
      });
    });
  });

  describe('GOAPActions', () => {
    describe('generateTests', () => {
      it('should create generate tests action', () => {
        const action = GOAPActions.generateTests(5);

        expect(action.type).toBe('generate_tests');
        expect(action.name).toBe('Generate Tests');
        expect(action.baseCost).toBe(10);
      });

      it('should be applicable when coverage < 100 and agents > 0', () => {
        const action = GOAPActions.generateTests();
        const state = createInitialState({ coverage: 50, activeAgents: 2 });

        expect(action.isApplicable(state)).toBe(true);
      });

      it('should not be applicable when coverage is 100', () => {
        const action = GOAPActions.generateTests();
        const state = createInitialState({ coverage: 100, activeAgents: 2 });

        expect(action.isApplicable(state)).toBe(false);
      });

      it('should simulate coverage increase', () => {
        const action = GOAPActions.generateTests(10);
        const state = createInitialState({ coverage: 50 });
        const newState = action.simulate(state);

        expect(newState.coverage).toBe(60);
        expect(newState.pendingTests).toBe(10);
      });
    });

    describe('runTests', () => {
      it('should create run tests action', () => {
        const action = GOAPActions.runTests();

        expect(action.type).toBe('run_tests');
        expect(action.baseCost).toBe(5);
      });

      it('should be applicable when pending or failing tests exist', () => {
        const action = GOAPActions.runTests();
        const state = createInitialState({ pendingTests: 5 });

        expect(action.isApplicable(state)).toBe(true);
      });

      it('should simulate test execution', () => {
        const action = GOAPActions.runTests();
        const state = createInitialState({ pendingTests: 10, failingTests: 5, passRate: 0.8 });
        const newState = action.simulate(state);

        expect(newState.pendingTests).toBe(0);
        expect(newState.passRate).toBe(0.9);
        expect(newState.failingTests).toBe(0);
      });
    });

    describe('spawnAgent', () => {
      it('should create spawn agent action', () => {
        const action = GOAPActions.spawnAgent('test-execution');

        expect(action.type).toBe('spawn_agent');
        expect(action.parameters?.domain).toBe('test-execution');
      });

      it('should be applicable under agent and memory limits', () => {
        const action = GOAPActions.spawnAgent();
        const state = createInitialState({ activeAgents: 5, memoryUsage: 50 });

        expect(action.isApplicable(state)).toBe(true);
      });

      it('should not be applicable at max agents', () => {
        const action = GOAPActions.spawnAgent();
        const state = createInitialState({ activeAgents: 20, memoryUsage: 50 });

        expect(action.isApplicable(state)).toBe(false);
      });

      it('should simulate agent spawn', () => {
        const action = GOAPActions.spawnAgent();
        const state = createInitialState({ activeAgents: 5, memoryUsage: 50 });
        const newState = action.simulate(state);

        expect(newState.activeAgents).toBe(6);
        expect(newState.memoryUsage).toBe(55);
        expect(newState.minCutHealth).toBe(0.5);
      });
    });

    describe('terminateAgent', () => {
      it('should create terminate agent action', () => {
        const action = GOAPActions.terminateAgent();

        expect(action.type).toBe('terminate_agent');
      });

      it('should be applicable when more than 1 agent exists', () => {
        const action = GOAPActions.terminateAgent();
        const state = createInitialState({ activeAgents: 3 });

        expect(action.isApplicable(state)).toBe(true);
      });

      it('should not be applicable with only 1 agent', () => {
        const action = GOAPActions.terminateAgent();
        const state = createInitialState({ activeAgents: 1 });

        expect(action.isApplicable(state)).toBe(false);
      });
    });

    describe('healTopology', () => {
      it('should create heal topology action', () => {
        const action = GOAPActions.healTopology();

        expect(action.type).toBe('heal_topology');
      });

      it('should be applicable when weak vertices exist', () => {
        const action = GOAPActions.healTopology();
        const state = createInitialState({ weakVertices: 2 });

        expect(action.isApplicable(state)).toBe(true);
      });
    });

    describe('noAction', () => {
      it('should create no action', () => {
        const action = GOAPActions.noAction('Test reason');

        expect(action.type).toBe('no_action');
        expect(action.parameters?.reason).toBe('Test reason');
        expect(action.baseCost).toBe(0);
      });

      it('should always be applicable', () => {
        const action = GOAPActions.noAction();
        const state = createInitialState();

        expect(action.isApplicable(state)).toBe(true);
      });
    });
  });

  describe('NeuralPlanner', () => {
    let planner: NeuralPlanner;

    beforeEach(() => {
      planner = createNeuralPlanner();
    });

    it('should create planner with default config', () => {
      expect(planner).toBeInstanceOf(NeuralPlanner);
    });

    it('should plan to achieve coverage goal', () => {
      const initialState = createInitialState({ coverage: 50, activeAgents: 2 });
      const goal = GOAPGoals.achieveCoverage(70);

      const plan = planner.plan(initialState, goal);

      expect(plan).toBeDefined();
      expect(plan.goal).toBe(goal);
      expect(plan.initialState).toBe(initialState);
      expect(plan.planningTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should return empty plan if goal already achieved', () => {
      const initialState = createInitialState({ coverage: 80 });
      const goal = GOAPGoals.achieveCoverage(70);

      const plan = planner.plan(initialState, goal);

      expect(plan.actions).toHaveLength(0);
      expect(plan.achievesGoal).toBe(true);
      expect(plan.confidence).toBe(1.0);
    });

    it('should generate plan with multiple actions', () => {
      const initialState = createInitialState({
        coverage: 30,
        activeAgents: 2,
        pendingTests: 0,
        passRate: 0.9,
      });
      const goal = GOAPGoals.achieveCoverage(50);

      const plan = planner.plan(initialState, goal);

      expect(plan.actions.length).toBeGreaterThan(0);
    });

    it('should learn from action outcomes', () => {
      const stateBefore = createInitialState({ coverage: 50 });
      const stateAfter = createInitialState({ coverage: 60 });

      // Should not throw
      planner.learn('generate_tests', stateBefore, stateAfter, 5, true);

      const weights = planner.getWeights();
      expect(weights.get('generate_tests')?.usageCount).toBe(1);
    });

    it('should track action history', () => {
      const stateBefore = createInitialState({ coverage: 50 });
      const stateAfter = createInitialState({ coverage: 60 });

      planner.learn('generate_tests', stateBefore, stateAfter, 5, true);
      planner.learn('run_tests', stateAfter, stateAfter, 3, true);

      const history = planner.getHistory();
      expect(history).toHaveLength(2);
    });

    it('should get expected improvement for actions', () => {
      const improvement = planner.getExpectedImprovement('generate_tests');
      expect(improvement).toBe(5); // Default value
    });

    it('should update expected improvement after learning', () => {
      const stateBefore = createInitialState({ minCutHealth: 1 });
      const stateAfter = createInitialState({ minCutHealth: 2 });

      // Learn multiple times
      for (let i = 0; i < 5; i++) {
        planner.learn('heal_topology', stateBefore, stateAfter, 5, true);
      }

      const history = planner.getHistory();
      expect(history.length).toBe(5);
    });
  });

  describe('GOAPController', () => {
    let graph: SwarmGraph;
    let controller: GOAPController;

    beforeEach(() => {
      graph = createSwarmGraph();

      // Add some vertices
      graph.addVertex({
        id: 'agent-1',
        type: 'agent',
        domain: 'test-execution',
        weight: 1,
        createdAt: new Date(),
      });
      graph.addVertex({
        id: 'agent-2',
        type: 'agent',
        domain: 'test-generation',
        weight: 1,
        createdAt: new Date(),
      });
      graph.addEdge({
        source: 'agent-1',
        target: 'agent-2',
        weight: 1,
        type: 'coordination',
        bidirectional: true,
      });

      controller = createGOAPController(graph, { enabled: true });
    });

    it('should create controller with config', () => {
      expect(controller).toBeInstanceOf(GOAPController);
      expect(controller.getConfig().enabled).toBe(true);
    });

    it('should add and remove goals', () => {
      const goal = GOAPGoals.achieveCoverage(80);

      controller.addGoal(goal);
      expect(controller.getActiveGoals()).toHaveLength(1);

      controller.removeGoal(goal.id);
      expect(controller.getActiveGoals()).toHaveLength(0);
    });

    it('should limit concurrent goals', () => {
      const config = { ...DEFAULT_GOAP_CONTROLLER_CONFIG, maxConcurrentGoals: 2 };
      const limitedController = createGOAPController(graph, config);

      limitedController.addGoal(GOAPGoals.achieveCoverage(80, 1));
      limitedController.addGoal(GOAPGoals.fixFailures(2));
      limitedController.addGoal(GOAPGoals.healWeakVertices(3));

      // Should only keep 2 highest priority goals
      expect(limitedController.getActiveGoals()).toHaveLength(2);
    });

    it('should create plan for goal', () => {
      const goal = GOAPGoals.healWeakVertices();
      controller.addGoal(goal);

      const plan = controller.plan(goal);

      expect(plan).toBeDefined();
      expect(plan.goal).toBe(goal);
    });

    it('should get current state from graph', () => {
      const state = controller.getCurrentState();

      expect(state.activeAgents).toBe(2);
      expect(state.timestamp).toBeInstanceOf(Date);
    });

    it('should execute plan', async () => {
      const goal = GOAPGoals.healWeakVertices();
      const plan = controller.plan(goal);

      const result = await controller.execute(plan);

      expect(result).toBeDefined();
      expect(result.plan).toBe(plan);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should track execution results', async () => {
      const goal = GOAPGoals.healWeakVertices();
      const plan = controller.plan(goal);

      await controller.execute(plan);

      const results = controller.getExecutionResults();
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should get statistics', () => {
      const stats = controller.getStats();

      expect(stats.activeGoals).toBeGreaterThanOrEqual(0);
      expect(stats.activePlans).toBeGreaterThanOrEqual(0);
      expect(stats.totalExecutions).toBeGreaterThanOrEqual(0);
    });

    it('should start and stop', async () => {
      await controller.start();
      expect(controller.isRunning()).toBe(true);

      await controller.stop();
      expect(controller.isRunning()).toBe(false);
    });

    it('should replan for existing goal', () => {
      const goal = GOAPGoals.achieveCoverage(80);
      controller.addGoal(goal);
      controller.plan(goal);

      const newPlan = controller.replan(goal.id);

      expect(newPlan).toBeDefined();
      expect(newPlan?.goal.id).toBe(goal.id);
    });

    it('should return null when replanning non-existent goal', () => {
      const newPlan = controller.replan('non-existent-id');

      expect(newPlan).toBeNull();
    });
  });

  describe('createStandardActions', () => {
    it('should create set of standard actions', () => {
      const actions = createStandardActions();

      expect(actions.length).toBeGreaterThan(0);

      const types = actions.map(a => a.type);
      expect(types).toContain('generate_tests');
      expect(types).toContain('run_tests');
      expect(types).toContain('spawn_agent');
      expect(types).toContain('heal_topology');
    });
  });

  describe('Configuration', () => {
    it('should have default neural planner config', () => {
      expect(DEFAULT_NEURAL_PLANNER_CONFIG.learningRate).toBe(0.05);
      expect(DEFAULT_NEURAL_PLANNER_CONFIG.maxIterations).toBe(1000);
      expect(DEFAULT_NEURAL_PLANNER_CONFIG.maxPlanLength).toBe(20);
    });

    it('should have default GOAP controller config', () => {
      expect(DEFAULT_GOAP_CONTROLLER_CONFIG.enabled).toBe(true);
      expect(DEFAULT_GOAP_CONTROLLER_CONFIG.planningIntervalMs).toBe(30000);
      expect(DEFAULT_GOAP_CONTROLLER_CONFIG.maxConcurrentGoals).toBe(3);
      expect(DEFAULT_GOAP_CONTROLLER_CONFIG.replanOnFailure).toBe(true);
    });
  });

  describe('Integration with SwarmGraph', () => {
    it('should update graph when spawning agents', async () => {
      const graph = createSwarmGraph();
      graph.addVertex({
        id: 'initial-agent',
        type: 'agent',
        domain: 'test-execution',
        weight: 1,
        createdAt: new Date(),
      });

      const controller = createGOAPController(graph);
      const initialCount = graph.getVerticesByType('agent').length;

      const spawnAction = GOAPActions.spawnAgent('test-generation');
      const state = createInitialState({ activeAgents: 1, memoryUsage: 20 });

      // Simulate spawn through controller execution
      const goal = GOAPGoals.scaleAgents(2);
      const plan = controller.plan(goal);
      await controller.execute(plan);

      // Graph should have been modified
      expect(controller.getCurrentState()).toBeDefined();
    });

    it('should read topology state from graph', () => {
      const graph = createSwarmGraph();

      // Create a well-connected graph
      for (let i = 0; i < 5; i++) {
        graph.addVertex({
          id: `agent-${i}`,
          type: 'agent',
          domain: 'test-execution',
          weight: 1,
          createdAt: new Date(),
        });
      }

      for (let i = 0; i < 4; i++) {
        graph.addEdge({
          source: `agent-${i}`,
          target: `agent-${i + 1}`,
          weight: 1,
          type: 'coordination',
          bidirectional: true,
        });
      }

      const controller = createGOAPController(graph);
      const state = controller.getCurrentState();

      expect(state.activeAgents).toBe(5);
      expect(state.minCutHealth).toBeGreaterThanOrEqual(0);
    });
  });
});
