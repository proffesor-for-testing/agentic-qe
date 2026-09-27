/**
 * OpenAI request-parameter policy.
 *
 * GPT-5+/GPT-6 and the o-series reject `max_tokens` (they require
 * `max_completion_tokens`) and any non-default `temperature`; gpt-4o still
 * accepts the legacy shape. Verified against the live Chat Completions API on
 * 2026-09-27 (`gpt-6-sol`, `gpt-6-luna`, `gpt-4o`).
 */

import { describe, expect, it } from 'vitest';
import {
  applyOpenAIParams,
  getOpenAIParamPolicy,
} from '../../../../src/shared/llm/openai-params';

describe('getOpenAIParamPolicy', () => {
  it.each(['gpt-6-sol', 'gpt-6-luna', 'gpt-6-astra', 'openai/gpt-6-sol'])(
    'should use the reasoning shape for registry model %s',
    (model) => {
      expect(getOpenAIParamPolicy(model)).toEqual({
        sendSampling: false,
        maxTokensField: 'max_completion_tokens',
      });
    }
  );

  it.each(['gpt-4o', 'gpt-4o-mini'])('should keep the legacy shape for registry model %s', (model) => {
    expect(getOpenAIParamPolicy(model)).toEqual({ sendSampling: true, maxTokensField: 'max_tokens' });
  });

  it.each(['gpt-5.6-sol', 'gpt-5.3-codex', 'gpt-5.4-mini', 'o3', 'o4-mini', 'openai/gpt-5.6-luna', 'GPT-6-future'])(
    'should fall back to the reasoning shape for unregistered GPT-5/GPT-6/o-series id %s',
    (model) => {
      expect(getOpenAIParamPolicy(model)).toEqual({
        sendSampling: false,
        maxTokensField: 'max_completion_tokens',
      });
    }
  );

  it.each(['gpt-4-turbo', 'gpt-3.5-turbo', 'my-gpt4-deployment', 'prod-chat', 'omni-deploy'])(
    'should fall back to the legacy shape for unregistered id %s',
    (model) => {
      expect(getOpenAIParamPolicy(model)).toEqual({ sendSampling: true, maxTokensField: 'max_tokens' });
    }
  );
});

describe('applyOpenAIParams', () => {
  it('should send max_completion_tokens and drop temperature for gpt-6-sol', () => {
    const body = applyOpenAIParams({ model: 'gpt-6-sol' }, 'gpt-6-sol', { maxTokens: 256, temperature: 0.7 });

    expect(body).toEqual({ model: 'gpt-6-sol', max_completion_tokens: 256 });
  });

  it('should send max_tokens and temperature for gpt-4o', () => {
    const body = applyOpenAIParams({ model: 'gpt-4o' }, 'gpt-4o', { maxTokens: 256, temperature: 0.7 });

    expect(body).toEqual({ model: 'gpt-4o', max_tokens: 256, temperature: 0.7 });
  });

  it('should omit fields whose input is undefined', () => {
    const body = applyOpenAIParams({}, 'gpt-4o', {});

    expect(body).toEqual({});
  });

  it('should mutate and return the same body object', () => {
    const body: Record<string, unknown> = { messages: [] };

    expect(applyOpenAIParams(body, 'gpt-6-luna', { maxTokens: 1 })).toBe(body);
    expect(body.max_completion_tokens).toBe(1);
  });
});
