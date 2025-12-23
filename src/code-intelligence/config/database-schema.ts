/**
 * Database Schema Configuration for Code Intelligence System
 *
 * Defines TypeScript types and constants for code_chunks, code_entities,
 * and entity_relationships tables with RuVector embeddings.
 */

// ============================================================================
// Table Names
// ============================================================================

export const CODE_INTELLIGENCE_SCHEMA = {
  tables: {
    codeChunks: 'code_chunks',
    codeEntities: 'code_entities',
    entityRelationships: 'entity_relationships',
  },
  relationshipTypes: [
    'IMPORTS',
    'TESTS',
    'CALLS',
    'EXTENDS',
    'IMPLEMENTS',
    'DEFINES',
    'REFERENCES',
  ] as const,
} as const;

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Code chunk types representing different code structures
 */
export type ChunkType = 'function' | 'class' | 'module' | 'block' | 'interface' | 'type';

/**
 * Code entity types for parsed code elements
 */
export type EntityType = 'function' | 'class' | 'method' | 'interface' | 'variable' | 'type' | 'module';

/**
 * Relationship types between code entities
 */
export type RelationshipType = typeof CODE_INTELLIGENCE_SCHEMA.relationshipTypes[number];

/**
 * Programming languages supported
 */
export type Language = 'typescript' | 'javascript' | 'python' | 'java' | 'go' | 'rust' | 'csharp' | 'cpp' | 'other';

// ============================================================================
// Database Row Interfaces
// ============================================================================

/**
 * code_chunks table row
 * Stores code chunks with RuVector embeddings for semantic search
 */
export interface CodeChunk {
  id: string;
  file_path: string;
  chunk_type: ChunkType | null;
  name: string | null;
  line_start: number | null;
  line_end: number | null;
  content: string;
  language: Language | null;
  embedding: number[] | null;  // RuVector 768-dim array
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

/**
 * code_entities table row
 * Stores parsed code entities (functions, classes, methods)
 */
export interface CodeEntity {
  id: string;
  file_path: string;
  entity_type: EntityType;
  name: string;
  signature: string | null;
  line_start: number | null;
  line_end: number | null;
  language: Language | null;
  parent_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

/**
 * entity_relationships table row
 * Stores relationships between code entities for graph analysis
 */
export interface EntityRelationship {
  id: number;
  source_id: string;
  target_id: string;
  relationship_type: RelationshipType;
  confidence: number;
  metadata: Record<string, unknown>;
  created_at: Date;
}

// ============================================================================
// Insert/Update DTOs (Data Transfer Objects)
// ============================================================================

/**
 * DTO for inserting a new code chunk
 */
export interface InsertCodeChunk {
  id: string;
  file_path: string;
  chunk_type?: ChunkType;
  name?: string;
  line_start?: number;
  line_end?: number;
  content: string;
  language?: Language;
  embedding?: number[];
  metadata?: Record<string, unknown>;
}

/**
 * DTO for updating a code chunk
 */
export interface UpdateCodeChunk {
  chunk_type?: ChunkType;
  name?: string;
  line_start?: number;
  line_end?: number;
  content?: string;
  language?: Language;
  embedding?: number[];
  metadata?: Record<string, unknown>;
}

/**
 * DTO for inserting a new code entity
 */
export interface InsertCodeEntity {
  id: string;
  file_path: string;
  entity_type: EntityType;
  name: string;
  signature?: string;
  line_start?: number;
  line_end?: number;
  language?: Language;
  parent_id?: string;
  metadata?: Record<string, unknown>;
}

/**
 * DTO for updating a code entity
 */
export interface UpdateCodeEntity {
  file_path?: string;
  entity_type?: EntityType;
  name?: string;
  signature?: string;
  line_start?: number;
  line_end?: number;
  language?: Language;
  parent_id?: string;
  metadata?: Record<string, unknown>;
}

/**
 * DTO for inserting a new entity relationship
 */
export interface InsertEntityRelationship {
  source_id: string;
  target_id: string;
  relationship_type: RelationshipType;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

/**
 * DTO for updating an entity relationship
 */
export interface UpdateEntityRelationship {
  relationship_type?: RelationshipType;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Query Result Interfaces
// ============================================================================

/**
 * Result from hybrid_code_search function
 */
export interface HybridSearchResult {
  id: string;
  file_path: string;
  chunk_type: ChunkType | null;
  name: string | null;
  content: string;
  semantic_score: number;
  keyword_score: number;
  hybrid_score: number;
}

/**
 * Code entity with relationships
 */
export interface CodeEntityWithRelationships extends CodeEntity {
  outgoing_relationships: EntityRelationship[];
  incoming_relationships: EntityRelationship[];
}

/**
 * Graph node representation for visualization
 */
export interface GraphNode {
  id: string;
  label: string;
  type: EntityType;
  file_path: string;
  metadata: Record<string, unknown>;
}

/**
 * Graph edge representation for visualization
 */
export interface GraphEdge {
  source: string;
  target: string;
  relationship: RelationshipType;
  confidence: number;
}

// ============================================================================
// Constants and Defaults
// ============================================================================

/**
 * Default hybrid search weights
 */
export const HYBRID_SEARCH_DEFAULTS = {
  semanticWeight: 0.7,
  keywordWeight: 0.3,
  limitCount: 10,
} as const;

/**
 * RuVector embedding dimensions
 */
export const EMBEDDING_DIMENSIONS = 768;

/**
 * Confidence thresholds for relationships
 */
export const CONFIDENCE_THRESHOLDS = {
  high: 0.9,
  medium: 0.7,
  low: 0.5,
} as const;

/**
 * Chunk size limits (characters)
 */
export const CHUNK_SIZE_LIMITS = {
  min: 50,
  max: 8000,
  optimal: 2000,
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validates if a relationship type is valid
 */
export function isValidRelationshipType(type: string): type is RelationshipType {
  return CODE_INTELLIGENCE_SCHEMA.relationshipTypes.includes(type as RelationshipType);
}

/**
 * Validates if a chunk type is valid
 */
export function isValidChunkType(type: string): type is ChunkType {
  const validTypes: ChunkType[] = ['function', 'class', 'module', 'block', 'interface', 'type'];
  return validTypes.includes(type as ChunkType);
}

/**
 * Validates if an entity type is valid
 */
export function isValidEntityType(type: string): type is EntityType {
  const validTypes: EntityType[] = ['function', 'class', 'method', 'interface', 'variable', 'type', 'module'];
  return validTypes.includes(type as EntityType);
}

/**
 * Validates if a language is valid
 */
export function isValidLanguage(lang: string): lang is Language {
  const validLanguages: Language[] = ['typescript', 'javascript', 'python', 'java', 'go', 'rust', 'csharp', 'cpp', 'other'];
  return validLanguages.includes(lang as Language);
}

/**
 * Generates a unique ID for a code chunk
 */
export function generateChunkId(filePath: string, lineStart: number, lineEnd: number): string {
  const hash = `${filePath}:${lineStart}-${lineEnd}`;
  return Buffer.from(hash).toString('base64url').substring(0, 32);
}

/**
 * Generates a unique ID for a code entity
 */
export function generateEntityId(filePath: string, entityType: EntityType, name: string): string {
  const hash = `${filePath}:${entityType}:${name}`;
  return Buffer.from(hash).toString('base64url').substring(0, 32);
}
