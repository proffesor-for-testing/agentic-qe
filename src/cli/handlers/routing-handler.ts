/**
 * Agentic QE v3 - Routing Command Handler
 * Imp-18: Economic Routing Model CLI Integration
 *
 * Handles the 'aqe routing' command with subcommands:
 *   economics, accuracy, metrics
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { ICommandHandler, CLIContext } from './interfaces.js';
import { toErrorMessage } from '../../shared/error-utils.js';
import { createRoutingFeedbackCollector } from '../../routing/routing-feedback.js';
import { getGlobalCostTracker } from '../../shared/llm/cost-tracker.js';
import { parseTaskComplexity } from '../../routing/economic-routing.js';

// ============================================================================
// Routing Handler
// ============================================================================

export class RoutingHandler implements ICommandHandler {
  readonly name = 'routing';
  readonly description = 'View routing performance, economics, and accuracy';

  private cleanupAndExit: (code: number) => Promise<never>;

  constructor(cleanupAndExit: (code: number) => Promise<never>) {
    this.cleanupAndExit = cleanupAndExit;
  }

  getHelp(): string {
    return [
      'aqe routing economics [--complexity <0-1>] [--json]  Show tier efficiency & budget',
      'aqe routing accuracy [--json]                        Show routing accuracy analysis',
      'aqe routing metrics [--json]                         Show per-agent performance',
    ].join('\n');
  }

  register(program: Command, _context: CLIContext): void {
    const routing = program
      .command('routing')
      .description(this.description);

    routing
      .command('economics')
      .description('Show economic routing report: tier efficiency, budget, savings')
      .option('-c, --complexity <value>', 'Task complexity for scoring (0-1)', '0.5')
      .option('--json', 'Output as JSON')
      .action(async (options: { complexity: string; json?: boolean }) => {
        // #1481: `|| 0.5` turned an explicit 0 into 0.5, and Number() took
        // "" or "0x1". Parse strictly with the same rule as the MCP tool.
        const parsed = parseTaskComplexity(options.complexity);
        if (!parsed.ok) {
          console.error(chalk.red(`\n  --complexity: ${parsed.error}\n`));
          await this.cleanupAndExit(1);
          return;
        }
        await this.executeEconomics(parsed.value, !!options.json);
      });

    routing
      .command('accuracy')
      .description('Show routing accuracy analysis')
      .option('--json', 'Output as JSON')
      .action(async (options: { json?: boolean }) => {
        await this.executeAccuracy(!!options.json);
      });

    routing
      .command('metrics')
      .description('Show per-agent performance metrics')
      .option('--json', 'Output as JSON')
      .action(async (options: { json?: boolean }) => {
        await this.executeMetrics(!!options.json);
      });
  }

  // --------------------------------------------------------------------------
  // Economics
  // --------------------------------------------------------------------------

  private async executeEconomics(complexity: number, json: boolean): Promise<void> {
    try {
      const collector = createRoutingFeedbackCollector(100);
      await collector.initialize();
      collector.enableEconomicRouting({}, getGlobalCostTracker());

      // #1481: the report (and its JSON form) is scored for --complexity.
      const report = collector.getEconomicReport(complexity);
      if (!report) {
        console.error(chalk.red('\n  Economic routing is not available.\n'));
        await this.cleanupAndExit(1);
        return;
      }

      if (json) {
        console.log(JSON.stringify(
          { taskComplexity: complexity, ...report },
          (_k, v) => (v === Infinity ? 'Infinity' : v),
          2,
        ));
        await this.cleanupAndExit(0);
        return;
      }

      console.log(chalk.blue('\n  Economic Routing Report'));
      console.log(chalk.gray('  ' + '\u2500'.repeat(50)));

      // Tier efficiency table
      console.log(chalk.white('\n  Tier Efficiency (complexity=' + complexity.toFixed(1) + '):\n'));
      console.log(chalk.gray('  Tier       Quality  Cost/Task    Q/$       Score'));
      console.log(chalk.gray('  ' + '\u2500'.repeat(50)));

      const scores = report.tierEfficiency;
      for (const s of scores) {
        const qpd = isFinite(s.qualityPerDollar) ? s.qualityPerDollar.toFixed(1) : '\u221E';
        console.log(
          `  ${padRight(s.tier, 10)}` +
          `${chalk.cyan(s.qualityScore.toFixed(2))}    ` +
          `$${s.estimatedCostUsd.toFixed(4)}    ` +
          `${chalk.yellow(padLeft(qpd, 8))}  ` +
          `${scoreColor(s.economicScore)}`,
        );
      }

      // Budget
      console.log(chalk.white('\n  Budget:'));
      console.log(`  Hourly cost:  $${report.currentHourlyCostUsd.toFixed(4)}`);
      console.log(`  Daily cost:   $${report.currentDailyCostUsd.toFixed(4)}`);
      if (report.budgetRemaining.hourly !== null) {
        console.log(`  Hourly left:  $${report.budgetRemaining.hourly.toFixed(4)}`);
      }
      if (report.budgetRemaining.daily !== null) {
        console.log(`  Daily left:   $${report.budgetRemaining.daily.toFixed(4)}`);
      }

      // Recommendation
      console.log(chalk.white('\n  Recommendation:'));
      console.log(`  ${chalk.green(report.recommendation)}`);

      if (report.savingsOpportunity) {
        console.log(chalk.white('\n  Savings Opportunity:'));
        console.log(`  ${chalk.yellow(report.savingsOpportunity.description)}`);
      }

      console.log('');
      await this.cleanupAndExit(0);
    } catch (error) {
      console.error(chalk.red('\n  Failed to get economic report:'), toErrorMessage(error));
      await this.cleanupAndExit(1);
    }
  }

  // --------------------------------------------------------------------------
  // Accuracy
  // --------------------------------------------------------------------------

  private async executeAccuracy(json: boolean): Promise<void> {
    try {
      const collector = createRoutingFeedbackCollector(10000);
      await collector.initialize();

      const accuracy = collector.analyzeRoutingAccuracy();

      if (json) {
        console.log(JSON.stringify(accuracy, null, 2));
        await this.cleanupAndExit(0);
        return;
      }

      console.log(chalk.blue('\n  Routing Accuracy Analysis'));
      console.log(chalk.gray('  ' + '\u2500'.repeat(40)));
      console.log(`  Total outcomes:       ${chalk.cyan(String(accuracy.totalOutcomes))}`);
      console.log(`  Followed recs:        ${chalk.cyan(String(accuracy.followedRecommendations))}`);
      // #1481: a null rate means nothing was observed for it.
      const pct = (rate: number | null) => (rate === null ? chalk.gray('n/a') : scoreColor100(rate * 100));
      console.log(`  Success rate:          ${pct(accuracy.successRate)}`);
      console.log(`  Override rate:         ${accuracy.overrideRate === null ? chalk.gray('n/a') : chalk.yellow((accuracy.overrideRate * 100).toFixed(1) + '%')}`);
      console.log(`  Rec success rate:      ${pct(accuracy.recommendationSuccessRate)}`);
      console.log(`  Override success rate:  ${pct(accuracy.overrideSuccessRate)}`);
      console.log(`  Confidence correlation: ${chalk.cyan(accuracy.confidenceCorrelation.toFixed(3))}`);

      // Recommendations
      const recs = collector.getImprovementRecommendations();
      if (recs.length > 0) {
        console.log(chalk.white('\n  Recommendations:'));
        for (const rec of recs) {
          console.log(`  ${chalk.gray('\u2022')} ${rec}`);
        }
      }

      console.log('');
      await this.cleanupAndExit(0);
    } catch (error) {
      console.error(chalk.red('\n  Failed to analyze routing accuracy:'), toErrorMessage(error));
      await this.cleanupAndExit(1);
    }
  }

  // --------------------------------------------------------------------------
  // Metrics
  // --------------------------------------------------------------------------

  private async executeMetrics(json: boolean): Promise<void> {
    try {
      const collector = createRoutingFeedbackCollector(10000);
      await collector.initialize();

      const metrics = collector.getAllAgentMetrics();

      if (json) {
        console.log(JSON.stringify(metrics, null, 2));
        await this.cleanupAndExit(0);
        return;
      }

      if (metrics.length === 0) {
        console.log(chalk.yellow('\n  No routing metrics available yet. Run some QE tasks first.\n'));
        await this.cleanupAndExit(0);
        return;
      }

      console.log(chalk.blue('\n  Agent Routing Metrics'));
      console.log(chalk.gray('  ' + '\u2500'.repeat(60)));
      console.log(chalk.gray('  Agent                  Tasks  Success  Quality  Trend'));
      console.log(chalk.gray('  ' + '\u2500'.repeat(60)));

      for (const m of metrics.slice(0, 20)) {
        const trend = m.trend === 'improving' ? chalk.green('\u2191')
          : m.trend === 'declining' ? chalk.red('\u2193')
          : chalk.gray('\u2192');
        console.log(
          `  ${padRight(m.agentId, 24)}` +
          `${padLeft(String(m.totalTasks), 5)}  ` +
          `${scoreColor100(m.successRate * 100)}  ` +
          `${chalk.cyan(m.avgQualityScore.toFixed(2))}     ` +
          `${trend} ${m.trend}`,
        );
      }

      const stats = collector.getStats();
      console.log(chalk.gray(`\n  ${stats.totalOutcomes} total outcomes, ${stats.uniqueAgentsUsed} agents`));
      console.log('');
      await this.cleanupAndExit(0);
    } catch (error) {
      console.error(chalk.red('\n  Failed to get agent metrics:'), toErrorMessage(error));
      await this.cleanupAndExit(1);
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
  return str.length >= len ? str : ' '.repeat(len - str.length) + str;
}

function scoreColor(score: number): string {
  const pct = score * 100;
  const str = score.toFixed(3);
  if (pct >= 70) return chalk.green(str);
  if (pct >= 40) return chalk.yellow(str);
  return chalk.red(str);
}

function scoreColor100(pct: number): string {
  const str = pct.toFixed(1) + '%';
  if (pct >= 70) return chalk.green(str);
  if (pct >= 40) return chalk.yellow(str);
  return chalk.red(str);
}

// ============================================================================
// Factory
// ============================================================================

export function createRoutingHandler(
  cleanupAndExit: (code: number) => Promise<never>,
): RoutingHandler {
  return new RoutingHandler(cleanupAndExit);
}
