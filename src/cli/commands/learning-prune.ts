/**
 * `aqe learning prune` (#1239)
 *
 * Bounds the learning tables on demand. A dry run by default: it prints the
 * row counts each step would change and writes nothing. `--apply` makes the
 * changes, after a verified backup of memory.db unless `--no-backup`.
 *
 * The two default steps (failed dream cycles, outcome concepts) also run
 * after every committed dream. The other two drop data that may still be of
 * use, so they run only when asked for here.
 */

import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { Command } from 'commander';
import chalk from 'chalk';
import { openDatabase } from '../../shared/safe-db.js';
import { backupLearningDatabase } from './learning-snapshot.js';
import { acknowledgeCheckpointShrink, removedRows } from '../../learning/checkpoint-shrink-ack.js';
import { getDbPath, printError, printJson } from './learning-helpers.js';
import {
  DEFAULT_FAILED_DREAM_CYCLE_RETENTION_DAYS,
  DEFAULT_OUTCOME_CONCEPT_CAP,
  MIN_OUTCOME_CONCEPT_CAP,
  capOutcomeConcepts,
  compactConsolidatedExperiences,
  describeRetention,
  pruneFailedDreamCycles,
  pruneRoutingOutcomes,
  type RetentionStepResult,
} from '../../learning/learning-retention.js';

interface PruneOptions {
  apply?: boolean;
  dryRun?: boolean;
  backup: boolean;
  failedDreamCyclesDays: string;
  outcomeConceptsMax: string;
  compactExperiences?: boolean;
  routingOutcomesOlderThan?: string;
  json?: boolean;
}

function wholeNumber(flag: string, raw: string, min: number): number {
  if (!/^\d+$/.test(raw) || Number(raw) < min) {
    throw new Error(`${flag} must be a whole number >= ${min}, got "${raw}"`);
  }
  return Number(raw);
}

export function registerPruneCommand(learning: Command): void {
  learning
    .command('prune')
    .description('Bound learning-table growth (dry run unless --apply)')
    .option('--dry-run', 'Print the row counts that would change; write nothing (default)')
    .option('--apply', 'Make the changes (backs up memory.db first)')
    .option('--no-backup', 'With --apply: skip the backup')
    .option('--failed-dream-cycles-days <n>', 'Remove failed/interrupted dream cycles older than n days',
      String(DEFAULT_FAILED_DREAM_CYCLE_RETENTION_DAYS))
    .option('--outcome-concepts-max <n>', 'Keep the newest n outcome concept nodes',
      String(DEFAULT_OUTCOME_CONCEPT_CAP))
    .option('--compact-experiences', 'Opt-in: clear result_json and embedding of archived/merged experiences')
    .option('--routing-outcomes-older-than <days>', 'Opt-in: remove routing outcomes older than this')
    .option('--json', 'Output as JSON')
    .addHelpText('after', `
Examples:
  aqe learning prune                                   # dry run of the default steps
  aqe learning prune --compact-experiences             # dry run, including compaction
  aqe learning prune --compact-experiences --apply     # back up, then compact

Rows deleted inside the file are reused by SQLite; run VACUUM to shrink the file itself.`)
    .action(async (options: PruneOptions) => {
      try {
        if (options.apply && options.dryRun) throw new Error('--apply and --dry-run cannot be combined');
        const dryRun = !options.apply;
        const failedDays = wholeNumber('--failed-dream-cycles-days', options.failedDreamCyclesDays, 1);
        const outcomeMax = wholeNumber('--outcome-concepts-max', options.outcomeConceptsMax, MIN_OUTCOME_CONCEPT_CAP);
        const routingDays = options.routingOutcomesOlderThan === undefined
          ? undefined
          : wholeNumber('--routing-outcomes-older-than', options.routingOutcomesOlderThan, 1);

        const dbPath = getDbPath();
        if (!existsSync(dbPath)) throw new Error(`No learning database found at: ${dbPath}`);

        let backupPath: string | undefined;
        if (!dryRun && options.backup) {
          const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 23);
          const output = path.join(path.dirname(dbPath), 'backups', `pre-prune-${stamp}-${randomUUID()}.db`);
          backupPath = (await backupLearningDatabase(dbPath, output, { verify: true })).backupPath;
        }

        const db = openDatabase(dbPath, { readonly: dryRun, fileMustExist: true });
        const results: RetentionStepResult[] = [];
        try {
          results.push(pruneFailedDreamCycles(db, { retentionDays: failedDays, dryRun }));
          results.push(capOutcomeConcepts(db, { maxNodes: outcomeMax, dryRun }));
          if (options.compactExperiences) results.push(compactConsolidatedExperiences(db, { dryRun }));
          if (routingDays !== undefined) {
            results.push(pruneRoutingOutcomes(db, { olderThanDays: routingDays, dryRun }));
          }
        } finally {
          db.close();
        }
        // #1251: the next brain checkpoint replaces aqe.rvf with the smaller brain once.
        const checkpointAck = removedRows(results)
          ? acknowledgeCheckpointShrink(dbPath, 'aqe learning prune --apply')
          : undefined;

        if (options.json) {
          printJson({ dryRun, dbPath, backupPath, checkpointAck, steps: results });
          return;
        }
        console.log(chalk.bold(`\nLearning prune${dryRun ? ' (dry run, nothing written)' : ''}\n`));
        console.log(`  Database: ${dbPath}`);
        if (backupPath) console.log(`  Backup:   ${backupPath}`);
        for (const step of results) {
          const extra = step.payloadBytes !== undefined
            ? `, ${(step.payloadBytes / (1024 * 1024)).toFixed(1)} MB of payload`
            : '';
          console.log(`  ${describeRetention(step)}${extra}`);
        }
        if (checkpointAck) {
          console.log(chalk.gray('\n  The next brain checkpoint will replace aqe.rvf with the smaller brain.'));
        }
        if (dryRun) console.log(chalk.gray('\n  Re-run with --apply to make these changes.'));
        if (!options.compactExperiences || routingDays === undefined) {
          console.log(chalk.gray('  Opt-in steps: --compact-experiences, --routing-outcomes-older-than <days>.'));
        }
        console.log('');
      } catch (error) {
        printError(`prune failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
      }
    });
}
