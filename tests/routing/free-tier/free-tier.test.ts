/**
 * Free-tier routing tests (D7) — pure logic: provider resolution, env-key
 * handling, ladder validation, and escalation from a free local tier.
 * No network (freeTierChat is exercised separately by the d7-proof script).
 */
import { describe, it, expect } from 'vitest';
import {
  resolveFreeTierProvider,
  FREE_TIER_PRESETS,
  defaultFreeTierLadder,
  validateLadder,
  createFreeTierEscalation,
  resolveTier,
  type QeRoutingLadder,
} from '../../../src/routing/free-tier/index.js';

describe('resolveFreeTierProvider', () => {
  it('should default local-ollama to the docker host gateway with no key', () => {
    const p = resolveFreeTierProvider({ kind: 'local-ollama', model: 'qwen3:8b' }, {});
    expect(p.baseUrl).toBe('http://host.docker.internal:11434/v1');
    expect(p.headers.Authorization).toBeUndefined();
    expect(p.missingKey).toBe(false);
  });

  it('should read the OpenRouter key from the named env var into a Bearer header', () => {
    const p = resolveFreeTierProvider(
      { kind: 'openrouter', model: 'mistralai/devstral-small:free' },
      { OPENROUTER_API_KEY: 'sk-test-123' },
    );
    expect(p.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(p.headers.Authorization).toBe('Bearer sk-test-123');
    expect(p.missingKey).toBe(false);
  });

  it('should flag missingKey when a key-requiring provider has no env key', () => {
    const p = resolveFreeTierProvider({ kind: 'openrouter', model: 'x:free' }, {});
    expect(p.missingKey).toBe(true);
    expect(p.headers.Authorization).toBeUndefined();
  });

  it('should honor a custom apiKeyEnv name', () => {
    const p = resolveFreeTierProvider(
      { kind: 'cloud-ollama', model: 'qwen3:8b', apiKeyEnv: 'MY_OLLAMA_KEY' },
      { MY_OLLAMA_KEY: 'abc' },
    );
    expect(p.headers.Authorization).toBe('Bearer abc');
  });

  it('should require an explicit baseUrl for openai-compatible', () => {
    expect(() => resolveFreeTierProvider({ kind: 'openai-compatible', model: 'm' }, {})).toThrow(/baseUrl/);
  });

  it('should accept a custom openai-compatible endpoint (e.g. Groq/vLLM)', () => {
    const p = resolveFreeTierProvider(
      { kind: 'openai-compatible', model: 'llama-3.3-70b', baseUrl: 'https://api.groq.com/openai/v1', apiKeyEnv: 'GROQ_API_KEY' },
      { GROQ_API_KEY: 'gsk_x' },
    );
    expect(p.baseUrl).toBe('https://api.groq.com/openai/v1');
    expect(p.headers.Authorization).toBe('Bearer gsk_x');
  });

  it('should apply config overrides for timeout/tokens/temperature/contentOnly', () => {
    const p = resolveFreeTierProvider(
      { kind: 'local-ollama', model: 'm', timeoutMs: 5000, maxTokens: 256, temperature: 0.9, contentOnly: false },
      {},
    );
    expect(p).toMatchObject({ timeoutMs: 5000, maxTokens: 256, temperature: 0.9, contentOnly: false });
  });

  it('should expose presets for all four kinds', () => {
    expect(Object.keys(FREE_TIER_PRESETS).sort()).toEqual(
      ['cloud-ollama', 'local-ollama', 'openai-compatible', 'openrouter'],
    );
  });
});

describe('validateLadder', () => {
  it('should accept the default free-tier ladder', () => {
    expect(() => validateLadder(defaultFreeTierLadder())).not.toThrow();
  });

  it('should reject a tier with no binding', () => {
    const bad: QeRoutingLadder = { tierOrder: ['local', 'haiku'], bindings: { local: { provider: 'claude', claudeTier: 'haiku' } } };
    expect(() => validateLadder(bad)).toThrow(/no binding for tier "haiku"/);
  });

  it('should reject minTier above maxTier', () => {
    const bad = { ...defaultFreeTierLadder(), minTier: 'opus', maxTier: 'local' };
    expect(() => validateLadder(bad)).toThrow(/minTier is above maxTier/);
  });
});

describe('createFreeTierEscalation — free tier as the bottom of the ladder', () => {
  it('should start agents at the free local tier', () => {
    const { baseTier } = createFreeTierEscalation(defaultFreeTierLadder());
    expect(baseTier).toBe('local');
  });

  it('should escalate local -> haiku after 2 failures (Round-3 economics)', () => {
    const { tracker } = createFreeTierEscalation(defaultFreeTierLadder());
    tracker.recordOutcome('a', false, 'local');
    const esc = tracker.recordOutcome('a', false, 'local');
    expect(esc.action).toBe('escalate');
    expect(esc.previousTier).toBe('local');
    expect(esc.newTier).toBe('haiku');
  });

  it('should keep escalating the hard tail up the chain to opus', () => {
    const { tracker } = createFreeTierEscalation(defaultFreeTierLadder());
    tracker.recordOutcome('a', false, 'local');
    tracker.recordOutcome('a', false, 'local'); // -> haiku
    tracker.recordOutcome('a', false, 'local');
    tracker.recordOutcome('a', false, 'local'); // -> sonnet
    tracker.recordOutcome('a', false, 'local');
    const esc = tracker.recordOutcome('a', false, 'local'); // -> opus
    expect(esc.newTier).toBe('opus');
  });

  it('should de-escalate back down to the free tier after sustained success', () => {
    const { tracker } = createFreeTierEscalation({ ...defaultFreeTierLadder(), deEscalateAfterSuccesses: 2 });
    // climb to sonnet
    tracker.recordOutcome('a', false, 'local');
    tracker.recordOutcome('a', false, 'local'); // haiku
    tracker.recordOutcome('a', false, 'local');
    tracker.recordOutcome('a', false, 'local'); // sonnet
    // now succeed our way back down
    tracker.recordOutcome('a', true, 'local');
    tracker.recordOutcome('a', true, 'local'); // -> haiku
    tracker.recordOutcome('a', true, 'local');
    const d = tracker.recordOutcome('a', true, 'local'); // -> local
    expect(d.action).toBe('de-escalate');
    expect(d.newTier).toBe('local');
  });

  it('should not de-escalate below the free tier', () => {
    const { tracker } = createFreeTierEscalation({ ...defaultFreeTierLadder(), deEscalateAfterSuccesses: 2 });
    for (let i = 0; i < 6; i++) tracker.recordOutcome('a', true, 'local');
    expect(tracker.getCurrentTier('a')).toBe('local');
  });
});

describe('resolveTier — tier name to concrete handler', () => {
  it('should resolve the local tier to a free-tier provider', () => {
    const r = resolveTier(defaultFreeTierLadder(), 'local', {});
    expect(r.provider).toBe('free-tier');
    if (r.provider === 'free-tier') expect(r.resolved.baseUrl).toContain('11434');
  });

  it('should resolve a Claude tier to the claude handler', () => {
    const r = resolveTier(defaultFreeTierLadder(), 'sonnet', {});
    expect(r).toEqual({ provider: 'claude', claudeTier: 'sonnet' });
  });

  it('should let a user bind the local tier to OpenRouter free models', () => {
    const ladder = defaultFreeTierLadder();
    ladder.bindings.local = { provider: 'free-tier', config: { kind: 'openrouter', model: 'mistralai/devstral-small:free' } };
    const r = resolveTier(ladder, 'local', { OPENROUTER_API_KEY: 'sk' });
    expect(r.provider).toBe('free-tier');
    if (r.provider === 'free-tier') {
      expect(r.resolved.baseUrl).toContain('openrouter');
      expect(r.resolved.model).toBe('mistralai/devstral-small:free');
    }
  });
});
