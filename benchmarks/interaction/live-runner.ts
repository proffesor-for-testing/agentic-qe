/**
 * ADR-109 LIVE interaction benchmark.
 *
 * Per scenario, two arms (A = bare assistant, B = QE-guided) hold a reactive
 * multi-turn conversation with a simulated developer (the interactor), then the
 * interactor writes a fix which is run against the scenario's HIDDEN acceptance
 * test (ground-truth primary outcome). A cross-family judge (non-same-family to
 * the agent-under-test) scores two independent, X/Y-counterbalanced passes
 * using the verbatim pre-registered RUBRIC-v1 instruction. Results feed the
 * existing scenario-clustered stats lib.
 *
 * agent-under-test: OpenAI (gpt-4o-mini). judge: Gemini (cross-family).
 * Run: tsx benchmarks/interaction/live-runner.ts [--turns 3] [--budget 5]
 * Requires OPENAI_API_KEY + GEMINI_API_KEY. Writes results-<stamp>.jsonl.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { aggregate, counterbalance, type ResultRow } from './lib/stats.js';
// @ts-expect-error — .mjs sibling, no types
import { chat, estimateCostUsd } from '../lib/llm-client.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UNDER_TEST = { provider: 'openai', model: 'gpt-4o-mini' };
const JUDGE = { provider: 'gemini', model: 'gemini-2.5-flash' };

const RUBRIC_HASH = execFileSync('git', ['hash-object', path.join(HERE, 'RUBRIC-v1.md')]).toString().trim();

const JUDGE_INSTRUCTION = `You are comparing two assistant transcripts, X and Y, helping the same developer with the same code problem. Judge only the value delivered to the developer: did they end closer to understanding and fixing their actual problem? Ignore word count, formatting style, and persona entirely — neither longer nor shorter, neither structured nor conversational, is better in itself. Write one sentence on what each developer gained. Your VERY LAST line must be exactly one of: WINNER: X / WINNER: Y / WINNER: tie — nothing after it.`;

const ARM_SYSTEM: Record<'A' | 'B', string> = {
  A: 'You are a helpful coding assistant. Answer the developer concisely.',
  B: 'You are a quality-engineering reviewer. Help the developer find the ROOT CAUSE of their problem, not a workaround. Point them at concrete evidence (a failing boundary case, a specific line), ask the question behind their question, and guide them to write the fix themselves. Do not hand over a patch unless they ask.',
};

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : def;
}

interface Scenario {
  id: string; persona: string; opener: string; hiddenReality: string; goal: string; turns: number;
  dir: string; fixtureFile: string; hiddenTest: string;
}

function loadScenarios(): Scenario[] {
  const root = path.join(HERE, 'scenarios');
  return fs.readdirSync(root).filter(d => fs.statSync(path.join(root, d)).isDirectory()).map(d => {
    const p = JSON.parse(fs.readFileSync(path.join(root, d, 'persona.json'), 'utf8'));
    const fixtureDir = path.join(root, d, 'fixture');
    const fixtureFile = fs.readdirSync(fixtureDir)[0];
    return { ...p, dir: path.join(root, d), fixtureFile, hiddenTest: path.join(root, d, 'hidden-test.cjs') };
  });
}

let spent = 0;
let budgetUsd = 5;
async function call(who: { provider: string; model: string }, system: string, messages: { role: string; content: string }[], maxTokens = 400): Promise<string> {
  if (spent > budgetUsd) throw new Error(`BUDGET STOP at $${spent.toFixed(4)}`);
  const { text, usage } = await chat({ ...who, system, messages, maxTokens, temperature: 0.3 });
  spent += estimateCostUsd(who.provider, who.model, usage);
  return text;
}

/** One arm's reactive conversation; returns transcript + whether the interactor's fix passes the hidden test. */
async function runArm(scenario: Scenario, arm: 'A' | 'B', turns: number): Promise<{ transcript: string; fixPasses: boolean; turnsCompleted: number }> {
  const history: { role: string; content: string }[] = [];
  const lines: string[] = [];
  let devMsg = scenario.opener;
  let completed = 0;

  for (let t = 0; t < turns; t++) {
    lines.push(`Developer: ${devMsg}`);
    const assistantReply = await call(UNDER_TEST, ARM_SYSTEM[arm],
      [...history, { role: 'user', content: devMsg }]);
    lines.push(`Assistant: ${assistantReply}`);
    history.push({ role: 'user', content: devMsg }, { role: 'assistant', content: assistantReply });
    completed++;
    if (t < turns - 1) {
      // Reactive interactor: react authentically as the persona — deeper if helped, guarded if lectured.
      devMsg = await call(JUDGE,
        `You are role-playing a developer in a real debugging conversation. Persona: ${scenario.persona}\nYour hidden situation: ${scenario.hiddenReality}\nReply IN CHARACTER to the assistant's last message in 1-2 sentences. Go deeper if genuinely helped; get short/guarded if lectured or given generic filler.`,
        [{ role: 'user', content: `Assistant said: "${assistantReply}"\n\nYour reply:` }], 150);
    }
  }

  // Interactor attempts the fix based on the conversation.
  const original = fs.readFileSync(path.join(scenario.dir, 'fixture', scenario.fixtureFile), 'utf8');
  const fixText = await call(JUDGE,
    `You are the developer from this conversation. Based on what you learned, rewrite the file to fix the bug. Output ONLY the corrected file contents in a single code block, no prose.`,
    [{ role: 'user', content: `Conversation:\n${lines.join('\n')}\n\nOriginal file (${scenario.fixtureFile}):\n${original}` }], 600);

  const code = fixText.match(/```(?:js|javascript)?\n([\s\S]*?)```/)?.[1] ?? fixText;
  const tmp = path.join('/tmp', `adr109-${scenario.id}-${arm}-${process.env.RUN_STAMP || 'x'}.cjs`);
  fs.writeFileSync(tmp, code);
  let fixPasses = false;
  try {
    execFileSync('node', [scenario.hiddenTest, tmp], { stdio: 'pipe' });
    fixPasses = true;
  } catch { fixPasses = false; }

  return { transcript: lines.join('\n'), fixPasses, turnsCompleted: completed };
}

