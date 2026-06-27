#!/usr/bin/env tsx
/**
 * Live oracle validation (ADR-113, P5).
 *
 * Closes the loop end-to-end with a REAL model: a provider generates a test for
 * a reference function, then the oracle grades that generated test by running it
 * against the reference (must pass) and its operator mutants (must kill). No
 * simulation — this is the production path the eval runner takes once a provider
 * is configured.
 *
 *   # Claude (frontier) lane — needs ANTHROPIC_API_KEY (e.g. node --env-file=.env):
 *   EVAL_PROVIDER=claude EVAL_MODEL=claude-sonnet-4-6 tsx scripts/validate-live-oracle.ts
 *   # Local Ollama lane:
 *   EVAL_PROVIDER=ollama OLLAMA_MODEL='qwen3:30b-a3b' tsx scripts/validate-live-oracle.ts
 */

import { readFileSync, existsSync } from 'fs';
import { createProviderManager } from '../src/shared/llm/provider-manager.js';
import type { ProviderManager } from '../src/shared/llm/provider-manager.js';
import type { LLMProviderType } from '../src/shared/llm/interfaces.js';
import { buildTestGenPrompt } from '../src/validation/test-gen-prompt.js';
import { SkillEvaluationRunner } from './run-skill-eval.js';

// Load .env (KEY=VALUE lines) into process.env without adding a dependency, so
// `npm run eval:live:claude` finds ANTHROPIC_API_KEY. Existing env wins; never logged.
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PROVIDER = (process.env.EVAL_PROVIDER ?? 'ollama') as LLMProviderType;
const BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://host.docker.internal:11434';
const MODEL =
  process.env.EVAL_MODEL ??
  (PROVIDER === 'claude' ? 'claude-sonnet-4-6' : process.env.OLLAMA_MODEL ?? 'qwen3:30b-a3b');

const REFERENCE_IMPL = `export function classify(score, bonus) {
  const total = score + bonus;
  if (total >= 90 && bonus > 0) return 'A';
  if (total >= 70) return 'B';
  return 'C';
}
`;

/** Eval runner whose "skill output" comes from a real model call. */
class LiveSkillEvaluationRunner extends SkillEvaluationRunner {
  constructor(suite: unknown, private readonly pm: ProviderManager) {
    super(suite as never, true);
  }
  protected isLive(): boolean {
    return true;
  }
  protected async produceSkillOutput(testCase: { oracle?: { reference_impl?: string; module_name?: string }; input?: { code?: string } }): Promise<string> {
    const code = testCase.oracle?.reference_impl ?? testCase.input?.code ?? '';
    const moduleName = testCase.oracle?.module_name ?? 'module';
    const res = await this.pm.generate(buildTestGenPrompt(code, moduleName), {
      preferredProvider: PROVIDER,
      temperature: 0.2,
      maxTokens: 1500,
      timeoutMs: 180_000,
      skipCache: true,
    });
    return res.content;
  }
}

function oracleSuite() {
  return {
    skill: 'live-oracle-validation',
    version: '1.0.0',
    models_to_test: [MODEL],
    test_cases: [
      {
        id: 'tc_live_oracle',
        description: 'model-generated test must kill mutants of classify()',
        priority: 'critical',
        input: { code: REFERENCE_IMPL },
        expected_output: {},
        validation: { oracle: true },
        oracle: { module_name: 'classify', reference_impl: REFERENCE_IMPL, threshold: 0.6 },
      },
    ],
    success_criteria: { pass_rate: 1.0, critical_pass_rate: 1.0 },
  };
}

async function main(): Promise<void> {
  const target = PROVIDER === 'claude' ? `${MODEL} (Anthropic API)` : `${MODEL} @ ${BASE_URL}`;
  console.log(`Live oracle validation → ${target}\n`);
  if (PROVIDER === 'claude' && !process.env.ANTHROPIC_API_KEY) {
    console.error('EVAL_PROVIDER=claude requires ANTHROPIC_API_KEY (try: node --env-file=.env ...).');
    process.exit(1);
  }
  const pm = createProviderManager(
    PROVIDER === 'claude'
      ? { primary: 'claude', fallbacks: [], providers: { claude: { model: MODEL, maxTokens: 1500, temperature: 0.2 } } }
      : { primary: 'ollama', fallbacks: [], providers: { ollama: { model: MODEL, baseUrl: BASE_URL, maxTokens: 1500, temperature: 0.2 } } },
  );

  const runner = new LiveSkillEvaluationRunner(oracleSuite(), pm);
  const result = await runner.runForModel(MODEL);
  const tc = result.test_results[0];

  console.log('\n========== LIVE ORACLE RESULT ==========');
  console.log(`baseline passed (test runs against real impl): ${tc.oracle_baseline_passed}`);
  console.log(`mutants killed: ${tc.mutants_killed}/${tc.mutants_total}`);
  console.log(`mutation score: ${((tc.mutation_score ?? 0) * 100).toFixed(0)}%`);
  console.log(`survived mutants: ${(tc.survived_mutant_ids ?? []).join(', ') || 'none'}`);
  console.log(`oracle verdict: ${tc.passed ? 'PASS' : 'FAIL'}`);
  console.log('========================================');
  if (tc.raw_output) {
    console.log('\n--- model-generated test (first 1200 chars) ---');
    console.log(tc.raw_output.slice(0, 1200));
  }
  process.exit(tc.oracle_baseline_passed ? 0 : 2);
}

main().catch((e) => {
  console.error('live validation error:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
