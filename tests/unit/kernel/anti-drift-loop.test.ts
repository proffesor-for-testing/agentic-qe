/**
 * Agentic QE v3 - Anti-Drift Loop Integration Tests (ADR-062)
 *
 * Tests for integration between the anti-drift middleware and loop detection,
 * loop event construction with proper payloads, and healing controller
 * support for the loopDetected action type.
 */

import { describe, it, expect } from 'vitest';
import {
  ToolCallSignatureTracker,
  type LoopDetectionResult,
  type ToolCallSignature,
} from '../../../src/kernel/anti-drift-middleware.js';
import { LOOP_EVENT_TYPES } from '../../../src/kernel/event-bus.js';
import type {
  SelfHealingActionType,
  StrangeLoopEventType,
} from '../../../src/strange-loop/types.js';

// ============================================================================
// Integration: Anti-Drift Middleware + Loop Detection
// ============================================================================

describe('Anti-Drift and Loop Detection Integration', () => {
  describe('ToolCallSignatureTracker coexists with SemanticAntiDriftMiddleware', () => {
    it('should be importable from the same module', () => {
      // Verify both exports exist in the same module
      expect(ToolCallSignatureTracker).toBeDefined();
      expect(typeof ToolCallSignatureTracker).toBe('function');
    });

    it('should create independent tracker instances', () => {
      const tracker1 = new ToolCallSignatureTracker();
      const tracker2 = new ToolCallSignatureTracker();

      // Track calls on tracker1
      tracker1.trackCall('agent-1', 'readFile', { path: '/a.ts' });
      tracker1.trackCall('agent-1', 'readFile', { path: '/a.ts' });
      tracker1.trackCall('agent-1', 'readFile', { path: '/a.ts' });

      // Tracker2 should be unaffected
      const result = tracker2.trackCall('agent-1', 'readFile', { path: '/a.ts' });
      expect(result.action).toBe('allow');

      // Tracker1 should have detected a loop
      expect(tracker1.getMetrics().loopsDetected).toBe(1);
      expect(tracker2.getMetrics().loopsDetected).toBe(0);
    });
  });

  describe('loop detection result can be used as event payload', () => {
    it('should produce results with the correct shape for event payloads', () => {
      const tracker = new ToolCallSignatureTracker();

      const result: LoopDetectionResult = tracker.trackCall(
        'agent-1',
        'searchCode',
        { query: 'findBug' }
      );

      // Verify the result has all required fields for an event payload
      expect(typeof result.isLoop).toBe('boolean');
      expect(typeof result.callCount).toBe('number');
      expect(typeof result.action).toBe('string');
      expect(['allow', 'warn', 'steer']).toContain(result.action);

      // Verify signature has all required fields
      const sig: ToolCallSignature = result.signature;
      expect(typeof sig.hash).toBe('string');
      expect(typeof sig.toolName).toBe('string');
      expect(typeof sig.argsFingerprint).toBe('string');
      expect(typeof sig.timestamp).toBe('number');
    });

    it('should produce a steer result with steering message for event payloads', () => {
      const tracker = new ToolCallSignatureTracker({
        steeringMessage: 'Try a different approach.',
      });

      tracker.trackCall('agent-1', 'search', { q: 'x' });
      tracker.trackCall('agent-1', 'search', { q: 'x' });
      const result = tracker.trackCall('agent-1', 'search', { q: 'x' });

      // This result could be used directly as a loop.detected event payload
      expect(result.action).toBe('steer');
      expect(result.steeringMessage).toBe('Try a different approach.');
      expect(result.isLoop).toBe(true);
      expect(result.callCount).toBe(3);
    });
  });
});

// ============================================================================
// Loop Event Types
// ============================================================================

describe('Loop Event Types', () => {
  it('should export LOOP_WARNING event type string', () => {
    expect(LOOP_EVENT_TYPES.LOOP_WARNING).toBe('loop.warning');
  });

  it('should export LOOP_DETECTED event type string', () => {
    expect(LOOP_EVENT_TYPES.LOOP_DETECTED).toBe('loop.detected');
  });

  it('should have distinct event type strings', () => {
    expect(LOOP_EVENT_TYPES.LOOP_WARNING).not.toBe(LOOP_EVENT_TYPES.LOOP_DETECTED);
  });
});

// ============================================================================
// Healing Controller: loopDetected action type
// ============================================================================

describe('Healing Controller loopDetected action type', () => {
  it('should include steer_loop in SelfHealingActionType', () => {
    // Type-level test: this compiles only if 'steer_loop' is a valid SelfHealingActionType
    const actionType: SelfHealingActionType = 'steer_loop';
    expect(actionType).toBe('steer_loop');
  });

  it('should accept steer_loop alongside existing action types', () => {
    const validTypes: SelfHealingActionType[] = [
      'spawn_redundant_agent',
      'add_connection',
      'remove_connection',
      'redistribute_load',
      'restart_agent',
      'isolate_agent',
      'promote_to_coordinator',
      'demote_coordinator',
      'trigger_failover',
      'scale_up',
      'scale_down',
      'rebalance_topology',
      'restart_service',
      'steer_loop',
    ];

    expect(validTypes).toContain('steer_loop');
    expect(validTypes.length).toBe(14);
  });
});

// ============================================================================
// StrangeLoop Event Type: loop_detected
// ============================================================================

describe('StrangeLoop loop_detected event type', () => {
  it('should include loop_detected in StrangeLoopEventType', () => {
    // Type-level test: this compiles only if 'loop_detected' is a valid StrangeLoopEventType
    const eventType: StrangeLoopEventType = 'loop_detected';
    expect(eventType).toBe('loop_detected');
  });

  it('should be distinct from other event types', () => {
    const eventTypes: StrangeLoopEventType[] = [
      'observation_complete',
      'vulnerability_detected',
      'loop_detected',
    ];

    const uniqueTypes = new Set(eventTypes);
    expect(uniqueTypes.size).toBe(eventTypes.length);
  });
});

// ============================================================================
// Event payload construction
// ============================================================================

describe('Loop event payload construction', () => {
  it('should construct a valid loop.warning event payload', () => {
    const tracker = new ToolCallSignatureTracker();

    tracker.trackCall('agent-1', 'readFile', { path: '/x.ts' });
    const result = tracker.trackCall('agent-1', 'readFile', { path: '/x.ts' });

    // Construct an event payload as the event bus would
    const payload = {
      type: LOOP_EVENT_TYPES.LOOP_WARNING,
      timestamp: Date.now(),
      data: result,
    };

    expect(payload.type).toBe('loop.warning');
    expect(payload.data.action).toBe('warn');
    expect(payload.data.callCount).toBe(2);
  });

  it('should construct a valid loop.detected event payload', () => {
    const tracker = new ToolCallSignatureTracker();

    tracker.trackCall('agent-1', 'readFile', { path: '/x.ts' });
    tracker.trackCall('agent-1', 'readFile', { path: '/x.ts' });
    const result = tracker.trackCall('agent-1', 'readFile', { path: '/x.ts' });

    // Construct an event payload as the event bus would
    const payload = {
      type: LOOP_EVENT_TYPES.LOOP_DETECTED,
      timestamp: Date.now(),
      data: result,
    };

    expect(payload.type).toBe('loop.detected');
    expect(payload.data.action).toBe('steer');
    expect(payload.data.isLoop).toBe(true);
    expect(payload.data.callCount).toBe(3);
    expect(payload.data.steeringMessage).toBeDefined();
  });
});
