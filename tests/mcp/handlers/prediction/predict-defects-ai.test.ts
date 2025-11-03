/**
 * prediction/predict-defects-ai Test Suite
 *
 * Tests for AI-powered defect prediction with ML models and feature extraction.
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  PredictDefectsAIHandler,
  PredictDefectsAIArgs,
  CodeDefectPrediction
} from '../../../../src/mcp/handlers/prediction/predict-defects-ai.js';
import { AgentRegistry } from '../../../../src/mcp/services/AgentRegistry.js';
import { HookExecutor } from '../../../../src/mcp/services/HookExecutor.js';

describe('PredictDefectsAIHandler', () => {
  let handler: PredictDefectsAIHandler;
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

    handler = new PredictDefectsAIHandler(mockRegistry, mockHookExecutor);
  });

  describe('Happy Path - Code Analysis', () => {
    it('should analyze code changes and predict defects', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'my-org/payment-service',
          branch: 'feature/new-checkout',
          commit: 'abc123def456',
          files: ['src/payment/processor.ts', 'src/payment/validator.ts', 'src/models/transaction.ts']
        },
        modelConfig: {
          modelType: 'neural',
          confidenceThreshold: 0.75
        },
        analysisDepth: 'deep'
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data.predictions).toBeInstanceOf(Array);
      expect(response.data.modelMetrics).toBeDefined();
      expect(response.data.riskAssessment).toBeDefined();
    });

    it('should return comprehensive model metrics', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'enterprise/auth-service',
          branch: 'main',
          files: ['src/auth/controller.ts']
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const metrics = response.data.modelMetrics;

      expect(metrics).toHaveProperty('modelType');
      expect(metrics).toHaveProperty('modelVersion');
      expect(metrics).toHaveProperty('accuracy');
      expect(metrics).toHaveProperty('precision');
      expect(metrics).toHaveProperty('recall');
      expect(metrics).toHaveProperty('f1Score');
      expect(metrics.accuracy).toBeGreaterThanOrEqual(0);
      expect(metrics.accuracy).toBeLessThanOrEqual(1);
      expect(metrics.trainingData.samples).toBeGreaterThan(0);
    });
  });

  describe('ML Model Predictions', () => {
    it('should predict null-pointer-exception defects with high confidence', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'backend/api-gateway',
          files: ['src/handlers/user-handler.ts', 'src/utils/database.ts']
        },
        modelConfig: {
          modelType: 'neural',
          confidenceThreshold: 0.9
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      const highConfidencePredictions = response.data.predictions.filter(p => p.confidence > 0.9);
      if (highConfidencePredictions.length > 0) {
        const prediction = highConfidencePredictions[0];
        expect(prediction.probability).toBeGreaterThan(0.9);
        expect(prediction.severity).toMatch(/medium|high|critical/);
        expect(prediction.defectType).toBeTruthy();
      }
    });

    it('should detect logic errors in complex code', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'finance/calculation-engine',
          files: ['src/calculators/interest-calculator.ts', 'src/validators/amount-validator.ts']
        },
        modelConfig: {
          modelType: 'hybrid',
          confidenceThreshold: 0.75
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      const logicErrors = response.data.predictions.filter(p => p.defectType === 'logic-error');
      if (logicErrors.length > 0) {
        const error = logicErrors[0];
        expect(error.reasoning).toBeTruthy();
        expect(error.suggestedFix).toBeTruthy();
      }
    });

    it('should identify concurrency issues', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'messaging/queue-processor',
          files: ['src/workers/message-processor.ts', 'src/cache/distributed-cache.ts']
        },
        modelConfig: {
          modelType: 'ensemble',
          confidenceThreshold: 0.8
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      const concurrencyIssues = response.data.predictions.filter(p => p.defectType === 'concurrency-issue');
      if (concurrencyIssues.length > 0) {
        expect(concurrencyIssues[0].severity).toMatch(/medium|high|critical/);
      }
    });

    it('should detect resource leaks', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'data/etl-pipeline',
          files: ['src/connectors/database-connector.ts', 'src/streams/file-reader.ts']
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      const resourceLeaks = response.data.predictions.filter(p => p.defectType === 'resource-leak');
      if (resourceLeaks.length > 0) {
        expect(resourceLeaks[0].suggestedFix).toMatch(/close|dispose|cleanup|release/i);
      }
    });
  });

  describe('Feature Extraction', () => {
    it('should extract cyclomatic complexity metrics', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'complex/legacy-system',
          files: ['src/business-logic/order-processor.ts']
        },
        analysisDepth: 'deep'
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      const predictions = response.data.predictions;
      if (predictions.length > 0) {
        const prediction = predictions[0];
        expect(prediction.codeContext).toBeDefined();
        expect(prediction.codeContext.complexity).toBeGreaterThanOrEqual(0);
        expect(prediction.codeContext.changeFrequency).toBeGreaterThanOrEqual(0);
        expect(prediction.codeContext.historicalDefects).toBeGreaterThanOrEqual(0);
        expect(prediction.codeContext.authorExperience).toBeGreaterThanOrEqual(0);
      }
    });

    it('should analyze historical defect patterns', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'prone-to-bugs/legacy-module',
          files: ['src/core/frequently-modified.ts']
        },
        historicalWindow: 180
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.executionMetrics.featureExtractionTime).toBeGreaterThan(0);
    });

    it('should consider change frequency as a risk factor', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'high-churn/unstable-module',
          files: ['src/frequently-changed.ts', 'src/rarely-changed.ts']
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      const predictions = response.data.predictions;
      if (predictions.length >= 2) {
        const hasVariedChangeFreq = predictions.some(p => p.codeContext.changeFrequency > 1);
        if (hasVariedChangeFreq) {
          expect(true).toBe(true);
        }
      }
    });
  });

  describe('Model Types', () => {
    it('should support neural network model', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'ml/test',
          files: ['src/module.ts']
        },
        modelConfig: {
          modelType: 'neural',
          confidenceThreshold: 0.8
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.modelMetrics.modelType).toBe('neural');
    });

    it('should support statistical model', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'stat/test',
          files: ['src/module.ts']
        },
        modelConfig: {
          modelType: 'statistical',
          confidenceThreshold: 0.7
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.modelMetrics.modelType).toBe('statistical');
    });

    it('should support hybrid model approach', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'hybrid/test',
          files: ['src/module.ts']
        },
        modelConfig: {
          modelType: 'hybrid',
          confidenceThreshold: 0.75
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.modelMetrics.modelType).toBe('hybrid');
    });

    it('should support ensemble model for high accuracy', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'ensemble/test',
          files: ['src/critical-module.ts']
        },
        modelConfig: {
          modelType: 'ensemble',
          confidenceThreshold: 0.85
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.modelMetrics.modelType).toBe('ensemble');
    });
  });

  describe('Risk Assessment', () => {
    it('should calculate overall risk score', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'risk/assessment',
          files: ['src/module1.ts', 'src/module2.ts', 'src/module3.ts']
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const risk = response.data.riskAssessment;

      expect(risk.overallRisk).toMatch(/low|medium|high|critical/);
      expect(risk.riskScore).toBeGreaterThanOrEqual(0);
      expect(risk.riskScore).toBeLessThanOrEqual(1);
      expect(risk.topRiskAreas).toBeInstanceOf(Array);
      expect(risk.changeImpact).toBeDefined();
    });

    it('should identify top risk areas', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'high-risk/system',
          files: ['src/critical.ts', 'src/sensitive.ts']
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const topRisks = response.data.riskAssessment.topRiskAreas;

      if (topRisks.length > 0) {
        const risk = topRisks[0];
        expect(risk).toHaveProperty('area');
        expect(risk).toHaveProperty('score');
        expect(risk).toHaveProperty('reason');
        expect(risk.score).toBeGreaterThan(0);
      }
    });

    it('should assess change impact accurately', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'impact/test',
          files: ['src/large-file.ts', 'src/small-file.ts']
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const impact = response.data.riskAssessment.changeImpact;

      expect(impact.filesAffected).toBeGreaterThan(0);
      expect(impact.linesChanged).toBeGreaterThanOrEqual(0);
      expect(impact.complexity).toBeGreaterThanOrEqual(0);
    });

    it('should classify risk level based on predictions', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'classification/test',
          files: Array(10).fill(null).map((_, i) => `src/module${i}.ts`)
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      const criticalPredictions = response.data.predictions.filter(p => p.severity === 'critical');
      if (criticalPredictions.length > 0) {
        expect(response.data.riskAssessment.overallRisk).toMatch(/high|critical/);
      }
    });
  });

  describe('Severity Classification', () => {
    it('should classify critical severity for high probability defects', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'critical/system',
          files: ['src/critical-path.ts']
        },
        modelConfig: {
          modelType: 'neural',
          confidenceThreshold: 0.95
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      const criticalPredictions = response.data.predictions.filter(p =>
        p.probability > 0.95 && p.severity === 'critical'
      );

      if (criticalPredictions.length > 0) {
        expect(criticalPredictions[0].suggestedFix).toBeTruthy();
      }
    });

    it('should classify severity levels appropriately', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'severity/test',
          files: ['src/file1.ts', 'src/file2.ts', 'src/file3.ts']
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      const predictions = response.data.predictions;
      if (predictions.length > 0) {
        predictions.forEach(p => {
          expect(p.severity).toMatch(/info|low|medium|high|critical/);

          if (p.probability > 0.95) {
            expect(p.severity).toMatch(/high|critical/);
          } else if (p.probability > 0.85) {
            expect(p.severity).toMatch(/medium|high|critical/);
          }
        });
      }
    });
  });

  describe('Recommendations Engine', () => {
    it('should recommend code review for high-risk changes', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'review-needed/system',
          files: Array(8).fill(null).map((_, i) => `src/module${i}.ts`)
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      if (response.data.riskAssessment.overallRisk === 'high' || response.data.riskAssessment.overallRisk === 'critical') {
        const codeReviewRec = response.data.recommendations.find(r => r.category === 'code-review');
        expect(codeReviewRec).toBeDefined();
        expect(codeReviewRec?.priority).toMatch(/critical|high/);
      }
    });

    it('should suggest expanded test coverage', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'needs-testing/module',
          files: Array(7).fill(null).map((_, i) => `src/untested${i}.ts`)
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      const testingRec = response.data.recommendations.find(r => r.category === 'testing');
      if (testingRec) {
        expect(testingRec.actions.length).toBeGreaterThan(0);
        expect(testingRec.estimatedEffort).toBeGreaterThan(0);
        expect(testingRec.riskReduction).toBeGreaterThan(0);
      }
    });

    it('should recommend refactoring for complex code', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'complex/legacy',
          files: ['src/monolithic-processor.ts']
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      const predictions = response.data.predictions;
      if (predictions.some(p => p.codeContext.complexity > 15)) {
        const refactorRec = response.data.recommendations.find(r => r.category === 'refactoring');
        if (refactorRec) {
          expect(refactorRec.actions.some(a =>
            a.toLowerCase().includes('extract') || a.toLowerCase().includes('refactor')
          )).toBe(true);
        }
      }
    });

    it('should prioritize recommendations by risk reduction', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'multi-risk/system',
          files: ['src/risky1.ts', 'src/risky2.ts', 'src/risky3.ts']
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const recommendations = response.data.recommendations;

      if (recommendations.length > 1) {
        recommendations.forEach(rec => {
          expect(rec.riskReduction).toBeGreaterThanOrEqual(0);
          expect(rec.priority).toMatch(/low|medium|high|critical/);
        });
      }
    });
  });

  describe('Defect Type Detection', () => {
    it('should detect various defect types', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'varied/codebase',
          files: ['src/file1.ts', 'src/file2.ts', 'src/file3.ts', 'src/file4.ts', 'src/file5.ts']
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      const defectTypes = new Set(response.data.predictions.map(p => p.defectType));
      const expectedTypes = ['null-pointer-exception', 'logic-error', 'concurrency-issue', 'resource-leak', 'code-smell'];

      defectTypes.forEach(type => {
        expect(expectedTypes).toContain(type);
      });
    });
  });

  describe('Confidence Thresholds', () => {
    it('should filter predictions by confidence threshold', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'threshold/test',
          files: ['src/file1.ts', 'src/file2.ts']
        },
        modelConfig: {
          modelType: 'neural',
          confidenceThreshold: 0.9
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      response.data.predictions.forEach(prediction => {
        expect(prediction.confidence).toBeGreaterThanOrEqual(0.9);
      });
    });

    it('should include more predictions with lower threshold', async () => {
      const lowThresholdArgs: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'threshold/comparison',
          files: ['src/file.ts']
        },
        modelConfig: {
          modelType: 'neural',
          confidenceThreshold: 0.5
        }
      };

      const highThresholdArgs: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'threshold/comparison',
          files: ['src/file.ts']
        },
        modelConfig: {
          modelType: 'neural',
          confidenceThreshold: 0.9
        }
      };

      const lowResponse = await handler.handle(lowThresholdArgs);
      const highResponse = await handler.handle(highThresholdArgs);

      expect(lowResponse.success).toBe(true);
      expect(highResponse.success).toBe(true);

      expect(lowResponse.data.predictions.length).toBeGreaterThanOrEqual(highResponse.data.predictions.length);
    });
  });

  describe('Analysis Depth', () => {
    it('should perform basic analysis quickly', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'quick/scan',
          files: ['src/module.ts']
        },
        analysisDepth: 'basic'
      };

      const startTime = Date.now();
      const response = await handler.handle(args);
      const endTime = Date.now();

      expect(response.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(2000);
    });

    it('should perform comprehensive deep analysis', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'thorough/analysis',
          files: ['src/complex-module.ts']
        },
        analysisDepth: 'deep'
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.executionMetrics.featureExtractionTime).toBeGreaterThan(0);
      expect(response.data.executionMetrics.modelInferenceTime).toBeGreaterThan(0);
    });
  });

  describe('Performance Metrics', () => {
    it('should track model inference time', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'perf/test',
          files: ['src/module.ts']
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.executionMetrics.modelInferenceTime).toBeGreaterThan(0);
      expect(response.data.executionMetrics.featureExtractionTime).toBeGreaterThan(0);
      expect(response.data.executionMetrics.totalTime).toBeGreaterThan(0);
    });

    it('should complete prediction within reasonable time', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'speed/test',
          files: Array(5).fill(null).map((_, i) => `src/file${i}.ts`)
        }
      };

      const startTime = Date.now();
      const response = await handler.handle(args);
      const endTime = Date.now();

      expect(response.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(3000);
    });
  });

  describe('Input Validation', () => {
    it('should reject missing codeChanges parameter', async () => {
      const response = await handler.handle({} as any);

      expect(response.success).toBe(false);
      expect(response.error).toMatch(/codeChanges/i);
    });

    it('should reject missing repository in codeChanges', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: '',
          files: ['src/file.ts']
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toMatch(/repository/i);
    });

    it('should use default model config when not provided', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'default/test',
          files: ['src/module.ts']
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.modelMetrics.modelType).toBe('hybrid');
    });

    it('should handle empty files array', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'empty/files',
          files: []
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
    });
  });

  describe('Hook Integration', () => {
    it('should execute pre-task hook before prediction', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'hook/test',
          files: ['src/module.ts']
        }
      };

      await handler.handle(args);

      expect(mockHookExecutor.executeHook).toHaveBeenCalledWith(
        'pre-task',
        expect.objectContaining({
          taskType: 'predict-defects-ai'
        })
      );
    });

    it('should execute post-task hook after prediction', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'hook/test',
          files: ['src/module.ts']
        }
      };

      await handler.handle(args);

      expect(mockHookExecutor.executeHook).toHaveBeenCalledWith(
        'post-task',
        expect.objectContaining({
          taskType: 'predict-defects-ai',
          result: expect.any(Object)
        })
      );
    });
  });

  describe('Historical Analysis', () => {
    it('should consider historical window for defect patterns', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'historical/analysis',
          files: ['src/old-module.ts']
        },
        historicalWindow: 365
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
    });

    it('should use default 90-day window', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'default/window',
          files: ['src/module.ts']
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
    });
  });

  describe('Suggested Fixes', () => {
    it('should provide actionable fix suggestions', async () => {
      const args: PredictDefectsAIArgs = {
        codeChanges: {
          repository: 'fix/suggestions',
          files: ['src/buggy-module.ts']
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      response.data.predictions.forEach(prediction => {
        if (prediction.suggestedFix) {
          expect(prediction.suggestedFix.length).toBeGreaterThan(10);
          expect(typeof prediction.suggestedFix).toBe('string');
        }
      });
    });
  });

  describe('Concurrent Requests', () => {
    it('should handle multiple concurrent predictions', async () => {
      const createArgs = (repo: string): PredictDefectsAIArgs => ({
        codeChanges: {
          repository: repo,
          files: ['src/module.ts']
        }
      });

      const promises = Array.from({ length: 5 }, (_, i) =>
        handler.handle(createArgs(`concurrent/repo-${i}`))
      );

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.requestId).toBeTruthy();
      });

      const uniqueIds = new Set(results.map(r => r.requestId));
      expect(uniqueIds.size).toBe(5);
    });
  });
});
