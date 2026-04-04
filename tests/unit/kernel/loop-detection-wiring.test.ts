/**
 * Agentic QE v3 - Loop Detection Wiring Tests (ADR-062)
 *
 * Verifies the full production chain:
 *   checkToolCall() -> trackCall() -> EventBus event -> healing controller
 *
 * London School TDD: EventBus and healing controller are mocked so we can
 * verify interactions in isolation without booting the full kernel.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QEKernelImpl } from '../../../src/kernel/kernel.js';
import { LOOP_EVENT_TYPES, InMemoryEventBus } from '../../../src/kernel/event-bus.js';
import type { LoopDetectionResult } from '../../../src/kernel/anti-drift-middleware.js';
import type { DomainEvent } from '../../../src/shared/types/index.js';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a kernel configured for in-memory testing (no filesystem I/O).
 * We do NOT call initialize() — the tracker and event bus are ready
 * immediately after construction.
 */
function createTestKernel(): QEKernelImpl {
  return new QEKernelImpl({
    memoryBackend: 'memory',
    lazyLoading: true,
    enabledDomains: [],
  });
}

/** Helper to save/restore an env var around a block. */
function withEnv(key: string, value: string | undefined, fn: () => void): void {
  const original = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
  try {
    fn();
  } finally {
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('ADR-062: Loop Detection Wiring', () => {
  let kernel: QEKernelImpl;

  beforeEach(() => {
    delete process.env.AQE_LOOP_DETECTION_ENABLED;
    kernel = createTestKernel();
  });

  afterEach(() => {
    delete process.env.AQE_LOOP_DETECTION_ENABLED;
  });

  // ==========================================================================
  // checkToolCall delegates to tracker
  // ==========================================================================

  describe('checkToolCall delegates to ToolCallSignatureTracker', () => {
    it('should return allow on first call', () => {
      const result = kernel.checkToolCall('agent-1', 'readFile', { path: '/foo.ts' });

      expect(result.action).toBe('allow');
      expect(result.isLoop).toBe(false);
      expect(result.callCount).toBe(1);
    });

    it('should return warn on second identical call', () => {
      kernel.checkToolCall('agent-1', 'readFile', { path: '/foo.ts' });
      const result = kernel.checkToolCall('agent-1', 'readFile', { path: '/foo.ts' });

      expect(result.action).toBe('warn');
      expect(result.callCount).toBe(2);
    });

    it('should return steer on third identical call', () => {
      kernel.checkToolCall('agent-1', 'readFile', { path: '/foo.ts' });
      kernel.checkToolCall('agent-1', 'readFile', { path: '/foo.ts' });
      const result = kernel.checkToolCall('agent-1', 'readFile', { path: '/foo.ts' });

      expect(result.action).toBe('steer');
      expect(result.isLoop).toBe(true);
      expect(result.callCount).toBe(3);
      expect(result.steeringMessage).toBeDefined();
    });
  });

  // ==========================================================================
  // Event publishing
  // ==========================================================================

  describe('event publishing to EventBus', () => {
    it('should publish LOOP_WARNING on second identical call', async () => {
      const publishedEvents: DomainEvent[] = [];
      const eventBus = kernel.eventBus as InMemoryEventBus;
      eventBus.subscribe(LOOP_EVENT_TYPES.LOOP_WARNING, async (event: DomainEvent) => {
        publishedEvents.push(event);
      });

      kernel.checkToolCall('agent-1', 'readFile', { path: '/foo.ts' });
      kernel.checkToolCall('agent-1', 'readFile', { path: '/foo.ts' });

      // Allow micro-task queue to flush (publish is fire-and-forget)
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0].type).toBe(LOOP_EVENT_TYPES.LOOP_WARNING);
      expect(publishedEvents[0].payload).toMatchObject({
        agentId: 'agent-1',
        toolName: 'readFile',
        callCount: 2,
      });
    });

    it('should publish LOOP_DETECTED on third identical call', async () => {
      const publishedEvents: DomainEvent[] = [];
      const eventBus = kernel.eventBus as InMemoryEventBus;
      eventBus.subscribe(LOOP_EVENT_TYPES.LOOP_DETECTED, async (event: DomainEvent) => {
        publishedEvents.push(event);
      });

      kernel.checkToolCall('agent-1', 'readFile', { path: '/foo.ts' });
      kernel.checkToolCall('agent-1', 'readFile', { path: '/foo.ts' });
      kernel.checkToolCall('agent-1', 'readFile', { path: '/foo.ts' });

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0].type).toBe(LOOP_EVENT_TYPES.LOOP_DETECTED);
      expect(publishedEvents[0].payload).toMatchObject({
        agentId: 'agent-1',
        toolName: 'readFile',
        callCount: 3,
      });
      expect((publishedEvents[0].payload as Record<string, unknown>).steeringMessage).toBeDefined();
    });

    it('should NOT publish any event on first call (allow)', async () => {
      const publishedEvents: DomainEvent[] = [];
      const eventBus = kernel.eventBus as InMemoryEventBus;
      eventBus.subscribe('*', async (event: DomainEvent) => {
        if (event.type === LOOP_EVENT_TYPES.LOOP_WARNING ||
            event.type === LOOP_EVENT_TYPES.LOOP_DETECTED) {
          publishedEvents.push(event);
        }
      });

      kernel.checkToolCall('agent-1', 'readFile', { path: '/foo.ts' });

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(publishedEvents).toHaveLength(0);
    });

    it('should include correlationId matching agentId', async () => {
      const publishedEvents: DomainEvent[] = [];
      const eventBus = kernel.eventBus as InMemoryEventBus;
      eventBus.subscribe(LOOP_EVENT_TYPES.LOOP_DETECTED, async (event: DomainEvent) => {
        publishedEvents.push(event);
      });

      for (let i = 0; i < 3; i++) {
        kernel.checkToolCall('agent-42', 'bash', { cmd: 'ls' });
      }

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0].correlationId).toBe('agent-42');
    });
  });

  // ==========================================================================
  // Healing controller subscription
  // ==========================================================================

  describe('healing controller integration via EventBus subscription', () => {
    it('should allow healing controller to subscribe to LOOP_DETECTED events', async () => {
      // Simulate the healing controller subscription pattern:
      // In production, the StrangeLoop or kernel subscribes to LOOP_DETECTED
      // and routes to handleLoopDetected() or the healing controller's steer_loop action.
      const healingInvocations: Array<{ agentId: string; toolName: string; callCount: number }> = [];

      const eventBus = kernel.eventBus as InMemoryEventBus;
      eventBus.subscribe(LOOP_EVENT_TYPES.LOOP_DETECTED, async (event: DomainEvent) => {
        const payload = event.payload as {
          agentId: string;
          toolName: string;
          callCount: number;
          steeringMessage?: string;
        };

        // This simulates what the healing controller's steer_loop handler does
        healingInvocations.push({
          agentId: payload.agentId,
          toolName: payload.toolName,
          callCount: payload.callCount,
        });
      });

      // Trigger loop detection
      for (let i = 0; i < 3; i++) {
        kernel.checkToolCall('agent-loop', 'search', { query: 'same thing' });
      }

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(healingInvocations).toHaveLength(1);
      expect(healingInvocations[0]).toEqual({
        agentId: 'agent-loop',
        toolName: 'search',
        callCount: 3,
      });
    });

    it('should trigger healing on every subsequent steer (4th, 5th call)', async () => {
      const healingInvocations: unknown[] = [];

      const eventBus = kernel.eventBus as InMemoryEventBus;
      eventBus.subscribe(LOOP_EVENT_TYPES.LOOP_DETECTED, async (event: DomainEvent) => {
        healingInvocations.push(event.payload);
      });

      // 5 identical calls: allow, warn, steer, steer, steer
      for (let i = 0; i < 5; i++) {
        kernel.checkToolCall('agent-1', 'readFile', { path: '/x.ts' });
      }

      await new Promise(resolve => setTimeout(resolve, 10));

      // Calls 3, 4, 5 should each fire LOOP_DETECTED
      expect(healingInvocations).toHaveLength(3);
    });
  });

  // ==========================================================================
  // Feature flag
  // ==========================================================================

  describe('feature flag integration', () => {
    it('should NOT publish events when feature flag is disabled', async () => {
      const publishedEvents: DomainEvent[] = [];
      const eventBus = kernel.eventBus as InMemoryEventBus;
      eventBus.subscribe('*', async (event: DomainEvent) => {
        publishedEvents.push(event);
      });

      withEnv('AQE_LOOP_DETECTION_ENABLED', 'false', () => {
        // Make 5 identical calls — all should be suppressed
        for (let i = 0; i < 5; i++) {
          const result = kernel.checkToolCall('agent-1', 'readFile', { path: '/foo.ts' });
          expect(result.action).toBe('allow');
        }
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      // Filter to only loop events
      const loopEvents = publishedEvents.filter(
        e => e.type === LOOP_EVENT_TYPES.LOOP_WARNING || e.type === LOOP_EVENT_TYPES.LOOP_DETECTED
      );
      expect(loopEvents).toHaveLength(0);
    });

    it('should publish events when feature flag is not set (default enabled)', async () => {
      delete process.env.AQE_LOOP_DETECTION_ENABLED;
      const publishedEvents: DomainEvent[] = [];
      const eventBus = kernel.eventBus as InMemoryEventBus;
      eventBus.subscribe(LOOP_EVENT_TYPES.LOOP_DETECTED, async (event: DomainEvent) => {
        publishedEvents.push(event);
      });

      for (let i = 0; i < 3; i++) {
        kernel.checkToolCall('agent-1', 'readFile', { path: '/foo.ts' });
      }

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(publishedEvents).toHaveLength(1);
    });
  });

  // ==========================================================================
  // loopTracker accessor
  // ==========================================================================

  describe('loopTracker accessor', () => {
    it('should expose the ToolCallSignatureTracker instance', () => {
      expect(kernel.loopTracker).toBeDefined();
      expect(typeof kernel.loopTracker.trackCall).toBe('function');
      expect(typeof kernel.loopTracker.getMetrics).toBe('function');
      expect(typeof kernel.loopTracker.clear).toBe('function');
    });

    it('should reflect calls made through checkToolCall in tracker metrics', () => {
      kernel.checkToolCall('agent-1', 'readFile', { path: '/foo.ts' });
      kernel.checkToolCall('agent-1', 'readFile', { path: '/foo.ts' });
      kernel.checkToolCall('agent-1', 'readFile', { path: '/foo.ts' });

      const metrics = kernel.loopTracker.getMetrics();
      expect(metrics.totalCallsTracked).toBe(3);
      expect(metrics.loopsDetected).toBe(1);
    });
  });

  // ==========================================================================
  // Full chain: trackCall -> event -> subscriber (end-to-end wiring)
  // ==========================================================================

  describe('full chain: trackCall -> EventBus -> healing subscriber', () => {
    it('should complete the full ADR-062 chain for a detected loop', async () => {
      // 1. Set up a mock healing handler subscribed to LOOP_DETECTED
      const mockHealingHandler = vi.fn();
      const eventBus = kernel.eventBus as InMemoryEventBus;
      eventBus.subscribe(LOOP_EVENT_TYPES.LOOP_DETECTED, mockHealingHandler);

      // 2. Drive the tracker through the 3-strike sequence
      const r1 = kernel.checkToolCall('agent-a', 'writeFile', { content: 'x' });
      expect(r1.action).toBe('allow');

      const r2 = kernel.checkToolCall('agent-a', 'writeFile', { content: 'x' });
      expect(r2.action).toBe('warn');

      const r3 = kernel.checkToolCall('agent-a', 'writeFile', { content: 'x' });
      expect(r3.action).toBe('steer');
      expect(r3.isLoop).toBe(true);

      // 3. Wait for async event delivery
      await new Promise(resolve => setTimeout(resolve, 10));

      // 4. Verify the healing handler was invoked with the right payload
      expect(mockHealingHandler).toHaveBeenCalledTimes(1);
      const event = mockHealingHandler.mock.calls[0][0] as DomainEvent;
      expect(event.type).toBe(LOOP_EVENT_TYPES.LOOP_DETECTED);
      expect(event.payload).toMatchObject({
        agentId: 'agent-a',
        toolName: 'writeFile',
        callCount: 3,
      });
      expect((event.payload as Record<string, unknown>).steeringMessage).toBeDefined();
    });

    it('should warn before steering in the full chain', async () => {
      const warningHandler = vi.fn();
      const steerHandler = vi.fn();
      const eventBus = kernel.eventBus as InMemoryEventBus;
      eventBus.subscribe(LOOP_EVENT_TYPES.LOOP_WARNING, warningHandler);
      eventBus.subscribe(LOOP_EVENT_TYPES.LOOP_DETECTED, steerHandler);

      // 3 identical calls
      kernel.checkToolCall('agent-b', 'search', { q: 'test' });
      kernel.checkToolCall('agent-b', 'search', { q: 'test' });
      kernel.checkToolCall('agent-b', 'search', { q: 'test' });

      await new Promise(resolve => setTimeout(resolve, 10));

      // Warning fires on call 2, steer fires on call 3
      expect(warningHandler).toHaveBeenCalledTimes(1);
      expect(steerHandler).toHaveBeenCalledTimes(1);

      // Verify ordering: warning payload has callCount 2, steer has 3
      const warnPayload = (warningHandler.mock.calls[0][0] as DomainEvent).payload as Record<string, unknown>;
      const steerPayload = (steerHandler.mock.calls[0][0] as DomainEvent).payload as Record<string, unknown>;
      expect(warnPayload.callCount).toBe(2);
      expect(steerPayload.callCount).toBe(3);
    });
  });
});
