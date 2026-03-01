/**
 * Agentic QE v3 - Tier Recommender Unit Tests
 *
 * Comprehensive tests for the TierRecommender class covering:
 * 1. getRecommendedTier() - tier selection based on complexity scores
 * 2. findAlternateTiers() - alternative tier suggestions
 * 3. generateExplanation() - human-readable explanations
 * 4. Factory function - instance creation
 *
 * @module tests/unit/integrations/agentic-flow/model-router/tier-recommender
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TierRecommender,
  createTierRecommender,
  type ITierRecommender,
} from '../../../../../src/integrations/agentic-flow/model-router/tier-recommender';
import type {
  ModelTier,
  ComplexitySignals,
} from '../../../../../src/integrations/agentic-flow/model-router/types';
import { TIER_METADATA } from '../../../../../src/integrations/agentic-flow/model-router/types';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Create minimal complexity signals for testing
 */
function createComplexitySignals(
  overrides: Partial<ComplexitySignals> = {}
): ComplexitySignals {
  return {
    hasArchitectureScope: false,
    hasSecurityScope: false,
    requiresMultiStepReasoning: false,
    requiresCrossDomainCoordination: false,
    isMechanicalTransform: false,
    requiresCreativity: false,
    keywordMatches: {
      simple: [],
      moderate: [],
      complex: [],
      critical: [],
    },
    ...overrides,
  };
}

// ============================================================================
// Test Suite: TierRecommender.getRecommendedTier()
// ============================================================================

