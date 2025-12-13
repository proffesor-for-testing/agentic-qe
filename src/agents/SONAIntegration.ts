/**
 * SONA Integration for QE Agents
 *
 * Provides easy-to-use factory functions and utilities for integrating
 * SONA (Self-Organizing Neural Architecture) learning into QE agents.
 *
 * Usage:
 * ```typescript
 * import { createSONAEnabledAgent, withSONALearning } from './agents/SONAIntegration';
 *
 * // Create a new SONA-enabled agent
 * const agent = await createSONAEnabledAgent('test-generator', {
 *   enableSONA: true,
 *   enableFeedbackLoop: true,
 * });
 *
 * // Or enhance an existing agent with SONA
 * const enhancedAgent = withSONALearning(existingAgent);
 * ```
 *
 * @module agents/SONAIntegration
 * @version 1.0.0
 */

import {
  SONALearningStrategy,
  createSONALearningStrategy,
  type SONALearningConfig,
} from '../core/strategies/SONALearningStrategy';
import {
  SONAFeedbackLoop,
  createConnectedFeedbackLoop,
  type FeedbackLoopConfig,
  type FeedbackEvent,
} from '../learning/SONAFeedbackLoop';
import type { AgentLearningStrategy, LearnedPattern } from '../core/strategies';
import { Logger } from '../utils/Logger';
import { loadRuvLLM, isRuvLLMAvailable } from '../utils/ruvllm-loader';

/**
 * SONA integration configuration
 */
export interface SONAIntegrationConfig {
  /** Enable SONA adaptive learning */
  enableSONA?: boolean;
  /** Enable continuous feedback loop */
  enableFeedbackLoop?: boolean;
  /** MicroLoRA rank (1-2 for instant adaptation) */
  microLoraRank?: number;
  /** BaseLoRA rank (4-16 for long-term learning) */
  baseLoraRank?: number;
  /** Consolidation interval (default: 100 tasks) */
  consolidationInterval?: number;
  /** Maximum patterns to store */
  maxPatterns?: number;
  /** Feedback loop configuration */
  feedbackConfig?: FeedbackLoopConfig;
}

/**
 * SONA-enabled agent context
 */
export interface SONAAgentContext {
  /** Learning strategy */
  strategy: SONALearningStrategy;
  /** Feedback loop (if enabled) */
  feedbackLoop?: SONAFeedbackLoop;
  /** Record execution and provide feedback */
  recordExecution: (event: FeedbackEvent) => Promise<void>;
  /** Get learning status */
  getStatus: () => ReturnType<SONALearningStrategy['getStatus']>;
  /** Get metrics - returns SONAMetrics via Promise */
  getMetrics: () => ReturnType<SONALearningStrategy['getMetrics']>;
  /** Train the model - returns TrainingResult via Promise */
  train: (iterations?: number) => ReturnType<SONALearningStrategy['train']>;
  /** Store a pattern */
  storePattern: (pattern: LearnedPattern) => Promise<void>;
  /** Find similar patterns */
  findSimilar: (embedding: number[], limit?: number) => Promise<LearnedPattern[]>;
  /** Clean up resources */
  shutdown: () => Promise<void>;
}

const logger = Logger.getInstance();

/**
 * Create a SONA-enabled agent context
 *
 * This creates all the necessary SONA components and wires them together.
 * The returned context provides a simple API for agents to use SONA.
 */
