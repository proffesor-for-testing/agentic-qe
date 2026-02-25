import { z } from 'zod';

export default {
  name: 'qe-full-audit',
  description: 'Run comprehensive QE audit: quality assessment + security scan + coverage analysis in sequence',
  parameters: z.object({
    target: z.string().describe('Target path to audit (e.g., "src/" or "src/services/")'),
    includeTests: z.boolean().default(true).describe('Include test files in the audit scope'),
    runGate: z.boolean().default(true).describe('Run quality gate evaluation to determine pass/fail'),
    dast: z.boolean().default(false).describe('Include DAST (dynamic) scanning in addition to SAST'),
  }),
  execute: async (
    params: { target: string; includeTests: boolean; runGate: boolean; dast: boolean },
    ctx: any,
  ) => {
    const startTime = Date.now();
    const results: Record<string, any> = {};
    const errors: string[] = [];

    // Step 1: Quality assessment
    try {
      results.quality = await ctx.callTool('mcp:agentic-qe:quality_assess', {
        runGate: params.runGate,
      });
    } catch (err: any) {
      errors.push(`Quality assessment failed: ${err.message}`);
    }

    // Step 2: Security scan (SAST + optional DAST)
    try {
      results.security = await ctx.callTool('mcp:agentic-qe:security_scan_comprehensive', {
        target: params.target,
        sast: true,
        dast: params.dast,
      });
    } catch (err: any) {
      errors.push(`Security scan failed: ${err.message}`);
    }

    // Step 3: Coverage analysis with gap detection
    try {
      results.coverage = await ctx.callTool('mcp:agentic-qe:coverage_analyze_sublinear', {
        target: params.target,
        detectGaps: true,
      });
    } catch (err: any) {
      errors.push(`Coverage analysis failed: ${err.message}`);
    }

    const elapsed = Date.now() - startTime;

    // Store audit results in memory for tracking
    try {
      await ctx.callTool('mcp:agentic-qe:memory_store', {
        key: `audit/${params.target}/${Date.now()}`,
        namespace: 'qe-audits',
        value: {
          target: params.target,
          timestamp: new Date().toISOString(),
          quality: results.quality ?? null,
          security: results.security ?? null,
          coverage: results.coverage ?? null,
          errors,
          elapsedMs: elapsed,
        },
      });
    } catch {
      // Non-critical: memory store failure should not fail the audit
    }

    return {
      target: params.target,
      quality: results.quality ?? { error: 'Assessment failed' },
      security: results.security ?? { error: 'Scan failed' },
      coverage: results.coverage ?? { error: 'Analysis failed' },
      errors: errors.length > 0 ? errors : undefined,
      elapsedMs: elapsed,
      summary: `Audit completed in ${elapsed}ms. ${errors.length} errors encountered.`,
    };
  },
};
