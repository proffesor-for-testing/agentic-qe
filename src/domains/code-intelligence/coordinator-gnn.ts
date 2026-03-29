/**
 * Code Intelligence - GNN Integration
 * Extracted from coordinator.ts for CQ-004 (file size reduction)
 *
 * Contains: GNN embedding indexing, code embedding generation, GNN search
 */

import { LoggerFactory } from '../../logging/index.js';
import {
  QEGNNEmbeddingIndex,
  QEGNNIndexFactory,
  initGNN,
} from '../../integrations/ruvector/wrappers';
import type {
  IEmbedding,
  EmbeddingNamespace,
} from '../../integrations/embeddings/base/types';
import type { ImpactRequest, SearchResult } from './interfaces';
import { FileReader } from '../../shared/io';
import {
  isGraphMAEEnabled,
  isColdTierGNNEnabled,
  createGraphMAEEncoder,
  createColdTierTrainer,
  InMemoryGraph,
  type QEGraph,
  type GraphMAEEncoder,
  type ColdTierTrainer,
} from '../../integrations/ruvector/index.js';

/**
 * Initialize GNN for code graph embeddings
 */
const logger = LoggerFactory.create('code-intelligence/gnn');

export function initializeGNNIndex(domainKey: string): QEGNNEmbeddingIndex {
  initGNN();
  const gnnIndex = QEGNNIndexFactory.getInstance(domainKey, {
    M: 16,
    efConstruction: 200,
    efSearch: 50,
    dimension: 384,
    metric: 'cosine',
  });
  gnnIndex.initializeIndex('code' as EmbeddingNamespace);
  gnnIndex.initializeIndex('test' as EmbeddingNamespace);
  return gnnIndex;
}

/**
 * Index code embeddings in GNN for fast similarity search
 */
export async function indexCodeEmbeddings(
  gnnIndex: QEGNNEmbeddingIndex,
  fileReader: FileReader,
  paths: string[]
): Promise<void> {
  try {
    for (const path of paths) {
      try {
        const result = await fileReader.readFile(path);
        if (result.success && result.value) {
          const embedding = await generateCodeEmbedding(path, result.value);

          const embeddingObj: IEmbedding = {
            vector: embedding,
            dimension: 384,
            namespace: 'code' as EmbeddingNamespace,
            text: result.value.slice(0, 1000),
            timestamp: Date.now(),
            quantization: 'none',
            metadata: { path },
          };

          gnnIndex.addEmbedding(embeddingObj);
        }
      } catch (error) {
        logger.error(`Failed to index ${path}:`, error instanceof Error ? error : undefined);
      }
    }

    logger.info(`Indexed ${paths.length} code embeddings`);
  } catch (error) {
    logger.error('Failed to index code embeddings:', error instanceof Error ? error : undefined);
  }
}

// R4: GraphMAE singleton encoder (lazy-initialized)
let graphMAEEncoder: GraphMAEEncoder | null = null;

/**
 * R4: Generate graph-aware embeddings for a set of files using GraphMAE.
 * Builds a dependency graph from import relationships and uses masked
 * autoencoders to produce structure-aware embeddings.
 * Falls back to feature-hash embeddings when GraphMAE is disabled.
 */
