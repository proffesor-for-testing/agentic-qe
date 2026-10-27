/**
 * Agentic QE v3 - Semantic Analyzer Service
 * Semantic code analysis using vector embeddings and HNSW search
 */

import { createHash } from 'node:crypto';
import { Result, ok, err } from '../../../shared/types';
import { MemoryBackend } from '../../../kernel/interfaces';
import {
  NomicEmbedder,
  NomicEmbedderConfig,
  EMBEDDING_CONFIG,
  IEmbeddingProvider,
} from '../../../shared/embeddings';
import { toError } from '../../../shared/error-utils.js';
import {
  SearchRequest,
  SearchResults,
  SearchResult,
  SearchFilter,
} from '../interfaces';

/**
 * #1224: the message for a search over an empty index. "No results" is only
 * reported after searching an index that holds code.
 */
export const NOTHING_INDEXED_FOR_SEARCH =
  'No code is indexed for search yet, so the search was not run. ' +
  'Index the project first (MCP code_index, or `aqe code index <path>`), then search again.';

/** Vector metadata recording which embedding model produced the vector. */
interface StoredVectorMetadata {
  file?: string;
  embeddingModel?: string;
}

/**
 * Indexed file content. #1231: `embeddingModel` is set when a vector from that
 * model was stored with it, so a search can tell which files have none.
 */
interface StoredContent {
  file: string;
  content: string;
  metadata: Record<string, unknown>;
  embeddingModel?: string;
}

export interface IndexCodeOptions {
  /** false: store the text only, without asking the embedding model (#1230: it kept failing this run). */
  embed?: boolean;
}

/** What indexCode stored for a file. */
export interface IndexedCode {
  /** A vector from the current embedding model was stored. */
  vector: boolean;
  /** Set when an embedding model is configured but failed for this file. */
  vectorFailure?: string;
}

/**
 * Interface for the semantic analyzer service
 */
export interface ISemanticAnalyzerService {
  /** Perform semantic search across codebase */
  search(request: SearchRequest): Promise<Result<SearchResults, Error>>;

  /** Index code for semantic search */
  indexCode(file: string, content: string, options?: IndexCodeOptions): Promise<Result<IndexedCode, Error>>;

  /** Find semantically similar code */
  findSimilar(code: string, limit?: number): Promise<Result<SearchResult[], Error>>;

  /** Analyze code semantics */
  analyze(code: string): Promise<Result<SemanticAnalysis, Error>>;

  /**
   * Get code embeddings. Throws when no embedding model is available: no
   * pseudo-embedding is substituted (ADR-097).
   */
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
  /** Embedding vector dimension (384 for all-MiniLM-L6-v2) */
  embeddingDimension: number;
  /** Minimum word-overlap score for fuzzy and text-only matches */
  minScore: number;
  /**
   * #1224: minimum cosine similarity for vector hits. Sentence-embedding
   * models score a relevant file well below 0.5 (all-MiniLM-L6-v2 gave 0.37
   * for "login" against a login function), so the text threshold would hide
   * every vector hit.
   */
  minVectorScore: number;
  /** Maximum search results */
  maxResults: number;
  /** Storage namespace */
  namespace: string;
  /** Enable embedding caching */
  enableCaching: boolean;
  /** Cache size limit */
  cacheSize: number;
  /** Use Nomic embeddings via Ollama when available */
  useNomicEmbeddings: boolean;
  /** Nomic embedder configuration */
  nomicConfig?: NomicEmbedderConfig;
  /** Custom embedding provider (for testing/DI) */
  embeddingProvider?: IEmbeddingProvider;
}

/** Upper bound on indexed files one exact/fuzzy search reads. */
const MAX_INDEXED_FILES_SCANNED = 100_000;

const DEFAULT_CONFIG: SemanticAnalyzerConfig = {
  embeddingDimension: EMBEDDING_CONFIG.DIMENSIONS, // 384 for all-MiniLM-L6-v2
  minScore: 0.5,
  minVectorScore: 0.3,
  maxResults: 100,
  namespace: 'code-intelligence:semantic',
  enableCaching: true,
  cacheSize: 1000,
  useNomicEmbeddings: true,
};

/**
 * Semantic Analyzer Service Implementation
 * Provides O(log n) semantic search using HNSW vector index
 */
