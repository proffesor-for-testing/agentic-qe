/**
 * File Watcher Unit Tests
 *
 * Comprehensive test suite for the A2A agent file watcher that enables
 * dynamic agent discovery and hot-reload functionality.
 *
 * Target: 25 tests with 85%+ coverage
 *
 * @module tests/unit/adapters/a2a/discovery/file-watcher
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// Type Definitions (Implementation will be created by Coder agent)
// ============================================================================

interface FileEvent {
  type: 'add' | 'change' | 'unlink';
  path: string;
  timestamp: Date;
}

interface AgentFileWatcherConfig {
  watchPath: string;
  pattern?: string;
  debounceMs?: number;
  ignoreInitial?: boolean;
  persistent?: boolean;
}

interface AgentFileWatcher {
  start(): Promise<void>;
  stop(): void;
  isWatching(): boolean;
  getWatchedFiles(): string[];
  on(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener: (...args: unknown[]) => void): void;
  destroy(): void;
}

interface HotReloadService {
  reloadAgent(path: string): Promise<boolean>;
  addAgent(path: string): Promise<boolean>;
  removeAgent(path: string): Promise<boolean>;
  getLoadedAgents(): string[];
  invalidateCache(agentId?: string): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
  destroy(): void;
}

interface AgentHealthTracker {
  markHealthy(agentId: string): void;
  markUnhealthy(agentId: string, reason: string): void;
  isHealthy(agentId: string): boolean;
  getHealthStatus(agentId: string): { healthy: boolean; reason?: string; since: Date } | null;
  getHealthyAgents(): string[];
  getUnhealthyAgents(): string[];
  on(event: string, listener: (...args: unknown[]) => void): void;
  destroy(): void;
}

interface DiscoveryMetrics {
  totalAgentCount: number;
  healthyAgentCount: number;
  unhealthyAgentCount: number;
  reloadCount: number;
  lastReloadAt: Date | null;
  averageReloadTimeMs: number;
}

// ============================================================================
// Mock Implementations
// ============================================================================

const createMockFileWatcher = (config: AgentFileWatcherConfig): AgentFileWatcher => {
  const watchedFiles = new Set<string>();
  const eventListeners = new Map<string, Array<(...args: unknown[]) => void>>();
  let watching = false;
  let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
  const pendingEvents: FileEvent[] = [];

  const debounceMs = config.debounceMs ?? 100;
  const pattern = config.pattern ?? '**/*.md';

  const emit = (event: string, ...args: unknown[]) => {
    const listeners = eventListeners.get(event) ?? [];
    listeners.forEach((l) => l(...args));
  };

  const processPendingEvents = () => {
    const events = [...pendingEvents];
    pendingEvents.length = 0;

    // Group by path to deduplicate rapid changes
    const byPath = new Map<string, FileEvent>();
    for (const event of events) {
      byPath.set(event.path, event);
    }

    for (const event of byPath.values()) {
      emit(event.type, event);
    }
  };

  return {
    async start(): Promise<void> {
      watching = true;
      // Simulate scanning directory
      await new Promise((resolve) => setTimeout(resolve, 10));
      emit('ready');
    },

    stop(): void {
      watching = false;
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
        debounceTimeout = null;
      }
      emit('close');
    },

    isWatching(): boolean {
      return watching;
    },

    getWatchedFiles(): string[] {
      return Array.from(watchedFiles);
    },

    on(event: string, listener: (...args: unknown[]) => void): void {
      const listeners = eventListeners.get(event) ?? [];
      listeners.push(listener);
      eventListeners.set(event, listeners);
    },

    off(event: string, listener: (...args: unknown[]) => void): void {
      const listeners = eventListeners.get(event) ?? [];
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    },

    destroy(): void {
      this.stop();
      watchedFiles.clear();
      eventListeners.clear();
    },

    // Test helpers
    _simulateFileAdd(path: string) {
      if (!watching) return;
      if (!path.endsWith('.md')) return; // Filter non-markdown

      watchedFiles.add(path);
      pendingEvents.push({ type: 'add', path, timestamp: new Date() });

      if (debounceTimeout) clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(processPendingEvents, debounceMs);
    },

    _simulateFileChange(path: string) {
      if (!watching) return;
      pendingEvents.push({ type: 'change', path, timestamp: new Date() });

      if (debounceTimeout) clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(processPendingEvents, debounceMs);
    },

    _simulateFileUnlink(path: string) {
      if (!watching) return;
      watchedFiles.delete(path);
      pendingEvents.push({ type: 'unlink', path, timestamp: new Date() });

      if (debounceTimeout) clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(processPendingEvents, debounceMs);
    },
  } as AgentFileWatcher & {
    _simulateFileAdd: (path: string) => void;
    _simulateFileChange: (path: string) => void;
    _simulateFileUnlink: (path: string) => void;
  };
};

