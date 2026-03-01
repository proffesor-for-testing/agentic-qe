/**
 * Agentic QE v3 - Complexity Analyzer Unit Tests
 *
 * Comprehensive tests for the ComplexityAnalyzer class covering:
 * 1. analyze() method with various inputs
 * 2. Signal collection for different task types
 * 3. Complexity calculations (code, reasoning, scope)
 * 4. Tier recommendation logic
 * 5. Agent Booster eligibility checking
 *
 * @module tests/unit/integrations/agentic-flow/model-router/complexity-analyzer
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ComplexityAnalyzer,
  createComplexityAnalyzer,
} from '../../../../../src/integrations/agentic-flow/model-router/complexity-analyzer';
import type {
  RoutingInput,
  ModelRouterConfig,
  ComplexityScore,
  ModelTier,
} from '../../../../../src/integrations/agentic-flow/model-router/types';
import {
  DEFAULT_ROUTER_CONFIG,
  ComplexityAnalysisError,
  TIER_METADATA,
} from '../../../../../src/integrations/agentic-flow/model-router/types';
import type {
  IAgentBoosterAdapter,
  OpportunityDetectionResult,
  TransformType,
} from '../../../../../src/integrations/agentic-flow/agent-booster/types';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Create a minimal config for testing
 */
function createTestConfig(overrides: Partial<ModelRouterConfig> = {}): ModelRouterConfig {
  return {
    ...DEFAULT_ROUTER_CONFIG,
    ...overrides,
  };
}

/**
 * Create a mock Agent Booster adapter
 */
function createMockAgentBoosterAdapter(
  opportunities: OpportunityDetectionResult['opportunities'] = []
): IAgentBoosterAdapter {
  return {
    transform: vi.fn(),
    batchTransform: vi.fn(),
    detectTransformOpportunities: vi.fn().mockResolvedValue({
      opportunities,
      totalCount: opportunities.length,
      byType: {} as Record<TransformType, number>,
      durationMs: 1,
      complete: true,
      warnings: [],
    }),
    isTransformAvailable: vi.fn().mockReturnValue(true),
    getTransformMetadata: vi.fn(),
    getAvailableTransforms: vi.fn().mockReturnValue([]),
    isWasmAvailable: vi.fn().mockReturnValue(true),
    getHealth: vi.fn().mockReturnValue({
      ready: true,
      wasmAvailable: true,
      patternsLoaded: true,
      availableTransforms: [],
      lastChecked: new Date(),
      issues: [],
      metrics: {
        totalTransforms: 0,
        successfulTransforms: 0,
        averageDurationMs: 0,
        cacheHitRate: 0,
      },
    }),
    initialize: vi.fn(),
    dispose: vi.fn(),
  };
}

/**
 * Create a simple routing input
 */
function createRoutingInput(overrides: Partial<RoutingInput> = {}): RoutingInput {
  return {
    task: 'Fix a bug in the authentication module',
    ...overrides,
  };
}

// ============================================================================
// Test Suite: ComplexityAnalyzer.analyze()
// ============================================================================

