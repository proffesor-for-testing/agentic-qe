#!/usr/bin/env tsx
/**
 * ADR-092 Multi-Model Advisor Trial
 * ==================================
 *
 * Round 1: Advisor-only — 5 candidate models × 10 RuView files = 50 calls.
 * Measures advice quality (specificity, step count, class/method grounding)
 * and cost. Picks top 2 winners for full A/B in Round 2.
 *
 * Round 2: Full A/B — top 2 advisor models × 10 files, each paired with
 * Sonnet executor. Compared to existing Sonnet baseline + Opus advisor data.
 *
 * Output: scripts/adr-092-multi-model-report.json
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync, execSync } from 'node:child_process';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig({ path: '/workspaces/agentic-qe/.env' });

if (!process.env.OPENROUTER_API_KEY) {
  console.error('ERROR: OPENROUTER_API_KEY not set');
  process.exit(1);
}

// ============================================================================
// Configuration
// ============================================================================

const RUVIEW_DIR = '/tmp/adr-092-trial/RuView';
const REPORT_PATH = '/workspaces/agentic-qe/scripts/adr-092-multi-model-report.json';

const EXECUTOR_MODEL = 'anthropic/claude-sonnet-4.6';

const ADVISOR_CANDIDATES = [
  { id: 'deepseek/deepseek-r1:free',  label: 'DeepSeek-R1-Free',  inputPer1M: 0,     outputPer1M: 0 },
  { id: 'google/gemma-4-31b-it',      label: 'Gemma-4-31B',       inputPer1M: 0.14,  outputPer1M: 0.40 },
  { id: 'deepseek/deepseek-chat',     label: 'DeepSeek-V3.2',     inputPer1M: 0.32,  outputPer1M: 0.89 },
  { id: 'qwen/qwen3.6-plus',          label: 'Qwen3.6-Plus',      inputPer1M: 0.325, outputPer1M: 1.95 },
  { id: 'moonshotai/kimi-k2',         label: 'Kimi-K2',           inputPer1M: 0.57,  outputPer1M: 2.30 },
];

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

const ADVISOR_SYSTEM_PROMPT = `You are the advisor in an executor/advisor pattern. The executor has forwarded its full task context to you for strategic guidance before it writes a pytest test suite.

Respond with a brief plan in under 100 words. Use enumerated steps. No prose. Name concrete classes/methods/dependencies from the source. Focus on: (1) what to mock, (2) which methods need priority coverage, (3) edge cases the executor might miss.`;

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

// ============================================================================
// Advice quality scorer (Python)
// ============================================================================

interface AdviceQuality {
  word_count: number;
  step_count: number;
  class_method_refs: number;  // named identifiers that look like code (snake_case, CamelCase)
  mock_mentions: number;
  follows_format: boolean;    // starts with "1." and has numbered steps
  score: number;              // composite 0-100
}

function scoreAdvice(advice: string): AdviceQuality {
  const result = spawnSync('python3', ['-c', `
import re, json, sys
advice = sys.stdin.read().strip()

words = advice.split()
word_count = len(words)

# Count numbered steps (e.g. "1.", "2.", etc.)
steps = re.findall(r'^\\d+\\.', advice, re.MULTILINE)
step_count = len(steps)

# Count code-like references (snake_case identifiers, CamelCase, dotted paths)
code_refs = set(re.findall(r'\\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\\b', advice))  # snake_case
code_refs |= set(re.findall(r'\\b[A-Z][a-zA-Z0-9]+\\b', advice))  # CamelCase
code_refs -= {'Mock', 'MagicMock', 'AsyncMock', 'Test', 'None', 'True', 'False', 'When', 'For', 'The'}
class_method_refs = len(code_refs)

# Count mock-related mentions
mock_mentions = len(re.findall(r'\\b(?:mock|Mock|MagicMock|patch|monkeypatch|fixture|stub|fake)\\b', advice, re.IGNORECASE))

# Format check
follows_format = bool(re.match(r'^\\s*1\\.', advice))

# Composite score (weighted)
score = 0
score += min(25, step_count * 5)                    # up to 25 for steps (5 steps = max)
score += min(30, class_method_refs * 3)              # up to 30 for code grounding (10 refs = max)
score += min(15, mock_mentions * 5)                  # up to 15 for mock mentions (3 = max)
score += 10 if follows_format else 0                 # 10 for numbered format
score += 20 if 30 <= word_count <= 150 else (10 if word_count < 200 else 0)  # 20 for concise

print(json.dumps({
    'word_count': word_count,
    'step_count': step_count,
    'class_method_refs': class_method_refs,
    'mock_mentions': mock_mentions,
    'follows_format': follows_format,
    'score': min(100, score),
}))
  `], { input: advice, encoding: 'utf-8' });

  try {
    return JSON.parse(result.stdout.trim());
  } catch {
    return { word_count: 0, step_count: 0, class_method_refs: 0, mock_mentions: 0, follows_format: false, score: 0 };
  }
}

// ============================================================================
// Test quality scorer (Python AST)
// ============================================================================

interface TestQuality {
  ast_valid: boolean;
  test_fn_count: number;
  assertion_count: number;
  mock_count: number;
  import_count: number;
  lines: number;
  error?: string;
}

function parseTestQuality(testCode: string): TestQuality {
  let code = testCode.trim();
  const fenceMatch = code.match(/^```(?:python)?\n([\s\S]*?)\n```/);
  if (fenceMatch) code = fenceMatch[1];

  const result = spawnSync('python3', ['-c', `
import ast, sys, json
src = sys.stdin.read()
try:
    tree = ast.parse(src)
    test_fns = asserts = mocks = imports = 0
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name.startswith('test_'):
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
            fn = ''
            if isinstance(node.func, ast.Attribute): fn = node.func.attr
            elif isinstance(node.func, ast.Name): fn = node.func.id
            if fn in ('raises','assertEqual','assertTrue','assertFalse','assertIn','assertIsNone','assertIsNotNone','assertRaises'):
                asserts += 1
    print(json.dumps({'ast_valid':True,'test_fn_count':test_fns,'assertion_count':asserts,'mock_count':mocks,'import_count':imports,'lines':len(src.splitlines())}))
except SyntaxError as e:
    print(json.dumps({'ast_valid':False,'error':str(e),'test_fn_count':0,'assertion_count':0,'mock_count':0,'import_count':0,'lines':len(src.splitlines())}))
  `], { input: code, encoding: 'utf-8' });

  try { return JSON.parse(result.stdout.trim()); }
  catch { return { ast_valid: false, test_fn_count: 0, assertion_count: 0, mock_count: 0, import_count: 0, lines: 0, error: 'parse failed' }; }
}

// ============================================================================
// Direct OpenRouter API (bypass HybridRouter for multi-model trial)
// ============================================================================

interface ChatResult {
  content: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
  model: string;
}

async function chat(opts: { systemPrompt: string; userMessage: string; model: string; maxTokens: number; temperature?: number }): Promise<ChatResult> {
  const start = Date.now();
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/proffesor-for-testing/agentic-qe',
      'X-Title': 'AQE ADR-092 Multi-Model Trial',
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: 'system', content: opts.systemPrompt },
        { role: 'user', content: opts.userMessage },
      ],
      max_tokens: opts.maxTokens,
      temperature: opts.temperature ?? 0.2,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json() as any;
  const latencyMs = Date.now() - start;
  const choice = data.choices?.[0];
  const usage = data.usage ?? {};

  return {
    content: choice?.message?.content ?? '',
    tokensIn: usage.prompt_tokens ?? 0,
    tokensOut: usage.completion_tokens ?? 0,
    costUsd: parseFloat(data.usage?.total_cost ?? '0') || 0,
    latencyMs,
    model: data.model ?? opts.model,
  };
}

// ============================================================================
// Round 1: advisor-only comparison
// ============================================================================

async function runRound1() {
  const sha = execSync(`git -C ${RUVIEW_DIR} rev-parse HEAD`).toString().trim();

  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  ROUND 1: Advisor-Only — 5 models × 10 files                       ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  const round1Results: any[] = [];

  for (const candidate of ADVISOR_CANDIDATES) {
    console.log(`\n--- ${candidate.label} (${candidate.id}) ---`);
    const modelResults: any[] = [];
    let totalCost = 0;
    let totalScore = 0;
    let successCount = 0;

    for (let i = 0; i < FILES.length; i++) {
      const f = FILES[i];
      const fileContent = readFileSync(`${RUVIEW_DIR}/${f.path}`, 'utf-8');

      const userMessage = `# Executor Task\nGenerate a pytest test suite for \`${f.path}\`.\n\n# Source File\n\`\`\`python\n${fileContent}\n\`\`\`\n\nGive me your strategic plan in under 100 words, enumerated steps. Name concrete classes/methods/dependencies.`;

      process.stdout.write(`  [${i + 1}/10] ${f.path.padEnd(42)}`);

      try {
        const response = await chat({
          systemPrompt: ADVISOR_SYSTEM_PROMPT,
          userMessage,
          model: candidate.id,
          maxTokens: 512,
        });

        const quality = scoreAdvice(response.content);
        totalCost += response.costUsd;
        totalScore += quality.score;
        successCount++;

        console.log(
          `score=${String(quality.score).padStart(2)} steps=${quality.step_count} refs=${quality.class_method_refs} ` +
          `${response.tokensIn}->${response.tokensOut}t $${response.costUsd.toFixed(4)} ${response.latencyMs}ms`
        );

        modelResults.push({
          file: f.path,
          advice: response.content.trim(),
          quality,
          tokens_in: response.tokensIn,
          tokens_out: response.tokensOut,
          cost_usd: response.costUsd,
          latency_ms: response.latencyMs,
        });
      } catch (err) {
        console.log(`FAIL: ${(err as Error).message.slice(0, 80)}`);
        modelResults.push({ file: f.path, error: (err as Error).message });
      }
    }

    const avgScore = successCount > 0 ? totalScore / successCount : 0;
    console.log(`  SUMMARY: avg_score=${avgScore.toFixed(1)} total_cost=$${totalCost.toFixed(4)} successes=${successCount}/10`);

    round1Results.push({
      model_id: candidate.id,
      label: candidate.label,
      avg_score: avgScore,
      total_cost_usd: totalCost,
      successes: successCount,
      results: modelResults,
    });
  }

  // Rank by score (quality-first, then cost as tiebreaker)
  round1Results.sort((a, b) => b.avg_score - a.avg_score || a.total_cost_usd - b.total_cost_usd);

  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  ROUND 1 RANKINGS                                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  console.log('Rank  Model                  Avg Score  Total Cost  Successes');
  console.log('────  ─────────────────────  ─────────  ──────────  ─────────');
  for (let i = 0; i < round1Results.length; i++) {
    const r = round1Results[i];
    console.log(
      `  ${i + 1}   ${r.label.padEnd(23)} ${String(r.avg_score.toFixed(1)).padStart(5)}      $${r.total_cost_usd.toFixed(4).padStart(7)}     ${r.successes}/10`
    );
  }

  // Pick top 2 for Round 2
  const top2 = round1Results.filter(r => r.successes >= 8).slice(0, 2);
  console.log(`\nTop 2 for Round 2: ${top2.map(r => r.label).join(', ')}`);

  return { sha, round1Results, top2Models: top2.map(r => r.model_id) };
}

// ============================================================================
// Round 2: Full A/B with top 2 models
// ============================================================================

async function runRound2(top2Models: string[]) {
  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  ROUND 2: Full A/B — top 2 advisors × 10 files                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  // Baseline: Sonnet alone (can reuse Phase 0a data, but re-running for fairness)
  console.log('--- BASELINE (Sonnet alone) ---');
  const baselineResults: any[] = [];
  let baselineTotalCost = 0;

  for (let i = 0; i < FILES.length; i++) {
    const f = FILES[i];
    const fileContent = readFileSync(`${RUVIEW_DIR}/${f.path}`, 'utf-8');
    process.stdout.write(`  [${i + 1}/10] ${f.path.padEnd(42)}`);

    const response = await chat({
      systemPrompt: EXECUTOR_SYSTEM_PROMPT_BASE,
      userMessage: `Generate a comprehensive pytest unit test suite for \`${f.path}\`:\n\n\`\`\`python\n${fileContent}\n\`\`\`\n\nOutput ONLY the Python test file content.`,
      model: EXECUTOR_MODEL,
      maxTokens: 8192,
      temperature: 0.3,
    });

    const q = parseTestQuality(response.content);
    baselineTotalCost += response.costUsd;
    console.log(`${q.ast_valid ? 'OK' : 'FAIL'} tests=${q.test_fn_count} asserts=${q.assertion_count} mocks=${q.mock_count} $${response.costUsd.toFixed(4)}`);

    baselineResults.push({ file: f.path, quality: q, cost_usd: response.costUsd, tokens_out: response.tokensOut });
  }

  // Advisor runs for each top-2 model
  const advisorRounds: any[] = [];

  for (const advisorModel of top2Models) {
    const label = ADVISOR_CANDIDATES.find(c => c.id === advisorModel)?.label ?? advisorModel;
    console.log(`\n--- ADVISOR: ${label} (${advisorModel}) ---`);
    const results: any[] = [];
    let totalCost = 0;

    for (let i = 0; i < FILES.length; i++) {
      const f = FILES[i];
      const fileContent = readFileSync(`${RUVIEW_DIR}/${f.path}`, 'utf-8');
      process.stdout.write(`  [${i + 1}/10] ${f.path.padEnd(42)}`);

      // Step 1: advisor call
      const advisorResponse = await chat({
        systemPrompt: ADVISOR_SYSTEM_PROMPT,
        userMessage: `# Task\nGenerate pytest tests for \`${f.path}\`.\n\n# Source\n\`\`\`python\n${fileContent}\n\`\`\`\n\nStrategic plan in under 100 words, enumerated.`,
        model: advisorModel,
        maxTokens: 512,
      });

      // Step 2: executor with plan
      const executorResponse = await chat({
        systemPrompt: `${EXECUTOR_SYSTEM_PROMPT_BASE}\n\n## Strategic Plan from Advisor\n${advisorResponse.content.trim()}\n\nFollow the advisor's plan.`,
        userMessage: `Generate pytest tests for \`${f.path}\`:\n\n\`\`\`python\n${fileContent}\n\`\`\`\n\nOutput ONLY the Python test file content.`,
        model: EXECUTOR_MODEL,
        maxTokens: 8192,
        temperature: 0.3,
      });

      const q = parseTestQuality(executorResponse.content);
      const combinedCost = advisorResponse.costUsd + executorResponse.costUsd;
      totalCost += combinedCost;

      console.log(`${q.ast_valid ? 'OK' : 'FAIL'} tests=${q.test_fn_count} asserts=${q.assertion_count} mocks=${q.mock_count} $${combinedCost.toFixed(4)}`);

      results.push({
        file: f.path,
        quality: q,
        advisor_cost: advisorResponse.costUsd,
        executor_cost: executorResponse.costUsd,
        combined_cost: combinedCost,
        advisor_plan: advisorResponse.content.trim().slice(0, 300),
      });
    }

    advisorRounds.push({ model_id: advisorModel, label, total_cost_usd: totalCost, results });
  }

  return { baselineResults, baselineTotalCost, advisorRounds };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const { sha, round1Results, top2Models } = await runRound1();

  if (top2Models.length < 2) {
    console.log('\nWARNING: fewer than 2 models qualified for Round 2. Proceeding with available.');
  }

  const round2 = await runRound2(top2Models);

  // Compute gate for each advisor model
  const baselineAvg = {
    tests: round2.baselineResults.reduce((s: number, r: any) => s + r.quality.test_fn_count, 0) / 10,
    asserts: round2.baselineResults.reduce((s: number, r: any) => s + r.quality.assertion_count, 0) / 10,
    mocks: round2.baselineResults.reduce((s: number, r: any) => s + r.quality.mock_count, 0) / 10,
    astValid: round2.baselineResults.filter((r: any) => r.quality.ast_valid).length,
  };

  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  FINAL GATE EVALUATION                                             ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  console.log(`Baseline: tests=${baselineAvg.tests.toFixed(1)} asserts=${baselineAvg.asserts.toFixed(1)} mocks=${baselineAvg.mocks.toFixed(1)} ast=${baselineAvg.astValid}/10 cost=$${round2.baselineTotalCost.toFixed(4)}`);

  const gateResults: any[] = [];
  for (const ar of round2.advisorRounds) {
    const avg = {
      tests: ar.results.reduce((s: number, r: any) => s + r.quality.test_fn_count, 0) / 10,
      asserts: ar.results.reduce((s: number, r: any) => s + r.quality.assertion_count, 0) / 10,
      mocks: ar.results.reduce((s: number, r: any) => s + r.quality.mock_count, 0) / 10,
      astValid: ar.results.filter((r: any) => r.quality.ast_valid).length,
    };
    const costDelta = ((ar.total_cost_usd - round2.baselineTotalCost) / round2.baselineTotalCost) * 100;
    const qualityPass = avg.tests >= baselineAvg.tests && avg.asserts >= baselineAvg.asserts && avg.astValid >= baselineAvg.astValid;
    const costPass = costDelta <= 10;

    console.log(`\n${ar.label}: tests=${avg.tests.toFixed(1)} asserts=${avg.asserts.toFixed(1)} mocks=${avg.mocks.toFixed(1)} ast=${avg.astValid}/10 cost=$${ar.total_cost_usd.toFixed(4)} delta=${costDelta >= 0 ? '+' : ''}${costDelta.toFixed(1)}%`);
    console.log(`  Quality >= baseline: ${qualityPass ? 'PASS' : 'FAIL'}`);
    console.log(`  Cost <= +10%:        ${costPass ? 'PASS' : 'FAIL'}`);
    console.log(`  GATE:                ${qualityPass && costPass ? 'PASS' : 'FAIL'}`);

    gateResults.push({
      model_id: ar.model_id,
      label: ar.label,
      avg_tests: avg.tests,
      avg_asserts: avg.asserts,
      avg_mocks: avg.mocks,
      ast_valid: avg.astValid,
      total_cost: ar.total_cost_usd,
      cost_delta_pct: costDelta,
      quality_pass: qualityPass,
      cost_pass: costPass,
      gate_pass: qualityPass && costPass,
    });
  }

  // Write report
  const report = {
    adr: 'ADR-092',
    phase: 'multi-model-trial',
    fixture_sha: sha,
    timestamp: new Date().toISOString(),
    executor_model: EXECUTOR_MODEL,
    round1: { rankings: round1Results.map(r => ({ model: r.label, avg_score: r.avg_score, cost: r.total_cost_usd, successes: r.successes })) },
    round2: {
      baseline: { total_cost: round2.baselineTotalCost, avg: baselineAvg },
      advisors: gateResults,
    },
    round1_full: round1Results,
    round2_full: { baseline: round2.baselineResults, advisors: round2.advisorRounds },
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\nFull report: ${REPORT_PATH}`);
}

main().catch(err => { console.error(err); process.exit(1); });
