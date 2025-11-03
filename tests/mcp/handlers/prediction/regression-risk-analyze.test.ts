/**
 * prediction/regression-risk-analyze Test Suite
 *
 * Tests for regression risk analysis with ML-powered risk scoring,
 * impact analysis, and testing strategy recommendations.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { RegressionRiskAnalyzeHandler } from '@mcp/handlers/prediction/regression-risk-analyze';
import { AgentRegistry } from '@mcp/services/AgentRegistry';
import { HookExecutor } from '@mcp/services/HookExecutor';

describe('RegressionRiskAnalyzeHandler', () => {
  let handler: RegressionRiskAnalyzeHandler;
  let mockRegistry: jest.Mocked<AgentRegistry>;
  let mockHookExecutor: jest.Mocked<HookExecutor>;

  beforeEach(() => {
    mockRegistry = {
      getAgent: jest.fn(),
      registerAgent: jest.fn(),
      getAllAgents: jest.fn().mockReturnValue([])
    } as any;

    mockHookExecutor = {
      executeHook: jest.fn().mockResolvedValue(undefined)
    } as any;

    handler = new RegressionRiskAnalyzeHandler(mockRegistry, mockHookExecutor);
  });

  describe('Happy Path - ChangeSet Format', () => {
    it('should analyze regression risk for code changes successfully', async () => {
      const response = await handler.handle({
        changeSet: {
          repository: 'my-app',
          baseBranch: 'main',
          compareBranch: 'feature/payment-updates',
          files: [
            {
              path: 'src/core/payment.ts',
              linesAdded: 45,
              linesRemoved: 12,
              changeType: 'modified'
            },
            {
              path: 'src/utils/validator.ts',
              linesAdded: 20,
              linesRemoved: 5,
              changeType: 'modified'
            },
            {
              path: 'src/api/routes.ts',
              linesAdded: 8,
              linesRemoved: 3,
              changeType: 'modified'
            }
          ]
        },
        analysisConfig: {
          depth: 'comprehensive',
          includeHistoricalData: true,
          historicalWindow: 90,
          considerDependencies: true
        },
        testCoverage: {
          currentCoverage: 75,
          coverageByFile: {
            'src/core/payment.ts': 65,
            'src/utils/validator.ts': 85,
            'src/api/routes.ts': 70
          }
        }
      });

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data.overallRisk).toBeDefined();
      expect(response.data.overallRisk.level).toMatch(/low|medium|high|critical/);
      expect(response.data.overallRisk.score).toBeGreaterThanOrEqual(0);
      expect(response.data.overallRisk.score).toBeLessThanOrEqual(100);
      expect(response.data.overallRisk.confidence).toBeGreaterThan(0);
      expect(response.data.overallRisk.confidence).toBeLessThanOrEqual(1);
    });

    it('should return comprehensive file risk analysis', async () => {
      const response = await handler.handle({
        changeSet: {
          repository: 'ecommerce-backend',
          baseBranch: 'main',
          compareBranch: 'HEAD',
          files: [
            {
              path: 'src/database/migrations/add-user-roles.ts',
              linesAdded: 120,
              linesRemoved: 0,
              changeType: 'added'
            },
            {
              path: 'src/auth/permissions.ts',
              linesAdded: 85,
              linesRemoved: 40,
              changeType: 'modified'
            }
          ]
        },
        analysisConfig: {
          depth: 'comprehensive'
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.fileRisks).toBeDefined();
      expect(Array.isArray(response.data.fileRisks)).toBe(true);
      expect(response.data.fileRisks.length).toBeGreaterThan(0);

      const fileRisk = response.data.fileRisks[0];
      expect(fileRisk).toHaveProperty('file');
      expect(fileRisk).toHaveProperty('riskLevel');
      expect(fileRisk).toHaveProperty('riskScore');
      expect(fileRisk).toHaveProperty('factors');
      expect(fileRisk).toHaveProperty('impactScope');
      expect(fileRisk).toHaveProperty('historicalData');
      expect(fileRisk).toHaveProperty('suggestedTests');

      expect(fileRisk.riskLevel).toMatch(/low|medium|high|critical/);
      expect(Array.isArray(fileRisk.factors)).toBe(true);
      expect(Array.isArray(fileRisk.suggestedTests)).toBe(true);
    });

    it('should provide detailed impact analysis', async () => {
      const response = await handler.handle({
        changeSet: {
          repository: 'microservices-app',
          baseBranch: 'develop',
          compareBranch: 'release/v2.0',
          files: [
            {
              path: 'services/gateway/src/router.ts',
              linesAdded: 200,
              linesRemoved: 150,
              changeType: 'modified'
            },
            {
              path: 'services/auth/src/jwt.ts',
              linesAdded: 90,
              linesRemoved: 30,
              changeType: 'modified'
            },
            {
              path: 'shared/utils/logger.ts',
              linesAdded: 15,
              linesRemoved: 10,
              changeType: 'modified'
            }
          ]
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.impactAnalysis).toBeDefined();

      const impact = response.data.impactAnalysis;
      expect(impact.scope).toMatch(/isolated|moderate|widespread|system-wide/);
      expect(Array.isArray(impact.affectedComponents)).toBe(true);
      expect(Array.isArray(impact.criticalPaths)).toBe(true);
      expect(impact.userImpact).toBeDefined();
      expect(impact.userImpact.affectedFeatures).toBeDefined();
      expect(impact.userImpact.estimatedUsers).toBeGreaterThanOrEqual(0);
      expect(impact.userImpact.severity).toMatch(/minor|moderate|major|critical/);
      expect(impact.rollbackComplexity).toMatch(/easy|moderate|difficult|very-difficult/);
    });

    it('should generate testing strategy recommendations', async () => {
      const response = await handler.handle({
        changeSet: {
          repository: 'api-service',
          baseBranch: 'main',
          compareBranch: 'feature/v3-endpoints',
          files: [
            {
              path: 'src/controllers/user.controller.ts',
              linesAdded: 150,
              linesRemoved: 80,
              changeType: 'modified'
            },
            {
              path: 'src/models/user.model.ts',
              linesAdded: 60,
              linesRemoved: 20,
              changeType: 'modified'
            }
          ]
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.testingStrategy).toBeDefined();

      const strategy = response.data.testingStrategy;
      expect(strategy.priority).toMatch(/standard|elevated|high|critical/);
      expect(Array.isArray(strategy.recommendedTests)).toBe(true);
      expect(strategy.recommendedTests.length).toBeGreaterThan(0);

      const test = strategy.recommendedTests[0];
      expect(test.type).toMatch(/unit|integration|e2e|smoke|regression/);
      expect(test.priority).toMatch(/must-have|should-have|nice-to-have/);
      expect(test.scope).toBeDefined();
      expect(test.estimatedTime).toBeGreaterThan(0);
      expect(test.rationale).toBeDefined();

      expect(strategy.coverageGoals).toBeDefined();
      expect(strategy.coverageGoals.overall).toBeGreaterThan(0);
      expect(strategy.coverageGoals.newCode).toBeGreaterThan(0);
      expect(strategy.coverageGoals.modifiedCode).toBeGreaterThan(0);

      expect(strategy.executionPlan).toBeDefined();
      expect(Array.isArray(strategy.executionPlan.phases)).toBe(true);
      expect(strategy.executionPlan.totalEstimatedTime).toBeGreaterThan(0);
    });

    it('should provide actionable recommendations', async () => {
      const response = await handler.handle({
        changeSet: {
          repository: 'critical-service',
          baseBranch: 'main',
          compareBranch: 'hotfix/security-patch',
          files: [
            {
              path: 'src/security/authentication.ts',
              linesAdded: 250,
              linesRemoved: 100,
              changeType: 'modified'
            }
          ]
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.recommendations).toBeDefined();
      expect(Array.isArray(response.data.recommendations)).toBe(true);

      if (response.data.recommendations.length > 0) {
        const rec = response.data.recommendations[0];
        expect(rec).toHaveProperty('id');
        expect(rec).toHaveProperty('priority');
        expect(rec.priority).toMatch(/low|medium|high|critical/);
        expect(rec).toHaveProperty('category');
        expect(rec.category).toMatch(/testing|code-review|monitoring|deployment|rollback-plan/);
        expect(rec).toHaveProperty('title');
        expect(rec).toHaveProperty('description');
        expect(rec).toHaveProperty('actions');
        expect(Array.isArray(rec.actions)).toBe(true);
        expect(rec).toHaveProperty('estimatedEffort');
        expect(rec).toHaveProperty('riskReduction');
      }
    });

    it('should calculate metrics correctly', async () => {
      const response = await handler.handle({
        changeSet: {
          repository: 'test-repo',
          baseBranch: 'main',
          compareBranch: 'develop',
          files: [
            { path: 'file1.ts', linesAdded: 50, linesRemoved: 10, changeType: 'modified' },
            { path: 'file2.ts', linesAdded: 30, linesRemoved: 5, changeType: 'modified' },
            { path: 'file3.ts', linesAdded: 100, linesRemoved: 0, changeType: 'added' },
            { path: 'file4.ts', linesAdded: 20, linesRemoved: 15, changeType: 'modified' },
            { path: 'file5.ts', linesAdded: 0, linesRemoved: 50, changeType: 'deleted' }
          ]
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.metrics).toBeDefined();

      const metrics = response.data.metrics;
      expect(metrics.totalFiles).toBe(5);
      expect(metrics.highRiskFiles).toBeGreaterThanOrEqual(0);
      expect(metrics.criticalPaths).toBeGreaterThanOrEqual(0);
      expect(metrics.estimatedTestTime).toBeGreaterThan(0);
      expect(metrics.analysisTime).toBeGreaterThan(0);
    });
  });

  describe('Happy Path - Simplified Changes Format', () => {
    it('should handle simplified changes array format', async () => {
      const response = await handler.handle({
        changes: [
          {
            file: 'src/payment/processor.ts',
            type: 'modify',
            complexity: 8,
            linesChanged: 75
          },
          {
            file: 'src/payment/validation.ts',
            type: 'add',
            complexity: 5,
            linesChanged: 120
          },
          {
            file: 'src/config/legacy-settings.ts',
            type: 'delete',
            complexity: 3,
            linesChanged: 200
          },
          {
            file: 'src/utils/helpers.ts',
            type: 'refactor',
            complexity: 6,
            linesChanged: 45
          }
        ],
        analysisConfig: {
          depth: 'standard'
        }
      });

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data.overallRisk).toBeDefined();
      expect(response.data.fileRisks).toBeDefined();
      expect(response.data.fileRisks.length).toBe(4);
    });

    it('should correctly map change types from simplified format', async () => {
      const response = await handler.handle({
        changes: [
          { file: 'added.ts', type: 'add', linesChanged: 100 },
          { file: 'modified.ts', type: 'modify', linesChanged: 50 },
          { file: 'deleted.ts', type: 'delete', linesChanged: 80 },
          { file: 'renamed.ts', type: 'rename', linesChanged: 10 },
          { file: 'refactored.ts', type: 'refactor', linesChanged: 60 }
        ]
      });

      expect(response.success).toBe(true);
      expect(response.data.fileRisks.length).toBe(5);

      const files = response.data.fileRisks.map((r: any) => r.file);
      expect(files).toContain('added.ts');
      expect(files).toContain('modified.ts');
      expect(files).toContain('deleted.ts');
      expect(files).toContain('renamed.ts');
      expect(files).toContain('refactored.ts');
    });
  });

  describe('Risk Factor Analysis', () => {
    it('should analyze change size risk factor', async () => {
      const response = await handler.handle({
        changeSet: {
          repository: 'app',
          baseBranch: 'main',
          compareBranch: 'feature',
          files: [
            {
              path: 'src/large-change.ts',
              linesAdded: 500,
              linesRemoved: 200,
              changeType: 'modified'
            }
          ]
        }
      });

      expect(response.success).toBe(true);
      const fileRisk = response.data.fileRisks[0];
      const changeSizeFactor = fileRisk.factors.find((f: any) => f.category === 'change-size');

      expect(changeSizeFactor).toBeDefined();
      expect(changeSizeFactor.score).toBeGreaterThan(0);
      expect(changeSizeFactor.weight).toBeGreaterThan(0);
      expect(changeSizeFactor.description).toContain('lines changed');
      expect(changeSizeFactor.mitigation).toBeDefined();
    });

    it('should analyze complexity risk factor', async () => {
      const response = await handler.handle({
        changeSet: {
          repository: 'app',
          baseBranch: 'main',
          compareBranch: 'feature',
          files: [
            {
              path: 'src/complex-logic.ts',
              linesAdded: 150,
              linesRemoved: 50,
              changeType: 'modified'
            }
          ]
        }
      });

      expect(response.success).toBe(true);
      const fileRisk = response.data.fileRisks[0];
      const complexityFactor = fileRisk.factors.find((f: any) => f.category === 'complexity');

      expect(complexityFactor).toBeDefined();
      expect(complexityFactor.name).toBe('Code Complexity');
      expect(complexityFactor.score).toBeGreaterThanOrEqual(0);
      expect(complexityFactor.score).toBeLessThanOrEqual(10);
    });

    it('should analyze coverage risk factor', async () => {
      const response = await handler.handle({
        changeSet: {
          repository: 'app',
          baseBranch: 'main',
          compareBranch: 'feature',
          files: [
            {
              path: 'src/uncovered.ts',
              linesAdded: 100,
              linesRemoved: 0,
              changeType: 'added'
            }
          ]
        },
        testCoverage: {
          currentCoverage: 45,
          coverageByFile: {
            'src/uncovered.ts': 30
          }
        }
      });

      expect(response.success).toBe(true);
      const fileRisk = response.data.fileRisks[0];
      const coverageFactor = fileRisk.factors.find((f: any) => f.category === 'coverage');

      expect(coverageFactor).toBeDefined();
      expect(coverageFactor.name).toBe('Test Coverage');
      expect(coverageFactor.description).toContain('coverage');
    });

    it('should analyze dependency impact factor', async () => {
      const response = await handler.handle({
        changeSet: {
          repository: 'app',
          baseBranch: 'main',
          compareBranch: 'feature',
          files: [
            {
              path: 'src/shared/core-utility.ts',
              linesAdded: 50,
              linesRemoved: 20,
              changeType: 'modified'
            }
          ]
        }
      });

      expect(response.success).toBe(true);
      const fileRisk = response.data.fileRisks[0];
      const dependencyFactor = fileRisk.factors.find((f: any) => f.category === 'dependencies');

      expect(dependencyFactor).toBeDefined();
      expect(dependencyFactor.name).toBe('Dependency Impact');
      expect(dependencyFactor.description).toContain('dependent modules');
    });

    it('should analyze historical defects factor', async () => {
      const response = await handler.handle({
        changeSet: {
          repository: 'app',
          baseBranch: 'main',
          compareBranch: 'feature',
          files: [
            {
              path: 'src/buggy-file.ts',
              linesAdded: 80,
              linesRemoved: 40,
              changeType: 'modified'
            }
          ]
        },
        analysisConfig: {
          depth: 'comprehensive',
          includeHistoricalData: true,
          historicalWindow: 180
        }
      });

      expect(response.success).toBe(true);
      const fileRisk = response.data.fileRisks[0];
      const historyFactor = fileRisk.factors.find((f: any) => f.category === 'history');

      expect(historyFactor).toBeDefined();
      expect(historyFactor.name).toBe('Defect History');
      expect(historyFactor.description).toContain('past defects');
    });
  });

  describe('Input Validation', () => {
    it('should reject input without changeSet or changes', async () => {
      const response = await handler.handle({} as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error).toContain('changeSet');
    });

    it('should use defaults when repository not provided', async () => {
      const response = await handler.handle({
        changes: [
          { file: 'test.ts', type: 'modify', linesChanged: 10 }
        ]
      });

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
    });

    it('should validate required changeSet fields', async () => {
      const response = await handler.handle({
        changeSet: {
          repository: '',
          baseBranch: '',
          compareBranch: ''
        }
      });

      // Should succeed with defaults applied
      expect(response.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully', async () => {
      const response = await handler.handle({
        changeSet: null as any
      });

      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('requestId');
    });

    it('should provide meaningful error messages', async () => {
      const response = await handler.handle({} as any);

      if (!response.success) {
        expect(response.error).toBeTruthy();
        expect(typeof response.error).toBe('string');
        expect(response.error.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty file list', async () => {
      const response = await handler.handle({
        changeSet: {
          repository: 'app',
          baseBranch: 'main',
          compareBranch: 'feature',
          files: []
        }
      });

      expect(response).toHaveProperty('success');
      if (response.success) {
        expect(response.data.fileRisks).toBeDefined();
        expect(Array.isArray(response.data.fileRisks)).toBe(true);
      }
    });

    it('should handle single file change', async () => {
      const response = await handler.handle({
        changes: [
          { file: 'single.ts', type: 'modify', linesChanged: 10 }
        ]
      });

      expect(response.success).toBe(true);
      expect(response.data.fileRisks.length).toBe(1);
    });

    it('should handle very large changesets', async () => {
      const largeChanges = Array.from({ length: 100 }, (_, i) => ({
        file: `src/file${i}.ts`,
        type: 'modify' as const,
        linesChanged: Math.floor(Math.random() * 200) + 1
      }));

      const response = await handler.handle({
        changes: largeChanges
      });

      expect(response.success).toBe(true);
      expect(response.data.fileRisks.length).toBeGreaterThan(0);
      expect(response.data.metrics.totalFiles).toBe(100);
    });

    it('should handle concurrent requests', async () => {
      const testData = {
        changes: [
          { file: 'concurrent.ts', type: 'modify' as const, linesChanged: 50 }
        ]
      };

      const promises = Array.from({ length: 10 }, () =>
        handler.handle(testData)
      );

      const results = await Promise.all(promises);
      results.forEach(result => {
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('requestId');
      });
    });
  });

  describe('Performance', () => {
    it('should complete within reasonable time for small changesets', async () => {
      const startTime = Date.now();

      await handler.handle({
        changes: [
          { file: 'perf-test.ts', type: 'modify', linesChanged: 50 }
        ]
      });

      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should complete within reasonable time for medium changesets', async () => {
      const startTime = Date.now();

      const mediumChanges = Array.from({ length: 20 }, (_, i) => ({
        file: `src/module${i}.ts`,
        type: 'modify' as const,
        linesChanged: 100
      }));

      await handler.handle({
        changes: mediumChanges
      });

      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(2000);
    });
  });

  describe('Hook Integration', () => {
    it('should execute pre-task hook', async () => {
      await handler.handle({
        changes: [
          { file: 'hook-test.ts', type: 'modify', linesChanged: 10 }
        ]
      });

      expect(mockHookExecutor.executeHook).toHaveBeenCalledWith(
        'pre-task',
        expect.objectContaining({
          taskType: 'regression-risk-analyze'
        })
      );
    });

    it('should execute post-task hook', async () => {
      await handler.handle({
        changes: [
          { file: 'hook-test.ts', type: 'modify', linesChanged: 10 }
        ]
      });

      expect(mockHookExecutor.executeHook).toHaveBeenCalledWith(
        'post-task',
        expect.objectContaining({
          taskType: 'regression-risk-analyze'
        })
      );
    });
  });
});
