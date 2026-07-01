/**
 * Unit tests for the capability-aware routing guard primitives (#1):
 *  - qwen3 local models are registered with correct capability flags
 *  - modelSupportsTools() reflects the registry and fails OPEN on unknown ids
 *    (so the router guard never strands a request on an unrecognized model).
 */

import { describe, it, expect } from 'vitest';

import { getModelCapabilities, modelSupportsTools } from '../../src/shared/llm/model-registry.js';

describe('qwen3 registry entries', () => {
  it('registers qwen3-coder:30b as code-tuned, tool-capable, non-thinking', () => {
    const caps = getModelCapabilities('qwen3-coder:30b');
    expect(caps.supportsTools).toBe(true);
    expect(caps.supportsExtendedThinking).toBe(false);
    expect(caps.contextLength).toBe(262144);
  });

  it('registers qwen3:30b-a3b as a thinking MoE with tools', () => {
    const caps = getModelCapabilities('qwen3:30b-a3b');
    expect(caps.supportsTools).toBe(true);
    expect(caps.supportsExtendedThinking).toBe(true);
  });
});

describe('modelSupportsTools', () => {
  it('returns true for tool-capable models (qwen3 family)', () => {
    expect(modelSupportsTools('qwen3-coder:30b')).toBe(true);
    expect(modelSupportsTools('qwen3:8b')).toBe(true);
  });

  it('returns false for models the registry marks tool-less', () => {
    expect(modelSupportsTools('llama3')).toBe(false);
    expect(modelSupportsTools('codellama')).toBe(false);
    expect(modelSupportsTools('mistral')).toBe(false);
  });

  it('fails open (true) for unknown model ids — never strand the request', () => {
    expect(modelSupportsTools('totally-made-up-model-9000')).toBe(true);
  });
});
