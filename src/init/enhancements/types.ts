/**
 * Enhancement Adapter Types
 * Interfaces for optional integrations like claude-flow and ruvector
 */

/**
 * Base enhancement adapter interface
 */
export interface EnhancementAdapter {
  /** Unique name of the enhancement */
  readonly name: string;

  /** Check if the enhancement is available */
  isAvailable(): Promise<boolean>;

  /** Get version information if available */
  getVersion(): Promise<string | undefined>;

  /** Initialize the enhancement */
  initialize(): Promise<void>;

  /** Clean up resources */
  destroy(): Promise<void>;
}

/**
 * Claude Flow enhancement features
 */
export interface ClaudeFlowFeatures {
  /** SONA trajectory tracking */
  trajectories: boolean;
  /** 3-tier model routing */
  modelRouting: boolean;
  /** Codebase pretrain analysis */
  pretrain: boolean;
  /** Background workers */
  workers: boolean;
  /** Transfer learning */
  transfer: boolean;
}

/**
 * Claude Flow adapter interface
 */
export interface ClaudeFlowAdapter extends EnhancementAdapter {
  name: 'claude-flow';

  /** Get available features */
  getFeatures(): Promise<ClaudeFlowFeatures>;

  /** Start a SONA trajectory */
  startTrajectory(task: string, agent?: string): Promise<string>;

  /** Record a trajectory step */
  recordStep(trajectoryId: string, action: string, result?: string, quality?: number): Promise<void>;

  /** End a trajectory */
  endTrajectory(trajectoryId: string, success: boolean, feedback?: string): Promise<void>;

  /** Route task to optimal model */
  routeModel(task: string): Promise<{ model: 'haiku' | 'sonnet' | 'opus'; confidence: number }>;

  /** Record model routing outcome */
  recordModelOutcome(task: string, model: string, outcome: 'success' | 'failure' | 'escalated'): Promise<void>;

  /** Run pretrain analysis on repository */
  runPretrain(path: string, depth?: 'shallow' | 'medium' | 'deep'): Promise<unknown>;

  /** Store a pattern */
  storePattern(pattern: string, type: string, confidence: number, metadata?: Record<string, unknown>): Promise<void>;

  /** Search patterns */
  searchPatterns(query: string, topK?: number): Promise<Array<{ pattern: string; similarity: number }>>;
}

/**
 * RuVector adapter interface
 */
export interface RuVectorAdapter extends EnhancementAdapter {
  name: 'ruvector';

  /** Generate embeddings */
  generateEmbeddings(text: string): Promise<number[]>;

  /** Similarity search */
  search(query: string, topK?: number): Promise<Array<{ id: string; score: number }>>;

  /** Store embeddings with metadata */
  store(id: string, embedding: number[], metadata?: Record<string, unknown>): Promise<void>;
}

/**
 * Enhancement registry
 */
export interface EnhancementRegistry {
  /** Registered adapters */
  adapters: Map<string, EnhancementAdapter>;

  /** Check if enhancement is available */
  isAvailable(name: string): boolean;

  /** Get adapter by name */
  get<T extends EnhancementAdapter>(name: string): T | undefined;

  /** Register an adapter */
  register(adapter: EnhancementAdapter): void;
}
