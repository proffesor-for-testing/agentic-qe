/**
 * Agentic QE v3 - Score Calculator Unit Tests
 *
 * Comprehensive tests for the ScoreCalculator class covering:
 * 1. calculateCodeComplexity - LOC thresholds, file counts, cyclomatic, language
 * 2. calculateReasoningComplexity - keyword scoring, multi-step, creativity
 * 3. calculateScopeComplexity - architecture, security, cross-domain, dependencies
 * 4. calculateOverallComplexity - weighted calculation, mechanical transform
 * 5. calculateConfidence - code context, file paths, keyword boosts, mechanical boost
 * 6. Factory function
 *
 * @module tests/unit/integrations/agentic-flow/model-router/score-calculator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ScoreCalculator,
  createScoreCalculator,
  type IScoreCalculator,
} from '../../../../../src/integrations/agentic-flow/model-router/score-calculator';
import type {
  ComplexitySignals,
  RoutingInput,
} from '../../../../../src/integrations/agentic-flow/model-router/types';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Create default complexity signals for testing
 */
function createSignals(overrides: Partial<ComplexitySignals> = {}): ComplexitySignals {
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

/**
 * Create default routing input for testing
 */
function createRoutingInput(overrides: Partial<RoutingInput> = {}): RoutingInput {
  return {
    task: 'test task',
    ...overrides,
  };
}

// ============================================================================
// Test Suite: ScoreCalculator
// ============================================================================

describe('ScoreCalculator', () => {
  let calculator: IScoreCalculator;

  beforeEach(() => {
    calculator = createScoreCalculator();
  });

  // ============================================================================
  // Test Suite: calculateCodeComplexity
  // ============================================================================

  describe('calculateCodeComplexity()', () => {
    describe('lines of code contribution (0-30 points)', () => {
      it('should return 0 for undefined linesOfCode', () => {
        const signals = createSignals({ linesOfCode: undefined });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(0);
      });

      it('should return 0 for linesOfCode = 0', () => {
        const signals = createSignals({ linesOfCode: 0 });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(0);
      });

      it('should return 0 for linesOfCode < 10', () => {
        const signals = createSignals({ linesOfCode: 5 });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(0);
      });

      it('should return 0 for linesOfCode = 9', () => {
        const signals = createSignals({ linesOfCode: 9 });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(0);
      });

      it('should return 10 for linesOfCode = 10', () => {
        const signals = createSignals({ linesOfCode: 10 });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(10);
      });

      it('should return 10 for linesOfCode < 50', () => {
        const signals = createSignals({ linesOfCode: 30 });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(10);
      });

      it('should return 10 for linesOfCode = 49', () => {
        const signals = createSignals({ linesOfCode: 49 });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(10);
      });

      it('should return 20 for linesOfCode = 50', () => {
        const signals = createSignals({ linesOfCode: 50 });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(20);
      });

      it('should return 20 for linesOfCode < 200', () => {
        const signals = createSignals({ linesOfCode: 100 });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(20);
      });

      it('should return 20 for linesOfCode = 199', () => {
        const signals = createSignals({ linesOfCode: 199 });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(20);
      });

      it('should return 30 for linesOfCode = 200', () => {
        const signals = createSignals({ linesOfCode: 200 });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(30);
      });

      it('should return 30 for linesOfCode >= 200', () => {
        const signals = createSignals({ linesOfCode: 500 });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(30);
      });
    });

    describe('file count contribution (0-20 points)', () => {
      it('should return 0 for undefined fileCount', () => {
        const signals = createSignals({ fileCount: undefined });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(0);
      });

      it('should return 0 for fileCount = 1', () => {
        const signals = createSignals({ fileCount: 1 });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(0);
      });

      it('should return 10 for fileCount = 2', () => {
        const signals = createSignals({ fileCount: 2 });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(10);
      });

      it('should return 10 for fileCount < 5', () => {
        const signals = createSignals({ fileCount: 4 });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(10);
      });

      it('should return 20 for fileCount = 5', () => {
        const signals = createSignals({ fileCount: 5 });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(20);
      });

      it('should return 20 for fileCount >= 5', () => {
        const signals = createSignals({ fileCount: 10 });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(20);
      });
    });

    describe('cyclomatic complexity contribution (0-30 points)', () => {
      it('should return 0 for undefined cyclomaticComplexity', () => {
        const signals = createSignals({ cyclomaticComplexity: undefined });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(0);
      });

      it('should return 0 for cyclomaticComplexity < 5', () => {
        const signals = createSignals({ cyclomaticComplexity: 3 });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(0);
      });

      it('should return 0 for cyclomaticComplexity = 4', () => {
        const signals = createSignals({ cyclomaticComplexity: 4 });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(0);
      });

      it('should return 10 for cyclomaticComplexity = 5', () => {
        const signals = createSignals({ cyclomaticComplexity: 5 });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(10);
      });

      it('should return 10 for cyclomaticComplexity < 10', () => {
        const signals = createSignals({ cyclomaticComplexity: 8 });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(10);
      });

      it('should return 20 for cyclomaticComplexity = 10', () => {
        const signals = createSignals({ cyclomaticComplexity: 10 });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(20);
      });

      it('should return 20 for cyclomaticComplexity < 20', () => {
        const signals = createSignals({ cyclomaticComplexity: 15 });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(20);
      });

      it('should return 30 for cyclomaticComplexity = 20', () => {
        const signals = createSignals({ cyclomaticComplexity: 20 });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(30);
      });

      it('should return 30 for cyclomaticComplexity >= 20', () => {
        const signals = createSignals({ cyclomaticComplexity: 50 });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(30);
      });
    });

    describe('language complexity contribution (0-20 points)', () => {
      it('should return 0 for undefined languageComplexity', () => {
        const signals = createSignals({ languageComplexity: undefined });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(0);
      });

      it('should return 0 for low languageComplexity', () => {
        const signals = createSignals({ languageComplexity: 'low' });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(0);
      });

      it('should return 10 for medium languageComplexity', () => {
        const signals = createSignals({ languageComplexity: 'medium' });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(10);
      });

      it('should return 20 for high languageComplexity', () => {
        const signals = createSignals({ languageComplexity: 'high' });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(20);
      });
    });

    describe('combined contributions', () => {
      it('should sum all contributions', () => {
        const signals = createSignals({
          linesOfCode: 200, // 30 points
          fileCount: 5, // 20 points
          cyclomaticComplexity: 20, // 30 points
          languageComplexity: 'high', // 20 points
        });
        const result = calculator.calculateCodeComplexity(signals);
        // Total = 30 + 20 + 30 + 20 = 100
        expect(result).toBe(100);
      });

      it('should cap at 100', () => {
        const signals = createSignals({
          linesOfCode: 500, // 30 points
          fileCount: 100, // 20 points
          cyclomaticComplexity: 100, // 30 points
          languageComplexity: 'high', // 20 points
        });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(100);
      });

      it('should handle partial contributions', () => {
        const signals = createSignals({
          linesOfCode: 30, // 10 points
          fileCount: 3, // 10 points
          cyclomaticComplexity: 8, // 10 points
          languageComplexity: 'medium', // 10 points
        });
        const result = calculator.calculateCodeComplexity(signals);
        expect(result).toBe(40);
      });
    });
  });

  // ============================================================================
  // Test Suite: calculateReasoningComplexity
  // ============================================================================

  describe('calculateReasoningComplexity()', () => {
    describe('keyword scoring (0-60 points)', () => {
      it('should return 0 for no keyword matches', () => {
        const signals = createSignals();
        const result = calculator.calculateReasoningComplexity(signals);
        expect(result).toBe(0);
      });

      it('should add 5 points per simple keyword match', () => {
        const signals = createSignals({
          keywordMatches: {
            simple: ['fix typo'],
            moderate: [],
            complex: [],
            critical: [],
          },
        });
        const result = calculator.calculateReasoningComplexity(signals);
        expect(result).toBe(5);
      });

      it('should add 5 points for each simple keyword', () => {
        const signals = createSignals({
          keywordMatches: {
            simple: ['fix typo', 'update comment', 'rename variable'],
            moderate: [],
            complex: [],
            critical: [],
          },
        });
        const result = calculator.calculateReasoningComplexity(signals);
        expect(result).toBe(15); // 3 * 5
      });

      it('should add 15 points per moderate keyword match', () => {
        const signals = createSignals({
          keywordMatches: {
            simple: [],
            moderate: ['implement feature'],
            complex: [],
            critical: [],
          },
        });
        const result = calculator.calculateReasoningComplexity(signals);
        expect(result).toBe(15);
      });

      it('should add 15 points for each moderate keyword', () => {
        const signals = createSignals({
          keywordMatches: {
            simple: [],
            moderate: ['implement feature', 'add validation'],
            complex: [],
            critical: [],
          },
        });
        const result = calculator.calculateReasoningComplexity(signals);
        expect(result).toBe(30); // 2 * 15
      });

      it('should add 25 points per complex keyword match', () => {
        const signals = createSignals({
          keywordMatches: {
            simple: [],
            moderate: [],
            complex: ['multi-file refactor'],
            critical: [],
          },
        });
        const result = calculator.calculateReasoningComplexity(signals);
        expect(result).toBe(25);
      });

      it('should add 25 points for each complex keyword', () => {
        const signals = createSignals({
          keywordMatches: {
            simple: [],
            moderate: [],
            complex: ['multi-file refactor', 'migrate'],
            critical: [],
          },
        });
        const result = calculator.calculateReasoningComplexity(signals);
        expect(result).toBe(50); // 2 * 25
      });

      it('should add 35 points per critical keyword match', () => {
        const signals = createSignals({
          keywordMatches: {
            simple: [],
            moderate: [],
            complex: [],
            critical: ['security audit'],
          },
        });
        const result = calculator.calculateReasoningComplexity(signals);
        expect(result).toBe(35);
      });

      it('should add 35 points for each critical keyword', () => {
        const signals = createSignals({
          keywordMatches: {
            simple: [],
            moderate: [],
            complex: [],
            critical: ['security audit', 'vulnerability assessment'],
          },
        });
        const result = calculator.calculateReasoningComplexity(signals);
        expect(result).toBe(60); // 2 * 35 = 70, capped at 60
      });

      it('should cap keyword score at 60', () => {
        const signals = createSignals({
          keywordMatches: {
            simple: ['a', 'b', 'c', 'd', 'e'], // 25
            moderate: ['f', 'g'], // 30
            complex: ['h'], // 25
            critical: [], // 0
          },
        });
        const result = calculator.calculateReasoningComplexity(signals);
        // 25 + 30 + 25 = 80, capped at 60
        expect(result).toBe(60);
      });

      it('should combine different keyword levels', () => {
        const signals = createSignals({
          keywordMatches: {
            simple: ['fix typo'], // 5
            moderate: ['implement feature'], // 15
            complex: [], // 0
            critical: [], // 0
          },
        });
        const result = calculator.calculateReasoningComplexity(signals);
        expect(result).toBe(20); // 5 + 15
      });
    });

    describe('multi-step reasoning (0-20 points)', () => {
      it('should add 0 points when not required', () => {
        const signals = createSignals({ requiresMultiStepReasoning: false });
        const result = calculator.calculateReasoningComplexity(signals);
        expect(result).toBe(0);
      });

      it('should add 20 points when required', () => {
        const signals = createSignals({ requiresMultiStepReasoning: true });
        const result = calculator.calculateReasoningComplexity(signals);
        expect(result).toBe(20);
      });
    });

    describe('creativity requirements (0-20 points)', () => {
      it('should add 0 points when not required', () => {
        const signals = createSignals({ requiresCreativity: false });
        const result = calculator.calculateReasoningComplexity(signals);
        expect(result).toBe(0);
      });

      it('should add 20 points when required', () => {
        const signals = createSignals({ requiresCreativity: true });
        const result = calculator.calculateReasoningComplexity(signals);
        expect(result).toBe(20);
      });
    });

    describe('combined contributions', () => {
      it('should sum keyword score, multi-step, and creativity', () => {
        const signals = createSignals({
          keywordMatches: {
            simple: ['fix typo'], // 5
            moderate: [],
            complex: [],
            critical: [],
          },
          requiresMultiStepReasoning: true, // 20
          requiresCreativity: true, // 20
        });
        const result = calculator.calculateReasoningComplexity(signals);
        expect(result).toBe(45); // 5 + 20 + 20
      });

      it('should cap at 100', () => {
        const signals = createSignals({
          keywordMatches: {
            simple: [],
            moderate: [],
            complex: [],
            critical: ['a', 'b'], // 70, capped at 60
          },
          requiresMultiStepReasoning: true, // 20
          requiresCreativity: true, // 20
        });
        const result = calculator.calculateReasoningComplexity(signals);
        // 60 + 20 + 20 = 100
        expect(result).toBe(100);
      });
    });
  });

  // ============================================================================
  // Test Suite: calculateScopeComplexity
  // ============================================================================

  describe('calculateScopeComplexity()', () => {
    describe('architecture scope (0-40 points)', () => {
      it('should add 0 points when not present', () => {
        const signals = createSignals({ hasArchitectureScope: false });
        const result = calculator.calculateScopeComplexity(signals);
        expect(result).toBe(0);
      });

      it('should add 40 points when present', () => {
        const signals = createSignals({ hasArchitectureScope: true });
        const result = calculator.calculateScopeComplexity(signals);
        expect(result).toBe(40);
      });
    });

    describe('security scope (0-30 points)', () => {
      it('should add 0 points when not present', () => {
        const signals = createSignals({ hasSecurityScope: false });
        const result = calculator.calculateScopeComplexity(signals);
        expect(result).toBe(0);
      });

      it('should add 30 points when present', () => {
        const signals = createSignals({ hasSecurityScope: true });
        const result = calculator.calculateScopeComplexity(signals);
        expect(result).toBe(30);
      });
    });

    describe('cross-domain coordination (0-20 points)', () => {
      it('should add 0 points when not required', () => {
        const signals = createSignals({ requiresCrossDomainCoordination: false });
        const result = calculator.calculateScopeComplexity(signals);
        expect(result).toBe(0);
      });

      it('should add 20 points when required', () => {
        const signals = createSignals({ requiresCrossDomainCoordination: true });
        const result = calculator.calculateScopeComplexity(signals);
        expect(result).toBe(20);
      });
    });

    describe('dependency count contribution (0-10 points)', () => {
      it('should return 0 for undefined dependencyCount', () => {
        const signals = createSignals({ dependencyCount: undefined });
        const result = calculator.calculateScopeComplexity(signals);
        expect(result).toBe(0);
      });

      it('should return 0 for dependencyCount < 3', () => {
        const signals = createSignals({ dependencyCount: 2 });
        const result = calculator.calculateScopeComplexity(signals);
        expect(result).toBe(0);
      });

      it('should return 0 for dependencyCount = 0', () => {
        const signals = createSignals({ dependencyCount: 0 });
        const result = calculator.calculateScopeComplexity(signals);
        expect(result).toBe(0);
      });

      it('should return 5 for dependencyCount = 3', () => {
        const signals = createSignals({ dependencyCount: 3 });
        const result = calculator.calculateScopeComplexity(signals);
        expect(result).toBe(5);
      });

      it('should return 5 for dependencyCount < 10', () => {
        const signals = createSignals({ dependencyCount: 7 });
        const result = calculator.calculateScopeComplexity(signals);
        expect(result).toBe(5);
      });

      it('should return 10 for dependencyCount = 10', () => {
        const signals = createSignals({ dependencyCount: 10 });
        const result = calculator.calculateScopeComplexity(signals);
        expect(result).toBe(10);
      });

      it('should return 10 for dependencyCount >= 10', () => {
        const signals = createSignals({ dependencyCount: 25 });
        const result = calculator.calculateScopeComplexity(signals);
        expect(result).toBe(10);
      });
    });

    describe('combined contributions', () => {
      it('should sum all scope components', () => {
        const signals = createSignals({
          hasArchitectureScope: true, // 40
          hasSecurityScope: true, // 30
          requiresCrossDomainCoordination: true, // 20
          dependencyCount: 10, // 10
        });
        const result = calculator.calculateScopeComplexity(signals);
        // Total = 40 + 30 + 20 + 10 = 100
        expect(result).toBe(100);
      });

      it('should cap at 100', () => {
        const signals = createSignals({
          hasArchitectureScope: true, // 40
          hasSecurityScope: true, // 30
          requiresCrossDomainCoordination: true, // 20
          dependencyCount: 50, // 10
        });
        const result = calculator.calculateScopeComplexity(signals);
        expect(result).toBe(100);
      });

      it('should handle partial contributions', () => {
        const signals = createSignals({
          hasArchitectureScope: true, // 40
          hasSecurityScope: false, // 0
          requiresCrossDomainCoordination: false, // 0
          dependencyCount: 5, // 5
        });
        const result = calculator.calculateScopeComplexity(signals);
        expect(result).toBe(45); // 40 + 5
      });
    });
  });

  // ============================================================================
  // Test Suite: calculateOverallComplexity
  // ============================================================================

  describe('calculateOverallComplexity()', () => {
    describe('weighted calculation', () => {
      it('should calculate weighted average: code (30%), reasoning (40%), scope (30%)', () => {
        const signals = createSignals();
        const result = calculator.calculateOverallComplexity(100, 100, 100, signals);
        // 100 * 0.3 + 100 * 0.4 + 100 * 0.3 = 100
        expect(result).toBe(100);
      });

      it('should apply correct weights', () => {
        const signals = createSignals();
        const result = calculator.calculateOverallComplexity(50, 50, 50, signals);
        // 50 * 0.3 + 50 * 0.4 + 50 * 0.3 = 15 + 20 + 15 = 50
        expect(result).toBe(50);
      });

      it('should weight reasoning more heavily (40%)', () => {
        const signals = createSignals();
        // Only reasoning has complexity
        const resultReasoningOnly = calculator.calculateOverallComplexity(0, 100, 0, signals);
        expect(resultReasoningOnly).toBe(40); // 100 * 0.4

        // Only code has complexity
        const resultCodeOnly = calculator.calculateOverallComplexity(100, 0, 0, signals);
        expect(resultCodeOnly).toBe(30); // 100 * 0.3

        // Only scope has complexity
        const resultScopeOnly = calculator.calculateOverallComplexity(0, 0, 100, signals);
        expect(resultScopeOnly).toBe(30); // 100 * 0.3
      });

      it('should round the result', () => {
        const signals = createSignals();
        // 33 * 0.3 + 33 * 0.4 + 33 * 0.3 = 9.9 + 13.2 + 9.9 = 33
        const result = calculator.calculateOverallComplexity(33, 33, 33, signals);
        expect(result).toBe(33);
      });

      it('should handle uneven distributions', () => {
        const signals = createSignals();
        // 20 * 0.3 + 80 * 0.4 + 10 * 0.3 = 6 + 32 + 3 = 41
        const result = calculator.calculateOverallComplexity(20, 80, 10, signals);
        expect(result).toBe(41);
      });

      it('should cap at 100', () => {
        const signals = createSignals();
        const result = calculator.calculateOverallComplexity(100, 100, 100, signals);
        expect(result).toBeLessThanOrEqual(100);
      });

      it('should handle zero complexity', () => {
        const signals = createSignals();
        const result = calculator.calculateOverallComplexity(0, 0, 0, signals);
        // MED-5 fix: minimum floor of 15 when no keywords match and not mechanical
        expect(result).toBe(15);
      });
    });

    describe('mechanical transform special case', () => {
      it('should use weighted calculation when mechanical but has high component scores', () => {
        // Mechanical transform override only applies when ALL component scores are zero
        // and no other complexity signals are present
        const signals = createSignals({ isMechanicalTransform: true });
        const result = calculator.calculateOverallComplexity(100, 100, 100, signals);
        // With non-zero components, uses weighted calculation: 0.4*100 + 0.35*100 + 0.25*100 = 100
        expect(result).toBe(100);
      });

      it('should use weighted calculation when mechanical but has moderate component scores', () => {
        const signals = createSignals({ isMechanicalTransform: true });
        const result = calculator.calculateOverallComplexity(80, 50, 30, signals);
        // 0.3*80 + 0.4*50 + 0.3*30 = 24 + 20 + 9 = 53
        expect(result).toBe(53);
      });

      it('should return 5 for mechanical transforms with zero complexity', () => {
        const signals = createSignals({ isMechanicalTransform: true });
        const result = calculator.calculateOverallComplexity(0, 0, 0, signals);
        expect(result).toBe(5);
      });

      it('should use weighted calculation when not a mechanical transform', () => {
        const signals = createSignals({ isMechanicalTransform: false });
        const result = calculator.calculateOverallComplexity(50, 50, 50, signals);
        expect(result).toBe(50);
      });
    });
  });

  // ============================================================================
  // Test Suite: calculateConfidence
  // ============================================================================

  describe('calculateConfidence()', () => {
    describe('base confidence', () => {
      it('should start with 0.5 base confidence', () => {
        const signals = createSignals();
        const input = createRoutingInput();
        const result = calculator.calculateConfidence(signals, input);
        expect(result).toBe(0.5);
      });
    });

    describe('code context presence (+0.2)', () => {
      it('should add 0.2 when codeContext is provided', () => {
        const signals = createSignals();
        const input = createRoutingInput({ codeContext: 'const x = 1;' });
        const result = calculator.calculateConfidence(signals, input);
        expect(result).toBe(0.7); // 0.5 + 0.2
      });

      it('should not add when codeContext is undefined', () => {
        const signals = createSignals();
        const input = createRoutingInput({ codeContext: undefined });
        const result = calculator.calculateConfidence(signals, input);
        expect(result).toBe(0.5);
      });

      it('should not add when codeContext is empty string', () => {
        const signals = createSignals();
        const input = createRoutingInput({ codeContext: '' });
        const result = calculator.calculateConfidence(signals, input);
        // Empty string is falsy, so no boost
        expect(result).toBe(0.5);
      });
    });

    describe('file paths presence (+0.1)', () => {
      it('should add 0.1 when filePaths are provided', () => {
        const signals = createSignals();
        const input = createRoutingInput({ filePaths: ['file.ts'] });
        const result = calculator.calculateConfidence(signals, input);
        expect(result).toBe(0.6); // 0.5 + 0.1
      });

      it('should not add when filePaths is undefined', () => {
        const signals = createSignals();
        const input = createRoutingInput({ filePaths: undefined });
        const result = calculator.calculateConfidence(signals, input);
        expect(result).toBe(0.5);
      });

      it('should not add when filePaths is empty array', () => {
        const signals = createSignals();
        const input = createRoutingInput({ filePaths: [] });
        const result = calculator.calculateConfidence(signals, input);
        expect(result).toBe(0.5); // Empty array has length 0
      });

      it('should add 0.1 for multiple file paths', () => {
        const signals = createSignals();
        const input = createRoutingInput({ filePaths: ['a.ts', 'b.ts', 'c.ts'] });
        const result = calculator.calculateConfidence(signals, input);
        expect(result).toBe(0.6); // Same boost regardless of count
      });
    });

    describe('keyword confidence boost (0-0.1)', () => {
      it('should add 0 for no keyword matches', () => {
        const signals = createSignals({
          keywordMatches: {
            simple: [],
            moderate: [],
            complex: [],
            critical: [],
          },
        });
        const input = createRoutingInput();
        const result = calculator.calculateConfidence(signals, input);
        expect(result).toBe(0.5); // No boost
      });

      it('should add 0.05 for 1 keyword match', () => {
        const signals = createSignals({
          keywordMatches: {
            simple: ['fix typo'],
            moderate: [],
            complex: [],
            critical: [],
          },
        });
        const input = createRoutingInput();
        const result = calculator.calculateConfidence(signals, input);
        expect(result).toBe(0.55); // 0.5 + 0.05
      });

      it('should add 0.05 for 2 keyword matches', () => {
        const signals = createSignals({
          keywordMatches: {
            simple: ['fix typo', 'update'],
            moderate: [],
            complex: [],
            critical: [],
          },
        });
        const input = createRoutingInput();
        const result = calculator.calculateConfidence(signals, input);
        expect(result).toBe(0.55); // 0.5 + 0.05
      });

      it('should add 0.1 for 3+ keyword matches', () => {
        const signals = createSignals({
          keywordMatches: {
            simple: ['a', 'b', 'c'],
            moderate: [],
            complex: [],
            critical: [],
          },
        });
        const input = createRoutingInput();
        const result = calculator.calculateConfidence(signals, input);
        expect(result).toBe(0.6); // 0.5 + 0.1
      });

      it('should count keywords across all levels', () => {
        const signals = createSignals({
          keywordMatches: {
            simple: ['a'],
            moderate: ['b'],
            complex: ['c'],
            critical: [],
          },
        });
        const input = createRoutingInput();
        const result = calculator.calculateConfidence(signals, input);
        expect(result).toBe(0.6); // 0.5 + 0.1 (3 keywords total)
      });
    });

    describe('mechanical transform boost (+0.15)', () => {
      it('should add 0.15 for mechanical transforms', () => {
        const signals = createSignals({ isMechanicalTransform: true });
        const input = createRoutingInput();
        const result = calculator.calculateConfidence(signals, input);
        expect(result).toBe(0.65); // 0.5 + 0.15
      });

      it('should not add when not a mechanical transform', () => {
        const signals = createSignals({ isMechanicalTransform: false });
        const input = createRoutingInput();
        const result = calculator.calculateConfidence(signals, input);
        expect(result).toBe(0.5);
      });
    });

    describe('combined confidence boosts', () => {
      it('should combine all boosts', () => {
        const signals = createSignals({
          isMechanicalTransform: true, // +0.15
          keywordMatches: {
            simple: ['a', 'b', 'c'], // +0.1
            moderate: [],
            complex: [],
            critical: [],
          },
        });
        const input = createRoutingInput({
          codeContext: 'code', // +0.2
          filePaths: ['file.ts'], // +0.1
        });
        const result = calculator.calculateConfidence(signals, input);
        // 0.5 + 0.2 + 0.1 + 0.1 + 0.15 = 1.05, capped at 1
        expect(result).toBe(1);
      });

      it('should cap at 1', () => {
        const signals = createSignals({
          isMechanicalTransform: true, // +0.15
          keywordMatches: {
            simple: ['a', 'b', 'c', 'd', 'e'], // +0.1
            moderate: ['x', 'y', 'z'],
            complex: ['q', 'r', 's'],
            critical: ['p'],
          },
        });
        const input = createRoutingInput({
          codeContext: 'lots of code context', // +0.2
          filePaths: ['a.ts', 'b.ts', 'c.ts'], // +0.1
        });
        const result = calculator.calculateConfidence(signals, input);
        expect(result).toBeLessThanOrEqual(1);
        expect(result).toBe(1);
      });

      it('should handle partial boosts', () => {
        const signals = createSignals({
          keywordMatches: {
            simple: ['fix'],
            moderate: [],
            complex: [],
            critical: [],
          },
        });
        const input = createRoutingInput({
          codeContext: 'code',
        });
        const result = calculator.calculateConfidence(signals, input);
        // 0.5 + 0.2 + 0.05 = 0.75
        expect(result).toBe(0.75);
      });
    });
  });

  // ============================================================================
  // Test Suite: createScoreCalculator Factory Function
  // ============================================================================

  describe('createScoreCalculator()', () => {
    it('should create a ScoreCalculator instance', () => {
      const calculator = createScoreCalculator();
      expect(calculator).toBeInstanceOf(ScoreCalculator);
    });

    it('should create functional calculator with all methods', () => {
      const calculator = createScoreCalculator();
      expect(typeof calculator.calculateCodeComplexity).toBe('function');
      expect(typeof calculator.calculateReasoningComplexity).toBe('function');
      expect(typeof calculator.calculateScopeComplexity).toBe('function');
      expect(typeof calculator.calculateOverallComplexity).toBe('function');
      expect(typeof calculator.calculateConfidence).toBe('function');
    });

    it('should create independent instances', () => {
      const calculator1 = createScoreCalculator();
      const calculator2 = createScoreCalculator();
      expect(calculator1).not.toBe(calculator2);
    });

    it('should implement IScoreCalculator interface', () => {
      const calculator: IScoreCalculator = createScoreCalculator();
      // TypeScript compilation verifies interface compliance
      expect(calculator).toBeDefined();
    });
  });

  // ============================================================================
  // Test Suite: Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    it('should handle signals with all undefined optional fields', () => {
      const signals = createSignals({
        linesOfCode: undefined,
        fileCount: undefined,
        languageComplexity: undefined,
        cyclomaticComplexity: undefined,
        dependencyCount: undefined,
        detectedTransformType: undefined,
      });
      const input = createRoutingInput();

      expect(calculator.calculateCodeComplexity(signals)).toBe(0);
      expect(calculator.calculateReasoningComplexity(signals)).toBe(0);
      expect(calculator.calculateScopeComplexity(signals)).toBe(0);
      // MED-5 fix: minimum floor of 15 when no keywords match and not mechanical
      expect(calculator.calculateOverallComplexity(0, 0, 0, signals)).toBe(15);
      expect(calculator.calculateConfidence(signals, input)).toBe(0.5);
    });

    it('should handle negative values gracefully', () => {
      const signals = createSignals({
        linesOfCode: -10,
        fileCount: -5,
        cyclomaticComplexity: -1,
        dependencyCount: -3,
      });

      // Negative values: -10 < 10 is true, so LOC contribution = 0
      // fileCount: -5 < 5 but -5 !== 1, so fileCount contribution = 10 (treated as 2-4 range behavior)
      // cyclomaticComplexity: -1 < 5, so contribution = 0
      // languageComplexity: undefined, so contribution = 0
      // Total code complexity = 0 + 10 + 0 + 0 = 10
      expect(calculator.calculateCodeComplexity(signals)).toBe(10);

      // dependencyCount: -3 < 3, so contribution = 0
      expect(calculator.calculateScopeComplexity(signals)).toBe(0);
    });

    it('should handle very large values', () => {
      const signals = createSignals({
        linesOfCode: 1000000,
        fileCount: 10000,
        cyclomaticComplexity: 500,
        dependencyCount: 1000,
      });

      const codeResult = calculator.calculateCodeComplexity(signals);
      const scopeResult = calculator.calculateScopeComplexity(signals);

      // Should be capped at 100
      expect(codeResult).toBeLessThanOrEqual(100);
      expect(scopeResult).toBeLessThanOrEqual(100);
    });

    it('should handle empty keyword arrays', () => {
      const signals = createSignals({
        keywordMatches: {
          simple: [],
          moderate: [],
          complex: [],
          critical: [],
        },
      });

      const result = calculator.calculateReasoningComplexity(signals);
      expect(result).toBe(0);
    });

    it('should handle input with only task', () => {
      const signals = createSignals();
      const input: RoutingInput = { task: 'simple task' };

      const confidence = calculator.calculateConfidence(signals, input);
      expect(confidence).toBe(0.5); // Only base confidence
    });
  });

  // ============================================================================
  // Test Suite: Integration Scenarios
  // ============================================================================

  describe('integration scenarios', () => {
    it('should calculate realistic score for simple bug fix', () => {
      const signals = createSignals({
        linesOfCode: 15, // 10 points
        fileCount: 1, // 0 points
        cyclomaticComplexity: 3, // 0 points
        languageComplexity: 'medium', // 10 points
        keywordMatches: {
          simple: ['fix bug'],
          moderate: [],
          complex: [],
          critical: [],
        },
        requiresMultiStepReasoning: false,
        requiresCreativity: false,
        hasArchitectureScope: false,
        hasSecurityScope: false,
        requiresCrossDomainCoordination: false,
        dependencyCount: 2,
      });

      const codeComplexity = calculator.calculateCodeComplexity(signals);
      const reasoningComplexity = calculator.calculateReasoningComplexity(signals);
      const scopeComplexity = calculator.calculateScopeComplexity(signals);
      const overall = calculator.calculateOverallComplexity(
        codeComplexity,
        reasoningComplexity,
        scopeComplexity,
        signals
      );

      expect(codeComplexity).toBe(20); // 10 + 10
      expect(reasoningComplexity).toBe(5); // 1 simple keyword
      expect(scopeComplexity).toBe(0); // No scope flags
      // 20 * 0.3 + 5 * 0.4 + 0 * 0.3 = 6 + 2 + 0 = 8
      expect(overall).toBe(8);
    });

    it('should calculate realistic score for architecture refactor', () => {
      const signals = createSignals({
        linesOfCode: 250, // 30 points
        fileCount: 8, // 20 points
        cyclomaticComplexity: 15, // 20 points
        languageComplexity: 'high', // 20 points
        keywordMatches: {
          simple: [],
          moderate: ['refactor'],
          complex: ['migration'],
          critical: [],
        },
        requiresMultiStepReasoning: true,
        requiresCreativity: false,
        hasArchitectureScope: true,
        hasSecurityScope: false,
        requiresCrossDomainCoordination: true,
        dependencyCount: 12,
      });

      const codeComplexity = calculator.calculateCodeComplexity(signals);
      const reasoningComplexity = calculator.calculateReasoningComplexity(signals);
      const scopeComplexity = calculator.calculateScopeComplexity(signals);
      const overall = calculator.calculateOverallComplexity(
        codeComplexity,
        reasoningComplexity,
        scopeComplexity,
        signals
      );

      expect(codeComplexity).toBe(90); // 30 + 20 + 20 + 20
      expect(reasoningComplexity).toBe(60); // 15 + 25 + 20 = 60
      expect(scopeComplexity).toBe(70); // 40 + 20 + 10 = 70
      // 90 * 0.3 + 60 * 0.4 + 70 * 0.3 = 27 + 24 + 21 = 72
      expect(overall).toBe(72);
    });

    it('should calculate realistic score for security audit', () => {
      const signals = createSignals({
        linesOfCode: 500, // 30 points
        fileCount: 20, // 20 points
        cyclomaticComplexity: 25, // 30 points
        languageComplexity: 'high', // 20 points (capped at 100)
        keywordMatches: {
          simple: [],
          moderate: [],
          complex: [],
          critical: ['security audit'],
        },
        requiresMultiStepReasoning: true,
        requiresCreativity: true,
        hasArchitectureScope: false,
        hasSecurityScope: true,
        requiresCrossDomainCoordination: false,
        dependencyCount: 15,
      });

      const codeComplexity = calculator.calculateCodeComplexity(signals);
      const reasoningComplexity = calculator.calculateReasoningComplexity(signals);
      const scopeComplexity = calculator.calculateScopeComplexity(signals);
      const overall = calculator.calculateOverallComplexity(
        codeComplexity,
        reasoningComplexity,
        scopeComplexity,
        signals
      );

      expect(codeComplexity).toBe(100); // 30 + 20 + 30 + 20 = 100
      expect(reasoningComplexity).toBe(75); // 35 + 20 + 20 = 75
      expect(scopeComplexity).toBe(40); // 30 + 10 = 40
      // 100 * 0.3 + 75 * 0.4 + 40 * 0.3 = 30 + 30 + 12 = 72
      expect(overall).toBe(72);
    });

    it('should calculate realistic score for var-to-const transform', () => {
      const signals = createSignals({
        linesOfCode: 5,
        fileCount: 1,
        cyclomaticComplexity: 1,
        languageComplexity: 'low',
        isMechanicalTransform: true,
        detectedTransformType: 'var-to-const',
        keywordMatches: {
          simple: ['convert var to const'],
          moderate: [],
          complex: [],
          critical: [],
        },
      });
      const input = createRoutingInput({
        task: 'convert var to const',
        codeContext: 'var x = 1;',
      });

      const codeComplexity = calculator.calculateCodeComplexity(signals);
      const reasoningComplexity = calculator.calculateReasoningComplexity(signals);
      const scopeComplexity = calculator.calculateScopeComplexity(signals);
      const overall = calculator.calculateOverallComplexity(
        codeComplexity,
        reasoningComplexity,
        scopeComplexity,
        signals
      );
      const confidence = calculator.calculateConfidence(signals, input);

      expect(codeComplexity).toBe(0);
      expect(reasoningComplexity).toBe(5);
      expect(scopeComplexity).toBe(0);
      // Mechanical override requires ALL components=0; reasoning=5 means weighted calc: 0.3*0 + 0.4*5 + 0.3*0 = 2
      expect(overall).toBe(2);
      // 0.5 + 0.2 (code) + 0.05 (1 keyword) + 0.15 (mechanical) = 0.9
      expect(confidence).toBe(0.9);
    });
  });
});
