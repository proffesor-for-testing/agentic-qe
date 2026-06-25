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

describe('FreeTierEscalatingExecutor — D8 repair loop', () => {
  it('should repair in place at the same tier without escalating when repair succeeds', async () => {
    // first call fails verify, repair call passes — both on the local tier
    chatMock.mockResolvedValueOnce(localReply('draft: nope')).mockResolvedValueOnce(localReply('PASS after repair'));
    const claudeRunner: ClaudeTierRunner = vi.fn(async () => ({ content: 'PASS' }));
    const exec = new FreeTierEscalatingExecutor({ ladder: defaultFreeTierLadder(), claudeRunner });

    const r = await exec.execute(task({ repairAttempts: 1 }));

    expect(r.ok).toBe(true);
    expect(r.tierUsed).toBe('local');
    expect(r.escalated).toBe(false);
    expect(r.repaired).toBe(true);
    expect(r.attempts.map((a) => a.repairRound)).toEqual([0, 1]);
    expect(claudeRunner).not.toHaveBeenCalled(); // repaired locally — no escalation
  });

  it('should pass the verifier feedback into the repair turn', async () => {
    chatMock.mockResolvedValueOnce(localReply('bad')).mockResolvedValueOnce(localReply('PASS'));
    const exec = new FreeTierEscalatingExecutor({ ladder: defaultFreeTierLadder('qwen3:8b') });
    const verify = vi.fn((o: string) => (o.includes('PASS') ? true : { passed: false, feedback: 'missing expect()' }));

    await exec.execute(task({ verify, repairAttempts: 1 }));

    // the 2nd freeTierChat call (repair) must include the feedback text
    const repairCallMessages = chatMock.mock.calls[1][1] as Array<{ role: string; content: string }>;
    expect(JSON.stringify(repairCallMessages)).toContain('missing expect()');
  });

  it('should stay local in repair-only mode (escalate:false) and never call Claude', async () => {
    chatMock.mockResolvedValue(localReply('always nope'));
    const claudeRunner: ClaudeTierRunner = vi.fn(async () => ({ content: 'PASS' }));
    const exec = new FreeTierEscalatingExecutor({ ladder: defaultFreeTierLadder(), claudeRunner });

    const r = await exec.execute(task({ escalate: false, repairAttempts: 2 }));

    expect(r.ok).toBe(false);
    expect(r.attempts.every((a) => a.tier === 'local')).toBe(true);
    expect(r.attempts).toHaveLength(3); // 1 initial + 2 repairs, no escalation
    expect(claudeRunner).not.toHaveBeenCalled();
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

describe('FreeTierEscalatingExecutor — best-of-k diversity (06 §12)', () => {
  it('should convert at the same tier via a diverse second attempt without escalating', async () => {
    chatMock.mockResolvedValueOnce(localReply('first try nope')).mockResolvedValueOnce(localReply('PASS variant'));
    const claudeRunner: ClaudeTierRunner = vi.fn(async () => ({ content: 'PASS from senior' }));
    const exec = new FreeTierEscalatingExecutor({ ladder: defaultFreeTierLadder('qwen3:8b'), claudeRunner });

    const r = await exec.execute(task({ bestOfK: 2 }));

    expect(r.ok).toBe(true);
    expect(r.tierUsed).toBe('local');
    expect(r.escalated).toBe(false);
    expect(r.bestOf).toBe(true);
    expect(r.attempts).toHaveLength(2);
    expect(r.attempts.map((a) => a.variant)).toEqual([0, 1]);
    expect(claudeRunner).not.toHaveBeenCalled(); // diversity converted before the paid tail
  });

  it('should send a diversification nudge on variant attempts beyond the first', async () => {
    chatMock.mockResolvedValueOnce(localReply('nope')).mockResolvedValueOnce(localReply('PASS'));
    const exec = new FreeTierEscalatingExecutor({ ladder: defaultFreeTierLadder('qwen3:8b') });

    await exec.execute(task({ bestOfK: 2 }));

    const variantMessages = chatMock.mock.calls[1][1] as Array<{ role: string; content: string }>;
    expect(JSON.stringify(variantMessages)).toContain('Alternative approach #1');
  });
});

describe('FreeTierEscalatingExecutor — Goodhart guard (06 §10)', () => {
  it('should NOT feed routing-feedback when the gate is a self-authored oracle', async () => {
    chatMock.mockResolvedValue(localReply('PASS')); // model self-test "passes"
    const onOutcome = vi.fn();
    const exec = new FreeTierEscalatingExecutor({ ladder: defaultFreeTierLadder('qwen3:8b'), onOutcome });

    const r = await exec.execute(task({ oracleKind: 'self-authored' }));

    expect(r.ok).toBe(true);
    expect(r.goodhartGuarded).toBe(true);
    expect(onOutcome).not.toHaveBeenCalled(); // a weak self-oracle must not lift confidence
    expect(exec.getTracker().getCurrentTier('qe:repoA')).toBeNull(); // tracker untouched
  });

  it('should record normally for the default objective oracle', async () => {
    chatMock.mockResolvedValue(localReply('PASS'));
    const onOutcome = vi.fn();
    const exec = new FreeTierEscalatingExecutor({ ladder: defaultFreeTierLadder('qwen3:8b'), onOutcome });

    const r = await exec.execute(task()); // oracleKind defaults to 'objective'

    expect(r.goodhartGuarded).toBe(false);
    expect(onOutcome).toHaveBeenCalledOnce();
  });
});

describe('FreeTierEscalatingExecutor — cross-model best-of-k (A12)', () => {
  it('should draw round-0 candidates from different providers and rescue via the valid model', async () => {
    // model A (qwen-x) always fails verify; model B (glm-x) passes. Cross-model
    // best-of-k must fall through to B WITHOUT escalating — the validity-rescue
    // +6 union win measured in A12 (d3-xmodel).
    chatMock.mockImplementation((provider: unknown) =>
      Promise.resolve(localReply((provider as { model?: string })?.model === 'glm-x' ? 'PASS from glm' : 'nope from qwen')));
    const exec = new FreeTierEscalatingExecutor({
      ladder: defaultFreeTierLadder('qwen3:8b'),
      candidateProviders: [
        { kind: 'local-ollama', model: 'qwen-x' },
        { kind: 'local-ollama', model: 'glm-x' },
      ],
      env: {},
    });

    const r = await exec.execute(task({ bestOfK: 2 }));

    expect(r.ok).toBe(true);
    expect(r.tierUsed).toBe('local');
    expect(r.escalated).toBe(false);
    expect(r.bestOf).toBe(true);
    expect(r.attempts).toHaveLength(2);
    expect(r.attempts.map((a) => a.model)).toEqual(['qwen-x', 'glm-x']); // diverse providers, in pool order
  });

  it('should leave attempt.model undefined for single-model best-of-k (no candidateProviders)', async () => {
    chatMock.mockResolvedValue(localReply('PASS'));
    const exec = new FreeTierEscalatingExecutor({ ladder: defaultFreeTierLadder('qwen3:8b') });

    const r = await exec.execute(task({ bestOfK: 2 }));

    expect(r.attempts[0].model).toBeUndefined();
  });
});