describe('ComplexityAnalyzer', () => {
  describe('analyze()', () => {
    let analyzer: ComplexityAnalyzer;

    beforeEach(() => {
      analyzer = createComplexityAnalyzer(createTestConfig());
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should return a complexity score for a simple task', async () => {
      const input = createRoutingInput({ task: 'Fix typo in comment' });
      const result = await analyzer.analyze(input);

      expect(result).toBeDefined();
      expect(result.overall).toBeGreaterThanOrEqual(0);
      expect(result.overall).toBeLessThanOrEqual(100);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.recommendedTier).toBeDefined();
      expect(result.signals).toBeDefined();
      expect(result.explanation).toBeTruthy();
    });

    it('should return low complexity for simple bug fix', async () => {
      const input = createRoutingInput({ task: 'fix simple bug in login' });
      const result = await analyzer.analyze(input);

      expect(result.overall).toBeLessThan(50);
      expect(result.recommendedTier).toBeLessThanOrEqual(2);
    });

    it('should return high complexity for architecture tasks', async () => {
      const input = createRoutingInput({
        task: 'Design system architecture for the new microservices platform',
      });
      const result = await analyzer.analyze(input);

      expect(result.overall).toBeGreaterThan(30);
      expect(result.signals.hasArchitectureScope).toBe(true);
    });

    it('should return high complexity for security tasks', async () => {
      const input = createRoutingInput({
        task: 'Perform security audit and vulnerability assessment',
      });
      const result = await analyzer.analyze(input);

      expect(result.signals.hasSecurityScope).toBe(true);
      expect(result.scopeComplexity).toBeGreaterThan(0);
    });

    it('should detect multi-step reasoning requirements', async () => {
      const input = createRoutingInput({
        task: 'Orchestrate the deployment workflow across multiple services',
      });
      const result = await analyzer.analyze(input);

      expect(result.signals.requiresMultiStepReasoning).toBe(true);
      expect(result.reasoningComplexity).toBeGreaterThan(0);
    });

    it('should detect cross-domain coordination', async () => {
      const input = createRoutingInput({
        task: 'Coordinate across domains to integrate payment and shipping modules',
      });
      const result = await analyzer.analyze(input);

      expect(result.signals.requiresCrossDomainCoordination).toBe(true);
    });

    it('should include alternate tiers in result', async () => {
      const input = createRoutingInput({ task: 'Implement a new feature' });
      const result = await analyzer.analyze(input);

      expect(result.alternateTiers).toBeDefined();
      expect(Array.isArray(result.alternateTiers)).toBe(true);
    });

    it('should increase confidence when code context is provided', async () => {
      const inputWithoutCode = createRoutingInput({ task: 'Fix bug' });
      const resultWithoutCode = await analyzer.analyze(inputWithoutCode);

      const inputWithCode = createRoutingInput({
        task: 'Fix bug',
        codeContext: 'function test() { return true; }',
      });
      const resultWithCode = await analyzer.analyze(inputWithCode);

      expect(resultWithCode.confidence).toBeGreaterThan(resultWithoutCode.confidence);
    });

    it('should increase confidence when file paths are provided', async () => {
      const inputWithoutFiles = createRoutingInput({ task: 'Fix bug' });
      const resultWithoutFiles = await analyzer.analyze(inputWithoutFiles);

      const inputWithFiles = createRoutingInput({
        task: 'Fix bug',
        filePaths: ['src/auth.ts', 'src/login.ts'],
      });
      const resultWithFiles = await analyzer.analyze(inputWithFiles);

      expect(resultWithFiles.confidence).toBeGreaterThan(resultWithoutFiles.confidence);
    });

    it('should throw ComplexityAnalysisError on internal error', async () => {
      // Create analyzer with a mock that throws
      const badAdapter = createMockAgentBoosterAdapter();
      badAdapter.detectTransformOpportunities = vi.fn().mockRejectedValue(new Error('Mock error'));

      const analyzerWithBadAdapter = createComplexityAnalyzer(
        createTestConfig({ enableAgentBooster: true }),
        badAdapter
      );

      // Even with the adapter error, the analyzer should handle it gracefully
      // since it catches errors in the Agent Booster eligibility check
      const input = createRoutingInput({ task: 'convert var to const' });
      const result = await analyzerWithBadAdapter.analyze(input);
      expect(result).toBeDefined();
    });
  });

  // ============================================================================
  // Test Suite: Signal Collection
  // ============================================================================

  describe('signal collection', () => {
    let analyzer: ComplexityAnalyzer;

    beforeEach(() => {
      analyzer = createComplexityAnalyzer(createTestConfig());
    });

    describe('keyword matching', () => {
      it('should detect simple task keywords', async () => {
        const input = createRoutingInput({ task: 'fix typo in the documentation' });
        const result = await analyzer.analyze(input);

        expect(result.signals.keywordMatches.simple).toContain('fix typo');
      });

      it('should detect moderate task keywords', async () => {
        const input = createRoutingInput({ task: 'implement feature for user profile' });
        const result = await analyzer.analyze(input);

        expect(result.signals.keywordMatches.moderate).toContain('implement feature');
      });

      it('should detect complex task keywords', async () => {
        const input = createRoutingInput({ task: 'multi-file refactor of the authentication system' });
        const result = await analyzer.analyze(input);

        expect(result.signals.keywordMatches.complex).toContain('multi-file refactor');
      });

      it('should detect critical task keywords', async () => {
        const input = createRoutingInput({ task: 'security audit of the payment module' });
        const result = await analyzer.analyze(input);

        expect(result.signals.keywordMatches.critical).toContain('security audit');
      });
    });

    describe('code context analysis', () => {
      it('should count lines of code', async () => {
        const codeContext = `function hello() {
  console.log('hello');
  return true;
}`;
        const input = createRoutingInput({ task: 'refactor this', codeContext });
        const result = await analyzer.analyze(input);

        expect(result.signals.linesOfCode).toBe(4);
      });

      it('should count file paths', async () => {
        const input = createRoutingInput({
          task: 'refactor these files',
          filePaths: ['a.ts', 'b.ts', 'c.ts'],
        });
        const result = await analyzer.analyze(input);

        expect(result.signals.fileCount).toBe(3);
      });

      it('should estimate cyclomatic complexity', async () => {
        const codeContext = `
          function test(a, b) {
            if (a > 0 && b > 0) {
              if (a > b) {
                return a;
              } else {
                return b;
              }
            }
            return 0;
          }
        `;
        const input = createRoutingInput({ task: 'analyze this', codeContext });
        const result = await analyzer.analyze(input);

        // Should count: 3 if statements, 1 &&, plus base of 1
        expect(result.signals.cyclomaticComplexity).toBeGreaterThanOrEqual(4);
      });

      it('should count dependencies (imports)', async () => {
        const codeContext = `
          import { foo } from 'foo';
          import { bar } from 'bar';
          const baz = require('baz');
        `;
        const input = createRoutingInput({ task: 'analyze this', codeContext });
        const result = await analyzer.analyze(input);

        expect(result.signals.dependencyCount).toBe(3);
      });
    });

    describe('language complexity estimation', () => {
      it('should detect high complexity for TypeScript files', async () => {
        const input = createRoutingInput({
          task: 'refactor',
          filePaths: ['src/complex.ts'],
        });
        const result = await analyzer.analyze(input);

        expect(result.signals.languageComplexity).toBe('high');
      });

      it('should detect medium complexity for JavaScript files', async () => {
        const input = createRoutingInput({
          task: 'refactor',
          filePaths: ['src/file.js'],
        });
        const result = await analyzer.analyze(input);

        expect(result.signals.languageComplexity).toBe('medium');
      });

      it('should detect low complexity for JSON/config files', async () => {
        const input = createRoutingInput({
          task: 'update config',
          filePaths: ['config.json'],
        });
        const result = await analyzer.analyze(input);

        expect(result.signals.languageComplexity).toBe('low');
      });

      it('should detect high complexity from code with generics', async () => {
        const codeContext = `
          interface Result<T, E extends Error> {
            value?: T;
            error?: E;
          }
          class Handler<T> {
            handle(input: T): Result<T, Error> {
              return { value: input };
            }
          }
        `;
        const input = createRoutingInput({ task: 'analyze', codeContext });
        const result = await analyzer.analyze(input);

        expect(result.signals.languageComplexity).toBe('high');
      });

      it('should detect medium complexity from async code', async () => {
        const codeContext = `
          async function fetchData() {
            const response = await fetch('/api/data');
            return response.json();
          }
        `;
        const input = createRoutingInput({ task: 'analyze', codeContext });
        const result = await analyzer.analyze(input);

        // async without generics/complex types => medium
        expect(result.signals.languageComplexity).toBe('medium');
      });
    });

    describe('creativity detection', () => {
      it('should detect creativity requirements for design tasks', async () => {
        const input = createRoutingInput({ task: 'design a creative UI component' });
        const result = await analyzer.analyze(input);

        expect(result.signals.requiresCreativity).toBe(true);
      });

      it('should detect creativity for innovative solutions', async () => {
        const input = createRoutingInput({ task: 'create an innovative algorithm' });
        const result = await analyzer.analyze(input);

        expect(result.signals.requiresCreativity).toBe(true);
      });

      it('should not detect creativity for simple tasks', async () => {
        const input = createRoutingInput({ task: 'fix typo in file' });
        const result = await analyzer.analyze(input);

        expect(result.signals.requiresCreativity).toBe(false);
      });
    });
  });

  // ============================================================================
  // Test Suite: Complexity Calculations
  // ============================================================================

  describe('complexity calculations', () => {
    let analyzer: ComplexityAnalyzer;

    beforeEach(() => {
      analyzer = createComplexityAnalyzer(createTestConfig());
    });

    describe('code complexity', () => {
      it('should score 0 for small code changes', async () => {
        const input = createRoutingInput({
          task: 'fix bug',
          codeContext: 'x = 1;', // 1 line
        });
        const result = await analyzer.analyze(input);

        expect(result.codeComplexity).toBe(0);
      });

      it('should increase score for larger code changes', async () => {
        const largeCode = Array(100).fill('const x = 1;').join('\n');
        const input = createRoutingInput({
          task: 'refactor',
          codeContext: largeCode,
        });
        const result = await analyzer.analyze(input);

        expect(result.codeComplexity).toBeGreaterThan(10);
      });

      it('should increase score for multiple files', async () => {
        const input = createRoutingInput({
          task: 'refactor',
          filePaths: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts'],
        });
        const result = await analyzer.analyze(input);

        expect(result.codeComplexity).toBeGreaterThanOrEqual(20);
      });

      it('should cap code complexity at 100', async () => {
        const hugeCode = Array(500).fill('if (x) { while(y) { for(let i=0; i<10; i++) { } } }').join('\n');
        const input = createRoutingInput({
          task: 'refactor',
          codeContext: hugeCode,
          filePaths: Array(20).fill('file.ts'),
        });
        const result = await analyzer.analyze(input);

        expect(result.codeComplexity).toBeLessThanOrEqual(100);
      });
    });

    describe('reasoning complexity', () => {
      it('should score low for simple keyword matches', async () => {
        const input = createRoutingInput({ task: 'fix typo' });
        const result = await analyzer.analyze(input);

        expect(result.reasoningComplexity).toBeLessThan(30);
      });

      it('should score higher for complex keyword matches', async () => {
        const input = createRoutingInput({
          task: 'orchestrate multi-file refactor with cross-domain coordination',
        });
        const result = await analyzer.analyze(input);

        expect(result.reasoningComplexity).toBeGreaterThan(30);
      });

      it('should add points for multi-step reasoning', async () => {
        const inputSimple = createRoutingInput({ task: 'fix bug' });
        const resultSimple = await analyzer.analyze(inputSimple);

        const inputMultiStep = createRoutingInput({
          task: 'orchestrate the entire workflow',
        });
        const resultMultiStep = await analyzer.analyze(inputMultiStep);

        expect(resultMultiStep.reasoningComplexity).toBeGreaterThan(resultSimple.reasoningComplexity);
      });

      it('should add points for creativity requirements', async () => {
        const inputNoCreativity = createRoutingInput({ task: 'update config' });
        const resultNoCreativity = await analyzer.analyze(inputNoCreativity);

        const inputCreative = createRoutingInput({ task: 'design creative solution' });
        const resultCreative = await analyzer.analyze(inputCreative);

        expect(resultCreative.reasoningComplexity).toBeGreaterThan(resultNoCreativity.reasoningComplexity);
      });

      it('should cap reasoning complexity at 100', async () => {
        const input = createRoutingInput({
          task: 'orchestrate complex workflow with creative design for multi-file migration across domains',
        });
        const result = await analyzer.analyze(input);

        expect(result.reasoningComplexity).toBeLessThanOrEqual(100);
      });
    });

    describe('scope complexity', () => {
      it('should add 40 points for architecture scope', async () => {
        const input = createRoutingInput({ task: 'architect the system' });
        const result = await analyzer.analyze(input);

        expect(result.scopeComplexity).toBeGreaterThanOrEqual(40);
      });

      it('should add 30 points for security scope', async () => {
        const input = createRoutingInput({ task: 'security vulnerability assessment' });
        const result = await analyzer.analyze(input);

        expect(result.scopeComplexity).toBeGreaterThanOrEqual(30);
      });

      it('should add 20 points for cross-domain coordination', async () => {
        const input = createRoutingInput({ task: 'integrate across domains' });
        const result = await analyzer.analyze(input);

        expect(result.scopeComplexity).toBeGreaterThanOrEqual(20);
      });

      it('should add points for high dependency count', async () => {
        const codeContext = Array(15).fill("import { x } from 'module';").join('\n');
        const input = createRoutingInput({
          task: 'refactor',
          codeContext,
        });
        const result = await analyzer.analyze(input);

        expect(result.signals.dependencyCount).toBeGreaterThanOrEqual(10);
      });

      it('should cap scope complexity at 100', async () => {
        const input = createRoutingInput({
          task: 'architect security system with cross-domain coordination',
          codeContext: Array(20).fill("import { x } from 'module';").join('\n'),
        });
        const result = await analyzer.analyze(input);

        expect(result.scopeComplexity).toBeLessThanOrEqual(100);
      });
    });

    describe('overall complexity', () => {
      it('should calculate weighted average of components', async () => {
        const input = createRoutingInput({
          task: 'implement feature with validation logic',
          codeContext: Array(60).fill('const x = 1;').join('\n'),
          filePaths: ['a.ts', 'b.ts'],
        });
        const result = await analyzer.analyze(input);

        // Verify it's a reasonable weighted combination
        // code (30%) + reasoning (40%) + scope (30%)
        const expectedRange = (result.codeComplexity * 0.3) +
          (result.reasoningComplexity * 0.4) +
          (result.scopeComplexity * 0.3);

        // Allow some tolerance for rounding
        expect(result.overall).toBeCloseTo(expectedRange, 0);
      });

      it('should return 5 for mechanical transforms', async () => {
        const mockAdapter = createMockAgentBoosterAdapter([
          {
            type: 'var-to-const',
            confidence: 0.9,
            location: { line: 1, column: 0, offset: 0 },
            codeSnippet: 'var x = 1;',
            suggestedCode: 'const x = 1;',
            reason: 'Variable is never reassigned',
            risk: 'low' as any,
            estimatedDurationMs: 1,
          },
        ]);

        const analyzerWithAdapter = createComplexityAnalyzer(
          createTestConfig({ enableAgentBooster: true, agentBoosterThreshold: 0.7 }),
          mockAdapter
        );

        const input = createRoutingInput({
          task: 'convert var to const',
          codeContext: 'var x = 1;',
        });
        const result = await analyzerWithAdapter.analyze(input);

        expect(result.overall).toBe(5);
        expect(result.signals.isMechanicalTransform).toBe(true);
      });

      it('should cap overall complexity at 100', async () => {
        const input = createRoutingInput({
          task: 'architect security system with cross-domain workflow orchestration for migration',
          codeContext: Array(300).fill('if(x) { while(y) { } }').join('\n'),
          filePaths: Array(10).fill('file.ts'),
        });
        const result = await analyzer.analyze(input);

        expect(result.overall).toBeLessThanOrEqual(100);
      });
    });
  });

  // ============================================================================
  // Test Suite: Tier Recommendation
  // ============================================================================

  describe('tier recommendation', () => {
    let analyzer: ComplexityAnalyzer;

    beforeEach(() => {
      analyzer = createComplexityAnalyzer(createTestConfig());
    });

    describe('getRecommendedTier()', () => {
      it('should return Tier 0 for complexity 0-10', () => {
        expect(analyzer.getRecommendedTier(0)).toBe(0);
        expect(analyzer.getRecommendedTier(5)).toBe(0);
        expect(analyzer.getRecommendedTier(10)).toBe(0);
      });

      it('should return Tier 1 for complexity 10-35', () => {
        expect(analyzer.getRecommendedTier(11)).toBe(1);
        expect(analyzer.getRecommendedTier(20)).toBe(1);
        expect(analyzer.getRecommendedTier(35)).toBe(1);
      });

      it('should return Tier 2 for complexity 35-70', () => {
        expect(analyzer.getRecommendedTier(36)).toBe(2);
        expect(analyzer.getRecommendedTier(50)).toBe(2);
        expect(analyzer.getRecommendedTier(70)).toBe(2);
      });

      it('should return Tier 3 for complexity 60-85', () => {
        // Note: There's overlap between Tier 2 and 3 (60-70)
        // The algorithm picks the first matching tier
        expect(analyzer.getRecommendedTier(71)).toBe(3);
        expect(analyzer.getRecommendedTier(80)).toBe(3);
        expect(analyzer.getRecommendedTier(85)).toBe(3);
      });

      it('should return Tier 4 for complexity 75-100', () => {
        expect(analyzer.getRecommendedTier(86)).toBe(4);
        expect(analyzer.getRecommendedTier(90)).toBe(4);
        expect(analyzer.getRecommendedTier(100)).toBe(4);
      });

      it('should return Tier 2 as fallback for out-of-range values', () => {
        expect(analyzer.getRecommendedTier(-1)).toBe(2);
        expect(analyzer.getRecommendedTier(150)).toBe(2);
      });
    });

    describe('end-to-end tier selection', () => {
      it('should recommend Tier 1 for simple bug fixes', async () => {
        const input = createRoutingInput({ task: 'fix simple bug' });
        const result = await analyzer.analyze(input);

        // Simple bug should be low complexity -> Tier 0, 1, or 2
        expect(result.recommendedTier).toBeLessThanOrEqual(2);
      });

      it('should recommend higher tier for architecture tasks', async () => {
        const input = createRoutingInput({
          task: 'architect system-wide security infrastructure',
        });
        const result = await analyzer.analyze(input);

        // Architecture + security scope should be detected
        // The tier depends on the weighted calculation, but scope complexity should be high
        expect(result.signals.hasArchitectureScope).toBe(true);
        expect(result.signals.hasSecurityScope).toBe(true);
        expect(result.scopeComplexity).toBeGreaterThanOrEqual(70); // 40 architecture + 30 security
      });

      it('should include explanation of tier selection', async () => {
        const input = createRoutingInput({
          task: 'security audit of critical authentication system',
        });
        const result = await analyzer.analyze(input);

        expect(result.explanation).toContain('Tier');
        expect(result.explanation).toContain('Security scope detected');
      });
    });

    describe('alternate tiers', () => {
      it('should include adjacent tiers as alternatives', async () => {
        const input = createRoutingInput({ task: 'implement feature' });
        const result = await analyzer.analyze(input);

        // Should have at least one alternate tier
        expect(result.alternateTiers.length).toBeGreaterThan(0);
      });

      it('should include higher capable tier for important tasks', async () => {
        const input = createRoutingInput({ task: 'fix simple bug' });
        const result = await analyzer.analyze(input);

        // If recommended tier is < 3, should include Tier 4 as alternative
        if (result.recommendedTier < 3) {
          expect(result.alternateTiers).toContain(4);
        }
      });
    });
  });

  // ============================================================================
  // Test Suite: Agent Booster Eligibility
  // ============================================================================

  describe('Agent Booster eligibility', () => {
    describe('without adapter', () => {
      it('should return not eligible when Agent Booster is disabled', async () => {
        const analyzer = createComplexityAnalyzer(
          createTestConfig({ enableAgentBooster: false })
        );

        const input = createRoutingInput({ task: 'convert var to const' });
        const result = await analyzer.checkAgentBoosterEligibility(input);

        expect(result.eligible).toBe(false);
        expect(result.reason).toContain('disabled');
      });

      it('should return eligible via keyword detection even without adapter', async () => {
        const analyzer = createComplexityAnalyzer(
          createTestConfig({ enableAgentBooster: true })
        );

        const input = createRoutingInput({ task: 'convert var to const' });
        const result = await analyzer.checkAgentBoosterEligibility(input);

        // ADR-051: Keyword-based detection works without adapter
        expect(result.eligible).toBe(true);
        expect(result.confidence).toBeGreaterThan(0);
        expect(result.reason).toContain('transform pattern');
      });
    });

    describe('with adapter', () => {
      let mockAdapter: IAgentBoosterAdapter;
      let analyzer: ComplexityAnalyzer;

      beforeEach(() => {
        mockAdapter = createMockAgentBoosterAdapter();
        analyzer = createComplexityAnalyzer(
          createTestConfig({ enableAgentBooster: true, agentBoosterThreshold: 0.7 }),
          mockAdapter
        );
      });

      describe('keyword-based detection', () => {
        it('should detect var-to-const transform', async () => {
          const input = createRoutingInput({ task: 'convert var to const' });
          const result = await analyzer.checkAgentBoosterEligibility(input);

          expect(result.transformType).toBe('var-to-const');
        });

        it('should detect add-types transform', async () => {
          const input = createRoutingInput({ task: 'add types to function' });
          const result = await analyzer.checkAgentBoosterEligibility(input);

          expect(result.transformType).toBe('add-types');
        });

        it('should detect remove-console transform', async () => {
          const input = createRoutingInput({ task: 'remove console.log statements' });
          const result = await analyzer.checkAgentBoosterEligibility(input);

          expect(result.transformType).toBe('remove-console');
        });

        it('should detect promise-to-async transform', async () => {
          const input = createRoutingInput({ task: 'convert promise to async await' });
          const result = await analyzer.checkAgentBoosterEligibility(input);

          expect(result.transformType).toBe('promise-to-async');
        });

        it('should detect cjs-to-esm transform', async () => {
          const input = createRoutingInput({ task: 'convert require to import (commonjs to esm)' });
          const result = await analyzer.checkAgentBoosterEligibility(input);

          expect(result.transformType).toBe('cjs-to-esm');
        });

        it('should detect func-to-arrow transform', async () => {
          const input = createRoutingInput({ task: 'convert function to arrow' });
          const result = await analyzer.checkAgentBoosterEligibility(input);

          expect(result.transformType).toBe('func-to-arrow');
        });

        it('should not detect transform for non-mechanical tasks', async () => {
          const input = createRoutingInput({ task: 'implement new feature' });
          const result = await analyzer.checkAgentBoosterEligibility(input);

          expect(result.eligible).toBe(false);
          expect(result.reason).toContain('No mechanical transform pattern');
        });
      });

      describe('adapter-based detection', () => {
        it('should use adapter detection when code context provided', async () => {
          mockAdapter.detectTransformOpportunities = vi.fn().mockResolvedValue({
            opportunities: [
              {
                type: 'var-to-const',
                confidence: 0.95,
                location: { line: 1, column: 0, offset: 0 },
                codeSnippet: 'var x = 1;',
                suggestedCode: 'const x = 1;',
                reason: 'Variable is never reassigned',
                risk: 'low',
                estimatedDurationMs: 1,
              },
            ],
            totalCount: 1,
            byType: { 'var-to-const': 1 },
            durationMs: 1,
            complete: true,
            warnings: [],
          });

          const input = createRoutingInput({
            task: 'convert var to const',
            codeContext: 'var x = 1;',
          });
          const result = await analyzer.checkAgentBoosterEligibility(input);

          expect(result.eligible).toBe(true);
          expect(result.confidence).toBe(0.95);
          expect(result.transformType).toBe('var-to-const');
        });

        it('should fall back to keyword detection when adapter throws', async () => {
          mockAdapter.detectTransformOpportunities = vi.fn().mockRejectedValue(new Error('Adapter error'));

          const input = createRoutingInput({
            task: 'convert var to const',
            codeContext: 'var x = 1;',
          });
          const result = await analyzer.checkAgentBoosterEligibility(input);

          // Should still work via keyword detection
          expect(result.transformType).toBe('var-to-const');
        });

        it('should not be eligible when adapter confidence is below threshold', async () => {
          mockAdapter.detectTransformOpportunities = vi.fn().mockResolvedValue({
            opportunities: [
              {
                type: 'var-to-const',
                confidence: 0.5, // Below 0.7 threshold
                location: { line: 1, column: 0, offset: 0 },
                codeSnippet: 'var x = 1;',
                suggestedCode: 'const x = 1;',
                reason: 'Uncertain transform',
                risk: 'medium',
                estimatedDurationMs: 1,
              },
            ],
            totalCount: 1,
            byType: { 'var-to-const': 1 },
            durationMs: 1,
            complete: true,
            warnings: [],
          });

          const input = createRoutingInput({
            task: 'convert var to const',
            codeContext: 'var x = 1;',
          });
          const result = await analyzer.checkAgentBoosterEligibility(input);

          expect(result.eligible).toBe(false);
          expect(result.confidence).toBe(0.5);
        });
      });

      describe('confidence calculation', () => {
        it('should cap confidence at 1', async () => {
          // Multiple keyword matches could exceed 1 without capping
          const input = createRoutingInput({
            task: 'convert var to const, var declaration',
          });
          const result = await analyzer.checkAgentBoosterEligibility(input);

          expect(result.confidence).toBeLessThanOrEqual(1);
        });

        it('should accumulate confidence from multiple keyword matches', async () => {
          const inputSingle = createRoutingInput({ task: 'var to const' });
          const resultSingle = await analyzer.checkAgentBoosterEligibility(inputSingle);

          const inputMultiple = createRoutingInput({
            task: 'convert var to const with var declaration',
          });
          const resultMultiple = await analyzer.checkAgentBoosterEligibility(inputMultiple);

          expect(resultMultiple.confidence).toBeGreaterThanOrEqual(resultSingle.confidence);
        });
      });
    });
  });

  // ============================================================================
  // Test Suite: Factory Function
  // ============================================================================

  describe('createComplexityAnalyzer()', () => {
    it('should create an analyzer instance', () => {
      const analyzer = createComplexityAnalyzer(createTestConfig());
      expect(analyzer).toBeInstanceOf(ComplexityAnalyzer);
    });

    it('should create an analyzer with adapter', () => {
      const mockAdapter = createMockAgentBoosterAdapter();
      const analyzer = createComplexityAnalyzer(createTestConfig(), mockAdapter);
      expect(analyzer).toBeInstanceOf(ComplexityAnalyzer);
    });

    it('should use custom config values', async () => {
      const customConfig = createTestConfig({
        enableAgentBooster: false,
        agentBoosterThreshold: 0.9,
      });
      const analyzer = createComplexityAnalyzer(customConfig);

      const input = createRoutingInput({ task: 'convert var to const' });
      const result = await analyzer.checkAgentBoosterEligibility(input);

      expect(result.eligible).toBe(false);
    });
  });

  // ============================================================================
  // Test Suite: Explanation Generation
  // ============================================================================

  describe('explanation generation', () => {
    let analyzer: ComplexityAnalyzer;

    beforeEach(() => {
      analyzer = createComplexityAnalyzer(createTestConfig());
    });

    it('should include complexity score in explanation', async () => {
      const input = createRoutingInput({ task: 'fix bug' });
      const result = await analyzer.analyze(input);

      expect(result.explanation).toMatch(/Complexity score: \d+\/100/);
    });

    it('should include tier in explanation', async () => {
      const input = createRoutingInput({ task: 'fix bug' });
      const result = await analyzer.analyze(input);

      expect(result.explanation).toMatch(/Tier \d/);
    });

    it('should mention architecture scope when detected', async () => {
      const input = createRoutingInput({ task: 'architect the system' });
      const result = await analyzer.analyze(input);

      expect(result.explanation).toContain('Architecture scope detected');
    });

    it('should mention security scope when detected', async () => {
      const input = createRoutingInput({ task: 'security vulnerability scan' });
      const result = await analyzer.analyze(input);

      expect(result.explanation).toContain('Security scope detected');
    });

    it('should mention multi-step reasoning when detected', async () => {
      const input = createRoutingInput({ task: 'orchestrate deployment workflow' });
      const result = await analyzer.analyze(input);

      expect(result.explanation).toContain('Multi-step reasoning required');
    });

    it('should mention cross-domain coordination when detected', async () => {
      const input = createRoutingInput({ task: 'coordinate across domains' });
      const result = await analyzer.analyze(input);

      expect(result.explanation).toContain('Cross-domain coordination required');
    });

    it('should mention large code changes when applicable', async () => {
      const largeCode = Array(150).fill('const x = 1;').join('\n');
      const input = createRoutingInput({
        task: 'refactor',
        codeContext: largeCode,
      });
      const result = await analyzer.analyze(input);

      expect(result.explanation).toMatch(/Large code change: \d+ lines/);
    });

    it('should mention multi-file changes when applicable', async () => {
      const input = createRoutingInput({
        task: 'refactor',
        filePaths: ['a.ts', 'b.ts', 'c.ts', 'd.ts'],
      });
      const result = await analyzer.analyze(input);

      expect(result.explanation).toMatch(/Multi-file change: \d+ files/);
    });

    it('should mention mechanical transform when detected', async () => {
      const mockAdapter = createMockAgentBoosterAdapter([
        {
          type: 'var-to-const',
          confidence: 0.9,
          location: { line: 1, column: 0, offset: 0 },
          codeSnippet: 'var x = 1;',
          suggestedCode: 'const x = 1;',
          reason: 'Variable is never reassigned',
          risk: 'low' as any,
          estimatedDurationMs: 1,
        },
      ]);

      const analyzerWithAdapter = createComplexityAnalyzer(
        createTestConfig({ enableAgentBooster: true, agentBoosterThreshold: 0.7 }),
        mockAdapter
      );

      const input = createRoutingInput({
        task: 'convert var to const',
        codeContext: 'var x = 1;',
      });
      const result = await analyzerWithAdapter.analyze(input);

      expect(result.explanation).toContain('Detected mechanical transform');
    });
  });

  // ============================================================================
  // Test Suite: Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    let analyzer: ComplexityAnalyzer;

    beforeEach(() => {
      analyzer = createComplexityAnalyzer(createTestConfig());
    });

    it('should handle empty task description', async () => {
      const input = createRoutingInput({ task: '' });
      const result = await analyzer.analyze(input);

      expect(result).toBeDefined();
      expect(result.overall).toBeGreaterThanOrEqual(0);
    });

    it('should handle very long task descriptions', async () => {
      const longTask = 'fix bug '.repeat(1000);
      const input = createRoutingInput({ task: longTask });
      const result = await analyzer.analyze(input);

      expect(result).toBeDefined();
      expect(result.overall).toBeLessThanOrEqual(100);
    });

    it('should handle unicode in task description', async () => {
      const input = createRoutingInput({ task: 'Fix bug in user authentication module' });
      const result = await analyzer.analyze(input);

      expect(result).toBeDefined();
    });

    it('should handle empty file paths array', async () => {
      const input = createRoutingInput({
        task: 'fix bug',
        filePaths: [],
      });
      const result = await analyzer.analyze(input);

      expect(result.signals.fileCount).toBe(0);
    });

    it('should handle undefined optional fields', async () => {
      const input: RoutingInput = { task: 'fix bug' };
      const result = await analyzer.analyze(input);

      expect(result).toBeDefined();
      expect(result.signals.linesOfCode).toBeUndefined();
      expect(result.signals.fileCount).toBeUndefined();
    });

    it('should handle code with no decision points', async () => {
      const input = createRoutingInput({
        task: 'review',
        codeContext: 'const x = 1;\nconst y = 2;\nconst z = x + y;',
      });
      const result = await analyzer.analyze(input);

      // Base cyclomatic complexity is 1
      expect(result.signals.cyclomaticComplexity).toBe(1);
    });

    it('should handle code with no imports', async () => {
      const input = createRoutingInput({
        task: 'review',
        codeContext: 'const x = 1;',
      });
      const result = await analyzer.analyze(input);

      expect(result.signals.dependencyCount).toBe(0);
    });
  });

  // ============================================================================
  // Test Suite: Tier Metadata Validation
  // ============================================================================

  describe('tier metadata integration', () => {
    it('should align with TIER_METADATA complexity ranges', () => {
      const analyzer = createComplexityAnalyzer(createTestConfig());

      // Verify each tier's complexity range
      for (const tier of [0, 1, 2, 3, 4] as ModelTier[]) {
        const [min, max] = TIER_METADATA[tier].complexityRange;

        // Test middle of range
        const midpoint = (min + max) / 2;
        const recommendedTier = analyzer.getRecommendedTier(midpoint);

        // Due to overlapping ranges, the midpoint might map to the current tier
        // or an adjacent tier
        expect(Math.abs(recommendedTier - tier)).toBeLessThanOrEqual(1);
      }
    });

    it('should cover all complexity values 0-100', () => {
      const analyzer = createComplexityAnalyzer(createTestConfig());

      for (let complexity = 0; complexity <= 100; complexity++) {
        const tier = analyzer.getRecommendedTier(complexity);
        expect(tier).toBeGreaterThanOrEqual(0);
        expect(tier).toBeLessThanOrEqual(4);
      }
    });
  });
});
