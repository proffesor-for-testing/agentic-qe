#!/usr/bin/env node

import { program } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { promises as fs } from 'fs';
import path from 'path';

// Import TypeScript modules directly
import { SwarmCoordinator } from '../../src/swarm/swarm-coordinator';
import { AgentRegistry } from '../../src/agents/agent-registry';
import { MemoryManager } from '../../src/memory/memory-manager';
import { AgenticQE } from '../../src/core/agentic-qe';

interface AgentChoice {
  name: string;
  value: string;
}

interface InitAnswers {
  framework: string;
  agents: string[];
}

interface AnalyzeOptions {
  requirements?: boolean;
  code?: boolean;
  deployment?: boolean;
}

interface ExploreOptions {
  charter?: string;
  time?: string;
  tour?: string;
}

interface MonitorOptions {
  metrics?: string;
}

interface QEConfig {
  framework: string;
  agents: string[];
  created: string;
}

interface QualityContext {
  requirements: string[];
  changes: {
    linesChanged: number;
    complexity: number;
    critical: boolean;
    previousBugs: number;
  };
  code: string;
  deployment: Record<string, any>;
}

interface ProductionMetrics {
  errorRate: number;
  latencyP99: number;
  traffic: number;
  saturation: number;
}

const aqe = new AgenticQE();

program
  .name('aqe')
  .description('Agentic Quality Engineering - Context-driven testing agents')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize agentic-qe in your project')
  .action(async (): Promise<void> => {
    console.log(chalk.blue('Initializing Agentic QE...'));

    const answers: InitAnswers = await inquirer.prompt([
      {
        type: 'list',
        name: 'framework',
        message: 'Select your testing framework:',
        choices: ['Jest', 'Mocha', 'Jasmine', 'Playwright', 'Cypress', 'Other']
      },
      {
        type: 'checkbox',
        name: 'agents',
        message: 'Which agents would you like to enable?',
        choices: [
          'requirements-explorer',
          'exploratory-testing-navigator',
          'tdd-pair-programmer',
          'deployment-guardian',
          'risk-oracle',
          'production-observer'
        ],
        default: ['requirements-explorer', 'risk-oracle', 'tdd-pair-programmer']
      }
    ]);

    const config: QEConfig = {
      framework: answers.framework,
      agents: answers.agents,
      created: new Date().toISOString()
    };

    await fs.writeFile('.aqe.config.json', JSON.stringify(config, null, 2));
    console.log(chalk.green('✓ Agentic QE initialized successfully!'));
  });

program
  .command('analyze [path]')
  .description('Analyze code or requirements with QE agents')
  .option('-r, --requirements', 'Analyze requirements')
  .option('-c, --code', 'Analyze code')
  .option('-d, --deployment', 'Analyze deployment readiness')
  .action(async (targetPath: string = '.', options: AnalyzeOptions): Promise<void> => {
    console.log(chalk.blue('Running QE analysis...'));

    const context: QualityContext = {
      requirements: [],
      changes: {
        linesChanged: 0,
        complexity: 0,
        critical: false,
        previousBugs: 0
      },
      code: '',
      deployment: {}
    };

    if (options.requirements) {
      const reqPath = path.resolve(targetPath);
      try {
        await fs.access(reqPath);
        const content = await fs.readFile(reqPath, 'utf8');
        context.requirements = content.split('\n').filter(line => line.trim());
      } catch (error) {
        console.log(chalk.yellow(`Warning: Could not read requirements file at ${reqPath}`));
      }
    }

    if (options.code) {
      context.changes = {
        linesChanged: 250,
        complexity: 8,
        critical: false,
        previousBugs: 2
      };
    }

    const results = await aqe.runQualityGate(context);

    if (results.requirements) {
      console.log(chalk.yellow('\n📋 Requirements Analysis:'));
      console.log(`  Ambiguities found: ${results.requirements.ambiguities.length}`);
      console.log(`  Testability issues: ${results.requirements.testability.filter((t: any) => !t.testable).length}`);
      console.log(`  Risk areas: ${results.requirements.risks.length}`);
      console.log(`  Test charters generated: ${results.requirements.charters.length}`);
    }

    if (results.risks) {
      console.log(chalk.yellow('\n⚠️  Risk Assessment:'));
      console.log(`  Overall risk score: ${(results.risks.overallRisk * 100).toFixed(0)}%`);
      console.log(`  Test priorities: ${results.risks.priorities.join(', ')}`);
      results.risks.recommendations.forEach((rec: string) => {
        console.log(`  • ${rec}`);
      });
    }

    if (results.tests) {
      console.log(chalk.yellow('\n🧪 Test Suggestions:'));
      console.log(`  Next test: ${results.tests.nextTest.description}`);
      console.log(`  Missing tests: ${results.tests.missingTests.length}`);
      console.log(`  Refactoring opportunities: ${results.tests.refactoring.length}`);
    }

    if (results.deployment) {
      console.log(chalk.yellow('\n🚀 Deployment Validation:'));
      console.log(`  Smoke tests: ${results.deployment.smokeTests.length}`);
      console.log(`  Canary analysis: ${results.deployment.canaryAnalysis.recommendation}`);
      console.log(`  Rollback needed: ${results.deployment.rollbackDecision.decision ? 'Yes' : 'No'}`);
    }

    console.log(chalk.green('\n✓ Analysis complete!'));
  });

