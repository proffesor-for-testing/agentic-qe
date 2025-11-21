/**
 * Phase 2 Validation Criteria Tests
 *
 * Tests validation criteria from UNIFIED-GOAP-IMPLEMENTATION-PLAN.md:
 * - CLI: `aqe telemetry trace --agent qe-test-generator` equivalent
 * - Per-agent token breakdown retrieval
 * - Clause evaluation on sample file
 * - Multi-agent voting aggregation
 *
 * @version 1.0.0
 * @module tests/phase2/validation
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { AgentSpanManager, TaskSpanManager } from '@/telemetry/instrumentation';
import { getCostTracker } from '@/telemetry/metrics/collectors/cost';
import {
  ASTEvaluator,
  MetricEvaluator,
  PatternEvaluator,
  ConstitutionClause,
} from '@/constitution/evaluators';
import { VotingOrchestrator } from '@/voting/orchestrator';
import { ConsensusCalculator } from '@/voting/consensus';
import { VotingAgent, Vote, VotingPanelConfig } from '@/voting/types';

describe('Phase 2 Validation Criteria Tests', () => {
  let spanExporter: InMemorySpanExporter;
  let tracerProvider: NodeTracerProvider;
  let agentSpanManager: AgentSpanManager;
  let taskSpanManager: TaskSpanManager;

  const testFilesDir = path.join(__dirname, '../fixtures/validation');
  const sampleFile = path.join(testFilesDir, 'UserService.ts');

  beforeAll(() => {
    // Setup OpenTelemetry
    spanExporter = new InMemorySpanExporter();
    tracerProvider = new NodeTracerProvider();
    tracerProvider.register();

    agentSpanManager = new AgentSpanManager();
    taskSpanManager = new TaskSpanManager();

    // Create test files
    if (!fs.existsSync(testFilesDir)) {
      fs.mkdirSync(testFilesDir, { recursive: true });
    }

    fs.writeFileSync(
      sampleFile,
      `export class UserService {
  constructor(private db: Database) {}

  async findUser(id: string): Promise<User | null> {
    if (!id) {
      throw new Error('User ID is required');
    }
    return this.db.users.findById(id);
  }

  async createUser(data: CreateUserDto): Promise<User> {
    if (!data.email) {
      throw new Error('Email is required');
    }
    const user = await this.db.users.create(data);
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    const user = await this.findUser(id);
    if (!user) {
      throw new Error('User not found');
    }
    await this.db.users.delete(id);
  }
}
`
    );
  });

  afterAll(() => {
    if (fs.existsSync(testFilesDir)) {
      fs.rmSync(testFilesDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    spanExporter.reset();
  });

  describe('VC1: Agent Trace Retrieval (CLI: aqe telemetry trace --agent)', () => {
    it('should retrieve all traces for qe-test-generator agent', async () => {
      const agentType = 'qe-test-generator';
      const agentId = 'test-gen-001';

      // Simulate multiple agent operations
      const operations = [
        { taskId: 'task-1', taskType: 'unit-test', duration: 1500, tokens: 250 },
        { taskId: 'task-2', taskType: 'integration-test', duration: 2000, tokens: 300 },
        { taskId: 'task-3', taskType: 'e2e-test', duration: 3000, tokens: 400 },
      ];

      for (const op of operations) {
        const { span } = taskSpanManager.startExecutionSpan({
          agentId,
          agentType,
          taskId: op.taskId,
          taskType: op.taskType,
          priority: 'medium',
        });

        span.setAttribute('task.execution_time_ms', op.duration);
        span.setAttribute('task.tokens_used', op.tokens);
        span.setAttribute('task.status', 'completed');
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
      }

      await tracerProvider.forceFlush();

      // Retrieve traces
      const allSpans = spanExporter.getFinishedSpans();
      const agentSpans = allSpans.filter(
        s => s.attributes['agent.type'] === agentType
      );

      expect(agentSpans.length).toBe(operations.length);

      // Verify trace structure
      agentSpans.forEach((span, i) => {
        expect(span.attributes['agent.id']).toBe(agentId);
        expect(span.attributes['agent.type']).toBe(agentType);
        expect(span.attributes['task.id']).toBe(operations[i].taskId);
        expect(span.attributes['task.type']).toBe(operations[i].taskType);
        expect(span.attributes['task.execution_time_ms']).toBe(operations[i].duration);
        expect(span.attributes['task.tokens_used']).toBe(operations[i].tokens);
        expect(span.status.code).toBe(SpanStatusCode.OK);
      });
    });

    it('should retrieve trace with parent-child relationships', async () => {
      const tracer = trace.getTracer('test-tracer');

      // Parent orchestration span
      const parentSpan = tracer.startSpan('fleet.orchestrate');
      const parentContext = trace.setSpan(trace.context.active(), parentSpan);

      // Child agent spawn
      const { span: spawnSpan, context: spawnContext } = agentSpanManager.startSpawnSpan(
        {
          agentId: 'test-gen-001',
          agentType: 'qe-test-generator',
          agentName: 'Test Generator',
          capabilities: ['unit-test'],
        },
        parentContext
      );

      // Grandchild task execution
      const { span: taskSpan } = taskSpanManager.startExecutionSpan(
        {
          agentId: 'test-gen-001',
          agentType: 'qe-test-generator',
          taskId: 'task-1',
          taskType: 'unit-test',
          priority: 'high',
        },
        spawnContext
      );

      taskSpan.end();
      spawnSpan.end();
      parentSpan.end();

      await tracerProvider.forceFlush();

      const spans = spanExporter.getFinishedSpans();
      const [taskExported, spawnExported, parentExported] = spans;

      // Verify trace ID is consistent
      const traceId = parentExported.spanContext().traceId;
      expect(spawnExported.spanContext().traceId).toBe(traceId);
      expect(taskExported.spanContext().traceId).toBe(traceId);

      // Verify parent relationships
      expect(spawnExported.parentSpanId).toBe(parentExported.spanContext().spanId);
      expect(taskExported.parentSpanId).toBe(spawnExported.spanContext().spanId);
    });

    it('should filter traces by time range', async () => {
      const agentType = 'qe-coverage-analyzer';
      const startTime = Date.now();

      // Create spans over time
      for (let i = 0; i < 3; i++) {
        const { span } = taskSpanManager.startExecutionSpan({
          agentId: `coverage-00${i}`,
          agentType,
          taskId: `task-${i}`,
          taskType: 'coverage-analysis',
          priority: 'medium',
        });
        span.end();

        if (i < 2) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      await tracerProvider.forceFlush();

      const allSpans = spanExporter.getFinishedSpans();
      const agentSpans = allSpans.filter(
        s => s.attributes['agent.type'] === agentType
      );

      // Filter by time
      const endTime = startTime + 150;
      const timeFilteredSpans = agentSpans.filter(
        s => s.endTime[0] * 1000 + s.endTime[1] / 1000000 < endTime
      );

      expect(timeFilteredSpans.length).toBeLessThanOrEqual(agentSpans.length);
    });
  });

  describe('VC2: Per-Agent Token Breakdown', () => {
    it('should track tokens per agent type', async () => {
      const costTracker = getCostTracker();

      const agentTypes = [
        'qe-test-generator',
        'qe-coverage-analyzer',
        'qe-quality-gate',
        'qe-performance-tester',
      ];

      const tokensByAgent = new Map<string, number>();

      // Simulate token usage
      for (const agentType of agentTypes) {
        const tokensUsed = Math.floor(Math.random() * 500) + 100;
        tokensByAgent.set(agentType, tokensUsed);

        const { span } = taskSpanManager.startExecutionSpan({
          agentId: `${agentType}-001`,
          agentType,
          taskId: `task-${agentType}`,
          taskType: 'analysis',
          priority: 'medium',
        });

        span.setAttribute('task.tokens_used', tokensUsed);
        span.setAttribute('task.cost_usd', tokensUsed * 0.000006);
        span.end();
      }

      await tracerProvider.forceFlush();

      // Retrieve and aggregate
      const spans = spanExporter.getFinishedSpans();
      const aggregated = new Map<string, number>();

      spans.forEach(span => {
        const type = span.attributes['agent.type'] as string;
        const tokens = span.attributes['task.tokens_used'] as number;
        if (type && tokens) {
          aggregated.set(type, (aggregated.get(type) || 0) + tokens);
        }
      });

      // Verify per-agent breakdown
      expect(aggregated.size).toBe(agentTypes.length);
      agentTypes.forEach(type => {
        expect(aggregated.get(type)).toBe(tokensByAgent.get(type));
      });
    });

    it('should calculate cost per agent', async () => {
      const agentType = 'qe-test-generator';
      const tasks = [
        { tokens: 100, costPer1k: 0.006 },
        { tokens: 250, costPer1k: 0.006 },
        { tokens: 150, costPer1k: 0.006 },
      ];

      for (let i = 0; i < tasks.length; i++) {
        const { span } = taskSpanManager.startExecutionSpan({
          agentId: `${agentType}-001`,
          agentType,
          taskId: `task-${i}`,
          taskType: 'test',
          priority: 'medium',
        });

        const cost = (tasks[i].tokens / 1000) * tasks[i].costPer1k;
        span.setAttribute('task.tokens_used', tasks[i].tokens);
        span.setAttribute('task.cost_usd', cost);
        span.end();
      }

      await tracerProvider.forceFlush();

      const spans = spanExporter.getFinishedSpans();
      const totalTokens = spans.reduce(
        (sum, s) => sum + (s.attributes['task.tokens_used'] as number || 0),
        0
      );
      const totalCost = spans.reduce(
        (sum, s) => sum + (s.attributes['task.cost_usd'] as number || 0),
        0
      );

      const expectedTokens = tasks.reduce((sum, t) => sum + t.tokens, 0);
      expect(totalTokens).toBe(expectedTokens);
      expect(totalCost).toBeCloseTo((expectedTokens / 1000) * 0.006, 4);
    });

    it('should provide model-specific token breakdown', async () => {
      const models = ['claude-3-5-sonnet', 'claude-3-5-haiku', 'gpt-4o-mini'];
      const tokensByModel = new Map<string, number>();

      for (const model of models) {
        const tokens = Math.floor(Math.random() * 300) + 100;
        tokensByModel.set(model, tokens);

        const { span } = taskSpanManager.startExecutionSpan({
          agentId: 'test-gen-001',
          agentType: 'qe-test-generator',
          taskId: `task-${model}`,
          taskType: 'test',
          priority: 'medium',
        });

        span.setAttribute('task.tokens_used', tokens);
        span.setAttribute('task.model', model);
        span.end();
      }

      await tracerProvider.forceFlush();

      const spans = spanExporter.getFinishedSpans();
      const aggregated = new Map<string, number>();

      spans.forEach(span => {
        const model = span.attributes['task.model'] as string;
        const tokens = span.attributes['task.tokens_used'] as number;
        if (model && tokens) {
          aggregated.set(model, (aggregated.get(model) || 0) + tokens);
        }
      });

      expect(aggregated.size).toBe(models.length);
      models.forEach(model => {
        expect(aggregated.get(model)).toBe(tokensByModel.get(model));
      });
    });
  });

  describe('VC3: Clause Evaluation on Sample File', () => {
    it('should evaluate AST clause on UserService.ts', async () => {
      const sourceCode = fs.readFileSync(sampleFile, 'utf-8');
      const clause: ConstitutionClause = {
        id: 'vc3-ast-1',
        type: 'ast',
        condition: 'ClassDeclaration[name="UserService"]',
        action: 'allow',
        severity: 'info',
        message: 'UserService class structure validation',
        metadata: {},
      };

      const astEvaluator = new ASTEvaluator();
      const startTime = Date.now();
      const result = await astEvaluator.evaluate(clause, {
        sourceCode,
        filePath: sampleFile,
      });
      const duration = Date.now() - startTime;

      expect(result.passed).toBe(true);
      expect(result.clauseId).toBe(clause.id);
      expect(result.evaluatorType).toBe('ast');
      expect(duration).toBeLessThan(5000); // <5s performance requirement
    });

    it('should evaluate metric clause (cyclomatic complexity)', async () => {
      const sourceCode = fs.readFileSync(sampleFile, 'utf-8');
      const clause: ConstitutionClause = {
        id: 'vc3-metric-1',
        type: 'metric',
        condition: 'cyclomatic_complexity <= 10',
        action: 'warn',
        severity: 'warning',
        message: 'Cyclomatic complexity check',
        metadata: { threshold: 10 },
      };

      const metricEvaluator = new MetricEvaluator();
      const startTime = Date.now();
      const result = await metricEvaluator.evaluate(clause, {
        sourceCode,
        filePath: sampleFile,
      });
      const duration = Date.now() - startTime;

      expect(result.evaluatorType).toBe('metric');
      expect(result.metadata?.complexity).toBeDefined();
      expect(typeof result.metadata?.complexity).toBe('number');
      expect(duration).toBeLessThan(5000);
    });

    it('should evaluate pattern clause (method detection)', async () => {
      const sourceCode = fs.readFileSync(sampleFile, 'utf-8');
      const clause: ConstitutionClause = {
        id: 'vc3-pattern-1',
        type: 'pattern',
        condition: '/async\\s+\\w+\\s*\\([^)]*\\)\\s*:\\s*Promise/',
        action: 'allow',
        severity: 'info',
        message: 'Async method detection',
        metadata: { minMatches: 3 },
      };

      const patternEvaluator = new PatternEvaluator();
      const startTime = Date.now();
      const result = await patternEvaluator.evaluate(clause, {
        sourceCode,
        filePath: sampleFile,
      });
      const duration = Date.now() - startTime;

      expect(result.passed).toBe(true);
      expect(result.evaluatorType).toBe('pattern');
      expect(result.metadata?.matchCount).toBeGreaterThanOrEqual(3);
      expect(duration).toBeLessThan(5000);
    });

    it('should evaluate multiple clauses in sequence', async () => {
      const sourceCode = fs.readFileSync(sampleFile, 'utf-8');
      const clauses: ConstitutionClause[] = [
        {
          id: 'vc3-multi-1',
          type: 'ast',
          condition: 'ClassDeclaration',
          action: 'allow',
          severity: 'info',
          message: 'Class check',
          metadata: {},
        },
        {
          id: 'vc3-multi-2',
          type: 'metric',
          condition: 'lines_of_code <= 100',
          action: 'allow',
          severity: 'info',
          message: 'Size check',
          metadata: {},
        },
        {
          id: 'vc3-multi-3',
          type: 'pattern',
          condition: '/export/',
          action: 'allow',
          severity: 'info',
          message: 'Export check',
          metadata: {},
        },
      ];

      const evaluators = {
        ast: new ASTEvaluator(),
        metric: new MetricEvaluator(),
        pattern: new PatternEvaluator(),
      };

      const startTime = Date.now();
      const results = [];

      for (const clause of clauses) {
        const evaluator = evaluators[clause.type as keyof typeof evaluators];
        const result = await evaluator.evaluate(clause, {
          sourceCode,
          filePath: sampleFile,
        });
        results.push(result);
      }

      const duration = Date.now() - startTime;

      expect(results.length).toBe(3);
      expect(results.every(r => r.clauseId)).toBe(true);
      expect(duration).toBeLessThan(5000); // All evaluations <5s
    });
  });

  describe('VC4: Multi-Agent Voting Aggregation', () => {
    let orchestrator: VotingOrchestrator;
    let consensusCalculator: ConsensusCalculator;

    beforeEach(() => {
      orchestrator = new VotingOrchestrator();
      consensusCalculator = new ConsensusCalculator();
    });

    it('should aggregate votes from 3+ agents with majority consensus', () => {
      const votes: Vote[] = [
        {
          agentId: 'test-gen-1',
          taskId: 'vc4-task-1',
          score: 0.9,
          confidence: 0.95,
          reasoning: 'High quality implementation',
          timestamp: new Date(),
        },
        {
          agentId: 'coverage-1',
          taskId: 'vc4-task-1',
          score: 0.85,
          confidence: 0.9,
          reasoning: 'Good coverage',
          timestamp: new Date(),
        },
        {
          agentId: 'quality-1',
          taskId: 'vc4-task-1',
          score: 0.8,
          confidence: 0.85,
          reasoning: 'Meets standards',
          timestamp: new Date(),
        },
      ];

      const config: VotingPanelConfig = {
        minPanelSize: 3,
        maxPanelSize: 5,
        consensusMethod: 'majority',
        quorumThreshold: 0.6,
        timeoutMs: 5000,
        maxRetries: 2,
        retryDelayMs: 100,
        parallelExecution: true,
      };

      const result = orchestrator.aggregateResults(votes, config.consensusMethod);

      expect(result.consensusReached).toBe(true);
      expect(result.votes.length).toBe(3);
      expect(result.finalScore).toBeGreaterThan(0.7);
      expect(result.participationRate).toBe(1.0);
      expect(result.metadata.totalAgents).toBe(3);
      expect(result.metadata.votingAgents).toBe(3);
      expect(result.metadata.averageConfidence).toBeGreaterThan(0.85);
    });

    it('should aggregate with weighted consensus', () => {
      const votes: Vote[] = [
        {
          agentId: 'expert-1',
          taskId: 'vc4-task-2',
          score: 0.95,
          confidence: 0.98,
          reasoning: 'Expert approval',
          timestamp: new Date(),
          metadata: { weight: 2.0 },
        },
        {
          agentId: 'agent-2',
          taskId: 'vc4-task-2',
          score: 0.6,
          confidence: 0.7,
          reasoning: 'Moderate quality',
          timestamp: new Date(),
          metadata: { weight: 1.0 },
        },
        {
          agentId: 'agent-3',
          taskId: 'vc4-task-2',
          score: 0.5,
          confidence: 0.6,
          reasoning: 'Acceptable',
          timestamp: new Date(),
          metadata: { weight: 1.0 },
        },
      ];

      const config: VotingPanelConfig = {
        minPanelSize: 3,
        maxPanelSize: 5,
        consensusMethod: 'weighted-average',
        timeoutMs: 5000,
        maxRetries: 2,
        retryDelayMs: 100,
        parallelExecution: true,
      };

      const result = orchestrator.aggregateResults(votes, config.consensusMethod);

      expect(result.consensusReached).toBe(true);
      // Expert vote should dominate
      expect(result.finalScore).toBeGreaterThan(0.7);
      expect(result.aggregationMethod).toBe('weighted-average');
    });

    it('should handle partial participation (timeout scenario)', () => {
      const votes: Vote[] = [
        {
          agentId: 'agent-1',
          taskId: 'vc4-task-3',
          score: 0.8,
          confidence: 0.9,
          reasoning: 'Vote',
          timestamp: new Date(),
        },
        {
          agentId: 'agent-2',
          taskId: 'vc4-task-3',
          score: 0.75,
          confidence: 0.85,
          reasoning: 'Vote',
          timestamp: new Date(),
        },
        // agent-3 timed out
      ];

      const config: VotingPanelConfig = {
        minPanelSize: 3,
        maxPanelSize: 3,
        consensusMethod: 'majority',
        quorumThreshold: 0.6,
        timeoutMs: 5000,
        maxRetries: 2,
        retryDelayMs: 100,
        parallelExecution: true,
      };

      const result = orchestrator.aggregateResults(votes, config.consensusMethod);

      expect(result.votes.length).toBe(2);
      expect(result.participationRate).toBeLessThan(1.0);
      expect(result.metadata.timedOut).toBe(1);
      expect(result.metadata.votingAgents).toBe(2);
    });

    it('should complete voting aggregation quickly (<1s)', () => {
      const votes: Vote[] = Array.from({ length: 5 }, (_, i) => ({
        agentId: `agent-${i}`,
        taskId: 'vc4-perf-1',
        score: 0.7 + Math.random() * 0.2,
        confidence: 0.8 + Math.random() * 0.15,
        reasoning: `Vote ${i}`,
        timestamp: new Date(),
      }));

      const config: VotingPanelConfig = {
        minPanelSize: 5,
        maxPanelSize: 5,
        consensusMethod: 'majority',
        timeoutMs: 5000,
        maxRetries: 2,
        retryDelayMs: 100,
        parallelExecution: true,
      };

      const startTime = Date.now();
      const result = orchestrator.aggregateResults(votes, config.consensusMethod);
      const duration = Date.now() - startTime;

      expect(result.consensusReached).toBe(true);
      expect(duration).toBeLessThan(1000); // <1s for aggregation
    });
  });

  describe('Integration: End-to-End Validation', () => {
    it('should complete full Phase 2 workflow', async () => {
      // 1. Agent instrumentation
      const agentType = 'qe-test-generator';
      const { span: taskSpan } = taskSpanManager.startExecutionSpan({
        agentId: 'test-gen-001',
        agentType,
        taskId: 'e2e-task-1',
        taskType: 'test-generation',
        priority: 'high',
      });

      taskSpan.setAttribute('task.tokens_used', 300);
      taskSpan.setAttribute('task.cost_usd', 0.0018);
      taskSpan.end();

      // 2. Clause evaluation
      const sourceCode = fs.readFileSync(sampleFile, 'utf-8');
      const clause: ConstitutionClause = {
        id: 'e2e-clause-1',
        type: 'ast',
        condition: 'ClassDeclaration',
        action: 'allow',
        severity: 'info',
        message: 'Structure check',
        metadata: {},
      };

      const astEvaluator = new ASTEvaluator();
      const evalResult = await astEvaluator.evaluate(clause, {
        sourceCode,
        filePath: sampleFile,
      });

      // 3. Multi-agent voting
      const votes: Vote[] = [
        {
          agentId: 'test-gen-1',
          taskId: 'e2e-task-1',
          score: 0.9,
          confidence: 0.95,
          reasoning: 'Excellent',
          timestamp: new Date(),
        },
        {
          agentId: 'quality-1',
          taskId: 'e2e-task-1',
          score: 0.85,
          confidence: 0.9,
          reasoning: 'Good',
          timestamp: new Date(),
        },
        {
          agentId: 'coverage-1',
          taskId: 'e2e-task-1',
          score: 0.88,
          confidence: 0.92,
          reasoning: 'Very good',
          timestamp: new Date(),
        },
      ];

      const votingResult = orchestrator.aggregateResults(votes, 'majority');

      await tracerProvider.forceFlush();

      // Verify all components
      const spans = spanExporter.getFinishedSpans();
      expect(spans.length).toBeGreaterThan(0);
      expect(evalResult.passed).toBe(true);
      expect(votingResult.consensusReached).toBe(true);
      expect(votingResult.finalScore).toBeGreaterThan(0.8);
    });
  });
});
