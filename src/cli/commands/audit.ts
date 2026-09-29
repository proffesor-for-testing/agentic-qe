/**
 * Agentic QE v3 - Audit Command
 *
 * Verifies the witness chain audit trail integrity.
 * Shows chain length, integrity status, and last receipt hash.
 *
 * Usage: aqe audit verify [--chain governance|audit] [--format json|text]
 *        aqe audit repair --chain audit [--dry-run] [--format json|text]
 *
 * @module cli/commands/audit
 * @see ADR-083-coherence-gated-agent-actions.md
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  WitnessChain,
  createWitnessChain,
  createPersistentWitnessChain,
  createWitnessChainSQLitePersistence,
  isWitnessChainFeatureEnabled,
  type ChainVerificationResult,
} from '../../governance/witness-chain.js';
import type { CLIContext } from '../handlers/interfaces.js';
import type { ChainStatus, VerifyResult } from '../../audit/witness-chain-verifier.js';
import type { WitnessKeyManager } from '../../audit/witness-key-manager.js';
import type { RepairResult } from '../../audit/witness-chain-repair.js';
import { findProjectRoot } from '../../kernel/unified-memory.js';
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Verification output for JSON format.
 */
export interface AuditVerifyOutput {
  featureEnabled: boolean;
  chainLength: number;
  integrity: boolean;
  brokenAt: number;
  lastHash: string;
  message: string;
  // --chain audit only (#753). `integrity` stays false for unacknowledged
  // forks; `tampered: false` tells a health check they are not tampering.
  status?: ChainStatus;
  tampered?: boolean;
  tamperedAt?: number;
  tamperReason?: string;
  forks?: number[];
  acknowledgedForks?: number[];
}

/**
 * Format verification result as human-readable text.
 */
