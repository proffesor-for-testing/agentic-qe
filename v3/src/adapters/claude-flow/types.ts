/**
 * Claude Flow Adapter Types
 * Interfaces for bridging AQE with Claude Flow MCP features
 */

/**
 * Trajectory step for SONA learning
 */
export interface TrajectoryStep {
  id: string;
  action: string;
  result?: string;
  quality?: number;
  timestamp: number;
}

/**
 * Complete trajectory for SONA
 */
export interface Trajectory {
  id: string;
  task: string;
  agent?: string;
  steps: TrajectoryStep[];
  success?: boolean;
  feedback?: string;
  startedAt: number;
  completedAt?: number;
}

/**
 * Model routing result
 */
export interface ModelRoutingResult {
  model: 'haiku' | 'sonnet' | 'opus';
  confidence: number;
  reasoning?: string;
  costEstimate?: number;
}

/**
 * Model routing outcome for learning
 */
export interface ModelRoutingOutcome {
  task: string;
  model: 'haiku' | 'sonnet' | 'opus';
  outcome: 'success' | 'failure' | 'escalated';
  durationMs?: number;
  tokenUsage?: {
    input: number;
    output: number;
  };
}

/**
 * Pretrain analysis result
 */
export interface PretrainResult {
  success: boolean;
  repositoryPath: string;
  depth: 'shallow' | 'medium' | 'deep';
  analysis?: {
    languages: string[];
    frameworks: string[];
    patterns: string[];
    complexity: number;
    testCoverage?: number;
  };
  agentConfigs?: Record<string, unknown>[];
  error?: string;
}

/**
 * Pattern for storage/search
 */
export interface ClaudeFlowPattern {
  id: string;
  pattern: string;
  type: string;
  confidence: number;
  metadata?: Record<string, unknown>;
  embedding?: number[];
  createdAt: number;
}

/**
 * Pattern search result
 */
export interface PatternSearchResult {
  pattern: ClaudeFlowPattern;
  similarity: number;
}

/**
 * Bridge availability status
 */
export interface BridgeStatus {
  available: boolean;
  version?: string;
  features: {
    trajectories: boolean;
    modelRouting: boolean;
    pretrain: boolean;
    patternSearch: boolean;
  };
}
