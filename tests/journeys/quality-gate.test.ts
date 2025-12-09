/**
 * Journey Test: Quality Gate - Automated GO/NO-GO Decisions
 *
 * Tests the end-to-end quality gate workflow for automated deployment decisions.
 * This is the FIFTH journey test for Issue #103 - test suite migration.
 *
 * Purpose: Verify that the QualityGateAgent can:
 * 1. Evaluate coverage, security, and performance metrics
 * 2. Apply policy rules (min coverage 80%, no critical vulnerabilities)
 * 3. Generate pass/fail decision with rationale
 * 4. Block deployment on failure
 * 5. Create audit trail in database
 *
 * Validation: Uses REAL database interactions (SwarmMemoryManager), not mocks.
 * Focus: USER-FACING behavior, not implementation details.
 *
 * @see Issue #103 - Test Suite Migration: Phase 1 Journey Tests
 * @module tests/journeys
 */

import { QualityGateAgent, QualityGateRequest, QualityGateDecision } from '@agents/QualityGateAgent';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import { EventEmitter } from 'events';
import {
  AgentId,
  AgentStatus,
  TaskSpec,
  QualityMetrics,
  QETestResult
} from '@types';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';

describe('Journey: Quality Gate', () => {
  let memory: SwarmMemoryManager;
  let qualityGateAgent: QualityGateAgent;
  let tempDir: string;
  let tempDbPath: string;
  let agentId: AgentId;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aqe-quality-gate-journey-'));
    tempDbPath = path.join(tempDir, 'quality-gate.db');
  });

  beforeEach(async () => {
    // Initialize real database
    memory = new SwarmMemoryManager(tempDbPath);
    await memory.initialize();

    // Create Quality Gate Agent with real memory store
    agentId = { id: 'quality-gate-journey', type: 'quality-gate' };
    qualityGateAgent = new QualityGateAgent(agentId, memory);
    await qualityGateAgent.initialize();
  });

  afterEach(async () => {
    if (qualityGateAgent.getStatus().status !== AgentStatus.STOPPED) {
      await qualityGateAgent.terminate();
    }
    await memory.close();
  });

  afterAll(async () => {
    await fs.remove(tempDir);
  });

  describe('GO/NO-GO decisions', () => {
    test('evaluates coverage, security, performance metrics', async () => {
      // GIVEN: Quality metrics from a comprehensive test run
      const testResults: QETestResult[] = [
        {
          id: 'test-1',
          name: 'User authentication tests',
          status: 'passed',
          duration: 120,
          assertions: [
            { expected: true, actual: true, passed: true }
          ]
        },
        {
          id: 'test-2',
          name: 'Payment processing tests',
          status: 'passed',
          duration: 250,
          assertions: [
            { expected: 200, actual: 200, passed: true }
          ]
        }
      ];

      const metrics: QualityMetrics = {
        coverage: {
          line: 87,
          branch: 82,
          function: 90,
          statement: 86
        },
        testResults: {
          total: 100,
          passed: 98,
          failed: 2,
          skipped: 0
        },
        performance: {
          averageResponseTime: 150,
          throughput: 850,
          errorRate: 0.02
        },
        security: {
          vulnerabilities: 0,
          criticalVulnerabilities: 0
        }
      };

      const request: QualityGateRequest = {
        testResults,
        metrics,
        context: {
          deploymentTarget: 'staging',
          criticality: 'medium',
          changes: [
            { file: 'src/auth/login.ts', type: 'modified', complexity: 5 },
            { file: 'src/payments/process.ts', type: 'modified', complexity: 7 }
          ],
          environment: 'test'
        }
      };

      const task: TaskSpec = {
        id: 'quality-evaluation-1',
        type: 'quality-evaluation',
        payload: request,
        priority: 1
      };

      // WHEN: Quality gate evaluates the metrics
      const decision = await qualityGateAgent.executeTask(task);

      // THEN: Decision should evaluate all metric categories
      expect(decision).toBeDefined();
      expect(decision.criteriaEvaluations).toBeDefined();
      expect(decision.criteriaEvaluations.length).toBeGreaterThan(0);

      // Verify coverage criteria was evaluated
      const coverageCriteria = decision.criteriaEvaluations.find(
        e => e.criterion.name === 'test_coverage'
      );
      expect(coverageCriteria).toBeDefined();
      expect(coverageCriteria!.value).toBeGreaterThan(0);

      // Verify security criteria was evaluated
      const securityCriteria = decision.criteriaEvaluations.find(
        e => e.criterion.name === 'security_vulnerabilities'
      );
      expect(securityCriteria).toBeDefined();
      expect(securityCriteria!.value).toBe(0);

      // Verify performance criteria was evaluated
      const performanceCriteria = decision.criteriaEvaluations.find(
        e => e.criterion.name === 'performance_regression'
      );
      expect(performanceCriteria).toBeDefined();
    });

    test('applies policy rules: min coverage 80%, no critical vulnerabilities', async () => {
      // GIVEN: Metrics that meet the minimum policy requirements
      const passingMetrics: QualityMetrics = {
        coverage: {
          line: 85,
          branch: 82,
          function: 88,
          statement: 84
        },
        testResults: {
          total: 150,
          passed: 148,
          failed: 2,
          skipped: 0
        },
        performance: {
          averageResponseTime: 120,
          throughput: 900,
          errorRate: 0.01
        },
        security: {
          vulnerabilities: 0,
          criticalVulnerabilities: 0
        }
      };

      const request: QualityGateRequest = {
        testResults: [],
        metrics: passingMetrics,
        context: {
          deploymentTarget: 'production',
          criticality: 'high',
          environment: 'test'
        }
      };

      const task: TaskSpec = {
        id: 'policy-evaluation-pass',
        type: 'quality-evaluation',
        payload: request,
        priority: 1
      };

      // WHEN: Policy rules are applied
      const decision = await qualityGateAgent.executeTask(task);

      // THEN: Decision should PASS because metrics meet minimum requirements
      expect(decision.decision).toBe('PASS');
      expect(decision.score).toBeGreaterThanOrEqual(decision.threshold);

      // Verify coverage criterion passed (>= 80%)
      const coverageEval = decision.criteriaEvaluations.find(
        e => e.criterion.name === 'test_coverage'
      );
      expect(coverageEval).toBeDefined();
      expect(coverageEval!.passed).toBe(true);
      expect(coverageEval!.criterion.threshold).toBeLessThanOrEqual(0.85);

      // Verify security criterion passed (0 vulnerabilities)
      const securityEval = decision.criteriaEvaluations.find(
        e => e.criterion.name === 'security_vulnerabilities'
      );
      expect(securityEval).toBeDefined();
      expect(securityEval!.passed).toBe(true);
      expect(securityEval!.value).toBe(0);
    });

    test('generates pass/fail decision with rationale', async () => {
      // GIVEN: Failing metrics (low coverage and critical vulnerabilities)
      const failingMetrics: QualityMetrics = {
        coverage: {
          line: 45,
          branch: 38,
          function: 50,
          statement: 42
        },
        testResults: {
          total: 50,
          passed: 40,
          failed: 10,
          skipped: 0
        },
        performance: {
          averageResponseTime: 500,
          throughput: 300,
          errorRate: 0.15
        },
        security: {
          vulnerabilities: 5,
          criticalVulnerabilities: 2
        }
      };

      const request: QualityGateRequest = {
        testResults: [],
        metrics: failingMetrics,
        context: {
          deploymentTarget: 'production',
          criticality: 'critical',
          environment: 'test'
        }
      };

      const task: TaskSpec = {
        id: 'policy-evaluation-fail',
        type: 'quality-evaluation',
        payload: request,
        priority: 1
      };

      // WHEN: Quality gate evaluates failing metrics
      const decision = await qualityGateAgent.executeTask(task);

      // THEN: Decision should NOT PASS (either FAIL or ESCALATE due to risk factors)
      expect(['FAIL', 'ESCALATE']).toContain(decision.decision);
      expect(decision.explanation).toBeDefined();
      expect(decision.explanation.length).toBeGreaterThan(0);

      // Explanation should mention failures or escalation
      expect(decision.explanation.toLowerCase()).toMatch(/fail|critical|block|escalate|review/);

      // Should provide recommendations
      expect(decision.recommendations).toBeDefined();
      expect(decision.recommendations.length).toBeGreaterThan(0);

      // When FAIL decision, check criteria evaluations
      // When ESCALATE, criteria evaluations may be empty (early exit for human review)
      if (decision.decision === 'FAIL') {
        // Coverage should fail
        const coverageEval = decision.criteriaEvaluations.find(
          e => e.criterion.name === 'test_coverage'
        );
        expect(coverageEval).toBeDefined();
        expect(coverageEval!.passed).toBe(false);

        // Security should fail
        const securityEval = decision.criteriaEvaluations.find(
          e => e.criterion.name === 'security_vulnerabilities'
        );
        expect(securityEval).toBeDefined();
        expect(securityEval!.passed).toBe(false);
        expect(securityEval!.value).toBeGreaterThan(0);
      } else {
        // ESCALATE path - verify explanation mentions the issues
        expect(decision.explanation.toLowerCase()).toMatch(/coverage|security|vulnerabilities|review/);
      }
    });

    test('blocks deployment on failure', async () => {
      // GIVEN: Production deployment with critical failures
      const criticalFailureMetrics: QualityMetrics = {
        coverage: {
          line: 30,
          branch: 25,
          function: 35,
          statement: 28
        },
        testResults: {
          total: 100,
          passed: 50,
          failed: 50,
          skipped: 0
        },
        performance: {
          averageResponseTime: 2000,
          throughput: 100,
          errorRate: 0.5
        },
        security: {
          vulnerabilities: 10,
          criticalVulnerabilities: 5
        }
      };

      const request: QualityGateRequest = {
        testResults: [],
        metrics: criticalFailureMetrics,
        context: {
          deploymentTarget: 'production',
          criticality: 'critical',
          changes: [
            { file: 'src/core/payment.ts', type: 'modified', complexity: 10 }
          ],
          environment: 'test'
        }
      };

      const task: TaskSpec = {
        id: 'deployment-block',
        type: 'quality-evaluation',
        payload: request,
        priority: 1
      };

      // WHEN: Quality gate evaluates for production deployment
      const decision = await qualityGateAgent.executeTask(task);

      // THEN: Deployment should be BLOCKED (FAIL or ESCALATE decision)
      expect(['FAIL', 'ESCALATE']).toContain(decision.decision);

      // High-risk factors should be identified
      expect(decision.riskFactors).toBeDefined();
      expect(decision.riskFactors.length).toBeGreaterThan(0);

      const criticalRisks = decision.riskFactors.filter(
        rf => rf.severity === 'critical' || rf.severity === 'high'
      );
      expect(criticalRisks.length).toBeGreaterThan(0);

      // When FAIL decision, critical criteria should have failed
      // When ESCALATE, evaluations may be empty due to early exit for human review
      if (decision.decision === 'FAIL' && decision.criteriaEvaluations.length > 0) {
        const criticalFailures = decision.criteriaEvaluations.filter(
          e => e.criterion.critical && !e.passed
        );
        expect(criticalFailures.length).toBeGreaterThan(0);
      }

      // Should provide mitigation recommendations
      expect(decision.recommendations).toBeDefined();
      expect(decision.recommendations.length).toBeGreaterThan(0);
    });

    test('creates audit trail in database', async () => {
      // GIVEN: Multiple quality gate decisions
      const decisions: QualityGateDecision[] = [];

      // Decision 1: PASS
      const passRequest: QualityGateRequest = {
        testResults: [],
        metrics: {
          coverage: { line: 90, branch: 88, function: 92, statement: 89 },
          testResults: { total: 100, passed: 99, failed: 1, skipped: 0 },
          performance: { averageResponseTime: 80, throughput: 1000, errorRate: 0.01 },
          security: { vulnerabilities: 0, criticalVulnerabilities: 0 }
        },
        context: {
          deploymentTarget: 'staging',
          criticality: 'medium',
          environment: 'test'
        }
      };

      const passTask: TaskSpec = {
        id: 'audit-decision-1',
        type: 'quality-evaluation',
        payload: passRequest,
        priority: 1
      };

      decisions.push(await qualityGateAgent.executeTask(passTask));

      // Decision 2: FAIL
      const failRequest: QualityGateRequest = {
        testResults: [],
        metrics: {
          coverage: { line: 60, branch: 55, function: 65, statement: 58 },
          testResults: { total: 100, passed: 85, failed: 15, skipped: 0 },
          performance: { averageResponseTime: 300, throughput: 400, errorRate: 0.08 },
          security: { vulnerabilities: 3, criticalVulnerabilities: 1 }
        },
        context: {
          deploymentTarget: 'production',
          criticality: 'high',
          environment: 'test'
        }
      };

      const failTask: TaskSpec = {
        id: 'audit-decision-2',
        type: 'quality-evaluation',
        payload: failRequest,
        priority: 1
      };

      decisions.push(await qualityGateAgent.executeTask(failTask));

      // WHEN: Retrieving audit trail from database
      const storedDecisions = await memory.query('decision-%', { partition: 'decisions' });

      // THEN: All decisions should be stored in database
      expect(storedDecisions).toBeDefined();
      expect(storedDecisions.length).toBeGreaterThanOrEqual(2);

      // Verify audit trail structure
      for (const stored of storedDecisions) {
        expect(stored.value.decision).toMatch(/PASS|FAIL|ESCALATE/);
        expect(stored.value.score).toBeDefined();
        expect(typeof stored.value.score).toBe('number');
        // Confidence may be present (stored as number, object, or omitted in some edge cases)
        if (stored.value.confidence !== undefined && stored.value.confidence !== null) {
          expect(typeof stored.value.confidence === 'number' ||
                 typeof stored.value.confidence === 'object').toBe(true);
        }
        expect(stored.value.timestamp).toBeDefined();
        expect(stored.value.duration).toBeDefined();
      }

      // Verify we can retrieve learning data
      const learningData = await memory.query('learning-%', { partition: 'quality-gate-learning' });
      expect(learningData).toBeDefined();
      expect(learningData.length).toBeGreaterThanOrEqual(2);

      // Verify learning data structure
      for (const learning of learningData) {
        expect(learning.value.decision).toMatch(/PASS|FAIL|ESCALATE/);
        expect(learning.value.score).toBeDefined();
        expect(learning.value.confidence).toBeDefined();
        expect(learning.value.testResultsSummary).toBeDefined();
        expect(learning.value.metricsSummary).toBeDefined();
        expect(learning.value.timestamp).toBeDefined();
      }
    });

    test('complete workflow: metrics to decision with audit trail', async () => {
      // GIVEN: Complete quality gate scenario for feature release
      const featureMetrics: QualityMetrics = {
        coverage: {
          line: 88,
          branch: 85,
          function: 92,
          statement: 87
        },
        testResults: {
          total: 250,
          passed: 245,
          failed: 5,
          skipped: 0
        },
        performance: {
          averageResponseTime: 120,
          throughput: 850,
          errorRate: 0.02
        },
        security: {
          vulnerabilities: 1,
          criticalVulnerabilities: 0
        }
      };

      const testResults: QETestResult[] = [
        {
          id: 'integration-test-1',
          name: 'End-to-end user flow',
          status: 'passed',
          duration: 3500,
          assertions: [
            { expected: 'success', actual: 'success', passed: true }
          ]
        },
        {
          id: 'performance-test-1',
          name: 'Load testing with 1000 concurrent users',
          status: 'passed',
          duration: 45000,
          assertions: [
            { expected: true, actual: true, passed: true }
          ]
        }
      ];

      const request: QualityGateRequest = {
        testResults,
        metrics: featureMetrics,
        context: {
          deploymentTarget: 'production',
          criticality: 'high',
          changes: [
            { file: 'src/features/new-dashboard.tsx', type: 'added', complexity: 6 },
            { file: 'src/api/analytics.ts', type: 'modified', complexity: 4 },
            { file: 'src/utils/helpers.ts', type: 'modified', complexity: 2 }
          ],
          environment: 'test'
        }
      };

      const task: TaskSpec = {
        id: 'complete-workflow',
        type: 'quality-evaluation',
        payload: request,
        priority: 1
      };

      // WHEN: Complete quality gate evaluation executes
      const decision = await qualityGateAgent.executeTask(task);

      // THEN: Complete decision should be generated
      expect(decision).toBeDefined();
      expect(decision.decision).toMatch(/PASS|FAIL|ESCALATE/);
      expect(decision.score).toBeDefined();
      expect(decision.threshold).toBeDefined();
      expect(decision.confidence).toBeGreaterThan(0);
      expect(decision.confidence).toBeLessThanOrEqual(1);

      // Criteria evaluations complete
      expect(decision.criteriaEvaluations.length).toBeGreaterThan(0);
      for (const evaluation of decision.criteriaEvaluations) {
        expect(evaluation.criterion).toBeDefined();
        expect(evaluation.value).toBeDefined();
        expect(typeof evaluation.passed).toBe('boolean');
        expect(evaluation.score).toBeDefined();
        expect(evaluation.impact).toBeDefined();
      }

      // Risk analysis complete
      expect(decision.riskFactors).toBeDefined();
      if (decision.riskFactors.length > 0) {
        for (const risk of decision.riskFactors) {
          expect(risk.type).toBeDefined();
          expect(risk.severity).toMatch(/low|medium|high|critical/);
          expect(risk.probability).toBeGreaterThanOrEqual(0);
          expect(risk.probability).toBeLessThanOrEqual(1);
          expect(risk.impact).toBeDefined();
          expect(risk.mitigation).toBeInstanceOf(Array);
        }
      }

      // Explanation and recommendations provided
      expect(decision.explanation).toBeDefined();
      expect(decision.explanation.length).toBeGreaterThan(0);
      expect(decision.recommendations).toBeInstanceOf(Array);

      // Metadata complete
      expect(decision.metadata.evaluationTime).toBeInstanceOf(Date);
      expect(decision.metadata.context).toBeDefined();
      expect(decision.metadata.decisionTreeVersion).toBeDefined();

      // Audit trail stored in database
      const auditEntry = await memory.query(`decision-${Date.now().toString().slice(0, -3)}%`, {
        partition: 'decisions'
      });
      expect(auditEntry.length).toBeGreaterThan(0);

      // Learning data stored
      const learningEntry = await memory.query(`learning-${Date.now().toString().slice(0, -3)}%`, {
        partition: 'quality-gate-learning'
      });
      expect(learningEntry.length).toBeGreaterThan(0);

      // Verify learning data is comprehensive
      const learning = learningEntry[learningEntry.length - 1].value;
      expect(learning.decision).toBe(decision.decision);
      expect(learning.score).toBe(decision.score);
      expect(learning.confidence).toBe(decision.confidence);
      expect(learning.testResultsSummary.total).toBe(testResults.length);
      expect(learning.metricsSummary.coverage).toEqual(featureMetrics.coverage);
      expect(learning.metricsSummary.security).toEqual(featureMetrics.security);
    });
  });
});
