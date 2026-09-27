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

import { getModelCapabilities, getModelInfo } from './model-registry';
import { resolveEffortLevel, type EffortLevel } from './effort-resolver';

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
  /**
   * Explicit effort. When omitted, flagship (Opus/Fable-class) models get the
   * fleet effort (QE_EFFORT_LEVEL > config/fleet-defaults.yaml > xhigh, per
   * ADR-093); other models keep their API default to avoid raising cost on
   * every Sonnet/Haiku call.
   */
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
  if (policy.supportsEffort) {
    const effort = input.effort ?? (isFlagship(model) ? resolveEffortLevel() : undefined);
    if (effort !== undefined) {
      body.output_config = { effort };
    }
  }
  return body;
}

function isFlagship(model: string): boolean {
  return getModelInfo(model)?.tier === 'flagship';
}
