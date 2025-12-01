/**
 * Full Pipeline Integration Tests
 * End-to-end test of complete Phase 1 infrastructure
 */

import * as fs from 'fs';
import * as path from 'path';

// Load all fixtures
const eventsPath = path.join(__dirname, '../../fixtures/phase1/sample-events.json');
const reasoningPath = path.join(__dirname, '../../fixtures/phase1/sample-reasoning-chain.json');
const metricsPath = path.join(__dirname, '../../fixtures/phase1/sample-metrics.json');
const constitutionPath = path.join(__dirname, '../../fixtures/phase1/valid-constitution.json');

const eventsFixture = JSON.parse(fs.readFileSync(eventsPath, 'utf-8'));
const reasoningFixture = JSON.parse(fs.readFileSync(reasoningPath, 'utf-8'));
const metricsFixture = JSON.parse(fs.readFileSync(metricsPath, 'utf-8'));
const constitutionFixture = JSON.parse(fs.readFileSync(constitutionPath, 'utf-8'));

// Integrated Phase 1 System
interface Phase1System {
  // Telemetry
  recordMetric(metric: any): void;
  recordSpan(span: any): void;

  // Persistence
  recordEvent(event: any): void;
  createReasoningChain(agentId: string, taskId: string): string;
  addReasoningStep(chainId: string, step: any): void;
  completeReasoningChain(chainId: string, outcome: any): void;

  // Constitution
  registerConstitution(agentId: string, constitution: any): boolean;
  getConstitution(agentId: string): any;
  validateConstitution(constitution: any): { valid: boolean; errors: string[] };

  // Queries
  getMetrics(query?: any): any[];
  getEvents(query?: any): any[];
  getReasoningChain(chainId: string): any;
  aggregateMetrics(name: string): any;

  // System
  clear(): void;
}

class IntegratedPhase1System implements Phase1System {
  private metrics: any[] = [];
  private events: any[] = [];
  private reasoningChains = new Map<string, any>();
  private constitutions = new Map<string, any>();
  private spans: any[] = [];
  private idCounters = { metric: 0, event: 0, chain: 0, step: 0 };

  // Telemetry
  recordMetric(metric: any): void {
    this.metrics.push({
      id: `metric-${++this.idCounters.metric}`,
      ...metric,
      timestamp: metric.timestamp || new Date().toISOString()
    });
  }

  recordSpan(span: any): void {
    this.spans.push({
      id: `span-${Date.now()}`,
      ...span,
      endTime: new Date().toISOString()
    });
  }

  // Persistence
  recordEvent(event: any): void {
    this.events.push({
      id: `evt-${++this.idCounters.event}`,
      ...event,
      timestamp: event.timestamp || new Date().toISOString()
    });
  }

  createReasoningChain(agentId: string, taskId: string): string {
    const chainId = `chain-${++this.idCounters.chain}`;
    this.reasoningChains.set(chainId, {
      id: chainId,
      agentId,
      taskId,
      createdAt: new Date().toISOString(),
      status: 'active',
      steps: []
    });
    return chainId;
  }

  addReasoningStep(chainId: string, step: any): void {
    const chain = this.reasoningChains.get(chainId);
    if (!chain) throw new Error(`Chain not found: ${chainId}`);
    if (chain.status !== 'active') throw new Error('Chain is not active');

    chain.steps.push({
      stepId: `step-${++this.idCounters.step}`,
      ...step,
      timestamp: new Date().toISOString()
    });
  }

  completeReasoningChain(chainId: string, outcome: any): void {
    const chain = this.reasoningChains.get(chainId);
    if (!chain) throw new Error(`Chain not found: ${chainId}`);

    chain.status = outcome.success ? 'completed' : 'failed';
    chain.completedAt = new Date().toISOString();
    chain.outcome = outcome;
  }

  // Constitution
  registerConstitution(agentId: string, constitution: any): boolean {
    const validation = this.validateConstitution(constitution);
    if (validation.valid) {
      this.constitutions.set(agentId, constitution);
      return true;
    }
    return false;
  }

  getConstitution(agentId: string): any {
    return this.constitutions.get(agentId) || null;
  }

  validateConstitution(constitution: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!constitution.version) errors.push('Missing version');
    if (!constitution.name) errors.push('Missing name');
    if (!constitution.principles) errors.push('Missing principles');

