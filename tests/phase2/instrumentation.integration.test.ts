/**
 * Agent Instrumentation Integration Tests
 *
 * Tests OpenTelemetry instrumentation for all 18 QE agents including:
 * - Agent lifecycle span creation (spawn, execute, complete, error)
 * - Token tracking for multiple agent types
 * - Distributed trace propagation across agent calls
 * - Semantic attributes attachment
 *
 * @version 1.0.0
 * @module tests/phase2/instrumentation
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { trace, context, SpanStatusCode, Span, Context } from '@opentelemetry/api';
import { AgentSpanManager, TaskSpanManager, initializeInstrumentation, cleanupInstrumentation } from '@/telemetry/instrumentation';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { Resource } from '@opentelemetry/resources';

describe('Agent Instrumentation Integration Tests', () => {
  let spanExporter: InMemorySpanExporter;
  let tracerProvider: NodeTracerProvider;
  let agentSpanManager: AgentSpanManager;
  let taskSpanManager: TaskSpanManager;

  beforeAll(() => {
    // Initialize test tracer provider
    spanExporter = new InMemorySpanExporter();
    tracerProvider = new NodeTracerProvider({
      resource: Resource.default().merge(
        new Resource({
          'service.name': 'agentic-qe-test',
          'service.version': '1.0.0',
        })
      ),
    });

    tracerProvider.addSpanProcessor(new SimpleSpanProcessor(spanExporter));
    tracerProvider.register();

    // Initialize instrumentation managers
    initializeInstrumentation();
    agentSpanManager = new AgentSpanManager();
    taskSpanManager = new TaskSpanManager();
  });

  beforeEach(() => {
    // Clear exported spans before each test
    spanExporter.reset();
  });

  afterEach(async () => {
    // Cleanup any active spans
    await agentSpanManager.cleanup();
    await taskSpanManager.cleanup();
  });

  afterAll(async () => {
    // Shutdown tracer provider
    await tracerProvider.shutdown();
    cleanupInstrumentation();
  });

  describe('Agent Lifecycle Span Creation', () => {
    it('should create spawn span with correct attributes', async () => {
      const config = {
        agentId: 'test-gen-001',
        agentType: 'qe-test-generator',
        agentName: 'Test Generator Agent',
        capabilities: ['unit-test', 'integration-test'],
        fleetId: 'fleet-001',
        topology: 'hierarchical' as const,
      };

      const { span, context: spanContext } = agentSpanManager.startSpawnSpan(config);
      expect(span).toBeDefined();
      expect(spanContext).toBeDefined();

      // Add spawn events
      span.addEvent('agent.spawn.started', { 'agent.id': config.agentId });
      span.addEvent('agent.spawn.completed', { 'agent.id': config.agentId });

      // End span
      span.end();

      // Wait for export
      await tracerProvider.forceFlush();

      // Verify exported span
      const exportedSpans = spanExporter.getFinishedSpans();
      expect(exportedSpans.length).toBe(1);

      const spawnSpan = exportedSpans[0];
      expect(spawnSpan.name).toBe('aqe.fleet.spawn_agent');
      expect(spawnSpan.attributes['agent.id']).toBe(config.agentId);
      expect(spawnSpan.attributes['agent.type']).toBe(config.agentType);
      expect(spawnSpan.attributes['agent.name']).toBe(config.agentName);
      expect(spawnSpan.attributes['fleet.id']).toBe(config.fleetId);
      expect(spawnSpan.attributes['fleet.topology']).toBe(config.topology);
      expect(spawnSpan.events.length).toBe(2);
    });

    it('should create execute span with task attributes', async () => {
      const taskConfig = {
        agentId: 'test-gen-001',
        agentType: 'qe-test-generator',
        taskId: 'task-001',
        taskType: 'unit-test',
        priority: 'high' as const,
      };

      const { span, context: spanContext } = taskSpanManager.startExecutionSpan(taskConfig);
      expect(span).toBeDefined();
      expect(spanContext).toBeDefined();

      // Simulate task execution
      span.setAttribute('task.status', 'running');
      span.addEvent('agent.task.started', {
        'task.id': taskConfig.taskId,
        'agent.id': taskConfig.agentId,
      });

      // Simulate completion
      span.setAttribute('task.status', 'completed');
      span.setAttribute('task.execution_time_ms', 1500);
      span.setAttribute('task.tokens_used', 250);
      span.setAttribute('task.cost_usd', 0.0015);
      span.addEvent('agent.task.completed', {
        'task.id': taskConfig.taskId,
        'agent.id': taskConfig.agentId,
      });

      span.setStatus({ code: SpanStatusCode.OK });
      span.end();

      await tracerProvider.forceFlush();

      const exportedSpans = spanExporter.getFinishedSpans();
      const executeSpan = exportedSpans[0];

      expect(executeSpan.name).toBe('aqe.agent.execute_task');
      expect(executeSpan.attributes['agent.id']).toBe(taskConfig.agentId);
      expect(executeSpan.attributes['task.id']).toBe(taskConfig.taskId);
      expect(executeSpan.attributes['task.type']).toBe(taskConfig.taskType);
      expect(executeSpan.attributes['task.priority']).toBe(taskConfig.priority);
      expect(executeSpan.attributes['task.execution_time_ms']).toBe(1500);
      expect(executeSpan.attributes['task.tokens_used']).toBe(250);
      expect(executeSpan.attributes['task.cost_usd']).toBe(0.0015);
      expect(executeSpan.status.code).toBe(SpanStatusCode.OK);
    });

    it('should handle agent errors with proper span status', async () => {
      const taskConfig = {
        agentId: 'test-gen-002',
        agentType: 'qe-test-generator',
        taskId: 'task-002',
        taskType: 'unit-test',
        priority: 'medium' as const,
      };

      const { span } = taskSpanManager.startExecutionSpan(taskConfig);

      // Simulate error
      const error = new Error('Test generation failed: Invalid input');
      span.addEvent('agent.task.failed', {
        'task.id': taskConfig.taskId,
        'agent.id': taskConfig.agentId,
        'error.message': error.message,
      });

      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      span.end();

      await tracerProvider.forceFlush();

      const exportedSpans = spanExporter.getFinishedSpans();
      const errorSpan = exportedSpans[0];

      expect(errorSpan.status.code).toBe(SpanStatusCode.ERROR);
      expect(errorSpan.status.message).toBe(error.message);
      expect(errorSpan.events.some(e => e.name === 'exception')).toBe(true);
    });

    it('should track agent status changes', async () => {
      const agentId = 'coverage-001';
      const tracer = trace.getTracer('test-tracer');

      const statusSpan = tracer.startSpan('agent.lifecycle');

      // Simulate status changes
      const statuses = ['initializing', 'ready', 'busy', 'idle', 'shutdown'];
      for (let i = 0; i < statuses.length; i++) {
        const oldStatus = i > 0 ? statuses[i - 1] : 'unknown';
        const newStatus = statuses[i];

        statusSpan.addEvent('agent.status.changed', {
          'agent.id': agentId,
          'agent.status.old': oldStatus,
          'agent.status.new': newStatus,
        });
      }

      statusSpan.end();
      await tracerProvider.forceFlush();

      const exportedSpans = spanExporter.getFinishedSpans();
      const span = exportedSpans[0];

      expect(span.events.length).toBe(5);
      expect(span.events.every(e => e.name === 'agent.status.changed')).toBe(true);
    });
  });

  describe('Token Tracking for Multiple Agent Types', () => {
    const agentTypes = [
      'qe-test-generator',
      'qe-coverage-analyzer',
      'qe-quality-gate',
      'qe-performance-tester',
      'qe-security-scanner',
    ];

    it('should track tokens across multiple agents', async () => {
      const tasks = agentTypes.map((type, i) => ({
        agentId: `${type}-001`,
        agentType: type,
        taskId: `task-${i}`,
        taskType: 'analysis',
        priority: 'medium' as const,
        tokensUsed: 100 + i * 50,
        costUsd: (100 + i * 50) * 0.000006,
      }));

      const spans: Span[] = [];

      // Execute tasks in parallel
      for (const task of tasks) {
        const { span } = taskSpanManager.startExecutionSpan({
          agentId: task.agentId,
          agentType: task.agentType,
          taskId: task.taskId,
          taskType: task.taskType,
          priority: task.priority,
        });

        span.setAttribute('task.tokens_used', task.tokensUsed);
        span.setAttribute('task.cost_usd', task.costUsd);
        span.setAttribute('task.status', 'completed');
        span.setStatus({ code: SpanStatusCode.OK });
        spans.push(span);
      }

      // End all spans
      spans.forEach(s => s.end());
      await tracerProvider.forceFlush();

      const exportedSpans = spanExporter.getFinishedSpans();
      expect(exportedSpans.length).toBe(agentTypes.length);

      // Verify token tracking per agent
      const totalTokens = exportedSpans.reduce(
        (sum, span) => sum + (span.attributes['task.tokens_used'] as number || 0),
        0
      );

      const expectedTotalTokens = tasks.reduce((sum, t) => sum + t.tokensUsed, 0);
      expect(totalTokens).toBe(expectedTotalTokens);

      // Verify per-agent breakdown
      exportedSpans.forEach((span, i) => {
        expect(span.attributes['agent.type']).toBe(agentTypes[i]);
        expect(span.attributes['task.tokens_used']).toBe(tasks[i].tokensUsed);
        expect(span.attributes['task.cost_usd']).toBe(tasks[i].costUsd);
      });
    });

    it('should aggregate token usage by agent type', async () => {
      const tokensByType = new Map<string, number>();

      // Run multiple tasks per agent type
      for (const agentType of agentTypes) {
        const tasksPerType = 3;
        let typeTokens = 0;

        for (let i = 0; i < tasksPerType; i++) {
          const tokensUsed = Math.floor(Math.random() * 200) + 50;
          typeTokens += tokensUsed;

          const { span } = taskSpanManager.startExecutionSpan({
            agentId: `${agentType}-${i}`,
            agentType: agentType,
            taskId: `task-${agentType}-${i}`,
            taskType: 'test',
            priority: 'medium',
          });

          span.setAttribute('task.tokens_used', tokensUsed);
          span.end();
        }

        tokensByType.set(agentType, typeTokens);
      }

      await tracerProvider.forceFlush();

      const exportedSpans = spanExporter.getFinishedSpans();
      expect(exportedSpans.length).toBe(agentTypes.length * 3);

      // Verify aggregation
      const aggregated = new Map<string, number>();
      exportedSpans.forEach(span => {
        const type = span.attributes['agent.type'] as string;
        const tokens = span.attributes['task.tokens_used'] as number;
        aggregated.set(type, (aggregated.get(type) || 0) + tokens);
      });

      expect(aggregated.size).toBe(agentTypes.length);
      aggregated.forEach((tokens, type) => {
        expect(tokens).toBe(tokensByType.get(type));
      });
    });
  });

  describe('Distributed Trace Propagation', () => {
    it('should propagate context across agent calls', async () => {
      // Parent orchestration span
      const tracer = trace.getTracer('test-tracer');
      const parentSpan = tracer.startSpan('fleet.orchestrate');
      const parentContext = trace.setSpan(context.active(), parentSpan);

      // Spawn child agent with parent context
      const spawnConfig = {
        agentId: 'test-gen-001',
        agentType: 'qe-test-generator',
        agentName: 'Test Generator',
        capabilities: ['unit-test'],
      };

      const { span: spawnSpan, context: spawnContext } = agentSpanManager.startSpawnSpan(
        spawnConfig,
        parentContext
      );

      // Execute task within spawned agent context
      const { span: taskSpan } = taskSpanManager.startExecutionSpan(
        {
          agentId: spawnConfig.agentId,
          agentType: spawnConfig.agentType,
          taskId: 'task-001',
          taskType: 'unit-test',
          priority: 'high',
        },
        spawnContext
      );

      // End spans in reverse order
      taskSpan.end();
      spawnSpan.end();
      parentSpan.end();

      await tracerProvider.forceFlush();

      // Verify parent-child relationships
      const exportedSpans = spanExporter.getFinishedSpans();
      expect(exportedSpans.length).toBe(3);

      const [taskExported, spawnExported, parentExported] = exportedSpans;

      // Verify trace ID is same across all spans
      expect(taskExported.spanContext().traceId).toBe(spawnExported.spanContext().traceId);
      expect(spawnExported.spanContext().traceId).toBe(parentExported.spanContext().traceId);

      // Verify parent-child relationships
      expect(taskExported.parentSpanId).toBe(spawnExported.spanContext().spanId);
      expect(spawnExported.parentSpanId).toBe(parentExported.spanContext().spanId);
    });

    it('should maintain context in multi-agent coordination', async () => {
      const tracer = trace.getTracer('test-tracer');
      const orchestrationSpan = tracer.startSpan('fleet.coordinate');
      const orchestrationContext = trace.setSpan(context.active(), orchestrationSpan);

      const agents = ['test-gen', 'coverage', 'quality-gate'];
      const agentSpans: Span[] = [];

      // Spawn multiple agents under same orchestration
      for (const agentType of agents) {
        const { span } = agentSpanManager.startSpawnSpan(
          {
            agentId: `${agentType}-001`,
            agentType: `qe-${agentType}`,
            agentName: agentType,
            capabilities: [],
          },
          orchestrationContext
        );
        agentSpans.push(span);
      }

      // End all spans
      agentSpans.forEach(s => s.end());
      orchestrationSpan.end();

      await tracerProvider.forceFlush();

      const exportedSpans = spanExporter.getFinishedSpans();
      const [orch, ...agentExports] = exportedSpans.reverse();

      // All agent spans should share same trace ID
      const traceId = orch.spanContext().traceId;
      agentExports.forEach(span => {
        expect(span.spanContext().traceId).toBe(traceId);
        expect(span.parentSpanId).toBe(orch.spanContext().spanId);
      });
    });

    it('should support nested agent operations', async () => {
      const tracer = trace.getTracer('test-tracer');

      // Level 1: Orchestration
      const l1Span = tracer.startSpan('orchestration');
      const l1Context = trace.setSpan(context.active(), l1Span);

      // Level 2: Agent spawn
      const { span: l2Span, context: l2Context } = agentSpanManager.startSpawnSpan(
        { agentId: 'agent-1', agentType: 'test-gen', agentName: 'Gen', capabilities: [] },
        l1Context
      );

      // Level 3: Task execution
      const { span: l3Span, context: l3Context } = taskSpanManager.startExecutionSpan(
        { agentId: 'agent-1', agentType: 'test-gen', taskId: 'task-1', taskType: 'test', priority: 'high' },
        l2Context
      );

      // Level 4: Specialized operation
      const l4Span = tracer.startSpan('generate_tests', undefined, l3Context);
      l4Span.setAttribute('qe.test_framework', 'jest');
      l4Span.setAttribute('task.tests_generated', 10);

      // End spans
      l4Span.end();
      l3Span.end();
      l2Span.end();
      l1Span.end();

      await tracerProvider.forceFlush();

      const exportedSpans = spanExporter.getFinishedSpans();
      expect(exportedSpans.length).toBe(4);

      // Verify nesting
      const [l4, l3, l2, l1] = exportedSpans;
      expect(l4.parentSpanId).toBe(l3.spanContext().spanId);
      expect(l3.parentSpanId).toBe(l2.spanContext().spanId);
      expect(l2.parentSpanId).toBe(l1.spanContext().spanId);
    });
  });

  describe('Semantic Attributes Attachment', () => {
    it('should attach test generation attributes', async () => {
      const { span } = taskSpanManager.startExecutionSpan({
        agentId: 'test-gen-001',
        agentType: 'qe-test-generator',
        taskId: 'gen-task-001',
        taskType: 'test-generation',
        priority: 'high',
      });

      // Add specialized test generation attributes
      span.setAttribute('qe.test_framework', 'jest');
      span.setAttribute('qe.coverage_type', 'line');
      span.setAttribute('task.tests_generated', 15);

      span.end();
      await tracerProvider.forceFlush();

      const [exported] = spanExporter.getFinishedSpans();
      expect(exported.attributes['qe.test_framework']).toBe('jest');
      expect(exported.attributes['qe.coverage_type']).toBe('line');
      expect(exported.attributes['task.tests_generated']).toBe(15);
    });

    it('should attach coverage analysis attributes', async () => {
      const { span } = taskSpanManager.startExecutionSpan({
        agentId: 'coverage-001',
        agentType: 'qe-coverage-analyzer',
        taskId: 'cov-task-001',
        taskType: 'coverage-analysis',
        priority: 'medium',
      });

      span.setAttribute('qe.coverage_type', 'branch');
      span.setAttribute('qe.coverage_percent', 87.5);
      span.setAttribute('task.gaps_detected', 3);

      span.end();
      await tracerProvider.forceFlush();

      const [exported] = spanExporter.getFinishedSpans();
      expect(exported.attributes['qe.coverage_percent']).toBe(87.5);
      expect(exported.attributes['task.gaps_detected']).toBe(3);
    });

    it('should attach security scan attributes', async () => {
      const { span } = taskSpanManager.startExecutionSpan({
        agentId: 'security-001',
        agentType: 'qe-security-scanner',
        taskId: 'sec-task-001',
        taskType: 'security-scan',
        priority: 'critical',
      });

      span.setAttribute('qe.security_severity', 'high');
      span.setAttribute('task.vulnerabilities_found', 2);

      span.end();
      await tracerProvider.forceFlush();

      const [exported] = spanExporter.getFinishedSpans();
      expect(exported.attributes['qe.security_severity']).toBe('high');
      expect(exported.attributes['task.vulnerabilities_found']).toBe(2);
    });

    it('should attach performance test attributes', async () => {
      const { span } = taskSpanManager.startExecutionSpan({
        agentId: 'perf-001',
        agentType: 'qe-performance-tester',
        taskId: 'perf-task-001',
        taskType: 'performance-test',
        priority: 'high',
      });

      span.setAttribute('qe.load_pattern', 'ramp-up');
      span.setAttribute('task.p95_latency_ms', 250);
      span.setAttribute('task.throughput_rps', 1500);

      span.end();
      await tracerProvider.forceFlush();

      const [exported] = spanExporter.getFinishedSpans();
      expect(exported.attributes['qe.load_pattern']).toBe('ramp-up');
      expect(exported.attributes['task.p95_latency_ms']).toBe(250);
      expect(exported.attributes['task.throughput_rps']).toBe(1500);
    });
  });

  describe('Performance Requirements', () => {
    it('should create spans with minimal overhead (<1ms)', () => {
      const iterations = 100;
      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        const { span } = taskSpanManager.startExecutionSpan({
          agentId: `agent-${i}`,
          agentType: 'qe-test-generator',
          taskId: `task-${i}`,
          taskType: 'test',
          priority: 'medium',
        });
        span.end();
      }

      const duration = Date.now() - start;
      const avgOverhead = duration / iterations;

      expect(avgOverhead).toBeLessThan(1); // <1ms per span creation
    });

    it('should handle high-volume span creation', async () => {
      const spanCount = 1000;
      const start = Date.now();

      for (let i = 0; i < spanCount; i++) {
        const { span } = agentSpanManager.startSpawnSpan({
          agentId: `agent-${i}`,
          agentType: 'qe-test-generator',
          agentName: `Agent ${i}`,
          capabilities: [],
        });
        span.end();
      }

      await tracerProvider.forceFlush();
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(5000); // <5s for 1000 spans
      expect(spanExporter.getFinishedSpans().length).toBe(spanCount);
    });
  });
});
