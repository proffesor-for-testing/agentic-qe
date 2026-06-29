/**
 * Shared free-tier coordinator factory (plan 06 broadening; ADR-111).
 * Mocks only the network call; asserts opt-in gating, default model, router
 * wiring, and the generic text-task helper.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FreeTierChatResult } from '../../../src/routing/free-tier/provider.js';

const chatMock = vi.fn<(...a: unknown[]) => Promise<FreeTierChatResult>>();
vi.mock('../../../src/routing/free-tier/provider.js', async (orig) => {
  const actual = await orig<typeof import('../../../src/routing/free-tier/provider.js')>();
  return { ...actual, freeTierChat: (...a: unknown[]) => chatMock(...a) };
});

import {
  buildFreeTierExecutor,
  runFreeTierTextTask,
  DEFAULT_FREE_TIER_MODEL,
} from '../../../src/routing/free-tier/index.js';

beforeEach(() => chatMock.mockReset());

describe('buildFreeTierExecutor — opt-in gating', () => {
  it('should return null when not opted in', () => {
    const exec = buildFreeTierExecutor({ config: {}, agentType: 'qe-x', taskKind: 'x', env: {} });
    expect(exec).toBeNull();
  });

  it('should build an executor when enableFreeTier=true', () => {
    const exec = buildFreeTierExecutor({ config: { enableFreeTier: true }, agentType: 'qe-x', taskKind: 'x', env: {} });
    expect(exec).not.toBeNull();
  });

  it('should build an executor when AQE_FREE_TIER=1 in env', () => {
    const exec = buildFreeTierExecutor({ config: {}, agentType: 'qe-x', taskKind: 'x', env: { AQE_FREE_TIER: '1' } });
    expect(exec).not.toBeNull();
  });

  it('should default to qwen3-coder:30b (2026-06-29 oracle bench: ties 30b-a3b quality, ~14× faster)', () => {
    const info = vi.fn();
    buildFreeTierExecutor({ config: { enableFreeTier: true }, agentType: 'qe-x', taskKind: 'gen', env: {}, logger: { info } });
    expect(DEFAULT_FREE_TIER_MODEL).toBe('qwen3-coder:30b');
    expect(info.mock.calls[0][0]).toContain('qwen3-coder:30b');
  });

  it('should report local-only when no router is wired', () => {
    const info = vi.fn();
    buildFreeTierExecutor({ config: { enableFreeTier: true }, agentType: 'qe-x', taskKind: 'gen', env: {}, logger: { info } });
    expect(info.mock.calls[0][0]).toContain('local-only');
  });

  it('should report escalation→router when a router is wired', () => {
    const info = vi.fn();
    const llmRouter = { chat: vi.fn().mockResolvedValue({ content: 'x' }) };
    buildFreeTierExecutor({ config: { enableFreeTier: true }, agentType: 'qe-x', taskKind: 'gen', env: {}, llmRouter, logger: { info } });
    expect(info.mock.calls[0][0]).toContain('escalation→router');
  });
});

describe('runFreeTierTextTask', () => {
  it('should return null when the executor is null (not opted in)', async () => {
    const r = await runFreeTierTextTask(null, { agentId: 'a', system: 's', user: 'u', verify: () => true });
    expect(r).toBeNull();
  });

  it('should run the task on the local tier with an objective verifier', async () => {
    chatMock.mockResolvedValue({ ok: true, content: 'VALID', latencyMs: 4 });
    const exec = buildFreeTierExecutor({ config: { enableFreeTier: true }, agentType: 'qe-x', taskKind: 'gen', env: {} });
    const r = await runFreeTierTextTask(exec, { agentId: 'a', system: 's', user: 'u', verify: (o) => o.includes('VALID') });
    expect(r?.ok).toBe(true);
    expect(r?.tierUsed).toBe('local');
  });
});
