import { z } from 'zod';

export default {
  name: 'qe-defect-scan',
  description: 'Run defect prediction and code indexing for comprehensive defect intelligence analysis',
  parameters: z.object({
    target: z.string().describe('Target path to scan for potential defects'),
    indexCode: z.boolean().default(true).describe('Index code into knowledge graph before prediction'),
    includePatterns: z.boolean().default(true).describe('Query memory for known defect patterns'),
  }),
  execute: async (
    params: { target: string; indexCode: boolean; includePatterns: boolean },
    ctx: any,
  ) => {
    const startTime = Date.now();
    const results: Record<string, any> = {};

    // Step 1: Index code for knowledge graph (if requested)
    if (params.indexCode) {
      try {
        results.index = await ctx.callTool('mcp:agentic-qe:code_index', {
          target: params.target,
        });
      } catch (err: any) {
        results.index = { error: `Code indexing failed: ${err.message}` };
      }
    }

    // Step 2: Run defect prediction
    try {
      results.prediction = await ctx.callTool('mcp:agentic-qe:defect_predict', {
        target: params.target,
      });
    } catch (err: any) {
      return {
        error: `Defect prediction failed: ${err.message}`,
        phase: 'predict',
      };
    }

    // Step 3: Query memory for known patterns (if requested)
    if (params.includePatterns) {
      try {
        results.knownPatterns = await ctx.callTool('mcp:agentic-qe:memory_query', {
          pattern: 'defect-patterns/*',
          namespace: 'qe-defects',
        });
      } catch (err: any) {
        results.knownPatterns = { error: `Pattern query failed: ${err.message}` };
      }
    }

    const elapsed = Date.now() - startTime;

    // Store scan results for learning
    try {
      await ctx.callTool('mcp:agentic-qe:memory_store', {
        key: `defect-scan/${params.target}/${Date.now()}`,
        namespace: 'qe-defects',
        value: {
          target: params.target,
          prediction: results.prediction,
          timestamp: new Date().toISOString(),
        },
      });
    } catch {
      // Non-critical
    }

    return {
      target: params.target,
      codeIndex: results.index,
      prediction: results.prediction,
      knownPatterns: results.knownPatterns,
      elapsedMs: elapsed,
      summary: `Defect scan completed for ${params.target} in ${elapsed}ms.`,
    };
  },
};
