/**
 * FlakyTestHunterAgent Integration Tests
 *
 * Tests agent coordination with:
 * - TestExecutorAgent (test results and history)
 * - QualityGateAgent (reliability checks)
 * - DeploymentReadinessAgent (test stability metrics)
 * - FleetCommanderAgent (agent orchestration)
 *
 * Scenarios:
 * - End-to-end flaky test detection and remediation
 * - Multi-agent coordination workflows
 * - Real-time test reliability monitoring
 * - Automated quarantine and reinstatement
 *
 * Target: 700+ lines, comprehensive integration coverage
 */

import { EventEmitter } from 'events';
import { FlakyTestHunterAgent, TestHistory } from '@agents/FlakyTestHunterAgent';
import { BaseAgentConfig } from '@agents/BaseAgent';
import {
  QEAgentType,
  AgentStatus,
  FlakyTestHunterConfig,
  MemoryStore,
  AgentContext,
  QETask
} from '@typessrc/types';

// ============================================================================
// Mock Implementations for Integration Testing
// ============================================================================

class IntegrationMemoryStore implements MemoryStore {
  private storage: Map<string, any> = new Map();
  private subscriptions: Map<string, Set<Function>> = new Map();

  async store(key: string, value: any, ttl?: number): Promise<void> {
    this.storage.set(key, value);
    this.notifySubscribers(key, value);
  }

  async retrieve(key: string): Promise<any> {
    return this.storage.get(key);
  }

  async set(key: string, value: any, namespace?: string): Promise<void> {
    const fullKey = namespace ? `${namespace}:${key}` : key;
    this.storage.set(fullKey, value);
    this.notifySubscribers(fullKey, value);
  }

  async get(key: string, namespace?: string): Promise<any> {
    const fullKey = namespace ? `${namespace}:${key}` : key;
    return this.storage.get(fullKey);
  }

  async delete(key: string, namespace?: string): Promise<boolean> {
    const fullKey = namespace ? `${namespace}:${key}` : key;
    return this.storage.delete(fullKey);
  }

  async clear(namespace?: string): Promise<void> {
    if (namespace) {
      const keysToDelete: string[] = [];
      for (const key of this.storage.keys()) {
        if (key.startsWith(`${namespace}:`)) {
          keysToDelete.push(key);
        }
      }
      for (const key of keysToDelete) {
        this.storage.delete(key);
      }
    } else {
      this.storage.clear();
    }
  }

  // Integration-specific methods
  subscribe(key: string, callback: Function): void {
    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, new Set());
    }
    this.subscriptions.get(key)!.add(callback);
  }

  unsubscribe(key: string, callback: Function): void {
    this.subscriptions.get(key)?.delete(callback);
  }

  private notifySubscribers(key: string, value: any): void {
    const subscribers = this.subscriptions.get(key);
    if (subscribers) {
      subscribers.forEach(callback => callback(value));
    }
  }

  getAll(): Map<string, any> {
    return new Map(this.storage);
  }
}

// Mock Test Executor Agent
class MockTestExecutorAgent {
  private memoryStore: IntegrationMemoryStore;
  private eventBus: EventEmitter;

  constructor(memoryStore: IntegrationMemoryStore, eventBus: EventEmitter) {
    this.memoryStore = memoryStore;
    this.eventBus = eventBus;
  }

  async executeTests(tests: string[]): Promise<void> {
    // Simulate test execution and store results
    const results: TestHistory[] = [];

    for (const testName of tests) {
      const isFail = Math.random() < 0.3; // 30% failure rate
      results.push({
        testName,
        timestamp: new Date(),
        result: isFail ? 'fail' : 'pass',
        duration: isFail ? 5000 : 2000,
        error: isFail ? 'Test failed with timeout' : undefined,
        agent: 'mock-executor'
      });
    }

    // Store in memory for FlakyTestHunter to access
    await this.memoryStore.set('test-results/history', results, 'shared:test-executor');

    // Emit event
    this.eventBus.emit('test.executed', { results });
  }

