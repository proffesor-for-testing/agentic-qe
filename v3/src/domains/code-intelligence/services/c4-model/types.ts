/**
 * Agentic QE v3 - C4 Model Types
 * Type definitions for C4 architecture diagrams
 *
 * C4 Model Hierarchy:
 * - Level 1: Context - System boundaries and external actors
 * - Level 2: Container - Applications, databases, and services
 * - Level 3: Component - Internal structure of containers
 */

import type { Severity, Priority } from '../../../../shared/types';

// ============================================================================
// C4 Base Types
// ============================================================================

/**
 * Base interface for all C4 elements
 */
export interface C4Element {
  /** Unique identifier (sanitized for Mermaid) */
  id: string;
  /** Display name */
  name: string;
  /** Human-readable description */
  description: string;
  /** Technology stack or implementation details */
  technology?: string;
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Relationship between C4 elements
 */
export interface C4Relationship {
  /** Source element ID */
  sourceId: string;
  /** Target element ID */
  targetId: string;
  /** Description of the relationship */
  description: string;
  /** Technology/protocol used (e.g., "REST", "gRPC", "SQL") */
  technology?: string;
  /** Relationship type for categorization */
  type?: C4RelationshipType;
  /** Tags for filtering */
  tags?: string[];
}

export type C4RelationshipType =
  | 'uses'
  | 'calls'
  | 'reads_from'
  | 'writes_to'
  | 'sends_to'
  | 'receives_from'
  | 'authenticates_with'
  | 'depends_on'
  | 'implements'
  | 'extends';

// ============================================================================
// C4 Level 1: Context Diagram Types
// ============================================================================

/**
 * Person/Actor in the C4 Context diagram
 * Represents users or roles that interact with the system
 */
export interface C4Person extends C4Element {
  /** Type discriminator */
  elementType: 'person';
  /** Whether this is an external actor */
  external?: boolean;
}

/**
 * System in the C4 Context diagram
 * Can be the main system or external systems
 */
export interface C4System extends C4Element {
  /** Type discriminator */
  elementType: 'system';
  /** Whether this is an external system */
  external: boolean;
  /** System type classification */
  systemType?: SystemType;
}

export type SystemType =
  | 'web_application'
  | 'mobile_application'
  | 'api'
  | 'database'
  | 'message_queue'
  | 'cache'
  | 'storage'
  | 'monitoring'
  | 'authentication'
  | 'third_party'
  | 'microservice'
  | 'monolith'
  | 'library'
  | 'cli';

/**
 * C4 Context Diagram definition
 * Shows the system in context with users and external systems
 */
export interface C4ContextDiagram {
  /** Diagram title */
  title: string;
  /** Main system being described */
  system: C4System;
  /** Persons/actors interacting with the system */
  persons: C4Person[];
  /** External systems the main system interacts with */
  externalSystems: C4System[];
  /** Relationships between elements */
  relationships: C4Relationship[];
  /** Diagram metadata */
  metadata: C4DiagramMetadata;
}

// ============================================================================
// C4 Level 2: Container Diagram Types
// ============================================================================

/**
 * Container in the C4 Container diagram
 * Represents an application, service, database, or data store
 */
export interface C4Container extends C4Element {
  /** Type discriminator */
  elementType: 'container';
  /** Container type classification */
  containerType: ContainerType;
  /** Whether this is external to the system boundary */
  external?: boolean;
  /** Port number if applicable */
  port?: number;
  /** Container dependencies */
  dependencies?: string[];
}

export type ContainerType =
  | 'web_application'
  | 'mobile_application'
  | 'single_page_application'
  | 'desktop_application'
  | 'api_application'
  | 'serverless_function'
  | 'microservice'
  | 'console_application'
  | 'database'
  | 'file_system'
  | 'cache'
  | 'message_queue'
  | 'search_index'
  | 'blob_storage';

/**
 * C4 Container Diagram definition
 * Shows containers within a system and their interactions
 */
export interface C4ContainerDiagram {
  /** Diagram title */
  title: string;
  /** System name this diagram is for */
  systemName: string;
  /** Containers within the system */
  containers: C4Container[];
  /** External systems the containers interact with */
  externalSystems: C4System[];
  /** Persons interacting with containers */
  persons?: C4Person[];
  /** Relationships between containers and external elements */
  relationships: C4Relationship[];
  /** Diagram metadata */
  metadata: C4DiagramMetadata;
}

// ============================================================================
// C4 Level 3: Component Diagram Types
// ============================================================================

/**
 * Component within a container
 * Represents classes, modules, or services within a container
 */
export interface C4Component extends C4Element {
  /** Type discriminator */
  elementType: 'component';
  /** Component type classification */
  componentType: ComponentType;
  /** Container this component belongs to */
  containerId: string;
  /** Logical boundary/layer within the container */
  boundary?: string;
  /** Files belonging to this component */
  files?: string[];
  /** Component responsibilities */
  responsibilities?: string[];
}

export type ComponentType =
  | 'controller'
  | 'service'
  | 'repository'
  | 'middleware'
  | 'validator'
  | 'utility'
  | 'security'
  | 'model'
  | 'handler'
  | 'adapter'
  | 'factory'
  | 'observer'
  | 'facade'
  | 'gateway'
  | 'interface'
  | 'module'
  | 'class'
  | 'function';

/**
 * Component boundary for grouping components
 */
export interface C4ComponentBoundary {
  /** Boundary identifier */
  id: string;
  /** Boundary name */
  name: string;
  /** Components within this boundary */
  componentIds: string[];
}

/**
 * C4 Component Diagram definition
 * Shows the internal structure of a container
 */
export interface C4ComponentDiagram {
  /** Diagram title */
  title: string;
  /** Container name this diagram is for */
  containerName: string;
  /** Container ID */
  containerId: string;
  /** Components within the container */
  components: C4Component[];
  /** Component boundaries/groupings */
  boundaries?: C4ComponentBoundary[];
  /** External containers this container interacts with */
  externalContainers?: C4Container[];
  /** External systems referenced by components */
  externalSystems?: C4System[];
  /** Relationships between components */
  relationships: C4Relationship[];
  /** Diagram metadata */
  metadata: C4DiagramMetadata;
}

// ============================================================================
// Diagram Metadata and Options
// ============================================================================

/**
 * Metadata for C4 diagrams
 */
export interface C4DiagramMetadata {
  /** When the diagram was generated */
  generatedAt: Date;
  /** Version of the generator */
  generatorVersion: string;
  /** Source files analyzed */
  sourceFiles?: string[];
  /** Generation duration in ms */
  durationMs?: number;
  /** Embedding vector for semantic search */
  embedding?: number[];
}

/**
 * Options for generating C4 diagrams
 */
export interface C4DiagramOptions {
  /** Include user/person actors */
  includePersons?: boolean;
  /** Include external systems */
  includeExternalSystems?: boolean;
  /** Maximum elements to show (for large systems) */
  maxElements?: number;
  /** Show relationship labels */
  showRelationshipLabels?: boolean;
  /** Show technology annotations */
  showTechnology?: boolean;
  /** Generate embeddings for semantic search */
  generateEmbeddings?: boolean;
  /** Custom tags to filter by */
  filterTags?: string[];
}

/**
 * Output format for diagrams
 */
export type DiagramOutputFormat = 'mermaid' | 'plantuml' | 'json' | 'svg';

// ============================================================================
// Service Types
// ============================================================================

/**
 * Configuration for C4ModelService
 */
export interface C4ModelServiceConfig {
  /** Enable embedding generation for semantic search */
  enableEmbeddings?: boolean;
  /** Memory namespace for storing diagrams */
  memoryNamespace?: string;
  /** Default diagram options */
  defaultOptions?: C4DiagramOptions;
}

/**
 * Request for building a context diagram
 */
export interface BuildContextRequest {
  /** System name */
  systemName: string;
  /** System description */
  systemDescription: string;
  /** System type */
  systemType?: SystemType;
  /** Technology stack */
  technology?: string;
  /** Custom persons to include */
  persons?: Omit<C4Person, 'elementType'>[];
  /** External systems detected or specified */
  externalSystems?: ExternalSystemSpec[];
  /** Diagram options */
  options?: C4DiagramOptions;
}

/**
 * Specification for external system
 */
export interface ExternalSystemSpec {
  /** System name */
  name: string;
  /** System type */
  type: SystemType;
  /** Description */
  description?: string;
  /** Technology */
  technology?: string;
  /** Relationship description */
  relationshipDescription?: string;
}

/**
 * Request for building a container diagram
 */
export interface BuildContainerRequest {
  /** System name */
  systemName: string;
  /** Containers in the system */
  containers: ContainerSpec[];
  /** External systems */
  externalSystems?: ExternalSystemSpec[];
  /** Container dependencies */
  dependencies?: ContainerDependencySpec[];
  /** Diagram options */
  options?: C4DiagramOptions;
}

/**
 * Specification for container
 */
export interface ContainerSpec {
  /** Container name */
  name: string;
  /** Container type */
  type: ContainerType;
  /** Description */
  description?: string;
  /** Technology */
  technology?: string;
  /** Port */
  port?: number;
  /** Is external */
  external?: boolean;
}

/**
 * Container dependency specification
 */
export interface ContainerDependencySpec {
  /** Source container name */
  from: string;
  /** Target container name */
  to: string;
  /** Relationship description */
  description?: string;
  /** Protocol/technology */
  technology?: string;
}

/**
 * Request for building a component diagram
 */
export interface BuildComponentRequest {
  /** Container name */
  containerName: string;
  /** Components in the container */
  components: ComponentSpec[];
  /** Component relationships */
  relationships?: ComponentRelationshipSpec[];
  /** Boundaries for grouping */
  boundaries?: BoundarySpec[];
  /** Diagram options */
  options?: C4DiagramOptions;
}

/**
 * Specification for component
 */
export interface ComponentSpec {
  /** Component name */
  name: string;
  /** Component type */
  type: ComponentType;
  /** Description */
  description?: string;
  /** Technology */
  technology?: string;
  /** Boundary/layer name */
  boundary?: string;
  /** Files belonging to component */
  files?: string[];
  /** Responsibilities */
  responsibilities?: string[];
}

/**
 * Component relationship specification
 */
export interface ComponentRelationshipSpec {
  /** Source component name */
  from: string;
  /** Target component name */
  to: string;
  /** Relationship description */
  description?: string;
  /** Relationship type */
  type?: C4RelationshipType;
}

/**
 * Boundary specification for component grouping
 */
export interface BoundarySpec {
  /** Boundary name */
  name: string;
  /** Component names within boundary */
  components: string[];
}

/**
 * Result of diagram generation
 */
export interface DiagramResult<T> {
  /** The diagram model */
  diagram: T;
  /** Mermaid diagram syntax */
  mermaid: string;
  /** Key used for storage */
  storageKey?: string;
  /** Warnings during generation */
  warnings?: string[];
}

/**
 * Stored diagram entry
 */
export interface StoredDiagram {
  /** Diagram type */
  type: 'context' | 'container' | 'component';
  /** Diagram model (JSON) */
  model: C4ContextDiagram | C4ContainerDiagram | C4ComponentDiagram;
  /** Mermaid syntax */
  mermaid: string;
  /** When stored */
  storedAt: Date;
  /** Embedding for semantic search */
  embedding?: number[];
}

/**
 * Search result for diagrams
 */
export interface DiagramSearchResult {
  /** Storage key */
  key: string;
  /** Similarity score (0-1) */
  score: number;
  /** Diagram type */
  type: 'context' | 'container' | 'component';
  /** Diagram title */
  title: string;
  /** Brief preview */
  preview: string;
}

// ============================================================================
// Analysis Types
// ============================================================================

/**
 * Architecture analysis result
 */
export interface ArchitectureAnalysis {
  /** Detected architecture pattern */
  pattern: 'layered' | 'modular' | 'feature' | 'microservice' | 'mixed';
  /** Confidence score (0-1) */
  confidence: number;
  /** Detected layers */
  layers: string[];
  /** Coupling analysis */
  coupling: CouplingAnalysis;
  /** Recommendations */
  recommendations: ArchitectureRecommendation[];
}

/**
 * Coupling analysis between components
 */
export interface CouplingAnalysis {
  /** Average coupling score (0-1, lower is better) */
  averageCoupling: number;
  /** High coupling pairs */
  highCouplingPairs: Array<{
    from: string;
    to: string;
    score: number;
  }>;
  /** Circular dependencies */
  circularDependencies: string[][];
}

/**
 * Architecture recommendation
 */
export interface ArchitectureRecommendation {
  /** Severity of the issue */
  severity: Severity;
  /** Priority for fixing */
  priority: Priority;
  /** Issue category */
  category: 'coupling' | 'cohesion' | 'layering' | 'dependency' | 'naming';
  /** Issue description */
  issue: string;
  /** Recommended fix */
  suggestion: string;
  /** Affected elements */
  affectedElements: string[];
}
