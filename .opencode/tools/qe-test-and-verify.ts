import { z } from 'zod';

export default {
  name: 'qe-test-and-verify',
  description: 'Generate tests for source code, execute them, and analyze coverage gaps in one pipeline',
  parameters: z.object({
    sourceCode: z.string().describe('Source code or file path to generate tests for'),
    language: z.string().default('typescript').describe('Programming language of the source'),
    testType: z
      .enum(['unit', 'integration', 'e2e'])
      .default('unit')
      .describe('Type of tests to generate'),
    coverageTarget: z.number().default(80).describe('Target coverage percentage'),
    parallel: z.boolean().default(true).describe('Execute tests in parallel'),
  }),
  execute: async (
    params: {
      sourceCode: string;
      language: string;
      testType: 'unit' | 'integration' | 'e2e';
      coverageTarget: number;
      parallel: boolean;
    },
    ctx: any,
  ) => {
    const startTime = Date.now();
    const results: Record<string, any> = {};

    // Step 1: Generate tests
    try {
      results.generated = await ctx.callTool('mcp:agentic-qe:test_generate_enhanced', {
        sourceCode: params.sourceCode,
        language: params.language,
        testType: params.testType,
      });
    } catch (err: any) {
      return {
        error: `Test generation failed: ${err.message}`,
        phase: 'generate',
      };
    }

    // Step 2: Execute generated tests
    const testFiles = results.generated?.testFiles ?? [];
    if (testFiles.length > 0) {
      try {
        results.execution = await ctx.callTool('mcp:agentic-qe:test_execute_parallel', {
          testFiles,
          parallel: params.parallel,
        });
      } catch (err: any) {
        results.execution = { error: `Test execution failed: ${err.message}` };
      }
    }

    // Step 3: Analyze coverage gaps
    try {
      results.coverage = await ctx.callTool('mcp:agentic-qe:coverage_analyze_sublinear', {
        target: params.sourceCode,
        detectGaps: true,
      });
    } catch (err: any) {
      results.coverage = { error: `Coverage analysis failed: ${err.message}` };
    }

    const elapsed = Date.now() - startTime;
    const coverageMet =
      results.coverage?.summary?.statements?.percentage >= params.coverageTarget;

    // Store results for learning
    try {
      await ctx.callTool('mcp:agentic-qe:memory_store', {
        key: `test-verify/${Date.now()}`,
        namespace: 'qe-test-results',
        value: {
          source: params.sourceCode,
          testType: params.testType,
          testsGenerated: testFiles.length,
          coverageMet,
          timestamp: new Date().toISOString(),
        },
      });
    } catch {
      // Non-critical
    }

    return {
      generated: results.generated,
      execution: results.execution,
      coverage: results.coverage,
      coverageTarget: params.coverageTarget,
      coverageMet,
      elapsedMs: elapsed,
      summary: `Generated ${testFiles.length} test files. Coverage target ${params.coverageTarget}%: ${coverageMet ? 'MET' : 'NOT MET'}.`,
    };
  },
};