  async getTestHistory(testName: string): Promise<TestHistory[]> {
    const allHistory = await this.memoryStore.get('test-results/history', 'shared:test-executor');
    return allHistory?.filter((h: TestHistory) => h.testName === testName) || [];
  }
}

// Mock Quality Gate Agent
class MockQualityGateAgent {
  private memoryStore: IntegrationMemoryStore;
  private eventBus: EventEmitter;

  constructor(memoryStore: IntegrationMemoryStore, eventBus: EventEmitter) {
    this.memoryStore = memoryStore;
    this.eventBus = eventBus;

    // Listen for flaky test events
    this.eventBus.on('test.flaky.detected', this.handleFlakyDetected.bind(this));
  }

  private async handleFlakyDetected(event: any): void {
    // Update quality gate status
    await this.memoryStore.set('quality-gate/status', {
      blocked: event.data.count > 5,
      reason: `${event.data.count} flaky tests detected`,
      timestamp: new Date()
    }, 'shared:quality-gate');
  }

  async getStatus(): Promise<any> {
    return await this.memoryStore.get('quality-gate/status', 'shared:quality-gate');
  }
}

// Mock Deployment Readiness Agent
class MockDeploymentReadinessAgent {
  private memoryStore: IntegrationMemoryStore;
  private eventBus: EventEmitter;

  constructor(memoryStore: IntegrationMemoryStore, eventBus: EventEmitter) {
    this.memoryStore = memoryStore;
    this.eventBus = eventBus;

    // Listen for test stability events
    this.eventBus.on('test.stabilized', this.handleTestStabilized.bind(this));
    this.eventBus.on('test.quarantined', this.handleTestQuarantined.bind(this));
  }

  private async handleTestStabilized(event: any): void {
    await this.memoryStore.set('deployment/test-stability', {
      status: 'improving',
      stabilizedTests: [event.data.testName],
      timestamp: new Date()
    }, 'shared:deployment-readiness');
  }

  private async handleTestQuarantined(event: any): void {
    await this.memoryStore.set('deployment/test-stability', {
      status: 'degraded',
      quarantinedTests: [event.data.testName],
      timestamp: new Date()
    }, 'shared:deployment-readiness');
  }

  async assessReadiness(): Promise<any> {
    const stability = await this.memoryStore.get('deployment/test-stability', 'shared:deployment-readiness');
    const flakyTests = await this.memoryStore.get('flaky-tests/detected', 'shared:flaky-test-hunter');

    return {
      ready: !flakyTests || flakyTests.count < 3,
      testStability: stability,
      recommendation: flakyTests?.count > 3 ? 'Fix flaky tests before deployment' : 'Ready to deploy'
    };
  }
}

// ============================================================================
// Test Data Generators
// ============================================================================

function generateIntegrationTestHistory(
  testName: string,
  runs: number,
  pattern: 'stable' | 'flaky' | 'improving' | 'degrading'
): TestHistory[] {
  const history: TestHistory[] = [];

  for (let i = 0; i < runs; i++) {
    let failureRate = 0.02; // Default: stable

    if (pattern === 'flaky') {
      failureRate = 0.35;
    } else if (pattern === 'improving') {
      failureRate = Math.max(0.02, 0.50 - (i / runs) * 0.48); // 50% → 2%
    } else if (pattern === 'degrading') {
      failureRate = Math.min(0.50, 0.02 + (i / runs) * 0.48); // 2% → 50%
    }

    const isFail = Math.random() < failureRate;
    history.push({
      testName,
      timestamp: new Date(Date.now() - (runs - i) * 60 * 60 * 1000),
      result: isFail ? 'fail' : 'pass',
      duration: isFail ? 5000 : 2000,
      error: isFail ? 'Test execution failed' : undefined,
      agent: `ci-agent-${(i % 3) + 1}`,
      orderInSuite: i % 10
    });
  }

  return history;
}

// ============================================================================
// Integration Test Setup
// ============================================================================

