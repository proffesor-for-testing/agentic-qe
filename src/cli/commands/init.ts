import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import * as fs from 'fs-extra';
import * as path from 'path';
import { InitOptions, FleetConfig } from '../../types';

export class InitCommand {
  static async execute(options: InitOptions): Promise<void> {
    console.log(chalk.blue.bold('\n🚀 Initializing Agentic QE Fleet\n'));

    try {
      // Parse options
      const maxAgents = parseInt(options.maxAgents);
      const testingFocus = options.focus.split(',').map(f => f.trim());
      const environments = options.environments.split(',').map(e => e.trim());
      const frameworks = options.frameworks ? options.frameworks.split(',').map(f => f.trim()) : ['jest'];

      // Validate inputs
      if (maxAgents < 5 || maxAgents > 50) {
        console.error(chalk.red('❌ Max agents must be between 5 and 50'));
        process.exit(1);
      }

      const validTopologies = ['hierarchical', 'mesh', 'ring', 'adaptive'];
      if (!validTopologies.includes(options.topology)) {
        console.error(chalk.red(`❌ Invalid topology. Must be one of: ${validTopologies.join(', ')}`));
        process.exit(1);
      }

      // Create fleet configuration
      const fleetConfig: FleetConfig = {
        agents: [],  // Will be populated during interactive setup
        topology: options.topology,
        maxAgents,
        testingFocus,
        environments,
        frameworks
      };

      // Interactive project setup if needed
      if (!options.config) {
        const projectAnswers = await inquirer.prompt([
          {
            type: 'input',
            name: 'projectName',
            message: 'Project name:',
            default: path.basename(process.cwd()),
            validate: (input: string) => input.trim().length > 0 || 'Project name is required'
          },
          {
            type: 'list',
            name: 'language',
            message: 'Primary programming language:',
            choices: ['JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 'Go', 'Other'],
            default: 'TypeScript'
          },
          {
            type: 'confirm',
            name: 'useClaudeFlow',
            message: 'Enable Claude Flow coordination?',
            default: true
          },
          {
            type: 'confirm',
            name: 'setupCi',
            message: 'Setup CI/CD integration?',
            default: true
          }
        ]);

        (fleetConfig as any).project = {
          name: projectAnswers.projectName,
          path: process.cwd(),
          language: projectAnswers.language.toLowerCase()
        };
      }

      const spinner = ora('Setting up fleet infrastructure...').start();

      // Create directory structure
      await this.createDirectoryStructure();
      spinner.text = 'Creating configuration files...';

      // Write fleet configuration
      await this.writeFleetConfig(fleetConfig);
      spinner.text = 'Installing dependencies...';

      // Initialize Claude Flow hooks if requested
      if (fleetConfig.project) {
        await this.setupClaudeFlowIntegration(fleetConfig);
      }

      spinner.text = 'Creating CLAUDE.md documentation...';

      // Create or update CLAUDE.md with agent documentation
      await this.createClaudeMd(fleetConfig);

      spinner.text = 'Spawning initial agents...';

      // Spawn initial fleet agents
      await this.spawnInitialAgents(fleetConfig);

      spinner.succeed(chalk.green('Fleet initialization completed successfully!'));

      // Display summary
      console.log(chalk.yellow('\n📊 Fleet Configuration Summary:'));
      console.log(chalk.gray(`  Topology: ${fleetConfig.topology}`));
      console.log(chalk.gray(`  Max Agents: ${fleetConfig.maxAgents}`));
      console.log(chalk.gray(`  Testing Focus: ${fleetConfig.testingFocus?.join(', ') || 'None'}`));
      console.log(chalk.gray(`  Environments: ${fleetConfig.environments?.join(', ') || 'None'}`));
      console.log(chalk.gray(`  Frameworks: ${fleetConfig.frameworks?.join(', ') || 'None'}`));

      // Show agent status
      const agentCount = await this.countAgentFiles('.claude/agents');
      console.log(chalk.gray(`  Agent Definitions: ${agentCount} agents ready`));

      console.log(chalk.yellow('\n💡 Next Steps:'));
      console.log(chalk.gray('  1. View agents: ls .claude/agents/'));
      console.log(chalk.gray('  2. Generate tests: aqe test <module-name>'));
      console.log(chalk.gray('  3. Run tests: aqe run tests --parallel'));
      console.log(chalk.gray('  4. Monitor fleet: aqe status --verbose'));

      // Initialize Claude Flow coordination
      await this.initializeCoordination(fleetConfig);

    } catch (error: any) {
      console.error(chalk.red('❌ Initialization failed:'), error.message);
      if (options.verbose) {
        console.error(chalk.gray(error.stack));
      }
      process.exit(1);
    }
  }

  private static async createDirectoryStructure(): Promise<void> {
    const dirs = [
      '.agentic-qe',
      '.agentic-qe/config',
      '.agentic-qe/logs',
      '.agentic-qe/data',
      '.agentic-qe/agents',
      '.agentic-qe/reports',
      '.claude',              // For Claude Code integration
      '.claude/agents',       // Where agent definitions live
      'tests/unit',
      'tests/integration',
      'tests/e2e',
      'tests/performance',
      'tests/security'
    ];

    for (const dir of dirs) {
      await fs.ensureDir(dir);
    }

    // Copy agent templates from agentic-qe package
    await this.copyAgentTemplates();
  }

  private static async copyAgentTemplates(): Promise<void> {
    // Find the agentic-qe package location (handles both npm install and local dev)
    const possiblePaths = [
      path.join(__dirname, '../../../.claude/agents'),  // From dist/cli/commands
      path.join(process.cwd(), 'node_modules/agentic-qe/.claude/agents'),
      path.join(process.cwd(), '../agentic-qe/.claude/agents')  // Monorepo case
    ];

    let sourcePath: string | null = null;
    for (const p of possiblePaths) {
      if (await fs.pathExists(p)) {
        sourcePath = p;
        break;
      }
    }

    if (!sourcePath) {
      console.warn(chalk.yellow('⚠️  Could not find agent templates, creating basic agents'));
      await this.createBasicAgents();
      return;
    }

    // Copy all agent definition files
    const targetPath = path.join(process.cwd(), '.claude/agents');
    await fs.copy(sourcePath, targetPath, {
      overwrite: false,  // Don't overwrite existing agent definitions
      filter: (src) => src.endsWith('.md')  // Only copy markdown agent files
    });

    console.log(chalk.green(`✓ Copied ${await this.countAgentFiles(targetPath)} agent definitions`));
  }

  private static async createBasicAgents(): Promise<void> {
    // Fallback: Create basic agent templates if package agents not found
    const basicAgents = [
      'qe-test-generator',
      'qe-test-executor',
      'qe-coverage-analyzer',
      'qe-quality-gate',
      'qe-performance-tester',
      'qe-security-scanner'
    ];

    const targetPath = path.join(process.cwd(), '.claude/agents');

    for (const agentName of basicAgents) {
      const agentFile = path.join(targetPath, `${agentName}.md`);
      const agentType = agentName.replace('qe-', '');

      const content = `---
name: ${agentName}
type: ${agentType}
color: blue
priority: medium
description: "Agentic QE Fleet ${agentType} agent"
capabilities:
  - ${agentType}
coordination:
  protocol: aqe-hooks
metadata:
  version: "1.0.2"
  framework: "agentic-qe"
---

# ${agentName.toUpperCase()} Agent

## Description
This agent is part of the Agentic QE Fleet and specializes in ${agentType}.

## Capabilities
- AI-powered ${agentType}
- Integration with Agentic QE Fleet
- Native TypeScript coordination

## Coordination Protocol

This agent uses **AQE hooks** (Agentic QE native hooks) for coordination (zero external dependencies, 100-500x faster than external hooks).

**Automatic Lifecycle Hooks:**
\`\`\`typescript
protected async onPreTask(data: { assignment: TaskAssignment }): Promise<void> {
  // Load context from memory
  const context = await this.memoryStore.retrieve('aqe/context', {
    partition: 'coordination'
  });

  this.logger.info('Pre-task hook complete');
}

protected async onPostTask(data: { assignment: TaskAssignment; result: any }): Promise<void> {
  // Store results in memory
  await this.memoryStore.store(\`aqe/\${this.agentId.type}/results\`, data.result, {
    partition: 'agent_results',
    ttl: 86400 // 24 hours
  });

  // Emit completion event
  this.eventBus.emit('task:completed', {
    agentId: this.agentId,
    result: data.result
  });

  this.logger.info('Post-task hook complete');
}

protected async onTaskError(data: { assignment: TaskAssignment; error: Error }): Promise<void> {
  // Store error for analysis
  await this.memoryStore.store(\`aqe/errors/\${data.assignment.id}\`, {
    error: data.error.message,
    stack: data.error.stack,
    timestamp: Date.now()
  }, {
    partition: 'errors',
    ttl: 604800 // 7 days
  });

  this.logger.error('Task failed', { error: data.error });
}
\`\`\`

**Memory Integration:**
\`\`\`typescript
// Store data with partitions and TTLs
await this.memoryStore.store('aqe/${agentType}/results', results, {
  partition: 'agent_results',
  ttl: 86400, // 24 hours
  accessLevel: AccessLevel.SWARM
});

// Retrieve context
const context = await this.memoryStore.retrieve('aqe/context', {
  partition: 'coordination'
});

// Query patterns
const relatedData = await this.memoryStore.query('aqe/${agentType}/%', {
  partition: 'agent_results'
});
\`\`\`

**Event-Driven Coordination:**
\`\`\`typescript
// Emit events
this.eventBus.emit('${agentType}:completed', {
  agentId: this.agentId,
  results: data
});

// Register event handlers
this.registerEventHandler({
  eventType: '${agentType}:required',
  handler: async (event) => {
    await this.process(event.data);
  }
});
\`\`\`

## Usage
\`\`\`bash
# Spawn this agent via Claude Code Task tool
Task("${agentType}", "Execute ${agentType} task", "${agentName}")

# Or use CLI
aqe agent spawn --name ${agentName} --type ${agentType}
aqe agent execute --name ${agentName} --task "<your task>"
\`\`\`

## Integration
This agent coordinates with other QE Fleet agents through:
- **AQE Hooks**: Native TypeScript lifecycle hooks (<1ms vs 100-500ms external)
- **SwarmMemoryManager**: Persistent memory with 12-table schema
- **EventBus**: Event-driven communication
- **Fleet Manager**: Lifecycle management

For full capabilities, install the complete agentic-qe package.
`;

      await fs.writeFile(agentFile, content);
    }
  }

  private static async countAgentFiles(dirPath: string): Promise<number> {
    if (!await fs.pathExists(dirPath)) return 0;
    const files = await fs.readdir(dirPath);
    return files.filter(f => f.endsWith('.md')).length;
  }

  private static async writeFleetConfig(config: FleetConfig): Promise<void> {
    const configPath = '.agentic-qe/config/fleet.json';
    await fs.writeJson(configPath, config, { spaces: 2 });

    // Create agent configurations
    const agentConfigs = this.generateAgentConfigs(config);
    await fs.writeJson('.agentic-qe/config/agents.json', agentConfigs, { spaces: 2 });

    // Create environment configurations
    const envConfigs = this.generateEnvironmentConfigs(config.environments || []);
    await fs.writeJson('.agentic-qe/config/environments.json', envConfigs, { spaces: 2 });
  }

  private static generateAgentConfigs(fleetConfig: FleetConfig): any {
    const agentTypes = [
      'test-generator',
      'coverage-analyzer',
      'quality-gate',
      'performance-tester',
      'security-scanner'
    ];

    return {
      fleet: {
        topology: fleetConfig.topology,
        maxAgents: fleetConfig.maxAgents,
        agents: agentTypes.map(type => ({
          type,
          count: type === 'test-generator' ? 2 : 1,
          capabilities: this.getAgentCapabilities(type),
          resources: {
            memory: '100MB',
            cpu: '0.5'
          }
        }))
      }
    };
  }

  private static getAgentCapabilities(agentType: string): string[] {
    const capabilities: Record<string, string[]> = {
      'test-generator': ['unit-tests', 'integration-tests', 'property-based-testing', 'test-data-synthesis'],
      'coverage-analyzer': ['coverage-analysis', 'gap-identification', 'trend-analysis'],
      'quality-gate': ['quality-metrics', 'threshold-enforcement', 'decision-making'],
      'performance-tester': ['load-testing', 'stress-testing', 'bottleneck-analysis'],
      'security-scanner': ['vulnerability-scanning', 'security-testing', 'compliance-checking']
    };
    return capabilities[agentType] || [];
  }

  private static generateEnvironmentConfigs(environments: string[]): any {
    return environments.reduce((configs, env) => {
      configs[env] = {
        database: {
          type: env === 'production' ? 'postgresql' : 'sqlite',
          connectionString: env === 'production'
            ? '${DATABASE_URL}'
            : `.agentic-qe/data/${env}.db`
        },
        testing: {
          parallel: env !== 'production',
          timeout: env === 'production' ? 600 : 300,
          retries: env === 'production' ? 2 : 1
        },
        monitoring: {
          enabled: true,
          metrics: ['coverage', 'performance', 'quality'],
          alerts: env === 'production'
        }
      };
    }, {} as any);
  }

  private static async setupClaudeFlowIntegration(config: FleetConfig): Promise<void> {
    // Create Claude Flow hooks configuration
    const hooksConfig = {
      hooks: {
        'pre-task': {
          command: 'npx claude-flow@alpha hooks pre-task',
          enabled: true
        },
        'post-edit': {
          command: 'npx claude-flow@alpha hooks post-edit',
          enabled: true
        },
        'post-task': {
          command: 'npx claude-flow@alpha hooks post-task',
          enabled: true
        }
      },
      coordination: {
        enabled: true,
        topology: config.topology,
        memory: {
          namespace: 'agentic-qe',
          ttl: 3600
        }
      }
    };

    await fs.writeJson('.agentic-qe/config/claude-flow.json', hooksConfig, { spaces: 2 });
  }

  private static async spawnInitialAgents(config: FleetConfig): Promise<void> {
    // Create agent registry
    const agentRegistry = {
      fleet: {
        id: `fleet-${Date.now()}`,
        status: 'initializing',
        agents: [],
        created: new Date().toISOString()
      }
    };

    await fs.writeJson('.agentic-qe/data/registry.json', agentRegistry, { spaces: 2 });
  }

  private static async initializeCoordination(config: FleetConfig): Promise<void> {
    // Store coordination setup commands for later execution
    const coordinationScript = `#!/bin/bash
# Agentic QE Fleet Coordination Setup
npx claude-flow@alpha hooks pre-task --description "Fleet initialization"
npx claude-flow@alpha memory store --key "agentic-qe/fleet/config" --value '${JSON.stringify(config)}'
npx claude-flow@alpha hooks notify --message "Fleet initialized with ${config.topology} topology"
`;

    await fs.writeFile('.agentic-qe/scripts/setup-coordination.sh', coordinationScript);
    await fs.chmod('.agentic-qe/scripts/setup-coordination.sh', '755');
  }

  private static async createClaudeMd(config: FleetConfig): Promise<void> {
    const claudeMdPath = 'CLAUDE.md';
    const agentCount = await this.countAgentFiles('.claude/agents');

    // Check if CLAUDE.md exists
    const exists = await fs.pathExists(claudeMdPath);

    if (exists) {
      // Backup existing CLAUDE.md
      const backupPath = 'CLAUDE.md.backup';
      await fs.copy(claudeMdPath, backupPath);
      console.log(chalk.yellow(`  ℹ️  Existing CLAUDE.md backed up to ${backupPath}`));
    }

    const claudeMdContent = `# Claude Code Configuration - Agentic QE Fleet

## 🤖 Agentic Quality Engineering Fleet

This project uses the **Agentic QE Fleet** - a distributed swarm of ${agentCount} AI agents for comprehensive software testing and quality assurance.

### Available Agents

#### Core Testing (5 agents)
- **qe-test-generator**: AI-powered test generation with sublinear optimization
- **qe-test-executor**: Multi-framework test execution with parallel processing
- **qe-coverage-analyzer**: Real-time gap detection with O(log n) algorithms
- **qe-quality-gate**: Intelligent quality gate with risk assessment
- **qe-quality-analyzer**: Comprehensive quality metrics analysis

#### Performance & Security (2 agents)
- **qe-performance-tester**: Load testing with k6, JMeter, Gatling integration
- **qe-security-scanner**: Multi-layer security with SAST/DAST scanning

#### Strategic Planning (3 agents)
- **qe-requirements-validator**: INVEST criteria validation and BDD generation
- **qe-production-intelligence**: Production data to test scenarios conversion
- **qe-fleet-commander**: Hierarchical fleet coordination (50+ agents)

#### Deployment (1 agent)
- **qe-deployment-readiness**: Multi-factor risk assessment for deployments

#### Advanced Testing (4 agents)
- **qe-regression-risk-analyzer**: Smart test selection with ML patterns
- **qe-test-data-architect**: High-speed realistic data generation (10k+ records/sec)
- **qe-api-contract-validator**: Breaking change detection across API versions
- **qe-flaky-test-hunter**: Statistical flakiness detection and auto-stabilization

#### Specialized (2 agents)
- **qe-visual-tester**: Visual regression with AI-powered comparison
- **qe-chaos-engineer**: Resilience testing with controlled fault injection

## 🚀 Quick Start

### Using Agents via Claude Code Task Tool (Recommended)

\\\`\\\`\\\`javascript
// Spawn agents directly in Claude Code
Task("Generate tests", "Create comprehensive test suite for UserService", "qe-test-generator")
Task("Analyze coverage", "Find gaps using O(log n) algorithms", "qe-coverage-analyzer")
Task("Quality check", "Run quality gate validation", "qe-quality-gate")
\\\`\\\`\\\`

### Using MCP Tools

\\\`\\\`\\\`bash
# Check MCP connection
claude mcp list
# Should show: agentic-qe: npm run mcp:start - ✓ Connected

# Use MCP tools in Claude Code
mcp__agentic_qe__test_generate({ type: "unit", framework: "${config.frameworks?.[0] || 'jest'}" })
mcp__agentic_qe__test_execute({ parallel: true, coverage: true })
mcp__agentic_qe__quality_analyze({ scope: "full" })
\\\`\\\`\\\`

### Using CLI

\\\`\\\`\\\`bash
# Quick commands
aqe test <module-name>        # Generate tests
aqe coverage                   # Analyze coverage
aqe quality                    # Run quality gate
aqe status                     # Check fleet status
\\\`\\\`\\\`

## 🔄 Agent Coordination

All agents coordinate through **AQE hooks** (Agentic QE native hooks - zero external dependencies, 100-500x faster):

### Automatic Lifecycle Hooks

Agents extend \\\`BaseAgent\\\` and override lifecycle methods:

\\\`\\\`\\\`typescript
protected async onPreTask(data: { assignment: TaskAssignment }): Promise<void> {
  // Load context before task execution
  const context = await this.memoryStore.retrieve('aqe/context', {
    partition: 'coordination'
  });

  this.logger.info('Pre-task hook complete');
}

protected async onPostTask(data: { assignment: TaskAssignment; result: any }): Promise<void> {
  // Store results after task completion
  await this.memoryStore.store('aqe/' + this.agentId.type + '/results', data.result, {
    partition: 'agent_results',
    ttl: 86400 // 24 hours
  });

  // Emit completion event
  this.eventBus.emit('task:completed', {
    agentId: this.agentId,
    result: data.result
  });

  this.logger.info('Post-task hook complete');
}

protected async onTaskError(data: { assignment: TaskAssignment; error: Error }): Promise<void> {
  // Handle task errors
  await this.memoryStore.store('aqe/errors/' + data.assignment.id, {
    error: data.error.message,
    stack: data.error.stack,
    timestamp: Date.now()
  }, {
    partition: 'errors',
    ttl: 604800 // 7 days
  });

  this.logger.error('Task failed', { error: data.error });
}
\\\`\\\`\\\`

### Performance Comparison

| Feature | AQE Hooks | External Hooks |
|---------|-----------|----------------|
| **Speed** | <1ms | 100-500ms |
| **Dependencies** | Zero | External package |
| **Type Safety** | Full TypeScript | Shell strings |
| **Integration** | Direct API | Shell commands |
| **Performance** | 100-500x faster | Baseline |

## 📋 Memory Namespace

Agents share state through the **\\\`aqe/*\\\` memory namespace**:

- \\\`aqe/test-plan/*\\\` - Test planning and requirements
- \\\`aqe/coverage/*\\\` - Coverage analysis and gaps
- \\\`aqe/quality/*\\\` - Quality metrics and gates
- \\\`aqe/performance/*\\\` - Performance test results
- \\\`aqe/security/*\\\` - Security scan findings
- \\\`aqe/swarm/coordination\\\` - Cross-agent coordination

## 🎯 Fleet Configuration

**Topology**: ${config.topology}
**Max Agents**: ${config.maxAgents}
**Testing Focus**: ${config.testingFocus?.join(', ') || 'All areas'}
**Environments**: ${config.environments?.join(', ') || 'Not specified'}
**Frameworks**: ${config.frameworks?.join(', ') || 'jest'}

## 📚 Documentation

- **Agent Definitions**: \\\`.claude/agents/\\\` - ${agentCount} specialized QE agents
- **Fleet Config**: \\\`.agentic-qe/config/fleet.json\\\`
- **Coordination**: \\\`.agentic-qe/config/claude-flow.json\\\`

## 🔧 Advanced Usage

### Parallel Agent Execution

\\\`\\\`\\\`javascript
// Execute multiple agents concurrently
Task("Test Generation", "Generate unit tests", "qe-test-generator")
Task("Coverage Analysis", "Analyze current coverage", "qe-coverage-analyzer")
Task("Security Scan", "Run security checks", "qe-security-scanner")
Task("Performance Test", "Load test critical paths", "qe-performance-tester")
\\\`\\\`\\\`

### Agent Coordination Example

\\\`\\\`\\\`javascript
// Test generator stores results
Task("Generate tests", "Create tests and store in memory at aqe/test-plan/generated", "qe-test-generator")

// Test executor reads from memory
Task("Execute tests", "Read test plan from aqe/test-plan/generated and execute", "qe-test-executor")

// Coverage analyzer processes results
Task("Analyze coverage", "Check coverage from aqe/coverage/results", "qe-coverage-analyzer")
\\\`\\\`\\\`

## 💡 Best Practices

1. **Use Task Tool**: Claude Code's Task tool is the primary way to spawn agents
2. **Batch Operations**: Always spawn multiple related agents in a single message
3. **Memory Keys**: Use the \\\`aqe/*\\\` namespace for agent coordination
4. **AQE Hooks**: Agents automatically use native AQE hooks for coordination (100-500x faster)
5. **Parallel Execution**: Leverage concurrent agent execution for speed

## 🆘 Troubleshooting

### Check MCP Connection
\\\`\\\`\\\`bash
claude mcp list
\\\`\\\`\\\`

### View Agent Definitions
\\\`\\\`\\\`bash
ls -la .claude/agents/
\\\`\\\`\\\`

### Check Fleet Status
\\\`\\\`\\\`bash
aqe status --verbose
\\\`\\\`\\\`

### View Logs
\\\`\\\`\\\`bash
tail -f .agentic-qe/logs/fleet.log
\\\`\\\`\\\`

---

**Generated by**: Agentic QE Fleet v1.0.0
**Initialization Date**: ${new Date().toISOString()}
**Fleet Topology**: ${config.topology}
`;

    await fs.writeFile(claudeMdPath, claudeMdContent);
  }
}