/**
 * Free-tier provider configuration (cross-pollination plan 06, D7).
 *
 * Lets a user place a FREE / low-cost model at the BOTTOM of the escalation
 * ladder (below haiku), served by any OpenAI-compatible endpoint:
 *   - local-ollama     — Ollama on the dev box / M5 host (zero cost, private)
 *   - cloud-ollama     — ollama.com hosted models (free + paid tiers)
 *   - openrouter       — OpenRouter free models (e.g. *:free) and paid
 *   - openai-compatible — any other `/v1/chat/completions` server (vLLM, LM Studio,
 *                         Groq, Together, llama.cpp, ruvllm serve, …)
 *
 * Secrets are NEVER stored here: a provider names the ENV VAR to read its key
 * from (`apiKeyEnv`); the key itself is read at resolve time and never persisted.
 */

import type { AgentTier } from '../routing-config.js';

export type FreeTierKind = 'local-ollama' | 'cloud-ollama' | 'openrouter' | 'openai-compatible';

export interface FreeTierProviderConfig {
  /** Which family of OpenAI-compatible endpoint to talk to. */
  kind: FreeTierKind;
  /** Model id passed in the request body (e.g. 'qwen3:8b', 'mistralai/devstral-small:free'). */
  model: string;
  /** Override the endpoint base URL (required for 'openai-compatible'; optional otherwise). */
  baseUrl?: string;
  /** Name of the ENV VAR holding the API key (never the key itself). */
  apiKeyEnv?: string;
  /** Per-call wall-clock budget. Default 120_000 (reasoning models need ≥120s). */
  timeoutMs?: number;
  /** Token budget. Default 2048 (covers a reasoning channel + answer). */
  maxTokens?: number;
  /** Sampling temperature. Default 0.2. */
  temperature?: number;
  /**
   * Some local models (qwen3, gemma) emit a separate `reasoning` field and put
   * the answer in `content`. When true, ignore `reasoning` and read `content`
   * only (the default — matches the OpenAI shape). Set false to concatenate.
   */
  contentOnly?: boolean;
}

/** A fully-resolved provider ready to call (preset merged, key read from env). */
export interface ResolvedFreeTierProvider {
  kind: FreeTierKind;
  model: string;
  baseUrl: string;
  /** Request headers incl. Authorization when a key was found. */
  headers: Record<string, string>;
  timeoutMs: number;
  maxTokens: number;
  temperature: number;
  contentOnly: boolean;
  /** True when the preset wants a key but none was found in env (call will likely 401). */
  missingKey: boolean;
}

/**
 * A routing-ladder entry: a tier name maps EITHER to an existing Claude tier
 * (handled by the normal router) OR to a free-tier provider (the new bottom).
 */
export type TierBinding =
  | { provider: 'claude'; claudeTier: AgentTier }
  | { provider: 'free-tier'; config: FreeTierProviderConfig };

/**
 * A complete QE routing ladder: the ordered tiers, the per-tier bindings, and
 * the de-/escalation bounds. Feeds `createFreeTierEscalation()`.
 */
export interface QeRoutingLadder {
  /** Tiers in ascending order of capability/cost, e.g. ['local','haiku','sonnet','opus']. */
  tierOrder: string[];
  /** Binding per tier name (must cover every entry in tierOrder). */
  bindings: Record<string, TierBinding>;
  /** Lowest tier to de-escalate to (default: first of tierOrder). */
  minTier?: string;
  /** Highest tier to escalate to (default: last of tierOrder). */
  maxTier?: string;
  escalateAfterFailures?: number;
  deEscalateAfterSuccesses?: number;
}
