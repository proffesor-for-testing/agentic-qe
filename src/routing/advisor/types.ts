/**
 * Advisor Strategy Types
 * ADR-092: Provider-Agnostic Advisor Strategy for QE Agents
 *
 * Completes ADR-082's dormant `triggerMultiModel` flag by providing
 * an execution layer for multi-model consultation.
 */

import type { ExtendedProviderType } from '../../shared/llm/router/types.js';

/**
 * Transcript slice forwarded to the advisor model.
 * Minimal structure for Phase 0 — real callers pass a synthesized string.
 */
export interface AdvisorTranscript {
  /** Executor system prompt */
  systemPrompt?: string;
  /** Conversation history in role/content pairs */
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  /** Optional task description for context */
  taskDescription?: string;
}

/**
 * Options passed to `MultiModelExecutor.consult()`.
 */
export interface ConsultOptions {
  /** Advisor provider (default: 'openrouter' per ADR-092 Phase 0) */
  provider?: ExtendedProviderType;
  /** Advisor model ID (provider-specific, e.g., 'anthropic/claude-opus-4' for openrouter) */
  model?: string;
  /** Max advice length in words (default: 100 per Anthropic published guidance) */
  maxWords?: number;
  /** Agent name for feedback tracking and audit */
  agentName?: string;
  /** Reason the executor wants advice (for trigger attribution) */
  triggerReason?: string;
  /** Session ID for circuit breaker tracking (default: 'default') */
  sessionId?: string;
  /** Redaction mode (default: 'strict'). 'off' rejected for non-self-hosted. */
  redact?: 'strict' | 'balanced' | 'off';
  /** Domain-specific advisor system prompt (overrides the default generic prompt). */
  advisorSystemPrompt?: string;
}

/**
 * Structured advisor response returned to the caller.
 * Matches the `aqe llm advise --json` stdout schema in ADR-092.
 */
export interface AdvisorResult {
  /** Advice text returned by the advisor model */
  advice: string;
  /** Canonical model ID that produced the advice */
  model: string;
  /** Provider that handled the request */
  provider: ExtendedProviderType;
  /** Tokens sent to the advisor */
  tokensIn: number;
  /** Tokens returned by the advisor */
  tokensOut: number;
  /** Sub-call latency in milliseconds */
  latencyMs: number;
  /** Cost in USD for the advisor sub-call */
  costUsd: number;
  /** sha256 of the advice text (for cache lookups and replay) */
  adviceHash: string;
  /** Trigger attribution (e.g., "tiny_dancer.confidence=0.71") */
  triggerReason: string;
  /** Whether the result came from a cache (Phase 2+) */
  cacheHit: boolean;
  /** Redaction categories applied before dispatch (Phase 1) */
  redactionsApplied: string[];
  /** Remaining advisor calls before circuit breaker trips (Phase 1) */
  circuitBreakerRemaining: number;
}

/**
 * Optional `RoutingOutcome.advisorConsultation` field (Phase 1+).
 * Phase 0 does not yet populate this; kept here so the shape is stable.
 */
export interface AdvisorConsultation {
  model: string;
  provider: ExtendedProviderType;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  costUsd: number;
  adviceHash: string;
  /** Did the executor act on the advice? (Phase 3+ — requires outcome feedback) */
  followedAdvice?: boolean;
  triggerReason: string;
  /** Redaction categories applied before dispatch (Phase 1+) */
  redactionsApplied?: string[];
}

/**
 * The execution layer ADR-082 left unfinished.
 * Consumed by `TinyDancerRouter` when `RouteResult.triggerMultiModel === true`
 * AND an executor is configured on the router.
 */
export interface IMultiModelExecutor {
  consult(transcript: AdvisorTranscript, opts?: ConsultOptions): Promise<AdvisorResult>;
}