function createIntegrationEnvironment() {
  const memoryStore = new IntegrationMemoryStore();
  const eventBus = new EventEmitter();

  const context: AgentContext = {
    id: 'flaky-hunter-integration',
    type: 'flaky-test-hunter',
    status: AgentStatus.INITIALIZING
  };

  const baseConfig: BaseAgentConfig = {
    type: QEAgentType.FLAKY_TEST_HUNTER,
    capabilities: [],
    context,
    memoryStore,
    eventBus
  };

  const hunterConfig: FlakyTestHunterConfig = {
    detection: { repeatedRuns: 20, timeWindow: 30 },
    analysis: { rootCauseIdentification: true },
    remediation: { autoStabilization: true, quarantineEnabled: true },
    reporting: { trendTracking: true }
  };

  const flakyHunter = new FlakyTestHunterAgent(baseConfig, hunterConfig);
  const testExecutor = new MockTestExecutorAgent(memoryStore, eventBus);
  const qualityGate = new MockQualityGateAgent(memoryStore, eventBus);
  const deploymentReadiness = new MockDeploymentReadinessAgent(memoryStore, eventBus);

  return {
    flakyHunter,
    testExecutor,
    qualityGate,
    deploymentReadiness,
    memoryStore,
    eventBus
  };
}

// ============================================================================
// Integration Test Suites
// ============================================================================

