/**
 * Free-tier routing (cross-pollination plan 06, D7).
 *
 * Adds a configurable FREE / low-cost model tier below haiku in the escalation
 * ladder: local Ollama, cloud Ollama, OpenRouter, or any OpenAI-compatible
 * endpoint. Cheap-local handles the bulk; only failures escalate up the chain.
 * See docs/metaharness/06-darwin-qe-self-learning-action-lane.md (D7).
 */
export type {
  FreeTierKind,
  FreeTierProviderConfig,
  ResolvedFreeTierProvider,
  TierBinding,
  QeRoutingLadder,
} from './types.js';
export {
  FREE_TIER_PRESETS,
  resolveFreeTierProvider,
  freeTierChat,
  freeTierHealth,
  type ChatMessage,
  type FreeTierChatResult,
} from './provider.js';
export {
  defaultFreeTierLadder,
  validateLadder,
  createFreeTierEscalation,
  resolveTier,
  type ResolvedTier,
} from './ladder.js';
export {
  FreeTierEscalatingExecutor,
  type ClaudeTierRunner,
  type QeVerifier,
  type QeVerdict,
  type QeTaskRequest,
  type QeExecutionResult,
  type TierAttempt,
  type FreeTierExecutorOptions,
} from './executor.js';
export {
  TestGenPatternCache,
  normalizeCode,
  cosineSimilarity,
  type CodeEmbedder,
  type PatternCacheOptions,
} from './pattern-cache.js';
export {
  createRoutingFeedbackSink,
  type RoutingFeedbackLike,
  type FreeTierOutcomeEvent,
  type RoutingFeedbackSinkOptions,
} from './feedback-sink.js';
export {
  buildFreeTierExecutor,
  runFreeTierTextTask,
  DEFAULT_FREE_TIER_MODEL,
  type FreeTierCoordinatorConfig,
  type FreeTierLlmRouter,
  type BuildFreeTierExecutorOptions,
} from './coordinator-support.js';
