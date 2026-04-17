/**
 * MultiModelExecutor — the execution layer for ADR-082's `triggerMultiModel` flag.
 * ADR-092: Provider-Agnostic Advisor Strategy for QE Agents
 *
 * All phases implemented (ADR-092):
 * - Consultation via HybridRouter.chat() with provider auto-detection
 * - Secrets/PII redaction pre-flight (16 pattern categories)
 * - Per-session circuit breaker (file-persisted, atomic writes)
 * - Domain-specific advisor prompts via --advisor-prompt
 * - Consultation sidecar persistence for RoutingFeedbackCollector
 *
 * Architecturally this class is small on purpose. TinyDancerRouter already
 * decides WHEN advice is warranted (via `triggerMultiModel`). HybridRouter
 * already handles provider dispatch, fallback, and cost tracking. This class
 * is the narrow bridge between those two existing layers.
 */

import { createHash } from 'crypto';
import type { HybridRouter } from '../../shared/llm/router/hybrid-router.js';
import type { ChatParams, ChatResponse, ExtendedProviderType } from '../../shared/llm/router/types.js';
import type { Message } from '../../shared/llm/interfaces.js';
import type {
  AdvisorResult,
  AdvisorTranscript,
  ConsultOptions,
  IMultiModelExecutor,
} from './types.js';
import {
  redact,
  validateProviderForAgent,
  isSelfHosted,
  type RedactionMode,
} from './redaction.js';
import { AdvisorCircuitBreaker, type CircuitBreakerState } from './circuit-breaker.js';

/**
 * Default advisor model per ADR-092 Phase 0 and ADR-093.
 * OpenRouter exposes Anthropic Opus — chosen for vendor-independence as the
 * default while direct Anthropic remains available for security-sensitive agents.
 *
 * ADR-093 (2026-04-17): default advisor model upgraded from Opus 4 to Opus 4.7.
 * SWE-bench Verified 87.6% (vs 80.8% on 4.6), new `xhigh` effort level,
 * 1M context at standard pricing, adaptive thinking.
 */
export const DEFAULT_ADVISOR_PROVIDER: ExtendedProviderType = 'openrouter';
export const DEFAULT_ADVISOR_MODEL = 'anthropic/claude-opus-4.7';
export const DEFAULT_MAX_WORDS = 100;

/**
 * ADR-093: Security and pentest agents that may trip Opus 4.7's real-time
 * cybersecurity safeguards until the organization is enrolled in Anthropic's
 * Cyber Verification Program. Until enrolled, these agents are pinned to
 * Sonnet 4.6 for escalation targets.
 */
const CYBER_PINNED_AGENTS: readonly string[] = [
  'qe-pentest-validator',
  'qe-security-auditor',
  'qe-security-scanner',
] as const;

/**
 * ADR-093: Fallback advisor model for cyber-pinned agents when
 * AQE_CYBER_VERIFIED !== 'true'. Sonnet 4.6 on OpenRouter.
 */
const CYBER_PIN_FALLBACK_MODEL = 'anthropic/claude-sonnet-4.6';

/**
 * ADR-093: Decide whether to pin a cyber-sensitive agent to the fallback model.
 * Returns the model to actually use. Exported for testing.
 */
export function applyCyberPin(
  agentName: string,
  requestedModel: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (env.AQE_CYBER_VERIFIED === 'true') return requestedModel;
  if (!CYBER_PINNED_AGENTS.includes(agentName)) return requestedModel;
  // Only pin when the requested model is the 4.7 flagship — allow explicit
  // lower-tier escalation targets to pass through unchanged.
  if (!requestedModel.includes('claude-opus-4.7') && !requestedModel.includes('claude-opus-4-7')) {
    return requestedModel;
  }
  return CYBER_PIN_FALLBACK_MODEL;
}

/**
 * System prompt prepended to every advisor consultation.
 *
 * Text adapted from Anthropic's published canonical system prompt for the
 * advisor tool (platform.claude.com/docs/en/agents-and-tools/tool-use/advisor-tool).
 * Conciseness instruction reduces advisor output tokens by ~35-45% per published
 * measurements without degrading call frequency.
 */
const ADVISOR_SYSTEM_PROMPT = `You are the advisor in an executor/advisor pattern. The executor has forwarded its full conversation transcript to you and is waiting for brief strategic guidance.

You see the task, every tool call the executor has made, every result it has seen.

Respond with a brief plan or correction in under 100 words. Use enumerated steps. No prose explanations. No pleasantries. Do not restate the task — the executor already knows the task. Focus on the next 1-3 concrete actions the executor should take, in order, with one-line reasons.

If you see the executor about to commit to a wrong approach, say so in step 1. If you see the executor is on track, say so in one line and name the specific next action. If the transcript lacks enough information to give useful advice, say "INSUFFICIENT CONTEXT" and name the missing piece.`;

/**
 * Phase 0 MultiModelExecutor implementation.
 *
 * Takes a transcript, calls HybridRouter.chat() with a stronger-tier model,
 * returns structured advice. No redaction, no circuit breaker, no cache —
 * those arrive in Phase 1+.
 */
export class MultiModelExecutor implements IMultiModelExecutor {
  private readonly circuitBreaker: AdvisorCircuitBreaker;

  constructor(
    private readonly router: HybridRouter,
    circuitBreakerConfig?: { maxCallsPerSession?: number; statePath?: string },
  ) {
    this.circuitBreaker = new AdvisorCircuitBreaker(circuitBreakerConfig);
  }

