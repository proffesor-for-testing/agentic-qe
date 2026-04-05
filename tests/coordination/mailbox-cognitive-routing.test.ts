/**
 * Tests for R13: Cognitive Routing Compression in MailboxService
 * Verifies that when cognitive routing is enabled, messages are compressed
 * on send() and transparently decompressed on receive().
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MailboxService, createMailboxService } from '../../src/coordination/agent-teams/mailbox.js';
import type { AgentMessage } from '../../src/coordination/agent-teams/types.js';
import {
  isCognitiveRoutingEnabled,
  createCognitiveRouter,
  CognitiveRouter,
} from '../../src/integrations/ruvector/cognitive-routing.js';

// Mock the cognitive-routing module so we can control the feature flag
vi.mock('../../src/integrations/ruvector/cognitive-routing.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/integrations/ruvector/cognitive-routing.js')>();
  return {
    ...actual,
    isCognitiveRoutingEnabled: vi.fn(actual.isCognitiveRoutingEnabled),
    createCognitiveRouter: vi.fn(actual.createCognitiveRouter),
  };
});

// Typed handles to the mocked functions
const mockEnabled = vi.mocked(isCognitiveRoutingEnabled);
const mockCreate = vi.mocked(createCognitiveRouter);

/** Build a minimal AgentMessage for testing */
function makeMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: overrides.id ?? `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    from: overrides.from ?? 'agent-sender',
    to: overrides.to ?? 'agent-receiver',
    domain: overrides.domain ?? 'test-generation',
    type: overrides.type ?? 'finding',
    payload: overrides.payload ?? { data: 'test-payload' },
    timestamp: overrides.timestamp ?? Date.now(),
    correlationId: overrides.correlationId,
    replyTo: overrides.replyTo,
    ttl: overrides.ttl,
  };
}

describe('MailboxService - cognitive routing compression', () => {
  let svc: MailboxService;

  beforeEach(() => {
    svc = createMailboxService();
    svc.createMailbox('sender', 'dom');
    svc.createMailbox('receiver', 'dom');
    // Default: routing disabled (matches production default)
    mockEnabled.mockReturnValue(false);
    mockCreate.mockReturnValue(null);
  });

  afterEach(() => {
    mockEnabled.mockReset();
    mockCreate.mockReset();
  });

  it('should pass messages through unchanged when routing is disabled', () => {
    const payload = { status: 'running', count: 42, details: 'some data' };
    const msg = makeMessage({ to: 'receiver', payload });

    svc.send(msg);
    const received = svc.receive('receiver');

    expect(received).toHaveLength(1);
    expect(received[0].payload).toEqual(payload);
    expect(svc.getCognitiveRoutingStats()).toBeNull();
  });

  it('should compress on send and decompress on receive when routing is enabled', () => {
    const router = new CognitiveRouter();
    mockEnabled.mockReturnValue(true);
    mockCreate.mockReturnValue(router);

    // Verify mock is working: stats should be available after first send
    // (ensureCognitiveRouter will be called and should use the mock)

    // First message seeds the predictor - no compression expected
    const basePayload = {
      status: 'running',
      count: 1,
      agent: 'tester',
      details: 'long repeated content that stays the same across messages',
    };
    const msg1 = makeMessage({ id: 'msg-1', to: 'receiver', payload: basePayload });
    svc.send(msg1);

    // The router should have been initialized - stats should be non-null
    const earlyStats = svc.getCognitiveRoutingStats();
    expect(earlyStats).not.toBeNull();
    expect(earlyStats!.totalMessages).toBe(1);

    svc.receive('receiver'); // drain to mark as read

    // Second message differs only slightly - delta compression should kick in
    const updatedPayload = { ...basePayload, count: 2 };
    const msg2 = makeMessage({ id: 'msg-2', to: 'receiver', payload: updatedPayload });
    svc.send(msg2);

    // Verify the stored message has compressed payload (via mailbox snapshot)
    const snapshot = svc.getMailbox('receiver');
    expect(snapshot).toBeDefined();
    const storedMsg = snapshot!.messages.find(m => m.id === 'msg-2');
    expect(storedMsg).toBeDefined();

    // The stored payload should be a delta envelope, not the original
    const storedPayload = storedMsg!.payload as Record<string, unknown>;
    expect(storedPayload.__delta).toBe(true);
    expect(storedPayload.__changes).toBeDefined();

    // The delta payload should be smaller than the original
    const storedSize = JSON.stringify(storedPayload).length;
    const originalSize = JSON.stringify(updatedPayload).length;
    expect(storedSize).toBeLessThan(originalSize);

    // But receive() should decompress and return the original payload
    const received = svc.receive('receiver');
    expect(received).toHaveLength(1);
    expect(received[0].payload).toEqual(updatedPayload);

    // Stats should show real savings
    const stats = svc.getCognitiveRoutingStats();
    expect(stats).not.toBeNull();
    expect(stats!.totalMessages).toBeGreaterThanOrEqual(2);
    expect(stats!.compressedMessages).toBeGreaterThanOrEqual(1);
    expect(stats!.bandwidthSavedBytes).toBeGreaterThan(0);
  });

  it('should fall back to original message when router.send() throws', () => {
    const router = new CognitiveRouter();
    mockEnabled.mockReturnValue(true);
    mockCreate.mockReturnValue(router);
    vi.spyOn(router, 'send').mockImplementation(() => {
      throw new Error('boom');
    });

    const payload = { key: 'value' };
    const msg = makeMessage({ to: 'receiver', payload });
    svc.send(msg);

    const received = svc.receive('receiver');
    expect(received).toHaveLength(1);
    expect(received[0].payload).toEqual(payload);
  });

  it('should store original when compression does not save space', () => {
    const router = new CognitiveRouter();
    mockEnabled.mockReturnValue(true);
    mockCreate.mockReturnValue(router);

    // First message has no prior prediction, so no compression
    const payload = { x: 1, y: 2 };
    const msg = makeMessage({ to: 'receiver', payload });
    svc.send(msg);

    const received = svc.receive('receiver');
    expect(received).toHaveLength(1);
    expect(received[0].payload).toEqual(payload);
  });

  it('should clean up compressed message tracking on message expiration', () => {
    const router = new CognitiveRouter();
    mockEnabled.mockReturnValue(true);
    mockCreate.mockReturnValue(router);

    const basePayload = {
      status: 'running',
      count: 1,
      details: 'long repeated content that stays the same across messages',
    };
    // Seed the predictor
    svc.send(makeMessage({ id: 'seed', to: 'receiver', payload: basePayload }));
    svc.receive('receiver');

    // Send a compressible message with old timestamp
    const oldMsg = makeMessage({
      id: 'old-compressed',
      to: 'receiver',
      payload: { ...basePayload, count: 2 },
      timestamp: Date.now() - 100_000,
    });
    svc.send(oldMsg);

    // Cleanup with short maxAge - should remove the old message
    const removed = svc.cleanup(1000);
    expect(removed).toBeGreaterThanOrEqual(1);
  });

  it('should deliver original payload to onMessage handlers even when compressed', () => {
    const router = new CognitiveRouter();
    mockEnabled.mockReturnValue(true);
    mockCreate.mockReturnValue(router);

    const handler = vi.fn();
    svc.onMessage('receiver', handler);

    const payload = { data: 'test' };
    const msg = makeMessage({ to: 'receiver', payload });
    svc.send(msg);

    // The handler receives the original message (not the compressed one)
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].payload).toEqual(payload);
  });
});