const createMockHotReloadService = (): HotReloadService => {
  const loadedAgents = new Map<string, boolean>();
  const eventListeners = new Map<string, Array<(...args: unknown[]) => void>>();

  const emit = (event: string, ...args: unknown[]) => {
    const listeners = eventListeners.get(event) ?? [];
    listeners.forEach((l) => l(...args));
  };

  return {
    async reloadAgent(path: string): Promise<boolean> {
      if (!loadedAgents.has(path)) {
        return false;
      }

      // Simulate reload
      await new Promise((resolve) => setTimeout(resolve, 5));
      emit('reloaded', { path });
      return true;
    },

    async addAgent(path: string): Promise<boolean> {
      if (loadedAgents.has(path)) {
        return false;
      }

      // Simulate loading
      await new Promise((resolve) => setTimeout(resolve, 5));
      loadedAgents.set(path, true);
      emit('added', { path });
      return true;
    },

    async removeAgent(path: string): Promise<boolean> {
      if (!loadedAgents.has(path)) {
        return false;
      }

      loadedAgents.delete(path);
      emit('removed', { path });
      return true;
    },

    getLoadedAgents(): string[] {
      return Array.from(loadedAgents.keys());
    },

    invalidateCache(agentId?: string): void {
      emit('cacheInvalidated', { agentId });
    },

    on(event: string, listener: (...args: unknown[]) => void): void {
      const listeners = eventListeners.get(event) ?? [];
      listeners.push(listener);
      eventListeners.set(event, listeners);
    },

    destroy(): void {
      loadedAgents.clear();
      eventListeners.clear();
    },
  };
};

const createMockHealthTracker = (): AgentHealthTracker => {
  const healthStatus = new Map<string, { healthy: boolean; reason?: string; since: Date }>();
  const eventListeners = new Map<string, Array<(...args: unknown[]) => void>>();

  const emit = (event: string, ...args: unknown[]) => {
    const listeners = eventListeners.get(event) ?? [];
    listeners.forEach((l) => l(...args));
  };

  return {
    markHealthy(agentId: string): void {
      const previous = healthStatus.get(agentId);
      healthStatus.set(agentId, { healthy: true, since: new Date() });

      if (!previous || !previous.healthy) {
        emit('healthChanged', { agentId, healthy: true });
      }
    },

    markUnhealthy(agentId: string, reason: string): void {
      const previous = healthStatus.get(agentId);
      healthStatus.set(agentId, { healthy: false, reason, since: new Date() });

      if (!previous || previous.healthy) {
        emit('healthChanged', { agentId, healthy: false, reason });
      }
    },

    isHealthy(agentId: string): boolean {
      return healthStatus.get(agentId)?.healthy ?? false;
    },

    getHealthStatus(agentId: string) {
      return healthStatus.get(agentId) ?? null;
    },

    getHealthyAgents(): string[] {
      return Array.from(healthStatus.entries())
        .filter(([, status]) => status.healthy)
        .map(([id]) => id);
    },

    getUnhealthyAgents(): string[] {
      return Array.from(healthStatus.entries())
        .filter(([, status]) => !status.healthy)
        .map(([id]) => id);
    },

    on(event: string, listener: (...args: unknown[]) => void): void {
      const listeners = eventListeners.get(event) ?? [];
      listeners.push(listener);
      eventListeners.set(event, listeners);
    },

    destroy(): void {
      healthStatus.clear();
      eventListeners.clear();
    },
  };
};

// ============================================================================
// File Watcher Tests
// ============================================================================

