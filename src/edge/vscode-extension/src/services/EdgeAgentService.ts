/**
 * EdgeAgentService - VS Code Service Wrapping @ruvector/edge
 *
 * Provides WASM-accelerated vector operations for the VS Code extension
 * by wrapping the BrowserHNSWAdapter from src/edge/adapters.
 *
 * This service initializes the @ruvector/edge WASM module for VS Code's
 * webview context and provides methods for:
 * - Analyzing code files
 * - Suggesting tests based on pattern matching
 * - Storing and retrieving test patterns
 *
 * @module vscode-extension/services/EdgeAgentService
 * @version 0.1.0
 */

import type { EdgeAgentServiceConfig } from '../extension';

// Import the actual @ruvector/edge types
import type { WasmHnswIndex } from '@ruvector/edge';

/**
 * Pattern search options
 */
export interface PatternSearchOptions {
  k?: number;
  threshold?: number;
  domain?: string;
  type?: string;
  framework?: string;
}

/**
 * Pattern types for QE
 */
export type PatternType =
  | 'unit-test'
  | 'integration-test'
  | 'e2e-test'
  | 'mock'
  | 'fixture'
  | 'assertion'
  | 'setup'
  | 'teardown';

/**
 * Domain types for QE patterns
 */
export type PatternDomain =
  | 'react'
  | 'node'
  | 'express'
  | 'api'
  | 'database'
  | 'authentication'
  | 'general';

/**
 * Search result with pattern and score
 */
export interface PatternMatch {
  pattern: StoredPattern;
  score: number;
}

/**
 * Stored pattern in the vector database
 */
export interface StoredPattern {
  id: string;
  type: PatternType;
  domain: PatternDomain;
  content: string;
  embedding: number[];
  framework?: string;
  coverage?: number;
  flakinessScore?: number;
  verdict?: 'success' | 'failure' | 'flaky';
  createdAt: number;
  lastUsed: number;
  usageCount: number;
  metadata?: Record<string, unknown>;
}

/**
 * Stats for the edge agent service
 */
export interface EdgeAgentStats {
  count: number;
  dimension: number;
  metric: string;
  implementation: string;
  qps?: number;
  p50Latency?: number;
  p99Latency?: number;
}

/**
 * EdgeAgentService
 *
 * Wraps @ruvector/edge for VS Code extension use.
 * Provides vector search and pattern storage capabilities.
 */
export class EdgeAgentService {
  /**
   * HNSW index from @ruvector/edge
   */
  private index: WasmHnswIndex | null = null;

  /**
   * Pattern storage (in-memory for VS Code, could use workspace storage)
   */
  private patterns: Map<string, StoredPattern> = new Map();

  /**
   * Configuration
   */
  private config: EdgeAgentServiceConfig;

  /**
   * Initialization state
   */
  private initialized: boolean = false;

  /**
   * Performance metrics
   */
  private searchLatencies: number[] = [];
  private totalSearches: number = 0;

  /**
   * WASM module reference
   */
  private wasmModule: typeof import('@ruvector/edge') | null = null;

  constructor(config: EdgeAgentServiceConfig) {
    this.config = config;
  }

  /**
   * Whether using fallback mode (no WASM)
   */
  private fallbackMode: boolean = false;

  /**
   * Fallback in-memory index for when @ruvector/edge is not available
   */
  private fallbackPatterns: Array<{ id: string; embedding: number[] }> = [];

  /**
   * Initialize the service with @ruvector/edge WASM or fallback mode
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Dynamic import of @ruvector/edge
      this.wasmModule = await import('@ruvector/edge');

      // Initialize WASM module
      this.wasmModule.init();

      // Create HNSW index with configured parameters
      this.index = this.wasmModule.WasmHnswIndex.withParams(
        this.config.hnswM,
        this.config.hnswEfConstruction
      );

      this.initialized = true;
      this.fallbackMode = false;
      this.log('EdgeAgentService initialized with @ruvector/edge WASM');
    } catch {
      // Fallback to in-memory mode without WASM acceleration
      this.log('Warning: @ruvector/edge not available, using fallback mode');
      this.log('Install @ruvector/edge for WASM-accelerated vector search');
      this.initialized = true;
      this.fallbackMode = true;
      this.log('EdgeAgentService initialized in fallback mode (no WASM)');
    }
  }

  /**
   * Analyze a file and return embeddings for its code patterns
   */
  async analyzeFile(code: string, fileName: string): Promise<AnalysisResult> {
    this.ensureInitialized();

    const startTime = performance.now();

    // Extract functions and classes from code
    const patterns = this.extractPatterns(code, fileName);

    // Generate embeddings for each pattern
    const embeddings: PatternEmbedding[] = [];
    for (const pattern of patterns) {
      const embedding = this.generateEmbedding(pattern.content);
      embeddings.push({
        id: pattern.id,
        type: pattern.type,
        name: pattern.name,
        embedding,
        startLine: pattern.startLine,
        endLine: pattern.endLine,
      });
    }

    const duration = performance.now() - startTime;
    this.log(`Analyzed ${fileName}: ${patterns.length} patterns in ${duration.toFixed(2)}ms`);

    return {
      patterns: embeddings,
      duration,
    };
  }

