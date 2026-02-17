/**
 * Agentic QE v3 - QE Hooks for Pattern Learning
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * Hook handlers that capture QE operations and feed patterns
 * into the ReasoningBank for learning.
 */

import type { EventBus } from '../kernel/interfaces.js';
import type { DomainName, Result } from '../shared/types/index.js';
import { ok, err } from '../shared/types/index.js';
import {
  QEReasoningBank,
  LearningOutcome,
  QERoutingRequest,
  QERoutingResult,
} from './qe-reasoning-bank.js';
import { toErrorMessage } from '../shared/error-utils.js';
import { LoggerFactory } from '../logging/index.js';

const logger = LoggerFactory.create('qe-hooks');

import {
  QEPatternType,
  QEDomain,
  QEPatternContext,
  CreateQEPatternOptions,
  detectQEDomain,
} from './qe-patterns.js';

// ============================================================================
// QE Hook Event Types
// ============================================================================

/**
 * QE hook event names
 */
export const QE_HOOK_EVENTS = {
  // Test lifecycle
  PreTestGeneration: 'qe:pre-test-generation',
  PostTestGeneration: 'qe:post-test-generation',
  TestExecutionResult: 'qe:test-execution-result',

  // Coverage lifecycle
  PreCoverageAnalysis: 'qe:pre-coverage-analysis',
  PostCoverageAnalysis: 'qe:post-coverage-analysis',
  CoverageGapIdentified: 'qe:coverage-gap-identified',

  // Agent routing
  QEAgentRouting: 'qe:agent-routing',
  QEAgentCompletion: 'qe:agent-completion',

  // Quality metrics
  QualityScoreCalculated: 'qe:quality-score',
  RiskAssessmentComplete: 'qe:risk-assessment',

  // Pattern learning
  PatternLearned: 'qe:pattern-learned',
  PatternApplied: 'qe:pattern-applied',
  PatternPromoted: 'qe:pattern-promoted',
} as const;

export type QEHookEvent = (typeof QE_HOOK_EVENTS)[keyof typeof QE_HOOK_EVENTS];

// ============================================================================
// Hook Context and Result Types
// ============================================================================

/**
 * Context passed to hook handlers
 */
export interface QEHookContext {
  /** Unique event ID */
  eventId: string;

  /** Timestamp of the event */
  timestamp: Date;

  /** Event-specific data */
  data: Record<string, unknown>;

  /** Source domain */
  sourceDomain?: DomainName;

  /** Source agent ID */
  sourceAgentId?: string;
}

/**
 * Result from hook handler
 */
export interface QEHookResult {
  /** Whether the hook succeeded */
  success: boolean;

  /** Error message if failed */
  error?: string;

  /** Data to pass to next handler */
  data?: Record<string, unknown>;

  /** Patterns learned from this event */
  patternsLearned?: number;

  /** Routing recommendation if applicable */
  routing?: QERoutingResult;

  /** Guidance generated */
  guidance?: string[];
}

/**
 * Hook handler function type
 */
export type QEHookHandler = (ctx: QEHookContext) => Promise<QEHookResult>;

// ============================================================================
// QE Hook Handlers
// ============================================================================

/**
 * Create QE hook handlers bound to a ReasoningBank
 */
