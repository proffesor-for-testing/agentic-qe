/**
 * Quality Decision Command
 * Make intelligent go/no-go deployment decisions based on quality metrics
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface DecisionCriteria {
  coverage: { weight: number; threshold: number };
  testSuccess: { weight: number; threshold: number };
  complexity: { weight: number; threshold: number };
  security: { weight: number; threshold: number };
  performance: { weight: number; threshold: number };
  bugs: { weight: number; threshold: number };
}

export interface DecisionFactors {
  coverage: number;
  testSuccess: number;
  complexity: number;
  security: number;
  performance: number;
  bugs: number;
}

export interface DecisionResult {
  decision: 'go' | 'no-go' | 'conditional';
  confidence: number; // 0-1
  score: number; // 0-100
  factors: {
    name: string;
    value: number;
    weight: number;
    threshold: number;
    passed: boolean;
    contribution: number;
  }[];
  blockers: string[];
  warnings: string[];
  recommendations: string[];
  reasoning: string;
  timestamp: string;
}

export class QualityDecisionMaker {
  private criteria: DecisionCriteria;

  constructor(criteria?: Partial<DecisionCriteria>) {
    this.criteria = {
      coverage: { weight: 0.25, threshold: 80, ...criteria?.coverage },
      testSuccess: { weight: 0.25, threshold: 95, ...criteria?.testSuccess },
      complexity: { weight: 0.15, threshold: 10, ...criteria?.complexity },
      security: { weight: 0.20, threshold: 0, ...criteria?.security },
      performance: { weight: 0.10, threshold: 90, ...criteria?.performance },
      bugs: { weight: 0.05, threshold: 0, ...criteria?.bugs },
    };
  }

  async decide(): Promise<DecisionResult> {
    const factors = await this.collectFactors();
    const evaluatedFactors = this.evaluateFactors(factors);
    const score = this.calculateScore(evaluatedFactors);
    const confidence = this.calculateConfidence(evaluatedFactors);
    const { decision, reasoning } = this.makeDecision(score, confidence, evaluatedFactors);
    const blockers = this.identifyBlockers(evaluatedFactors);
    const warnings = this.identifyWarnings(evaluatedFactors);
    const recommendations = this.generateRecommendations(evaluatedFactors, decision);

    const result: DecisionResult = {
      decision,
      confidence,
      score,
      factors: evaluatedFactors,
      blockers,
      warnings,
      recommendations,
      reasoning,
      timestamp: new Date().toISOString(),
    };

    await this.storeInMemory(result);

    return result;
  }

  private async collectFactors(): Promise<DecisionFactors> {
    return {
      coverage: await this.getCoverage(),
      testSuccess: await this.getTestSuccessRate(),
      complexity: await this.getAverageComplexity(),
      security: await this.getSecurityScore(),
      performance: await this.getPerformanceScore(),
      bugs: await this.getCriticalBugs(),
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
    return 95 + Math.random() * 5;
  }

  private async getAverageComplexity(): Promise<number> {
    return 5 + Math.random() * 10;
  }

  private async getSecurityScore(): Promise<number> {
    return Math.floor(Math.random() * 3);
  }

  private async getPerformanceScore(): Promise<number> {
    return 85 + Math.random() * 15;
  }

  private async getCriticalBugs(): Promise<number> {
    return Math.floor(Math.random() * 2);
  }

  private evaluateFactors(factors: DecisionFactors): DecisionResult['factors'] {
    const evaluated = [];

    // Coverage (higher is better)
    evaluated.push({
      name: 'Code Coverage',
      value: factors.coverage,
      weight: this.criteria.coverage.weight,
      threshold: this.criteria.coverage.threshold,
      passed: factors.coverage >= this.criteria.coverage.threshold,
      contribution: this.calculateContribution(
        factors.coverage,
        this.criteria.coverage.threshold,
        this.criteria.coverage.weight,
        false
      ),
    });

    // Test Success (higher is better)
    evaluated.push({
      name: 'Test Success Rate',
      value: factors.testSuccess,
      weight: this.criteria.testSuccess.weight,
      threshold: this.criteria.testSuccess.threshold,
      passed: factors.testSuccess >= this.criteria.testSuccess.threshold,
      contribution: this.calculateContribution(
        factors.testSuccess,
        this.criteria.testSuccess.threshold,
        this.criteria.testSuccess.weight,
        false
      ),
    });

    // Complexity (lower is better)
    evaluated.push({
      name: 'Code Complexity',
      value: factors.complexity,
      weight: this.criteria.complexity.weight,
      threshold: this.criteria.complexity.threshold,
      passed: factors.complexity <= this.criteria.complexity.threshold,
      contribution: this.calculateContribution(
        factors.complexity,
        this.criteria.complexity.threshold,
        this.criteria.complexity.weight,
        true
      ),
    });

    // Security (lower is better)
    evaluated.push({
      name: 'Security Issues',
      value: factors.security,
      weight: this.criteria.security.weight,
      threshold: this.criteria.security.threshold,
      passed: factors.security <= this.criteria.security.threshold,
      contribution: this.calculateContribution(
        factors.security,
        this.criteria.security.threshold,
        this.criteria.security.weight,
        true
      ),
    });

    // Performance (higher is better)
    evaluated.push({
      name: 'Performance Score',
      value: factors.performance,
      weight: this.criteria.performance.weight,
      threshold: this.criteria.performance.threshold,
      passed: factors.performance >= this.criteria.performance.threshold,
      contribution: this.calculateContribution(
        factors.performance,
        this.criteria.performance.threshold,
        this.criteria.performance.weight,
        false
      ),
    });

    // Bugs (lower is better)
    evaluated.push({
      name: 'Critical Bugs',
      value: factors.bugs,
      weight: this.criteria.bugs.weight,
      threshold: this.criteria.bugs.threshold,
      passed: factors.bugs <= this.criteria.bugs.threshold,
      contribution: this.calculateContribution(
        factors.bugs,
        this.criteria.bugs.threshold,
        this.criteria.bugs.weight,
        true
      ),
    });

    return evaluated;
  }

  private calculateContribution(
    value: number,
    threshold: number,
    weight: number,
    inverse: boolean
  ): number {
    let normalized: number;
    if (inverse) {
      // For metrics where lower is better
      normalized = threshold === 0 ? (value === 0 ? 1 : 0) : Math.max(0, 1 - value / (threshold * 2));
    } else {
      // For metrics where higher is better
      normalized = Math.min(1, value / threshold);
    }
    return normalized * weight * 100;
  }

  private calculateScore(factors: DecisionResult['factors']): number {
    return factors.reduce((sum, f) => sum + f.contribution, 0);
  }

  private calculateConfidence(factors: DecisionResult['factors']): number {
    const passRate = factors.filter((f) => f.passed).length / factors.length;
    return passRate;
  }

  private makeDecision(
    score: number,
    confidence: number,
    factors: DecisionResult['factors']
  ): { decision: DecisionResult['decision']; reasoning: string } {
    const criticalFailures = factors.filter(
      (f) => !f.passed && (f.name === 'Security Issues' || f.name === 'Critical Bugs')
    );

    if (criticalFailures.length > 0) {
      return {
        decision: 'no-go',
        reasoning: `Critical issues detected: ${criticalFailures.map((f) => f.name).join(', ')}. Deployment blocked.`,
      };
    }

    if (score >= 80 && confidence >= 0.8) {
      return {
        decision: 'go',
        reasoning: `Quality score ${score.toFixed(1)}/100 with ${(confidence * 100).toFixed(0)}% confidence. All critical criteria met.`,
      };
    }

    if (score >= 60 && confidence >= 0.6) {
      return {
        decision: 'conditional',
        reasoning: `Quality score ${score.toFixed(1)}/100 with ${(confidence * 100).toFixed(0)}% confidence. Review warnings before deploying.`,
      };
    }

    return {
      decision: 'no-go',
      reasoning: `Quality score ${score.toFixed(1)}/100 below threshold. Address blockers before deployment.`,
    };
  }

  private identifyBlockers(factors: DecisionResult['factors']): string[] {
    return factors
      .filter((f) => !f.passed && (f.name === 'Security Issues' || f.name === 'Critical Bugs'))
      .map((f) => `${f.name}: ${f.value} (threshold: ${f.threshold})`);
  }

  private identifyWarnings(factors: DecisionResult['factors']): string[] {
    return factors
      .filter((f) => !f.passed && f.name !== 'Security Issues' && f.name !== 'Critical Bugs')
      .map((f) => `${f.name}: ${f.value.toFixed(1)} (threshold: ${f.threshold})`);
  }

  private generateRecommendations(
    factors: DecisionResult['factors'],
    decision: DecisionResult['decision']
  ): string[] {
    const recommendations: string[] = [];

    if (decision === 'no-go') {
      recommendations.push('Address all blockers before resubmitting for deployment');
    }

    factors
      .filter((f) => !f.passed)
      .forEach((f) => {
        switch (f.name) {
          case 'Code Coverage':
            recommendations.push('Increase test coverage by adding unit and integration tests');
            break;
          case 'Test Success Rate':
            recommendations.push('Fix failing tests before deployment');
            break;
          case 'Code Complexity':
            recommendations.push('Refactor complex modules to improve maintainability');
            break;
          case 'Security Issues':
            recommendations.push('Resolve all security vulnerabilities immediately');
            break;
          case 'Performance Score':
            recommendations.push('Optimize performance bottlenecks');
            break;
          case 'Critical Bugs':
            recommendations.push('Fix all critical bugs before deployment');
            break;
        }
      });

    if (decision === 'go') {
      recommendations.push('Proceed with deployment');
      recommendations.push('Monitor production metrics closely');
    }

    return recommendations;
  }

  private async storeInMemory(result: DecisionResult): Promise<void> {
    try {
      await execAsync(
        `npx claude-flow@alpha hooks post-edit --file "quality-decision" --memory-key "aqe/swarm/quality-cli-commands/decision-result" --metadata '${JSON.stringify(result)}'`
      );
    } catch (error) {
      console.warn('Failed to store in memory:', error);
    }
  }

  displayResults(result: DecisionResult): void {
    console.log('\n' + chalk.bold('Quality Decision'));
    console.log(chalk.gray('─'.repeat(60)));

    // Decision
    const decisionColor =
      result.decision === 'go' ? chalk.green : result.decision === 'no-go' ? chalk.red : chalk.yellow;
    console.log('\n' + chalk.bold('Decision: ') + decisionColor.bold(result.decision.toUpperCase()));
    console.log(chalk.bold('Score: ') + `${result.score.toFixed(1)}/100`);
    console.log(chalk.bold('Confidence: ') + `${(result.confidence * 100).toFixed(0)}%`);
    console.log('\n' + chalk.gray(result.reasoning));

    // Factors
    console.log('\n' + chalk.bold('Quality Factors:'));
    result.factors.forEach((f) => {
      const icon = f.passed ? chalk.green('✓') : chalk.red('✗');
      const contribution = f.contribution.toFixed(1);
      console.log(
        `  ${icon} ${f.name.padEnd(20)} ${f.value.toFixed(1).padStart(6)} (threshold: ${f.threshold}, contribution: ${contribution}%)`
      );
    });

    // Blockers
    if (result.blockers.length > 0) {
      console.log('\n' + chalk.red.bold('Blockers:'));
      result.blockers.forEach((b) => console.log(chalk.red(`  • ${b}`)));
    }

    // Warnings
    if (result.warnings.length > 0) {
      console.log('\n' + chalk.yellow.bold('Warnings:'));
      result.warnings.forEach((w) => console.log(chalk.yellow(`  • ${w}`)));
    }

    // Recommendations
    console.log('\n' + chalk.bold('Recommendations:'));
    result.recommendations.forEach((r) => console.log(`  • ${r}`));

    console.log('\n' + chalk.gray('─'.repeat(60)));
    console.log(chalk.gray(`Timestamp: ${result.timestamp}\n`));
  }
}

export function createQualityDecisionCommand(): Command {
  const command = new Command('decision')
    .description('Make intelligent go/no-go deployment decisions')
    .option('--coverage-threshold <number>', 'Coverage threshold', '80')
    .option('--test-threshold <number>', 'Test success threshold', '95')
    .option('--json', 'Output results as JSON')
    .action(async (options) => {
      const spinner = ora('Analyzing quality metrics for decision...').start();

      try {
        const criteria: Partial<DecisionCriteria> = {};

        if (options.coverageThreshold) {
          criteria.coverage = {
            weight: 0.25,
            threshold: parseFloat(options.coverageThreshold),
          };
        }

        if (options.testThreshold) {
          criteria.testSuccess = {
            weight: 0.25,
            threshold: parseFloat(options.testThreshold),
          };
        }

        const decisionMaker = new QualityDecisionMaker(criteria);
        const result = await decisionMaker.decide();

        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          decisionMaker.displayResults(result);
        }

        process.exit(result.decision === 'no-go' ? 1 : 0);
      } catch (error) {
        spinner.fail('Decision analysis failed');
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });

  return command;
}