  getCircuitBreakerState(sessionId: string): CircuitBreakerState {
    return this.circuitBreaker.getState(sessionId);
  }

  resetCircuitBreaker(sessionId?: string): void {
    this.circuitBreaker.reset(sessionId);
  }

  async consult(transcript: AdvisorTranscript, opts: ConsultOptions = {}): Promise<AdvisorResult> {
    const provider = opts.provider ?? DEFAULT_ADVISOR_PROVIDER;
    const requestedModel = opts.model ?? DEFAULT_ADVISOR_MODEL;
    const maxWords = opts.maxWords ?? DEFAULT_MAX_WORDS;
    const agentName = opts.agentName ?? 'unknown';

    // ADR-093: pin cyber-sensitive agents to fallback model until
    // AQE_CYBER_VERIFIED=true (Cyber Verification Program approval).
    const model = applyCyberPin(agentName, requestedModel);
    if (model !== requestedModel) {
      // eslint-disable-next-line no-console
      console.warn(
        `[aqe] ADR-093: ${agentName} pinned to ${model} (was ${requestedModel}); ` +
          `set AQE_CYBER_VERIFIED=true after Cyber Verification Program approval`,
      );
    }
    const triggerReason = opts.triggerReason ?? 'manual';
    const sessionId = opts.sessionId ?? 'default';
    const redactionMode: RedactionMode = opts.redact ?? 'strict';

    // Phase 1 safety: validate provider is allowed for this agent
    validateProviderForAgent(agentName, provider as string, redactionMode);

    // Phase 1 safety: enforce per-session hard ceiling
    const cbState = this.circuitBreaker.acquire(sessionId);

    // Phase 1 safety: redact secrets before non-self-hosted providers see the transcript
    let redactions: string[] = [];
    let serialized = this.serializeTranscript(transcript, maxWords);

    if (!isSelfHosted(provider as string)) {
      const redactionResult = redact(serialized, redactionMode);
      serialized = redactionResult.text;
      redactions = redactionResult.redactions;
    }

    const messages: Message[] = [{ role: 'user', content: serialized }];

    const systemPrompt = opts.advisorSystemPrompt ?? ADVISOR_SYSTEM_PROMPT;

    const params: ChatParams = {
      messages,
      systemPrompt,
      agentType: agentName,
      preferredProvider: provider,
      model,
      maxTokens: Math.max(300, Math.ceil(maxWords * 1.6)),
      temperature: 0.2,
      metadata: {
        advisorCall: true,
        triggerReason,
        adrRef: 'ADR-092',
      },
    };

    const response: ChatResponse = await this.router.chat(params);

    const advice = response.content.trim();
    const adviceHash = createHash('sha256').update(advice).digest('hex');

    const result: AdvisorResult = {
      advice,
      model: response.model,
      provider: response.provider,
      tokensIn: response.usage?.promptTokens ?? 0,
      tokensOut: response.usage?.completionTokens ?? 0,
      latencyMs: response.latencyMs,
      costUsd: response.cost?.totalCost ?? 0,
      adviceHash,
      triggerReason,
      cacheHit: response.cached ?? false,
      redactionsApplied: redactions,
      circuitBreakerRemaining: cbState.remaining,
    };

    // M1 fix: persist consultation to sidecar file so RoutingFeedbackCollector
    // can pick it up when recording the routing outcome for this session.
    this.persistConsultation(sessionId, result);

    return result;
  }

  private persistConsultation(sessionId: string, result: AdvisorResult): void {
    try {
      const { writeFileSync, mkdirSync } = require('fs') as typeof import('fs');
      const { join } = require('path') as typeof import('path');
      const { homedir } = require('os') as typeof import('os');
      const dir = join(homedir(), '.agentic-qe', 'advisor', 'consultations');
      mkdirSync(dir, { recursive: true });
      const filePath = join(dir, `${sessionId}.json`);
      writeFileSync(filePath, JSON.stringify({
        model: result.model,
        provider: result.provider,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        latencyMs: result.latencyMs,
        costUsd: result.costUsd,
        adviceHash: result.adviceHash,
        triggerReason: result.triggerReason,
        redactionsApplied: result.redactionsApplied,
        timestamp: new Date().toISOString(),
      }, null, 2));
    } catch {
      // Best-effort — don't fail the advisor call if persistence fails
    }
  }

  /**
   * Serialize a transcript into a single user message for the advisor.
   * Kept simple for Phase 0 — no XML tags, no tool-result wrapping beyond
   * role labels. This matches what most providers accept cleanly and is
   * easy to evolve in Phase 1.
   */
  private serializeTranscript(transcript: AdvisorTranscript, maxWords: number): string {
    const parts: string[] = [];

    if (transcript.systemPrompt) {
      parts.push(`# Executor System Prompt\n${transcript.systemPrompt}`);
    }

    if (transcript.taskDescription) {
      parts.push(`# Task\n${transcript.taskDescription}`);
    }

    parts.push('# Conversation so far');
    for (const msg of transcript.messages) {
      const tag = msg.role.toUpperCase();
      parts.push(`[${tag}] ${msg.content}`);
    }

    parts.push(
      `\n# Your job\nRespond with brief strategic guidance in under ${maxWords} words. Use enumerated steps. No prose.`
    );

    return parts.join('\n\n');
  }
}

/**
 * Factory for convenience — most callers construct directly, but this keeps
 * the import surface consistent with other factories in `src/routing/`.
 */
export function createMultiModelExecutor(router: HybridRouter): MultiModelExecutor {
  return new MultiModelExecutor(router);
}
