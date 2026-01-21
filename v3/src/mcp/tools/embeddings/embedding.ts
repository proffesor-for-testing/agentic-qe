/**
 * Agentic QE v3 - ONNX Embedding MCP Tool
 * ADR-051: Exposes ONNX embeddings through MCP for production use
 *
 * This tool enables semantic search and similarity operations
 * using local ONNX model inference.
 */

import { MCPToolBase, MCPToolConfig, MCPToolContext } from '../base';
import { ToolResult } from '../../types';
import {
  createONNXEmbeddingsAdapter,
  ONNXEmbeddingsAdapter,
  EmbeddingModel,
  SimilarityMetric,
} from '../../../integrations/agentic-flow/onnx-embeddings';

// ============================================================================
// Types
// ============================================================================

export interface EmbeddingGenerateParams {
  [key: string]: unknown;
  /** Text to generate embedding for */
  text: string;
  /** Whether to use hyperbolic space (for hierarchical data) */
  hyperbolic?: boolean;
}

export interface EmbeddingGenerateResult {
  /** The generated embedding vector */
  embedding: number[];
  /** Embedding dimension */
  dimension: number;
  /** Whether hyperbolic transformation was applied */
  isHyperbolic: boolean;
  /** Generation time in ms */
  latencyMs: number;
  /** Model used */
  model: string;
}

export interface EmbeddingCompareParams {
  [key: string]: unknown;
  /** First text */
  text1: string;
  /** Second text */
  text2: string;
  /** Similarity metric to use */
  metric?: 'cosine' | 'euclidean' | 'poincare';
}

export interface EmbeddingCompareResult {
  /** Similarity score (0-1 for cosine, unbounded for euclidean) */
  similarity: number;
  /** Metric used */
  metric: string;
  /** Whether texts are semantically similar (>0.7 threshold) */
  isSimilar: boolean;
  /** Latency in ms */
  latencyMs: number;
}

export interface EmbeddingSearchParams {
  [key: string]: unknown;
  /** Query text to search for */
  query: string;
  /** Namespace to search in */
  namespace?: string;
  /** Number of results to return */
  topK?: number;
  /** Minimum similarity threshold */
  threshold?: number;
}

export interface EmbeddingSearchResult {
  /** Search results */
  results: Array<{
    text: string;
    score: number;
    metadata?: Record<string, unknown>;
  }>;
  /** Total results found */
  totalFound: number;
  /** Search latency in ms */
  latencyMs: number;
}

export interface EmbeddingStoreParams {
  [key: string]: unknown;
  /** Text to store */
  text: string;
  /** Optional ID (generated if not provided) */
  id?: string;
  /** Namespace for organization */
  namespace?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface EmbeddingStoreResult {
  /** Stored embedding ID */
  id: string;
  /** Namespace stored in */
  namespace: string;
  /** Store latency in ms */
  latencyMs: number;
}

export interface EmbeddingStatsResult {
  /** Total embeddings generated */
  totalGenerated: number;
  /** Vectors currently stored */
  vectorsStored: number;
  /** Cache statistics */
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
  };
  /** Model information */
  model: {
    name: string;
    dimension: number;
  };
  /** Health status */
  healthy: boolean;
}

// ============================================================================
// Singleton Adapter Management
// ============================================================================

let embeddingAdapter: ONNXEmbeddingsAdapter | null = null;
let adapterInitPromise: Promise<ONNXEmbeddingsAdapter> | null = null;

/**
 * Get or create the ONNX embedding adapter singleton
 */
async function getEmbeddingAdapter(): Promise<ONNXEmbeddingsAdapter> {
  if (embeddingAdapter) {
    return embeddingAdapter;
  }

  if (adapterInitPromise) {
    return adapterInitPromise;
  }

  adapterInitPromise = (async () => {
    const adapter = createONNXEmbeddingsAdapter({
      embedding: {
        model: EmbeddingModel.MINI_LM_L6,
        cacheSize: 1000,
        normalize: true,
        hyperbolic: false,
        curvature: -1,
      },
      autoInitialize: false,
    });

    await adapter.initialize();
    embeddingAdapter = adapter;
    console.error('[EmbeddingTool] ONNX adapter initialized');
    return adapter;
  })();

  return adapterInitPromise;
}

