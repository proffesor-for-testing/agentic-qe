/**
 * Integration Tests for Code Intelligence + RuVector
 *
 * Tests the complete integration of:
 * - CodeChunkStore with RuVector PostgreSQL
 * - CodeIntelligenceHybridRouter for embeddings
 * - CodeIntelligenceOrchestrator with database persistence
 *
 * Prerequisites:
 * - RuVector PostgreSQL container running
 * - Ollama with nomic-embed-text model
 *
 * Run with: npm run test:integration -- --grep "RuVector"
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { Pool } from 'pg';
import {
  CodeChunkStore,
  createDockerCodeChunkStore,
} from '../../../src/code-intelligence/storage/CodeChunkStore.js';
import {
  CodeIntelligenceHybridRouter,
  createDockerCodeIntelligenceRouter,
} from '../../../src/code-intelligence/router/CodeIntelligenceHybridRouter.js';
import { VectorSearch } from '../../../src/code-intelligence/search/VectorSearch.js';

// Skip integration tests only if explicitly requested
const SKIP_INTEGRATION = process.env.SKIP_INTEGRATION_TESTS === 'true';
const RUVECTOR_HOST = process.env.RUVECTOR_HOST ?? 'localhost';
const RUVECTOR_PORT = parseInt(process.env.RUVECTOR_PORT ?? '5432');

// Jest equivalent of describe.skipIf
const describeIntegration = SKIP_INTEGRATION ? describe.skip : describe;

describeIntegration('RuVector Integration', () => {
  let pool: Pool;
  let chunkStore: CodeChunkStore;

  beforeAll(async () => {
    // Connect to RuVector PostgreSQL
    pool = new Pool({
      host: RUVECTOR_HOST,
      port: RUVECTOR_PORT,
      database: process.env.RUVECTOR_DATABASE ?? 'ruvector',
      user: process.env.RUVECTOR_USER ?? 'ruvector',
      password: process.env.RUVECTOR_PASSWORD ?? 'ruvector',
    });

    // Verify connection
    try {
      await pool.query('SELECT 1');
    } catch (error) {
      console.warn('RuVector not available, skipping integration tests');
      throw error;
    }

    // Create CodeChunkStore
    chunkStore = new CodeChunkStore({
      host: RUVECTOR_HOST,
      port: RUVECTOR_PORT,
      database: process.env.RUVECTOR_DATABASE ?? 'ruvector',
      user: process.env.RUVECTOR_USER ?? 'ruvector',
      password: process.env.RUVECTOR_PASSWORD ?? 'ruvector',
      embeddingDimension: 768,
    });

    await chunkStore.initialize();
  });

  afterAll(async () => {
    if (chunkStore) {
      await chunkStore.close();
    }
    if (pool) {
      await pool.end();
    }
  });

  beforeEach(async () => {
    // Clear data between tests
    await chunkStore.clear();
  });

  describe('CodeChunkStore', () => {
    it('should store and retrieve a code chunk', async () => {
      // Generate a mock embedding (768 dimensions)
      const embedding = Array.from({ length: 768 }, () => Math.random() - 0.5);

      await chunkStore.storeChunk({
        id: 'test-chunk-1',
        filePath: '/src/test.ts',
        content: 'function hello() { return "world"; }',
        embedding,
        chunkType: 'function',
        name: 'hello',
        startLine: 1,
        endLine: 3,
      });

      // Verify it was stored
      const health = await chunkStore.healthCheck();
      expect(health.healthy).toBe(true);
      expect(health.chunkCount).toBeGreaterThanOrEqual(1);
    });

    it('should search for similar code chunks', async () => {
      // Store multiple chunks with different embeddings
      const chunks = [
        {
          id: 'auth-1',
          filePath: '/src/auth.ts',
          content: 'function authenticate(user: string, password: string) {}',
          chunkType: 'function',
          name: 'authenticate',
        },
        {
          id: 'utils-1',
          filePath: '/src/utils.ts',
          content: 'function formatDate(date: Date) { return date.toISOString(); }',
          chunkType: 'function',
          name: 'formatDate',
        },
        {
          id: 'db-1',
          filePath: '/src/db.ts',
          content: 'async function queryDatabase(sql: string) { return []; }',
          chunkType: 'function',
          name: 'queryDatabase',
        },
      ];

      // Store with mock embeddings (in real scenario, these would be from Ollama)
      for (let i = 0; i < chunks.length; i++) {
        const embedding = Array.from({ length: 768 }, (_, j) =>
          // Create somewhat different embeddings for each chunk
          Math.sin(i * 0.1 + j * 0.01)
        );

        await chunkStore.storeChunk({
          ...chunks[i],
          embedding,
          startLine: 1,
          endLine: 5,
        });
      }

      // Search with query embedding similar to first chunk (auth.ts at i=0)
      // auth.ts uses Math.sin(0 * 0.1 + j * 0.01) = Math.sin(j * 0.01)
      const queryEmbedding = Array.from({ length: 768 }, (_, j) =>
        Math.sin(0 * 0.1 + j * 0.01)
      );

      const results = await chunkStore.search(queryEmbedding, { topK: 3 });

      expect(results.length).toBeGreaterThan(0);
      // First result should be most similar to auth chunk
      expect(results[0].filePath).toBe('/src/auth.ts');
    });

    it('should filter by entity type', async () => {
      // Store a function and a class
      const functionEmbedding = Array.from({ length: 768 }, () => Math.random());
      const classEmbedding = Array.from({ length: 768 }, () => Math.random());

      await chunkStore.storeChunk({
        id: 'func-1',
        filePath: '/src/service.ts',
        content: 'function process() {}',
        embedding: functionEmbedding,
        chunkType: 'function',
        name: 'process',
        startLine: 1,
        endLine: 1,
      });

      await chunkStore.storeChunk({
        id: 'class-1',
        filePath: '/src/service.ts',
        content: 'class Service {}',
        embedding: classEmbedding,
        chunkType: 'class',
        name: 'Service',
        startLine: 5,
        endLine: 10,
      });

      // Search for only classes
      const results = await chunkStore.search(classEmbedding, {
        topK: 10,
        entityType: 'class',
      });

      expect(results.every((r) => r.chunkType === 'class')).toBe(true);
    });

    it('should perform hybrid search (vector + keyword)', async () => {
      const embedding = Array.from({ length: 768 }, () => Math.random() - 0.5);

      await chunkStore.storeChunk({
        id: 'test-1',
        filePath: '/src/auth.ts',
        content: 'function validateUser(username: string) { return true; }',
        embedding,
        chunkType: 'function',
        name: 'validateUser',
        startLine: 1,
        endLine: 3,
      });

      // Hybrid search with keyword "validateUser"
      const results = await chunkStore.hybridSearch(
        embedding,
        'validateUser',
        { topK: 10, semanticWeight: 0.5 }
      );

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain('validateUser');
    });

    it('should store and query entities', async () => {
      await chunkStore.storeEntity({
        id: 'entity-1',
        name: 'UserService',
        entityType: 'class',
        filePath: '/src/services/UserService.ts',
        startLine: 1,
        endLine: 100,
        signature: 'class UserService',
      });

      // Verify entity exists
      const stats = await chunkStore.getStats();
      expect(stats.entityCount).toBeGreaterThanOrEqual(1);
    });

    it('should store relationships', async () => {
      // Store two entities first
      await chunkStore.storeEntity({
        id: 'class-user',
        name: 'User',
        entityType: 'class',
        filePath: '/src/models/User.ts',
        startLine: 1,
        endLine: 50,
      });

      await chunkStore.storeEntity({
        id: 'class-admin',
        name: 'Admin',
        entityType: 'class',
        filePath: '/src/models/Admin.ts',
        startLine: 1,
        endLine: 30,
      });

      // Store relationship
      await chunkStore.storeRelationship({
        sourceId: 'class-admin',
        targetId: 'class-user',
        relationshipType: 'extends',
        metadata: { inherited: true },
      });

      const stats = await chunkStore.getStats();
      expect(stats.relationshipCount).toBeGreaterThanOrEqual(1);
    });

    it('should delete chunks by file path', async () => {
      const embedding = Array.from({ length: 768 }, () => Math.random());

      await chunkStore.storeChunk({
        id: 'delete-1',
        filePath: '/src/to-delete.ts',
        content: 'const x = 1;',
        embedding,
        startLine: 1,
        endLine: 1,
      });

      await chunkStore.storeChunk({
        id: 'keep-1',
        filePath: '/src/keep.ts',
        content: 'const y = 2;',
        embedding,
        startLine: 1,
        endLine: 1,
      });

      const deleted = await chunkStore.deleteByFilePath('/src/to-delete.ts');
      expect(deleted).toBe(1);

      const health = await chunkStore.healthCheck();
      expect(health.chunkCount).toBe(1);
    });
  });

  describe('VectorSearch with CodeChunkStore', () => {
    it('should use database backend when configured', async () => {
      const vectorSearch = new VectorSearch({
        dimensions: 768,
        metric: 'cosine',
        database: {
          host: RUVECTOR_HOST,
          port: RUVECTOR_PORT,
          database: process.env.RUVECTOR_DATABASE ?? 'ruvector',
          user: process.env.RUVECTOR_USER ?? 'ruvector',
          password: process.env.RUVECTOR_PASSWORD ?? 'ruvector',
          embeddingDimension: 768,
        },
      });

      await vectorSearch.initialize();

      expect(vectorSearch.isUsingDatabase()).toBe(true);

      // Add a document
      const embedding = Array.from({ length: 768 }, () => Math.random() - 0.5);

      await vectorSearch.addDocument({
        id: 'vs-test-1',
        embedding,
        metadata: {
          filePath: '/src/test.ts',
          content: 'test content',
          startLine: 1,
          endLine: 5,
          entityType: 'function',
          entityName: 'test',
        },
      });

      // Search
      const results = await vectorSearch.search(embedding, 5);
      expect(results.length).toBeGreaterThan(0);

      await vectorSearch.close();
    });

    it('should fall back to in-memory when database not configured', async () => {
      const vectorSearch = new VectorSearch({
        dimensions: 768,
        metric: 'cosine',
        // No database config
      });

      await vectorSearch.initialize();

      expect(vectorSearch.isUsingDatabase()).toBe(false);

      const embedding = Array.from({ length: 768 }, () => Math.random() - 0.5);

      await vectorSearch.addDocument({
        id: 'mem-test-1',
        embedding,
        metadata: {
          filePath: '/src/test.ts',
          content: 'in-memory content',
          startLine: 1,
          endLine: 5,
        },
      });

      // Should use in-memory search
      const results = await vectorSearch.search(embedding, 5);
      expect(results.length).toBeGreaterThan(0);

      await vectorSearch.close();
    });
  });
});

// Check if Ollama is available (requires running Ollama server)
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const SKIP_OLLAMA_TESTS = process.env.ENABLE_OLLAMA_TESTS !== 'true';

// Skip router tests that require Ollama unless explicitly enabled
const describeOllamaIntegration = SKIP_OLLAMA_TESTS ? describe.skip : describeIntegration;

describeOllamaIntegration('CodeIntelligenceHybridRouter Integration', () => {
  let router: CodeIntelligenceHybridRouter;

  beforeAll(async () => {
    // Only run if both RuVector and Ollama are available
    router = createDockerCodeIntelligenceRouter();

    try {
      await router.initialize();
    } catch (error) {
      console.warn('Router initialization failed:', error);
      throw error;
    }
  });

  afterAll(async () => {
    if (router) {
      await router.shutdown();
    }
  });

  beforeEach(async () => {
    if (router) {
      await router.clearStorage();
    }
  });

  it('should embed and store code chunks', async () => {
    const chunk = {
      id: 'router-test-1',
      filePath: '/src/router-test.ts',
      content: 'export function processRequest(req: Request) { return req.body; }',
      startLine: 1,
      endLine: 3,
      language: 'typescript',
      entityType: 'function',
      entityName: 'processRequest',
    };

    const embedded = await router.embedAndStoreChunk(chunk);

    expect(embedded.embedding).toBeDefined();
    expect(embedded.embedding.length).toBe(768);
    expect(embedded.chunk.id).toBe(chunk.id);
  });

  it('should search for code using semantic similarity', async () => {
    // Store some test chunks
    const chunks = [
      {
        id: 'search-1',
        filePath: '/src/auth.ts',
        content: 'function login(username: string, password: string) { /* auth logic */ }',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
        entityType: 'function',
        entityName: 'login',
      },
      {
        id: 'search-2',
        filePath: '/src/api.ts',
        content: 'function fetchData(url: string) { return fetch(url); }',
        startLine: 1,
        endLine: 3,
        language: 'typescript',
        entityType: 'function',
        entityName: 'fetchData',
      },
    ];

    await router.embedAndStoreChunks(chunks);

    // Search for authentication-related code
    const results = await router.searchCode('user authentication login', {
      topK: 5,
    });

    expect(results.length).toBeGreaterThan(0);
    // The auth function should rank higher
    const authResult = results.find((r) => r.filePath === '/src/auth.ts');
    expect(authResult).toBeDefined();
  });

  it('should perform hybrid search with keyword boosting', async () => {
    const chunks = [
      {
        id: 'hybrid-1',
        filePath: '/src/validate.ts',
        content: 'function validateEmail(email: string): boolean { return /^[^@]+@[^@]+$/.test(email); }',
        startLine: 1,
        endLine: 3,
        language: 'typescript',
        entityType: 'function',
        entityName: 'validateEmail',
      },
    ];

    await router.embedAndStoreChunks(chunks);

    // Hybrid search with keyword
    const results = await router.hybridSearchCode('validateEmail', {
      topK: 5,
      keywordWeight: 0.7,
      vectorWeight: 0.3,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain('validateEmail');
  });

  it('should return router statistics', async () => {
    const stats = await router.getCodeRouterStats();

    expect(stats.embeddingDimension).toBe(768);
    expect(stats.routerHealthy).toBe(true);
    expect(typeof stats.chunkCount).toBe('number');
  });
});

