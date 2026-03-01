/**
 * ADR-052 Action A4.3: WASM Fallback Handler Tests
 *
 * Verifies:
 * 1. Fallback activates on WASM failure
 * 2. degraded_mode event is emitted
 * 3. Retry logic works with exponential backoff
 * 4. Execution never blocks
 * 5. Recovery emits recovered event
 *
 * Note: These tests use direct state manipulation to test fallback behavior
 * since the real WASM module may or may not be available.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WasmLoader } from '../../../../src/integrations/coherence/wasm-loader';
import type {
  FallbackResult,
  FallbackState,
  WasmLoaderEventData,
} from '../../../../src/integrations/coherence/types';

describe('ADR-052 A4.3: WASM Fallback Handler', () => {
  let loader: WasmLoader;

  beforeEach(() => {
    // Use fake timers for testing exponential backoff
    vi.useFakeTimers();

    // Create fresh loader for each test
    loader = new WasmLoader({
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 5000,
      timeoutMs: 1000,
    });

    // Suppress console output during tests
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    loader.reset();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Requirement 1: Log warning on WASM load failure', () => {
    it('should log warning when entering degraded mode', () => {
      const warnSpy = vi.spyOn(console, 'warn');

      // Directly call enterDegradedMode to simulate WASM failure
      const enterDegradedMode = (loader as unknown as {
        enterDegradedMode: (error: Error) => void;
      }).enterDegradedMode.bind(loader);

      enterDegradedMode(new Error('WASM module not found'));

      // Verify warning was logged
      expect(warnSpy).toHaveBeenCalled();
      const warningCall = warnSpy.mock.calls.find((call) =>
        call[0].includes('[WasmLoader] WASM load failed')
      );
      expect(warningCall).toBeDefined();
      expect(warningCall![0]).toContain('entering degraded mode');
    });

    it('should include retry information in warning', () => {
      const warnSpy = vi.spyOn(console, 'warn');

      const enterDegradedMode = (loader as unknown as {
        enterDegradedMode: (error: Error) => void;
      }).enterDegradedMode.bind(loader);

      enterDegradedMode(new Error('Test error'));

      const warningCall = warnSpy.mock.calls.find((call) =>
        call[0].includes('[WasmLoader]')
      );
      expect(warningCall![0]).toContain('Retry');
      expect(warningCall![0]).toContain('1000ms');
    });
  });

  describe('Requirement 2: Return coherent result with low confidence and usedFallback flag', () => {
    it('should return FallbackResult with usedFallback: true and confidence: 0.5', () => {
      // Simulate failed state
      (loader as unknown as { state: string }).state = 'degraded';
      (loader as unknown as { lastError: Error }).lastError = new Error('Test error');
      (loader as unknown as { fallbackState: FallbackState }).fallbackState = {
        mode: 'fallback',
        consecutiveFailures: 2,
        totalActivations: 1,
      };

      const result = loader.getFallbackResult();

      expect(result.usedFallback).toBe(true);
      expect(result.confidence).toBe(0.5);
      expect(result.retryCount).toBe(2);
      expect(result.lastError).toBe('Test error');
    });

    it('getFallbackResult should include activatedAt timestamp', () => {
      const now = new Date();
      (loader as unknown as { state: string }).state = 'degraded';
      (loader as unknown as { degradedModeStartTime: Date }).degradedModeStartTime = now;
      (loader as unknown as { fallbackState: FallbackState }).fallbackState = {
        mode: 'fallback',
        consecutiveFailures: 1,
        totalActivations: 1,
      };

      const result = loader.getFallbackResult();

      expect(result.activatedAt).toBe(now);
    });

    it('getEnginesWithFallback should return immediately in degraded mode', async () => {
      // Set loader to degraded mode
      (loader as unknown as { state: string }).state = 'degraded';
      (loader as unknown as { fallbackState: FallbackState }).fallbackState = {
        mode: 'fallback',
        consecutiveFailures: 1,
        totalActivations: 1,
      };

      const startTime = Date.now();
      const { engines, fallback } = await loader.getEnginesWithFallback();
      const elapsed = Date.now() - startTime;

      // Should return almost immediately
      expect(elapsed).toBeLessThan(50);
      expect(engines).toBeNull();
      expect(fallback.usedFallback).toBe(true);
      expect(fallback.confidence).toBe(0.5);
    });
  });

  describe('Requirement 3: Emit degraded_mode event via EventBus', () => {
    it('should emit degraded_mode event when entering degraded mode', () => {
      const degradedModeHandler = vi.fn();
      loader.on('degraded_mode', degradedModeHandler);

      const enterDegradedMode = (loader as unknown as {
        enterDegradedMode: (error: Error) => void;
      }).enterDegradedMode.bind(loader);

      enterDegradedMode(new Error('WASM module not found'));

      expect(degradedModeHandler).toHaveBeenCalled();
      const eventData = degradedModeHandler.mock.calls[0][0] as WasmLoaderEventData['degraded_mode'];
      expect(eventData.reason).toContain('WASM load failed');
      expect(eventData.retryCount).toBe(1);
      expect(eventData.activatedAt).toBeInstanceOf(Date);
    });

    it('should include lastError in degraded_mode event', () => {
      const degradedModeHandler = vi.fn();
      loader.on('degraded_mode', degradedModeHandler);

      const enterDegradedMode = (loader as unknown as {
        enterDegradedMode: (error: Error) => void;
      }).enterDegradedMode.bind(loader);

      enterDegradedMode(new Error('Specific error message'));

      const eventData = degradedModeHandler.mock.calls[0][0] as WasmLoaderEventData['degraded_mode'];
      expect(eventData.lastError).toBe('Specific error message');
    });

    it('should include nextRetryAt in degraded_mode event', () => {
      const degradedModeHandler = vi.fn();
      loader.on('degraded_mode', degradedModeHandler);

      const enterDegradedMode = (loader as unknown as {
        enterDegradedMode: (error: Error) => void;
      }).enterDegradedMode.bind(loader);

      enterDegradedMode(new Error('Test error'));

      const eventData = degradedModeHandler.mock.calls[0][0] as WasmLoaderEventData['degraded_mode'];
      expect(eventData.nextRetryAt).toBeInstanceOf(Date);
      expect(eventData.nextRetryAt!.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('Requirement 4: Retry WASM load with exponential backoff (1s/2s/4s)', () => {
    it('should schedule first retry with 1s delay', () => {
      const degradedModeHandler = vi.fn();
      loader.on('degraded_mode', degradedModeHandler);

      const enterDegradedMode = (loader as unknown as {
        enterDegradedMode: (error: Error) => void;
      }).enterDegradedMode.bind(loader);

      enterDegradedMode(new Error('Error 1'));

      const eventData = degradedModeHandler.mock.calls[0][0] as WasmLoaderEventData['degraded_mode'];
      const delay = eventData.nextRetryAt!.getTime() - Date.now();
      expect(delay).toBeCloseTo(1000, -2); // Within 100ms
    });

    it('should schedule second retry with 2s delay', () => {
      const degradedModeHandler = vi.fn();
      loader.on('degraded_mode', degradedModeHandler);

      const enterDegradedMode = (loader as unknown as {
        enterDegradedMode: (error: Error) => void;
      }).enterDegradedMode.bind(loader);

      // First failure
      enterDegradedMode(new Error('Error 1'));
      // Second failure
      enterDegradedMode(new Error('Error 2'));

      const eventData = degradedModeHandler.mock.calls[1][0] as WasmLoaderEventData['degraded_mode'];
      const delay = eventData.nextRetryAt!.getTime() - Date.now();
      expect(delay).toBeCloseTo(2000, -2); // Within 100ms
    });

    it('should schedule third retry with 4s delay', () => {
      const degradedModeHandler = vi.fn();
      loader.on('degraded_mode', degradedModeHandler);

      const enterDegradedMode = (loader as unknown as {
        enterDegradedMode: (error: Error) => void;
      }).enterDegradedMode.bind(loader);

      // Three failures
      enterDegradedMode(new Error('Error 1'));
      enterDegradedMode(new Error('Error 2'));
      enterDegradedMode(new Error('Error 3'));

      const eventData = degradedModeHandler.mock.calls[2][0] as WasmLoaderEventData['degraded_mode'];
      const delay = eventData.nextRetryAt!.getTime() - Date.now();
      expect(delay).toBeCloseTo(4000, -2); // Within 100ms
    });

    it('should track consecutiveFailures correctly', () => {
      const enterDegradedMode = (loader as unknown as {
        enterDegradedMode: (error: Error) => void;
      }).enterDegradedMode.bind(loader);

      enterDegradedMode(new Error('Error 1'));
      expect(loader.getFallbackState().consecutiveFailures).toBe(1);

      enterDegradedMode(new Error('Error 2'));
      expect(loader.getFallbackState().consecutiveFailures).toBe(2);

      enterDegradedMode(new Error('Error 3'));
      expect(loader.getFallbackState().consecutiveFailures).toBe(3);
    });

    it('should increment totalActivations', () => {
      const enterDegradedMode = (loader as unknown as {
        enterDegradedMode: (error: Error) => void;
      }).enterDegradedMode.bind(loader);

      enterDegradedMode(new Error('Error 1'));
      expect(loader.getFallbackState().totalActivations).toBe(1);

      // Reset and enter again
      loader.reset();
      enterDegradedMode(new Error('Error 2'));
      // After reset, totalActivations should be 1 again
      expect(loader.getFallbackState().totalActivations).toBe(1);
    });
  });

  describe('Requirement 5: Never block execution due to WASM failure', () => {
    it('getEnginesWithFallback should return immediately when in degraded mode', async () => {
      // Set loader to degraded mode
      (loader as unknown as { state: string }).state = 'degraded';
      (loader as unknown as { fallbackState: FallbackState }).fallbackState = {
        mode: 'fallback',
        consecutiveFailures: 1,
        totalActivations: 1,
      };

      const startTime = Date.now();
      const { engines, fallback } = await loader.getEnginesWithFallback();
      const elapsed = Date.now() - startTime;

      // Should return almost immediately (no waiting for WASM)
      expect(elapsed).toBeLessThan(50);
      expect(engines).toBeNull();
      expect(fallback.usedFallback).toBe(true);
    });

    it('getFallbackResult should be synchronous', () => {
      (loader as unknown as { state: string }).state = 'degraded';
      (loader as unknown as { fallbackState: FallbackState }).fallbackState = {
        mode: 'fallback',
        consecutiveFailures: 1,
        totalActivations: 1,
      };

      // This should be synchronous - no Promise returned
      const result = loader.getFallbackResult();

      expect(result).toBeDefined();
      expect(result.usedFallback).toBe(true);
    });

    it('isInDegradedMode should be synchronous', () => {
      (loader as unknown as { state: string }).state = 'degraded';

      // Synchronous check
      const isDegraded = loader.isInDegradedMode();

      expect(isDegraded).toBe(true);
    });
  });

  describe('Recovery from degraded mode', () => {
    it('should emit recovered event when recovery is triggered', () => {
      const recoveredHandler = vi.fn();
      loader.on('recovered', recoveredHandler);

      // Set up degraded mode state
      (loader as unknown as { degradedModeStartTime: Date }).degradedModeStartTime = new Date(
        Date.now() - 5000
      );
      (loader as unknown as { fallbackState: FallbackState }).fallbackState = {
        mode: 'fallback',
        consecutiveFailures: 2,
        totalActivations: 1,
      };
      (loader as unknown as { version: string }).version = '1.0.0';

      // Call private method to emit recovery
      const emitRecoveryEvent = (loader as unknown as {
        emitRecoveryEvent: () => void;
      }).emitRecoveryEvent.bind(loader);

      emitRecoveryEvent();

      expect(recoveredHandler).toHaveBeenCalled();
      const eventData = recoveredHandler.mock.calls[0][0] as WasmLoaderEventData['recovered'];
      expect(eventData.degradedDurationMs).toBeGreaterThanOrEqual(5000);
      expect(eventData.retryCount).toBe(2);
      expect(eventData.version).toBe('1.0.0');
    });

    it('recovery event should include correct version', () => {
      const recoveredHandler = vi.fn();
      loader.on('recovered', recoveredHandler);

      (loader as unknown as { degradedModeStartTime: Date }).degradedModeStartTime = new Date();
      (loader as unknown as { fallbackState: FallbackState }).fallbackState = {
        mode: 'fallback',
        consecutiveFailures: 1,
        totalActivations: 1,
      };
      (loader as unknown as { version: string }).version = '2.0.0-test';

      const emitRecoveryEvent = (loader as unknown as {
        emitRecoveryEvent: () => void;
      }).emitRecoveryEvent.bind(loader);

      emitRecoveryEvent();

      const eventData = recoveredHandler.mock.calls[0][0] as WasmLoaderEventData['recovered'];
      expect(eventData.version).toBe('2.0.0-test');
    });

    it('should log info when recovering', () => {
      const infoSpy = vi.spyOn(console, 'info');

      (loader as unknown as { degradedModeStartTime: Date }).degradedModeStartTime = new Date(
        Date.now() - 1000
      );
      (loader as unknown as { fallbackState: FallbackState }).fallbackState = {
        mode: 'fallback',
        consecutiveFailures: 1,
        totalActivations: 1,
      };

      const emitRecoveryEvent = (loader as unknown as {
        emitRecoveryEvent: () => void;
      }).emitRecoveryEvent.bind(loader);

      emitRecoveryEvent();

      expect(infoSpy).toHaveBeenCalled();
      const infoCall = infoSpy.mock.calls.find((call) =>
        call[0].includes('[WasmLoader] WASM recovered')
      );
      expect(infoCall).toBeDefined();
    });
  });

  describe('State management', () => {
    it('isInDegradedMode should return true when state is degraded', () => {
      expect(loader.isInDegradedMode()).toBe(false);

      (loader as unknown as { state: string }).state = 'degraded';
      expect(loader.isInDegradedMode()).toBe(true);
    });

    it('isInDegradedMode should return true when fallbackState.mode is fallback', () => {
      (loader as unknown as { state: string }).state = 'loaded';
      (loader as unknown as { fallbackState: FallbackState }).fallbackState = {
        mode: 'fallback',
        consecutiveFailures: 1,
        totalActivations: 1,
      };

      expect(loader.isInDegradedMode()).toBe(true);
    });

    it('getFallbackState should return copy of state', () => {
      const state1 = loader.getFallbackState();
      const state2 = loader.getFallbackState();

      // Should be equal but not same reference
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });

    it('reset should clear all fallback state', () => {
      // Set up some state
      (loader as unknown as { state: string }).state = 'degraded';
      (loader as unknown as { fallbackState: FallbackState }).fallbackState = {
        mode: 'fallback',
        consecutiveFailures: 3,
        totalActivations: 5,
        nextRetryAt: new Date(),
        lastSuccessfulLoad: new Date(),
      };
      (loader as unknown as { degradedModeStartTime: Date }).degradedModeStartTime = new Date();

      // Reset
      loader.reset();

      // Verify state is cleared
      expect(loader.getState()).toBe('unloaded');
      expect(loader.isInDegradedMode()).toBe(false);

      const state = loader.getFallbackState();
      expect(state.mode).toBe('wasm');
      expect(state.consecutiveFailures).toBe(0);
      expect(state.totalActivations).toBe(0);
    });

    it('reset should clear pending retry timer', () => {
      // Set a retry timer
      (loader as unknown as { retryTimer: ReturnType<typeof setTimeout> }).retryTimer = setTimeout(
        () => {},
        10000
      );

      loader.reset();

      // Timer should be cleared
      expect(
        (loader as unknown as { retryTimer: ReturnType<typeof setTimeout> | null }).retryTimer
      ).toBeNull();
    });
  });

  describe('Event subscription', () => {
    it('should support subscribing to degraded_mode event', () => {
      const handler = vi.fn();
      const unsubscribe = loader.on('degraded_mode', handler);

      expect(typeof unsubscribe).toBe('function');

      // Emit event
      const enterDegradedMode = (loader as unknown as {
        enterDegradedMode: (error: Error) => void;
      }).enterDegradedMode.bind(loader);
      enterDegradedMode(new Error('Test'));

      expect(handler).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsubscribe();
      enterDegradedMode(new Error('Test 2'));

      // Should not be called again after unsubscribe
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should support subscribing to recovered event', () => {
      const handler = vi.fn();
      const unsubscribe = loader.on('recovered', handler);

      expect(typeof unsubscribe).toBe('function');

      // Set up for recovery
      (loader as unknown as { degradedModeStartTime: Date }).degradedModeStartTime = new Date();
      (loader as unknown as { fallbackState: FallbackState }).fallbackState = {
        mode: 'fallback',
        consecutiveFailures: 1,
        totalActivations: 1,
      };

      // Emit recovery
      const emitRecoveryEvent = (loader as unknown as {
        emitRecoveryEvent: () => void;
      }).emitRecoveryEvent.bind(loader);
      emitRecoveryEvent();

      expect(handler).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsubscribe();
    });

    it('should support off() to unsubscribe', () => {
      const handler = vi.fn();
      loader.on('degraded_mode', handler);

      // Use off() to unsubscribe
      loader.off('degraded_mode', handler);

      const enterDegradedMode = (loader as unknown as {
        enterDegradedMode: (error: Error) => void;
      }).enterDegradedMode.bind(loader);
      enterDegradedMode(new Error('Test'));

      // Should not be called after off()
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('forceRetry', () => {
    it('should clear pending retry timer', async () => {
      // Set a retry timer
      (loader as unknown as { retryTimer: ReturnType<typeof setTimeout> }).retryTimer = setTimeout(
        () => {},
        10000
      );

      await loader.forceRetry();

      // Timer should be cleared
      expect(
        (loader as unknown as { retryTimer: ReturnType<typeof setTimeout> | null }).retryTimer
      ).toBeNull();
    });

    it('should set mode to recovering when in failed state', async () => {
      (loader as unknown as { state: string }).state = 'failed';

      // Start forceRetry (it will attempt to load and likely succeed or fail based on WASM availability)
      const promise = loader.forceRetry();

      // Before resolution, mode should be recovering
      expect(loader.getFallbackState().mode).toBe('recovering');

      await promise;
    });

    it('should set mode to recovering when in degraded state', async () => {
      (loader as unknown as { state: string }).state = 'degraded';

      const promise = loader.forceRetry();

      expect(loader.getFallbackState().mode).toBe('recovering');

      await promise;
    });
  });
});

describe('Fallback Result Types', () => {
  it('FallbackResult should have correct structure', () => {
    const result: FallbackResult = {
      usedFallback: true,
      confidence: 0.5,
      retryCount: 2,
      lastError: 'Test error',
      activatedAt: new Date(),
    };

    expect(result.usedFallback).toBe(true);
    expect(result.confidence).toBe(0.5);
    expect(result.retryCount).toBe(2);
    expect(result.lastError).toBe('Test error');
    expect(result.activatedAt).toBeInstanceOf(Date);
  });

  it('FallbackResult can omit optional fields', () => {
    const result: FallbackResult = {
      usedFallback: false,
      confidence: 1.0,
      retryCount: 0,
    };

    expect(result.usedFallback).toBe(false);
    expect(result.confidence).toBe(1.0);
    expect(result.retryCount).toBe(0);
    expect(result.lastError).toBeUndefined();
    expect(result.activatedAt).toBeUndefined();
  });

  it('FallbackState should have correct structure', () => {
    const state: FallbackState = {
      mode: 'fallback',
      consecutiveFailures: 3,
      nextRetryAt: new Date(),
      totalActivations: 5,
      lastSuccessfulLoad: new Date(),
    };

    expect(state.mode).toBe('fallback');
    expect(state.consecutiveFailures).toBe(3);
    expect(state.totalActivations).toBe(5);
    expect(state.nextRetryAt).toBeInstanceOf(Date);
    expect(state.lastSuccessfulLoad).toBeInstanceOf(Date);
  });

  it('FallbackState mode can be wasm, fallback, or recovering', () => {
    const wasmState: FallbackState = {
      mode: 'wasm',
      consecutiveFailures: 0,
      totalActivations: 0,
    };
    expect(wasmState.mode).toBe('wasm');

    const fallbackState: FallbackState = {
      mode: 'fallback',
      consecutiveFailures: 1,
      totalActivations: 1,
    };
    expect(fallbackState.mode).toBe('fallback');

    const recoveringState: FallbackState = {
      mode: 'recovering',
      consecutiveFailures: 1,
      totalActivations: 1,
    };
    expect(recoveringState.mode).toBe('recovering');
  });
});
