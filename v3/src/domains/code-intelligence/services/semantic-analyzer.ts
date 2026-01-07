/**
 * Agentic QE v3 - Semantic Analyzer Service
 * Semantic code analysis using vector embeddings and HNSW search
 */

import { Result, ok, err } from '../../../shared/types';
import { MemoryBackend } from '../../../kernel/interfaces';
import {
  SearchRequest,
  SearchResults,
  SearchResult,
  SearchFilter,
} from '../interfaces';

/**
 * Interface for the semantic analyzer service
 */
export interface ISemanticAnalyzerService {
  /** Perform semantic search across codebase */
  search(request: SearchRequest): Promise<Result<SearchResults, Error>>;

  /** Index code for semantic search */
  indexCode(file: string, content: string): Promise<Result<void, Error>>;

  /** Find semantically similar code */
  findSimilar(code: string, limit?: number): Promise<Result<SearchResult[], Error>>;

  /** Analyze code semantics */
  analyze(code: string): Promise<Result<SemanticAnalysis, Error>>;

  /** Get code embeddings */
  getEmbedding(code: string): Promise<number[]>;
}

/**
 * Semantic analysis result
 */
export interface SemanticAnalysis {
  concepts: string[];
  patterns: string[];
  complexity: CodeComplexity;
  dependencies: string[];
  suggestions: string[];
}

/**
 * Code complexity metrics
 */
export interface CodeComplexity {
  cyclomatic: number;
  cognitive: number;
  halstead: HalsteadMetrics;
}

/**
 * Halstead complexity metrics
 */
export interface HalsteadMetrics {
  vocabulary: number;
  length: number;
  difficulty: number;
  effort: number;
  time: number;
  bugs: number;
}

/**
 * Configuration for the semantic analyzer
 */
export interface SemanticAnalyzerConfig {
  embeddingDimension: number;
  minScore: number;
  maxResults: number;
  namespace: string;
  enableCaching: boolean;
  cacheSize: number;
}

const DEFAULT_CONFIG: SemanticAnalyzerConfig = {
  embeddingDimension: 384,
  minScore: 0.5,
  maxResults: 100,
  namespace: 'code-intelligence:semantic',
  enableCaching: true,
  cacheSize: 1000,
};

/**
 * Semantic Analyzer Service Implementation
 * Provides O(log n) semantic search using HNSW vector index
 */
