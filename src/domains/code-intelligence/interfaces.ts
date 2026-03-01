/**
 * Agentic QE v3 - Code Intelligence Domain Interface
 * Knowledge Graph, semantic search, impact analysis
 */

import { Result, Severity } from '../../shared/types';

// ============================================================================
// Domain API
// ============================================================================

export interface CodeIntelligenceAPI {
  /** Index codebase into Knowledge Graph */
  index(request: IndexRequest): Promise<Result<IndexResult, Error>>;

  /** Semantic code search (O(log n) with HNSW) */
  search(request: SearchRequest): Promise<Result<SearchResults, Error>>;

  /** Analyze change impact */
  analyzeImpact(request: ImpactRequest): Promise<Result<ImpactAnalysis, Error>>;

  /** Map dependencies */
  mapDependencies(request: DependencyRequest): Promise<Result<DependencyMap, Error>>;

  /** Query Knowledge Graph */
  queryKG(request: KGQueryRequest): Promise<Result<KGQueryResult, Error>>;
}

// ============================================================================
// Request/Response Types
// ============================================================================

export interface IndexRequest {
  paths: string[];
  incremental?: boolean;
  includeTests?: boolean;
  languages?: string[];
}

export interface IndexResult {
  filesIndexed: number;
  nodesCreated: number;
  edgesCreated: number;
  duration: number;
  errors: IndexError[];
}

export interface IndexError {
  file: string;
  error: string;
  line?: number;
}

export interface SearchRequest {
  query: string;
  type: 'semantic' | 'exact' | 'fuzzy';
  scope?: string[];
  limit?: number;
  filters?: SearchFilter[];
}

export interface SearchFilter {
  field: string;
  operator: 'eq' | 'contains' | 'gt' | 'lt';
  value: unknown;
}

export interface SearchResults {
  results: SearchResult[];
  total: number;
  searchTime: number;
}

export interface SearchResult {
  file: string;
  line?: number;
  snippet: string;
  score: number;
  highlights: string[];
  metadata?: Record<string, unknown>;
}

export interface ImpactRequest {
  changedFiles: string[];
  depth?: number;
  includeTests?: boolean;
}

export interface ImpactAnalysis {
  directImpact: ImpactedFile[];
  transitiveImpact: ImpactedFile[];
  impactedTests: string[];
  riskLevel: Severity;
  recommendations: string[];
}

export interface ImpactedFile {
  file: string;
  reason: string;
  distance: number;
  riskScore: number;
}

export interface DependencyRequest {
  files: string[];
  direction: 'incoming' | 'outgoing' | 'both';
  depth?: number;
}

export interface DependencyMap {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  cycles: string[][];
  metrics: DependencyMetrics;
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

export interface DependencyMetrics {
  totalNodes: number;
  totalEdges: number;
  avgDegree: number;
  maxDepth: number;
  cyclomaticComplexity: number;
}

export interface KGQueryRequest {
  query: string;
  type: 'cypher' | 'natural-language';
  limit?: number;
}

export interface KGQueryResult {
  nodes: KGNode[];
  edges: KGEdge[];
  metadata: Record<string, unknown>;
}

export interface KGNode {
  id: string;
  label: string;
  properties: Record<string, unknown>;
}

export interface KGEdge {
  source: string;
  target: string;
  type: string;
  properties?: Record<string, unknown>;
}
