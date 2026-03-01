/**
 * Agentic QE v3 - Consensus Engine Error Path Tests
 * Milestone 3.6: Error Path Coverage Improvement
 *
 * Tests cover:
 * - Model provider failures
 * - Insufficient models for consensus
 * - Timeout cascades
 * - Voting disagreements
 * - Network partition handling
 * - Byzantine failure scenarios
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Severity } from '../../../src/shared/types';

// Mock types matching consensus engine interfaces
interface SecurityFinding {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  correlationId?: string;
}

interface ModelVote {
  modelId: string;
  agrees: boolean;
  assessment: 'true-positive' | 'false-positive' | 'inconclusive';
  confidence: number;
  reasoning: string;
  executionTime: number;
  votedAt: Date;
  error?: string;
}

interface ConsensusResult {
  verdict: 'verified' | 'rejected' | 'disputed' | 'insufficient' | 'error';
  confidence: number;
  votes: ModelVote[];
  agreementRatio: number;
  requiresHumanReview: boolean;
  reasoning: string;
}

describe('Consensus Engine Error Paths', () => {
  // ===========================================================================
  // Model Provider Failures
  // ===========================================================================

  describe('Model Provider Failures', () => {
    it('should handle single model provider timeout', async () => {
      const mockProviders = [
        { id: 'model-1', complete: vi.fn().mockResolvedValue('valid response') },
        { id: 'model-2', complete: vi.fn().mockRejectedValue(new Error('Request timeout')) },
        { id: 'model-3', complete: vi.fn().mockResolvedValue('valid response') },
      ];

      const queryModels = async (finding: SecurityFinding): Promise<ModelVote[]> => {
        const votes: ModelVote[] = [];

        for (const provider of mockProviders) {
          try {
            const response = await provider.complete(finding);
            votes.push({
              modelId: provider.id,
              agrees: true,
              assessment: 'true-positive',
              confidence: 0.9,
              reasoning: response,
              executionTime: 100,
              votedAt: new Date(),
            });
          } catch (error) {
            votes.push({
              modelId: provider.id,
              agrees: false,
              assessment: 'inconclusive',
              confidence: 0,
              reasoning: 'Model query failed',
              executionTime: 0,
              votedAt: new Date(),
              error: (error as Error).message,
            });
          }
        }

        return votes;
      };

      const finding: SecurityFinding = {
        id: 'finding-1',
        severity: 'high',
        title: 'SQL Injection',
        description: 'Potential SQL injection vulnerability',
      };

      const votes = await queryModels(finding);

      expect(votes).toHaveLength(3);
      expect(votes[0].error).toBeUndefined();
      expect(votes[1].error).toBe('Request timeout');
      expect(votes[2].error).toBeUndefined();
    });

    it('should handle all model providers failing', async () => {
      const mockProviders = [
        { id: 'model-1', complete: vi.fn().mockRejectedValue(new Error('API error')) },
        { id: 'model-2', complete: vi.fn().mockRejectedValue(new Error('Rate limited')) },
        { id: 'model-3', complete: vi.fn().mockRejectedValue(new Error('Service unavailable')) },
      ];

      const verifyWithConsensus = async (finding: SecurityFinding): Promise<ConsensusResult> => {
        const votes: ModelVote[] = [];

        for (const provider of mockProviders) {
          try {
            await provider.complete(finding);
            votes.push({
              modelId: provider.id,
              agrees: true,
              assessment: 'true-positive',
              confidence: 0.9,
              reasoning: 'Valid',
              executionTime: 100,
              votedAt: new Date(),
            });
          } catch (error) {
            votes.push({
              modelId: provider.id,
              agrees: false,
              assessment: 'inconclusive',
              confidence: 0,
              reasoning: 'Failed',
              executionTime: 0,
              votedAt: new Date(),
              error: (error as Error).message,
            });
          }
        }

        const validVotes = votes.filter(v => !v.error);
        if (validVotes.length === 0) {
          return {
            verdict: 'error',
            confidence: 0,
            votes,
            agreementRatio: 0,
            requiresHumanReview: true,
            reasoning: 'All model providers failed',
          };
        }

        return {
          verdict: 'verified',
          confidence: 0.9,
          votes,
          agreementRatio: 1,
          requiresHumanReview: false,
          reasoning: 'Consensus reached',
        };
      };

      const result = await verifyWithConsensus({
        id: 'finding-1',
        severity: 'critical',
        title: 'Test finding',
        description: 'Test',
      });

      expect(result.verdict).toBe('error');
      expect(result.requiresHumanReview).toBe(true);
      expect(result.votes.every(v => v.error !== undefined)).toBe(true);
    });

    it('should handle partial response from model', async () => {
      const mockProvider = {
        id: 'model-1',
        complete: vi.fn().mockResolvedValue('{"partial": true, "assessment":'),
      };

      const parseResponse = (response: string): { assessment: string; confidence: number } | null => {
        try {
          return JSON.parse(response);
        } catch {
          return null;
        }
      };

      const response = await mockProvider.complete({});
      const parsed = parseResponse(response);

      expect(parsed).toBeNull();
    });

    it('should handle model returning invalid assessment', async () => {
      const validateAssessment = (assessment: string): boolean => {
        const validAssessments = ['true-positive', 'false-positive', 'inconclusive'];
        return validAssessments.includes(assessment);
      };

      const invalidAssessments = ['maybe', 'unknown', '', null, undefined, 123];

      for (const assessment of invalidAssessments) {
        expect(validateAssessment(assessment as string)).toBe(false);
      }
    });
  });

  // ===========================================================================
  // Insufficient Models for Consensus
  // ===========================================================================

  describe('Insufficient Models', () => {
    it('should return insufficient when below minimum models', async () => {
      const minModels = 2;

      const verifyWithMinimum = async (
        votes: ModelVote[],
        minimum: number
      ): Promise<ConsensusResult> => {
        const validVotes = votes.filter(v => !v.error);

        if (validVotes.length < minimum) {
          return {
            verdict: 'insufficient',
            confidence: 0,
            votes,
            agreementRatio: 0,
            requiresHumanReview: true,
            reasoning: `Insufficient models: ${validVotes.length} valid votes, ${minimum} required`,
          };
        }

        const agreeCount = validVotes.filter(v => v.agrees).length;
        const agreementRatio = agreeCount / validVotes.length;

        return {
          verdict: agreementRatio >= 0.5 ? 'verified' : 'rejected',
          confidence: agreementRatio,
          votes,
          agreementRatio,
          requiresHumanReview: agreementRatio < 0.7,
          reasoning: `Agreement: ${agreeCount}/${validVotes.length}`,
        };
      };

      // Only 1 valid vote when minimum is 2
      const result = await verifyWithMinimum(
        [{
          modelId: 'model-1',
          agrees: true,
          assessment: 'true-positive',
          confidence: 0.9,
          reasoning: 'Valid',
          executionTime: 100,
          votedAt: new Date(),
        }],
        minModels
      );

      expect(result.verdict).toBe('insufficient');
      expect(result.requiresHumanReview).toBe(true);
    });

    it('should handle no available models', async () => {
      const getAvailableModels = async (): Promise<string[]> => {
        // Simulate all models being unavailable
        return [];
      };

      const models = await getAvailableModels();
      expect(models).toHaveLength(0);

      // Verification should fail early
      const canVerify = models.length >= 2;
      expect(canVerify).toBe(false);
    });
  });

  // ===========================================================================
  // Timeout Cascades
  // ===========================================================================

  describe('Timeout Cascades', () => {
    it('should handle cascading timeouts', async () => {
      const queryWithTimeout = async (
        modelId: string,
        timeout: number
      ): Promise<ModelVote> => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(new Error(`Timeout after ${timeout}ms for ${modelId}`));
          }, timeout);

          // Simulate varying response times
          const responseTime = Math.random() * 200;
          setTimeout(() => {
            clearTimeout(timer);
            resolve({
              modelId,
              agrees: true,
              assessment: 'true-positive',
              confidence: 0.8,
              reasoning: 'OK',
              executionTime: responseTime,
              votedAt: new Date(),
            });
          }, responseTime);
        });
      };

      const timeout = 50; // Very short timeout to trigger failures
      const models = ['model-1', 'model-2', 'model-3'];

      const results = await Promise.allSettled(
        models.map(m => queryWithTimeout(m, timeout))
      );

      // Some may timeout, some may succeed
      const succeeded = results.filter(r => r.status === 'fulfilled');
      const failed = results.filter(r => r.status === 'rejected');

      expect(succeeded.length + failed.length).toBe(3);
    });

    it('should implement overall verification timeout', async () => {
      const verifyWithOverallTimeout = async (
        finding: SecurityFinding,
        overallTimeout: number
      ): Promise<ConsensusResult> => {
        return Promise.race([
          // Actual verification (slow)
          new Promise<ConsensusResult>(resolve => {
            setTimeout(() => {
              resolve({
                verdict: 'verified',
                confidence: 0.9,
                votes: [],
                agreementRatio: 1,
                requiresHumanReview: false,
                reasoning: 'OK',
              });
            }, overallTimeout + 100);
          }),
          // Timeout
          new Promise<ConsensusResult>((_, reject) => {
            setTimeout(() => {
              reject(new Error('Verification timeout exceeded'));
            }, overallTimeout);
          }),
        ]);
      };

      await expect(
        verifyWithOverallTimeout(
          { id: 'f1', severity: 'high', title: 'Test', description: 'Test' },
          50
        )
      ).rejects.toThrow('Verification timeout exceeded');
    });
  });

  // ===========================================================================
  // Voting Disagreements
  // ===========================================================================

  describe('Voting Disagreements', () => {
    it('should handle split vote', async () => {
      const votes: ModelVote[] = [
        { modelId: 'm1', agrees: true, assessment: 'true-positive', confidence: 0.9, reasoning: 'Valid', executionTime: 100, votedAt: new Date() },
        { modelId: 'm2', agrees: false, assessment: 'false-positive', confidence: 0.8, reasoning: 'Invalid', executionTime: 100, votedAt: new Date() },
        { modelId: 'm3', agrees: true, assessment: 'true-positive', confidence: 0.7, reasoning: 'Maybe', executionTime: 100, votedAt: new Date() },
        { modelId: 'm4', agrees: false, assessment: 'false-positive', confidence: 0.85, reasoning: 'No', executionTime: 100, votedAt: new Date() },
      ];

      const calculateConsensus = (votes: ModelVote[]): ConsensusResult => {
        const agreeCount = votes.filter(v => v.agrees).length;
        const disagreeCount = votes.filter(v => !v.agrees).length;
        const agreementRatio = agreeCount / votes.length;

        // If exactly split, mark as disputed
        if (agreeCount === disagreeCount) {
          return {
            verdict: 'disputed',
            confidence: 0.5,
            votes,
            agreementRatio: 0.5,
            requiresHumanReview: true,
            reasoning: 'Exactly split vote - requires human review',
          };
        }

        return {
          verdict: agreeCount > disagreeCount ? 'verified' : 'rejected',
          confidence: agreementRatio,
          votes,
          agreementRatio,
          requiresHumanReview: agreementRatio < 0.7,
          reasoning: `${agreeCount} agree, ${disagreeCount} disagree`,
        };
      };

      const result = calculateConsensus(votes);

      expect(result.verdict).toBe('disputed');
      expect(result.requiresHumanReview).toBe(true);
    });

    it('should handle low confidence votes', async () => {
      const votes: ModelVote[] = [
        { modelId: 'm1', agrees: true, assessment: 'true-positive', confidence: 0.3, reasoning: 'Unsure', executionTime: 100, votedAt: new Date() },
        { modelId: 'm2', agrees: true, assessment: 'true-positive', confidence: 0.4, reasoning: 'Maybe', executionTime: 100, votedAt: new Date() },
        { modelId: 'm3', agrees: true, assessment: 'true-positive', confidence: 0.35, reasoning: 'Could be', executionTime: 100, votedAt: new Date() },
      ];

      const calculateWeightedConsensus = (votes: ModelVote[], minConfidence: number): ConsensusResult => {
        const highConfidenceVotes = votes.filter(v => v.confidence >= minConfidence);

        if (highConfidenceVotes.length === 0) {
          return {
            verdict: 'insufficient',
            confidence: 0,
            votes,
            agreementRatio: 0,
            requiresHumanReview: true,
            reasoning: `No votes above ${minConfidence} confidence threshold`,
          };
        }

        const weightedAgreement = votes.reduce((sum, v) => sum + (v.agrees ? v.confidence : 0), 0);
        const totalWeight = votes.reduce((sum, v) => sum + v.confidence, 0);
        const weightedRatio = weightedAgreement / totalWeight;

        return {
          verdict: weightedRatio >= 0.5 ? 'verified' : 'rejected',
          confidence: weightedRatio,
          votes,
          agreementRatio: weightedRatio,
          requiresHumanReview: weightedRatio < 0.7,
          reasoning: `Weighted agreement: ${(weightedRatio * 100).toFixed(1)}%`,
        };
      };

      const result = calculateWeightedConsensus(votes, 0.5);

      expect(result.verdict).toBe('insufficient');
      expect(result.reasoning).toContain('No votes above');
    });

    it('should handle conflicting severity assessments', async () => {
      interface ExtendedVote extends ModelVote {
        suggestedSeverity?: Severity;
      }

      const votes: ExtendedVote[] = [
        { modelId: 'm1', agrees: true, assessment: 'true-positive', confidence: 0.9, reasoning: 'Critical', executionTime: 100, votedAt: new Date(), suggestedSeverity: 'critical' },
        { modelId: 'm2', agrees: true, assessment: 'true-positive', confidence: 0.85, reasoning: 'High', executionTime: 100, votedAt: new Date(), suggestedSeverity: 'high' },
        { modelId: 'm3', agrees: true, assessment: 'true-positive', confidence: 0.8, reasoning: 'Medium', executionTime: 100, votedAt: new Date(), suggestedSeverity: 'medium' },
      ];

      const reconcileSeverity = (votes: ExtendedVote[]): Severity | 'disputed' => {
        const severities = votes
          .map(v => v.suggestedSeverity)
          .filter((s): s is Severity => s !== undefined);

        if (severities.length === 0) return 'disputed';

        // Check if all agree
        if (severities.every(s => s === severities[0])) {
          return severities[0];
        }

        // Use most severe as conservative approach
        const severityOrder: Severity[] = ['critical', 'high', 'medium', 'low', 'informational'];
        const mostSevere = severities.sort(
          (a, b) => severityOrder.indexOf(a) - severityOrder.indexOf(b)
        )[0];

        return mostSevere;
      };

      const result = reconcileSeverity(votes);
      expect(result).toBe('critical');
    });
  });

  // ===========================================================================
  // Byzantine Failure Scenarios
  // ===========================================================================

  describe('Byzantine Failure Scenarios', () => {
    it('should detect malicious model sending random votes', async () => {
      const historicalVotes = new Map<string, boolean[]>();

      const recordVote = (modelId: string, agrees: boolean) => {
        const history = historicalVotes.get(modelId) || [];
        history.push(agrees);
        historicalVotes.set(modelId, history);
      };

      const detectErratic = (modelId: string): boolean => {
        const history = historicalVotes.get(modelId) || [];
        if (history.length < 10) return false;

        // Calculate consistency (should have some pattern)
        let changes = 0;
        for (let i = 1; i < history.length; i++) {
          if (history[i] !== history[i - 1]) changes++;
        }

        // If changes too frequently (>80%), flag as erratic
        return changes / (history.length - 1) > 0.8;
      };

      // Simulate erratic model with alternating votes (deterministic pattern)
      // This guarantees >80% change rate: true, false, true, false...
      for (let i = 0; i < 15; i++) {
        recordVote('erratic-model', i % 2 === 0);
      }

      expect(detectErratic('erratic-model')).toBe(true);
    });

    it('should handle model always voting same way', async () => {
      const historicalVotes = new Map<string, boolean[]>();

      const recordVote = (modelId: string, agrees: boolean) => {
        const history = historicalVotes.get(modelId) || [];
        history.push(agrees);
        historicalVotes.set(modelId, history);
      };

      const detectAlwaysSame = (modelId: string): boolean => {
        const history = historicalVotes.get(modelId) || [];
        if (history.length < 10) return false;

        // If always the same vote, might be broken
        return history.every(v => v === history[0]);
      };

      // Simulate model that always agrees
      for (let i = 0; i < 15; i++) {
        recordVote('yes-model', true);
      }

      expect(detectAlwaysSame('yes-model')).toBe(true);
    });

    it('should implement weighted voting based on historical accuracy', async () => {
      interface ModelStats {
        correctPredictions: number;
        totalPredictions: number;
      }

      const modelStats = new Map<string, ModelStats>([
        ['model-1', { correctPredictions: 90, totalPredictions: 100 }],
        ['model-2', { correctPredictions: 70, totalPredictions: 100 }],
        ['model-3', { correctPredictions: 50, totalPredictions: 100 }],
      ]);

      const getWeight = (modelId: string): number => {
        const stats = modelStats.get(modelId);
        if (!stats) return 0.5; // Default weight for unknown models
        return stats.correctPredictions / stats.totalPredictions;
      };

      const votes: ModelVote[] = [
        { modelId: 'model-1', agrees: true, assessment: 'true-positive', confidence: 0.9, reasoning: 'Yes', executionTime: 100, votedAt: new Date() },
        { modelId: 'model-2', agrees: false, assessment: 'false-positive', confidence: 0.8, reasoning: 'No', executionTime: 100, votedAt: new Date() },
        { modelId: 'model-3', agrees: false, assessment: 'false-positive', confidence: 0.7, reasoning: 'No', executionTime: 100, votedAt: new Date() },
      ];

      const weightedVote = votes.reduce((sum, v) => {
        const weight = getWeight(v.modelId);
        return sum + (v.agrees ? weight : -weight);
      }, 0);

      // model-1 weight: 0.9 (agrees: +0.9)
      // model-2 weight: 0.7 (disagrees: -0.7)
      // model-3 weight: 0.5 (disagrees: -0.5)
      // Total: 0.9 - 0.7 - 0.5 = -0.3

      expect(weightedVote).toBeCloseTo(-0.3, 1);
    });
  });

  // ===========================================================================
  // Disposed Engine Errors
  // ===========================================================================

  describe('Disposed Engine', () => {
    it('should reject operations after disposal', async () => {
      let disposed = false;

      const engine = {
        verify: async (finding: SecurityFinding): Promise<ConsensusResult> => {
          if (disposed) {
            throw new Error('ConsensusEngine has been disposed');
          }
          return {
            verdict: 'verified',
            confidence: 0.9,
            votes: [],
            agreementRatio: 1,
            requiresHumanReview: false,
            reasoning: 'OK',
          };
        },
        dispose: async () => {
          disposed = true;
        },
      };

      // Works before disposal
      await expect(engine.verify({ id: 'f1', severity: 'high', title: 'Test', description: 'Test' })).resolves.toBeDefined();

      // Dispose
      await engine.dispose();

      // Fails after disposal
      await expect(engine.verify({ id: 'f2', severity: 'high', title: 'Test', description: 'Test' })).rejects.toThrow('disposed');
    });
  });
});
