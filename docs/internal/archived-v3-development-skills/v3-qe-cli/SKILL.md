# v3-qe-cli

## Purpose
Guide the implementation of modernized CLI commands for AQE v3 with DDD-aligned operations and enhanced UX.

## Activation
- When implementing new CLI commands
- When refactoring existing CLI
- When adding v3-specific operations
- When improving CLI user experience

## CLI Architecture

### 1. Command Structure

```typescript
// v3/src/cli/index.ts
import { Command } from 'commander';
import { QEFleetCoordinator } from '../coordination';
import { QEAgentDB } from '../infrastructure/memory';

export const createCLI = (): Command => {
  const program = new Command();

  program
    .name('aqe')
    .version('3.0.0')
    .description('Agentic Quality Engineering CLI v3');

  // Domain-aligned command groups
  addTestGenerationCommands(program);
  addCoverageCommands(program);
  addQualityCommands(program);
  addExecutionCommands(program);
  addLearningCommands(program);
  addFleetCommands(program);

  return program;
};

// Test Generation Domain Commands
function addTestGenerationCommands(program: Command): void {
  const test = program
    .command('test')
    .description('Test generation domain commands');

  test
    .command('generate <path>')
    .description('Generate tests for source code')
    .option('-f, --framework <framework>', 'Test framework (jest|vitest|playwright)', 'jest')
    .option('-t, --type <type>', 'Test type (unit|integration|e2e)', 'unit')
    .option('-c, --coverage <target>', 'Target coverage percentage', '80')
    .option('--ai', 'Use AI-powered generation', true)
    .option('--tdd', 'Generate TDD-style tests')
    .option('--property', 'Include property-based tests')
    .action(async (path, options) => {
      const coordinator = await getCoordinator();
      const result = await coordinator.orchestrate({
        type: 'test-generation',
        task: 'generate',
        target: path,
        options
      });
      displayResult(result);
    });

  test
    .command('optimize <suite>')
    .description('Optimize existing test suite')
    .option('--remove-redundant', 'Remove redundant tests')
    .option('--prioritize', 'Prioritize by risk')
    .action(async (suite, options) => {
      // Implementation
    });
}

// Coverage Domain Commands
function addCoverageCommands(program: Command): void {
  const coverage = program
    .command('coverage')
    .description('Coverage analysis domain commands');

  coverage
    .command('analyze [path]')
    .description('Analyze code coverage with O(log n) gap detection')
    .option('--threshold <percent>', 'Minimum coverage threshold', '80')
    .option('--gaps', 'Show coverage gaps')
    .option('--risk', 'Include risk scoring')
    .option('--vectors', 'Use vector-based analysis')
    .action(async (path, options) => {
      const coordinator = await getCoordinator();
      const result = await coordinator.orchestrate({
        type: 'coverage-analysis',
        task: 'analyze',
        target: path || '.',
        options
      });
      displayCoverageResult(result);
    });

  coverage
    .command('gaps [path]')
    .description('Find coverage gaps using HNSW')
    .option('--limit <n>', 'Maximum gaps to show', '20')
    .option('--severity <level>', 'Minimum severity (low|medium|high|critical)')
    .action(async (path, options) => {
      // Implementation
    });
}

// Quality Domain Commands
function addQualityCommands(program: Command): void {
  const quality = program
    .command('quality')
    .description('Quality assessment domain commands');

  quality
    .command('gate [name]')
    .description('Evaluate quality gate')
    .option('--strict', 'Use strict criteria')
    .option('--report', 'Generate detailed report')
    .action(async (name, options) => {
      const coordinator = await getCoordinator();
      const result = await coordinator.orchestrate({
        type: 'quality-assessment',
        task: 'evaluate-gate',
        gateName: name || 'default',
        options
      });
      displayGateResult(result);
    });

  quality
    .command('metrics')
    .description('Show quality metrics')
    .option('--trend', 'Show trend over time')
    .option('--compare <baseline>', 'Compare to baseline')
    .action(async (options) => {
      // Implementation
    });
}

// Fleet Commands
function addFleetCommands(program: Command): void {
  const fleet = program
    .command('fleet')
    .description('QE agent fleet management');

  fleet
    .command('status')
    .description('Show fleet status')
    .option('-v, --verbose', 'Verbose output')
    .action(async (options) => {
      const coordinator = await getCoordinator();
      const status = await coordinator.getFleetStatus();
      displayFleetStatus(status, options.verbose);
    });

  fleet
    .command('spawn <agent>')
    .description('Spawn a specific agent')
    .option('--task <task>', 'Assign initial task')
    .action(async (agent, options) => {
      // Implementation
    });

  fleet
    .command('orchestrate <task>')
    .description('Orchestrate a QE task across fleet')
    .option('--protocol <name>', 'Use specific protocol')
    .option('--agents <list>', 'Specific agents to use')
    .action(async (task, options) => {
      const coordinator = await getCoordinator();
      const result = await coordinator.orchestrate({
        task,
        protocol: options.protocol,
        agents: options.agents?.split(',')
      });
      displayResult(result);
    });
}
```