describe('TierRecommender', () => {
  describe('getRecommendedTier()', () => {
    let recommender: TierRecommender;

    beforeEach(() => {
      recommender = createTierRecommender();
    });

    describe('Tier 0 (Agent Booster) - complexity range [0, 10]', () => {
      it('should return Tier 0 for complexity 0', () => {
        expect(recommender.getRecommendedTier(0)).toBe(0);
      });

      it('should return Tier 0 for complexity 5', () => {
        expect(recommender.getRecommendedTier(5)).toBe(0);
      });

      it('should return Tier 0 for complexity 10 (upper boundary)', () => {
        expect(recommender.getRecommendedTier(10)).toBe(0);
      });
    });

    describe('Tier 1 (Haiku) - complexity range [10, 35]', () => {
      it('should return Tier 1 for complexity 11', () => {
        expect(recommender.getRecommendedTier(11)).toBe(1);
      });

      it('should return Tier 1 for complexity 20', () => {
        expect(recommender.getRecommendedTier(20)).toBe(1);
      });

      it('should return Tier 1 for complexity 35 (upper boundary)', () => {
        expect(recommender.getRecommendedTier(35)).toBe(1);
      });
    });

    describe('Tier 2 (Sonnet) - complexity range [35, 70]', () => {
      it('should return Tier 2 for complexity 36', () => {
        expect(recommender.getRecommendedTier(36)).toBe(2);
      });

      it('should return Tier 2 for complexity 50', () => {
        expect(recommender.getRecommendedTier(50)).toBe(2);
      });

      it('should return Tier 2 for complexity 70 (upper boundary)', () => {
        expect(recommender.getRecommendedTier(70)).toBe(2);
      });
    });

    describe('Tier 3 (Sonnet Extended) - complexity range [60, 85]', () => {
      // Note: There's overlap between Tier 2 (35-70) and Tier 3 (60-85)
      // The algorithm picks the first matching tier (iterates 0,1,2,3,4)
      it('should return Tier 3 for complexity 71', () => {
        expect(recommender.getRecommendedTier(71)).toBe(3);
      });

      it('should return Tier 3 for complexity 75', () => {
        expect(recommender.getRecommendedTier(75)).toBe(3);
      });

      it('should return Tier 3 for complexity 85 (upper boundary)', () => {
        expect(recommender.getRecommendedTier(85)).toBe(3);
      });
    });

    describe('Tier 4 (Opus) - complexity range [75, 100]', () => {
      it('should return Tier 4 for complexity 86', () => {
        expect(recommender.getRecommendedTier(86)).toBe(4);
      });

      it('should return Tier 4 for complexity 90', () => {
        expect(recommender.getRecommendedTier(90)).toBe(4);
      });

      it('should return Tier 4 for complexity 100 (upper boundary)', () => {
        expect(recommender.getRecommendedTier(100)).toBe(4);
      });
    });

    describe('edge cases', () => {
      it('should return default Tier 2 for negative complexity', () => {
        expect(recommender.getRecommendedTier(-1)).toBe(2);
      });

      it('should return default Tier 2 for complexity above 100', () => {
        expect(recommender.getRecommendedTier(101)).toBe(2);
      });

      it('should return default Tier 2 for complexity 150', () => {
        expect(recommender.getRecommendedTier(150)).toBe(2);
      });

      it('should return default Tier 2 for NaN-like values outside ranges', () => {
        // Any value that doesn't match a tier range should fallback to Tier 2
        expect(recommender.getRecommendedTier(-100)).toBe(2);
      });
    });

    describe('boundary overlap handling', () => {
      // The tier ranges have overlapping boundaries:
      // Tier 0: [0, 10], Tier 1: [10, 35] - overlap at 10
      // Tier 1: [10, 35], Tier 2: [35, 70] - overlap at 35
      // Tier 2: [35, 70], Tier 3: [60, 85] - overlap at 60-70
      // Tier 3: [60, 85], Tier 4: [75, 100] - overlap at 75-85

      it('should return Tier 0 for complexity 10 (first tier wins at overlap)', () => {
        // 10 matches both Tier 0 [0,10] and Tier 1 [10,35]
        // Since we iterate 0,1,2,3,4, Tier 0 should win
        expect(recommender.getRecommendedTier(10)).toBe(0);
      });

      it('should return Tier 1 for complexity 35 (first tier wins at overlap)', () => {
        // 35 matches both Tier 1 [10,35] and Tier 2 [35,70]
        expect(recommender.getRecommendedTier(35)).toBe(1);
      });

      it('should return Tier 2 for complexity 60 (in Tier 2 and Tier 3 overlap)', () => {
        // 60 matches both Tier 2 [35,70] and Tier 3 [60,85]
        expect(recommender.getRecommendedTier(60)).toBe(2);
      });

      it('should return Tier 3 for complexity 75 (in Tier 3 and Tier 4 overlap)', () => {
        // 75 matches both Tier 3 [60,85] and Tier 4 [75,100]
        expect(recommender.getRecommendedTier(75)).toBe(3);
      });
    });

    describe('tier metadata alignment', () => {
      it('should align with TIER_METADATA complexity ranges', () => {
        // Verify the implementation uses the same ranges as TIER_METADATA
        for (const tier of [0, 1, 2, 3, 4] as ModelTier[]) {
          const [min, max] = TIER_METADATA[tier].complexityRange;

          // At the minimum, it should return this tier or a lower tier
          const atMin = recommender.getRecommendedTier(min);
          expect(atMin).toBeLessThanOrEqual(tier);

          // At the maximum (exclusive of overlap), it should return this tier
          // Only if no previous tier covers it
          const atMax = recommender.getRecommendedTier(max);
          expect(atMax).toBeGreaterThanOrEqual(0);
          expect(atMax).toBeLessThanOrEqual(4);
        }
      });

      it('should cover all complexity values 0-100', () => {
        for (let complexity = 0; complexity <= 100; complexity++) {
          const tier = recommender.getRecommendedTier(complexity);
          expect(tier).toBeGreaterThanOrEqual(0);
          expect(tier).toBeLessThanOrEqual(4);
        }
      });
    });
  });

  // ============================================================================
  // Test Suite: TierRecommender.findAlternateTiers()
  // ============================================================================

  describe('findAlternateTiers()', () => {
    let recommender: TierRecommender;

    beforeEach(() => {
      recommender = createTierRecommender();
    });

    describe('adjacent tier inclusion', () => {
      it('should include tier 1 as adjacent for recommended tier 2', () => {
        const alternatives = recommender.findAlternateTiers(50, 2);
        expect(alternatives).toContain(1);
      });

      it('should include tier 3 as adjacent for recommended tier 2', () => {
        const alternatives = recommender.findAlternateTiers(50, 2);
        expect(alternatives).toContain(3);
      });

      it('should include both adjacent tiers for middle tiers', () => {
        // Tier 1 should have both Tier 0 and Tier 2
        const tier1Alts = recommender.findAlternateTiers(20, 1);
        expect(tier1Alts).toContain(0);
        expect(tier1Alts).toContain(2);

        // Tier 2 should have both Tier 1 and Tier 3
        const tier2Alts = recommender.findAlternateTiers(50, 2);
        expect(tier2Alts).toContain(1);
        expect(tier2Alts).toContain(3);

        // Tier 3 should have both Tier 2 and Tier 4
        const tier3Alts = recommender.findAlternateTiers(80, 3);
        expect(tier3Alts).toContain(2);
        expect(tier3Alts).toContain(4);
      });
    });

    describe('edge case: Tier 0', () => {
      it('should not include tier -1 (non-existent) for tier 0', () => {
        const alternatives = recommender.findAlternateTiers(5, 0);
        expect(alternatives).not.toContain(-1);
      });

      it('should include tier 1 as adjacent for tier 0', () => {
        const alternatives = recommender.findAlternateTiers(5, 0);
        expect(alternatives).toContain(1);
      });

      it('should include tier 4 as higher capability fallback for tier 0', () => {
        const alternatives = recommender.findAlternateTiers(5, 0);
        expect(alternatives).toContain(4);
      });
    });

    describe('edge case: Tier 4', () => {
      it('should not include tier 5 (non-existent) for tier 4', () => {
        const alternatives = recommender.findAlternateTiers(95, 4);
        expect(alternatives).not.toContain(5);
      });

      it('should include tier 3 as adjacent for tier 4', () => {
        const alternatives = recommender.findAlternateTiers(95, 4);
        expect(alternatives).toContain(3);
      });

      it('should not include tier 4 again as fallback for tier 4', () => {
        const alternatives = recommender.findAlternateTiers(95, 4);
        // Tier 4 is the highest, so no "higher tier fallback" should be added
        const tier4Count = alternatives.filter((t) => t === 4).length;
        expect(tier4Count).toBe(0);
      });
    });

    describe('higher tier fallback logic', () => {
      it('should include tier 4 as fallback for tier 0', () => {
        const alternatives = recommender.findAlternateTiers(5, 0);
        expect(alternatives).toContain(4);
      });

      it('should include tier 4 as fallback for tier 1', () => {
        const alternatives = recommender.findAlternateTiers(20, 1);
        expect(alternatives).toContain(4);
      });

      it('should include tier 4 as fallback for tier 2', () => {
        const alternatives = recommender.findAlternateTiers(50, 2);
        expect(alternatives).toContain(4);
      });

      it('should not add duplicate tier 4 for tier 3', () => {
        // Tier 3 already has tier 4 as adjacent, so no need to add again
        const alternatives = recommender.findAlternateTiers(80, 3);
        const tier4Count = alternatives.filter((t) => t === 4).length;
        expect(tier4Count).toBe(1);
      });

      it('should not add tier 4 fallback for tier 4', () => {
        // The condition is recommendedTier < 3, so tier 4 won't get fallback
        const alternatives = recommender.findAlternateTiers(95, 4);
        expect(alternatives).not.toContain(4);
      });
    });

    describe('result array contents', () => {
      it('should return array with correct length for tier 0', () => {
        // Tier 0: adjacent tier 1 + fallback tier 4
        const alternatives = recommender.findAlternateTiers(5, 0);
        expect(alternatives.length).toBe(2);
      });

      it('should return array with correct length for tier 1', () => {
        // Tier 1: adjacent tier 0, adjacent tier 2, fallback tier 4
        const alternatives = recommender.findAlternateTiers(20, 1);
        expect(alternatives.length).toBe(3);
      });

      it('should return array with correct length for tier 2', () => {
        // Tier 2: adjacent tier 1, adjacent tier 3, fallback tier 4
        const alternatives = recommender.findAlternateTiers(50, 2);
        expect(alternatives.length).toBe(3);
      });

      it('should return array with correct length for tier 3', () => {
        // Tier 3: adjacent tier 2, adjacent tier 4
        // No additional fallback because recommendedTier < 3 is false
        const alternatives = recommender.findAlternateTiers(80, 3);
        expect(alternatives.length).toBe(2);
      });

      it('should return array with correct length for tier 4', () => {
        // Tier 4: adjacent tier 3 only
        const alternatives = recommender.findAlternateTiers(95, 4);
        expect(alternatives.length).toBe(1);
      });
    });

    describe('complexity parameter usage', () => {
      // The current implementation doesn't use the complexity parameter
      // but it's part of the interface for future use
      it('should accept complexity parameter without error', () => {
        expect(() => recommender.findAlternateTiers(50, 2)).not.toThrow();
        expect(() => recommender.findAlternateTiers(0, 0)).not.toThrow();
        expect(() => recommender.findAlternateTiers(100, 4)).not.toThrow();
      });
    });
  });

  // ============================================================================
  // Test Suite: TierRecommender.generateExplanation()
  // ============================================================================

  describe('generateExplanation()', () => {
    let recommender: TierRecommender;

    beforeEach(() => {
      recommender = createTierRecommender();
    });

    describe('complexity score formatting', () => {
      it('should include complexity score and tier in explanation', () => {
        const signals = createComplexitySignals();
        const explanation = recommender.generateExplanation(50, 2, signals);

        expect(explanation).toContain('Complexity score: 50/100');
        expect(explanation).toContain('Tier 2');
      });

      it('should format score correctly for different values', () => {
        const signals = createComplexitySignals();

        const exp0 = recommender.generateExplanation(0, 0, signals);
        expect(exp0).toContain('Complexity score: 0/100');

        const exp100 = recommender.generateExplanation(100, 4, signals);
        expect(exp100).toContain('Complexity score: 100/100');
      });

      it('should include all tier numbers correctly', () => {
        const signals = createComplexitySignals();

        for (const tier of [0, 1, 2, 3, 4] as ModelTier[]) {
          const explanation = recommender.generateExplanation(50, tier, signals);
          expect(explanation).toContain(`Tier ${tier}`);
        }
      });
    });

    describe('mechanical transform info', () => {
      it('should include mechanical transform info when detected', () => {
        const signals = createComplexitySignals({
          isMechanicalTransform: true,
          detectedTransformType: 'var-to-const',
        });
        const explanation = recommender.generateExplanation(5, 0, signals);

        expect(explanation).toContain('Detected mechanical transform: var-to-const');
      });

      it('should include different transform types correctly', () => {
        const transformTypes = [
          'var-to-const',
          'add-types',
          'remove-console',
          'promise-to-async',
          'cjs-to-esm',
          'func-to-arrow',
        ];

        for (const transformType of transformTypes) {
          const signals = createComplexitySignals({
            isMechanicalTransform: true,
            detectedTransformType: transformType as any,
          });
          const explanation = recommender.generateExplanation(5, 0, signals);

          expect(explanation).toContain(`Detected mechanical transform: ${transformType}`);
        }
      });

      it('should not include transform info when isMechanicalTransform is false', () => {
        const signals = createComplexitySignals({
          isMechanicalTransform: false,
          detectedTransformType: 'var-to-const',
        });
        const explanation = recommender.generateExplanation(50, 2, signals);

        expect(explanation).not.toContain('Detected mechanical transform');
      });

      it('should handle undefined transform type gracefully', () => {
        const signals = createComplexitySignals({
          isMechanicalTransform: true,
          // detectedTransformType is undefined
        });
        const explanation = recommender.generateExplanation(5, 0, signals);

        expect(explanation).toContain('Detected mechanical transform: undefined');
      });
    });

    describe('scope explanations', () => {
      describe('architecture scope', () => {
        it('should include architecture scope when detected', () => {
          const signals = createComplexitySignals({
            hasArchitectureScope: true,
          });
          const explanation = recommender.generateExplanation(70, 3, signals);

          expect(explanation).toContain('Architecture scope detected');
        });

        it('should not include architecture scope when not detected', () => {
          const signals = createComplexitySignals({
            hasArchitectureScope: false,
          });
          const explanation = recommender.generateExplanation(50, 2, signals);

          expect(explanation).not.toContain('Architecture scope detected');
        });
      });

      describe('security scope', () => {
        it('should include security scope when detected', () => {
          const signals = createComplexitySignals({
            hasSecurityScope: true,
          });
          const explanation = recommender.generateExplanation(70, 3, signals);

          expect(explanation).toContain('Security scope detected');
        });

        it('should not include security scope when not detected', () => {
          const signals = createComplexitySignals({
            hasSecurityScope: false,
          });
          const explanation = recommender.generateExplanation(50, 2, signals);

          expect(explanation).not.toContain('Security scope detected');
        });
      });

      describe('multi-step reasoning', () => {
        it('should include multi-step reasoning when required', () => {
          const signals = createComplexitySignals({
            requiresMultiStepReasoning: true,
          });
          const explanation = recommender.generateExplanation(70, 3, signals);

          expect(explanation).toContain('Multi-step reasoning required');
        });

        it('should not include multi-step reasoning when not required', () => {
          const signals = createComplexitySignals({
            requiresMultiStepReasoning: false,
          });
          const explanation = recommender.generateExplanation(50, 2, signals);

          expect(explanation).not.toContain('Multi-step reasoning required');
        });
      });

      describe('cross-domain coordination', () => {
        it('should include cross-domain coordination when required', () => {
          const signals = createComplexitySignals({
            requiresCrossDomainCoordination: true,
          });
          const explanation = recommender.generateExplanation(70, 3, signals);

          expect(explanation).toContain('Cross-domain coordination required');
        });

        it('should not include cross-domain coordination when not required', () => {
          const signals = createComplexitySignals({
            requiresCrossDomainCoordination: false,
          });
          const explanation = recommender.generateExplanation(50, 2, signals);

          expect(explanation).not.toContain('Cross-domain coordination required');
        });
      });

      describe('multiple scope signals', () => {
        it('should include all scope signals when multiple are detected', () => {
          const signals = createComplexitySignals({
            hasArchitectureScope: true,
            hasSecurityScope: true,
            requiresMultiStepReasoning: true,
            requiresCrossDomainCoordination: true,
          });
          const explanation = recommender.generateExplanation(90, 4, signals);

          expect(explanation).toContain('Architecture scope detected');
          expect(explanation).toContain('Security scope detected');
          expect(explanation).toContain('Multi-step reasoning required');
          expect(explanation).toContain('Cross-domain coordination required');
        });

        it('should use period separator between parts', () => {
          const signals = createComplexitySignals({
            hasArchitectureScope: true,
            hasSecurityScope: true,
          });
          const explanation = recommender.generateExplanation(80, 4, signals);

          // Parts are joined with '. '
          expect(explanation).toContain('. ');
        });
      });
    });

    describe('code metrics explanations', () => {
      describe('lines of code', () => {
        it('should include large code change info when linesOfCode > 100', () => {
          const signals = createComplexitySignals({
            linesOfCode: 150,
          });
          const explanation = recommender.generateExplanation(60, 2, signals);

          expect(explanation).toContain('Large code change: 150 lines');
        });

        it('should not include large code change info when linesOfCode <= 100', () => {
          const signals = createComplexitySignals({
            linesOfCode: 100,
          });
          const explanation = recommender.generateExplanation(50, 2, signals);

          expect(explanation).not.toContain('Large code change');
        });

        it('should not include large code change info when linesOfCode is undefined', () => {
          const signals = createComplexitySignals({
            // linesOfCode is undefined
          });
          const explanation = recommender.generateExplanation(50, 2, signals);

          expect(explanation).not.toContain('Large code change');
        });

        it('should handle boundary case of 101 lines', () => {
          const signals = createComplexitySignals({
            linesOfCode: 101,
          });
          const explanation = recommender.generateExplanation(55, 2, signals);

          expect(explanation).toContain('Large code change: 101 lines');
        });
      });

      describe('file count', () => {
        it('should include multi-file change info when fileCount > 3', () => {
          const signals = createComplexitySignals({
            fileCount: 5,
          });
          const explanation = recommender.generateExplanation(60, 2, signals);

          expect(explanation).toContain('Multi-file change: 5 files');
        });

        it('should not include multi-file change info when fileCount <= 3', () => {
          const signals = createComplexitySignals({
            fileCount: 3,
          });
          const explanation = recommender.generateExplanation(50, 2, signals);

          expect(explanation).not.toContain('Multi-file change');
        });

        it('should not include multi-file change info when fileCount is undefined', () => {
          const signals = createComplexitySignals({
            // fileCount is undefined
          });
          const explanation = recommender.generateExplanation(50, 2, signals);

          expect(explanation).not.toContain('Multi-file change');
        });

        it('should handle boundary case of 4 files', () => {
          const signals = createComplexitySignals({
            fileCount: 4,
          });
          const explanation = recommender.generateExplanation(55, 2, signals);

          expect(explanation).toContain('Multi-file change: 4 files');
        });
      });

      describe('combined code metrics', () => {
        it('should include both lines and files when both exceed thresholds', () => {
          const signals = createComplexitySignals({
            linesOfCode: 200,
            fileCount: 10,
          });
          const explanation = recommender.generateExplanation(75, 3, signals);

          expect(explanation).toContain('Large code change: 200 lines');
          expect(explanation).toContain('Multi-file change: 10 files');
        });
      });
    });

    describe('full explanation formatting', () => {
      it('should produce a well-formatted explanation with all signals', () => {
        const signals = createComplexitySignals({
          isMechanicalTransform: true,
          detectedTransformType: 'var-to-const',
          hasArchitectureScope: true,
          hasSecurityScope: true,
          requiresMultiStepReasoning: true,
          requiresCrossDomainCoordination: true,
          linesOfCode: 500,
          fileCount: 20,
        });
        const explanation = recommender.generateExplanation(90, 4, signals);

        // Should have all components
        expect(explanation).toContain('Complexity score: 90/100 (Tier 4)');
        expect(explanation).toContain('Detected mechanical transform: var-to-const');
        expect(explanation).toContain('Architecture scope detected');
        expect(explanation).toContain('Security scope detected');
        expect(explanation).toContain('Multi-step reasoning required');
        expect(explanation).toContain('Cross-domain coordination required');
        expect(explanation).toContain('Large code change: 500 lines');
        expect(explanation).toContain('Multi-file change: 20 files');
      });

      it('should produce minimal explanation with no signals', () => {
        const signals = createComplexitySignals();
        const explanation = recommender.generateExplanation(30, 1, signals);

        // Should only have the complexity score
        expect(explanation).toBe('Complexity score: 30/100 (Tier 1)');
      });
    });
  });

  // ============================================================================
  // Test Suite: Factory Function
  // ============================================================================

  describe('createTierRecommender()', () => {
    it('should create a TierRecommender instance', () => {
      const recommender = createTierRecommender();
      expect(recommender).toBeInstanceOf(TierRecommender);
    });

    it('should create instance that implements ITierRecommender', () => {
      const recommender: ITierRecommender = createTierRecommender();

      expect(typeof recommender.getRecommendedTier).toBe('function');
      expect(typeof recommender.findAlternateTiers).toBe('function');
      expect(typeof recommender.generateExplanation).toBe('function');
    });

    it('should create independent instances', () => {
      const recommender1 = createTierRecommender();
      const recommender2 = createTierRecommender();

      expect(recommender1).not.toBe(recommender2);
    });

    it('should create functional instances', () => {
      const recommender = createTierRecommender();

      // Verify all methods work
      expect(recommender.getRecommendedTier(50)).toBe(2);
      expect(recommender.findAlternateTiers(50, 2)).toContain(1);
      expect(recommender.generateExplanation(50, 2, createComplexitySignals())).toContain(
        'Complexity score'
      );
    });
  });

  // ============================================================================
  // Test Suite: Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    let recommender: TierRecommender;

    beforeEach(() => {
      recommender = createTierRecommender();
    });

    describe('getRecommendedTier edge cases', () => {
      it('should handle floating point complexity values', () => {
        expect(recommender.getRecommendedTier(10.5)).toBe(1);
        expect(recommender.getRecommendedTier(35.5)).toBe(2);
        expect(recommender.getRecommendedTier(70.5)).toBe(3);
      });

      it('should handle very small positive values', () => {
        expect(recommender.getRecommendedTier(0.001)).toBe(0);
      });

      it('should handle Infinity', () => {
        expect(recommender.getRecommendedTier(Infinity)).toBe(2); // fallback
      });

      it('should handle negative Infinity', () => {
        expect(recommender.getRecommendedTier(-Infinity)).toBe(2); // fallback
      });
    });

    describe('findAlternateTiers edge cases', () => {
      it('should handle extreme complexity values', () => {
        expect(() => recommender.findAlternateTiers(-1000, 0)).not.toThrow();
        expect(() => recommender.findAlternateTiers(1000, 4)).not.toThrow();
      });
    });

    describe('generateExplanation edge cases', () => {
      it('should handle zero lines of code', () => {
        const signals = createComplexitySignals({ linesOfCode: 0 });
        const explanation = recommender.generateExplanation(10, 1, signals);

        expect(explanation).not.toContain('Large code change');
      });

      it('should handle zero file count', () => {
        const signals = createComplexitySignals({ fileCount: 0 });
        const explanation = recommender.generateExplanation(10, 1, signals);

        expect(explanation).not.toContain('Multi-file change');
      });

      it('should handle very large numbers', () => {
        const signals = createComplexitySignals({
          linesOfCode: 1000000,
          fileCount: 10000,
        });
        const explanation = recommender.generateExplanation(100, 4, signals);

        expect(explanation).toContain('Large code change: 1000000 lines');
        expect(explanation).toContain('Multi-file change: 10000 files');
      });
    });
  });

  // ============================================================================
  // Test Suite: Interface Compliance
  // ============================================================================

  describe('ITierRecommender interface compliance', () => {
    it('should satisfy ITierRecommender interface', () => {
      const recommender = createTierRecommender();

      // Test method signatures
      const tier: ModelTier = recommender.getRecommendedTier(50);
      expect(typeof tier).toBe('number');

      const alternatives: ModelTier[] = recommender.findAlternateTiers(50, 2);
      expect(Array.isArray(alternatives)).toBe(true);

      const explanation: string = recommender.generateExplanation(
        50,
        2,
        createComplexitySignals()
      );
      expect(typeof explanation).toBe('string');
    });
  });
});
