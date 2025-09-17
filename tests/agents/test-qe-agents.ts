/**
 * Test Suite for QE Agents
 * Validates all implemented QE agents with mock data
 */

import { describe, it, beforeEach, afterEach, expect } from '@jest/globals';
import {
  ExploratoryTestingNavigator,
  RiskOracle,
  TDDPairProgrammer,
  ProductionObserver,
  DeploymentGuardian,
  createQEAgent,
  getAvailableQEAgents,
  getQEAgentInfo
} from '../../src/agents/qe/index.js';

describe('QE Agents Implementation Tests', () => {

  describe('Agent Factory', () => {
    it('should create agents by type', () => {
      const exploratoryAgent = createQEAgent('exploratory-testing-navigator');
      expect(exploratoryAgent).toBeInstanceOf(ExploratoryTestingNavigator);

      const riskAgent = createQEAgent('risk-oracle');
      expect(riskAgent).toBeInstanceOf(RiskOracle);

      const tddAgent = createQEAgent('tdd-pair-programmer');
      expect(tddAgent).toBeInstanceOf(TDDPairProgrammer);

      const prodAgent = createQEAgent('production-observer');
      expect(prodAgent).toBeInstanceOf(ProductionObserver);

      const deployAgent = createQEAgent('deployment-guardian');
      expect(deployAgent).toBeInstanceOf(DeploymentGuardian);
    });

    it('should throw error for unknown agent type', () => {
      expect(() => createQEAgent('unknown-agent' as any)).toThrow('Unknown QE agent type: unknown-agent');
    });

    it('should return available agent types', () => {
      const types = getAvailableQEAgents();
      expect(types).toContain('exploratory-testing-navigator');
      expect(types).toContain('risk-oracle');
      expect(types).toContain('tdd-pair-programmer');
      expect(types).toContain('production-observer');
      expect(types).toContain('deployment-guardian');
    });

    it('should return agent info', () => {
      const info = getQEAgentInfo('exploratory-testing-navigator');
      expect(info).toBeDefined();
      expect(info.name).toBe('Exploratory Testing Navigator');
      expect(info.capabilities).toContain('exploratory_session_management');
    });
  });

  describe('ExploratoryTestingNavigator', () => {
    let agent: ExploratoryTestingNavigator;

    beforeEach(() => {
      agent = new ExploratoryTestingNavigator();
    });

    it('should initialize properly', async () => {
      await agent.initialize({
        task: 'Test exploratory navigation',
        priority: 'medium',
        strategy: 'adaptive'
      });

      expect(agent.getMetadata().name).toBe('exploratory-testing-navigator');
      expect(agent.hasCapability('exploratory_session_management')).toBe(true);
    });

    it('should execute exploratory testing session', async () => {
      const result = await agent.execute({
        charter: 'Explore user registration flow',
        tourType: 'saboteur',
        target: 'https://example.com',
        timeBox: 30
      });

      expect(result.type).toBe('exploration_findings');
      expect(result.data).toBeDefined();
      expect(result.recommendations).toBeInstanceOf(Array);
      expect(result.severity).toMatch(/info|warning|error|critical/);
    });

    it('should handle tool execution', async () => {
      const sessionId = await agent.handleToolExecution('start_session', {
        charter: 'Test charter',
        tour_type: 'money',
        time_box: 60
      });

      expect(typeof sessionId).toBe('string');
      expect(sessionId).toMatch(/^exploration-/);
    });

    it('should record observations', async () => {
      // First start a session
      await agent.handleToolExecution('start_session', {
        charter: 'Test session',
        tour_type: 'landmark',
        time_box: 30
      });

      const observationId = await agent.handleToolExecution('record_observation', {
        observation: 'Found performance issue',
        category: 'concern',
        severity: 'medium'
      });

      expect(typeof observationId).toBe('string');
      expect(observationId).toMatch(/^obs-/);
    });
  });

  describe('RiskOracle', () => {
    let agent: RiskOracle;

    beforeEach(() => {
      agent = new RiskOracle();
    });

    it('should assess change risk', async () => {
      const result = await agent.execute({
        type: 'assess_risk',
        data: {
          component: 'user-service',
          linesChanged: 150,
          complexity: 5,
          testCoverage: 85
        },
        context: {
          historical: {
            defectDensity: 0.02
          },
          business: {
            userImpact: 0.7,
            revenueImpact: 0.3
          }
        }
      });

      expect(result.type).toBe('risk_assessment');
      expect(result.data.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.data.riskScore).toBeLessThanOrEqual(1);
      expect(result.data.confidence).toBeGreaterThan(0);
    });

    it('should prioritize tests', async () => {
      const testSuite = [
        { id: 'test1', name: 'Login Test', component: 'auth', estimatedTime: 5, tags: ['critical'] },
        { id: 'test2', name: 'Search Test', component: 'search', estimatedTime: 10, tags: ['regression'] },
        { id: 'test3', name: 'Profile Test', component: 'user', estimatedTime: 8, tags: [] }
      ];

      const riskScores = {
        auth: 0.8,
        search: 0.4,
        user: 0.2
      };

      const result = await agent.execute({
        type: 'prioritize_tests',
        data: {
          testSuite,
          riskScores,
          timeConstraint: 20
        }
      });

      expect(result.data).toBeInstanceOf(Array);
      expect(result.data[0].priority).toBeGreaterThanOrEqual(result.data[1]?.priority || 0);
    });

    it('should predict failure likelihood', async () => {
      const result = await agent.execute({
        type: 'predict_failure',
        data: {
          component: 'payment-service',
          changeMetrics: {
            linesChanged: 200,
            complexity: 8,
            hasBreakingChanges: true,
            testCoverage: 70
          }
        }
      });

      expect(result.data.likelihood).toBeGreaterThanOrEqual(0);
      expect(result.data.likelihood).toBeLessThanOrEqual(1);
      expect(result.data.confidence).toBeGreaterThan(0);
      expect(result.data.preventiveMeasures).toBeInstanceOf(Array);
    });
  });

  describe('TDDPairProgrammer', () => {
    let agent: TDDPairProgrammer;

    beforeEach(() => {
      agent = new TDDPairProgrammer();
    });

    it('should start TDD session', async () => {
      const result = await agent.execute({
        action: 'start_session',
        style: 'chicago'
      });

      expect(result.data.style).toBe('chicago');
      expect(result.data.currentCycle.phase).toBe('red');
      expect(result.recommendations).toContain('Follow the RED-GREEN-REFACTOR cycle strictly');
    });

    it('should suggest next test', async () => {
      const existingTests = [
        { name: 'should handle valid input', type: 'unit', assertions: 2 }
      ];

      const result = await agent.execute({
        action: 'suggest_test',
        existingTests,
        code: 'function calculateDiscount(amount) { return amount * 0.1; }',
        style: 'chicago'
      });

      expect(result.data.testName).toBeDefined();
      expect(result.data.reasoning).toBeDefined();
      expect(result.data.priority).toMatch(/high|medium|low/);
    });

    it('should analyze coverage gaps', async () => {
      const code = `
        function processPayment(amount, cardNumber) {
          if (amount <= 0) throw new Error('Invalid amount');
          if (!cardNumber) throw new Error('Card required');
          return { success: true, transactionId: '123' };
        }
      `;

      const testSuite = `
        it('should process valid payment', () => {
          const result = processPayment(100, '1234');
          expect(result.success).toBe(true);
        });
      `;

      const result = await agent.execute({
        action: 'analyze_coverage',
        code,
        tests: testSuite
      });

      expect(result.data.gaps).toBeInstanceOf(Array);
      expect(result.data.gaps.length).toBeGreaterThan(0);
    });

    it('should suggest refactoring opportunities', async () => {
      const code = `
        function calculateTotalPrice(items) {
          let total = 0;
          for (let i = 0; i < items.length; i++) {
            total += items[i].price * items[i].quantity;
          }
          let tax = total * 0.1;
          let shipping = total > 100 ? 0 : 10;
          return total + tax + shipping;
        }
      `;

      const tests = `
        it('should calculate total price', () => {
          const items = [{ price: 10, quantity: 2 }];
          expect(calculateTotalPrice(items)).toBe(32);
        });
      `;

      const result = await agent.execute({
        action: 'suggest_refactoring',
        code,
        tests
      });

      expect(result.data.opportunities).toBeInstanceOf(Array);
      expect(result.data.opportunities.length).toBeGreaterThan(0);
    });
  });

  describe('ProductionObserver', () => {
    let agent: ProductionObserver;

    beforeEach(() => {
      agent = new ProductionObserver();
    });

    it('should detect anomalies', async () => {
      const metrics = {
        response_time: [
          { timestamp: new Date(), value: 100, source: 'api' },
          { timestamp: new Date(), value: 120, source: 'api' },
          { timestamp: new Date(), value: 2000, source: 'api' } // Anomaly
        ]
      };

      const result = await agent.execute({
        action: 'detect_anomalies',
        data: { metrics },
        sensitivity: 'medium'
      });

      expect(result.data.anomalies).toBeInstanceOf(Array);
      expect(result.data.totalMetricsAnalyzed).toBe(3);
    });

    it('should validate user journey', async () => {
      const journey = [
        { name: 'navigate_home', action: 'navigate', target: '/', critical: true, timeout: 5000 },
        { name: 'click_login', action: 'click', target: '.login-btn', critical: true, timeout: 3000 },
        { name: 'verify_login_form', action: 'verify', target: 'login-form', critical: true, timeout: 2000 }
      ];

      const result = await agent.execute({
        action: 'validate_journey',
        data: { journey },
        region: 'us-east-1'
      });

      expect(result.data.journeyId).toBeDefined();
      expect(result.data.stepResults).toBeInstanceOf(Array);
      expect(result.data.region).toBe('us-east-1');
    });

    it('should analyze production incidents', async () => {
      const incident = {
        id: 'inc-123',
        title: 'Database connection timeout',
        description: 'Users experiencing slow response times due to database timeouts',
        severity: 'high' as const,
        startTime: new Date(),
        impactedUsers: 1000,
        impactedServices: ['user-service', 'payment-service']
      };

      const testCoverage = {
        performanceTests: true,
        integrationTests: false,
        serviceTests: ['user-service']
      };

      const result = await agent.execute({
        action: 'analyze_incident',
        data: { incident, testCoverage }
      });

      expect(result.data.gaps).toBeInstanceOf(Array);
      expect(result.data.recommendations).toBeInstanceOf(Array);
    });

    it('should monitor golden signals', async () => {
      const goldenSignalsData = {
        latency: { p50: 50, p95: 100, p99: 200 },
        traffic: { rps: 500, users: 5000 },
        errors: { rate: 0.001, count: 5 },
        saturation: { cpu: 0.6, memory: 0.7, disk: 0.3 }
      };

      const result = await agent.execute({
        action: 'monitor_golden_signals',
        data: goldenSignalsData
      });

      expect(result.data.signals).toBeDefined();
      expect(result.data.healthScore).toBeGreaterThanOrEqual(0);
      expect(result.data.healthScore).toBeLessThanOrEqual(1);
    });
  });

  describe('DeploymentGuardian', () => {
    let agent: DeploymentGuardian;

    beforeEach(() => {
      agent = new DeploymentGuardian();
    });

    it('should generate smoke tests', async () => {
      const changes = [
        { type: 'feature' as const, component: 'user-service', description: 'New user registration', riskLevel: 'medium' as const, testCoverage: 85, codeReviews: 2 },
        { type: 'security' as const, component: 'auth-service', description: 'Enhanced authentication', riskLevel: 'high' as const, testCoverage: 95, codeReviews: 3 }
      ];

      const criticalPaths = ['login', 'checkout'];

      const result = await agent.execute({
        action: 'generate_smoke_tests',
        changes,
        criticalPaths
      });

      expect(result.data.smokeTests).toBeInstanceOf(Array);
      expect(result.data.smokeTests.length).toBeGreaterThan(0);
      expect(result.data.estimatedExecutionTime).toBeGreaterThan(0);
    });

    it('should analyze canary deployment', async () => {
      const baselineMetrics = [
        {
          timestamp: new Date(),
          version: 'baseline' as const,
          metrics: { latency: { p50: 50, p95: 100, p99: 200 }, errorRate: 0.001, throughput: 500 },
          sampleSize: 1000
        }
      ];

      const canaryMetrics = [
        {
          timestamp: new Date(),
          version: 'canary' as const,
          metrics: { latency: { p50: 55, p95: 110, p99: 220 }, errorRate: 0.002, throughput: 480 },
          sampleSize: 100
        }
      ];

      const result = await agent.execute({
        action: 'analyze_canary',
        baselineMetrics,
        canaryMetrics,
        confidenceLevel: 0.95
      });

      expect(result.data.recommendation).toMatch(/proceed|pause|rollback/);
      expect(result.data.reasoning).toBeInstanceOf(Array);
      expect(result.data.statisticalConfidence).toBeGreaterThan(0);
    });

    it('should make rollback decisions', async () => {
      const currentMetrics = {
        errorRate: 0.06, // High error rate
        latency: { p95: 150, p99: 300 },
        activeUsers: 5000
      };

      const thresholds = {
        criticalErrorRate: 0.05,
        warningErrorRate: 0.02,
        criticalLatency: 5000,
        warningLatency: 2000
      };

      const result = await agent.execute({
        action: 'rollback_decision',
        currentMetrics,
        thresholds
      });

      expect(result.data.shouldRollback).toBe(true);
      expect(result.data.urgency).toMatch(/immediate|scheduled|none/);
      expect(result.data.rollbackPlan).toBeInstanceOf(Array);
    });

    it('should validate deployment context', async () => {
      const deploymentId = 'deploy-123';
      const changes = [
        { type: 'feature' as const, component: 'api', description: 'New endpoint', riskLevel: 'low' as const, testCoverage: 90, codeReviews: 2 }
      ];

      const result = await agent.execute({
        action: 'validate_deployment',
        deploymentId,
        changes
      });

      expect(result.data.deploymentId).toBe(deploymentId);
      expect(result.data.riskLevel).toMatch(/low|medium|high|critical/);
      expect(result.data.strategy).toBeDefined();
      expect(result.data.strategy.phases).toBeInstanceOf(Array);
    });
  });

  describe('Agent Integration', () => {
    let exploratoryAgent: ExploratoryTestingNavigator;
    let riskAgent: RiskOracle;
    let tddAgent: TDDPairProgrammer;
    let prodAgent: ProductionObserver;
    let deployAgent: DeploymentGuardian;

    beforeEach(() => {
      exploratoryAgent = new ExploratoryTestingNavigator();
      riskAgent = new RiskOracle();
      tddAgent = new TDDPairProgrammer();
      prodAgent = new ProductionObserver();
      deployAgent = new DeploymentGuardian();
    });

    it('should coordinate between agents', async () => {
      // Simulate a workflow where agents coordinate

      // 1. Exploratory testing finds issues
      const explorationResult = await exploratoryAgent.execute({
        charter: 'Explore payment flow',
        tourType: 'saboteur',
        target: 'payment-service'
      });

      expect(explorationResult.type).toBe('exploration_findings');

      // 2. Risk Oracle assesses the impact
      const riskResult = await riskAgent.execute({
        type: 'assess_risk',
        data: {
          component: 'payment-service',
          issues: explorationResult.data.findings
        }
      });

      expect(riskResult.type).toBe('risk_assessment');

      // 3. TDD agent suggests tests
      const tddResult = await tddAgent.execute({
        action: 'suggest_test',
        existingTests: [],
        code: 'payment service code'
      });

      expect(tddResult.data.testName).toBeDefined();

      // 4. Production observer monitors deployment
      const prodResult = await prodAgent.execute({
        action: 'monitor_golden_signals',
        data: {
          latency: { p50: 50, p95: 100, p99: 200 },
          traffic: { rps: 500, users: 5000 },
          errors: { rate: 0.001, count: 5 },
          saturation: { cpu: 0.6, memory: 0.7, disk: 0.3 }
        }
      });

      expect(prodResult.data.healthScore).toBeDefined();

      // 5. Deployment guardian validates safety
      const deployResult = await deployAgent.execute({
        action: 'validate_deployment',
        deploymentId: 'test-deploy',
        changes: [{
          type: 'bugfix',
          component: 'payment-service',
          description: 'Fix found in exploration',
          riskLevel: 'medium',
          testCoverage: 85,
          codeReviews: 2
        }]
      });

      expect(deployResult.data.riskLevel).toBeDefined();
    });
  });
});

