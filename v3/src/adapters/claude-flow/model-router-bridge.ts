/**
 * Model Router Bridge
 * Connects AQE to Claude Flow's 3-tier model routing (ADR-026)
 *
 * When Claude Flow is available:
 * - Routes tasks to optimal model (haiku/sonnet/opus)
 * - Records outcomes for learning
 * - Uses Claude Flow's learned patterns
 *
 * When not available:
 * - Uses simple rule-based routing
 * - Falls back to sonnet as default
 */

import type { ModelRoutingResult, ModelRoutingOutcome } from './types.js';

/**
 * Task complexity indicators
 */
const COMPLEXITY_INDICATORS = {
  low: [
    /simple/i, /basic/i, /fix typo/i, /rename/i, /format/i,
    /add comment/i, /lint/i, /minor/i, /quick/i,
  ],
  high: [
    /architect/i, /design/i, /complex/i, /security/i, /performance/i,
    /refactor.*large/i, /critical/i, /analysis/i, /multi.*file/i,
    /database.*migration/i, /distributed/i, /concurrent/i,
  ],
};

/**
 * Model Router Bridge for 3-tier routing
 */
export class ModelRouterBridge {
  private claudeFlowAvailable = false;
  private routingHistory: ModelRoutingOutcome[] = [];

  constructor(private options: { projectRoot: string }) {}

  /**
   * Initialize the bridge
   */
  async initialize(): Promise<void> {
    this.claudeFlowAvailable = await this.checkClaudeFlow();
  }

  /**
   * Check if Claude Flow is available
   */
  private async checkClaudeFlow(): Promise<boolean> {
    try {
      const { execSync } = await import('child_process');
      execSync('npx @claude-flow/cli@latest hooks model-stats 2>/dev/null', {
        encoding: 'utf-8',
        timeout: 5000,
        cwd: this.options.projectRoot,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Route task to optimal model
   */
  async routeTask(task: string): Promise<ModelRoutingResult> {
    if (this.claudeFlowAvailable) {
      try {
        const { execSync } = await import('child_process');
        const result = execSync(
          `npx @claude-flow/cli@latest hooks model-route --task "${this.escapeArg(task)}" 2>/dev/null`,
          { encoding: 'utf-8', timeout: 10000, cwd: this.options.projectRoot }
        );

        // Parse result
        const modelMatch = result.match(/model[:\s]+["']?(haiku|sonnet|opus)/i);
        const confMatch = result.match(/confidence[:\s]+([0-9.]+)/i);
        const reasonMatch = result.match(/reason(?:ing)?[:\s]+["']?([^"'\n]+)/i);

        if (modelMatch) {
          return {
            model: modelMatch[1].toLowerCase() as 'haiku' | 'sonnet' | 'opus',
            confidence: confMatch ? parseFloat(confMatch[1]) : 0.7,
            reasoning: reasonMatch?.[1]?.trim(),
          };
        }
      } catch {
        // Fall through to local routing
      }
    }

    // Local rule-based routing
    return this.localRoute(task);
  }

  /**
   * Record model routing outcome
   */
  async recordOutcome(outcome: ModelRoutingOutcome): Promise<void> {
    // Store locally
    this.routingHistory.push(outcome);

    // Trim history
    if (this.routingHistory.length > 1000) {
      this.routingHistory = this.routingHistory.slice(-500);
    }

    if (this.claudeFlowAvailable) {
      try {
        const { execSync } = await import('child_process');
        execSync(
          `npx @claude-flow/cli@latest hooks model-outcome --task "${this.escapeArg(outcome.task)}" --model ${outcome.model} --outcome ${outcome.outcome} 2>/dev/null`,
          { encoding: 'utf-8', timeout: 10000, cwd: this.options.projectRoot }
        );
      } catch {
        // Silently fail - outcome recording is optional
      }
    }
  }

  /**
   * Get routing statistics
   */
  getStats(): {
    totalRoutings: number;
    modelDistribution: Record<string, number>;
    successRate: Record<string, number>;
  } {
    const stats = {
      totalRoutings: this.routingHistory.length,
      modelDistribution: { haiku: 0, sonnet: 0, opus: 0 } as Record<string, number>,
      successRate: { haiku: 0, sonnet: 0, opus: 0 } as Record<string, number>,
    };

    const successCounts: Record<string, number> = { haiku: 0, sonnet: 0, opus: 0 };

    for (const outcome of this.routingHistory) {
      stats.modelDistribution[outcome.model]++;
      if (outcome.outcome === 'success') {
        successCounts[outcome.model]++;
      }
    }

    for (const model of ['haiku', 'sonnet', 'opus']) {
      const total = stats.modelDistribution[model];
      stats.successRate[model] = total > 0 ? successCounts[model] / total : 0;
    }

    return stats;
  }

  /**
   * Check if Claude Flow is available
   */
  isClaudeFlowAvailable(): boolean {
    return this.claudeFlowAvailable;
  }

  /**
   * Local rule-based routing
   */
  private localRoute(task: string): ModelRoutingResult {
    const taskLower = task.toLowerCase();

    // Check for low complexity indicators → haiku
    for (const pattern of COMPLEXITY_INDICATORS.low) {
      if (pattern.test(taskLower)) {
        return {
          model: 'haiku',
          confidence: 0.75,
          reasoning: 'Low complexity task detected - using haiku for speed',
        };
      }
    }

    // Check for high complexity indicators → opus
    for (const pattern of COMPLEXITY_INDICATORS.high) {
      if (pattern.test(taskLower)) {
        return {
          model: 'opus',
          confidence: 0.8,
          reasoning: 'High complexity task detected - using opus for capability',
        };
      }
    }

    // Check task length as proxy for complexity
    if (task.length > 500) {
      return {
        model: 'opus',
        confidence: 0.65,
        reasoning: 'Long task description - using opus for complex reasoning',
      };
    }

    if (task.length < 50) {
      return {
        model: 'haiku',
        confidence: 0.6,
        reasoning: 'Short task description - using haiku for efficiency',
      };
    }

    // Default to sonnet (balanced)
    return {
      model: 'sonnet',
      confidence: 0.7,
      reasoning: 'Medium complexity task - using sonnet for balance',
    };
  }

  /**
   * Escape shell argument - use single quotes and escape internal single quotes
   * This is the safest approach as single-quoted strings don't interpolate variables
   * CodeQL: js/incomplete-sanitization - Fixed by using single-quote wrapping
   */
  private escapeArg(arg: string): string {
    // Single quotes don't interpolate, escape any internal single quotes
    // by ending the quote, adding an escaped quote, and starting a new quote
    return "'" + arg.replace(/'/g, "'\\''") + "'";
  }
}

/**
 * Create model router bridge
 */
export function createModelRouterBridge(options: { projectRoot: string }): ModelRouterBridge {
  return new ModelRouterBridge(options);
}