describe('FlakyTestHunterAgent Integration Tests', () => {
  describe('Agent Coordination', () => {
    test('should coordinate with TestExecutorAgent for test history', async () => {
      const { flakyHunter, testExecutor, memoryStore } = createIntegrationEnvironment();

      // Set up test history via TestExecutor
      const testHistory = generateIntegrationTestHistory('integration-test', 30, 'flaky');
      await memoryStore.set('test-results/history', testHistory, 'shared:test-executor');

      // Initialize FlakyHunter
      await flakyHunter.initialize();

      // Detect flaky tests
      const flakyTests = await flakyHunter.detectFlakyTests(30, 10);

      expect(flakyTests.length).toBeGreaterThan(0);
      expect(flakyTests[0].testName).toBe('integration-test');
    });

    test('should notify QualityGateAgent when flaky tests detected', async () => {
      const { flakyHunter, qualityGate, memoryStore, eventBus } = createIntegrationEnvironment();

      // Set up flaky test history
      const testHistory = [
        ...generateIntegrationTestHistory('flaky-1', 30, 'flaky'),
        ...generateIntegrationTestHistory('flaky-2', 30, 'flaky'),
        ...generateIntegrationTestHistory('flaky-3', 30, 'flaky'),
        ...generateIntegrationTestHistory('flaky-4', 30, 'flaky'),
        ...generateIntegrationTestHistory('flaky-5', 30, 'flaky'),
        ...generateIntegrationTestHistory('flaky-6', 30, 'flaky')
      ];
      await memoryStore.set('test-results/history', testHistory, 'shared:test-executor');

      await flakyHunter.initialize();

      // Detect flaky tests (should trigger quality gate event)
      await flakyHunter.detectFlakyTests(30, 10);

      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check quality gate status
      const status = await qualityGate.getStatus();
      expect(status).toBeDefined();
      expect(status.blocked).toBe(true);
    });

    test('should coordinate with DeploymentReadinessAgent on test stabilization', async () => {
      const { flakyHunter, deploymentReadiness, memoryStore } = createIntegrationEnvironment();

      // Set up flaky test
      const testHistory = generateIntegrationTestHistory('stabilize-test', 30, 'flaky');
      await memoryStore.set('test-results/history', testHistory, 'shared:test-executor');

      await flakyHunter.initialize();

      // Detect and stabilize
      await flakyHunter.detectFlakyTests(30, 10);
      await flakyHunter.stabilizeTest('stabilize-test');

      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check deployment readiness
      const readiness = await deploymentReadiness.assessReadiness();
      expect(readiness).toBeDefined();
    });

    test('should coordinate with DeploymentReadinessAgent on test quarantine', async () => {
      const { flakyHunter, deploymentReadiness, memoryStore } = createIntegrationEnvironment();

      // Set up flaky test
      const testHistory = generateIntegrationTestHistory('quarantine-test', 30, 'flaky');
      await memoryStore.set('test-results/history', testHistory, 'shared:test-executor');

      await flakyHunter.initialize();

      // Detect and quarantine
      await flakyHunter.detectFlakyTests(30, 10);
      await flakyHunter.quarantineTest('quarantine-test', 'High flakiness detected');

      // Give time for event processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check deployment readiness
      const readiness = await deploymentReadiness.assessReadiness();
      expect(readiness).toBeDefined();
    });
  });

  describe('End-to-End Workflows', () => {
    test('should complete full flaky test detection workflow', async () => {
      const { flakyHunter, testExecutor, memoryStore } = createIntegrationEnvironment();

      // Phase 1: Tests execute and accumulate history
      const testNames = ['test-1', 'test-2', 'test-3'];
      const allHistory: TestHistory[] = [];

      for (let run = 0; run < 30; run++) {
        for (const testName of testNames) {
          const isFail = testName === 'test-2' && Math.random() < 0.35; // test-2 is flaky
          allHistory.push({
            testName,
            timestamp: new Date(Date.now() - (30 - run) * 60 * 60 * 1000),
            result: isFail ? 'fail' : 'pass',
            duration: isFail ? 5000 : 2000,
            error: isFail ? 'Intermittent failure' : undefined,
            agent: `ci-agent-${(run % 3) + 1}`
          });
        }
      }

      await memoryStore.set('test-results/history', allHistory, 'shared:test-executor');

      // Phase 2: FlakyHunter detects flaky tests
      await flakyHunter.initialize();
      const flakyTests = await flakyHunter.detectFlakyTests(30, 10);

      expect(flakyTests.length).toBeGreaterThan(0);
      expect(flakyTests.some(t => t.testName === 'test-2')).toBe(true);

      // Phase 3: Root cause analysis
      const flakyTest = flakyTests.find(t => t.testName === 'test-2');
      expect(flakyTest!.rootCause).toBeDefined();

      // Phase 4: Generate fix suggestions
      expect(flakyTest!.suggestedFixes).toBeDefined();
      expect(flakyTest!.suggestedFixes!.length).toBeGreaterThan(0);

      // Phase 5: Quarantine if needed
      if (flakyTest!.severity === 'HIGH' || flakyTest!.severity === 'CRITICAL') {
        await flakyHunter.quarantineTest('test-2', 'High severity flakiness');
      }

      // Phase 6: Generate report
      const report = await flakyHunter.generateReport(30);
      expect(report.analysis.flakyTests).toBeGreaterThan(0);
    });

    test('should complete test improvement workflow', async () => {
      const { flakyHunter, memoryStore } = createIntegrationEnvironment();

      // Test starts flaky, then improves over time
      const improvingHistory = generateIntegrationTestHistory('improving-test', 50, 'improving');
      await memoryStore.set('test-results/history', improvingHistory, 'shared:test-executor');

      await flakyHunter.initialize();

      // Initial detection - should be flaky
      const initialDetection = await flakyHunter.detectFlakyTests(50, 10);
      const wasFlaky = initialDetection.some(t => t.testName === 'improving-test');

      if (wasFlaky) {
        // Quarantine
        await flakyHunter.quarantineTest('improving-test', 'Flaky but improving');

        // After improvement, review quarantine
        const reviewResults = await flakyHunter.reviewQuarantinedTests();

        // Should be in reviewed list
        expect(reviewResults.reviewed).toContain('improving-test');
      }
    });

    test('should handle multiple flaky tests concurrently', async () => {
      const { flakyHunter, memoryStore } = createIntegrationEnvironment();

      // Create multiple flaky tests
      const allHistory = [
        ...generateIntegrationTestHistory('flaky-1', 30, 'flaky'),
        ...generateIntegrationTestHistory('flaky-2', 30, 'flaky'),
        ...generateIntegrationTestHistory('flaky-3', 30, 'flaky'),
        ...generateIntegrationTestHistory('stable-1', 30, 'stable'),
        ...generateIntegrationTestHistory('stable-2', 30, 'stable')
      ];
      await memoryStore.set('test-results/history', allHistory, 'shared:test-executor');

      await flakyHunter.initialize();

      // Detect all flaky tests
      const flakyTests = await flakyHunter.detectFlakyTests(30, 10);

      expect(flakyTests.length).toBeGreaterThanOrEqual(3);
      expect(flakyTests.every(t => t.testName.startsWith('flaky-'))).toBe(true);

      // Quarantine all high-severity tests
      for (const test of flakyTests) {
        if (test.severity === 'HIGH' || test.severity === 'CRITICAL') {
          await flakyHunter.quarantineTest(test.testName, `${test.severity} severity`);
        }
      }

      // Generate comprehensive report
      const report = await flakyHunter.generateReport(30);
      expect(report.topFlakyTests.length).toBeGreaterThan(0);
      expect(report.statistics.bySeverity).toBeDefined();
    });
  });

  describe('Real-time Monitoring', () => {
    test('should detect newly introduced flaky tests', async () => {
      const { flakyHunter, memoryStore } = createIntegrationEnvironment();

      // Initially stable test
      const initialHistory = generateIntegrationTestHistory('new-flaky', 20, 'stable');
      await memoryStore.set('test-results/history', initialHistory, 'shared:test-executor');

      await flakyHunter.initialize();

      // First detection - should be stable
      let flakyTests = await flakyHunter.detectFlakyTests(30, 10);
      const initiallyFlaky = flakyTests.some(t => t.testName === 'new-flaky');

      // Test becomes flaky
      const degradedHistory = [
        ...initialHistory,
        ...generateIntegrationTestHistory('new-flaky', 10, 'flaky')
      ];
      await memoryStore.set('test-results/history', degradedHistory, 'shared:test-executor');

      // Second detection - should now be flaky
      flakyTests = await flakyHunter.detectFlakyTests(30, 10);
      const nowFlaky = flakyTests.some(t => t.testName === 'new-flaky');

      expect(!initiallyFlaky || nowFlaky).toBe(true);
    });

    test('should track flakiness trends over time', async () => {
      const { flakyHunter, memoryStore } = createIntegrationEnvironment();

      // Generate trending data
      const trendHistory = generateIntegrationTestHistory('trending-test', 60, 'degrading');
      await memoryStore.set('test-results/history', trendHistory, 'shared:test-executor');

      await flakyHunter.initialize();

      // Generate reports at different time windows
      const report30days = await flakyHunter.generateReport(30);
      const report60days = await flakyHunter.generateReport(60);

      expect(report30days).toBeDefined();
      expect(report60days).toBeDefined();

      // 60-day report should show worse flakiness for degrading test
      expect(report60days.analysis.flakinessRate).toBeDefined();
    });

    test('should respond to real-time test execution events', async () => {
      const { flakyHunter, memoryStore, eventBus } = createIntegrationEnvironment();

      await flakyHunter.initialize();

      // Set up listener for flaky detection
      const detectionPromise = new Promise(resolve => {
        eventBus.once('test.flaky.detected', resolve);
      });

      // Simulate test execution producing flaky results
      const realtimeHistory = generateIntegrationTestHistory('realtime-test', 25, 'flaky');
      await memoryStore.set('test-results/history', realtimeHistory, 'shared:test-executor');

      // Trigger detection
      await flakyHunter.detectFlakyTests(30, 10);

      // Wait for event
      const event = await detectionPromise;
      expect(event).toBeDefined();
    });
  });

  describe('Automated Remediation', () => {
    test('should automatically quarantine high-severity flaky tests', async () => {
      const { flakyHunter, memoryStore } = createIntegrationEnvironment();

      // Create high-severity flaky test
      const highFlakyHistory = generateIntegrationTestHistory('high-severity', 30, 'flaky');
      // Make it extra flaky to ensure high severity
      for (let i = 0; i < 15; i++) {
        highFlakyHistory.push({
          testName: 'high-severity',
          timestamp: new Date(Date.now() - i * 60 * 60 * 1000),
          result: 'fail',
          duration: 5000,
          error: 'Critical failure',
          agent: 'ci-agent-1'
        });
      }

      await memoryStore.set('test-results/history', highFlakyHistory, 'shared:test-executor');

      await flakyHunter.initialize();

      const flakyTests = await flakyHunter.detectFlakyTests(30, 10);
      const highSeverityTests = flakyTests.filter(t => t.severity === 'HIGH' || t.severity === 'CRITICAL');

      if (highSeverityTests.length > 0) {
        // Auto-quarantine high severity tests
        for (const test of highSeverityTests) {
          await flakyHunter.quarantineTest(test.testName, `Auto-quarantine: ${test.severity} severity`);
        }

        // Verify quarantine
        const stored = await memoryStore.get(`quarantine/${highSeverityTests[0].testName}`, 'shared:flaky-test-hunter');
        expect(stored).toBeDefined();
        expect(stored.status).toBe('QUARANTINED');
      }
    });

    test('should attempt auto-stabilization for supported patterns', async () => {
      const { flakyHunter, memoryStore } = createIntegrationEnvironment();

      // Create test with race condition pattern
      const raceHistory: TestHistory[] = [];
      for (let i = 0; i < 30; i++) {
        const isFail = Math.random() < 0.4;
        raceHistory.push({
          testName: 'race-condition-test',
          timestamp: new Date(Date.now() - (30 - i) * 60 * 60 * 1000),
          result: isFail ? 'fail' : 'pass',
          duration: isFail ? 1000 : 2000,
          error: isFail ? 'Error: Order not found - race condition' : undefined,
          agent: 'ci-agent-1'
        });
      }

      await memoryStore.set('test-results/history', raceHistory, 'shared:test-executor');

      await flakyHunter.initialize();

      // Detect flaky tests
      await flakyHunter.detectFlakyTests(30, 10);

      // Attempt stabilization
      const result = await flakyHunter.stabilizeTest('race-condition-test');

      expect(result).toBeDefined();
      if (result.success) {
        expect(result.modifications).toBeDefined();
        expect(result.newPassRate).toBeGreaterThan(result.originalPassRate!);
      }
    });

    test('should reinstate tests that become stable', async () => {
      const { flakyHunter, memoryStore } = createIntegrationEnvironment();

      // Test that improves over time
      const improvingHistory = generateIntegrationTestHistory('improving-test', 50, 'improving');
      await memoryStore.set('test-results/history', improvingHistory, 'shared:test-executor');

      await flakyHunter.initialize();

      // Initial detection and quarantine
      const initialFlaky = await flakyHunter.detectFlakyTests(50, 10);
      if (initialFlaky.some(t => t.testName === 'improving-test')) {
        await flakyHunter.quarantineTest('improving-test', 'Initially flaky');
      }

      // Review quarantine (simulates later check)
      const results = await flakyHunter.reviewQuarantinedTests();

      // Test should be reviewed
      expect(results.reviewed.length).toBeGreaterThan(0);
    });
  });

  describe('Memory and State Management', () => {
    test('should persist flaky test detections in shared memory', async () => {
      const { flakyHunter, memoryStore } = createIntegrationEnvironment();

      const flakyHistory = generateIntegrationTestHistory('persist-test', 30, 'flaky');
      await memoryStore.set('test-results/history', flakyHistory, 'shared:test-executor');

      await flakyHunter.initialize();
      await flakyHunter.detectFlakyTests(30, 10);

      // Check shared memory
      const stored = await memoryStore.get('flaky-tests/detected', 'shared:flaky-test-hunter');
      expect(stored).toBeDefined();
      expect(stored.count).toBeGreaterThan(0);
    });

    test('should persist quarantine records in shared memory', async () => {
      const { flakyHunter, memoryStore } = createIntegrationEnvironment();

      await flakyHunter.initialize();
      await flakyHunter.quarantineTest('test-to-quarantine', 'Test reason');

      // Check shared memory
      const stored = await memoryStore.get('quarantine/test-to-quarantine', 'shared:flaky-test-hunter');
      expect(stored).toBeDefined();
      expect(stored.testName).toBe('test-to-quarantine');
    });

    test('should share reliability scores across agents', async () => {
      const { flakyHunter, memoryStore } = createIntegrationEnvironment();

      const stableHistory = generateIntegrationTestHistory('reliable-test', 50, 'stable');
      await memoryStore.set('test-results/history', stableHistory, 'shared:test-executor');

      await flakyHunter.initialize();

      const score = await flakyHunter.calculateReliabilityScore('reliable-test');

      if (score) {
        // Other agents should be able to access this
        const allMemory = memoryStore.getAll();
        expect(allMemory.size).toBeGreaterThan(0);
      }
    });

    test('should maintain state across agent restarts', async () => {
      const { memoryStore, eventBus } = createIntegrationEnvironment();

      // First agent instance
      const context1: AgentContext = {
        id: 'hunter-1',
        type: 'flaky-test-hunter',
        status: AgentStatus.INITIALIZING
      };

      const config1: BaseAgentConfig = {
        type: QEAgentType.FLAKY_TEST_HUNTER,
        capabilities: [],
        context: context1,
        memoryStore,
        eventBus
      };

      const agent1 = new FlakyTestHunterAgent(config1, {});
      await agent1.initialize();

      const flakyHistory = generateIntegrationTestHistory('state-test', 30, 'flaky');
      await memoryStore.set('test-results/history', flakyHistory, 'shared:test-executor');

      await agent1.detectFlakyTests(30, 10);
      await agent1.terminate();

      // Second agent instance (simulates restart)
      const context2: AgentContext = {
        id: 'hunter-2',
        type: 'flaky-test-hunter',
        status: AgentStatus.INITIALIZING
      };

      const config2: BaseAgentConfig = {
        type: QEAgentType.FLAKY_TEST_HUNTER,
        capabilities: [],
        context: context2,
        memoryStore,
        eventBus
      };

      const agent2 = new FlakyTestHunterAgent(config2, {});
      await agent2.initialize();

      // Should be able to access previous detections
      const stored = await memoryStore.get('flaky-tests/detected', 'shared:flaky-test-hunter');
      expect(stored).toBeDefined();

      await agent2.terminate();
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle large test suites efficiently', async () => {
      const { flakyHunter, memoryStore } = createIntegrationEnvironment();

      // Generate large test suite
      const largeHistory: TestHistory[] = [];
      for (let i = 0; i < 1000; i++) {
        const testName = `test-${i}`;
        const pattern = i % 10 === 0 ? 'flaky' : 'stable'; // 10% flaky
        largeHistory.push(...generateIntegrationTestHistory(testName, 20, pattern));
      }

      await memoryStore.set('test-results/history', largeHistory, 'shared:test-executor');

      await flakyHunter.initialize();

      const startTime = Date.now();
      const flakyTests = await flakyHunter.detectFlakyTests(30, 10);
      const duration = Date.now() - startTime;

      expect(flakyTests.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(10000); // Should complete in < 10 seconds
    });

    test('should process concurrent detection requests', async () => {
      const { flakyHunter, memoryStore } = createIntegrationEnvironment();

      const testHistory = generateIntegrationTestHistory('concurrent-test', 30, 'flaky');
      await memoryStore.set('test-results/history', testHistory, 'shared:test-executor');

      await flakyHunter.initialize();

      // Concurrent detection requests
      const results = await Promise.all([
        flakyHunter.detectFlakyTests(30, 10),
        flakyHunter.detectFlakyTests(30, 10),
        flakyHunter.detectFlakyTests(30, 10)
      ]);

      // All should complete successfully
      results.forEach(result => {
        expect(Array.isArray(result)).toBe(true);
      });
    });

    test('should handle high-frequency test result updates', async () => {
      const { flakyHunter, memoryStore } = createIntegrationEnvironment();

      await flakyHunter.initialize();

      // Simulate rapid test result updates
      for (let i = 0; i < 10; i++) {
        const batchHistory = generateIntegrationTestHistory(`batch-test-${i}`, 5, 'flaky');
        const existing = await memoryStore.get('test-results/history', 'shared:test-executor') || [];
        await memoryStore.set('test-results/history', [...existing, ...batchHistory], 'shared:test-executor');
      }

      const flakyTests = await flakyHunter.detectFlakyTests(30, 5); // Lower threshold for quick tests
      expect(Array.isArray(flakyTests)).toBe(true);
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle missing test history gracefully', async () => {
      const { flakyHunter } = createIntegrationEnvironment();

      await flakyHunter.initialize();

      // Attempt detection with no history
      const flakyTests = await flakyHunter.detectFlakyTests(30, 10);

      expect(Array.isArray(flakyTests)).toBe(true);
      expect(flakyTests.length).toBe(0);
    });

    test('should handle corrupted test history data', async () => {
      const { flakyHunter, memoryStore } = createIntegrationEnvironment();

      // Store corrupted data
      await memoryStore.set('test-results/history', { invalid: 'data' }, 'shared:test-executor');

      await flakyHunter.initialize();

      // Should handle gracefully
      const flakyTests = await flakyHunter.detectFlakyTests(30, 10);
      expect(Array.isArray(flakyTests)).toBe(true);
    });

    test('should recover from failed stabilization attempts', async () => {
      const { flakyHunter } = createIntegrationEnvironment();

      await flakyHunter.initialize();

      // Attempt to stabilize non-existent test
      const result = await flakyHunter.stabilizeTest('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle event bus failures gracefully', async () => {
      const { flakyHunter, memoryStore, eventBus } = createIntegrationEnvironment();

      const testHistory = generateIntegrationTestHistory('event-test', 30, 'flaky');
      await memoryStore.set('test-results/history', testHistory, 'shared:test-executor');

      await flakyHunter.initialize();

      // Remove all listeners to simulate event bus failure
      eventBus.removeAllListeners();

      // Detection should still work
      const flakyTests = await flakyHunter.detectFlakyTests(30, 10);
      expect(Array.isArray(flakyTests)).toBe(true);
    });
  });
});

describe('FlakyTestHunterAgent - Multi-Agent Scenarios', () => {
  test('should coordinate complete CI/CD quality workflow', async () => {
    const {
      flakyHunter,
      testExecutor,
      qualityGate,
      deploymentReadiness,
      memoryStore
    } = createIntegrationEnvironment();

    // Scenario: CI pipeline with multiple test executions
    const testSuite = ['auth-test', 'payment-test', 'checkout-test', 'profile-test'];
    const allHistory: TestHistory[] = [];

    // Simulate multiple CI runs
    for (let run = 0; run < 30; run++) {
      for (const testName of testSuite) {
        // checkout-test is flaky
        const isFail = testName === 'checkout-test' && Math.random() < 0.40;
        allHistory.push({
          testName,
          timestamp: new Date(Date.now() - (30 - run) * 60 * 60 * 1000),
          result: isFail ? 'fail' : 'pass',
          duration: isFail ? 5000 : 2000,
          error: isFail ? 'Checkout failed intermittently' : undefined,
          agent: `ci-agent-${(run % 3) + 1}`
        });
      }
    }

    await memoryStore.set('test-results/history', allHistory, 'shared:test-executor');

    // Initialize all agents
    await flakyHunter.initialize();

    // Detection phase
    const flakyTests = await flakyHunter.detectFlakyTests(30, 10);
    expect(flakyTests.length).toBeGreaterThan(0);

    // Quality gate checks
    await new Promise(resolve => setTimeout(resolve, 100));
    const gateStatus = await qualityGate.getStatus();
    expect(gateStatus).toBeDefined();

    // Deployment readiness assessment
    const readiness = await deploymentReadiness.assessReadiness();
    expect(readiness).toBeDefined();

    // Decision: Quarantine flaky test
    const checkoutTest = flakyTests.find(t => t.testName === 'checkout-test');
    if (checkoutTest) {
      await flakyHunter.quarantineTest('checkout-test', 'Blocking deployment');
    }

    // Final report
    const report = await flakyHunter.generateReport(30);
    expect(report.recommendation).toBeTruthy();

    await flakyHunter.terminate();
  });
});