describe('Agent Memory and State Management', () => {
  let agent: ExploratoryTestingNavigator;

  beforeEach(() => {
    agent = new ExploratoryTestingNavigator();
  });

  it('should manage agent state across sessions', async () => {
    await agent.initialize({
      task: 'Test state management',
      priority: 'medium',
      strategy: 'adaptive'
    });

    // Start a session
    const result1 = await agent.execute({
      charter: 'Test session 1',
      tourType: 'landmark'
    });

    expect(result1.data.sessionId).toBeDefined();

    // Agent should maintain state between calls
    const activeSessions = await agent.getActiveSessions();
    expect(activeSessions.length).toBeGreaterThan(0);
  });

  it('should share findings between agents', async () => {
    await agent.initialize();

    const result = await agent.execute({
      charter: 'Test sharing',
      tourType: 'money'
    });

    // Should be able to share findings
    await expect(agent.shareFindings('risk-oracle')).resolves.not.toThrow();
  });
});

describe('Error Handling and Edge Cases', () => {
  let agent: RiskOracle;

  beforeEach(() => {
    agent = new RiskOracle();
  });

  it('should handle invalid input gracefully', async () => {
    const result = await agent.execute({
      type: 'assess_risk',
      data: null // Invalid input
    });

    expect(result.severity).toBe('error');
    expect(result.data.error).toBeDefined();
  });

  it('should handle missing data', async () => {
    const result = await agent.execute({
      type: 'prioritize_tests',
      data: {
        testSuite: [],
        riskScores: {}
      }
    });

    expect(result.type).toBe('risk_assessment');
    expect(result.data).toBeInstanceOf(Array);
  });

  it('should handle unknown actions', async () => {
    const result = await agent.execute({
      type: 'unknown_action' as any,
      data: {}
    });

    expect(result.severity).toBe('error');
    expect(result.data.error).toContain('Unknown risk analysis type');
  });
});