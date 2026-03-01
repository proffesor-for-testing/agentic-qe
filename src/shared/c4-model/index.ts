/**
 * Agentic QE v3 - Shared C4 Model Types
 *
 * Common C4 architecture diagram types shared between:
 * - code-intelligence domain (C4 generation from codebase analysis)
 * - requirements-validation domain (product-factors-assessor C4 integration)
 *
 * Based on the C4 Model by Simon Brown:
 * https://c4model.com/
 */

// ============================================================================
// C4 Diagram Types
// ============================================================================

/**
 * C4 Diagrams container for all diagram levels
 */
export interface C4Diagrams {
  /** C4 Level 1: System Context diagram (Mermaid syntax) */
  context?: string;
  /** C4 Level 2: Container diagram (Mermaid syntax) */
  container?: string;
  /** C4 Level 3: Component diagram (Mermaid syntax) */
  component?: string;
  /** Additional: Dependency graph (Mermaid syntax) */
  dependency?: string;
}

/**
 * C4 Diagram metadata with generation information
 */
export interface C4DiagramMetadata {
  /** Project name */
  projectName: string;
  /** Project description */
  projectDescription: string;
  /** Generation timestamp */
  generatedAt: Date;
  /** Source of generation (codebase, manual, etc.) */
  source: C4DiagramSource;
  /** Analysis metadata */
  analysisMetadata?: C4AnalysisMetadata;
}

/**
 * Source of C4 diagram generation
 */
export type C4DiagramSource =
  | 'codebase-analysis'
  | 'manual'
  | 'imported'
  | 'product-factors-assessment';

/**
 * Analysis metadata from C4 diagram generation
 */
export interface C4AnalysisMetadata {
  /** Number of files analyzed */
  filesAnalyzed: number;
  /** Number of components detected */
  componentsDetected: number;
  /** Number of external systems detected */
  externalSystemsDetected: number;
  /** Analysis duration in milliseconds */
  analysisTimeMs: number;
}

// ============================================================================
// C4 Element Types
// ============================================================================

/**
 * C4 Person element - represents a user of the system
 */
export interface C4Person {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description of the person's role */
  description: string;
  /** Whether external to the organization */
  external?: boolean;
}

/**
 * C4 Software System element - represents a system
 */
export interface C4SoftwareSystem {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Whether external to the organization */
  external?: boolean;
  /** Technology stack (optional) */
  technology?: string;
}

/**
 * C4 Container element - represents a deployable unit
 */
export interface C4Container {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Technology used */
  technology: string;
  /** Container type */
  type: C4ContainerType;
  /** Parent system ID */
  systemId: string;
}

/**
 * Container type classification
 */
export type C4ContainerType =
  | 'web-application'
  | 'spa'
  | 'mobile-app'
  | 'api'
  | 'service'
  | 'database'
  | 'cache'
  | 'queue'
  | 'file-system'
  | 'serverless'
  | 'other';

/**
 * C4 Component element - represents a code unit
 */
export interface C4Component {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Technology used */
  technology: string;
  /** Component type */
  type: C4ComponentType;
  /** Parent container ID */
  containerId: string;
  /** Responsibilities */
  responsibilities?: string[];
  /** Source files */
  files?: string[];
}

/**
 * Component type classification
 */
export type C4ComponentType =
  | 'controller'
  | 'service'
  | 'repository'
  | 'facade'
  | 'factory'
  | 'adapter'
  | 'gateway'
  | 'handler'
  | 'validator'
  | 'transformer'
  | 'utility'
  | 'module'
  | 'layer'
  | 'feature'
  | 'package'
  | 'other';

/**
 * C4 Relationship between elements
 */
export interface C4Relationship {
  /** Source element ID */
  sourceId: string;
  /** Target element ID */
  targetId: string;
  /** Description of the relationship */
  description: string;
  /** Technology/protocol used */
  technology?: string;
  /** Relationship type */
  type: C4RelationshipType;
}

/**
 * Relationship type classification
 */
export type C4RelationshipType =
  | 'uses'
  | 'calls'
  | 'imports'
  | 'depends_on'
  | 'extends'
  | 'implements'
  | 'sends'
  | 'reads'
  | 'writes'
  | 'stores_data_in'
  | 'authenticates_with';

// ============================================================================
// External System Types (for PLATFORM detection)
// ============================================================================

/**
 * Detected external system from code intelligence
 */
export interface DetectedExternalSystem {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** System type */
  type: ExternalSystemType;
  /** Specific technology (e.g., PostgreSQL, Redis) */
  technology: string;
  /** Package/indicator that detected this dependency */
  detectedFrom: string;
  /** Relationship type */
  relationship: C4RelationshipType;
}

/**
 * External system type classification
 */
export type ExternalSystemType =
  | 'database'
  | 'cache'
  | 'queue'
  | 'api'
  | 'storage'
  | 'auth'
  | 'monitoring'
  | 'cloud';

// ============================================================================
// Component Detection Types
// ============================================================================

/**
 * Detected component from code intelligence
 */
export interface DetectedComponent {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Component type */
  type: C4ComponentType;
  /** Architectural boundary (e.g., 'Business Logic', 'Data Access') */
  boundary?: string;
  /** Technology/framework */
  technology?: string;
  /** Files in this component */
  files: string[];
  /** Component responsibilities */
  responsibilities?: string[];
}

/**
 * Component relationship from code intelligence
 */
export interface DetectedRelationship {
  /** Source component ID */
  sourceId: string;
  /** Target component ID */
  targetId: string;
  /** Relationship type */
  type: C4RelationshipType;
  /** Relationship weight (number of references) */
  weight?: number;
}