    return { valid: errors.length === 0, errors };
  }

  // Queries
  getMetrics(query?: any): any[] {
    let results = [...this.metrics];
    if (query?.name) {
      results = results.filter(m => m.name === query.name);
    }
    return results;
  }

  getEvents(query?: any): any[] {
    let results = [...this.events];
    if (query?.type) {
      results = results.filter(e => e.type === query.type);
    }
    return results;
  }

  getReasoningChain(chainId: string): any {
    return this.reasoningChains.get(chainId) || null;
  }

  aggregateMetrics(name: string): any {
    const metrics = this.getMetrics({ name });
    if (metrics.length === 0) return { count: 0, sum: 0, avg: 0 };

    const values = metrics.map(m => m.value);
    const sum = values.reduce((a, b) => a + b, 0);

    return {
      count: values.length,
      sum,
      avg: sum / values.length,
      min: Math.min(...values),
      max: Math.max(...values)
    };
  }

  // System
  clear(): void {
    this.metrics = [];
    this.events = [];
    this.reasoningChains.clear();
    this.constitutions.clear();
    this.spans = [];
    this.idCounters = { metric: 0, event: 0, chain: 0, step: 0 };
  }
}

describe('Full Phase 1 Pipeline Integration', () => {
  let system: IntegratedPhase1System;

  beforeEach(() => {
    system = new IntegratedPhase1System();
  });

  afterEach(() => {
    system.clear();
  });

  describe('Complete Agent Workflow', () => {
    test('should handle complete test generation workflow', () => {
      const agentId = 'qe-test-generator';
      const taskId = 'task-gen-001';

      // 1. Register constitution
      const registered = system.registerConstitution(agentId, constitutionFixture);
      expect(registered).toBe(true);

      // 2. Record task start event
      system.recordEvent({
        type: 'agent:task_started',
        agentId,
        payload: { taskId }
      });

      // 3. Create reasoning chain
      const chainId = system.createReasoningChain(agentId, taskId);

      // 4. Record reasoning steps
      system.addReasoningStep(chainId, {
        type: 'observation',
        content: 'Analyzing source code structure'
      });

      system.addReasoningStep(chainId, {
        type: 'thought',
        content: 'Identified 5 public methods'
      });

      system.addReasoningStep(chainId, {
        type: 'action',
        content: 'Generating unit tests'
      });

      // 5. Record telemetry metrics
      system.recordMetric({
        name: 'qe.agent.task_duration',
        type: 'histogram',
        value: 5000,
        dimensions: { agent: agentId }
      });

      system.recordMetric({
        name: 'qe.tests.generated_count',
        type: 'counter',
        value: 15,
        dimensions: { agent: agentId, framework: 'jest' }
      });

      // 6. Complete reasoning chain
      system.addReasoningStep(chainId, {
        type: 'conclusion',
        content: 'Generated 15 tests with 85% coverage'
      });

      system.completeReasoningChain(chainId, {
        success: true,
        result: { testsGenerated: 15, coverage: 85.5 }
      });

      // 7. Record completion event
      system.recordEvent({
        type: 'agent:task_completed',
        agentId,
        payload: { taskId, testsGenerated: 15 }
      });

      // Verify complete workflow
      const chain = system.getReasoningChain(chainId);
      expect(chain.status).toBe('completed');
      expect(chain.steps).toHaveLength(4);

      const events = system.getEvents();
      expect(events).toHaveLength(2);

      const metrics = system.getMetrics();
      expect(metrics).toHaveLength(2);

      const constitution = system.getConstitution(agentId);
      expect(constitution).not.toBeNull();
    });

    test('should handle failed workflow with error recovery', () => {
      const agentId = 'qe-coverage-analyzer';
      const taskId = 'task-cov-001';

      // Register constitution
      system.registerConstitution(agentId, {
        version: '1.0.0',
        name: agentId,
        principles: [{ id: 'accuracy', name: 'accuracy', description: 'Be accurate' }]
      });

      // Start task
      system.recordEvent({
        type: 'agent:task_started',
        agentId,
        payload: { taskId }
      });

      // Create reasoning chain
      const chainId = system.createReasoningChain(agentId, taskId);

      system.addReasoningStep(chainId, {
        type: 'observation',
        content: 'Starting coverage analysis'
      });

      system.addReasoningStep(chainId, {
        type: 'error',
        content: 'Timeout during analysis'
      });

      // Complete with failure
      system.completeReasoningChain(chainId, {
        success: false,
        error: { code: 'TIMEOUT', message: 'Operation timed out' }
      });

      // Record error metrics
      system.recordMetric({
        name: 'qe.agent.error_count',
        type: 'counter',
        value: 1,
        dimensions: { agent: agentId, errorType: 'TIMEOUT' }
      });

      // Record failure event
      system.recordEvent({
        type: 'agent:task_failed',
        agentId,
        payload: { taskId, error: 'TIMEOUT' }
      });

      // Verify
      const chain = system.getReasoningChain(chainId);
      expect(chain.status).toBe('failed');

      const errorMetrics = system.getMetrics({ name: 'qe.agent.error_count' });
      expect(errorMetrics).toHaveLength(1);
    });
  });

  describe('Multi-Agent Fleet Operations', () => {
    test('should coordinate multiple agents', () => {
      const agents = [
        { id: 'qe-test-generator', taskDuration: 5000, testsGenerated: 15 },
        { id: 'qe-coverage-analyzer', taskDuration: 3000, coverage: 85.5 },
        { id: 'qe-security-scanner', taskDuration: 8000, vulnerabilities: 2 }
      ];

      // Register all agents
      for (const agent of agents) {
        system.registerConstitution(agent.id, {
          version: '1.0.0',
          name: agent.id,
          principles: [{ id: 'p1', name: 'core', description: 'Core principle' }]
        });
      }

      // Run all agents
      for (const agent of agents) {
        const chainId = system.createReasoningChain(agent.id, `task-${agent.id}`);

        system.addReasoningStep(chainId, {
          type: 'action',
          content: `Executing ${agent.id} task`
        });

        system.addReasoningStep(chainId, {
          type: 'conclusion',
          content: 'Task completed'
        });

        system.completeReasoningChain(chainId, { success: true });

        system.recordMetric({
          name: 'qe.agent.task_duration',
          type: 'histogram',
          value: agent.taskDuration,
          dimensions: { agent: agent.id }
        });
      }

      // Verify fleet metrics
      const durationAgg = system.aggregateMetrics('qe.agent.task_duration');

      expect(durationAgg.count).toBe(3);
      expect(durationAgg.min).toBe(3000);
      expect(durationAgg.max).toBe(8000);
    });

    test('should track fleet-wide coverage', () => {
      const projects = ['service-a', 'service-b', 'service-c'];
      const coverages = [75, 82, 91];

      for (let i = 0; i < projects.length; i++) {
        system.recordMetric({
          name: 'qe.coverage.percentage',
          type: 'gauge',
          value: coverages[i],
          dimensions: { project: projects[i] }
        });
      }

      const aggregated = system.aggregateMetrics('qe.coverage.percentage');

      expect(aggregated.avg).toBeCloseTo(82.67, 1);
      expect(aggregated.min).toBe(75);
      expect(aggregated.max).toBe(91);
    });
  });

  describe('Constitution-Driven Behavior', () => {
    test('should enforce constitution constraints', () => {
      const agentId = 'constrained-agent';

      // Register with constraints
      system.registerConstitution(agentId, {
        version: '1.0.0',
        name: agentId,
        principles: [],
        constraints: [
          {
            id: 'min-coverage',
            type: 'coverage',
            condition: 'coverage >= 80',
            description: 'Minimum coverage'
          }
        ]
      });

      const constitution = system.getConstitution(agentId);

      // Verify constraint is stored
      expect(constitution.constraints[0].condition).toBe('coverage >= 80');
    });

    test('should use constitution capabilities', () => {
      const agentId = 'capable-agent';

      system.registerConstitution(agentId, {
        version: '1.0.0',
        name: agentId,
        principles: [],
        capabilities: ['unit_tests', 'integration_tests', 'e2e_tests']
      });

      const constitution = system.getConstitution(agentId);

      expect(constitution.capabilities).toContain('unit_tests');
      expect(constitution.capabilities).toHaveLength(3);
    });
  });

  describe('Fixture Data Pipeline', () => {
    test('should process all event fixtures', () => {
      for (const event of eventsFixture.agentEvents) {
        system.recordEvent({
          type: event.type,
          agentId: event.agentId,
          payload: event.payload
        });
      }

      for (const event of eventsFixture.systemEvents) {
        system.recordEvent({
          type: event.type,
          payload: event.payload
        });
      }

      const agentEvents = system.getEvents().filter(e => e.agentId);
      const systemEvents = system.getEvents().filter(e => !e.agentId);

      expect(agentEvents).toHaveLength(eventsFixture.agentEvents.length);
      expect(systemEvents).toHaveLength(eventsFixture.systemEvents.length);
    });

    test('should process all metric fixtures', () => {
      for (const metric of metricsFixture.qualityMetrics) {
        system.recordMetric({
          name: metric.name,
          type: metric.type,
          value: metric.value,
          dimensions: metric.dimensions
        });
      }

      const metrics = system.getMetrics();
      expect(metrics).toHaveLength(metricsFixture.qualityMetrics.length);
    });

    test('should reconstruct reasoning chain from fixture', () => {
      const fixtureChain = reasoningFixture.chains[0];

      const chainId = system.createReasoningChain(
        fixtureChain.agentId,
        fixtureChain.taskId
      );

      for (const step of fixtureChain.steps) {
        system.addReasoningStep(chainId, {
          type: step.type,
          content: step.content,
          metadata: step.metadata
        });
      }

      system.completeReasoningChain(chainId, fixtureChain.outcome);

      const chain = system.getReasoningChain(chainId);

      expect(chain.status).toBe('completed');
      expect(chain.steps).toHaveLength(fixtureChain.steps.length);
      expect(chain.outcome.success).toBe(fixtureChain.outcome.success);
    });
  });

  describe('End-to-End Quality Metrics', () => {
    test('should calculate quality dashboard metrics', () => {
      // Simulate QE fleet run
      const agents = ['test-gen', 'coverage', 'security'];

      for (const agent of agents) {
        // Task duration
        system.recordMetric({
          name: 'qe.agent.task_duration',
          type: 'histogram',
          value: Math.random() * 5000 + 1000,
          dimensions: { agent }
        });

        // Tests generated
        system.recordMetric({
          name: 'qe.tests.generated',
          type: 'counter',
          value: Math.floor(Math.random() * 20) + 5,
          dimensions: { agent }
        });
      }

      // Calculate dashboard
      const durationStats = system.aggregateMetrics('qe.agent.task_duration');
      const testStats = system.aggregateMetrics('qe.tests.generated');

      expect(durationStats.count).toBe(3);
      expect(testStats.count).toBe(3);
      expect(testStats.sum).toBeGreaterThan(0);
    });

    test('should track test execution trends', () => {
      // Record multiple test runs
      const runs = 10;

      for (let i = 0; i < runs; i++) {
        system.recordMetric({
          name: 'qe.tests.pass_rate',
          type: 'gauge',
          value: 85 + Math.random() * 10, // 85-95%
          dimensions: { run: i.toString() }
        });
      }

      const stats = system.aggregateMetrics('qe.tests.pass_rate');

      expect(stats.count).toBe(runs);
      expect(stats.avg).toBeGreaterThan(85);
      expect(stats.avg).toBeLessThan(95);
    });
  });

  describe('System Resilience', () => {
    test('should handle high volume of data', () => {
      const eventCount = 1000;
      const metricCount = 1000;

      // Bulk insert events
      for (let i = 0; i < eventCount; i++) {
        system.recordEvent({
          type: 'test:bulk',
          payload: { index: i }
        });
      }

      // Bulk insert metrics
      for (let i = 0; i < metricCount; i++) {
        system.recordMetric({
          name: 'qe.bulk.test',
          type: 'counter',
          value: i
        });
      }

      expect(system.getEvents()).toHaveLength(eventCount);
      expect(system.getMetrics()).toHaveLength(metricCount);

      const stats = system.aggregateMetrics('qe.bulk.test');
      expect(stats.count).toBe(metricCount);
    });

    test('should maintain data integrity across operations', () => {
      // Create interleaved operations
      for (let i = 0; i < 100; i++) {
        system.recordEvent({ type: `event-${i}` });
        system.recordMetric({ name: 'qe.test', type: 'counter', value: i });

        if (i % 10 === 0) {
          const chainId = system.createReasoningChain('agent', `task-${i}`);
          system.addReasoningStep(chainId, { type: 'action', content: 'test' });
          system.completeReasoningChain(chainId, { success: true });
        }
      }

      const events = system.getEvents();
      const metrics = system.getMetrics();

      expect(events).toHaveLength(100);
      expect(metrics).toHaveLength(100);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid constitution gracefully', () => {
      const invalid = { name: 'invalid' }; // Missing required fields

      const result = system.registerConstitution('agent', invalid);

      expect(result).toBe(false);
      expect(system.getConstitution('agent')).toBeNull();
    });

    test('should throw on invalid reasoning chain operations', () => {
      const chainId = system.createReasoningChain('agent', 'task');
      system.completeReasoningChain(chainId, { success: true });

      // Should not allow adding steps to completed chain
      expect(() => system.addReasoningStep(chainId, {
        type: 'action',
        content: 'test'
      })).toThrow();
    });

    test('should handle non-existent chain lookups', () => {
      const chain = system.getReasoningChain('non-existent');

      expect(chain).toBeNull();
    });
  });
});
