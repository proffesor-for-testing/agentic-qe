/**
 * Agentic QE v3 - Product Factors Bridge Unit Tests
 *
 * Tests for cross-domain C4 data retrieval between code-intelligence
 * and requirements-validation domains.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createMockMemory, createMockEventBus } from '../../../mocks';
import { MemoryBackend, EventBus, Subscription } from '../../../../src/kernel/interfaces';
import { DomainEvent, DomainName, ok, err, Result } from '../../../../src/shared/types';
import {
  C4Diagrams,
  C4DiagramResult,
  DetectedExternalSystem,
  DetectedComponent,
  DetectedRelationship,
  C4DiagramsGeneratedPayload,
} from '../../../../src/shared/c4-model';
import { CodeIntelligenceEvents } from '../../../../src/shared/events/domain-events';

// ============================================================================
// Mock Product Factors Bridge Interface
// ============================================================================

/**
 * Bridge configuration options
 */
interface ProductFactorsBridgeConfig {
  /** Cache TTL in milliseconds */
  cacheTtlMs?: number;
  /** Enable event-based updates */
  enableEventUpdates?: boolean;
  /** Maximum cached entries */
  maxCacheEntries?: number;
}

/**
 * C4 data request from product factors assessor
 */
interface C4DataRequest {
  /** Project path to retrieve C4 data for */
  projectPath: string;
  /** Include external systems */
  includeExternalSystems?: boolean;
  /** Include components */
  includeComponents?: boolean;
  /** Include relationships */
  includeRelationships?: boolean;
  /** Force fresh analysis (bypass cache) */
  forceFresh?: boolean;
}

/**
 * C4 data response for product factors assessor
 */
interface C4DataResponse {
  /** C4 diagrams in Mermaid format */
  diagrams: C4Diagrams;
  /** Detected external systems */
  externalSystems: DetectedExternalSystem[];
  /** Detected components */
  components: DetectedComponent[];
  /** Detected relationships */
  relationships: DetectedRelationship[];
  /** Whether data came from cache */
  fromCache: boolean;
  /** Timestamp of last analysis */
  lastAnalyzedAt: Date;
}

/**
 * Bridge interface for cross-domain C4 data access
 */
interface IProductFactorsBridge {
  /** Initialize bridge with event bus */
  initialize(): Promise<void>;
  /** Dispose bridge resources */
  dispose(): Promise<void>;
  /** Get C4 data for a project */
  getC4Data(request: C4DataRequest): Promise<Result<C4DataResponse, Error>>;
  /** Subscribe to C4 data updates */
  onC4DataUpdated(
    callback: (data: C4DataResponse) => void
  ): { unsubscribe: () => void };
  /** Check if C4 data is available for a project */
  hasC4Data(projectPath: string): boolean;
  /** Get cached project paths */
  getCachedProjects(): string[];
  /** Clear cache for a project */
  clearCache(projectPath?: string): void;
}

/**
 * Create a mock Product Factors Bridge for testing
 */