export async function generateGraphMAEEmbeddings(
  fileReader: FileReader,
  paths: string[]
): Promise<Map<string, number[]>> {
  const embeddings = new Map<string, number[]>();

  if (!isGraphMAEEnabled() || paths.length < 2) {
    // Fallback: use feature-hash for each file independently
    for (const p of paths) {
      const result = await fileReader.readFile(p);
      if (result.success && result.value) {
        embeddings.set(p, await generateCodeEmbedding(p, result.value));
      }
    }
    return embeddings;
  }

  try {
    // Build QEGraph: nodes are files, edges are import dependencies
    const nodes = new Map<string, Float32Array>();
    const edges = new Map<string, string[]>();
    const contentCache = new Map<string, string>();

    for (const p of paths) {
      const result = await fileReader.readFile(p);
      if (result.success && result.value) {
        contentCache.set(p, result.value);
        const featureVec = await generateCodeEmbedding(p, result.value);
        nodes.set(p, new Float32Array(featureVec.slice(0, 32)));
        // Extract import targets as edges
        const imports = result.value.match(/from\s+['"]([^'"]+)['"]/g) ?? [];
        const targets = imports
          .map(m => m.replace(/from\s+['"]/, '').replace(/['"]$/, ''))
          .filter(t => paths.some(pp => pp.includes(t.replace(/^\.\//, ''))));
        edges.set(p, targets.length > 0 ? targets : []);
      }
    }

    if (nodes.size < 2) {
      // Not enough nodes for meaningful graph learning
      for (const [p, content] of contentCache) {
        embeddings.set(p, await generateCodeEmbedding(p, content));
      }
      return embeddings;
    }

    const graph: QEGraph = { nodes, edges };

    if (!graphMAEEncoder) {
      graphMAEEncoder = createGraphMAEEncoder({ embeddingDim: 128, numHeads: 4 });
    }

    const graphEmbeddings = graphMAEEncoder.embed(graph);
    for (const [nodeId, emb] of graphEmbeddings) {
      embeddings.set(nodeId, Array.from(emb));
    }

    logger.info(`[R4] GraphMAE generated ${graphEmbeddings.size} graph-aware embeddings`);
  } catch (error) {
    logger.error('[R4] GraphMAE embedding failed, using feature-hash fallback:', error instanceof Error ? error : undefined);
    for (const p of paths) {
      const result = await fileReader.readFile(p);
      if (result.success && result.value) {
        embeddings.set(p, await generateCodeEmbedding(p, result.value));
      }
    }
  }

  return embeddings;
}

/**
 * Generate code embedding using semantic features
 */
export async function generateCodeEmbedding(
  path: string,
  content: string
): Promise<number[]> {
  const features: number[] = [];

  const ext = path.split('.').pop();
  const typeHash = hashCode(ext || '');
  features.push((typeHash % 1000) / 1000);

  features.push(Math.min(1, content.length / 10000));

  const functionMatches = content.match(/function\s+\w+/g) || [];
  const classMatches = content.match(/class\s+\w+/g) || [];
  features.push(Math.min(1, (functionMatches.length + classMatches.length) / 50));

  const importMatches = content.match(/import\s+.*from|require\s*\(/g) || [];
  features.push(Math.min(1, importMatches.length / 20));

  const loopMatches = content.match(/for\s*\(|while\s*\(/g) || [];
  const ifMatches = content.match(/if\s*\(/g) || [];
  features.push(Math.min(1, (loopMatches.length + ifMatches.length) / 30));

  const commentMatches = content.match(/\/\/.*|\/\*[\s\S]*?\*\//g) || [];
  features.push(Math.min(1, commentMatches.length / 50));

  const contentHash = hashCode(content.slice(0, 500));
  for (let i = features.length; i < 384; i++) {
    features.push(((contentHash * (i + 1)) % 10000) / 10000);
  }

  return features.slice(0, 384);
}

/**
 * Search code with GNN for enhanced similarity
 */
export async function searchCodeWithGNN(
  gnnIndex: QEGNNEmbeddingIndex,
  query: string
): Promise<Array<{ file: string; similarity: number }>> {
  try {
    const queryEmbedding = await generateCodeEmbedding('query', query);

    const queryIEmbedding: IEmbedding = {
      vector: queryEmbedding,
      dimension: 384,
      namespace: 'code' as EmbeddingNamespace,
      text: query,
      timestamp: Date.now(),
      quantization: 'none',
    };

    const results = gnnIndex.search(queryIEmbedding, {
      limit: 10,
      namespace: 'code' as EmbeddingNamespace,
    });

    return results.map((r: { id: number; distance: number; metadata?: { path?: string } }) => ({
      file: r.metadata?.path ?? `file-${r.id}`,
      similarity: 1 - r.distance,
    }));
  } catch (error) {
    logger.error('Failed to search with GNN:', error instanceof Error ? error : undefined);
    return [];
  }
}

/**
 * Enhance impact analysis with GNN semantic similarity
 */
export async function enhanceImpactAnalysisWithGNN(
  gnnIndex: QEGNNEmbeddingIndex,
  fileReader: FileReader,
  request: ImpactRequest
): Promise<void> {
  try {
    for (const changedFile of request.changedFiles) {
      const result = await fileReader.readFile(changedFile);
      if (result.success && result.value) {
        const embedding = await generateCodeEmbedding(changedFile, result.value);

        const embeddingObj: IEmbedding = {
          vector: embedding,
          dimension: 384,
          namespace: 'code' as EmbeddingNamespace,
          text: result.value.slice(0, 1000),
          timestamp: Date.now(),
          quantization: 'none',
          metadata: { path: changedFile },
        };

        const similar = gnnIndex.search(embeddingObj, {
          limit: 5,
          namespace: 'code' as EmbeddingNamespace,
        });

        logger.info(`Found ${similar.length} semantically similar files to ${changedFile}`);
      }
    }
  } catch (error) {
    logger.error('Failed to enhance impact analysis:', error instanceof Error ? error : undefined);
  }
}

/**
 * Merge search results from semantic search and GNN
 */
export function mergeSearchResults(
  semanticResults: SearchResult[],
  gnnResults: Array<{ file: string; similarity: number }>
): SearchResult[] {
  const scoreMap = new Map<string, number>();
  const resultMap = new Map<string, SearchResult>();

  for (const result of semanticResults) {
    scoreMap.set(result.file, result.score);
    resultMap.set(result.file, result);
  }

  for (const gnnResult of gnnResults) {
    const existingScore = scoreMap.get(gnnResult.file);
    if (existingScore !== undefined) {
      scoreMap.set(gnnResult.file, (existingScore + gnnResult.similarity) / 2);
    } else {
      scoreMap.set(gnnResult.file, gnnResult.similarity * 0.8);
      resultMap.set(gnnResult.file, {
        file: gnnResult.file,
        snippet: '',
        score: gnnResult.similarity * 0.8,
        highlights: [],
      });
    }
  }

  return Array.from(resultMap.values())
    .map(result => ({
      ...result,
      score: scoreMap.get(result.file) ?? result.score,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}

// R6: ColdTier trainer singleton (lazy-initialized)
let coldTierTrainer: ColdTierTrainer | null = null;

/**
 * R6: Train GNN embeddings with memory-bounded cold-tier training.
 * Uses LRU hotset caching when the graph exceeds hotsetSize, falling
 * back to full in-memory training for small graphs.
 */
export function trainWithColdTier(
  nodeFeatures: Map<number, Float32Array>,
  adjacency: Map<number, number[]>,
  options: { hotsetSize?: number; epochs?: number; hiddenDim?: number } = {}
): { embeddings: Map<number, Float32Array>; loss: number; usedColdTier: boolean } {
  if (!isColdTierGNNEnabled()) {
    return { embeddings: new Map(), loss: 0, usedColdTier: false };
  }

  try {
    if (!coldTierTrainer) {
      coldTierTrainer = createColdTierTrainer({
        hotsetSize: options.hotsetSize ?? 10000,
        epochs: options.epochs ?? 10,
        hiddenDim: options.hiddenDim ?? 64,
      });
    }

    const graph = new InMemoryGraph(nodeFeatures, adjacency);
    const result = coldTierTrainer.train(graph);

    logger.info(
      `[R6] ColdTier training: ${graph.nodeCount} nodes, ` +
      `loss=${result.loss.toFixed(4)}, mode=${result.usedInMemoryMode ? 'in-memory' : 'cold-tier'}`
    );

    return {
      embeddings: result.embeddings,
      loss: result.loss,
      usedColdTier: !result.usedInMemoryMode,
    };
  } catch (error) {
    logger.error('[R6] ColdTier training failed:', error instanceof Error ? error : undefined);
    return { embeddings: new Map(), loss: 0, usedColdTier: false };
  }
}

/**
 * Simple hash function for strings
 */
export function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash | 0;
  }
  return Math.abs(hash);
}
