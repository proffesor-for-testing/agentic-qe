#!/usr/bin/env node

import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  resolveVerdict,
  shouldEmitScore,
  validateCourtConfig,
  validatePanel,
  type Charge,
  type CourtConfig,
} from './referee.js';

const MUTANT: Charge = {
  id: 'boundary-off-by-one', fatal: true, reproduced: true, depthFound: 1,
};

export function runRefereeCli(argv: string[]): number {
  const [command, value] = argv;
  if (command === 'validate-config' && value) {
    const config = JSON.parse(readFileSync(value, 'utf8')) as CourtConfig;
    const violations = validateCourtConfig(config);
    process.stdout.write(JSON.stringify({ valid: violations.length === 0, violations }) + '\n');
    return violations.length === 0 ? 0 : 2;
  }
  if (command === 'self-test' && value) {
    const passed = runOracle(value);
    process.stdout.write(JSON.stringify({ oracle: value, passed }) + '\n');
    return passed ? 0 : 3;
  }
  process.stderr.write(
    'Usage: aqe-court-referee validate-config <config.json> | self-test <oracle>\n',
  );
  return 64;
}

function runOracle(name: string): boolean {
  switch (name) {
    case 'overturn-catches-mutant':
      return resolveVerdict([MUTANT], 2) === 'BLOCK';
    case 'overturn-disabled':
      return resolveVerdict([MUTANT], 0) === 'SHIP';
    case 'writer-not-juror':
      return validatePanel([
        { role: 'writer', provider: 'codex' },
        { role: 'jury', provider: 'codex' },
        { role: 'prosecutor', provider: 'claude-code' },
      ]).includes('writerIsNeverJuror');
    case 'vendor-diversity':
      return validatePanel([
        { role: 'writer', provider: 'cognitum-low' },
        { role: 'jury', provider: 'cognitum-high' },
      ]).includes('vendor-diversity');
    case 'doe-score-gate':
      return !shouldEmitScore(false, true) && shouldEmitScore(true, true);
    case 'verdict-classes':
      return resolveVerdict([{ ...MUTANT, depthFound: 0 }], 2) === 'BLOCK'
        && resolveVerdict([{ ...MUTANT, fatal: false, depthFound: 0 }], 2) === 'REMAND'
        && resolveVerdict([], 2) === 'SHIP';
    default:
      return false;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runRefereeCli(process.argv.slice(2));
}
