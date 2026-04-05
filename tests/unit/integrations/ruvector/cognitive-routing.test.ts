/**
 * Agentic QE v3 — Cognitive Routing Unit Tests (ADR-087 Milestone 5, R13)
 *
 * Tests for CognitiveRouter: send/receive round-trip, delta compression,
 * bandwidth reduction, multi-stream routing, stats, and feature flags.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CognitiveRouter,
  MessagePredictor,
  OscillatoryRouter,
  createCognitiveRouter,
} from '../../../../src/integrations/ruvector/cognitive-routing';
import {
  setRuVectorFeatureFlags,
  resetRuVectorFeatureFlags,
} from '../../../../src/integrations/ruvector/feature-flags';

describe('CognitiveRouter', () => {
  let router: CognitiveRouter;

  beforeEach(() => {
    setRuVectorFeatureFlags({ useCognitiveRouting: true });
    router = new CognitiveRouter();
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
  });

  // 1. Send/receive round-trip preserves payload
  it('should preserve payload through send/receive round-trip', () => {
    const payload = { action: 'test', value: 42, nested: { a: 1 } };

    const msg = router.send('s1', 'agent-a', 'agent-b', payload);
    const received = router.receive(msg);

    // First message is never compressed (no prediction history)
    expect(msg.compressed).toBe(false);
    expect(received).toEqual(payload);
  });

  // 2. Repeated similar messages achieve compression
  it('should compress repeated similar messages (compressedSize < originalSize)', () => {
    const streamId = 'stream-1';

    // First message: establishes baseline (not compressed)
    const msg1 = router.send(streamId, 'a', 'b', {
      type: 'status',
      cpu: 50,
      memory: 1024,
      disk: 500,
      extra: 'some-long-value-that-wont-change',
    });
    expect(msg1.compressed).toBe(false);

    // Second message: only cpu changes — should be delta-compressed
    const msg2 = router.send(streamId, 'a', 'b', {
      type: 'status',
      cpu: 55,
      memory: 1024,
      disk: 500,
      extra: 'some-long-value-that-wont-change',
    });

    expect(msg2.compressed).toBe(true);
    expect(msg2.compressedSize).toBeLessThan(msg2.originalSize);
  });

  // 3. Bandwidth reduction > 50% on repetitive traffic
  it('should achieve > 50% bandwidth reduction on repetitive traffic', () => {
    const streamId = 'perf-stream';
    const basePayload = {
      type: 'heartbeat',
      agentId: 'agent-001',
      status: 'active',
      uptime: 1000,
      tasks: 5,
      queue: 0,
      version: '3.9.0',
      hostname: 'qe-worker-pool-east-1a-node-07.internal.cluster.local',
      region: 'us-east-1',
      capabilities: 'test-execution,coverage-analysis,defect-prediction',
    };

    // Send 20 messages with only minor field changes
    for (let i = 0; i < 20; i++) {
      router.send(streamId, 'a', 'b', {
        ...basePayload,
        uptime: 1000 + i,
        tasks: 5 + (i % 3),
      });
    }

    const stats = router.getStats();
    expect(stats.totalMessages).toBe(20);
    expect(stats.compressedMessages).toBeGreaterThan(0);
    expect(stats.bandwidthReductionPercent).toBeGreaterThan(50);
  });

  // 4. Multiple concurrent streams routed correctly
  it('should handle multiple concurrent streams independently', () => {
    router.addStream('s1');
    router.addStream('s2');

    // Different payloads on different streams
    const msg1a = router.send('s1', 'a', 'b', { stream: 1, count: 1 });
    const msg2a = router.send('s2', 'c', 'd', { stream: 2, count: 100 });

    expect(msg1a.streamId).toBe('s1');
    expect(msg2a.streamId).toBe('s2');

    // Second messages on each stream
    const msg1b = router.send('s1', 'a', 'b', { stream: 1, count: 2 });
    const msg2b = router.send('s2', 'c', 'd', { stream: 2, count: 101 });

    // Receive and verify
    const recv1b = router.receive(msg1b) as Record<string, unknown>;
    const recv2b = router.receive(msg2b) as Record<string, unknown>;

    expect(recv1b.stream).toBe(1);
    expect(recv1b.count).toBe(2);
    expect(recv2b.stream).toBe(2);
    expect(recv2b.count).toBe(101);
  });

  // 5. Stats tracking accurate
  it('should track stats accurately', () => {
    const stats0 = router.getStats();
    expect(stats0.totalMessages).toBe(0);
    expect(stats0.compressedMessages).toBe(0);
    expect(stats0.bandwidthSavedBytes).toBe(0);
    expect(stats0.bandwidthReductionPercent).toBe(0);

    router.send('s1', 'a', 'b', { x: 1 });
    router.send('s1', 'a', 'b', { x: 2 });

    const stats1 = router.getStats();
    expect(stats1.totalMessages).toBe(2);
    expect(stats1.bandwidthSavedBytes).toBeGreaterThanOrEqual(0);
  });

  // 6. Feature flag disabled -> factory returns null
  it('should return null from factory when feature flag is disabled', () => {
    setRuVectorFeatureFlags({ useCognitiveRouting: false });
    const result = createCognitiveRouter();
    expect(result).toBeNull();
  });

  // 7. Feature flag enabled -> factory returns instance
  it('should return CognitiveRouter from factory when feature flag is enabled', () => {
    setRuVectorFeatureFlags({ useCognitiveRouting: true });
    const result = createCognitiveRouter();
    expect(result).toBeInstanceOf(CognitiveRouter);
  });

  // 8. Empty/null payload handled
  it('should handle empty object payload', () => {
    const msg = router.send('s1', 'a', 'b', {});
    const received = router.receive(msg);
    expect(received).toEqual({});
  });

  it('should handle null payload', () => {
    const msg = router.send('s1', 'a', 'b', null);
    const received = router.receive(msg);
    expect(received).toBeNull();
  });

  it('should handle non-object payload without compression', () => {
    const msg = router.send('s1', 'a', 'b', 'hello');
    expect(msg.compressed).toBe(false);
    const received = router.receive(msg);
    expect(received).toBe('hello');
  });

  // 9. Stream add/remove works
  it('should add and remove streams', () => {
    router.addStream('s1');
    router.addStream('s2');
    expect(router.getStats().activeStreams).toBe(2);

    router.removeStream('s1');
    expect(router.getStats().activeStreams).toBe(1);
  });
});

describe('MessagePredictor', () => {
  it('should return null for unknown stream', () => {
    const predictor = new MessagePredictor(5);
    expect(predictor.predict('unknown')).toBeNull();
  });

  it('should predict last payload structure', () => {
    const predictor = new MessagePredictor(5);
    predictor.record('s1', { a: 1, b: 2 });
    const prediction = predictor.predict('s1');
    expect(prediction).toEqual({ a: 1, b: 2 });
  });

  it('should maintain sliding window', () => {
    const predictor = new MessagePredictor(2);
    predictor.record('s1', { v: 1 });
    predictor.record('s1', { v: 2 });
    predictor.record('s1', { v: 3 });
    // Window should only contain last 2
    const prediction = predictor.predict('s1');
    expect(prediction).toEqual({ v: 3 });
  });
});

describe('OscillatoryRouter', () => {
  it('should round-robin through streams', () => {
    const osc = new OscillatoryRouter(4, 100);
    osc.addStream('a');
    osc.addStream('b');
    osc.addStream('c');

    expect(osc.nextStream()).toBe('a');
    expect(osc.nextStream()).toBe('b');
    expect(osc.nextStream()).toBe('c');
    expect(osc.nextStream()).toBe('a');
  });

  it('should return null when no streams', () => {
    const osc = new OscillatoryRouter(4, 100);
    expect(osc.nextStream()).toBeNull();
  });

  it('should reject streams beyond max', () => {
    const osc = new OscillatoryRouter(2, 100);
    expect(osc.addStream('a')).toBe(true);
    expect(osc.addStream('b')).toBe(true);
    expect(osc.addStream('c')).toBe(false);
  });

  it('should not add duplicate streams', () => {
    const osc = new OscillatoryRouter(4, 100);
    expect(osc.addStream('a')).toBe(true);
    expect(osc.addStream('a')).toBe(false);
  });
});
