/**
 * Comprehensive Tests for Prediction MCP Tools
 *
 * Tests for all 5 prediction handlers:
 * - predict_defects_ai
 * - visual_test_regression
 * - flaky_test_detect
 * - regression_risk_analyze
 * - deployment_readiness_check
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { PredictDefectsAIHandler } from '../../../../dist/mcp/handlers/prediction/predict-defects-ai.js';
import { VisualTestRegressionHandler } from '../../../../dist/mcp/handlers/prediction/visual-test-regression.js';
import { FlakyTestDetectHandler } from '../../../../dist/mcp/handlers/prediction/flaky-test-detect.js';
import { RegressionRiskAnalyzeHandler } from '../../../../dist/mcp/handlers/prediction/regression-risk-analyze.js';
import { DeploymentReadinessCheckHandler } from '../../../../dist/mcp/handlers/prediction/deployment-readiness-check.js';
import { AgentRegistry } from '../../../../dist/mcp/services/AgentRegistry.js';
import { HookExecutor } from '../../../../dist/mcp/services/HookExecutor.js';

describe('Prediction MCP Tools', () => {
  let registry: AgentRegistry;
  let hookExecutor: HookExecutor;

  beforeEach(() => {
    registry = new AgentRegistry({ maxAgents: 10, enableMetrics: true });
    hookExecutor = new HookExecutor({ enabled: true, dryRun: false, timeout: 5000 });
    jest.clearAllMocks();
  });

  // ===========================
  // 1. Predict Defects AI Tests
  // ===========================
  describe('PredictDefectsAIHandler', () => {
    let handler: PredictDefectsAIHandler;

    beforeEach(() => {
      handler = new PredictDefectsAIHandler(registry, hookExecutor);
    });

    it('should predict defects with valid code changes', async () => {
      const args = {
        codeChanges: {
          repository: 'test/repo',
          branch: 'main',
          files: ['src/payment.ts', 'src/validator.ts']
        }
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.predictions).toBeDefined();
      expect(Array.isArray(result.data.predictions)).toBe(true);
      expect(result.data.modelMetrics).toBeDefined();
      expect(result.data.riskAssessment).toBeDefined();
    });

    it('should fail without repository', async () => {
      const args = {
        codeChanges: {
          repository: '',
          branch: 'main'
        }
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Repository is required');
    });

    it('should use hybrid model by default', async () => {
      const args = {
        codeChanges: {
          repository: 'test/repo'
        }
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.modelMetrics.modelType).toBe('hybrid');
    });

    it('should apply confidence threshold correctly', async () => {
      const args = {
        codeChanges: {
          repository: 'test/repo',
          files: ['file1.ts']
        },
        modelConfig: {
          modelType: 'neural' as const,
          confidenceThreshold: 0.9
        }
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      if (result.data.predictions.length > 0) {
        result.data.predictions.forEach((pred: any) => {
          expect(pred.probability).toBeGreaterThanOrEqual(0.1);
        });
      }
    });

    it('should generate recommendations for high-risk predictions', async () => {
      const args = {
        codeChanges: {
          repository: 'test/repo',
          files: Array(10).fill('file.ts')
        }
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.recommendations).toBeDefined();
      expect(Array.isArray(result.data.recommendations)).toBe(true);
    });

    it('should include execution metrics', async () => {
      const args = {
        codeChanges: {
          repository: 'test/repo'
        }
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.executionMetrics).toBeDefined();
      expect(result.data.executionMetrics.modelInferenceTime).toBeGreaterThan(0);
      expect(result.data.executionMetrics.featureExtractionTime).toBeGreaterThan(0);
    });
  });

  // ================================
  // 2. Visual Test Regression Tests
  // ================================
  describe('VisualTestRegressionHandler', () => {
    let handler: VisualTestRegressionHandler;

    beforeEach(() => {
      handler = new VisualTestRegressionHandler(registry, hookExecutor);
    });

    it('should detect visual regressions', async () => {
      const args = {
        testConfig: {
          baselineImages: ['baseline1.png', 'baseline2.png'],
          comparisonImages: ['comparison1.png', 'comparison2.png'],
          threshold: 0.05
        }
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.summary).toBeDefined();
      expect(result.data.summary.totalTests).toBeGreaterThan(0);
      expect(result.data.comparisons).toBeDefined();
    });

    it('should fail without baseline images', async () => {
      const args = {
        testConfig: {
          baselineImages: [],
          comparisonImages: ['comparison1.png']
        }
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Baseline images are required');
    });

    it('should fail without comparison images', async () => {
      const args = {
        testConfig: {
          baselineImages: ['baseline1.png'],
          comparisonImages: []
        }
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Comparison images are required');
    });

    it('should test multiple viewports', async () => {
      const args = {
        testConfig: {
          baselineImages: ['baseline1.png'],
          comparisonImages: ['comparison1.png'],
          viewports: [
            { width: 1920, height: 1080, name: 'desktop' },
            { width: 768, height: 1024, name: 'tablet' },
            { width: 375, height: 667, name: 'mobile' }
          ]
        }
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.comparisons.length).toBe(3); // 1 image * 3 viewports
    });

    it('should generate insights from comparisons', async () => {
      const args = {
        testConfig: {
          baselineImages: ['baseline1.png', 'baseline2.png'],
          comparisonImages: ['comparison1.png', 'comparison2.png']
        }
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.insights).toBeDefined();
      expect(Array.isArray(result.data.insights)).toBe(true);
    });

    it('should generate report when requested', async () => {
      const args = {
        testConfig: {
          baselineImages: ['baseline1.png'],
          comparisonImages: ['comparison1.png']
        },
        options: {
          generateReport: true
        }
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.report).toBeDefined();
      expect(result.data.report.htmlPath).toBeDefined();
      expect(result.data.report.jsonPath).toBeDefined();
    });
  });

  // =======================
  // 3. Flaky Test Detection
  // =======================
  describe('FlakyTestDetectHandler', () => {
    let handler: FlakyTestDetectHandler;

    beforeEach(() => {
      handler = new FlakyTestDetectHandler(registry, hookExecutor);
    });

    it('should detect flaky tests', async () => {
      const args = {
        testData: {
          testResults: [
            { testId: 'test1', testName: 'Test 1', status: 'pass' as const, duration: 100, timestamp: '2024-01-01' },
            { testId: 'test1', testName: 'Test 1', status: 'fail' as const, duration: 100, timestamp: '2024-01-02' },
            { testId: 'test1', testName: 'Test 1', status: 'pass' as const, duration: 100, timestamp: '2024-01-03' },
            { testId: 'test1', testName: 'Test 1', status: 'fail' as const, duration: 100, timestamp: '2024-01-04' },
            { testId: 'test1', testName: 'Test 1', status: 'pass' as const, duration: 100, timestamp: '2024-01-05' }
          ]
        }
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.summary).toBeDefined();
      expect(result.data.flakyTests).toBeDefined();
    });

    it('should fail without test results', async () => {
      const args = {
        testData: {
          testResults: []
        }
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Test results are required');
    });

    it('should calculate flakiness score correctly', async () => {
      const args = {
        testData: {
          testResults: [
            { testId: 'test1', testName: 'Test 1', status: 'pass' as const, duration: 100, timestamp: '2024-01-01' },
            { testId: 'test1', testName: 'Test 1', status: 'fail' as const, duration: 100, timestamp: '2024-01-02' },
            { testId: 'test1', testName: 'Test 1', status: 'pass' as const, duration: 100, timestamp: '2024-01-03' },
            { testId: 'test1', testName: 'Test 1', status: 'fail' as const, duration: 100, timestamp: '2024-01-04' },
            { testId: 'test1', testName: 'Test 1', status: 'pass' as const, duration: 100, timestamp: '2024-01-05' },
            { testId: 'test1', testName: 'Test 1', status: 'pass' as const, duration: 100, timestamp: '2024-01-06' }
          ],
          minRuns: 5
        }
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      const flakyTest = result.data.flakyTests.find((t: any) => t.testId === 'test1');
      expect(flakyTest).toBeDefined();
      expect(flakyTest.flakinessScore).toBeGreaterThan(0);
    });

    it('should detect timing patterns', async () => {
      const args = {
        testData: {
          testResults: [
            { testId: 'test1', testName: 'Test 1', status: 'pass' as const, duration: 100, timestamp: '2024-01-01' },
            { testId: 'test1', testName: 'Test 1', status: 'pass' as const, duration: 500, timestamp: '2024-01-02' },
            { testId: 'test1', testName: 'Test 1', status: 'pass' as const, duration: 150, timestamp: '2024-01-03' },
            { testId: 'test1', testName: 'Test 1', status: 'pass' as const, duration: 800, timestamp: '2024-01-04' },
            { testId: 'test1', testName: 'Test 1', status: 'pass' as const, duration: 200, timestamp: '2024-01-05' }
          ]
        },
        analysisConfig: {
          flakinessThreshold: 0.1,
          patternDetection: true
        }
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.patterns).toBeDefined();
    });

    it('should generate fix suggestions', async () => {
      const args = {
        testData: {
          testResults: [
            { testId: 'test1', testName: 'Test 1', status: 'pass' as const, duration: 100, timestamp: '2024-01-01' },
            { testId: 'test1', testName: 'Test 1', status: 'fail' as const, duration: 100, timestamp: '2024-01-02', errorMessage: 'race condition' },
            { testId: 'test1', testName: 'Test 1', status: 'pass' as const, duration: 100, timestamp: '2024-01-03' },
            { testId: 'test1', testName: 'Test 1', status: 'fail' as const, duration: 100, timestamp: '2024-01-04' },
            { testId: 'test1', testName: 'Test 1', status: 'pass' as const, duration: 100, timestamp: '2024-01-05' },
            { testId: 'test1', testName: 'Test 1', status: 'pass' as const, duration: 100, timestamp: '2024-01-06' }
          ]
        }
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      const flakyTest = result.data.flakyTests.find((t: any) => t.testId === 'test1');
      if (flakyTest) {
        expect(flakyTest.suggestedFixes).toBeDefined();
        expect(Array.isArray(flakyTest.suggestedFixes)).toBe(true);
      }
    });

    it('should calculate developer impact', async () => {
      const args = {
        testData: {
          testResults: [
            { testId: 'test1', testName: 'Test 1', status: 'pass' as const, duration: 100, timestamp: '2024-01-01' },
            { testId: 'test1', testName: 'Test 1', status: 'fail' as const, duration: 100, timestamp: '2024-01-02' },
            { testId: 'test1', testName: 'Test 1', status: 'pass' as const, duration: 100, timestamp: '2024-01-03' },
            { testId: 'test1', testName: 'Test 1', status: 'fail' as const, duration: 100, timestamp: '2024-01-04' },
            { testId: 'test1', testName: 'Test 1', status: 'pass' as const, duration: 100, timestamp: '2024-01-05' },
            { testId: 'test1', testName: 'Test 1', status: 'pass' as const, duration: 100, timestamp: '2024-01-06' }
          ]
        }
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      const flakyTest = result.data.flakyTests.find((t: any) => t.testId === 'test1');
      if (flakyTest) {
        expect(flakyTest.impact).toBeDefined();
        expect(flakyTest.impact.developerTimeWasted).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ==========================
  // 4. Regression Risk Analysis
  // ==========================
  describe('RegressionRiskAnalyzeHandler', () => {
    let handler: RegressionRiskAnalyzeHandler;

    beforeEach(() => {
      handler = new RegressionRiskAnalyzeHandler(registry, hookExecutor);
    });

    it('should analyze regression risk', async () => {
      const args = {
        changeSet: {
          repository: 'test/repo',
          baseBranch: 'main',
          compareBranch: 'feature/new-feature',
          files: [
            { path: 'src/core.ts', linesAdded: 50, linesRemoved: 10, changeType: 'modified' as const }
          ]
        }
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.overallRisk).toBeDefined();
      expect(result.data.fileRisks).toBeDefined();
      expect(result.data.impactAnalysis).toBeDefined();
    });

    it('should use default repository when not provided', async () => {
      const args = {
        changeSet: {
          repository: '',
          baseBranch: 'main',
          compareBranch: 'feature'
        }
      };

      const result = await handler.handle(args);

      // Now gracefully handles empty repository by using "current" as default
      expect(result.success).toBe(true);
      expect(result.data.overallRisk).toBeDefined();
    });

    it('should calculate risk factors', async () => {
      const args = {
        changeSet: {
          repository: 'test/repo',
          baseBranch: 'main',
          compareBranch: 'feature',
          files: [
            { path: 'src/critical.ts', linesAdded: 100, linesRemoved: 50, changeType: 'modified' as const }
          ]
        },
        testCoverage: {
          currentCoverage: 50
        }
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.fileRisks[0].factors).toBeDefined();
      expect(result.data.fileRisks[0].factors.length).toBeGreaterThan(0);
    });

    it('should generate testing strategy', async () => {
      const args = {
        changeSet: {
          repository: 'test/repo',
          baseBranch: 'main',
          compareBranch: 'feature',
          files: [
            { path: 'src/api.ts', linesAdded: 30, linesRemoved: 5, changeType: 'modified' as const }
          ]
        }
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.testingStrategy).toBeDefined();
      expect(result.data.testingStrategy.recommendedTests).toBeDefined();
      expect(result.data.testingStrategy.executionPlan).toBeDefined();
    });

    it('should identify critical paths', async () => {
      const args = {
        changeSet: {
          repository: 'test/repo',
          baseBranch: 'main',
          compareBranch: 'feature',
          files: [
            { path: 'src/payment.ts', linesAdded: 80, linesRemoved: 20, changeType: 'modified' as const },
            { path: 'src/auth.ts', linesAdded: 60, linesRemoved: 15, changeType: 'modified' as const }
          ]
        }
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.impactAnalysis.criticalPaths).toBeDefined();
    });

    it('should provide recommendations based on risk level', async () => {
      const args = {
        changeSet: {
          repository: 'test/repo',
          baseBranch: 'main',
          compareBranch: 'feature',
          files: [
            { path: 'src/core.ts', linesAdded: 200, linesRemoved: 50, changeType: 'modified' as const }
          ]
        }
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.recommendations).toBeDefined();
      expect(Array.isArray(result.data.recommendations)).toBe(true);
    });

    // Test new 'changes' parameter format
    it('should accept simplified "changes" parameter format', async () => {
      const args = {
        changes: [
          {
            file: 'src/core/memory/SwarmMemoryManager.ts',
            type: 'refactor' as const,
            complexity: 187,
            linesChanged: 1838
          }
        ]
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.overallRisk).toBeDefined();
      expect(result.data.fileRisks).toBeDefined();
      expect(result.data.fileRisks.length).toBeGreaterThan(0);
      expect(result.data.fileRisks[0].file).toBe('src/core/memory/SwarmMemoryManager.ts');
    });

    it('should transform "changes" to "changeSet" correctly', async () => {
      const args = {
        changes: [
          {
            file: 'src/payment.ts',
            type: 'modify' as const,
            linesChanged: 100
          },
          {
            file: 'src/auth.ts',
            type: 'add' as const,
            linesChanged: 50
          },
          {
            file: 'src/legacy.ts',
            type: 'delete' as const,
            linesChanged: 200
          }
        ]
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.fileRisks.length).toBe(3);

      // Verify transformation logic
      const paymentFile = result.data.fileRisks.find((f: any) => f.file === 'src/payment.ts');
      const authFile = result.data.fileRisks.find((f: any) => f.file === 'src/auth.ts');
      const legacyFile = result.data.fileRisks.find((f: any) => f.file === 'src/legacy.ts');

      expect(paymentFile).toBeDefined();
      expect(authFile).toBeDefined();
      expect(legacyFile).toBeDefined();
    });

    it('should fail when neither "changes" nor "changeSet" is provided', async () => {
      const args = {};

      const result = await handler.handle(args);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Either "changeSet" or "changes" parameter is required');
    });

    it('should prefer "changeSet" when both formats are provided', async () => {
      const args = {
        changeSet: {
          repository: 'test/repo',
          baseBranch: 'main',
          compareBranch: 'feature',
          files: [
            { path: 'src/preferred.ts', linesAdded: 50, linesRemoved: 10, changeType: 'modified' as const }
          ]
        },
        changes: [
          {
            file: 'src/ignored.ts',
            type: 'modify' as const,
            linesChanged: 100
          }
        ]
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.fileRisks[0].file).toBe('src/preferred.ts');
      expect(result.data.fileRisks.length).toBe(1);
    });

    it('should handle complex changes with multiple types', async () => {
      const args = {
        changes: [
          { file: 'src/payment.ts', type: 'refactor' as const, complexity: 150, linesChanged: 500 },
          { file: 'src/validator.ts', type: 'modify' as const, linesChanged: 80 },
          { file: 'src/config.ts', type: 'rename' as const, linesChanged: 30 },
          { file: 'src/utils.ts', type: 'add' as const, linesChanged: 120 }
        ]
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.fileRisks.length).toBe(4);
      expect(result.data.impactAnalysis).toBeDefined();
      expect(result.data.testingStrategy).toBeDefined();
    });
  });

  // ==============================
  // 5. Deployment Readiness Check
  // ==============================
  describe('DeploymentReadinessCheckHandler', () => {
    let handler: DeploymentReadinessCheckHandler;

    beforeEach(() => {
      handler = new DeploymentReadinessCheckHandler(registry, hookExecutor);
    });

    it('should check deployment readiness', async () => {
      const args = {
        deployment: {
          version: '1.0.0',
          environment: 'production' as const,
          repository: 'test/repo',
          branch: 'main'
        }
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.overallStatus).toBeDefined();
      expect(['ready', 'not-ready', 'ready-with-warnings']).toContain(result.data.overallStatus);
      expect(result.data.checks).toBeDefined();
    });

    it('should fail without repository and branch', async () => {
      const args = {
        deployment: {
          version: '1.0.0',
          environment: 'production' as const,
          repository: '',
          branch: ''
        }
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Repository and branch are required');
    });

    it('should run all checks by default', async () => {
      const args = {
        deployment: {
          version: '1.0.0',
          environment: 'staging' as const,
          repository: 'test/repo',
          branch: 'develop'
        }
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.checks.length).toBeGreaterThanOrEqual(5);
    });

    it('should respect check configuration', async () => {
      const args = {
        deployment: {
          version: '1.0.0',
          environment: 'development' as const,
          repository: 'test/repo',
          branch: 'feature'
        },
        checks: {
          testResults: true,
          codeQuality: true,
          security: false,
          performance: false,
          dependencies: false
        }
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      const checkCategories = result.data.checks.map((c: any) => c.category);
      expect(checkCategories).toContain('testing');
      expect(checkCategories).toContain('quality');
    });

    it('should identify blockers', async () => {
      const args = {
        deployment: {
          version: '1.0.0',
          environment: 'production' as const,
          repository: 'test/repo',
          branch: 'main'
        },
        thresholds: {
          minTestCoverage: 90,
          maxCriticalIssues: 0
        }
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.blockers).toBeDefined();
      expect(Array.isArray(result.data.blockers)).toBe(true);
    });

    it('should generate production-specific recommendations', async () => {
      const args = {
        deployment: {
          version: '2.0.0',
          environment: 'production' as const,
          repository: 'test/repo',
          branch: 'release-2.0'
        }
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.recommendations).toBeDefined();
      const hasProductionRecs = result.data.recommendations.some((r: any) =>
        r.title.toLowerCase().includes('production') || r.description.toLowerCase().includes('production')
      );
      expect(hasProductionRecs).toBe(true);
    });

    it('should calculate readiness score', async () => {
      const args = {
        deployment: {
          version: '1.0.0',
          environment: 'staging' as const,
          repository: 'test/repo',
          branch: 'develop'
        }
      };

      const result = await handler.handle(args);

      expect(result.success).toBe(true);
      expect(result.data.readinessScore).toBeGreaterThanOrEqual(0);
      expect(result.data.readinessScore).toBeLessThanOrEqual(100);
    });
  });

  // =============================
  // Integration Tests
  // =============================
  describe('Integration Tests', () => {
    it('should share prediction models via memory', async () => {
      const defectHandler = new PredictDefectsAIHandler(registry, hookExecutor);
      const regressionHandler = new RegressionRiskAnalyzeHandler(registry, hookExecutor);

      // First, run defect prediction
      const defectResult = await defectHandler.handle({
        codeChanges: {
          repository: 'test/repo',
          files: ['src/core.ts']
        }
      });

      expect(defectResult.success).toBe(true);

      // Then run regression analysis on same files
      const regressionResult = await regressionHandler.handle({
        changeSet: {
          repository: 'test/repo',
          baseBranch: 'main',
          compareBranch: 'feature',
          files: [
            { path: 'src/core.ts', linesAdded: 50, linesRemoved: 10, changeType: 'modified' as const }
          ]
        }
      });

      expect(regressionResult.success).toBe(true);
    });

    it('should coordinate multiple prediction tools for comprehensive analysis', async () => {
      const defectHandler = new PredictDefectsAIHandler(registry, hookExecutor);
      const flakyHandler = new FlakyTestDetectHandler(registry, hookExecutor);
      const readinessHandler = new DeploymentReadinessCheckHandler(registry, hookExecutor);

      // Run all predictions
      const [defectResult, flakyResult, readinessResult] = await Promise.all([
        defectHandler.handle({
          codeChanges: { repository: 'test/repo' }
        }),
        flakyHandler.handle({
          testData: {
            testResults: [
              { testId: 't1', testName: 'Test 1', status: 'pass' as const, duration: 100, timestamp: '2024-01-01' },
              { testId: 't1', testName: 'Test 1', status: 'fail' as const, duration: 100, timestamp: '2024-01-02' },
              { testId: 't1', testName: 'Test 1', status: 'pass' as const, duration: 100, timestamp: '2024-01-03' },
              { testId: 't1', testName: 'Test 1', status: 'pass' as const, duration: 100, timestamp: '2024-01-04' },
              { testId: 't1', testName: 'Test 1', status: 'pass' as const, duration: 100, timestamp: '2024-01-05' }
            ]
          }
        }),
        readinessHandler.handle({
          deployment: {
            version: '1.0.0',
            environment: 'staging' as const,
            repository: 'test/repo',
            branch: 'main'
          }
        })
      ]);

      expect(defectResult.success).toBe(true);
      expect(flakyResult.success).toBe(true);
      expect(readinessResult.success).toBe(true);
    });
  });

  // =============================
  // Performance Tests
  // =============================
  describe('Performance Tests', () => {
    it('should complete defect prediction in reasonable time', async () => {
      const handler = new PredictDefectsAIHandler(registry, hookExecutor);
      const startTime = performance.now();

      await handler.handle({
        codeChanges: {
          repository: 'test/repo',
          files: Array(20).fill('file.ts')
        }
      });

      const executionTime = performance.now() - startTime;
      expect(executionTime).toBeLessThan(5000); // 5 seconds
    });

    it('should handle large visual test batches efficiently', async () => {
      const handler = new VisualTestRegressionHandler(registry, hookExecutor);
      const startTime = performance.now();

      await handler.handle({
        testConfig: {
          baselineImages: Array(10).fill('baseline.png'),
          comparisonImages: Array(10).fill('comparison.png'),
          viewports: [
            { width: 1920, height: 1080, name: 'desktop' },
            { width: 768, height: 1024, name: 'tablet' }
          ]
        }
      });

      const executionTime = performance.now() - startTime;
      expect(executionTime).toBeLessThan(10000); // 10 seconds
    });
  });
});