export class SemanticAnalyzerService implements ISemanticAnalyzerService {
  private readonly config: SemanticAnalyzerConfig;
  private readonly embeddingCache: Map<string, number[]> = new Map();
  private readonly analysisCache: Map<string, SemanticAnalysis> = new Map();

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<SemanticAnalyzerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Perform semantic search across indexed code
   */
  async search(request: SearchRequest): Promise<Result<SearchResults, Error>> {
    const startTime = Date.now();

    try {
      const { query, type, scope, limit = this.config.maxResults, filters } = request;

      let results: SearchResult[];

      switch (type) {
        case 'semantic':
          results = await this.semanticSearch(query, limit, scope, filters);
          break;
        case 'exact':
          results = await this.exactSearch(query, limit, scope, filters);
          break;
        case 'fuzzy':
          results = await this.fuzzySearch(query, limit, scope, filters);
          break;
        default:
          return err(new Error(`Unknown search type: ${type}`));
      }

      const searchTime = Date.now() - startTime;

      return ok({
        results,
        total: results.length,
        searchTime,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Index code content for semantic search
   */
  async indexCode(file: string, content: string): Promise<Result<void, Error>> {
    try {
      // Generate embedding for the code
      const embedding = await this.getEmbedding(content);

      // Extract code metadata
      const metadata = this.extractCodeMetadata(file, content);

      // Store in vector index
      const key = `${this.config.namespace}:code:${this.fileToKey(file)}`;
      await this.memory.storeVector(key, embedding, {
        file,
        ...metadata,
        indexedAt: new Date().toISOString(),
      });

      // Store content for retrieval
      await this.memory.set(
        `${this.config.namespace}:content:${this.fileToKey(file)}`,
        { file, content, metadata },
        { namespace: this.config.namespace }
      );

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Find semantically similar code
   */
  async findSimilar(
    code: string,
    limit: number = 10
  ): Promise<Result<SearchResult[], Error>> {
    try {
      const embedding = await this.getEmbedding(code);
      const vectorResults = await this.memory.vectorSearch(embedding, limit);

      const results: SearchResult[] = [];
      for (const vr of vectorResults) {
        if (vr.score < this.config.minScore) continue;

        const metadata = vr.metadata as { file: string } | undefined;
        if (!metadata?.file) continue;

        const contentKey = `${this.config.namespace}:content:${this.fileToKey(metadata.file)}`;
        const stored = await this.memory.get<{
          file: string;
          content: string;
          metadata: Record<string, unknown>;
        }>(contentKey);

        if (stored) {
          results.push({
            file: stored.file,
            snippet: this.extractSnippet(stored.content, 200),
            score: vr.score,
            highlights: this.findHighlights(stored.content, code),
            metadata: stored.metadata,
          });
        }
      }

      return ok(results);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Analyze code semantics
   */
  async analyze(code: string): Promise<Result<SemanticAnalysis, Error>> {
    try {
      // Check cache
      const cacheKey = this.hashCode(code);
      if (this.config.enableCaching && this.analysisCache.has(cacheKey)) {
        return ok(this.analysisCache.get(cacheKey)!);
      }

      // Extract concepts
      const concepts = this.extractConcepts(code);

      // Detect patterns
      const patterns = this.detectPatterns(code);

      // Calculate complexity
      const complexity = this.calculateComplexity(code);

      // Extract dependencies
      const dependencies = this.extractDependencies(code);

      // Generate suggestions
      const suggestions = this.generateSuggestions(code, complexity, patterns);

      const analysis: SemanticAnalysis = {
        concepts,
        patterns,
        complexity,
        dependencies,
        suggestions,
      };

      // Cache result
      if (this.config.enableCaching) {
        this.cacheAnalysis(cacheKey, analysis);
      }

      return ok(analysis);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get embedding vector for code
   */
  async getEmbedding(code: string): Promise<number[]> {
    // Check cache
    const cacheKey = this.hashCode(code);
    if (this.config.enableCaching && this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }

    // Generate embedding
    // Stub: In production, use a proper embedding model (CodeBERT, etc.)
    const embedding = this.generateCodeEmbedding(code);

    // Cache result
    if (this.config.enableCaching) {
      this.cacheEmbedding(cacheKey, embedding);
    }

    return embedding;
  }

  // ============================================================================
  // Private Search Methods
  // ============================================================================

  private async semanticSearch(
    query: string,
    limit: number,
    scope?: string[],
    filters?: SearchFilter[]
  ): Promise<SearchResult[]> {
    // Generate query embedding
    const queryEmbedding = await this.getEmbedding(query);

    // Perform vector search
    const vectorResults = await this.memory.vectorSearch(queryEmbedding, limit * 2);

    // Convert to search results with filtering
    const results: SearchResult[] = [];
    for (const vr of vectorResults) {
      if (vr.score < this.config.minScore) continue;

      const metadata = vr.metadata as { file: string } | undefined;
      if (!metadata?.file) continue;

      // Apply scope filter
      if (scope && scope.length > 0) {
        const matchesScope = scope.some((s) => metadata.file.includes(s));
        if (!matchesScope) continue;
      }

      // Fetch content
      const contentKey = `${this.config.namespace}:content:${this.fileToKey(metadata.file)}`;
      const stored = await this.memory.get<{
        file: string;
        content: string;
        metadata: Record<string, unknown>;
      }>(contentKey);

      if (stored) {
        // Apply filters
        if (filters && !this.matchesFilters(stored.metadata, filters)) {
          continue;
        }

        results.push({
          file: stored.file,
          snippet: this.extractSnippet(stored.content, 200),
          score: vr.score,
          highlights: this.findSemanticHighlights(stored.content, query),
          metadata: stored.metadata,
        });

        if (results.length >= limit) break;
      }
    }

    return results;
  }

  private async exactSearch(
    query: string,
    limit: number,
    scope?: string[],
    filters?: SearchFilter[]
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const pattern = `${this.config.namespace}:content:*`;
    const keys = await this.memory.search(pattern, limit * 3);

    for (const key of keys) {
      const stored = await this.memory.get<{
        file: string;
        content: string;
        metadata: Record<string, unknown>;
      }>(key);

      if (!stored) continue;

      // Apply scope filter
      if (scope && scope.length > 0) {
        const matchesScope = scope.some((s) => stored.file.includes(s));
        if (!matchesScope) continue;
      }

      // Apply filters
      if (filters && !this.matchesFilters(stored.metadata, filters)) {
        continue;
      }

      // Exact match
      const index = stored.content.indexOf(query);
      if (index >= 0) {
        const lineNumber = this.getLineNumber(stored.content, index);
        results.push({
          file: stored.file,
          line: lineNumber,
          snippet: this.extractSnippetAround(stored.content, index, 100),
          score: 1.0,
          highlights: [query],
          metadata: stored.metadata,
        });

        if (results.length >= limit) break;
      }
    }

    return results;
  }

  private async fuzzySearch(
    query: string,
    limit: number,
    scope?: string[],
    filters?: SearchFilter[]
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const pattern = `${this.config.namespace}:content:*`;
    const keys = await this.memory.search(pattern, limit * 5);

    const queryTokens = this.tokenize(query.toLowerCase());

    for (const key of keys) {
      const stored = await this.memory.get<{
        file: string;
        content: string;
        metadata: Record<string, unknown>;
      }>(key);

      if (!stored) continue;

      // Apply scope filter
      if (scope && scope.length > 0) {
        const matchesScope = scope.some((s) => stored.file.includes(s));
        if (!matchesScope) continue;
      }

      // Apply filters
      if (filters && !this.matchesFilters(stored.metadata, filters)) {
        continue;
      }

      // Fuzzy match using token overlap
      const contentTokens = this.tokenize(stored.content.toLowerCase());
      const score = this.calculateFuzzyScore(queryTokens, contentTokens);

      if (score >= this.config.minScore) {
        const matchedTokens = queryTokens.filter((t) =>
          contentTokens.some((ct) => ct.includes(t) || t.includes(ct))
        );

        results.push({
          file: stored.file,
          snippet: this.extractSnippet(stored.content, 200),
          score,
          highlights: matchedTokens,
          metadata: stored.metadata,
        });
      }
    }

    // Sort by score and limit
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  // ============================================================================
  // Private Analysis Methods
  // ============================================================================

  private extractConcepts(code: string): string[] {
    const concepts: string[] = [];

    // Detect programming concepts
    if (/class\s+\w+/.test(code)) concepts.push('object-oriented');
    if (/async\s+|await\s+|Promise/.test(code)) concepts.push('asynchronous');
    if (/\([^)]*\)\s*=>/.test(code)) concepts.push('functional');
    if (/interface\s+\w+/.test(code)) concepts.push('type-safe');
    if (/export\s+(default\s+)?/.test(code)) concepts.push('modular');
    if (/import\s+.*from/.test(code)) concepts.push('dependency-injection');
    if (/try\s*{[\s\S]*catch/.test(code)) concepts.push('error-handling');
    if (/\.map\(|\.filter\(|\.reduce\(/.test(code)) concepts.push('collection-processing');
    if (/new\s+Map\(|new\s+Set\(/.test(code)) concepts.push('data-structures');
    if (/describe\(|it\(|test\(|expect\(/.test(code)) concepts.push('testing');

    return Array.from(new Set(concepts));
  }

  private detectPatterns(code: string): string[] {
    const patterns: string[] = [];

    // Detect design patterns
    if (/private\s+static\s+instance|getInstance\(\)/.test(code)) {
      patterns.push('singleton');
    }
    if (/factory|create\w+\(\)/.test(code)) {
      patterns.push('factory');
    }
    if (/constructor\(.*private.*\)/.test(code)) {
      patterns.push('dependency-injection');
    }
    if (/extends\s+\w+.*implements\s+\w+/.test(code)) {
      patterns.push('decorator');
    }
    if (/subscribe\(|on\w+\(|emit\(|publish\(/.test(code)) {
      patterns.push('observer');
    }
    if (/strategy|Strategy/.test(code)) {
      patterns.push('strategy');
    }
    if (/Repository|DAO/.test(code)) {
      patterns.push('repository');
    }
    if (/Builder|\.with\w+\(/.test(code)) {
      patterns.push('builder');
    }

    return patterns;
  }

  private calculateComplexity(code: string): CodeComplexity {
    // Cyclomatic complexity
    const cyclomaticIndicators = [
      /\bif\b/g,
      /\belse\b/g,
      /\bfor\b/g,
      /\bwhile\b/g,
      /\bcase\b/g,
      /\bcatch\b/g,
      /\?\s*:/g, // ternary
      /&&/g,
      /\|\|/g,
    ];

    let cyclomatic = 1;
    for (const pattern of cyclomaticIndicators) {
      const matches = code.match(pattern);
      cyclomatic += matches ? matches.length : 0;
    }

    // Cognitive complexity (simplified)
    let cognitive = 0;
    const lines = code.split('\n');
    let nestingLevel = 0;

    for (const line of lines) {
      if (/{/.test(line)) nestingLevel++;
      if (/}/.test(line)) nestingLevel = Math.max(0, nestingLevel - 1);

      if (/\bif\b|\bfor\b|\bwhile\b/.test(line)) {
        cognitive += 1 + nestingLevel;
      }
    }

    // Halstead metrics (simplified)
    const operators = code.match(
      /[+\-*/%=<>!&|^~?:;,.()\[\]{}]+|function|return|if|else|for|while|switch|case|break|continue|throw|try|catch|finally|new|delete|typeof|instanceof|void|in|of/g
    ) || [];
    const operands =
      code.match(
        /\b[a-zA-Z_]\w*\b|\b\d+\b|'[^']*'|"[^"]*"|`[^`]*`/g
      ) || [];

    const n1 = new Set(operators).size;
    const n2 = new Set(operands).size;
    const N1 = operators.length;
    const N2 = operands.length;

    const vocabulary = n1 + n2;
    const length = N1 + N2;
    const difficulty = n2 > 0 ? (n1 / 2) * (N2 / n2) : 0;
    const volume = length > 0 ? length * Math.log2(vocabulary || 1) : 0;
    const effort = difficulty * volume;
    const time = effort / 18;
    const bugs = volume / 3000;

    return {
      cyclomatic,
      cognitive,
      halstead: {
        vocabulary,
        length,
        difficulty: Math.round(difficulty * 100) / 100,
        effort: Math.round(effort),
        time: Math.round(time),
        bugs: Math.round(bugs * 1000) / 1000,
      },
    };
  }

  private extractDependencies(code: string): string[] {
    const dependencies: string[] = [];

    // Import statements
    const importRegex = /import\s+(?:\{[^}]+\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g;
    let importMatch: RegExpExecArray | null;
    while ((importMatch = importRegex.exec(code)) !== null) {
      dependencies.push(importMatch[1]);
    }

    // Require statements
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    let requireMatch: RegExpExecArray | null;
    while ((requireMatch = requireRegex.exec(code)) !== null) {
      dependencies.push(requireMatch[1]);
    }

    return Array.from(new Set(dependencies));
  }

  private generateSuggestions(
    code: string,
    complexity: CodeComplexity,
    patterns: string[]
  ): string[] {
    const suggestions: string[] = [];

    // Complexity-based suggestions
    if (complexity.cyclomatic > 10) {
      suggestions.push('Consider breaking down complex functions into smaller units');
    }
    if (complexity.cognitive > 15) {
      suggestions.push('Reduce nesting depth to improve readability');
    }
    if (complexity.halstead.bugs > 0.5) {
      suggestions.push('High estimated bug density - add comprehensive tests');
    }

    // Pattern-based suggestions
    if (!patterns.includes('error-handling') && /async|Promise/.test(code)) {
      suggestions.push('Add error handling for async operations');
    }
    if (!patterns.includes('testing') && code.length > 500) {
      suggestions.push('Consider adding unit tests for this code');
    }

    // Code quality suggestions
    if (code.split('\n').length > 200) {
      suggestions.push('Consider splitting this file into smaller modules');
    }
    const longLines = code.split('\n').filter((l) => l.length > 120);
    if (longLines.length > 5) {
      suggestions.push('Some lines exceed 120 characters - consider reformatting');
    }

    return suggestions;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private generateCodeEmbedding(code: string): number[] {
    // Stub: Generate a pseudo-embedding based on code features
    // In production, use a proper code embedding model

    const embedding = new Array(this.config.embeddingDimension).fill(0);

    // Extract tokens and features
    const tokens = this.tokenize(code);
    const concepts = this.extractConcepts(code);

    // Combine token-based and concept-based features
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      for (let j = 0; j < token.length && j < embedding.length; j++) {
        embedding[(i + j) % embedding.length] += token.charCodeAt(j) / 1000;
      }
    }

    // Add concept signals
    const conceptIndex = new Map([
      ['object-oriented', 0],
      ['asynchronous', 1],
      ['functional', 2],
      ['type-safe', 3],
      ['modular', 4],
    ]);

    for (const concept of concepts) {
      const idx = conceptIndex.get(concept);
      if (idx !== undefined) {
        embedding[idx] += 0.5;
      }
    }

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0)) || 1;
    return embedding.map((v) => v / magnitude);
  }

  private extractCodeMetadata(
    file: string,
    content: string
  ): Record<string, unknown> {
    return {
      language: this.detectLanguage(file),
      lines: content.split('\n').length,
      size: content.length,
      hasClasses: /class\s+\w+/.test(content),
      hasFunctions: /function\s+\w+/.test(content),
      hasTests: /describe\(|it\(|test\(/.test(content),
    };
  }

  private detectLanguage(file: string): string {
    const ext = file.split('.').pop()?.toLowerCase() || '';
    const langMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      go: 'go',
      java: 'java',
      rs: 'rust',
    };
    return langMap[ext] || 'unknown';
  }

  private tokenize(text: string): string[] {
    return text.split(/\s+|[^\w]+/).filter((t) => t.length > 0);
  }

  private calculateFuzzyScore(queryTokens: string[], contentTokens: string[]): number {
    if (queryTokens.length === 0) return 0;

    let matches = 0;
    for (const qt of queryTokens) {
      if (contentTokens.some((ct) => ct.includes(qt) || qt.includes(ct))) {
        matches++;
      }
    }

    return matches / queryTokens.length;
  }

  private matchesFilters(
    metadata: Record<string, unknown>,
    filters: SearchFilter[]
  ): boolean {
    for (const filter of filters) {
      const value = metadata[filter.field];

      switch (filter.operator) {
        case 'eq':
          if (value !== filter.value) return false;
          break;
        case 'contains':
          if (typeof value !== 'string' || !value.includes(String(filter.value))) {
            return false;
          }
          break;
        case 'gt':
          if (typeof value !== 'number' || value <= (filter.value as number)) {
            return false;
          }
          break;
        case 'lt':
          if (typeof value !== 'number' || value >= (filter.value as number)) {
            return false;
          }
          break;
      }
    }

    return true;
  }

  private extractSnippet(content: string, maxLength: number): string {
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength) + '...';
  }

  private extractSnippetAround(
    content: string,
    index: number,
    contextLength: number
  ): string {
    const start = Math.max(0, index - contextLength);
    const end = Math.min(content.length, index + contextLength);
    let snippet = content.slice(start, end);

    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';

    return snippet;
  }

  private getLineNumber(content: string, index: number): number {
    return content.slice(0, index).split('\n').length;
  }

  private findHighlights(content: string, query: string): string[] {
    const highlights: string[] = [];
    const queryTokens = this.tokenize(query.toLowerCase());
    const contentTokens = this.tokenize(content.toLowerCase());

    for (const qt of queryTokens) {
      const match = contentTokens.find((ct) => ct.includes(qt) || qt.includes(ct));
      if (match && !highlights.includes(match)) {
        highlights.push(match);
      }
    }

    return highlights;
  }

  private findSemanticHighlights(content: string, query: string): string[] {
    // For semantic search, highlight key concepts
    const concepts = this.extractConcepts(content);
    const queryLower = query.toLowerCase();

    return concepts.filter((c) => queryLower.includes(c) || c.includes(queryLower));
  }

  private fileToKey(file: string): string {
    return file.replace(/[/\\]/g, ':').replace(/\./g, '_');
  }

  private hashCode(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  private cacheEmbedding(key: string, embedding: number[]): void {
    if (this.embeddingCache.size >= this.config.cacheSize) {
      // Remove oldest entry
      const firstKey = this.embeddingCache.keys().next().value;
      if (firstKey) {
        this.embeddingCache.delete(firstKey);
      }
    }
    this.embeddingCache.set(key, embedding);
  }

  private cacheAnalysis(key: string, analysis: SemanticAnalysis): void {
    if (this.analysisCache.size >= this.config.cacheSize) {
      // Remove oldest entry
      const firstKey = this.analysisCache.keys().next().value;
      if (firstKey) {
        this.analysisCache.delete(firstKey);
      }
    }
    this.analysisCache.set(key, analysis);
  }
}