export class SemanticAnalyzerService implements ISemanticAnalyzerService {
  private readonly config: SemanticAnalyzerConfig;
  private readonly embeddingCache: Map<string, number[]> = new Map();
  private readonly analysisCache: Map<string, SemanticAnalysis> = new Map();
  private embedder: IEmbeddingProvider | null = null;
  private embedderInitialized = false;
  /** #1224: why no embedder is in use, once initialization has run. */
  private embedderUnavailableReason: string | null = null;

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<SemanticAnalyzerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Use custom embedding provider if provided
    if (config.embeddingProvider) {
      this.embedder = config.embeddingProvider;
      this.embedderInitialized = true;
    }
  }

  /**
   * Initialize the Nomic embedder lazily
   */
  private async initializeEmbedder(): Promise<void> {
    if (this.embedderInitialized) {
      return;
    }

    if (this.config.useNomicEmbeddings) {
      // #1224: no pseudo-embedding fallback. A failed embed throws, and the
      // search reports itself as lexical-only instead.
      const nomicEmbedder = new NomicEmbedder({
        ...this.config.nomicConfig,
        enableFallback: false,
      });

      // Check if Ollama is available
      const isAvailable = await nomicEmbedder.healthCheck();
      if (isAvailable) {
        this.embedder = nomicEmbedder;
        // Update dimension to match Nomic's output
        (this.config as { embeddingDimension: number }).embeddingDimension =
          EMBEDDING_CONFIG.DIMENSIONS;
      } else {
        this.embedderUnavailableReason =
          `no embedding model available (Ollama model '${EMBEDDING_CONFIG.MODEL}' is not reachable)`;
      }
    } else {
      this.embedderUnavailableReason = 'embeddings are disabled for code search';
    }

    this.embedderInitialized = true;
  }

  /**
   * Perform semantic search across indexed code
   */
  async search(request: SearchRequest): Promise<Result<SearchResults, Error>> {
    const startTime = Date.now();

    try {
      const { query, type, scope, limit = this.config.maxResults, filters } = request;

      if (type !== 'semantic' && type !== 'exact' && type !== 'fuzzy') {
        return err(new Error(`Unknown search type: ${type}`));
      }

      // #1224: an empty answer from an empty index is not "no results".
      const indexed = await this.memory.search(this.contentKeyPattern(), 1);
      if (indexed.length === 0) {
        return err(new Error(NOTHING_INDEXED_FOR_SEARCH));
      }

      let results: SearchResult[];
      let semanticOutcome: Pick<SearchResults, 'mode' | 'reason' | 'coverage'> = {};

      switch (type) {
        case 'semantic': {
          const { results: hits, ...outcome } = await this.semanticSearch(query, limit, scope, filters);
          results = hits;
          semanticOutcome = outcome;
          break;
        }
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
        ...semanticOutcome,
      });
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Index code content for semantic search
   */
  async indexCode(
    file: string,
    content: string,
    options: IndexCodeOptions = {}
  ): Promise<Result<IndexedCode, Error>> {
    try {
      // Extract code metadata
      const metadata = this.extractCodeMetadata(file, content);

      // #1224: store a vector only when a real embedding model produced one;
      // without it the file is still searchable by text.
      const embedded: { vector?: number[]; reason?: string } =
        options.embed === false ? {} : await this.tryEmbed(content);
      if (embedded.vector) {
        const key = `${this.vectorKeyPrefix()}${this.fileToKey(file)}`;
        await this.memory.storeVector(key, embedded.vector, {
          file,
          ...metadata,
          embeddingModel: this.embeddingModelId(),
          indexedAt: new Date().toISOString(),
        });
      }

      // Store content for retrieval.
      // The key is already fully namespace-qualified, so do NOT also pass a
      // {namespace} store option: every read path (semanticSearch/findSimilar/
      // exact/fuzzy) and the storeVector() embedding write use the default
      // namespace, and a write with {namespace} could not be read back without
      // the same option (issue #491 Bug 2) — which silently dropped every
      // search result (#511 follow-up).
      const stored: StoredContent = embedded.vector
        ? { file, content, metadata, embeddingModel: this.embeddingModelId() }
        : { file, content, metadata };
      await this.memory.set(`${this.config.namespace}:content:${this.fileToKey(file)}`, stored);

      return ok(
        embedded.vector
          ? { vector: true }
          : this.embedder && embedded.reason
            ? { vector: false, vectorFailure: embedded.reason }
            : { vector: false }
      );
    } catch (error) {
      return err(toError(error));
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
      const vectorResults = await this.memory.vectorSearch(embedding, limit, this.vectorKeyPrefix());

      const results: SearchResult[] = [];
      for (const vr of vectorResults) {
        if (vr.score < this.config.minVectorScore) continue;

        const metadata = vr.metadata as StoredVectorMetadata | undefined;
        if (!metadata?.file || !this.isCurrentModelVector(metadata)) continue;

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
      return err(toError(error));
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
      return err(toError(error));
    }
  }

  /**
   * Get embedding vector for code.
   * Uses Nomic embeddings via Ollama (or the injected provider). Throws when
   * neither is available: no pseudo-embedding is substituted (#1224, ADR-097).
   */
  async getEmbedding(code: string): Promise<number[]> {
    // Check cache
    const cacheKey = this.hashCode(code);
    if (this.config.enableCaching && this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }

    // Initialize embedder lazily
    await this.initializeEmbedder();

    if (!this.embedder) {
      throw new Error(`Code embeddings unavailable: ${this.embedderUnavailableReason ?? 'no embedding model'}`);
    }
    const embedding = await this.embedder.embed(code);

    // Cache result
    if (this.config.enableCaching) {
      this.cacheEmbedding(cacheKey, embedding);
    }

    return embedding;
  }

  /**
   * Check if using real Nomic embeddings
   */
  isUsingNomicEmbeddings(): boolean {
    return this.embedder !== null && this.embedder instanceof NomicEmbedder;
  }

  /** #1224: embed `text`, or say why no real embedding is available. */
  private async tryEmbed(text: string): Promise<{ vector?: number[]; reason?: string }> {
    await this.initializeEmbedder();
    if (!this.embedder) {
      return { reason: this.embedderUnavailableReason ?? 'no embedding model available' };
    }
    try {
      return { vector: await this.getEmbedding(text) };
    } catch (error) {
      return { reason: `the embedding model failed: ${toError(error).message}` };
    }
  }

  /** Identifies the model behind stored vectors, so vectors from another model are not compared. */
  private embeddingModelId(): string {
    return this.embedder instanceof NomicEmbedder ? EMBEDDING_CONFIG.MODEL : 'injected-provider';
  }

  private isCurrentModelVector(metadata: StoredVectorMetadata): boolean {
    return metadata.embeddingModel === this.embeddingModelId();
  }

  private vectorKeyPrefix(): string {
    return `${this.config.namespace}:code:`;
  }

  private contentKeyPattern(): string {
    return `${this.config.namespace}:content:*`;
  }

  /** Visits every indexed file's stored content, one at a time. */
  private async forEachIndexed(visit: (stored: StoredContent) => void): Promise<void> {
    const keys = await this.memory.search(this.contentKeyPattern(), MAX_INDEXED_FILES_SCANNED);
    for (const key of keys) {
      const stored = await this.memory.get<StoredContent>(key);
      if (stored) visit(stored);
    }
  }

  // ============================================================================
  // Private Search Methods
  // ============================================================================

  /**
   * #1224: vector search when an embedding model is available. Otherwise (or
   * when no indexed file has a vector from that model) it matches query words
   * against the indexed text and reports `mode: 'lexical-only'` with the
   * reason; no similarity is invented for those hits.
   */
  private async semanticSearch(
    query: string,
    limit: number,
    scope?: string[],
    filters?: SearchFilter[]
  ): Promise<{ results: SearchResult[] } & Pick<SearchResults, 'mode' | 'reason' | 'coverage'>> {
    const embedded = await this.tryEmbed(query);
    if (!embedded.vector) {
      return {
        results: await this.lexicalSearch(query, limit, scope, filters),
        mode: 'lexical-only',
        reason: embedded.reason,
      };
    }

    // Only this namespace's vectors, from the model that embedded the query.
    const vectorResults = (await this.memory.vectorSearch(embedded.vector, limit * 2, this.vectorKeyPrefix()))
      .filter((vr) => {
        const metadata = vr.metadata as StoredVectorMetadata | undefined;
        return !!metadata?.file && this.isCurrentModelVector(metadata);
      });
    if (vectorResults.length === 0) {
      return {
        results: await this.lexicalSearch(query, limit, scope, filters),
        mode: 'lexical-only',
        reason: `no indexed file has an embedding from ${this.embeddingModelId()}; re-index to enable vector search`,
      };
    }

    // Convert to search results with filtering
    const results: SearchResult[] = [];
    for (const vr of vectorResults) {
      if (vr.score < this.config.minVectorScore) continue;

      const metadata = vr.metadata as { file: string };

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
          matchType: 'vector',
        });

        if (results.length >= limit) break;
      }
    }

    return this.withVectorlessFiles(query, results, limit, scope, filters);
  }

  /**
   * #1231: files indexed while the embedding model was unavailable have no
   * vector, so vector search cannot rank them. Match those by text, label the
   * hits 'lexical', and report the result as 'partial-vector' with the counts.
   * Cosine and text-match scores are not comparable, so vector hits come
   * first (by cosine), then lexical hits (by share of query words found); the
   * reason says how many text matches the limit left out.
   */
  private async withVectorlessFiles(
    query: string,
    vectorHits: SearchResult[],
    limit: number,
    scope?: string[],
    filters?: SearchFilter[]
  ): Promise<{ results: SearchResult[] } & Pick<SearchResults, 'mode' | 'reason' | 'coverage'>> {
    const model = this.embeddingModelId();
    const vectorFiles = new Set(vectorHits.map((hit) => hit.file));
    const queryTokens = this.tokenize(query.toLowerCase());
    const lexicalHits: SearchResult[] = [];
    let indexedFiles = 0;
    let withoutVector = 0;

    await this.forEachIndexed((stored) => {
      indexedFiles++;
      if (stored.embeddingModel === model) return;
      withoutVector++;
      if (vectorFiles.has(stored.file)) return;
      const hit = this.fuzzyMatch(queryTokens, stored, scope, filters);
      if (hit) lexicalHits.push({ ...hit, matchType: 'lexical' });
    });

    const coverage = { indexedFiles, filesWithVector: indexedFiles - withoutVector };
    if (withoutVector === 0) {
      return { results: vectorHits, mode: 'vector', coverage };
    }
    const byScore = (a: SearchResult, b: SearchResult) => b.score - a.score;
    const results = [...[...vectorHits].sort(byScore), ...lexicalHits.sort(byScore)].slice(0, limit);
    const droppedLexical = vectorHits.length + lexicalHits.length - results.length;
    return {
      results,
      mode: 'partial-vector',
      reason:
        `${withoutVector} of ${indexedFiles} indexed files have no embedding from ${model} ` +
        '(it was unavailable when they were indexed, or an older aqe version indexed them), ' +
        'so they were matched by text only (matchType "lexical", listed after the vector hits); ' +
        (droppedLexical > 0
          ? `${droppedLexical} more text match(es) were left out by the limit of ${limit}; `
          : '') +
        're-index to rank them by vector',
      coverage,
    };
  }

  /** Word-overlap matching for a semantic query when no vectors can be used. */
  private async lexicalSearch(
    query: string,
    limit: number,
    scope?: string[],
    filters?: SearchFilter[]
  ): Promise<SearchResult[]> {
    const hits = await this.fuzzySearch(query, limit, scope, filters);
    return hits.map((hit) => ({ ...hit, matchType: 'lexical' as const }));
  }

  private async exactSearch(
    query: string,
    limit: number,
    scope?: string[],
    filters?: SearchFilter[]
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    // #1224: scan every indexed file; a cap here hid matches in later files.
    const keys = await this.memory.search(this.contentKeyPattern(), MAX_INDEXED_FILES_SCANNED);

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
    const queryTokens = this.tokenize(query.toLowerCase());

    await this.forEachIndexed((stored) => {
      const hit = this.fuzzyMatch(queryTokens, stored, scope, filters);
      if (hit) results.push(hit);
    });

    // Sort by score and limit
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /** Token-overlap match of one indexed file, or null when it is filtered out or scores too low. */
  private fuzzyMatch(
    queryTokens: string[],
    stored: StoredContent,
    scope?: string[],
    filters?: SearchFilter[]
  ): SearchResult | null {
    // Apply scope filter
    if (scope && scope.length > 0 && !scope.some((s) => stored.file.includes(s))) {
      return null;
    }

    // Apply filters
    if (filters && !this.matchesFilters(stored.metadata, filters)) {
      return null;
    }

    // Fuzzy match using token overlap
    const contentTokens = this.tokenize(stored.content.toLowerCase());
    const score = this.calculateFuzzyScore(queryTokens, contentTokens);
    if (score < this.config.minScore) return null;

    return {
      file: stored.file,
      snippet: this.extractSnippet(stored.content, 200),
      score,
      highlights: queryTokens.filter((t) => contentTokens.some((ct) => this.tokensMatch(t, ct))),
      metadata: stored.metadata,
    };
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
      if (contentTokens.some((ct) => this.tokensMatch(qt, ct))) {
        matches++;
      }
    }

    return matches / queryTokens.length;
  }

  /**
   * A query word is found when a content word contains it (or equals it):
   * "login" is found in `loginWithPassword`. #1279: not the reverse; a query
   * word such as `stepHandler450` is not found just because the file has the
   * shorter word `step`, which made almost every file a full match.
   */
  private tokensMatch(queryToken: string, contentToken: string): boolean {
    return contentToken.includes(queryToken);
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
      const match = contentTokens.find((ct) => this.tokensMatch(qt, ct));
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

  /**
   * Content identity for the analysis and embedding caches.
   *
   * This keys cache entries, so it has to separate any two distinct inputs.
   * A 31-multiplier 32-bit hash does not: for any shared prefix and suffix,
   * "Aa" and "BB" collide, so two different functions would share one entry
   * and the second caller would receive the first one's result.
   */
  private hashCode(str: string): string {
    return createHash('sha256').update(str, 'utf8').digest('hex');
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
