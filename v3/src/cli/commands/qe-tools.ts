#!/usr/bin/env node

/**
 * Agentic QE v3 - CLI Commands for MCP Tools
 *
 * Thin CLI wrappers around MCP tools per ADR-010: MCP-First Tool Design.
 * All QE functionality is exposed as MCP tools first, CLI wraps them.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  TestGenerateTool,
  TestExecuteTool,
  CoverageAnalyzeTool,
  CoverageGapsTool,
  QualityEvaluateTool,
  DefectPredictTool,
  RequirementsValidateTool,
  CodeAnalyzeTool,
  SecurityScanTool,
  ContractValidateTool,
  VisualCompareTool,
  A11yAuditTool,
  ChaosInjectTool,
  LearningOptimizeTool,
} from '../../mcp/tools';
import { parseJsonOption } from '../../shared/safe-json.js';
import { runTestGenerationWizard, type TestWizardResult } from '../wizards/test-wizard.js';
import {
  runCoverageAnalysisWizard,
  type CoverageWizardResult,
} from '../wizards/coverage-wizard.js';
import {
  runSecurityScanWizard,
  type SecurityWizardResult,
} from '../wizards/security-wizard.js';
import {
  createTestStreamHandler,
  createCoverageStreamHandler,
  type TestResultStreamer,
  type CoverageStreamer,
  type TestSuiteResult,
  type TestCaseResult,
  type FileCoverage,
  type CoverageGap,
  type CoverageSummary,
} from '../utils/streaming.js';
// MCPToolContext import removed - not needed for CLI wrapper

// ============================================================================
// Shared Helpers
// ============================================================================

interface StreamData {
  message?: string;
  suite?: TestSuiteResult;
  test?: TestCaseResult;
  file?: FileCoverage;
  gap?: CoverageGap;
  summary?: CoverageSummary;
  type?: string;
  totalFiles?: number;
  [key: string]: unknown;
}

function createStreamHandler(): { onStream: (data: unknown) => void } {
  return {
    onStream: (data: unknown) => {
      const streamData = data as StreamData;
      printStreaming(streamData.message || JSON.stringify(data));
    },
  };
}

/**
 * Create an enhanced stream handler for test execution with real-time output
 * per ADR-041 requirements for streaming test results.
 *
 * Output format:
 * ```
 * [checkmark] UserService.test.ts
 *   [checkmark] should create user (12ms)
 *   [checkmark] should validate email (3ms)
 * [X] PaymentService.test.ts
 *   [checkmark] should process payment (23ms)
 *   [X] should handle declined card (45ms)
 * Tests: 8 passed, 1 failed, 1 skipped
 * Time: 1.234s
 * ```
 */
function createEnhancedTestStreamHandler(): {
  onStream: (data: unknown) => void;
  streamer: TestResultStreamer;
  finish: () => void;
} {
  const { onStream, streamer } = createTestStreamHandler({ colors: true });

  return {
    onStream: (data: unknown) => {
      const streamData = data as StreamData;

      // Handle different stream data formats from MCP tools
      if (streamData.suite) {
        streamer.streamSuite(streamData.suite);
      } else if (streamData.test) {
        streamer.streamTest(streamData.test);
      } else if (streamData.type === 'summary') {
        streamer.streamSummary();
      } else if (streamData.message) {
        // Fallback for simple messages
        onStream(data);
      }
    },
    streamer,
    finish: () => {
      streamer.streamSummary();
      streamer.stop();
    },
  };
}

/**
 * Create an enhanced stream handler for coverage analysis with real-time output
 * per ADR-041 requirements for streaming coverage analysis.
 */
