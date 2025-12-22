/**
 * Unit Tests for CodeIntelligenceService
 *
 * Comprehensive test coverage for the singleton service that provides
 * Code Intelligence capabilities to all QE agents.
 *
 * Test Coverage:
 * 1. Singleton pattern (getInstance, resetInstance)
 * 2. checkPrerequisites() method
 * 3. initialize() and shutdown() lifecycle
 * 4. getComponents() and getAgentConfig() methods
 * 5. indexDirectory() and search() methods
 * 6. Error handling and edge cases
 */

import { describe, it, expect, beforeEach, afterEach, jest, beforeAll, afterAll } from '@jest/globals';
import { CodeIntelligenceService } from '../../../src/code-intelligence/service/CodeIntelligenceService.js';
import type { CodeIntelligenceServiceConfig } from '../../../src/code-intelligence/service/CodeIntelligenceService.js';

// Mock the orchestrator and dependencies
jest.mock('../../../src/code-intelligence/orchestrator/CodeIntelligenceOrchestrator.js');

describe('CodeIntelligenceService', () => {
  // Reset singleton before and after each test to ensure isolation
  beforeEach(() => {
    CodeIntelligenceService.resetInstance();
  });

  afterEach(() => {
    CodeIntelligenceService.resetInstance();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls to getInstance', () => {
      const instance1 = CodeIntelligenceService.getInstance();
      const instance2 = CodeIntelligenceService.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should accept configuration only on first getInstance call', () => {
      const config1: CodeIntelligenceServiceConfig = {
        rootDir: '/test/dir1',
        watchEnabled: true,
      };

      const config2: CodeIntelligenceServiceConfig = {
        rootDir: '/test/dir2',
        watchEnabled: false,
      };

      const instance1 = CodeIntelligenceService.getInstance(config1);
      const instance2 = CodeIntelligenceService.getInstance(config2);

      expect(instance1).toBe(instance2);
      // Configuration from config2 should be ignored since instance already exists
    });

    it('should reset instance and allow new configuration after resetInstance', () => {
      const config1: CodeIntelligenceServiceConfig = {
        rootDir: '/test/dir1',
      };

      const instance1 = CodeIntelligenceService.getInstance(config1);

      CodeIntelligenceService.resetInstance();

      const config2: CodeIntelligenceServiceConfig = {
        rootDir: '/test/dir2',
      };

      const instance2 = CodeIntelligenceService.getInstance(config2);

      expect(instance1).not.toBe(instance2);
    });

    it('should call shutdown when resetting instance', async () => {
      const instance = CodeIntelligenceService.getInstance();
      const shutdownSpy = jest.spyOn(instance, 'shutdown');

      CodeIntelligenceService.resetInstance();

      // Wait for async shutdown to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(shutdownSpy).toHaveBeenCalled();
    });

    it('should handle resetInstance when no instance exists', () => {
      expect(() => {
        CodeIntelligenceService.resetInstance();
      }).not.toThrow();
    });
  });

  describe('Configuration', () => {
    it('should use default configuration when none provided', () => {
      const instance = CodeIntelligenceService.getInstance();

      expect(instance).toBeDefined();
      expect(instance.isReady()).toBe(false); // Not initialized yet
    });

    it('should accept custom root directory', () => {
      const config: CodeIntelligenceServiceConfig = {
        rootDir: '/custom/root',
      };

      const instance = CodeIntelligenceService.getInstance(config);

      expect(instance).toBeDefined();
    });

    it('should accept custom Ollama URL', () => {
      const config: CodeIntelligenceServiceConfig = {
        ollamaUrl: 'http://custom-ollama:11434',
      };

      const instance = CodeIntelligenceService.getInstance(config);

      expect(instance).toBeDefined();
    });

    it('should accept custom database configuration', () => {
      const config: CodeIntelligenceServiceConfig = {
        database: {
          enabled: true,
          host: 'custom-host',
          port: 5433,
          database: 'custom_db',
          user: 'custom_user',
          password: 'custom_pass',
        },
      };

      const instance = CodeIntelligenceService.getInstance(config);

      expect(instance).toBeDefined();
    });

    it('should accept watch and git flags', () => {
      const config: CodeIntelligenceServiceConfig = {
        watchEnabled: true,
        gitEnabled: false,
      };

      const instance = CodeIntelligenceService.getInstance(config);

      expect(instance).toBeDefined();
    });

    it('should use environment variables for database config when not provided', () => {
      // Save original env vars
      const originalEnv = { ...process.env };

      // Set custom env vars
      process.env.RUVECTOR_HOST = 'env-host';
      process.env.RUVECTOR_PORT = '5433';
      process.env.RUVECTOR_DATABASE = 'env_db';
      process.env.RUVECTOR_USER = 'env_user';
      process.env.RUVECTOR_PASSWORD = 'env_pass';
      process.env.OLLAMA_URL = 'http://env-ollama:11434';

      CodeIntelligenceService.resetInstance();
      const instance = CodeIntelligenceService.getInstance();

      expect(instance).toBeDefined();

      // Restore env vars
      process.env = originalEnv;
    });
  });

  describe('checkPrerequisites()', () => {
    // Note: These tests will make actual network calls unless we mock fetch and pg.Pool
    // For unit tests, we should mock these dependencies

    beforeAll(() => {
      // Mock global fetch
      global.fetch = jest.fn() as any;
    });

    afterAll(() => {
      // Restore fetch
      delete (global as any).fetch;
    });

    it('should check Ollama availability', async () => {
      // Mock successful Ollama response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [
            { name: 'nomic-embed-text:latest' },
          ],
        }),
      });

      // Mock successful PostgreSQL connection
      jest.mock('pg', () => ({
        Pool: jest.fn().mockImplementation(() => ({
          query: jest.fn().mockResolvedValue({ rows: [] }),
          end: jest.fn().mockResolvedValue(undefined),
        })),
      }));

      const prereqs = await CodeIntelligenceService.checkPrerequisites();

      expect(prereqs).toBeDefined();
      expect(prereqs.ollama).toBeDefined();
      expect(prereqs.ollamaModel).toBeDefined();
      expect(prereqs.postgres).toBeDefined();
      expect(prereqs.allReady).toBeDefined();
      expect(prereqs.messages).toBeInstanceOf(Array);
    });

    it('should detect when Ollama is not available', async () => {
      // Mock failed Ollama response
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Connection refused'));

      // Mock successful PostgreSQL (to isolate Ollama failure)
      jest.mock('pg', () => ({
        Pool: jest.fn().mockImplementation(() => ({
          query: jest.fn().mockResolvedValue({ rows: [] }),
          end: jest.fn().mockResolvedValue(undefined),
        })),
      }));

      const prereqs = await CodeIntelligenceService.checkPrerequisites();

      expect(prereqs.ollama).toBe(false);
      expect(prereqs.allReady).toBe(false);
      expect(prereqs.messages.length).toBeGreaterThan(0);
      expect(prereqs.messages.some(m => m.includes('Ollama'))).toBe(true);
    });

    it('should detect when nomic-embed-text model is missing', async () => {
      // Mock Ollama response without the required model
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [
            { name: 'llama2:latest' },
          ],
        }),
      });

      const prereqs = await CodeIntelligenceService.checkPrerequisites();

      expect(prereqs.ollama).toBe(true);
      expect(prereqs.ollamaModel).toBe(false);
      expect(prereqs.allReady).toBe(false);
      expect(prereqs.messages.some(m => m.includes('nomic-embed-text'))).toBe(true);
    });

    it('should detect when PostgreSQL is not available', async () => {
      // Mock successful Ollama
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: 'nomic-embed-text:latest' }],
        }),
      });

      // Mock failed PostgreSQL
      jest.mock('pg', () => ({
        Pool: jest.fn().mockImplementation(() => ({
          query: jest.fn().mockRejectedValue(new Error('Connection refused')),
          end: jest.fn().mockResolvedValue(undefined),
        })),
      }));

      const prereqs = await CodeIntelligenceService.checkPrerequisites();

      expect(prereqs.messages.some(m => m.includes('RuVector') || m.includes('PostgreSQL'))).toBe(true);
    });

    it('should timeout Ollama check after 3 seconds', async () => {
      // Mock slow Ollama response that will timeout
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        new Promise((resolve) => setTimeout(resolve, 5000))
      );

      const startTime = Date.now();
      const prereqs = await CodeIntelligenceService.checkPrerequisites();
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(4000); // Should timeout around 3 seconds
      expect(prereqs.ollama).toBe(false);
    });
  });

  describe('Lifecycle Management', () => {
    describe('initialize()', () => {
      it('should initialize successfully when prerequisites are met', async () => {
        // Mock successful prerequisites
        jest.spyOn(CodeIntelligenceService, 'checkPrerequisites').mockResolvedValue({
          ollama: true,
          ollamaModel: true,
          postgres: true,
          allReady: true,
          messages: [],
        });

        const instance = CodeIntelligenceService.getInstance();

        await expect(instance.initialize()).resolves.not.toThrow();
        expect(instance.isReady()).toBe(true);
      });

      it('should throw error when prerequisites are not met', async () => {
        // Mock failed prerequisites
        jest.spyOn(CodeIntelligenceService, 'checkPrerequisites').mockResolvedValue({
          ollama: false,
          ollamaModel: false,
          postgres: false,
          allReady: false,
          messages: ['Ollama not available', 'PostgreSQL not available'],
        });

        const instance = CodeIntelligenceService.getInstance();

        await expect(instance.initialize()).rejects.toThrow('prerequisites not met');
      });

      it('should not re-initialize if already initialized', async () => {
        jest.spyOn(CodeIntelligenceService, 'checkPrerequisites').mockResolvedValue({
          ollama: true,
          ollamaModel: true,
          postgres: true,
          allReady: true,
          messages: [],
        });

        const instance = CodeIntelligenceService.getInstance();

        await instance.initialize();
        const checkSpy = jest.spyOn(CodeIntelligenceService, 'checkPrerequisites');

        // Second initialize should return early
        await instance.initialize();

        expect(checkSpy).not.toHaveBeenCalled();
      });

      it('should handle concurrent initialization attempts', async () => {
        jest.spyOn(CodeIntelligenceService, 'checkPrerequisites').mockResolvedValue({
          ollama: true,
          ollamaModel: true,
          postgres: true,
          allReady: true,
          messages: [],
        });

        const instance = CodeIntelligenceService.getInstance();

        // Start multiple initializations concurrently
        const promises = [
          instance.initialize(),
          instance.initialize(),
          instance.initialize(),
        ];

        await expect(Promise.all(promises)).resolves.not.toThrow();
        expect(instance.isReady()).toBe(true);
      });
    });

    describe('shutdown()', () => {
      it('should shutdown successfully', async () => {
        jest.spyOn(CodeIntelligenceService, 'checkPrerequisites').mockResolvedValue({
          ollama: true,
          ollamaModel: true,
          postgres: true,
          allReady: true,
          messages: [],
        });

        const instance = CodeIntelligenceService.getInstance();
        await instance.initialize();

        await expect(instance.shutdown()).resolves.not.toThrow();
        expect(instance.isReady()).toBe(false);
      });

      it('should handle shutdown when not initialized', async () => {
        const instance = CodeIntelligenceService.getInstance();

        await expect(instance.shutdown()).resolves.not.toThrow();
      });

      it('should cleanup orchestrator on shutdown', async () => {
        jest.spyOn(CodeIntelligenceService, 'checkPrerequisites').mockResolvedValue({
          ollama: true,
          ollamaModel: true,
          postgres: true,
          allReady: true,
          messages: [],
        });

        const instance = CodeIntelligenceService.getInstance();
        await instance.initialize();

        await instance.shutdown();

        // After shutdown, should not be able to get components
        expect(() => instance.getComponents()).toThrow();
      });
    });

    describe('isReady()', () => {
      it('should return false before initialization', () => {
        const instance = CodeIntelligenceService.getInstance();

        expect(instance.isReady()).toBe(false);
      });

      it('should return true after successful initialization', async () => {
        jest.spyOn(CodeIntelligenceService, 'checkPrerequisites').mockResolvedValue({
          ollama: true,
          ollamaModel: true,
          postgres: true,
          allReady: true,
          messages: [],
        });

        const instance = CodeIntelligenceService.getInstance();
        await instance.initialize();

        expect(instance.isReady()).toBe(true);
      });

      it('should return false after shutdown', async () => {
        jest.spyOn(CodeIntelligenceService, 'checkPrerequisites').mockResolvedValue({
          ollama: true,
          ollamaModel: true,
          postgres: true,
          allReady: true,
          messages: [],
        });

        const instance = CodeIntelligenceService.getInstance();
        await instance.initialize();
        await instance.shutdown();

        expect(instance.isReady()).toBe(false);
      });
    });
  });

  describe('Component Access', () => {
    describe('getComponents()', () => {
      it('should throw error when not initialized', () => {
        const instance = CodeIntelligenceService.getInstance();

        expect(() => instance.getComponents()).toThrow('not initialized');
      });

      it('should return components after initialization', async () => {
        jest.spyOn(CodeIntelligenceService, 'checkPrerequisites').mockResolvedValue({
          ollama: true,
          ollamaModel: true,
          postgres: true,
          allReady: true,
          messages: [],
        });

        const instance = CodeIntelligenceService.getInstance();
        await instance.initialize();

        const components = instance.getComponents();

        expect(components).toBeDefined();
        expect(components.searchEngine).toBeDefined();
        expect(components.graphBuilder).toBeDefined();
        expect(components.orchestrator).toBeDefined();
      });

      it('should return same component instances on multiple calls', async () => {
        jest.spyOn(CodeIntelligenceService, 'checkPrerequisites').mockResolvedValue({
          ollama: true,
          ollamaModel: true,
          postgres: true,
          allReady: true,
          messages: [],
        });

        const instance = CodeIntelligenceService.getInstance();
        await instance.initialize();

        const components1 = instance.getComponents();
        const components2 = instance.getComponents();

        expect(components1.searchEngine).toBe(components2.searchEngine);
        expect(components1.graphBuilder).toBe(components2.graphBuilder);
        expect(components1.orchestrator).toBe(components2.orchestrator);
      });
    });

    describe('getAgentConfig()', () => {
      it('should return disabled config when not initialized', () => {
        const instance = CodeIntelligenceService.getInstance();

        const config = instance.getAgentConfig();

        expect(config).toBeDefined();
        expect(config.enabled).toBe(false);
        expect(config.searchEngine).toBeUndefined();
        expect(config.graphBuilder).toBeUndefined();
      });

      it('should return enabled config after initialization', async () => {
        jest.spyOn(CodeIntelligenceService, 'checkPrerequisites').mockResolvedValue({
          ollama: true,
          ollamaModel: true,
          postgres: true,
          allReady: true,
          messages: [],
        });

        const instance = CodeIntelligenceService.getInstance();
        await instance.initialize();

        const config = instance.getAgentConfig();

        expect(config).toBeDefined();
        expect(config.enabled).toBe(true);
        expect(config.searchEngine).toBeDefined();
        expect(config.graphBuilder).toBeDefined();
      });

      it('should return config suitable for BaseAgent injection', async () => {
        jest.spyOn(CodeIntelligenceService, 'checkPrerequisites').mockResolvedValue({
          ollama: true,
          ollamaModel: true,
          postgres: true,
          allReady: true,
          messages: [],
        });

        const instance = CodeIntelligenceService.getInstance();
        await instance.initialize();

        const config = instance.getAgentConfig();

        // Verify config matches BaseAgentConfig.codeIntelligence interface
        expect(config).toMatchObject({
          enabled: expect.any(Boolean),
          searchEngine: expect.any(Object),
          graphBuilder: expect.any(Object),
        });
      });
    });
  });

  describe('Indexing Operations', () => {
    describe('indexDirectory()', () => {
      it('should throw error when not initialized', async () => {
        const instance = CodeIntelligenceService.getInstance();

        await expect(
          instance.indexDirectory('/test/dir')
        ).rejects.toThrow('not initialized');
      });

      it('should index directory successfully', async () => {
        jest.spyOn(CodeIntelligenceService, 'checkPrerequisites').mockResolvedValue({
          ollama: true,
          ollamaModel: true,
          postgres: true,
          allReady: true,
          messages: [],
        });

        const instance = CodeIntelligenceService.getInstance();
        await instance.initialize();

        // Mock the orchestrator's indexProject method
        const mockResult = {
          stats: {
            filesIndexed: 5,
            chunksCreated: 25,
            embeddingsGenerated: 25,
            nodesCreated: 15,
            edgesCreated: 10,
            totalTimeMs: 1000,
          },
        };

        const components = instance.getComponents();
        jest.spyOn(components.orchestrator, 'indexProject').mockResolvedValue(mockResult as any);

        const result = await instance.indexDirectory('/test/dir');

        expect(result).toBeDefined();
        expect(result.filesIndexed).toBe(5);
        expect(result.chunksCreated).toBe(25);
        expect(result.embeddingsGenerated).toBe(25);
        expect(result.nodesCreated).toBe(15);
        expect(result.edgesCreated).toBe(10);
        expect(result.totalTimeMs).toBe(1000);
      });

      it('should handle relative paths', async () => {
        jest.spyOn(CodeIntelligenceService, 'checkPrerequisites').mockResolvedValue({
          ollama: true,
          ollamaModel: true,
          postgres: true,
          allReady: true,
          messages: [],
        });

        const instance = CodeIntelligenceService.getInstance({
          rootDir: '/project',
        });
        await instance.initialize();

        const components = instance.getComponents();
        const indexSpy = jest.spyOn(components.orchestrator, 'indexProject')
          .mockResolvedValue({
            stats: {
              filesIndexed: 1,
              chunksCreated: 5,
              embeddingsGenerated: 5,
              nodesCreated: 3,
              edgesCreated: 2,
              totalTimeMs: 100,
            },
          } as any);

        await instance.indexDirectory('src');

        // Should convert relative path to absolute
        expect(indexSpy).toHaveBeenCalledWith(
          expect.stringContaining('/project/src'),
          undefined
        );
      });

      it('should handle absolute paths', async () => {
        jest.spyOn(CodeIntelligenceService, 'checkPrerequisites').mockResolvedValue({
          ollama: true,
          ollamaModel: true,
          postgres: true,
          allReady: true,
          messages: [],
        });

        const instance = CodeIntelligenceService.getInstance();
        await instance.initialize();

        const components = instance.getComponents();
        const indexSpy = jest.spyOn(components.orchestrator, 'indexProject')
          .mockResolvedValue({
            stats: {
              filesIndexed: 1,
              chunksCreated: 5,
              embeddingsGenerated: 5,
              nodesCreated: 3,
              edgesCreated: 2,
              totalTimeMs: 100,
            },
          } as any);

        await instance.indexDirectory('/absolute/path');

        expect(indexSpy).toHaveBeenCalledWith('/absolute/path', undefined);
      });

      it('should support progress callbacks', async () => {
        jest.spyOn(CodeIntelligenceService, 'checkPrerequisites').mockResolvedValue({
          ollama: true,
          ollamaModel: true,
          postgres: true,
          allReady: true,
          messages: [],
        });

        const instance = CodeIntelligenceService.getInstance();
        await instance.initialize();

        const progressCallback = jest.fn();

        const components = instance.getComponents();
        jest.spyOn(components.orchestrator, 'indexProject')
          .mockImplementation(async (dir, callback) => {
            // Simulate progress updates
            if (callback) {
              callback({ processedFiles: 1, totalFiles: 5, chunksCreated: 3 });
              callback({ processedFiles: 5, totalFiles: 5, chunksCreated: 25 });
            }
            return {
              stats: {
                filesIndexed: 5,
                chunksCreated: 25,
                embeddingsGenerated: 25,
                nodesCreated: 15,
                edgesCreated: 10,
                totalTimeMs: 1000,
              },
            } as any;
          });

        await instance.indexDirectory('/test/dir', progressCallback);

        expect(progressCallback).toHaveBeenCalled();
        expect(progressCallback).toHaveBeenCalledWith(
          expect.objectContaining({
            processedFiles: expect.any(Number),
            totalFiles: expect.any(Number),
            chunksCreated: expect.any(Number),
          })
        );
      });

      it('should update lastIndexTime after indexing', async () => {
        jest.spyOn(CodeIntelligenceService, 'checkPrerequisites').mockResolvedValue({
          ollama: true,
          ollamaModel: true,
          postgres: true,
          allReady: true,
          messages: [],
        });

        const instance = CodeIntelligenceService.getInstance();
        await instance.initialize();

        const components = instance.getComponents();
        jest.spyOn(components.orchestrator, 'indexProject').mockResolvedValue({
          stats: {
            filesIndexed: 1,
            chunksCreated: 5,
            embeddingsGenerated: 5,
            nodesCreated: 3,
            edgesCreated: 2,
            totalTimeMs: 100,
          },
        } as any);

        const statusBefore = await instance.getStatus();
        expect(statusBefore.lastIndexTime).toBeUndefined();

        await instance.indexDirectory('/test/dir');

        const statusAfter = await instance.getStatus();
        expect(statusAfter.lastIndexTime).toBeInstanceOf(Date);
      });
    });

    describe('search()', () => {
      it('should throw error when not initialized', async () => {
        const instance = CodeIntelligenceService.getInstance();

        await expect(
          instance.search('test query')
        ).rejects.toThrow('not initialized');
      });

      it('should search successfully with default options', async () => {
        jest.spyOn(CodeIntelligenceService, 'checkPrerequisites').mockResolvedValue({
          ollama: true,
          ollamaModel: true,
          postgres: true,
          allReady: true,
          messages: [],
        });

        const instance = CodeIntelligenceService.getInstance();
        await instance.initialize();

        const mockResults = {
          results: [
            {
              filePath: '/test/file.ts',
              content: 'test content',
              score: 0.95,
              startLine: 1,
              endLine: 10,
              entityName: 'TestClass',
              entityType: 'class',
            },
          ],
          metadata: {
            searchTimeMs: 50,
            totalResults: 1,
          },
        };

        const components = instance.getComponents();
        jest.spyOn(components.orchestrator, 'query').mockResolvedValue(mockResults as any);

        const results = await instance.search('test query');

        expect(results).toBeDefined();
        expect(results.results.length).toBe(1);
        expect(results.results[0].filePath).toBe('/test/file.ts');
      });

      it('should respect topK option', async () => {
        jest.spyOn(CodeIntelligenceService, 'checkPrerequisites').mockResolvedValue({
          ollama: true,
          ollamaModel: true,
          postgres: true,
          allReady: true,
          messages: [],
        });

        const instance = CodeIntelligenceService.getInstance();
        await instance.initialize();

        const components = instance.getComponents();
        const querySpy = jest.spyOn(components.orchestrator, 'query')
          .mockResolvedValue({
            results: [],
            metadata: { searchTimeMs: 10, totalResults: 0 },
          } as any);

        await instance.search('test', { topK: 20 });

        expect(querySpy).toHaveBeenCalledWith(
          expect.objectContaining({ topK: 20 })
        );
      });

      it('should respect includeGraphContext option', async () => {
        jest.spyOn(CodeIntelligenceService, 'checkPrerequisites').mockResolvedValue({
          ollama: true,
          ollamaModel: true,
          postgres: true,
          allReady: true,
          messages: [],
        });

        const instance = CodeIntelligenceService.getInstance();
        await instance.initialize();

        const components = instance.getComponents();
        const querySpy = jest.spyOn(components.orchestrator, 'query')
          .mockResolvedValue({
            results: [],
            metadata: { searchTimeMs: 10, totalResults: 0 },
          } as any);

        await instance.search('test', { includeGraphContext: false });

        expect(querySpy).toHaveBeenCalledWith(
          expect.objectContaining({ includeGraphContext: false })
        );
      });

      it('should respect graphDepth option', async () => {
        jest.spyOn(CodeIntelligenceService, 'checkPrerequisites').mockResolvedValue({
          ollama: true,
          ollamaModel: true,
          postgres: true,
          allReady: true,
          messages: [],
        });

        const instance = CodeIntelligenceService.getInstance();
        await instance.initialize();

        const components = instance.getComponents();
        const querySpy = jest.spyOn(components.orchestrator, 'query')
          .mockResolvedValue({
            results: [],
            metadata: { searchTimeMs: 10, totalResults: 0 },
          } as any);

        await instance.search('test', { graphDepth: 3 });

        expect(querySpy).toHaveBeenCalledWith(
          expect.objectContaining({ graphDepth: 3 })
        );
      });

      it('should use defaults when options not provided', async () => {
        jest.spyOn(CodeIntelligenceService, 'checkPrerequisites').mockResolvedValue({
          ollama: true,
          ollamaModel: true,
          postgres: true,
          allReady: true,
          messages: [],
        });

        const instance = CodeIntelligenceService.getInstance();
        await instance.initialize();

        const components = instance.getComponents();
        const querySpy = jest.spyOn(components.orchestrator, 'query')
          .mockResolvedValue({
            results: [],
            metadata: { searchTimeMs: 10, totalResults: 0 },
          } as any);

        await instance.search('test');

        expect(querySpy).toHaveBeenCalledWith(
          expect.objectContaining({
            topK: 10,
            includeGraphContext: true,
            graphDepth: 2,
          })
        );
      });
    });
  });

  describe('Status and Health', () => {
    describe('getStatus()', () => {
      it('should return not initialized status when not initialized', async () => {
        const instance = CodeIntelligenceService.getInstance();

        const status = await instance.getStatus();

        expect(status.initialized).toBe(false);
        expect(status.healthy).toBe(false);
        expect(status.indexedChunks).toBe(0);
        expect(status.graphNodes).toBe(0);
        expect(status.graphEdges).toBe(0);
        expect(status.error).toBe('Service not initialized');
      });

      it('should return healthy status when initialized', async () => {
        jest.spyOn(CodeIntelligenceService, 'checkPrerequisites').mockResolvedValue({
          ollama: true,
          ollamaModel: true,
          postgres: true,
          allReady: true,
          messages: [],
        });

        const instance = CodeIntelligenceService.getInstance();
        await instance.initialize();

        const components = instance.getComponents();
        jest.spyOn(components.orchestrator, 'getStats').mockReturnValue({
          indexer: { totalChunks: 100, totalFiles: 10, lastIndexTime: new Date() },
          graph: { nodeCount: 50, edgeCount: 75 },
          search: { docCount: 100, avgDocLength: 200, uniqueTerms: 500 },
        } as any);

        const status = await instance.getStatus();

        expect(status.initialized).toBe(true);
        expect(status.healthy).toBe(true);
        expect(status.indexedChunks).toBe(100);
        expect(status.graphNodes).toBe(50);
        expect(status.graphEdges).toBe(75);
        expect(status.error).toBeUndefined();
      });

      it('should include lastIndexTime after indexing', async () => {
        jest.spyOn(CodeIntelligenceService, 'checkPrerequisites').mockResolvedValue({
          ollama: true,
          ollamaModel: true,
          postgres: true,
          allReady: true,
          messages: [],
        });

        const instance = CodeIntelligenceService.getInstance();
        await instance.initialize();

        const components = instance.getComponents();
        jest.spyOn(components.orchestrator, 'indexProject').mockResolvedValue({
          stats: {
            filesIndexed: 1,
            chunksCreated: 5,
            embeddingsGenerated: 5,
            nodesCreated: 3,
            edgesCreated: 2,
            totalTimeMs: 100,
          },
        } as any);

        jest.spyOn(components.orchestrator, 'getStats').mockReturnValue({
          indexer: { totalChunks: 5, totalFiles: 1, lastIndexTime: new Date() },
          graph: { nodeCount: 3, edgeCount: 2 },
          search: { docCount: 5, avgDocLength: 100, uniqueTerms: 50 },
        } as any);

        await instance.indexDirectory('/test/dir');

        const status = await instance.getStatus();

        expect(status.lastIndexTime).toBeInstanceOf(Date);
      });

      it('should handle errors when getting stats', async () => {
        jest.spyOn(CodeIntelligenceService, 'checkPrerequisites').mockResolvedValue({
          ollama: true,
          ollamaModel: true,
          postgres: true,
          allReady: true,
          messages: [],
        });

        const instance = CodeIntelligenceService.getInstance();
        await instance.initialize();

        const components = instance.getComponents();
        jest.spyOn(components.orchestrator, 'getStats')
          .mockImplementation(() => {
            throw new Error('Stats error');
          });

        const status = await instance.getStatus();

        expect(status.initialized).toBe(true);
        expect(status.healthy).toBe(false);
        expect(status.error).toBe('Stats error');
      });
    });
  });

  describe('Convenience Functions', () => {
    it('getCodeIntelligenceService should return singleton instance', () => {
      const { getCodeIntelligenceService } = require('../../../src/code-intelligence/service/CodeIntelligenceService.js');

      const instance1 = getCodeIntelligenceService();
      const instance2 = getCodeIntelligenceService();

      expect(instance1).toBe(instance2);
    });

    it('initializeCodeIntelligence should initialize and return service', async () => {
      const { initializeCodeIntelligence } = require('../../../src/code-intelligence/service/CodeIntelligenceService.js');

      jest.spyOn(CodeIntelligenceService, 'checkPrerequisites').mockResolvedValue({
        ollama: true,
        ollamaModel: true,
        postgres: true,
        allReady: true,
        messages: [],
      });

      const service = await initializeCodeIntelligence();

      expect(service).toBeDefined();
      expect(service.isReady()).toBe(true);
    });

    it('checkCodeIntelligencePrerequisites should call static method', async () => {
      const { checkCodeIntelligencePrerequisites } = require('../../../src/code-intelligence/service/CodeIntelligenceService.js');

      const checkSpy = jest.spyOn(CodeIntelligenceService, 'checkPrerequisites')
        .mockResolvedValue({
          ollama: true,
          ollamaModel: true,
          postgres: true,
          allReady: true,
          messages: [],
        });

      const result = await checkCodeIntelligencePrerequisites();

      expect(checkSpy).toHaveBeenCalled();
      expect(result.allReady).toBe(true);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle orchestrator initialization failures', async () => {
      jest.spyOn(CodeIntelligenceService, 'checkPrerequisites').mockResolvedValue({
        ollama: true,
        ollamaModel: true,
        postgres: true,
        allReady: true,
        messages: [],
      });

      // Mock orchestrator constructor to throw
      const { CodeIntelligenceOrchestrator } = await import(
        '../../../src/code-intelligence/orchestrator/CodeIntelligenceOrchestrator.js'
      );
      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'initialize')
        .mockRejectedValue(new Error('Orchestrator init failed'));

      const instance = CodeIntelligenceService.getInstance();

      await expect(instance.initialize()).rejects.toThrow();
    });

    it('should handle missing environment variables gracefully', () => {
      const originalEnv = { ...process.env };

      // Clear all RuVector env vars
      delete process.env.RUVECTOR_HOST;
      delete process.env.RUVECTOR_PORT;
      delete process.env.RUVECTOR_DATABASE;
      delete process.env.RUVECTOR_USER;
      delete process.env.RUVECTOR_PASSWORD;
      delete process.env.OLLAMA_URL;

      CodeIntelligenceService.resetInstance();

      // Should use defaults without throwing
      expect(() => {
        CodeIntelligenceService.getInstance();
      }).not.toThrow();

      process.env = originalEnv;
    });

    it('should handle null/undefined in configuration gracefully', () => {
      expect(() => {
        CodeIntelligenceService.getInstance(undefined as any);
      }).not.toThrow();

      CodeIntelligenceService.resetInstance();

      expect(() => {
        CodeIntelligenceService.getInstance(null as any);
      }).not.toThrow();
    });
  });
});