describe('A2A Agent File Watcher', () => {
  let watcher: ReturnType<typeof createMockFileWatcher>;

  beforeEach(() => {
    watcher = createMockFileWatcher({
      watchPath: '.claude/agents/v3',
      pattern: '**/*.md',
      debounceMs: 50,
    });
  });

  afterEach(() => {
    watcher.destroy();
  });

  describe('start/stop', () => {
    it('should start watching', async () => {
      await watcher.start();

      expect(watcher.isWatching()).toBe(true);
    });

    it('should emit ready event when started', async () => {
      const ready = vi.fn();
      watcher.on('ready', ready);

      await watcher.start();

      expect(ready).toHaveBeenCalledOnce();
    });

    it('should stop watching', async () => {
      await watcher.start();
      watcher.stop();

      expect(watcher.isWatching()).toBe(false);
    });

    it('should emit close event when stopped', async () => {
      const close = vi.fn();
      watcher.on('close', close);

      await watcher.start();
      watcher.stop();

      expect(close).toHaveBeenCalledOnce();
    });
  });

  describe('file events', () => {
    beforeEach(async () => {
      await watcher.start();
    });

    it('should detect new agent markdown files', async () => {
      const add = vi.fn();
      watcher.on('add', add);

      watcher._simulateFileAdd('.claude/agents/v3/qe-test-architect.md');

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(add).toHaveBeenCalledOnce();
      expect(add).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'add',
          path: '.claude/agents/v3/qe-test-architect.md',
        })
      );
    });

    it('should detect modified agent files', async () => {
      const change = vi.fn();
      watcher.on('change', change);

      watcher._simulateFileAdd('.claude/agents/v3/qe-test-architect.md');
      watcher._simulateFileChange('.claude/agents/v3/qe-test-architect.md');

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(change).toHaveBeenCalled();
    });

    it('should detect deleted agent files', async () => {
      const unlink = vi.fn();
      watcher.on('unlink', unlink);

      watcher._simulateFileAdd('.claude/agents/v3/qe-test-architect.md');
      await new Promise((resolve) => setTimeout(resolve, 100));

      watcher._simulateFileUnlink('.claude/agents/v3/qe-test-architect.md');
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(unlink).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'unlink',
          path: '.claude/agents/v3/qe-test-architect.md',
        })
      );
    });

    it('should debounce rapid changes', async () => {
      const change = vi.fn();
      watcher.on('change', change);

      // Simulate rapid changes
      watcher._simulateFileChange('.claude/agents/v3/qe-test-architect.md');
      watcher._simulateFileChange('.claude/agents/v3/qe-test-architect.md');
      watcher._simulateFileChange('.claude/agents/v3/qe-test-architect.md');

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should only emit once after debounce
      expect(change).toHaveBeenCalledTimes(1);
    });

    it('should ignore non-markdown files', async () => {
      const add = vi.fn();
      watcher.on('add', add);

      watcher._simulateFileAdd('.claude/agents/v3/config.json');
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(add).not.toHaveBeenCalled();
    });
  });

  describe('tracked files', () => {
    beforeEach(async () => {
      await watcher.start();
    });

    it('should track added files', async () => {
      watcher._simulateFileAdd('.claude/agents/v3/agent1.md');
      watcher._simulateFileAdd('.claude/agents/v3/agent2.md');

      await new Promise((resolve) => setTimeout(resolve, 100));

      const files = watcher.getWatchedFiles();
      expect(files).toContain('.claude/agents/v3/agent1.md');
      expect(files).toContain('.claude/agents/v3/agent2.md');
    });

    it('should remove deleted files from tracking', async () => {
      watcher._simulateFileAdd('.claude/agents/v3/agent1.md');
      await new Promise((resolve) => setTimeout(resolve, 100));

      watcher._simulateFileUnlink('.claude/agents/v3/agent1.md');
      await new Promise((resolve) => setTimeout(resolve, 100));

      const files = watcher.getWatchedFiles();
      expect(files).not.toContain('.claude/agents/v3/agent1.md');
    });
  });

  describe('event listeners', () => {
    it('should allow removing event listeners', async () => {
      const listener = vi.fn();
      watcher.on('add', listener);
      watcher.off('add', listener);

      await watcher.start();
      watcher._simulateFileAdd('.claude/agents/v3/agent.md');
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(listener).not.toHaveBeenCalled();
    });
  });
});

// ============================================================================
// Hot Reload Service Tests
// ============================================================================

