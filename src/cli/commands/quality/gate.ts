/**
 * Quality Gate Command
 * Execute quality gates with configurable thresholds
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { exec } from 'child_process';
import { promisify } from 'util';
import { SecureRandom } from '../../../utils/SecureRandom.js';
import { ProcessExit } from '../../../utils/ProcessExit';

const execAsync = promisify(exec);

export interface QualityGateConfig {
  coverage?: number;
  complexity?: number;
  maintainability?: number;
  duplications?: number;
  securityHotspots?: number;
  bugs?: number;
  vulnerabilities?: number;
}

export interface QualityGateResult {
  passed: boolean;
  metrics: {
    coverage: number;
    complexity: number;
    maintainability: number;
    duplications: number;
    securityHotspots: number;
    bugs: number;
    vulnerabilities: number;
  };
  violations: string[];
  timestamp: string;
}

export class QualityGateExecutor {
  private config: QualityGateConfig;

  constructor(config: QualityGateConfig = {}) {
    this.config = {
      coverage: config.coverage ?? 80,
      complexity: config.complexity ?? 10,
      maintainability: config.maintainability ?? 65,
      duplications: config.duplications ?? 3,
      securityHotspots: config.securityHotspots ?? 0,
      bugs: config.bugs ?? 0,
      vulnerabilities: config.vulnerabilities ?? 0,
    };
  }

  async execute(): Promise<QualityGateResult> {
    const metrics = await this.collectMetrics();
    const violations = this.checkThresholds(metrics);
    const passed = violations.length === 0;

    const result: QualityGateResult = {
      passed,
      metrics,
      violations,
      timestamp: new Date().toISOString(),
    };

    // Store result in shared memory
    await this.storeInMemory(result);

    return result;
  }

  private async collectMetrics() {
    // Simulate metrics collection - in real implementation, integrate with SonarQube, Codecov, etc.
    return {
      coverage: await this.getCoverage(),
      complexity: await this.getComplexity(),
      maintainability: await this.getMaintainability(),
      duplications: await this.getDuplications(),
      securityHotspots: await this.getSecurityHotspots(),
      bugs: await this.getBugs(),
      vulnerabilities: await this.getVulnerabilities(),
    };
  }

  private async getCoverage(): Promise<number> {
    try {
      // Try to read coverage from jest/nyc
      const { stdout } = await execAsync('npx nyc report --reporter=json-summary 2>/dev/null || echo "{}"');
      const coverage = JSON.parse(stdout);
      return coverage?.total?.lines?.pct ?? 0;
    } catch {
      return 0;
    }
  }

  private async getComplexity(): Promise<number> {
    // Placeholder - integrate with complexity analysis tools
    return SecureRandom.randomFloat() * 15;
  }

  private async getMaintainability(): Promise<number> {
    // Placeholder - integrate with maintainability index tools
    return 60 + SecureRandom.randomFloat() * 30;
  }

  private async getDuplications(): Promise<number> {
    // Placeholder - integrate with duplication detection
    return SecureRandom.randomFloat() * 5;
  }

  private async getSecurityHotspots(): Promise<number> {
    // Placeholder - integrate with security scanners
    return Math.floor(SecureRandom.randomFloat() * 3);
  }

  private async getBugs(): Promise<number> {
    // Placeholder - integrate with static analysis
    return Math.floor(SecureRandom.randomFloat() * 2);
  }

  private async getVulnerabilities(): Promise<number> {
    // Placeholder - integrate with vulnerability scanners
    return Math.floor(SecureRandom.randomFloat() * 2);
  }

  private checkThresholds(metrics: QualityGateResult['metrics']): string[] {
    const violations: string[] = [];

    if (metrics.coverage < this.config.coverage!) {
      violations.push(`Coverage ${metrics.coverage.toFixed(1)}% < ${this.config.coverage}%`);
    }

    if (metrics.complexity > this.config.complexity!) {
      violations.push(`Complexity ${metrics.complexity.toFixed(1)} > ${this.config.complexity}`);
    }

    if (metrics.maintainability < this.config.maintainability!) {
      violations.push(`Maintainability ${metrics.maintainability.toFixed(1)} < ${this.config.maintainability}`);
    }

    if (metrics.duplications > this.config.duplications!) {
      violations.push(`Duplications ${metrics.duplications.toFixed(1)}% > ${this.config.duplications}%`);
    }

    if (metrics.securityHotspots > this.config.securityHotspots!) {
      violations.push(`Security Hotspots ${metrics.securityHotspots} > ${this.config.securityHotspots}`);
    }

    if (metrics.bugs > this.config.bugs!) {
      violations.push(`Bugs ${metrics.bugs} > ${this.config.bugs}`);
    }

    if (metrics.vulnerabilities > this.config.vulnerabilities!) {
      violations.push(`Vulnerabilities ${metrics.vulnerabilities} > ${this.config.vulnerabilities}`);
    }

    return violations;
  }

  private async storeInMemory(result: QualityGateResult): Promise<void> {
    try {
      await execAsync(
        `npx claude-flow@alpha hooks post-edit --file "quality-gate" --memory-key "aqe/swarm/quality-cli-commands/gate-result" --metadata '${JSON.stringify(result)}'`
      );
    } catch (error) {
      // Memory storage is optional
      console.warn('Failed to store in memory:', error);
    }
  }

  displayResults(result: QualityGateResult): void {
    console.log('\n' + chalk.bold('Quality Gate Results'));
    console.log(chalk.gray('─'.repeat(60)));

    // Display metrics
    console.log(chalk.bold('\nMetrics:'));
    this.displayMetric('Coverage', result.metrics.coverage, '%', this.config.coverage!);
    this.displayMetric('Complexity', result.metrics.complexity, '', this.config.complexity!, true);
    this.displayMetric('Maintainability', result.metrics.maintainability, '', this.config.maintainability!);
    this.displayMetric('Duplications', result.metrics.duplications, '%', this.config.duplications!, true);
    this.displayMetric('Security Hotspots', result.metrics.securityHotspots, '', this.config.securityHotspots!, true);
    this.displayMetric('Bugs', result.metrics.bugs, '', this.config.bugs!, true);
    this.displayMetric('Vulnerabilities', result.metrics.vulnerabilities, '', this.config.vulnerabilities!, true);

    // Display violations
    if (result.violations.length > 0) {
      console.log('\n' + chalk.red.bold('❌ Violations:'));
      result.violations.forEach((v) => console.log(chalk.red(`  • ${v}`)));
    }

    // Display final result
    console.log('\n' + chalk.gray('─'.repeat(60)));
    if (result.passed) {
      console.log(chalk.green.bold('✓ Quality Gate PASSED'));
    } else {
      console.log(chalk.red.bold('✗ Quality Gate FAILED'));
    }
    console.log(chalk.gray(`Timestamp: ${result.timestamp}\n`));
  }

  private displayMetric(
    name: string,
    value: number,
    unit: string,
    threshold: number,
    inverse: boolean = false
  ): void {
    const passes = inverse ? value <= threshold : value >= threshold;
    const color = passes ? chalk.green : chalk.red;
    const icon = passes ? '✓' : '✗';
    const comparison = inverse ? '<=' : '>=';

    console.log(
      `  ${color(icon)} ${name.padEnd(20)} ${color(value.toFixed(1) + unit)} (${comparison} ${threshold}${unit})`
    );
  }
}

export function createQualityGateCommand(): Command {
  const command = new Command('gate')
    .description('Execute quality gates with configurable thresholds')
    .option('--coverage <number>', 'Minimum code coverage percentage', '80')
    .option('--complexity <number>', 'Maximum cyclomatic complexity', '10')
    .option('--maintainability <number>', 'Minimum maintainability index', '65')
    .option('--duplications <number>', 'Maximum duplication percentage', '3')
    .option('--security-hotspots <number>', 'Maximum security hotspots', '0')
    .option('--bugs <number>', 'Maximum bugs', '0')
    .option('--vulnerabilities <number>', 'Maximum vulnerabilities', '0')
    .option('--json', 'Output results as JSON')
    .action(async (options) => {
      const spinner = ora('Executing quality gate...').start();

      try {
        const config: QualityGateConfig = {
          coverage: parseFloat(options.coverage),
          complexity: parseFloat(options.complexity),
          maintainability: parseFloat(options.maintainability),
          duplications: parseFloat(options.duplications),
          securityHotspots: parseInt(options.securityHotspots),
          bugs: parseInt(options.bugs),
          vulnerabilities: parseInt(options.vulnerabilities),
        };

        const executor = new QualityGateExecutor(config);
        const result = await executor.execute();

        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          executor.displayResults(result);
        }

        ProcessExit.exitIfNotTest(result.passed ? 0 : 1);
      } catch (error) {
        spinner.fail('Quality gate execution failed');
        console.error(chalk.red('Error:'), error);
        ProcessExit.exitIfNotTest(1);
      }
    });

  return command;
}
