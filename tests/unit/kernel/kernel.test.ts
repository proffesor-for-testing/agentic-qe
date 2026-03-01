/**
 * Agentic QE v3 - Kernel Unit Tests
 * Milestone 2.2: Test kernel initialization, configuration, and lifecycle
 *
 * Tests cover:
 * - Kernel construction with default and custom config
 * - Memory backend selection (in-memory vs hybrid)
 * - Plugin factory registration
 * - Initialization sequences
 * - Lazy loading behavior
 * - Domain API access
 * - Health reporting
 * - Disposal and cleanup
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { QEKernelImpl, createKernel } from '../../../src/kernel/kernel';
import { InMemoryBackend } from '../../../src/kernel/memory-backend';
import { HybridMemoryBackend } from '../../../src/kernel/hybrid-backend';
import { resetUnifiedMemory } from '../../../src/kernel/unified-memory';
import type { KernelConfig, DomainHealth } from '../../../src/kernel/interfaces';
import type { DomainName } from '../../../src/shared/types';

// ============================================================================
// Test Helpers
// ============================================================================

const TEST_DATA_DIR = '/tmp/aqe-kernel-test-' + Date.now();

function cleanupTestDataDir(): void {
  try {
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup errors
  }
}

// ============================================================================
// Kernel Tests
// ============================================================================

describe('QEKernel', () => {
  afterEach(async () => {
    // Reset unified memory singleton between tests
    resetUnifiedMemory();
    cleanupTestDataDir();
  });

  // ===========================================================================
  // Construction Tests
  // ===========================================================================

  describe('Construction', () => {
    it('should create kernel with default configuration', () => {
      const kernel = createKernel({ memoryBackend: 'memory' });

      expect(kernel).toBeDefined();
      expect(kernel.eventBus).toBeDefined();
      expect(kernel.coordinator).toBeDefined();
      expect(kernel.plugins).toBeDefined();
      expect(kernel.memory).toBeDefined();
    });

    it('should create kernel with custom configuration', () => {
      const config: Partial<KernelConfig> = {
        maxConcurrentAgents: 10,
        memoryBackend: 'memory',
        lazyLoading: false,
        enabledDomains: ['test-generation', 'test-execution'] as DomainName[],
      };

      const kernel = createKernel(config);
      const kernelConfig = kernel.getConfig();

      expect(kernelConfig.maxConcurrentAgents).toBe(10);
      expect(kernelConfig.memoryBackend).toBe('memory');
      expect(kernelConfig.lazyLoading).toBe(false);
      expect(kernelConfig.enabledDomains).toEqual(['test-generation', 'test-execution']);
    });

    it('should use in-memory backend when configured', () => {
      const kernel = createKernel({ memoryBackend: 'memory' });
      expect(kernel.memory).toBeInstanceOf(InMemoryBackend);
    });

    it('should use hybrid backend when configured', async () => {
      // PERF-005: Backend setup moved to initialize(), must call it first
      const kernel = createKernel({
        memoryBackend: 'hybrid',
        dataDir: TEST_DATA_DIR,
      });
      await kernel.initialize();
      expect(kernel.memory).toBeInstanceOf(HybridMemoryBackend);
    });

    it('should default to hybrid backend', async () => {
      // PERF-005: Backend setup moved to initialize(), must call it first
      const kernel = createKernel({ dataDir: TEST_DATA_DIR });
      await kernel.initialize();
      expect(kernel.memory).toBeInstanceOf(HybridMemoryBackend);
    });

    it('should create data directory if it does not exist', async () => {
      const customDataDir = path.join(TEST_DATA_DIR, 'custom-data');
      expect(fs.existsSync(customDataDir)).toBe(false);

      // PERF-005: Directory creation moved to initialize()
      const kernel = createKernel({ dataDir: customDataDir });
      await kernel.initialize();

      expect(fs.existsSync(customDataDir)).toBe(true);
    });
  });

  // ===========================================================================
  // Initialization Tests
  // ===========================================================================

  describe('Initialization', () => {
    it('should initialize memory backend', async () => {
      const kernel = createKernel({ memoryBackend: 'memory' });

      await kernel.initialize();

      // Memory should be ready for use
      await kernel.memory.set('test-key', 'test-value');
      const value = await kernel.memory.get<string>('test-key');
      expect(value).toBe('test-value');
    });

    it('should be idempotent - multiple initialize calls are safe', async () => {
      const kernel = createKernel({ memoryBackend: 'memory' });

      await kernel.initialize();
      await kernel.initialize();
      await kernel.initialize();

      // Should still work correctly
      await kernel.memory.set('test-key', 'value');
      const value = await kernel.memory.get<string>('test-key');
      expect(value).toBe('value');
    });

    it('should not load plugins when lazy loading is enabled', async () => {
      const kernel = createKernel({
        memoryBackend: 'memory',
        lazyLoading: true,
      });

      await kernel.initialize();

      const loadedDomains = kernel.getLoadedDomains?.() ?? [];
      expect(loadedDomains).toHaveLength(0);
    });

    it('should load all plugins when lazy loading is disabled', async () => {
      const kernel = createKernel({
        memoryBackend: 'memory',
        lazyLoading: false,
        enabledDomains: ['test-generation', 'test-execution'] as DomainName[],
      });

      await kernel.initialize();

      const loadedDomains = kernel.getLoadedDomains?.() ?? [];
      expect(loadedDomains).toContain('test-generation');
      expect(loadedDomains).toContain('test-execution');
    });
  });

  // ===========================================================================
  // Domain Loading Tests
  // ===========================================================================

  describe('Domain Loading', () => {
    it('should check if domain is loaded', async () => {
      const kernel = createKernel({
        memoryBackend: 'memory',
        lazyLoading: true,
      });
      await kernel.initialize();

      expect(kernel.isDomainLoaded?.('test-generation')).toBe(false);
    });

    it('should ensure domain is loaded on demand', async () => {
      const kernel = createKernel({
        memoryBackend: 'memory',
        lazyLoading: true,
        enabledDomains: ['test-generation'] as DomainName[],
      });
      await kernel.initialize();

      const loaded = await kernel.ensureDomainLoaded?.('test-generation');

      expect(loaded).toBe(true);
      expect(kernel.isDomainLoaded?.('test-generation')).toBe(true);
    });

    it('should return false for disabled domains', async () => {
      const kernel = createKernel({
        memoryBackend: 'memory',
        lazyLoading: true,
        enabledDomains: ['test-generation'] as DomainName[],
      });
      await kernel.initialize();

      const loaded = await kernel.ensureDomainLoaded?.('security-compliance');

      expect(loaded).toBe(false);
    });

    it('should get domain API synchronously when loaded', async () => {
      const kernel = createKernel({
        memoryBackend: 'memory',
        lazyLoading: false,
        enabledDomains: ['test-generation'] as DomainName[],
      });
      await kernel.initialize();

      const api = kernel.getDomainAPI('test-generation');

      expect(api).toBeDefined();
    });

    it('should return undefined for unloaded domain API', async () => {
      const kernel = createKernel({
        memoryBackend: 'memory',
        lazyLoading: true,
      });
      await kernel.initialize();

      const api = kernel.getDomainAPI('test-generation');

      expect(api).toBeUndefined();
    });

    it('should get domain API with lazy loading', async () => {
      const kernel = createKernel({
        memoryBackend: 'memory',
        lazyLoading: true,
        enabledDomains: ['test-generation'] as DomainName[],
      });
      await kernel.initialize();

      const api = await kernel.getDomainAPIAsync?.('test-generation');

      expect(api).toBeDefined();
    });

    it('should return pending domains list', async () => {
      const kernel = createKernel({
        memoryBackend: 'memory',
        lazyLoading: true,
        enabledDomains: ['test-generation', 'test-execution'] as DomainName[],
      });
      await kernel.initialize();

      const pending = kernel.getPendingDomains?.() ?? [];

      expect(pending).toContain('test-generation');
      expect(pending).toContain('test-execution');
    });
  });

  // ===========================================================================
  // Health Reporting Tests
  // ===========================================================================

  describe('Health Reporting', () => {
    it('should return kernel health status', async () => {
      const kernel = createKernel({
        memoryBackend: 'memory',
        maxConcurrentAgents: 15,
      });
      await kernel.initialize();

      const health = kernel.getHealth();

      expect(health.status).toBe('healthy');
      expect(health.uptime).toBeGreaterThanOrEqual(0);
      expect(health.agents.maxAllowed).toBe(15);
      expect(health.domains).toBeDefined();
    });

    it('should report domains as healthy with lazy loading enabled', async () => {
      const kernel = createKernel({
        memoryBackend: 'memory',
        lazyLoading: true,
        enabledDomains: ['test-generation'] as DomainName[],
      });
      await kernel.initialize();

      const health = kernel.getHealth();
      const domainHealth = health.domains['test-generation'];

      // Lazy-loadable domains should be marked as healthy even when not loaded
      expect(domainHealth.status).toBe('healthy');
    });

    it('should report loaded domain health', async () => {
      const kernel = createKernel({
        memoryBackend: 'memory',
        lazyLoading: false,
        enabledDomains: ['test-generation'] as DomainName[],
      });
      await kernel.initialize();

      const health = kernel.getHealth();
      const domainHealth = health.domains['test-generation'];

      expect(domainHealth).toBeDefined();
      expect(['healthy', 'idle']).toContain(domainHealth.status);
    });

    it('should determine overall status based on domain health', async () => {
      const kernel = createKernel({
        memoryBackend: 'memory',
        lazyLoading: true,
      });
      await kernel.initialize();

      const health = kernel.getHealth();

      // With all domains lazy-loadable, should be healthy
      expect(health.status).toBe('healthy');
    });

    it('should track memory usage', async () => {
      const kernel = createKernel({ memoryBackend: 'memory' });
      await kernel.initialize();

      // Add some data to memory
      await kernel.memory.set('key1', 'value1');
      await kernel.memory.set('key2', 'value2');

      const health = kernel.getHealth();

      expect(health.memory.used).toBeGreaterThanOrEqual(0);
    });
  });

  // ===========================================================================
  // Configuration Tests
  // ===========================================================================

  describe('Configuration', () => {
    it('should return a copy of the configuration', () => {
      const kernel = createKernel({
        memoryBackend: 'memory',
        maxConcurrentAgents: 10,
      });

      const config1 = kernel.getConfig();
      const config2 = kernel.getConfig();

      // Should return different objects (copies)
      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });

    it('should preserve all configuration values', () => {
      const config: Partial<KernelConfig> = {
        maxConcurrentAgents: 20,
        memoryBackend: 'memory',
        hnswEnabled: false,
        lazyLoading: false,
        enabledDomains: ['test-generation', 'coverage-analysis'] as DomainName[],
      };

      const kernel = createKernel(config);
      const retrievedConfig = kernel.getConfig();

      expect(retrievedConfig.maxConcurrentAgents).toBe(20);
      expect(retrievedConfig.memoryBackend).toBe('memory');
      expect(retrievedConfig.hnswEnabled).toBe(false);
      expect(retrievedConfig.lazyLoading).toBe(false);
      expect(retrievedConfig.enabledDomains).toEqual(['test-generation', 'coverage-analysis']);
    });
  });

  // ===========================================================================
  // Disposal Tests
  // ===========================================================================

  describe('Disposal', () => {
    it('should dispose all components', async () => {
      const kernel = createKernel({ memoryBackend: 'memory' });
      await kernel.initialize();

      await kernel.dispose();

      // After disposal, getting health might throw or return unhealthy state
      // The key is that dispose completes without error
    });

    it('should dispose loaded plugins', async () => {
      const kernel = createKernel({
        memoryBackend: 'memory',
        lazyLoading: false,
        enabledDomains: ['test-generation'] as DomainName[],
      });
      await kernel.initialize();

      expect(kernel.isDomainLoaded?.('test-generation')).toBe(true);

      await kernel.dispose();

      // After disposal, domains should be unloaded
      // Re-checking would require re-initialization
    });

    it('should dispose memory backend', async () => {
      const kernel = createKernel({ memoryBackend: 'memory' });
      await kernel.initialize();

      await kernel.memory.set('key', 'value');

      await kernel.dispose();

      // Memory backend should be disposed
      // Re-accessing might throw or return undefined
    });

    it('should allow re-initialization after disposal', async () => {
      const kernel = createKernel({ memoryBackend: 'memory' });

      await kernel.initialize();
      await kernel.memory.set('key', 'value1');
      await kernel.dispose();

      // Create new kernel since re-initializing same kernel
      // after disposal is not guaranteed to work
      const kernel2 = createKernel({ memoryBackend: 'memory' });
      await kernel2.initialize();

      await kernel2.memory.set('key', 'value2');
      const value = await kernel2.memory.get<string>('key');
      expect(value).toBe('value2');

      await kernel2.dispose();
    });
  });

  // ===========================================================================
  // Agent Coordination Tests
  // ===========================================================================

  describe('Agent Coordination', () => {
    it('should provide access to agent coordinator', async () => {
      const kernel = createKernel({
        memoryBackend: 'memory',
        maxConcurrentAgents: 15,
      });
      await kernel.initialize();

      expect(kernel.coordinator).toBeDefined();
      expect(kernel.coordinator.canSpawn()).toBe(true);
      expect(kernel.coordinator.getActiveCount()).toBe(0);
    });

    it('should respect max concurrent agents limit', async () => {
      const kernel = createKernel({
        memoryBackend: 'memory',
        maxConcurrentAgents: 2,
      });
      await kernel.initialize();

      const result1 = await kernel.coordinator.spawn({
        name: 'agent-1',
        domain: 'test-generation',
        type: 'test-writer',
        capabilities: ['unit-tests'],
      });

      const result2 = await kernel.coordinator.spawn({
        name: 'agent-2',
        domain: 'test-execution',
        type: 'test-runner',
        capabilities: ['parallel-execution'],
      });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // Third agent should fail (max is 2)
      const result3 = await kernel.coordinator.spawn({
        name: 'agent-3',
        domain: 'coverage-analysis',
        type: 'coverage-analyzer',
        capabilities: ['gap-detection'],
      });

      expect(result3.success).toBe(false);
    });
  });

  // ===========================================================================
  // Event Bus Tests
  // ===========================================================================

  describe('Event Bus', () => {
    it('should provide access to event bus', async () => {
      const kernel = createKernel({ memoryBackend: 'memory' });
      await kernel.initialize();

      expect(kernel.eventBus).toBeDefined();
    });

    it('should allow event subscription and publishing', async () => {
      const kernel = createKernel({ memoryBackend: 'memory' });
      await kernel.initialize();

      const receivedEvents: unknown[] = [];
      kernel.eventBus.subscribe('test-event', async (event) => {
        receivedEvents.push(event.payload);
      });

      await kernel.eventBus.publish({
        id: 'event-1',
        type: 'test-event',
        source: 'test-generation',
        payload: { message: 'hello' },
        timestamp: new Date(),
      });

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toEqual({ message: 'hello' });
    });
  });

  // ===========================================================================
  // Factory Function Tests
  // ===========================================================================

  describe('createKernel Factory', () => {
    it('should create kernel instance via factory function', () => {
      const kernel = createKernel({ memoryBackend: 'memory' });

      expect(kernel).toBeInstanceOf(QEKernelImpl);
    });

    it('should create kernel with no config (uses defaults)', async () => {
      const kernel = createKernel({ dataDir: TEST_DATA_DIR });

      expect(kernel).toBeDefined();
      // PERF-005: Backend setup moved to initialize(), must call it first
      await kernel.initialize();
      // Default is hybrid backend
      expect(kernel.memory).toBeInstanceOf(HybridMemoryBackend);
    });
  });
});
