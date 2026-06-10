#!/usr/bin/env node
/**
 * ADR-101 — Empirical probe: can spawned subagents spawn subagents?
 *
 * Anthropic announced nested subagent support (depth=5) on 2026-06-09, but
 * the runtime currently strips the Task tool at parent→child spawn time
 * (upstream denylist — see ruflo ADR-147 for the original investigation).
 * This script is the regression test that tells us when the gate lifts:
 * re-run it after every `claude update`.
 *
 * Usage:   node scripts/probe-nested-spawn-depth.mjs
 * Output:  verdict on stdout; full transcript appended under docs/probes/
 *
 * Verdicts:
 *   level=1 status=NO_AGENT_TOOL   — denylist active (expected today)
 *   level=N status=TASK_TOOL_LIVE  — nested spawning works to level N:
 *                                    activate ADR-101 follow-up phases
 *   status=PROBE_INCONCLUSIVE      — output didn't match; inspect transcript
 */

import { execFile } from 'node:child_process';
import { mkdirSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const probesDir = join(root, 'docs', 'probes');

const PROMPT = `PROBE for nested subagent support. Follow these steps exactly, no extra prose:
1. Use your Task/Agent tool (subagent_type: general-purpose) to spawn ONE subagent with exactly this instruction:
   "Output the single line 'level=1 task_tool=yes' if you have a Task or Agent tool available to spawn subagents, or 'level=1 task_tool=no' if you do not. If yes, additionally spawn one general-purpose subagent instructing it to output 'level=2 task_tool=yes' or 'level=2 task_tool=no' by the same rule, and append its output line to yours. Return only these lines."
2. Output 'level=0 task_tool=yes' followed by the subagent's returned lines, verbatim, one per line. Nothing else.`;

function runProbe() {
  return new Promise((resolve) => {
    const child = execFile(
      'claude',
      ['-p', PROMPT, '--max-turns', '10', '--output-format', 'text'],
      { timeout: 600_000, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => resolve({ error, stdout: stdout ?? '', stderr: stderr ?? '' })
    );
    child.on('error', (error) => resolve({ error, stdout: '', stderr: String(error) }));
  });
}

const { error, stdout, stderr } = await runProbe();

const lines = stdout.split('\n').map((l) => l.trim());
const levels = new Map();
for (const line of lines) {
  const m = line.match(/^level=(\d+)\s+task_tool=(yes|no)$/);
  if (m) levels.set(Number(m[1]), m[2] === 'yes');
}

let verdict;
if (error && !stdout) {
  verdict = `status=PROBE_FAILED error=${error.code ?? error.message}`;
} else if (levels.size === 0) {
  verdict = 'status=PROBE_INCONCLUSIVE (no level lines in output — inspect transcript)';
} else {
  const deepestYes = Math.max(...[...levels.entries()].filter(([, yes]) => yes).map(([l]) => l));
  const firstNo = [...levels.entries()].find(([, yes]) => !yes)?.[0];
  verdict =
    firstNo !== undefined && firstNo <= 1
      ? `level=${firstNo} status=NO_AGENT_TOOL (upstream denylist active — expected until Anthropic flips the gate)`
      : `level=${deepestYes} status=TASK_TOOL_LIVE (nested spawning works — activate ADR-101 follow-up phases)`;
}

const stamp = new Date().toISOString();
const record = [
  `=== nested-spawn probe ${stamp} ===`,
  `verdict: ${verdict}`,
  `--- stdout ---`,
  stdout.trim(),
  stderr.trim() ? `--- stderr ---\n${stderr.trim()}` : '',
  '',
].join('\n');

mkdirSync(probesDir, { recursive: true });
const outFile = join(probesDir, `probe-nested-spawn-${stamp.slice(0, 10)}.txt`);
appendFileSync(outFile, record);

console.log(verdict);
console.log(`transcript: ${outFile}`);
