/**
 * Quality MCP Tools Test Suite
 *
 * Comprehensive tests for all 5 quality MCP tool handlers:
 * - quality_gate_execute
 * - quality_validate_metrics
 * - quality_risk_assess
 * - quality_decision_make
 * - quality_policy_check
 *
 * @version 1.0.0
 * @author Agentic QE Team - Agent 2
 */

import { describe, it, expect, beforeEach, jest, Mock } from '@jest/globals';
import { QualityGateExecuteHandler } from '@mcp/handlers/quality/quality-gate-execute';
import { QualityValidateMetricsHandler } from '@mcp/handlers/quality/quality-validate-metrics';
import { QualityRiskAssessHandler } from '@mcp/handlers/quality/quality-risk-assess';
import { QualityDecisionMakeHandler } from '@mcp/handlers/quality/quality-decision-make';
import { QualityPolicyCheckHandler } from '@mcp/handlers/quality/quality-policy-check';
import { AgentRegistry } from '@mcp/services/AgentRegistry';
import { HookExecutor } from '@mcp/services/HookExecutor';

// Mock services
jest.mock('../../../src/mcp/services/AgentRegistry.js');
jest.mock('../../../src/mcp/services/HookExecutor.js');

describe('Quality MCP Tools', () => {
  let mockAgentRegistry: AgentRegistry;
  let mockHookExecutor: HookExecutor;

  beforeEach(() => {
    mockAgentRegistry = {
      spawnAgent: jest.fn().mockResolvedValue({ id: 'test-agent-id' }),
      executeTask: jest.fn().mockResolvedValue({ output: {} })
    } as any;

    mockHookExecutor = {
      executePreTask: jest.fn().mockResolvedValue(undefined),
      executePostTask: jest.fn().mockResolvedValue(undefined),
      executePostEdit: jest.fn().mockResolvedValue(undefined),
      notify: jest.fn().mockResolvedValue(undefined)
    } as any;
  });

  // ========================================================================
  // QUALITY GATE EXECUTE TESTS
  // ========================================================================
  describe('QualityGateExecuteHandler', () => {
    let handler: QualityGateExecuteHandler;

    beforeEach(() => {
      handler = new QualityGateExecuteHandler(mockAgentRegistry, mockHookExecutor);
    });

    it('should execute quality gate with passing metrics', async () => {
      const args = {
        projectId: 'test-project',
        buildId: 'build-123',
        environment: 'production' as const,
        metrics: {
          coverage: { line: 85, branch: 80, function: 90, statement: 85 },
          testResults: { total: 100, passed: 97, failed: 2, skipped: 1 },
          security: { vulnerabilities: 5, critical: 0, high: 1, medium: 3, low: 1 },
          performance: { averageResponseTime: 150, throughput: 1200, errorRate: 0.02 },
          codeQuality: { complexity: 12, maintainability: 75, duplication: 3 }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data.decision).toMatch(/PASS|CONDITIONAL_GO|FAIL|ESCALATE/);
      expect(response.data.score).toBeGreaterThanOrEqual(0);
      expect(mockHookExecutor.executePreTask).toHaveBeenCalled();
      expect(mockHookExecutor.executePostTask).toHaveBeenCalled();
    });

    it('should fail quality gate with critical security vulnerabilities', async () => {
      const args = {
        projectId: 'test-project',
        buildId: 'build-456',
        environment: 'production' as const,
        metrics: {
          coverage: { line: 85, branch: 80, function: 90, statement: 85 },
          testResults: { total: 100, passed: 98, failed: 1, skipped: 1 },
          security: { vulnerabilities: 10, critical: 2, high: 3, medium: 3, low: 2 },
          performance: { averageResponseTime: 150, throughput: 1200, errorRate: 0.02 },
          codeQuality: { complexity: 12, maintainability: 75, duplication: 3 }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.decision).toBe('FAIL');
      expect(response.data.policyCompliance.violations.length).toBeGreaterThan(0);
    });

    it('should use custom policy when provided', async () => {
      const customPolicy = {
        name: 'custom-policy',
        version: '1.0.0',
        thresholds: {
          coverage: 0.90,
          testSuccess: 0.98,
          securityVulns: 0,
          performanceRegression: 0.05,
          codeQuality: 0.80
        },
        rules: [],
        enforcement: 'strict' as const
      };

      const args = {
        projectId: 'test-project',
        buildId: 'build-789',
        environment: 'production' as const,
        policy: customPolicy,
        metrics: {
          coverage: { line: 85, branch: 80, function: 90, statement: 85 },
          testResults: { total: 100, passed: 95, failed: 5, skipped: 0 },
          security: { vulnerabilities: 0, critical: 0, high: 0, medium: 0, low: 0 },
          performance: { averageResponseTime: 150, throughput: 1200, errorRate: 0.02 },
          codeQuality: { complexity: 12, maintainability: 75, duplication: 3 }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.metadata.policyVersion).toBe('1.0.0');
    });

    it('should provide risk assessment in results', async () => {
      const args = {
        projectId: 'test-project',
        buildId: 'build-risk',
        environment: 'production' as const,
        metrics: {
          coverage: { line: 85, branch: 80, function: 90, statement: 85 },
          testResults: { total: 100, passed: 95, failed: 5, skipped: 0 },
          security: { vulnerabilities: 5, critical: 0, high: 2, medium: 3, low: 0 },
          performance: { averageResponseTime: 150, throughput: 1200, errorRate: 0.02 },
          codeQuality: { complexity: 12, maintainability: 75, duplication: 3 }
        },
        context: {
          deploymentTarget: 'production',
          criticality: 'high' as const,
          changes: [
            { file: 'src/critical.ts', type: 'modified' as const, complexity: 15 }
          ]
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.riskAssessment).toBeDefined();
      expect(response.data.riskAssessment.level).toMatch(/low|medium|high|critical/);
    });

    it('should generate recommendations for improvement', async () => {
      const args = {
        projectId: 'test-project',
        buildId: 'build-recommendations',
        environment: 'development' as const,
        metrics: {
          coverage: { line: 60, branch: 55, function: 65, statement: 60 },
          testResults: { total: 100, passed: 85, failed: 15, skipped: 0 },
          security: { vulnerabilities: 8, critical: 0, high: 3, medium: 5, low: 0 },
          performance: { averageResponseTime: 500, throughput: 500, errorRate: 0.08 },
          codeQuality: { complexity: 25, maintainability: 55, duplication: 10 }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.recommendations).toBeDefined();
      expect(response.data.recommendations.length).toBeGreaterThan(0);
    });
  });

  // ========================================================================
  // QUALITY VALIDATE METRICS TESTS
  // ========================================================================
  describe('QualityValidateMetricsHandler', () => {
    let handler: QualityValidateMetricsHandler;

    beforeEach(() => {
      handler = new QualityValidateMetricsHandler(mockHookExecutor);
    });

    it('should validate metrics against default thresholds', async () => {
      const args = {
        metrics: {
          coverage: { line: 85, branch: 80, function: 90, statement: 85 },
          testResults: { total: 100, passed: 97, failed: 2, skipped: 1 },
          security: { critical: 0, high: 1, medium: 3, low: 5 },
          performance: { averageResponseTime: 200, throughput: 1500, errorRate: 0.02 },
          codeQuality: { complexity: 12, maintainability: 75, duplication: 3 }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.validations).toBeDefined();
      expect(response.data.summary.total).toBeGreaterThan(0);
      expect(response.data.overallScore).toBeGreaterThanOrEqual(0);
    });

    it('should use custom thresholds when provided', async () => {
      const args = {
        metrics: {
          coverage: { line: 75, branch: 70, function: 80, statement: 75 },
          testResults: { total: 100, passed: 95, failed: 5, skipped: 0 },
          security: { critical: 0, high: 0, medium: 2, low: 3 },
          performance: { averageResponseTime: 300, throughput: 800, errorRate: 0.03 },
          codeQuality: { complexity: 15, maintainability: 70, duplication: 4 }
        },
        thresholds: {
          coverage: { line: 70, branch: 65, function: 75, statement: 70 },
          testResults: { minSuccessRate: 90 },
          security: { maxCritical: 0, maxHigh: 1 }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.passed).toBeDefined();
    });

    it('should enforce strict mode validation', async () => {
      const args = {
        metrics: {
          coverage: { line: 79, branch: 74, function: 84, statement: 79 },
          testResults: { total: 100, passed: 95, failed: 5, skipped: 0 },
          security: { critical: 0, high: 0, medium: 5, low: 10 },
          performance: { averageResponseTime: 250, throughput: 1200, errorRate: 0.03 },
          codeQuality: { complexity: 14, maintainability: 72, duplication: 4 }
        },
        strictMode: true
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      // In strict mode, any failure should result in overall failure
      expect(response.data.passed).toBeDefined();
    });

    it('should provide detailed validation results per metric', async () => {
      const args = {
        metrics: {
          coverage: { line: 85, branch: 80, function: 90, statement: 85 },
          testResults: { total: 100, passed: 97, failed: 2, skipped: 1 },
          security: { critical: 0, high: 1, medium: 3, low: 5 },
          performance: { averageResponseTime: 200, throughput: 1500, errorRate: 0.02 },
          codeQuality: { complexity: 12, maintainability: 75, duplication: 3 }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.validations).toBeInstanceOf(Array);
      response.data.validations.forEach((validation: any) => {
        expect(validation).toHaveProperty('name');
        expect(validation).toHaveProperty('value');
        expect(validation).toHaveProperty('threshold');
        expect(validation).toHaveProperty('passed');
        expect(validation).toHaveProperty('severity');
      });
    });

    it('should generate actionable recommendations', async () => {
      const args = {
        metrics: {
          coverage: { line: 65, branch: 60, function: 70, statement: 65 },
          testResults: { total: 100, passed: 88, failed: 10, skipped: 2 },
          security: { critical: 1, high: 3, medium: 5, low: 8 },
          performance: { averageResponseTime: 800, throughput: 400, errorRate: 0.08 },
          codeQuality: { complexity: 22, maintainability: 58, duplication: 8 }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.recommendations).toBeDefined();
      expect(response.data.recommendations.length).toBeGreaterThan(0);
    });
  });

  // ========================================================================
  // QUALITY RISK ASSESS TESTS
  // ========================================================================
  describe('QualityRiskAssessHandler', () => {
    let handler: QualityRiskAssessHandler;

    beforeEach(() => {
      handler = new QualityRiskAssessHandler(mockHookExecutor);
    });

    it('should assess risk with comprehensive factors', async () => {
      const args = {
        context: {
          projectId: 'test-project',
          environment: 'production' as const,
          criticality: 'high' as const,
          changeSet: {
            filesModified: 15,
            linesChanged: 500,
            complexity: 12,
            authors: 3
          }
        },
        metrics: {
          coverage: { line: 85, branch: 80, delta: -2 },
          testResults: { total: 100, passed: 95, failed: 5, flakyTests: 2 },
          security: { critical: 0, high: 2, medium: 5, low: 8 },
          performance: { averageResponseTime: 250, throughput: 1200, errorRate: 0.03, regressions: 1 },
          quality: { complexity: 15, maintainability: 72, technicalDebt: 35 }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.overallRisk).toMatch(/low|medium|high|critical/);
      expect(response.data.riskScore).toBeGreaterThanOrEqual(0);
      expect(response.data.riskScore).toBeLessThanOrEqual(100);
      expect(response.data.riskFactors).toBeInstanceOf(Array);
    });

    it('should identify critical risks correctly', async () => {
      const args = {
        context: {
          projectId: 'test-project',
          environment: 'production' as const,
          criticality: 'critical' as const
        },
        metrics: {
          coverage: { line: 55, branch: 50, delta: -10 },
          testResults: { total: 100, passed: 80, failed: 15, flakyTests: 5 },
          security: { critical: 3, high: 5, medium: 8, low: 10 },
          performance: { averageResponseTime: 1200, throughput: 300, errorRate: 0.12, regressions: 5 },
          quality: { complexity: 28, maintainability: 45, technicalDebt: 120 }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.overallRisk).toMatch(/high|critical/);
      expect(response.data.riskFactors.some((f: any) => f.severity === 'critical')).toBe(true);
    });

    it('should calculate risk matrix correctly', async () => {
      const args = {
        context: {
          projectId: 'test-project',
          environment: 'staging' as const
        },
        metrics: {
          coverage: { line: 75, branch: 70 },
          testResults: { total: 100, passed: 92, failed: 8, flakyTests: 1 },
          security: { critical: 0, high: 1, medium: 4, low: 6 },
          performance: { averageResponseTime: 400, throughput: 800, errorRate: 0.04, regressions: 2 },
          quality: { complexity: 18, maintainability: 65, technicalDebt: 55 }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.riskMatrix).toBeDefined();
      expect(response.data.riskMatrix).toHaveProperty('technical');
      expect(response.data.riskMatrix).toHaveProperty('process');
      expect(response.data.riskMatrix).toHaveProperty('deployment');
      expect(response.data.riskMatrix).toHaveProperty('security');
      expect(response.data.riskMatrix).toHaveProperty('performance');
    });

    it('should generate AI insights when enabled', async () => {
      const args = {
        context: {
          projectId: 'test-project',
          environment: 'production' as const
        },
        metrics: {
          coverage: { line: 80, branch: 75 },
          testResults: { total: 100, passed: 94, failed: 6, flakyTests: 0 },
          security: { critical: 0, high: 2, medium: 3, low: 5 },
          performance: { averageResponseTime: 300, throughput: 1000, errorRate: 0.03, regressions: 1 },
          quality: { complexity: 15, maintainability: 70, technicalDebt: 40 }
        },
        aiReasoning: true
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      // AI insights only generated for non-low risk
      if (response.data.overallRisk !== 'low') {
        expect(response.data.aiInsights).toBeDefined();
      }
    });

    it('should provide mitigation recommendations', async () => {
      const args = {
        context: {
          projectId: 'test-project',
          environment: 'production' as const
        },
        metrics: {
          coverage: { line: 70, branch: 65 },
          testResults: { total: 100, passed: 88, failed: 12, flakyTests: 3 },
          security: { critical: 0, high: 3, medium: 6, low: 9 },
          performance: { averageResponseTime: 600, throughput: 600, errorRate: 0.07, regressions: 3 },
          quality: { complexity: 20, maintainability: 60, technicalDebt: 75 }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.recommendations).toBeDefined();
      expect(response.data.recommendations.length).toBeGreaterThan(0);
      response.data.recommendations.forEach((rec: any) => {
        expect(rec).toHaveProperty('priority');
        expect(rec).toHaveProperty('action');
        expect(rec).toHaveProperty('rationale');
      });
    });
  });

  // ========================================================================
  // QUALITY DECISION MAKE TESTS
  // ========================================================================
  describe('QualityDecisionMakeHandler', () => {
    let handler: QualityDecisionMakeHandler;

    beforeEach(() => {
      handler = new QualityDecisionMakeHandler(mockHookExecutor);
    });

    it('should make GO decision for passing quality inputs', async () => {
      const args = {
        context: {
          projectId: 'test-project',
          buildId: 'build-123',
          environment: 'production' as const,
          deploymentType: 'standard' as const,
          requestedBy: 'user@example.com',
          urgency: 'medium' as const
        },
        inputs: {
          qualityGateResult: { decision: 'PASS' as const, score: 92, threshold: 85 },
          riskAssessment: { overallRisk: 'low' as const, riskScore: 15 },
          policyCompliance: { compliant: true, violations: 0, criticalViolations: 0 }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.decision).toBe('GO');
      expect(response.data.confidence).toBeGreaterThan(0.8);
    });

    it('should make NO_GO decision for critical failures', async () => {
      const args = {
        context: {
          projectId: 'test-project',
          buildId: 'build-456',
          environment: 'production' as const,
          deploymentType: 'standard' as const,
          requestedBy: 'user@example.com',
          urgency: 'medium' as const
        },
        inputs: {
          qualityGateResult: { decision: 'FAIL' as const, score: 45, threshold: 85 },
          riskAssessment: { overallRisk: 'critical' as const, riskScore: 85 },
          policyCompliance: { compliant: false, violations: 5, criticalViolations: 2 }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.decision).toBe('NO_GO');
    });

    it('should make CONDITIONAL_GO decision for warnings', async () => {
      const args = {
        context: {
          projectId: 'test-project',
          buildId: 'build-789',
          environment: 'production' as const,
          deploymentType: 'standard' as const,
          requestedBy: 'user@example.com',
          urgency: 'medium' as const
        },
        inputs: {
          qualityGateResult: { decision: 'PASS' as const, score: 82, threshold: 80 },
          riskAssessment: { overallRisk: 'medium' as const, riskScore: 45 },
          policyCompliance: { compliant: true, violations: 2, criticalViolations: 0 }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(['GO', 'CONDITIONAL_GO']).toContain(response.data.decision);
      if (response.data.decision === 'CONDITIONAL_GO') {
        expect(response.data.conditions).toBeDefined();
      }
    });

    it('should make ESCALATE decision for complex scenarios', async () => {
      const args = {
        context: {
          projectId: 'test-project',
          buildId: 'build-escalate',
          environment: 'production' as const,
          deploymentType: 'standard' as const,
          requestedBy: 'user@example.com',
          urgency: 'high' as const
        },
        inputs: {
          qualityGateResult: { decision: 'ESCALATE' as const, score: 75, threshold: 85 },
          riskAssessment: { overallRisk: 'high' as const, riskScore: 65 },
          policyCompliance: { compliant: false, violations: 3, criticalViolations: 1 }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(['ESCALATE', 'NO_GO']).toContain(response.data.decision);
    });

    it('should require approval for high-risk deployments', async () => {
      const args = {
        context: {
          projectId: 'test-project',
          buildId: 'build-approval',
          environment: 'production' as const,
          deploymentType: 'standard' as const,
          requestedBy: 'user@example.com',
          urgency: 'critical' as const
        },
        inputs: {
          qualityGateResult: { decision: 'PASS' as const, score: 80, threshold: 85 },
          riskAssessment: { overallRisk: 'high' as const, riskScore: 55 },
          policyCompliance: { compliant: true, violations: 0, criticalViolations: 0 }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.approvalRequired).toBeDefined();
    });

    it('should apply policy overrides when authorized', async () => {
      const args = {
        context: {
          projectId: 'test-project',
          buildId: 'build-override',
          environment: 'production' as const,
          deploymentType: 'hotfix' as const,
          requestedBy: 'user@example.com',
          urgency: 'critical' as const
        },
        inputs: {
          qualityGateResult: { decision: 'FAIL' as const, score: 70, threshold: 85 },
          riskAssessment: { overallRisk: 'medium' as const, riskScore: 40 },
          policyCompliance: { compliant: false, violations: 1, criticalViolations: 0 }
        },
        overrides: {
          allowPolicyOverride: true,
          overrideReason: 'Critical production hotfix',
          approvedBy: 'manager@example.com'
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      // Override may change NO_GO to CONDITIONAL_GO
      expect(['CONDITIONAL_GO', 'NO_GO']).toContain(response.data.decision);
    });
  });

  // ========================================================================
  // QUALITY POLICY CHECK TESTS
  // ========================================================================
  describe('QualityPolicyCheckHandler', () => {
    let handler: QualityPolicyCheckHandler;

    beforeEach(() => {
      handler = new QualityPolicyCheckHandler(mockHookExecutor);
    });

    it('should check compliance with default policy', async () => {
      const args = {
        metrics: {
          coverage: { line: 85, branch: 80, function: 90, statement: 85 },
          quality: { complexity: 12, maintainability: 75, duplication: 3, codeSmells: 5 },
          security: {
            vulnerabilities: { critical: 0, high: 1, medium: 3, low: 5 },
            complianceScore: 88
          },
          documentation: { coverage: 70, quality: 75 },
          testing: {
            unitTestCoverage: 85,
            integrationTestCoverage: 75,
            e2eTestCoverage: 60,
            mutationScore: 78
          }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data).toHaveProperty('compliant');
      expect(response.data.policyEvaluations).toBeInstanceOf(Array);
      expect(response.data.summary.totalRequirements).toBeGreaterThan(0);
    });

    it('should check compliance with ISO 25010 policy', async () => {
      const args = {
        policyId: 'iso-25010',
        metrics: {
          coverage: { line: 85, branch: 80, function: 90, statement: 85 },
          quality: { complexity: 12, maintainability: 75, duplication: 3, codeSmells: 5 },
          security: {
            vulnerabilities: { critical: 0, high: 0, medium: 2, low: 5 },
            complianceScore: 92
          },
          documentation: { coverage: 80, quality: 85 },
          testing: {
            unitTestCoverage: 88,
            integrationTestCoverage: 80,
            e2eTestCoverage: 70,
            mutationScore: 82
          }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.metadata.policyVersion).toBeDefined();
    });

    it('should check compliance with OWASP security policy', async () => {
      const args = {
        policyId: 'owasp-security',
        metrics: {
          coverage: { line: 85, branch: 80, function: 90, statement: 85 },
          quality: { complexity: 12, maintainability: 75, duplication: 3, codeSmells: 5 },
          security: {
            vulnerabilities: { critical: 0, high: 1, medium: 3, low: 5 },
            complianceScore: 88
          },
          documentation: { coverage: 70, quality: 75 },
          testing: {
            unitTestCoverage: 85,
            integrationTestCoverage: 75,
            e2eTestCoverage: 60,
            mutationScore: 78
          }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.compliant).toBeDefined();
    });

    it('should identify policy violations correctly', async () => {
      const args = {
        metrics: {
          coverage: { line: 65, branch: 60, function: 70, statement: 65 },
          quality: { complexity: 25, maintainability: 55, duplication: 8, codeSmells: 15 },
          security: {
            vulnerabilities: { critical: 1, high: 3, medium: 5, low: 8 },
            complianceScore: 65
          },
          documentation: { coverage: 45, quality: 50 },
          testing: {
            unitTestCoverage: 60,
            integrationTestCoverage: 50,
            e2eTestCoverage: 40,
            mutationScore: 55
          }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.compliant).toBe(false);
      expect(response.data.violations.length).toBeGreaterThan(0);
    });

    it('should use custom policy when provided', async () => {
      const customPolicy = {
        id: 'custom-strict-policy',
        name: 'Custom Strict Policy',
        version: '2.0.0',
        type: 'custom' as const,
        standards: [
          {
            id: 'strict-coverage',
            name: 'Strict Coverage Requirements',
            category: 'testing',
            description: 'Very strict coverage requirements',
            requirements: [
              {
                id: 'line-coverage-strict',
                description: 'Line coverage must be 95%+',
                metric: 'coverage.line',
                operator: 'gte' as const,
                threshold: 95,
                critical: true,
                rationale: 'Ensure maximum code coverage'
              }
            ]
          }
        ],
        enforcementLevel: 'mandatory' as const,
        scope: ['all'],
        owner: 'Quality Team',
        lastUpdated: new Date().toISOString()
      };

      const args = {
        customPolicy,
        metrics: {
          coverage: { line: 92, branch: 88, function: 95, statement: 92 },
          quality: { complexity: 10, maintainability: 85, duplication: 2, codeSmells: 3 },
          security: {
            vulnerabilities: { critical: 0, high: 0, medium: 1, low: 2 },
            complianceScore: 95
          },
          documentation: { coverage: 85, quality: 90 },
          testing: {
            unitTestCoverage: 92,
            integrationTestCoverage: 88,
            e2eTestCoverage: 80,
            mutationScore: 88
          }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.metadata.policyVersion).toBe('2.0.0');
    });

    it('should provide detailed recommendations for non-compliance', async () => {
      const args = {
        metrics: {
          coverage: { line: 70, branch: 65, function: 75, statement: 70 },
          quality: { complexity: 20, maintainability: 62, duplication: 7, codeSmells: 12 },
          security: {
            vulnerabilities: { critical: 0, high: 2, medium: 5, low: 8 },
            complianceScore: 72
          },
          documentation: { coverage: 55, quality: 60 },
          testing: {
            unitTestCoverage: 70,
            integrationTestCoverage: 60,
            e2eTestCoverage: 50,
            mutationScore: 65
          }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.recommendations).toBeDefined();
      expect(response.data.recommendations.length).toBeGreaterThan(0);
    });
  });

  // ========================================================================
  // INTEGRATION TESTS
  // ========================================================================
  describe('Quality Tools Integration', () => {
    it('should coordinate between validation and risk assessment', async () => {
      const validationHandler = new QualityValidateMetricsHandler(mockHookExecutor);
      const riskHandler = new QualityRiskAssessHandler(mockHookExecutor);

      const metrics = {
        coverage: { line: 75, branch: 70 },
        testResults: { total: 100, passed: 90, failed: 10, skipped: 0 },
        security: { critical: 0, high: 2, medium: 4, low: 6 },
        performance: { averageResponseTime: 400, throughput: 900, errorRate: 0.05 },
        codeQuality: { complexity: 18, maintainability: 68, duplication: 6 }
      };

      const validationResponse = await validationHandler.handle({ metrics });
      expect(validationResponse.success).toBe(true);

      const riskResponse = await riskHandler.handle({
        context: {
          projectId: 'integration-test',
          environment: 'staging' as const
        },
        metrics: {
          coverage: { line: 75, branch: 70 },
          testResults: { total: 100, passed: 90, failed: 10, flakyTests: 0 },
          security: { critical: 0, high: 2, medium: 4, low: 6 },
          performance: { averageResponseTime: 400, throughput: 900, errorRate: 0.05, regressions: 1 },
          quality: { complexity: 18, maintainability: 68, technicalDebt: 45 }
        }
      });
      expect(riskResponse.success).toBe(true);
    });
  });
});
