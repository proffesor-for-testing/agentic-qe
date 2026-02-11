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

/**
 * Claude Flow Adapter Implementation
 * Falls back gracefully when Claude Flow is not available
 */
export class ClaudeFlowAdapterImpl implements ClaudeFlowAdapter {
  readonly name = 'claude-flow' as const;
  private initialized = false;
  private available = false;

  /**
   * Check if Claude Flow is available
   */
  async isAvailable(): Promise<boolean> {
    if (this.available) return true;

    try {
      // Try to call a simple MCP tool via CLI
      const { execSync } = await import('child_process');
      execSync('npx @claude-flow/cli@latest hooks metrics --period 1h', {
        encoding: 'utf-8',
        timeout: 10000,
      });
      this.available = true;
      return true;
    } catch {
      this.available = false;
      return false;
    }
  }

  /**
   * Get Claude Flow version
   */
  async getVersion(): Promise<string | undefined> {
    try {
      const { execSync } = await import('child_process');
      const result = execSync('npx @claude-flow/cli@latest --version', {
        encoding: 'utf-8',
        timeout: 5000,
      });
      return result.trim();
    } catch {
      return undefined;
    }
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
      const { execSync } = await import('child_process');
      const agentArg = agent ? `--agent "${agent}"` : '';
      const result = execSync(
        `npx @claude-flow/cli@latest hooks intelligence trajectory-start --task "${task}" ${agentArg}`,
        { encoding: 'utf-8', timeout: 10000 }
      );

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
      const { execSync } = await import('child_process');
      const resultArg = result ? `--result "${result}"` : '';
      const qualityArg = quality !== undefined ? `--quality ${quality}` : '';

      execSync(
        `npx @claude-flow/cli@latest hooks intelligence trajectory-step --trajectory-id "${trajectoryId}" --action "${action}" ${resultArg} ${qualityArg}`,
        { encoding: 'utf-8', timeout: 10000 }
      );
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
      const { execSync } = await import('child_process');
      const feedbackArg = feedback ? `--feedback "${feedback}"` : '';

      execSync(
        `npx @claude-flow/cli@latest hooks intelligence trajectory-end --trajectory-id "${trajectoryId}" --success ${success} ${feedbackArg}`,
        { encoding: 'utf-8', timeout: 10000 }
      );
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
      const { execSync } = await import('child_process');
      const result = execSync(
        `npx @claude-flow/cli@latest hooks model-route --task "${task}"`,
        { encoding: 'utf-8', timeout: 10000 }
      );

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
      const { execSync } = await import('child_process');
      execSync(
        `npx @claude-flow/cli@latest hooks model-outcome --task "${task}" --model ${model} --outcome ${outcome}`,
        { encoding: 'utf-8', timeout: 10000 }
      );
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
      const { execSync } = await import('child_process');
      const result = execSync(
        `npx @claude-flow/cli@latest hooks pretrain --path "${path}" --depth ${depth}`,
        { encoding: 'utf-8', timeout: 60000 }
      );

      // Try to parse JSON result
      try {
        return JSON.parse(result);
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
      const { execSync } = await import('child_process');
      const metadataArg = metadata ? `--metadata '${JSON.stringify(metadata)}'` : '';

      execSync(
        `npx @claude-flow/cli@latest hooks intelligence pattern-store --pattern "${pattern}" --type ${type} --confidence ${confidence} ${metadataArg}`,
        { encoding: 'utf-8', timeout: 10000 }
      );
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
      const { execSync } = await import('child_process');
      const result = execSync(
        `npx @claude-flow/cli@latest hooks intelligence pattern-search --query "${query}" --top-k ${topK}`,
        { encoding: 'utf-8', timeout: 10000 }
      );

      // Try to parse JSON result
      try {
        const parsed = JSON.parse(result);
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