function createMockProductFactorsBridge(
  eventBus: EventBus,
  memory: MemoryBackend,
  config: ProductFactorsBridgeConfig = {}
): IProductFactorsBridge {
  const cache = new Map<
    string,
    { response: C4DataResponse; cachedAt: Date }
  >();
  const updateCallbacks: Array<(data: C4DataResponse) => void> = [];
  let eventSubscription: Subscription | null = null;
  const cacheTtlMs = config.cacheTtlMs ?? 300000; // 5 minutes default
  const maxCacheEntries = config.maxCacheEntries ?? 100;

  const isCacheValid = (cachedAt: Date): boolean => {
    return Date.now() - cachedAt.getTime() < cacheTtlMs;
  };

  const evictOldestEntry = (): void => {
    if (cache.size >= maxCacheEntries) {
      const oldest = Array.from(cache.entries()).reduce((a, b) =>
        a[1].cachedAt < b[1].cachedAt ? a : b
      );
      cache.delete(oldest[0]);
    }
  };

  return {
    initialize: vi.fn(async (): Promise<void> => {
      if (config.enableEventUpdates !== false) {
        eventSubscription = eventBus.subscribe<C4DiagramsGeneratedPayload>(
          CodeIntelligenceEvents.KnowledgeGraphUpdated,
          async (event: DomainEvent<C4DiagramsGeneratedPayload>) => {
            const payload = event.payload;
            if (payload && payload.projectPath) {
              const response: C4DataResponse = {
                diagrams: payload.diagrams,
                externalSystems: [],
                components: [],
                relationships: [],
                fromCache: false,
                lastAnalyzedAt: new Date(),
              };

              cache.set(payload.projectPath, {
                response,
                cachedAt: new Date(),
              });

              for (const callback of updateCallbacks) {
                callback(response);
              }
            }
          }
        );
      }
    }),

    dispose: vi.fn(async (): Promise<void> => {
      if (eventSubscription) {
        eventSubscription.unsubscribe();
        eventSubscription = null;
      }
      cache.clear();
      updateCallbacks.length = 0;
    }),

    getC4Data: vi.fn(
      async (request: C4DataRequest): Promise<Result<C4DataResponse, Error>> => {
        // Check cache first (unless forceFresh)
        if (!request.forceFresh) {
          const cached = cache.get(request.projectPath);
          if (cached && isCacheValid(cached.cachedAt)) {
            return ok({
              ...cached.response,
              fromCache: true,
            });
          }
        }

        // Simulate fetching from code-intelligence domain
        try {
          const storedData = await memory.get<C4DiagramResult>(
            `code-intelligence:c4:${request.projectPath}`
          );

          if (!storedData) {
            return err(new Error(`No C4 data found for ${request.projectPath}`));
          }

          const response: C4DataResponse = {
            diagrams: storedData.diagrams,
            externalSystems: request.includeExternalSystems !== false
              ? storedData.externalSystems
              : [],
            components: request.includeComponents !== false
              ? storedData.components
              : [],
            relationships: request.includeRelationships !== false
              ? storedData.relationships
              : [],
            fromCache: false,
            lastAnalyzedAt: storedData.metadata.generatedAt,
          };

          // Update cache
          evictOldestEntry();
          cache.set(request.projectPath, {
            response,
            cachedAt: new Date(),
          });

          return ok(response);
        } catch (error) {
          return err(
            error instanceof Error ? error : new Error(String(error))
          );
        }
      }
    ),

    onC4DataUpdated: vi.fn(
      (callback: (data: C4DataResponse) => void): { unsubscribe: () => void } => {
        updateCallbacks.push(callback);
        return {
          unsubscribe: () => {
            const index = updateCallbacks.indexOf(callback);
            if (index >= 0) {
              updateCallbacks.splice(index, 1);
            }
          },
        };
      }
    ),

    hasC4Data: vi.fn((projectPath: string): boolean => {
      const cached = cache.get(projectPath);
      return cached !== undefined && isCacheValid(cached.cachedAt);
    }),

    getCachedProjects: vi.fn((): string[] => {
      return Array.from(cache.entries())
        .filter(([_, entry]) => isCacheValid(entry.cachedAt))
        .map(([path]) => path);
    }),

    clearCache: vi.fn((projectPath?: string): void => {
      if (projectPath) {
        cache.delete(projectPath);
      } else {
        cache.clear();
      }
    }),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('ProductFactorsBridge', () => {
  let bridge: IProductFactorsBridge;
  let mockMemory: MemoryBackend;
  let mockEventBus: EventBus;

  beforeEach(async () => {
    mockMemory = createMockMemory();
    mockEventBus = createMockEventBus();
    bridge = createMockProductFactorsBridge(mockEventBus, mockMemory);
    await bridge.initialize();
  });

  afterEach(async () => {
    await bridge.dispose();
    vi.clearAllMocks();
  });

  describe('Cross-Domain C4 Data Retrieval', () => {
    it('should retrieve C4 data from code-intelligence domain', async () => {
      // Store mock C4 data in memory (as if code-intelligence generated it)
      const mockC4Data: C4DiagramResult = {
        diagrams: {
          context: 'graph TB\n    User --> System',
          container: 'graph TB\n    subgraph System\n        API\n    end',
          component: 'graph TB\n    Controller --> Service',
        },
        metadata: {
          projectName: 'test-project',
          projectDescription: 'Test',
          generatedAt: new Date(),
          source: 'codebase-analysis',
        },
        externalSystems: [
          {
            id: 'db',
            name: 'PostgreSQL',
            type: 'database',
            technology: 'PostgreSQL 15',
            detectedFrom: 'pg',
            relationship: 'stores_data_in',
          },
        ],
        components: [
          {
            id: 'user-service',
            name: 'UserService',
            type: 'service',
            files: ['src/services/user.ts'],
          },
        ],
        relationships: [
          {
            sourceId: 'controller',
            targetId: 'user-service',
            type: 'calls',
          },
        ],
      };

      await mockMemory.set('code-intelligence:c4:/test/project', mockC4Data);

      const result = await bridge.getC4Data({
        projectPath: '/test/project',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.diagrams.context).toBeDefined();
        expect(result.value.externalSystems).toHaveLength(1);
        expect(result.value.components).toHaveLength(1);
        expect(result.value.relationships).toHaveLength(1);
        expect(result.value.fromCache).toBe(false);
      }
    });

    it('should filter response based on request options', async () => {
      const mockC4Data: C4DiagramResult = {
        diagrams: { context: 'graph TB' },
        metadata: {
          projectName: 'test',
          projectDescription: 'Test',
          generatedAt: new Date(),
          source: 'codebase-analysis',
        },
        externalSystems: [
          {
            id: 'db',
            name: 'DB',
            type: 'database',
            technology: 'PG',
            detectedFrom: 'pg',
            relationship: 'stores_data_in',
          },
        ],
        components: [
          { id: 'svc', name: 'Svc', type: 'service', files: [] },
        ],
        relationships: [{ sourceId: 'a', targetId: 'b', type: 'calls' }],
      };

      await mockMemory.set('code-intelligence:c4:/filter/project', mockC4Data);

      const result = await bridge.getC4Data({
        projectPath: '/filter/project',
        includeExternalSystems: false,
        includeComponents: true,
        includeRelationships: false,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.externalSystems).toHaveLength(0);
        expect(result.value.components).toHaveLength(1);
        expect(result.value.relationships).toHaveLength(0);
      }
    });

    it('should return error when no C4 data exists', async () => {
      const result = await bridge.getC4Data({
        projectPath: '/nonexistent/project',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('No C4 data found');
      }
    });
  });

  describe('Caching Behavior', () => {
    it('should cache results after first retrieval', async () => {
      const mockC4Data: C4DiagramResult = {
        diagrams: { context: 'graph TB' },
        metadata: {
          projectName: 'cached',
          projectDescription: 'Test',
          generatedAt: new Date(),
          source: 'codebase-analysis',
        },
        externalSystems: [],
        components: [],
        relationships: [],
      };

      await mockMemory.set('code-intelligence:c4:/cached/project', mockC4Data);

      // First call - from memory
      const result1 = await bridge.getC4Data({ projectPath: '/cached/project' });
      expect(result1.success).toBe(true);
      if (result1.success) {
        expect(result1.value.fromCache).toBe(false);
      }

      // Second call - from cache
      const result2 = await bridge.getC4Data({ projectPath: '/cached/project' });
      expect(result2.success).toBe(true);
      if (result2.success) {
        expect(result2.value.fromCache).toBe(true);
      }
    });

    it('should bypass cache when forceFresh is true', async () => {
      const mockC4Data: C4DiagramResult = {
        diagrams: { context: 'graph TB' },
        metadata: {
          projectName: 'fresh',
          projectDescription: 'Test',
          generatedAt: new Date(),
          source: 'codebase-analysis',
        },
        externalSystems: [],
        components: [],
        relationships: [],
      };

      await mockMemory.set('code-intelligence:c4:/fresh/project', mockC4Data);

      // First call
      await bridge.getC4Data({ projectPath: '/fresh/project' });

      // Second call with forceFresh
      const result = await bridge.getC4Data({
        projectPath: '/fresh/project',
        forceFresh: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.fromCache).toBe(false);
      }
    });

    it('should clear cache for specific project', async () => {
      const mockC4Data: C4DiagramResult = {
        diagrams: { context: 'graph TB' },
        metadata: {
          projectName: 'to-clear',
          projectDescription: 'Test',
          generatedAt: new Date(),
          source: 'codebase-analysis',
        },
        externalSystems: [],
        components: [],
        relationships: [],
      };

      await mockMemory.set('code-intelligence:c4:/to-clear/project', mockC4Data);
      await bridge.getC4Data({ projectPath: '/to-clear/project' });

      expect(bridge.hasC4Data('/to-clear/project')).toBe(true);

      bridge.clearCache('/to-clear/project');

      expect(bridge.hasC4Data('/to-clear/project')).toBe(false);
    });

    it('should clear entire cache when no project specified', async () => {
      const mockC4Data: C4DiagramResult = {
        diagrams: { context: 'graph TB' },
        metadata: {
          projectName: 'p',
          projectDescription: 'Test',
          generatedAt: new Date(),
          source: 'codebase-analysis',
        },
        externalSystems: [],
        components: [],
        relationships: [],
      };

      await mockMemory.set('code-intelligence:c4:/project1', mockC4Data);
      await mockMemory.set('code-intelligence:c4:/project2', mockC4Data);
      await bridge.getC4Data({ projectPath: '/project1' });
      await bridge.getC4Data({ projectPath: '/project2' });

      expect(bridge.getCachedProjects()).toHaveLength(2);

      bridge.clearCache();

      expect(bridge.getCachedProjects()).toHaveLength(0);
    });

    it('should list all cached projects', async () => {
      const mockC4Data: C4DiagramResult = {
        diagrams: { context: 'graph TB' },
        metadata: {
          projectName: 'list-test',
          projectDescription: 'Test',
          generatedAt: new Date(),
          source: 'codebase-analysis',
        },
        externalSystems: [],
        components: [],
        relationships: [],
      };

      await mockMemory.set('code-intelligence:c4:/list/project-a', mockC4Data);
      await mockMemory.set('code-intelligence:c4:/list/project-b', mockC4Data);

      await bridge.getC4Data({ projectPath: '/list/project-a' });
      await bridge.getC4Data({ projectPath: '/list/project-b' });

      const cached = bridge.getCachedProjects();

      expect(cached).toContain('/list/project-a');
      expect(cached).toContain('/list/project-b');
    });
  });

  describe('Event-Based Communication', () => {
    it('should subscribe to C4 data updates', async () => {
      const updateCallback = vi.fn();
      const subscription = bridge.onC4DataUpdated(updateCallback);

      // Simulate event from code-intelligence domain
      await mockEventBus.publish({
        id: 'evt-1',
        type: CodeIntelligenceEvents.KnowledgeGraphUpdated,
        timestamp: new Date(),
        source: 'code-intelligence' as DomainName,
        payload: {
          requestId: 'req-1',
          projectPath: '/event/project',
          diagrams: { context: 'graph TB' },
          componentsDetected: 5,
          externalSystemsDetected: 2,
          relationshipsDetected: 8,
          analysisTimeMs: 200,
        } as C4DiagramsGeneratedPayload,
      });

      expect(updateCallback).toHaveBeenCalled();
      expect(updateCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          diagrams: expect.objectContaining({ context: 'graph TB' }),
          fromCache: false,
        })
      );

      subscription.unsubscribe();
    });

    it('should update cache when events are received', async () => {
      expect(bridge.hasC4Data('/event-cache/project')).toBe(false);

      // Simulate event
      await mockEventBus.publish({
        id: 'evt-2',
        type: CodeIntelligenceEvents.KnowledgeGraphUpdated,
        timestamp: new Date(),
        source: 'code-intelligence' as DomainName,
        payload: {
          requestId: 'req-2',
          projectPath: '/event-cache/project',
          diagrams: { context: 'graph TB' },
          componentsDetected: 3,
          externalSystemsDetected: 1,
          relationshipsDetected: 4,
          analysisTimeMs: 150,
        } as C4DiagramsGeneratedPayload,
      });

      expect(bridge.hasC4Data('/event-cache/project')).toBe(true);
    });

    it('should allow unsubscribing from updates', async () => {
      const updateCallback = vi.fn();
      const subscription = bridge.onC4DataUpdated(updateCallback);

      subscription.unsubscribe();

      await mockEventBus.publish({
        id: 'evt-3',
        type: CodeIntelligenceEvents.KnowledgeGraphUpdated,
        timestamp: new Date(),
        source: 'code-intelligence' as DomainName,
        payload: {
          requestId: 'req-3',
          projectPath: '/unsubscribed/project',
          diagrams: { context: 'graph TB' },
          componentsDetected: 1,
          externalSystemsDetected: 0,
          relationshipsDetected: 0,
          analysisTimeMs: 50,
        } as C4DiagramsGeneratedPayload,
      });

      expect(updateCallback).not.toHaveBeenCalled();
    });

    it('should support multiple update subscribers', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      bridge.onC4DataUpdated(callback1);
      bridge.onC4DataUpdated(callback2);
      bridge.onC4DataUpdated(callback3);

      await mockEventBus.publish({
        id: 'evt-4',
        type: CodeIntelligenceEvents.KnowledgeGraphUpdated,
        timestamp: new Date(),
        source: 'code-intelligence' as DomainName,
        payload: {
          requestId: 'req-4',
          projectPath: '/multi-sub/project',
          diagrams: { context: 'graph TB' },
          componentsDetected: 2,
          externalSystemsDetected: 1,
          relationshipsDetected: 3,
          analysisTimeMs: 100,
        } as C4DiagramsGeneratedPayload,
      });

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
      expect(callback3).toHaveBeenCalled();
    });
  });

  describe('Configuration Options', () => {
    it('should respect custom cache TTL', async () => {
      const shortTtlBridge = createMockProductFactorsBridge(
        mockEventBus,
        mockMemory,
        { cacheTtlMs: 100 } // 100ms TTL
      );
      await shortTtlBridge.initialize();

      const mockC4Data: C4DiagramResult = {
        diagrams: { context: 'graph TB' },
        metadata: {
          projectName: 'ttl-test',
          projectDescription: 'Test',
          generatedAt: new Date(),
          source: 'codebase-analysis',
        },
        externalSystems: [],
        components: [],
        relationships: [],
      };

      await mockMemory.set('code-intelligence:c4:/ttl/project', mockC4Data);
      await shortTtlBridge.getC4Data({ projectPath: '/ttl/project' });

      // Initially should have cache
      expect(shortTtlBridge.hasC4Data('/ttl/project')).toBe(true);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Cache should be expired
      expect(shortTtlBridge.hasC4Data('/ttl/project')).toBe(false);

      await shortTtlBridge.dispose();
    });

    it('should disable event updates when configured', async () => {
      const noEventsBridge = createMockProductFactorsBridge(
        mockEventBus,
        mockMemory,
        { enableEventUpdates: false }
      );
      await noEventsBridge.initialize();

      const updateCallback = vi.fn();
      noEventsBridge.onC4DataUpdated(updateCallback);

      // Event should not trigger update
      await mockEventBus.publish({
        id: 'evt-5',
        type: CodeIntelligenceEvents.KnowledgeGraphUpdated,
        timestamp: new Date(),
        source: 'code-intelligence' as DomainName,
        payload: {
          requestId: 'req-5',
          projectPath: '/no-events/project',
          diagrams: { context: 'graph TB' },
          componentsDetected: 1,
          externalSystemsDetected: 0,
          relationshipsDetected: 0,
          analysisTimeMs: 25,
        } as C4DiagramsGeneratedPayload,
      });

      // The callback should not be called because event updates are disabled
      expect(noEventsBridge.hasC4Data('/no-events/project')).toBe(false);

      await noEventsBridge.dispose();
    });
  });

  describe('Error Handling', () => {
    it('should handle memory errors gracefully', async () => {
      const errorMemory = createMockMemory();
      errorMemory.get = vi.fn().mockRejectedValue(new Error('Memory error'));

      const errorBridge = createMockProductFactorsBridge(
        mockEventBus,
        errorMemory
      );
      await errorBridge.initialize();

      const result = await errorBridge.getC4Data({
        projectPath: '/error/project',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Memory error');
      }

      await errorBridge.dispose();
    });

    it('should handle disposed bridge gracefully', async () => {
      await bridge.dispose();

      // Operations after dispose should not throw
      expect(bridge.hasC4Data('/any/project')).toBe(false);
      expect(bridge.getCachedProjects()).toHaveLength(0);
    });
  });

  describe('Lifecycle Management', () => {
    it('should initialize correctly', async () => {
      const freshBridge = createMockProductFactorsBridge(mockEventBus, mockMemory);

      await expect(freshBridge.initialize()).resolves.not.toThrow();

      await freshBridge.dispose();
    });

    it('should dispose correctly and clean up resources', async () => {
      const mockC4Data: C4DiagramResult = {
        diagrams: { context: 'graph TB' },
        metadata: {
          projectName: 'dispose-test',
          projectDescription: 'Test',
          generatedAt: new Date(),
          source: 'codebase-analysis',
        },
        externalSystems: [],
        components: [],
        relationships: [],
      };

      await mockMemory.set('code-intelligence:c4:/dispose/project', mockC4Data);
      await bridge.getC4Data({ projectPath: '/dispose/project' });

      const callback = vi.fn();
      bridge.onC4DataUpdated(callback);

      expect(bridge.getCachedProjects()).toHaveLength(1);

      await bridge.dispose();

      expect(bridge.getCachedProjects()).toHaveLength(0);
    });

    it('should be idempotent for multiple initialize calls', async () => {
      const freshBridge = createMockProductFactorsBridge(mockEventBus, mockMemory);

      await freshBridge.initialize();
      await freshBridge.initialize(); // Second call should not throw
      await freshBridge.initialize(); // Third call should not throw

      await freshBridge.dispose();
    });
  });
});
