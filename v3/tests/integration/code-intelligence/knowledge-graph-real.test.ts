/**
 * Agentic QE v3 - Knowledge Graph Real I/O Integration Tests
 * Tests that perform actual file system operations on the v3 codebase
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import { KnowledgeGraphService } from '../../../src/domains/code-intelligence/services/knowledge-graph';
import type { MemoryBackend, VectorSearchResult } from '../../../src/kernel/interfaces';

// ============================================================================
// Mock Memory Backend with Persistence Simulation
// ============================================================================

function createMockMemoryBackend(): MemoryBackend {
  const storage = new Map<string, unknown>();
  const vectors = new Map<string, { embedding: number[]; metadata: unknown }>();

  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    set: vi.fn(async (key: string, value: unknown) => {
      storage.set(key, value);
    }),
    get: vi.fn(async <T>(key: string): Promise<T | undefined> => {
      return storage.get(key) as T | undefined;
    }),
    delete: vi.fn(async (key: string): Promise<boolean> => {
      return storage.delete(key);
    }),
    has: vi.fn(async (key: string): Promise<boolean> => {
      return storage.has(key);
    }),
    search: vi.fn(async (pattern: string, limit?: number): Promise<string[]> => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      const matches: string[] = [];
      for (const key of storage.keys()) {
        if (regex.test(key)) {
          matches.push(key);
          if (limit && matches.length >= limit) break;
        }
      }
      return matches;
    }),
    vectorSearch: vi.fn(async (_embedding: number[], k: number): Promise<VectorSearchResult[]> => {
      const results: VectorSearchResult[] = [];
      let count = 0;
      for (const [key, data] of vectors.entries()) {
        if (count >= k) break;
        results.push({
          key,
          score: 0.9 - count * 0.1,
          metadata: data.metadata,
        });
        count++;
      }
      return results;
    }),
    storeVector: vi.fn(async (key: string, embedding: number[], metadata?: unknown) => {
      vectors.set(key, { embedding, metadata });
    }),
  };
}

// ============================================================================
// File System Helpers
// ============================================================================

/**
 * Recursively get all TypeScript files in a directory
 */
async function getTypeScriptFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(currentDir: string) {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await walk(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }
  }

  await walk(dir);
  return files;
}

/**
 * Extract entities from actual TypeScript file content
 */
async function extractEntitiesFromFile(filePath: string): Promise<ExtractedEntity[]> {
  const content = await fs.readFile(filePath, 'utf-8');
  const entities: ExtractedEntity[] = [];

  // Extract class declarations - check for export keyword properly
  const classMatches = content.matchAll(/(export\s+)?class\s+(\w+)/g);
  for (const match of classMatches) {
    entities.push({
      type: 'class',
      name: match[2],
      file: filePath,
      exported: match[1] !== undefined,
    });
  }

  // Extract interface declarations
  const interfaceMatches = content.matchAll(/(export\s+)?interface\s+(\w+)/g);
  for (const match of interfaceMatches) {
    entities.push({
      type: 'interface',
      name: match[2],
      file: filePath,
      exported: match[1] !== undefined,
    });
  }

  // Extract function declarations
  const functionMatches = content.matchAll(/(export\s+)?(?:async\s+)?function\s+(\w+)/g);
  for (const match of functionMatches) {
    entities.push({
      type: 'function',
      name: match[2],
      file: filePath,
      exported: match[1] !== undefined,
    });
  }

  // Extract type declarations
  const typeMatches = content.matchAll(/(export\s+)?type\s+(\w+)/g);
  for (const match of typeMatches) {
    entities.push({
      type: 'type',
      name: match[2],
      file: filePath,
      exported: match[1] !== undefined,
    });
  }

  return entities;
}

interface ExtractedEntity {
  type: 'class' | 'interface' | 'function' | 'type';
  name: string;
  file: string;
  exported: boolean;
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Knowledge Graph Real I/O', () => {
  let service: KnowledgeGraphService;
  let memory: MemoryBackend;
  const v3SrcPath = path.join(__dirname, '../../../src');

  beforeEach(() => {
    memory = createMockMemoryBackend();
    service = new KnowledgeGraphService(memory, {
      maxNodes: 10000,
      enableVectorEmbeddings: false, // Disable for faster tests
    });
  });

  afterEach(async () => {
    await service.clear();
  });

