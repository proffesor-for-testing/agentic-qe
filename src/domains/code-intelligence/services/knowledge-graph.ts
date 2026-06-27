/**
 * Agentic QE v3 - Knowledge Graph Service
 * Builds and queries knowledge graph for code relationships
 */

import { LoggerFactory } from '../../../logging/index.js';
import { Result, ok, err } from '../../../shared/types';
import { TypeScriptParser } from '../../../shared/parsers';
import { FileReader } from '../../../shared/io';
import { NomicEmbedder } from '../../../shared/embeddings';
import { MemoryBackend } from '../../../kernel/interfaces';
// ADR-051: LLM Router for AI-enhanced knowledge extraction
import type { HybridRouter, ChatResponse } from '../../../shared/llm';
import { toErrorMessage, toError } from '../../../shared/error-utils.js';
import {
  IndexRequest,
  IndexResult,
  IndexError,
  KGQueryRequest,
  KGQueryResult,
  KGNode,
  KGEdge,
  DependencyRequest,
  DependencyMap,
  DependencyNode,
  DependencyEdge,
  DependencyMetrics,
} from '../interfaces';
import { safeJsonParse } from '../../../shared/safe-json.js';
import { existsSync, statSync } from 'fs';
import { dirname, resolve as resolvePath, join as joinPath } from 'path';
import { extractTsJs } from '../../../shared/parsers/treesitter-ts-extractor.js';

/**
 * Interface for the knowledge graph service
 */
export interface IKnowledgeGraphService {
  /** Index files into the knowledge graph */
  index(request: IndexRequest): Promise<Result<IndexResult, Error>>;

  /** Query the knowledge graph */
  query(request: KGQueryRequest): Promise<Result<KGQueryResult, Error>>;

  /** Map dependencies for files */
  mapDependencies(request: DependencyRequest): Promise<Result<DependencyMap, Error>>;

  /** Get a node by ID */
  getNode(nodeId: string): Promise<KGNode | undefined>;

  /** Get edges for a node */
  getEdges(nodeId: string, direction: 'incoming' | 'outgoing' | 'both'): Promise<KGEdge[]>;

  /** Clear the knowledge graph */
  clear(): Promise<void>;

  /** Dispose of all resources and clear caches */
  destroy(): void;
}

/**
 * Configuration for the knowledge graph service
 */
export interface KnowledgeGraphConfig {
  maxNodes: number;
  maxEdgesPerNode: number;
  namespace: string;
  enableVectorEmbeddings: boolean;
  embeddingDimension: number;
  /** ADR-051: Enable LLM-powered knowledge extraction */
  enableLLMExtraction?: boolean;
  /** ADR-051: Model tier for LLM calls (1=Haiku, 2=Sonnet, 4=Opus) */
  llmModelTier?: number;
  /** ADR-051: Max tokens for LLM responses */
  llmMaxTokens?: number;
  /**
   * ADR-112 C2: base directory for file reads. Defaults to cwd. Set to a
   * project root so analyzing a repo OUTSIDE cwd (e.g. `aqe code c4 /other`)
   * doesn't trip the FileReader path-traversal guard.
   */
  basePath?: string;
}

/**
 * Dependencies for KnowledgeGraphService
 * ADR-051: Added LLM router for AI-enhanced knowledge extraction
 */
export interface KnowledgeGraphDependencies {
  memory: MemoryBackend;
  /** ADR-051: Optional LLM router for AI-enhanced extraction */
  llmRouter?: HybridRouter;
}

const DEFAULT_CONFIG: KnowledgeGraphConfig = {
  maxNodes: 100000,
  maxEdgesPerNode: 500,
  namespace: 'code-intelligence:kg',
  enableVectorEmbeddings: true,
  embeddingDimension: 384,
  enableLLMExtraction: true, // On by default - opt-out (ADR-051)
  llmModelTier: 2, // Sonnet for balanced cost/quality
  llmMaxTokens: 2048,
};

/**
 * Knowledge Graph Service Implementation
 * Builds and manages the code knowledge graph with relationships
 *
 * ADR-051: Added LLM enhancement for AI-powered knowledge extraction
 */
const logger = LoggerFactory.create('code-intelligence/knowledge-graph');

/**
 * File extensions for which the knowledge graph has a real entity/import
 * extractor (the TypeScript Compiler API). Files outside this set are indexed
 * as bare file nodes with no dependency edges — `index` warns about them so the
 * downstream 0-edge result in `deps` is not silently misleading (#511 req #2).
 */
const DEP_EXTRACTOR_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'jsx']);

export class KnowledgeGraphService implements IKnowledgeGraphService {
  private readonly config: KnowledgeGraphConfig;
  private readonly memory: MemoryBackend;
  private readonly nodeCache: Map<string, KGNode> = new Map();
  private readonly edgeIndex: Map<string, KGEdge[]> = new Map();
  /**
   * Lazily-hydrated flat list of all persisted edges (#511).
   * Edges are persisted per-process during index(); cross-process reads
   * (deps/search/impact) hydrate this once and filter by source/target.
   * Invalidated on createEdge()/clear() to avoid serving stale data.
   */
  private allEdgesCache?: KGEdge[];
  private readonly tsParser: TypeScriptParser;
  private readonly fileReader: FileReader;
  private readonly embedder: NomicEmbedder;
  /** ADR-051: Optional LLM router for AI-enhanced extraction */
  private readonly llmRouter?: HybridRouter;

  /**
   * Constructor supporting both legacy and dependency-injection signatures
   * @param dependenciesOrMemory - Either a KnowledgeGraphDependencies object or a MemoryBackend (legacy)
   * @param config - Optional configuration overrides
   */
  constructor(
    dependenciesOrMemory: KnowledgeGraphDependencies | MemoryBackend,
    config: Partial<KnowledgeGraphConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Support both constructor signatures for backward compatibility
    if (this.isKnowledgeGraphDependencies(dependenciesOrMemory)) {
      // New dependency injection style
      this.memory = dependenciesOrMemory.memory;
      this.llmRouter = dependenciesOrMemory.llmRouter;
    } else {
      // Legacy style: direct MemoryBackend
      this.memory = dependenciesOrMemory;
      this.llmRouter = undefined;
    }

    this.tsParser = new TypeScriptParser();
    this.fileReader = new FileReader(this.config.basePath ? { basePath: this.config.basePath } : undefined);
    this.embedder = new NomicEmbedder({
      enableFallback: true,
    });
  }

