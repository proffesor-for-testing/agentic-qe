/**
 * Agentic QE v3 - qe-arena CLI (ADR-104, Phase 1)
 *
 * Competitive test-strategy tournaments over an arena fixture:
 * real mutation kill rates, real coverage, seeded reproducibility.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import type { CLIContext } from '../handlers/interfaces.js';
import { toErrorMessage } from '../../shared/error-utils.js';

export function createArenaCommand(
  _context: CLIContext,
  cleanupAndExit: (code: number) => Promise<never>,
  ensureInitialized: () => Promise<boolean>
): Command {
  const arena = new Command('arena')
    .description('Competitive test-strategy tournaments (ADR-104)')
    .addHelpText('after', `
Examples:
  # Run a 4-strategy tournament against the demo fixture (reproducible under --seed)
  aqe arena run --strategies 4 --target fixtures/arena-demo --seed 42

  # Evolve the winner with 3 hill-climb steps
  aqe arena run --target fixtures/arena-demo --seed 42 --evolve 3

  # List persisted runs
  aqe arena list
`);

  arena
    .command('run')
    .description('Run a seeded strategy tournament against an arena fixture')
    .requiredOption('--target <dir>', 'Arena fixture directory (src/*.mjs + tests/*.test.mjs)')
    .option('--strategies <n>', 'Number of strategies', '4')
    .option('--seed <n>', 'RNG seed (same seed = same tournament)', '42')
    .option('--max-mutants <n>', 'Mutant sample cap', '24')
    .option('--evolve <steps>', 'Hill-climb steps from the winner', '0')
    .option('--json', 'Output the full arena-result@1 envelope as JSON')
    .action(async (options) => {
      try {
        const { runArena } = await import('../../arena/arena.js');
        const result = runArena({
          target: options.target,
          strategies: parseInt(options.strategies, 10),
          seed: parseInt(options.seed, 10),
          maxMutants: parseInt(options.maxMutants, 10),
          evolveSteps: parseInt(options.evolve, 10),
          log: options.json ? () => {} : (line) => console.error(chalk.dim(`  ${line}`)),
        });

        // Persist fail-soft (memory.db may be unavailable; the run itself
        // is standalone by design)
        try {
          const { getUnifiedMemory } = await import('../../kernel/unified-memory.js');
          const um = getUnifiedMemory();
          if (!um.isInitialized()) await um.initialize();
          um.getDatabase()
            .prepare(`INSERT OR REPLACE INTO kv_store (namespace, key, value) VALUES ('arena', ?, ?)`)
            .run(`run:${result.seed}:${result.target}`, JSON.stringify(result));
        } catch (persistError) {
          console.error(chalk.dim(`  note: run not persisted (${toErrorMessage(persistError)})`));
        }

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        const byId = new Map(result.strategies.map((s) => [s.id, s]));
        console.log(chalk.blue(`\n  Arena: ${result.target} · seed ${result.seed} · ${result.mutantsTotal} mutants\n`));
        console.log('  rank  id   kill-rate  coverage  cost  fitness  groups');
        result.ranking.forEach((id, i) => {
          const s = byId.get(id)!;
          const cov = s.coveragePct === null ? '   n/a' : `${s.coveragePct.toFixed(2)}%`.padStart(7);
          console.log(
            `  ${String(i + 1).padEnd(5)}${s.id.padEnd(5)}` +
            `${(s.killRate * 100).toFixed(1).padStart(6)}%   ${cov}   ${s.suiteCostRatio.toFixed(2).padEnd(6)}` +
            `${s.fitness.toFixed(4).padEnd(9)}${s.name}` +
            (s.baselinePassed ? '' : chalk.red('  [baseline FAILED]'))
          );
        });
        console.log(`\n  competitive array (row beats column = 1):`);
        const ids = result.strategies.map((s) => s.id);
        console.log(`        ${ids.map((i) => i.padEnd(4)).join('')}`);
        result.competitiveArray.forEach((row, i) => {
          console.log(`    ${ids[i].padEnd(4)}${row.map((v) => String(v).padStart(2).padEnd(4)).join('')}`);
        });
        if (result.evolution.length > 0) {
          console.log(`\n  evolution:`);
          for (const e of result.evolution) {
            console.log(`    step ${e.step}: [${e.groups.join('+')}] fitness ${e.fitness.toFixed(4)} ${e.accepted ? chalk.green('accepted') : 'rejected'}`);
          }
        }
        // Darwin-Guard (ADR-271 §4): selection seeds from the best VALID candidate.
        const g = result.guard;
        console.log(
          `\n  darwin-guard: ${g.population.count} valid` +
          (g.excluded.length > 0 ? chalk.yellow(`, ${g.excluded.length} excluded`) : '') +
          ` · baseline mean ${g.population.mean.toFixed(4)} (max ${g.population.max.toFixed(4)})`
        );
        for (const ex of g.excluded) {
          console.log(chalk.yellow(`    excluded ${ex.id}: ${ex.reason}`));
        }
        const winner = byId.get(g.seededWinner)!;
        console.log(chalk.green(`\n  winner: ${winner.id} [${winner.name}] — kill ${(winner.killRate * 100).toFixed(1)}%, fitness ${winner.fitness.toFixed(4)}\n`));
      } catch (error) {
        console.error(chalk.red(`  ✗ ${toErrorMessage(error)}`));
        await cleanupAndExit(1);
      }
    });

  arena
    .command('list')
    .description('List persisted arena runs')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      if (!await ensureInitialized()) return;
      try {
        const { getUnifiedMemory } = await import('../../kernel/unified-memory.js');
        const um = getUnifiedMemory();
        if (!um.isInitialized()) await um.initialize();
        const rows = um.getDatabase()
          .prepare(`SELECT key, value FROM kv_store WHERE namespace = 'arena' ORDER BY key`)
          .all() as Array<{ key: string; value: string }>;
        if (options.json) {
          console.log(JSON.stringify(rows.map((r) => ({ key: r.key, result: JSON.parse(r.value) })), null, 2));
          return;
        }
        if (rows.length === 0) {
          console.log(chalk.yellow('  no persisted arena runs'));
          return;
        }
        for (const row of rows) {
          const r = JSON.parse(row.value) as { ranking: string[]; mutantsTotal: number; strategies: Array<{ id: string; name: string; fitness: number }> };
          const winner = r.strategies.find((s) => s.id === r.ranking[0]);
          console.log(`  ${chalk.green(row.key)} — winner ${winner?.id} [${winner?.name}] fitness ${winner?.fitness}`);
        }
      } catch (error) {
        console.error(chalk.red(`  ✗ ${toErrorMessage(error)}`));
        await cleanupAndExit(1);
      }
    });

  return arena;
}
