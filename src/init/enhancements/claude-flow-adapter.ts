/**
 * Claude Flow Adapter
 * Bridge to Claude Flow MCP for enhanced learning features
 *
 * This adapter provides AQE with optional enhanced capabilities when
 * Claude Flow is available, including:
 * - SONA trajectory tracking
 * - 3-tier model routing
 * - Pretrain analysis
 * - Pattern storage with HNSW
 */

import type { ClaudeFlowAdapter, ClaudeFlowFeatures } from './types.js';
import { detectClaudeFlow } from '../../adapters/claude-flow/detect.js';
import { safeJsonParse } from '../../shared/safe-json.js';

/** Shared execFileSync options */
const EXEC_OPTS = { encoding: 'utf-8' as const };

/**
 * Build args array for npx @claude-flow/cli calls.
 * Using execFileSync with explicit args prevents shell injection.
 */
function cfCliArgs(...subcommand: string[]): { bin: string; args: string[] } {
  return {
    bin: 'npx',
    args: ['--no-install', 'ruflo', ...subcommand],
  };
}

/**
 * Claude Flow Adapter Implementation
 * Falls back gracefully when Claude Flow is not available
 */
export class ClaudeFlowAdapterImpl implements ClaudeFlowAdapter {
  readonly name = 'claude-flow' as const;
  private initialized = false;
  private available = false;

  /**
   * Check if Claude Flow is available (no npm auto-install)
   */
  async isAvailable(): Promise<boolean> {
    if (this.available) return true;

    const detection = detectClaudeFlow(process.cwd());
    this.available = detection.available;
    return this.available;
  }

  /**
   * Get Claude Flow version
   */
  async getVersion(): Promise<string | undefined> {
    const detection = detectClaudeFlow(process.cwd());
    return detection.version;
  }

  /**
   * Initialize the adapter
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.available = await this.isAvailable();
    this.initialized = true;
  }

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    this.initialized = false;
    this.available = false;
  }

  /**
   * Get available features
   */
  async getFeatures(): Promise<ClaudeFlowFeatures> {
    if (!this.available) {
      return {
        trajectories: false,
        modelRouting: false,
        pretrain: false,
        workers: false,
        transfer: false,
      };
    }

    // All features available when Claude Flow is present
    return {
      trajectories: true,
      modelRouting: true,
      pretrain: true,
      workers: true,
      transfer: true,
    };
  }