async function judge(scenario: Scenario, xText: string, yText: string): Promise<'X' | 'Y' | 'tie' | null> {
  try {
    const out = await call(JUDGE, JUDGE_INSTRUCTION,
      [{ role: 'user', content: `Developer's problem: ${scenario.opener}\n\n--- Transcript X ---\n${xText}\n\n--- Transcript Y ---\n${yText}` }], 800);
    // Last verdict wins; accept WINNER: / "winner is X" / a bare trailing X|Y|tie.
    const all = [...out.matchAll(/WINNER\s*(?:IS)?:?\s*(X|Y|tie)/gi)];
    const m = all[all.length - 1];
    return m ? (m[1].toUpperCase() === 'TIE' ? 'tie' : m[1].toUpperCase() as 'X' | 'Y') : null;
  } catch { return null; }
}

async function main(): Promise<void> {
  budgetUsd = parseFloat(arg('--budget', '5'));
  const turns = parseInt(arg('--turns', '3'), 10);
  const scenarios = loadScenarios();
  const rows: ResultRow[] = [];
  const stamp = process.env.RUN_STAMP || 'latest';

  // Ground truth is per (scenario, arm) — independent of any judge verdict.
  const groundTruth: Array<{ scenario: string; aFix: boolean; bFix: boolean }> = [];

  for (const scenario of scenarios) {
    const a = await runArm(scenario, 'A', turns);
    const b = await runArm(scenario, 'B', turns);
    groundTruth.push({ scenario: scenario.id, aFix: a.fixPasses, bFix: b.fixPasses });

    // Seeded X/Y counterbalance per item; two independent judge passes.
    const map = counterbalance(scenario.id);
    const xText = map.x === 'A' ? a.transcript : b.transcript;
    const yText = map.y === 'A' ? a.transcript : b.transcript;
    const minTurns = Math.min(a.turnsCompleted, b.turnsCompleted);

    for (let pass = 0; pass < 2; pass++) {
      const xy = await judge(scenario, xText, yText);
      const winnerArm = xy === null ? null : xy === 'tie' ? 'tie' : (xy === 'X' ? map.x : map.y);
      // ONE comparison row per (scenario, pass) — the unit the sign test clusters.
      rows.push({
        scenarioId: scenario.id,
        itemId: `${scenario.id}:p${pass}`,
        rubricHash: RUBRIC_HASH,
        winnerArm: winnerArm as ResultRow['winnerArm'],
        transcript: `X:\n${xText}\n\nY:\n${yText}`,
        turnsCompleted: minTurns,
        turnsExpected: turns,
      });
    }
    console.log(`${scenario.id}: A.fix=${a.fixPasses} B.fix=${b.fixPasses} ($${spent.toFixed(4)})`);
  }

  const aFixRate = groundTruth.filter(g => g.aFix).length / groundTruth.length;
  const bFixRate = groundTruth.filter(g => g.bFix).length / groundTruth.length;

  const outDir = path.join(HERE, 'results');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `results-${stamp}.jsonl`), rows.map(r => JSON.stringify(r)).join('\n') + '\n');

  const result = aggregate(rows);
  const groundTruthOut = { aFixRate, bFixRate, perScenario: groundTruth };
  fs.writeFileSync(path.join(outDir, `summary-${stamp}.json`),
    JSON.stringify({ ...result, groundTruth: groundTruthOut, spentUsd: Number(spent.toFixed(4)), rubricHash: RUBRIC_HASH }, null, 2));
  console.log(`\nScenario-clustered (judge): A=${result.scenarioWinsA} B=${result.scenarioWinsB} tie=${result.scenarioTies}, p=${result.pValue.toFixed(4)}`);
  console.log(`Ground truth fix-rate (independent of judge): A=${aFixRate.toFixed(2)} B=${bFixRate.toFixed(2)}`);
  console.log(`Judge rows: ${result.pooled.rows} valid, ${result.excludedRows} excluded (unparseable verdict); spent=$${spent.toFixed(4)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
