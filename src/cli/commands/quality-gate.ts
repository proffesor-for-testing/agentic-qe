/**
 * Agentic QE v3 - Quality Gate Command (ADR-119)
 *
 * `aqe quality-gate` runs the two-gate, three-valued quality verdict against a
 * pinned ADR-117 checklist: the mechanical (oracle) gate plus a FRONTIER judge.
 * It calls the SAME `runQualityGate` orchestrator as the `qe/quality/gate` MCP
 * tool, so CLI and MCP stay in exact parity.
 *
 * The oracle (mechanical) result is supplied by the caller (`--oracle-passed` /
 * `--baseline-passed`, or `--oracle-file`) because the ADR-113 mutation oracle
 * runs upstream. A missing oracle result is treated as a non-executed test ⇒
 * mechanical fail (never a silent pass).
 */

import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'node:fs';
import type { CLIContext } from '../handlers/interfaces.js';
import { type OutputFormat, writeOutput, toJSON } from '../utils/ci-output.js';
import {
  runQualityGate,
  listChecklistIds,
  type QualityGateRequest,
} from '../../validation/quality-gate-runner.js';
import {
  createRouterFrontierJudge,
  createUnavailableJudge,
} from '../../validation/frontier-judge.js';
import type { Judge } from '../../validation/quality-verdict.js';

export function createQualityGateCommand(
  _context: CLIContext,
  cleanupAndExit: (code: number) => Promise<never>,
  _ensureInitialized: () => Promise<boolean>,
): Command {
  return new Command('quality-gate')
    .description('Two-gate, three-valued quality verdict against a pinned ADR-117 checklist (ADR-119)')
    .option('-c, --checklist <id>', 'Pinned anchor checklist id (e.g. A1-inRange)')
    .option('-a, --artifact-file <path>', 'File containing the artifact under judgement')
    .option('--artifact <text>', 'Inline artifact text (alternative to --artifact-file)')
    .option('--oracle-passed', 'Mechanical oracle passed (mutation score met threshold)')
    .option('--baseline-passed', 'Tests executed against the reference implementation')
    .option('--oracle-file <path>', 'JSON file with { passed, baselinePassed } from the ADR-113 oracle')
    .option('--anchor <path>', 'Override the frozen anchor path (ADR-117)')
    .option('--model <id>', 'Frontier judge model id (ADR-111: always frontier-tier)')
    .option('--list', 'List the available pinned checklist ids and exit')
    .option('-F, --format <format>', 'Output format (text|json)', 'text')
    .option('-o, --output <path>', 'Write output to file')
    .action(async (options) => {
      // No kernel/memory needed: this reads the frozen ADR-117 anchor and calls
      // the LLM router — so it runs standalone in CI without a fleet init.
      const format = options.format as OutputFormat;

      try {
        if (options.list) {
          const ids = listChecklistIds(options.anchor);
          if (format === 'json') writeOutput(toJSON({ checklists: ids }), options.output);
          else console.log(`Available checklists:\n  ${ids.join('\n  ')}`);
          await cleanupAndExit(0);
          return;
        }

        if (!options.checklist) {
          console.error(chalk.red('Missing required option -c, --checklist <id> (use --list to see ids)'));
          await cleanupAndExit(1);
          return;
        }

        const artifact = resolveArtifact(options);
        if (artifact == null) {
          console.error(chalk.red('Provide --artifact-file <path> or --artifact <text>'));
          await cleanupAndExit(1);
          return;
        }

        const oracleResult = resolveOracle(options);
        const judge = await buildJudge(options.model);

        const request: QualityGateRequest = {
          oracleResult,
          artifact,
          checklistId: options.checklist,
          judge,
          anchorPath: options.anchor,
        };
        const result = await runQualityGate(request);

        if (format === 'json') {
          writeOutput(toJSON(result), options.output);
        } else {
          printVerdict(result.verdict, result.mechanical, result.specCoverage, result.unmet, result.reason);
        }

        // Exit codes: 0 pass, 1 fail, 3 inconclusive (distinct so CI can branch).
        const code = result.verdict === 'pass' ? 0 : result.verdict === 'fail' ? 1 : 3;
        await cleanupAndExit(code);
      } catch (error) {
        console.error(chalk.red('\nQuality gate failed:'), error instanceof Error ? error.message : error);
        await cleanupAndExit(1);
      }
    });
}

function resolveArtifact(options: { artifactFile?: string; artifact?: string }): string | null {
  if (typeof options.artifact === 'string') return options.artifact;
  if (options.artifactFile) return fs.readFileSync(options.artifactFile, 'utf8');
  return null;
}

/**
 * Resolve the mechanical-gate (oracle) result. `--oracle-file` wins; otherwise
 * the boolean flags. Returns null (⇒ mechanical fail) when nothing is supplied,
 * so an un-run oracle can never masquerade as a pass.
 */
function resolveOracle(
  options: { oracleFile?: string; oraclePassed?: boolean; baselinePassed?: boolean },
): { passed: boolean; baselinePassed: boolean } | null {
  if (options.oracleFile) {
    const raw = JSON.parse(fs.readFileSync(options.oracleFile, 'utf8'));
    return { passed: !!raw.passed, baselinePassed: !!raw.baselinePassed };
  }
  if (options.oraclePassed === undefined && options.baselinePassed === undefined) {
    return null;
  }
  return { passed: !!options.oraclePassed, baselinePassed: !!options.baselinePassed };
}

/**
 * Build the frontier judge from the shared multi-provider router. When no
 * provider/credentials are available the judge's preflight fails ⇒ the verdict
 * is `inconclusive` (never a silent pass). Identical construction to the MCP tool.
 */
export async function buildJudge(model?: string): Promise<Judge> {
  const { createLLMRouterService } = await import('../../shared/llm/llm-router-service.js');
  const built = await createLLMRouterService().catch(() => null);
  if (!built) {
    return createUnavailableJudge('no LLM provider configured — set a frontier provider API key');
  }
  return createRouterFrontierJudge(built.router, model ? { model } : {});
}

function printVerdict(
  verdict: string,
  mechanical: string,
  specCoverage: number | null,
  unmet: string[],
  reason: string,
): void {
  const icon = verdict === 'pass' ? chalk.green('✓ PASS')
    : verdict === 'fail' ? chalk.red('✗ FAIL')
    : chalk.yellow('? INCONCLUSIVE');
  console.log(`\n  Quality Gate: ${icon}`);
  console.log(`  Mechanical gate: ${mechanical === 'pass' ? chalk.green('pass') : chalk.red('fail')}`);
  if (specCoverage != null) console.log(`  Spec coverage:   ${chalk.cyan((specCoverage * 100).toFixed(0) + '%')}`);
  if (unmet.length > 0) {
    console.log(chalk.cyan('  Unmet requirements:'));
    for (const u of unmet) console.log(chalk.gray(`    - ${u}`));
  }
  console.log(chalk.gray(`  ${reason}\n`));
}
