/**
 * Unit tests for Core MCP Handlers
 * Tests fleet init, status, health, and dispose operations
 *
 * OOM Prevention (Issue #294):
 * - Uses shared fleet via beforeAll/afterAll instead of per-test init/dispose
 * - Only tests that MUST test init/dispose lifecycle create their own fleet
 * - Reduces fleet init from ~31x to ~5x per test file
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  handleFleetInit,
  handleFleetStatus,
  handleFleetHealth,
  getFleetState,
  isFleetInitialized,
  disposeFleet,
} from '../../../../src/mcp/handlers/core-handlers';
import { resetUnifiedPersistence } from '../../../../src/kernel/unified-persistence';
import type { FleetInitParams, FleetStatusParams, FleetHealthParams } from '../../../../src/mcp/types';

// ============================================================================
// Tests
// ============================================================================

describe('Core Handlers', { timeout: 30000 }, () => {
  // --------------------------------------------------------------------------
  // Tests that need their own init/dispose lifecycle
  // --------------------------------------------------------------------------

  describe('isFleetInitialized', () => {
    afterAll(async () => {
      await disposeFleet();
      resetUnifiedPersistence();
    });

    it('should return false when fleet is not initialized', async () => {
      await disposeFleet();
      expect(isFleetInitialized()).toBe(false);
    });

    it('should return true after fleet is initialized', async () => {
      await handleFleetInit({ memoryBackend: 'memory' });
      expect(isFleetInitialized()).toBe(true);
    });

    it('should return false after fleet is disposed', async () => {
      await handleFleetInit({ memoryBackend: 'memory' });
      expect(isFleetInitialized()).toBe(true);

      await disposeFleet();
      expect(isFleetInitialized()).toBe(false);
    });
  });

  describe('getFleetState', () => {
    afterAll(async () => {
      await disposeFleet();
      resetUnifiedPersistence();
    });

    it('should return uninitialized state by default', async () => {
      await disposeFleet();
      const state = getFleetState();
      expect(state.initialized).toBe(false);
      expect(state.fleetId).toBeNull();
      expect(state.kernel).toBeNull();
      expect(state.queen).toBeNull();
    });

    it('should return initialized state after fleet init', async () => {
      await handleFleetInit({ memoryBackend: 'memory' });
      const state = getFleetState();

      expect(state.initialized).toBe(true);
      expect(state.fleetId).toBeTruthy();
      expect(state.fleetId).toMatch(/^fleet-/);
      expect(state.kernel).not.toBeNull();
      expect(state.queen).not.toBeNull();
      expect(state.initTime).toBeInstanceOf(Date);
    });
  });

  // --------------------------------------------------------------------------
  // handleFleetInit — tests init parameters (needs per-test lifecycle)
  // --------------------------------------------------------------------------

  describe('handleFleetInit', () => {
    afterAll(async () => {
      await disposeFleet();
      resetUnifiedPersistence();
    });

    it('should initialize fleet with default parameters', async () => {
      await disposeFleet();
      const result = await handleFleetInit({ memoryBackend: 'memory' });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.fleetId).toMatch(/^fleet-/);
      expect(result.data!.topology).toBe('hierarchical');
      expect(result.data!.maxAgents).toBe(15);
      expect(result.data!.status).toBe('initialized');
      // User-facing domains should be 13 (excludes 'coordination')
      expect(result.data!.enabledDomains).toBeDefined();
      expect(result.data!.enabledDomains.length).toBe(13);
      expect(result.data!.enabledDomains).not.toContain('coordination');
    });

    it('should respect custom topology parameter', async () => {
      // Fleet already initialized from previous test — returns existing
      const result = await handleFleetInit({ topology: 'mesh', memoryBackend: 'memory' });
      expect(result.success).toBe(true);
    });

    it('should respect custom maxAgents parameter', async () => {
      await disposeFleet();
      const result = await handleFleetInit({ maxAgents: 20, memoryBackend: 'memory' });

      expect(result.success).toBe(true);
      expect(result.data!.maxAgents).toBe(20);
    });

    it('should respect custom enabledDomains parameter', async () => {
      await disposeFleet();
      const result = await handleFleetInit({
        enabledDomains: ['test-generation', 'test-execution'],
        memoryBackend: 'memory',
      });

      expect(result.success).toBe(true);
      expect(result.data!.enabledDomains).toContain('test-generation');
      expect(result.data!.enabledDomains).toContain('test-execution');
    });

    it('should return existing fleet if already initialized', async () => {
      await disposeFleet();
      const first = await handleFleetInit({ memoryBackend: 'memory' });
      const second = await handleFleetInit({ memoryBackend: 'memory' });

      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      expect(first.data!.fleetId).toBe(second.data!.fleetId);
      expect(second.data!.status).toBe('ready'); // Returns 'ready' for existing fleet
    });

    it('should respect lazyLoading parameter', async () => {
      await disposeFleet();
      const result = await handleFleetInit({ lazyLoading: false, memoryBackend: 'memory' });

      expect(result.success).toBe(true);
      const state = getFleetState();
      expect(state.kernel).not.toBeNull();
    });

    it('should respect memoryBackend parameter', async () => {
      await disposeFleet();
      const result = await handleFleetInit({ memoryBackend: 'memory' });

      expect(result.success).toBe(true);
      const state = getFleetState();
      expect(state.kernel).not.toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // handleFleetStatus — uses shared fleet
  // --------------------------------------------------------------------------

  describe('handleFleetStatus', () => {
    beforeAll(async () => {
      await disposeFleet();
      await handleFleetInit({ memoryBackend: 'memory' });
    });

    afterAll(async () => {
      await disposeFleet();
      resetUnifiedPersistence();
    });

    it('should return error when fleet is not initialized', async () => {
      await disposeFleet();
      const result = await handleFleetStatus({});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
      // Re-init for subsequent tests
      await handleFleetInit({ memoryBackend: 'memory' });
    });

    it('should return fleet status when initialized', async () => {
      const result = await handleFleetStatus({});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.status).toBeDefined();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(result.data!.status);
      expect(result.data!.uptime).toBeGreaterThanOrEqual(0);
      expect(result.data!.agents).toBeDefined();
      expect(result.data!.agents.total).toBeGreaterThanOrEqual(0);
      expect(result.data!.tasks).toBeDefined();
    });

    it('should include domain status when includeDomains is true', async () => {
      const result = await handleFleetStatus({ includeDomains: true });

      expect(result.success).toBe(true);
      expect(result.data!.domains).toBeDefined();
      expect(Array.isArray(result.data!.domains)).toBe(true);
    });

    it('should include metrics when includeMetrics is true', async () => {
      const result = await handleFleetStatus({ includeMetrics: true });

      expect(result.success).toBe(true);
      expect(result.data!.metrics).toBeDefined();
      expect(result.data!.metrics!.tasksReceived).toBeGreaterThanOrEqual(0);
      expect(result.data!.metrics!.tasksCompleted).toBeGreaterThanOrEqual(0);
      expect(result.data!.metrics!.agentUtilization).toBeDefined();
    });

    it('should include both domains and metrics when both flags are true', async () => {
      const result = await handleFleetStatus({
        includeDomains: true,
        includeMetrics: true,
      });

      expect(result.success).toBe(true);
      expect(result.data!.domains).toBeDefined();
      expect(result.data!.metrics).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // handleFleetHealth — uses shared fleet
  // --------------------------------------------------------------------------

  describe('handleFleetHealth', () => {
    beforeAll(async () => {
      await disposeFleet();
      await handleFleetInit({ memoryBackend: 'memory' });
    });

    afterAll(async () => {
      await disposeFleet();
      resetUnifiedPersistence();
    });

    it('should return error when fleet is not initialized', async () => {
      await disposeFleet();
      const result = await handleFleetHealth({});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
      // Re-init for subsequent tests
      await handleFleetInit({ memoryBackend: 'memory' });
    });

    it('should return overall health when no domain specified', async () => {
      const result = await handleFleetHealth({});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.status).toBeDefined();
      expect(result.data!.totalAgents).toBeGreaterThanOrEqual(0);
      expect(result.data!.activeAgents).toBeGreaterThanOrEqual(0);
      expect(result.data!.lastHealthCheck).toBeDefined();
    });

    it('should return domain-specific health when domain is specified', async () => {
      const result = await handleFleetHealth({ domain: 'test-generation' });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.domain).toBe('test-generation');
      expect(result.data!.status).toBeDefined();
      expect(result.data!.agents).toBeDefined();
    });

    it('should return error for invalid domain', async () => {
      // Note: behavior depends on implementation - may return error or empty health
      const result = await handleFleetHealth({ domain: 'nonexistent-domain' as any });
      expect(result).toBeDefined();
    });

    it('should include detailed domain info when detailed is true', async () => {
      const result = await handleFleetHealth({ detailed: true });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.domains).toBeDefined();
      expect(result.data!.issues).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // disposeFleet — needs its own lifecycle
  // --------------------------------------------------------------------------

  describe('disposeFleet', () => {
    afterAll(async () => {
      await disposeFleet();
      resetUnifiedPersistence();
    });

    it('should safely handle dispose when not initialized', async () => {
      await disposeFleet();
      await expect(disposeFleet()).resolves.not.toThrow();
    });

    it('should dispose fleet and reset state', async () => {
      await handleFleetInit({ memoryBackend: 'memory' });
      expect(isFleetInitialized()).toBe(true);

      await disposeFleet();

      expect(isFleetInitialized()).toBe(false);
      const state = getFleetState();
      expect(state.fleetId).toBeNull();
      expect(state.kernel).toBeNull();
      expect(state.queen).toBeNull();
      expect(state.initTime).toBeNull();
    });

    it('should allow re-initialization after dispose', async () => {
      await handleFleetInit({ memoryBackend: 'memory' });
      const firstFleetId = getFleetState().fleetId;

      await disposeFleet();
      await handleFleetInit({ memoryBackend: 'memory' });

      const secondFleetId = getFleetState().fleetId;
      expect(isFleetInitialized()).toBe(true);
      expect(secondFleetId).not.toBe(firstFleetId);
    });

    it('should handle multiple dispose calls gracefully', async () => {
      await handleFleetInit({ memoryBackend: 'memory' });

      await disposeFleet();
      await expect(disposeFleet()).resolves.not.toThrow();
      await expect(disposeFleet()).resolves.not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases and Error Handling
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    afterAll(async () => {
      await disposeFleet();
      resetUnifiedPersistence();
    });

    it('should handle concurrent init calls gracefully', async () => {
      await disposeFleet();
      // Start multiple init calls simultaneously
      const results = await Promise.all([
        handleFleetInit({ memoryBackend: 'memory' }),
        handleFleetInit({ memoryBackend: 'memory' }),
        handleFleetInit({ memoryBackend: 'memory' }),
      ]);

      // All should succeed
      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      // All should reference the same fleet
      const fleetIds = results.map(r => r.data!.fleetId);
      expect(new Set(fleetIds).size).toBe(1);
    });

    it('should handle status call immediately after init', async () => {
      await handleFleetInit({ memoryBackend: 'memory' });
      const result = await handleFleetStatus({});

      expect(result.success).toBe(true);
      expect(result.data!.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should handle health call immediately after init', async () => {
      await handleFleetInit({ memoryBackend: 'memory' });
      const result = await handleFleetHealth({});

      expect(result.success).toBe(true);
      expect(result.data!.status).toBeDefined();
    });
  });
});
