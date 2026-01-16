/**
 * Dream System Type Definitions
 * ADR-021: QE ReasoningBank - Dream Cycle Integration
 *
 * Types for dream-based pattern discovery including:
 * - Concept nodes and edges for the concept graph
 * - Dream cycle and insight types
 * - Configuration interfaces
 *
 * @module v3/learning/dream/types
 */

// ============================================================================
// Concept Types
// ============================================================================

/**
 * Type of concept node in the graph
 */
export type ConceptType = 'pattern' | 'technique' | 'domain' | 'outcome' | 'error';

/**
 * Type of edge connecting concepts
 */
export type EdgeType = 'similarity' | 'causation' | 'co_occurrence' | 'sequence';

/**
 * Type of insight generated during dream cycles
 */
export type InsightType =
  | 'correlation'
  | 'anomaly'
  | 'optimization'
  | 'anti_pattern'
  | 'novel_pattern';

/**
 * Status of a dream cycle
 */
export type DreamCycleStatus = 'running' | 'completed' | 'interrupted' | 'failed';

// ============================================================================
// Concept Node
// ============================================================================

/**
 * A node in the concept graph representing a piece of knowledge
 */
export interface ConceptNode {
  /** Unique identifier */
  id: string;

  /** Type of concept */
  conceptType: ConceptType;

  /** Human-readable content/description */
  content: string;

  /** Optional embedding vector for semantic similarity */
  embedding?: number[];

  /** Current activation level (0-1), decays over time */
  activationLevel: number;

  /** When this concept was last activated */
  lastActivated?: Date;

  /** Optional link to source pattern ID */
  patternId?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;

  /** When this concept was created */
  createdAt?: Date;
}

/**
 * Input for creating a new concept node
 */
export type CreateConceptNodeInput = Omit<ConceptNode, 'id' | 'activationLevel' | 'createdAt'>;

// ============================================================================
// Concept Edge
// ============================================================================

/**
 * A weighted edge connecting two concepts
 */
export interface ConceptEdge {
  /** Unique identifier */
  id: string;

  /** Source concept ID */
  source: string;

  /** Target concept ID */
  target: string;

  /** Edge weight (0-1), higher = stronger association */
  weight: number;

  /** Type of relationship */
  edgeType: EdgeType;

  /** Number of observations supporting this edge */
  evidence: number;

  /** When this edge was created */
  createdAt?: Date;

  /** When this edge was last updated */
  updatedAt?: Date;
}

/**
 * Input for creating a new edge
 */
export type CreateEdgeInput = Pick<ConceptEdge, 'source' | 'target' | 'edgeType'> & {
  weight?: number;
};

// ============================================================================
// Dream Cycle
// ============================================================================

/**
 * Record of a dream cycle execution
 */
export interface DreamCycle {
  /** Unique identifier */
  id: string;

  /** When the cycle started */
  startTime: Date;

  /** When the cycle ended (if completed) */
  endTime?: Date;

  /** Duration in milliseconds */
  durationMs?: number;

  /** Number of concepts processed during this cycle */
  conceptsProcessed: number;

  /** Number of new associations discovered */
  associationsFound: number;

  /** Number of insights generated */
  insightsGenerated: number;

  /** Current status */
  status: DreamCycleStatus;

  /** Error message if status is 'failed' */
  error?: string;

  /** When this record was created */
  createdAt?: Date;
}

// ============================================================================
// DreamEngine Types (exported for external use)
// ============================================================================

/**
 * Complete DreamEngine configuration (used by DreamEngine)
 */
export interface DreamEngineConfig {
  /** Maximum dream duration in milliseconds. Default: 30000 */
  maxDurationMs: number;

  /** Minimum concepts required to start dreaming. Default: 10 */
  minConceptsRequired: number;