/**
 * Reset the embedding adapter (for testing)
 */
export function resetEmbeddingAdapter(): void {
  if (embeddingAdapter) {
    embeddingAdapter.reset();
    embeddingAdapter = null;
  }
  adapterInitPromise = null;
}

// ============================================================================
// Embedding Generate Tool
// ============================================================================

export class EmbeddingGenerateTool extends MCPToolBase<
  EmbeddingGenerateParams,
  EmbeddingGenerateResult
> {
  readonly config: MCPToolConfig = {
    name: 'qe/embeddings/generate',
    description: 'Generate a vector embedding for text using local ONNX model',
    domain: 'learning-optimization',
    schema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to generate embedding for',
          minLength: 1,
          maxLength: 10000,
        },
        hyperbolic: {
          type: 'boolean',
          description: 'Use hyperbolic space for hierarchical data',
          default: false,
        },
      },
      required: ['text'],
    },
  };

  async execute(
    params: EmbeddingGenerateParams,
    context: MCPToolContext
  ): Promise<ToolResult<EmbeddingGenerateResult>> {
    const startTime = performance.now();

    try {
      const adapter = await getEmbeddingAdapter();

      let embedding = await adapter.generateEmbedding(params.text);

      // Apply hyperbolic transformation if requested
      if (params.hyperbolic) {
        embedding = adapter.toHyperbolic(embedding);
      }

      const latencyMs = performance.now() - startTime;

      this.markAsRealData();
      return {
        success: true,
        data: {
          embedding: Array.from(embedding.vector),
          dimension: embedding.dimensions,
          isHyperbolic: embedding.isHyperbolic,
          latencyMs,
          model: embedding.model,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Embedding generation failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

// ============================================================================
// Embedding Compare Tool
// ============================================================================

export class EmbeddingCompareTool extends MCPToolBase<
  EmbeddingCompareParams,
  EmbeddingCompareResult
> {
  readonly config: MCPToolConfig = {
    name: 'qe/embeddings/compare',
    description: 'Compare semantic similarity between two texts',
    domain: 'learning-optimization',
    schema: {
      type: 'object',
      properties: {
        text1: {
          type: 'string',
          description: 'First text to compare',
          minLength: 1,
        },
        text2: {
          type: 'string',
          description: 'Second text to compare',
          minLength: 1,
        },
        metric: {
          type: 'string',
          description: 'Similarity metric',
          enum: ['cosine', 'euclidean', 'poincare'],
          default: 'cosine',
        },
      },
      required: ['text1', 'text2'],
    },
  };

  async execute(
    params: EmbeddingCompareParams,
    context: MCPToolContext
  ): Promise<ToolResult<EmbeddingCompareResult>> {
    const startTime = performance.now();

    try {
      const adapter = await getEmbeddingAdapter();
      const metric = params.metric || 'cosine';

      // Convert string metric to SimilarityMetric enum
      const metricEnum = metric === 'cosine' ? SimilarityMetric.COSINE :
                         metric === 'euclidean' ? SimilarityMetric.EUCLIDEAN :
                         SimilarityMetric.POINCARE;

      const similarity = await adapter.compareSimilarity(
        params.text1,
        params.text2,
        metricEnum
      );

      const latencyMs = performance.now() - startTime;

      this.markAsRealData();
      return {
        success: true,
        data: {
          similarity,
          metric,
          isSimilar: similarity > 0.7,
          latencyMs,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Similarity comparison failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

// ============================================================================
// Embedding Search Tool
// ============================================================================

export class EmbeddingSearchTool extends MCPToolBase<
  EmbeddingSearchParams,
  EmbeddingSearchResult
> {
  readonly config: MCPToolConfig = {
    name: 'qe/embeddings/search',
    description: 'Search for semantically similar texts using vector search',
    domain: 'learning-optimization',
    schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Query text to search for',
          minLength: 1,
        },
        namespace: {
          type: 'string',
          description: 'Namespace to search in',
          default: 'default',
        },
        topK: {
          type: 'number',
          description: 'Number of results to return',
          minimum: 1,
          maximum: 100,
          default: 10,
        },
        threshold: {
          type: 'number',
          description: 'Minimum similarity threshold (0-1)',
          minimum: 0,
          maximum: 1,
          default: 0.5,
        },
      },
      required: ['query'],
    },
  };

  async execute(
    params: EmbeddingSearchParams,
    context: MCPToolContext
  ): Promise<ToolResult<EmbeddingSearchResult>> {
    const startTime = performance.now();

    try {
      const adapter = await getEmbeddingAdapter();

      const results = await adapter.searchByText(params.query, {
        metric: SimilarityMetric.COSINE,
        topK: params.topK || 10,
        threshold: params.threshold || 0.5,
        namespace: params.namespace,
      });

      const latencyMs = performance.now() - startTime;

      this.markAsRealData();
      return {
        success: true,
        data: {
          results: results.map((r) => ({
            text: r.text,
            score: r.score,
            metadata: r.metadata,
          })),
          totalFound: results.length,
          latencyMs,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

// ============================================================================
// Embedding Store Tool
// ============================================================================

export class EmbeddingStoreTool extends MCPToolBase<
  EmbeddingStoreParams,
  EmbeddingStoreResult
> {
  readonly config: MCPToolConfig = {
    name: 'qe/embeddings/store',
    description: 'Store text with its embedding for later retrieval',
    domain: 'learning-optimization',
    schema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to store',
          minLength: 1,
        },
        id: {
          type: 'string',
          description: 'Optional ID for the stored embedding',
        },
        namespace: {
          type: 'string',
          description: 'Namespace for organization',
          default: 'default',
        },
        metadata: {
          type: 'object',
          description: 'Additional metadata to store',
        },
      },
      required: ['text'],
    },
  };

  async execute(
    params: EmbeddingStoreParams,
    context: MCPToolContext
  ): Promise<ToolResult<EmbeddingStoreResult>> {
    const startTime = performance.now();

    try {
      const adapter = await getEmbeddingAdapter();
      const namespace = params.namespace || 'default';

      const stored = await adapter.generateAndStore(params.text, {
        id: params.id,
        namespace,
        customData: params.metadata,
      });

      const latencyMs = performance.now() - startTime;

      this.markAsRealData();
      return {
        success: true,
        data: {
          id: stored.id,
          namespace: stored.namespace || namespace,
          latencyMs,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Store failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

// ============================================================================
// Embedding Stats Tool
// ============================================================================

export class EmbeddingStatsTool extends MCPToolBase<
  Record<string, unknown>,
  EmbeddingStatsResult
> {
  readonly config: MCPToolConfig = {
    name: 'qe/embeddings/stats',
    description: 'Get ONNX embedding system statistics',
    domain: 'learning-optimization',
    schema: {
      type: 'object',
      properties: {},
    },
  };

  async execute(
    params: Record<string, unknown>,
    context: MCPToolContext
  ): Promise<ToolResult<EmbeddingStatsResult>> {
    try {
      const adapter = await getEmbeddingAdapter();
      const stats = adapter.getStats();
      const health = await adapter.getHealth();

      const totalCacheOps = stats.cacheHits + stats.cacheMisses;
      const hitRate = totalCacheOps > 0 ? stats.cacheHits / totalCacheOps : 0;

      this.markAsRealData();
      return {
        success: true,
        data: {
          totalGenerated: stats.totalGenerated,
          vectorsStored: stats.vectorsStored,
          cache: {
            hits: stats.cacheHits,
            misses: stats.cacheMisses,
            hitRate,
          },
          model: {
            name: stats.currentModel,
            dimension: stats.currentModel === EmbeddingModel.MINI_LM_L6 ? 384 : 768,
          },
          healthy: health.available,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Stats failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

// ============================================================================
// Tool Instances
// ============================================================================

export const embeddingGenerateTool = new EmbeddingGenerateTool();
export const embeddingCompareTool = new EmbeddingCompareTool();
export const embeddingSearchTool = new EmbeddingSearchTool();
export const embeddingStoreTool = new EmbeddingStoreTool();
export const embeddingStatsTool = new EmbeddingStatsTool();