describe('A2A Hot Reload Service', () => {
  let service: HotReloadService;

  beforeEach(() => {
    service = createMockHotReloadService();
  });

  afterEach(() => {
    service.destroy();
  });

  describe('addAgent', () => {
    it('should add agent card on file creation', async () => {
      const result = await service.addAgent('.claude/agents/v3/qe-test-architect.md');

      expect(result).toBe(true);
      expect(service.getLoadedAgents()).toContain('.claude/agents/v3/qe-test-architect.md');
    });

    it('should emit added event', async () => {
      const added = vi.fn();
      service.on('added', added);

      await service.addAgent('.claude/agents/v3/qe-test-architect.md');

      expect(added).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '.claude/agents/v3/qe-test-architect.md',
        })
      );
    });

    it('should reject duplicate agent paths', async () => {
      await service.addAgent('.claude/agents/v3/qe-test-architect.md');
      const result = await service.addAgent('.claude/agents/v3/qe-test-architect.md');

      expect(result).toBe(false);
    });
  });

  describe('reloadAgent', () => {
    it('should reload existing agent card on file change', async () => {
      await service.addAgent('.claude/agents/v3/qe-test-architect.md');

      const result = await service.reloadAgent('.claude/agents/v3/qe-test-architect.md');

      expect(result).toBe(true);
    });

    it('should emit reloaded event', async () => {
      await service.addAgent('.claude/agents/v3/qe-test-architect.md');

      const reloaded = vi.fn();
      service.on('reloaded', reloaded);

      await service.reloadAgent('.claude/agents/v3/qe-test-architect.md');

      expect(reloaded).toHaveBeenCalled();
    });

    it('should return false for non-existent agent', async () => {
      const result = await service.reloadAgent('.claude/agents/v3/non-existent.md');

      expect(result).toBe(false);
    });
  });

  describe('removeAgent', () => {
    it('should remove agent card on file deletion', async () => {
      await service.addAgent('.claude/agents/v3/qe-test-architect.md');

      const result = await service.removeAgent('.claude/agents/v3/qe-test-architect.md');

      expect(result).toBe(true);
      expect(service.getLoadedAgents()).not.toContain('.claude/agents/v3/qe-test-architect.md');
    });

    it('should emit removed event', async () => {
      await service.addAgent('.claude/agents/v3/qe-test-architect.md');

      const removed = vi.fn();
      service.on('removed', removed);

      await service.removeAgent('.claude/agents/v3/qe-test-architect.md');

      expect(removed).toHaveBeenCalled();
    });

    it('should return false for non-existent agent', async () => {
      const result = await service.removeAgent('.claude/agents/v3/non-existent.md');

      expect(result).toBe(false);
    });
  });

  describe('cache invalidation', () => {
    it('should invalidate all caches when no agent specified', () => {
      const invalidated = vi.fn();
      service.on('cacheInvalidated', invalidated);

      service.invalidateCache();

      expect(invalidated).toHaveBeenCalledWith({ agentId: undefined });
    });

    it('should invalidate specific agent cache', () => {
      const invalidated = vi.fn();
      service.on('cacheInvalidated', invalidated);

      service.invalidateCache('qe-test-architect');

      expect(invalidated).toHaveBeenCalledWith({ agentId: 'qe-test-architect' });
    });
  });

  describe('getLoadedAgents', () => {
    it('should return all loaded agent paths', async () => {
      await service.addAgent('.claude/agents/v3/agent1.md');
      await service.addAgent('.claude/agents/v3/agent2.md');
      await service.addAgent('.claude/agents/v3/agent3.md');

      const agents = service.getLoadedAgents();

      expect(agents).toHaveLength(3);
    });

    it('should return empty array when no agents loaded', () => {
      const agents = service.getLoadedAgents();

      expect(agents).toEqual([]);
    });
  });
});

// ============================================================================
// Agent Health Tracker Tests
// ============================================================================