function createEnhancedCoverageStreamHandler(): {
  onStream: (data: unknown) => void;
  streamer: CoverageStreamer;
  finish: (summary: CoverageSummary) => void;
} {
  const { onStream, streamer } = createCoverageStreamHandler({ colors: true });

  return {
    onStream: (data: unknown) => {
      const streamData = data as StreamData;

      // Handle different stream data formats from MCP tools
      if (streamData.type === 'start' && streamData.totalFiles) {
        streamer.start(streamData.totalFiles);
      } else if (streamData.file) {
        streamer.streamFileCoverage(streamData.file);
      } else if (streamData.gap) {
        streamer.streamGap(streamData.gap);
      } else if (streamData.summary) {
        streamer.streamSummary(streamData.summary);
      } else if (streamData.message) {
        // Fallback for simple messages
        onStream(data);
      }
    },
    streamer,
    finish: (summary: CoverageSummary) => {
      streamer.streamSummary(summary);
      streamer.stop();
    },
  };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function printResult(result: { success: boolean; data?: unknown; error?: string }): void {
  if (result.success) {
    console.log(chalk.green('\n  Success!\n'));
    if (result.data) {
      console.log(JSON.stringify(result.data, null, 2));
    }
  } else {
    console.log(chalk.red(`\n  Error: ${result.error}\n`));
    process.exit(1);
  }
}

function printStreaming(message: string): void {
  console.log(chalk.gray(`  [stream] ${message}`));
}

// ============================================================================
// Test Generation Commands
// ============================================================================

export function registerTestCommands(program: Command): void {
  const testCmd = program
    .command('tests')
    .description('Test generation and execution (MCP: qe/tests/*)');

  // qe tests generate
  testCmd
    .command('generate')
    .description('Generate tests for source files (MCP: qe/tests/generate)')
    .argument('[files...]', 'Source files to generate tests for')
    .option('-t, --type <type>', 'Test type (unit|integration|e2e|property|contract)', 'unit')
    .option('-f, --framework <framework>', 'Test framework (jest|vitest|mocha|playwright)', 'vitest')
    .option('-l, --language <lang>', 'Programming language (typescript|javascript|python)', 'typescript')
    .option('-c, --coverage <target>', 'Coverage target percentage', '80')
    .option('--patterns <patterns>', 'Include patterns (comma-separated)')
    .option('--anti-patterns', 'Detect anti-patterns', false)
    .option('--streaming', 'Enable streaming output', false)
    .option('--wizard', 'Run interactive test generation wizard')
    .option('--ai-level <level>', 'AI enhancement level (none|basic|standard|advanced)', 'standard')
    .action(async (files: string[], options) => {
      let sourceFiles = files;
      let testType = options.type;
      let framework = options.framework;
      let coverageTarget = parseInt(options.coverage, 10);
      let detectAntiPatterns = options.antiPatterns;
      let aiLevel = options.aiLevel;

      // Run wizard if requested
      if (options.wizard) {
        try {
          const wizardResult: TestWizardResult = await runTestGenerationWizard({
            defaultSourceFiles: files.length > 0 ? files : undefined,
            defaultTestType: options.type,
            defaultCoverageTarget: parseInt(options.coverage, 10),
            defaultFramework: options.framework,
            defaultAILevel: options.aiLevel,
          });

          if (wizardResult.cancelled) {
            console.log(chalk.yellow('\n  Test generation cancelled.\n'));
            process.exit(0);
          }

          // Use wizard results
          sourceFiles = wizardResult.sourceFiles;
          testType = wizardResult.testType;
          framework = wizardResult.framework;
          coverageTarget = wizardResult.coverageTarget;
          detectAntiPatterns = wizardResult.detectAntiPatterns;
          aiLevel = wizardResult.aiLevel;

          console.log(chalk.green('\n  Starting test generation...\n'));
        } catch (err) {
          console.error(chalk.red('\n  Wizard error:'), err);
          process.exit(1);
        }
      }

      // Validate we have source files
      if (!sourceFiles || sourceFiles.length === 0) {
        console.log(chalk.red('\n  Error: No source files specified.'));
        console.log(chalk.gray('  Use --wizard for interactive mode or provide file paths.\n'));
        console.log(chalk.gray('  Examples:'));
        console.log(chalk.gray('    aqe tests generate src/services/*.ts'));
        console.log(chalk.gray('    aqe tests generate --wizard\n'));
        process.exit(1);
      }

      const tool = new TestGenerateTool();

      console.log(chalk.blue(`\n  Generating ${testType} tests for ${sourceFiles.length} file(s)...\n`));
      console.log(chalk.gray(`  Framework: ${framework} | Coverage: ${coverageTarget}% | AI: ${aiLevel}\n`));

      const start = Date.now();
      const result = await tool.invoke({
        sourceFiles,
        testType,
        framework,
        language: options.language,
        coverageTarget,
        includePatterns: options.patterns?.split(','),
        detectAntiPatterns,
        aiEnhanced: aiLevel !== 'none',
      }, options.streaming ? createStreamHandler() : {});

      console.log(chalk.gray(`  Duration: ${formatDuration(Date.now() - start)}`));
      printResult(result);
    });

  // qe tests execute
  testCmd
    .command('execute')
    .description('Execute tests with parallel execution and flaky detection (MCP: qe/tests/execute)')
    .argument('[pattern]', 'Test pattern to match', '**/*.test.ts')
    .option('-f, --framework <framework>', 'Test framework', 'vitest')
    .option('-p, --parallel <count>', 'Parallel execution count', '4')
    .option('-r, --retries <count>', 'Retry count for failures', '2')
    .option('--coverage', 'Collect coverage', true)
    .option('--flaky-detection', 'Enable flaky test detection', true)
    .option('--fail-fast', 'Stop on first failure', false)
    .option('--streaming', 'Enable streaming output', false)
    .option('--stream', 'Alias for --streaming (enhanced real-time output)', false)
    .action(async (pattern: string, options) => {
      const tool = new TestExecuteTool();
      const useStreaming = options.streaming || options.stream;

      console.log(chalk.blue(`\n  Executing tests matching: ${pattern}...\n`));

      const start = Date.now();

      // Use enhanced streaming handler for real-time test output per ADR-041
      let streamHandler: { onStream: (data: unknown) => void } | Record<string, never> = {};
      let enhancedHandler: ReturnType<typeof createEnhancedTestStreamHandler> | null = null;

      if (useStreaming) {
        enhancedHandler = createEnhancedTestStreamHandler();
        streamHandler = { onStream: enhancedHandler.onStream };
      }

      const result = await tool.invoke({
        testPattern: pattern,
        framework: options.framework,
        parallel: options.parallel ? true : false,
        parallelWorkers: parseInt(options.parallel, 10) || undefined,
        retries: parseInt(options.retries, 10),
        collectCoverage: options.coverage,
        flakyDetection: options.flakyDetection,
        failFast: options.failFast,
      }, streamHandler);

      // Finalize streaming output with summary
      if (enhancedHandler) {
        enhancedHandler.finish();
      }

      console.log(chalk.gray(`  Duration: ${formatDuration(Date.now() - start)}`));

      // Only print result if not streaming (streaming already shows output)
      if (!useStreaming) {
        printResult(result);
      } else if (!result.success) {
        console.log(chalk.red(`\n  Error: ${result.error}\n`));
        process.exit(1);
      }
    });
}

// ============================================================================
// Coverage Commands
// ============================================================================

export function registerCoverageCommands(program: Command): void {
  const coverageCmd = program
    .command('coverage')
    .description('Coverage analysis with O(log n) gap detection (MCP: qe/coverage/*)');

  // qe coverage analyze
  coverageCmd
    .command('analyze')
    .description('Analyze code coverage (MCP: qe/coverage/analyze)')
    .argument('[target]', 'Target directory or file', '.')
    .option('--include <patterns>', 'Include patterns (comma-separated)')
    .option('--exclude <patterns>', 'Exclude patterns (comma-separated)')
    .option('--threshold <percent>', 'Coverage threshold', '80')
    .option('--risk-scoring', 'Include risk scoring', true)
    .option('--sensitivity <level>', 'Gap detection sensitivity (low|medium|high)', 'medium')
    .option('--format <format>', 'Report format (json|html|markdown|text)', 'json')
    .option('--streaming', 'Enable streaming output', false)
    .option('--stream', 'Alias for --streaming (enhanced real-time output)', false)
    .option('--wizard', 'Run interactive coverage analysis wizard')
    .action(async (target: string, options) => {
      let analyzeTarget = target;
      let threshold = parseInt(options.threshold, 10);
      let includeRiskScoring = options.riskScoring;
      let includePatterns = options.include?.split(',');
      let excludePatterns = options.exclude?.split(',');
      let sensitivity = options.sensitivity;
      const useStreaming = options.streaming || options.stream;

      // Run wizard if requested
      if (options.wizard) {
        try {
          const wizardResult: CoverageWizardResult = await runCoverageAnalysisWizard({
            defaultTarget: target !== '.' ? target : undefined,
            defaultThreshold: options.threshold !== '80' ? parseInt(options.threshold, 10) : undefined,
            defaultRiskScoring: options.riskScoring,
            defaultSensitivity: options.sensitivity !== 'medium' ? options.sensitivity : undefined,
            defaultFormat: options.format !== 'json' ? options.format : undefined,
          });

          if (wizardResult.cancelled) {
            console.log(chalk.yellow('\n  Coverage analysis cancelled.\n'));
            process.exit(0);
          }

          // Use wizard results
          analyzeTarget = wizardResult.target;
          threshold = wizardResult.threshold;
          includeRiskScoring = wizardResult.riskScoring;
          includePatterns = wizardResult.includePatterns;
          excludePatterns = wizardResult.excludePatterns;
          sensitivity = wizardResult.sensitivity;

          console.log(chalk.green('\n  Starting coverage analysis...\n'));
        } catch (err) {
          console.error(chalk.red('\n  Wizard error:'), err);
          process.exit(1);
        }
      }

      const tool = new CoverageAnalyzeTool();

      console.log(chalk.blue(`\n  Analyzing coverage for: ${analyzeTarget}...\n`));
      console.log(chalk.gray(`  Threshold: ${threshold}% | Sensitivity: ${sensitivity} | Risk Scoring: ${includeRiskScoring ? 'enabled' : 'disabled'}\n`));

      const start = Date.now();

      // Use enhanced streaming handler for real-time coverage output per ADR-041
      let streamHandler: { onStream: (data: unknown) => void } | Record<string, never> = {};
      let enhancedHandler: ReturnType<typeof createEnhancedCoverageStreamHandler> | null = null;

      if (useStreaming) {
        enhancedHandler = createEnhancedCoverageStreamHandler();
        streamHandler = { onStream: enhancedHandler.onStream };
      }

      const result = await tool.invoke({
        target: analyzeTarget,
        includePatterns,
        excludePatterns,
        threshold,
        includeRiskScoring,
      }, streamHandler);

      // Finalize streaming output with summary if we have data
      if (enhancedHandler && result.success && result.data) {
        const data = result.data as { overall?: number; files?: FileCoverage[]; gaps?: CoverageGap[] };
        enhancedHandler.finish({
          overall: data.overall || 0,
          files: data.files || [],
          gaps: data.gaps || [],
        });
      }

      console.log(chalk.gray(`  Duration: ${formatDuration(Date.now() - start)}`));

      // Only print result if not streaming (streaming already shows output)
      if (!useStreaming) {
        printResult(result);
      } else if (!result.success) {
        console.log(chalk.red(`\n  Error: ${result.error}\n`));
        process.exit(1);
      }
    });

  // qe coverage gaps
  coverageCmd
    .command('gaps')
    .description('Detect coverage gaps using O(log n) HNSW (MCP: qe/coverage/gaps)')
    .argument('[target]', 'Target directory or file', '.')
    .option('--max-coverage <percent>', 'Maximum line coverage to consider a gap', '60')
    .option('--min-risk <score>', 'Minimum risk score (0-1)', '0.5')
    .option('--limit <count>', 'Maximum gaps to return', '20')
    .option('--suggest-tests', 'Suggest test cases for gaps', true)
    .option('--streaming', 'Enable streaming output', false)
    .action(async (target: string, options) => {
      const tool = new CoverageGapsTool();
      
      console.log(chalk.blue(`\n  Detecting coverage gaps in: ${target}...\n`));

      const start = Date.now();
      const result = await tool.invoke({
        target,
        maxLineCoverage: parseInt(options.maxCoverage, 10),
        minRiskScore: parseFloat(options.minRisk),
        limit: parseInt(options.limit, 10),
        suggestTests: options.suggestTests,
      }, options.streaming ? createStreamHandler() : {});

      console.log(chalk.gray(`  Duration: ${formatDuration(Date.now() - start)}`));
      printResult(result);
    });
}

// ============================================================================
// Quality Commands
// ============================================================================

export function registerQualityCommands(program: Command): void {
  const qualityCmd = program
    .command('quality')
    .description('Quality assessment and gate evaluation (MCP: qe/quality/*)');

  // qe quality evaluate
  qualityCmd
    .command('evaluate')
    .description('Evaluate quality gates for deployment (MCP: qe/quality/evaluate)')
    .option('--gate <name>', 'Quality gate name', 'default')
    .option('--coverage-threshold <percent>', 'Coverage threshold', '80')
    .option('--test-pass-threshold <percent>', 'Test pass rate threshold', '100')
    .option('--security-threshold <level>', 'Max security severity (critical|high|medium|low)', 'high')
    .option('--include-trends', 'Include trend analysis', true)
    .option('--include-deployment-advice', 'Include deployment recommendation', true)
    .option('--streaming', 'Enable streaming output', false)
    .action(async (options) => {
      const tool = new QualityEvaluateTool();
      
      console.log(chalk.blue(`\n  Evaluating quality gate: ${options.gate}...\n`));

      const start = Date.now();
      const result = await tool.invoke({
        gateName: options.gate,
        thresholds: {
          coverage: { min: parseInt(options.coverageThreshold, 10) },
          testsPassing: { min: parseInt(options.testPassThreshold, 10) },
          securityVulnerabilities: { max: options.securityThreshold === 'critical' ? 0 : 5 },
        },
        includeTrends: options.includeTrends,
        includeDeploymentAdvice: options.includeDeploymentAdvice,
      }, options.streaming ? createStreamHandler() : {});

      console.log(chalk.gray(`  Duration: ${formatDuration(Date.now() - start)}`));
      printResult(result);
    });
}

// ============================================================================
// Defect Commands
// ============================================================================

export function registerDefectCommands(program: Command): void {
  const defectCmd = program
    .command('defects')
    .description('Defect prediction and intelligence (MCP: qe/defects/*)');

  // qe defects predict
  defectCmd
    .command('predict')
    .description('Predict defects using ML (MCP: qe/defects/predict)')
    .argument('[target]', 'Target directory or file', '.')
    .option('--min-risk <score>', 'Minimum risk score to report (0-1)', '0.3')
    .option('--limit <count>', 'Maximum predictions to return', '20')
    .option('--include-factors', 'Include risk factors', true)
    .option('--include-recommendations', 'Include mitigation recommendations', true)
    .option('--streaming', 'Enable streaming output', false)
    .action(async (target: string, options) => {
      const tool = new DefectPredictTool();
      
      console.log(chalk.blue(`\n  Predicting defects in: ${target}...\n`));

      const start = Date.now();
      const result = await tool.invoke({
        target,
        minRiskScore: parseFloat(options.minRisk),
        limit: parseInt(options.limit, 10),
        includeFactors: options.includeFactors,
        includeRecommendations: options.includeRecommendations,
      }, options.streaming ? createStreamHandler() : {});

      console.log(chalk.gray(`  Duration: ${formatDuration(Date.now() - start)}`));
      printResult(result);
    });
}

// ============================================================================
// Requirements Commands
// ============================================================================

export function registerRequirementsCommands(program: Command): void {
  const reqCmd = program
    .command('requirements')
    .description('Requirements validation and BDD (MCP: qe/requirements/*)');

  // qe requirements validate
  reqCmd
    .command('validate')
    .description('Validate requirements and generate BDD scenarios (MCP: qe/requirements/validate)')
    .argument('<requirements...>', 'Requirements to validate (file paths or text)')
    .option('-f, --format <format>', 'Input format (text|markdown|jira|azure)', 'text')
    .option('--generate-bdd', 'Generate BDD scenarios', true)
    .option('--testability-scoring', 'Include testability scores', true)
    .option('--streaming', 'Enable streaming output', false)
    .action(async (requirements: string[], options) => {
      const tool = new RequirementsValidateTool();
      
      console.log(chalk.blue(`\n  Validating ${requirements.length} requirement(s)...\n`));

      const start = Date.now();
      const result = await tool.invoke({
        requirements: requirements.map((r, i) => ({
          id: `req-${i + 1}`,
          title: `Requirement ${i + 1}`,
          description: r,
          type: 'functional' as const,
        })),
        format: options.format,
        generateBDDScenarios: options.generateBdd,
        includeTestabilityScoring: options.testabilityScoring,
      }, options.streaming ? createStreamHandler() : {});

      console.log(chalk.gray(`  Duration: ${formatDuration(Date.now() - start)}`));
      printResult(result);
    });
}

// ============================================================================
// Code Intelligence Commands
// ============================================================================

export function registerCodeCommands(program: Command): void {
  const codeCmd = program
    .command('code')
    .description('Code intelligence with knowledge graph (MCP: qe/code/*)');

  // qe code analyze
  codeCmd
    .command('analyze')
    .description('Analyze code with knowledge graph (MCP: qe/code/analyze)')
    .argument('<action>', 'Action: index | search | impact | dependencies')
    .argument('[target]', 'Target path or query', '.')
    .option('--depth <level>', 'Analysis depth', '3')
    .option('--include-tests', 'Include test files', false)
    .option('--streaming', 'Enable streaming output', false)
    .action(async (action: string, target: string, options) => {
      const tool = new CodeAnalyzeTool();
      
      console.log(chalk.blue(`\n  Code analysis (${action}): ${target}...\n`));

      const start = Date.now();
      const result = await tool.invoke({
        action: action as 'index' | 'search' | 'impact' | 'dependencies',
        target,
        depth: parseInt(options.depth, 10),
        includeTests: options.includeTests,
      }, options.streaming ? createStreamHandler() : {});

      console.log(chalk.gray(`  Duration: ${formatDuration(Date.now() - start)}`));
      printResult(result);
    });
}

// ============================================================================
// Security Commands
// ============================================================================

export function registerSecurityCommands(program: Command): void {
  const securityCmd = program
    .command('security')
    .description('Security scanning and compliance (MCP: qe/security/*)');

  // qe security scan
  securityCmd
    .command('scan')
    .description('Run security scans (MCP: qe/security/scan)')
    .argument('[target]', 'Target directory or file', '.')
    .option('--sast', 'Run SAST scan', true)
    .option('--dast', 'Run DAST scan', false)
    .option('--dependencies', 'Scan dependencies', true)
    .option('--secrets', 'Detect secrets', true)
    .option('--compliance <frameworks>', 'Check compliance (comma-separated: owasp,gdpr,hipaa,soc2,pci)')
    .option('--severity <level>', 'Minimum severity to report (critical|high|medium|low)', 'medium')
    .option('--streaming', 'Enable streaming output', false)
    .option('--wizard', 'Run interactive security scan wizard')
    .action(async (target: string, options) => {
      let scanTarget = target;
      let sast = options.sast;
      let dast = options.dast;
      let dependencies = options.dependencies;
      let secrets = options.secrets;
      let complianceFrameworks = options.compliance?.split(',');
      let minSeverity = options.severity;

      // Run wizard if requested (ADR-041)
      if (options.wizard) {
        try {
          const wizardResult: SecurityWizardResult = await runSecurityScanWizard({
            defaultTarget: target !== '.' ? target : undefined,
            defaultScanTypes: undefined, // Use wizard defaults
            defaultSeverity: options.severity !== 'medium' ? options.severity : undefined,
          });

          if (wizardResult.cancelled) {
            console.log(chalk.yellow('\n  Security scan cancelled.\n'));
            process.exit(0);
          }

          // Use wizard results
          scanTarget = wizardResult.target;
          sast = wizardResult.scanTypes.includes('sast');
          dast = wizardResult.scanTypes.includes('dast');
          dependencies = wizardResult.scanTypes.includes('dependency');
          secrets = wizardResult.scanTypes.includes('secret');
          complianceFrameworks = wizardResult.complianceFrameworks.length > 0 ? wizardResult.complianceFrameworks : undefined;
          minSeverity = wizardResult.severity;

          console.log(chalk.green('\n  Starting security scan...\n'));
        } catch (err) {
          console.error(chalk.red('\n  Wizard error:'), err);
          process.exit(1);
        }
      }

      const tool = new SecurityScanTool();

      console.log(chalk.blue(`\n  Running security scan on: ${scanTarget}...\n`));

      const start = Date.now();
      const result = await tool.invoke({
        target: scanTarget,
        scanTypes: {
          sast,
          dast,
          dependencies,
          secrets,
        },
        complianceFrameworks,
        minSeverity,
      }, options.streaming ? createStreamHandler() : {});

      console.log(chalk.gray(`  Duration: ${formatDuration(Date.now() - start)}`));
      printResult(result);
    });
}

// ============================================================================
// Contract Testing Commands
// ============================================================================

export function registerContractCommands(program: Command): void {
  const contractCmd = program
    .command('contracts')
    .description('API contract testing (MCP: qe/contracts/*)');

  // qe contracts validate
  contractCmd
    .command('validate')
    .description('Validate API contracts (MCP: qe/contracts/validate)')
    .argument('[contract]', 'Contract file path')
    .option('-f, --format <format>', 'Contract format (openapi|pact|graphql|asyncapi)', 'openapi')
    .option('--provider <url>', 'Provider URL for verification')
    .option('--consumer <name>', 'Consumer name')
    .option('--baseline <version>', 'Baseline version for breaking change detection')
    .option('--check-breaking', 'Check for breaking changes', true)
    .option('--streaming', 'Enable streaming output', false)
    .action(async (contract: string | undefined, options) => {
      const tool = new ContractValidateTool();
      
      console.log(chalk.blue(`\n  Validating ${options.format} contract...\n`));

      const start = Date.now();
      const result = await tool.invoke({
        contractPath: contract,
        format: options.format,
        providerUrl: options.provider,
        consumerName: options.consumer,
        baselineVersion: options.baseline,
        checkBreakingChanges: options.checkBreaking,
      }, options.streaming ? createStreamHandler() : {});

      console.log(chalk.gray(`  Duration: ${formatDuration(Date.now() - start)}`));
      printResult(result);
    });
}

// ============================================================================
// Visual Testing Commands
// ============================================================================

export function registerVisualCommands(program: Command): void {
  const visualCmd = program
    .command('visual')
    .description('Visual regression testing (MCP: qe/visual/*)');

  // qe visual compare
  visualCmd
    .command('compare')
    .description('Compare visual snapshots (MCP: qe/visual/compare)')
    .argument('<baseline>', 'Baseline image or directory')
    .argument('<current>', 'Current image or directory')
    .option('--threshold <percent>', 'Difference threshold', '5')
    .option('--ignore-regions <regions>', 'Regions to ignore (JSON)')
    .option('--generate-diff', 'Generate diff images', true)
    .option('--streaming', 'Enable streaming output', false)
    .action(async (baseline: string, current: string, options) => {
      const tool = new VisualCompareTool();
      
      console.log(chalk.blue(`\n  Comparing visual snapshots...\n`));

      const start = Date.now();
      const result = await tool.invoke({
        urls: [baseline, current],
        baselineUrl: baseline,
        currentUrl: current,
        threshold: parseFloat(options.threshold),
        ignoreRegions: options.ignoreRegions ? parseJsonOption(options.ignoreRegions, 'ignoreRegions') : undefined,
        generateDiff: options.generateDiff,
      }, options.streaming ? createStreamHandler() : {});

      console.log(chalk.gray(`  Duration: ${formatDuration(Date.now() - start)}`));
      printResult(result);
    });
}

// ============================================================================
// Accessibility Commands
// ============================================================================

export function registerA11yCommands(program: Command): void {
  const a11yCmd = program
    .command('a11y')
    .description('Accessibility testing (MCP: qe/a11y/*)');

  // qe a11y audit
  a11yCmd
    .command('audit')
    .description('Run accessibility audit (MCP: qe/a11y/audit)')
    .argument('<target>', 'URL or HTML file to audit')
    .option('--standard <standard>', 'WCAG standard (wcag2a|wcag2aa|wcag2aaa|section508)', 'wcag2aa')
    .option('--include-passes', 'Include passing rules', false)
    .option('--include-inapplicable', 'Include inapplicable rules', false)
    .option('--streaming', 'Enable streaming output', false)
    .action(async (target: string, options) => {
      const tool = new A11yAuditTool();
      
      console.log(chalk.blue(`\n  Running accessibility audit on: ${target}...\n`));

      const start = Date.now();
      const result = await tool.invoke({
        urls: [target],
        standard: options.standard,
        includePasses: options.includePasses,
        includeInapplicable: options.includeInapplicable,
      }, options.streaming ? createStreamHandler() : {});

      console.log(chalk.gray(`  Duration: ${formatDuration(Date.now() - start)}`));
      printResult(result);
    });
}

// ============================================================================
// Chaos Engineering Commands
// ============================================================================

export function registerChaosCommands(program: Command): void {
  const chaosCmd = program
    .command('chaos')
    .description('Chaos engineering and resilience testing (MCP: qe/chaos/*)');

  // qe chaos inject
  chaosCmd
    .command('inject')
    .description('Inject faults for chaos testing (MCP: qe/chaos/inject)')
    .argument('<fault>', 'Fault type: latency|error|timeout|cpu-stress|memory-stress|network-partition|packet-loss|dns-failure|process-kill')
    .argument('<target>', 'Target service or endpoint')
    .option('-d, --duration <ms>', 'Fault duration in ms', '30000')
    .option('-i, --intensity <percent>', 'Fault intensity (0-100)', '50')
    .option('--dry-run', 'Simulate without actual injection', true)
    .option('--hypothesis <text>', 'Hypothesis to validate')
    .option('--rollback', 'Auto-rollback on failure', true)
    .option('--streaming', 'Enable streaming output', false)
    .action(async (fault: string, target: string, options) => {
      const tool = new ChaosInjectTool();
      
      const modeStr = options.dryRun ? chalk.yellow('[DRY RUN]') : chalk.red('[LIVE]');
      console.log(chalk.blue(`\n  ${modeStr} Injecting ${fault} fault on: ${target}...\n`));

      const start = Date.now();
      const result = await tool.invoke({
        faultType: fault as any,
        target,
        duration: parseInt(options.duration, 10),
        intensity: parseInt(options.intensity, 10),
        dryRun: options.dryRun,
        hypothesis: options.hypothesis,
        rollbackOnFailure: options.rollback,
      }, options.streaming ? createStreamHandler() : {});

      console.log(chalk.gray(`  Duration: ${formatDuration(Date.now() - start)}`));
      printResult(result);
    });
}

// ============================================================================
// Learning Commands
// ============================================================================

export function registerLearningCommands(program: Command): void {
  const learningCmd = program
    .command('learning')
    .description('Learning optimization and pattern management (MCP: qe/learning/*)');

  // qe learning optimize
  learningCmd
    .command('optimize')
    .description('Optimize learning and strategies (MCP: qe/learning/optimize)')
    .argument('<action>', 'Action: learn|optimize|transfer|patterns|dashboard')
    .option('-d, --domain <domain>', 'Source domain')
    .option('--target-domain <domain>', 'Target domain for transfer')
    .option('--metric <name>', 'Optimization metric')
    .option('--direction <dir>', 'Optimization direction (maximize|minimize)', 'maximize')
    .option('--experience-ids <ids>', 'Experience IDs to learn from (comma-separated)')
    .option('--streaming', 'Enable streaming output', false)
    .action(async (action: string, options) => {
      const tool = new LearningOptimizeTool();
      
      console.log(chalk.blue(`\n  Learning optimization (${action})...\n`));

      const start = Date.now();
      const result = await tool.invoke({
        action: action as any,
        domain: options.domain,
        targetDomain: options.targetDomain,
        experienceIds: options.experienceIds?.split(','),
        objective: options.metric ? {
          metric: options.metric,
          direction: options.direction,
        } : undefined,
      }, options.streaming ? createStreamHandler() : {});

      console.log(chalk.gray(`  Duration: ${formatDuration(Date.now() - start)}`));
      printResult(result);
    });
}

// ============================================================================
// Registration
// ============================================================================

/**
 * Register all QE MCP tool commands with a Commander program.
 *
 * @param program - Commander program instance
 */
export function registerQEToolCommands(program: Command): void {
  registerTestCommands(program);
  registerCoverageCommands(program);
  registerQualityCommands(program);
  registerDefectCommands(program);
  registerRequirementsCommands(program);
  registerCodeCommands(program);
  registerSecurityCommands(program);
  registerContractCommands(program);
  registerVisualCommands(program);
  registerA11yCommands(program);
  registerChaosCommands(program);
  registerLearningCommands(program);
}
