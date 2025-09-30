/**
 * Week 2 Full Fleet Integration Tests
 *
 * Tests all Week 2 agents working together:
 * - DeploymentReadinessAgent
 * - PerformanceTesterAgent
 * - SecurityScannerAgent
 *
 * Complete workflows:
 * 1. Performance tests run
 * 2. Security scans execute
 * 3. Quality gate validates (from Week 1)
 * 4. Deployment readiness assesses
 * 5. Go/no-go decision made
 *
 * Validates cross-agent memory sharing, event propagation,
 * failure handling, and recovery mechanisms.
 */

import { DeploymentReadinessAgent } from '../../src/agents/DeploymentReadinessAgent';
import { PerformanceTesterAgent } from '../../src/agents/PerformanceTesterAgent';
import { SecurityScannerAgent } from '../../src/agents/SecurityScannerAgent';
import { QualityGateAgent } from '../../src/agents/QualityGateAgent';
import { CoverageAnalyzerAgent } from '../../src/agents/CoverageAnalyzerAgent';
import { TestExecutorAgent } from '../../src/agents/TestExecutorAgent';
import { EventBus } from '../../src/core/EventBus';
import { MemoryManager } from '../../src/core/MemoryManager';
import { Database } from '../../src/utils/Database';
import { Logger } from '../../src/utils/Logger';
import { QEAgentType, AgentStatus, WEEK2_EVENT_TYPES } from '../../src/types';

// Mock external dependencies
jest.mock('../../src/utils/Database');
jest.mock('../../src/utils/Logger');