  /**
   * Start a SONA trajectory
   */
  async startTrajectory(task: string, agent?: string): Promise<string> {
    if (!this.available) {
      // Return a dummy trajectory ID for standalone mode
      return `aqe-trajectory-${Date.now()}`;
    }

    try {
      const { execFileSync } = await import('child_process');
      const { bin, args } = cfCliArgs('hooks', 'intelligence', 'trajectory-start', '--task', task);
      if (agent) { args.push('--agent', agent); }
      const result = execFileSync(bin, args, { ...EXEC_OPTS, timeout: 10000 });

      // Parse trajectory ID from result
      const match = result.match(/trajectoryId[:\s]+["']?([^"'\s]+)/i);
      return match?.[1] || `cf-trajectory-${Date.now()}`;
    } catch {
      return `aqe-trajectory-${Date.now()}`;
    }
  }

  /**
   * Record a trajectory step
   */
  async recordStep(
    trajectoryId: string,
    action: string,
    result?: string,
    quality?: number
  ): Promise<void> {
    if (!this.available) return;

    try {
      const { execFileSync } = await import('child_process');
      const { bin, args } = cfCliArgs('hooks', 'intelligence', 'trajectory-step', '--trajectory-id', trajectoryId, '--action', action);
      if (result) { args.push('--result', result); }
      if (quality !== undefined) { args.push('--quality', String(quality)); }
      execFileSync(bin, args, { ...EXEC_OPTS, timeout: 10000 });
    } catch (error) {
      // Non-critical: trajectory tracking is optional
      console.debug('[ClaudeFlowAdapter] Trajectory step failed:', error instanceof Error ? error.message : error);
    }
  }

  /**
   * End a trajectory
   */
  async endTrajectory(
    trajectoryId: string,
    success: boolean,
    feedback?: string
  ): Promise<void> {
    if (!this.available) return;

    try {
      const { execFileSync } = await import('child_process');
      const { bin, args } = cfCliArgs('hooks', 'intelligence', 'trajectory-end', '--trajectory-id', trajectoryId, '--success', String(success));
      if (feedback) { args.push('--feedback', feedback); }
      execFileSync(bin, args, { ...EXEC_OPTS, timeout: 10000 });
    } catch (error) {
      // Non-critical: trajectory end is optional
      console.debug('[ClaudeFlowAdapter] Trajectory end failed:', error instanceof Error ? error.message : error);
    }
  }

  /**
   * Route task to optimal model
   */
  async routeModel(task: string): Promise<{ model: 'haiku' | 'sonnet' | 'opus'; confidence: number }> {
    if (!this.available) {
      // Default to sonnet for standalone mode
      return { model: 'sonnet', confidence: 0.5 };
    }

    try {
      const { execFileSync } = await import('child_process');
      const { bin, args } = cfCliArgs('hooks', 'model-route', '--task', task);
      const result = execFileSync(bin, args, { ...EXEC_OPTS, timeout: 10000 });

      // Parse result
      const modelMatch = result.match(/model[:\s]+["']?(haiku|sonnet|opus)/i);
      const confMatch = result.match(/confidence[:\s]+([0-9.]+)/i);

      return {
        model: (modelMatch?.[1]?.toLowerCase() as 'haiku' | 'sonnet' | 'opus') || 'sonnet',
        confidence: confMatch ? parseFloat(confMatch[1]) : 0.7,
      };
    } catch (error) {
      // Non-critical: model routing failed, using fallback
      console.debug('[ClaudeFlowAdapter] Model routing failed:', error instanceof Error ? error.message : error);
      return { model: 'sonnet', confidence: 0.5 };
    }
  }

  /**
   * Record model routing outcome
   */
  async recordModelOutcome(
    task: string,
    model: string,
    outcome: 'success' | 'failure' | 'escalated'
  ): Promise<void> {
    if (!this.available) return;

    try {
      const { execFileSync } = await import('child_process');
      const { bin, args } = cfCliArgs('hooks', 'model-outcome', '--task', task, '--model', model, '--outcome', outcome);
      execFileSync(bin, args, { ...EXEC_OPTS, timeout: 10000 });
    } catch (error) {
      // Non-critical: outcome recording is optional
      console.debug('[ClaudeFlowAdapter] Model outcome recording failed:', error instanceof Error ? error.message : error);
    }
  }

  /**
   * Run pretrain analysis
   */
  async runPretrain(
    path: string,
    depth: 'shallow' | 'medium' | 'deep' = 'medium'
  ): Promise<unknown> {
    if (!this.available) {
      return { success: false, reason: 'Claude Flow not available' };
    }

    try {
      const { execFileSync } = await import('child_process');
      const { bin, args } = cfCliArgs('hooks', 'pretrain', '--path', path, '--depth', depth);
      const result = execFileSync(bin, args, { ...EXEC_OPTS, timeout: 60000 });

      // Try to parse JSON result
      try {
        return safeJsonParse<Record<string, unknown>>(result);
      } catch {
        return { success: true, raw: result };
      }
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Store a pattern
   */
  async storePattern(
    pattern: string,
    type: string,
    confidence: number,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    if (!this.available) return;

    try {
      const { execFileSync } = await import('child_process');
      const { bin, args } = cfCliArgs('hooks', 'intelligence', 'pattern-store', '--pattern', pattern, '--type', type, '--confidence', String(confidence));
      if (metadata) { args.push('--metadata', JSON.stringify(metadata)); }
      execFileSync(bin, args, { ...EXEC_OPTS, timeout: 10000 });
    } catch (error) {
      // Non-critical: pattern storage is optional
      console.debug('[ClaudeFlowAdapter] Pattern storage failed:', error instanceof Error ? error.message : error);
    }
  }

  /**
   * Search patterns
   */
  async searchPatterns(
    query: string,
    topK: number = 5
  ): Promise<Array<{ pattern: string; similarity: number }>> {
    if (!this.available) {
      return [];
    }

    try {
      const { execFileSync } = await import('child_process');
      const { bin, args } = cfCliArgs('hooks', 'intelligence', 'pattern-search', '--query', query, '--top-k', String(topK));
      const result = execFileSync(bin, args, { ...EXEC_OPTS, timeout: 10000 });

      // Try to parse JSON result
      try {
        const parsed = safeJsonParse<unknown>(result);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    } catch {
      return [];
    }
  }
}

/**
 * Create a Claude Flow adapter instance
 */
export function createClaudeFlowAdapter(): ClaudeFlowAdapter {
  return new ClaudeFlowAdapterImpl();
}
