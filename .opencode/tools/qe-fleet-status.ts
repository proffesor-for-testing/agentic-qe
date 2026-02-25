import { z } from 'zod';

export default {
  name: 'qe-fleet-status',
  description: 'Get comprehensive fleet status including agent health, task progress, and performance metrics',
  parameters: z.object({
    verbose: z.boolean().default(false).describe('Include detailed agent-level information'),
    includeMetrics: z.boolean().default(true).describe('Include performance metrics for all agents'),
    domain: z.string().optional().describe('Filter to a specific domain (e.g., "testing", "security")'),
  }),
  execute: async (
    params: { verbose: boolean; includeMetrics: boolean; domain?: string },
    ctx: any,
  ) => {
    const startTime = Date.now();
    const results: Record<string, any> = {};

    // Step 1: Get fleet status
    try {
      results.fleet = await ctx.callTool('mcp:agentic-qe:fleet_status', {
        verbose: params.verbose,
      });
    } catch (err: any) {
      results.fleet = { error: `Fleet status failed: ${err.message}` };
    }

    // Step 2: Get agent metrics (if requested)
    if (params.includeMetrics) {
      try {
        results.metrics = await ctx.callTool('mcp:agentic-qe:agent_metrics', {});
      } catch (err: any) {
        results.metrics = { error: `Agent metrics failed: ${err.message}` };
      }
    }

    // Step 3: Get fleet health
    try {
      if (params.domain) {
        results.health = await ctx.callTool('mcp:agentic-qe:fleet_health', {
          domain: params.domain,
        });
      } else {
        results.health = await ctx.callTool('mcp:agentic-qe:fleet_health', {});
      }
    } catch (err: any) {
      results.health = { error: `Health check failed: ${err.message}` };
    }

    const elapsed = Date.now() - startTime;

    return {
      fleet: results.fleet,
      metrics: results.metrics,
      health: results.health,
      elapsedMs: elapsed,
      summary: `Fleet status dashboard retrieved in ${elapsed}ms.`,
    };
  },
};
