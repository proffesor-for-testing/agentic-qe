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
// MCPToolContext import removed - not needed for CLI wrapper

// ============================================================================
// Shared Helpers
// ============================================================================

interface StreamData {
  message?: string;
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
    .argument('<files...>', 'Source files to generate tests for')
    .option('-t, --type <type>', 'Test type (unit|integration|e2e|property|contract)', 'unit')
    .option('-f, --framework <framework>', 'Test framework (jest|vitest|mocha|playwright)', 'vitest')
    .option('-l, --language <lang>', 'Programming language (typescript|javascript|python)', 'typescript')
    .option('-c, --coverage <target>', 'Coverage target percentage', '80')
    .option('--patterns <patterns>', 'Include patterns (comma-separated)')
    .option('--anti-patterns', 'Detect anti-patterns', false)
    .option('--streaming', 'Enable streaming output', false)
    .action(async (files: string[], options) => {
      const tool = new TestGenerateTool();
      
      console.log(chalk.blue(`\n  Generating ${options.type} tests for ${files.length} file(s)...\n`));

      const start = Date.now();
      const result = await tool.invoke({
        sourceFiles: files,
        testType: options.type,
        framework: options.framework,
        language: options.language,
        coverageTarget: parseInt(options.coverage, 10),
        includePatterns: options.patterns?.split(','),
        detectAntiPatterns: options.antiPatterns,
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
    .action(async (pattern: string, options) => {
      const tool = new TestExecuteTool();
      
      console.log(chalk.blue(`\n  Executing tests matching: ${pattern}...\n`));

      const start = Date.now();
      const result = await tool.invoke({
        testPattern: pattern,
        framework: options.framework,
        parallel: options.parallel ? true : false,
        parallelWorkers: parseInt(options.parallel, 10) || undefined,
        retries: parseInt(options.retries, 10),
        collectCoverage: options.coverage,
        flakyDetection: options.flakyDetection,
        failFast: options.failFast,
      }, options.streaming ? createStreamHandler() : {});

      console.log(chalk.gray(`  Duration: ${formatDuration(Date.now() - start)}`));
      printResult(result);
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
    .option('--streaming', 'Enable streaming output', false)
    .action(async (target: string, options) => {
      const tool = new CoverageAnalyzeTool();
      
      console.log(chalk.blue(`\n  Analyzing coverage for: ${target}...\n`));

      const start = Date.now();
      const result = await tool.invoke({
        target,
        includePatterns: options.include?.split(','),
        excludePatterns: options.exclude?.split(','),
        threshold: parseInt(options.threshold, 10),
        includeRiskScoring: options.riskScoring,
      }, options.streaming ? createStreamHandler() : {});

      console.log(chalk.gray(`  Duration: ${formatDuration(Date.now() - start)}`));
      printResult(result);
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
    .action(async (target: string, options) => {
      const tool = new SecurityScanTool();
      
      console.log(chalk.blue(`\n  Running security scan on: ${target}...\n`));

      const start = Date.now();
      const result = await tool.invoke({
        target,
        scanTypes: {
          sast: options.sast,
          dast: options.dast,
          dependencies: options.dependencies,
          secrets: options.secrets,
        },
        complianceFrameworks: options.compliance?.split(','),
        minSeverity: options.severity,
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
        ignoreRegions: options.ignoreRegions ? JSON.parse(options.ignoreRegions) : undefined,
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
