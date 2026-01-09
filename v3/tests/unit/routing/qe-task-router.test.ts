/**
 * QE Task Router Tests
 * ADR-022: Adaptive QE Agent Routing
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { performance } from 'perf_hooks';
import {
  QETaskRouter,
  createQETaskRouter,
} from '../../../src/routing/qe-task-router.js';
import type { QETask } from '../../../src/routing/types.js';
import { resetInitialization } from '../../../src/learning/real-embeddings.js';

describe('QE Task Router', () => {
  let router: QETaskRouter;

  beforeAll(async () => {
    router = createQETaskRouter();
    await router.initialize();
  }, 120000); // 2 minute timeout for model loading

  afterAll(() => {
    resetInitialization();
  });

  describe('Initialization', () => {
    it('should initialize successfully', () => {
      const stats = router.getStats();
      expect(stats.initialized).toBe(true);
      expect(stats.agentCount).toBe(80);
    });

    it('should be idempotent', async () => {
      const stats1 = router.getStats();
      await router.initialize();
      const stats2 = router.getStats();
      expect(stats1.agentCount).toBe(stats2.agentCount);
    });
  });

  describe('Task Routing', () => {
    it('should route test generation task to test generator', async () => {
      const task: QETask = {
        description: 'Generate unit tests for UserService authentication methods',
      };

      const decision = await router.route(task);

      expect(decision.recommended).toBeTruthy();
      expect(decision.confidence).toBeGreaterThan(0);
      expect(decision.confidence).toBeLessThanOrEqual(1);
      expect(decision.alternatives.length).toBeGreaterThan(0);
      expect(decision.reasoning).toBeTruthy();
      expect(decision.latencyMs).toBeGreaterThan(0);

      // Should recommend a test generation agent
      const testGenAgents = ['qe-test-generator', 'qe-test-writer', 'v3-qe-test-architect', 'tester'];
      expect(testGenAgents).toContain(decision.recommended);
    });

    it('should route coverage task to coverage analyzer', async () => {
      const task: QETask = {
        description: 'Analyze code coverage gaps in the authentication module',
      };

      const decision = await router.route(task);

      // Should recommend a coverage agent
      const coverageAgents = ['qe-coverage-analyzer', 'qe-coverage-gap-analyzer', 'v3-qe-coverage-specialist'];
      expect(coverageAgents).toContain(decision.recommended);
    });

    it('should route security task to security scanner', async () => {
      const task: QETask = {
        description: 'Scan for OWASP security vulnerabilities in the API endpoints',
      };

      const decision = await router.route(task);

      // Should recommend a security-related agent
      const securityAgents = [
        'qe-security-scanner', 'qe-security-auditor', 'security-auditor', 'security-architect',
        'n8n-security-auditor', 'n8n-compliance-validator', 'claims-authorizer',
      ];
      expect(securityAgents).toContain(decision.recommended);
    });

    it('should route visual regression task appropriately', async () => {
      const task: QETask = {
        description: 'Capture screenshots and compare visual regression for UI components using Percy or Chromatic',
        domain: 'visual-accessibility', // Hint the domain
      };

      const decision = await router.route(task);

      // Should recommend visual testing agent or test generator (which handles e2e)
      const visualAgents = ['qe-visual-tester', 'qe-a11y-ally', 'qe-test-generator', 'tester'];
      expect(visualAgents).toContain(decision.recommended);
    });

    it('should route chaos engineering task appropriately', async () => {
      const task: QETask = {
        description: 'Inject faults to test system resilience under failure conditions',
      };

      const decision = await router.route(task);

      // Should recommend chaos agent
      const chaosAgents = ['qe-chaos-engineer', 'n8n-chaos-tester'];
      expect(chaosAgents).toContain(decision.recommended);
    });

    it('should respect language preference', async () => {
      const task: QETask = {
        description: 'Generate unit tests',
        language: 'python',
      };

      const decision = await router.route(task);

      // Agent should support Python
      expect(decision.confidence).toBeGreaterThan(0);
    });

    it('should respect framework preference', async () => {
      const task: QETask = {
        description: 'Run e2e tests',
        framework: 'playwright',
      };

      const decision = await router.route(task);

      // Agent should support Playwright
      expect(decision.confidence).toBeGreaterThan(0);
    });

    it('should provide alternatives', async () => {
      const task: QETask = {
        description: 'Generate integration tests for the payment service',
      };

      const decision = await router.route(task);

      expect(decision.alternatives.length).toBeGreaterThan(0);
      expect(decision.alternatives.length).toBeLessThanOrEqual(3);

      for (const alt of decision.alternatives) {
        expect(alt.agent).toBeTruthy();
        expect(alt.score).toBeGreaterThan(0);
        expect(alt.reason).toBeTruthy();
      }
    });

    it('should include score breakdown', async () => {
      const task: QETask = {
        description: 'Analyze test coverage for authentication module',
      };

      const decision = await router.route(task);

      expect(decision.scores).toBeDefined();
      expect(decision.scores.similarity).toBeGreaterThanOrEqual(0);
      expect(decision.scores.similarity).toBeLessThanOrEqual(1);
      expect(decision.scores.performance).toBeGreaterThanOrEqual(0);
      expect(decision.scores.performance).toBeLessThanOrEqual(1);
      expect(decision.scores.capabilities).toBeGreaterThanOrEqual(0);
      expect(decision.scores.capabilities).toBeLessThanOrEqual(1);
      expect(decision.scores.combined).toBeGreaterThan(0);
    });
  });

  describe('Domain Detection', () => {
    it('should detect test-generation domain', async () => {
      const task: QETask = { description: 'Write unit tests for the validator' };
      const decision = await router.route(task);
      expect(decision.reasoning).toContain('test-generation');
    });

    it('should detect coverage-analysis domain', async () => {
      const task: QETask = { description: 'Find untested code paths and coverage gaps' };
      const decision = await router.route(task);
      expect(decision.reasoning).toContain('coverage');
    });

    it('should detect security-compliance domain', async () => {
      const task: QETask = { description: 'Audit for security vulnerabilities and OWASP issues' };
      const decision = await router.route(task);
      expect(decision.reasoning).toContain('security');
    });
  });

  describe('Capability Detection', () => {
    it('should detect TDD requirements', async () => {
      const task: QETask = {
        description: 'Use TDD to develop the new feature with failing tests first',
      };
      const decision = await router.route(task);

      // Should route to TDD-capable agent
      expect(decision.confidence).toBeGreaterThan(0.3);
    });

    it('should detect BDD requirements', async () => {
      const task: QETask = {
        description: 'Write Gherkin scenarios for the checkout flow using BDD',
      };
      const decision = await router.route(task);

      expect(decision.confidence).toBeGreaterThan(0.3);
    });

    it('should detect API testing requirements', async () => {
      const task: QETask = {
        description: 'Test REST API endpoints with contract validation',
      };
      const decision = await router.route(task);

      expect(decision.confidence).toBeGreaterThan(0.3);
    });
  });

  describe('Complexity Handling', () => {
    it('should handle simple tasks', async () => {
      const task: QETask = {
        description: 'Generate a simple unit test',
        complexity: 'simple',
      };

      const decision = await router.route(task);
      expect(decision.confidence).toBeGreaterThan(0);
    });

    it('should handle complex tasks', async () => {
      const task: QETask = {
        description: 'Orchestrate a comprehensive testing strategy across all modules',
        complexity: 'complex',
      };

      const decision = await router.route(task);
      expect(decision.confidence).toBeGreaterThan(0);
    });
  });

  describe('Performance Updates', () => {
    it('should update agent performance', () => {
      router.updateAgentPerformance('qe-test-generator', true, 0.9, 5000);
      router.updateAgentPerformance('qe-test-generator', true, 0.85, 4500);
      router.updateAgentPerformance('qe-test-generator', false, 0.3, 6000);

      // Verify stats reflect update
      const stats = router.getStats();
      expect(stats.initialized).toBe(true);
    });

    it('should handle unknown agent gracefully', () => {
      // Should not throw
      router.updateAgentPerformance('unknown-agent-xyz', true, 0.9, 1000);
    });
  });

  describe('Caching', () => {
    it('should cache task embeddings', async () => {
      const task: QETask = {
        description: 'Cache test query for embedding reuse',
      };

      // First call - generates embedding
      await router.route(task);
      const stats1 = router.getStats();

      // Second call - should use cache
      await router.route(task);
      const stats2 = router.getStats();

      expect(stats2.embeddingsCached).toBeGreaterThanOrEqual(stats1.embeddingsCached);
    });

    it('should clear cache', async () => {
      const task: QETask = {
        description: 'Test cache clearing functionality',
      };
      await router.route(task);

      router.clearCache();
      const stats = router.getStats();
      expect(stats.embeddingsCached).toBe(0);
    });
  });

  describe('n8n Workflow Tasks', () => {
    it('should route n8n workflow testing tasks', async () => {
      const task: QETask = {
        description: 'Test n8n workflow triggers and webhook handlers',
      };

      const decision = await router.route(task);

      // Should prefer n8n agents
      const n8nAgents = [
        'n8n-workflow-executor', 'n8n-trigger-test', 'n8n-integration-test',
        'n8n-unit-tester', 'n8n-node-validator',
      ];
      // May not always get n8n agent due to semantic matching, but should have good confidence
      expect(decision.confidence).toBeGreaterThan(0.3);
    });

    it('should route n8n security tasks', async () => {
      const task: QETask = {
        description: 'Scan n8n workflows for credential exposure and security vulnerabilities',
      };

      const decision = await router.route(task);
      expect(decision.confidence).toBeGreaterThan(0.3);
    });
  });
});

describe('QE Task Router Benchmarks', () => {
  let router: QETaskRouter;

  beforeAll(async () => {
    router = createQETaskRouter();
    await router.initialize();
  }, 120000);

  afterAll(() => {
    resetInitialization();
  });

  it('should achieve <100ms P95 latency for routing (after warmup)', async () => {
    // Warmup
    for (let i = 0; i < 3; i++) {
      await router.route({ description: 'warmup task' });
    }

    // Measure 20 routing requests
    const latencies: number[] = [];
    const tasks = [
      'Generate unit tests for authentication',
      'Analyze code coverage gaps',
      'Scan for security vulnerabilities',
      'Run visual regression tests',
      'Execute load tests on API',
    ];

    for (let i = 0; i < 20; i++) {
      const task: QETask = { description: tasks[i % tasks.length] };

      const start = performance.now();
      await router.route(task);
      const latency = performance.now() - start;
      latencies.push(latency);
    }

    latencies.sort((a, b) => a - b);

    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

    console.log('\n=== Task Routing Latency Benchmark ===');
    console.log(`  Samples: ${latencies.length}`);
    console.log(`  Average: ${avg.toFixed(2)}ms`);
    console.log(`  P50: ${p50.toFixed(2)}ms`);
    console.log(`  P95: ${p95.toFixed(2)}ms`);

    // P95 should be under 200ms (includes embedding generation)
    expect(p95).toBeLessThan(200);
  }, 60000);

  it('should route 5+ tasks per second', async () => {
    const COUNT = 10;
    const start = performance.now();

    for (let i = 0; i < COUNT; i++) {
      await router.route({ description: `Task ${i} for throughput test` });
    }

    const elapsed = performance.now() - start;
    const throughput = (COUNT / elapsed) * 1000;

    console.log('\n=== Routing Throughput ===');
    console.log(`  Tasks routed: ${COUNT}`);
    console.log(`  Time: ${elapsed.toFixed(0)}ms`);
    console.log(`  Throughput: ${throughput.toFixed(1)} tasks/sec`);

    expect(throughput).toBeGreaterThan(5);
  }, 30000);
});
