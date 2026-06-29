/**
 * Unit tests for resolveOllamaBaseUrl — the single knob that points every AQE
 * local-model client at a chosen Ollama. Pure: env is injected, process.env is
 * never touched. Exercises the precedence chain and normalization.
 */

import { describe, it, expect } from 'vitest';

import { resolveOllamaBaseUrl, DEFAULT_OLLAMA_BASE_URL } from '../../src/shared/llm/ollama-url.js';

describe('resolveOllamaBaseUrl', () => {
  it('returns the call-site fallback when no env var is set', () => {
    expect(resolveOllamaBaseUrl('http://localhost:11434', {})).toBe('http://localhost:11434');
  });

  it('preserves a non-localhost fallback (e.g. the free-tier host gateway)', () => {
    expect(resolveOllamaBaseUrl('http://host.docker.internal:11434', {})).toBe(
      'http://host.docker.internal:11434',
    );
  });

  it('uses OLLAMA_URL over the fallback', () => {
    expect(resolveOllamaBaseUrl('http://localhost:11434', { OLLAMA_URL: 'http://gpu-box:11434' })).toBe(
      'http://gpu-box:11434',
    );
  });

  it('prefers AQE_OLLAMA_URL over OLLAMA_URL and the fallback', () => {
    const got = resolveOllamaBaseUrl('http://localhost:11434', {
      AQE_OLLAMA_URL: 'http://aqe:11434',
      OLLAMA_URL: 'http://other:11434',
    });
    expect(got).toBe('http://aqe:11434');
  });

  it('strips trailing slashes from any source', () => {
    expect(resolveOllamaBaseUrl('http://localhost:11434/', {})).toBe('http://localhost:11434');
    expect(resolveOllamaBaseUrl('x', { AQE_OLLAMA_URL: 'http://h:11434///' })).toBe('http://h:11434');
  });

  it('defaults the fallback to localhost when omitted', () => {
    expect(resolveOllamaBaseUrl(undefined, {})).toBe(DEFAULT_OLLAMA_BASE_URL);
    expect(DEFAULT_OLLAMA_BASE_URL).toBe('http://localhost:11434');
  });
});