  /** Spreading activation configuration */
  activationConfig: {
    /** Decay rate per iteration (0-1). Default: 0.1 */
    decayRate: number;
    /** Spread factor to neighbors (0-1). Default: 0.5 */
    spreadFactor: number;
    /** Minimum activation to spread. Default: 0.1 */
    threshold: number;
    /** Maximum iterations. Default: 20 */
    maxIterations: number;
    /** Noise level for exploration. Default: 0.05 */
    noiseLevel: number;
  };

  /** Insight generation configuration */
  insightConfig: {
    /** Minimum novelty to report. Default: 0.3 */
    minNoveltyScore: number;
    /** Minimum confidence for actionable. Default: 0.5 */
    minConfidence: number;
    /** Maximum insights per cycle. Default: 10 */
    maxInsightsPerCycle: number;
  };
}

/**
 * Result of a complete dream cycle
 */
export interface DreamCycleResult {
  /** The completed dream cycle record */
  cycle: DreamCycle;

  /** Insights generated during the dream */
  insights: DreamInsight[];

  /** Activation statistics */
  activationStats: {
    totalIterations: number;
    peakActivation: number;
    nodesActivated: number;
  };

  /** Number of patterns created from insights */
  patternsCreated: number;
}

// ============================================================================
// Dream Insight
// ============================================================================

/**
 * An insight discovered during a dream cycle
 */
export interface DreamInsight {
  /** Unique identifier */
  id: string;

  /** ID of the dream cycle that produced this insight */
  cycleId: string;

  /** Type of insight */
  insightType: InsightType;

  /** IDs of concepts that contributed to this insight */
  sourceConcepts: string[];

  /** Human-readable description of the insight */
  description: string;

  /** Novelty score (0-1), higher = more novel */
  noveltyScore: number;

  /** Whether this insight can be acted upon */
  actionable: boolean;

  /** Whether this insight has been applied */
  applied: boolean;

  /** Optional: pattern created from this insight */
  patternId?: string;

  /** When this insight was created */
  createdAt?: Date;
}

// ============================================================================
// Graph Statistics
// ============================================================================

/**
 * Statistics about the concept graph
 */
export interface ConceptGraphStats {
  /** Total number of nodes */
  nodeCount: number;

  /** Total number of edges */
  edgeCount: number;

  /** Node count by type */
  byType: Record<ConceptType, number>;

  /** Average edges per node */
  avgEdgesPerNode: number;

  /** Average activation level across all nodes */
  avgActivation: number;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for the concept graph
 */
export interface ConceptGraphConfig {
  /** Database path. Default: .aqe/dream.db */
  dbPath?: string;

  /** Similarity threshold for auto edge discovery. Default: 0.5 */
  similarityThreshold?: number;

  /** Maximum edges per node. Default: 20 */
  maxEdgesPerNode?: number;

  /** Enable WAL mode. Default: true */
  walMode?: boolean;

  /** Enable debug logging. Default: false */
  debug?: boolean;
}

/**
 * Default concept graph configuration
 *
 * NOTE: ConceptGraph uses UnifiedPersistenceManager (ADR-046) which
 * delegates to the unified memory.db. The dbPath is only used for
 * documentation/example purposes.
 */
export const DEFAULT_CONCEPT_GRAPH_CONFIG: Required<ConceptGraphConfig> = {
  // IGNORED: ConceptGraph uses getUnifiedPersistence() which uses memory.db (ADR-046)
  dbPath: '.aqe/dream.db',
  similarityThreshold: 0.5,
  maxEdgesPerNode: 20,
  walMode: true,
  debug: false,
};

// ============================================================================
// Pattern Import Types
// ============================================================================

/**
 * Pattern data for importing into the concept graph
 */
export interface PatternImportData {
  id: string;
  name: string;
  description: string;
  domain: string;
  patternType?: string;
  confidence?: number;
  successRate?: number;
}

/**
 * Neighbor result with node and edge
 */
export interface NeighborResult {
  node: ConceptNode;
  edge: ConceptEdge;
}
