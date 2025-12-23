/**
 * Tests for Knowledge Graph CLI Commands
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { KnowledgeGraphCommand } from '../../../src/cli/commands/knowledge-graph.js';
import { CodeIntelligenceOrchestrator } from '../../../src/code-intelligence/orchestrator/CodeIntelligenceOrchestrator.js';
import type { KGIndexOptions, KGQueryOptions, KGGraphOptions, KGStatsOptions } from '../../../src/cli/commands/knowledge-graph.js';
import * as fs from 'fs-extra';

// Mock fs-extra at module level
jest.mock('fs-extra');

// Mock console methods
const originalLog = console.log;
const originalError = console.error;
let logOutput: string[] = [];
let errorOutput: string[] = [];

beforeEach(() => {
  logOutput = [];
  errorOutput = [];
  console.log = jest.fn((...args: any[]) => {
    logOutput.push(args.join(' '));
  }) as any;
  console.error = jest.fn((...args: any[]) => {
    errorOutput.push(args.join(' '));
  }) as any;
});

afterEach(() => {
  console.log = originalLog;
  console.error = originalError;
  jest.clearAllMocks();
});

describe('KnowledgeGraphCommand', () => {
  describe('index command', () => {
    it('should execute full index successfully', async () => {
      const options: KGIndexOptions = {
        watch: false,
        incremental: false,
        verbose: false,
        json: false,
      };

      // Mock orchestrator initialization
      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'initialize').mockResolvedValue(undefined);
      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'indexProject').mockResolvedValue({
        success: true,
        stats: {
          filesIndexed: 10,
          chunksCreated: 50,
          embeddingsGenerated: 50,
          nodesCreated: 30,
          edgesCreated: 20,
          totalTimeMs: 5000,
          averageTimePerFileMs: 500,
        },
        failures: [],
      });
      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'shutdown').mockResolvedValue(undefined);

      await KnowledgeGraphCommand.index(options);

      expect(logOutput.some(line => line.includes('Knowledge Graph Indexing'))).toBe(true);
    });

    it('should handle incremental indexing with git changes', async () => {
      const options: KGIndexOptions = {
        watch: false,
        incremental: true,
        gitSince: 'HEAD~1',
        verbose: false,
        json: false,
      };

      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'initialize').mockResolvedValue(undefined);
      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'getGitChanges').mockResolvedValue([
        { type: 'modify', filePath: '/test/file.ts', timestamp: Date.now() },
      ]);
      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'processChanges').mockResolvedValue({
        success: true,
        stats: {
          filesIndexed: 1,
          chunksCreated: 5,
          embeddingsGenerated: 5,
          nodesCreated: 3,
          edgesCreated: 2,
          totalTimeMs: 500,
          averageTimePerFileMs: 500,
        },
        failures: [],
      });
      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'shutdown').mockResolvedValue(undefined);

      await KnowledgeGraphCommand.index(options);

      expect(logOutput.some(line => line.includes('Indexing changes'))).toBe(true);
    });

    it('should output JSON format when requested', async () => {
      const options: KGIndexOptions = {
        watch: false,
        incremental: false,
        verbose: false,
        json: true,
      };

      const mockResult = {
        success: true,
        stats: {
          filesIndexed: 10,
          chunksCreated: 50,
          embeddingsGenerated: 50,
          nodesCreated: 30,
          edgesCreated: 20,
          totalTimeMs: 5000,
          averageTimePerFileMs: 500,
        },
        failures: [],
      };

      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'initialize').mockResolvedValue(undefined);
      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'indexProject').mockResolvedValue(mockResult);
      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'shutdown').mockResolvedValue(undefined);

      await KnowledgeGraphCommand.index(options);

      expect(logOutput.some(line => line.includes(JSON.stringify(mockResult, null, 2)))).toBe(true);
    });
  });

  describe('query command', () => {
    it('should execute query and display results', async () => {
      const query = 'find authentication functions';
      const options: KGQueryOptions = {
        hybrid: true,
        k: 10,
        graphDepth: 2,
        json: false,
        verbose: false,
      };

      const mockResult = {
        results: [
          {
            id: 'chunk-1',
            filePath: '/src/auth/login.ts',
            content: 'function login(username: string, password: string)',
            startLine: 45,
            endLine: 67,
            score: 0.92,
            entityType: 'function',
            entityName: 'login',
          },
        ],
        metadata: {
          query,
          totalMatches: 1,
          searchTimeMs: 150,
        },
      };

      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'initialize').mockResolvedValue(undefined);
      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'query').mockResolvedValue(mockResult);
      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'shutdown').mockResolvedValue(undefined);

      await KnowledgeGraphCommand.query(query, options);

      expect(logOutput.some(line => line.includes('Knowledge Graph Query'))).toBe(true);
      expect(logOutput.some(line => line.includes('login'))).toBe(true);
    });

    it('should handle empty results', async () => {
      const query = 'nonexistent function';
      const options: KGQueryOptions = {
        hybrid: true,
        k: 10,
        graphDepth: 2,
        json: false,
        verbose: false,
      };

      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'initialize').mockResolvedValue(undefined);
      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'query').mockResolvedValue({
        results: [],
        metadata: {
          query,
          totalMatches: 0,
          searchTimeMs: 50,
        },
      });
      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'shutdown').mockResolvedValue(undefined);

      await KnowledgeGraphCommand.query(query, options);

      expect(logOutput.some(line => line.includes('No results found'))).toBe(true);
    });

    it('should output JSON format when requested', async () => {
      const query = 'test query';
      const options: KGQueryOptions = {
        hybrid: true,
        k: 10,
        graphDepth: 2,
        json: true,
        verbose: false,
      };

      const mockResult = {
        results: [],
        metadata: {
          query,
          totalMatches: 0,
          searchTimeMs: 50,
        },
      };

      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'initialize').mockResolvedValue(undefined);
      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'query').mockResolvedValue(mockResult);
      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'shutdown').mockResolvedValue(undefined);

      await KnowledgeGraphCommand.query(query, options);

      expect(logOutput.some(line => line.includes(JSON.stringify(mockResult, null, 2)))).toBe(true);
    });
  });

  describe('graph command', () => {
    it('should generate Mermaid class diagram', async () => {
      const filePath = '/src/test.ts';
      const options: KGGraphOptions = {
        type: 'class',
        format: 'mermaid',
        json: false,
      };

      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'initialize').mockResolvedValue(undefined);
      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'getStats').mockReturnValue({
        indexer: { totalFiles: 10, totalChunks: 50, cacheSize: 0 },
        graph: { nodeCount: 30, edgeCount: 20 },
        search: { documentCount: 50, totalQueries: 0, averageQueryTime: 0 },
      });
      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'shutdown').mockResolvedValue(undefined);

      // Mock fs.pathExists to return true
      (fs.pathExists as jest.MockedFunction<typeof fs.pathExists>).mockResolvedValue(true);

      await KnowledgeGraphCommand.graph(filePath, options);

      expect(logOutput.some(line => line.includes('Knowledge Graph Visualization'))).toBe(true);
      expect(logOutput.some(line => line.includes('classDiagram'))).toBe(true);
    });

    it('should generate DOT dependency diagram', async () => {
      const filePath = '/src/test.ts';
      const options: KGGraphOptions = {
        type: 'dependency',
        format: 'dot',
        json: false,
      };

      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'initialize').mockResolvedValue(undefined);
      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'getStats').mockReturnValue({
        indexer: { totalFiles: 10, totalChunks: 50, cacheSize: 0 },
        graph: { nodeCount: 30, edgeCount: 20 },
        search: { documentCount: 50, totalQueries: 0, averageQueryTime: 0 },
      });
      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'shutdown').mockResolvedValue(undefined);

      (fs.pathExists as jest.MockedFunction<typeof fs.pathExists>).mockResolvedValue(true);

      await KnowledgeGraphCommand.graph(filePath, options);

      expect(logOutput.some(line => line.includes('digraph G'))).toBe(true);
    });

    it('should handle non-existent file path', async () => {
      const filePath = '/nonexistent/file.ts';
      const options: KGGraphOptions = {
        type: 'class',
        format: 'mermaid',
        json: false,
      };

      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'initialize').mockResolvedValue(undefined);
      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'shutdown').mockResolvedValue(undefined);

      (fs.pathExists as jest.MockedFunction<typeof fs.pathExists>).mockResolvedValue(false);

      // Expect the command to throw because ProcessExit.exitIfNotTest() throws in test mode
      await expect(KnowledgeGraphCommand.graph(filePath, options)).rejects.toThrow('Process exit requested with code 1');

      expect(errorOutput.some(line => line.includes('File not found'))).toBe(true);
    });
  });

  describe('stats command', () => {
    it('should display statistics', async () => {
      const options: KGStatsOptions = {
        json: false,
        verbose: false,
      };

      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'initialize').mockResolvedValue(undefined);
      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'getStats').mockReturnValue({
        indexer: { totalFiles: 10, totalChunks: 50, cacheSize: 0 },
        graph: { nodeCount: 30, edgeCount: 20 },
        search: { documentCount: 50, totalQueries: 5, averageQueryTime: 100 },
      });
      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'isUsingDatabase').mockReturnValue(true);
      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'shutdown').mockResolvedValue(undefined);

      await KnowledgeGraphCommand.stats(options);

      expect(logOutput.some(line => line.includes('Knowledge Graph Statistics'))).toBe(true);
      expect(logOutput.some(line => line.includes('Database'))).toBe(true);
    });

    it('should output JSON format when requested', async () => {
      const options: KGStatsOptions = {
        json: true,
        verbose: false,
      };

      const mockStats = {
        indexer: { totalFiles: 10, totalChunks: 50, cacheSize: 0 },
        graph: { nodeCount: 30, edgeCount: 20 },
        search: { documentCount: 50, totalQueries: 5, averageQueryTime: 100 },
      };

      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'initialize').mockResolvedValue(undefined);
      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'getStats').mockReturnValue(mockStats);
      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'isUsingDatabase').mockReturnValue(true);
      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'shutdown').mockResolvedValue(undefined);

      await KnowledgeGraphCommand.stats(options);

      expect(logOutput.some(line => line.includes('"totalFiles": 10'))).toBe(true);
    });

    it('should show verbose statistics', async () => {
      const options: KGStatsOptions = {
        json: false,
        verbose: true,
      };

      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'initialize').mockResolvedValue(undefined);
      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'getStats').mockReturnValue({
        indexer: { totalFiles: 10, totalChunks: 50, cacheSize: 0 },
        graph: {
          nodeCount: 30,
          edgeCount: 20,
          nodesByType: { function: 15, class: 10, variable: 5 },
          edgesByType: { calls: 10, imports: 8, extends: 2 },
        },
        search: { documentCount: 50, totalQueries: 5, averageQueryTime: 100 },
      });
      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'isUsingDatabase').mockReturnValue(false);
      jest.spyOn(CodeIntelligenceOrchestrator.prototype, 'shutdown').mockResolvedValue(undefined);

      await KnowledgeGraphCommand.stats(options);

      expect(logOutput.some(line => line.includes('Nodes by type'))).toBe(true);
    });
  });
});
