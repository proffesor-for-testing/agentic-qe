/**
 * C4 Model Inference Types
 *
 * Consolidated type definitions for all C4 model inference components.
 * All interfaces are defined here to ensure consistency across the module.
 */

// ============================================================================
// Type Aliases
// ============================================================================

export type SystemType = 'microservice' | 'monolith' | 'library' | 'cli';

export type ContainerType =
  | 'application'
  | 'database'
  | 'cache'
  | 'queue'
  | 'service'
  | 'api';

export type ExternalSystemType =
  | 'database'
  | 'api'
  | 'cache'
  | 'queue'
  | 'storage'
  | 'auth'
  | 'monitoring';

export type RelationshipType =
  | 'uses'
  | 'stores_data_in'
  | 'sends_messages_to'
  | 'authenticates_with'
  | 'depends_on'
  | 'calls'
  | 'imports';

// ============================================================================
// C4 Level 1: System Context
// ============================================================================

/**
 * Project metadata for C4 Context and Container diagrams
 */
export interface ProjectMetadata {
  /** System/project name */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Type of system architecture */
  systemType: SystemType;
  /** Primary technology stack */
  technology: string;
  /** Containers within the system */
  containers: Container[];
  /** Detected architectural layers */
  layers?: string[];
  /** Version from package.json */
  version?: string;
  /** Repository URL */
  repository?: string;
}

/**
 * External system that the project interacts with
 */
export interface ExternalSystem {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Type of external system */
  type: ExternalSystemType;
  /** Specific technology (e.g., "PostgreSQL", "Redis") */
  technology?: string;
  /** How the system relates to this external system */
  relationship: 'uses' | 'stores_data_in' | 'sends_messages_to' | 'authenticates_with';
  /** Human-readable description */
  description?: string;
}

/**
 * Mapping configuration for detecting external systems from package names
 */
export interface ExternalSystemMapping {
  /** Regex pattern to match package names */
  packagePattern: RegExp;
  /** Type of system this package indicates */
  systemType: ExternalSystemType;
  /** Technology name */
  technology: string;
  /** Default relationship type */
  relationship: ExternalSystem['relationship'];
  /** Default description */
  description?: string;
}

// ============================================================================
// C4 Level 2: Container
// ============================================================================

/**
 * Container definition (C4 Level 2)
 * Represents an application, database, or service within the system
 */
export interface Container {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Type of container */
  type: ContainerType;
  /** Technology stack */
  technology: string;
  /** Human-readable description */
  description?: string;
  /** Exposed port (if applicable) */
  port?: number;
  /** IDs of containers this depends on */
  dependencies?: string[];
}

/**
 * Dependency relationship between containers
 */
export interface ContainerDependency {
  /** Source container ID */
  fromId: string;
  /** Target container ID */
  toId: string;
  /** Type of dependency */
  type: 'uses' | 'depends_on' | 'calls';
  /** Communication protocol (e.g., "HTTP", "gRPC") */
  protocol?: string;
}

// ============================================================================
// C4 Level 3: Component
// ============================================================================

/**
 * Component within a container (C4 Level 3)
 */
export interface Component {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Type of component */
  type: 'layer' | 'module' | 'feature' | 'package';
  /** Human-readable description */
  description?: string;
  /** Technology/framework */
  technology?: string;
  /** Files belonging to this component */
  files: string[];
  /** Component responsibilities */
  responsibilities?: string[];
  /** Boundary/container this belongs to */
  boundary?: string;
}

/**
 * Relationship between components
 */
export interface ComponentRelationship {
  /** Source component ID */
  sourceId: string;
  /** Target component ID */
  targetId: string;
  /** Type of relationship */
  type: 'imports' | 'calls' | 'uses' | 'depends_on';
  /** Number of references (for weighting) */
  count?: number;
}

/**
 * Configuration for component boundary detection
 */
export interface ComponentBoundaryConfig {
  /** Root directory to analyze */
  rootDir: string;
  /** Minimum files for a component */
  minFilesPerComponent: number;
  /** Whether to analyze import relationships */
  analyzeImports: boolean;
  /** Glob patterns to exclude */
  excludePatterns: string[];
  /** Maximum directory depth */
  maxDepth: number;
}

/**
 * Result of component boundary analysis
 */
export interface ComponentAnalysisResult {
  /** Detected components */
  components: Component[];
  /** Relationships between components */
  relationships: ComponentRelationship[];
  /** Analysis metadata */
  metadata: AnalysisMetadata;
  /** Detected architecture pattern */
  architecture?: 'layered' | 'modular' | 'feature' | 'mixed';
}

// ============================================================================
// Analysis Metadata
// ============================================================================

/**
 * Metadata about an analysis run
 */
export interface AnalysisMetadata {
  /** Timestamp of analysis */
  timestamp: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Number of files analyzed */
  filesAnalyzed: number;
  /** Number of containers detected */
  containersDetected: number;
  /** Number of layers detected */
  layersDetected: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Technology detection configuration
 */
export interface TechnologyDetectionConfig {
  enableFrameworkDetection: boolean;
  enableDatabaseDetection: boolean;
  enableInfrastructureDetection: boolean;
  customTechnologies?: Record<string, string>;
}

/**
 * C4 diagram generation options
 */
export interface C4DiagramOptions {
  /** Include user personas */
  includeUsers?: boolean;
  /** Include external systems */
  includeExternalSystems?: boolean;
  /** Maximum components to show */
  maxComponents?: number;
  /** Show labels on relationships */
  showRelationshipLabels?: boolean;
}