  /**
   * Suggest tests based on code similarity
   */
  async suggestTests(
    code: string,
    fileName: string,
    options: PatternSearchOptions = {}
  ): Promise<PatternMatch[]> {
    this.ensureInitialized();

    const startTime = performance.now();

    // Generate embedding for the code
    const queryEmbedding = this.generateEmbedding(code);

    // Search for similar patterns
    const k = options.k ?? 10;
    const threshold = options.threshold ?? 0.5;

    // Convert to Float32Array for WASM
    const queryVector = new Float32Array(queryEmbedding);

    // Search HNSW index or use fallback
    let searchResults: Array<{ id: string; distance: number }> = [];

    if (this.fallbackMode) {
      // Fallback: brute-force cosine similarity search
      searchResults = this.fallbackPatterns
        .map((p) => ({
          id: p.id,
          distance: this.cosineDistance(queryEmbedding, p.embedding),
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, k * 2);
    } else {
      const searchResultsJson = this.index!.search(queryVector, k * 2);
      searchResults =
        typeof searchResultsJson === 'string'
          ? JSON.parse(searchResultsJson)
          : searchResultsJson;
    }

    // Map results to patterns
    const matches: PatternMatch[] = [];

    for (const result of searchResults) {
      // Convert distance to similarity score (cosine)
      const score = 1 - result.distance / 2;

      if (score < threshold) continue;

      const pattern = this.patterns.get(result.id);
      if (!pattern) continue;

      // Apply domain/type filters
      if (options.domain && pattern.domain !== options.domain) continue;
      if (options.type && pattern.type !== options.type) continue;
      if (options.framework && pattern.framework !== options.framework) continue;

      matches.push({ pattern, score });

      if (matches.length >= k) break;
    }

    // Record metrics
    const duration = performance.now() - startTime;
    this.recordSearchLatency(duration);

    this.log(`Suggested ${matches.length} tests in ${duration.toFixed(2)}ms`);

    return matches;
  }

  /**
   * Store a test pattern
   */
  async storePattern(pattern: Omit<StoredPattern, 'id' | 'createdAt' | 'lastUsed' | 'usageCount'>): Promise<string> {
    this.ensureInitialized();

    // Generate ID
    const id = this.generatePatternId(pattern.type, pattern.domain);

    // Create full pattern
    const fullPattern: StoredPattern = {
      ...pattern,
      id,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      usageCount: 0,
    };

    // Store in memory
    this.patterns.set(id, fullPattern);

    // Add to HNSW index or fallback storage
    if (this.fallbackMode) {
      this.fallbackPatterns.push({ id, embedding: pattern.embedding });
    } else {
      const vector = new Float32Array(pattern.embedding);
      this.index!.insert(id, vector);
    }

    this.log(`Stored pattern ${id}`);

    return id;
  }

  /**
   * Get a pattern by ID
   */
  async getPattern(id: string): Promise<StoredPattern | null> {
    return this.patterns.get(id) ?? null;
  }

  /**
   * Delete a pattern by ID
   */
  async deletePattern(id: string): Promise<boolean> {
    // Note: HNSW index doesn't support deletion
    // Pattern remains in index until rebuild
    return this.patterns.delete(id);
  }

  /**
   * Search patterns by content (text search)
   */
  async searchPatternsByContent(query: string): Promise<PatternMatch[]> {
    const embedding = this.generateEmbedding(query);
    return this.suggestTests(query, 'query', { k: 10 });
  }

  /**
   * Get all stored patterns
   */
  async getPatterns(): Promise<StoredPattern[]> {
    return Array.from(this.patterns.values());
  }

  /**
   * Clear all patterns
   */
  async clearPatterns(): Promise<void> {
    this.ensureInitialized();

    this.patterns.clear();

    if (this.fallbackMode) {
      this.fallbackPatterns = [];
    } else {
      // Recreate the index
      this.index?.free();
      this.index = this.wasmModule!.WasmHnswIndex.withParams(
        this.config.hnswM,
        this.config.hnswEfConstruction
      );
    }

    this.log('Cleared all patterns');
  }

  /**
   * Get service statistics
   */
  async getStats(): Promise<EdgeAgentStats> {
    const metrics = this.getSearchMetrics();
    const count = this.fallbackMode
      ? this.fallbackPatterns.length
      : (this.index?.len() ?? 0);

    return {
      count,
      dimension: this.config.vectorDimension,
      metric: 'cosine',
      implementation: this.fallbackMode ? 'fallback-brute-force' : 'ruvector-edge',
      qps: metrics.avgLatency > 0 ? 1000 / metrics.avgLatency : 0,
      p50Latency: metrics.p50Latency,
      p99Latency: metrics.p99Latency,
    };
  }

  /**
   * Shutdown and cleanup resources
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    // Free WASM resources
    if (this.index) {
      this.index.free();
      this.index = null;
    }

    this.patterns.clear();
    this.searchLatencies = [];
    this.initialized = false;

    this.log('EdgeAgentService shutdown');
  }

  /**
   * Get implementation info
   */
  getImplementationInfo(): {
    type: string;
    version: string;
    features: string[];
  } {
    if (this.fallbackMode) {
      return {
        type: 'fallback-brute-force',
        version: '0.1.0',
        features: [
          'brute-force-search',
          'vscode-extension',
          'fallback-mode',
        ],
      };
    }

    return {
      type: 'ruvector-edge',
      version: this.wasmModule?.version() ?? '0.1.0',
      features: [
        'hnsw',
        'vector-search',
        'wasm',
        'vscode-extension',
        '@ruvector/edge',
      ],
    };
  }

  /**
   * Generate a simple embedding for code
   * In production, this would use a proper embedding model
   */
  private generateEmbedding(code: string): number[] {
    // Simple hash-based embedding for demonstration
    // In production, use a proper embedding model like all-MiniLM-L6-v2
    const dimension = this.config.vectorDimension;
    const embedding = new Array(dimension).fill(0);

    // Tokenize code
    const tokens = code
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 0);

    // Generate embedding from token hashes
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const hash = this.simpleHash(token);

      // Distribute hash across embedding dimensions
      for (let j = 0; j < dimension; j++) {
        const contribution = Math.sin(hash * (j + 1)) / (i + 1);
        embedding[j] += contribution;
      }
    }

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < dimension; i++) {
        embedding[i] /= magnitude;
      }
    }

    return embedding;
  }

  /**
   * Compute cosine distance between two vectors (fallback mode)
   */
  private cosineDistance(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
    return 1 - similarity; // Convert to distance
  }

  /**
   * Simple hash function for tokens
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  /**
   * Extract code patterns from source code
   */
  private extractPatterns(code: string, fileName: string): ExtractedPattern[] {
    const patterns: ExtractedPattern[] = [];
    const lines = code.split('\n');

    // Simple pattern extraction using regex
    // In production, use proper AST parsing

    // Extract functions
    const functionRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)/g;
    let match;
    while ((match = functionRegex.exec(code)) !== null) {
      const startLine = code.substring(0, match.index).split('\n').length - 1;
      const functionBody = this.extractFunctionBody(code, match.index);

      patterns.push({
        id: `fn-${match[1]}-${startLine}`,
        type: 'function',
        name: match[1],
        content: functionBody,
        startLine,
        endLine: startLine + functionBody.split('\n').length - 1,
      });
    }

    // Extract arrow functions
    const arrowRegex = /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g;
    while ((match = arrowRegex.exec(code)) !== null) {
      const startLine = code.substring(0, match.index).split('\n').length - 1;
      const functionBody = this.extractArrowFunctionBody(code, match.index);

      patterns.push({
        id: `arrow-${match[1]}-${startLine}`,
        type: 'arrow-function',
        name: match[1],
        content: functionBody,
        startLine,
        endLine: startLine + functionBody.split('\n').length - 1,
      });
    }

    // Extract classes
    const classRegex = /(?:export\s+)?class\s+(\w+)/g;
    while ((match = classRegex.exec(code)) !== null) {
      const startLine = code.substring(0, match.index).split('\n').length - 1;
      const classBody = this.extractClassBody(code, match.index);

      patterns.push({
        id: `class-${match[1]}-${startLine}`,
        type: 'class',
        name: match[1],
        content: classBody,
        startLine,
        endLine: startLine + classBody.split('\n').length - 1,
      });
    }

    return patterns;
  }

  /**
   * Extract function body from code
   */
  private extractFunctionBody(code: string, startIndex: number): string {
    let braceCount = 0;
    let started = false;
    let endIndex = startIndex;

    for (let i = startIndex; i < code.length; i++) {
      const char = code[i];
      if (char === '{') {
        braceCount++;
        started = true;
      } else if (char === '}') {
        braceCount--;
        if (started && braceCount === 0) {
          endIndex = i + 1;
          break;
        }
      }
    }

    return code.substring(startIndex, endIndex);
  }

  /**
   * Extract arrow function body from code
   */
  private extractArrowFunctionBody(code: string, startIndex: number): string {
    // Find the arrow
    const arrowIndex = code.indexOf('=>', startIndex);
    if (arrowIndex === -1) return '';

    // Check if it's a block body or expression
    let bodyStart = arrowIndex + 2;
    while (bodyStart < code.length && /\s/.test(code[bodyStart])) {
      bodyStart++;
    }

    if (code[bodyStart] === '{') {
      // Block body
      return this.extractFunctionBody(code, startIndex);
    } else {
      // Expression body - find the end (semicolon or newline)
      let endIndex = bodyStart;
      let parenCount = 0;
      for (let i = bodyStart; i < code.length; i++) {
        const char = code[i];
        if (char === '(' || char === '[') parenCount++;
        else if (char === ')' || char === ']') parenCount--;
        else if (parenCount === 0 && (char === ';' || char === '\n')) {
          endIndex = i;
          break;
        }
      }
      return code.substring(startIndex, endIndex);
    }
  }

  /**
   * Extract class body from code
   */
  private extractClassBody(code: string, startIndex: number): string {
    return this.extractFunctionBody(code, startIndex);
  }

  /**
   * Generate a unique pattern ID
   */
  private generatePatternId(type: PatternType, domain: PatternDomain): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 7);
    return `${type}-${domain}-${timestamp}-${random}`;
  }

  /**
   * Record search latency for metrics
   */
  private recordSearchLatency(latency: number): void {
    this.searchLatencies.push(latency);
    this.totalSearches++;

    // Keep only last 1000 measurements
    if (this.searchLatencies.length > 1000) {
      this.searchLatencies.shift();
    }
  }

  /**
   * Get search performance metrics
   */
  private getSearchMetrics(): SearchMetrics {
    if (this.searchLatencies.length === 0) {
      return {
        totalSearches: this.totalSearches,
        avgLatency: 0,
        p50Latency: 0,
        p99Latency: 0,
      };
    }

    const sorted = [...this.searchLatencies].sort((a, b) => a - b);
    const p50Index = Math.floor(sorted.length * 0.5);
    const p99Index = Math.floor(sorted.length * 0.99);

    const avgLatency =
      this.searchLatencies.reduce((a, b) => a + b, 0) / this.searchLatencies.length;

    return {
      totalSearches: this.totalSearches,
      avgLatency,
      p50Latency: sorted[p50Index] || 0,
      p99Latency: sorted[p99Index] || 0,
    };
  }

  /**
   * Ensure service is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('EdgeAgentService not initialized. Call initialize() first.');
    }
  }

  /**
   * Log message (debug mode only)
   */
  private log(message: string): void {
    if (this.config.debugMode) {
      console.log(`[EdgeAgentService] ${message}`);
    }
  }
}

/**
 * Analysis result
 */
export interface AnalysisResult {
  patterns: PatternEmbedding[];
  duration: number;
}

/**
 * Pattern embedding
 */
export interface PatternEmbedding {
  id: string;
  type: string;
  name: string;
  embedding: number[];
  startLine: number;
  endLine: number;
}

/**
 * Extracted pattern from code
 */
interface ExtractedPattern {
  id: string;
  type: string;
  name: string;
  content: string;
  startLine: number;
  endLine: number;
}

/**
 * Search metrics
 */
interface SearchMetrics {
  totalSearches: number;
  avgLatency: number;
  p50Latency: number;
  p99Latency: number;
}
