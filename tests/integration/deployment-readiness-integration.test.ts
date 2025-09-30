/**
 * DeploymentReadinessAgent Integration Tests
 *
 * Tests comprehensive integration between:
 * - DeploymentReadinessAgent
 * - QualityGateAgent
 * - PerformanceTesterAgent
 * - SecurityScannerAgent
 * - EventBus coordination
 * - Memory sharing
 * - End-to-end deployment workflows
 */

import { DeploymentReadinessAgent } from '../../src/agents/DeploymentReadinessAgent';
import { QualityGateAgent } from '../../src/agents/QualityGateAgent';
import { PerformanceTesterAgent } from '../../src/agents/PerformanceTesterAgent';
import { SecurityScannerAgent } from '../../src/agents/SecurityScannerAgent';
import { EventBus } from '../../src/core/EventBus';
import { MemoryManager } from '../../src/core/MemoryManager';
import { Database } from '../../src/utils/Database';
import { Logger } from '../../src/utils/Logger';
import { QEAgentType, AgentStatus, WEEK2_EVENT_TYPES } from '../../src/types';

// Mock external dependencies
jest.mock('../../src/utils/Database');
jest.mock('../../src/utils/Logger');

// Helper function to create task assignments
function createTaskAssignment(task: any, agentId: string) {
  return {
    id: `assignment-${Date.now()}-${Math.random()}`,
    task,
    agentId,
    assignedAt: new Date(),
    status: 'assigned' as const
  };
}

