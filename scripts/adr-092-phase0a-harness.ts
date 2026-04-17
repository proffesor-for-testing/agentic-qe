#!/usr/bin/env tsx
/**
 * ADR-092 Phase 0a — Agent Harness A/B Comparison
 * ================================================
 *
 * Runs a real baseline-vs-advisor A/B against 10 RuView source files using
 * HybridRouter directly (no Claude Code runtime required).
 *
 * For each file, runs TWO trials:
 *   - Baseline: Sonnet alone generates a full pytest test suite
 *   - Advisor:  Opus advisor produces a strategic plan → Sonnet generates the
 *               test suite with the plan prepended to its system prompt
 *
 * Quality metrics (Python AST parse):
 *   - ast_valid, test_fn_count, assertion_count, mock_count, import_count
 *
 * Decision gate (ADR-092 Phase 0):
 *   PASS if: advisor_quality >= baseline_quality AND cost_delta_pct <= 10%
 *
 * Output: scripts/adr-092-phase0a-report.json
 * Cost:   ~$0.50 per full run (real spend via OpenRouter)
 * Run with: OPENROUTER_API_KEY=... npx tsx scripts/adr-092-phase0a-harness.ts
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync, execSync } from 'node:child_process';
import path from 'node:path';
import { config as dotenvConfig } from 'dotenv';

// Import TypeScript source directly via tsx
import { createProviderManager } from '../src/shared/llm/provider-manager.js';
import { createHybridRouter, type HybridRouter } from '../src/shared/llm/router/hybrid-router.js';

dotenvConfig({ path: '/workspaces/agentic-qe/.env' });

if (!process.env.OPENROUTER_API_KEY) {
  console.error('ERROR: OPENROUTER_API_KEY not set');
  process.exit(1);
}

// ============================================================================
// Configuration
// ============================================================================

const RUVIEW_DIR = '/tmp/adr-092-trial/RuView';
const REPORT_PATH = '/workspaces/agentic-qe/scripts/adr-092-phase0a-report.json';

const EXECUTOR_PROVIDER = 'openrouter' as const;
const EXECUTOR_MODEL = 'anthropic/claude-sonnet-4.6';
const ADVISOR_MODEL = 'anthropic/claude-opus-4.7';

const FILES = [
  { path: 'v1/src/main.py', lines: 116 },
  { path: 'v1/src/sensing/classifier.py', lines: 201 },
  { path: 'v1/src/hardware/router_interface.py', lines: 240 },
  { path: 'v1/src/models/densepose_head.py', lines: 278 },
  { path: 'v1/src/api/middleware/auth.py', lines: 306 },
  { path: 'v1/src/config.py', lines: 309 },
  { path: 'v1/src/api/middleware/rate_limit.py', lines: 325 },
  { path: 'v1/src/core/phase_sanitizer.py', lines: 346 },
  { path: 'v1/src/services/orchestrator.py', lines: 394 },
  { path: 'v1/src/api/routers/health.py', lines: 420 },
];

const EXECUTOR_SYSTEM_PROMPT_BASE = `You are the V3 QE Test Architect for Agentic QE. Generate a comprehensive pytest unit test suite for the provided Python source file.

Requirements:
- Use pytest idioms (fixtures, parametrize, pytest.raises)
- Mock external dependencies with unittest.mock
- Cover happy paths, error paths, and boundary conditions
- Follow Arrange-Act-Assert structure
- Use descriptive test names: test_<function>_<condition>_<outcome>
- Import the module under test correctly
- Output ONLY the test file content, no explanations, no markdown fences

Target: high branch coverage with concrete assertions, not generic smoke tests.`;

const ADVISOR_SYSTEM_PROMPT = `You are the advisor in an executor/advisor pattern. The executor has forwarded its full task context to you for strategic guidance before it writes the test suite.

Respond with a brief plan in under 100 words. Use enumerated steps. No prose. Name concrete classes/methods/dependencies from the source. Focus on: (1) what to mock, (2) which methods need priority coverage, (3) edge cases the executor might miss.`;

// ============================================================================
// Python AST quality parser
// ============================================================================

interface QualityResult {
  ast_valid: boolean;
  test_fn_count: number;
  assertion_count: number;
  mock_count: number;
  import_count: number;
  lines: number;
  error?: string;
}

function parseQuality(testCode: string): QualityResult {
  let code = testCode.trim();
  const fenceMatch = code.match(/^```(?:python)?\n([\s\S]*?)\n```/);
  if (fenceMatch) code = fenceMatch[1];

  const pyScript = `
import ast, sys, json
src = sys.stdin.read()
try:
    tree = ast.parse(src)
    test_fns = 0
    asserts = 0
    mocks = 0
    imports = 0
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if node.name.startswith('test_'):
                test_fns += 1
        elif isinstance(node, ast.Assert):
            asserts += 1
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            imports += 1
        elif isinstance(node, ast.Name) and node.id in ('Mock', 'MagicMock', 'AsyncMock', 'patch'):
            mocks += 1
        elif isinstance(node, ast.Attribute) and node.attr in ('Mock', 'MagicMock', 'AsyncMock', 'patch'):
            mocks += 1
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            func_name = ''
            if isinstance(node.func, ast.Attribute):
                func_name = node.func.attr
            elif isinstance(node.func, ast.Name):
                func_name = node.func.id
            if func_name in ('raises', 'assertEqual', 'assertTrue', 'assertFalse', 'assertIn', 'assertIsNone', 'assertIsNotNone', 'assertRaises'):
                asserts += 1
    print(json.dumps({
        'ast_valid': True,
        'test_fn_count': test_fns,
        'assertion_count': asserts,
        'mock_count': mocks,
        'import_count': imports,
        'lines': len(src.splitlines()),
    }))
except SyntaxError as e:
    print(json.dumps({
        'ast_valid': False,
        'error': str(e),
        'test_fn_count': 0,
        'assertion_count': 0,
        'mock_count': 0,
        'import_count': 0,
        'lines': len(src.splitlines()),
    }))
`;

  const result = spawnSync('python3', ['-c', pyScript], {
    input: code,
    encoding: 'utf-8',
  });

  try {
    return JSON.parse(result.stdout.trim());
  } catch {
    return {
      ast_valid: false,
      error: 'python3 AST parse failed: ' + result.stderr,
      test_fn_count: 0,
      assertion_count: 0,
      mock_count: 0,
      import_count: 0,
      lines: 0,
    };
  }
}

// ============================================================================
// HybridRouter bootstrap
// ============================================================================

function makeRouter(): HybridRouter {
  const pm = createProviderManager({
    primary: 'openrouter',
    providers: {
      openrouter: {
        apiKey: process.env.OPENROUTER_API_KEY,
        model: EXECUTOR_MODEL,
      } as any,
    },
  });

  const router = createHybridRouter(pm, {
    mode: 'manual',
    defaultProvider: 'openrouter',
    defaultModel: EXECUTOR_MODEL,
  });

  return router;
}

interface ChatResult {
  content: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
  model: string;
}

async function chat(
  router: HybridRouter,
  opts: { systemPrompt: string; userMessage: string; model: string; maxTokens: number; temperature?: number }
): Promise<ChatResult> {
  const start = Date.now();
  const response = await router.chat({
    messages: [{ role: 'user', content: opts.userMessage }],
    systemPrompt: opts.systemPrompt,
    preferredProvider: EXECUTOR_PROVIDER,
    model: opts.model,
    maxTokens: opts.maxTokens,
    temperature: opts.temperature ?? 0.3,
  });
  const wallMs = Date.now() - start;
  return {
    content: response.content,
    tokensIn: response.usage?.promptTokens ?? 0,
    tokensOut: response.usage?.completionTokens ?? 0,
    costUsd: response.cost?.totalCost ?? 0,
    latencyMs: response.latencyMs ?? wallMs,
    model: response.model,
  };
}

// ============================================================================
// Trial logic
// ============================================================================

async function runBaseline(router: HybridRouter, filePath: string, fileContent: string): Promise<ChatResult> {
  const userMessage = `Generate a comprehensive pytest unit test suite for the following Python source file: \`${filePath}\`

\`\`\`python
${fileContent}
\`\`\`

Output ONLY the Python test file content. No explanations, no markdown fences, just raw Python code I can save to test_${path.basename(filePath)}.`;

  return chat(router, {
    systemPrompt: EXECUTOR_SYSTEM_PROMPT_BASE,
    userMessage,
    model: EXECUTOR_MODEL,
    maxTokens: 8192,
  });
}

async function runAdvisor(router: HybridRouter, filePath: string, fileContent: string) {
  const advisorUserMessage = `# Executor Task
Generate a pytest test suite for \`${filePath}\`.

# Source File
\`\`\`python
${fileContent}
\`\`\`

# Request
I am the executor. Before I write the test suite, give me your strategic plan in under 100 words, enumerated steps. Name concrete classes/methods/dependencies from the source. Focus on what to mock, priority methods, and edge cases I might miss.`;

  const advisorResponse = await chat(router, {
    systemPrompt: ADVISOR_SYSTEM_PROMPT,
    userMessage: advisorUserMessage,
    model: ADVISOR_MODEL,
    maxTokens: 512,
    temperature: 0.2,
  });

  const augmentedSystemPrompt = `${EXECUTOR_SYSTEM_PROMPT_BASE}

## Strategic Plan from Advisor (Opus)
${advisorResponse.content.trim()}

Follow the advisor's plan. Use their suggestions for mocking, priority methods, and edge cases.`;

  const executorUserMessage = `Generate the pytest test suite for \`${filePath}\`:

\`\`\`python
${fileContent}
\`\`\`

Output ONLY the Python test file content. No explanations, no markdown fences, just raw Python code I can save to test_${path.basename(filePath)}.`;

  const executorResponse = await chat(router, {
    systemPrompt: augmentedSystemPrompt,
    userMessage: executorUserMessage,
    model: EXECUTOR_MODEL,
    maxTokens: 8192,
  });

  return {
    advisor: advisorResponse,
    executor: executorResponse,
    combinedCost: advisorResponse.costUsd + executorResponse.costUsd,
    combinedTokensIn: advisorResponse.tokensIn + executorResponse.tokensIn,
    combinedTokensOut: advisorResponse.tokensOut + executorResponse.tokensOut,
    combinedLatency: advisorResponse.latencyMs + executorResponse.latencyMs,
  };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const router = makeRouter();
  await router.initialize();

  const sha = execSync(`git -C ${RUVIEW_DIR} rev-parse HEAD`).toString().trim();

  console.log('ADR-092 Phase 0a — Agent Harness A/B');
  console.log(`RuView @ ${sha}`);
  console.log(`Executor: ${EXECUTOR_PROVIDER}/${EXECUTOR_MODEL}`);
  console.log(`Advisor:  ${EXECUTOR_PROVIDER}/${ADVISOR_MODEL}`);
  console.log('='.repeat(72));

  const results: any[] = [];
  let baselineTotalCost = 0;
  let advisorTotalCost = 0;

  for (let i = 0; i < FILES.length; i++) {
    const f = FILES[i];
    const fullPath = `${RUVIEW_DIR}/${f.path}`;
    const fileContent = readFileSync(fullPath, 'utf-8');

    console.log(`\n[${i + 1}/${FILES.length}] ${f.path} (${f.lines} L)`);

    try {
      process.stdout.write('  baseline... ');
      const baseline = await runBaseline(router, f.path, fileContent);
      const baselineQuality = parseQuality(baseline.content);
      baselineTotalCost += baseline.costUsd;
      console.log(
        `${baseline.tokensIn}->${baseline.tokensOut}t, ${baseline.latencyMs}ms, ` +
          `$${baseline.costUsd.toFixed(4)} -- ` +
          `${baselineQuality.ast_valid ? 'OK' : 'PARSE_FAIL'} ` +
          `tests=${baselineQuality.test_fn_count} asserts=${baselineQuality.assertion_count} mocks=${baselineQuality.mock_count}`
      );

      process.stdout.write('  advisor...  ');
      const advisor = await runAdvisor(router, f.path, fileContent);
      const advisorQuality = parseQuality(advisor.executor.content);
      advisorTotalCost += advisor.combinedCost;
      console.log(
        `${advisor.combinedTokensIn}->${advisor.combinedTokensOut}t, ${advisor.combinedLatency}ms, ` +
          `$${advisor.combinedCost.toFixed(4)} -- ` +
          `${advisorQuality.ast_valid ? 'OK' : 'PARSE_FAIL'} ` +
          `tests=${advisorQuality.test_fn_count} asserts=${advisorQuality.assertion_count} mocks=${advisorQuality.mock_count}`
      );

      results.push({
        file: f.path,
        lines: f.lines,
        baseline: {
          ast_valid: baselineQuality.ast_valid,
          ast_error: baselineQuality.error,
          test_fn_count: baselineQuality.test_fn_count,
          assertion_count: baselineQuality.assertion_count,
          mock_count: baselineQuality.mock_count,
          import_count: baselineQuality.import_count,
          output_lines: baselineQuality.lines,
          tokens_in: baseline.tokensIn,
          tokens_out: baseline.tokensOut,
          cost_usd: baseline.costUsd,
          latency_ms: baseline.latencyMs,
        },
        advisor: {
          ast_valid: advisorQuality.ast_valid,
          ast_error: advisorQuality.error,
          test_fn_count: advisorQuality.test_fn_count,
          assertion_count: advisorQuality.assertion_count,
          mock_count: advisorQuality.mock_count,
          import_count: advisorQuality.import_count,
          output_lines: advisorQuality.lines,
          advisor_tokens_in: advisor.advisor.tokensIn,
          advisor_tokens_out: advisor.advisor.tokensOut,
          advisor_cost_usd: advisor.advisor.costUsd,
          advisor_latency_ms: advisor.advisor.latencyMs,
          executor_tokens_in: advisor.executor.tokensIn,
          executor_tokens_out: advisor.executor.tokensOut,
          executor_cost_usd: advisor.executor.costUsd,
          executor_latency_ms: advisor.executor.latencyMs,
          combined_cost_usd: advisor.combinedCost,
          combined_latency_ms: advisor.combinedLatency,
          advisor_plan: advisor.advisor.content.trim(),
        },
      });
    } catch (err) {
      console.error(`  ERROR: ${(err as Error).message}`);
      results.push({ file: f.path, error: (err as Error).message });
    }
  }

  const validResults = results.filter((r) => r.baseline && r.advisor);
  const avgBaselineTests =
    validResults.reduce((s, r) => s + r.baseline.test_fn_count, 0) / validResults.length;
  const avgAdvisorTests =
    validResults.reduce((s, r) => s + r.advisor.test_fn_count, 0) / validResults.length;
  const avgBaselineAsserts =
    validResults.reduce((s, r) => s + r.baseline.assertion_count, 0) / validResults.length;
  const avgAdvisorAsserts =
    validResults.reduce((s, r) => s + r.advisor.assertion_count, 0) / validResults.length;
  const avgBaselineMocks =
    validResults.reduce((s, r) => s + r.baseline.mock_count, 0) / validResults.length;
  const avgAdvisorMocks =
    validResults.reduce((s, r) => s + r.advisor.mock_count, 0) / validResults.length;
  const baselineAstValid = validResults.filter((r) => r.baseline.ast_valid).length;
  const advisorAstValid = validResults.filter((r) => r.advisor.ast_valid).length;
  const costDeltaPct = ((advisorTotalCost - baselineTotalCost) / baselineTotalCost) * 100;

  const summary = {
    adr: 'ADR-092',
    phase: 'phase-0a-agent-harness',
    fixture_repo: 'https://github.com/ruvnet/RuView',
    fixture_sha: sha,
    timestamp: new Date().toISOString(),
    executor_provider: EXECUTOR_PROVIDER,
    executor_model: EXECUTOR_MODEL,
    advisor_provider: EXECUTOR_PROVIDER,
    advisor_model: ADVISOR_MODEL,
    trials: results.length,
    successes: validResults.length,
    aggregate: {
      baseline_total_cost_usd: baselineTotalCost,
      advisor_total_cost_usd: advisorTotalCost,
      cost_delta_usd: advisorTotalCost - baselineTotalCost,
      cost_delta_pct: costDeltaPct,
      baseline_ast_valid: `${baselineAstValid}/${validResults.length}`,
      advisor_ast_valid: `${advisorAstValid}/${validResults.length}`,
      avg_test_fn_count: {
        baseline: avgBaselineTests,
        advisor: avgAdvisorTests,
        delta_pct: ((avgAdvisorTests - avgBaselineTests) / avgBaselineTests) * 100,
      },
      avg_assertion_count: {
        baseline: avgBaselineAsserts,
        advisor: avgAdvisorAsserts,
        delta_pct: ((avgAdvisorAsserts - avgBaselineAsserts) / avgBaselineAsserts) * 100,
      },
      avg_mock_count: {
        baseline: avgBaselineMocks,
        advisor: avgAdvisorMocks,
        delta_pct:
          avgBaselineMocks > 0 ? ((avgAdvisorMocks - avgBaselineMocks) / avgBaselineMocks) * 100 : 0,
      },
    },
    gate: {
      quality_ge_baseline:
        avgAdvisorTests >= avgBaselineTests &&
        avgAdvisorAsserts >= avgBaselineAsserts &&
        advisorAstValid >= baselineAstValid,
      cost_le_baseline_plus_10: costDeltaPct <= 10,
      pass:
        avgAdvisorTests >= avgBaselineTests &&
        avgAdvisorAsserts >= avgBaselineAsserts &&
        advisorAstValid >= baselineAstValid &&
        costDeltaPct <= 10,
    },
    results,
  };

  writeFileSync(REPORT_PATH, JSON.stringify(summary, null, 2));

  console.log('\n' + '='.repeat(72));
  console.log('AGGREGATE RESULTS');
  console.log(`  Baseline cost:      $${baselineTotalCost.toFixed(4)}`);
  console.log(`  Advisor cost:       $${advisorTotalCost.toFixed(4)}`);
  console.log(`  Cost delta:         ${costDeltaPct >= 0 ? '+' : ''}${costDeltaPct.toFixed(1)}%`);
  console.log(`  Baseline AST valid: ${baselineAstValid}/${validResults.length}`);
  console.log(`  Advisor AST valid:  ${advisorAstValid}/${validResults.length}`);
  console.log(
    `  Avg test fns:       baseline=${avgBaselineTests.toFixed(1)} advisor=${avgAdvisorTests.toFixed(1)} (${(((avgAdvisorTests - avgBaselineTests) / avgBaselineTests) * 100).toFixed(1)}%)`
  );
  console.log(
    `  Avg assertions:     baseline=${avgBaselineAsserts.toFixed(1)} advisor=${avgAdvisorAsserts.toFixed(1)} (${(((avgAdvisorAsserts - avgBaselineAsserts) / avgBaselineAsserts) * 100).toFixed(1)}%)`
  );
  console.log(
    `  Avg mocks:          baseline=${avgBaselineMocks.toFixed(1)} advisor=${avgAdvisorMocks.toFixed(1)}`
  );
  console.log('\nGATE');
  console.log(`  Quality >= baseline:      ${summary.gate.quality_ge_baseline ? 'PASS' : 'FAIL'}`);
  console.log(`  Cost <= baseline + 10%:   ${summary.gate.cost_le_baseline_plus_10 ? 'PASS' : 'FAIL'}`);
  console.log(`  OVERALL:                  ${summary.gate.pass ? 'PASS' : 'FAIL'}`);
  console.log(`\nFull report: ${REPORT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