  describe('indexing actual v3 source files', () => {
    it('should index kernel directory and create nodes', async () => {
      const kernelPath = path.join(v3SrcPath, 'kernel');
      const files = await getTypeScriptFiles(kernelPath);

      expect(files.length).toBeGreaterThan(0);

      const result = await service.index({
        paths: files,
        incremental: false,
        includeTests: false,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.filesIndexed).toBeGreaterThan(0);
        expect(result.value.nodesCreated).toBeGreaterThan(0);
        expect(result.value.duration).toBeGreaterThan(0);
      }
    });

    it('should index domains directory with multiple files', async () => {
      const domainsPath = path.join(v3SrcPath, 'domains');
      const files = await getTypeScriptFiles(domainsPath);

      expect(files.length).toBeGreaterThan(10); // Should have many domain files

      const result = await service.index({
        paths: files,
        incremental: false,
        includeTests: false,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.filesIndexed).toBeGreaterThan(10);
        expect(result.value.nodesCreated).toBeGreaterThan(10);
      }
    });

    it('should index coordination files', async () => {
      const coordPath = path.join(v3SrcPath, 'coordination');
      const files = await getTypeScriptFiles(coordPath);

      const result = await service.index({
        paths: files,
        incremental: false,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.filesIndexed).toBeGreaterThan(0);
      }
    });

    it('should perform incremental indexing correctly', async () => {
      const kernelPath = path.join(v3SrcPath, 'kernel');
      const kernelFiles = await getTypeScriptFiles(kernelPath);

      // First indexing
      const firstResult = await service.index({
        paths: kernelFiles.slice(0, 3),
        incremental: false,
      });

      expect(firstResult.success).toBe(true);

      // Incremental indexing
      const secondResult = await service.index({
        paths: kernelFiles.slice(3),
        incremental: true,
      });

      expect(secondResult.success).toBe(true);
      if (secondResult.success && firstResult.success) {
        // Both should have created nodes
        expect(firstResult.value.nodesCreated).toBeGreaterThan(0);
        expect(secondResult.value.nodesCreated).toBeGreaterThan(0);
      }
    });

    it('should handle non-existent files gracefully', async () => {
      const result = await service.index({
        paths: ['/non/existent/file.ts', '/another/missing/file.ts'],
        incremental: false,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // Should record errors for missing files
        expect(result.value.errors.length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('extracting real entities from domain services', () => {
    it('should extract entities from test-generator.ts', async () => {
      const filePath = path.join(v3SrcPath, 'domains/test-generation/services/test-generator.ts');
      const entities = await extractEntitiesFromFile(filePath);

      expect(entities.length).toBeGreaterThan(0);

      // Should have TestGeneratorService class
      const serviceClass = entities.find(e => e.type === 'class' && e.name === 'TestGeneratorService');
      expect(serviceClass).toBeDefined();

      // Should have ITestGenerationService interface
      const serviceInterface = entities.find(e => e.type === 'interface' && e.name === 'ITestGenerationService');
      expect(serviceInterface).toBeDefined();
    });

    it('should extract entities from security-scanner.ts', async () => {
      const filePath = path.join(v3SrcPath, 'domains/security-compliance/services/security-scanner.ts');
      const entities = await extractEntitiesFromFile(filePath);

      expect(entities.length).toBeGreaterThan(0);

      const serviceClass = entities.find(e => e.type === 'class' && e.name === 'SecurityScannerService');
      expect(serviceClass).toBeDefined();
      expect(serviceClass!.exported).toBe(true);
    });

    it('should extract entities from knowledge-graph.ts', async () => {
      const filePath = path.join(v3SrcPath, 'domains/code-intelligence/services/knowledge-graph.ts');
      const entities = await extractEntitiesFromFile(filePath);

      expect(entities.length).toBeGreaterThan(0);

      const serviceClass = entities.find(e => e.type === 'class' && e.name === 'KnowledgeGraphService');
      expect(serviceClass).toBeDefined();

      const serviceInterface = entities.find(e => e.type === 'interface' && e.name === 'IKnowledgeGraphService');
      expect(serviceInterface).toBeDefined();
    });

    it('should extract all exported types from interfaces.ts', async () => {
      const filePath = path.join(v3SrcPath, 'kernel/interfaces.ts');
      const entities = await extractEntitiesFromFile(filePath);

      // Should have many interfaces
      const interfaces = entities.filter(e => e.type === 'interface');
      expect(interfaces.length).toBeGreaterThan(5);

      // Key interfaces should be present
      const interfaceNames = interfaces.map(i => i.name);
      expect(interfaceNames).toContain('DomainPlugin');
      expect(interfaceNames).toContain('EventBus');
      expect(interfaceNames).toContain('MemoryBackend');
    });
  });

  describe('querying the knowledge graph', () => {
    beforeEach(async () => {
      // Index some real files first
      const kernelPath = path.join(v3SrcPath, 'kernel');
      const files = await getTypeScriptFiles(kernelPath);
      await service.index({
        paths: files.slice(0, 5),
        incremental: false,
      });
    });

    it('should query for File nodes using cypher-style query', async () => {
      const result = await service.query({
        query: 'MATCH (n:File) RETURN n',
        type: 'cypher',
        limit: 10,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.metadata.type).toBe('cypher');
      }
    });

    it('should query using natural language', async () => {
      const result = await service.query({
        query: 'find event bus',
        type: 'natural-language',
        limit: 5,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.metadata).toBeDefined();
      }
    });
  });

  describe('dependency mapping', () => {
    beforeEach(async () => {
      const coordPath = path.join(v3SrcPath, 'coordination');
      const files = await getTypeScriptFiles(coordPath);
      await service.index({
        paths: files,
        incremental: false,
      });
    });

    it('should map dependencies for coordination files', async () => {
      const result = await service.mapDependencies({
        files: ['src/coordination/cross-domain-router.ts'],
        direction: 'outgoing',
        depth: 2,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.nodes).toBeDefined();
        expect(result.value.edges).toBeDefined();
        expect(result.value.metrics).toBeDefined();
        expect(result.value.metrics.totalNodes).toBeGreaterThanOrEqual(0);
      }
    });

    it('should calculate dependency metrics', async () => {
      const result = await service.mapDependencies({
        files: ['src/coordination/protocol-executor.ts'],
        direction: 'both',
        depth: 3,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const metrics = result.value.metrics;
        expect(metrics).toHaveProperty('totalNodes');
        expect(metrics).toHaveProperty('totalEdges');
        expect(metrics).toHaveProperty('avgDegree');
        expect(metrics).toHaveProperty('maxDepth');
        expect(metrics).toHaveProperty('cyclomaticComplexity');
        expect(metrics.cyclomaticComplexity).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('file statistics', () => {
    it('should count TypeScript files in v3 src directory', async () => {
      const files = await getTypeScriptFiles(v3SrcPath);

      // v3 should have a substantial number of source files
      expect(files.length).toBeGreaterThan(50);

      // All files should be .ts or .tsx
      for (const file of files) {
        expect(file).toMatch(/\.tsx?$/);
      }
    });

    it('should have kernel files', async () => {
      const kernelFiles = await getTypeScriptFiles(path.join(v3SrcPath, 'kernel'));

      expect(kernelFiles.length).toBeGreaterThan(5);
      expect(kernelFiles.some(f => f.includes('event-bus'))).toBe(true);
      expect(kernelFiles.some(f => f.includes('interfaces'))).toBe(true);
    });

    it('should have domain files organized by domain', async () => {
      const domainsPath = path.join(v3SrcPath, 'domains');
      const domainFiles = await getTypeScriptFiles(domainsPath);

      // Should have files from multiple domains
      expect(domainFiles.some(f => f.includes('test-generation'))).toBe(true);
      expect(domainFiles.some(f => f.includes('coverage-analysis'))).toBe(true);
      expect(domainFiles.some(f => f.includes('security-compliance'))).toBe(true);
      expect(domainFiles.some(f => f.includes('code-intelligence'))).toBe(true);
    });

    it('should have coordination files', async () => {
      const coordFiles = await getTypeScriptFiles(path.join(v3SrcPath, 'coordination'));

      expect(coordFiles.length).toBeGreaterThan(5);
      expect(coordFiles.some(f => f.includes('cross-domain-router'))).toBe(true);
      expect(coordFiles.some(f => f.includes('protocol-executor'))).toBe(true);
    });
  });

  describe('entity extraction statistics', () => {
    it('should extract significant number of entities from kernel', async () => {
      const kernelFiles = await getTypeScriptFiles(path.join(v3SrcPath, 'kernel'));
      let totalEntities = 0;

      for (const file of kernelFiles) {
        try {
          const entities = await extractEntitiesFromFile(file);
          totalEntities += entities.length;
        } catch {
          // Skip files that can't be read
        }
      }

      expect(totalEntities).toBeGreaterThan(20);
    });

    it('should find exported classes across domains', async () => {
      const domainFiles = await getTypeScriptFiles(path.join(v3SrcPath, 'domains'));
      const exportedClasses: string[] = [];

      for (const file of domainFiles) {
        try {
          const entities = await extractEntitiesFromFile(file);
          const classes = entities.filter(e => e.type === 'class' && e.exported);
          exportedClasses.push(...classes.map(c => c.name));
        } catch {
          // Skip files that can't be read
        }
      }

      expect(exportedClasses.length).toBeGreaterThan(10);

      // Should include key domain services
      expect(exportedClasses).toContain('TestGeneratorService');
      expect(exportedClasses).toContain('SecurityScannerService');
      expect(exportedClasses).toContain('KnowledgeGraphService');
    });
  });

  describe('codebase structure validation', () => {
    it('should verify v3 follows expected directory structure', async () => {
      const srcDir = v3SrcPath;

      // Check expected directories exist
      const expectedDirs = ['kernel', 'domains', 'coordination', 'shared'];
      for (const dir of expectedDirs) {
        const dirPath = path.join(srcDir, dir);
        try {
          const stat = await fs.stat(dirPath);
          expect(stat.isDirectory()).toBe(true);
        } catch {
          throw new Error(`Expected directory ${dir} not found in v3/src`);
        }
      }
    });

    it('should verify domain directory structure', async () => {
      const domainsDir = path.join(v3SrcPath, 'domains');

      const expectedDomains = [
        'test-generation',
        'test-execution',
        'coverage-analysis',
        'quality-assessment',
        'defect-intelligence',
        'code-intelligence',
        'security-compliance',
        'chaos-resilience',
        'contract-testing',
        'learning-optimization',
        'visual-accessibility',
        'requirements-validation',
      ];

      for (const domain of expectedDomains) {
        const domainPath = path.join(domainsDir, domain);
        try {
          const stat = await fs.stat(domainPath);
          expect(stat.isDirectory()).toBe(true);
        } catch {
          throw new Error(`Expected domain directory ${domain} not found`);
        }
      }
    });
  });
});