export function createQEHookHandlers(
  reasoningBank: QEReasoningBank
): Record<QEHookEvent, QEHookHandler> {
  return {
    // ========================================================================
    // Test Generation Hooks
    // ========================================================================

    [QE_HOOK_EVENTS.PreTestGeneration]: async (ctx) => {
      const { targetFile, testType, framework, language } = ctx.data;

      // Route to optimal agent
      const routingResult = await reasoningBank.routeTask({
        task: `Generate ${testType} tests for ${targetFile}`,
        taskType: 'test-generation',
        context: {
          framework,
          language,
          testType,
        } as Partial<QEPatternContext>,
      });

      if (!routingResult.success) {
        return {
          success: false,
          error: routingResult.error.message,
        };
      }

      return {
        success: true,
        routing: routingResult.value,
        guidance: routingResult.value.guidance,
        data: {
          recommendedAgent: routingResult.value.recommendedAgent,
          patterns: routingResult.value.patterns.map((p) => p.id),
        },
      };
    },

    [QE_HOOK_EVENTS.PostTestGeneration]: async (ctx) => {
      const {
        targetFile,
        generatedTests,
        testCount,
        framework,
        language,
        success,
        patternId,
      } = ctx.data;

      let patternsLearned = 0;

      // Record outcome if pattern was used
      if (patternId) {
        await reasoningBank.recordOutcome({
          patternId: patternId as string,
          success: success as boolean,
          metrics: {
            testsPassed: 0,
            testsFailed: 0,
          },
        });
      }

      // Learn new pattern from successful generation
      if (success && generatedTests && (testCount as number) > 0) {
        try {
          const result = await reasoningBank.storePattern({
            patternType: 'test-template',
            name: `Generated tests for ${(targetFile as string).split('/').pop()}`,
            description: `Test template extracted from successful test generation for ${targetFile}`,
            template: {
              type: 'code',
              content: generatedTests as string,
              variables: [],
            },
            context: {
              framework,
              language,
              testType: 'unit',
              tags: ['generated', 'test-template', framework as string, language as string],
            } as Partial<QEPatternContext>,
          });

          if (result.success) {
            patternsLearned = 1;
          }
        } catch (e) {
          // Pattern learning is best-effort
          logger.debug('Pattern learning failed', { error: e instanceof Error ? e.message : String(e) });
        }
      }

      return {
        success: true,
        patternsLearned,
        data: { learned: patternsLearned > 0 },
      };
    },

    [QE_HOOK_EVENTS.TestExecutionResult]: async (ctx) => {
      const { runId, patternId, passed, failed, duration, flaky } = ctx.data;

      // Record pattern outcome
      if (patternId) {
        const passRate = ((passed as number) + (failed as number)) > 0
          ? (passed as number) / ((passed as number) + (failed as number))
          : 0;

        await reasoningBank.recordOutcome({
          patternId: patternId as string,
          success: passRate > 0.8 && !(flaky as boolean),
          metrics: {
            testsPassed: passed as number,
            testsFailed: failed as number,
            executionTimeMs: duration as number,
          },
        });
      }

      return {
        success: true,
        data: {
          runId,
          successRate: ((passed as number) + (failed as number)) > 0
            ? (passed as number) / ((passed as number) + (failed as number))
            : 0,
        },
      };
    },

    // ========================================================================
    // Coverage Analysis Hooks
    // ========================================================================

    [QE_HOOK_EVENTS.PreCoverageAnalysis]: async (ctx) => {
      const { targetPath, currentCoverage } = ctx.data;

      const routingResult = await reasoningBank.routeTask({
        task: `Analyze coverage gaps for ${targetPath} (current: ${currentCoverage}%)`,
        taskType: 'analysis',
        domain: 'coverage-analysis',
      });

      if (!routingResult.success) {
        return { success: false, error: routingResult.error.message };
      }

      return {
        success: true,
        routing: routingResult.value,
        guidance: routingResult.value.guidance,
      };
    },

    [QE_HOOK_EVENTS.PostCoverageAnalysis]: async (ctx) => {
      const {
        targetPath,
        previousCoverage,
        newCoverage,
        gapsFound,
        strategy,
        patternId,
      } = ctx.data;

      const improvement = (newCoverage as number) - (previousCoverage as number);
      const success = improvement > 0;

      // Record pattern outcome
      if (patternId) {
        await reasoningBank.recordOutcome({
          patternId: patternId as string,
          success,
          metrics: {
            coverageImprovement: improvement,
          },
        });
      }

      // Learn successful coverage strategy
      let patternsLearned = 0;
      if (success && strategy && improvement > 5) {
        try {
          const result = await reasoningBank.storePattern({
            patternType: 'coverage-strategy',
            name: `Coverage strategy for ${(targetPath as string).split('/').pop()}`,
            description: `Strategy that improved coverage by ${improvement.toFixed(1)}%`,
            template: {
              type: 'prompt',
              content: strategy as string,
              variables: [],
            },
            context: {
              tags: ['coverage', 'strategy', 'successful'],
            },
          });

          if (result.success) {
            patternsLearned = 1;
          }
        } catch (e) {
          // Best effort
          logger.debug('Coverage strategy pattern storage failed', { error: e instanceof Error ? e.message : String(e) });
        }
      }

      return {
        success: true,
        patternsLearned,
        data: { improvement, gapsFound },
      };
    },

    [QE_HOOK_EVENTS.CoverageGapIdentified]: async (ctx) => {
      const { file, lines, branches, riskScore, suggestedTests } = ctx.data;

      // Store gap analysis as pattern for similar future gaps
      if (suggestedTests && (riskScore as number) > 0.5) {
        try {
          await reasoningBank.storePattern({
            patternType: 'coverage-strategy',
            name: `Coverage gap: ${(file as string).split('/').pop()}`,
            description: `Coverage gap pattern with ${(lines as number[])?.length || 0} uncovered lines, risk ${riskScore}`,
            template: {
              type: 'prompt',
              content: `Suggested tests for coverage gap:\n${suggestedTests}`,
              variables: [],
            },
            context: {
              tags: ['coverage-gap', 'high-risk', 'suggested-tests'],
            },
          });
        } catch (e) {
          // Best effort
          logger.debug('Coverage gap pattern storage failed', { error: e instanceof Error ? e.message : String(e) });
        }
      }

      return {
        success: true,
        data: { file, riskScore },
      };
    },

    // ========================================================================
    // Agent Routing Hooks
    // ========================================================================

    [QE_HOOK_EVENTS.QEAgentRouting]: async (ctx) => {
      const { task, taskType, capabilities, context } = ctx.data;

      const routingResult = await reasoningBank.routeTask({
        task: task as string,
        taskType: taskType as QERoutingRequest['taskType'],
        capabilities: capabilities as string[],
        context: context as Partial<QEPatternContext>,
      });

      if (!routingResult.success) {
        return { success: false, error: routingResult.error.message };
      }

      return {
        success: true,
        routing: routingResult.value,
        guidance: routingResult.value.guidance,
        data: {
          agent: routingResult.value.recommendedAgent,
          confidence: routingResult.value.confidence,
        },
      };
    },

    [QE_HOOK_EVENTS.QEAgentCompletion]: async (ctx) => {
      const { agentType, task, success, duration, patternId, feedback } = ctx.data;

      // Record outcome for routing improvement
      if (patternId) {
        await reasoningBank.recordOutcome({
          patternId: patternId as string,
          success: success as boolean,
          metrics: {
            executionTimeMs: duration as number,
          },
          feedback: feedback as string,
        });
      }

      return {
        success: true,
        data: { agentType, success, duration },
      };
    },

    // ========================================================================
    // Quality Metrics Hooks
    // ========================================================================

    [QE_HOOK_EVENTS.QualityScoreCalculated]: async (ctx) => {
      const { score, components, threshold, passed } = ctx.data;

      // Generate guidance based on score components
      const guidance: string[] = [];

      if (ctx.data.coverageScore && (ctx.data.coverageScore as number) < 0.8) {
        guidance.push('Coverage is below target. Focus on critical paths.');
      }

      if (ctx.data.testQualityScore && (ctx.data.testQualityScore as number) < 0.7) {
        guidance.push('Test quality needs improvement. Review test assertions.');
      }

      return {
        success: true,
        guidance,
        data: { score, passed },
      };
    },

    [QE_HOOK_EVENTS.RiskAssessmentComplete]: async (ctx) => {
      const { file, riskScore, riskFactors } = ctx.data;

      // Store high-risk patterns for future reference
      if ((riskScore as number) > 0.7 && riskFactors) {
        try {
          await reasoningBank.storePattern({
            patternType: 'coverage-strategy',
            name: `High risk: ${(file as string).split('/').pop()}`,
            description: `Risk factors: ${(riskFactors as string[]).join(', ')}`,
            template: {
              type: 'prompt',
              content: `Risk assessment for ${file}:\nScore: ${riskScore}\nFactors: ${(riskFactors as string[]).join('\n- ')}`,
              variables: [],
            },
            context: {
              tags: ['risk', 'high-priority', 'assessment'],
            },
          });
        } catch (e) {
          // Best effort
          logger.debug('Risk assessment pattern storage failed', { error: e instanceof Error ? e.message : String(e) });
        }
      }

      return {
        success: true,
        data: { file, riskScore },
      };
    },

    // ========================================================================
    // Pattern Learning Hooks
    // ========================================================================

    [QE_HOOK_EVENTS.PatternLearned]: async (ctx) => {
      const { patternId, patternType, domain, confidence } = ctx.data;

      // Emit event for dashboard/monitoring
      console.log(
        `[QEHooks] Pattern learned: ${patternId} (${patternType}, ${domain}, confidence: ${confidence})`
      );

      return {
        success: true,
        patternsLearned: 1,
        data: { patternId },
      };
    },

    [QE_HOOK_EVENTS.PatternApplied]: async (ctx) => {
      const { patternId, success } = ctx.data;

      // Record the application outcome
      await reasoningBank.recordOutcome({
        patternId: patternId as string,
        success: success as boolean,
      });

      return {
        success: true,
        data: { patternId, success },
      };
    },

    [QE_HOOK_EVENTS.PatternPromoted]: async (ctx) => {
      const { patternId, newTier, successfulUses } = ctx.data;

      console.log(
        `[QEHooks] Pattern promoted: ${patternId} -> ${newTier} (${successfulUses} successful uses)`
      );

      return {
        success: true,
        data: { patternId, newTier },
      };
    },
  };
}

