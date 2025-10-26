/**
 * QualityGateAgent Test Suite - Agent System Priority #3
 * Tests intelligent go/no-go decisions and policy validation
 */

import { QualityGateAgent } from '@agents/QualityGateAgent';
import { EventBus } from '@core/EventBus';
import { Task } from '@core/Task';

describe('QualityGateAgent', () => {
  let agent: QualityGateAgent;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    agent = new QualityGateAgent('quality-gate-1', eventBus);
  });

  afterEach(async () => {
    if (agent.isRunning()) {
      await agent.stop();
    }
  });

  describe('initialization and capabilities', () => {
    it('should initialize with quality gate capabilities', () => {
      expect(agent.getType()).toBe('quality-gate');
      expect(agent.hasCapability('threshold-validation')).toBe(true);
      expect(agent.hasCapability('risk-assessment')).toBe(true);
      expect(agent.hasCapability('policy-enforcement')).toBe(true);
      expect(agent.hasCapability('automated-decisions')).toBe(true);
    });

    it('should start and load default policies', async () => {
      await agent.start();
      expect(agent.isRunning()).toBe(true);
      expect(agent.getStatus()).toBe('idle');

      const policies = agent.getLoadedPolicies();
      expect(policies.length).toBeGreaterThan(0);
    });
  });

  describe('threshold validation', () => {
    beforeEach(async () => {
      await agent.start();
    });

    it('should validate basic coverage thresholds', async () => {
      const task = new Task('validate-coverage', 'validate-thresholds', {
        metrics: {
          coverage: { lines: 85, branches: 80, functions: 90 },
          quality: { complexity: 3.2, maintainability: 75 },
          performance: { buildTime: 120, testTime: 45 }
        },
        thresholds: {
          coverage: { lines: 80, branches: 75, functions: 85 },
          quality: { complexity: 5.0, maintainability: 70 },
          performance: { buildTime: 180, testTime: 60 }
        }
      });

      const result = await agent.executeTask(task);

      expect(result.status).toBe('completed');
      expect(result.result.decision).toBe('pass');
      expect(result.result.validations.coverage).toBe(true);
      expect(result.result.validations.quality).toBe(true);
      expect(result.result.validations.performance).toBe(true);
    });

    it('should fail when critical thresholds are not met', async () => {
      const task = new Task('fail-critical-threshold', 'validate-thresholds', {
        metrics: {
          coverage: { lines: 60, branches: 45, functions: 70 },
          security: { vulnerabilities: 3, criticalVulns: 1 }
        },
        thresholds: {
          coverage: { lines: 80, branches: 75, functions: 85 },
          security: { vulnerabilities: 0, criticalVulns: 0 }
        },
        criticalThresholds: ['security.criticalVulns']
      });

      const result = await agent.executeTask(task);

      expect(result.status).toBe('completed');
      expect(result.result.decision).toBe('fail');
      expect(result.result.criticalFailures).toContain('security.criticalVulns');
      expect(result.result.blockers.length).toBeGreaterThan(0);
    });

    it('should provide warnings for non-critical threshold violations', async () => {
      const task = new Task('warning-thresholds', 'validate-thresholds', {
        metrics: {
          coverage: { lines: 78, branches: 72, functions: 88 },
          performance: { buildTime: 200, memory: 512 }
        },
        thresholds: {
          coverage: { lines: 80, branches: 75, functions: 85 },
          performance: { buildTime: 180, memory: 256 }
        },
        warningThresholds: {
          coverage: { lines: 75, branches: 70, functions: 80 },
          performance: { buildTime: 240, memory: 1024 }
        }
      });

      const result = await agent.executeTask(task);

      expect(result.status).toBe('completed');
      expect(result.result.decision).toBe('pass');
      expect(result.result.warnings.length).toBeGreaterThan(0);
      expect(result.result.recommendations).toBeDefined();
    });
  });

  describe('risk assessment', () => {
    beforeEach(async () => {
      await agent.start();
    });

    it('should calculate overall risk score', async () => {
      const task = new Task('calculate-risk', 'assess-risk', {
        changes: {
          linesChanged: 150,
          filesModified: 8,
          complexity: 'medium',
          criticalPathsAffected: ['payment', 'authentication']
        },
        coverage: {
          changedLinesCoverage: 65,
          overallCoverage: 82
        },
        history: {
          recentFailures: 2,
          averageStability: 0.95
        }
      });

      const result = await agent.executeTask(task);

      expect(result.status).toBe('completed');
      expect(result.result.riskScore).toBeDefined();
      expect(result.result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.result.riskScore).toBeLessThanOrEqual(100);
      expect(result.result.riskLevel).toMatch(/low|medium|high|critical/);
      expect(result.result.factors).toBeDefined();
    });

    it('should identify high-risk scenarios', async () => {
      const task = new Task('high-risk-scenario', 'assess-risk', {
        changes: {
          linesChanged: 500,
          filesModified: 25,
          complexity: 'high',
          criticalPathsAffected: ['payment', 'security', 'database']
        },
        coverage: {
          changedLinesCoverage: 30,
          overallCoverage: 60
        },
        history: {
          recentFailures: 5,
          averageStability: 0.75
        },
        timeline: {
          deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days
          rushJob: true
        }
      });

      const result = await agent.executeTask(task);

      expect(result.result.riskLevel).toBe('critical');
      expect(result.result.recommendation).toBe('block');
      expect(result.result.mitigationStrategies).toBeDefined();
      expect(result.result.requiredActions.length).toBeGreaterThan(0);
    });

    it('should provide risk mitigation recommendations', async () => {
      const task = new Task('risk-mitigation', 'assess-risk', {
        changes: {
          linesChanged: 200,
          criticalPathsAffected: ['payment']
        },
        coverage: { changedLinesCoverage: 45 },
        requestMitigation: true
      });

      const result = await agent.executeTask(task);

      expect(result.result.mitigationStrategies).toBeDefined();
      expect(result.result.mitigationStrategies.length).toBeGreaterThan(0);
      expect(result.result.estimatedRiskReduction).toBeDefined();
    });
  });

  describe('policy enforcement', () => {
    beforeEach(async () => {
      await agent.start();
    });

    it('should enforce custom quality policies', async () => {
      const task = new Task('enforce-policies', 'enforce-policy', {
        policies: [
          {
            name: 'minimum-test-coverage',
            rule: 'coverage.lines >= 80 AND coverage.branches >= 75',
            severity: 'error'
          },
          {
            name: 'no-console-logs',
            rule: 'codeAnalysis.consoleStatements == 0',
            severity: 'warning'
          },
          {
            name: 'max-function-complexity',
            rule: 'codeAnalysis.maxComplexity <= 10',
            severity: 'error'
          }
        ],
        data: {
          coverage: { lines: 85, branches: 78 },
          codeAnalysis: { consoleStatements: 2, maxComplexity: 8 }
        }
      });

      const result = await agent.executeTask(task);

      expect(result.status).toBe('completed');
      expect(result.result.policyResults).toHaveLength(3);
      expect(result.result.policyResults[0].passed).toBe(true); // coverage
      expect(result.result.policyResults[1].passed).toBe(false); // console logs
      expect(result.result.policyResults[2].passed).toBe(true); // complexity
      expect(result.result.overallResult).toBe('pass'); // warnings don't fail
    });

    it('should support complex policy expressions', async () => {
      const task = new Task('complex-policies', 'enforce-policy', {
        policies: [
          {
            name: 'security-and-performance',
            rule: '(security.vulnerabilities == 0 OR security.severity == "low") AND performance.responseTime <= 200',
            severity: 'error'
          },
          {
            name: 'conditional-coverage',
            rule: 'IF changes.criticalPaths THEN coverage.lines >= 95 ELSE coverage.lines >= 80',
            severity: 'error'
          }
        ],
        data: {
          security: { vulnerabilities: 1, severity: 'low' },
          performance: { responseTime: 150 },
          changes: { criticalPaths: true },
          coverage: { lines: 88 }
        }
      });

      const result = await agent.executeTask(task);

      expect(result.result.policyResults[0].passed).toBe(true); // security OK
      expect(result.result.policyResults[1].passed).toBe(false); // coverage insufficient for critical paths
    });

    it('should handle policy inheritance and overrides', async () => {
      const task = new Task('policy-inheritance', 'enforce-policy', {
        basePolicies: 'standard-web-app',
        overrides: [
          {
            name: 'minimum-test-coverage',
            rule: 'coverage.lines >= 90', // More strict than base
            severity: 'error'
          }
        ],
        exceptions: [
          {
            policy: 'no-todo-comments',
            reason: 'Legacy code cleanup in progress',
            expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
          }
        ],
        data: {
          coverage: { lines: 85 },
          codeAnalysis: { todoComments: 5 }
        }
      });

      const result = await agent.executeTask(task);

      expect(result.result.inheritedPolicies).toBeDefined();
      expect(result.result.activeExceptions).toHaveLength(1);
      expect(result.result.overriddenPolicies).toHaveLength(1);
    });
  });

  describe('automated decision making', () => {
    beforeEach(async () => {
      await agent.start();
    });

    it('should make deployment decisions based on comprehensive analysis', async () => {
      const task = new Task('deployment-decision', 'make-decision', {
        context: 'pre-deployment',
        data: {
          testResults: { passed: 98, failed: 2, skipped: 0 },
          coverage: { lines: 87, branches: 82, functions: 92 },
          performance: { buildTime: 145, testTime: 38 },
          security: { vulnerabilities: 0, criticalVulns: 0 },
          quality: { maintainability: 78, techDebt: 'low' }
        },
        environment: 'production',
        stakeholders: ['dev-team', 'qa-team', 'product-owner']
      });

      const result = await agent.executeTask(task);

      expect(result.status).toBe('completed');
      expect(result.result.decision).toMatch(/approve|reject|conditional/);
      expect(result.result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.result.confidence).toBeLessThanOrEqual(100);
      expect(result.result.reasoning).toBeDefined();
      expect(result.result.requiredApprovals).toBeDefined();
    });

    it('should support conditional approvals with requirements', async () => {
      const task = new Task('conditional-approval', 'make-decision', {
        context: 'feature-release',
        data: {
          coverage: { lines: 78, branches: 70 }, // Below threshold
          performance: { regression: 5 }, // Minor regression
          security: { vulnerabilities: 0 }
        },
        allowConditional: true
      });

      const result = await agent.executeTask(task);

      expect(result.result.decision).toBe('conditional');
      expect(result.result.conditions).toBeDefined();
      expect(result.result.conditions.length).toBeGreaterThan(0);
      expect(result.result.timeline).toBeDefined();
    });

    it('should escalate decisions when confidence is low', async () => {
      const task = new Task('low-confidence-decision', 'make-decision', {
        context: 'hotfix-deployment',
        data: {
          testResults: { passed: 15, failed: 0, skipped: 85 }, // Mostly skipped
          coverage: { lines: 45 }, // Very low
          urgency: 'critical',
          impact: 'production-down'
        },
        confidenceThreshold: 70
      });

      const result = await agent.executeTask(task);

      expect(result.result.escalated).toBe(true);
      expect(result.result.escalationReason).toBeDefined();
      expect(result.result.recommendedReviewers).toBeDefined();
      expect(result.result.urgencyLevel).toBe('critical');
    });
  });

  describe('reporting and audit trails', () => {
    beforeEach(async () => {
      await agent.start();
    });

    it('should generate comprehensive quality gate reports', async () => {
      const task = new Task('generate-report', 'generate-report', {
        decisions: generateDecisionHistory(10),
        timeframe: '30d',
        includeMetrics: true,
        includeRecommendations: true
      });

      const result = await agent.executeTask(task);

      expect(result.result.report).toBeDefined();
      expect(result.result.report.summary).toBeDefined();
      expect(result.result.report.trends).toBeDefined();
      expect(result.result.report.recommendations).toBeDefined();
      expect(result.result.metrics.passRate).toBeDefined();
    });

    it('should maintain audit trails for all decisions', async () => {
      // Make a decision
      const decisionTask = new Task('audit-decision', 'make-decision', {
        context: 'test-audit',
        data: { coverage: { lines: 85 } }
      });

      await agent.executeTask(decisionTask);

      // Query audit trail
      const auditTask = new Task('query-audit', 'query-audit', {
        filters: { context: 'test-audit' },
        timeframe: '1h'
      });

      const result = await agent.executeTask(auditTask);

      expect(result.result.auditEntries).toBeDefined();
      expect(result.result.auditEntries.length).toBeGreaterThan(0);
      expect(result.result.auditEntries[0].timestamp).toBeDefined();
      expect(result.result.auditEntries[0].decision).toBeDefined();
      expect(result.result.auditEntries[0].reasoning).toBeDefined();
    });

    it('should support compliance reporting', async () => {
      const task = new Task('compliance-report', 'generate-compliance-report', {
        standard: 'ISO-27001',
        timeframe: '90d',
        includeEvidence: true
      });

      const result = await agent.executeTask(task);

      expect(result.result.complianceScore).toBeDefined();
      expect(result.result.requirements).toBeDefined();
      expect(result.result.evidence).toBeDefined();
      expect(result.result.gaps).toBeDefined();
    });
  });

  describe('integration and notifications', () => {
    beforeEach(async () => {
      await agent.start();
    });

    it('should integrate with CI/CD pipelines', async () => {
      const task = new Task('cicd-integration', 'cicd-gate', {
        pipeline: 'jenkins',
        stage: 'pre-deployment',
        buildId: 'build-123',
        artifacts: ['test-results.xml', 'coverage-report.json']
      });

      const result = await agent.executeTask(task);

      expect(result.result.pipelineResult).toMatch(/proceed|block|manual/);
      expect(result.result.exitCode).toBeDefined();
      expect(result.result.message).toBeDefined();
    });

    it('should send notifications based on decision outcomes', async () => {
      const notificationsSent: any[] = [];
      eventBus.on('notification:sent', (data) => notificationsSent.push(data));

      const task = new Task('notification-test', 'make-decision', {
        context: 'deployment',
        data: { coverage: { lines: 50 } }, // Will fail
        notifications: {
          onFail: ['slack://dev-alerts', 'email://lead@company.com'],
          onPass: ['slack://deployment-success']
        }
      });

      await agent.executeTask(task);

      expect(notificationsSent.length).toBeGreaterThan(0);
      expect(notificationsSent[0].channel).toContain('slack://dev-alerts');
    });
  });

  describe('performance and scalability', () => {
    beforeEach(async () => {
      await agent.start();
    });

    it('should handle high-volume decision requests', async () => {
      const tasks = Array.from({ length: 100 }, (_, i) =>
        new Task(`bulk-decision-${i}`, 'make-decision', {
          context: 'bulk-test',
          data: { coverage: { lines: 70 + Math.random() * 30 } }
        })
      );

      const startTime = Date.now();
      const results = await Promise.all(
        tasks.map(task => agent.executeTask(task))
      );
      const executionTime = Date.now() - startTime;

      expect(results).toHaveLength(100);
      expect(executionTime).toBeLessThan(10000); // Should complete in under 10s
      expect(results.every(r => r.status === 'completed')).toBe(true);
    });

    it('should cache policy evaluations for performance', async () => {
      const task1 = new Task('cache-test-1', 'enforce-policy', {
        policies: [{ name: 'test-policy', rule: 'coverage.lines >= 80' }],
        data: { coverage: { lines: 85 } }
      });

      const task2 = new Task('cache-test-2', 'enforce-policy', {
        policies: [{ name: 'test-policy', rule: 'coverage.lines >= 80' }],
        data: { coverage: { lines: 85 } }
      });

      const time1 = Date.now();
      await agent.executeTask(task1);
      const firstExecution = Date.now() - time1;

      const time2 = Date.now();
      await agent.executeTask(task2);
      const secondExecution = Date.now() - time2;

      expect(secondExecution).toBeLessThan(firstExecution); // Should be faster due to caching
    });
  });
});

// Helper functions
function generateDecisionHistory(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `decision-${i}`,
    timestamp: new Date(Date.now() - i * 60 * 60 * 1000), // Hourly decisions
    decision: Math.random() > 0.3 ? 'pass' : 'fail',
    context: 'automated-test',
    confidence: Math.random() * 40 + 60, // 60-100% confidence
    metrics: {
      coverage: Math.random() * 40 + 60, // 60-100% coverage
      quality: Math.random() * 30 + 70    // 70-100% quality
    }
  }));
}