  /**
   * Type guard to check if the argument is KnowledgeGraphDependencies
   */
  private isKnowledgeGraphDependencies(
    arg: KnowledgeGraphDependencies | MemoryBackend
  ): arg is KnowledgeGraphDependencies {
    return (arg as KnowledgeGraphDependencies).memory !== undefined;
  }

  /**
   * Storage options that pin every KG kv operation to a fixed, tool-independent
   * namespace (the configured `code-intelligence:kg`) instead of the backend's
   * default (`qe-kernel` for the CLI, `mcp-tools` for MCP). This gives CLI↔MCP
   * parity — a graph indexed by one tool is readable by the other — and makes
   * the init existence checks (`SELECT ... WHERE namespace = 'code-intelligence:kg'`)
   * actually find the data (#511). Reads and writes MUST both pass this, or a
   * write under the namespace cannot be read back (issue #491 Bug 2).
   */
  private get nsOpts(): { namespace: string } {
    return { namespace: this.config.namespace };
  }

  /**
   * Index files into the knowledge graph
   */
  async index(request: IndexRequest): Promise<Result<IndexResult, Error>> {
    const startTime = Date.now();
    const errors: IndexError[] = [];
    let nodesCreated = 0;
    let edgesCreated = 0;
    // #511 req #2: count files indexed under a language with no dependency
    // extractor, keyed by extension, so we can warn loudly instead of silently
    // reporting a graph that `deps` then shows as 0 edges.
    const unsupportedByExt = new Map<string, number>();

    try {
      const { paths, incremental = false, includeTests = true, languages } = request;

      // Clear existing graph if not incremental
      if (!incremental) {
        await this.clear();
      }

      for (const path of paths) {
        try {
          // Filter by language if specified
          if (languages && languages.length > 0) {
            const ext = this.getFileExtension(path);
            if (!this.matchesLanguage(ext, languages)) {
              continue;
            }
          }

          // Skip test files if not included
          if (!includeTests && this.isTestFile(path)) {
            continue;
          }

          const ext = this.getFileExtension(path);
          if (!DEP_EXTRACTOR_EXTENSIONS.has(ext)) {
            unsupportedByExt.set(ext || '(none)', (unsupportedByExt.get(ext || '(none)') ?? 0) + 1);
          }

          // Index the file
          const result = await this.indexFile(path, incremental);
          nodesCreated += result.nodes;
          edgesCreated += result.edges;
        } catch (fileError) {
          errors.push({
            file: path,
            error: toErrorMessage(fileError),
          });
        }
      }

      const duration = Date.now() - startTime;

      // #511 req #2: surface a loud warning for unsupported languages so the
      // caller understands why `deps`/`impact` will be empty for those files.
      const warnings: string[] = [];
      if (unsupportedByExt.size > 0) {
        const supported = Array.from(DEP_EXTRACTOR_EXTENSIONS).join(', ');
        for (const [ext, count] of unsupportedByExt) {
          const msg =
            `${count} file(s) with extension '.${ext}' were indexed as plain ` +
            `nodes: no dependency extractor for this language, so 'deps'/'impact' ` +
            `will report 0 edges for them. Supported: ${supported}.`;
          warnings.push(msg);
          logger.warn(msg);
        }
      }

      // Store indexing metadata
      await this.storeIndexMetadata({
        filesIndexed: paths.length - errors.length,
        nodesCreated,
        edgesCreated,
        duration,
        indexedAt: new Date().toISOString(),
      });

      return ok({
        filesIndexed: paths.length - errors.length,
        nodesCreated,
        edgesCreated,
        duration,
        errors,
        warnings,
      });
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Query the knowledge graph
   */
  async query(request: KGQueryRequest): Promise<Result<KGQueryResult, Error>> {
    try {
      const { query: queryStr, type, limit = 100 } = request;

      if (type === 'cypher') {
        return this.executeCypherQuery(queryStr, limit);
      } else {
        return this.executeNaturalLanguageQuery(queryStr, limit);
      }
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Map dependencies for given files
   */
  async mapDependencies(request: DependencyRequest): Promise<Result<DependencyMap, Error>> {
    try {
      const { files, direction, depth = 3 } = request;
      const nodes: DependencyNode[] = [];
      const edges: DependencyEdge[] = [];
      const visited = new Set<string>();
      const cycles: string[][] = [];

      // Process each file
      for (const file of files) {
        await this.traverseDependencies(
          file,
          direction,
          depth,
          visited,
          nodes,
          edges,
          [],
          cycles
        );
      }

      // Calculate metrics
      const metrics = this.calculateDependencyMetrics(nodes, edges);

      return ok({
        nodes,
        edges,
        cycles,
        metrics,
      });
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Get a node by ID
   */
  async getNode(nodeId: string): Promise<KGNode | undefined> {
    // Check cache first
    if (this.nodeCache.has(nodeId)) {
      return this.nodeCache.get(nodeId);
    }

    // Load from memory
    const key = `${this.config.namespace}:node:${nodeId}`;
    const node = await this.memory.get<KGNode>(key, this.nsOpts);

    if (node) {
      this.nodeCache.set(nodeId, node);
    }

    return node;
  }

  /**
   * Get edges for a node
   */
  async getEdges(
    nodeId: string,
    direction: 'incoming' | 'outgoing' | 'both'
  ): Promise<KGEdge[]> {
    // Hydrate the full edge set from persistence once, then filter in-memory.
    // This is required for cross-process reads (deps/search run as separate
    // CLI processes from index) and for correct incoming/both lookups, which
    // the old source-keyed edgeIndex could not serve (#511).
    const allEdges = await this.loadAllEdges();
    return this.filterEdgesByDirection(allEdges, nodeId, direction);
  }

  /**
   * Load all persisted edges into a flat cache (#511).
   * Cached for the lifetime of the read; invalidated by createEdge()/clear().
   */
  private async loadAllEdges(): Promise<KGEdge[]> {
    if (this.allEdgesCache) {
      return this.allEdgesCache;
    }

    const edges: KGEdge[] = [];
    const pattern = `${this.config.namespace}:edge:*`;
    const keys = await this.memory.search(pattern, Number.MAX_SAFE_INTEGER, this.nsOpts);

    for (const key of keys) {
      const edge = await this.memory.get<KGEdge>(key, this.nsOpts);
      if (edge) {
        edges.push(edge);
      }
    }

    this.allEdgesCache = edges;
    return edges;
  }

  /**
   * Clear the knowledge graph
   */
  async clear(): Promise<void> {
    this.nodeCache.clear();
    this.edgeIndex.clear();
    this.allEdgesCache = undefined;

    // Delete persisted nodes/edges so a non-incremental re-index does not
    // accumulate stale graph state across runs (#511). Scoped to the KG
    // namespace's :node:/:edge: keys only — never touches learning data.
    for (const prefix of [
      `${this.config.namespace}:node:`,
      `${this.config.namespace}:edge:`,
    ]) {
      const keys = await this.memory.search(`${prefix}*`, Number.MAX_SAFE_INTEGER, this.nsOpts);
      for (const key of keys) {
        await this.memory.delete(key, this.nsOpts);
      }
    }
  }

  /**
   * Remove a single file's contribution to the graph (#511).
   *
   * Deletes the file node, its entity nodes, and edges that ORIGINATE from the
   * file or its entities (contains + outgoing imports). Incoming edges (other
   * files importing this one) are left intact — they belong to those files and
   * remain valid until those files are themselves re-indexed. Used for
   * incremental re-indexing so stale entities/imports don't persist.
   */
  private async removeFileFromGraph(filePath: string): Promise<void> {
    const fileNodeId = this.pathToNodeId(filePath);
    const ns = this.config.namespace;

    // Delete the file node and all of its entity nodes (`:node:<file>` and
    // `:node:<file>:<type>:<name>`).
    const nodeKeys = await this.memory.search(`${ns}:node:${fileNodeId}*`, Number.MAX_SAFE_INTEGER, this.nsOpts);
    for (const key of nodeKeys) {
      await this.memory.delete(key, this.nsOpts);
      this.nodeCache.delete(key.slice(`${ns}:node:`.length));
    }

    // Delete edges whose source is the file node or one of its entity nodes.
    const edgeKeys = await this.memory.search(`${ns}:edge:*`, Number.MAX_SAFE_INTEGER, this.nsOpts);
    for (const key of edgeKeys) {
      const edge = await this.memory.get<KGEdge>(key, this.nsOpts);
      if (edge && (edge.source === fileNodeId || edge.source.startsWith(`${fileNodeId}:`))) {
        await this.memory.delete(key, this.nsOpts);
      }
    }

    // Drop the file's source-keyed cache entry and invalidate the flat cache.
    this.edgeIndex.delete(fileNodeId);
    this.allEdgesCache = undefined;
  }

  // ============================================================================
  // ADR-051: LLM Enhancement Methods
  // ============================================================================

  /**
   * Check if LLM extraction is available and enabled
   */
  private isLLMExtractionAvailable(): boolean {
    return this.config.enableLLMExtraction === true && this.llmRouter !== undefined;
  }

  /**
   * Get model ID for the configured tier
   * @param tier - Model tier (1=Haiku, 2=Sonnet, 3=Sonnet, 4=Opus)
   */
  private getModelForTier(tier: number): string {
    switch (tier) {
      case 1: return 'claude-haiku-4-5-20251001';
      case 2: return 'claude-sonnet-4-6';
      case 3: return 'claude-sonnet-4-6';
      case 4: return 'claude-opus-4-7';
      default: return 'claude-sonnet-4-6';
    }
  }

  /**
   * Extract semantic relationships from code using LLM
   * Provides deeper insights than AST-based extraction:
   * - Design pattern detection
   * - Architectural boundary identification
   * - Dependency impact analysis
   * - Semantic relationships between entities
   */
  private async extractRelationshipsWithLLM(
    code: string,
    existingEntities: ExtractedEntity[]
  ): Promise<LLMExtractedRelationships> {
    if (!this.llmRouter) {
      return { semanticRelationships: [], designPatterns: [], architecturalBoundaries: [], dependencyImpacts: [] };
    }

    try {
      const prompt = this.buildRelationshipExtractionPrompt(code, existingEntities);
      const modelId = this.getModelForTier(this.config.llmModelTier ?? 2);

      const response: ChatResponse = await this.llmRouter.chat({
        messages: [
          {
            role: 'system',
            content: `You are an expert software architect analyzing code structure. Extract:
1. Semantic relationships between code entities (inheritance, composition, dependency, collaboration)
2. Design patterns used (Factory, Singleton, Observer, Strategy, etc.)
3. Architectural boundaries (layers, modules, domains)
4. Dependency impact analysis (which changes would affect which components)

Return a JSON object with:
{
  "semanticRelationships": [{"source": "...", "target": "...", "type": "...", "description": "..."}],
  "designPatterns": [{"pattern": "...", "participants": ["..."], "location": "...", "confidence": 0.0-1.0}],
  "architecturalBoundaries": [{"name": "...", "type": "layer|module|domain", "entities": ["..."]}],
  "dependencyImpacts": [{"entity": "...", "impactedBy": ["..."], "impacts": ["..."], "severity": "low|medium|high"}]
}

Be precise and only report high-confidence findings.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        model: modelId,
        maxTokens: this.config.llmMaxTokens ?? 2048,
        temperature: 0.2, // Low temperature for consistent analysis
      });

      if (response.content) {
        return this.parseLLMRelationshipResponse(response.content);
      }

      return { semanticRelationships: [], designPatterns: [], architecturalBoundaries: [], dependencyImpacts: [] };
    } catch {
      logger.warn('LLM relationship extraction failed:');
      return { semanticRelationships: [], designPatterns: [], architecturalBoundaries: [], dependencyImpacts: [] };
    }
  }

  /**
   * Build prompt for LLM relationship extraction
   */
  private buildRelationshipExtractionPrompt(
    code: string,
    existingEntities: ExtractedEntity[]
  ): string {
    let prompt = `## Code to Analyze:\n\`\`\`typescript\n${code}\n\`\`\`\n\n`;

    if (existingEntities.length > 0) {
      prompt += `## Already Identified Entities:\n`;
      for (const entity of existingEntities) {
        prompt += `- ${entity.type}: ${entity.name} (line ${entity.line}, ${entity.visibility})\n`;
      }
      prompt += '\n';
    }

    prompt += `## Analysis Requirements:\n`;
    prompt += `1. Identify semantic relationships between the entities above\n`;
    prompt += `2. Detect any design patterns in use\n`;
    prompt += `3. Identify architectural boundaries or layers\n`;
    prompt += `4. Analyze which entities would be impacted by changes to others\n`;

    return prompt;
  }

  /**
   * Parse LLM response for relationship extraction
   */
  private parseLLMRelationshipResponse(content: string): LLMExtractedRelationships {
    try {
      // Try to extract JSON from response (may be wrapped in markdown)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = safeJsonParse(jsonMatch[0]);
        return {
          semanticRelationships: Array.isArray(parsed.semanticRelationships)
            ? parsed.semanticRelationships
            : [],
          designPatterns: Array.isArray(parsed.designPatterns)
            ? parsed.designPatterns
            : [],
          architecturalBoundaries: Array.isArray(parsed.architecturalBoundaries)
            ? parsed.architecturalBoundaries
            : [],
          dependencyImpacts: Array.isArray(parsed.dependencyImpacts)
            ? parsed.dependencyImpacts
            : [],
        };
      }
    } catch {
      // JSON parsing failed
    }

    return { semanticRelationships: [], designPatterns: [], architecturalBoundaries: [], dependencyImpacts: [] };
  }

  /**
   * Enhance query results with LLM-powered semantic understanding
   */
  private async enhanceQueryWithLLM(
    query: string,
    results: KGNode[]
  ): Promise<{ enhancedResults: KGNode[]; insights: string[] }> {
    if (!this.llmRouter || results.length === 0) {
      return { enhancedResults: results, insights: [] };
    }

    try {
      const modelId = this.getModelForTier(this.config.llmModelTier ?? 2);

      const response: ChatResponse = await this.llmRouter.chat({
        messages: [
          {
            role: 'system',
            content: `You are a code intelligence assistant. Given a query and search results from a knowledge graph, provide:
1. Ranking of results by relevance to the query
2. Key insights about how the results relate to the query
3. Suggestions for related code to explore

Return JSON: { "rankedIds": ["id1", "id2", ...], "insights": ["insight1", "insight2", ...] }`,
          },
          {
            role: 'user',
            content: `Query: "${query}"\n\nResults:\n${JSON.stringify(results.map(n => ({ id: n.id, label: n.label, properties: n.properties })), null, 2)}`,
          },
        ],
        model: modelId,
        maxTokens: 1024,
        temperature: 0.3,
      });

      if (response.content) {
        try {
          const jsonMatch = response.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = safeJsonParse(jsonMatch[0]);
            const rankedIds: string[] = parsed.rankedIds || [];
            const insights: string[] = parsed.insights || [];

            // Re-order results based on LLM ranking
            const idToNode = new Map(results.map(n => [n.id, n]));
            const rankedResults: KGNode[] = [];

            for (const id of rankedIds) {
              const node = idToNode.get(id);
              if (node) {
                rankedResults.push(node);
                idToNode.delete(id);
              }
            }

            // Add any unranked nodes at the end
            rankedResults.push(...Array.from(idToNode.values()));

            return { enhancedResults: rankedResults, insights };
          }
        } catch {
          // Parse failed, return original
        }
      }

      return { enhancedResults: results, insights: [] };
    } catch {
      logger.warn('LLM query enhancement failed:');
      return { enhancedResults: results, insights: [] };
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async indexFile(
    filePath: string,
    incremental = false
  ): Promise<{ nodes: number; edges: number }> {
    let nodesCreated = 0;
    let edgesCreated = 0;

    // #511: evict any cached content for this file before reading it. The
    // FileReader caches content for 5 min, so in a long-lived process (e.g. the
    // MCP server) a re-index would otherwise extract entities/imports from the
    // STALE pre-edit text. Eviction guarantees fresh reads; the two reads within
    // this method (entities + imports) still share one cache fill, so they stay
    // mutually consistent.
    this.fileReader.invalidateCache(filePath);

    // #511: on an incremental re-index, drop this file's prior nodes/edges
    // first so renamed/removed entities and stale outgoing imports don't
    // linger as phantom dependencies. (A full index already cleared everything.)
    if (incremental) {
      await this.removeFileFromGraph(filePath);
    }

    // Create file node
    const fileNode = await this.createFileNode(filePath);
    nodesCreated++;

    // Parse file to extract entities using TypeScript AST parser
    const entities = await this.extractEntities(filePath);

    for (const entity of entities) {
      // Create entity node
      const entityNode = await this.createEntityNode(entity, filePath);
      nodesCreated++;

      // Create edge from file to entity
      await this.createEdge(fileNode.id, entityNode.id, 'contains');
      edgesCreated++;
    }

    // Extract imports/dependencies
    const imports = await this.extractImports(filePath);

    for (const importPath of imports) {
      // Resolve relative specifiers to the actual file so the import edge
      // targets the imported file's node id (#511). Without this, an edge to
      // './math' never matches the '/abs/path/math.ts' file node and the
      // dependency graph stays disconnected (all nodes degree-0).
      const resolvedPath = this.resolveImportPath(importPath, filePath);
      const targetNodeId = this.pathToNodeId(resolvedPath);
      await this.createEdge(fileNode.id, targetNodeId, 'import');
      edgesCreated++;
    }

    // ADR-051: LLM-enhanced relationship extraction (opt-in)
    if (this.isLLMExtractionAvailable()) {
      const fileContent = await this.fileReader.readFile(filePath);
      if (fileContent.success) {
        const llmRelationships = await this.extractRelationshipsWithLLM(fileContent.value, entities);
        edgesCreated += await this.storeLLMRelationships(fileNode.id, llmRelationships);
      }
    }

    return { nodes: nodesCreated, edges: edgesCreated };
  }

  /**
   * Store LLM-extracted relationships in the knowledge graph
   * ADR-051: Converts LLM insights into graph edges
   */
  private async storeLLMRelationships(
    fileNodeId: string,
    relationships: LLMExtractedRelationships
  ): Promise<number> {
    let edgesCreated = 0;

    // Store semantic relationships as edges
    for (const rel of relationships.semanticRelationships) {
      const sourceId = `${fileNodeId}:*:${rel.source}`;
      const targetId = `${fileNodeId}:*:${rel.target}`;
      await this.createEdge(sourceId, targetId, rel.type as DependencyEdge['type']);
      edgesCreated++;
    }

    // Store LLM metadata in nodeCache (cache-only, no kv_store writes)
    const node = this.nodeCache.get(fileNodeId);
    if (node) {
      if (relationships.designPatterns.length > 0) {
        node.properties.designPatterns = relationships.designPatterns;
      }
      if (relationships.architecturalBoundaries.length > 0) {
        node.properties.architecturalBoundaries = relationships.architecturalBoundaries;
      }
      if (relationships.dependencyImpacts.length > 0) {
        node.properties.dependencyImpacts = relationships.dependencyImpacts;
      }
      this.nodeCache.set(fileNodeId, node);
    }

    return edgesCreated;
  }

  private async createFileNode(filePath: string): Promise<KGNode> {
    const nodeId = this.pathToNodeId(filePath);
    const node: KGNode = {
      id: nodeId,
      label: 'File',
      properties: {
        path: filePath,
        name: this.getFileName(filePath),
        extension: this.getFileExtension(filePath),
        type: this.getFileType(filePath),
      },
    };

    await this.storeNode(node);
    return node;
  }

  private async createEntityNode(
    entity: ExtractedEntity,
    filePath: string
  ): Promise<KGNode> {
    const nodeId = `${this.pathToNodeId(filePath)}:${entity.type}:${entity.name}`;
    const node: KGNode = {
      id: nodeId,
      label: entity.type,
      properties: {
        name: entity.name,
        file: filePath,
        line: entity.line,
        visibility: entity.visibility,
        async: entity.isAsync,
      },
    };

    await this.storeNode(node);

    // Store vector embedding for semantic search
    if (this.config.enableVectorEmbeddings) {
      const embedding = await this.generateEmbedding(entity);
      await this.memory.storeVector(`${this.config.namespace}:node:${nodeId}`, embedding, {
        nodeId,
        type: entity.type,
        name: entity.name,
      });
    }

    return node;
  }

  private async createEdge(
    sourceId: string,
    targetId: string,
    type: DependencyEdge['type'] | 'contains'
  ): Promise<KGEdge> {
    const edgeId = `${sourceId}--${type}-->${targetId}`;
    const edge: KGEdge = {
      source: sourceId,
      target: targetId,
      type,
    };

    // Update in-memory edge index (source-keyed, used during same-process index)
    const sourceEdges = this.edgeIndex.get(sourceId) || [];
    sourceEdges.push(edge);
    this.edgeIndex.set(sourceId, sourceEdges);

    // Persist so cross-process reads (deps/search/impact) see the graph (#511).
    await this.memory.set(`${this.config.namespace}:edge:${edgeId}`, edge, this.nsOpts);
    // Invalidate hydrated read cache so subsequent getEdges() reflects this write.
    this.allEdgesCache = undefined;

    return edge;
  }

  private async storeNode(node: KGNode): Promise<void> {
    // Enforce maxNodes limit before adding (LRU eviction)
    if (this.nodeCache.size >= this.config.maxNodes) {
      // Remove oldest (first) entry - Map maintains insertion order
      const firstKey = this.nodeCache.keys().next().value;
      if (firstKey) {
        this.nodeCache.delete(firstKey);
        // Also clean up related edges
        this.edgeIndex.delete(firstKey);
      }
    }

    this.nodeCache.set(node.id, node);

    // Persist so cross-process reads (deps/search/impact) see the graph (#511).
    await this.memory.set(`${this.config.namespace}:node:${node.id}`, node, this.nsOpts);
  }

  private async extractEntities(filePath: string): Promise<ExtractedEntity[]> {
    const extension = this.getFileExtension(filePath);
    const entities: ExtractedEntity[] = [];

    // TS/JS files: prefer the bundled tree-sitter WASM grammars (typescript-free,
    // works out of the box), and fall back to the TypeScript compiler API only if
    // tree-sitter is unavailable AND `typescript` happens to be installed (#511).
    if (DEP_EXTRACTOR_EXTENSIONS.has(extension)) {
      const fileResult = await this.fileReader.readFile(filePath);
      const fileName = this.getFileName(filePath);

      if (fileResult.success) {
        let extracted = false;

        // Primary: tree-sitter
        try {
          const ts = await extractTsJs(fileResult.value, extension);
          if (ts) {
            for (const f of ts.functions) {
              entities.push({ type: 'function', name: f.name, line: f.startLine, visibility: f.visibility, isAsync: f.isAsync });
            }
            for (const c of ts.classes) {
              entities.push({ type: 'class', name: c.name, line: c.startLine, visibility: 'public', isAsync: false });
              for (const m of c.methods) {
                entities.push({ type: 'function', name: `${c.name}.${m.name}`, line: m.startLine, visibility: m.visibility, isAsync: m.isAsync });
              }
            }
            for (const iface of ts.interfaces) {
              entities.push({ type: 'interface', name: iface.name, line: iface.startLine, visibility: 'public', isAsync: false });
            }
            extracted = true;
          }
        } catch {
          // tree-sitter unavailable — fall through to the TS compiler path
        }

        // Fallback: TypeScript compiler API (only when tree-sitter didn't run).
        if (!extracted) {
          try {
            const ast = this.tsParser.parseFile(fileName, fileResult.value);
            for (const func of this.tsParser.extractFunctions(ast)) {
              entities.push({ type: 'function', name: func.name, line: func.startLine, visibility: 'public', isAsync: func.isAsync });
            }
            for (const cls of this.tsParser.extractClasses(ast)) {
              entities.push({ type: 'class', name: cls.name, line: cls.startLine, visibility: 'public', isAsync: false });
              for (const method of cls.methods) {
                entities.push({ type: 'function', name: `${cls.name}.${method.name}`, line: method.startLine, visibility: method.visibility, isAsync: method.isAsync });
              }
            }
            for (const iface of this.tsParser.extractInterfaces(ast)) {
              entities.push({ type: 'interface', name: iface.name, line: iface.startLine, visibility: 'public', isAsync: false });
            }
          } catch {
            // Neither tree-sitter nor the TypeScript compiler is available.
          }
        }

        // If nothing was extracted, record a module entity for the file.
        if (entities.length === 0) {
          entities.push({ type: 'module', name: fileName.replace(/\.[^.]+$/, ''), line: 1, visibility: 'public', isAsync: false });
        }
      } else {
        // Fallback: create a module entity for the file itself
        entities.push({
          type: 'module',
          name: this.getFileName(filePath).replace(/\.[^.]+$/, ''),
          line: 1,
          visibility: 'public',
          isAsync: false,
        });
      }
    } else if (extension === 'py') {
      // Python files: regex-based parsing for classes, functions, imports
      const fileResult = await this.fileReader.readFile(filePath);

      if (fileResult.success) {
        const content = fileResult.value;
        const lines = content.split('\n');

        // Extract class definitions: class ClassName(Base): or class ClassName:
        const classPattern = /^class\s+(\w+)\s*(?:\([^)]*\))?\s*:/;
        // Extract function definitions: def function_name(...): or async def function_name(...):
        const funcPattern = /^(async\s+)?def\s+(\w+)\s*\(/;

        let currentClass: string | null = null;
        let currentIndent = 0;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const lineNum = i + 1;
          const trimmedLine = line.trimStart();
          const indent = line.length - trimmedLine.length;

          // Track class scope for methods
          if (currentClass && indent <= currentIndent) {
            currentClass = null;
          }

          // Match class definitions
          const classMatch = trimmedLine.match(classPattern);
          if (classMatch) {
            const className = classMatch[1];
            entities.push({
              type: 'class',
              name: className,
              line: lineNum,
              visibility: className.startsWith('_') ? 'private' : 'public',
              isAsync: false,
            });
            currentClass = className;
            currentIndent = indent;
            continue;
          }

          // Match function/method definitions
          const funcMatch = trimmedLine.match(funcPattern);
          if (funcMatch) {
            const isAsync = !!funcMatch[1];
            const funcName = funcMatch[2];
            const isMethod = currentClass !== null && indent > currentIndent;

            // Determine visibility
            let visibility: 'public' | 'private' | 'protected' = 'public';
            if (funcName.startsWith('__') && !funcName.endsWith('__')) {
              visibility = 'private'; // Name-mangled private
            } else if (funcName.startsWith('_')) {
              visibility = 'protected'; // Convention private
            }

            entities.push({
              type: 'function',
              name: isMethod ? `${currentClass}.${funcName}` : funcName,
              line: lineNum,
              visibility,
              isAsync,
            });
          }
        }

        // If no entities found, create a module entity for the file
        if (entities.length === 0) {
          entities.push({
            type: 'module',
            name: this.getFileName(filePath).replace('.py', ''),
            line: 1,
            visibility: 'public',
            isAsync: false,
          });
        }
      } else {
        // Fallback: create a module entity for the file itself
        entities.push({
          type: 'module',
          name: this.getFileName(filePath).replace('.py', ''),
          line: 1,
          visibility: 'public',
          isAsync: false,
        });
      }
    }

    return entities;
  }

  private async extractImports(filePath: string): Promise<string[]> {
    const extension = this.getFileExtension(filePath);
    const importPaths: string[] = [];

    // TS/JS: tree-sitter primary (typescript-free), TS compiler fallback (#511).
    if (DEP_EXTRACTOR_EXTENSIONS.has(extension)) {
      const fileResult = await this.fileReader.readFile(filePath);

      if (fileResult.success) {
        const fileName = this.getFileName(filePath);
        let modules: string[] | null = null;

        // Primary: tree-sitter
        try {
          const ts = await extractTsJs(fileResult.value, extension);
          if (ts) modules = ts.imports;
        } catch {
          modules = null;
        }

        // Fallback: TypeScript compiler API
        if (modules === null) {
          try {
            const ast = this.tsParser.parseFile(fileName, fileResult.value);
            modules = this.tsParser.extractImports(ast).map((i) => i.module);
          } catch {
            modules = [];
          }
        }

        for (const module of modules) {
          // Skip node built-ins for now
          if (!module.startsWith('node:')) {
            importPaths.push(module);
          }
        }
      }
    }

    return importPaths;
  }

  private async executeCypherQuery(
    query: string,
    limit: number
  ): Promise<Result<KGQueryResult, Error>> {
    // Cypher query parser supporting:
    // - MATCH (n:Label) - node patterns
    // - MATCH (n:Label)-[r:REL_TYPE]->(m:Label) - relationship patterns
    // - WHERE n.property = 'value' - property filters
    // - RETURN n, r, m - result selection (implicit: all matched)

    const nodes: KGNode[] = [];
    const edges: KGEdge[] = [];
    const nodeAliases: Map<string, KGNode[]> = new Map();

    // Parse relationship pattern: MATCH (a:Label1)-[r:RelType]->(b:Label2)
    const relationshipPattern =
      /MATCH\s+\((\w+):(\w+)\)\s*-\[(\w+)?:?(\w+)?\]\s*->\s*\((\w+):(\w+)\)/i.exec(query);

    if (relationshipPattern) {
      const [, sourceAlias, sourceLabel, , relType, targetAlias, targetLabel] =
        relationshipPattern;

      // Find source nodes
      const sourceNodes = await this.findNodesByLabel(sourceLabel, limit * 2);
      nodeAliases.set(sourceAlias, sourceNodes);

      // For each source node, find relationships and target nodes
      for (const sourceNode of sourceNodes.slice(0, limit)) {
        const nodeEdges = await this.getEdges(sourceNode.id, 'outgoing');

        for (const edge of nodeEdges) {
          // Filter by relationship type if specified
          if (relType && edge.type !== relType) continue;

          const targetNode = await this.getNode(edge.target);
          if (targetNode && targetNode.label === targetLabel) {
            if (!nodes.some((n) => n.id === sourceNode.id)) {
              nodes.push(sourceNode);
            }
            if (!nodes.some((n) => n.id === targetNode.id)) {
              nodes.push(targetNode);
            }
            // Use source+target+type as unique edge identifier
            if (!edges.some((e) => e.source === edge.source && e.target === edge.target && e.type === edge.type)) {
              edges.push(edge);
            }
          }
        }
      }

      if (targetAlias) {
        nodeAliases.set(
          targetAlias,
          nodes.filter((n) => n.label === targetLabel)
        );
      }
    } else {
      // Parse simple node pattern: MATCH (n:Label)
      const matchPattern = /MATCH\s+\((\w+):(\w+)\)/i.exec(query);
      if (matchPattern) {
        const [, alias, label] = matchPattern;
        const matchedNodes = await this.findNodesByLabel(label, limit);
        nodeAliases.set(alias, matchedNodes);
        nodes.push(...matchedNodes);
      }
    }

    // Parse WHERE clause for property filtering
    const wherePattern = /WHERE\s+(\w+)\.(\w+)\s*=\s*['"]?([^'")\s]+)['"]?/i.exec(query);
    if (wherePattern) {
      const [, alias, property, value] = wherePattern;
      const aliasNodes = nodeAliases.get(alias) || nodes;

      // Filter nodes by property value
      const filteredNodes = aliasNodes.filter((node) => {
        const propValue = node.properties[property];
        return propValue !== undefined && String(propValue) === value;
      });

      // Replace nodes with filtered set
      nodes.length = 0;
      nodes.push(...filteredNodes.slice(0, limit));

      // Also filter edges to only include those connecting filtered nodes
      const nodeIds = new Set(nodes.map((n) => n.id));
      const filteredEdges = edges.filter(
        (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
      );
      edges.length = 0;
      edges.push(...filteredEdges);
    }

    return ok({
      nodes: nodes.slice(0, limit),
      edges,
      metadata: {
        query,
        type: 'cypher',
        resultCount: nodes.length,
        edgeCount: edges.length,
      },
    });
  }

  /**
   * Find nodes by their label
   */
  private async findNodesByLabel(label: string, limit: number): Promise<KGNode[]> {
    const nodes: KGNode[] = [];
    const pattern = `${this.config.namespace}:node:*`;
    const keys = await this.memory.search(pattern, limit * 2, this.nsOpts);

    for (const key of keys) {
      const node = await this.memory.get<KGNode>(key, this.nsOpts);
      if (node && node.label === label) {
        nodes.push(node);
        if (nodes.length >= limit) break;
      }
    }

    return nodes;
  }

  private async executeNaturalLanguageQuery(
    query: string,
    limit: number
  ): Promise<Result<KGQueryResult, Error>> {
    // Use vector search for natural language queries
    if (this.config.enableVectorEmbeddings) {
      const queryEmbedding = await this.generateQueryEmbedding(query);
      const results = await this.memory.vectorSearch(queryEmbedding, limit);

      const nodes: KGNode[] = [];
      for (const result of results) {
        const nodeId = (result.metadata as { nodeId: string })?.nodeId;
        if (nodeId) {
          const node = await this.getNode(nodeId);
          if (node) {
            nodes.push(node);
          }
        }
      }

      return ok({
        nodes,
        edges: [],
        metadata: {
          query,
          type: 'natural-language',
          resultCount: nodes.length,
          searchScores: results.map((r) => r.score),
        },
      });
    }

    // Fallback to keyword matching
    const keywords = query.toLowerCase().split(/\s+/);
    const pattern = `${this.config.namespace}:node:*`;
    const keys = await this.memory.search(pattern, limit * 3, this.nsOpts);

    const nodes: KGNode[] = [];
    for (const key of keys) {
      const node = await this.memory.get<KGNode>(key, this.nsOpts);
      if (node) {
        const nodeText = JSON.stringify(node.properties).toLowerCase();
        if (keywords.some((kw) => nodeText.includes(kw))) {
          nodes.push(node);
          if (nodes.length >= limit) break;
        }
      }
    }

    return ok({
      nodes,
      edges: [],
      metadata: {
        query,
        type: 'keyword',
        resultCount: nodes.length,
      },
    });
  }

  private async traverseDependencies(
    file: string,
    direction: 'incoming' | 'outgoing' | 'both',
    depth: number,
    visited: Set<string>,
    nodes: DependencyNode[],
    edges: DependencyEdge[],
    path: string[],
    cycles: string[][]
  ): Promise<void> {
    if (depth <= 0 || visited.has(file)) {
      // Check for cycle
      const cycleStart = path.indexOf(file);
      if (cycleStart >= 0) {
        cycles.push([...path.slice(cycleStart), file]);
      }
      return;
    }

    visited.add(file);
    path.push(file);

    const nodeId = this.pathToNodeId(file);
    // Only true dependency edges (import/call/extends/implements) belong in a
    // dependency map — exclude structural 'contains' (file→entity) edges so the
    // graph stays a file-to-file dependency view and entities don't leak in as
    // pseudo file nodes (#511).
    const DEPENDENCY_EDGE_TYPES = new Set(['import', 'call', 'extends', 'implements']);
    const fileEdges = (await this.getEdges(nodeId, direction)).filter((e) =>
      DEPENDENCY_EDGE_TYPES.has(e.type)
    );

    // Create dependency node
    const inDegree = fileEdges.filter((e) => e.target === nodeId).length;
    const outDegree = fileEdges.filter((e) => e.source === nodeId).length;

    nodes.push({
      id: nodeId,
      path: file,
      type: 'file',
      inDegree,
      outDegree,
    });

    // Process edges
    for (const edge of fileEdges) {
      const depEdge: DependencyEdge = {
        source: edge.source,
        target: edge.target,
        type: edge.type as DependencyEdge['type'],
      };

      if (!edges.some((e) => e.source === depEdge.source && e.target === depEdge.target)) {
        edges.push(depEdge);
      }

      // Recurse only along directed-forward (outgoing) edges so the traversal
      // path represents a real directed dependency chain. Following 'both'
      // adjacency backwards fabricated cycles like A→B→A (#511). Incoming
      // neighbours are still surfaced as edges/degrees above and are visited
      // as their own top-level entries.
      if (edge.source !== nodeId) {
        continue;
      }
      const nextFile = this.nodeIdToPath(edge.target);

      if (nextFile) {
        await this.traverseDependencies(
          nextFile,
          direction,
          depth - 1,
          visited,
          nodes,
          edges,
          path,
          cycles
        );
      }
    }

    path.pop();
  }

  private calculateDependencyMetrics(
    nodes: DependencyNode[],
    edges: DependencyEdge[]
  ): DependencyMetrics {
    const totalNodes = nodes.length;
    const totalEdges = edges.length;
    const avgDegree =
      totalNodes > 0
        ? nodes.reduce((sum, n) => sum + n.inDegree + n.outDegree, 0) / totalNodes
        : 0;

    // Calculate max depth using BFS
    let maxDepth = 0;
    if (nodes.length > 0) {
      const adjList = new Map<string, string[]>();
      for (const edge of edges) {
        const sources = adjList.get(edge.source) || [];
        sources.push(edge.target);
        adjList.set(edge.source, sources);
      }

      const depths = new Map<string, number>();
      for (const node of nodes) {
        if (!depths.has(node.id)) {
          this.bfsDepth(node.id, adjList, depths);
        }
        maxDepth = Math.max(maxDepth, depths.get(node.id) || 0);
      }
    }

    // Simple cyclomatic complexity estimate
    const cyclomaticComplexity = totalEdges - totalNodes + 2;

    return {
      totalNodes,
      totalEdges,
      avgDegree: Math.round(avgDegree * 100) / 100,
      maxDepth,
      cyclomaticComplexity: Math.max(1, cyclomaticComplexity),
    };
  }

  private bfsDepth(
    startId: string,
    adjList: Map<string, string[]>,
    depths: Map<string, number>
  ): void {
    const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const existingDepth = depths.get(current.id) ?? -1;

      if (current.depth > existingDepth) {
        depths.set(current.id, current.depth);
      }

      const neighbors = adjList.get(current.id) || [];
      for (const neighbor of neighbors) {
        if (!depths.has(neighbor) || (depths.get(neighbor) ?? 0) < current.depth + 1) {
          queue.push({ id: neighbor, depth: current.depth + 1 });
        }
      }
    }
  }

  private filterEdgesByDirection(
    edges: KGEdge[],
    nodeId: string,
    direction: 'incoming' | 'outgoing' | 'both'
  ): KGEdge[] {
    return edges.filter((edge) => {
      if (direction === 'incoming') return edge.target === nodeId;
      if (direction === 'outgoing') return edge.source === nodeId;
      // 'both': edge touches nodeId on either end
      return edge.source === nodeId || edge.target === nodeId;
    });
  }

  private async storeIndexMetadata(_metadata: Record<string, unknown>): Promise<void> {
    // Cache-only: index metadata is transient, no kv_store persistence needed
    // Metadata is returned directly in the IndexResult from index()
  }

  private async generateEmbedding(entity: ExtractedEntity): Promise<number[]> {
    // Create rich text representation of the entity for semantic embedding
    const text = `${entity.type} ${entity.name} ${entity.visibility}${entity.isAsync ? ' async' : ''}`;

    try {
      // Use NomicEmbedder for real semantic embeddings (returns number[] directly)
      const embedding = await this.embedder.embed(text);
      return embedding;
    } catch {
      // Fall back to simple embedding if Ollama is unavailable
      return this.fallbackEmbedding(text);
    }
  }

  private async generateQueryEmbedding(query: string): Promise<number[]> {
    try {
      // Use NomicEmbedder for real semantic embeddings (returns number[] directly)
      const embedding = await this.embedder.embed(query);
      return embedding;
    } catch {
      // Fall back to simple embedding if Ollama is unavailable
      return this.fallbackEmbedding(query);
    }
  }

  private fallbackEmbedding(text: string): number[] {
    // Fallback pseudo-embedding when Ollama is unavailable
    const embedding = new Array(this.config.embeddingDimension).fill(0);
    const words = text.toLowerCase().split(/\s+/);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      for (let j = 0; j < word.length && j < embedding.length; j++) {
        embedding[(i + j) % embedding.length] += word.charCodeAt(j) / 1000;
      }
    }

    const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0)) || 1;
    return embedding.map((v) => v / magnitude);
  }

  private pathToNodeId(path: string): string {
    return path.replace(/[/\\]/g, ':').replace(/\./g, '_');
  }

  /**
   * Resolve an import specifier to a concrete file path (#511).
   *
   * Relative specifiers ('./math', '../util') are resolved against the
   * importing file's directory and probed for the usual TS/JS extensions and
   * index files, so the resulting node id matches the imported file's node.
   * Bare package specifiers ('react', '@scope/pkg') are returned unchanged and
   * become external dependency nodes.
   */
  private resolveImportPath(importPath: string, fromFile: string): string {
    if (!importPath.startsWith('.')) {
      return importPath;
    }

    const base = resolvePath(dirname(fromFile), importPath);
    const candidates = [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      `${base}.js`,
      `${base}.jsx`,
      `${base}.mjs`,
      `${base}.cjs`,
      joinPath(base, 'index.ts'),
      joinPath(base, 'index.tsx'),
      joinPath(base, 'index.js'),
      joinPath(base, 'index.jsx'),
    ];

    for (const candidate of candidates) {
      try {
        if (existsSync(candidate) && statSync(candidate).isFile()) {
          return candidate;
        }
      } catch {
        // ignore unreadable candidates and keep probing
      }
    }

    // Fall back to a '.ts' sibling so extensionless imports still link to a
    // stable node id even when the file cannot be found on disk.
    return `${base}.ts`;
  }

  private nodeIdToPath(nodeId: string): string | null {
    // Reverse the nodeId transformation
    const path = nodeId.replace(/:/g, '/').replace(/_(?=[^_]*$)/, '.');
    return path.includes('/') ? path : null;
  }

  private getFileName(path: string): string {
    return path.split(/[/\\]/).pop() || path;
  }

  private getFileExtension(path: string): string {
    const name = this.getFileName(path);
    const parts = name.split('.');
    return parts.length > 1 ? parts.pop()! : '';
  }

  private getFileType(path: string): string {
    const ext = this.getFileExtension(path);
    const typeMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript-react',
      js: 'javascript',
      jsx: 'javascript-react',
      py: 'python',
      go: 'go',
      java: 'java',
      rs: 'rust',
      rb: 'ruby',
      cs: 'csharp',
      swift: 'swift',
    };
    return typeMap[ext] || 'unknown';
  }

  private matchesLanguage(ext: string, languages: string[]): boolean {
    const langMap: Record<string, string[]> = {
      typescript: ['ts', 'tsx'],
      javascript: ['js', 'jsx'],
      python: ['py'],
      go: ['go'],
      java: ['java'],
      rust: ['rs'],
      csharp: ['cs'],
      swift: ['swift'],
    };

    return languages.some((lang) => {
      const exts = langMap[lang.toLowerCase()] || [lang];
      return exts.includes(ext);
    });
  }

  private isTestFile(path: string): boolean {
    const testPatterns = [
      /\.test\.[tj]sx?$/,
      /\.spec\.[tj]sx?$/,
      /_test\.[tj]sx?$/,
      /test_.*\.py$/,
      /.*_test\.py$/,
      /.*_test\.go$/,
    ];

    return testPatterns.some((pattern) => pattern.test(path));
  }

  /**
   * Dispose of all resources and clear caches.
   * Call this method when the service is no longer needed.
   */
  destroy(): void {
    this.nodeCache.clear();
    this.edgeIndex.clear();
  }
}

/**
 * Extracted entity from source code
 */
interface ExtractedEntity {
  type: 'class' | 'function' | 'interface' | 'type' | 'variable' | 'module';
  name: string;
  line: number;
  visibility: 'public' | 'private' | 'protected';
  isAsync: boolean;
}

// ============================================================================
// ADR-051: LLM-Extracted Relationship Types
// ============================================================================

/**
 * Semantic relationship between code entities
 */
interface SemanticRelationship {
  source: string;
  target: string;
  type: 'inherits' | 'implements' | 'composes' | 'depends-on' | 'collaborates' | 'uses' | 'creates';
  description: string;
}

/**
 * Detected design pattern
 */
interface DetectedDesignPattern {
  pattern: string;
  participants: string[];
  location: string;
  confidence: number;
}

/**
 * Architectural boundary or layer
 */
interface ArchitecturalBoundary {
  name: string;
  type: 'layer' | 'module' | 'domain';
  entities: string[];
}

/**
 * Dependency impact analysis result
 */
interface DependencyImpact {
  entity: string;
  impactedBy: string[];
  impacts: string[];
  severity: 'low' | 'medium' | 'high';
}

/**
 * Complete LLM-extracted relationships result
 */
interface LLMExtractedRelationships {
  semanticRelationships: SemanticRelationship[];
  designPatterns: DetectedDesignPattern[];
  architecturalBoundaries: ArchitecturalBoundary[];
  dependencyImpacts: DependencyImpact[];
}