### 2. Output Formatting

```typescript
// v3/src/cli/formatters/output.ts
import chalk from 'chalk';
import { table } from 'table';

export function displayFleetStatus(status: FleetStatus, verbose: boolean): void {
  console.log(chalk.bold.cyan('\n🤖 AQE v3 Fleet Status\n'));

  // Agent groups table
  const groupData = [
    [chalk.bold('Group'), chalk.bold('Agents'), chalk.bold('Active'), chalk.bold('Status')]
  ];

  for (const group of status.groups) {
    groupData.push([
      chalk.yellow(group.name),
      group.totalAgents.toString(),
      chalk.green(group.activeAgents.toString()),
      getStatusIcon(group.status)
    ]);
  }

  console.log(table(groupData));

  // Summary
  console.log(chalk.dim('─'.repeat(50)));
  console.log(`Total Agents: ${chalk.bold(status.totalAgents)}`);
  console.log(`Active: ${chalk.green(status.activeAgents)}`);
  console.log(`Tasks Completed: ${chalk.blue(status.tasksCompleted)}`);
  console.log(`Learning Patterns: ${chalk.magenta(status.patternsLearned)}`);

  if (verbose) {
    displayDetailedAgentStatus(status.agents);
  }
}

export function displayCoverageResult(result: CoverageResult): void {
  console.log(chalk.bold.cyan('\n📊 Coverage Analysis Results\n'));

  // Coverage summary
  const coverageColor = result.lineCoverage >= 80 ? chalk.green : chalk.yellow;
  console.log(`Line Coverage: ${coverageColor(result.lineCoverage + '%')}`);
  console.log(`Branch Coverage: ${coverageColor(result.branchCoverage + '%')}`);
  console.log(`Function Coverage: ${coverageColor(result.functionCoverage + '%')}`);

  // Gaps
  if (result.gaps.length > 0) {
    console.log(chalk.bold.yellow('\n⚠️  Coverage Gaps Detected:\n'));

    const gapData = [
      [chalk.bold('File'), chalk.bold('Lines'), chalk.bold('Risk'), chalk.bold('Suggested')]
    ];

    for (const gap of result.gaps.slice(0, 10)) {
      gapData.push([
        chalk.dim(gap.file),
        gap.uncoveredLines.join(', '),
        getRiskIcon(gap.riskScore),
        chalk.cyan(gap.suggestedTestType)
      ]);
    }

    console.log(table(gapData));
  }
}

export function displayGateResult(result: GateResult): void {
  const icon = result.passed ? chalk.green('✓') : chalk.red('✗');
  console.log(chalk.bold.cyan(`\n🚦 Quality Gate: ${icon} ${result.passed ? 'PASSED' : 'FAILED'}\n`));

  for (const criterion of result.criteria) {
    const status = criterion.passed ? chalk.green('✓') : chalk.red('✗');
    console.log(`  ${status} ${criterion.name}: ${criterion.actual} ${criterion.operator} ${criterion.threshold}`);
  }

  if (result.blockers.length > 0) {
    console.log(chalk.bold.red('\n❌ Blockers:'));
    for (const blocker of result.blockers) {
      console.log(`  • ${blocker}`);
    }
  }

  if (result.recommendations.length > 0) {
    console.log(chalk.bold.yellow('\n💡 Recommendations:'));
    for (const rec of result.recommendations) {
      console.log(`  • ${rec}`);
    }
  }
}

function getStatusIcon(status: string): string {
  const icons: Record<string, string> = {
    active: chalk.green('●'),
    idle: chalk.yellow('○'),
    error: chalk.red('✗'),
    busy: chalk.blue('◉')
  };
  return icons[status] || chalk.dim('?');
}

function getRiskIcon(risk: number): string {
  if (risk >= 0.8) return chalk.red('🔴 Critical');
  if (risk >= 0.6) return chalk.yellow('🟡 High');
  if (risk >= 0.4) return chalk.blue('🔵 Medium');
  return chalk.green('🟢 Low');
}
```

### 3. Interactive Mode