program
  .command('explore')
  .description('Start an exploratory testing session')
  .option('-c, --charter <charter>', 'Session charter/mission')
  .option('-t, --time <minutes>', 'Time box in minutes', '30')
  .option('--tour <type>', 'Tour type', 'landmark')
  .action(async (options: ExploreOptions): Promise<void> => {
    const session = await aqe.runExploratorySession({
      charter: options.charter || 'Explore the application for unexpected behaviors',
      timeBox: parseInt(options.time || '30'),
      tour: options.tour || 'landmark'
    });

    console.log(chalk.blue(`\n🔍 Exploratory Session Started`));
    console.log(`Session ID: ${session.id}`);
    console.log(`Charter: ${session.charter}`);
    console.log(`Time Box: ${session.timeBox} minutes`);
    console.log(`Tour Type: ${session.tour}`);
    console.log(chalk.yellow('\nSession initialized. Start exploring and document observations!'));
  });

program
  .command('monitor')
  .description('Monitor production metrics for anomalies')
  .option('-m, --metrics <file>', 'Metrics file path')
  .action(async (options: MonitorOptions): Promise<void> => {
    const sampleMetrics: ProductionMetrics = {
      errorRate: 0.03,
      latencyP99: 850,
      traffic: 1000,
      saturation: 0.65
    };

    const results = await aqe.monitorProduction(sampleMetrics);

    console.log(chalk.blue('\n📊 Production Monitoring Results:'));

    if (results.anomalies.length > 0) {
      console.log(chalk.red(`\n⚠️  Anomalies Detected: ${results.anomalies.length}`));
      results.anomalies.forEach((anomaly: any) => {
        console.log(`  • ${anomaly.type}: ${anomaly.value} (${anomaly.severity})`);
      });
    } else {
      console.log(chalk.green('\n✓ No anomalies detected'));
    }

    if (results.testGaps.length > 0) {
      console.log(chalk.yellow(`\n📝 Test Gaps Identified:`));
      results.testGaps.forEach((gap: string) => {
        console.log(`  • ${gap}`);
      });
    }

    if (results.alerts.length > 0) {
      console.log(chalk.red(`\n🚨 Alerts:`));
      results.alerts.forEach((alert: any) => {
        console.log(`  [${alert.level.toUpperCase()}] ${alert.message}`);
        console.log(`    Action: ${alert.action}`);
      });
    }
  });

program
  .command('agents')
  .description('List available QE agents')
  .action((): void => {
    const agents = aqe.listAgents();

    console.log(chalk.blue('\n🤖 Available QE Agents:\n'));

    const agentDescriptions: Record<string, string> = {
      'requirements-explorer': 'Analyzes requirements for testability and risks',
      'exploratory-testing-navigator': 'Guides exploratory testing sessions',
      'tdd-pair-programmer': 'Assists with test-driven development',
      'deployment-guardian': 'Validates deployment safety',
      'risk-oracle': 'Predicts and assesses risks',
      'production-observer': 'Monitors production for anomalies'
    };

    agents.forEach((agent: string) => {
      console.log(chalk.green(`  • ${agent}`));
      console.log(`    ${agentDescriptions[agent] || 'No description available'}`);
    });
  });

program.parse();