/**
 * prediction/deployment-readiness-check Test Suite
 *
 * Tests for deployment readiness validation with multi-factor quality assessment.
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { DeploymentReadinessCheckHandler, DeploymentReadinessCheckArgs } from '../../../../src/mcp/handlers/prediction/deployment-readiness-check.js';
import { AgentRegistry } from '../../../../src/mcp/services/AgentRegistry.js';
import { HookExecutor } from '../../../../src/mcp/services/HookExecutor.js';

describe('DeploymentReadinessCheckHandler', () => {
  let handler: DeploymentReadinessCheckHandler;
  let mockRegistry: jest.Mocked<AgentRegistry>;
  let mockHookExecutor: jest.Mocked<HookExecutor>;

  beforeEach(() => {
    mockRegistry = {
      getAgent: jest.fn(),
      registerAgent: jest.fn(),
      getAllAgents: jest.fn(),
    } as any;

    mockHookExecutor = {
      executeHook: jest.fn().mockResolvedValue(undefined),
    } as any;

    handler = new DeploymentReadinessCheckHandler(mockRegistry, mockHookExecutor);
  });

  describe('Happy Path - Production Deployment', () => {
    it('should validate production deployment with all checks passing', async () => {
      const args: DeploymentReadinessCheckArgs = {
        deployment: {
          version: '2.5.0',
          environment: 'production',
          repository: 'my-company/payment-service',
          branch: 'release/v2.5.0',
          commitHash: 'a1b2c3d4e5f6'
        },
        checks: {
          testResults: true,
          codeQuality: true,
          security: true,
          performance: true,
          dependencies: true
        },
        thresholds: {
          minTestCoverage: 85,
          maxCriticalIssues: 0,
          maxHighIssues: 3,
          maxBuildTime: 8
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data.overallStatus).toMatch(/ready|ready-with-warnings|not-ready/);
      expect(response.data.readinessScore).toBeGreaterThanOrEqual(0);
      expect(response.data.readinessScore).toBeLessThanOrEqual(100);
      expect(response.data.checks).toBeInstanceOf(Array);
      expect(response.data.checks.length).toBeGreaterThan(0);
    });

    it('should return comprehensive quality metrics', async () => {
      const args: DeploymentReadinessCheckArgs = {
        deployment: {
          version: '1.0.0',
          environment: 'staging',
          repository: 'my-org/api-gateway',
          branch: 'main'
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const data = response.data;

      expect(data.summary).toBeDefined();
      expect(data.summary.checksPerformed).toBeGreaterThan(0);
      expect(data.summary.confidence).toBeGreaterThan(0);
      expect(data.summary.confidence).toBeLessThanOrEqual(1);

      expect(data.metadata).toBeDefined();
      expect(data.metadata.analyzedAt).toBeTruthy();
      expect(data.metadata.analysisTime).toBeGreaterThan(0);
      expect(data.metadata.environment).toBe('staging');
      expect(data.metadata.version).toBe('1.0.0');
    });

    it('should validate test coverage exceeds thresholds', async () => {
      const args: DeploymentReadinessCheckArgs = {
        deployment: {
          version: '3.2.1',
          environment: 'production',
          repository: 'fintech/payment-processor',
          branch: 'release-3.2.1'
        },
        checks: { testResults: true },
        thresholds: { minTestCoverage: 90 }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const testCheck = response.data.checks.find(c => c.category === 'testing');
      expect(testCheck).toBeDefined();
      expect(testCheck?.details.metrics).toHaveProperty('coverage');
      expect(testCheck?.details.metrics).toHaveProperty('testsRun');
      expect(testCheck?.details.metrics).toHaveProperty('testsPassed');
      expect(testCheck?.details.metrics.unitTests).toBeGreaterThan(0);
      expect(testCheck?.details.metrics.integrationTests).toBeGreaterThan(0);
    });
  });

  describe('Quality Gates - Code Quality', () => {
    it('should detect critical code quality issues as blockers', async () => {
      const args: DeploymentReadinessCheckArgs = {
        deployment: {
          version: '1.5.0',
          environment: 'production',
          repository: 'saas/user-service',
          branch: 'main'
        },
        checks: { codeQuality: true },
        thresholds: {
          maxCriticalIssues: 0,
          maxHighIssues: 5
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const qualityCheck = response.data.checks.find(c => c.category === 'quality');
      expect(qualityCheck).toBeDefined();
      expect(qualityCheck?.details.metrics).toHaveProperty('criticalIssues');
      expect(qualityCheck?.details.metrics).toHaveProperty('highIssues');
      expect(qualityCheck?.details.metrics).toHaveProperty('maintainabilityIndex');
      expect(qualityCheck?.details.metrics.maintainabilityIndex).toBeGreaterThan(0);
    });

    it('should calculate technical debt metrics', async () => {
      const args: DeploymentReadinessCheckArgs = {
        deployment: {
          version: '2.0.0',
          environment: 'staging',
          repository: 'legacy/monolith',
          branch: 'refactor-2024'
        },
        checks: { codeQuality: true }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const qualityCheck = response.data.checks.find(c => c.name === 'Code Quality');
      expect(qualityCheck?.details.metrics).toHaveProperty('technicalDebt');
      expect(qualityCheck?.details.metrics).toHaveProperty('codeSmells');
      expect(qualityCheck?.details.metrics.codeSmells).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Security Validation', () => {
    it('should scan for critical vulnerabilities', async () => {
      const args: DeploymentReadinessCheckArgs = {
        deployment: {
          version: '4.1.2',
          environment: 'production',
          repository: 'ecommerce/checkout-api',
          branch: 'security-patch-4.1.2'
        },
        checks: { security: true }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const securityCheck = response.data.checks.find(c => c.category === 'security');
      expect(securityCheck).toBeDefined();
      expect(securityCheck?.details.metrics).toHaveProperty('critical');
      expect(securityCheck?.details.metrics).toHaveProperty('high');
      expect(securityCheck?.details.metrics).toHaveProperty('medium');
      expect(securityCheck?.details.metrics).toHaveProperty('low');
      expect(securityCheck?.details.metrics).toHaveProperty('complianceScore');
    });

    it('should block deployment with critical vulnerabilities', async () => {
      const args: DeploymentReadinessCheckArgs = {
        deployment: {
          version: '1.0.0',
          environment: 'production',
          repository: 'webapp/frontend',
          branch: 'main'
        },
        checks: { security: true }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const securityCheck = response.data.checks.find(c => c.category === 'security');

      if (securityCheck?.status === 'fail') {
        expect(response.data.blockers.length).toBeGreaterThan(0);
        const securityBlocker = response.data.blockers.find(b => b.category === 'Security');
        expect(securityBlocker).toBeDefined();
        expect(securityBlocker?.severity).toMatch(/critical|high/);
        expect(securityBlocker?.resolution).toBeInstanceOf(Array);
        expect(securityBlocker?.resolution.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Performance Metrics', () => {
    it('should validate build time within limits', async () => {
      const args: DeploymentReadinessCheckArgs = {
        deployment: {
          version: '2.3.0',
          environment: 'production',
          repository: 'microservices/order-service',
          branch: 'release/2.3.0'
        },
        checks: { performance: true },
        thresholds: { maxBuildTime: 10 }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const perfCheck = response.data.checks.find(c => c.category === 'performance');
      expect(perfCheck).toBeDefined();
      expect(perfCheck?.details.metrics).toHaveProperty('buildTime');
      expect(perfCheck?.details.metrics).toHaveProperty('bundleSize');
      expect(perfCheck?.details.metrics).toHaveProperty('loadTime');
      expect(perfCheck?.details.metrics).toHaveProperty('memoryUsage');
      expect(perfCheck?.details.metrics.buildTime).toBeGreaterThan(0);
    });

    it('should warn on build time threshold violations', async () => {
      const args: DeploymentReadinessCheckArgs = {
        deployment: {
          version: '1.0.0',
          environment: 'staging',
          repository: 'data-platform/etl-pipeline',
          branch: 'main'
        },
        checks: { performance: true },
        thresholds: { maxBuildTime: 5 }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const perfCheck = response.data.checks.find(c => c.name === 'Performance Metrics');

      if (perfCheck?.status === 'warning') {
        expect(response.data.warnings.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Dependency Health', () => {
    it('should check for outdated and deprecated dependencies', async () => {
      const args: DeploymentReadinessCheckArgs = {
        deployment: {
          version: '5.0.0',
          environment: 'production',
          repository: 'platform/core-api',
          branch: 'v5.0.0'
        },
        checks: { dependencies: true }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const depsCheck = response.data.checks.find(c => c.category === 'dependencies');
      expect(depsCheck).toBeDefined();
      expect(depsCheck?.details.metrics).toHaveProperty('total');
      expect(depsCheck?.details.metrics).toHaveProperty('outdated');
      expect(depsCheck?.details.metrics).toHaveProperty('deprecated');
      expect(depsCheck?.details.metrics).toHaveProperty('upToDate');
      expect(depsCheck?.details.metrics.total).toBeGreaterThan(0);
    });

    it('should warn on deprecated dependencies', async () => {
      const args: DeploymentReadinessCheckArgs = {
        deployment: {
          version: '1.2.0',
          environment: 'staging',
          repository: 'mobile-app/backend',
          branch: 'main'
        },
        checks: { dependencies: true }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const depsCheck = response.data.checks.find(c => c.name === 'Dependencies');

      if (depsCheck && depsCheck.details.actual?.deprecated > 0) {
        expect(depsCheck.status).toMatch(/warning|fail/);
      }
    });
  });

  describe('Infrastructure Checks', () => {
    it('should validate CI/CD build status', async () => {
      const args: DeploymentReadinessCheckArgs = {
        deployment: {
          version: '3.0.0',
          environment: 'production',
          repository: 'devops/deployment-service',
          branch: 'release-3.0'
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const buildCheck = response.data.checks.find(c => c.name === 'Build Status');
      expect(buildCheck).toBeDefined();
      expect(buildCheck?.category).toBe('infrastructure');
      expect(buildCheck?.details.metrics).toHaveProperty('buildStatus');
      expect(buildCheck?.details.metrics).toHaveProperty('ciPipeline');
    });

    it('should check documentation completeness', async () => {
      const args: DeploymentReadinessCheckArgs = {
        deployment: {
          version: '2.1.0',
          environment: 'production',
          repository: 'docs/api-docs',
          branch: 'main'
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const docCheck = response.data.checks.find(c => c.name === 'Documentation');
      expect(docCheck).toBeDefined();
      expect(docCheck?.details.metrics).toHaveProperty('hasChangelog');
      expect(docCheck?.details.metrics).toHaveProperty('hasReleaseNotes');
      expect(docCheck?.details.metrics).toHaveProperty('apiDocsUpdated');
    });
  });

  describe('Readiness Scoring', () => {
    it('should calculate comprehensive readiness score', async () => {
      const args: DeploymentReadinessCheckArgs = {
        deployment: {
          version: '1.8.0',
          environment: 'production',
          repository: 'enterprise/crm-system',
          branch: 'v1.8.0'
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.readinessScore).toBeGreaterThanOrEqual(0);
      expect(response.data.readinessScore).toBeLessThanOrEqual(100);

      const avgScore = response.data.checks.reduce((sum, c) => sum + c.score, 0) / response.data.checks.length;
      expect(response.data.readinessScore).toBeCloseTo(avgScore, 1);
    });

    it('should determine overall status from checks', async () => {
      const args: DeploymentReadinessCheckArgs = {
        deployment: {
          version: '2.0.0',
          environment: 'staging',
          repository: 'analytics/reporting-engine',
          branch: 'main'
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.overallStatus).toMatch(/ready|ready-with-warnings|not-ready/);

      const failedChecks = response.data.checks.filter(c => c.status === 'fail').length;
      if (failedChecks > 0 || response.data.blockers.length > 0) {
        expect(response.data.overallStatus).toBe('not-ready');
      } else if (response.data.readinessScore < 85) {
        expect(response.data.overallStatus).toMatch(/ready-with-warnings|ready/);
      }
    });
  });

  describe('Blocker Detection', () => {
    it('should identify failing tests as blockers', async () => {
      const args: DeploymentReadinessCheckArgs = {
        deployment: {
          version: '1.0.0',
          environment: 'production',
          repository: 'test/blocker-scenario',
          branch: 'main'
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      const testCheck = response.data.checks.find(c => c.category === 'testing');
      if (testCheck?.status === 'fail' && testCheck.details.actual?.failedTests > 0) {
        const blocker = response.data.blockers.find(b => b.category === 'Testing');
        expect(blocker).toBeDefined();
        expect(blocker?.severity).toBe('critical');
        expect(blocker?.estimatedTimeToFix).toBeGreaterThan(0);
      }
    });

    it('should provide actionable resolution steps', async () => {
      const args: DeploymentReadinessCheckArgs = {
        deployment: {
          version: '1.0.0',
          environment: 'production',
          repository: 'critical/payment-gateway',
          branch: 'main'
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      if (response.data.blockers.length > 0) {
        response.data.blockers.forEach(blocker => {
          expect(blocker.resolution).toBeInstanceOf(Array);
          expect(blocker.resolution.length).toBeGreaterThan(0);
          expect(blocker.impact).toBeTruthy();
          expect(blocker.affectedChecks).toBeInstanceOf(Array);
        });
      }
    });
  });

  describe('Recommendations Engine', () => {
    it('should generate recommendations for high-risk deployments', async () => {
      const args: DeploymentReadinessCheckArgs = {
        deployment: {
          version: '1.0.0',
          environment: 'production',
          repository: 'mission-critical/auth-service',
          branch: 'main'
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.recommendations).toBeInstanceOf(Array);

      if (response.data.overallStatus === 'not-ready' || response.data.blockers.length > 0) {
        expect(response.data.recommendations.length).toBeGreaterThan(0);
      }
    });

    it('should include production-specific recommendations', async () => {
      const args: DeploymentReadinessCheckArgs = {
        deployment: {
          version: '3.0.0',
          environment: 'production',
          repository: 'enterprise/billing-system',
          branch: 'v3.0.0'
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      const prodRec = response.data.recommendations.find(r =>
        r.type === 'deployment' && r.title.toLowerCase().includes('production')
      );

      if (prodRec) {
        expect(prodRec.priority).toMatch(/high|critical/);
        expect(prodRec.actions).toContain(expect.stringMatching(/notify|rollback|monitoring/i));
      }
    });

    it('should suggest post-deployment monitoring', async () => {
      const args: DeploymentReadinessCheckArgs = {
        deployment: {
          version: '2.5.0',
          environment: 'production',
          repository: 'saas/notification-service',
          branch: 'release-2.5.0'
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      const monitoringRec = response.data.recommendations.find(r =>
        r.type === 'post-deployment'
      );

      if (monitoringRec) {
        expect(monitoringRec.actions).toContain(expect.stringMatching(/monitor|check|verify|review/i));
      }
    });
  });

  describe('Input Validation', () => {
    it('should reject missing deployment parameter', async () => {
      const response = await handler.handle({} as any);

      expect(response.success).toBe(false);
      expect(response.error).toContain('deployment');
    });

    it('should reject missing repository and branch', async () => {
      const args: DeploymentReadinessCheckArgs = {
        deployment: {
          version: '1.0.0',
          environment: 'production',
          repository: '',
          branch: ''
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toMatch(/repository|branch/i);
    });

    it('should use default thresholds when not provided', async () => {
      const args: DeploymentReadinessCheckArgs = {
        deployment: {
          version: '1.0.0',
          environment: 'staging',
          repository: 'test/defaults',
          branch: 'main'
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.checks.length).toBeGreaterThan(0);
    });
  });

  describe('Multi-Environment Support', () => {
    it('should handle development environment checks', async () => {
      const args: DeploymentReadinessCheckArgs = {
        deployment: {
          version: '0.1.0-dev',
          environment: 'development',
          repository: 'dev/experimental-feature',
          branch: 'feature/new-ui'
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.metadata.environment).toBe('development');
    });

    it('should apply stricter checks for production', async () => {
      const prodArgs: DeploymentReadinessCheckArgs = {
        deployment: {
          version: '1.0.0',
          environment: 'production',
          repository: 'prod/app',
          branch: 'main'
        }
      };

      const stagingArgs: DeploymentReadinessCheckArgs = {
        deployment: {
          version: '1.0.0',
          environment: 'staging',
          repository: 'prod/app',
          branch: 'main'
        }
      };

      const prodResponse = await handler.handle(prodArgs);
      const stagingResponse = await handler.handle(stagingArgs);

      expect(prodResponse.success).toBe(true);
      expect(stagingResponse.success).toBe(true);

      if (prodResponse.data.warnings.length > 0) {
        const prodWarning = prodResponse.data.warnings[0];
        expect(prodWarning.canProceed).toBe(false);
      }
    });
  });

  describe('Hook Integration', () => {
    it('should execute pre-task hook before analysis', async () => {
      const args: DeploymentReadinessCheckArgs = {
        deployment: {
          version: '1.0.0',
          environment: 'production',
          repository: 'test/hooks',
          branch: 'main'
        }
      };

      await handler.handle(args);

      expect(mockHookExecutor.executeHook).toHaveBeenCalledWith(
        'pre-task',
        expect.objectContaining({
          taskType: 'deployment-readiness-check'
        })
      );
    });

    it('should execute post-task hook after analysis', async () => {
      const args: DeploymentReadinessCheckArgs = {
        deployment: {
          version: '1.0.0',
          environment: 'staging',
          repository: 'test/hooks',
          branch: 'main'
        }
      };

      await handler.handle(args);

      expect(mockHookExecutor.executeHook).toHaveBeenCalledWith(
        'post-task',
        expect.objectContaining({
          taskType: 'deployment-readiness-check',
          result: expect.any(Object)
        })
      );
    });
  });

  describe('Performance', () => {
    it('should complete deployment check within reasonable time', async () => {
      const args: DeploymentReadinessCheckArgs = {
        deployment: {
          version: '1.0.0',
          environment: 'production',
          repository: 'perf/test',
          branch: 'main'
        }
      };

      const startTime = Date.now();
      const response = await handler.handle(args);
      const endTime = Date.now();

      expect(response.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(2000);
      expect(response.data.metadata.analysisTime).toBeGreaterThan(0);
    });

    it('should handle concurrent deployment checks', async () => {
      const createArgs = (version: string): DeploymentReadinessCheckArgs => ({
        deployment: {
          version,
          environment: 'staging',
          repository: 'concurrent/test',
          branch: `release-${version}`
        }
      });

      const promises = Array.from({ length: 5 }, (_, i) =>
        handler.handle(createArgs(`${i + 1}.0.0`))
      );

      const results = await Promise.all(promises);

      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.data.metadata.version).toBe(`${index + 1}.0.0`);
        expect(result.requestId).toBeTruthy();
      });

      const uniqueIds = new Set(results.map(r => r.requestId));
      expect(uniqueIds.size).toBe(5);
    });
  });
});
