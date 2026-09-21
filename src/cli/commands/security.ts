/**
 * Agentic QE v3 - Security Command
 *
 * Provides security scanning shortcuts.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import type { CLIContext } from '../handlers/interfaces.js';
import { discoverSecurityFiles } from '../../domains/security-compliance/scan-discovery.js';
import { FilePath } from '../../shared/value-objects/index.js';
import type { SecurityComplianceAPI } from '../../domains/security-compliance/plugin.js';
import type { ComplianceReport, Vulnerability } from '../../domains/security-compliance/interfaces.js';
import { type OutputFormat, type SecurityScanResult, type SecurityVulnerability, type SecurityCheckResult, writeOutput, toJSON, toSARIF, securityToMarkdown } from '../utils/ci-output.js';

export function createSecurityCommand(
  context: CLIContext,
  cleanupAndExit: (code: number) => Promise<never>,
  ensureInitialized: () => Promise<boolean>
): Command {
  const securityCmd = new Command('security')
    .description('Security scanning and URL validation')
    .option('--sast', 'Run SAST scan')
    .option('--dast', 'Run DAST scan')
    .option('--compliance <frameworks>', 'Check compliance (gdpr,hipaa,soc2)', '')
    .option('--url-validate <url>', 'Validate a URL for security threats and PII exposure')
    .option('--no-pii', 'Disable PII scanning when using --url-validate')
    .option('-t, --target <path>', 'Target directory to scan', '.')
    .option('-F, --format <format>', 'Output format (text|json|sarif|markdown)', 'text')
    .option('-o, --output <path>', 'Write output to file')
    .action(async (options) => {
      if (!await ensureInitialized()) return;

      // Handle --url-validate as a separate path
      if (options.urlValidate) {
        try {
          const format = options.format as OutputFormat;
          const url = options.urlValidate as string;

          if (format === 'text') {
            console.log(chalk.blue(`\n Validating URL: ${url}\n`));
          }

          const { VisualSecurityTool } = await import('../../mcp/tools/security-compliance/visual-security.js');
          const tool = new VisualSecurityTool();
          const result = await tool.invoke({
            url,
            enablePII: options.pii !== false,
          });

          if (result.success && result.data) {
            const data = result.data;
            if (format === 'json') {
              writeOutput(toJSON(data), options.output);
            } else {
              // URL security
              if (data.urlSecurity.valid) {
                console.log(chalk.green(`  URL Security: CLEAN`));
              } else {
                console.log(chalk.red(`  URL Security: ${data.urlSecurity.issues.length} issue(s) (risk: ${data.urlSecurity.riskLevel})`));
                for (const issue of data.urlSecurity.issues) {
                  const color = issue.severity === 'critical' ? chalk.red : issue.severity === 'high' ? chalk.yellow : chalk.gray;
                  console.log(color(`    [${issue.severity}] ${issue.type}: ${issue.description}`));
                }
              }

              // PII exposure
              if (data.piiExposure.scanned) {
                if (data.piiExposure.found) {
                  console.log(chalk.red(`\n  PII Exposure: ${data.piiExposure.types.length} type(s) found in URL`));
                  for (const detail of data.piiExposure.details) {
                    console.log(chalk.yellow(`    [${detail.type}] in ${detail.location}: ${detail.masked}`));
                  }
                } else {
                  console.log(chalk.green(`\n  PII Exposure: none detected`));
                }
              }

              console.log(`\n  ${data.summary}\n`);
            }

            // Exit code 1 if critical/high security issues or PII found
            const hasCritical = data.urlSecurity.issues.some(
              (i: { severity: string }) => i.severity === 'critical' || i.severity === 'high'
            );
            if (hasCritical || data.piiExposure.found) {
              await cleanupAndExit(1);
            }
          } else {
            console.log(chalk.red(`Failed: ${result.error || 'Unknown error'}`));
            await cleanupAndExit(1);
          }

          await cleanupAndExit(0);
        } catch (err) {
          console.error(chalk.red('\nFailed:'), err);
          await cleanupAndExit(1);
        }
        return; // Don't fall through to SAST/DAST path
      }

      const format = options.format as OutputFormat;
      const runSAST = options.sast || (!options.dast && !options.compliance);
      const frameworks: string[] = options.compliance
        ? options.compliance.split(',').map((value: string) => value.trim()).filter(Boolean)
        : [];
      const scanResult: SecurityScanResult = {
        vulnerabilities: [], target: options.target,
        scanType: [runSAST && 'SAST', options.dast && 'DAST', frameworks.length > 0 && 'Compliance'].filter(Boolean).join('+'),
        checks: [], status: 'not-run',
      };
      const checks = scanResult.checks!;

      try {
        const securityAPI = await context.kernel!.getDomainAPIAsync!<SecurityComplianceAPI>('security-compliance');
        if (!securityAPI) {
          checks.push({ name: scanResult.scanType, status: 'failed', reason: 'Security domain not available' });
        } else {
          if (runSAST) {
            const { files, discovery } = await discoverSecurityFiles(options.target);
            scanResult.discovery = discovery;
            if (files.length === 0) {
              checks.push({ name: 'SAST', status: 'not-run', reason: 'No analyzable input was discovered; no SAST scan ran.' });
            } else {
              try {
                const sastResult = await securityAPI.runSASTScan(files.map(file => FilePath.create(file)));
                if (sastResult.success && sastResult.value) {
                  const result = sastResult.value;
                  scanResult.vulnerabilities = result.vulnerabilities.map(formatVulnerability);
                  scanResult.coverage = result.evidence ? result.coverage : undefined;
                  scanResult.evidence = result.evidence;
                  checks.push({
                    name: 'SAST', status: result.evidence?.completeness ?? 'unverified',
                    ...(!result.evidence ? { reason: 'The scanner returned no execution receipts.' } : {}),
                  });
                } else {
                  checks.push({ name: 'SAST', status: 'failed', reason: !sastResult.success ? securityFailureReason('SAST scan', sastResult.error) : 'SAST scan returned no result' });
                }
              } catch (error) {
                checks.push({ name: 'SAST', status: 'failed', reason: securityFailureReason('SAST scan', error) });
              }
            }
            if (discovery.status !== 'complete') {
              checks.push({ name: 'Source discovery', status: discovery.status, reason: 'Requested source discovery did not complete; inspect discovery issues.' });
            }
          }

          if (frameworks.length > 0) {
            const issues: Array<{ framework: string; issue: string }> = [];
            let compliant = true;
            for (const framework of frameworks) {
              try {
                const outcome = await securityAPI.runComplianceCheck(framework);
                if (!outcome.success || !outcome.value) {
                  compliant = false;
                  checks.push({ name: `Compliance:${framework}`, status: 'failed', reason: !outcome.success ? securityFailureReason('Compliance check', outcome.error) : 'Compliance check returned no result' });
                  continue;
                }
                const report = outcome.value;
                const legacy = report as ComplianceReport & { compliant?: boolean; issues?: Array<{ framework: string; issue: string }> };
                const violations = report.violations ?? [];
                const skipped = report.skippedRules ?? [];
                const passed = report.passedRules ?? [];
                const measured = Array.isArray(report.violations) && Array.isArray(report.passedRules) && Array.isArray(report.skippedRules);
                const status = !measured ? 'unverified' : skipped.length > 0 ? 'partial' : passed.length + violations.length > 0 ? 'complete' : 'none';
                checks.push({ name: `Compliance:${framework}`, status, ...(skipped.length ? { reason: `${skipped.length} compliance rules were skipped.` } : {}) });
                issues.push(...violations.map(violation => ({ framework, issue: violation.details })));
                if (legacy.issues) issues.push(...legacy.issues);
                if (status !== 'complete' || violations.length > 0 || legacy.compliant === false) compliant = false;
              } catch (error) {
                compliant = false;
                checks.push({ name: `Compliance:${framework}`, status: 'failed', reason: securityFailureReason('Compliance check', error) });
              }
            }
            scanResult.compliance = { compliant, issues };
          }
        }
        if (options.dast) {
          checks.push({ name: 'DAST', status: 'not-run', reason: 'This CLI command does not execute DAST. A running application URL and DAST execution path are required.' });
        }
      } catch (error) {
        checks.push({ name: scanResult.scanType, status: 'failed', reason: securityFailureReason('Security scan', error) });
      }

      scanResult.status = summarizeChecks(checks);
      try {
        if (format === 'json') writeOutput(toJSON(scanResult), options.output);
        else if (format === 'sarif') writeOutput(toSARIF(scanResult), options.output);
        else if (format === 'markdown') writeOutput(securityToMarkdown(scanResult), options.output);
        else printSecurityResult(scanResult);
      } catch (error) {
        console.error(chalk.red('Failed to write security report:'), error);
        return cleanupAndExit(1);
      }

      // Incomplete execution never has a clean exit, even if it found no vulnerabilities.
      if (scanResult.status !== 'complete' || scanResult.compliance?.compliant === false) return cleanupAndExit(1);
      if (scanResult.vulnerabilities.some(v => v.severity === 'high' || v.severity === 'critical')) return cleanupAndExit(1);
      if (scanResult.vulnerabilities.some(v => v.severity === 'medium')) return cleanupAndExit(2);
      return cleanupAndExit(0);
    });

  return securityCmd;
}

/** Provider exceptions can contain credentials or source; expose only an operation and errno. */
function securityFailureReason(operation: string, error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  return typeof code === 'string' && /^[A-Z0-9_]{1,32}$/.test(code)
    ? `${operation} failed (${code}).`
    : `${operation} failed.`;
}