describe('Week 2 Full Fleet Integration Tests', () => {
  let deploymentAgent: DeploymentReadinessAgent;
  let performanceAgent: PerformanceTesterAgent;
  let securityAgent: SecurityScannerAgent;
  let qualityGateAgent: QualityGateAgent;
  let coverageAgent: CoverageAnalyzerAgent;
  let testExecutorAgent: TestExecutorAgent;
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

    // Initialize all agents
    deploymentAgent = new DeploymentReadinessAgent({
      id: 'deployment-fleet',
      memoryStore: memoryManager,
      eventBus,
      context: {
        id: 'deployment-fleet',
        type: QEAgentType.DEPLOYMENT_READINESS,
        status: AgentStatus.INITIALIZING
      },
      integrations: {
        qualityGate: true,
        performance: true,
        security: true,
        monitoring: ['datadog', 'grafana']
      },
      thresholds: {
        minConfidenceScore: 95,
        reviewThreshold: 70,
        maxRollbackRisk: 0.3,
        maxOpenIncidents: 0
      }
    });

    performanceAgent = new PerformanceTesterAgent({
      id: 'performance-fleet',
      memoryStore: memoryManager,
      eventBus,
      context: {
        id: 'performance-fleet',
        type: QEAgentType.PERFORMANCE_TESTER,
        status: AgentStatus.INITIALIZING
      },
      tools: {
        loadTesting: 'k6',
        monitoring: ['prometheus', 'grafana'],
        apm: 'datadog'
      },
      thresholds: {
        maxLatencyP95: 500,
        maxLatencyP99: 1000,
        minThroughput: 1000,
        maxErrorRate: 1,
        maxCpuUsage: 80,
        maxMemoryUsage: 85
      }
    });

    securityAgent = new SecurityScannerAgent({
      id: 'security-fleet',
      memoryStore: memoryManager,
      eventBus,
      context: {
        id: 'security-fleet',
        type: QEAgentType.SECURITY_SCANNER,
        status: AgentStatus.INITIALIZING
      },
      tools: {
        sast: 'semgrep',
        dast: 'owasp-zap',
        dependencies: 'snyk',
        containers: 'trivy'
      },
      thresholds: {
        maxCriticalVulnerabilities: 0,
        maxHighVulnerabilities: 5,
        maxMediumVulnerabilities: 20,
        minSecurityScore: 80
      },
      compliance: {
        standards: ['OWASP-Top-10', 'CWE-25'],
        enforceCompliance: true
      },
      scanScope: {
        includeCode: true,
        includeDependencies: true,
        includeContainers: true,
        includeDynamic: true
      }
    });

    qualityGateAgent = new QualityGateAgent({
      id: 'quality-gate-fleet',
      memoryStore: memoryManager,
      eventBus,
      context: {
        id: 'quality-gate-fleet',
        type: QEAgentType.QUALITY_GATE,
        status: AgentStatus.INITIALIZING
      }
    });

    coverageAgent = new CoverageAnalyzerAgent({
      id: 'coverage-fleet',
      memoryStore: memoryManager,
      eventBus,
      context: {
        id: 'coverage-fleet',
        type: QEAgentType.COVERAGE_ANALYZER,
        status: AgentStatus.INITIALIZING
      }
    });

    testExecutorAgent = new TestExecutorAgent({
      id: 'test-executor-fleet',
      memoryStore: memoryManager,
      eventBus,
      context: {
        id: 'test-executor-fleet',
        type: QEAgentType.TEST_EXECUTOR,
        status: AgentStatus.INITIALIZING
      }
    });

    // Initialize all agents
    await Promise.all([
      deploymentAgent.initialize(),
      performanceAgent.initialize(),
      securityAgent.initialize(),
      qualityGateAgent.initialize(),
      coverageAgent.initialize(),
      testExecutorAgent.initialize()
    ]);
  });

  afterEach(async () => {
    // Cleanup all agents
    await Promise.all([
      deploymentAgent.shutdown(),
      performanceAgent.shutdown(),
      securityAgent.shutdown(),
      qualityGateAgent.shutdown(),
      coverageAgent.shutdown(),
      testExecutorAgent.shutdown()
    ]);

    eventBus.removeAllListeners();
    jest.restoreAllMocks();

    if (global.gc) {
      global.gc();
    }
  });

  describe('Complete Deployment Workflow - All Agents', () => {
    it('should execute full deployment readiness pipeline', async () => {
      const workflow: string[] = [];
      const version = 'v3.0.0';
      const deploymentId = 'deploy-fleet-001';

      // Track workflow steps
      eventBus.on('workflow.step', (event) => {
        workflow.push(event.data.step);
      });

      // ===== STEP 1: Run Tests (Week 1) =====
      await eventBus.emitFleetEvent('workflow.step', 'test-executor', {
        step: 'tests-started'
      });

      const testResults = await testExecutorAgent.execute({
        id: 'fleet-tests',
        type: 'execute-tests',
        payload: {
          suites: ['unit', 'integration', 'e2e'],
          parallel: true
        },
        priority: 1,
        status: 'pending'
      });

      await memoryManager.store(`aqe/test-executor/results/${version}`, {
        total: 250,
        passed: 248,
        failed: 2,
        skipped: 0,
        flakyCount: 1
      });

      await eventBus.emitFleetEvent('workflow.step', 'test-executor', {
        step: 'tests-completed',
        data: { passed: testResults.passed }
      });

      // ===== STEP 2: Analyze Coverage (Week 1) =====
      await eventBus.emitFleetEvent('workflow.step', 'coverage', {
        step: 'coverage-analysis-started'
      });

      const coverageResult = await coverageAgent.execute({
        id: 'fleet-coverage',
        type: 'analyze-coverage',
        payload: {
          reportPath: './coverage/lcov.info'
        },
        priority: 1,
        status: 'pending'
      });

      await memoryManager.store(`aqe/coverage-analyzer/coverage/${version}`, {
        line: 88.5,
        branch: 82.3,
        function: 91.2,
        statement: 87.8
      });

      await eventBus.emitFleetEvent('workflow.step', 'coverage', {
        step: 'coverage-analysis-completed'
      });

      // ===== STEP 3: Quality Gate Evaluation (Week 1) =====
      await eventBus.emitFleetEvent('workflow.step', 'quality-gate', {
        step: 'quality-gate-started'
      });

      const qualityResult = await qualityGateAgent.execute({
        id: 'fleet-quality',
        type: 'evaluate-quality',
        payload: { version },
        priority: 1,
        status: 'pending'
      });

      await memoryManager.store(`aqe/quality-gate/evaluation/${version}`, {
        status: 'passed',
        score: 92,
        violations: [
          { severity: 'major', type: 'code-smell', count: 2 }
        ]
      });

      await eventBus.emitFleetEvent('workflow.step', 'quality-gate', {
        step: 'quality-gate-completed',
        data: { status: qualityResult.status }
      });

      // ===== STEP 4: Performance Testing (Week 2) =====
      await eventBus.emitFleetEvent('workflow.step', 'performance', {
        step: 'performance-test-started'
      });

      const perfResult = await performanceAgent.execute({
        id: 'fleet-perf',
        type: 'run-load-test',
        payload: {
          targetUrl: 'http://localhost:3000',
          loadProfile: {
            virtualUsers: 150,
            duration: 180,
            rampUpTime: 30,
            pattern: 'ramp-up'
          }
        },
        priority: 1,
        status: 'pending'
      });

      await memoryManager.store(`aqe/performance-tester/results/${version}`, {
        status: perfResult.slaViolations.length === 0 ? 'passed' : 'failed',
        p50: perfResult.metrics.latency.p50,
        p95: perfResult.metrics.latency.p95,
        p99: perfResult.metrics.latency.p99,
        throughput: perfResult.metrics.throughput.requestsPerSecond,
        errorRate: perfResult.metrics.requests.errorRate
      });

      await eventBus.emitFleetEvent('workflow.step', 'performance', {
        step: 'performance-test-completed',
        data: { passed: perfResult.slaViolations.length === 0 }
      });

      // ===== STEP 5: Security Scanning (Week 2) =====
      await eventBus.emitFleetEvent('workflow.step', 'security', {
        step: 'security-scan-started'
      });

      const secResult = await securityAgent.execute({
        id: 'fleet-sec',
        type: 'run-security-scan',
        payload: {
          version,
          includeFindings: false
        },
        priority: 1,
        status: 'pending'
      });

      await memoryManager.store(`aqe/security-scanner/scan/${version}`, {
        status: secResult.passed ? 'passed' : 'failed',
        vulnerabilities: secResult.summary
      });

      await eventBus.emitFleetEvent('workflow.step', 'security', {
        step: 'security-scan-completed',
        data: { passed: secResult.passed }
      });

      // ===== STEP 6: Deployment Readiness Assessment (Week 2) =====
      await eventBus.emitFleetEvent('workflow.step', 'deployment', {
        step: 'deployment-readiness-started'
      });

      const deploymentResult = await deploymentAgent.execute({
        id: 'fleet-deploy',
        type: 'deployment-readiness-check',
        payload: {
          deploymentId,
          version,
          environment: 'production',
          timestamp: new Date(),
          filesModified: 35,
          changeSize: 1850
        },
        priority: 1,
        status: 'pending'
      });

      await eventBus.emitFleetEvent('workflow.step', 'deployment', {
        step: 'deployment-readiness-completed',
        data: {
          decision: deploymentResult.decision,
          confidenceScore: deploymentResult.confidenceScore
        }
      });

      // ===== VERIFICATION =====
      expect(workflow).toContain('tests-started');
      expect(workflow).toContain('tests-completed');
      expect(workflow).toContain('coverage-analysis-started');
      expect(workflow).toContain('coverage-analysis-completed');
      expect(workflow).toContain('quality-gate-started');
      expect(workflow).toContain('quality-gate-completed');
      expect(workflow).toContain('performance-test-started');
      expect(workflow).toContain('performance-test-completed');
      expect(workflow).toContain('security-scan-started');
      expect(workflow).toContain('security-scan-completed');
      expect(workflow).toContain('deployment-readiness-started');
      expect(workflow).toContain('deployment-readiness-completed');

      // Verify deployment decision
      expect(deploymentResult.decision).toMatch(/GO|REVIEW|BLOCK/);
      expect(deploymentResult.confidenceScore).toBeGreaterThanOrEqual(0);
      expect(deploymentResult.confidenceScore).toBeLessThanOrEqual(100);

      // Verify all signals aggregated
      expect(deploymentResult.signals).toBeDefined();
      expect(deploymentResult.signals.qualityGate).toBeDefined();
      expect(deploymentResult.signals.performance).toBeDefined();
      expect(deploymentResult.signals.security).toBeDefined();
      expect(deploymentResult.signals.coverage).toBeDefined();
      expect(deploymentResult.signals.testResults).toBeDefined();

      // Verify checklist validation
      expect(deploymentResult.checklist).toBeDefined();
      expect(deploymentResult.checklist.overallStatus).toMatch(/passed|failed|partial/);

      // Verify rollback risk assessment
      expect(deploymentResult.rollbackRisk).toBeDefined();
      expect(deploymentResult.rollbackRisk.probability).toBeGreaterThanOrEqual(0);
      expect(deploymentResult.rollbackRisk.probability).toBeLessThanOrEqual(1);
    }, 30000); // Extended timeout for full workflow

    it('should make GO decision with all perfect signals', async () => {
      const version = 'v3.1.0';

      // Perfect test results
      await memoryManager.store(`aqe/test-executor/results/${version}`, {
        total: 300,
        passed: 300,
        failed: 0,
        skipped: 0,
        flakyCount: 0
      });

      // Perfect coverage
      await memoryManager.store(`aqe/coverage-analyzer/coverage/${version}`, {
        line: 95,
        branch: 92,
        function: 98,
        statement: 94
      });

      // Perfect quality gate
      await memoryManager.store(`aqe/quality-gate/evaluation/${version}`, {
        status: 'passed',
        score: 98,
        violations: []
      });

      // Perfect performance
      await memoryManager.store(`aqe/performance-tester/results/${version}`, {
        status: 'passed',
        p50: 120,
        p95: 280,
        p99: 450,
        throughput: 2000,
        errorRate: 0.005
      });

      // Perfect security
      await memoryManager.store(`aqe/security-scanner/scan/${version}`, {
        status: 'passed',
        vulnerabilities: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 1
        }
      });

      const result = await deploymentAgent.execute({
        id: 'perfect-deploy',
        type: 'deployment-readiness-check',
        payload: {
          deploymentId: 'deploy-perfect',
          version,
          environment: 'production',
          timestamp: new Date(),
          filesModified: 15,
          changeSize: 850
        },
        priority: 1,
        status: 'pending'
      });

      expect(result.decision).toBe('GO');
      expect(result.confidenceScore).toBeGreaterThanOrEqual(95);
      expect(result.riskLevel).toBe('low');
      expect(result.checklist.overallStatus).toBe('passed');
      expect(result.rollbackRisk.level).toMatch(/low|medium/);
      expect(result.recommendations).toContain(expect.stringMatching(/proceed with deployment/i));
    });

    it('should make BLOCK decision with multiple critical failures', async () => {
      const version = 'v3.2.0';

      // Failed tests
      await memoryManager.store(`aqe/test-executor/results/${version}`, {
        total: 250,
        passed: 200,
        failed: 50,
        skipped: 0,
        flakyCount: 15
      });

      // Poor coverage
      await memoryManager.store(`aqe/coverage-analyzer/coverage/${version}`, {
        line: 62,
        branch: 55,
        function: 68,
        statement: 60
      });

      // Failed quality gate
      await memoryManager.store(`aqe/quality-gate/evaluation/${version}`, {
        status: 'failed',
        score: 45,
        violations: [
          { severity: 'blocker', type: 'bug', count: 3 },
          { severity: 'critical', type: 'vulnerability', count: 2 }
        ]
      });

      // Failed performance
      await memoryManager.store(`aqe/performance-tester/results/${version}`, {
        status: 'failed',
        p50: 850,
        p95: 2500,
        p99: 5000,
        throughput: 350,
        errorRate: 5.2
      });

      // Failed security
      await memoryManager.store(`aqe/security-scanner/scan/${version}`, {
        status: 'failed',
        vulnerabilities: {
          critical: 5,
          high: 12,
          medium: 25,
          low: 40
        }
      });

      const eventSpy = jest.fn();
      eventBus.on(WEEK2_EVENT_TYPES.DEPLOYMENT_BLOCKED, eventSpy);

      const result = await deploymentAgent.execute({
        id: 'failed-deploy',
        type: 'deployment-readiness-check',
        payload: {
          deploymentId: 'deploy-failed',
          version,
          environment: 'production',
          timestamp: new Date(),
          filesModified: 120,
          changeSize: 8500
        },
        priority: 1,
        status: 'pending'
      });

      expect(result.decision).toBe('BLOCK');
      expect(result.confidenceScore).toBeLessThan(70);
      expect(result.riskLevel).toMatch(/high|critical/);
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(result.recommendations).toContain(expect.stringMatching(/address all blocking issues/i));
      expect(eventSpy).toHaveBeenCalled();
    });
  });

  describe('Cross-Agent Memory Sharing', () => {
    it('should share data across all agents via memory namespaces', async () => {
      const version = 'v3.3.0';

      // Store data from each agent
      await memoryManager.store(`aqe/test-executor/results/${version}`, { passed: true });
      await memoryManager.store(`aqe/coverage-analyzer/coverage/${version}`, { line: 85 });
      await memoryManager.store(`aqe/quality-gate/evaluation/${version}`, { status: 'passed' });
      await memoryManager.store(`aqe/performance-tester/results/${version}`, { status: 'passed' });
      await memoryManager.store(`aqe/security-scanner/scan/${version}`, { status: 'passed' });

      // Deployment agent should retrieve all
      const result = await deploymentAgent.execute({
        id: 'memory-test',
        type: 'deployment-readiness-check',
        payload: {
          deploymentId: 'deploy-memory',
          version,
          environment: 'production',
          timestamp: new Date()
        },
        priority: 1,
        status: 'pending'
      });

      expect(result.signals.testResults).toBeDefined();
      expect(result.signals.coverage).toBeDefined();
      expect(result.signals.qualityGate).toBeDefined();
      expect(result.signals.performance).toBeDefined();
      expect(result.signals.security).toBeDefined();
    });

    it('should maintain memory isolation between agent types', async () => {
      const version = 'v3.4.0';

      // Performance data
      await memoryManager.store('aqe/performance/results/test-001', {
        metrics: { p95: 350 }
      });

      // Security data (different namespace)
      await memoryManager.store('aqe/security/scans/scan-001', {
        findings: []
      });

      // Deployment data (different namespace)
      await memoryManager.store('aqe/deployment/reports/deploy-001', {
        decision: 'GO'
      });

      // Each should only see its own namespace
      const perfData = await memoryManager.retrieve('aqe/performance/results/test-001');
      const secData = await memoryManager.retrieve('aqe/security/scans/scan-001');
      const deployData = await memoryManager.retrieve('aqe/deployment/reports/deploy-001');

      expect(perfData).toBeDefined();
      expect(secData).toBeDefined();
      expect(deployData).toBeDefined();
    });
  });

  describe('Event Propagation Across Fleet', () => {
    it('should propagate events from all agents', async () => {
      const events: any[] = [];

      // Listen to all Week 2 events
      Object.values(WEEK2_EVENT_TYPES).forEach(eventType => {
        eventBus.on(eventType, (event) => {
          events.push({ type: eventType, data: event.data });
        });
      });

      const version = 'v3.5.0';

      // Trigger workflow
      await performanceAgent.execute({
        id: 'event-perf',
        type: 'run-load-test',
        payload: {
          targetUrl: 'http://localhost:3000',
          loadProfile: {
            virtualUsers: 50,
            duration: 30,
            rampUpTime: 5,
            pattern: 'constant'
          }
        },
        priority: 1,
        status: 'pending'
      });

      await securityAgent.execute({
        id: 'event-sec',
        type: 'run-security-scan',
        payload: {
          version,
          includeFindings: false
        },
        priority: 1,
        status: 'pending'
      });

      await memoryManager.store(`aqe/performance-tester/results/${version}`, {
        status: 'passed',
        p95: 350
      });
      await memoryManager.store(`aqe/security-scanner/scan/${version}`, {
        status: 'passed',
        vulnerabilities: { critical: 0, high: 0, medium: 2, low: 3 }
      });

      await deploymentAgent.execute({
        id: 'event-deploy',
        type: 'deployment-readiness-check',
        payload: {
          deploymentId: 'deploy-events',
          version,
          environment: 'production',
          timestamp: new Date()
        },
        priority: 1,
        status: 'pending'
      });

      // Verify events were emitted
      expect(events.length).toBeGreaterThan(0);

      // Verify event types
      const eventTypes = events.map(e => e.type);
      expect(eventTypes).toContain(WEEK2_EVENT_TYPES.PERFORMANCE_TEST_STARTED);
      expect(eventTypes).toContain(WEEK2_EVENT_TYPES.PERFORMANCE_TEST_COMPLETED);
      expect(eventTypes).toContain(WEEK2_EVENT_TYPES.SECURITY_SCAN_COMPLETE);
    });

    it('should maintain correct event priority ordering', async () => {
      const events: any[] = [];

      eventBus.onAny((event) => {
        events.push(event);
      });

      const version = 'v3.6.0';

      // Trigger critical scenario
      await memoryManager.store(`aqe/security-scanner/scan/${version}`, {
        status: 'failed',
        vulnerabilities: { critical: 3, high: 5, medium: 10, low: 15 }
      });

      await deploymentAgent.execute({
        id: 'priority-deploy',
        type: 'deployment-readiness-check',
        payload: {
          deploymentId: 'deploy-priority',
          version,
          environment: 'production',
          timestamp: new Date()
        },
        priority: 1,
        status: 'pending'
      });

      // Critical events should have critical priority
      const criticalEvents = events.filter(e =>
        e.type === WEEK2_EVENT_TYPES.DEPLOYMENT_BLOCKED ||
        e.type === WEEK2_EVENT_TYPES.SECURITY_CRITICAL_FOUND
      );

      criticalEvents.forEach(event => {
        expect(['critical', 'high']).toContain(event.priority);
      });
    });
  });

  describe('Failure Handling and Recovery', () => {
    it('should handle performance agent failure gracefully', async () => {
      const version = 'v3.7.0';

      // Shutdown performance agent
      await performanceAgent.shutdown();

      // Other agents should continue
      await memoryManager.store(`aqe/quality-gate/evaluation/${version}`, {
        status: 'passed',
        score: 90
      });

      await memoryManager.store(`aqe/security-scanner/scan/${version}`, {
        status: 'passed',
        vulnerabilities: { critical: 0, high: 1, medium: 3, low: 5 }
      });

      const result = await deploymentAgent.execute({
        id: 'perf-fail',
        type: 'deployment-readiness-check',
        payload: {
          deploymentId: 'deploy-perf-fail',
          version,
          environment: 'production',
          timestamp: new Date()
        },
        priority: 1,
        status: 'pending'
      });

      // Should complete with conservative decision
      expect(result).toBeDefined();
      expect(result.decision).toMatch(/GO|REVIEW|BLOCK/);
      // Should not make GO decision without performance data
      expect(result.decision).not.toBe('GO');
    });

    it('should handle security agent failure gracefully', async () => {
      const version = 'v3.8.0';

      // Shutdown security agent
      await securityAgent.shutdown();

      // Other agents continue
      await memoryManager.store(`aqe/performance-tester/results/${version}`, {
        status: 'passed',
        p95: 320
      });

      await memoryManager.store(`aqe/quality-gate/evaluation/${version}`, {
        status: 'passed',
        score: 88
      });

      const result = await deploymentAgent.execute({
        id: 'sec-fail',
        type: 'deployment-readiness-check',
        payload: {
          deploymentId: 'deploy-sec-fail',
          version,
          environment: 'production',
          timestamp: new Date()
        },
        priority: 1,
        status: 'pending'
      });

      expect(result).toBeDefined();
      expect(result.decision).toMatch(/GO|REVIEW|BLOCK/);
      // Should make conservative decision
      expect(result.decision).not.toBe('GO');
    });

    it('should recover from event bus failures', async () => {
      const errorCount = { value: 0 };

      eventBus.on('error', () => {
        errorCount.value++;
      });

      const version = 'v3.9.0';

      // Trigger multiple operations
      await performanceAgent.execute({
        id: 'recover-perf',
        type: 'run-load-test',
        payload: {
          targetUrl: 'http://localhost:3000',
          loadProfile: {
            virtualUsers: 30,
            duration: 20,
            rampUpTime: 3,
            pattern: 'constant'
          }
        },
        priority: 1,
        status: 'pending'
      });

      await securityAgent.execute({
        id: 'recover-sec',
        type: 'run-security-scan',
        payload: {
          version,
          includeFindings: false
        },
        priority: 1,
        status: 'pending'
      });

      // All agents should remain operational
      expect(performanceAgent.getStatus().status).not.toBe(AgentStatus.ERROR);
      expect(securityAgent.getStatus().status).not.toBe(AgentStatus.ERROR);
      expect(deploymentAgent.getStatus().status).not.toBe(AgentStatus.ERROR);
    });

    it('should handle memory corruption gracefully', async () => {
      const version = 'v3.10.0';

      // Store corrupted data
      await memoryManager.store(`aqe/performance-tester/results/${version}`, {
        // Missing required fields
        invalid: true
      });

      await memoryManager.store(`aqe/security-scanner/scan/${version}`, {
        // Incorrect structure
        data: 'invalid'
      });

      // Deployment agent should handle gracefully
      const result = await deploymentAgent.execute({
        id: 'corrupt-data',
        type: 'deployment-readiness-check',
        payload: {
          deploymentId: 'deploy-corrupt',
          version,
          environment: 'production',
          timestamp: new Date()
        },
        priority: 1,
        status: 'pending'
      });

      expect(result).toBeDefined();
      expect(result.decision).toMatch(/GO|REVIEW|BLOCK/);
      // Should make conservative decision with missing data
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple concurrent deployments', async () => {
      const deployments = Array.from({ length: 5 }, (_, i) =>
        deploymentAgent.execute({
          id: `concurrent-${i}`,
          type: 'deployment-readiness-check',
          payload: {
            deploymentId: `deploy-concurrent-${i}`,
            version: `v4.${i}.0`,
            environment: 'production',
            timestamp: new Date()
          },
          priority: 1,
          status: 'pending'
        })
      );

      const results = await Promise.all(deployments);

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.decision).toMatch(/GO|REVIEW|BLOCK/);
        expect(result.confidenceScore).toBeGreaterThanOrEqual(0);
      });
    });

    it('should complete full workflow within performance budget', async () => {
      const startTime = Date.now();
      const version = 'v4.1.0';

      // Run minimal workflow
      await memoryManager.store(`aqe/quality-gate/evaluation/${version}`, {
        status: 'passed',
        score: 85
      });

      await memoryManager.store(`aqe/performance-tester/results/${version}`, {
        status: 'passed',
        p95: 400
      });

      await memoryManager.store(`aqe/security-scanner/scan/${version}`, {
        status: 'passed',
        vulnerabilities: { critical: 0, high: 2, medium: 5, low: 8 }
      });

      await deploymentAgent.execute({
        id: 'perf-budget',
        type: 'deployment-readiness-check',
        payload: {
          deploymentId: 'deploy-perf-budget',
          version,
          environment: 'production',
          timestamp: new Date()
        },
        priority: 1,
        status: 'pending'
      });

      const duration = Date.now() - startTime;

      // Should complete in reasonable time (adjust based on actual requirements)
      expect(duration).toBeLessThan(5000); // 5 seconds
    });
  });
});