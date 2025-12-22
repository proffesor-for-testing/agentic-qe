/**
 * Unit Tests for VectorSearch
 *
 * Tests in-memory vector search and pgvector integration.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { VectorSearch, VectorDocument } from '../../../src/code-intelligence/search/VectorSearch.js';

describe('VectorSearch', () => {
  let search: VectorSearch;

  // Helper to create test documents with embeddings
  function createDoc(
    id: string,
    embedding: number[],
    content: string = 'test content'
  ): VectorDocument {
    return {
      id,
      embedding,
      metadata: {
        filePath: `/src/${id}.ts`,
        content,
        startLine: 1,
        endLine: 10,
        entityType: 'function',
        entityName: id,
      },
    };
  }

  // Helper to create random embedding
  function randomEmbedding(dims: number = 768): number[] {
    return Array.from({ length: dims }, () => Math.random() - 0.5);
  }

  // Helper to create normalized embedding
  function normalizeEmbedding(embedding: number[]): number[] {
    const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    return embedding.map((v) => v / norm);
  }

  beforeEach(() => {
    search = new VectorSearch({ dimensions: 768 });
  });

  describe('document management', () => {
    it('should add a document', async () => {
      const doc = createDoc('doc1', randomEmbedding());

      await search.addDocument(doc);

      expect(search.getDocumentCount()).toBe(1);
      expect(search.getDocumentIds()).toContain('doc1');
    });

    it('should add multiple documents', async () => {
      const docs = [
        createDoc('doc1', randomEmbedding()),
        createDoc('doc2', randomEmbedding()),
        createDoc('doc3', randomEmbedding()),
      ];

      await search.addDocuments(docs);

      expect(search.getDocumentCount()).toBe(3);
    });

    it('should reject wrong dimension embeddings', async () => {
      const doc = createDoc('doc1', randomEmbedding(100)); // Wrong dims

      await expect(search.addDocument(doc)).rejects.toThrow('Expected 768 dimensions');
    });

    it('should remove document', async () => {
      const doc = createDoc('doc1', randomEmbedding());
      await search.addDocument(doc);

      const removed = await search.removeDocument('doc1');

      expect(removed).toBe(true);
      expect(search.getDocumentCount()).toBe(0);
    });

    it('should get document by ID', async () => {
      const doc = createDoc('doc1', randomEmbedding());
      await search.addDocument(doc);

      const retrieved = await search.getDocument('doc1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('doc1');
      expect(retrieved?.metadata.content).toBe('test content');
    });

    it('should clear all documents', async () => {
      await search.addDocuments([
        createDoc('doc1', randomEmbedding()),
        createDoc('doc2', randomEmbedding()),
      ]);

      await search.clear();

      expect(search.getDocumentCount()).toBe(0);
    });
  });

  describe('vector search', () => {
    it('should find similar documents', async () => {
      // Create documents with specific embeddings
      const baseEmbedding = normalizeEmbedding(randomEmbedding());

      // Create similar embedding (small perturbation)
      const similarEmbedding = normalizeEmbedding(
        baseEmbedding.map((v) => v + (Math.random() - 0.5) * 0.1)
      );

      // Create dissimilar embedding
      const dissimilarEmbedding = normalizeEmbedding(
        baseEmbedding.map((v) => -v)
      );

      await search.addDocuments([
        createDoc('similar', similarEmbedding, 'similar content'),
        createDoc('dissimilar', dissimilarEmbedding, 'dissimilar content'),
      ]);

      const results = await search.search(baseEmbedding, 2);

      expect(results.length).toBe(2);
      // Similar should rank higher
      expect(results[0].id).toBe('similar');
      expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    it('should respect topK limit', async () => {
      // Add many documents
      const docs = Array.from({ length: 20 }, (_, i) =>
        createDoc(`doc${i}`, randomEmbedding())
      );
      await search.addDocuments(docs);

      const queryEmbedding = randomEmbedding();
      const results = await search.search(queryEmbedding, 5);

      expect(results.length).toBe(5);
    });

    it('should return scores in descending order', async () => {
      await search.addDocuments([
        createDoc('doc1', randomEmbedding()),
        createDoc('doc2', randomEmbedding()),
        createDoc('doc3', randomEmbedding()),
      ]);

      const results = await search.search(randomEmbedding(), 3);

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it('should include metadata in results', async () => {
      await search.addDocument(
        createDoc('doc1', randomEmbedding())
      );

      const results = await search.search(randomEmbedding(), 1);

      expect(results[0].filePath).toBe('/src/doc1.ts');
      expect(results[0].entityType).toBe('function');
      expect(results[0].entityName).toBe('doc1');
    });

    it('should handle empty search', async () => {
      const results = await search.search(randomEmbedding(), 10);

      expect(results).toEqual([]);
    });

    it('should filter by entity type', async () => {
      const doc1 = createDoc('func', randomEmbedding());
      doc1.metadata.entityType = 'function';

      const doc2 = createDoc('class', randomEmbedding());
      doc2.metadata.entityType = 'class';

      await search.addDocuments([doc1, doc2]);

      const results = await search.search(randomEmbedding(), 10, {
        entityType: 'function',
      });

      expect(results.length).toBe(1);
      expect(results[0].entityType).toBe('function');
    });

    it('should filter by file pattern', async () => {
      const doc1 = createDoc('services', randomEmbedding());
      doc1.metadata.filePath = '/src/services/auth.ts';

      const doc2 = createDoc('utils', randomEmbedding());
      doc2.metadata.filePath = '/src/utils/helper.ts';

      await search.addDocuments([doc1, doc2]);

      const results = await search.search(randomEmbedding(), 10, {
        filePattern: 'services',
      });

      expect(results.length).toBe(1);
      expect(results[0].filePath).toContain('services');
    });
  });

  describe('similarity metrics', () => {
    it('should use cosine similarity by default', () => {
      const config = search.getConfig();
      expect(config.metric).toBe('cosine');
    });

    it('should support euclidean distance', async () => {
      const euclideanSearch = new VectorSearch({
        dimensions: 768,
        metric: 'euclidean',
      });

      await euclideanSearch.addDocument(createDoc('doc1', randomEmbedding()));

      const results = await euclideanSearch.search(randomEmbedding(), 1);

      expect(results.length).toBe(1);
    });

    it('should support dot product', async () => {
      const dotSearch = new VectorSearch({
        dimensions: 768,
        metric: 'dot',
      });

      await dotSearch.addDocument(createDoc('doc1', randomEmbedding()));

      const results = await dotSearch.search(randomEmbedding(), 1);

      expect(results.length).toBe(1);
    });
  });

  describe('configuration', () => {
    it('should use default config', () => {
      const config = search.getConfig();

      expect(config.dimensions).toBe(768);
      expect(config.metric).toBe('cosine');
      expect(config.indexType).toBe('hnsw');
    });

    it('should allow custom dimensions', () => {
      const customSearch = new VectorSearch({ dimensions: 384 });

      expect(customSearch.getConfig().dimensions).toBe(384);
    });
  });

  describe('cosine similarity edge cases', () => {
    it('should return 1 for identical vectors', async () => {
      const embedding = normalizeEmbedding(randomEmbedding());
      await search.addDocument(createDoc('doc1', embedding));

      const results = await search.search(embedding, 1);

      expect(results[0].score).toBeCloseTo(1, 5);
    });

    it('should return close to 0 for orthogonal vectors', async () => {
      // Create two orthogonal unit vectors
      const e1 = new Array(768).fill(0);
      e1[0] = 1;

      const e2 = new Array(768).fill(0);
      e2[1] = 1;

      await search.addDocument(createDoc('doc1', e1));

      const results = await search.search(e2, 1);

      expect(results[0].score).toBeCloseTo(0, 5);
    });

    it('should return -1 for opposite vectors', async () => {
      const embedding = normalizeEmbedding(randomEmbedding());
      const opposite = embedding.map((v) => -v);

      await search.addDocument(createDoc('doc1', opposite));

      const results = await search.search(embedding, 1);

      expect(results[0].score).toBeCloseTo(-1, 5);
    });
  });
});
