/**
 * Code Intelligence Orchestrator
 *
 * The main integration layer that connects all components:
 * - FileWatcher → IncrementalIndexer → ASTChunker → NomicEmbedder → Database
 * - TreeSitterParser → GraphBuilder → RelationshipExtractor
 * - HybridSearchEngine with BM25 + Vector search
 *
 * INTEGRATED WITH EXISTING INFRASTRUCTURE:
 * - CodeChunkStore (RuVector PostgreSQL) for persistent storage
 * - HybridRouter for embeddings and LLM queries
 * - VectorSearch delegates to CodeChunkStore
 *
 * This is the "hallway" that connects all the "rooms".
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';

// Import all modules
import { IncrementalIndexer } from '../indexing/IncrementalIndexer.js';
import { FileWatcher } from '../indexing/FileWatcher.js';
import { WebTreeSitterParser } from '../parser/WebTreeSitterParser.js';
import { ASTChunker } from '../chunking/ASTChunker.js';
import { NomicEmbedder } from '../embeddings/NomicEmbedder.js';
import { GraphBuilder } from '../graph/GraphBuilder.js';
import { RelationshipExtractor } from '../graph/RelationshipExtractor.js';
import { HybridSearchEngine, VectorSearchProvider } from '../search/HybridSearchEngine.js';
import { ImportParser } from '../graph/ImportParser.js';
import { TestMapper } from '../graph/TestMapper.js';
import { GitChangeDetector } from '../indexing/GitChangeDetector.js';
import { CodeChunkStore, CodeChunkStoreConfig } from '../storage/CodeChunkStore.js';
import { VectorSearch } from '../search/VectorSearch.js';
import {
  CodeIntelligenceHybridRouter,
  CodeIntelligenceRouterConfig,
} from '../router/CodeIntelligenceHybridRouter.js';

import type { CodeEntity } from '../parser/types.js';
import type { CodeChunk } from '../chunking/types.js';
import type { FileChange } from '../indexing/types.js';

import {
  OrchestratorConfig,
  IndexingProgress,
  IndexingResult,
  QueryContext,
  QueryResult,
  ProgressCallback,
  DEFAULT_ORCHESTRATOR_CONFIG,
} from './types.js';

export class CodeIntelligenceOrchestrator extends EventEmitter {
  private config: OrchestratorConfig;

  // Core components
  private indexer: IncrementalIndexer;
  private fileWatcher: FileWatcher;
  private parser: WebTreeSitterParser;
  private chunker: ASTChunker;
  private embedder: NomicEmbedder;
  private graphBuilder: GraphBuilder;
  private relationshipExtractor: RelationshipExtractor;
  private searchEngine: HybridSearchEngine;
  private importParser: ImportParser;
  private testMapper: TestMapper;
  private gitDetector: GitChangeDetector;

  // RuVector-integrated router for embeddings and storage
  private codeRouter: CodeIntelligenceHybridRouter | null = null;

  // State
  private isInitialized: boolean = false;
  private isIndexing: boolean = false;
  private embeddingCache: Map<string, number[]> = new Map(); // Fallback for in-memory mode

  constructor(config: Partial<OrchestratorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };

    // Initialize components
    this.indexer = new IncrementalIndexer(this.config.indexer);
    this.fileWatcher = new FileWatcher({
      rootDir: this.config.rootDir,
      ...this.config.watcher,
    });
    this.parser = new WebTreeSitterParser();
    this.chunker = new ASTChunker(this.config.chunker);
    this.embedder = new NomicEmbedder(this.config.ollamaUrl);
    this.graphBuilder = new GraphBuilder(this.config.graph);
    this.relationshipExtractor = new RelationshipExtractor(this.graphBuilder);
    this.searchEngine = new HybridSearchEngine(this.config.search);
    this.importParser = new ImportParser();
    this.testMapper = new TestMapper(this.config.rootDir);
    this.gitDetector = new GitChangeDetector(this.config.rootDir);

    // Initialize CodeIntelligenceHybridRouter if database configured
    if (this.config.database?.enabled) {
      // Parse Ollama URL to extract port
      let ollamaPort = 11434;
      try {
        const ollamaUrl = new URL(this.config.ollamaUrl);
        ollamaPort = parseInt(ollamaUrl.port) || 11434;
      } catch {
        // Use default port
      }

      this.codeRouter = new CodeIntelligenceHybridRouter({
        database: this.config.database,
        ruvllm: {
          port: ollamaPort,
        },
        embeddingDimension: 768,
        autoStoreChunks: true,
        storeRelationships: true,
      });
    }

    // Wire up file watcher to indexer
    this.setupFileWatcherIntegration();
  }

  /**
   * Initialize the orchestrator.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Parser initializes in constructor, no additional setup needed

    // Initialize CodeIntelligenceHybridRouter (RuVector-backed)
    if (this.codeRouter) {
      try {
        await this.codeRouter.initialize();
        console.log('CodeIntelligenceHybridRouter initialized with RuVector database');
      } catch (error) {
        console.warn('Failed to initialize CodeIntelligenceHybridRouter:', error);
        console.warn('Falling back to in-memory mode');
        this.codeRouter = null;
      }
    }

    // Initialize embedder (check Ollama health) - used for in-memory fallback
    if (!this.codeRouter) {
      const embedderReady = await this.embedder.healthCheck();
      if (!embedderReady) {
        console.warn('Ollama not available - embeddings will be skipped');
      }
    }

    // Set up vector search provider
    this.setupVectorSearchProvider();

    this.isInitialized = true;
    this.emit('initialized');
  }

  /**
   * Index a project directory.
   */
  async indexProject(
    rootDir?: string,
    progressCallback?: ProgressCallback
  ): Promise<IndexingResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isIndexing) {
      throw new Error('Indexing already in progress');
    }

    this.isIndexing = true;
    const projectRoot = rootDir || this.config.rootDir;
    const startTime = Date.now();

    const progress: IndexingProgress = {
      phase: 'scanning',
      totalFiles: 0,
      processedFiles: 0,
      chunksCreated: 0,
      embeddingsGenerated: 0,
      relationshipsExtracted: 0,
      errors: [],
      startTime,
      elapsedMs: 0,
    };

    const result: IndexingResult = {
      success: true,
      stats: {
        filesIndexed: 0,
        chunksCreated: 0,
        embeddingsGenerated: 0,
        nodesCreated: 0,
        edgesCreated: 0,
        totalTimeMs: 0,
        averageTimePerFileMs: 0,
      },
      failures: [],
    };

    try {
      // Phase 1: Scan files
      progress.phase = 'scanning';
      this.emitProgress(progress, progressCallback);

      const files = await this.scanDirectory(projectRoot);
      progress.totalFiles = files.length;
      this.emitProgress(progress, progressCallback);

      // Phase 2-5: Process files in batches
      for (let i = 0; i < files.length; i += this.config.batchSize) {
        const batch = files.slice(i, i + this.config.batchSize);

        await Promise.all(
          batch.map(async (filePath) => {
            try {
              await this.processFile(filePath, progress);
              progress.processedFiles++;
              result.stats.filesIndexed++;
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              progress.errors.push({ file: filePath, error: errorMsg });
              result.failures.push({ file: filePath, error: errorMsg });
            }

            progress.elapsedMs = Date.now() - startTime;
            if (progress.processedFiles > 0) {
              const avgTime = progress.elapsedMs / progress.processedFiles;
              progress.estimatedRemainingMs =
                avgTime * (progress.totalFiles - progress.processedFiles);
            }
            this.emitProgress(progress, progressCallback);
          })
        );
      }

      // Phase 6: Extract cross-file relationships
      progress.phase = 'indexing';
      this.emitProgress(progress, progressCallback);

      await this.extractCrossFileRelationships(projectRoot);

      // Complete
      progress.phase = 'complete';
      progress.elapsedMs = Date.now() - startTime;
      this.emitProgress(progress, progressCallback);

      // Update result stats
      const graphStats = this.graphBuilder.getStats();
      result.stats.chunksCreated = progress.chunksCreated;
      result.stats.embeddingsGenerated = progress.embeddingsGenerated;
      result.stats.nodesCreated = graphStats.nodeCount;
      result.stats.edgesCreated = graphStats.edgeCount;
      result.stats.totalTimeMs = progress.elapsedMs;
      result.stats.averageTimePerFileMs =
        result.stats.filesIndexed > 0
          ? result.stats.totalTimeMs / result.stats.filesIndexed
          : 0;

      result.success = result.failures.length === 0;
    } finally {
      this.isIndexing = false;
    }

    this.emit('indexingComplete', result);
    return result;
  }

  /**
   * Process incremental changes.
   */
  async processChanges(changes: FileChange[]): Promise<IndexingResult> {
    const startTime = Date.now();
    const result: IndexingResult = {
      success: true,
      stats: {
        filesIndexed: 0,
        chunksCreated: 0,
        embeddingsGenerated: 0,
        nodesCreated: 0,
        edgesCreated: 0,
        totalTimeMs: 0,
        averageTimePerFileMs: 0,
      },
      failures: [],
    };

    // Process each change
    const processed = await this.indexer.processChanges(changes);

    // Handle deletions
    for (const filePath of processed.deleted) {
      this.graphBuilder.removeFile(filePath);
      // Note: Would also remove from search index and database
    }

    // Handle additions and modifications
    const toProcess = [...processed.added, ...processed.modified];
    for (const filePath of toProcess) {
      try {
        const progress: IndexingProgress = {
          phase: 'parsing',
          totalFiles: 1,
          processedFiles: 0,
          chunksCreated: 0,
          embeddingsGenerated: 0,
          relationshipsExtracted: 0,
          errors: [],
          startTime,
          elapsedMs: 0,
        };

        await this.processFile(filePath, progress);
        result.stats.filesIndexed++;
        result.stats.chunksCreated += progress.chunksCreated;
        result.stats.embeddingsGenerated += progress.embeddingsGenerated;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        result.failures.push({ file: filePath, error: errorMsg });
      }
    }

    result.stats.totalTimeMs = Date.now() - startTime;
    result.success = result.failures.length === 0;

    return result;
  }

  /**
   * Query the code intelligence system.
   */
  async query(context: QueryContext): Promise<QueryResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const startTime = Date.now();

    // Perform hybrid search
    const searchResponse = await this.searchEngine.search(context.query, {
      topK: context.topK,
    });

    const results: QueryResult['results'] = [];

    for (const searchResult of searchResponse.results) {
      const result: QueryResult['results'][0] = {
        id: searchResult.id,
        filePath: searchResult.filePath,
        content: searchResult.content,
        startLine: searchResult.startLine,
        endLine: searchResult.endLine,
        score: searchResult.score,
        entityType: searchResult.entityType,
        entityName: searchResult.entityName,
      };

      // Add graph context if requested
      if (context.includeGraphContext) {
        result.relatedCode = await this.expandGraphContext(
          searchResult.filePath,
          searchResult.entityName,
          context.graphDepth
        );
      }

      results.push(result);
    }

    return {
      results,
      metadata: {
        query: context.query,
        totalMatches: searchResponse.totalMatches,
        searchTimeMs: Date.now() - startTime,
        graphExpansionTimeMs: context.includeGraphContext
          ? Date.now() - startTime - searchResponse.searchTimeMs
          : undefined,
      },
    };
  }

  /**
   * Start file watching.
   */
  async startWatching(): Promise<void> {
    if (this.config.watchEnabled) {
      await this.fileWatcher.start();
    }
  }

  /**
   * Stop file watching.
   */
  async stopWatching(): Promise<void> {
    await this.fileWatcher.stop();
  }

  /**
   * Get changed files since last index using git.
   */
  async getGitChanges(sinceCommit?: string): Promise<FileChange[]> {
    if (!this.config.gitEnabled) {
      return [];
    }
    return this.gitDetector.getChangedFiles(sinceCommit);
  }

  /**
   * Get current statistics (includes database stats when using database storage).
   */
  async getStats(): Promise<{
    indexer: ReturnType<typeof IncrementalIndexer.prototype.getStats>;
    graph: ReturnType<typeof GraphBuilder.prototype.getStats>;
    search: ReturnType<typeof HybridSearchEngine.prototype.getStats>;
    database?: {
      chunkCount: number;
      entityCount: number;
      relationshipCount: number;
      databaseHealthy: boolean;
    };
  }> {
    const stats: {
      indexer: ReturnType<typeof IncrementalIndexer.prototype.getStats>;
      graph: ReturnType<typeof GraphBuilder.prototype.getStats>;
      search: ReturnType<typeof HybridSearchEngine.prototype.getStats>;
      database?: {
        chunkCount: number;
        entityCount: number;
        relationshipCount: number;
        databaseHealthy: boolean;
      };
    } = {
      indexer: this.indexer.getStats(),
      graph: this.graphBuilder.getStats(),
      search: this.searchEngine.getStats(),
    };

    // Add database stats if using database storage
    if (this.codeRouter) {
      try {
        const dbStats = await this.codeRouter.getCodeRouterStats();
        stats.database = {
          chunkCount: dbStats.chunkCount,
          entityCount: dbStats.entityCount,
          relationshipCount: dbStats.relationshipCount,
          databaseHealthy: dbStats.databaseHealthy,
        };
      } catch (error) {
        // Database stats unavailable - leave undefined
        console.warn('Failed to get database stats:', error);
      }
    }

    return stats;
  }

  /**
   * Get configuration.
   */
  getConfig(): OrchestratorConfig {
    return { ...this.config };
  }

  /**
   * Clear all indexes.
   */
  async clear(): Promise<void> {
    this.indexer.clearIndex();
    this.graphBuilder.clear();
    this.searchEngine.clear();
    this.embeddingCache.clear();

    // Clear database storage if using codeRouter
    if (this.codeRouter) {
      await this.codeRouter.clearStorage();
    }
  }

  /**
   * Check if using database-backed storage.
   */
  isUsingDatabase(): boolean {
    return this.codeRouter !== null && this.codeRouter.isUsingDatabase();
  }

  /**
   * Get the code router (for advanced operations).
   */
  getCodeRouter(): CodeIntelligenceHybridRouter | null {
    return this.codeRouter;
  }

  /**
   * Get the graph builder (for visualization and context building).
   */
  getGraphBuilder(): GraphBuilder {
    return this.graphBuilder;
  }

  /**
   * Get the search engine (for context building).
   */
  getSearchEngine(): HybridSearchEngine {
    return this.searchEngine;
  }

  /**
   * Shutdown the orchestrator.
   */
  async shutdown(): Promise<void> {
    await this.stopWatching();

    if (this.codeRouter) {
      await this.codeRouter.shutdown();
      this.codeRouter = null;
    }

    this.isInitialized = false;
    this.emit('shutdown');
  }

  // === Private Methods ===

  /**
   * Process a single file through the entire pipeline.
   */
  private async processFile(
    filePath: string,
    progress: IndexingProgress
  ): Promise<void> {
    progress.currentFile = filePath;

    // Read file content
    const content = await fs.readFile(filePath, 'utf-8');
    const language = this.detectLanguage(filePath);

    // Check if file needs re-indexing
    if (!this.indexer.needsReindex(filePath, content)) {
      return;
    }

    // Phase 1: Parse file
    progress.phase = 'parsing';
    const indexedFile = await this.indexer.indexFile(filePath, content, language);

    let entities: CodeEntity[] = [];
    try {
      const parseResult = await this.parser.parseFile(filePath, content);
      entities = parseResult.entities;
    } catch (error) {
      // Log but continue - file can still be chunked line-based
      console.warn(`Failed to parse ${filePath}:`, error);
    }

    // Phase 2: Chunk file (ASTChunker parses internally, entities used for graph)
    progress.phase = 'chunking';
    const chunkingResult = await this.chunker.chunkFile(filePath, content, language);
    const chunks = chunkingResult.chunks;
    progress.chunksCreated += chunks.length;

    // Phase 3: Generate embeddings and store in database
    progress.phase = 'embedding';
    const chunkIds: string[] = [];

    if (this.codeRouter) {
      // Use CodeIntelligenceHybridRouter for database-backed storage
      try {
        const embeddedChunks = await this.codeRouter.embedAndStoreChunks(chunks);

        for (const embeddedChunk of embeddedChunks) {
          // Add to search engine (for BM25 keyword search)
          this.searchEngine.addDocument({
            id: embeddedChunk.chunk.id,
            filePath: embeddedChunk.chunk.filePath,
            content: embeddedChunk.chunk.content,
            startLine: embeddedChunk.chunk.lineStart,
            endLine: embeddedChunk.chunk.lineEnd,
            entityType: embeddedChunk.chunk.entityType,
            entityName: embeddedChunk.chunk.parentEntity,
          });

          chunkIds.push(embeddedChunk.chunk.id);
          progress.embeddingsGenerated++;
        }
      } catch (error) {
        console.warn(`Failed to embed chunks for ${filePath}:`, error);
        // Fall back to adding documents without embeddings
        for (const chunk of chunks) {
          this.searchEngine.addDocument({
            id: chunk.id,
            filePath: chunk.filePath,
            content: chunk.content,
            startLine: chunk.lineStart,
            endLine: chunk.lineEnd,
            entityType: chunk.entityType,
            entityName: chunk.parentEntity,
          });
          chunkIds.push(chunk.id);
        }
      }
    } else {
      // Fallback: In-memory mode
      for (const chunk of chunks) {
        const embedding = await this.generateEmbedding(chunk);

        // Add to search engine
        this.searchEngine.addDocument({
          id: chunk.id,
          filePath: chunk.filePath,
          content: chunk.content,
          startLine: chunk.lineStart,
          endLine: chunk.lineEnd,
          entityType: chunk.entityType,
          entityName: chunk.parentEntity,
        });

        chunkIds.push(chunk.id);

        if (embedding) {
          progress.embeddingsGenerated++;
          // Store embedding in memory for vector search
          this.embeddingCache.set(chunk.id, embedding);
        }
      }
    }

    // Phase 4: Build graph
    progress.phase = 'indexing';

    // Add file node
    const fileNode = this.graphBuilder.addNode(
      'file',
      path.basename(filePath),
      filePath,
      1,
      content.split('\n').length,
      language
    );

    // Add entity nodes and extract relationships
    for (const entity of entities) {
      const entityNode = this.graphBuilder.addNode(
        entity.type as any,
        entity.name,
        filePath,
        entity.lineStart,
        entity.lineEnd,
        language,
        {
          parameters: entity.metadata.parameters,
          returnType: entity.metadata.returnType,
          visibility: entity.metadata.visibility,
          isAsync: entity.metadata.isAsync,
          isExported: entity.metadata.isExported,
        }
      );

      // DEFINES relationship (file defines entity)
      this.graphBuilder.addEdge(fileNode.id, entityNode.id, 'defines');

      // Store entity in database if using database storage
      if (this.codeRouter) {
        try {
          await this.codeRouter.storeEntity(entity, filePath);
          // Store DEFINES relationship
          await this.codeRouter.storeRelationship(fileNode.id, entityNode.id, 'defines');
        } catch (error) {
          // Non-fatal: entity storage failure shouldn't block indexing
          console.warn(`Failed to store entity ${entity.name}:`, error);
        }
      }
    }

    // Extract inheritance relationships from parsed entities
    // Convert CodeEntity[] to ParsedEntity[] format for RelationshipExtractor
    const parsedEntities = entities.map((entity) => ({
      type: entity.type,
      name: entity.name,
      filePath: entity.filePath,
      startLine: entity.lineStart,
      endLine: entity.lineEnd,
      language: entity.language,
      parent: entity.metadata.parentClass,
      returnType: entity.metadata.returnType,
      parameters: entity.metadata.parameters?.map((p) => ({ name: p, type: 'unknown' })),
    }));

    const extractionResult = this.relationshipExtractor.extractFromEntities(parsedEntities);
    progress.relationshipsExtracted += extractionResult.edgesCreated;

    // Extract import relationships
    const imports = this.importParser.parseImports(content, language);
    for (const imp of imports) {
      const targetPath = this.importParser.resolveImportPath(imp, filePath);
      if (targetPath) {
        const targetFileNode = this.graphBuilder.findOrCreateNode(
          'file',
          path.basename(targetPath),
          targetPath
        );
        this.graphBuilder.addEdge(fileNode.id, targetFileNode.id, 'imports');
        progress.relationshipsExtracted++;

        // Store import relationship in database
        if (this.codeRouter) {
          try {
            await this.codeRouter.storeRelationship(fileNode.id, targetFileNode.id, 'imports');
          } catch {
            // Non-fatal
          }
        }
      }
    }

    // Mark file as indexed
    this.indexer.markIndexed(filePath, chunkIds);
  }

  /**
   * Extract cross-file relationships (tests, calls).
   */
  private async extractCrossFileRelationships(rootDir: string): Promise<void> {
    // Map test files to source files
    const testMappings = await this.testMapper.mapTestFiles();

    for (const mapping of testMappings) {
      const testFileNode = this.graphBuilder.findNode(
        path.basename(mapping.testFile),
        mapping.testFile,
        'file'
      );
      const sourceFileNode = this.graphBuilder.findNode(
        path.basename(mapping.sourceFile),
        mapping.sourceFile,
        'file'
      );

      if (testFileNode && sourceFileNode) {
        this.graphBuilder.addEdge(testFileNode.id, sourceFileNode.id, 'tests');
      }
    }
  }

  /**
   * Generate embedding for a chunk.
   */
  private async generateEmbedding(chunk: CodeChunk): Promise<number[] | null> {
    try {
      const text = this.formatChunkForEmbedding(chunk);
      // embed() takes a single string and returns number[] directly
      const embedding = await this.embedder.embed(text);
      return embedding;
    } catch (error) {
      // Embedding failures are not fatal
      return null;
    }
  }

  /**
   * Format chunk content for embedding.
   */
  private formatChunkForEmbedding(chunk: CodeChunk): string {
    const parts: string[] = [];

    if (chunk.language) {
      parts.push(`Language: ${chunk.language}`);
    }
    if (chunk.entityType) {
      parts.push(`Type: ${chunk.entityType}`);
    }
    if (chunk.parentEntity) {
      parts.push(`Name: ${chunk.parentEntity}`);
    }
    parts.push('');
    parts.push(chunk.content);

    return parts.join('\n');
  }

  /**
   * Expand graph context for a result.
   */
  private async expandGraphContext(
    filePath: string,
    entityName?: string,
    depth: number = 2
  ): Promise<QueryResult['results'][0]['relatedCode']> {
    const related: QueryResult['results'][0]['relatedCode'] = [];

    // Find starting node
    const startNode = entityName
      ? this.graphBuilder.findNode(entityName, filePath)
      : this.graphBuilder.findNode(path.basename(filePath), filePath, 'file');

    if (!startNode) return related;

    // Get neighbors up to specified depth
    const queryResult = this.graphBuilder.query({
      startNode: startNode.id,
      maxDepth: depth,
      limit: 10,
      direction: 'both',
    });

    for (const node of queryResult.nodes) {
      if (node.id === startNode.id) continue;

      // Find relationship type
      const edge = queryResult.edges.find(
        (e) => e.source === startNode.id && e.target === node.id
      ) || queryResult.edges.find(
        (e) => e.target === startNode.id && e.source === node.id
      );

      if (edge) {
        try {
          const content = await fs.readFile(node.filePath, 'utf-8');
          const lines = content.split('\n');
          const snippet = lines
            .slice(node.startLine - 1, node.endLine)
            .join('\n');

          related.push({
            filePath: node.filePath,
            content: snippet,
            relationship: edge.type,
          });
        } catch {
          // File not accessible - skip
        }
      }
    }

    return related;
  }

  /**
   * Set up vector search provider using RuVector database or in-memory cache.
   */
  private setupVectorSearchProvider(): void {
    const self = this;

    const vectorProvider: VectorSearchProvider = {
      async search(query: string, topK: number) {
        // Use CodeIntelligenceHybridRouter if available (RuVector-backed)
        if (self.codeRouter) {
          try {
            const results = await self.codeRouter.searchCode(query, { topK });
            return results.map((r) => ({
              id: r.id,
              filePath: r.filePath,
              content: r.content,
              startLine: r.startLine,
              endLine: r.endLine,
              score: r.score,
              vectorScore: r.score,
              entityType: r.entityType,
              entityName: r.entityName,
            }));
          } catch (error) {
            console.warn('RuVector search failed, falling back to in-memory:', error);
            // Fall through to in-memory search
          }
        }

        // Fallback: In-memory search using embedding cache
        let queryEmbedding: number[];
        try {
          // embed() takes a single string and returns number[] directly
          queryEmbedding = await self.embedder.embed(query);
        } catch {
          return [];
        }

        if (!queryEmbedding) return [];

        // Calculate similarity scores against in-memory cache
        const scores: Array<{ id: string; score: number }> = [];

        for (const [id, embedding] of self.embeddingCache.entries()) {
          const score = self.cosineSimilarity(queryEmbedding, embedding);
          scores.push({ id, score });
        }

        // Sort by score and take topK
        scores.sort((a, b) => b.score - a.score);
        const topResults = scores.slice(0, topK);

        // Convert to SearchResult format
        return topResults.map((s) => ({
          id: s.id,
          filePath: '',
          content: '',
          startLine: 0,
          endLine: 0,
          score: s.score,
          vectorScore: s.score,
        }));
      },
    };

    this.searchEngine.setVectorProvider(vectorProvider);
  }

  /**
   * Calculate cosine similarity between two vectors.
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Set up file watcher integration.
   */
  private setupFileWatcherIntegration(): void {
    this.fileWatcher.onChanges(async (changes) => {
      if (!this.isIndexing) {
        const result = await this.processChanges(changes);
        this.emit('incrementalUpdate', result);
      }
    });

    this.fileWatcher.on('error', (error) => {
      this.emit('error', error);
    });
  }

  /**
   * Scan directory for indexable files.
   */
  private async scanDirectory(dir: string): Promise<string[]> {
    const files: string[] = [];
    const config = this.indexer.getConfig();

    const scan = async (currentDir: string) => {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          // Skip excluded directories
          if (!config.excludeDirs.includes(entry.name)) {
            await scan(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (config.extensions.includes(ext)) {
            const stat = await fs.stat(fullPath);
            if (stat.size <= config.maxFileSize) {
              files.push(fullPath);
            }
          }
        }
      }
    };

    await scan(dir);
    return files;
  }

  /**
   * Detect language from file extension.
   */
  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const langMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.go': 'go',
      '.rs': 'rust',
      '.java': 'java',
      '.c': 'c',
      '.cpp': 'cpp',
      '.h': 'c',
    };
    return langMap[ext] || 'unknown';
  }

  /**
   * Emit progress event.
   */
  private emitProgress(
    progress: IndexingProgress,
    callback?: ProgressCallback
  ): void {
    this.emit('progress', progress);
    if (callback) {
      callback(progress);
    }
  }
}
