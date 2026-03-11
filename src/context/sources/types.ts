/**
 * Context Source Types (BMAD-005)
 */

export interface ContextRequest {
  /** Target files to gather context for */
  targetFiles: string[];
  /** Agent type requesting context */
  agentType: string;
  /** Task description */
  taskDescription: string;
  /** Maximum token budget across all sources */
  maxTokenBudget?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface ContextFragment {
  /** Source identifier */
  sourceId: string;
  /** Fragment title */
  title: string;
  /** Fragment content */
  content: string;
  /** Estimated token count (chars / 3.5 with safety margin) */
  estimatedTokens: number;
  /** Relevance score 0-1 */
  relevance: number;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

export interface ContextSource {
  /** Source identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Priority (higher = more important, included first) */
  priority: number;
  /** Maximum tokens this source can use */
  maxTokens: number;
  /** Gather context fragments */
  gather(request: ContextRequest): Promise<ContextFragment[]>;
}
