/**
 * `aqe learning unmark` and the curation counts in `aqe learning stats` (#1426)
 *
 * A curation marker (`context.curation`, see learning/curated-patterns.ts)
 * makes test generation apply a pattern without a measured success. It is set
 * by `aqe hooks learn --curate`, `aqe learning import --curate`, or an export
 * that carried it. `unmark` removes it again: a dry run by default that lists
 * the patterns it would change; `--apply` removes only the `curation` field
 * (the rest of the context is kept), after a verified backup of memory.db
 * unless `--no-backup`.
 *
 * Measured failures revoke curation without a write (curation-revocation.ts):
 * once a pattern's family (the pattern and its cross-domain copies) mostly
 * fails its measured runs, test generation stops applying it and an export no
 * longer marks it. `stats` reports those patterns as revoked.
 */

import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import type { SqliteDatabase as Database } from '../../shared/sqlite-types.js';
import { Command } from 'commander';
import chalk from 'chalk';
import { openDatabase } from '../../shared/safe-db.js';
import { safeJsonParse } from '../../shared/safe-json.js';
import {
  CURATION_FIELD, CURATION_LABELS, PATTERN_CURATIONS, curationOf, type PatternCuration,
} from '../../learning/curated-patterns.js';
import { selectRevokedIds } from '../../learning/curation-revocation.js';
import { backupLearningDatabase } from './learning-snapshot.js';
import { getDbPath, printError, printJson } from './learning-helpers.js';

/** Same shape as a stored domain name (learning-export-read.ts). */
const DOMAIN_RE = /^[a-z][a-z0-9-]{0,63}$/;

interface PatternRow {
  id: string;
  name: string;
  qe_domain: string;
  context_json: string | null;
}

export interface UnmarkCandidate {
  id: string;
  name: string;
  qeDomain: string;
  curation: PatternCuration;
}

export interface UnmarkSelection {
  /** Curated rows the command would change. */
  curated: UnmarkCandidate[];
  /** References that matched rows, none of them curated. */
  notCurated: string[];
  /** References that matched no row (in the domain, if one was given). */
  notFound: string[];
}

