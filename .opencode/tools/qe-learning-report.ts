import { z } from 'zod';

export default {
  name: 'qe-learning-report',
  description: 'Query AQE memory for learned patterns and generate a comprehensive learning summary report',
  parameters: z.object({
    namespace: z.string().default('default').describe('Memory namespace to query'),
    pattern: z.string().default('*').describe('Key pattern to match (glob syntax)'),
    includeSemanticSearch: z.boolean().default(false).describe('Use HNSW semantic search'),
    semanticQuery: z.string().optional().describe('Natural language query for semantic search'),
    limit: z.number().default(50).describe('Maximum number of entries to retrieve'),
  }),
  execute: async (
    params: {
      namespace: string;
      pattern: string;
      includeSemanticSearch: boolean;
      semanticQuery?: string;
      limit: number;
    },
    ctx: any,
  ) => {
    const startTime = Date.now();
    const results: Record<string, any> = {};

    // Step 1: Pattern-based memory query
    try {
      results.patterns = await ctx.callTool('mcp:agentic-qe:memory_query', {
        pattern: params.pattern,
        namespace: params.namespace,
      });
    } catch (err: any) {
      results.patterns = { error: `Pattern query failed: ${err.message}` };
    }

    // Step 2: Semantic search (if requested)
    if (params.includeSemanticSearch && params.semanticQuery) {
      try {
        results.semantic = await ctx.callTool('mcp:agentic-qe:memory_query', {
          pattern: params.semanticQuery,
          namespace: params.namespace,
          semantic: true,
        });
      } catch (err: any) {
        results.semantic = { error: `Semantic search failed: ${err.message}` };
      }
    }

    // Step 3: Get memory usage stats
    try {
      results.usage = await ctx.callTool('mcp:agentic-qe:memory_usage', {});
    } catch (err: any) {
      results.usage = { error: `Memory usage query failed: ${err.message}` };
    }

    const elapsed = Date.now() - startTime;

    // Compile summary
    const patternCount = Array.isArray(results.patterns?.data)
      ? results.patterns.data.length
      : 0;
    const semanticCount = Array.isArray(results.semantic?.data)
      ? results.semantic.data.length
      : 0;

    return {
      patterns: results.patterns,
      semanticResults: results.semantic,
      memoryUsage: results.usage,
      elapsedMs: elapsed,
      summary: `Learning report: ${patternCount} pattern matches, ${semanticCount} semantic matches. Generated in ${elapsed}ms.`,
    };
  },
};
