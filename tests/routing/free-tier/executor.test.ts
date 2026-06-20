/**
 * FreeTierEscalatingExecutor tests (D7-wire) — cheap-first, verify, escalate.
 * The free-tier network call is mocked; Claude tiers use an injected stub
 * runner. No real network or API calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FreeTierChatResult } from '../../../src/routing/free-tier/provider.js';

// Mock only the network call; keep resolveFreeTierProvider real.
const chatMock = vi.fn<(...args: unknown[]) => Promise<FreeTierChatResult>>();
vi.mock('../../../src/routing/free-tier/provider.js', async (importActual) => {
  const actual = await importActual<typeof import('../../../src/routing/free-tier/provider.js')>();
  return { ...actual, freeTierChat: (...args: unknown[]) => chatMock(...args) };
});

import {
  FreeTierEscalatingExecutor,
  defaultFreeTierLadder,
  type ClaudeTierRunner,
  type QeTaskRequest,
} from '../../../src/routing/free-tier/index.js';

const localReply = (content: string): FreeTierChatResult => ({ ok: content.length > 0, content, latencyMs: 5 });
const task = (over: Partial<QeTaskRequest> = {}): QeTaskRequest => ({
  agentId: 'qe:repoA',
  messages: [{ role: 'user', content: 'write a test' }],
  verify: (o) => o.includes('PASS'),
  ...over,
});

beforeEach(() => chatMock.mockReset());

describe('FreeTierEscalatingExecutor — cheap-first happy path', () => {
  it('should solve at the free local tier without escalating', async () => {
    chatMock.mockResolvedValue(localReply('PASS from local'));
    const exec = new FreeTierEscalatingExecutor({ ladder: defaultFreeTierLadder('qwen3:8b') });

    const r = await exec.execute(task());

    expect(r.ok).toBe(true);
    expect(r.tierUsed).toBe('local');
    expect(r.escalated).toBe(false);
    expect(r.attempts).toHaveLength(1);
    expect(chatMock).toHaveBeenCalledTimes(1);
  });
});

describe('FreeTierEscalatingExecutor — escalation on failure', () => {
  it('should escalate to haiku when the free tier output fails verify', async () => {
    chatMock.mockResolvedValue(localReply('wrong answer')); // never contains PASS
    const claudeRunner: ClaudeTierRunner = vi.fn(async () => ({ content: 'PASS from senior' }));
    const exec = new FreeTierEscalatingExecutor({ ladder: defaultFreeTierLadder(), claudeRunner });

    const r = await exec.execute(task());

    expect(r.ok).toBe(true);
    expect(r.tierUsed).toBe('haiku');
    expect(r.escalated).toBe(true);
    expect(r.attempts.map((a) => a.tier)).toEqual(['local', 'haiku']);
    expect(claudeRunner).toHaveBeenCalledOnce();
  });

  it('should treat a free-tier transport error as a failure and escalate', async () => {
    chatMock.mockResolvedValue({ ok: false, content: '', error: 'ECONNREFUSED', latencyMs: 1 });
    const claudeRunner: ClaudeTierRunner = vi.fn(async () => ({ content: 'PASS' }));
    const exec = new FreeTierEscalatingExecutor({ ladder: defaultFreeTierLadder(), claudeRunner });

    const r = await exec.execute(task());

    expect(r.attempts[0]).toMatchObject({ tier: 'local', ok: false, passed: false, error: 'ECONNREFUSED' });
    expect(r.tierUsed).toBe('haiku');
    expect(r.ok).toBe(true);
  });

  it('should climb the whole ladder and report failure when no tier passes', async () => {
    chatMock.mockResolvedValue(localReply('nope'));
    const claudeRunner: ClaudeTierRunner = vi.fn(async () => ({ content: 'still nope' }));
    const exec = new FreeTierEscalatingExecutor({ ladder: defaultFreeTierLadder(), claudeRunner });

    const r = await exec.execute(task());

    expect(r.ok).toBe(false);
    expect(r.attempts.map((a) => a.tier)).toEqual(['local', 'haiku', 'sonnet', 'opus']);
  });
});

describe('FreeTierEscalatingExecutor — local-only mode', () => {
  it('should report Claude tiers unavailable when no runner is injected', async () => {
    chatMock.mockResolvedValue(localReply('nope'));
    const exec = new FreeTierEscalatingExecutor({ ladder: defaultFreeTierLadder() });

    const r = await exec.execute(task());

    expect(r.ok).toBe(false);
    const claudeAttempts = r.attempts.filter((a) => a.provider === 'claude');
    expect(claudeAttempts.length).toBeGreaterThan(0);
    expect(claudeAttempts.every((a) => a.error?.includes('local-only'))).toBe(true);
  });
});

describe('FreeTierEscalatingExecutor — escalation cap', () => {
  it('should respect maxEscalations', async () => {
    chatMock.mockResolvedValue(localReply('nope'));
    const claudeRunner: ClaudeTierRunner = vi.fn(async () => ({ content: 'nope' }));
    const exec = new FreeTierEscalatingExecutor({ ladder: defaultFreeTierLadder(), claudeRunner });

    const r = await exec.execute(task({ maxEscalations: 1 }));

    expect(r.attempts.map((a) => a.tier)).toEqual(['local', 'haiku']); // capped, no sonnet/opus
  });
});

describe('FreeTierEscalatingExecutor — cross-task base-tier adaptation', () => {
  it('should raise the start tier after consecutive start-tier failures', async () => {
    chatMock.mockResolvedValue(localReply('nope')); // local always fails verify
    const claudeRunner: ClaudeTierRunner = vi.fn(async () => ({ content: 'PASS' }));
    const exec = new FreeTierEscalatingExecutor({ ladder: defaultFreeTierLadder(), claudeRunner });

    expect(exec.getTracker().getCurrentTier('qe:repoA')).toBeNull();
    await exec.execute(task()); // start=local, fails at start → recordOutcome(false)
    await exec.execute(task()); // 2nd consecutive start-tier failure → escalate base

    expect(exec.getTracker().getCurrentTier('qe:repoA')).toBe('haiku');
  });

  it('should invoke the onOutcome sink for D9 wiring', async () => {
    chatMock.mockResolvedValue(localReply('PASS'));
    const onOutcome = vi.fn();
    const exec = new FreeTierEscalatingExecutor({ ladder: defaultFreeTierLadder('qwen3:8b'), onOutcome });

    await exec.execute(task());

    expect(onOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'qe:repoA', startTier: 'local', tierUsed: 'local', passed: true, escalated: false }),
    );
  });
});
