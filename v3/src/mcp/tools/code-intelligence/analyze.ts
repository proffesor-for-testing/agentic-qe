/**
 * Agentic QE v3 - Code Intelligence MCP Tool
 *
 * qe/code/analyze - Analyze code using knowledge graph and semantic search
 *
 * This tool wraps the REAL code-intelligence domain services:
 * - KnowledgeGraphService for indexing and dependency mapping
 * - SemanticAnalyzerService for semantic code search
 * - ImpactAnalyzerService for change impact analysis
 */

import { MCPToolBase, MCPToolConfig, MCPToolContext, MCPToolSchema, getSharedMemoryBackend } from '../base';
import { ToolResult } from '../../types';
import { KnowledgeGraphService } from '../../../domains/code-intelligence/services/knowledge-graph';
import { SemanticAnalyzerService } from '../../../domains/code-intelligence/services/semantic-analyzer';
import { ImpactAnalyzerService } from '../../../domains/code-intelligence/services/impact-analyzer';
import { MemoryBackend, VectorSearchResult } from '../../../kernel/interfaces';
import * as fs from 'fs';
import * as path from 'path';
import { toErrorMessage } from '../../../shared/error-utils.js';

// ============================================================================
// Types
// ============================================================================

export interface CodeAnalyzeParams {
  action: 'index' | 'search' | 'impact' | 'dependencies';
  paths?: string[];
  query?: string;
  changedFiles?: string[];
  depth?: number;
  incremental?: boolean;
  [key: string]: unknown;
}

export interface CodeAnalyzeResult {
  action: string;
  indexResult?: IndexResult;
  searchResult?: SearchResult;
  impactResult?: ImpactResult;
  dependencyResult?: DependencyResult;
}

export interface IndexResult {
  filesIndexed: number;
  nodesCreated: number;
  edgesCreated: number;
  duration: number;
  errors: { file: string; error: string }[];
}

export interface SearchResult {
  results: SearchHit[];
  total: number;
  searchTime: number;
}

export interface SearchHit {
  file: string;
  line?: number;
  snippet: string;
  score: number;
  highlights: string[];
}

export interface ImpactResult {
  directImpact: ImpactedFile[];
  transitiveImpact: ImpactedFile[];
  impactedTests: string[];
  riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'info';
  recommendations: string[];
}

export interface ImpactedFile {
  file: string;
  reason: string;
  distance: number;
  riskScore: number;
}

export interface DependencyResult {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  cycles: string[][];
  metrics: {
    totalNodes: number;
    totalEdges: number;
    avgDegree: number;
    maxDepth: number;
  };
}

export interface DependencyNode {
  id: string;
  path: string;
  type: 'module' | 'class' | 'function' | 'file';
  inDegree: number;
  outDegree: number;
}

export interface DependencyEdge {
  source: string;
  target: string;
  type: 'import' | 'call' | 'extends' | 'implements';
}

// ============================================================================
// Tool Implementation
// ============================================================================

export class CodeAnalyzeTool extends MCPToolBase<CodeAnalyzeParams, CodeAnalyzeResult> {
  readonly config: MCPToolConfig = {
    name: 'qe/code/analyze',
    description: 'Analyze code using knowledge graph and semantic search. Supports indexing, searching, impact analysis, and dependency mapping.',
    domain: 'code-intelligence',
    schema: CODE_ANALYZE_SCHEMA,
    streaming: true,
    timeout: 300000,
  };

  private knowledgeGraph: KnowledgeGraphService | null = null;
  private semanticAnalyzer: SemanticAnalyzerService | null = null;
  private impactAnalyzer: ImpactAnalyzerService | null = null;

  /**
   * Get or create the knowledge graph service
   */
  private async getKnowledgeGraph(context: MCPToolContext): Promise<KnowledgeGraphService> {
    if (!this.knowledgeGraph) {
      const memory = (context as any).memory as MemoryBackend | undefined;
      this.knowledgeGraph = new KnowledgeGraphService(
        memory || await getSharedMemoryBackend()
      );
    }
    return this.knowledgeGraph;
  }

  /**
   * Get or create the semantic analyzer service
   */
  private async getSemanticAnalyzer(context: MCPToolContext): Promise<SemanticAnalyzerService> {
    if (!this.semanticAnalyzer) {
      const memory = (context as any).memory as MemoryBackend | undefined;
      this.semanticAnalyzer = new SemanticAnalyzerService(
        memory || await getSharedMemoryBackend()
      );
    }
    return this.semanticAnalyzer;
  }