function parseContext(raw: string | null): Record<string, unknown> | undefined {
  try {
    const parsed = safeJsonParse<unknown>(raw || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function hasPatternTable(db: Database): boolean {
  return !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'qe_patterns'`).get();
}

/**
 * Select the curated patterns that `refs` (ids or names) name, with their
 * cross-domain copies, or every curated pattern with `all`, optionally in one
 * domain. Read-only.
 */
export function selectUnmark(db: Database, refs: readonly string[], options: { domain?: string; all?: boolean }): UnmarkSelection {
  const selection: UnmarkSelection = { curated: [], notCurated: [], notFound: [] };
  if (!hasPatternTable(db)) {
    selection.notFound.push(...refs);
    return selection;
  }
  const inDomain = options.domain ? ' AND qe_domain = ?' : '';
  const domainArgs = options.domain ? [options.domain] : [];
  const seen = new Set<string>();
  const take = (row: PatternRow): boolean => {
    const curation = curationOf(parseContext(row.context_json));
    if (!curation) return false;
    if (!seen.has(row.id)) {
      seen.add(row.id);
      selection.curated.push({ id: row.id, name: row.name, qeDomain: row.qe_domain, curation });
    }
    return true;
  };

  if (options.all) {
    const rows = db.prepare(
      `SELECT id, name, qe_domain, context_json FROM qe_patterns WHERE context_json LIKE '%curation%'${inDomain} ORDER BY qe_domain, name`
    ).all(...domainArgs) as PatternRow[];
    for (const row of rows) take(row);
    return selection;
  }

  const byRef = db.prepare(
    `SELECT id, name, qe_domain, context_json FROM qe_patterns WHERE (id = ? OR name = ?)${inDomain} ORDER BY qe_domain, name`
  );
  // Cross-domain seeding copies a pattern, marker included, as `<name> (from <domain>)`.
  const copiesOf = db.prepare(
    `SELECT id, name, qe_domain, context_json FROM qe_patterns WHERE name = ?${inDomain} ORDER BY qe_domain, name`
  );
  for (const ref of refs) {
    const rows = byRef.all(ref, ref, ...domainArgs) as PatternRow[];
    if (rows.length === 0) {
      selection.notFound.push(ref);
      continue;
    }
    if (!rows.map(take).some(Boolean)) selection.notCurated.push(ref);
    for (const row of rows) {
      for (const copy of copiesOf.all(`${row.name} (from ${row.qe_domain})`, ...domainArgs) as PatternRow[]) take(copy);
    }
  }
  return selection;
}

/**
 * Remove the curation field from the selected rows, in one transaction. Only
 * that field changes (json_remove: the rest of the stored JSON is kept as
 * written). A row no longer curated when written is left alone. The
 * transaction takes the write lock first, so it waits out the busy timeout
 * while another process (an MCP server, a hook) is writing. Returns the ids changed.
 */
export function applyUnmark(db: Database, candidates: readonly UnmarkCandidate[]): string[] {
  const read = db.prepare('SELECT context_json FROM qe_patterns WHERE id = ?');
  const write = db.prepare(
    `UPDATE qe_patterns SET context_json = json_remove(context_json, '$.${CURATION_FIELD}'), updated_at = datetime('now')
     WHERE id = ? AND context_json IS ? AND json_valid(context_json)`
  );
  const changed: string[] = [];
  db.transaction(() => {
    for (const candidate of candidates) {
      const row = read.get(candidate.id) as { context_json: string | null } | undefined;
      if (!row || !curationOf(parseContext(row.context_json))) continue;
      if (write.run(candidate.id, row.context_json).changes === 1) changed.push(candidate.id);
    }
  }).immediate();
  return changed;
}

export interface CurationCounts {
  /** Patterns carrying a valid curation marker, by origin. */
  curated: Record<PatternCuration, number>;
  /** Curated patterns whose measured failures outweigh their successes. */
  revoked: number;
}

/** Curation counts for `aqe learning stats`. Read-only; zero when the database cannot be read. */
export function curationCountsAt(dbPath: string): CurationCounts {
  const curated = Object.fromEntries(PATTERN_CURATIONS.map((c) => [c, 0])) as Record<PatternCuration, number>;
  const counts: CurationCounts = { curated, revoked: 0 };
  try {
    if (!existsSync(dbPath)) return counts;
    const db = openDatabase(dbPath, { readonly: true, fileMustExist: true });
    try {
      if (!hasPatternTable(db)) return counts;
      const revoked = selectRevokedIds(db);
      const rows = db.prepare(`SELECT id, context_json FROM qe_patterns WHERE context_json LIKE '%curation%'`)
        .all() as Array<{ id: string; context_json: string | null }>;
      for (const row of rows) {
        const curation = curationOf(parseContext(row.context_json));
        if (!curation) continue;
        counts.curated[curation]++;
        if (revoked.has(row.id)) counts.revoked++;
      }
    } finally {
      db.close();
    }
  } catch {
    // Stats stay readable without these counts.
  }
  return counts;
}

export function formatCurationCounts(counts: CurationCounts): string {
  const total = PATTERN_CURATIONS.reduce((sum, c) => sum + counts.curated[c], 0);
  if (total === 0) return '0';
  const parts = PATTERN_CURATIONS.map((c) => `${counts.curated[c]} ${CURATION_LABELS[c]}`);
  const revoked = counts.revoked > 0 ? `; ${counts.revoked} not applied (measured failures outweigh successes)` : '';
  return `${total} (${parts.join(', ')}${revoked})`;
}

interface UnmarkOptions {
  domain?: string;
  all?: boolean;
  apply?: boolean;
  dryRun?: boolean;
  backup: boolean;
  json?: boolean;
}

export function registerUnmarkCommand(learning: Command): void {
  learning
    .command('unmark [patterns...]')
    .description('Remove the curation marker from patterns (dry run unless --apply)')
    .option('--domain <domain>', 'Only patterns in this QE domain')
    .option('--all', 'Every curated pattern (in --domain, if given)')
    .option('--dry-run', 'List the patterns that would change; write nothing (default)')
    .option('--apply', 'Remove the marker (backs up memory.db first)')
    .option('--no-backup', 'With --apply: skip the backup')
    .option('--json', 'Output as JSON')
    .addHelpText('after', `
Patterns are named by id or name. A curated pattern is applied by test
generation without a measured success; after unmark it is applied only once
its tests have a measured, passing run. The rest of the pattern is unchanged.

Examples:
  aqe learning unmark my-pattern                        # dry run
  aqe learning unmark my-pattern --apply                # back up, then unmark
  aqe learning unmark --all --domain test-generation    # dry run for a domain`)
    .action(async (refs: string[], options: UnmarkOptions) => {
      try {
        if (options.apply && options.dryRun) throw new Error('--apply and --dry-run cannot be combined');
        if (options.all && refs.length > 0) throw new Error('name patterns or use --all, not both');
        if (!options.all && refs.length === 0) throw new Error('name at least one pattern (id or name), or use --all');
        if (options.domain !== undefined && !DOMAIN_RE.test(options.domain)) {
          throw new Error(`--domain must be a domain name (lowercase letters, digits, dashes), got "${options.domain}"`);
        }
        const dryRun = !options.apply;
        const dbPath = getDbPath();
        if (!existsSync(dbPath)) throw new Error(`No learning database found at: ${dbPath}`);

        const readDb = openDatabase(dbPath, { readonly: true, fileMustExist: true });
        let selection: UnmarkSelection;
        try {
          selection = selectUnmark(readDb, refs, { domain: options.domain, all: options.all });
        } finally {
          readDb.close();
        }

        let backupPath: string | undefined;
        let changed: string[] = [];
        if (!dryRun && selection.curated.length > 0) {
          if (options.backup) {
            const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 23);
            const output = path.join(path.dirname(dbPath), 'backups', `pre-unmark-${stamp}-${randomUUID()}.db`);
            backupPath = (await backupLearningDatabase(dbPath, output, { verify: true })).backupPath;
          }
          const db = openDatabase(dbPath, { fileMustExist: true });
          try {
            changed = applyUnmark(db, selection.curated);
          } finally {
            db.close();
          }
        }

        if (options.json) {
          printJson({ dryRun, dbPath, backupPath, ...selection, unmarked: changed });
        } else {
          console.log(chalk.bold(`\nLearning unmark${dryRun ? ' (dry run, nothing written)' : ''}\n`));
          console.log(`  Database: ${dbPath}`);
          if (backupPath) console.log(`  Backup:   ${backupPath}`);
          const verb = dryRun ? 'Would unmark' : 'Unmarked';
          const listed = dryRun ? selection.curated : selection.curated.filter((c) => changed.includes(c.id));
          console.log(`  ${verb}: ${listed.length}`);
          for (const c of listed) console.log(`    ${c.name} [${c.qeDomain}] (${c.curation}, id ${c.id})`);
          const skipped = dryRun ? [] : selection.curated.filter((c) => !changed.includes(c.id));
          if (skipped.length > 0) {
            console.log(chalk.yellow(`  Changed since read, left alone: ${skipped.map((c) => c.name).join(', ')}`));
          }
          if (selection.notCurated.length > 0) console.log(`  Not curated: ${selection.notCurated.join(', ')}`);
          if (selection.notFound.length > 0) {
            console.log(chalk.yellow(`  Not found${options.domain ? ` in ${options.domain}` : ''}: ${selection.notFound.join(', ')}`));
          }
          if (dryRun && selection.curated.length > 0) console.log(chalk.gray('\n  Re-run with --apply to remove the markers.'));
          console.log('');
        }
        // A name that matches nothing is an error, whatever else was found.
        if (selection.notFound.length > 0) process.exitCode = 1;
      } catch (error) {
        printError(`unmark failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
      }
    });
}
