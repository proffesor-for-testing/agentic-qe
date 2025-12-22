/**
 * Type definitions for AST-aware code chunking
 */

export type EntityType = 'function' | 'class' | 'method' | 'module' | 'fragment' | 'interface' | 'type';

export interface CodeChunk {
  id: string;
  content: string;
  filePath: string;
  language: string;
  lineStart: number;
  lineEnd: number;
  tokenCount: number;
  parentEntity?: string;
  entityType: EntityType;
  metadata: Record<string, unknown>;
}

export interface ChunkingResult {
  chunks: CodeChunk[];
  stats: {
    totalChunks: number;
    avgTokens: number;
    minTokens: number;
    maxTokens: number;
    semanticPreservation: number; // % of chunks with complete semantic units
    totalTokens: number;
  };
}

export interface ChunkingConfig {
  minTokens: number; // Default: 256
  maxTokens: number; // Default: 512
  overlapPercent: number; // Default: 15 (15%)
  overlapTokens?: number; // Calculated from overlapPercent or set directly (default: ~50)
  preserveSemanticBoundaries: boolean; // Default: true
  splitLargeEntities: boolean; // Default: true
}

export interface TokenCounter {
  count(text: string): number;
}

export interface ChunkMetadata {
  filePath: string;
  language: string;
  lineStart: number;
  lineEnd: number;
  parentEntity?: string;
  entityType: EntityType;
  signature?: string;
  isComplete: boolean; // true if chunk contains complete semantic unit
  splitIndex?: number; // For large entities split across chunks
  totalSplits?: number; // Total number of splits for this entity
  [key: string]: unknown;
}
