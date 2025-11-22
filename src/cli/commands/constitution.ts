/**
 * Constitution CLI Commands
 *
 * Provides commands for managing and evaluating quality constitutions:
 * - validate: Validate constitution files against schema
 * - list: List all loaded constitutions
 * - show: Display details of a specific constitution
 * - evaluate: Evaluate files against constitution with agent voting
 *
 * @module cli/commands/constitution
 * @version 1.0.0
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs/promises';
import * as path from 'path';

import {
  ConstitutionLoader,
  getDefaultLoader,
  getBaseConstitutionsPath,
  listAvailableConstitutions
} from '../../constitution/loader';
import {
  Constitution,
  ValidationResult,
  RuleEvaluationResult
} from '../../constitution/schema';
import {
  IEvaluator,
  EvaluatorFactory,
  CheckResult,
  EvaluationContext
} from '../../constitution/evaluators/base';
import { VotingOrchestrator } from '../../voting/orchestrator';
import {
  VotingAgent,
  VotingTask,
  Vote,
  VotingResult as VotingSystemResult,
  VotingPanelConfig,
  AgentPool,
  VotingStrategy,
  AgentType
} from '../../voting/types';

/**
 * Output format types
 */
type OutputFormat = 'human' | 'json' | 'agent';

/**
 * Evaluation output structure
 */
interface EvaluationOutput {
  summary: {
    verdict: 'pass' | 'fail' | 'warning';
    constitutionId: string;
    filesEvaluated: number;
    totalRules: number;
    passedRules: number;
    failedRules: number;
    warnings: number;
  };
  findings: Finding[];
  agentVotes: AgentVote[];
  nextSteps?: string[];
}

interface Finding {
  file: string;
  rule: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  passed: boolean;
  actualValue?: unknown;
  remediation?: string;
}

interface AgentVote {
  agentId: string;
  agentType: AgentType;
  score: number;
  confidence: number;
  reasoning: string;
  timestamp: string;
}

/**
 * Validate constitution command
 */