/**
 * End-to-end test with real data
 */
describeIntegration('End-to-End RuVector Integration', () => {
  it('should index and search a real TypeScript file', async () => {
    const chunkStore = new CodeChunkStore({
      host: RUVECTOR_HOST,
      port: RUVECTOR_PORT,
      database: process.env.RUVECTOR_DATABASE ?? 'ruvector',
      user: process.env.RUVECTOR_USER ?? 'ruvector',
      password: process.env.RUVECTOR_PASSWORD ?? 'ruvector',
      embeddingDimension: 768,
    });

    await chunkStore.initialize();
    await chunkStore.clear();

    // Simulate indexing a real TypeScript file
    const realCode = `
/**
 * User authentication service
 */
export class AuthService {
  private tokenStore: Map<string, string> = new Map();

  async login(username: string, password: string): Promise<string> {
    // Validate credentials
    const isValid = await this.validateCredentials(username, password);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }
    // Generate token
    const token = this.generateToken(username);
    this.tokenStore.set(username, token);
    return token;
  }

  async logout(username: string): Promise<void> {
    this.tokenStore.delete(username);
  }

  private async validateCredentials(username: string, password: string): Promise<boolean> {
    // Check against database
    return username.length > 0 && password.length >= 8;
  }

  private generateToken(username: string): string {
    return Buffer.from(\`\${username}:\${Date.now()}\`).toString('base64');
  }
}
`;

    // Create chunks for different parts
    const chunks = [
      {
        id: 'e2e-class-1',
        filePath: '/src/services/AuthService.ts',
        content: realCode,
        chunkType: 'class',
        name: 'AuthService',
        startLine: 4,
        endLine: 32,
      },
      {
        id: 'e2e-method-1',
        filePath: '/src/services/AuthService.ts',
        content: `async login(username: string, password: string): Promise<string> {
    const isValid = await this.validateCredentials(username, password);
    if (!isValid) throw new Error('Invalid credentials');
    const token = this.generateToken(username);
    this.tokenStore.set(username, token);
    return token;
  }`,
        chunkType: 'method',
        name: 'login',
        startLine: 8,
        endLine: 17,
      },
      {
        id: 'e2e-method-2',
        filePath: '/src/services/AuthService.ts',
        content: `async logout(username: string): Promise<void> {
    this.tokenStore.delete(username);
  }`,
        chunkType: 'method',
        name: 'logout',
        startLine: 19,
        endLine: 21,
      },
    ];

    // Generate mock embeddings (in production, use Ollama nomic-embed-text)
    for (let i = 0; i < chunks.length; i++) {
      const embedding = Array.from({ length: 768 }, (_, j) =>
        Math.sin((i + 1) * 0.1 + j * 0.01) * 0.5
      );

      await chunkStore.storeChunk({
        ...chunks[i],
        embedding,
        startLine: chunks[i].startLine,
        endLine: chunks[i].endLine,
      });
    }

    // Store entity
    await chunkStore.storeEntity({
      id: 'e2e-entity-1',
      name: 'AuthService',
      entityType: 'class',
      filePath: '/src/services/AuthService.ts',
      startLine: 4,
      endLine: 32,
      signature: 'export class AuthService',
    });

    // Verify data stored
    const stats = await chunkStore.getStats();
    expect(stats.chunkCount).toBe(3);
    expect(stats.entityCount).toBe(1);

    // Search for "user login authentication"
    const queryEmbedding = Array.from({ length: 768 }, (_, j) =>
      Math.sin(0.15 + j * 0.01) * 0.5
    );

    const results = await chunkStore.search(queryEmbedding, { topK: 5 });

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.name === 'login')).toBe(true);

    // Health check
    const health = await chunkStore.healthCheck();
    expect(health.healthy).toBe(true);

    await chunkStore.close();
  });
});
