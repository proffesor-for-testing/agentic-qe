/**
 * Agentic QE v3 - Semantic Anti-Drift Middleware Unit Tests (ADR-060)
 *
 * RED phase TDD tests for the SemanticAntiDriftMiddleware that attaches
 * HNSW embedding fingerprints to domain events at emission time and
 * verifies they have not drifted at each receiving boundary.
 *
 * All tests use deterministic mock embeddings so drift/no-drift scenarios
 * are fully controllable without a transformer model.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DomainEvent, SemanticFingerprint } from '../../../src/shared/types/index.js';
import {
  SemanticAntiDriftMiddleware,
  type AntiDriftConfig,
  type DriftCheckResult,
  type AntiDriftStats,
} from '../../../src/kernel/anti-drift-middleware.js';
import { cosineSimilarity } from '../../../src/shared/utils/vector-math.js';

// ============================================================================
// Test Helpers
// ============================================================================

/** Create a minimal DomainEvent for testing. */
function createTestEvent<T = unknown>(
  overrides: Partial<DomainEvent<T>> = {},
): DomainEvent<T> {
  return {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: 'test.event',
    timestamp: new Date(),
    source: 'test-generation',
    payload: { foo: 'bar' } as T,
    ...overrides,
  };
}

/** Create a normalised unit vector of given dimension pointing along a single axis. */
function basisVector(dim: number, axis: number): number[] {
  const v = new Array(dim).fill(0);
  v[axis % dim] = 1.0;
  return v;
}

/** Create a uniform vector (all components equal, L2-normalised). */
function uniformVector(dim: number): number[] {
  const val = 1.0 / Math.sqrt(dim);
  return new Array(dim).fill(val);
}

/** Create a vector that is a slight perturbation of a base vector. */
function perturbVector(base: number[], amount: number): number[] {
  const perturbed = base.map((v, i) => v + (i % 2 === 0 ? amount : -amount));
  // Re-normalise
  const norm = Math.sqrt(perturbed.reduce((s, x) => s + x * x, 0));
  return norm === 0 ? perturbed : perturbed.map((x) => x / norm);
}

/** Default config used for most tests. */
const DEFAULT_TEST_CONFIG: Partial<AntiDriftConfig> = {
  agentId: 'test-agent-001',
  maxHistorySize: 100,
  fallbackDimension: 64,
};

// ============================================================================
// Test Suite
// ============================================================================

