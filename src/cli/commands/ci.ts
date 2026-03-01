/**
 * Agentic QE v3 - CI Command
 *
 * Provides CI/CD pipeline orchestration via `aqe ci run`.
 * Reads .aqe-ci.yml, executes phases, reports per-phase results
 * with proper exit codes, and generates combined reports.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import type { CLIContext } from '../handlers/interfaces.js';
import {
  findCIConfigFile,
  parseCIConfigFile,
  getDefaultCIConfig,
  type CIConfig,
  type CIPhase,
  type CIPhaseResult,
  type CIRunResult,
  type CIPhaseType,
} from '../utils/ci-config.js';
import { writeOutput, toJSON } from '../utils/ci-output.js';
import { buildCoverageData } from '../utils/coverage-data.js';

// ============================================================================
// Phase Execution
// ============================================================================

async function executePhase(
  phase: CIPhase,
  context: CLIContext,
  outputDir: string,
  outputFormat: string,
): Promise<CIPhaseResult> {
  const startTime = Date.now();
  const artifacts: string[] = [];

  if (!phase.enabled) {
    return {
      phase: phase.name,
      type: phase.type,
      status: 'skipped',
      duration: 0,
      exitCode: 0,
      summary: 'Phase disabled',
      artifacts: [],
    };
  }

  try {
    let details: Record<string, unknown> = {};
    let status: 'passed' | 'failed' | 'warning' = 'passed';
    let summary = '';

    switch (phase.type) {
      case 'test': {
        const testGenAPI = await context.kernel!.getDomainAPIAsync!<{
          generateTests(request: Record<string, unknown>): Promise<{ success: boolean; value?: unknown; error?: Error }>;
        }>('test-generation');

        if (!testGenAPI) {
          return makeResult(phase, startTime, 'failed', 1, 'Test generation domain not available', artifacts);
        }

        const target = (phase.config.target as string) || '.';
        const { walkSourceFiles } = await import('../utils/file-discovery.js');
        const targetPath = path.resolve(target);
        const sourceFiles = walkSourceFiles(targetPath, { includeTests: false });

        const result = await testGenAPI.generateTests({
          sourceFiles,
          testType: (phase.config.type as string) || 'unit',
          framework: (phase.config.framework as string) || 'vitest',
          coverageTarget: 80,
        });

        if (result.success && result.value) {
          const gen = result.value as { tests: unknown[]; coverageEstimate: number };
          details = { testsGenerated: gen.tests.length, coverageEstimate: gen.coverageEstimate };
          summary = `Generated ${gen.tests.length} tests (est. ${gen.coverageEstimate}% coverage)`;

          const artifactPath = path.join(outputDir, 'test-generation.json');
          fs.writeFileSync(artifactPath, toJSON(gen), 'utf-8');
          artifacts.push(artifactPath);
        } else {
          status = 'failed';
          summary = result.error?.message || 'Test generation failed';
        }
        break;
      }

      case 'coverage': {
        const coverageAPI = await context.kernel!.getDomainAPIAsync!<{
          analyze(request: Record<string, unknown>): Promise<{ success: boolean; value?: unknown; error?: Error }>;
          detectGaps(request: Record<string, unknown>): Promise<{ success: boolean; value?: unknown; error?: Error }>;
        }>('coverage-analysis');

        if (!coverageAPI) {
          return makeResult(phase, startTime, 'failed', 1, 'Coverage analysis domain not available', artifacts);
        }

        const target = (phase.config.target as string) || '.';
        const threshold = (phase.config.threshold as number) || 80;
        const { walkSourceFiles } = await import('../utils/file-discovery.js');
        const targetPath = path.resolve(target);
        const sourceFiles = walkSourceFiles(targetPath, { includeTests: false });

        // Build coverage data from real V8/istanbul output or deterministic estimation
        const coverageData = buildCoverageData(sourceFiles);

        const result = await coverageAPI.analyze({ coverageData, threshold, includeFileDetails: true });
        if (result.success && result.value) {
          const report = result.value as { summary: { line: number; branch: number }; meetsThreshold: boolean };
          details = { ...report.summary, meetsThreshold: report.meetsThreshold, threshold };
          status = report.meetsThreshold ? 'passed' : 'warning';
          summary = `Line: ${report.summary.line}%, Branch: ${report.summary.branch}% — ${report.meetsThreshold ? 'meets' : 'below'} ${threshold}% threshold`;

          const artifactPath = path.join(outputDir, 'coverage.json');
          fs.writeFileSync(artifactPath, toJSON(result.value), 'utf-8');
          artifacts.push(artifactPath);
        } else {
          status = 'failed';
          summary = result.error?.message || 'Coverage analysis failed';
        }
        break;
      }

      case 'security': {
        const securityAPI = await context.kernel!.getDomainAPIAsync!<{
          runSASTScan(files: string[]): Promise<{ success: boolean; value?: unknown; error?: Error }>;
        }>('security-compliance');

        if (!securityAPI) {
          return makeResult(phase, startTime, 'failed', 1, 'Security domain not available', artifacts);
        }

        const target = (phase.config.target as string) || '.';
        const { walkSourceFiles } = await import('../utils/file-discovery.js');
        const targetPath = path.resolve(target);
        const files = walkSourceFiles(targetPath, { includeTests: true });

        const result = await securityAPI.runSASTScan(files);
        if (result.success && result.value) {
          const scan = result.value as { vulnerabilities?: Array<{ severity: string }> };
          const vulns = scan.vulnerabilities || [];
          const highCount = vulns.filter(v => v.severity === 'high' || v.severity === 'critical').length;
          details = { vulnerabilities: vulns.length, high: highCount };
          status = highCount > 0 ? 'failed' : vulns.length > 0 ? 'warning' : 'passed';
          summary = vulns.length === 0
            ? 'No vulnerabilities found'
            : `${vulns.length} vulnerabilities (${highCount} high/critical)`;

          // Write SARIF artifact
          const { toSARIF } = await import('../utils/ci-output.js');
          const sarifPath = path.join(outputDir, 'security.sarif');
          fs.writeFileSync(sarifPath, toSARIF({
            vulnerabilities: vulns as Array<{ severity: string; type: string; file: string; line: number; message: string }>,
            target,
            scanType: 'SAST',
          }), 'utf-8');
          artifacts.push(sarifPath);

          const jsonPath = path.join(outputDir, 'security.json');
          fs.writeFileSync(jsonPath, toJSON(scan), 'utf-8');
          artifacts.push(jsonPath);
        } else {
          status = 'failed';
          summary = result.error?.message || 'Security scan failed';
        }
        break;
      }

      case 'quality-gate': {
        const qualityAPI = await context.kernel!.getDomainAPIAsync!<{
          evaluate(request: Record<string, unknown>): Promise<{ success: boolean; value?: unknown; error?: Error }>;
        }>('quality-assessment');

        if (!qualityAPI) {
          return makeResult(phase, startTime, 'failed', 1, 'Quality assessment domain not available', artifacts);
        }

        const result = await qualityAPI.evaluate({ runGate: true, includeAdvice: true });
        if (result.success && result.value) {
          const assessment = result.value as { passed?: boolean; score?: string; grade?: string; checks?: unknown[]; recommendations?: string[]; meetsThreshold?: boolean };
          const passed = assessment.passed ?? assessment.meetsThreshold ?? true;
          details = { passed, score: assessment.score || assessment.grade, checks: assessment.checks };
          status = passed ? 'passed' : 'failed';
          summary = `Quality gate: ${passed ? 'PASSED' : 'FAILED'} (score: ${assessment.score || assessment.grade || 'N/A'})`;

          const artifactPath = path.join(outputDir, 'quality-gate.json');
          fs.writeFileSync(artifactPath, toJSON(assessment), 'utf-8');
          artifacts.push(artifactPath);
        } else {
          status = 'failed';
          summary = result.error?.message || 'Quality gate evaluation failed';
        }
        break;
      }

      case 'code-intelligence': {
        const codeAPI = await context.kernel!.getDomainAPIAsync!<{
          index(request: Record<string, unknown>): Promise<{ success: boolean; value?: unknown; error?: Error }>;
        }>('code-intelligence');

        if (!codeAPI) {
          return makeResult(phase, startTime, 'failed', 1, 'Code intelligence domain not available', artifacts);
        }

        const target = (phase.config.target as string) || '.';
        const { walkSourceFiles } = await import('../utils/file-discovery.js');
        const targetPath = path.resolve(target);
        const paths = walkSourceFiles(targetPath, { includeTests: false });

        const result = await codeAPI.index({ paths, incremental: true });
        if (result.success && result.value) {
          const idx = result.value as { filesIndexed: number; nodesCreated: number };
          details = idx;
          summary = `Indexed ${idx.filesIndexed} files, ${idx.nodesCreated} nodes`;

          const artifactPath = path.join(outputDir, 'code-intelligence.json');
          fs.writeFileSync(artifactPath, toJSON(idx), 'utf-8');
          artifacts.push(artifactPath);
        } else {
          status = 'warning';
          summary = result.error?.message || 'Code intelligence indexing incomplete';
        }
        break;
      }

      default:
        summary = `Custom phase "${phase.name}" — no built-in handler`;
        status = 'warning';
    }

    const duration = Date.now() - startTime;
    return {
      phase: phase.name,
      type: phase.type,
      status,
      duration,
      exitCode: status === 'failed' ? 1 : 0,
      summary,
      artifacts,
      details,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      phase: phase.name,
      type: phase.type,
      status: 'failed',
      duration,
      exitCode: 1,
      summary: `Error: ${error instanceof Error ? error.message : String(error)}`,
      artifacts,
    };
  }
}

function makeResult(
  phase: CIPhase,
  startTime: number,
  status: 'passed' | 'failed' | 'warning' | 'skipped',
  exitCode: number,
  summary: string,
  artifacts: string[],
): CIPhaseResult {
  return {
    phase: phase.name,
    type: phase.type,
    status,
    duration: Date.now() - startTime,
    exitCode,
    summary,
    artifacts,
  };
}

// ============================================================================
// Combined Report
// ============================================================================

function generateCombinedReport(result: CIRunResult): string {
  let md = `# AQE CI/CD Report\n\n`;
  md += `**Status:** ${result.overallStatus === 'passed' ? 'PASSED' : result.overallStatus === 'warning' ? 'WARNING' : 'FAILED'}\n`;
  md += `**Duration:** ${(result.duration / 1000).toFixed(1)}s\n`;
  md += `**Quality Gate:** ${result.qualityGatePassed ? 'Passed' : 'Failed'}\n\n`;
  md += `## Phases\n\n`;
  md += `| Phase | Type | Status | Duration | Summary |\n`;
  md += `|-------|------|--------|----------|---------|\n`;

  for (const phase of result.phases) {
    const statusIcon = phase.status === 'passed' ? 'PASS' :
                       phase.status === 'failed' ? 'FAIL' :
                       phase.status === 'warning' ? 'WARN' : 'SKIP';
    md += `| ${phase.phase} | ${phase.type} | ${statusIcon} | ${(phase.duration / 1000).toFixed(1)}s | ${phase.summary} |\n`;
  }

  md += `\n## Artifacts\n\n`;
  for (const phase of result.phases) {
    if (phase.artifacts.length > 0) {
      md += `### ${phase.phase}\n`;
      for (const artifact of phase.artifacts) {
        md += `- \`${path.basename(artifact)}\`\n`;
      }
      md += '\n';
    }
  }

  return md;
}

// ============================================================================
// Command
// ============================================================================

export function createCICommand(
  context: CLIContext,
  cleanupAndExit: (code: number) => Promise<never>,
  ensureInitialized: () => Promise<boolean>
): Command {
  const ciCmd = new Command('ci')
    .description('CI/CD pipeline orchestration');

  // aqe ci run
  ciCmd
    .command('run')
    .description('Execute CI pipeline from .aqe-ci.yml')
    .option('-c, --config <path>', 'Path to .aqe-ci.yml config file')
    .option('--phase <phases>', 'Run only specific phases (comma-separated)')
    .option('--no-quality-gate', 'Skip quality gate enforcement')
    .option('-F, --format <format>', 'Output format (text|json|markdown)', 'text')
    .option('-o, --output <path>', 'Write combined report to file')
    .action(async (options) => {
      if (!await ensureInitialized()) return;

      try {
        // Find and parse config
        let config: CIConfig;
        let configPath: string | null = null;

        if (options.config) {
          const parseResult = parseCIConfigFile(path.resolve(options.config));
          if (!parseResult.success) {
            console.error(chalk.red('\n  Config errors:'));
            for (const err of parseResult.errors) {
              console.error(chalk.red(`    - ${err}`));
            }
            await cleanupAndExit(1);
            return;
          }
          config = parseResult.config!;
          configPath = options.config;
        } else {
          configPath = findCIConfigFile();
          if (configPath) {
            const parseResult = parseCIConfigFile(configPath);
            if (!parseResult.success) {
              console.error(chalk.red('\n  Config errors:'));
              for (const err of parseResult.errors) {
                console.error(chalk.red(`    - ${err}`));
              }
              await cleanupAndExit(1);
              return;
            }
            config = parseResult.config!;
          } else {
            config = getDefaultCIConfig();
            configPath = '(defaults)';
          }
        }

        // Filter phases if --phase specified
        if (options.phase) {
          const requested = (options.phase as string).split(',').map((s: string) => s.trim().toLowerCase());
          config.phases = config.phases.filter(p =>
            requested.includes(p.name.toLowerCase()) || requested.includes(p.type)
          );
        }

        // Disable quality gate if --no-quality-gate
        if (options.qualityGate === false) {
          config.qualityGate.enforced = false;
        }

        const format = options.format as string;
        const startedAt = new Date();

        if (format === 'text') {
          console.log(chalk.blue(`\n  AQE CI Pipeline\n`));
          console.log(chalk.gray(`  Config: ${configPath}`));
          console.log(chalk.gray(`  Phases: ${config.phases.length}`));
          console.log(chalk.gray(`  Quality Gate: ${config.qualityGate.enforced ? 'enforced' : 'advisory'}\n`));
        }

        // Create output directory
        const outputDir = path.resolve(config.output.directory);
        fs.mkdirSync(outputDir, { recursive: true });

        // Execute phases
        const phaseResults: CIPhaseResult[] = [];
        let pipelineFailed = false;

        for (const phase of config.phases) {
          if (format === 'text') {
            const spinner = `  [${phaseResults.length + 1}/${config.phases.length}] ${phase.name}...`;
            process.stdout.write(chalk.cyan(spinner));
          }

          const result = await executePhase(phase, context, outputDir, config.output.format);
          phaseResults.push(result);

          if (format === 'text') {
            const statusColor = result.status === 'passed' ? chalk.green :
                               result.status === 'failed' ? chalk.red :
                               result.status === 'warning' ? chalk.yellow : chalk.gray;
            const statusText = result.status.toUpperCase();
            const durationText = `${(result.duration / 1000).toFixed(1)}s`;
            process.stdout.write(`\r  [${phaseResults.length}/${config.phases.length}] ${phase.name} ${statusColor(statusText)} (${durationText})\n`);
            if (result.summary) {
              console.log(chalk.gray(`      ${result.summary}`));
            }
          }

          if (result.status === 'failed') {
            pipelineFailed = true;
            if (!phase.continueOnFailure) {
              if (format === 'text') {
                console.log(chalk.red(`\n  Pipeline stopped: "${phase.name}" failed (continue_on_failure: false)\n`));
              }
              break;
            }
          }
        }

        // Determine overall status
        const hasFailure = phaseResults.some(r => r.status === 'failed');
        const hasWarning = phaseResults.some(r => r.status === 'warning');
        const qualityGateResult = phaseResults.find(r => r.type === 'quality-gate');
        const qualityGatePassed = !config.qualityGate.enforced || !qualityGateResult || qualityGateResult.status === 'passed';

        const overallStatus: 'passed' | 'failed' | 'warning' =
          hasFailure || !qualityGatePassed ? 'failed' :
          hasWarning ? 'warning' : 'passed';

        const completedAt = new Date();
        const duration = completedAt.getTime() - startedAt.getTime();

        const runResult: CIRunResult = {
          config: configPath || '(defaults)',
          startedAt,
          completedAt,
          duration,
          phases: phaseResults,
          qualityGatePassed,
          overallStatus,
          exitCode: overallStatus === 'failed' ? 1 : 0,
        };

        // Write combined report
        if (config.output.combinedReport) {
          const reportPath = path.join(outputDir, 'ci-report.md');
          fs.writeFileSync(reportPath, generateCombinedReport(runResult), 'utf-8');

          const jsonPath = path.join(outputDir, 'ci-report.json');
          fs.writeFileSync(jsonPath, toJSON(runResult), 'utf-8');
        }

        // Output results
        if (format === 'json') {
          writeOutput(toJSON(runResult), options.output);
        } else if (format === 'markdown') {
          writeOutput(generateCombinedReport(runResult), options.output);
        } else {
          // Text summary
          console.log('');
          const statusColor = overallStatus === 'passed' ? chalk.green :
                             overallStatus === 'failed' ? chalk.red : chalk.yellow;
          console.log(`  ${statusColor(`Pipeline: ${overallStatus.toUpperCase()}`)} (${(duration / 1000).toFixed(1)}s)`);
          console.log(`  Quality Gate: ${qualityGatePassed ? chalk.green('PASSED') : chalk.red('FAILED')}`);
          console.log(chalk.gray(`  Artifacts: ${outputDir}/`));
          console.log('');
        }

        await cleanupAndExit(runResult.exitCode);

      } catch (error) {
        console.error(chalk.red('\n  CI pipeline failed:'), error);
        await cleanupAndExit(1);
      }
    });

  // aqe ci init
  ciCmd
    .command('init')
    .description('Create a .aqe-ci.yml config file')
    .option('--force', 'Overwrite existing config')
    .action(async (options) => {
      const existingConfig = findCIConfigFile();
      if (existingConfig && !options.force) {
        console.log(chalk.yellow(`\n  Config already exists: ${existingConfig}`));
        console.log(chalk.gray('  Use --force to overwrite\n'));
        await cleanupAndExit(0);
        return;
      }

      const configContent = `# AQE CI/CD Pipeline Configuration
# Documentation: https://github.com/proffesor-for-testing/agentic-qe

version: '1'
name: ${path.basename(process.cwd())}

phases:
  - name: Test Generation
    type: test
    config:
      target: .
      framework: vitest
      type: unit
    timeout: 300

  - name: Coverage Analysis
    type: coverage
    continue_on_failure: true
    config:
      target: .
      threshold: 80
    timeout: 300

  - name: Security Scan
    type: security
    continue_on_failure: true
    config:
      sast: true
    timeout: 300

  - name: Quality Gate
    type: quality-gate
    timeout: 60

output:
  format: json
  directory: .aqe-ci-output
  combined_report: true

quality_gate:
  enforced: true
  thresholds:
    coverage: 80
    security: medium
    quality: 70
`;

      const configPath = path.join(process.cwd(), '.aqe-ci.yml');
      fs.writeFileSync(configPath, configContent, 'utf-8');
      console.log(chalk.green(`\n  Created: ${configPath}`));
      console.log(chalk.gray('  Edit the file to customize your CI pipeline'));
      console.log(chalk.gray('  Run: aqe ci run\n'));
      await cleanupAndExit(0);
    });

  // aqe ci validate
  ciCmd
    .command('validate')
    .description('Validate .aqe-ci.yml config')
    .option('-c, --config <path>', 'Path to config file')
    .action(async (options) => {
      const configPath = options.config
        ? path.resolve(options.config)
        : findCIConfigFile();

      if (!configPath) {
        console.log(chalk.red('\n  No .aqe-ci.yml found'));
        console.log(chalk.gray('  Run: aqe ci init\n'));
        await cleanupAndExit(1);
        return;
      }

      const result = parseCIConfigFile(configPath);

      if (result.success) {
        console.log(chalk.green(`\n  Config valid: ${configPath}`));
        console.log(chalk.gray(`  Phases: ${result.config!.phases.length}`));
        for (const phase of result.config!.phases) {
          const icon = phase.enabled ? chalk.green('*') : chalk.gray('o');
          console.log(`    ${icon} ${phase.name} (${phase.type})`);
        }
        console.log(chalk.gray(`  Quality Gate: ${result.config!.qualityGate.enforced ? 'enforced' : 'advisory'}`));
        console.log('');
        await cleanupAndExit(0);
      } else {
        console.log(chalk.red(`\n  Config invalid: ${configPath}`));
        for (const err of result.errors) {
          console.log(chalk.red(`    - ${err}`));
        }
        console.log('');
        await cleanupAndExit(1);
      }
    });

  return ciCmd;
}
