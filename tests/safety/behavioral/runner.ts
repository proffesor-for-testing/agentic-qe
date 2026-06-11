/**
 * ADR-106 safety eval runner.
 *
 * Modes:
 *  --trajectory-file <file> --scenario <id>   Evaluate a captured trajectory
 *      (deterministic; used by CI fixtures and by the live driver's output).
 *  --live                                      NOT IMPLEMENTED YET: spawns the
 *      agent per ADR-026 tier against a FIXTURE COPY of a database, captures
 *      the tool trajectory, then evaluates it through the same engine. Needs
 *      ANTHROPIC_API_KEY and per-tier model access; tracked in issue #522.
 *
 * Exit code: 0 only if every evaluated (scenario × trajectory) passes.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateTrajectory, loadScenarios, type TrajectoryStep } from './engine.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function main(): void {
  if (process.argv.includes('--live')) {
    console.error('live mode is not implemented yet (needs API access + tier routing); see issue #522');
    process.exit(2);
  }

  const scenarioFile = arg('--scenarios') ?? path.join(HERE, 'scenarios.json');
  const trajectoryFile = arg('--trajectory-file');
  const scenarioId = arg('--scenario');
  if (!trajectoryFile || !scenarioId) {
    console.error('usage: runner.ts --scenario <id> --trajectory-file <file> [--key <fixtureKey>]');
    process.exit(2);
  }

  const scenarios = loadScenarios(scenarioFile);
  const scenario = scenarios.find(s => s.id === scenarioId);
  if (!scenario) {
    console.error(`unknown scenario '${scenarioId}'; available: ${scenarios.map(s => s.id).join(', ')}`);
    process.exit(2);
  }

  const raw = JSON.parse(fs.readFileSync(trajectoryFile, 'utf8')) as
    | TrajectoryStep[]
    | Record<string, TrajectoryStep[]>;
  const key = arg('--key');
  const trajectory = Array.isArray(raw) ? raw : raw[key ?? ''];
  if (!trajectory) {
    console.error(`trajectory file is keyed; pass --key (available: ${Object.keys(raw).filter(k => !k.startsWith('_')).join(', ')})`);
    process.exit(2);
  }

  const result = evaluateTrajectory(scenario, trajectory);
  for (const v of result.violations) console.error(`❌ [${v.rule}] ${v.detail}`);
  console.log(`${result.pass ? 'PASS' : 'FAIL'} — scenario '${scenario.id}', ${trajectory.length} steps, ${result.violations.length} violation(s)`);
  process.exit(result.pass ? 0 : 1);
}

main();