function summarizeChecks(checks: SecurityCheckResult[]): SecurityScanResult['status'] {
  if (checks.length === 0) return 'not-run';
  if (checks.every(check => check.status === 'complete')) return 'complete';
  if (checks.some(check => check.status === 'partial' || check.status === 'complete')) return 'partial';
  if (checks.some(check => check.status === 'failed')) return 'failed';
  if (checks.some(check => check.status === 'unverified')) return 'unverified';
  if (checks.some(check => check.status === 'none')) return 'none';
  return 'not-run';
}

function formatVulnerability(value: Vulnerability | SecurityVulnerability): SecurityVulnerability {
  if ('location' in value) {
    return {
      severity: value.severity, type: value.title || value.category,
      file: value.location.file, line: value.location.line ?? 1,
      message: value.description,
    };
  }
  return value;
}

function printSecurityResult(result: SecurityScanResult): void {
  console.log(chalk.blue(`\n Security scan on ${result.target}\n`));
  for (const check of result.checks ?? []) {
    const color = check.status === 'complete' ? chalk.green : chalk.yellow;
    console.log(color(`  ${check.name}: ${check.status}${check.reason ? ` — ${check.reason}` : ''}`));
  }
  if (result.coverage) {
    console.log(`  Analyzed ${result.coverage.filesScanned} files, ${result.coverage.linesScanned} lines; ${result.coverage.rulesApplied} rules applied${result.coverage.rulesAppliedScope ? ` (${result.coverage.rulesAppliedScope})` : ''}.`);
  }
  if (result.vulnerabilities.length === 0) {
    console.log(result.status === 'complete'
      ? '  No vulnerabilities found in completed checks.'
      : '  No vulnerabilities reported; requested analysis is incomplete or unverified.');
  } else {
    console.log(chalk.yellow(`  Found ${result.vulnerabilities.length} potential issues:`));
    for (const vulnerability of result.vulnerabilities.slice(0, 10)) {
      console.log(`    [${vulnerability.severity}] ${vulnerability.type}: ${vulnerability.file}:${vulnerability.line}`);
      console.log(`           ${vulnerability.message}`);
    }
    if (result.vulnerabilities.length > 10) console.log(`    ... and ${result.vulnerabilities.length - 10} more`);
  }
  if (result.compliance) {
    console.log(`  Compliance: ${result.compliance.compliant ? 'compliant in completed checks' : 'failed or incomplete'}`);
    for (const issue of result.compliance.issues ?? []) console.log(`    [${issue.framework}] ${issue.issue}`);
  }
  const limitations = [
    ...(result.evidence?.limitations ?? []),
    ...(result.evidence?.engines.flatMap(engine => engine.status === 'completed' ? [] : [`${engine.id}: ${engine.status}`, ...engine.errors]) ?? []),
    ...(result.evidence?.files.filter(file => file.status !== 'analyzed' && file.status !== 'excluded').map(file => `${file.path}: ${file.status}${file.reason ? ` (${file.reason})` : ''}`) ?? []),
    ...(result.discovery?.issues.map(issue => `${issue.path}: ${issue.reason}`) ?? []),
  ];
  for (const limitation of limitations.slice(0, 10)) console.log(chalk.yellow(`  ${limitation}`));
  if (limitations.length > 10) console.log(`  ... ${limitations.length - 10} additional limitations; use JSON, Markdown, or SARIF for full receipts.`);
  if (result.evidence) console.log('  Scope: completed checks of the declared required engines; this is not full SAST assurance.');
  console.log(`\n Security analysis: ${result.status}\n`);
}
