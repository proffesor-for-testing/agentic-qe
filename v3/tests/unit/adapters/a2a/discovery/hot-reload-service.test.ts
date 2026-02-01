/**
 * Hot Reload Service Tests
 *
 * @module tests/unit/adapters/a2a/discovery/hot-reload-service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

import {
  HotReloadService,
  createHotReloadService,
  DEFAULT_HOT_RELOAD_CONFIG,
} from '../../../../../src/adapters/a2a/discovery/hot-reload-service.js';
import { AgentCardGenerator } from '../../../../../src/adapters/a2a/agent-cards/generator.js';
import { DiscoveryService } from '../../../../../src/adapters/a2a/discovery/discovery-service.js';
import { AgentFileWatcher } from '../../../../../src/adapters/a2a/discovery/file-watcher.js';
import { QEAgentCard, createQEAgentCard, createAgentSkill } from '../../../../../src/adapters/a2a/agent-cards/schema.js';

// ============================================================================
// Mock Factory
// ============================================================================

function createMockGenerator(): AgentCardGenerator {
  const generator = {
    generateFromFile: vi.fn(),
    generateFromMarkdown: vi.fn(),
    generateFromDirectory: vi.fn(),
    generateAllCards: vi.fn(),
  } as unknown as AgentCardGenerator;
  return generator;
}

function createMockDiscoveryService(): DiscoveryService {
  const service = {
    registerCard: vi.fn(),
    invalidateCache: vi.fn(),
    invalidateAllCaches: vi.fn(),
    getPlatformCard: vi.fn().mockResolvedValue({}),
    getAgentCard: vi.fn(),
    hasAgent: vi.fn(),
    loadCards: vi.fn(),
  } as unknown as DiscoveryService;
  return service;
}

function createMockWatcher(): AgentFileWatcher {
  const watcher = new EventEmitter() as AgentFileWatcher & EventEmitter;
  (watcher as any).start = vi.fn().mockResolvedValue(undefined);
  (watcher as any).stop = vi.fn();
  (watcher as any).isRunning = vi.fn().mockReturnValue(false);
  (watcher as any).getKnownFiles = vi.fn().mockReturnValue([]);
  (watcher as any).getStatus = vi.fn().mockReturnValue({
    running: false,
    watchedPaths: [],
    knownFiles: 0,
    totalEvents: 0,
    startedAt: null,
  });
  return watcher as AgentFileWatcher;
}

function createMockCard(agentId: string): QEAgentCard {
  return createQEAgentCard(
    agentId,
    `Description for ${agentId}`,
    `http://localhost:8080/a2a/${agentId}`,
    '3.0.0',
    [createAgentSkill('test-skill', 'Test Skill', 'A test skill')],
    { domain: 'test-generation' }
  );
}

// ============================================================================
// Tests
// ============================================================================

describe('HotReloadService', () => {
  let generator: AgentCardGenerator;
  let discoveryService: DiscoveryService;
  let watcher: AgentFileWatcher;
  let service: HotReloadService;

  beforeEach(() => {
    generator = createMockGenerator();
    discoveryService = createMockDiscoveryService();
    watcher = createMockWatcher();
  });

  afterEach(() => {
    if (service) {
      service.stop();
    }
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create service with required config', () => {
      service = createHotReloadService({
        generator,
        discoveryService,
        watcher,
        watchPaths: ['/path/to/agents'],
      });

      expect(service).toBeInstanceOf(HotReloadService);
      expect(service.isRunning()).toBe(false);
    });

    it('should apply default config values', () => {
      service = createHotReloadService({
        generator,
        discoveryService,
        watcher,
        watchPaths: ['/path/to/agents'],
      });

      const status = service.getStatus();
      expect(status.watchedPaths).toEqual(['/path/to/agents']);
    });
  });

  describe('start/stop', () => {
    beforeEach(() => {
      service = createHotReloadService({
        generator,
        discoveryService,
        watcher,
        watchPaths: ['/path/to/agents'],
      });
    });

    it('should start the service and watcher', async () => {
      await service.start();

      expect(service.isRunning()).toBe(true);
      expect((watcher as any).start).toHaveBeenCalled();
    });

    it('should not start twice', async () => {
      await service.start();
      await service.start();

      expect((watcher as any).start).toHaveBeenCalledTimes(1);
    });

    it('should stop the service and watcher', async () => {
      await service.start();
      service.stop();

      expect(service.isRunning()).toBe(false);
      expect((watcher as any).stop).toHaveBeenCalled();
    });

    it('should not stop if not running', () => {
      service.stop();
      expect((watcher as any).stop).not.toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    beforeEach(() => {
      service = createHotReloadService({
        generator,
        discoveryService,
        watcher,
        watchPaths: ['/test/path'],
      });
    });

    it('should return correct initial status', () => {
      const status = service.getStatus();

      expect(status.running).toBe(false);
      expect(status.totalCards).toBe(0);
      expect(status.totalReloads).toBe(0);
      expect(status.failedReloads).toBe(0);
      expect(status.lastReloadAt).toBeNull();
      expect(status.watchedPaths).toEqual(['/test/path']);
    });
  });

  describe('file event handling', () => {
    beforeEach(() => {
      service = createHotReloadService({
        generator,
        discoveryService,
        watcher,
        watchPaths: ['/path/to/agents'],
      });
    });

    it('should handle agent-change event for add', async () => {
      const mockCard = createMockCard('qe-test-agent');
      (generator.generateFromFile as any).mockResolvedValue(mockCard);

      await service.start();

      const addedHandler = vi.fn();
      service.on('card-added', addedHandler);

      // Simulate file add event
      (watcher as EventEmitter).emit('agent-change', {
        event: 'add',
        path: '/path/to/agents/qe-test-agent.md',
        relativePath: 'qe-test-agent.md',
        timestamp: Date.now(),
      });

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(generator.generateFromFile).toHaveBeenCalledWith('/path/to/agents/qe-test-agent.md');
      expect(discoveryService.registerCard).toHaveBeenCalledWith(mockCard);
      expect(addedHandler).toHaveBeenCalledWith('qe-test-agent', mockCard);
    });

    it('should handle agent-change event for change', async () => {
      const mockCard = createMockCard('qe-test-agent');
      (generator.generateFromFile as any).mockResolvedValue(mockCard);

      await service.start();

      const updatedHandler = vi.fn();
      service.on('card-updated', updatedHandler);

      // Simulate file change event
      (watcher as EventEmitter).emit('agent-change', {
        event: 'change',
        path: '/path/to/agents/qe-test-agent.md',
        relativePath: 'qe-test-agent.md',
        timestamp: Date.now(),
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(generator.generateFromFile).toHaveBeenCalled();
      expect(discoveryService.invalidateCache).toHaveBeenCalledWith('qe-test-agent');
      expect(discoveryService.registerCard).toHaveBeenCalledWith(mockCard);
    });

    it('should handle agent-change event for unlink', async () => {
      const mockCard = createMockCard('qe-test-agent');
      (generator.generateFromFile as any).mockResolvedValue(mockCard);

      await service.start();

      // First add the agent
      (watcher as EventEmitter).emit('agent-change', {
        event: 'add',
        path: '/path/to/agents/qe-test-agent.md',
        relativePath: 'qe-test-agent.md',
        timestamp: Date.now(),
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const removedHandler = vi.fn();
      service.on('card-removed', removedHandler);

      // Then remove it
      (watcher as EventEmitter).emit('agent-change', {
        event: 'unlink',
        path: '/path/to/agents/qe-test-agent.md',
        relativePath: 'qe-test-agent.md',
        timestamp: Date.now(),
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(discoveryService.invalidateCache).toHaveBeenCalledWith('qe-test-agent');
      expect(removedHandler).toHaveBeenCalledWith('qe-test-agent');
    });
  });

  describe('callbacks', () => {
    it('should call onCardRegenerated callback', async () => {
      const mockCard = createMockCard('qe-callback-test');
      (generator.generateFromFile as any).mockResolvedValue(mockCard);

      const onCardRegenerated = vi.fn();

      service = createHotReloadService({
        generator,
        discoveryService,
        watcher,
        watchPaths: ['/path'],
        onCardRegenerated,
      });

      await service.start();

      (watcher as EventEmitter).emit('agent-change', {
        event: 'add',
        path: '/path/qe-callback-test.md',
        relativePath: 'qe-callback-test.md',
        timestamp: Date.now(),
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(onCardRegenerated).toHaveBeenCalledWith('qe-callback-test', mockCard);
    });

    it('should call onCardRemoved callback', async () => {
      const mockCard = createMockCard('qe-remove-test');
      (generator.generateFromFile as any).mockResolvedValue(mockCard);

      const onCardRemoved = vi.fn();

      service = createHotReloadService({
        generator,
        discoveryService,
        watcher,
        watchPaths: ['/path'],
        onCardRemoved,
      });

      await service.start();

      // Add first
      (watcher as EventEmitter).emit('agent-change', {
        event: 'add',
        path: '/path/qe-remove-test.md',
        relativePath: 'qe-remove-test.md',
        timestamp: Date.now(),
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      // Then remove
      (watcher as EventEmitter).emit('agent-change', {
        event: 'unlink',
        path: '/path/qe-remove-test.md',
        relativePath: 'qe-remove-test.md',
        timestamp: Date.now(),
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(onCardRemoved).toHaveBeenCalledWith('qe-remove-test');
    });

    it('should call onError callback on generation failure', async () => {
      const error = new Error('Generation failed');
      (generator.generateFromFile as any).mockRejectedValue(error);

      const onError = vi.fn();
      const errorHandler = vi.fn();

      service = createHotReloadService({
        generator,
        discoveryService,
        watcher,
        watchPaths: ['/path'],
        onError,
      });

      // Listen for error events to prevent unhandled rejection
      service.on('error', errorHandler);

      await service.start();

      (watcher as EventEmitter).emit('agent-change', {
        event: 'add',
        path: '/path/qe-error-test.md',
        relativePath: 'qe-error-test.md',
        timestamp: Date.now(),
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(onError).toHaveBeenCalled();
      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe('cache management', () => {
    beforeEach(async () => {
      service = createHotReloadService({
        generator,
        discoveryService,
        watcher,
        watchPaths: ['/path'],
      });
      await service.start();
    });

    it('should cache generated cards', async () => {
      const mockCard = createMockCard('qe-cache-test');
      (generator.generateFromFile as any).mockResolvedValue(mockCard);

      (watcher as EventEmitter).emit('agent-change', {
        event: 'add',
        path: '/path/qe-cache-test.md',
        relativePath: 'qe-cache-test.md',
        timestamp: Date.now(),
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const cachedCard = service.getCachedCard('qe-cache-test');
      expect(cachedCard).toEqual(mockCard);
    });

    it('should return null for non-cached cards', () => {
      const cachedCard = service.getCachedCard('non-existent');
      expect(cachedCard).toBeNull();
    });

    it('should list cached agent IDs', async () => {
      const mockCard1 = createMockCard('qe-agent-1');
      const mockCard2 = createMockCard('qe-agent-2');

      (generator.generateFromFile as any)
        .mockResolvedValueOnce(mockCard1)
        .mockResolvedValueOnce(mockCard2);

      (watcher as EventEmitter).emit('agent-change', {
        event: 'add',
        path: '/path/qe-agent-1.md',
        relativePath: 'qe-agent-1.md',
        timestamp: Date.now(),
      });

      (watcher as EventEmitter).emit('agent-change', {
        event: 'add',
        path: '/path/qe-agent-2.md',
        relativePath: 'qe-agent-2.md',
        timestamp: Date.now(),
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const agentIds = service.getCachedAgentIds();
      expect(agentIds).toContain('qe-agent-1');
      expect(agentIds).toContain('qe-agent-2');
    });

    it('should invalidate cache', async () => {
      const mockCard = createMockCard('qe-invalidate-test');
      (generator.generateFromFile as any).mockResolvedValue(mockCard);

      (watcher as EventEmitter).emit('agent-change', {
        event: 'add',
        path: '/path/qe-invalidate-test.md',
        relativePath: 'qe-invalidate-test.md',
        timestamp: Date.now(),
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(service.getCachedCard('qe-invalidate-test')).not.toBeNull();

      const result = service.invalidateCard('qe-invalidate-test');
      expect(result).toBe(true);
      expect(service.getCachedCard('qe-invalidate-test')).toBeNull();
    });
  });

  describe('force reload', () => {
    beforeEach(async () => {
      const mockCard = createMockCard('qe-force-test');
      (generator.generateFromFile as any).mockResolvedValue(mockCard);

      (watcher as any).getKnownFiles.mockReturnValue([
        '/path/qe-force-test.md',
        '/path/qe-force-test-2.md',
      ]);

      service = createHotReloadService({
        generator,
        discoveryService,
        watcher,
        watchPaths: ['/path'],
      });
      await service.start();
    });

    it('should force reload a specific file', async () => {
      const result = await service.forceReload('/path/qe-force-test.md');

      expect(result.success).toBe(true);
      expect(result.agentId).toBe('qe-force-test');
      expect(result.event).toBe('updated');
      expect(generator.generateFromFile).toHaveBeenCalledWith('/path/qe-force-test.md');
    });

    it('should force reload all files', async () => {
      const results = await service.forceReloadAll();

      expect(results).toHaveLength(2);
      expect(generator.generateFromFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('metrics', () => {
    beforeEach(async () => {
      service = createHotReloadService({
        generator,
        discoveryService,
        watcher,
        watchPaths: ['/path'],
        enableMetrics: true,
      });
      await service.start();
    });

    it('should expose Prometheus metrics', () => {
      const metrics = service.getMetrics();
      expect(typeof metrics).toBe('string');
      expect(metrics).toContain('aqe_discovery');
    });
  });

  describe('platform card updates', () => {
    it('should update platform card when autoUpdatePlatformCard is true', async () => {
      const mockCard = createMockCard('qe-platform-test');
      (generator.generateFromFile as any).mockResolvedValue(mockCard);

      service = createHotReloadService({
        generator,
        discoveryService,
        watcher,
        watchPaths: ['/path'],
        autoUpdatePlatformCard: true,
      });

      await service.start();

      (watcher as EventEmitter).emit('agent-change', {
        event: 'add',
        path: '/path/qe-platform-test.md',
        relativePath: 'qe-platform-test.md',
        timestamp: Date.now(),
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(discoveryService.invalidateAllCaches).toHaveBeenCalled();
      expect(discoveryService.getPlatformCard).toHaveBeenCalled();
    });

    it('should not update platform card when autoUpdatePlatformCard is false', async () => {
      const mockCard = createMockCard('qe-no-platform-test');
      (generator.generateFromFile as any).mockResolvedValue(mockCard);

      service = createHotReloadService({
        generator,
        discoveryService,
        watcher,
        watchPaths: ['/path'],
        autoUpdatePlatformCard: false,
      });

      await service.start();

      (watcher as EventEmitter).emit('agent-change', {
        event: 'add',
        path: '/path/qe-no-platform-test.md',
        relativePath: 'qe-no-platform-test.md',
        timestamp: Date.now(),
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(discoveryService.invalidateAllCaches).not.toHaveBeenCalled();
    });
  });
});

describe('createHotReloadService', () => {
  it('should create a HotReloadService instance', () => {
    const service = createHotReloadService({
      generator: createMockGenerator(),
      discoveryService: createMockDiscoveryService(),
      watchPaths: ['/test'],
    });

    expect(service).toBeInstanceOf(HotReloadService);
    service.stop();
  });
});

describe('DEFAULT_HOT_RELOAD_CONFIG', () => {
  it('should have correct default values', () => {
    expect(DEFAULT_HOT_RELOAD_CONFIG.debounceMs).toBe(300);
    expect(DEFAULT_HOT_RELOAD_CONFIG.enableMetrics).toBe(true);
    expect(DEFAULT_HOT_RELOAD_CONFIG.autoUpdatePlatformCard).toBe(true);
  });
});