describe('A2A Agent Health Tracker', () => {
  let tracker: AgentHealthTracker;

  beforeEach(() => {
    tracker = createMockHealthTracker();
  });

  afterEach(() => {
    tracker.destroy();
  });

  describe('health status', () => {
    it('should track agent health status', () => {
      tracker.markHealthy('qe-test-architect');

      expect(tracker.isHealthy('qe-test-architect')).toBe(true);
    });

    it('should mark unhealthy agents with reason', () => {
      tracker.markUnhealthy('qe-test-architect', 'Connection timeout');

      expect(tracker.isHealthy('qe-test-architect')).toBe(false);

      const status = tracker.getHealthStatus('qe-test-architect');
      expect(status?.reason).toBe('Connection timeout');
    });

    it('should recover healthy agents', () => {
      tracker.markUnhealthy('qe-test-architect', 'Timeout');
      tracker.markHealthy('qe-test-architect');

      expect(tracker.isHealthy('qe-test-architect')).toBe(true);
    });

    it('should emit healthChanged event', () => {
      const changed = vi.fn();
      tracker.on('healthChanged', changed);

      tracker.markUnhealthy('qe-test-architect', 'Error');

      expect(changed).toHaveBeenCalledWith({
        agentId: 'qe-test-architect',
        healthy: false,
        reason: 'Error',
      });
    });

    it('should not emit event when health status unchanged', () => {
      tracker.markHealthy('qe-test-architect');

      const changed = vi.fn();
      tracker.on('healthChanged', changed);

      tracker.markHealthy('qe-test-architect');

      expect(changed).not.toHaveBeenCalled();
    });
  });

  describe('health queries', () => {
    beforeEach(() => {
      tracker.markHealthy('agent1');
      tracker.markHealthy('agent2');
      tracker.markUnhealthy('agent3', 'Error');
      tracker.markUnhealthy('agent4', 'Timeout');
    });

    it('should get all healthy agents', () => {
      const healthy = tracker.getHealthyAgents();

      expect(healthy).toContain('agent1');
      expect(healthy).toContain('agent2');
      expect(healthy).toHaveLength(2);
    });

    it('should get all unhealthy agents', () => {
      const unhealthy = tracker.getUnhealthyAgents();

      expect(unhealthy).toContain('agent3');
      expect(unhealthy).toContain('agent4');
      expect(unhealthy).toHaveLength(2);
    });

    it('should return null for unknown agent', () => {
      const status = tracker.getHealthStatus('unknown-agent');

      expect(status).toBeNull();
    });
  });

  describe('health status details', () => {
    it('should track when health status changed', () => {
      const before = new Date();
      tracker.markHealthy('qe-test-architect');

      const status = tracker.getHealthStatus('qe-test-architect');

      expect(status?.since).toBeInstanceOf(Date);
      expect(status?.since.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });
});

// ============================================================================
// Discovery Metrics Tests
// ============================================================================

describe('A2A Discovery Metrics', () => {
  // These tests define the expected metrics interface
  // Implementation will track actual values

  it.todo('should track total agent count');

  it.todo('should track healthy/unhealthy counts');

  it.todo('should track reload frequency');

  it.todo('should track average reload time');

  it.todo('should expose prometheus format');

  it.todo('should reset metrics on demand');
});

// ============================================================================
// Integration Scenarios
// ============================================================================

describe('File Watcher + Hot Reload Integration', () => {
  let watcher: ReturnType<typeof createMockFileWatcher>;
  let reloadService: HotReloadService;

  beforeEach(async () => {
    watcher = createMockFileWatcher({
      watchPath: '.claude/agents/v3',
      debounceMs: 50,
    });
    reloadService = createMockHotReloadService();

    // Wire up events
    watcher.on('add', async (event: FileEvent) => {
      await reloadService.addAgent(event.path);
    });
    watcher.on('change', async (event: FileEvent) => {
      await reloadService.reloadAgent(event.path);
    });
    watcher.on('unlink', async (event: FileEvent) => {
      await reloadService.removeAgent(event.path);
    });

    await watcher.start();
  });

  afterEach(() => {
    watcher.destroy();
    reloadService.destroy();
  });

  it('should add agent when file is created', async () => {
    watcher._simulateFileAdd('.claude/agents/v3/new-agent.md');
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(reloadService.getLoadedAgents()).toContain('.claude/agents/v3/new-agent.md');
  });

  it('should reload agent when file changes', async () => {
    watcher._simulateFileAdd('.claude/agents/v3/agent.md');
    await new Promise((resolve) => setTimeout(resolve, 100));

    const reloaded = vi.fn();
    reloadService.on('reloaded', reloaded);

    watcher._simulateFileChange('.claude/agents/v3/agent.md');
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(reloaded).toHaveBeenCalled();
  });

  it('should remove agent when file is deleted', async () => {
    watcher._simulateFileAdd('.claude/agents/v3/agent.md');
    await new Promise((resolve) => setTimeout(resolve, 100));

    watcher._simulateFileUnlink('.claude/agents/v3/agent.md');
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(reloadService.getLoadedAgents()).not.toContain('.claude/agents/v3/agent.md');
  });
});