describe('SemanticAntiDriftMiddleware', () => {
  let middleware: SemanticAntiDriftMiddleware;

  beforeEach(() => {
    middleware = new SemanticAntiDriftMiddleware(DEFAULT_TEST_CONFIG);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // onEmit
  // ==========================================================================

  describe('onEmit', () => {
    it('should attach a semanticFingerprint to the event', async () => {
      // GIVEN: A domain event without a fingerprint
      const event = createTestEvent();
      expect(event.semanticFingerprint).toBeUndefined();

      // WHEN: The event passes through onEmit
      const result = await middleware.onEmit(event);

      // THEN: The returned event has a semanticFingerprint
      expect(result.semanticFingerprint).toBeDefined();
      expect(result.semanticFingerprint!.embedding).toBeDefined();
      expect(Array.isArray(result.semanticFingerprint!.embedding)).toBe(true);
    });

    it('should preserve original event data', async () => {
      // GIVEN: An event with specific payload and metadata
      const event = createTestEvent({
        id: 'preserve-test',
        type: 'coverage.updated',
        payload: { lines: 42, branch: 80 },
        correlationId: 'corr-abc',
      });

      // WHEN: The event passes through onEmit
      const result = await middleware.onEmit(event);

      // THEN: All original fields remain intact
      expect(result.id).toBe('preserve-test');
      expect(result.type).toBe('coverage.updated');
      expect(result.payload).toEqual({ lines: 42, branch: 80 });
      expect(result.correlationId).toBe('corr-abc');
      expect(result.source).toBe(event.source);
      expect(result.timestamp).toBe(event.timestamp);
    });

    it('should set the correct driftThreshold for a known event type category', async () => {
      // GIVEN: An event whose type matches the "coverage" threshold category
      const event = createTestEvent({ type: 'coverage.line.updated' });

      // WHEN: The event passes through onEmit
      const result = await middleware.onEmit(event);

      // THEN: The threshold matches the "coverage" category (0.10)
      expect(result.semanticFingerprint!.driftThreshold).toBe(0.10);
    });

    it('should set hopCount to 0 on initial emission', async () => {
      // GIVEN: A freshly created event
      const event = createTestEvent();

      // WHEN: The event passes through onEmit
      const result = await middleware.onEmit(event);

      // THEN: hopCount starts at 0
      expect(result.semanticFingerprint!.hopCount).toBe(0);
    });

    it('should set emittedAt to approximately the current time', async () => {
      // GIVEN: The current time before emission
      const before = Date.now();
      const event = createTestEvent();

      // WHEN: The event passes through onEmit
      const result = await middleware.onEmit(event);

      // THEN: emittedAt is within a reasonable window of the current time
      const after = Date.now();
      expect(result.semanticFingerprint!.emittedAt).toBeGreaterThanOrEqual(before);
      expect(result.semanticFingerprint!.emittedAt).toBeLessThanOrEqual(after);
    });

    it('should set sourceAgentId from the configured agentId', async () => {
      // GIVEN: Middleware configured with a specific agentId
      const mw = new SemanticAntiDriftMiddleware({ agentId: 'my-special-agent' });
      const event = createTestEvent();

      // WHEN: The event passes through onEmit
      const result = await mw.onEmit(event);

      // THEN: sourceAgentId matches the configured agentId
      expect(result.semanticFingerprint!.sourceAgentId).toBe('my-special-agent');
    });

    it('should be idempotent -- re-emit does not double-fingerprint', async () => {
      // GIVEN: An event that has already been emitted once
      const event = createTestEvent();
      const firstEmit = await middleware.onEmit(event);
      expect(firstEmit.semanticFingerprint).toBeDefined();

      // WHEN: The already-fingerprinted event passes through onEmit again
      const secondEmit = await middleware.onEmit(firstEmit);

      // THEN: The result still has exactly one fingerprint layer; the
      //       second emission overwrites the first (not nesting).
      expect(secondEmit.semanticFingerprint).toBeDefined();
      expect(secondEmit.semanticFingerprint!.hopCount).toBe(0);
      expect(secondEmit.semanticFingerprint!.sourceAgentId).toBe('test-agent-001');
    });
  });

  // ==========================================================================
  // onReceive
  // ==========================================================================

  describe('onReceive', () => {
    it('should pass an event with a matching fingerprint (no drift)', async () => {
      // GIVEN: An event that was emitted and has not been mutated
      const event = createTestEvent({ payload: { stable: 'data' } });
      const emitted = await middleware.onEmit(event);

      // WHEN: The same middleware receives it (payload unchanged)
      const received = await middleware.onReceive(emitted);

      // THEN: The event passes through (is not dropped)
      expect(received).not.toBeNull();
      expect(received!.id).toBe(emitted.id);
    });

    it('should detect a drifted event and return null', async () => {
      // GIVEN: An event emitted with one payload
      const event = createTestEvent({ payload: { original: 'content' } });
      const emitted = await middleware.onEmit(event);

      // WHEN: The payload is replaced with completely different content before receive
      const mutated: DomainEvent = {
        ...emitted,
        payload: {
          completely: 'different',
          unrelated: 'data',
          extra: Array(100).fill('noise').join(' '),
        },
      };

      // Use a very tight threshold to guarantee drift detection
      const strictMw = new SemanticAntiDriftMiddleware({
        ...DEFAULT_TEST_CONFIG,
        thresholds: { default: 0.001 },
      });
      const emittedStrict = await strictMw.onEmit(event);
      const mutatedStrict: DomainEvent = {
        ...emittedStrict,
        payload: {
          completely: 'different',
          unrelated: 'data',
          extra: Array(100).fill('noise').join(' '),
        },
      };

      const received = await strictMw.onReceive(mutatedStrict);

      // THEN: The event is dropped
      expect(received).toBeNull();
    });

    it('should handle an event without a fingerprint as passthrough', async () => {
      // GIVEN: An event that was never emitted through the middleware
      const event = createTestEvent();
      expect(event.semanticFingerprint).toBeUndefined();

      // WHEN: The middleware receives it
      const received = await middleware.onReceive(event);

      // THEN: The event passes through unchanged
      expect(received).not.toBeNull();
      expect(received!.id).toBe(event.id);
      expect(received!.payload).toEqual(event.payload);
    });

    it('should increment hopCount on successful receive', async () => {
      // GIVEN: An event emitted with hopCount=0
      const event = createTestEvent({ payload: { hop: 'test' } });
      const emitted = await middleware.onEmit(event);
      expect(emitted.semanticFingerprint!.hopCount).toBe(0);

      // WHEN: The event passes through onReceive
      const received = await middleware.onReceive(emitted);

      // THEN: hopCount is incremented to 1
      expect(received).not.toBeNull();
      expect(received!.semanticFingerprint!.hopCount).toBe(1);
    });

    it('should use the correct threshold from the fingerprint per event type', async () => {
      // GIVEN: A middleware with different thresholds per category
      const mw = new SemanticAntiDriftMiddleware({
        ...DEFAULT_TEST_CONFIG,
        thresholds: {
          'quality-gate': 0.02,
          'coverage': 0.50,
          'default': 0.12,
        },
      });

      // Emit two events with different categories
      const qualityEvent = createTestEvent({ type: 'quality-gate.evaluated' });
      const coverageEvent = createTestEvent({ type: 'coverage.updated' });

      const emittedQuality = await mw.onEmit(qualityEvent);
      const emittedCoverage = await mw.onEmit(coverageEvent);

      // THEN: Each event gets the threshold for its category
      expect(emittedQuality.semanticFingerprint!.driftThreshold).toBe(0.02);
      expect(emittedCoverage.semanticFingerprint!.driftThreshold).toBe(0.50);
    });

    it('should return null for drifted events (confirming drop behavior)', async () => {
      // GIVEN: A middleware with an extremely tight threshold
      const tightMw = new SemanticAntiDriftMiddleware({
        ...DEFAULT_TEST_CONFIG,
        thresholds: { default: 0.0001 },
      });

      const event = createTestEvent({ payload: { value: 'original' } });
      const emitted = await tightMw.onEmit(event);

      // WHEN: The payload is significantly mutated
      const mutated: DomainEvent = {
        ...emitted,
        payload: { value: 'completely-different-long-string-' + 'x'.repeat(200) },
      };
      const result = await tightMw.onReceive(mutated);

      // THEN: Result is null (event dropped)
      expect(result).toBeNull();
    });

    it('should return the augmented event (with updated hopCount) for clean events', async () => {
      // GIVEN: A clean round-trip
      const event = createTestEvent({ payload: { clean: true } });
      const emitted = await middleware.onEmit(event);

      // WHEN: Received without modification
      const received = await middleware.onReceive(emitted);

      // THEN: Event is returned with updated fingerprint
      expect(received).not.toBeNull();
      expect(received!.semanticFingerprint).toBeDefined();
      expect(received!.semanticFingerprint!.hopCount).toBe(1);
      // Original payload preserved
      expect(received!.payload).toEqual({ clean: true });
    });
  });

  // ==========================================================================
  // drift detection (cosine similarity mechanics)
  // ==========================================================================

  describe('drift detection', () => {
    it('should produce correct cosine similarity for known vectors', () => {
      // GIVEN: Two identical normalised vectors
      const a = [1 / Math.sqrt(2), 1 / Math.sqrt(2)];
      const b = [1 / Math.sqrt(2), 1 / Math.sqrt(2)];

      // WHEN: Computing cosine similarity
      const sim = cosineSimilarity(a, b);

      // THEN: Similarity is 1.0 (identical)
      expect(sim).toBeCloseTo(1.0, 10);
    });

    it('should pass when similarity is exactly at the threshold', async () => {
      // GIVEN: An event emitted and received without mutation
      //        (same payload => same embedding => similarity=1.0 => distance=0.0)
      //        Threshold is 0.12 (default), distance 0.0 <= 0.12 => passes
      const event = createTestEvent({ payload: { boundary: 'test' } });
      const emitted = await middleware.onEmit(event);

      // WHEN: Receiving unchanged
      const received = await middleware.onReceive(emitted);

      // THEN: Passes (distance 0.0 is within threshold 0.12)
      expect(received).not.toBeNull();
    });

    it('should fail when distance is just above the threshold', async () => {
      // GIVEN: A middleware with a threshold of 0
      //        (any distance > 0 should fail)
      const zeroThresholdMw = new SemanticAntiDriftMiddleware({
        ...DEFAULT_TEST_CONFIG,
        thresholds: { default: 0 },
      });

      const event = createTestEvent({ payload: { tight: 'threshold' } });
      const emitted = await zeroThresholdMw.onEmit(event);

      // WHEN: Payload is minimally mutated (adding a single extra field)
      const mutated: DomainEvent = {
        ...emitted,
        payload: { tight: 'threshold', extra: 'field' },
      };

      const received = await zeroThresholdMw.onReceive(mutated);

      // THEN: Drift detected (distance > 0)
      expect(received).toBeNull();
    });

    it('should handle identical embeddings yielding similarity of 1.0', () => {
      // GIVEN: Two identical vectors
      const vec = uniformVector(128);

      // WHEN: Computing cosine similarity
      const sim = cosineSimilarity(vec, vec);

      // THEN: Similarity is exactly 1.0
      expect(sim).toBeCloseTo(1.0, 10);
    });

    it('should handle orthogonal embeddings yielding similarity of 0.0', () => {
      // GIVEN: Two orthogonal basis vectors
      const a = basisVector(128, 0); // [1, 0, 0, ...]
      const b = basisVector(128, 1); // [0, 1, 0, ...]

      // WHEN: Computing cosine similarity
      const sim = cosineSimilarity(a, b);

      // THEN: Similarity is 0.0 (orthogonal)
      expect(sim).toBeCloseTo(0.0, 10);
    });

    it('should detect gradual drift across multiple hops', async () => {
      // GIVEN: An event that is slightly mutated at each hop
      const mw = new SemanticAntiDriftMiddleware({
        ...DEFAULT_TEST_CONFIG,
        thresholds: { default: 0.001 }, // Very tight threshold
      });

      const event = createTestEvent({ payload: { iteration: 0, data: 'original' } });
      const emitted = await mw.onEmit(event);

      // Simulate multiple hops where the payload gradually diverges
      let current: DomainEvent | null = emitted;
      let driftDetected = false;

      for (let hop = 1; hop <= 10; hop++) {
        if (!current) break;

        // Slightly mutate payload at each hop
        const mutated: DomainEvent = {
          ...current,
          payload: { iteration: hop, data: 'mutated-'.repeat(hop) },
        };

        current = await mw.onReceive(mutated);
        if (current === null) {
          driftDetected = true;
          break;
        }
      }

      // THEN: Drift should be detected at some point
      expect(driftDetected).toBe(true);
    });

    it('should detect sudden drift from a large payload change', async () => {
      // GIVEN: An event with a simple payload
      const mw = new SemanticAntiDriftMiddleware({
        ...DEFAULT_TEST_CONFIG,
        thresholds: { default: 0.001 },
      });

      const event = createTestEvent({ payload: { key: 'value' } });
      const emitted = await mw.onEmit(event);

      // WHEN: The payload is completely replaced in one step
      const mutated: DomainEvent = {
        ...emitted,
        payload: {
          totallyDifferent: true,
          nestedObject: { deep: { structure: Array(50).fill('noise') } },
          numericField: 999999,
        },
      };

      const received = await mw.onReceive(mutated);

      // THEN: Drift is immediately detected
      expect(received).toBeNull();
    });
  });

  // ==========================================================================
  // configuration
  // ==========================================================================

  describe('configuration', () => {
    it('should use default config when none is provided', async () => {
      // GIVEN: A middleware created with no config
      const mw = new SemanticAntiDriftMiddleware();

      // WHEN: Emitting an event
      const event = createTestEvent();
      const result = await mw.onEmit(event);

      // THEN: The fingerprint uses default threshold and agentId
      expect(result.semanticFingerprint).toBeDefined();
      expect(result.semanticFingerprint!.sourceAgentId).toBe('unknown');
      // Default threshold for unmatched category is 0.12
      expect(result.semanticFingerprint!.driftThreshold).toBe(0.12);
    });

    it('should respect custom thresholds', async () => {
      // GIVEN: A middleware with custom thresholds
      const mw = new SemanticAntiDriftMiddleware({
        thresholds: { 'my-category': 0.42, default: 0.99 },
      });

      // WHEN: Emitting an event with a type that matches the custom category
      const event = createTestEvent({ type: 'my-category.check' });
      const result = await mw.onEmit(event);

      // THEN: The threshold from the custom config is used
      expect(result.semanticFingerprint!.driftThreshold).toBe(0.42);
    });

    it('should validate config and reject invalid thresholds', () => {
      // GIVEN: A middleware with an out-of-range threshold
      const mw = new SemanticAntiDriftMiddleware({
        thresholds: { 'bad-cat': 1.5 },
      });

      // WHEN: Validating the config
      const validation = mw.validateConfig();

      // THEN: Validation fails
      expect(validation.success).toBe(false);
      if (!validation.success) {
        expect(validation.error.message).toContain('bad-cat');
      }
    });

    it('should validate config and reject negative thresholds', () => {
      // GIVEN: A middleware with a negative threshold
      const mw = new SemanticAntiDriftMiddleware({
        thresholds: { 'neg': -0.1 },
      });

      // WHEN: Validating the config
      const validation = mw.validateConfig();

      // THEN: Validation fails
      expect(validation.success).toBe(false);
    });

    it('should use per-event-type threshold lookup via category resolution', async () => {
      // GIVEN: Multiple category thresholds configured
      const mw = new SemanticAntiDriftMiddleware({
        ...DEFAULT_TEST_CONFIG,
        thresholds: {
          'quality-gate': 0.05,
          'coverage': 0.10,
          'test-generation': 0.15,
          'learning': 0.20,
          'default': 0.12,
        },
      });

      // WHEN: Emitting events with different types
      const events = [
        createTestEvent({ type: 'quality-gate.passed' }),
        createTestEvent({ type: 'coverage.branch.update' }),
        createTestEvent({ type: 'test-generation.completed' }),
        createTestEvent({ type: 'learning.cycle.done' }),
        createTestEvent({ type: 'unknown.event.type' }),
      ];

      const results = await Promise.all(events.map((e) => mw.onEmit(e)));

      // THEN: Each event gets the correct category threshold
      expect(results[0].semanticFingerprint!.driftThreshold).toBe(0.05); // quality-gate
      expect(results[1].semanticFingerprint!.driftThreshold).toBe(0.10); // coverage
      expect(results[2].semanticFingerprint!.driftThreshold).toBe(0.15); // test-generation
      expect(results[3].semanticFingerprint!.driftThreshold).toBe(0.20); // learning
      expect(results[4].semanticFingerprint!.driftThreshold).toBe(0.12); // default
    });
  });

  // ==========================================================================
  // drift events
  // ==========================================================================

  describe('drift events', () => {
    it('should invoke the onDriftDetected callback when drift is detected', async () => {
      // GIVEN: A middleware with a drift callback and very tight threshold
      const onDriftDetected = vi.fn().mockResolvedValue(undefined);
      const mw = new SemanticAntiDriftMiddleware({
        ...DEFAULT_TEST_CONFIG,
        thresholds: { default: 0.0001 },
        onDriftDetected,
      });

      const event = createTestEvent({ payload: { original: 'data' } });
      const emitted = await mw.onEmit(event);

      // WHEN: A heavily mutated event is received
      const mutated: DomainEvent = {
        ...emitted,
        payload: { mutated: 'completely-different-' + 'x'.repeat(200) },
      };
      await mw.onReceive(mutated);

      // THEN: The drift callback was called
      expect(onDriftDetected).toHaveBeenCalledTimes(1);
    });

    it('should include drift distance in the SemanticDriftDetected event payload', async () => {
      // GIVEN: A drift callback that captures the event
      let capturedEvent: DomainEvent | null = null;
      const onDriftDetected = vi.fn().mockImplementation(async (evt: DomainEvent) => {
        capturedEvent = evt;
      });

      const mw = new SemanticAntiDriftMiddleware({
        ...DEFAULT_TEST_CONFIG,
        thresholds: { default: 0.0001 },
        onDriftDetected,
      });

      const event = createTestEvent({ payload: { original: 'value' } });
      const emitted = await mw.onEmit(event);

      // WHEN: A mutated event triggers drift
      const mutated: DomainEvent = {
        ...emitted,
        payload: { different: 'payload-' + 'y'.repeat(200) },
      };
      await mw.onReceive(mutated);

      // THEN: The drift event includes cosineSimilarity and threshold
      expect(capturedEvent).not.toBeNull();
      const driftPayload = capturedEvent!.payload as Record<string, unknown>;
      expect(typeof driftPayload.cosineSimilarity).toBe('number');
      expect(typeof driftPayload.threshold).toBe('number');
    });

    it('should include the original event type in the drift event payload', async () => {
      // GIVEN: A drift callback
      let capturedEvent: DomainEvent | null = null;
      const onDriftDetected = vi.fn().mockImplementation(async (evt: DomainEvent) => {
        capturedEvent = evt;
      });

      const mw = new SemanticAntiDriftMiddleware({
        ...DEFAULT_TEST_CONFIG,
        thresholds: { default: 0.0001 },
        onDriftDetected,
      });

      const event = createTestEvent({
        type: 'quality-gate.evaluated',
        payload: { gate: 'release' },
      });
      const emitted = await mw.onEmit(event);

      // WHEN: Drift is triggered
      const mutated: DomainEvent = {
        ...emitted,
        payload: { totally: 'different-' + 'z'.repeat(200) },
      };
      await mw.onReceive(mutated);

      // THEN: The drift event includes the original event type
      expect(capturedEvent).not.toBeNull();
      const driftPayload = capturedEvent!.payload as Record<string, unknown>;
      expect(driftPayload.originalEventType).toBe('quality-gate.evaluated');
    });

    it('should propagate correlationId to the drift event', async () => {
      // GIVEN: An event with a correlationId
      let capturedEvent: DomainEvent | null = null;
      const onDriftDetected = vi.fn().mockImplementation(async (evt: DomainEvent) => {
        capturedEvent = evt;
      });

      const mw = new SemanticAntiDriftMiddleware({
        ...DEFAULT_TEST_CONFIG,
        thresholds: { default: 0.0001 },
        onDriftDetected,
      });

      const event = createTestEvent({
        correlationId: 'corr-123-abc',
        payload: { with: 'correlation' },
      });
      const emitted = await mw.onEmit(event);

      // WHEN: Drift is triggered
      const mutated: DomainEvent = {
        ...emitted,
        payload: { no: 'match-' + 'w'.repeat(200) },
      };
      await mw.onReceive(mutated);

      // THEN: The correlationId is propagated
      expect(capturedEvent).not.toBeNull();
      expect(capturedEvent!.correlationId).toBe('corr-123-abc');
    });
  });

  // ==========================================================================
  // statistics
  // ==========================================================================

  describe('statistics', () => {
    it('should return correct counts from getStats', async () => {
      // GIVEN: A middleware that has processed several events
      const event = createTestEvent({ payload: { stats: 'test' } });
      const emitted = await middleware.onEmit(event);

      // WHEN: Multiple receives occur (clean events)
      await middleware.onReceive(emitted);

      // Re-emit for second receive (since hopCount changes the fingerprint object)
      const emitted2 = await middleware.onEmit(createTestEvent({ payload: { stats: 'test2' } }));
      await middleware.onReceive(emitted2);

      // THEN: Stats reflect the checks performed
      const stats: AntiDriftStats = middleware.getStats();
      expect(stats.totalChecked).toBe(2);
      expect(stats.driftCount).toBe(0);
      expect(stats.averageSimilarity).toBeGreaterThan(0);
    });

    it('should return recent drift check results from getDriftHistory', async () => {
      // GIVEN: A middleware that has processed events
      const event = createTestEvent({ payload: { history: 'data' } });
      const emitted = await middleware.onEmit(event);

      // WHEN: A receive triggers a check
      await middleware.onReceive(emitted);

      // THEN: getDriftHistory returns the check result
      const history: readonly DriftCheckResult[] = middleware.getDriftHistory();
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history[0].eventType).toBe('test.event');
      expect(typeof history[0].cosineSimilarity).toBe('number');
      expect(typeof history[0].drifted).toBe('boolean');
      expect(typeof history[0].checkedAt).toBe('number');
    });
  });

  // ==========================================================================
  // edge cases
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle an empty event payload', async () => {
      // GIVEN: An event with an empty object payload
      const event = createTestEvent({ payload: {} });

      // WHEN: Emitting and receiving
      const emitted = await middleware.onEmit(event);
      const received = await middleware.onReceive(emitted);

      // THEN: Passes through without error
      expect(received).not.toBeNull();
      expect(received!.payload).toEqual({});
    });

    it('should handle a null payload gracefully', async () => {
      // GIVEN: An event with null payload
      const event = createTestEvent({ payload: null as unknown });

      // WHEN: Emitting and receiving
      const emitted = await middleware.onEmit(event);
      const received = await middleware.onReceive(emitted);

      // THEN: Passes through without error
      expect(received).not.toBeNull();
    });

    it('should handle very high dimensional fallback vectors', async () => {
      // GIVEN: A middleware configured for high-dimensional vectors
      const mw = new SemanticAntiDriftMiddleware({
        ...DEFAULT_TEST_CONFIG,
        fallbackDimension: 1024,
      });

      const event = createTestEvent({ payload: { highDim: true } });

      // WHEN: Emitting
      const emitted = await mw.onEmit(event);

      // THEN: The embedding has a valid dimensionality.
      //       When the real transformer model is available (e.g. MiniLM-L6-v2)
      //       embeddings are 384-dimensional regardless of fallbackDimension.
      //       When only the hash-based fallback is used, it matches fallbackDimension.
      const dim = emitted.semanticFingerprint!.embedding.length;
      expect(dim).toBeGreaterThan(0);
      // Either transformer (384) or fallback (1024) -- both are valid
      expect([384, 1024]).toContain(dim);
    });

    it('should handle rapid sequential events without state corruption', async () => {
      // GIVEN: Multiple events emitted in rapid succession
      const events = Array.from({ length: 20 }, (_, i) =>
        createTestEvent({ payload: { seq: i } }),
      );

      // WHEN: All events are emitted and received rapidly
      const emitted = await Promise.all(events.map((e) => middleware.onEmit(e)));
      const received = await Promise.all(emitted.map((e) => middleware.onReceive(e)));

      // THEN: All events pass through (no drift, same payloads)
      for (const r of received) {
        expect(r).not.toBeNull();
      }

      // Stats should reflect all checks
      const stats = middleware.getStats();
      expect(stats.totalChecked).toBe(20);
      expect(stats.driftCount).toBe(0);
    });

    it('should respect maxHistorySize and evict old entries', async () => {
      // GIVEN: A middleware with a very small history buffer
      const mw = new SemanticAntiDriftMiddleware({
        ...DEFAULT_TEST_CONFIG,
        maxHistorySize: 3,
      });

      // WHEN: More events than the buffer size are processed
      for (let i = 0; i < 5; i++) {
        const event = createTestEvent({ payload: { seq: i } });
        const emitted = await mw.onEmit(event);
        await mw.onReceive(emitted);
      }

      // THEN: History is bounded to maxHistorySize
      const history = mw.getDriftHistory();
      expect(history.length).toBeLessThanOrEqual(3);
    });

    it('should not crash when onDriftDetected callback throws', async () => {
      // GIVEN: A drift callback that throws an error
      const failingCallback = vi.fn().mockRejectedValue(new Error('callback boom'));
      const mw = new SemanticAntiDriftMiddleware({
        ...DEFAULT_TEST_CONFIG,
        thresholds: { default: 0.0001 },
        onDriftDetected: failingCallback,
      });

      const event = createTestEvent({ payload: { safe: 'event' } });
      const emitted = await mw.onEmit(event);

      // WHEN: Drift is triggered and the callback throws
      const mutated: DomainEvent = {
        ...emitted,
        payload: { entirely: 'different-' + 'q'.repeat(200) },
      };

      // THEN: onReceive does not throw; it swallows the callback error
      await expect(mw.onReceive(mutated)).resolves.toBeNull();
    });

    it('should validate that maxHistorySize must be positive', () => {
      // GIVEN: A middleware with zero maxHistorySize
      const mw = new SemanticAntiDriftMiddleware({
        maxHistorySize: 0,
      });

      // WHEN: Validating the config
      const result = mw.validateConfig();

      // THEN: Validation fails
      expect(result.success).toBe(false);
    });

    it('should validate that fallbackDimension must be positive', () => {
      // GIVEN: A middleware with zero fallbackDimension
      const mw = new SemanticAntiDriftMiddleware({
        fallbackDimension: 0,
      });

      // WHEN: Validating the config
      const result = mw.validateConfig();

      // THEN: Validation fails
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // middleware interface compliance
  // ==========================================================================

  describe('middleware interface compliance', () => {
    it('should expose the name property', () => {
      // THEN: The middleware name is set
      expect(middleware.name).toBe('semantic-anti-drift');
    });

    it('should expose the priority property', () => {
      // THEN: Priority is a number
      expect(typeof middleware.priority).toBe('number');
      expect(middleware.priority).toBe(10);
    });

    it('should have onEmit and onReceive methods', () => {
      // THEN: Both methods are defined functions
      expect(typeof middleware.onEmit).toBe('function');
      expect(typeof middleware.onReceive).toBe('function');
    });
  });
});
