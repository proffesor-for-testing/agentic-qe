/**
 * Unit Tests for QE Hooks
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * Tests lifecycle hooks that capture QE operations and feed patterns
 * into the ReasoningBank for learning.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  QE_HOOK_EVENTS,
  QEHookRegistry,
  createQEHookHandlers,
  createQEHookRegistry,
  setupQEHooks,
  type QEHookContext,
  type QEHookHandler,
  type QEHookResult,
} from '../../../src/learning/qe-hooks.js';
import type { QEReasoningBank } from '../../../src/learning/qe-reasoning-bank.js';
import type { EventBus } from '../../../src/kernel/interfaces.js';
import { ok, err } from '../../../src/shared/types/index.js';

// ============================================================================
// Mock Factory
// ============================================================================

function createMockReasoningBank(): QEReasoningBank {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    storePattern: vi.fn().mockResolvedValue(ok({ id: 'pattern-123' })),
    routeTask: vi.fn().mockResolvedValue(
      ok({
        recommendedAgent: 'qe-test-architect',
        confidence: 0.85,
        patterns: [{ id: 'p1', name: 'test-pattern' }],
        guidance: ['Use AAA pattern', 'Mock external deps'],
        estimatedComplexity: 2,
      })
    ),
    recordOutcome: vi.fn().mockResolvedValue(ok(undefined)),
    getStats: vi.fn().mockResolvedValue({
      patterns: { total: 10, shortTerm: 5, longTerm: 5 },
      routing: { total: 50, successful: 45 },
    }),
    searchPatterns: vi.fn().mockResolvedValue(ok([])),
    getPattern: vi.fn().mockResolvedValue(null),
    getGuidance: vi.fn().mockReturnValue({
      domain: 'test-generation',
      bestPractices: ['AAA pattern'],
      antiPatterns: [],
      frameworkGuidance: {},
      languageGuidance: {},
      examples: [],
    }),
    generateContext: vi.fn().mockReturnValue('## QE Guidance'),
    checkAntiPatterns: vi.fn().mockReturnValue([]),
  } as unknown as QEReasoningBank;
}

function createMockEventBus(): EventBus {
  const subscribers = new Map<string, Array<(payload: unknown) => void>>();

  return {
    publish: vi.fn((event) => {
      const handlers = subscribers.get(event.type) || [];
      handlers.forEach((h) => h(event));
    }),
    subscribe: vi.fn((type: string, handler: (payload: unknown) => void) => {
      if (!subscribers.has(type)) {
        subscribers.set(type, []);
      }
      subscribers.get(type)!.push(handler);
      return () => {
        const handlers = subscribers.get(type);
        if (handlers) {
          const idx = handlers.indexOf(handler);
          if (idx >= 0) handlers.splice(idx, 1);
        }
      };
    }),
    unsubscribe: vi.fn(),
    emit: vi.fn(),
  } as unknown as EventBus;
}

// ============================================================================
// Tests
// ============================================================================

describe('QE Hooks', () => {
  describe('QE_HOOK_EVENTS Constants', () => {
    it('should define all test lifecycle events', () => {
      expect(QE_HOOK_EVENTS.PreTestGeneration).toBe('qe:pre-test-generation');
      expect(QE_HOOK_EVENTS.PostTestGeneration).toBe('qe:post-test-generation');
      expect(QE_HOOK_EVENTS.TestExecutionResult).toBe('qe:test-execution-result');
    });

    it('should define all coverage lifecycle events', () => {
      expect(QE_HOOK_EVENTS.PreCoverageAnalysis).toBe('qe:pre-coverage-analysis');
      expect(QE_HOOK_EVENTS.PostCoverageAnalysis).toBe('qe:post-coverage-analysis');
      expect(QE_HOOK_EVENTS.CoverageGapIdentified).toBe('qe:coverage-gap-identified');
    });

    it('should define agent routing events', () => {
      expect(QE_HOOK_EVENTS.QEAgentRouting).toBe('qe:agent-routing');
      expect(QE_HOOK_EVENTS.QEAgentCompletion).toBe('qe:agent-completion');
    });

    it('should define quality metrics events', () => {
      expect(QE_HOOK_EVENTS.QualityScoreCalculated).toBe('qe:quality-score');
      expect(QE_HOOK_EVENTS.RiskAssessmentComplete).toBe('qe:risk-assessment');
    });

    it('should define pattern learning events', () => {
      expect(QE_HOOK_EVENTS.PatternLearned).toBe('qe:pattern-learned');
      expect(QE_HOOK_EVENTS.PatternApplied).toBe('qe:pattern-applied');
      expect(QE_HOOK_EVENTS.PatternPromoted).toBe('qe:pattern-promoted');
    });
  });

  describe('QEHookRegistry', () => {
    let registry: QEHookRegistry;
    let mockReasoningBank: QEReasoningBank;

    beforeEach(() => {
      mockReasoningBank = createMockReasoningBank();
      registry = createQEHookRegistry();
    });

    afterEach(() => {
      vi.clearAllMocks();
      registry.clear();
    });

    describe('Initialization', () => {
      it('should create empty registry', () => {
        expect(registry.getRegisteredEvents()).toHaveLength(0);
      });

      it('should initialize with ReasoningBank', () => {
        registry.initialize(mockReasoningBank);

        // Should have all default handlers registered
        const events = registry.getRegisteredEvents();
        expect(events.length).toBeGreaterThan(0);
        expect(events).toContain(QE_HOOK_EVENTS.PreTestGeneration);
      });

      it('should register all default handlers on initialization', () => {
        registry.initialize(mockReasoningBank);

        const events = registry.getRegisteredEvents();
        const allEvents = Object.values(QE_HOOK_EVENTS);

        for (const event of allEvents) {
          expect(events).toContain(event);
        }
      });
    });

    describe('Handler Registration', () => {
      it('should register a custom handler', async () => {
        const customHandler: QEHookHandler = vi.fn().mockResolvedValue({
          success: true,
          data: { custom: 'data' },
        });

        registry.register(QE_HOOK_EVENTS.PreTestGeneration, customHandler);

        expect(registry.getRegisteredEvents()).toContain(
          QE_HOOK_EVENTS.PreTestGeneration
        );
      });

      it('should allow multiple handlers for same event', async () => {
        const handler1: QEHookHandler = vi.fn().mockResolvedValue({ success: true });
        const handler2: QEHookHandler = vi.fn().mockResolvedValue({ success: true });

        registry.register(QE_HOOK_EVENTS.PatternLearned, handler1);
        registry.register(QE_HOOK_EVENTS.PatternLearned, handler2);

        const results = await registry.emit(QE_HOOK_EVENTS.PatternLearned, {
          patternId: 'p1',
        });

        expect(results).toHaveLength(2);
        expect(handler1).toHaveBeenCalled();
        expect(handler2).toHaveBeenCalled();
      });

      it('should unregister a handler', async () => {
        const handler: QEHookHandler = vi.fn().mockResolvedValue({ success: true });

        registry.register(QE_HOOK_EVENTS.PatternApplied, handler);
        registry.unregister(QE_HOOK_EVENTS.PatternApplied, handler);

        const results = await registry.emit(QE_HOOK_EVENTS.PatternApplied, {
          patternId: 'p1',
        });

        expect(results).toHaveLength(0);
        expect(handler).not.toHaveBeenCalled();
      });
    });

    describe('Event Emission', () => {
      it('should emit events and return results', async () => {
        const handler: QEHookHandler = vi.fn().mockResolvedValue({
          success: true,
          patternsLearned: 1,
        });

        registry.register(QE_HOOK_EVENTS.PostTestGeneration, handler);

        const results = await registry.emit(QE_HOOK_EVENTS.PostTestGeneration, {
          targetFile: 'test.ts',
          success: true,
        });

        expect(results).toHaveLength(1);
        expect(results[0].success).toBe(true);
        expect(results[0].patternsLearned).toBe(1);
      });

      it('should pass context to handlers', async () => {
        const handler: QEHookHandler = vi.fn().mockResolvedValue({ success: true });

        registry.register(QE_HOOK_EVENTS.QualityScoreCalculated, handler);

        await registry.emit(QE_HOOK_EVENTS.QualityScoreCalculated, {
          score: 0.85,
          threshold: 0.8,
        });

        expect(handler).toHaveBeenCalledWith(
          expect.objectContaining({
            eventId: expect.stringContaining('qe:quality-score'),
            timestamp: expect.any(Date),
            data: expect.objectContaining({ score: 0.85, threshold: 0.8 }),
          })
        );
      });

      it('should chain data between handlers', async () => {
        const handler1: QEHookHandler = vi.fn().mockResolvedValue({
          success: true,
          data: { step1: 'completed' },
        });
        const handler2: QEHookHandler = vi.fn().mockResolvedValue({
          success: true,
          data: { step2: 'completed' },
        });

        registry.register(QE_HOOK_EVENTS.CoverageGapIdentified, handler1);
        registry.register(QE_HOOK_EVENTS.CoverageGapIdentified, handler2);

        await registry.emit(QE_HOOK_EVENTS.CoverageGapIdentified, {
          file: 'app.ts',
        });

        // Second handler should receive chained data from first
        const secondCall = (handler2 as any).mock.calls[0][0];
        expect(secondCall.data).toMatchObject({
          file: 'app.ts',
          step1: 'completed',
        });
      });

      it('should handle handler errors gracefully', async () => {
        const failingHandler: QEHookHandler = vi
          .fn()
          .mockRejectedValue(new Error('Handler failed'));
        const successHandler: QEHookHandler = vi.fn().mockResolvedValue({
          success: true,
        });

        registry.register(QE_HOOK_EVENTS.RiskAssessmentComplete, failingHandler);
        registry.register(QE_HOOK_EVENTS.RiskAssessmentComplete, successHandler);

        const results = await registry.emit(QE_HOOK_EVENTS.RiskAssessmentComplete, {
          riskScore: 0.7,
        });

        expect(results).toHaveLength(2);
        expect(results[0].success).toBe(false);
        expect(results[0].error).toBe('Handler failed');
        expect(results[1].success).toBe(true);
      });

      it('should return empty array for unregistered events', async () => {
        const results = await registry.emit(QE_HOOK_EVENTS.PatternPromoted, {
          patternId: 'p1',
        });

        expect(results).toHaveLength(0);
      });
    });

    describe('Clear', () => {
      it('should clear all handlers', async () => {
        registry.initialize(mockReasoningBank);

        expect(registry.getRegisteredEvents().length).toBeGreaterThan(0);

        registry.clear();

        expect(registry.getRegisteredEvents()).toHaveLength(0);
      });
    });
  });

  describe('createQEHookHandlers', () => {
    let mockReasoningBank: QEReasoningBank;

    beforeEach(() => {
      mockReasoningBank = createMockReasoningBank();
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should create handlers for all hook events', () => {
      const handlers = createQEHookHandlers(mockReasoningBank);

      const allEvents = Object.values(QE_HOOK_EVENTS);
      for (const event of allEvents) {
        expect(handlers[event]).toBeDefined();
        expect(typeof handlers[event]).toBe('function');
      }
    });

    describe('PreTestGeneration Handler', () => {
      it('should route task and return guidance', async () => {
        const handlers = createQEHookHandlers(mockReasoningBank);

        const ctx: QEHookContext = {
          eventId: 'test-1',
          timestamp: new Date(),
          data: {
            targetFile: 'user-service.ts',
            testType: 'unit',
            framework: 'vitest',
            language: 'typescript',
          },
        };

        const result = await handlers[QE_HOOK_EVENTS.PreTestGeneration](ctx);

        expect(result.success).toBe(true);
        expect(result.routing).toBeDefined();
        expect(result.routing!.recommendedAgent).toBe('qe-test-architect');
        expect(result.guidance).toEqual(['Use AAA pattern', 'Mock external deps']);
        expect(mockReasoningBank.routeTask).toHaveBeenCalled();
      });

      it('should handle routing failure', async () => {
        (mockReasoningBank.routeTask as any).mockResolvedValue(
          err(new Error('Routing failed'))
        );

        const handlers = createQEHookHandlers(mockReasoningBank);

        const result = await handlers[QE_HOOK_EVENTS.PreTestGeneration]({
          eventId: 'test-1',
          timestamp: new Date(),
          data: { targetFile: 'test.ts' },
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Routing failed');
      });
    });

    describe('PostTestGeneration Handler', () => {
      it('should learn pattern from successful generation', async () => {
        const handlers = createQEHookHandlers(mockReasoningBank);

        const result = await handlers[QE_HOOK_EVENTS.PostTestGeneration]({
          eventId: 'test-1',
          timestamp: new Date(),
          data: {
            targetFile: 'user-service.ts',
            generatedTests: 'describe("UserService", () => { ... })',
            testCount: 5,
            framework: 'vitest',
            language: 'typescript',
            success: true,
          },
        });

        expect(result.success).toBe(true);
        expect(result.patternsLearned).toBe(1);
        expect(mockReasoningBank.storePattern).toHaveBeenCalled();
      });

      it('should record outcome if patternId provided', async () => {
        const handlers = createQEHookHandlers(mockReasoningBank);

        await handlers[QE_HOOK_EVENTS.PostTestGeneration]({
          eventId: 'test-1',
          timestamp: new Date(),
          data: {
            patternId: 'pattern-used-123',
            success: true,
            testCount: 3,
          },
        });

        expect(mockReasoningBank.recordOutcome).toHaveBeenCalledWith({
          patternId: 'pattern-used-123',
          success: true,
          metrics: { testsPassed: 0, testsFailed: 0 },
        });
      });

      it('should not learn pattern from failed generation', async () => {
        const handlers = createQEHookHandlers(mockReasoningBank);

        const result = await handlers[QE_HOOK_EVENTS.PostTestGeneration]({
          eventId: 'test-1',
          timestamp: new Date(),
          data: {
            targetFile: 'test.ts',
            success: false,
            testCount: 0,
          },
        });

        expect(result.success).toBe(true);
        expect(result.patternsLearned).toBe(0);
        expect(mockReasoningBank.storePattern).not.toHaveBeenCalled();
      });
    });

    describe('TestExecutionResult Handler', () => {
      it('should record pattern outcome with pass rate', async () => {
        const handlers = createQEHookHandlers(mockReasoningBank);

        const result = await handlers[QE_HOOK_EVENTS.TestExecutionResult]({
          eventId: 'run-1',
          timestamp: new Date(),
          data: {
            runId: 'run-123',
            patternId: 'pattern-456',
            passed: 18,
            failed: 2,
            duration: 5000,
            flaky: false,
          },
        });

        expect(result.success).toBe(true);
        expect(result.data?.successRate).toBe(0.9);
        expect(mockReasoningBank.recordOutcome).toHaveBeenCalledWith({
          patternId: 'pattern-456',
          success: true, // 90% pass rate > 80% threshold
          metrics: {
            testsPassed: 18,
            testsFailed: 2,
            executionTimeMs: 5000,
          },
        });
      });

      it('should mark as failed if flaky tests detected', async () => {
        const handlers = createQEHookHandlers(mockReasoningBank);

        await handlers[QE_HOOK_EVENTS.TestExecutionResult]({
          eventId: 'run-1',
          timestamp: new Date(),
          data: {
            patternId: 'pattern-789',
            passed: 19,
            failed: 1,
            flaky: true,
          },
        });

        expect(mockReasoningBank.recordOutcome).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false, // Flaky means unreliable
          })
        );
      });
    });

    describe('Coverage Analysis Handlers', () => {
      it('should route pre-coverage analysis', async () => {
        const handlers = createQEHookHandlers(mockReasoningBank);

        const result = await handlers[QE_HOOK_EVENTS.PreCoverageAnalysis]({
          eventId: 'cov-1',
          timestamp: new Date(),
          data: {
            targetPath: 'src/services/',
            currentCoverage: 65,
          },
        });

        expect(result.success).toBe(true);
        expect(result.routing).toBeDefined();
        expect(mockReasoningBank.routeTask).toHaveBeenCalledWith(
          expect.objectContaining({
            taskType: 'analysis',
            domain: 'coverage-analysis',
          })
        );
      });

      it('should learn strategy from significant coverage improvement', async () => {
        const handlers = createQEHookHandlers(mockReasoningBank);

        const result = await handlers[QE_HOOK_EVENTS.PostCoverageAnalysis]({
          eventId: 'cov-2',
          timestamp: new Date(),
          data: {
            targetPath: 'src/services/',
            previousCoverage: 65,
            newCoverage: 78, // 13% improvement
            strategy: 'Focus on untested edge cases',
            gapsFound: 5,
          },
        });

        expect(result.success).toBe(true);
        expect(result.patternsLearned).toBe(1); // Improvement > 5%
        expect(result.data?.improvement).toBe(13);
        expect(mockReasoningBank.storePattern).toHaveBeenCalled();
      });

      it('should store high-risk coverage gaps', async () => {
        const handlers = createQEHookHandlers(mockReasoningBank);

        await handlers[QE_HOOK_EVENTS.CoverageGapIdentified]({
          eventId: 'gap-1',
          timestamp: new Date(),
          data: {
            file: 'src/auth/login.ts',
            lines: [45, 46, 47, 50, 51],
            branches: [{ line: 48, covered: false }],
            riskScore: 0.85, // High risk
            suggestedTests: 'Add tests for authentication edge cases',
          },
        });

        expect(mockReasoningBank.storePattern).toHaveBeenCalledWith(
          expect.objectContaining({
            patternType: 'coverage-strategy',
            context: expect.objectContaining({
              tags: expect.arrayContaining(['coverage-gap', 'high-risk']),
            }),
          })
        );
      });
    });

    describe('Agent Routing Handlers', () => {
      it('should route QE agent selection', async () => {
        const handlers = createQEHookHandlers(mockReasoningBank);

        const result = await handlers[QE_HOOK_EVENTS.QEAgentRouting]({
          eventId: 'route-1',
          timestamp: new Date(),
          data: {
            task: 'Generate integration tests for payment service',
            taskType: 'test-generation',
            capabilities: ['integration-testing', 'api-mocking'],
            context: { framework: 'vitest', language: 'typescript' },
          },
        });

        expect(result.success).toBe(true);
        expect(result.routing).toBeDefined();
        expect(result.data?.agent).toBe('qe-test-architect');
        expect(result.data?.confidence).toBe(0.85);
      });

      it('should record agent completion outcome', async () => {
        const handlers = createQEHookHandlers(mockReasoningBank);

        await handlers[QE_HOOK_EVENTS.QEAgentCompletion]({
          eventId: 'complete-1',
          timestamp: new Date(),
          data: {
            agentType: 'qe-test-architect',
            task: 'Generate unit tests',
            success: true,
            duration: 12000,
            patternId: 'pattern-agent-1',
            feedback: 'Tests cover all edge cases',
          },
        });

        expect(mockReasoningBank.recordOutcome).toHaveBeenCalledWith({
          patternId: 'pattern-agent-1',
          success: true,
          metrics: { executionTimeMs: 12000 },
          feedback: 'Tests cover all edge cases',
        });
      });
    });

    describe('Quality Metrics Handlers', () => {
      it('should generate guidance for low coverage', async () => {
        const handlers = createQEHookHandlers(mockReasoningBank);

        const result = await handlers[QE_HOOK_EVENTS.QualityScoreCalculated]({
          eventId: 'quality-1',
          timestamp: new Date(),
          data: {
            score: 0.65,
            threshold: 0.8,
            passed: false,
            coverageScore: 0.55, // Below 0.8
            testQualityScore: 0.75,
          },
        });

        expect(result.success).toBe(true);
        expect(result.guidance).toContain(
          'Coverage is below target. Focus on critical paths.'
        );
      });

      it('should store high-risk assessment patterns', async () => {
        const handlers = createQEHookHandlers(mockReasoningBank);

        await handlers[QE_HOOK_EVENTS.RiskAssessmentComplete]({
          eventId: 'risk-1',
          timestamp: new Date(),
          data: {
            file: 'src/payment/processor.ts',
            riskScore: 0.85, // High risk > 0.7
            riskFactors: [
              'High complexity',
              'Low test coverage',
              'Many dependencies',
            ],
          },
        });

        expect(mockReasoningBank.storePattern).toHaveBeenCalledWith(
          expect.objectContaining({
            patternType: 'coverage-strategy',
            context: expect.objectContaining({
              tags: expect.arrayContaining(['risk', 'high-priority']),
            }),
          })
        );
      });
    });

    describe('Pattern Learning Handlers', () => {
      it('should acknowledge pattern learned', async () => {
        const handlers = createQEHookHandlers(mockReasoningBank);

        const result = await handlers[QE_HOOK_EVENTS.PatternLearned]({
          eventId: 'learn-1',
          timestamp: new Date(),
          data: {
            patternId: 'new-pattern-123',
            patternType: 'test-template',
            domain: 'test-generation',
            confidence: 0.75,
          },
        });

        expect(result.success).toBe(true);
        expect(result.patternsLearned).toBe(1);
        expect(result.data?.patternId).toBe('new-pattern-123');
      });

      it('should record pattern application outcome', async () => {
        const handlers = createQEHookHandlers(mockReasoningBank);

        await handlers[QE_HOOK_EVENTS.PatternApplied]({
          eventId: 'apply-1',
          timestamp: new Date(),
          data: {
            patternId: 'pattern-to-apply',
            success: true,
          },
        });

        expect(mockReasoningBank.recordOutcome).toHaveBeenCalledWith({
          patternId: 'pattern-to-apply',
          success: true,
        });
      });

      it('should acknowledge pattern promotion', async () => {
        const handlers = createQEHookHandlers(mockReasoningBank);

        const result = await handlers[QE_HOOK_EVENTS.PatternPromoted]({
          eventId: 'promo-1',
          timestamp: new Date(),
          data: {
            patternId: 'promoted-pattern',
            newTier: 'long-term',
            successfulUses: 10,
          },
        });

        expect(result.success).toBe(true);
        expect(result.data?.patternId).toBe('promoted-pattern');
        expect(result.data?.newTier).toBe('long-term');
      });
    });
  });

  describe('setupQEHooks', () => {
    it('should create and initialize registry with ReasoningBank', () => {
      const mockReasoningBank = createMockReasoningBank();

      const registry = setupQEHooks(mockReasoningBank);

      expect(registry.getRegisteredEvents().length).toBeGreaterThan(0);
      expect(registry.getRegisteredEvents()).toContain(
        QE_HOOK_EVENTS.PreTestGeneration
      );
    });

    it('should integrate with EventBus when provided', () => {
      const mockReasoningBank = createMockReasoningBank();
      const mockEventBus = createMockEventBus();

      const registry = setupQEHooks(mockReasoningBank, mockEventBus);

      // Should subscribe to all QE events
      expect(mockEventBus.subscribe).toHaveBeenCalled();

      const allEvents = Object.values(QE_HOOK_EVENTS);
      expect((mockEventBus.subscribe as any).mock.calls.length).toBe(
        allEvents.length
      );
    });
  });
});