// ============================================================================
// Hook Registry
// ============================================================================

/**
 * QE Hook registry for managing and executing hooks
 */
export class QEHookRegistry {
  private handlers: Map<QEHookEvent, QEHookHandler[]> = new Map();
  private reasoningBank?: QEReasoningBank;

  constructor(private readonly eventBus?: EventBus) {}

  /**
   * Initialize with a ReasoningBank
   */
  initialize(reasoningBank: QEReasoningBank): void {
    this.reasoningBank = reasoningBank;

    // Register default handlers
    const defaultHandlers = createQEHookHandlers(reasoningBank);
    for (const [event, handler] of Object.entries(defaultHandlers)) {
      this.register(event as QEHookEvent, handler);
    }

    // Subscribe to EventBus if available
    if (this.eventBus) {
      for (const event of Object.values(QE_HOOK_EVENTS)) {
        this.eventBus.subscribe(event, async (payload) => {
          await this.emit(event, payload.payload as QEHookContext['data']);
        });
      }
    }
  }

  /**
   * Register a hook handler
   */
  register(event: QEHookEvent, handler: QEHookHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }

  /**
   * Unregister a hook handler
   */
  unregister(event: QEHookEvent, handler: QEHookHandler): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Emit a hook event
   */
  async emit(
    event: QEHookEvent,
    data: Record<string, unknown>
  ): Promise<QEHookResult[]> {
    const handlers = this.handlers.get(event) || [];
    const results: QEHookResult[] = [];

    const ctx: QEHookContext = {
      eventId: `${event}-${Date.now()}`,
      timestamp: new Date(),
      data,
    };

    for (const handler of handlers) {
      try {
        const result = await handler(ctx);
        results.push(result);

        // Chain data to next handler
        if (result.data) {
          Object.assign(ctx.data, result.data);
        }
      } catch (error) {
        results.push({
          success: false,
          error: toErrorMessage(error),
        });
      }
    }

    return results;
  }

  /**
   * Get all registered events
   */
  getRegisteredEvents(): QEHookEvent[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Clear all handlers
   */
  clear(): void {
    this.handlers.clear();
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a QE hook registry
 */
export function createQEHookRegistry(eventBus?: EventBus): QEHookRegistry {
  return new QEHookRegistry(eventBus);
}

/**
 * Create and initialize a QE hook registry with a ReasoningBank
 */
export function setupQEHooks(
  reasoningBank: QEReasoningBank,
  eventBus?: EventBus
): QEHookRegistry {
  const registry = new QEHookRegistry(eventBus);
  registry.initialize(reasoningBank);
  return registry;
}