export function formatVerificationText(
  result: ChainVerificationResult,
  featureEnabled: boolean,
  audit?: Pick<AuditVerifyOutput, 'status' | 'tamperedAt' | 'tamperReason' | 'forks' | 'acknowledgedForks'>,
): string {
  const lines: string[] = [];

  lines.push(chalk.bold('Witness Chain Audit Verification'));
  lines.push('');

  // Feature flag status
  const flagStatus = featureEnabled
    ? chalk.green('ENABLED')
    : chalk.yellow('DISABLED');
  lines.push(`  Feature Flag: ${flagStatus}`);

  // Chain length
  lines.push(`  Chain Length:  ${result.length} receipts`);

  // Integrity status
  const integrityStatus = audit?.status === 'forked'
    ? chalk.yellow('FORKED (no tampering detected)')
    : result.valid
      ? chalk.green(audit?.status === 'valid-with-forks' ? 'VALID (forks re-anchored)' : 'VALID')
      : chalk.red(audit?.status === 'tampered' ? 'BROKEN (tampering detected)' : 'BROKEN');
  lines.push(`  Integrity:    ${integrityStatus}`);

  // Last hash
  if (result.length > 0) {
    lines.push(`  Last Hash:    ${result.lastHash.slice(0, 16)}...`);
  }

  const forkCount = audit?.forks?.length ?? 0;
  if (forkCount > 0) {
    const reanchored = audit?.acknowledgedForks?.length ?? 0;
    lines.push(`  Forks:        ${forkCount} accidental (pre-3.14.5 concurrent writes, #753), ${reanchored} re-anchored`);
  }

  // Details
  if (audit?.status === 'forked') {
    lines.push('');
    lines.push(chalk.yellow(`  ${result.message}`));
  } else if (!result.valid && result.brokenAt >= 0) {
    lines.push('');
    const at = audit?.status === 'tampered' && audit.tamperedAt !== undefined ? audit.tamperedAt : result.brokenAt;
    lines.push(chalk.red(`  Break detected at index ${at}${audit?.tamperReason ? ` (${audit.tamperReason})` : ''}`));
    lines.push(chalk.red(`  ${result.message}`));
  } else if (result.valid && forkCount > 0) {
    lines.push('');
    lines.push(chalk.green(`  ${result.message}`));
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Try to load a SQLite-backed witness chain from the project's unified database.
 * Returns null if the database is unavailable.
 */
function tryLoadPersistentChain(): WitnessChain | null {
  try {
    const root = findProjectRoot();
    const dbPath = path.join(root, '.agentic-qe', 'memory.db');
    if (!existsSync(dbPath)) return null;

    // Dynamic import to avoid hard dependency on better-sqlite3 at CLI load time
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3');
    const db = new Database(dbPath);
    const persistence = createWitnessChainSQLitePersistence(db);
    const chain = createPersistentWitnessChain(persistence);
    // Close the DB handle; chain data is now loaded into memory
    db.close();
    return chain;
  } catch {
    return null;
  }
}

/**
 * Handle the audit verify command.
 *
 * Loads the witness chain from SQLite if available, otherwise creates
 * a fresh in-memory chain.
 */
export async function handleAuditVerify(options: {
  format?: 'json' | 'text';
}): Promise<AuditVerifyOutput> {
  const featureEnabled = isWitnessChainFeatureEnabled();

  // Load persisted chain from SQLite if available, else in-memory
  const chain = tryLoadPersistentChain() ?? createWitnessChain();
  const result = chain.verifyChain();

  const output: AuditVerifyOutput = {
    featureEnabled,
    chainLength: result.length,
    integrity: result.valid,
    brokenAt: result.brokenAt,
    lastHash: result.lastHash,
    message: result.message,
  };

  if (options.format === 'json') {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(formatVerificationText(result, featureEnabled));
  }

  return output;
}

/**
 * Verify the `src/audit/witness-chain.ts` full audit trail — the
 * SHAKE-256/Ed25519 chain that records pattern/dream/routing/review
 * decisions (tens of thousands of rows), as distinct from the 29-row
 * governance receipt chain `handleAuditVerify` checks above.
 *
 * This is the chain CI should gate on: it's what actually accumulates
 * from real QE agent activity.
 */
export async function handleAuditChainVerify(options: {
  format?: 'json' | 'text';
}): Promise<AuditVerifyOutput> {
  const { WitnessChain, hashWith, serializeEntry } = await import('../../audit/witness-chain.js');

  const { dbPath, keyDir } = auditChainPaths();

  let output: AuditVerifyOutput;
  if (!existsSync(dbPath)) {
    output = {
      featureEnabled: true,
      chainLength: 0,
      integrity: true,
      brokenAt: -1,
      lastHash: '',
      message: `No database found at ${dbPath} — nothing to verify`,
    };
  } else {
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(dbPath, { readonly: true });
    try {
      const chain = new WitnessChain(db, (await loadReadOnlyKeyManager(keyDir)) ?? undefined);
      await chain.initialize();
      // Fork and CHAIN_REANCHOR rows signed by a key in witness-keys/ are always
      // signature-checked. The every-row `checkSignatures` sweep stays off, as it
      // effectively was before this command loaded keys: it would fail rows
      // signed by keys this project never stored (e.g. imported rows).
      const result = chain.verify({ includeArchive: true, checkSignatures: false });

      const lastEntry = db.prepare('SELECT * FROM witness_chain ORDER BY id DESC LIMIT 1').get() as
        | { hash_algo?: string; [key: string]: unknown }
        | undefined;
      const lastHash = lastEntry
        ? hashWith(lastEntry.hash_algo || 'sha256', serializeEntry(lastEntry as never))
        : '';

      output = {
        featureEnabled: true,
        chainLength: result.entriesChecked,
        integrity: result.valid,
        brokenAt: result.brokenAt ?? -1,
        lastHash,
        message: auditChainMessage(result),
        status: result.status,
        tampered: result.tampered,
        ...(result.tamperedAt !== undefined ? { tamperedAt: result.tamperedAt } : {}),
        ...(result.tamperReason ? { tamperReason: result.tamperReason } : {}),
        forks: result.forks,
        acknowledgedForks: result.acknowledgedForks,
      };
    } finally {
      db.close();
    }
  }

  if (options.format === 'json') {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(formatVerificationText(
      { valid: output.integrity, length: output.chainLength, brokenAt: output.brokenAt, lastHash: output.lastHash, message: output.message },
      output.featureEnabled,
      output,
    ));
  }

  return output;
}

function auditChainPaths(): { dbPath: string; keyDir: string } {
  const root = findProjectRoot();
  return {
    dbPath: path.join(root, '.agentic-qe', 'memory.db'),
    keyDir: path.join(root, '.agentic-qe', 'witness-keys'),
  };
}

/** Persisted witness keys, loaded without generating (or writing) anything. */
async function loadReadOnlyKeyManager(keyDir: string): Promise<WitnessKeyManager | null> {
  if (!existsSync(keyDir)) return null;
  const { WitnessKeyManager: KeyManager } = await import('../../audit/witness-key-manager.js');
  return new KeyManager({ keyDir, autoGenerate: false });
}

function auditChainMessage(result: VerifyResult): string {
  const n = result.entriesChecked;
  const forks = result.forks.length;
  const pending = forks - result.acknowledgedForks.length;
  switch (result.status) {
    case 'valid':
      return `Audit chain verified: ${n} entries checked, ${result.signatureFailures ?? 0} signature failures`;
    case 'valid-with-forks':
      return `Audit chain verified: ${n} entries checked; ${forks} accidental fork(s) from pre-3.14.5 ` +
        'concurrent writes are re-anchored by CHAIN_REANCHOR, no tampering detected';
    case 'forked':
      return `${pending} accidental fork(s) (pre-3.14.5 concurrent writes, #753), no tampering detected — ` +
        `${n} entries checked, first fork at id=${result.brokenAt}. ` +
        'Run `aqe audit repair --chain audit` to back up the store and re-anchor.';
    default:
      return `Audit chain BROKEN: tampering detected at id=${result.tamperedAt} (${result.tamperReason}); ` +
        `${n} entries checked` + (forks > 0 ? `, ${forks} accidental fork(s) found before it` : '');
  }
}

function repairFailed(result: RepairResult): boolean {
  if (result.action === 'refused') return true;
  return result.action === 'reanchored' && !(result.after?.status === 'valid' || result.after?.status === 'valid-with-forks');
}

/**
 * `aqe audit repair --chain audit`: re-anchor a store whose only breaks are
 * accidental pre-3.14.5 forks (#753). Refuses on tampering, backs up first,
 * never rewrites existing rows. See src/audit/witness-chain-repair.ts.
 */
export async function handleAuditChainRepair(options: {
  format?: 'json' | 'text';
  dryRun?: boolean;
}): Promise<RepairResult> {
  const { repairWitnessChainForks } = await import('../../audit/witness-chain-repair.js');
  const { dbPath, keyDir } = auditChainPaths();
  const dryRun = options.dryRun === true;

  let result: RepairResult;
  if (!existsSync(dbPath)) {
    const empty = { status: 'valid' as const, entriesChecked: 0, forks: 0, unacknowledgedForks: 0 };
    result = {
      action: 'none', dryRun, message: `No database found at ${dbPath} — nothing to repair`,
      before: empty, rowsBefore: { live: 0, archive: 0 }, rowsAfter: { live: 0, archive: 0 }, forksAcknowledged: [],
    };
  } else {
    const { openDatabase } = await import('../../shared/safe-db.js');
    // A dry run opens read-only and never generates a signing key.
    const db = openDatabase(dbPath, { readonly: dryRun, fileMustExist: true });
    try {
      const keyManager = dryRun
        ? await loadReadOnlyKeyManager(keyDir)
        : (await import('../../audit/witness-key-manager.js')).getDefaultWitnessKeyManager();
      result = await repairWitnessChainForks(db, { dbPath, dryRun, keyManager });
    } finally {
      db.close();
    }
  }

  if (options.format === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatRepairText(result));
  }
  return result;
}

function formatRepairText(result: RepairResult): string {
  const color = result.action === 'refused' ? chalk.red : result.action === 'reanchored' ? chalk.green : chalk.yellow;
  const lines = [
    chalk.bold('Witness Chain Audit Repair'),
    '',
    `  Action:       ${color(result.action.toUpperCase())}${result.dryRun ? ' (dry run)' : ''}`,
    `  Before:       ${result.before.status}, ${result.before.forks} fork(s), ${result.before.unacknowledgedForks} unacknowledged`,
    `  Rows:         live ${result.rowsBefore.live} -> ${result.rowsAfter.live}, archive ${result.rowsBefore.archive} -> ${result.rowsAfter.archive}`,
  ];
  if (result.after) lines.push(`  After:        ${result.after.status}`);
  if (result.backupPath) lines.push(`  Backup:       ${result.backupPath}`);
  lines.push('', `  ${color(result.message)}`, '');
  return lines.join('\n');
}

/**
 * Create the audit command group following the project convention.
 */
export function createAuditCommand(
  _context: CLIContext,
  cleanupAndExit: (code: number) => Promise<never>,
  _ensureInitialized: () => Promise<boolean>,
): Command {
  const audit = new Command('audit')
    .description('Witness chain audit trail management');

  audit
    .command('verify')
    .description('Verify witness chain integrity')
    .option('-F, --format <format>', 'Output format (json|text)', 'text')
    .option('-C, --chain <chain>', 'Which chain to verify: governance (29 decision receipts) or audit (full QE audit trail)', 'governance')
    .action(async (options) => {
      try {
        const format = options.format as 'json' | 'text';
        const result = options.chain === 'audit'
          ? await handleAuditChainVerify({ format })
          : await handleAuditVerify({ format });
        await cleanupAndExit(result.integrity ? 0 : 1);
      } catch (error) {
        console.error('Failed to verify witness chain:', error);
        await cleanupAndExit(1);
      }
    });

  audit
    .command('repair')
    .description('Re-anchor accidental pre-3.14.5 forks in the audit chain (#753); backs up first, refuses on tampering')
    .option('-C, --chain <chain>', 'Chain to repair (only "audit" is supported)', 'audit')
    .option('--dry-run', 'Report what would be done without writing anything', false)
    .option('-F, --format <format>', 'Output format (json|text)', 'text')
    .action(async (options) => {
      try {
        if (options.chain !== 'audit') {
          console.error(`aqe audit repair supports only --chain audit (got "${options.chain}")`);
          await cleanupAndExit(1);
          return;
        }
        const result = await handleAuditChainRepair({
          format: options.format as 'json' | 'text',
          dryRun: options.dryRun === true,
        });
        await cleanupAndExit(repairFailed(result) ? 1 : 0);
      } catch (error) {
        console.error('Failed to repair witness chain:', error);
        await cleanupAndExit(1);
      }
    });

  return audit;
}
