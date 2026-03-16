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
    .action(async (options) => {
      try {
        await handleAuditVerify({
          format: options.format as 'json' | 'text',
        });
        await cleanupAndExit(0);
      } catch (error) {
        console.error('Failed to verify witness chain:', error);
        await cleanupAndExit(1);
      }
    });

  return audit;
}
