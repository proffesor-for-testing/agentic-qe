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
 *
 * Trajectories and patterns go through ruflo's MCP tools via `ruflo mcp exec`
 * (#1455): ruflo has no `hooks intelligence trajectory-*` / `pattern-*` CLI
 * subcommands. Those calls report `unavailable` or `failed` instead of an
 * invented id or an empty success.
 */

import type { ClaudeFlowAdapter, ClaudeFlowCallResult, ClaudeFlowFeatures } from './types.js';
import { detectClaudeFlow } from '../../adapters/claude-flow/detect.js';
import { confidenceFraction } from '../../adapters/claude-flow/model-router-bridge.js';
import { KeyedSerialQueue, runRufloTool, type RufloToolName } from '../../adapters/claude-flow/ruflo-tool.js';
import { safeJsonParse } from '../../shared/safe-json.js';

/** Shared execFileSync options */
const EXEC_OPTS = { encoding: 'utf-8' as const };

/**
 * Build args array for `npx --no-install` ruflo / @claude-flow/cli calls.
 * Uses ruflo first with @claude-flow/cli fallback (matching detect.ts).
 * Using execFileSync with explicit args prevents shell injection.
 */
function cfCliArgs(...subcommand: string[]): { bin: string; args: string[] } {
  // Lazy-resolve: ruflo preferred, @claude-flow/cli as fallback
  const pkg = cfCliArgs._resolvedPkg ??= (() => {
    for (const candidate of ['ruflo', '@claude-flow/cli']) {
      try { require.resolve(`${candidate}/package.json`); return candidate; } catch { /* next */ }
    }
    return 'ruflo';
  })();
  return {
    bin: 'npx',
    // ruflo-argv-unverifiable: forwards cfCliArgs(...) arguments; each call site is checked
    args: ['--no-install', pkg, ...subcommand],
  };
}
cfCliArgs._resolvedPkg = undefined as string | undefined;

/**
 * Claude Flow Adapter Implementation
 * Falls back gracefully when Claude Flow is not available
 */
export class ClaudeFlowAdapterImpl implements ClaudeFlowAdapter {
  readonly name = 'claude-flow' as const;
  private initialized = false;
  private available = false;
  /** ruflo calls of one trajectory run in order (#1455). */
  private trajectoryQueue = new KeyedSerialQueue();

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

  /** Run a ruflo intelligence tool, or report why it could not run. */
  private async tool(
    name: RufloToolName,
    params: Record<string, unknown>,
    timeoutMs?: number
  ): Promise<ClaudeFlowCallResult<Record<string, unknown>>> {
    if (!this.available) return UNAVAILABLE;
    // ruflo-argv-unverifiable: `name` is a RufloToolName; RUFLO_TOOLS is checked against the snapshot
    const result = await runRufloTool(name, params, { cwd: process.cwd(), timeoutMs });
    return result.ok ? { status: 'ok', value: result.data } : { status: 'failed', reason: result.reason };
  }

  /**
   * Start a SONA trajectory; the value is ruflo's trajectory id.
   */
  async startTrajectory(task: string, agent?: string): Promise<ClaudeFlowCallResult<string>> {
    const r = await this.tool('hooks_intelligence_trajectory-start', agent ? { task, agent } : { task });
    if (r.status !== 'ok') return r;
    const id = r.value.trajectoryId;
    return typeof id === 'string' && id.length > 0
      ? { status: 'ok', value: id }
      : { status: 'failed', reason: 'ruflo returned no trajectoryId' };
  }

  /**
   * Record a trajectory step
   */
  async recordStep(
    trajectoryId: string,
    action: string,
    result?: string,
    quality?: number
  ): Promise<ClaudeFlowCallResult> {
    const r = await this.trajectoryQueue.run(trajectoryId, () =>
      this.tool('hooks_intelligence_trajectory-step', {
        trajectoryId,
        action,
        ...(result ? { result } : {}),
        ...(quality !== undefined ? { quality } : {}),
      })
    );
    if (r.status !== 'ok') return r;
    return r.value.recorded === true
      ? { status: 'ok', value: undefined }
      : { status: 'failed', reason: `ruflo did not record the step (${String(r.value.implementation ?? 'recorded: false')})` };
  }

  /**
   * End a trajectory
   */
  async endTrajectory(
    trajectoryId: string,
    success: boolean,
    feedback?: string
  ): Promise<ClaudeFlowCallResult> {
    const r = await this.trajectoryQueue.run(trajectoryId, () =>
      this.tool('hooks_intelligence_trajectory-end', { trajectoryId, success, ...(feedback ? { feedback } : {}) }, 30000)
    );
    if (r.status !== 'ok') return r;
    return r.value.trajectory != null
      ? { status: 'ok', value: undefined }
      : { status: 'failed', reason: `ruflo did not end the trajectory (${String(r.value.note ?? 'trajectory not found')})` };
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
      const confMatch = result.match(/confidence[:\s]+([0-9.]+%?)/i);

      return {
        model: (modelMatch?.[1]?.toLowerCase() as 'haiku' | 'sonnet' | 'opus') || 'sonnet',
        confidence: confMatch ? confidenceFraction(confMatch[1]) : 0.7,
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
   * Store a pattern; the value is ruflo's pattern id.
   */
  async storePattern(
    pattern: string,
    type: string,
    confidence: number,
    metadata?: Record<string, unknown>
  ): Promise<ClaudeFlowCallResult<string>> {
    const r = await this.tool('hooks_intelligence_pattern-store', {
      pattern,
      type,
      confidence,
      ...(metadata ? { metadata } : {}),
    });
    if (r.status !== 'ok') return r;
    const id = r.value.patternId;
    return typeof id === 'string' || typeof id === 'number'
      ? { status: 'ok', value: String(id) }
      : { status: 'failed', reason: 'ruflo returned no patternId' };
  }

  /**
   * Search patterns
   */
  async searchPatterns(
    query: string,
    topK: number = 5
  ): Promise<ClaudeFlowCallResult<Array<{ pattern: string; similarity: number }>>> {
    const r = await this.tool('hooks_intelligence_pattern-search', { query, topK });
    if (r.status !== 'ok') return r;
    if (!Array.isArray(r.value.results)) return { status: 'failed', reason: 'ruflo returned no results array' };
    return {
      status: 'ok',
      value: (r.value.results as Array<Record<string, unknown>>).map((hit) => ({
        pattern: String(hit.pattern ?? ''),
        similarity: typeof hit.similarity === 'number' ? hit.similarity : 0,
      })),
    };
  }
}

const UNAVAILABLE = { status: 'unavailable', reason: 'Claude Flow not available' } as const;

/**
 * Create a Claude Flow adapter instance
 */
export function createClaudeFlowAdapter(): ClaudeFlowAdapter {
  return new ClaudeFlowAdapterImpl();
}