/**
 * Module coupling analysis result
 */
export interface ModuleCouplingInfo {
  /** Module A name */
  moduleA: string;
  /** Module B name */
  moduleB: string;
  /** Coupling strength (0-1) */
  couplingStrength: number;
  /** Is this a circular dependency? */
  isCircular: boolean;
  /** Recommended action */
  recommendation?: string;
}

// ============================================================================
// C4 Diagram Generator Interface
// ============================================================================

/**
 * Interface for generating C4 diagrams
 */
export interface IC4DiagramGenerator {
  /**
   * Generate C4 Context diagram
   */
  generateContextDiagram(
    project: C4ProjectInfo,
    externalSystems: DetectedExternalSystem[]
  ): string;

  /**
   * Generate C4 Container diagram
   */
  generateContainerDiagram(
    project: C4ProjectInfo,
    externalSystems: DetectedExternalSystem[]
  ): string;

  /**
   * Generate C4 Component diagram
   */
  generateComponentDiagram(
    projectName: string,
    components: DetectedComponent[],
    relationships: DetectedRelationship[]
  ): string;

  /**
   * Generate dependency graph
   */
  generateDependencyGraph(
    components: DetectedComponent[],
    relationships: DetectedRelationship[]
  ): string;
}

/**
 * Project information for C4 diagram generation
 */
export interface C4ProjectInfo {
  /** Project name */
  name: string;
  /** Project description */
  description: string;
}

// ============================================================================
// C4 Diagram Result Types
// ============================================================================

/**
 * Complete C4 diagram generation result
 */
export interface C4DiagramResult {
  /** Generated diagrams */
  diagrams: C4Diagrams;
  /** Generation metadata */
  metadata: C4DiagramMetadata;
  /** Detected external systems */
  externalSystems: DetectedExternalSystem[];
  /** Detected components */
  components: DetectedComponent[];
  /** Detected relationships */
  relationships: DetectedRelationship[];
  /** Coupling analysis */
  couplingAnalysis?: ModuleCouplingInfo[];
}

/**
 * Request for C4 diagram generation
 */
export interface C4DiagramRequest {
  /** Project root directory path */
  projectPath: string;
  /** Whether to include external system detection */
  detectExternalSystems?: boolean;
  /** Whether to analyze components */
  analyzeComponents?: boolean;
  /** Whether to analyze coupling */
  analyzeCoupling?: boolean;
  /** Include C4 Context diagram */
  includeContext?: boolean;
  /** Include C4 Container diagram */
  includeContainer?: boolean;
  /** Include C4 Component diagram */
  includeComponent?: boolean;
  /** Include dependency graph */
  includeDependency?: boolean;
  /** Exclude patterns */
  excludePatterns?: string[];
}

// ============================================================================
// C4 Event Payloads
// ============================================================================

/**
 * Payload for C4DiagramsGenerated event
 */
export interface C4DiagramsGeneratedPayload {
  /** Request ID for correlation */
  requestId: string;
  /** Project path that was analyzed */
  projectPath: string;
  /** Generated diagrams */
  diagrams: C4Diagrams;
  /** Number of components detected */
  componentsDetected: number;
  /** Number of external systems detected */
  externalSystemsDetected: number;
  /** Number of relationships detected */
  relationshipsDetected: number;
  /** Analysis duration in milliseconds */
  analysisTimeMs: number;
}

// ============================================================================
// C4 Cache Types
// ============================================================================

/**
 * Cached C4 diagram entry
 */
export interface C4CacheEntry {
  /** The cached result */
  result: C4DiagramResult;
  /** Cache timestamp */
  cachedAt: Date;
  /** Cache TTL in milliseconds */
  ttlMs: number;
  /** Project hash for invalidation */
  projectHash: string;
}

/**
 * Check if a cache entry is still valid
 */
export function isCacheValid(entry: C4CacheEntry): boolean {
  const now = Date.now();
  const cacheAge = now - entry.cachedAt.getTime();
  return cacheAge < entry.ttlMs;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert external system type to C4 container type
 */
export function externalSystemToContainerType(
  type: ExternalSystemType
): C4ContainerType {
  const mapping: Record<ExternalSystemType, C4ContainerType> = {
    database: 'database',
    cache: 'cache',
    queue: 'queue',
    api: 'api',
    storage: 'file-system',
    auth: 'service',
    monitoring: 'service',
    cloud: 'serverless',
  };
  return mapping[type] || 'other';
}

/**
 * Infer component type from component name
 */
export function inferComponentType(name: string): C4ComponentType {
  const lower = name.toLowerCase();

  if (lower.includes('controller')) return 'controller';
  if (lower.includes('service')) return 'service';
  if (lower.includes('repository')) return 'repository';
  if (lower.includes('facade')) return 'facade';
  if (lower.includes('factory')) return 'factory';
  if (lower.includes('adapter')) return 'adapter';
  if (lower.includes('gateway')) return 'gateway';
  if (lower.includes('handler')) return 'handler';
  if (lower.includes('validator')) return 'validator';
  if (lower.includes('transformer')) return 'transformer';
  if (lower.includes('util') || lower.includes('helper')) return 'utility';
  if (lower.includes('domain')) return 'feature';
  if (lower.includes('infra')) return 'layer';
  if (lower.includes('package') || lower.includes('pkg')) return 'package';

  return 'module';
}

/**
 * Create a sanitized ID from a string
 */
export function sanitizeId(str: string): string {
  return str.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
}