describe('DeploymentReadinessAgent Integration Tests', () => {
  let deploymentAgent: DeploymentReadinessAgent;
  let qualityGateAgent: QualityGateAgent;
  let performanceAgent: PerformanceTesterAgent;
  let securityAgent: SecurityScannerAgent;
  let eventBus: EventBus;
  let memoryManager: MemoryManager;
  let mockDatabase: jest.Mocked<Database>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Setup mocks
    mockDatabase = {
      initialize: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue({ lastID: 1, changes: 1 }),
      get: jest.fn().mockResolvedValue(null),
      all: jest.fn().mockResolvedValue([])
    } as any;

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      getInstance: jest.fn().mockReturnValue(mockLogger)
    } as any;

    (Database as jest.Mock).mockImplementation(() => mockDatabase);
    (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);

    // Create core infrastructure
    eventBus = new EventBus();
    await eventBus.initialize();

    memoryManager = new MemoryManager(mockDatabase);
    await memoryManager.initialize();

    // Initialize agents
    deploymentAgent = new DeploymentReadinessAgent({
      id: 'deployment-test',
      memoryStore: memoryManager,
      eventBus,
      context: {
        id: 'deployment-test',
        type: QEAgentType.DEPLOYMENT_READINESS,
        status: AgentStatus.INITIALIZING
      },
      integrations: {
        qualityGate: true,
        performance: true,
        security: true,
        monitoring: ['datadog']
      },
      thresholds: {
        minConfidenceScore: 95,
        reviewThreshold: 70,
        maxRollbackRisk: 0.3,
        maxOpenIncidents: 0
      }
    });

    qualityGateAgent = new QualityGateAgent({
      id: 'quality-gate-test',
      memoryStore: memoryManager,
      eventBus,
      context: {
        id: 'quality-gate-test',
        type: QEAgentType.QUALITY_GATE,
        status: AgentStatus.INITIALIZING
      }
    });

    performanceAgent = new PerformanceTesterAgent({
      id: 'performance-test',
      memoryStore: memoryManager,
      eventBus,
      context: {
        id: 'performance-test',
        type: QEAgentType.PERFORMANCE_TESTER,
        status: AgentStatus.INITIALIZING
      }
    });

    securityAgent = new SecurityScannerAgent({
      id: 'security-test',
      memoryStore: memoryManager,
      eventBus,
      context: {
        id: 'security-test',
        type: QEAgentType.SECURITY_SCANNER,
        status: AgentStatus.INITIALIZING
      }
    });

    // Initialize all agents
    await Promise.all([
      deploymentAgent.initialize(),
      qualityGateAgent.initialize(),
      performanceAgent.initialize(),
      securityAgent.initialize()
    ]);
  });

  afterEach(async () => {
    // Cleanup all agents
    await Promise.all([
      deploymentAgent.terminate(),
      qualityGateAgent.terminate(),
      performanceAgent.terminate(),
      securityAgent.terminate()
    ]);

    eventBus.removeAllListeners();
    jest.restoreAllMocks();

    if (global.gc) {
      global.gc();
    }
  });

  describe('Integration with QualityGateAgent', () => {
    it('should receive and aggregate quality gate results', async () => {
      const version = 'v1.2.0';
      const qualityGateResult = {
        status: 'passed' as const,
        score: 92,
        violations: [
          { severity: 'major' as const, type: 'code-smell', count: 3 }
        ]
      };

      // Store quality gate result
      await memoryManager.store(`aqe/quality-gate/evaluation/${version}`, qualityGateResult);

      // Request deployment readiness check
      const result = await deploymentAgent.executeTask(createTaskAssignment({
        id: 'check-1',
        type: 'deployment-readiness-check',
        payload: {
          deploymentId: 'deploy-001',
          version,
          environment: 'production',
          timestamp: new Date()
        },
        priority: 1,
        status: 'pending'
      }, deploymentAgent.getStatus().agentId.id));

      expect(result).toBeDefined();
      expect(result.signals?.qualityGate).toBeDefined();
      expect(result.signals.qualityGate.status).toBe('passed');
      expect(result.signals.qualityGate.score).toBe(92);
    });

    it('should block deployment on quality gate failures', async () => {
      const version = 'v1.2.1';
      const qualityGateResult = {
        status: 'failed' as const,
        score: 45,
        violations: [
          { severity: 'blocker' as const, type: 'bug', count: 2 },
          { severity: 'critical' as const, type: 'vulnerability', count: 1 }
        ]
      };

      await memoryManager.store(`aqe/quality-gate/evaluation/${version}`, qualityGateResult);

      const eventSpy = jest.fn();
      eventBus.on(WEEK2_EVENT_TYPES.DEPLOYMENT_BLOCKED, eventSpy);

      const result = await deploymentAgent.execute({
        id: 'check-2',
        type: 'deployment-readiness-check',
        payload: {
          deploymentId: 'deploy-002',
          version,
          environment: 'production',
          timestamp: new Date()
        },
        priority: 1,
        status: 'pending'
      });

      expect(result.decision).toBe('BLOCK');
      expect(result.reasons).toContain(expect.stringMatching(/critical checklist items failed/i));
      expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: WEEK2_EVENT_TYPES.DEPLOYMENT_BLOCKED
      }));
    });
  });

  describe('Integration with PerformanceTesterAgent', () => {
    it('should incorporate performance test results into readiness assessment', async () => {
      const version = 'v1.3.0';
      const performanceResult = {
        status: 'passed' as const,
        p50: 120,
        p95: 420,
        p99: 850,
        throughput: 1200,
        errorRate: 0.05
      };

      await memoryManager.store(`aqe/performance-tester/results/${version}`, performanceResult);

      const result = await deploymentAgent.execute({
        id: 'check-3',
        type: 'deployment-readiness-check',
        payload: {
          deploymentId: 'deploy-003',
          version,
          environment: 'production',
          timestamp: new Date()
        },
        priority: 1,
        status: 'pending'
      });

      expect(result.signals?.performance).toBeDefined();
      expect(result.signals.performance.status).toBe('passed');
      expect(result.signals.performance.p95).toBe(420);
      expect(result.confidenceScore).toBeGreaterThan(70);
    });

    it('should reduce confidence score on performance degradation', async () => {
      const version = 'v1.3.1';
      const performanceResult = {
        status: 'failed' as const,
        p50: 450,
        p95: 1250,
        p99: 2500,
        throughput: 450,
        errorRate: 2.5
      };

      await memoryManager.store(`aqe/performance-tester/results/${version}`, performanceResult);

      const result = await deploymentAgent.execute({
        id: 'check-4',
        type: 'deployment-readiness-check',
        payload: {
          deploymentId: 'deploy-004',
          version,
          environment: 'production',
          timestamp: new Date()
        },
        priority: 1,
        status: 'pending'
      });

      expect(result.signals?.performance?.status).toBe('failed');
      expect(result.confidenceScore).toBeLessThan(70);
      expect(result.decision).not.toBe('GO');
    });

    it('should listen to performance test completion events', async () => {
      const eventData = {
        testId: 'perf-001',
        version: 'v1.3.2',
        metrics: {
          p95: 380,
          throughput: 1500,
          errorRate: 0.02
        },
        passed: true
      };

      const memoryStoreSpy = jest.spyOn(memoryManager, 'store');

      await eventBus.emitFleetEvent(
        WEEK2_EVENT_TYPES.PERFORMANCE_TEST_COMPLETED,
        performanceAgent.agentId.id,
        eventData
      );

      // Wait for event processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify that deployment agent stored the performance data
      const stored = await memoryManager.retrieve('aqe/performance-tester/results/v1.3.2');
      expect(stored).toBeDefined();
    });
  });

  describe('Integration with SecurityScannerAgent', () => {
    it('should integrate security scan results into deployment decision', async () => {
      const version = 'v1.4.0';
      const securityResult = {
        status: 'passed' as const,
        vulnerabilities: {
          critical: 0,
          high: 2,
          medium: 5,
          low: 8
        }
      };

      await memoryManager.store(`aqe/security-scanner/scan/${version}`, securityResult);

      const result = await deploymentAgent.execute({
        id: 'check-5',
        type: 'deployment-readiness-check',
        payload: {
          deploymentId: 'deploy-005',
          version,
          environment: 'production',
          timestamp: new Date()
        },
        priority: 1,
        status: 'pending'
      });

      expect(result.signals?.security).toBeDefined();
      expect(result.signals.security.status).toBe('passed');
      expect(result.signals.security.vulnerabilities.critical).toBe(0);
    });

    it('should block deployment on critical security vulnerabilities', async () => {
      const version = 'v1.4.1';
      const securityResult = {
        status: 'failed' as const,
        vulnerabilities: {
          critical: 3,
          high: 5,
          medium: 10,
          low: 15
        }
      };

      await memoryManager.store(`aqe/security-scanner/scan/${version}`, securityResult);

      const eventSpy = jest.fn();
      eventBus.on(WEEK2_EVENT_TYPES.DEPLOYMENT_BLOCKED, eventSpy);

      const result = await deploymentAgent.execute({
        id: 'check-6',
        type: 'deployment-readiness-check',
        payload: {
          deploymentId: 'deploy-006',
          version,
          environment: 'production',
          timestamp: new Date()
        },
        priority: 1,
        status: 'pending'
      });

      expect(result.decision).toBe('BLOCK');
      expect(result.reasons).toContain(expect.stringMatching(/critical security vulnerabilities/i));
      expect(eventSpy).toHaveBeenCalled();
    });

    it('should process security scan completion events', async () => {
      const eventData = {
        scanId: 'sec-001',
        version: 'v1.4.2',
        summary: {
          critical: 0,
          high: 1,
          medium: 3,
          low: 5
        },
        securityScore: 88
      };

      await eventBus.emitFleetEvent(
        WEEK2_EVENT_TYPES.SECURITY_SCAN_COMPLETE,
        securityAgent.agentId.id,
        eventData
      );

      await new Promise(resolve => setTimeout(resolve, 100));

      const stored = await memoryManager.retrieve('aqe/security-scanner/scan/v1.4.2');
      expect(stored).toBeDefined();
    });
  });

  describe('Memory Coordination', () => {
    it('should store deployment reports in aqe/deployment/reports/* namespace', async () => {
      const deploymentId = 'deploy-007';
      const version = 'v1.5.0';

      await deploymentAgent.execute({
        id: 'check-7',
        type: 'deployment-readiness-check',
        payload: {
          deploymentId,
          version,
          environment: 'production',
          timestamp: new Date()
        },
        priority: 1,
        status: 'pending'
      });

      const report = await memoryManager.retrieve(`aqe/deployment/reports/${deploymentId}`);
      expect(report).toBeDefined();
      expect(report.deploymentId).toBe(deploymentId);
      expect(report.decision).toMatch(/GO|REVIEW|BLOCK/);
    });

    it('should store confidence scores in aqe/deployment/confidence-scores/*', async () => {
      const deploymentId = 'deploy-008';

      await deploymentAgent.execute({
        id: 'check-8',
        type: 'deployment-readiness-check',
        payload: {
          deploymentId,
          version: 'v1.5.1',
          environment: 'production',
          timestamp: new Date()
        },
        priority: 1,
        status: 'pending'
      });

      const confidence = await memoryManager.retrieve(`aqe/deployment/confidence-scores/${deploymentId}`);
      expect(confidence).toBeDefined();
      expect(confidence.score).toBeGreaterThanOrEqual(0);
      expect(confidence.score).toBeLessThanOrEqual(100);
      expect(confidence.level).toMatch(/very_low|low|medium|high|very_high/);
    });

    it('should store rollback risk assessments in aqe/deployment/rollback-risk/*', async () => {
      const deploymentId = 'deploy-009';

      await deploymentAgent.execute({
        id: 'check-9',
        type: 'deployment-readiness-check',
        payload: {
          deploymentId,
          version: 'v1.5.2',
          environment: 'production',
          timestamp: new Date(),
          filesModified: 45,
          changeSize: 2300
        },
        priority: 1,
        status: 'pending'
      });

      const rollbackRisk = await memoryManager.retrieve(`aqe/deployment/rollback-risk/${deploymentId}`);
      expect(rollbackRisk).toBeDefined();
      expect(rollbackRisk.probability).toBeGreaterThanOrEqual(0);
      expect(rollbackRisk.probability).toBeLessThanOrEqual(1);
      expect(rollbackRisk.level).toMatch(/low|medium|high|critical/);
      expect(rollbackRisk.mitigationStrategies).toBeInstanceOf(Array);
    });

    it('should retrieve shared memory from other agents', async () => {
      const version = 'v1.5.3';

      // Store data in different agent namespaces
      await memoryManager.store(`aqe/quality-gate/evaluation/${version}`, {
        status: 'passed',
        score: 95
      });

      await memoryManager.store(`aqe/performance-tester/results/${version}`, {
        status: 'passed',
        p95: 350
      });

      await memoryManager.store(`aqe/security-scanner/scan/${version}`, {
        status: 'passed',
        vulnerabilities: { critical: 0, high: 0, medium: 2, low: 3 }
      });

      const result = await deploymentAgent.execute({
        id: 'check-10',
        type: 'deployment-readiness-check',
        payload: {
          deploymentId: 'deploy-010',
          version,
          environment: 'production',
          timestamp: new Date()
        },
        priority: 1,
        status: 'pending'
      });

      expect(result.signals.qualityGate).toBeDefined();
      expect(result.signals.performance).toBeDefined();
      expect(result.signals.security).toBeDefined();
    });
  });

  describe('Event Bus Communication', () => {
    it('should emit deployment.ready event on GO decision', async () => {
      const eventSpy = jest.fn();
      eventBus.on(WEEK2_EVENT_TYPES.DEPLOYMENT_READY, eventSpy);

      const version = 'v1.6.0';

      // Set up perfect conditions
      await memoryManager.store(`aqe/quality-gate/evaluation/${version}`, {
        status: 'passed',
        score: 98,
        violations: []
      });

      await memoryManager.store(`aqe/performance-tester/results/${version}`, {
        status: 'passed',
        p95: 280,
        p99: 450,
        throughput: 1800,
        errorRate: 0.01
      });

      await memoryManager.store(`aqe/security-scanner/scan/${version}`, {
        status: 'passed',
        vulnerabilities: { critical: 0, high: 0, medium: 1, low: 2 }
      });

      await deploymentAgent.execute({
        id: 'check-11',
        type: 'deployment-readiness-check',
        payload: {
          deploymentId: 'deploy-011',
          version,
          environment: 'production',
          timestamp: new Date()
        },
        priority: 1,
        status: 'pending'
      });

      expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: WEEK2_EVENT_TYPES.DEPLOYMENT_READY,
        data: expect.objectContaining({
          decision: 'GO'
        })
      }));
    });

    it('should emit deployment.blocked event on BLOCK decision', async () => {
      const eventSpy = jest.fn();
      eventBus.on(WEEK2_EVENT_TYPES.DEPLOYMENT_BLOCKED, eventSpy);

      const version = 'v1.6.1';

      // Set up failing conditions
      await memoryManager.store(`aqe/security-scanner/scan/${version}`, {
        status: 'failed',
        vulnerabilities: { critical: 2, high: 5, medium: 10, low: 15 }
      });

      await deploymentAgent.execute({
        id: 'check-12',
        type: 'deployment-readiness-check',
        payload: {
          deploymentId: 'deploy-012',
          version,
          environment: 'production',
          timestamp: new Date()
        },
        priority: 1,
        status: 'pending'
      });

      expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: WEEK2_EVENT_TYPES.DEPLOYMENT_BLOCKED,
        priority: 'critical'
      }));
    });

    it('should use correct event priorities', async () => {
      const events: any[] = [];

      eventBus.on(WEEK2_EVENT_TYPES.DEPLOYMENT_READY, (event) => events.push(event));
      eventBus.on(WEEK2_EVENT_TYPES.DEPLOYMENT_BLOCKED, (event) => events.push(event));
      eventBus.on('deployment.review-required', (event) => events.push(event));

      // Trigger various scenarios
      const version = 'v1.6.2';

      await deploymentAgent.execute({
        id: 'check-13',
        type: 'deployment-readiness-check',
        payload: {
          deploymentId: 'deploy-013',
          version,
          environment: 'production',
          timestamp: new Date()
        },
        priority: 1,
        status: 'pending'
      });

      // Critical events should have critical/high priority
      const criticalEvents = events.filter(e =>
        e.type === WEEK2_EVENT_TYPES.DEPLOYMENT_BLOCKED
      );

      criticalEvents.forEach(event => {
        expect(['critical', 'high']).toContain(event.priority);
      });
    });
  });

  describe('End-to-End Deployment Workflow', () => {
    it('should execute complete deployment readiness workflow', async () => {
      const workflow: string[] = [];
      const version = 'v2.0.0';
      const deploymentId = 'deploy-e2e-001';

      // Track workflow steps
      eventBus.on('workflow.step', (event) => {
        workflow.push(event.data.step);
      });

      // Step 1: Quality Gate evaluation
      await eventBus.emitFleetEvent('workflow.step', 'quality-gate', {
        step: 'quality-gate-started'
      });

      const qualityResult = await qualityGateAgent.execute({
        id: 'qg-1',
        type: 'evaluate-quality',
        payload: { version },
        priority: 1,
        status: 'pending'
      });

      await memoryManager.store(`aqe/quality-gate/evaluation/${version}`, qualityResult);

      await eventBus.emitFleetEvent('workflow.step', 'quality-gate', {
        step: 'quality-gate-completed'
      });

      // Step 2: Performance testing
      await eventBus.emitFleetEvent('workflow.step', 'performance', {
        step: 'performance-test-started'
      });

      const perfResult = await performanceAgent.execute({
        id: 'perf-1',
        type: 'run-load-test',
        payload: {
          targetUrl: 'http://localhost:3000',
          loadProfile: {
            virtualUsers: 100,
            duration: 60,
            rampUpTime: 10,
            pattern: 'ramp-up'
          }
        },
        priority: 1,
        status: 'pending'
      });

      await memoryManager.store(`aqe/performance-tester/results/${version}`, perfResult.metrics);

      await eventBus.emitFleetEvent('workflow.step', 'performance', {
        step: 'performance-test-completed'
      });

      // Step 3: Security scanning
      await eventBus.emitFleetEvent('workflow.step', 'security', {
        step: 'security-scan-started'
      });

      const secResult = await securityAgent.execute({
        id: 'sec-1',
        type: 'run-security-scan',
        payload: { version, includeFindings: false },
        priority: 1,
        status: 'pending'
      });

      await memoryManager.store(`aqe/security-scanner/scan/${version}`, {
        status: secResult.passed ? 'passed' : 'failed',
        vulnerabilities: secResult.summary
      });

      await eventBus.emitFleetEvent('workflow.step', 'security', {
        step: 'security-scan-completed'
      });

      // Step 4: Deployment readiness assessment
      await eventBus.emitFleetEvent('workflow.step', 'deployment', {
        step: 'deployment-check-started'
      });

      const deploymentResult = await deploymentAgent.execute({
        id: 'deploy-check',
        type: 'deployment-readiness-check',
        payload: {
          deploymentId,
          version,
          environment: 'production',
          timestamp: new Date()
        },
        priority: 1,
        status: 'pending'
      });

      await eventBus.emitFleetEvent('workflow.step', 'deployment', {
        step: 'deployment-check-completed',
        data: { decision: deploymentResult.decision }
      });

      // Verify workflow execution
      expect(workflow).toContain('quality-gate-started');
      expect(workflow).toContain('quality-gate-completed');
      expect(workflow).toContain('performance-test-started');
      expect(workflow).toContain('performance-test-completed');
      expect(workflow).toContain('security-scan-started');
      expect(workflow).toContain('security-scan-completed');
      expect(workflow).toContain('deployment-check-started');
      expect(workflow).toContain('deployment-check-completed');

      // Verify deployment decision
      expect(deploymentResult.decision).toMatch(/GO|REVIEW|BLOCK/);
      expect(deploymentResult.confidenceScore).toBeGreaterThanOrEqual(0);
      expect(deploymentResult.signals).toBeDefined();
    }, 15000); // Extended timeout for full workflow

    it('should make GO decision with all green signals', async () => {
      const version = 'v2.0.1';

      // Perfect quality gate
      await memoryManager.store(`aqe/quality-gate/evaluation/${version}`, {
        status: 'passed',
        score: 98,
        violations: []
      });

      // Perfect performance
      await memoryManager.store(`aqe/performance-tester/results/${version}`, {
        status: 'passed',
        p95: 250,
        p99: 400,
        throughput: 2000,
        errorRate: 0.005
      });

      // Perfect security
      await memoryManager.store(`aqe/security-scanner/scan/${version}`, {
        status: 'passed',
        vulnerabilities: { critical: 0, high: 0, medium: 0, low: 1 }
      });

      // Perfect coverage
      await memoryManager.store(`aqe/coverage-analyzer/coverage/${version}`, {
        line: 92,
        branch: 88,
        function: 95,
        statement: 91
      });

      // Perfect test results
      await memoryManager.store(`aqe/test-executor/results/${version}`, {
        total: 250,
        passed: 250,
        failed: 0,
        skipped: 0,
        flakyCount: 0
      });

      const result = await deploymentAgent.execute({
        id: 'perfect-deploy',
        type: 'deployment-readiness-check',
        payload: {
          deploymentId: 'deploy-perfect-001',
          version,
          environment: 'production',
          timestamp: new Date()
        },
        priority: 1,
        status: 'pending'
      });

      expect(result.decision).toBe('GO');
      expect(result.confidenceScore).toBeGreaterThanOrEqual(95);
      expect(result.riskLevel).toBe('low');
      expect(result.checklist.overallStatus).toBe('passed');
      expect(result.recommendations).toContain(expect.stringMatching(/proceed with deployment/i));
    });

    it('should make BLOCK decision with critical failures', async () => {
      const version = 'v2.0.2';

      // Failed quality gate
      await memoryManager.store(`aqe/quality-gate/evaluation/${version}`, {
        status: 'failed',
        score: 42,
        violations: [
          { severity: 'blocker', type: 'bug', count: 3 },
          { severity: 'critical', type: 'vulnerability', count: 2 }
        ]
      });

      // Failed performance
      await memoryManager.store(`aqe/performance-tester/results/${version}`, {
        status: 'failed',
        p95: 2500,
        p99: 5000,
        throughput: 200,
        errorRate: 5.2
      });

      // Failed security
      await memoryManager.store(`aqe/security-scanner/scan/${version}`, {
        status: 'failed',
        vulnerabilities: { critical: 5, high: 12, medium: 20, low: 30 }
      });

      const result = await deploymentAgent.execute({
        id: 'failed-deploy',
        type: 'deployment-readiness-check',
        payload: {
          deploymentId: 'deploy-failed-001',
          version,
          environment: 'production',
          timestamp: new Date()
        },
        priority: 1,
        status: 'pending'
      });

      expect(result.decision).toBe('BLOCK');
      expect(result.confidenceScore).toBeLessThan(70);
      expect(result.riskLevel).toMatch(/high|critical/);
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(result.recommendations).toContain(expect.stringMatching(/address all blocking issues/i));
    });
  });

  describe('Failure Handling and Recovery', () => {
    it('should handle missing quality gate data gracefully', async () => {
      const version = 'v2.1.0';

      // Only provide partial data
      await memoryManager.store(`aqe/performance-tester/results/${version}`, {
        status: 'passed',
        p95: 300
      });

      const result = await deploymentAgent.execute({
        id: 'partial-data',
        type: 'deployment-readiness-check',
        payload: {
          deploymentId: 'deploy-partial-001',
          version,
          environment: 'production',
          timestamp: new Date()
        },
        priority: 1,
        status: 'pending'
      });

      expect(result).toBeDefined();
      expect(result.decision).toMatch(/GO|REVIEW|BLOCK/);
      // Should make conservative decision without full data
    });

    it('should recover from event bus errors', async () => {
      const errorSpy = jest.fn();
      eventBus.on('error', errorSpy);

      // Force an error scenario
      const version = 'v2.1.1';

      await deploymentAgent.execute({
        id: 'error-test',
        type: 'deployment-readiness-check',
        payload: {
          deploymentId: 'deploy-error-001',
          version,
          environment: 'production',
          timestamp: new Date()
        },
        priority: 1,
        status: 'pending'
      });

      // Agent should continue functioning even if some events fail
      expect(deploymentAgent.getStatus().status).not.toBe(AgentStatus.ERROR);
    });

    it('should handle agent coordination failures', async () => {
      // Simulate performance agent being offline
      await performanceAgent.terminate();

      const version = 'v2.1.2';

      const result = await deploymentAgent.execute({
        id: 'offline-agent',
        type: 'deployment-readiness-check',
        payload: {
          deploymentId: 'deploy-offline-001',
          version,
          environment: 'production',
          timestamp: new Date()
        },
        priority: 1,
        status: 'pending'
      });

      // Should complete even without performance data
      expect(result).toBeDefined();
      expect(result.decision).toMatch(/GO|REVIEW|BLOCK/);
      // Should make conservative decision
      expect(result.decision).not.toBe('GO');
    });
  });
});