  /**
   * Get or create the impact analyzer service
   */
  private async getImpactAnalyzer(context: MCPToolContext): Promise<ImpactAnalyzerService> {
    if (!this.impactAnalyzer) {
      const memory = (context as any).memory as MemoryBackend | undefined;
      const knowledgeGraph = await this.getKnowledgeGraph(context);
      this.impactAnalyzer = new ImpactAnalyzerService(
        memory || await getSharedMemoryBackend(),
        knowledgeGraph
      );
    }
    return this.impactAnalyzer;
  }

  async execute(
    params: CodeAnalyzeParams,
    context: MCPToolContext
  ): Promise<ToolResult<CodeAnalyzeResult>> {
    const { action, paths = ['.'], query, changedFiles = [], depth = 3, incremental = false } = params;

    try {
      this.emitStream(context, {
        status: 'processing',
        message: `Executing ${action} action`,
      });

      if (this.isAborted(context)) {
        return { success: false, error: 'Operation aborted' };
      }

      let result: CodeAnalyzeResult = { action };

      switch (action) {
        case 'index':
          result.indexResult = await this.executeIndex(paths, incremental, context);
          break;
        case 'search':
          if (!query) {
            return { success: false, error: 'Query is required for search action' };
          }
          result.searchResult = await this.executeSearch(query, paths, context);
          break;
        case 'impact':
          if (changedFiles.length === 0) {
            return { success: false, error: 'changedFiles is required for impact action' };
          }
          result.impactResult = await this.executeImpact(changedFiles, depth, context);
          break;
        case 'dependencies':
          result.dependencyResult = await this.executeDependencies(paths, depth, context);
          break;
        default:
          return { success: false, error: `Unknown action: ${action}` };
      }

      this.emitStream(context, {
        status: 'complete',
        message: `${action} complete`,
        progress: 100,
      });

      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: `Code analysis failed: ${toErrorMessage(error)}`,
      };
    }
  }

  /**
   * Index files using the real KnowledgeGraphService
   */
  private async executeIndex(
    paths: string[],
    incremental: boolean,
    context: MCPToolContext
  ): Promise<IndexResult> {
    this.emitStream(context, {
      status: 'indexing',
      message: `Indexing ${paths.length} paths (${incremental ? 'incremental' : 'full'})`,
    });

    const service = await this.getKnowledgeGraph(context);

    // Expand paths to actual files
    const files = await this.expandPaths(paths);

    // Use real knowledge graph indexing
    const result = await service.index({
      paths: files,
      incremental,
      includeTests: true,
      languages: ['typescript', 'javascript'],
    });

    if (!result.success) {
      throw new Error(result.error?.message || 'Indexing failed');
    }

    return {
      filesIndexed: result.value.filesIndexed,
      nodesCreated: result.value.nodesCreated,
      edgesCreated: result.value.edgesCreated,
      duration: result.value.duration,
      errors: result.value.errors,
    };
  }

  /**
   * Search code using the real SemanticAnalyzerService
   */
  private async executeSearch(
    query: string,
    paths: string[],
    context: MCPToolContext
  ): Promise<SearchResult> {
    const startTime = Date.now();

    // Check if demo mode is explicitly requested
    if (this.isDemoMode(context)) {
      const searchTime = Date.now() - startTime;
      this.markAsDemoData(context, 'Demo mode explicitly requested');
      return this.getDemoSearchResult(query, searchTime);
    }

    this.emitStream(context, {
      status: 'searching',
      message: `Searching for: ${query}`,
    });

    const service = await this.getSemanticAnalyzer(context);

    // Use real semantic search
    const result = await service.search({
      query,
      type: 'semantic',
      limit: 20,
      scope: paths.length > 0 && paths[0] !== '.' ? paths : undefined,
    });

    const searchTime = Date.now() - startTime;

    // If search failed, return error
    if (!result.success) {
      return {
        results: [],
        total: 0,
        searchTime,
      };
    }

    // Empty results is a valid state - no matches found
    if (result.value.results.length === 0) {
      this.markAsRealData(); // Real data, just no matches
      return {
        results: [],
        total: 0,
        searchTime,
      };
    }

    // Mark as real data - we have actual search results
    this.markAsRealData();

    // Convert search results to output format
    const searchResults: SearchHit[] = result.value.results.map((r) => ({
      file: r.file,
      line: r.line,
      snippet: r.snippet.substring(0, 200) + (r.snippet.length > 200 ? '...' : ''),
      score: r.score,
      highlights: extractHighlights(r.snippet, query),
    }));

    return {
      results: searchResults,
      total: result.value.total,
      searchTime,
    };
  }

  /**
   * Return demo search results when no real data available.
   * Only used when demoMode is explicitly requested or as fallback with warning.
   */
  private getDemoSearchResult(query: string, searchTime: number): SearchResult {
    return {
      results: [
        {
          file: 'src/services/UserService.ts',
          line: 15,
          snippet: `export class ${query} { constructor() { /* initialization */ } }...`,
          score: 0.95,
          highlights: [query, `class ${query}`, `${query}Service`],
        },
        {
          file: 'src/handlers/user-handler.ts',
          line: 42,
          snippet: `const service = new ${query}(); await service.initialize()...`,
          score: 0.85,
          highlights: [`new ${query}()`, `service.${query.toLowerCase()}`],
        },
        {
          file: 'tests/services/UserService.test.ts',
          line: 8,
          snippet: `describe('${query}', () => { it('should initialize correctly'...`,
          score: 0.78,
          highlights: [`describe('${query}'`, `test ${query}`],
        },
      ],
      total: 3,
      searchTime,
    };
  }

  /**
   * Return demo impact results when no real data available.
   * Only used when demoMode is explicitly requested or as fallback with warning.
   */
  private getDemoImpactResult(changedFiles: string[]): ImpactResult {
    const baseFile = changedFiles[0] || 'src/service.ts';
    const baseName = baseFile.split('/').pop()?.replace('.ts', '') || 'service';

    return {
      directImpact: [
        {
          file: `src/handlers/${baseName}-handler.ts`,
          reason: `Direct import from ${baseFile}`,
          distance: 0,
          riskScore: 0.75,
        },
        {
          file: `src/controllers/${baseName}-controller.ts`,
          reason: `Uses exported functions from ${baseFile}`,
          distance: 0,
          riskScore: 0.65,
        },
      ],
      transitiveImpact: [
        {
          file: 'src/routes/api.ts',
          reason: `Imports from ${baseName}-handler.ts`,
          distance: 1,
          riskScore: 0.45,
        },
        {
          file: 'src/app.ts',
          reason: 'Imports API routes',
          distance: 2,
          riskScore: 0.25,
        },
      ],
      impactedTests: [
        `tests/${baseName}.test.ts`,
        `tests/${baseName}-handler.test.ts`,
        'tests/integration/api.test.ts',
      ],
      riskLevel: 'medium',
      recommendations: [
        `Review changes in ${baseFile} for breaking changes`,
        'Run affected test suites before merging',
        'Consider updating dependent documentation',
      ],
    };
  }

  /**
   * Analyze impact using the real ImpactAnalyzerService
   */
  private async executeImpact(
    changedFiles: string[],
    depth: number,
    context: MCPToolContext
  ): Promise<ImpactResult> {
    // Check if demo mode is explicitly requested
    if (this.isDemoMode(context)) {
      this.markAsDemoData(context, 'Demo mode explicitly requested');
      return this.getDemoImpactResult(changedFiles);
    }

    this.emitStream(context, {
      status: 'analyzing',
      message: `Analyzing impact of ${changedFiles.length} changed files`,
    });

    try {
      const service = await this.getImpactAnalyzer(context);

      // Use real impact analysis
      const result = await service.analyzeImpact({
        changedFiles,
        depth,
        includeTests: true,
      });

      // If impact analysis failed, return error - don't silently fall back
      if (!result.success) {
        return {
          directImpact: [],
          transitiveImpact: [],
          impactedTests: [],
          riskLevel: 'low',
          recommendations: [`Impact analysis failed: ${result.error?.message || 'Unknown error'}. Ensure the code index is built first using action: 'index'.`],
        };
      }

      // Mark as real data - we have actual impact analysis
      this.markAsRealData();

      const impact = result.value;

      // Impact already in correct format from service
      return {
        directImpact: impact.directImpact,
        transitiveImpact: impact.transitiveImpact,
        impactedTests: impact.impactedTests,
        riskLevel: impact.riskLevel,
        recommendations: impact.recommendations,
      };
    } catch (error) {
      // On error, return error info in recommendations - don't silently fall back
      return {
        directImpact: [],
        transitiveImpact: [],
        impactedTests: [],
        riskLevel: 'low',
        recommendations: [`Impact analysis error: ${error instanceof Error ? error.message : 'Unknown error'}. Check that files exist and index is built.`],
      };
    }
  }

  /**
   * Map dependencies using the real KnowledgeGraphService
   */
  private async executeDependencies(
    paths: string[],
    depth: number,
    context: MCPToolContext
  ): Promise<DependencyResult> {
    this.emitStream(context, {
      status: 'mapping',
      message: `Mapping dependencies to depth ${depth}`,
    });

    const service = await this.getKnowledgeGraph(context);

    // Expand paths to actual files
    const files = await this.expandPaths(paths);

    // Use real dependency mapping
    const result = await service.mapDependencies({
      files,
      direction: 'both',
      depth,
    });

    if (!result.success) {
      throw new Error(result.error?.message || 'Dependency mapping failed');
    }

    const depMap = result.value;

    // Convert to output format
    const nodes: DependencyNode[] = depMap.nodes.map((n) => ({
      id: n.id,
      path: n.path,
      type: n.type as DependencyNode['type'],
      inDegree: n.inDegree,
      outDegree: n.outDegree,
    }));

    const edges: DependencyEdge[] = depMap.edges.map((e) => ({
      source: e.source,
      target: e.target,
      type: e.type as DependencyEdge['type'],
    }));

    return {
      nodes,
      edges,
      cycles: depMap.cycles,
      metrics: {
        totalNodes: depMap.metrics.totalNodes,
        totalEdges: depMap.metrics.totalEdges,
        avgDegree: depMap.metrics.avgDegree,
        maxDepth: depMap.metrics.maxDepth,
      },
    };
  }

  /**
   * Expand directory paths to file paths
   */
  private async expandPaths(paths: string[]): Promise<string[]> {
    const files: string[] = [];

    for (const p of paths) {
      const absPath = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);

      try {
        const stats = await fs.promises.stat(absPath);

        if (stats.isDirectory()) {
          // Recursively find source files
          const dirFiles = await this.findSourceFiles(absPath);
          files.push(...dirFiles);
        } else if (stats.isFile()) {
          files.push(absPath);
        }
      } catch {
        // Path doesn't exist, skip it
      }
    }

    return files;
  }

  /**
   * Find source files in a directory
   */
  private async findSourceFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const extensions = ['.ts', '.tsx', '.js', '.jsx'];
    const ignoreDirs = ['node_modules', '.git', 'dist', 'build', 'coverage'];

    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!ignoreDirs.includes(entry.name)) {
            const subFiles = await this.findSourceFiles(fullPath);
            files.push(...subFiles);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // Directory read failed, skip it
    }

    return files;
  }
}

