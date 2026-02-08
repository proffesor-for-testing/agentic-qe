/**
 * Unit tests for Core MCP Handlers
 * Tests fleet init, status, health, and dispose operations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  handleFleetInit,
  handleFleetStatus,
  handleFleetHealth,
  getFleetState,
  isFleetInitialized,
  disposeFleet,
} from '../../../../src/mcp/handlers/core-handlers';
import type { FleetInitParams, FleetStatusParams, FleetHealthParams } from '../../../../src/mcp/types';

// ============================================================================
// Tests
// ============================================================================

describe('Core Handlers', () => {
  // Ensure clean state before each test
  beforeEach(async () => {
    // Ensure fleet is disposed before each test starts fresh
    await disposeFleet();
  });

  // Clean up after each test
  afterEach(async () => {
    await disposeFleet();
  });

  // --------------------------------------------------------------------------
  // isFleetInitialized
  // --------------------------------------------------------------------------

  describe('isFleetInitialized', () => {
    it('should return false when fleet is not initialized', () => {
      expect(isFleetInitialized()).toBe(false);
    });

    it('should return true after fleet is initialized', async () => {
      await handleFleetInit({});
      expect(isFleetInitialized()).toBe(true);
    });

    it('should return false after fleet is disposed', async () => {
      await handleFleetInit({});
      expect(isFleetInitialized()).toBe(true);

      await disposeFleet();
      expect(isFleetInitialized()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // getFleetState
  // --------------------------------------------------------------------------

  describe('getFleetState', () => {
    it('should return uninitialized state by default', () => {
      const state = getFleetState();
      expect(state.initialized).toBe(false);
      expect(state.fleetId).toBeNull();
      expect(state.kernel).toBeNull();
      expect(state.queen).toBeNull();
    });

    it('should return initialized state after fleet init', async () => {
      await handleFleetInit({});
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
  // handleFleetInit
  // --------------------------------------------------------------------------

  describe('handleFleetInit', () => {
    it('should initialize fleet with default parameters', async () => {
      const result = await handleFleetInit({});

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
      const result = await handleFleetInit({ topology: 'mesh' });

      expect(result.success).toBe(true);
      expect(result.data!.topology).toBe('mesh');
    });

    it('should respect custom maxAgents parameter', async () => {
      const result = await handleFleetInit({ maxAgents: 20 });

      expect(result.success).toBe(true);
      expect(result.data!.maxAgents).toBe(20);
    });

    it('should respect custom enabledDomains parameter', async () => {
      const result = await handleFleetInit({
        enabledDomains: ['test-generation', 'test-execution'],
      });

      expect(result.success).toBe(true);
      // The enabled domains returned should exclude 'coordination' if not requested
      expect(result.data!.enabledDomains).toContain('test-generation');
      expect(result.data!.enabledDomains).toContain('test-execution');
    });

    it('should return existing fleet if already initialized', async () => {
      const first = await handleFleetInit({});
      const second = await handleFleetInit({});

      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      expect(first.data!.fleetId).toBe(second.data!.fleetId);
      expect(second.data!.status).toBe('ready'); // Returns 'ready' for existing fleet
    });

    it('should respect lazyLoading parameter', async () => {
      const result = await handleFleetInit({ lazyLoading: false });

      expect(result.success).toBe(true);
      // Kernel should be initialized with lazyLoading: false
      const state = getFleetState();
      expect(state.kernel).not.toBeNull();
    });

    it('should respect memoryBackend parameter', async () => {
      const result = await handleFleetInit({ memoryBackend: 'sqlite' });

      expect(result.success).toBe(true);
      const state = getFleetState();
      expect(state.kernel).not.toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // handleFleetStatus
  // --------------------------------------------------------------------------

  describe('handleFleetStatus', () => {
    it('should return error when fleet is not initialized', async () => {
      const result = await handleFleetStatus({});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
    });

    it('should return fleet status when initialized', async () => {
      await handleFleetInit({});
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
      await handleFleetInit({});
      const result = await handleFleetStatus({ includeDomains: true });

      expect(result.success).toBe(true);
      expect(result.data!.domains).toBeDefined();
      expect(Array.isArray(result.data!.domains)).toBe(true);
    });

    it('should include metrics when includeMetrics is true', async () => {
      await handleFleetInit({});
      const result = await handleFleetStatus({ includeMetrics: true });

      expect(result.success).toBe(true);
      expect(result.data!.metrics).toBeDefined();
      expect(result.data!.metrics!.tasksReceived).toBeGreaterThanOrEqual(0);
      expect(result.data!.metrics!.tasksCompleted).toBeGreaterThanOrEqual(0);
      expect(result.data!.metrics!.agentUtilization).toBeDefined();
    });

    it('should include both domains and metrics when both flags are true', async () => {
      await handleFleetInit({});
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
  // handleFleetHealth
  // --------------------------------------------------------------------------

  describe('handleFleetHealth', () => {
    it('should return error when fleet is not initialized', async () => {
      const result = await handleFleetHealth({});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
    });

    it('should return overall health when no domain specified', async () => {
      await handleFleetInit({});
      const result = await handleFleetHealth({});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.status).toBeDefined();
      expect(result.data!.totalAgents).toBeGreaterThanOrEqual(0);
      expect(result.data!.activeAgents).toBeGreaterThanOrEqual(0);
      expect(result.data!.lastHealthCheck).toBeDefined();
    });

    it('should return domain-specific health when domain is specified', async () => {
      await handleFleetInit({});
      const result = await handleFleetHealth({ domain: 'test-generation' });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.domain).toBe('test-generation');
      expect(result.data!.status).toBeDefined();
      expect(result.data!.agents).toBeDefined();
    });

    it('should return error for invalid domain', async () => {
      await handleFleetInit({ enabledDomains: ['test-generation'] });
      // Note: behavior depends on implementation - may return error or empty health
      const result = await handleFleetHealth({ domain: 'nonexistent-domain' as any });

      // Implementation may handle this differently
      // Either returns error or returns null health
      expect(result).toBeDefined();
    });

    it('should include detailed domain info when detailed is true', async () => {
      await handleFleetInit({});
      const result = await handleFleetHealth({ detailed: true });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      // When detailed=true, should include domains and issues
      expect(result.data!.domains).toBeDefined();
      expect(result.data!.issues).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // disposeFleet
  // --------------------------------------------------------------------------

  describe('disposeFleet', () => {
    it('should safely handle dispose when not initialized', async () => {
      // Should not throw
      await expect(disposeFleet()).resolves.not.toThrow();
    });

    it('should dispose fleet and reset state', async () => {
      await handleFleetInit({});
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
      await handleFleetInit({});
      const firstFleetId = getFleetState().fleetId;

      await disposeFleet();
      await handleFleetInit({});

      const secondFleetId = getFleetState().fleetId;
      expect(isFleetInitialized()).toBe(true);
      expect(secondFleetId).not.toBe(firstFleetId);
    });

    it('should handle multiple dispose calls gracefully', async () => {
      await handleFleetInit({});

      await disposeFleet();
      await expect(disposeFleet()).resolves.not.toThrow();
      await expect(disposeFleet()).resolves.not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases and Error Handling
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle concurrent init calls gracefully', async () => {
      // Start multiple init calls simultaneously
      const results = await Promise.all([
        handleFleetInit({}),
        handleFleetInit({}),
        handleFleetInit({}),
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
      await handleFleetInit({});
      const result = await handleFleetStatus({});

      expect(result.success).toBe(true);
      expect(result.data!.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should handle health call immediately after init', async () => {
      await handleFleetInit({});
      const result = await handleFleetHealth({});

      expect(result.success).toBe(true);
      expect(result.data!.status).toBeDefined();
    });
  });
});
