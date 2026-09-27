/**
 * Agentic QE v3 - Anthropic Messages API parameter policy
 *
 * Newer Claude models reject request fields that older ones accepted:
 * `temperature` / `top_p` / `top_k` return 400 ("`temperature` is deprecated
 * for this model") on Opus 4.7+, Sonnet 5 and the Fable family, and effort
 * must be sent as `output_config.effort` (a nested `thinking.effort` is
 * rejected). Every Anthropic-format request builder applies this policy so a
 * model bump cannot silently break calls.
 */

import { getModelCapabilities } from './model-registry';
import type { EffortLevel } from './effort-resolver';

export interface AnthropicParamPolicy {
  /** Whether `temperature` (and other sampling params) may be sent. */
  sendSampling: boolean;
  /** Whether `output_config.effort` is accepted. */
  supportsEffort: boolean;
}

/**
 * Parameter policy for a model ID (canonical, dated, Bedrock, or OpenRouter
 * form). Models missing from the registry get the conservative policy:
 * no sampling params (current models reject them; retired models no longer
 * serve requests) and no effort.
 */
export function getAnthropicParamPolicy(model: string): AnthropicParamPolicy {
  try {
    const caps = getModelCapabilities(model);
    return {
      sendSampling: caps.supportsSamplingParams !== false,
      supportsEffort: caps.supportsEffortXHigh === true,
    };
  } catch {
    return { sendSampling: false, supportsEffort: false };
  }
}

export interface AnthropicParamInput {
  temperature?: number;
  /** Only an explicitly requested effort is sent; otherwise the model default applies. */
  effort?: EffortLevel;
}

/**
 * Add sampling and effort fields to an Anthropic Messages request body
 * according to the model's policy. Mutates and returns `body`.
 */
export function applyAnthropicParams(
  body: Record<string, unknown>,
  model: string,
  input: AnthropicParamInput
): Record<string, unknown> {
  const policy = getAnthropicParamPolicy(model);
  if (policy.sendSampling && input.temperature !== undefined) {
    body.temperature = input.temperature;
  }
  if (policy.supportsEffort && input.effort !== undefined) {
    body.output_config = { effort: input.effort };
  }
  return body;
}
