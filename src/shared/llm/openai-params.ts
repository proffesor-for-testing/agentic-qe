/**
 * Agentic QE v3 - OpenAI Chat Completions parameter policy
 *
 * GPT-5+/GPT-6 and the o-series reject request fields the GPT-4 generation
 * accepted: `max_tokens` returns 400 ("Use 'max_completion_tokens' instead")
 * and any `temperature` other than the default 1 returns 400 ("Only the
 * default (1) value is supported"). Verified live against gpt-6-sol and
 * gpt-6-luna on 2026-09-27; gpt-4o still accepts the legacy shape. Every
 * OpenAI-format request builder applies this policy so a model bump cannot
 * silently break calls.
 */

import { getModelCapabilities } from './model-registry';

export interface OpenAIParamPolicy {
  /** Whether `temperature` (and other sampling params) may be sent. */
  sendSampling: boolean;
  /** Which field carries the output-token limit. */
  maxTokensField: 'max_tokens' | 'max_completion_tokens';
}

/**
 * Model families that use the reasoning-model request shape, for IDs the
 * registry does not know (optionally `openai/`-prefixed).
 */
const REASONING_MODEL_PATTERN = /^(openai\/)?(gpt-5|gpt-6|o\d)/i;

const LEGACY_POLICY: OpenAIParamPolicy = { sendSampling: true, maxTokensField: 'max_tokens' };
const REASONING_POLICY: OpenAIParamPolicy = { sendSampling: false, maxTokensField: 'max_completion_tokens' };

/**
 * Parameter policy for a model ID (canonical, `openai/…`, or Azure form).
 * Registry capability flags win; models missing from the registry fall back
 * to a name heuristic — GPT-5/GPT-6/o-series get the reasoning shape,
 * everything else keeps the legacy `max_tokens` + `temperature` shape.
 */
export function getOpenAIParamPolicy(model: string): OpenAIParamPolicy {
  try {
    const caps = getModelCapabilities(model);
    return {
      sendSampling: caps.supportsSamplingParams !== false,
      maxTokensField: caps.usesMaxCompletionTokens === true ? 'max_completion_tokens' : 'max_tokens',
    };
  } catch {
    return REASONING_MODEL_PATTERN.test(model) ? { ...REASONING_POLICY } : { ...LEGACY_POLICY };
  }
}

export interface OpenAIParamInput {
  maxTokens?: number;
  temperature?: number;
}

/**
 * Add the output-token limit and sampling fields to an OpenAI Chat
 * Completions request body according to the model's policy. Mutates and
 * returns `body`.
 */
export function applyOpenAIParams<T extends object>(
  body: T,
  model: string,
  input: OpenAIParamInput
): T {
  const policy = getOpenAIParamPolicy(model);
  const target = body as Record<string, unknown>;
  if (input.maxTokens !== undefined) {
    target[policy.maxTokensField] = input.maxTokens;
  }
  if (policy.sendSampling && input.temperature !== undefined) {
    target.temperature = input.temperature;
  }
  return body;
}
