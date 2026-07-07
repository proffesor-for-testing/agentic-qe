/**
 * Agentic QE v3 - Audit Command
 *
 * Verifies the witness chain audit trail integrity.
 * Shows chain length, integrity status, and last receipt hash.
 *
 * Usage: aqe audit verify [--format json|text]
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
}

/**
 * Format verification result as human-readable text.
 */
export function formatVerificationText(result: ChainVerificationResult, featureEnabled: boolean): string {
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
  const integrityStatus = result.valid
    ? chalk.green('VALID')
    : chalk.red('BROKEN');
  lines.push(`  Integrity:    ${integrityStatus}`);

  // Last hash
  if (result.length > 0) {
    lines.push(`  Last Hash:    ${result.lastHash.slice(0, 16)}...`);
  }

  // Details
  if (!result.valid && result.brokenAt >= 0) {
    lines.push('');
    lines.push(chalk.red(`  Break detected at index ${result.brokenAt}`));
    lines.push(chalk.red(`  ${result.message}`));
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

  const root = findProjectRoot();
  const dbPath = path.join(root, '.agentic-qe', 'memory.db');

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
      const chain = new WitnessChain(db);
      await chain.initialize();
      const result = chain.verify({ includeArchive: true, checkSignatures: true });

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
        message: result.valid
          ? `Audit chain verified: ${result.entriesChecked} entries checked, ${result.signatureFailures ?? 0} signature failures`
          : `Audit chain BROKEN at id=${result.brokenAt} (${result.entriesChecked} entries checked before the break)`,
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
    ));
  }

  return output;
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

  return audit;
}