export async function createSONAContext(
  config: SONAIntegrationConfig = {}
): Promise<SONAAgentContext> {
  const {
    enableSONA = true,
    enableFeedbackLoop = true,
    microLoraRank = 2,
    baseLoraRank = 8,
    consolidationInterval = 100,
    maxPatterns = 10000,
    feedbackConfig = {},
  } = config;

  // Create learning strategy
  const strategyConfig: SONALearningConfig = {
    enableSONA,
    microLoraRank,
    baseLoraRank,
    consolidationInterval,
    maxPatterns,
    enableTrajectories: true,
  };

  const strategy = createSONALearningStrategy(strategyConfig);
  await strategy.initialize();

  // Create feedback loop if enabled
  let feedbackLoop: SONAFeedbackLoop | undefined;
  if (enableFeedbackLoop) {
    feedbackLoop = createConnectedFeedbackLoop(strategy, feedbackConfig);
  }

  logger.info('SONA context created', {
    enableSONA,
    enableFeedbackLoop,
    microLoraRank,
    baseLoraRank,
  });

  return {
    strategy,
    feedbackLoop,

    recordExecution: async (event: FeedbackEvent) => {
      if (feedbackLoop) {
        await feedbackLoop.recordFeedback(event);
      } else {
        await strategy.recordExecution({
          task: event.task,
          success: event.success,
          duration: event.duration,
          result: event.result,
          error: event.error,
        });
      }
    },

    getStatus: () => strategy.getStatus(),

    getMetrics: () => strategy.getMetrics(),

    train: (iterations = 10) => strategy.train(iterations),

    storePattern: (pattern: LearnedPattern) => strategy.storePattern(pattern),

    findSimilar: (embedding: number[], limit = 10) =>
      strategy.findSimilarPatterns(embedding, limit),

    shutdown: async () => {
      if (feedbackLoop) {
        feedbackLoop.reset();
      }
      await strategy.reset();
      logger.info('SONA context shutdown complete');
    },
  };
}

/**
 * Decorator/wrapper to add SONA learning to any agent
 *
 * This can be used to enhance existing agents with SONA capabilities
 * without modifying their implementation.
 */
export function withSONALearning<T extends { id: string; type: string }>(
  agent: T,
  config: SONAIntegrationConfig = {}
): T & { sonaContext: SONAAgentContext | null; initSONA: () => Promise<void> } {
  let sonaContext: SONAAgentContext | null = null;

  const enhanced = {
    ...agent,
    sonaContext: null as SONAAgentContext | null,

    async initSONA(): Promise<void> {
      sonaContext = await createSONAContext(config);
      (this as typeof enhanced).sonaContext = sonaContext;
    },
  };

  return enhanced;
}

/**
 * Check if SONA components are available
 */
export async function isSONAAvailable(): Promise<{
  available: boolean;
  ruvllmAvailable: boolean;
  reason?: string;
}> {
  // Use the centralized loader which handles ESM/CJS issues
  const ruvllmModule = loadRuvLLM();
  const hasRuvLLM = ruvllmModule !== null && !!ruvllmModule.RuvLLM;

  return {
    available: true, // SONA strategy works in fallback mode
    ruvllmAvailable: hasRuvLLM,
    reason: hasRuvLLM ? undefined : 'ruvLLM not available',
  };
}

/**
 * Get recommended SONA configuration based on environment
 */
export async function getRecommendedConfig(): Promise<SONAIntegrationConfig> {
  const availability = await isSONAAvailable();

  if (availability.ruvllmAvailable) {
    return {
      enableSONA: true,
      enableFeedbackLoop: true,
      microLoraRank: 2,
      baseLoraRank: 8,
      consolidationInterval: 100,
      maxPatterns: 10000,
    };
  }

  // Fallback configuration when ruvLLM is not available
  return {
    enableSONA: true, // Still enable for pattern learning
    enableFeedbackLoop: true,
    microLoraRank: 1, // Minimal adaptation
    baseLoraRank: 4,
    consolidationInterval: 50, // More frequent consolidation
    maxPatterns: 5000, // Lower limit in fallback mode
  };
}

/**
 * Quick start helper - creates a fully configured SONA context with defaults
 */
export async function quickStartSONA(): Promise<SONAAgentContext> {
  const config = await getRecommendedConfig();
  return createSONAContext(config);
}

/**
 * Export strategy factory for use in agent configuration
 */
export function createLearningStrategyFactory(
  config: SONALearningConfig = {}
): () => AgentLearningStrategy {
  return () => createSONALearningStrategy(config);
}
