import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import * as fs from 'fs-extra';
import * as path from 'path';

describe('SwarmMemoryManager - 12-Table Schema', () => {
  let memory: SwarmMemoryManager;
  const testDbPath = ':memory:'; // Use in-memory DB for tests

  beforeEach(async () => {
    memory = new SwarmMemoryManager(testDbPath);
    await memory.initialize();
  });

  afterEach(async () => {
    await memory.close();
  });

  describe('Table 1 & 2: memory_entries and hints (existing)', () => {
    it('should store and retrieve memory entries', async () => {
      await memory.store('test-key', { data: 'value' }, { partition: 'test' });
      const result = await memory.retrieve('test-key', { partition: 'test' });
      expect(result).toEqual({ data: 'value' });
    });

    it('should post and read hints', async () => {
      await memory.postHint({ key: 'hint-1', value: { message: 'test' }, ttl: 3600 });
      const hints = await memory.readHints('hint-%');
      expect(hints.length).toBe(1);
      expect(hints[0].value).toEqual({ message: 'test' });
    });
  });

  describe('Table 3: events (TTL: 30 days)', () => {
    it('should store event with correct TTL', async () => {
      await memory.storeEvent({
        type: 'agent:spawned',
        payload: { agentId: 'agent-1', type: 'test-generator' },
        source: 'fleet-manager'
      });

      const events = await memory.queryEvents('agent:spawned');
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('agent:spawned');
      expect(events[0].source).toBe('fleet-manager');
      expect(events[0].ttl).toBe(2592000); // 30 days in seconds
    });

    it('should retrieve events by type', async () => {
      await memory.storeEvent({
        type: 'test:completed',
        payload: { testId: 'test-1', status: 'passed' },
        source: 'test-executor'
      });

      await memory.storeEvent({
        type: 'test:failed',
        payload: { testId: 'test-2', status: 'failed' },
        source: 'test-executor'
      });

      const completedEvents = await memory.queryEvents('test:completed');
      expect(completedEvents.length).toBe(1);
      expect(completedEvents[0].payload.status).toBe('passed');
    });

    it('should retrieve events by source', async () => {
      await memory.storeEvent({
        type: 'test:started',
        payload: { testId: 'test-3' },
        source: 'executor-1'
      });

      const events = await memory.getEventsBySource('executor-1');
      expect(events.length).toBe(1);
      expect(events[0].source).toBe('executor-1');
    });

    it('should clean expired events', async () => {
      // Store event with 1 second TTL
      await memory.storeEvent({
        type: 'test:temp',
        payload: { data: 'temp' },
        source: 'test',
        ttl: 1
      });

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      await memory.cleanExpired();
      const events = await memory.queryEvents('test:temp');
      expect(events.length).toBe(0);
    });
  });

  describe('Table 4: workflow_state (TTL: never expires)', () => {
    it('should store workflow state with no expiration', async () => {
      await memory.storeWorkflowState({
        id: 'workflow-1',
        step: 'test-generation',
        status: 'in_progress',
        checkpoint: { tests_generated: 50 },
        sha: 'abc123'
      });

      const state = await memory.getWorkflowState('workflow-1');
      expect(state).toBeDefined();
      expect(state.step).toBe('test-generation');
      expect(state.status).toBe('in_progress');
      expect(state.ttl).toBe(0); // Never expires
    });

    it('should update workflow state', async () => {
      await memory.storeWorkflowState({
        id: 'workflow-2',
        step: 'test-execution',
        status: 'pending',
        checkpoint: { tests_ready: true },
        sha: 'def456'
      });

      await memory.updateWorkflowState('workflow-2', {
        status: 'completed',
        checkpoint: { tests_passed: 100 }
      });

      const state = await memory.getWorkflowState('workflow-2');
      expect(state.status).toBe('completed');
      expect(state.checkpoint.tests_passed).toBe(100);
    });

    it('should query workflows by status', async () => {
      await memory.storeWorkflowState({
        id: 'wf-1',
        step: 'analysis',
        status: 'completed',
        checkpoint: {},
        sha: 'sha1'
      });

      await memory.storeWorkflowState({
        id: 'wf-2',
        step: 'testing',
        status: 'completed',
        checkpoint: {},
        sha: 'sha2'
      });

      const completed = await memory.queryWorkflowsByStatus('completed');
      expect(completed.length).toBe(2);
    });
  });

  describe('Table 5: patterns (TTL: 7 days)', () => {
    it('should store reusable pattern with TTL', async () => {
      await memory.storePattern({
        pattern: 'test-generation-strategy-1',
        confidence: 0.95,
        usageCount: 0,
        metadata: { framework: 'jest', approach: 'property-based' }
      });

      const pattern = await memory.getPattern('test-generation-strategy-1');
      expect(pattern).toBeDefined();
      expect(pattern.confidence).toBe(0.95);
      expect(pattern.ttl).toBe(604800); // 7 days
    });

    it('should increment pattern usage count', async () => {
      await memory.storePattern({
        pattern: 'optimization-tactic-1',
        confidence: 0.8,
        usageCount: 5
      });

      await memory.incrementPatternUsage('optimization-tactic-1');

      const pattern = await memory.getPattern('optimization-tactic-1');
      expect(pattern.usageCount).toBe(6);
    });

    it('should query patterns by confidence threshold', async () => {
      await memory.storePattern({
        pattern: 'high-confidence',
        confidence: 0.95,
        usageCount: 10
      });

      await memory.storePattern({
        pattern: 'low-confidence',
        confidence: 0.5,
        usageCount: 2
      });

      const highConfidence = await memory.queryPatternsByConfidence(0.9);
      expect(highConfidence.length).toBe(1);
      expect(highConfidence[0].pattern).toBe('high-confidence');
    });
  });

  describe('Table 6: consensus_state (TTL: 7 days)', () => {
    it('should create consensus proposal', async () => {
      await memory.createConsensusProposal({
        id: 'proposal-1',
        decision: 'deploy-test-suite-v3',
        proposer: 'agent-1',
        votes: ['agent-1'],
        quorum: 3,
        status: 'pending'
      });

      const proposal = await memory.getConsensusProposal('proposal-1');
      expect(proposal).toBeDefined();
      expect(proposal.decision).toBe('deploy-test-suite-v3');
      expect(proposal.status).toBe('pending');
      expect(proposal.ttl).toBe(604800); // 7 days
    });

    it('should add vote to consensus', async () => {
      await memory.createConsensusProposal({
        id: 'proposal-2',
        decision: 'scale-fleet',
        proposer: 'agent-1',
        votes: ['agent-1'],
        quorum: 2,
        status: 'pending'
      });

      await memory.voteOnConsensus('proposal-2', 'agent-2');

      const proposal = await memory.getConsensusProposal('proposal-2');
      expect(proposal.votes).toContain('agent-2');
      expect(proposal.votes.length).toBe(2);
    });

    it('should auto-approve when quorum reached', async () => {
      await memory.createConsensusProposal({
        id: 'proposal-3',
        decision: 'critical-action',
        proposer: 'agent-1',
        votes: ['agent-1'],
        quorum: 2,
        status: 'pending'
      });

      const approved = await memory.voteOnConsensus('proposal-3', 'agent-2');

      expect(approved).toBe(true);
      const proposal = await memory.getConsensusProposal('proposal-3');
      expect(proposal.status).toBe('approved');
    });

    it('should query pending proposals', async () => {
      await memory.createConsensusProposal({
        id: 'prop-1',
        decision: 'action-1',
        proposer: 'agent-1',
        votes: [],
        quorum: 3,
        status: 'pending'
      });

      const pending = await memory.queryConsensusProposals('pending');
      expect(pending.length).toBeGreaterThan(0);
    });
  });

  describe('Table 7: performance_metrics', () => {
    it('should store performance metric', async () => {
      await memory.storePerformanceMetric({
        metric: 'test-execution-time',
        value: 125.5,
        unit: 'ms',
        agentId: 'executor-1'
      });

      const metrics = await memory.queryPerformanceMetrics('test-execution-time');
      expect(metrics.length).toBe(1);
      expect(metrics[0].value).toBe(125.5);
      expect(metrics[0].unit).toBe('ms');
    });

    it('should retrieve metrics by agent', async () => {
      await memory.storePerformanceMetric({
        metric: 'memory-usage',
        value: 512,
        unit: 'MB',
        agentId: 'agent-1'
      });

      await memory.storePerformanceMetric({
        metric: 'cpu-usage',
        value: 45,
        unit: '%',
        agentId: 'agent-1'
      });

      const agentMetrics = await memory.getMetricsByAgent('agent-1');
      expect(agentMetrics.length).toBe(2);
    });

    it('should calculate average metric value', async () => {
      await memory.storePerformanceMetric({
        metric: 'response-time',
        value: 100,
        unit: 'ms'
      });

      await memory.storePerformanceMetric({
        metric: 'response-time',
        value: 200,
        unit: 'ms'
      });

      const avg = await memory.getAverageMetric('response-time');
      expect(avg).toBe(150);
    });
  });

  describe('Table 8: artifacts (TTL: never expires)', () => {
    it('should create artifact manifest', async () => {
      await memory.createArtifact({
        id: 'artifact-1',
        kind: 'code',
        path: './tests/generated-suite.test.ts',
        sha256: 'abc123def456',
        tags: ['test', 'auth', 'v3'],
        metadata: { framework: 'jest', lines: 250 }
      });

      const artifact = await memory.getArtifact('artifact-1');
      expect(artifact).toBeDefined();
      expect(artifact.kind).toBe('code');
      expect(artifact.ttl).toBe(0); // Never expires
    });

    it('should query artifacts by kind', async () => {
      await memory.createArtifact({
        id: 'art-1',
        kind: 'doc',
        path: './docs/api.md',
        sha256: 'doc123',
        tags: ['documentation']
      });

      await memory.createArtifact({
        id: 'art-2',
        kind: 'code',
        path: './src/module.ts',
        sha256: 'code456',
        tags: ['source']
      });

      const docs = await memory.queryArtifactsByKind('doc');
      expect(docs.length).toBe(1);
      expect(docs[0].id).toBe('art-1');
    });

    it('should query artifacts by tag', async () => {
      await memory.createArtifact({
        id: 'art-3',
        kind: 'data',
        path: './data/test-data.json',
        sha256: 'data789',
        tags: ['test-data', 'integration']
      });

      const tagged = await memory.queryArtifactsByTag('integration');
      expect(tagged.length).toBeGreaterThan(0);
      expect(tagged[0].tags).toContain('integration');
    });
  });

  describe('Table 9: sessions (for resumability)', () => {
    it('should create session', async () => {
      await memory.createSession({
        id: 'session-1',
        mode: 'swarm',
        state: { phase: 'test-generation', progress: 0.5 },
        checkpoints: []
      });

      const session = await memory.getSession('session-1');
      expect(session).toBeDefined();
      expect(session.mode).toBe('swarm');
      expect(session.state.progress).toBe(0.5);
    });

    it('should add checkpoint to session', async () => {
      await memory.createSession({
        id: 'session-2',
        mode: 'hive-mind',
        state: { active: true },
        checkpoints: []
      });

      await memory.addSessionCheckpoint('session-2', {
        timestamp: Date.now(),
        state: { tests_generated: 100 },
        sha: 'checkpoint-1'
      });

      const session = await memory.getSession('session-2');
      expect(session.checkpoints.length).toBe(1);
    });

    it('should resume from checkpoint', async () => {
      await memory.createSession({
        id: 'session-3',
        mode: 'swarm',
        state: { phase: 'initial' },
        checkpoints: [
          { timestamp: Date.now(), state: { phase: 'checkpoint-1' }, sha: 'cp1' }
        ]
      });

      const checkpoint = await memory.getLatestCheckpoint('session-3');
      expect(checkpoint).toBeDefined();
      expect(checkpoint.state.phase).toBe('checkpoint-1');
    });

    it('should update last resumed timestamp', async () => {
      await memory.createSession({
        id: 'session-4',
        mode: 'swarm',
        state: {},
        checkpoints: []
      });

      await memory.markSessionResumed('session-4');

      const session = await memory.getSession('session-4');
      expect(session.lastResumed).toBeDefined();
      expect(session.lastResumed).toBeGreaterThan(0);
    });
  });

  describe('Table 10: agent_registry (lifecycle tracking)', () => {
    it('should register agent', async () => {
      await memory.registerAgent({
        id: 'agent-1',
        type: 'test-generator',
        capabilities: ['property-testing', 'boundary-analysis'],
        status: 'active',
        performance: { tasksCompleted: 0, avgResponseTime: 0 }
      });

      const agent = await memory.getAgent('agent-1');
      expect(agent).toBeDefined();
      expect(agent.type).toBe('test-generator');
      expect(agent.status).toBe('active');
    });

    it('should update agent status', async () => {
      await memory.registerAgent({
        id: 'agent-2',
        type: 'test-executor',
        capabilities: ['parallel-execution'],
        status: 'active',
        performance: {}
      });

      await memory.updateAgentStatus('agent-2', 'idle');

      const agent = await memory.getAgent('agent-2');
      expect(agent.status).toBe('idle');
    });

    it('should query agents by status', async () => {
      await memory.registerAgent({
        id: 'agent-3',
        type: 'analyzer',
        capabilities: ['coverage'],
        status: 'active',
        performance: {}
      });

      await memory.registerAgent({
        id: 'agent-4',
        type: 'analyzer',
        capabilities: ['coverage'],
        status: 'terminated',
        performance: {}
      });

      const active = await memory.queryAgentsByStatus('active');
      expect(active.length).toBeGreaterThan(0);
      expect(active.every(a => a.status === 'active')).toBe(true);
    });

    it('should update agent performance metrics', async () => {
      await memory.registerAgent({
        id: 'agent-5',
        type: 'executor',
        capabilities: ['testing'],
        status: 'active',
        performance: { tasksCompleted: 10, avgResponseTime: 100 }
      });

      await memory.updateAgentPerformance('agent-5', {
        tasksCompleted: 15,
        avgResponseTime: 95
      });

      const agent = await memory.getAgent('agent-5');
      expect(agent.performance.tasksCompleted).toBe(15);
      expect(agent.performance.avgResponseTime).toBe(95);
    });
  });

  describe('Table 11: goap_state (GOAP planning)', () => {
    it('should store GOAP goal', async () => {
      await memory.storeGOAPGoal({
        id: 'goal-1',
        conditions: ['tests_ready', 'coverage_met'],
        cost: 1,
        priority: 'high'
      });

      const goal = await memory.getGOAPGoal('goal-1');
      expect(goal).toBeDefined();
      expect(goal.conditions).toContain('tests_ready');
    });

    it('should store GOAP action', async () => {
      await memory.storeGOAPAction({
        id: 'action-1',
        preconditions: ['code_analyzed'],
        effects: ['tests_generated'],
        cost: 2,
        agentType: 'test-generator'
      });

      const action = await memory.getGOAPAction('action-1');
      expect(action).toBeDefined();
      expect(action.effects).toContain('tests_generated');
    });

    it('should retrieve plan sequence', async () => {
      await memory.storeGOAPPlan({
        id: 'plan-1',
        goalId: 'goal-1',
        sequence: ['action-1', 'action-2', 'action-3'],
        totalCost: 5
      });

      const plan = await memory.getGOAPPlan('plan-1');
      expect(plan).toBeDefined();
      expect(plan.sequence.length).toBe(3);
      expect(plan.totalCost).toBe(5);
    });
  });

  describe('Table 12: ooda_cycles (OODA loop tracking)', () => {
    it('should store OODA cycle', async () => {
      await memory.storeOODACycle({
        id: 'cycle-1',
        phase: 'observe',
        observations: { events: [], metrics: [], artifacts: [] },
        timestamp: Date.now()
      });

      const cycle = await memory.getOODACycle('cycle-1');
      expect(cycle).toBeDefined();
      expect(cycle.phase).toBe('observe');
    });

    it('should update OODA phase', async () => {
      await memory.storeOODACycle({
        id: 'cycle-2',
        phase: 'observe',
        observations: {},
        timestamp: Date.now()
      });

      await memory.updateOODAPhase('cycle-2', 'orient', {
        patterns: [],
        context: {}
      });

      const cycle = await memory.getOODACycle('cycle-2');
      expect(cycle.phase).toBe('orient');
    });

    it('should complete OODA cycle', async () => {
      await memory.storeOODACycle({
        id: 'cycle-3',
        phase: 'act',
        observations: {},
        timestamp: Date.now()
      });

      await memory.completeOODACycle('cycle-3', {
        decision: 'execute-tests',
        outcome: 'success'
      });

      const cycle = await memory.getOODACycle('cycle-3');
      expect(cycle.completed).toBe(true);
      expect(cycle.result.decision).toBe('execute-tests');
    });

    it('should query cycles by phase', async () => {
      await memory.storeOODACycle({
        id: 'cyc-1',
        phase: 'decide',
        observations: {},
        timestamp: Date.now()
      });

      const decideCycles = await memory.queryOODACyclesByPhase('decide');
      expect(decideCycles.length).toBeGreaterThan(0);
      expect(decideCycles[0].phase).toBe('decide');
    });
  });

  describe('Cross-table operations', () => {
    it('should support workflow with events and checkpoints', async () => {
      // Create workflow
      await memory.storeWorkflowState({
        id: 'wf-integrated',
        step: 'test-generation',
        status: 'in_progress',
        checkpoint: { progress: 0 },
        sha: 'initial'
      });

      // Record event
      await memory.storeEvent({
        type: 'workflow:started',
        payload: { workflowId: 'wf-integrated' },
        source: 'orchestrator'
      });

      // Create checkpoint
      await memory.createSession({
        id: 'session-wf',
        mode: 'swarm',
        state: { workflowId: 'wf-integrated' },
        checkpoints: []
      });

      await memory.addSessionCheckpoint('session-wf', {
        timestamp: Date.now(),
        state: { progress: 0.5 },
        sha: 'mid-checkpoint'
      });

      // Verify all data
      const workflow = await memory.getWorkflowState('wf-integrated');
      const events = await memory.queryEvents('workflow:started');
      const session = await memory.getSession('session-wf');

      expect(workflow).toBeDefined();
      expect(events.length).toBe(1);
      expect(session.checkpoints.length).toBe(1);
    });

    it('should support GOAP planning with consensus', async () => {
      // Create goal
      await memory.storeGOAPGoal({
        id: 'goal-deploy',
        conditions: ['tests_passed', 'quality_gate_passed'],
        cost: 1
      });

      // Create action
      await memory.storeGOAPAction({
        id: 'action-deploy',
        preconditions: ['tests_passed'],
        effects: ['deployed'],
        cost: 3
      });

      // Propose consensus for action
      await memory.createConsensusProposal({
        id: 'consensus-deploy',
        decision: 'execute-action-deploy',
        proposer: 'planner-agent',
        votes: ['planner-agent'],
        quorum: 2,
        status: 'pending'
      });

      // Vote and approve
      await memory.voteOnConsensus('consensus-deploy', 'quality-agent');

      // Verify
      const goal = await memory.getGOAPGoal('goal-deploy');
      const action = await memory.getGOAPAction('action-deploy');
      const consensus = await memory.getConsensusProposal('consensus-deploy');

      expect(goal).toBeDefined();
      expect(action).toBeDefined();
      expect(consensus.status).toBe('approved');
    });
  });

  describe('TTL and cleanup', () => {
    it('should respect different TTL policies', async () => {
      // Artifacts: never expire (TTL=0)
      await memory.createArtifact({
        id: 'art-permanent',
        kind: 'code',
        path: './test.ts',
        sha256: 'sha',
        tags: []
      });

      // Events: 30 days (TTL=2592000)
      await memory.storeEvent({
        type: 'test:event',
        payload: {},
        source: 'test',
        ttl: 2592000
      });

      // Patterns: 7 days (TTL=604800)
      await memory.storePattern({
        pattern: 'test-pattern',
        confidence: 0.9,
        usageCount: 0,
        ttl: 604800
      });

      // Verify TTL values
      const artifact = await memory.getArtifact('art-permanent');
      const events = await memory.queryEvents('test:event');
      const pattern = await memory.getPattern('test-pattern');

      expect(artifact.ttl).toBe(0);
      expect(events[0].ttl).toBe(2592000);
      expect(pattern.ttl).toBe(604800);
    });
  });

  describe('Advanced stats', () => {
    it('should provide comprehensive stats for all 12 tables', async () => {
      // Add data to various tables
      await memory.store('key1', 'value1');
      await memory.postHint({ key: 'hint1', value: {} });
      await memory.storeEvent({ type: 'test', payload: {}, source: 'test' });
      await memory.storeWorkflowState({
        id: 'wf', step: 'test', status: 'pending', checkpoint: {}, sha: 'sha'
      });
      await memory.storePattern({ pattern: 'p1', confidence: 0.9, usageCount: 0 });

      const stats = await memory.stats();

      expect(stats.totalEntries).toBeGreaterThan(0);
      expect(stats.totalHints).toBeGreaterThan(0);
      expect(stats.totalEvents).toBeGreaterThan(0);
      expect(stats.totalWorkflows).toBeGreaterThan(0);
      expect(stats.totalPatterns).toBeGreaterThan(0);
    });
  });
});
