/**
 * Code Intelligence Configuration Module
 *
 * Central export point for all configuration-related functionality.
 */

export {
  type CodeIntelligenceConfig,
  defaultConfig,
  getConfig,
  validateConfig,
  getDatabaseConnectionString,
} from './environment.js';

// Database schema exports
export * from './database-schema.js';

export {
  CODE_INTELLIGENCE_SCHEMA,
  HYBRID_SEARCH_DEFAULTS,
  EMBEDDING_DIMENSIONS,
  CONFIDENCE_THRESHOLDS,
  CHUNK_SIZE_LIMITS,
} from './database-schema.js';

export type {
  ChunkType,
  EntityType,
  RelationshipType,
  Language,
  CodeChunk,
  CodeEntity,
  EntityRelationship,
  InsertCodeChunk,
  UpdateCodeChunk,
  InsertCodeEntity,
  UpdateCodeEntity,
  InsertEntityRelationship,
  UpdateEntityRelationship,
  HybridSearchResult,
  CodeEntityWithRelationships,
  GraphNode,
  GraphEdge,
} from './database-schema.js';
