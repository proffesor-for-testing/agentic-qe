/**
 * Agentic QE v3 - Security Command
 *
 * Provides security scanning shortcuts.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import type { CLIContext } from '../handlers/interfaces.js';
import { walkSourceFiles } from '../utils/file-discovery.js';

export function createSecurityCommand(
  context: CLIContext,
  cleanupAndExit: (code: number) => Promise<never>,
  ensureInitialized: () => Promise<boolean>
): Command {
  const securityCmd = new Command('security')
    .description('Security scanning shortcut')
    .option('--sast', 'Run SAST scan')
    .option('--dast', 'Run DAST scan')
    .option('--compliance <frameworks>', 'Check compliance (gdpr,hipaa,soc2)', '')
    .option('-t, --target <path>', 'Target directory to scan', '.')
    .action(async (options) => {
      if (!await ensureInitialized()) return;

      try {
        console.log(chalk.blue(`\n Running security scan on ${options.target}...\n`));

        const securityAPI = await context.kernel!.getDomainAPIAsync!<{
          runSASTScan(files: string[]): Promise<{ success: boolean; value?: unknown; error?: Error }>;
          runDASTScan(urls: string[]): Promise<{ success: boolean; value?: unknown; error?: Error }>;
          checkCompliance(frameworks: string[]): Promise<{ success: boolean; value?: unknown; error?: Error }>;
        }>('security-compliance');

        if (!securityAPI) {
          console.log(chalk.red('Security domain not available'));
          return;
        }

        const path = await import('path');
        const targetPath = path.resolve(options.target);

        // Fix #280: Use shared file discovery supporting all languages
        const files = walkSourceFiles(targetPath, { includeTests: true });

        if (files.length === 0) {
          console.log(chalk.yellow('No files found to scan'));
          return;
        }

        console.log(chalk.gray(`  Scanning ${files.length} files...\n`));

        // Run SAST if requested
        if (options.sast) {
          console.log(chalk.blue(' SAST Scan:'));
          const sastResult = await securityAPI.runSASTScan(files);
          if (sastResult.success && sastResult.value) {
            const result = sastResult.value as { vulnerabilities?: Array<{ severity: string; type: string; file: string; line: number; message: string }> };
            const vulns = result.vulnerabilities || [];
            if (vulns.length === 0) {
              console.log(chalk.green('  * No vulnerabilities found'));
            } else {
              console.log(chalk.yellow(`  ! Found ${vulns.length} potential issues:`));
              for (const v of vulns.slice(0, 10)) {
                const color = v.severity === 'high' ? chalk.red : v.severity === 'medium' ? chalk.yellow : chalk.gray;
                console.log(color(`    [${v.severity}] ${v.type}: ${v.file}:${v.line}`));
                console.log(chalk.gray(`           ${v.message}`));
              }
              if (vulns.length > 10) {
                console.log(chalk.gray(`    ... and ${vulns.length - 10} more`));
              }
            }
          } else {
            console.log(chalk.red(`  x SAST failed: ${sastResult.error?.message || 'Unknown error'}`));
          }
          console.log('');
        }

        // Run compliance check if requested
        if (options.compliance) {
          const frameworks = options.compliance.split(',');
          console.log(chalk.blue(` Compliance Check (${frameworks.join(', ')}):`));
          const compResult = await securityAPI.checkCompliance(frameworks);
          if (compResult.success && compResult.value) {
            const result = compResult.value as { compliant: boolean; issues?: Array<{ framework: string; issue: string }> };
            if (result.compliant) {
              console.log(chalk.green('  * Compliant with all frameworks'));
            } else {
              console.log(chalk.yellow('  ! Compliance issues found:'));
              for (const issue of (result.issues || []).slice(0, 5)) {
                console.log(chalk.yellow(`    [${issue.framework}] ${issue.issue}`));
              }
            }
          } else {
            console.log(chalk.red(`  x Compliance check failed: ${compResult.error?.message || 'Unknown error'}`));
          }
          console.log('');
        }

        // DAST note
        if (options.dast) {
          console.log(chalk.gray('Note: DAST requires running application URLs. Use --target with URLs for DAST scanning.'));
        }

        console.log(chalk.green(' Security scan complete\n'));
        await cleanupAndExit(0);

      } catch (err) {
        console.error(chalk.red('\nFailed:'), err);
        await cleanupAndExit(1);
      }
    });

  return securityCmd;
}
