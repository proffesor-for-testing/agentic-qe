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
 * Outcome of a Claude Flow call that has no local fallback (#1455).
 * `unavailable`: Claude Flow was not detected. `failed`: ruflo ran but did not do it.
 */
export type ClaudeFlowCallResult<T = undefined> =
  | { status: 'ok'; value: T }
  | { status: 'unavailable'; reason: string }
  | { status: 'failed'; reason: string };

/**
 * Claude Flow adapter interface
 */
export interface ClaudeFlowAdapter extends EnhancementAdapter {
  name: 'claude-flow';

  /** Get available features */
  getFeatures(): Promise<ClaudeFlowFeatures>;

  /** Start a SONA trajectory; the value is ruflo's trajectory id */
  startTrajectory(task: string, agent?: string): Promise<ClaudeFlowCallResult<string>>;

  /** Record a trajectory step */
  recordStep(trajectoryId: string, action: string, result?: string, quality?: number): Promise<ClaudeFlowCallResult>;

  /** End a trajectory */
  endTrajectory(trajectoryId: string, success: boolean, feedback?: string): Promise<ClaudeFlowCallResult>;

  /** Route task to optimal model */
  routeModel(task: string): Promise<{ model: 'haiku' | 'sonnet' | 'opus'; confidence: number }>;

  /** Record model routing outcome */
  recordModelOutcome(task: string, model: string, outcome: 'success' | 'failure' | 'escalated'): Promise<void>;

  /** Run pretrain analysis on repository */
  runPretrain(path: string, depth?: 'shallow' | 'medium' | 'deep'): Promise<unknown>;

  /** Store a pattern; the value is ruflo's pattern id */
  storePattern(
    pattern: string,
    type: string,
    confidence: number,
    metadata?: Record<string, unknown>
  ): Promise<ClaudeFlowCallResult<string>>;

  /** Search patterns */
  searchPatterns(query: string, topK?: number): Promise<ClaudeFlowCallResult<Array<{ pattern: string; similarity: number }>>>;
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
