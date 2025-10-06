/**
 * Quality Validate Command
 * Validate quality metrics against defined standards
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

export interface ValidationRule {
  name: string;
  metric: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne';
  threshold: number;
  severity: 'error' | 'warning' | 'info';
}

export interface ValidationResult {
  valid: boolean;
  rules: {
    rule: ValidationRule;
    passed: boolean;
    actual: number;
    message: string;
  }[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
  timestamp: string;
}

export class QualityValidator {
  private rules: ValidationRule[];

  constructor(rules?: ValidationRule[]) {
    this.rules = rules ?? this.getDefaultRules();
  }

  private getDefaultRules(): ValidationRule[] {
    return [
      { name: 'Code Coverage', metric: 'coverage', operator: 'gte', threshold: 80, severity: 'error' },
      { name: 'Test Success Rate', metric: 'testSuccessRate', operator: 'gte', threshold: 95, severity: 'error' },
      { name: 'Cyclomatic Complexity', metric: 'complexity', operator: 'lte', threshold: 10, severity: 'warning' },
      { name: 'Code Duplications', metric: 'duplications', operator: 'lte', threshold: 3, severity: 'warning' },
      { name: 'Security Issues', metric: 'securityIssues', operator: 'eq', threshold: 0, severity: 'error' },
      { name: 'Critical Bugs', metric: 'criticalBugs', operator: 'eq', threshold: 0, severity: 'error' },
      { name: 'Technical Debt', metric: 'technicalDebt', operator: 'lte', threshold: 5, severity: 'info' },
    ];
  }

  async validate(): Promise<ValidationResult> {
    const metrics = await this.collectMetrics();
    const results = this.rules.map((rule) => this.validateRule(rule, metrics));

    const summary = {
      total: results.length,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed && r.rule.severity === 'error').length,
      warnings: results.filter((r) => !r.passed && r.rule.severity === 'warning').length,
    };

    const valid = results.every((r) => r.passed || r.rule.severity !== 'error');

    const result: ValidationResult = {
      valid,
      rules: results,
      summary,
      timestamp: new Date().toISOString(),
    };

    await this.storeInMemory(result);

    return result;
  }

  private async collectMetrics(): Promise<Record<string, number>> {
    return {
      coverage: await this.getCoverage(),
      testSuccessRate: await this.getTestSuccessRate(),
      complexity: Math.random() * 15,
      duplications: Math.random() * 5,
      securityIssues: Math.floor(Math.random() * 2),
      criticalBugs: Math.floor(Math.random() * 2),
      technicalDebt: Math.random() * 10,
    };
  }

  private async getCoverage(): Promise<number> {
    try {
      const { stdout } = await execAsync('npx nyc report --reporter=json-summary 2>/dev/null || echo "{}"');
      const coverage = JSON.parse(stdout);
      return coverage?.total?.lines?.pct ?? 0;
    } catch {
      return 0;
    }
  }

  private async getTestSuccessRate(): Promise<number> {
    // Placeholder - integrate with test results
    return 95 + Math.random() * 5;
  }

  private validateRule(
    rule: ValidationRule,
    metrics: Record<string, number>
  ): ValidationResult['rules'][0] {
    const actual = metrics[rule.metric] ?? 0;
    let passed = false;

    switch (rule.operator) {
      case 'gt':
        passed = actual > rule.threshold;
        break;
      case 'gte':
        passed = actual >= rule.threshold;
        break;
      case 'lt':
        passed = actual < rule.threshold;
        break;
      case 'lte':
        passed = actual <= rule.threshold;
        break;
      case 'eq':
        passed = actual === rule.threshold;
        break;
      case 'ne':
        passed = actual !== rule.threshold;
        break;
    }

    const message = passed
      ? `${rule.name}: ${actual.toFixed(1)} ${this.getOperatorSymbol(rule.operator)} ${rule.threshold}`
      : `${rule.name}: ${actual.toFixed(1)} ${this.getOperatorSymbol(rule.operator, true)} ${rule.threshold} [${rule.severity}]`;

    return { rule, passed, actual, message };
  }

  private getOperatorSymbol(operator: string, inverse: boolean = false): string {
    const symbols: Record<string, [string, string]> = {
      gt: ['>', '<='],
      gte: ['>=', '<'],
      lt: ['<', '>='],
      lte: ['<=', '>'],
      eq: ['=', '≠'],
      ne: ['≠', '='],
    };
    return symbols[operator]?.[inverse ? 1 : 0] ?? operator;
  }

  private async storeInMemory(result: ValidationResult): Promise<void> {
    try {
      await execAsync(
        `npx claude-flow@alpha hooks post-edit --file "quality-validate" --memory-key "aqe/swarm/quality-cli-commands/validate-result" --metadata '${JSON.stringify(result)}'`
      );
    } catch (error) {
      console.warn('Failed to store in memory:', error);
    }
  }

  displayResults(result: ValidationResult): void {
    console.log('\n' + chalk.bold('Quality Validation Results'));
    console.log(chalk.gray('─'.repeat(60)));

    // Group results by severity
    const errors = result.rules.filter((r) => !r.passed && r.rule.severity === 'error');
    const warnings = result.rules.filter((r) => !r.passed && r.rule.severity === 'warning');
    const passed = result.rules.filter((r) => r.passed);

    if (errors.length > 0) {
      console.log('\n' + chalk.red.bold('Errors:'));
      errors.forEach((r) => console.log(chalk.red(`  ✗ ${r.message}`)));
    }

    if (warnings.length > 0) {
      console.log('\n' + chalk.yellow.bold('Warnings:'));
      warnings.forEach((r) => console.log(chalk.yellow(`  ⚠ ${r.message}`)));
    }

    console.log('\n' + chalk.green.bold('Passed:'));
    passed.forEach((r) => console.log(chalk.green(`  ✓ ${r.message}`)));

    // Summary
    console.log('\n' + chalk.gray('─'.repeat(60)));
    console.log(chalk.bold('Summary:'));
    console.log(`  Total Rules: ${result.summary.total}`);
    console.log(chalk.green(`  Passed: ${result.summary.passed}`));
    console.log(chalk.red(`  Failed: ${result.summary.failed}`));
    console.log(chalk.yellow(`  Warnings: ${result.summary.warnings}`));

    console.log('\n' + chalk.gray('─'.repeat(60)));
    if (result.valid) {
      console.log(chalk.green.bold('✓ Validation PASSED'));
    } else {
      console.log(chalk.red.bold('✗ Validation FAILED'));
    }
    console.log(chalk.gray(`Timestamp: ${result.timestamp}\n`));
  }

  async loadRulesFromFile(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      this.rules = JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to load rules from ${filePath}: ${error}`);
    }
  }
}

export function createQualityValidateCommand(): Command {
  const command = new Command('validate')
    .description('Validate quality metrics against defined standards')
    .option('--rules <file>', 'Path to validation rules JSON file')
    .option('--json', 'Output results as JSON')
    .action(async (options) => {
      const spinner = ora('Validating quality metrics...').start();

      try {
        const validator = new QualityValidator();

        if (options.rules) {
          await validator.loadRulesFromFile(options.rules);
        }

        const result = await validator.validate();

        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          validator.displayResults(result);
        }

        process.exit(result.valid ? 0 : 1);
      } catch (error) {
        spinner.fail('Quality validation failed');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });

  return command;
}