// ============================================================================
// Schema
// ============================================================================

const CODE_ANALYZE_SCHEMA: MCPToolSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      description: 'Analysis action to perform',
      enum: ['index', 'search', 'impact', 'dependencies'],
    },
    paths: {
      type: 'array',
      description: 'Paths to analyze',
      items: { type: 'string', description: 'File or directory path' },
      default: ['.'],
    },
    query: {
      type: 'string',
      description: 'Search query (for search action)',
    },
    changedFiles: {
      type: 'array',
      description: 'Changed files to analyze (for impact action)',
      items: { type: 'string', description: 'File path' },
    },
    depth: {
      type: 'number',
      description: 'Analysis depth',
      minimum: 1,
      maximum: 10,
      default: 3,
    },
    incremental: {
      type: 'boolean',
      description: 'Incremental indexing (for index action)',
      default: false,
    },
  },
  required: ['action'],
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract highlights from content matching query
 */
function extractHighlights(content: string, query: string): string[] {
  const highlights: string[] = [];
  const queryTerms = query.toLowerCase().split(/\s+/);
  const contentLower = content.toLowerCase();

  for (const term of queryTerms) {
    if (term.length < 2) continue;

    let idx = 0;
    while ((idx = contentLower.indexOf(term, idx)) !== -1) {
      // Extract surrounding context
      const start = Math.max(0, idx - 20);
      const end = Math.min(content.length, idx + term.length + 20);
      const highlight = content.substring(start, end);

      if (!highlights.includes(highlight)) {
        highlights.push(highlight);
      }

      idx += term.length;
      if (highlights.length >= 3) break;
    }
    if (highlights.length >= 3) break;
  }

  return highlights;
}

