/**
 * Quality Gate Execute Handler Test Suite
 *
 * Comprehensive tests for quality-gate-execute MCP tool handler.
 * Tests quality gate policy enforcement, multi-metric evaluation, risk assessment, and decision making.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  QualityGateExecuteHandler,
  QualityGateExecuteArgs,
  QualityGatePolicy,
  PolicyRule
} from '../../../../src/mcp/handlers/quality/quality-gate-execute.js';
import { AgentRegistry } from '../../../../src/mcp/services/AgentRegistry.js';
import { HookExecutor } from '../../../../src/mcp/services/HookExecutor.js';

// Mock services
jest.mock('../../../../src/mcp/services/AgentRegistry.js');
jest.mock('../../../../src/mcp/services/HookExecutor.js');
jest.mock('../../../../src/utils/SecureRandom.js', () => ({
  SecureRandom: {
    generateId: jest.fn(() => 'test-execution-id')
  }
}));

describe('QualityGateExecuteHandler', () => {
  let handler: QualityGateExecuteHandler;
  let mockAgentRegistry: AgentRegistry;
  let mockHookExecutor: HookExecutor;

  beforeEach(() => {
    // Setup mock AgentRegistry
    mockAgentRegistry = {
      spawnAgent: jest.fn().mockResolvedValue({
        id: 'agent-quality-gate-1',
        type: 'quality-gate',
        status: 'active'
      }),
      getStatistics: jest.fn().mockReturnValue({ totalAgents: 1 })
    } as any;

    // Setup mock HookExecutor
    mockHookExecutor = {
      executePreTask: jest.fn().mockResolvedValue(undefined),
      executePostTask: jest.fn().mockResolvedValue(undefined),
      executePostEdit: jest.fn().mockResolvedValue(undefined),
      notify: jest.fn().mockResolvedValue(undefined)
    } as any;

    // Initialize handler with mocks
    handler = new QualityGateExecuteHandler(mockAgentRegistry, mockHookExecutor);
  });

  describe('Happy Path - Valid Quality Gate Execution', () => {
    it('should pass quality gate with excellent metrics', async () => {
      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-123',
        environment: 'development',
        metrics: {
          coverage: { line: 90, branch: 85, function: 92, statement: 88 },
          testResults: { total: 100, passed: 98, failed: 2, skipped: 0 },
          security: { vulnerabilities: 0, critical: 0, high: 0, medium: 0, low: 0 },
          performance: { averageResponseTime: 100, throughput: 1200, errorRate: 0.01 },
          codeQuality: { complexity: 8, maintainability: 90, duplication: 3 }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.decision).toBe('PASS');
      expect(response.data.score).toBeGreaterThan(80);
      expect(response.data.policyCompliance.compliant).toBe(true);
      expect(response.data.metadata.agentId).toBe('agent-quality-gate-1');
      expect(response.data.metadata.policyVersion).toBe('1.0.0');
    });

    it('should fail quality gate with critical security vulnerabilities', async () => {
      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-124',
        environment: 'production',
        metrics: {
          coverage: { line: 85, branch: 80, function: 90, statement: 85 },
          testResults: { total: 100, passed: 95, failed: 5, skipped: 0 },
          security: { vulnerabilities: 5, critical: 2, high: 3, medium: 0, low: 0 }, // Critical!
          performance: { averageResponseTime: 150, throughput: 1000, errorRate: 0.05 },
          codeQuality: { complexity: 15, maintainability: 80, duplication: 8 }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.decision).toBe('FAIL');
      expect(response.data.policyCompliance.compliant).toBe(false);
      expect(response.data.policyCompliance.violations.length).toBeGreaterThan(0);
      expect(response.data.riskAssessment.level).toMatch(/high|critical/);
    });

    it('should escalate with high risk factors', async () => {
      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-125',
        environment: 'production',
        metrics: {
          coverage: { line: 78, branch: 75, function: 80, statement: 77 }, // Below threshold
          testResults: { total: 100, passed: 90, failed: 10, skipped: 0 },
          security: { vulnerabilities: 3, critical: 0, high: 3, medium: 0, low: 0 },
          performance: { averageResponseTime: 200, throughput: 800, errorRate: 0.08 },
          codeQuality: { complexity: 20, maintainability: 70, duplication: 12 }
        },
        context: {
          deploymentTarget: 'production',
          criticality: 'critical'
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.decision).toMatch(/ESCALATE|FAIL/);
      expect(response.data.riskAssessment.level).toMatch(/high|critical/);
      expect(response.data.riskAssessment.factors.length).toBeGreaterThan(0);
    });

    it('should pass quality gate with good metrics in development environment', async () => {
      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-126',
        environment: 'development',
        metrics: {
          coverage: { line: 82, branch: 78, function: 85, statement: 80 },
          testResults: { total: 50, passed: 48, failed: 2, skipped: 0 },
          security: { vulnerabilities: 2, critical: 0, high: 0, medium: 2, low: 0 },
          performance: { averageResponseTime: 180, throughput: 900, errorRate: 0.03 },
          codeQuality: { complexity: 12, maintainability: 78, duplication: 7 }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.decision).toBe('PASS');
      expect(response.data.policyCompliance.compliant).toBe(true);
      expect(response.data.evaluations).toBeDefined();
      expect(response.data.evaluations.coverage.passed).toBe(true);
      expect(response.data.evaluations.testSuccess.passed).toBe(true);
    });

    it('should calculate composite score correctly', async () => {
      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-127',
        environment: 'staging',
        metrics: {
          coverage: { line: 85, branch: 82, function: 88, statement: 84 },
          testResults: { total: 100, passed: 97, failed: 3, skipped: 0 },
          security: { vulnerabilities: 1, critical: 0, high: 0, medium: 1, low: 0 },
          performance: { averageResponseTime: 120, throughput: 1100, errorRate: 0.02 },
          codeQuality: { complexity: 10, maintainability: 85, duplication: 5 }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.score).toBeGreaterThan(0);
      expect(response.data.score).toBeLessThanOrEqual(100);
      expect(response.data.threshold).toBeGreaterThan(0);
      expect(response.data.threshold).toBeLessThanOrEqual(100);
    });
  });

  describe('Policy Evaluation', () => {
    it('should evaluate default policy correctly', async () => {
      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-201',
        environment: 'development',
        metrics: {
          coverage: { line: 85, branch: 80, function: 90, statement: 85 },
          testResults: { total: 100, passed: 98, failed: 2, skipped: 0 },
          security: { vulnerabilities: 0, critical: 0, high: 0, medium: 0, low: 0 },
          performance: { averageResponseTime: 100, throughput: 1200, errorRate: 0.01 },
          codeQuality: { complexity: 8, maintainability: 90, duplication: 3 }
        }
      };

      const response = await handler.handle(args);

      expect(response.data.policyCompliance.compliant).toBe(true);
      expect(response.data.metadata.policyVersion).toBe('1.0.0');
      expect(response.data.policyCompliance.violations.length).toBe(0);
    });

    it('should evaluate custom policy with stricter thresholds', async () => {
      const customPolicy: QualityGatePolicy = {
        name: 'strict-policy',
        version: '2.0.0',
        thresholds: {
          coverage: 0.90, // Stricter than default 0.80
          testSuccess: 0.99,
          securityVulns: 0,
          performanceRegression: 0.05,
          codeQuality: 0.85
        },
        rules: [
          {
            id: 'rule-strict-coverage',
            name: 'Strict Coverage',
            condition: 'coverage.line >= 90',
            action: 'block',
            severity: 'critical',
            description: 'Line coverage must be at least 90%'
          },
          {
            id: 'rule-strict-test-success',
            name: 'Strict Test Success',
            condition: 'testSuccess >= 99',
            action: 'block',
            severity: 'high',
            description: 'Test success rate must be at least 99%'
          }
        ],
        enforcement: 'strict'
      };

      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-202',
        environment: 'production',
        policy: customPolicy,
        metrics: {
          coverage: { line: 85, branch: 80, function: 90, statement: 85 }, // Fails strict policy
          testResults: { total: 100, passed: 98, failed: 2, skipped: 0 }, // Fails strict policy
          security: { vulnerabilities: 0, critical: 0, high: 0, medium: 0, low: 0 },
          performance: { averageResponseTime: 100, throughput: 1200, errorRate: 0.01 },
          codeQuality: { complexity: 8, maintainability: 90, duplication: 3 }
        }
      };

      const response = await handler.handle(args);

      expect(response.data.policyCompliance.compliant).toBe(false);
      expect(response.data.metadata.policyVersion).toBe('2.0.0');
      expect(response.data.policyCompliance.violations.length).toBeGreaterThan(0);
    });

    it('should check all policy rules and identify violations', async () => {
      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-203',
        environment: 'development',
        metrics: {
          coverage: { line: 75, branch: 70, function: 80, statement: 75 }, // Below 80%
          testResults: { total: 100, passed: 92, failed: 8, skipped: 0 }, // Below 95%
          security: { vulnerabilities: 1, critical: 1, high: 0, medium: 0, low: 0 }, // Has critical
          performance: { averageResponseTime: 250, throughput: 600, errorRate: 0.15 }, // High error rate
          codeQuality: { complexity: 25, maintainability: 65, duplication: 15 }
        }
      };

      const response = await handler.handle(args);

      expect(response.data.policyCompliance.violations.length).toBeGreaterThan(1);
      expect(response.data.policyCompliance.compliant).toBe(false);
      expect(response.data.decision).toBe('FAIL');
    });

    it('should distinguish between violations and warnings', async () => {
      const customPolicy: QualityGatePolicy = {
        name: 'mixed-policy',
        version: '1.5.0',
        thresholds: {
          coverage: 0.80,
          testSuccess: 0.95,
          securityVulns: 0,
          performanceRegression: 0.10,
          codeQuality: 0.75
        },
        rules: [
          {
            id: 'rule-coverage-block',
            name: 'Coverage Blocking Rule',
            condition: 'coverage.line >= 80',
            action: 'block',
            severity: 'critical',
            description: 'Line coverage must be at least 80%'
          },
          {
            id: 'rule-performance-warn',
            name: 'Performance Warning Rule',
            condition: 'performanceRegression <= 10',
            action: 'warn',
            severity: 'medium',
            description: 'Performance regression should not exceed 10%'
          }
        ],
        enforcement: 'strict'
      };

      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-204',
        environment: 'development',
        policy: customPolicy,
        metrics: {
          coverage: { line: 85, branch: 80, function: 88, statement: 83 },
          testResults: { total: 100, passed: 97, failed: 3, skipped: 0 },
          security: { vulnerabilities: 0, critical: 0, high: 0, medium: 0, low: 0 },
          performance: { averageResponseTime: 220, throughput: 750, errorRate: 0.12 }, // Triggers warning
          codeQuality: { complexity: 12, maintainability: 80, duplication: 8 }
        }
      };

      const response = await handler.handle(args);

      expect(response.data.policyCompliance.warnings.length).toBeGreaterThan(0);
      expect(response.data.decision).toBe('PASS'); // Warnings don't block
    });

    it('should handle policy with no violations', async () => {
      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-205',
        environment: 'development',
        metrics: {
          coverage: { line: 95, branch: 92, function: 96, statement: 94 },
          testResults: { total: 100, passed: 100, failed: 0, skipped: 0 },
          security: { vulnerabilities: 0, critical: 0, high: 0, medium: 0, low: 0 },
          performance: { averageResponseTime: 80, throughput: 1500, errorRate: 0.005 },
          codeQuality: { complexity: 5, maintainability: 95, duplication: 2 }
        }
      };

      const response = await handler.handle(args);

      expect(response.data.policyCompliance.compliant).toBe(true);
      expect(response.data.policyCompliance.violations.length).toBe(0);
      expect(response.data.decision).toBe('PASS');
      expect(response.data.score).toBeGreaterThan(90);
    });
  });

  describe('Risk Assessment Integration', () => {
    it('should assess low risk for good metrics', async () => {
      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-301',
        environment: 'development',
        metrics: {
          coverage: { line: 85, branch: 82, function: 88, statement: 84 },
          testResults: { total: 100, passed: 98, failed: 2, skipped: 0 },
          security: { vulnerabilities: 0, critical: 0, high: 0, medium: 0, low: 0 },
          performance: { averageResponseTime: 120, throughput: 1100, errorRate: 0.02 },
          codeQuality: { complexity: 10, maintainability: 85, duplication: 5 }
        }
      };

      const response = await handler.handle(args);

      expect(response.data.riskAssessment.level).toBe('low');
      expect(response.data.riskAssessment.factors.length).toBe(0);
    });

    it('should assess high risk for critical security vulnerabilities', async () => {
      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-302',
        environment: 'production',
        metrics: {
          coverage: { line: 85, branch: 82, function: 88, statement: 84 },
          testResults: { total: 100, passed: 95, failed: 5, skipped: 0 },
          security: { vulnerabilities: 3, critical: 2, high: 1, medium: 0, low: 0 }, // Critical!
          performance: { averageResponseTime: 150, throughput: 1000, errorRate: 0.04 },
          codeQuality: { complexity: 12, maintainability: 80, duplication: 7 }
        }
      };

      const response = await handler.handle(args);

      expect(response.data.riskAssessment.level).toMatch(/high|critical/);
      expect(response.data.riskAssessment.factors).toContain(
        expect.stringContaining('security vulnerabilities')
      );
      expect(response.data.riskAssessment.mitigation.length).toBeGreaterThan(0);
    });

    it('should assess high risk for high test failure rate', async () => {
      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-303',
        environment: 'staging',
        metrics: {
          coverage: { line: 85, branch: 82, function: 88, statement: 84 },
          testResults: { total: 100, passed: 88, failed: 12, skipped: 0 }, // 12% failure rate
          security: { vulnerabilities: 0, critical: 0, high: 0, medium: 0, low: 0 },
          performance: { averageResponseTime: 120, throughput: 1100, errorRate: 0.02 },
          codeQuality: { complexity: 10, maintainability: 85, duplication: 5 }
        }
      };

      const response = await handler.handle(args);

      expect(response.data.riskAssessment.level).toMatch(/medium|high/);
      expect(response.data.riskAssessment.factors).toContain(
        expect.stringContaining('test failure rate')
      );
    });

    it('should increase risk for critical production deployment', async () => {
      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-304',
        environment: 'production',
        metrics: {
          coverage: { line: 80, branch: 78, function: 82, statement: 79 },
          testResults: { total: 100, passed: 94, failed: 6, skipped: 0 },
          security: { vulnerabilities: 1, critical: 0, high: 1, medium: 0, low: 0 },
          performance: { averageResponseTime: 180, throughput: 900, errorRate: 0.06 },
          codeQuality: { complexity: 15, maintainability: 75, duplication: 10 }
        },
        context: {
          deploymentTarget: 'production',
          criticality: 'critical'
        }
      };

      const response = await handler.handle(args);

      expect(response.data.riskAssessment.level).toMatch(/medium|high|critical/);
      expect(response.data.riskAssessment.factors).toContain(
        expect.stringContaining('Critical production deployment')
      );
    });

    it('should provide mitigation strategies for identified risks', async () => {
      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-305',
        environment: 'production',
        metrics: {
          coverage: { line: 75, branch: 70, function: 78, statement: 73 },
          testResults: { total: 100, passed: 90, failed: 10, skipped: 0 },
          security: { vulnerabilities: 2, critical: 1, high: 1, medium: 0, low: 0 },
          performance: { averageResponseTime: 200, throughput: 800, errorRate: 0.08 },
          codeQuality: { complexity: 20, maintainability: 70, duplication: 12 }
        },
        context: {
          deploymentTarget: 'production',
          criticality: 'high'
        }
      };

      const response = await handler.handle(args);

      expect(response.data.riskAssessment.mitigation.length).toBeGreaterThan(0);
      expect(response.data.riskAssessment.mitigation).toContain(
        expect.stringContaining('security')
      );
      expect(response.data.riskAssessment.mitigation).toContain(
        expect.stringContaining('test')
      );
    });
  });

  describe('Multi-Metric Evaluation', () => {
    it('should evaluate coverage metrics correctly', async () => {
      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-401',
        environment: 'development',
        metrics: {
          coverage: { line: 88, branch: 85, function: 90, statement: 87 },
          testResults: { total: 100, passed: 98, failed: 2, skipped: 0 },
          security: { vulnerabilities: 0, critical: 0, high: 0, medium: 0, low: 0 },
          performance: { averageResponseTime: 120, throughput: 1100, errorRate: 0.02 },
          codeQuality: { complexity: 10, maintainability: 85, duplication: 5 }
        }
      };

      const response = await handler.handle(args);

      expect(response.data.evaluations.coverage).toBeDefined();
      expect(response.data.evaluations.coverage.passed).toBe(true);
      expect(response.data.evaluations.coverage.status).toMatch(/excellent|good/);
      expect(response.data.evaluations.coverage.score).toBeGreaterThan(0);
    });

    it('should evaluate test success metrics correctly', async () => {
      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-402',
        environment: 'development',
        metrics: {
          coverage: { line: 85, branch: 82, function: 88, statement: 84 },
          testResults: { total: 100, passed: 97, failed: 3, skipped: 0 },
          security: { vulnerabilities: 0, critical: 0, high: 0, medium: 0, low: 0 },
          performance: { averageResponseTime: 120, throughput: 1100, errorRate: 0.02 },
          codeQuality: { complexity: 10, maintainability: 85, duplication: 5 }
        }
      };

      const response = await handler.handle(args);

      expect(response.data.evaluations.testSuccess).toBeDefined();
      expect(response.data.evaluations.testSuccess.passed).toBe(true);
      expect(response.data.evaluations.testSuccess.value).toBeCloseTo(97, 0);
    });

    it('should evaluate security metrics correctly', async () => {
      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-403',
        environment: 'development',
        metrics: {
          coverage: { line: 85, branch: 82, function: 88, statement: 84 },
          testResults: { total: 100, passed: 98, failed: 2, skipped: 0 },
          security: { vulnerabilities: 1, critical: 0, high: 1, medium: 0, low: 0 },
          performance: { averageResponseTime: 120, throughput: 1100, errorRate: 0.02 },
          codeQuality: { complexity: 10, maintainability: 85, duplication: 5 }
        }
      };

      const response = await handler.handle(args);

      expect(response.data.evaluations.security).toBeDefined();
      expect(response.data.evaluations.security.value).toBe(1); // 1 vulnerability
    });

    it('should evaluate performance metrics correctly', async () => {
      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-404',
        environment: 'development',
        metrics: {
          coverage: { line: 85, branch: 82, function: 88, statement: 84 },
          testResults: { total: 100, passed: 98, failed: 2, skipped: 0 },
          security: { vulnerabilities: 0, critical: 0, high: 0, medium: 0, low: 0 },
          performance: { averageResponseTime: 120, throughput: 1100, errorRate: 0.03 },
          codeQuality: { complexity: 10, maintainability: 85, duplication: 5 }
        }
      };

      const response = await handler.handle(args);

      expect(response.data.evaluations.performance).toBeDefined();
      expect(response.data.evaluations.performance.passed).toBe(true);
      expect(response.data.evaluations.performance.value).toBe(3); // 3% error rate
    });

    it('should evaluate code quality metrics correctly', async () => {
      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-405',
        environment: 'development',
        metrics: {
          coverage: { line: 85, branch: 82, function: 88, statement: 84 },
          testResults: { total: 100, passed: 98, failed: 2, skipped: 0 },
          security: { vulnerabilities: 0, critical: 0, high: 0, medium: 0, low: 0 },
          performance: { averageResponseTime: 120, throughput: 1100, errorRate: 0.02 },
          codeQuality: { complexity: 8, maintainability: 90, duplication: 3 }
        }
      };

      const response = await handler.handle(args);

      expect(response.data.evaluations.codeQuality).toBeDefined();
      expect(response.data.evaluations.codeQuality.passed).toBe(true);
      expect(response.data.evaluations.codeQuality.status).toMatch(/excellent|good/);
    });

    it('should calculate evaluation status correctly', async () => {
      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-406',
        environment: 'development',
        metrics: {
          coverage: { line: 95, branch: 92, function: 96, statement: 94 }, // Excellent
          testResults: { total: 100, passed: 100, failed: 0, skipped: 0 }, // Excellent
          security: { vulnerabilities: 0, critical: 0, high: 0, medium: 0, low: 0 }, // Excellent
          performance: { averageResponseTime: 80, throughput: 1500, errorRate: 0.005 }, // Excellent
          codeQuality: { complexity: 5, maintainability: 95, duplication: 2 } // Excellent
        }
      };

      const response = await handler.handle(args);

      expect(response.data.evaluations.coverage.status).toBe('excellent');
      expect(response.data.evaluations.testSuccess.status).toBe('excellent');
      expect(response.data.evaluations.security.status).toMatch(/excellent|good/);
      expect(response.data.evaluations.performance.status).toMatch(/excellent|good/);
      expect(response.data.evaluations.codeQuality.status).toMatch(/excellent|good/);
    });
  });

  describe('Decision Making (Pass/Fail/Warning)', () => {
    it('should make PASS decision when all metrics are good', async () => {
      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-501',
        environment: 'development',
        metrics: {
          coverage: { line: 85, branch: 82, function: 88, statement: 84 },
          testResults: { total: 100, passed: 98, failed: 2, skipped: 0 },
          security: { vulnerabilities: 0, critical: 0, high: 0, medium: 0, low: 0 },
          performance: { averageResponseTime: 120, throughput: 1100, errorRate: 0.02 },
          codeQuality: { complexity: 10, maintainability: 85, duplication: 5 }
        }
      };

      const response = await handler.handle(args);

      expect(response.data.decision).toBe('PASS');
      expect(response.data.policyCompliance.compliant).toBe(true);
      expect(response.data.riskAssessment.level).toBe('low');
    });

    it('should make FAIL decision with critical violations', async () => {
      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-502',
        environment: 'production',
        metrics: {
          coverage: { line: 70, branch: 65, function: 72, statement: 68 }, // Below threshold
          testResults: { total: 100, passed: 88, failed: 12, skipped: 0 }, // Below threshold
          security: { vulnerabilities: 3, critical: 2, high: 1, medium: 0, low: 0 }, // Critical!
          performance: { averageResponseTime: 250, throughput: 600, errorRate: 0.15 },
          codeQuality: { complexity: 25, maintainability: 65, duplication: 15 }
        }
      };

      const response = await handler.handle(args);

      expect(response.data.decision).toBe('FAIL');
      expect(response.data.policyCompliance.compliant).toBe(false);
    });

    it('should make ESCALATE decision with high risk but no critical violations', async () => {
      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-503',
        environment: 'production',
        metrics: {
          coverage: { line: 78, branch: 75, function: 80, statement: 77 },
          testResults: { total: 100, passed: 91, failed: 9, skipped: 0 }, // High failure rate
          security: { vulnerabilities: 2, critical: 0, high: 2, medium: 0, low: 0 }, // No critical
          performance: { averageResponseTime: 200, throughput: 800, errorRate: 0.08 },
          codeQuality: { complexity: 18, maintainability: 72, duplication: 11 }
        },
        context: {
          deploymentTarget: 'production',
          criticality: 'high'
        }
      };

      const response = await handler.handle(args);

      expect(response.data.decision).toMatch(/ESCALATE|FAIL/);
      expect(response.data.riskAssessment.level).toMatch(/high|critical/);
    });

    it('should respect policy enforcement level in decision making', async () => {
      const advisoryPolicy: QualityGatePolicy = {
        name: 'advisory-policy',
        version: '1.0.0',
        thresholds: {
          coverage: 0.80,
          testSuccess: 0.95,
          securityVulns: 0,
          performanceRegression: 0.10,
          codeQuality: 0.75
        },
        rules: [],
        enforcement: 'advisory' // Advisory mode
      };

      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-504',
        environment: 'development',
        policy: advisoryPolicy,
        metrics: {
          coverage: { line: 75, branch: 70, function: 78, statement: 73 }, // Below threshold
          testResults: { total: 100, passed: 92, failed: 8, skipped: 0 },
          security: { vulnerabilities: 0, critical: 0, high: 0, medium: 0, low: 0 },
          performance: { averageResponseTime: 180, throughput: 900, errorRate: 0.05 },
          codeQuality: { complexity: 15, maintainability: 75, duplication: 10 }
        }
      };

      const response = await handler.handle(args);

      // Advisory mode may be more lenient
      expect(response.data.decision).toMatch(/PASS|ESCALATE/);
    });
  });

  describe('Custom Policies', () => {
    it('should apply custom policy rules', async () => {
      const customPolicy: QualityGatePolicy = {
        name: 'custom-policy',
        version: '3.0.0',
        thresholds: {
          coverage: 0.85,
          testSuccess: 0.98,
          securityVulns: 0,
          performanceRegression: 0.08,
          codeQuality: 0.80
        },
        rules: [
          {
            id: 'custom-rule-1',
            name: 'Custom Coverage Rule',
            condition: 'coverage.line >= 85',
            action: 'block',
            severity: 'high',
            description: 'Custom coverage requirement'
          }
        ],
        enforcement: 'blocking'
      };

      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-601',
        environment: 'production',
        policy: customPolicy,
        metrics: {
          coverage: { line: 82, branch: 78, function: 85, statement: 80 }, // Fails custom policy
          testResults: { total: 100, passed: 98, failed: 2, skipped: 0 },
          security: { vulnerabilities: 0, critical: 0, high: 0, medium: 0, low: 0 },
          performance: { averageResponseTime: 120, throughput: 1100, errorRate: 0.03 },
          codeQuality: { complexity: 10, maintainability: 85, duplication: 5 }
        }
      };

      const response = await handler.handle(args);

      expect(response.data.metadata.policyVersion).toBe('3.0.0');
      expect(response.data.decision).toMatch(/FAIL|ESCALATE/);
    });

    it('should handle policy with multiple custom rules', async () => {
      const multiRulePolicy: QualityGatePolicy = {
        name: 'multi-rule-policy',
        version: '2.5.0',
        thresholds: {
          coverage: 0.80,
          testSuccess: 0.95,
          securityVulns: 0,
          performanceRegression: 0.10,
          codeQuality: 0.75
        },
        rules: [
          {
            id: 'rule-1',
            name: 'Rule 1',
            condition: 'coverage.line >= 80',
            action: 'block',
            severity: 'critical',
            description: 'Coverage rule'
          },
          {
            id: 'rule-2',
            name: 'Rule 2',
            condition: 'testSuccess >= 95',
            action: 'block',
            severity: 'high',
            description: 'Test success rule'
          },
          {
            id: 'rule-3',
            name: 'Rule 3',
            condition: 'security.critical === 0',
            action: 'block',
            severity: 'critical',
            description: 'No critical vulnerabilities'
          }
        ],
        enforcement: 'strict'
      };

      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-602',
        environment: 'production',
        policy: multiRulePolicy,
        metrics: {
          coverage: { line: 85, branch: 82, function: 88, statement: 84 },
          testResults: { total: 100, passed: 98, failed: 2, skipped: 0 },
          security: { vulnerabilities: 0, critical: 0, high: 0, medium: 0, low: 0 },
          performance: { averageResponseTime: 120, throughput: 1100, errorRate: 0.02 },
          codeQuality: { complexity: 10, maintainability: 85, duplication: 5 }
        }
      };

      const response = await handler.handle(args);

      expect(response.data.policyCompliance.compliant).toBe(true);
      expect(response.data.decision).toBe('PASS');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing required parameters', async () => {
      const args = {
        projectId: 'test-project',
        // Missing buildId, environment, metrics
      } as any;

      const response = await handler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should handle agent spawn failures gracefully', async () => {
      const failingRegistry = {
        spawnAgent: jest.fn().mockRejectedValue(new Error('Agent spawn failed'))
      } as any;

      const failingHandler = new QualityGateExecuteHandler(failingRegistry, mockHookExecutor);

      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-701',
        environment: 'development',
        metrics: {
          coverage: { line: 85, branch: 82, function: 88, statement: 84 },
          testResults: { total: 100, passed: 98, failed: 2, skipped: 0 },
          security: { vulnerabilities: 0, critical: 0, high: 0, medium: 0, low: 0 },
          performance: { averageResponseTime: 120, throughput: 1100, errorRate: 0.02 },
          codeQuality: { complexity: 10, maintainability: 85, duplication: 5 }
        }
      };

      const response = await failingHandler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toContain('Agent spawn failed');
    });

    it('should handle hook execution failures gracefully', async () => {
      const failingHook = {
        executePreTask: jest.fn().mockRejectedValue(new Error('Hook failed')),
        executePostTask: jest.fn(),
        executePostEdit: jest.fn(),
        notify: jest.fn()
      } as any;

      const failingHandler = new QualityGateExecuteHandler(mockAgentRegistry, failingHook);

      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-702',
        environment: 'development',
        metrics: {
          coverage: { line: 85, branch: 82, function: 88, statement: 84 },
          testResults: { total: 100, passed: 98, failed: 2, skipped: 0 },
          security: { vulnerabilities: 0, critical: 0, high: 0, medium: 0, low: 0 },
          performance: { averageResponseTime: 120, throughput: 1100, errorRate: 0.02 },
          codeQuality: { complexity: 10, maintainability: 85, duplication: 5 }
        }
      };

      const response = await failingHandler.handle(args);

      expect(response.success).toBe(false);
    });

    it('should notify on execution failure', async () => {
      const failingRegistry = {
        spawnAgent: jest.fn().mockRejectedValue(new Error('Spawn failed'))
      } as any;

      const failingHandler = new QualityGateExecuteHandler(failingRegistry, mockHookExecutor);

      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-703',
        environment: 'development',
        metrics: {
          coverage: { line: 85, branch: 82, function: 88, statement: 84 },
          testResults: { total: 100, passed: 98, failed: 2, skipped: 0 },
          security: { vulnerabilities: 0, critical: 0, high: 0, medium: 0, low: 0 },
          performance: { averageResponseTime: 120, throughput: 1100, errorRate: 0.02 },
          codeQuality: { complexity: 10, maintainability: 85, duplication: 5 }
        }
      };

      await failingHandler.handle(args);

      // Notification should not be called in this case since agent wasn't spawned
      // (agentId is undefined)
      expect(mockHookExecutor.notify).not.toHaveBeenCalled();
    });
  });

  describe('Performance Validation', () => {
    it('should complete execution within reasonable time', async () => {
      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-801',
        environment: 'development',
        metrics: {
          coverage: { line: 85, branch: 82, function: 88, statement: 84 },
          testResults: { total: 100, passed: 98, failed: 2, skipped: 0 },
          security: { vulnerabilities: 0, critical: 0, high: 0, medium: 0, low: 0 },
          performance: { averageResponseTime: 120, throughput: 1100, errorRate: 0.02 },
          codeQuality: { complexity: 10, maintainability: 85, duplication: 5 }
        }
      };

      const startTime = Date.now();
      const response = await handler.handle(args);
      const duration = Date.now() - startTime;

      expect(response.success).toBe(true);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should track execution time in metadata', async () => {
      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-802',
        environment: 'development',
        metrics: {
          coverage: { line: 85, branch: 82, function: 88, statement: 84 },
          testResults: { total: 100, passed: 98, failed: 2, skipped: 0 },
          security: { vulnerabilities: 0, critical: 0, high: 0, medium: 0, low: 0 },
          performance: { averageResponseTime: 120, throughput: 1100, errorRate: 0.02 },
          codeQuality: { complexity: 10, maintainability: 85, duplication: 5 }
        }
      };

      const response = await handler.handle(args);

      expect(response.data.metadata.executionTime).toBeDefined();
      expect(response.data.metadata.executionTime).toBeGreaterThan(0);
    });
  });

  describe('Report Generation', () => {
    it('should generate comprehensive recommendations for failing gate', async () => {
      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-901',
        environment: 'production',
        metrics: {
          coverage: { line: 70, branch: 65, function: 72, statement: 68 }, // Low
          testResults: { total: 100, passed: 88, failed: 12, skipped: 0 }, // Low
          security: { vulnerabilities: 3, critical: 1, high: 2, medium: 0, low: 0 }, // Critical
          performance: { averageResponseTime: 250, throughput: 600, errorRate: 0.15 }, // High error rate
          codeQuality: { complexity: 25, maintainability: 65, duplication: 15 } // Poor
        }
      };

      const response = await handler.handle(args);

      expect(response.data.recommendations.length).toBeGreaterThan(3);
      expect(response.data.recommendations).toContain(
        expect.stringContaining('coverage')
      );
      expect(response.data.recommendations).toContain(
        expect.stringContaining('test')
      );
      expect(response.data.recommendations).toContain(
        expect.stringContaining('security')
      );
    });

    it('should generate minimal recommendations for passing gate', async () => {
      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-902',
        environment: 'development',
        metrics: {
          coverage: { line: 95, branch: 92, function: 96, statement: 94 },
          testResults: { total: 100, passed: 100, failed: 0, skipped: 0 },
          security: { vulnerabilities: 0, critical: 0, high: 0, medium: 0, low: 0 },
          performance: { averageResponseTime: 80, throughput: 1500, errorRate: 0.005 },
          codeQuality: { complexity: 5, maintainability: 95, duplication: 2 }
        }
      };

      const response = await handler.handle(args);

      expect(response.data.recommendations.length).toBeLessThanOrEqual(2);
      expect(response.data.decision).toBe('PASS');
    });

    it('should include execution metadata in result', async () => {
      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-903',
        environment: 'staging',
        metrics: {
          coverage: { line: 85, branch: 82, function: 88, statement: 84 },
          testResults: { total: 100, passed: 98, failed: 2, skipped: 0 },
          security: { vulnerabilities: 0, critical: 0, high: 0, medium: 0, low: 0 },
          performance: { averageResponseTime: 120, throughput: 1100, errorRate: 0.02 },
          codeQuality: { complexity: 10, maintainability: 85, duplication: 5 }
        }
      };

      const response = await handler.handle(args);

      expect(response.data.metadata).toBeDefined();
      expect(response.data.metadata.executedAt).toBeDefined();
      expect(response.data.metadata.executionTime).toBeGreaterThan(0);
      expect(response.data.metadata.policyVersion).toBe('1.0.0');
      expect(response.data.metadata.agentId).toBe('agent-quality-gate-1');
    });
  });

  describe('Hook Integration', () => {
    it('should execute pre-task hook before evaluation', async () => {
      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-1001',
        environment: 'development',
        metrics: {
          coverage: { line: 85, branch: 82, function: 88, statement: 84 },
          testResults: { total: 100, passed: 98, failed: 2, skipped: 0 },
          security: { vulnerabilities: 0, critical: 0, high: 0, medium: 0, low: 0 },
          performance: { averageResponseTime: 120, throughput: 1100, errorRate: 0.02 },
          codeQuality: { complexity: 10, maintainability: 85, duplication: 5 }
        }
      };

      await handler.handle(args);

      expect(mockHookExecutor.executePreTask).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringContaining('quality gate'),
          agentType: 'quality-gate',
          agentId: 'agent-quality-gate-1'
        })
      );
    });

    it('should execute post-task hook after evaluation', async () => {
      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-1002',
        environment: 'development',
        metrics: {
          coverage: { line: 85, branch: 82, function: 88, statement: 84 },
          testResults: { total: 100, passed: 98, failed: 2, skipped: 0 },
          security: { vulnerabilities: 0, critical: 0, high: 0, medium: 0, low: 0 },
          performance: { averageResponseTime: 120, throughput: 1100, errorRate: 0.02 },
          codeQuality: { complexity: 10, maintainability: 85, duplication: 5 }
        }
      };

      await handler.handle(args);

      expect(mockHookExecutor.executePostTask).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: 'quality-gate',
          results: expect.objectContaining({
            decision: 'PASS',
            compliant: true
          })
        })
      );
    });

    it('should execute post-edit hook for memory storage', async () => {
      const args: QualityGateExecuteArgs = {
        projectId: 'test-project',
        buildId: 'build-1003',
        environment: 'development',
        metrics: {
          coverage: { line: 85, branch: 82, function: 88, statement: 84 },
          testResults: { total: 100, passed: 98, failed: 2, skipped: 0 },
          security: { vulnerabilities: 0, critical: 0, high: 0, medium: 0, low: 0 },
          performance: { averageResponseTime: 120, throughput: 1100, errorRate: 0.02 },
          codeQuality: { complexity: 10, maintainability: 85, duplication: 5 }
        }
      };

      await handler.handle(args);

      expect(mockHookExecutor.executePostEdit).toHaveBeenCalledWith(
        expect.objectContaining({
          file: 'quality-gate-build-1003',
          memoryKey: expect.stringContaining('aqe/swarm/quality-mcp-tools')
        })
      );
    });
  });
});