```typescript
// v3/src/cli/interactive.ts
import inquirer from 'inquirer';

export async function runInteractive(): Promise<void> {
  console.log(chalk.bold.cyan('\n🤖 AQE v3 Interactive Mode\n'));

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: '📝 Generate Tests', value: 'generate-tests' },
        { name: '📊 Analyze Coverage', value: 'analyze-coverage' },
        { name: '🚦 Evaluate Quality Gate', value: 'quality-gate' },
        { name: '🔍 Find Coverage Gaps', value: 'find-gaps' },
        { name: '🤖 Manage Fleet', value: 'manage-fleet' },
        { name: '🧠 View Learning Patterns', value: 'view-patterns' },
        new inquirer.Separator(),
        { name: '❌ Exit', value: 'exit' }
      ]
    }
  ]);

  switch (action) {
    case 'generate-tests':
      await interactiveTestGeneration();
      break;
    case 'analyze-coverage':
      await interactiveCoverageAnalysis();
      break;
    case 'quality-gate':
      await interactiveQualityGate();
      break;
    // ... other cases
  }
}

async function interactiveTestGeneration(): Promise<void> {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'path',
      message: 'Path to source code:',
      default: 'src/'
    },
    {
      type: 'list',
      name: 'framework',
      message: 'Test framework:',
      choices: ['jest', 'vitest', 'playwright', 'pytest']
    },
    {
      type: 'checkbox',
      name: 'options',
      message: 'Generation options:',
      choices: [
        { name: 'AI-powered generation', value: 'ai', checked: true },
        { name: 'TDD-style tests', value: 'tdd' },
        { name: 'Property-based tests', value: 'property' },
        { name: 'Integration tests', value: 'integration' }
      ]
    },
    {
      type: 'number',
      name: 'coverage',
      message: 'Target coverage %:',
      default: 80
    }
  ]);

  // Execute with answers
  const coordinator = await getCoordinator();
  const result = await coordinator.orchestrate({
    type: 'test-generation',
    task: 'generate',
    target: answers.path,
    options: answers
  });

  displayResult(result);
}
```

### 4. Progress Display

```typescript
// v3/src/cli/progress.ts
import ora from 'ora';
import cliProgress from 'cli-progress';

export class ProgressDisplay {
  private spinner: ora.Ora;
  private multiBar: cliProgress.MultiBar;

  constructor() {
    this.spinner = ora();
    this.multiBar = new cliProgress.MultiBar({
      clearOnComplete: false,
      hideCursor: true,
      format: '{agent} |' + chalk.cyan('{bar}') + '| {percentage}% | {status}'
    });
  }

  // Show spinner for single operation
  async withSpinner<T>(message: string, fn: () => Promise<T>): Promise<T> {
    this.spinner.start(message);
    try {
      const result = await fn();
      this.spinner.succeed();
      return result;
    } catch (error) {
      this.spinner.fail();
      throw error;
    }
  }

  // Show multi-bar progress for parallel agents
  trackAgents(agents: string[]): AgentProgressTrackers {
    const trackers: AgentProgressTrackers = {};

    for (const agent of agents) {
      trackers[agent] = this.multiBar.create(100, 0, {
        agent: agent.padEnd(20),
        status: 'Initializing...'
      });
    }

    return trackers;
  }

  updateAgent(tracker: cliProgress.SingleBar, progress: number, status: string): void {
    tracker.update(progress, { status });
  }

  complete(): void {
    this.multiBar.stop();
  }
}
```

## Command Reference

| Command | Description |
|---------|-------------|
| `aqe test generate <path>` | Generate tests for source code |
| `aqe test optimize <suite>` | Optimize existing test suite |
| `aqe coverage analyze` | Analyze coverage with O(log n) |
| `aqe coverage gaps` | Find coverage gaps |
| `aqe quality gate` | Evaluate quality gate |
| `aqe quality metrics` | Show quality metrics |
| `aqe fleet status` | Show fleet status |
| `aqe fleet spawn <agent>` | Spawn specific agent |
| `aqe fleet orchestrate` | Orchestrate task |
| `aqe learn status` | Learning progress |
| `aqe learn patterns` | View learned patterns |
| `aqe init` | Initialize project |
| `aqe interactive` | Interactive mode |

## Implementation Checklist

- [ ] Implement domain-aligned commands
- [ ] Add output formatters
- [ ] Create interactive mode
- [ ] Add progress display
- [ ] Implement config management
- [ ] Add shell completions
- [ ] Write CLI tests
- [ ] Create man pages

## Related Skills
- v3-qe-core-implementation - Domain logic
- v3-qe-fleet-coordination - Agent orchestration
- v3-qe-mcp - MCP tool integration