export function createConstitutionValidateCommand(): Command {
  return new Command('validate')
    .description('Validate constitution file(s) against schema')
    .argument('[path]', 'Path to constitution file or directory', getBaseConstitutionsPath())
    .option('--strict', 'Strict validation mode')
    .option('--json', 'Output as JSON')
    .action(async (pathArg: string, options) => {
      const spinner = ora('Validating constitutions...').start();

      try {
        const loader = getDefaultLoader();
        const absolutePath = path.resolve(pathArg);
        const stats = await fs.stat(absolutePath);

        let results: Array<{ path: string; result: ValidationResult; constitution?: Constitution }> = [];

        if (stats.isDirectory()) {
          // Validate all constitutions in directory
          const files = await fs.readdir(absolutePath);
          const constitutionFiles = files.filter(f => f.endsWith('.constitution.json'));

          for (const file of constitutionFiles) {
            const filePath = path.join(absolutePath, file);
            try {
              const constitution = loader.loadConstitution(filePath, { validate: false });
              const result = loader.validateConstitution(constitution);
              results.push({ path: filePath, result, constitution });
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              results.push({
                path: filePath,
                result: {
                  valid: false,
                  errors: [{ path: '/', message: errorMessage, code: 'LOAD_ERROR' }],
                  warnings: []
                }
              });
            }
          }
        } else {
          // Validate single file
          const constitution = loader.loadConstitution(absolutePath, { validate: false });
          const result = loader.validateConstitution(constitution);
          results.push({ path: absolutePath, result, constitution });
        }

        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          displayValidationResults(results);
        }

        // Exit with error if any validation failed
        const hasErrors = results.some(r => !r.result.valid);
        process.exit(hasErrors ? 1 : 0);

      } catch (error) {
        spinner.fail('Validation failed');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}

/**
 * List constitutions command
 */
export function createConstitutionListCommand(): Command {
  return new Command('list')
    .description('List all available constitutions')
    .option('-d, --directory <path>', 'Constitution directory', getBaseConstitutionsPath())
    .option('--detailed', 'Show detailed information')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const loader = getDefaultLoader();
        const constitutions = loader.loadConstitutions(options.directory);

        if (options.json) {
          const constitutionArray = Array.from(constitutions.values());
          console.log(JSON.stringify(constitutionArray, null, 2));
        } else {
          displayConstitutionList(constitutions, options.detailed);
        }

      } catch (error) {
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}

/**
 * Show constitution details command
 */
export function createConstitutionShowCommand(): Command {
  return new Command('show')
    .description('Show detailed information about a constitution')
    .argument('<id>', 'Constitution ID or file path')
    .option('-d, --directory <path>', 'Constitution directory', getBaseConstitutionsPath())
    .option('--json', 'Output as JSON')
    .action(async (id: string, options) => {
      try {
        const loader = getDefaultLoader();
        let constitution: Constitution;

        // Try to load as file path first
        if (await fs.stat(id).catch(() => null)) {
          constitution = loader.loadConstitution(id);
        } else {
          // Load from directory by ID
          const constitutions = loader.loadConstitutions(options.directory);
          const found = constitutions.get(id);
          if (!found) {
            console.error(chalk.red(`Constitution not found: ${id}`));
            console.log(chalk.gray(`Available: ${Array.from(constitutions.keys()).join(', ')}`));
            process.exit(1);
          }
          constitution = found;
        }

        if (options.json) {
          console.log(JSON.stringify(constitution, null, 2));
        } else {
          displayConstitutionDetails(constitution);
        }

      } catch (error) {
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}

/**
 * Evaluate files against constitution command
 */
export function createConstitutionEvaluateCommand(): Command {
  return new Command('evaluate')
    .description('Evaluate file(s) against constitution with agent voting')
    .argument('<files...>', 'File(s) to evaluate')
    .option('--output <format>', 'Output format (human|json|agent)', 'human')
    .option('--min-agents <n>', 'Minimum voting agents', parseInt, 3)
    .option('--constitution <id>', 'Constitution ID or path', 'default')
    .option('--timeout <ms>', 'Vote timeout in milliseconds', parseInt, 30000)
    .action(async (files: string[], options) => {
      const spinner = ora('Evaluating files against constitution...').start();

      try {
        // Load constitution
        const loader = getDefaultLoader();
        let constitution: Constitution;

        if (await fs.stat(options.constitution).catch(() => null)) {
          constitution = loader.loadConstitution(options.constitution);
        } else {
          const constitutions = loader.loadConstitutions(getBaseConstitutionsPath());
          const found = constitutions.get(options.constitution);
          if (!found) {
            spinner.fail('Constitution not found');
            console.error(chalk.red(`Constitution not found: ${options.constitution}`));
            process.exit(1);
          }
          constitution = found;
        }

        spinner.text = 'Assembling voting panel...';

        // Create voting panel
        const panelConfig: VotingPanelConfig = {
          minPanelSize: options.minAgents,
          maxPanelSize: Math.max(options.minAgents + 2, 5),
          consensusMethod: 'weighted-average',
          timeoutMs: options.timeout,
          maxRetries: 2,
          retryDelayMs: 1000,
          parallelExecution: true
        };

        const pool = createAgentPool();
        const strategy = createVotingStrategy();
        const orchestrator = new VotingOrchestrator(pool, strategy, executeAgentVote);

        const panelResult = await orchestrator.assemblePanel(panelConfig);
        spinner.text = `Evaluating with ${panelResult.panel.length} agents...`;

        // Evaluate each file
        const findings: Finding[] = [];
        const allVotes: AgentVote[] = [];

        for (const filePath of files) {
          const absolutePath = path.resolve(filePath);
          const sourceCode = await fs.readFile(absolutePath, 'utf-8');
          const language = getLanguageFromExtension(path.extname(absolutePath));

          // Create evaluation context
          const context: EvaluationContext = {
            sourceCode,
            filePath: absolutePath,
            language,
            data: {}
          };

          // Create voting task for this file
          const task: VotingTask = {
            id: `eval-${Date.now()}-${path.basename(absolutePath)}`,
            type: 'constitution-evaluation',
            description: `Evaluate ${path.basename(absolutePath)} against ${constitution.id}`,
            context: {
              constitution: constitution.id,
              file: absolutePath,
              rules: constitution.rules.length
            },
            priority: 'high'
          };

          // Distribute and collect votes
          await orchestrator.distributeTask(task, panelResult.panel);
          const votes = await orchestrator.collectVotes(task.id, options.timeout);

          // Convert votes to agent votes
          votes.forEach(vote => {
            const agent = panelResult.panel.find(a => a.id === vote.agentId);
            if (agent) {
              allVotes.push({
                agentId: vote.agentId,
                agentType: agent.type,
                score: vote.score,
                confidence: vote.confidence,
                reasoning: vote.reasoning,
                timestamp: vote.timestamp.toISOString()
              });
            }
          });

          // Evaluate rules with evaluators
          const evaluators = getEvaluators();

          for (const rule of constitution.rules) {
            if (rule.enabled === false) continue;

            const evaluator = findEvaluatorForCondition(evaluators, rule.condition);
            if (!evaluator) {
              findings.push({
                file: absolutePath,
                rule: rule.id,
                severity: 'warning',
                message: `No evaluator available for rule ${rule.id}`,
                passed: true
              });
              continue;
            }

            const checkResult = await evaluator.evaluate(rule.condition, context);

            findings.push({
              file: absolutePath,
              rule: rule.id,
              severity: rule.severity,
              message: checkResult.message || rule.action.message,
              passed: checkResult.passed,
              actualValue: checkResult.actualValue,
              remediation: rule.remediation
            });
          }
        }

        spinner.stop();

        // Generate output
        const output: EvaluationOutput = {
          summary: {
            verdict: determineVerdict(findings),
            constitutionId: constitution.id,
            filesEvaluated: files.length,
            totalRules: constitution.rules.filter(r => r.enabled !== false).length,
            passedRules: findings.filter(f => f.passed).length,
            failedRules: findings.filter(f => !f.passed && f.severity === 'error').length,
            warnings: findings.filter(f => !f.passed && f.severity === 'warning').length
          },
          findings,
          agentVotes: allVotes,
          nextSteps: generateNextSteps(findings)
        };

        // Display output
        const format = options.output as OutputFormat;
        displayEvaluationOutput(output, format);

        // Exit with appropriate code
        process.exit(output.summary.verdict === 'fail' ? 1 : 0);

      } catch (error) {
        spinner.fail('Evaluation failed');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });
}

/**
 * Display validation results
 */
function displayValidationResults(
  results: Array<{ path: string; result: ValidationResult; constitution?: Constitution }>
): void {
  console.log(chalk.bold('\n📋 Constitution Validation Results\n'));

  for (const { path: filePath, result, constitution } of results) {
    const fileName = path.basename(filePath);

    if (result.valid) {
      console.log(chalk.green(`✓ ${fileName}`));
      if (constitution) {
        console.log(chalk.gray(`  ${constitution.name} v${constitution.version}`));
      }
    } else {
      console.log(chalk.red(`✗ ${fileName}`));

      if (result.errors.length > 0) {
        console.log(chalk.red('\n  Errors:'));
        result.errors.forEach(err => {
          console.log(chalk.red(`    • ${err.path}: ${err.message}`));
          if (err.expected) {
            console.log(chalk.gray(`      Expected: ${err.expected}`));
          }
        });
      }
    }

    if (result.warnings.length > 0) {
      console.log(chalk.yellow('\n  Warnings:'));
      result.warnings.forEach(warn => {
        console.log(chalk.yellow(`    • ${warn.path}: ${warn.message}`));
        if (warn.suggestion) {
          console.log(chalk.gray(`      Suggestion: ${warn.suggestion}`));
        }
      });
    }

    console.log('');
  }

  const totalValid = results.filter(r => r.result.valid).length;
  const totalInvalid = results.filter(r => !r.result.valid).length;

  console.log(chalk.bold('Summary:'));
  console.log(`  Valid: ${chalk.green(totalValid)}`);
  console.log(`  Invalid: ${chalk.red(totalInvalid)}`);
  console.log(`  Total: ${results.length}\n`);
}

/**
 * Display constitution list
 */
function displayConstitutionList(constitutions: Map<string, Constitution>, detailed: boolean): void {
  console.log(chalk.bold(`\n📚 Available Constitutions (${constitutions.size})\n`));

  for (const [id, constitution] of constitutions) {
    console.log(chalk.cyan(`${id}`) + chalk.gray(` (v${constitution.version})`));
    console.log(`  ${constitution.name}`);
    console.log(chalk.gray(`  ${constitution.description}`));

    if (detailed) {
      console.log(chalk.gray(`  Status: ${constitution.metadata.status}`));
      console.log(chalk.gray(`  Principles: ${constitution.principles.length}`));
      console.log(chalk.gray(`  Rules: ${constitution.rules.length}`));
      console.log(chalk.gray(`  Metrics: ${constitution.metrics.length}`));
      console.log(chalk.gray(`  Applicable to: ${constitution.metadata.applicableTo.join(', ')}`));
    }

    console.log('');
  }
}

/**
 * Display constitution details
 */
function displayConstitutionDetails(constitution: Constitution): void {
  console.log(chalk.bold(`\n📜 ${constitution.name}\n`));
  console.log(`ID: ${chalk.cyan(constitution.id)}`);
  console.log(`Version: ${chalk.cyan(constitution.version)}`);
  console.log(`Status: ${chalk.cyan(constitution.metadata.status)}`);
  console.log(`Description: ${constitution.description}`);
  console.log('');

  console.log(chalk.bold('Principles:'));
  constitution.principles.forEach(p => {
    const priorityColor = p.priority === 'critical' ? chalk.red :
                          p.priority === 'high' ? chalk.yellow : chalk.gray;
    console.log(`  ${priorityColor(p.priority.toUpperCase())} ${p.name}`);
    console.log(chalk.gray(`    ${p.description}`));
  });
  console.log('');

  console.log(chalk.bold('Rules:'));
  console.log(`  Total: ${constitution.rules.length}`);
  console.log(`  Enabled: ${constitution.rules.filter(r => r.enabled !== false).length}`);
  console.log(`  By severity:`);
  console.log(`    Error: ${constitution.rules.filter(r => r.severity === 'error').length}`);
  console.log(`    Warning: ${constitution.rules.filter(r => r.severity === 'warning').length}`);
  console.log(`    Info: ${constitution.rules.filter(r => r.severity === 'info').length}`);
  console.log('');

  console.log(chalk.bold('Metrics:'));
  constitution.metrics.forEach(m => {
    console.log(`  ${m.name} (${m.unit})`);
    if (m.targetValue !== undefined) {
      console.log(chalk.gray(`    Target: ${m.targetValue}`));
    }
  });
  console.log('');

  console.log(chalk.bold('Metadata:'));
  console.log(`  Author: ${constitution.metadata.author}`);
  console.log(`  Created: ${constitution.metadata.createdAt}`);
  console.log(`  Updated: ${constitution.metadata.updatedAt}`);
  console.log(`  Applicable to: ${constitution.metadata.applicableTo.join(', ')}`);
  console.log('');
}

/**
 * Display evaluation output
 */
function displayEvaluationOutput(output: EvaluationOutput, format: OutputFormat): void {
  if (format === 'json') {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  if (format === 'agent') {
    // Machine-readable format for agent consumption
    console.log(JSON.stringify({
      verdict: output.summary.verdict,
      constitution: output.summary.constitutionId,
      passed: output.summary.passedRules,
      failed: output.summary.failedRules,
      warnings: output.summary.warnings,
      nextSteps: output.nextSteps || [],
      votes: output.agentVotes.map(v => ({
        agent: v.agentId,
        score: v.score,
        confidence: v.confidence
      }))
    }));
    return;
  }

  // Human-readable format
  console.log(chalk.bold('\n🔍 Constitution Evaluation Results\n'));

  // Summary
  const verdictColor = output.summary.verdict === 'pass' ? chalk.green :
                       output.summary.verdict === 'fail' ? chalk.red : chalk.yellow;
  console.log(chalk.bold('Verdict: ') + verdictColor(output.summary.verdict.toUpperCase()));
  console.log(`Constitution: ${chalk.cyan(output.summary.constitutionId)}`);
  console.log(`Files Evaluated: ${output.summary.filesEvaluated}`);
  console.log(`Rules: ${chalk.green(output.summary.passedRules)} passed, ${chalk.red(output.summary.failedRules)} failed, ${chalk.yellow(output.summary.warnings)} warnings`);
  console.log('');

  // Findings
  if (output.findings.length > 0) {
    const errors = output.findings.filter(f => !f.passed && f.severity === 'error');
    const warnings = output.findings.filter(f => !f.passed && f.severity === 'warning');

    if (errors.length > 0) {
      console.log(chalk.red.bold('Errors:'));
      errors.forEach(f => {
        console.log(chalk.red(`  ✗ ${f.rule}: ${f.message}`));
        console.log(chalk.gray(`    File: ${f.file}`));
        if (f.actualValue !== undefined) {
          console.log(chalk.gray(`    Actual: ${JSON.stringify(f.actualValue)}`));
        }
        if (f.remediation) {
          console.log(chalk.gray(`    Fix: ${f.remediation}`));
        }
      });
      console.log('');
    }

    if (warnings.length > 0) {
      console.log(chalk.yellow.bold('Warnings:'));
      warnings.forEach(f => {
        console.log(chalk.yellow(`  ⚠ ${f.rule}: ${f.message}`));
        console.log(chalk.gray(`    File: ${f.file}`));
      });
      console.log('');
    }
  }

  // Agent votes
  if (output.agentVotes.length > 0) {
    console.log(chalk.bold('Agent Votes:'));
    output.agentVotes.forEach(v => {
      const scoreColor = v.score >= 0.7 ? chalk.green :
                        v.score >= 0.4 ? chalk.yellow : chalk.red;
      console.log(`  ${v.agentId} (${v.agentType}): ${scoreColor(v.score.toFixed(2))} confidence ${v.confidence.toFixed(2)}`);
      console.log(chalk.gray(`    ${v.reasoning}`));
    });
    console.log('');
  }

  // Next steps
  if (output.nextSteps && output.nextSteps.length > 0) {
    console.log(chalk.bold('Next Steps:'));
    output.nextSteps.forEach((step, i) => {
      console.log(`  ${i + 1}. ${step}`);
    });
    console.log('');
  }
}

/**
 * Helper functions
 */

function getEvaluators(): IEvaluator[] {
  const types = EvaluatorFactory.getTypes();
  return types.map(type => EvaluatorFactory.create(type)).filter((e): e is IEvaluator => e !== null);
}

function findEvaluatorForCondition(evaluators: IEvaluator[], condition: any): IEvaluator | null {
  return evaluators.find(e => e.canHandle(condition)) || null;
}

function getLanguageFromExtension(ext: string): string {
  const map: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.py': 'python',
    '.java': 'java',
    '.go': 'go',
    '.rs': 'rust',
    '.rb': 'ruby'
  };
  return map[ext] || 'unknown';
}

function determineVerdict(findings: Finding[]): 'pass' | 'fail' | 'warning' {
  const hasErrors = findings.some(f => !f.passed && f.severity === 'error');
  const hasWarnings = findings.some(f => !f.passed && f.severity === 'warning');

  if (hasErrors) return 'fail';
  if (hasWarnings) return 'warning';
  return 'pass';
}

function generateNextSteps(findings: Finding[]): string[] {
  const steps: string[] = [];
  const errors = findings.filter(f => !f.passed && f.severity === 'error');
  const warnings = findings.filter(f => !f.passed && f.severity === 'warning');

  if (errors.length > 0) {
    steps.push(`Fix ${errors.length} critical error${errors.length > 1 ? 's' : ''}`);
    errors.forEach(e => {
      if (e.remediation) {
        steps.push(`  - ${e.rule}: ${e.remediation}`);
      }
    });
  }

  if (warnings.length > 0) {
    steps.push(`Address ${warnings.length} warning${warnings.length > 1 ? 's' : ''} to improve quality`);
  }

  if (errors.length === 0 && warnings.length === 0) {
    steps.push('All checks passed - ready for next stage');
  }

  return steps;
}

/**
 * Create agent pool for voting
 */
function createAgentPool(): AgentPool {
  const agents: VotingAgent[] = [
    { id: 'test-gen-1', type: 'test-generator', expertise: ['unit-testing', 'integration'], weight: 1.0 },
    { id: 'coverage-1', type: 'coverage-analyzer', expertise: ['code-coverage', 'gap-analysis'], weight: 1.2 },
    { id: 'quality-gate-1', type: 'quality-gate', expertise: ['quality-metrics', 'thresholds'], weight: 1.5 },
    { id: 'security-1', type: 'security-scanner', expertise: ['security', 'vulnerabilities'], weight: 1.3 },
    { id: 'performance-1', type: 'performance-tester', expertise: ['performance', 'benchmarks'], weight: 1.1 }
  ];

  const pool: AgentPool = {
    available: [...agents],
    busy: new Map(),
    failed: new Set(),

    getAvailable(expertise?: string[]) {
      return this.available.filter(a => {
        if (this.busy.has(a.id) || this.failed.has(a.id)) return false;
        if (!expertise || expertise.length === 0) return true;
        return expertise.some(e => a.expertise.includes(e));
      });
    },

    reserve(agentId: string, task: VotingTask) {
      this.busy.set(agentId, task);
    },

    release(agentId: string) {
      this.busy.delete(agentId);
    },

    markFailed(agentId: string) {
      this.failed.add(agentId);
      this.busy.delete(agentId);
    },

    restore(agentId: string) {
      this.failed.delete(agentId);
    }
  };

  return pool;
}

/**
 * Create voting strategy
 */
function createVotingStrategy(): VotingStrategy {
  return {
    selectAgents(pool: AgentPool, task: VotingTask, config: VotingPanelConfig) {
      const available = pool.getAvailable(task.requiredExpertise);
      const selected = available.slice(0, config.maxPanelSize);
      return selected;
    },

    calculateWeight(agent: VotingAgent, task: VotingTask) {
      // Calculate weight based on expertise match
      const expertiseMatch = task.requiredExpertise
        ? task.requiredExpertise.filter(e => agent.expertise.includes(e)).length / task.requiredExpertise.length
        : 1.0;
      return agent.weight * (0.5 + expertiseMatch * 0.5);
    },

    shouldRetry(agent: VotingAgent, task: VotingTask, attempt: number, error?: Error) {
      return attempt <= 2; // Max 2 retries
    },

    adjustTimeout(baseTimeout: number, attempt: number, systemLoad: number) {
      return baseTimeout * (1 + attempt * 0.5) * (1 + systemLoad * 0.3);
    }
  };
}

/**
 * Execute agent vote (mock implementation for CLI)
 */
async function executeAgentVote(agent: VotingAgent, task: VotingTask): Promise<Vote> {
  // Simulate agent evaluation
  await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 500));

  // Generate score based on agent expertise match
  const expertiseMatch = task.requiredExpertise
    ? task.requiredExpertise.filter(e => agent.expertise.includes(e)).length / task.requiredExpertise.length
    : 1.0;

  const score = 0.5 + (expertiseMatch * 0.3) + (Math.random() * 0.2);
  const confidence = 0.7 + (Math.random() * 0.3);

  return {
    agentId: agent.id,
    taskId: task.id,
    score: Math.min(1.0, score),
    confidence: Math.min(1.0, confidence),
    reasoning: `Evaluated based on ${agent.expertise.join(', ')} expertise`,
    timestamp: new Date(),
    metadata: { agentType: agent.type, weight: agent.weight }
  };
}

/**
 * Create main constitution command
 */
export function createConstitutionCommand(): Command {
  const command = new Command('constitution')
    .description('Manage and evaluate quality constitutions');

  command.addCommand(createConstitutionValidateCommand());
  command.addCommand(createConstitutionListCommand());
  command.addCommand(createConstitutionShowCommand());
  command.addCommand(createConstitutionEvaluateCommand());

  return command;
}
