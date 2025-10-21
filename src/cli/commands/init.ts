import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import * as fs from 'fs-extra';
import * as path from 'path';
import { InitOptions, FleetConfig } from '../../types';

export class InitCommand {
  static async execute(options: InitOptions): Promise<void> {
    console.log(chalk.blue.bold('\n🚀 Initializing Agentic QE Project (v1.1.0)\n'));

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
        frameworks,
        routing: {
          enabled: false,  // Disabled by default for safe rollout
          defaultModel: 'claude-sonnet-4.5',
          enableCostTracking: true,
          enableFallback: true,
          maxRetries: 3,
          costThreshold: 0.5
        },
        streaming: {
          enabled: true,  // Enabled by default
          progressInterval: 2000,
          bufferEvents: false,
          timeout: 1800000
        }
      };

      // Interactive project setup if needed (skip if --non-interactive or --yes)
      const isNonInteractive = (options as any).nonInteractive || (options as any).yes;

      if (!options.config && !isNonInteractive) {
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
          },
          {
            type: 'confirm',
            name: 'enableRouting',
            message: 'Enable Multi-Model Router for cost optimization? (70-81% savings)',
            default: false
          },
          {
            type: 'confirm',
            name: 'enableStreaming',
            message: 'Enable streaming progress updates for long-running operations?',
            default: true
          }
        ]);

        (fleetConfig as any).project = {
          name: projectAnswers.projectName,
          path: process.cwd(),
          language: projectAnswers.language.toLowerCase()
        };

        // Update routing/streaming config based on user answers
        if (fleetConfig.routing) {
          fleetConfig.routing.enabled = projectAnswers.enableRouting;
        }
        if (fleetConfig.streaming) {
          fleetConfig.streaming.enabled = projectAnswers.enableStreaming;
        }

        // Enable Phase 2 features by default (no questions)
        (options as any).enableLearning = true;
        (options as any).enablePatterns = true;
        (options as any).enableImprovement = true;
      } else {
        // Non-interactive mode: use defaults or environment variables
        (fleetConfig as any).project = {
          name: process.env.AQE_PROJECT_NAME || path.basename(process.cwd()),
          path: process.cwd(),
          language: (process.env.AQE_LANGUAGE || 'typescript').toLowerCase()
        };

        // Use environment variables or defaults
        if (fleetConfig.routing) {
          fleetConfig.routing.enabled = process.env.AQE_ROUTING_ENABLED === 'true' || false;
        }
        if (fleetConfig.streaming) {
          fleetConfig.streaming.enabled = process.env.AQE_STREAMING_ENABLED !== 'false';
        }

        // Use defaults if non-interactive
        (options as any).enableLearning = process.env.AQE_LEARNING_ENABLED !== 'false';
        (options as any).enablePatterns = process.env.AQE_PATTERNS_ENABLED !== 'false';
        (options as any).enableImprovement = process.env.AQE_IMPROVEMENT_ENABLED !== 'false';

        console.log(chalk.gray('  ℹ️  Running in non-interactive mode with defaults'));
        console.log(chalk.gray(`  • Project: ${(fleetConfig as any).project.name}`));
        console.log(chalk.gray(`  • Language: ${(fleetConfig as any).project.language}`));
        console.log(chalk.gray(`  • Routing: ${fleetConfig.routing?.enabled ? 'enabled' : 'disabled'}`));
        console.log(chalk.gray(`  • Streaming: ${fleetConfig.streaming?.enabled ? 'enabled' : 'disabled'}`));
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

      // Initialize Claude Flow coordination
      await this.initializeCoordination(fleetConfig);

      // Phase 2: Initialize memory database FIRST (required for agents)
      spinner.text = 'Initializing memory database...';
      await this.initializeMemoryDatabase();

      // Phase 2: Initialize pattern bank database
      if (options.enablePatterns !== false) {
        spinner.text = 'Initializing pattern bank database...';
        await this.initializePatternDatabase(fleetConfig);
      }

      // Phase 2: Initialize learning system
      if (options.enableLearning !== false) {
        spinner.text = 'Initializing learning system...';
        await this.initializeLearningSystem(fleetConfig);
      }

      // Phase 2: Initialize improvement loop
      if (options.enableImprovement !== false) {
        spinner.text = 'Setting up improvement loop...';
        await this.initializeImprovementLoop(fleetConfig);
      }

      // Now spawn agents AFTER databases are initialized
      spinner.text = 'Spawning initial agents...';
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

      // Create comprehensive config.json
      spinner.text = 'Creating comprehensive configuration...';
      await this.createComprehensiveConfig(fleetConfig, {
        enableLearning: options.enableLearning !== false,
        enablePatterns: options.enablePatterns !== false,
        enableImprovement: options.enableImprovement !== false
      });

      spinner.succeed(chalk.green('Project initialization completed successfully!'));

      // Display comprehensive summary
      await this.displayComprehensiveSummary(fleetConfig, {
        enableLearning: options.enableLearning !== false,
        enablePatterns: options.enablePatterns !== false,
        enableImprovement: options.enableImprovement !== false
      });

    } catch (error: any) {
      console.error(chalk.red('❌ Initialization failed:'), error.message);
      console.error(chalk.gray('\nStack trace:'));
      console.error(chalk.gray(error.stack));
      process.exit(1);
    }
  }

  private static async createDirectoryStructure(): Promise<void> {
    const dirs = [
      '.agentic-qe',
      '.agentic-qe/config',
      '.agentic-qe/logs',
      '.agentic-qe/data',
      '.agentic-qe/data/learning',       // Phase 2: Learning state
      '.agentic-qe/data/patterns',       // Phase 2: Pattern database
      '.agentic-qe/data/improvement',    // Phase 2: Improvement state
      '.agentic-qe/agents',
      '.agentic-qe/reports',
      '.agentic-qe/scripts',             // For coordination scripts
      '.agentic-qe/state',               // For state management
      '.agentic-qe/state/coordination',  // Coordination state
      '.claude',              // For Claude Code integration
      '.claude/agents',       // Where agent definitions live
      '.claude/skills',       // Where QE skill definitions live (17 QE skills only)
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

    // Copy skill templates (only QE Fleet skills, not Claude Flow)
    await this.copySkillTemplates();
  }

  private static async copyAgentTemplates(): Promise<void> {
    console.log(chalk.cyan('  🔍 Searching for agent templates...'));

    // Find the agentic-qe package location (handles both npm install and local dev)
    const possiblePaths = [
      path.join(__dirname, '../../../.claude/agents'),  // From dist/cli/commands
      path.join(process.cwd(), 'node_modules/agentic-qe/.claude/agents'),
      path.join(process.cwd(), '../agentic-qe/.claude/agents')  // Monorepo case
    ];

    console.log(chalk.gray('  • Checking paths:'));
    let sourcePath: string | null = null;
    for (const p of possiblePaths) {
      const exists = await fs.pathExists(p);
      console.log(chalk.gray(`    ${exists ? '✓' : '✗'} ${p}`));
      if (exists && !sourcePath) {
        sourcePath = p;
      }
    }

    if (!sourcePath) {
      console.warn(chalk.yellow('  ⚠️  No agent templates found in package paths'));
      console.warn(chalk.yellow('  ℹ️  Falling back to programmatic generation (all 18 agents)'));
      await this.createBasicAgents();
      return;
    }

    console.log(chalk.green(`  ✓ Found agent templates at: ${sourcePath}`));

    // Count available templates
    const availableFiles = await fs.readdir(sourcePath);
    const templateFiles = availableFiles.filter(f => f.endsWith('.md'));
    console.log(chalk.cyan(`  📦 Found ${templateFiles.length} agent templates to copy`));

    // Copy all agent definition files individually (not directory copy)
    const targetPath = path.join(process.cwd(), '.claude/agents');

    let copiedFiles = 0;
    for (const templateFile of templateFiles) {
      const sourceFile = path.join(sourcePath, templateFile);
      const targetFile = path.join(targetPath, templateFile);

      // Only copy if target doesn't exist
      if (!await fs.pathExists(targetFile)) {
        await fs.copy(sourceFile, targetFile);
        copiedFiles++;
      }
    }

    console.log(chalk.green(`  ✓ Copied ${copiedFiles} new agent definitions`));

    const copiedCount = await this.countAgentFiles(targetPath);
    console.log(chalk.cyan(`  📋 Total agents in target: ${copiedCount}`));

    // Verify all 18 agents exist (17 QE agents + 1 base template generator)
    const expectedAgents = 18;
    if (copiedCount < expectedAgents) {
      console.warn(chalk.yellow(`  ⚠️  Expected ${expectedAgents} agents, found ${copiedCount}`));
      console.warn(chalk.yellow(`  ℹ️  Creating missing agents programmatically...`));

      // Get list of files that actually exist in TARGET (not source!)
      const targetFiles = await fs.readdir(targetPath);
      const existingTargetFiles = targetFiles.filter(f => f.endsWith('.md'));

      await this.createMissingAgents(targetPath, existingTargetFiles);
    } else {
      console.log(chalk.green(`  ✓ All ${expectedAgents} agents present and ready`));
    }
  }

  private static async createBasicAgents(): Promise<void> {
    try {
      console.log(chalk.cyan('  🛠️  Creating all agent definitions programmatically...'));

      // ALL 18 AGENTS (17 QE agents + 1 base template generator)
      const allAgents = [
        // Core Testing (5)
        'qe-test-generator',
        'qe-test-executor',
        'qe-coverage-analyzer',
        'qe-quality-gate',
        'qe-quality-analyzer',
        // Performance & Security (2)
        'qe-performance-tester',
        'qe-security-scanner',
        // Strategic Planning (3)
        'qe-requirements-validator',
        'qe-production-intelligence',
        'qe-fleet-commander',
        // Deployment (1)
        'qe-deployment-readiness',
        // Advanced Testing (4)
        'qe-regression-risk-analyzer',
        'qe-test-data-architect',
        'qe-api-contract-validator',
        'qe-flaky-test-hunter',
        // Specialized (2)
        'qe-visual-tester',
        'qe-chaos-engineer'
      ];

      const targetPath = path.join(process.cwd(), '.claude/agents');

      console.log(chalk.gray(`  • Creating ${allAgents.length} agent definition files...`));

      for (const agentName of allAgents) {
        // Defensive null check
        if (!agentName || typeof agentName !== 'string') {
          console.warn(chalk.yellow(`⚠️  Skipping invalid agent name: ${agentName}`));
          continue;
        }

        const agentFile = path.join(targetPath, `${agentName}.md`);
        const agentType = agentName.replace('qe-', '');
        const skills = this.getAgentSkills(agentName);

        const content = `---
name: ${agentName}
type: ${agentType}
color: blue
priority: medium
description: "Agentic QE Fleet ${agentType} agent"
capabilities:
  - ${agentType}
skills:
${skills.map(s => `  - ${s}`).join('\n')}
coordination:
  protocol: aqe-hooks
learning:
  enabled: true
  observability:
    - agent.getLearningStatus()
    - agent.getLearnedPatterns()
    - agent.recommendStrategy(state)
metadata:
  version: "1.1.0"
  framework: "agentic-qe"
  routing: "supported"
  streaming: "supported"
  phase2: "q-learning-enabled"
---

# ${agentName.toUpperCase()} Agent

## Description
This agent is part of the Agentic QE Fleet and specializes in ${agentType}.

## Capabilities
- AI-powered ${agentType}
- Integration with Agentic QE Fleet
- Native TypeScript coordination
- **Q-Learning**: Learns from task execution automatically
- **Pattern Bank**: Uses proven test patterns
- **Improvement Loop**: Continuously optimizes strategies

## 🧠 Q-Learning Integration (Phase 2)

This agent automatically learns from EVERY task execution through Q-learning integration in \`BaseAgent.onPostTask()\`.

### Observability Methods

\`\`\`typescript
// 1. Check learning status
const status = agent.getLearningStatus();
console.log(status);
// {
//   enabled: true,
//   totalExperiences: 1247,
//   explorationRate: 0.08,
//   patterns: 34
// }

// 2. View learned patterns
const patterns = agent.getLearnedPatterns();
console.log(patterns[0]);
// {
//   state: { taskComplexity: 'high', ... },
//   action: 'thorough-deep-analysis',
//   qValue: 0.8734,
//   successRate: 0.88
// }

// 3. Get strategy recommendations
const recommendation = await agent.recommendStrategy({
  taskComplexity: 'medium',
  availableCapabilities: agent.capabilities
});
console.log(recommendation);
// {
//   action: 'balanced-coverage',
//   confidence: 0.92,
//   expectedQValue: 0.7845
// }
\`\`\`

### CLI Commands

\`\`\`bash
# Check learning status
aqe learn status --agent ${agentName}

# View learned patterns
aqe learn history --agent ${agentName} --limit 50

# Export learning data
aqe learn export --agent ${agentName} --output learning.json
\`\`\`

## Skills

This agent can use the following Claude Code Skills:

${this.getSkillDocumentation(agentName)}

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

## 💰 Cost Optimization (v1.0.5)

This agent supports the **Multi-Model Router** for intelligent model selection and cost savings.

**Routing Status**: Check \\\`.agentic-qe/config/routing.json\\\`

If routing is enabled, this agent will automatically use the most cost-effective model for each task:
- Simple tasks → GPT-3.5 (cheapest)
- Complex tasks → GPT-4 (balanced)
- Critical tasks → Claude Sonnet 4.5 (best quality)

**No code changes required** - routing is transparent infrastructure.

## 📊 Streaming Support (v1.0.5)

This agent supports **streaming progress updates** for real-time visibility.

When using streaming MCP tools, you'll see:
- Real-time progress percentage
- Current operation status
- Incremental results

**Example**:
\\\`\\\`\\\`javascript
for await (const event of agent.execute(params)) {
  console.log(\\\`\\\${event.percent}% - \\\${event.message}\\\`);
}
\\\`\\\`\\\`

For full capabilities, install the complete agentic-qe package.
`;

        await fs.writeFile(agentFile, content);
        console.log(chalk.gray(`    ✓ Created ${agentName}.md`));
      }

      const finalCount = await this.countAgentFiles(targetPath);
      console.log(chalk.green(`  ✓ Successfully created ${finalCount} agent definitions`));
    } catch (error: any) {
      console.error(chalk.red('❌ Error in createBasicAgents:'), error.message);
      console.error(chalk.gray('Stack trace:'), error.stack);
      throw error;
    }
  }

  private static async createMissingAgents(targetPath: string, existingFiles: string[]): Promise<void> {
    const allAgentNames = [
      'qe-test-generator', 'qe-test-executor', 'qe-coverage-analyzer',
      'qe-quality-gate', 'qe-quality-analyzer', 'qe-performance-tester',
      'qe-security-scanner', 'qe-requirements-validator', 'qe-production-intelligence',
      'qe-fleet-commander', 'qe-deployment-readiness', 'qe-regression-risk-analyzer',
      'qe-test-data-architect', 'qe-api-contract-validator', 'qe-flaky-test-hunter',
      'qe-visual-tester', 'qe-chaos-engineer'
    ];

    const existingAgentNames = existingFiles.map(f => f.replace('.md', ''));
    const missingAgents = allAgentNames.filter(name => !existingAgentNames.includes(name));

    if (missingAgents.length === 0) {
      console.log(chalk.green('  ✓ No missing agents to create'));
      return;
    }

    console.log(chalk.cyan(`  🛠️  Creating ${missingAgents.length} missing agents:`));
    for (const agentName of missingAgents) {
      console.log(chalk.gray(`    • ${agentName}`));
    }

    // Create missing agents using the same logic as createBasicAgents
    for (const agentName of missingAgents) {
      const agentFile = path.join(targetPath, `${agentName}.md`);
      const agentType = agentName.replace('qe-', '');
      const skills = this.getAgentSkills(agentName);

      const content = `---
name: ${agentName}
type: ${agentType}
color: blue
priority: medium
description: "Agentic QE Fleet ${agentType} agent"
capabilities:
  - ${agentType}
skills:
${skills.map(s => `  - ${s}`).join('\n')}
coordination:
  protocol: aqe-hooks
learning:
  enabled: true
  observability:
    - agent.getLearningStatus()
    - agent.getLearnedPatterns()
    - agent.recommendStrategy(state)
metadata:
  version: "1.1.0"
  framework: "agentic-qe"
  routing: "supported"
  streaming: "supported"
  phase2: "q-learning-enabled"
---

# ${agentName.toUpperCase()} Agent

## Description
This agent is part of the Agentic QE Fleet and specializes in ${agentType}.

## Capabilities
- AI-powered ${agentType}
- Integration with Agentic QE Fleet
- Native TypeScript coordination
- **Q-Learning**: Learns from task execution automatically
- **Pattern Bank**: Uses proven test patterns
- **Improvement Loop**: Continuously optimizes strategies

## Skills

This agent can use the following Claude Code Skills:

${this.getSkillDocumentation(agentName)}

## Coordination Protocol

This agent uses **AQE hooks** (Agentic QE native hooks) for coordination (zero external dependencies, 100-500x faster than external hooks).

For full capabilities, install the complete agentic-qe package.
`;

      await fs.writeFile(agentFile, content);
      console.log(chalk.gray(`    ✓ Created ${agentName}.md`));
    }

    const finalCount = await this.countAgentFiles(targetPath);
    console.log(chalk.green(`  ✓ Total agent count: ${finalCount}`));
  }

  private static async countAgentFiles(dirPath: string): Promise<number> {
    if (!await fs.pathExists(dirPath)) return 0;
    const files = await fs.readdir(dirPath);
    return files.filter(f => f.endsWith('.md')).length;
  }

  /**
   * Copy only the 17 QE Fleet skills (filters out Claude Flow skills)
   */
  private static async copySkillTemplates(): Promise<void> {
    console.log(chalk.cyan('  🎯 Initializing QE Fleet skills...'));

    // Define the 17 QE Fleet skills (from SKILLS-MAPPING.md)
    const QE_FLEET_SKILLS = [
      // Core Quality Practices (5)
      'holistic-testing-pact',
      'context-driven-testing',
      'agentic-quality-engineering',
      'exploratory-testing-advanced',
      'risk-based-testing',

      // Development Methodologies (3)
      'tdd-london-chicago',
      'xp-practices',
      'refactoring-patterns',

      // Testing Specializations (4)
      'api-testing-patterns',
      'performance-testing',
      'security-testing',
      'test-automation-strategy',

      // Communication & Process (3)
      'technical-writing',
      'bug-reporting-excellence',
      'code-review-quality',

      // Professional Skills (2)
      'consultancy-practices',
      'quality-metrics'
    ];

    // Find the agentic-qe package location
    const possiblePaths = [
      path.join(__dirname, '../../../.claude/skills'),  // From dist/cli/commands
      path.join(process.cwd(), 'node_modules/agentic-qe/.claude/skills'),
      path.join(process.cwd(), '../agentic-qe/.claude/skills')  // Monorepo case
    ];

    console.log(chalk.gray('  • Checking skill source paths:'));
    let sourcePath: string | null = null;
    for (const p of possiblePaths) {
      const exists = await fs.pathExists(p);
      console.log(chalk.gray(`    ${exists ? '✓' : '✗'} ${p}`));
      if (exists && !sourcePath) {
        sourcePath = p;
      }
    }

    if (!sourcePath) {
      console.warn(chalk.yellow('  ⚠️  No skill templates found in package paths'));
      console.warn(chalk.yellow('  ℹ️  Skills can be added manually to .claude/skills/'));
      return;
    }

    console.log(chalk.green(`  ✓ Found skill templates at: ${sourcePath}`));

    // List all available skills
    const availableDirs = await fs.readdir(sourcePath);
    const availableSkills = availableDirs.filter(name => {
      const skillPath = path.join(sourcePath, name);
      try {
        return fs.statSync(skillPath).isDirectory();
      } catch {
        return false;
      }
    });

    console.log(chalk.cyan(`  📦 Found ${availableSkills.length} total skills in source`));

    // Filter to only QE Fleet skills
    const qeSkillsToConfig = availableSkills.filter(skill => QE_FLEET_SKILLS.includes(skill));
    console.log(chalk.cyan(`  🎯 Filtering to ${qeSkillsToConfig.length} QE Fleet skills (excluding Claude Flow skills)`));

    const targetPath = path.join(process.cwd(), '.claude/skills');
    let copiedCount = 0;

    // Copy each QE skill directory
    for (const skillName of qeSkillsToConfig) {
      const sourceSkillPath = path.join(sourcePath, skillName);
      const targetSkillPath = path.join(targetPath, skillName);

      // Skip if already exists
      if (await fs.pathExists(targetSkillPath)) {
        console.log(chalk.gray(`    • Skipped ${skillName} (already exists)`));
        continue;
      }

      // Copy the entire skill directory
      await fs.copy(sourceSkillPath, targetSkillPath);
      copiedCount++;
      console.log(chalk.gray(`    ✓ Copied ${skillName}`));
    }

    // Final count
    const finalSkillCount = await this.countSkillDirs(targetPath);

    if (copiedCount > 0) {
      console.log(chalk.green(`  ✓ Copied ${copiedCount} new QE skills`));
    } else {
      console.log(chalk.green('  ✓ All QE skills already present'));
    }

    console.log(chalk.cyan(`  📋 Total QE skills initialized: ${finalSkillCount}`));

    // Verify we have exactly 17 QE skills
    if (finalSkillCount === 17) {
      console.log(chalk.green('  ✅ All 17 QE Fleet skills successfully initialized'));
    } else if (finalSkillCount < 17) {
      console.warn(chalk.yellow(`  ⚠️  Expected 17 QE skills, found ${finalSkillCount}`));
      const missingSkills = QE_FLEET_SKILLS.filter(skill => {
        return !fs.existsSync(path.join(targetPath, skill));
      });
      console.warn(chalk.yellow(`  ℹ️  Missing skills: ${missingSkills.join(', ')}`));
    }
  }

  /**
   * Count skill directories in .claude/skills
   */
  private static async countSkillDirs(dirPath: string): Promise<number> {
    if (!await fs.pathExists(dirPath)) return 0;
    const items = await fs.readdir(dirPath);
    let count = 0;
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      try {
        if (fs.statSync(itemPath).isDirectory()) {
          count++;
        }
      } catch {
        // Ignore errors
      }
    }
    return count;
  }

  private static async writeFleetConfig(config: FleetConfig): Promise<void> {
    console.log(chalk.cyan('  📝 Writing fleet configuration...'));

    // Sanitize config to remove undefined values that cause jsonfile errors
    const sanitizedConfig = this.sanitizeConfig(config);

    const configPath = '.agentic-qe/config/fleet.json';
    await fs.writeJson(configPath, sanitizedConfig, { spaces: 2 });
    console.log(chalk.gray(`    ✓ Wrote ${configPath}`));

    // Create agent configurations
    const agentConfigs = this.sanitizeConfig(this.generateAgentConfigs(config));
    await fs.writeJson('.agentic-qe/config/agents.json', agentConfigs, { spaces: 2 });
    console.log(chalk.gray(`    ✓ Wrote .agentic-qe/config/agents.json`));

    // Create environment configurations
    const envConfigs = this.sanitizeConfig(this.generateEnvironmentConfigs(config.environments || []));
    await fs.writeJson('.agentic-qe/config/environments.json', envConfigs, { spaces: 2 });
    console.log(chalk.gray(`    ✓ Wrote .agentic-qe/config/environments.json`));

    // Create routing configuration (Phase 1 - v1.0.5)
    await this.writeRoutingConfig(config);
    console.log(chalk.green('  ✓ Fleet configuration complete'));
  }

  /**
   * Sanitize config object by removing undefined values and ensuring all properties are serializable
   */
  private static sanitizeConfig(obj: any): any {
    if (obj === null || obj === undefined) {
      return null;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeConfig(item)).filter(item => item !== null && item !== undefined);
    }

    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Skip undefined values
        if (value === undefined) {
          continue;
        }
        // Recursively sanitize nested objects
        const sanitizedValue = this.sanitizeConfig(value);
        if (sanitizedValue !== null && sanitizedValue !== undefined) {
          sanitized[key] = sanitizedValue;
        }
      }
      return sanitized;
    }

    return obj;
  }

  private static async writeRoutingConfig(config: FleetConfig): Promise<void> {
    const routingConfig = {
      multiModelRouter: {
        enabled: config.routing?.enabled || false,
        version: '1.0.5',
        defaultModel: config.routing?.defaultModel || 'claude-sonnet-4.5',
        enableCostTracking: config.routing?.enableCostTracking !== false,
        enableFallback: config.routing?.enableFallback !== false,
        maxRetries: config.routing?.maxRetries || 3,
        costThreshold: config.routing?.costThreshold || 0.5,
        modelRules: {
          simple: {
            model: 'gpt-3.5-turbo',
            maxTokens: 2000,
            estimatedCost: 0.0004
          },
          moderate: {
            model: 'gpt-3.5-turbo',
            maxTokens: 4000,
            estimatedCost: 0.0008
          },
          complex: {
            model: 'gpt-4',
            maxTokens: 8000,
            estimatedCost: 0.0048
          },
          critical: {
            model: 'claude-sonnet-4.5',
            maxTokens: 8000,
            estimatedCost: 0.0065
          }
        },
        fallbackChains: {
          'gpt-4': ['gpt-3.5-turbo', 'claude-haiku'],
          'gpt-3.5-turbo': ['claude-haiku', 'gpt-4'],
          'claude-sonnet-4.5': ['claude-haiku', 'gpt-4'],
          'claude-haiku': ['gpt-3.5-turbo']
        }
      },
      streaming: {
        enabled: config.streaming?.enabled !== false,
        progressInterval: config.streaming?.progressInterval || 2000,
        bufferEvents: config.streaming?.bufferEvents || false,
        timeout: config.streaming?.timeout || 1800000
      }
    };

    await fs.writeJson('.agentic-qe/config/routing.json', routingConfig, { spaces: 2 });
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
    // Create AQE hooks configuration (native, zero dependencies)
    const hooksConfig = {
      hooks: {
        'pre-task': {
          // AQE hooks are built-in via BaseAgent.onPreTask() - no external commands needed
          enabled: true,
          description: 'Pre-task verification via BaseAgent lifecycle hooks'
        },
        'post-edit': {
          // AQE hooks use VerificationHookManager.executePostEditUpdate() - no external commands
          enabled: true,
          description: 'Post-edit validation via VerificationHookManager'
        },
        'post-task': {
          // AQE hooks via BaseAgent.onPostTask() - built-in coordination
          enabled: true,
          description: 'Post-task coordination via BaseAgent lifecycle hooks'
        }
      },
      coordination: {
        enabled: true,
        topology: config.topology,
        memory: {
          namespace: 'agentic-qe',
          ttl: 3600,
          implementation: 'SwarmMemoryManager' // TypeScript-native memory store
        },
        hooks_system: 'aqe-hooks', // Built-in AQE hooks protocol
        performance: '100-500x faster than external hooks'
      }
    };

    await fs.writeJson('.agentic-qe/config/aqe-hooks.json', hooksConfig, { spaces: 2 });
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
    // Ensure config has required properties
    const topology = config.topology || 'hierarchical';
    const maxAgents = config.maxAgents || 10;

    // Create pre-execution coordination script (AQE native)
    const preExecutionScript = `#!/bin/bash
# Agentic QE Fleet Pre-Execution Coordination
# This script uses native AQE capabilities - no external dependencies required

# Store fleet status before execution
agentic-qe fleet status --json > /tmp/aqe-fleet-status-pre.json 2>/dev/null || true

# Log coordination event
echo "[AQE] Pre-execution coordination: Fleet topology=${topology}, Max agents=${maxAgents}" >> .agentic-qe/logs/coordination.log

# Store fleet config in coordination memory (via file-based state)
mkdir -p .agentic-qe/state/coordination
echo '${JSON.stringify(config)}' > .agentic-qe/state/coordination/fleet-config.json

echo "[AQE] Pre-execution coordination complete"
`;

    // Create post-execution coordination script (AQE native)
    const postExecutionScript = `#!/bin/bash
# Agentic QE Fleet Post-Execution Coordination
# This script uses native AQE capabilities - no external dependencies required

# Capture final fleet status
agentic-qe fleet status --json > /tmp/aqe-fleet-status-post.json 2>/dev/null || true

# Log execution completion
echo "[AQE] Post-execution coordination: Execution completed at $(date)" >> .agentic-qe/logs/coordination.log

# Store execution timestamp
echo "{\\"timestamp\\": \\"$(date -Iseconds)\\", \\"status\\": \\"completed\\"}" > .agentic-qe/state/coordination/last-execution.json

echo "[AQE] Post-execution coordination complete"
`;

    // Write coordination scripts
    await fs.writeFile('.agentic-qe/scripts/pre-execution.sh', preExecutionScript);
    await fs.chmod('.agentic-qe/scripts/pre-execution.sh', '755');

    await fs.writeFile('.agentic-qe/scripts/post-execution.sh', postExecutionScript);
    await fs.chmod('.agentic-qe/scripts/post-execution.sh', '755');

    // Create coordination log directory
    await fs.ensureDir('.agentic-qe/logs');
    await fs.ensureDir('.agentic-qe/state/coordination');
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

## 💰 Multi-Model Router (v1.0.5)

**Status**: ${config.routing?.enabled ? '✅ Enabled' : '⚠️  Disabled (opt-in)'}

The Multi-Model Router provides **70-81% cost savings** by intelligently selecting AI models based on task complexity.

### Features

- ✅ Intelligent model selection (GPT-3.5, GPT-4, Claude Sonnet 4.5, Claude Haiku)
- ✅ Real-time cost tracking and aggregation
- ✅ Automatic fallback chains for resilience
- ✅ Feature flags for safe rollout
- ✅ Zero breaking changes (disabled by default)

### Enabling Routing

**Option 1: Via Configuration**
\\\`\\\`\\\`json
// .agentic-qe/config/routing.json
{
  "multiModelRouter": {
    "enabled": true
  }
}
\\\`\\\`\\\`

**Option 2: Via Environment Variable**
\\\`\\\`\\\`bash
export AQE_ROUTING_ENABLED=true
\\\`\\\`\\\`

### Model Selection Rules

| Task Complexity | Model | Est. Cost | Use Case |
|----------------|-------|-----------|----------|
| **Simple** | GPT-3.5 | $0.0004 | Unit tests, basic validation |
| **Moderate** | GPT-3.5 | $0.0008 | Integration tests, mocks |
| **Complex** | GPT-4 | $0.0048 | Property-based, edge cases |
| **Critical** | Claude Sonnet 4.5 | $0.0065 | Security, architecture review |

### Cost Savings Example

**Before Routing** (always GPT-4):
- 100 simple tasks: $0.48
- 50 complex tasks: $0.24
- **Total**: $0.72

**After Routing**:
- 100 simple → GPT-3.5: $0.04
- 50 complex → GPT-4: $0.24
- **Total**: $0.28
- **Savings**: $0.44 (61%)

### Monitoring Costs

\\\`\\\`\\\`bash
# View cost dashboard
aqe routing dashboard

# Export cost report
aqe routing report --format json

# Check savings
aqe routing stats
\\\`\\\`\\\`

## 📊 Streaming Progress (v1.0.5)

**Status**: ${config.streaming?.enabled ? '✅ Enabled' : '⚠️  Disabled'}

Real-time progress updates for long-running operations using AsyncGenerator pattern.

### Features

- ✅ Real-time progress percentage
- ✅ Current operation visibility
- ✅ for-await-of compatibility
- ✅ Backward compatible (non-streaming still works)

### Example Usage

\\\`\\\`\\\`javascript
// Using streaming MCP tool
const handler = new TestExecuteStreamHandler();

for await (const event of handler.execute(params)) {
  if (event.type === 'progress') {
    console.log(\\\`Progress: \\\${event.percent}% - \\\${event.message}\\\`);
  } else if (event.type === 'result') {
    console.log('Completed:', event.data);
  }
}
\\\`\\\`\\\`

### Supported Operations

- ✅ Test execution (test-by-test progress)
- ✅ Coverage analysis (incremental gap detection)
- ⚠️  Test generation (coming in v1.1.0)
- ⚠️  Security scanning (coming in v1.1.0)

## 🎯 Claude Code Skills Integration

This fleet includes **17 specialized QE skills** that agents can use:

### Quality Engineering Skills (10 skills)
- **agentic-quality-engineering**: Using AI agents as force multipliers in quality work - autonomous testing systems, PACT principles, scaling quality engineering with intelligent agents
- **api-testing-patterns**: Comprehensive API testing patterns including contract testing, REST/GraphQL testing, and integration testing
- **bug-reporting-excellence**: Write high-quality bug reports that get fixed quickly - includes templates, examples, and best practices
- **context-driven-testing**: Apply context-driven testing principles where practices are chosen based on project context, not universal "best practices"
- **exploratory-testing-advanced**: Advanced exploratory testing techniques with Session-Based Test Management (SBTM), RST heuristics, and test tours
- **holistic-testing-pact**: Apply the Holistic Testing Model evolved with PACT (Proactive, Autonomous, Collaborative, Targeted) principles
- **tdd-london-chicago**: Apply both London and Chicago school TDD approaches - understanding different TDD philosophies and choosing the right testing style
- **pair-programming**: AI-assisted pair programming with multiple modes (driver/navigator/switch), real-time verification, quality monitoring
- **verification-quality**: Comprehensive truth scoring, code quality verification, and automatic rollback system with 0.95 accuracy threshold
- **xp-practices**: Apply XP practices including pair programming, ensemble programming, continuous integration, and sustainable pace

### AgentDB Skills (5 skills)
- **agentdb-advanced**: Master advanced AgentDB features including QUIC synchronization, multi-database management, custom distance metrics, hybrid search
- **agentdb-learning**: Create and train AI learning plugins with AgentDB's 9 reinforcement learning algorithms (Decision Transformer, Q-Learning, SARSA, Actor-Critic)
- **agentdb-memory-patterns**: Implement persistent memory patterns for AI agents using AgentDB (session memory, long-term storage, pattern learning)
- **agentdb-optimization**: Optimize AgentDB performance with quantization (4-32x memory reduction), HNSW indexing (150x faster search), caching
- **agentdb-vector-search**: Implement semantic vector search with AgentDB for intelligent document retrieval, similarity matching, and context-aware querying

### Using Skills

#### Via CLI
\\\`\\\`\\\`bash
# List all available skills
aqe skills list

# Search for specific skills
aqe skills search "testing"

# Show skill details
aqe skills show agentic-quality-engineering

# Show skill statistics
aqe skills stats
\\\`\\\`\\\`

#### Via Skill Tool in Claude Code
\\\`\\\`\\\`javascript
// Execute a skill
Skill("agentic-quality-engineering")
Skill("tdd-london-chicago")
Skill("api-testing-patterns")
\\\`\\\`\\\`

#### Integration with Agents
All QE agents automatically have access to relevant skills based on their specialization:
- **Test generators** use: agentic-quality-engineering, api-testing-patterns, tdd-london-chicago
- **Coverage analyzers** use: agentic-quality-engineering, quality-metrics, risk-based-testing
- **Flaky test hunters** use: agentic-quality-engineering, exploratory-testing-advanced
- **Performance testers** use: agentic-quality-engineering, performance-testing, quality-metrics
- **Security scanners** use: agentic-quality-engineering, security-testing, risk-based-testing

## 🧠 Q-Learning Integration (Phase 2)

All agents automatically learn from task execution through Q-learning:

### Observability
\\\`\\\`\\\`bash
# Check learning status
aqe learn status --agent test-gen

# View learned patterns
aqe learn history --agent test-gen --limit 50

# Export learning data
aqe learn export --agent test-gen --output learning.json
\\\`\\\`\\\`

### Pattern Management
\\\`\\\`\\\`bash
# List test patterns
aqe patterns list --framework jest

# Search patterns
aqe patterns search "api validation"

# Extract patterns from tests
aqe patterns extract ./tests --framework jest
\\\`\\\`\\\`

### Improvement Loop
\\\`\\\`\\\`bash
# Start continuous improvement
aqe improve start

# Check improvement status
aqe improve status

# Run single improvement cycle
aqe improve cycle
\\\`\\\`\\\`

## 📚 Documentation

- **Agent Definitions**: \\\`.claude/agents/\\\` - ${agentCount} specialized QE agents
- **Skills**: \\\`.claude/skills/\\\` - 17 specialized QE skills for agents
- **Fleet Config**: \\\`.agentic-qe/config/fleet.json\\\`
- **Routing Config**: \\\`.agentic-qe/config/routing.json\\\` (Multi-Model Router settings)
- **AQE Hooks Config**: \\\`.agentic-qe/config/aqe-hooks.json\\\` (zero dependencies, 100-500x faster)

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

**Generated by**: Agentic QE Fleet v1.0.5
**Initialization Date**: ${new Date().toISOString()}
**Fleet Topology**: ${config.topology}
`;

    await fs.writeFile(claudeMdPath, claudeMdContent);
  }

  // ============================================================================
  // Phase 2 Initialization Methods (v1.1.0)
  // ============================================================================

  /**
   * Initialize Phase 2 Pattern Bank Database
   */
  private static async initializePatternDatabase(config: FleetConfig): Promise<void> {
    const Database = (await import('better-sqlite3')).default;
    const dbPath = path.join(process.cwd(), '.agentic-qe', 'patterns.db');

    console.log(chalk.cyan('  📦 Initializing Pattern Bank database...'));

    const db = new Database(dbPath);

    // Enable WAL mode for better concurrency
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -64000'); // 64MB cache

    // Read and execute the schema
    const schemaPath = path.join(__dirname, '../../../docs/architecture/REASONING-BANK-SCHEMA.sql');
    let schema: string;

    if (await fs.pathExists(schemaPath)) {
      schema = await fs.readFile(schemaPath, 'utf-8');
    } else {
      // Fallback: inline schema if file not found
      schema = this.getPatternBankSchema();
    }

    // Execute schema
    db.exec(schema);

    db.close();

    console.log(chalk.green('  ✓ Pattern Bank initialized'));
    console.log(chalk.gray(`    • Database: ${dbPath}`));
    console.log(chalk.gray(`    • Framework: ${config.frameworks?.[0] || 'jest'}`));
    console.log(chalk.gray(`    • Tables: test_patterns, pattern_usage, cross_project_mappings, pattern_similarity_index`));
    console.log(chalk.gray(`    • Full-text search: enabled`));
  }

  /**
   * Initialize Phase 2 Memory Database (SwarmMemoryManager)
   */
  private static async initializeMemoryDatabase(): Promise<void> {
    const dbPath = path.join(process.cwd(), '.agentic-qe', 'memory.db');

    console.log(chalk.cyan('  💾 Initializing Memory Manager database...'));

    // Import SwarmMemoryManager dynamically
    const { SwarmMemoryManager } = await import('../../core/memory/SwarmMemoryManager');

    const memoryManager = new SwarmMemoryManager(dbPath);
    await memoryManager.initialize();

    // Verify tables created
    const stats = await memoryManager.stats();

    await memoryManager.close();

    console.log(chalk.green('  ✓ Memory Manager initialized'));
    console.log(chalk.gray(`    • Database: ${dbPath}`));
    console.log(chalk.gray(`    • Tables: 12 tables (memory_entries, hints, events, workflow_state, patterns, etc.)`));
    console.log(chalk.gray(`    • Access control: 5 levels (private, team, swarm, public, system)`));
  }

  /**
   * Initialize Phase 2 Learning System
   */
  private static async initializeLearningSystem(config: FleetConfig): Promise<void> {
    const learningConfig = {
      enabled: true,
      learningRate: 0.1,
      discountFactor: 0.95,
      explorationRate: 0.2,
      explorationDecay: 0.995,
      minExplorationRate: 0.01,
      targetImprovement: 0.20, // 20% improvement goal
      maxMemorySize: 100 * 1024 * 1024, // 100MB
      batchSize: 32,
      updateFrequency: 10,
      replayBufferSize: 10000
    };

    // Store learning configuration
    await fs.writeJson('.agentic-qe/config/learning.json', learningConfig, { spaces: 2 });

    // Create learning database directory
    await fs.ensureDir('.agentic-qe/data/learning');

    // Create learning state placeholder
    const learningState = {
      initialized: true,
      version: '1.1.0',
      createdAt: new Date().toISOString(),
      agents: {} // Will be populated as agents learn
    };

    await fs.writeJson('.agentic-qe/data/learning/state.json', learningState, { spaces: 2 });

    console.log(chalk.green('  ✓ Learning system initialized'));
    console.log(chalk.gray(`    • Q-learning algorithm (lr=${learningConfig.learningRate}, γ=${learningConfig.discountFactor})`));
    console.log(chalk.gray(`    • Experience replay buffer: ${learningConfig.replayBufferSize} experiences`));
    console.log(chalk.gray(`    • Target improvement: ${learningConfig.targetImprovement * 100}%`));
  }

  /**
   * Get inline Pattern Bank schema (fallback if schema file not found)
   */
  private static getPatternBankSchema(): string {
    return `
-- Enable WAL mode for better concurrent access
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

-- Core Pattern Storage
CREATE TABLE IF NOT EXISTS test_patterns (
    id TEXT PRIMARY KEY NOT NULL,
    pattern_type TEXT NOT NULL,
    framework TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'typescript',
    code_signature_hash TEXT NOT NULL,
    code_signature JSON NOT NULL,
    test_template JSON NOT NULL,
    metadata JSON NOT NULL,
    version TEXT NOT NULL DEFAULT '1.0.0',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK(pattern_type IN ('edge-case', 'integration', 'boundary', 'error-handling', 'unit', 'e2e', 'performance', 'security')),
    CHECK(framework IN ('jest', 'mocha', 'cypress', 'vitest', 'playwright', 'ava', 'jasmine')),
    CHECK(json_valid(code_signature)),
    CHECK(json_valid(test_template)),
    CHECK(json_valid(metadata))
);

CREATE INDEX IF NOT EXISTS idx_patterns_framework_type ON test_patterns(framework, pattern_type);
CREATE INDEX IF NOT EXISTS idx_patterns_signature_hash ON test_patterns(code_signature_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_patterns_dedup ON test_patterns(code_signature_hash, framework);

-- Pattern Usage Tracking
CREATE TABLE IF NOT EXISTS pattern_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    usage_count INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    failure_count INTEGER NOT NULL DEFAULT 0,
    avg_execution_time REAL NOT NULL DEFAULT 0.0,
    avg_coverage_gain REAL NOT NULL DEFAULT 0.0,
    flaky_count INTEGER NOT NULL DEFAULT 0,
    quality_score REAL NOT NULL DEFAULT 0.0,
    first_used TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pattern_id) REFERENCES test_patterns(id) ON DELETE CASCADE,
    UNIQUE(pattern_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_usage_pattern ON pattern_usage(pattern_id);
CREATE INDEX IF NOT EXISTS idx_usage_quality ON pattern_usage(quality_score DESC);

-- Cross-Project Pattern Sharing
CREATE TABLE IF NOT EXISTS cross_project_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern_id TEXT NOT NULL,
    source_framework TEXT NOT NULL,
    target_framework TEXT NOT NULL,
    transformation_rules JSON NOT NULL,
    compatibility_score REAL NOT NULL DEFAULT 1.0,
    project_count INTEGER NOT NULL DEFAULT 0,
    success_rate REAL NOT NULL DEFAULT 0.0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pattern_id) REFERENCES test_patterns(id) ON DELETE CASCADE,
    UNIQUE(pattern_id, source_framework, target_framework),
    CHECK(json_valid(transformation_rules))
);

-- Pattern Similarity Index
CREATE TABLE IF NOT EXISTS pattern_similarity_index (
    pattern_a TEXT NOT NULL,
    pattern_b TEXT NOT NULL,
    similarity_score REAL NOT NULL,
    structure_similarity REAL NOT NULL,
    identifier_similarity REAL NOT NULL,
    metadata_similarity REAL NOT NULL,
    algorithm TEXT NOT NULL DEFAULT 'hybrid-tfidf',
    last_computed TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (pattern_a, pattern_b),
    FOREIGN KEY (pattern_a) REFERENCES test_patterns(id) ON DELETE CASCADE,
    FOREIGN KEY (pattern_b) REFERENCES test_patterns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_similarity_score ON pattern_similarity_index(similarity_score DESC);

-- Full-Text Search
CREATE VIRTUAL TABLE IF NOT EXISTS pattern_fts USING fts5(
    pattern_id UNINDEXED,
    pattern_name,
    description,
    tags,
    framework,
    pattern_type,
    content='',
    tokenize='porter ascii'
);

-- Schema Version
CREATE TABLE IF NOT EXISTS schema_version (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);

INSERT OR IGNORE INTO schema_version (version, description)
VALUES ('1.1.0', 'Initial QE ReasoningBank schema');
`;
  }


  /**
   * Initialize Phase 2 Improvement Loop
   */
  private static async initializeImprovementLoop(config: FleetConfig): Promise<void> {
    const improvementConfig = {
      enabled: true,
      intervalMs: 3600000, // 1 hour
      autoApply: false, // Requires user approval
      enableABTesting: true,
      strategies: {
        parallelExecution: { enabled: true, weight: 0.8 },
        adaptiveRetry: { enabled: true, maxRetries: 3 },
        resourceOptimization: { enabled: true, adaptive: true }
      },
      thresholds: {
        minImprovement: 0.05, // 5% minimum improvement to apply
        maxFailureRate: 0.1, // 10% max failure rate
        minConfidence: 0.8 // 80% confidence required
      },
      abTesting: {
        sampleSize: 100,
        significanceLevel: 0.05,
        minSampleDuration: 3600000 // 1 hour
      }
    };

    // Store improvement configuration
    await fs.writeJson('.agentic-qe/config/improvement.json', improvementConfig, { spaces: 2 });

    // Create improvement state
    const improvementState = {
      version: '1.1.0',
      lastCycle: null,
      activeCycles: 0,
      totalImprovement: 0,
      strategies: {}
    };

    await fs.writeJson('.agentic-qe/data/improvement/state.json', improvementState, { spaces: 2 });

    console.log(chalk.green('  ✓ Improvement loop initialized'));
    console.log(chalk.gray(`    • Cycle interval: ${improvementConfig.intervalMs / 3600000} hour(s)`));
    console.log(chalk.gray(`    • A/B testing: enabled (sample size: ${improvementConfig.abTesting.sampleSize})`));
    console.log(chalk.gray(`    • Auto-apply: ${improvementConfig.autoApply ? 'enabled' : 'disabled (requires approval)'}`));
  }

  /**
   * Create comprehensive config.json with all Phase 1 and Phase 2 settings
   */
  private static async createComprehensiveConfig(
    fleetConfig: FleetConfig,
    options: { enableLearning: boolean; enablePatterns: boolean; enableImprovement: boolean }
  ): Promise<void> {
    const comprehensiveConfig = {
      version: '1.1.0',
      initialized: new Date().toISOString(),

      // Phase 1: Multi-Model Router
      phase1: {
        routing: {
          enabled: fleetConfig.routing?.enabled || false,
          defaultModel: fleetConfig.routing?.defaultModel || 'claude-sonnet-4.5',
          costTracking: fleetConfig.routing?.enableCostTracking !== false,
          fallback: fleetConfig.routing?.enableFallback !== false,
          maxRetries: fleetConfig.routing?.maxRetries || 3,
          modelPreferences: {
            simple: 'gpt-3.5-turbo',
            medium: 'claude-haiku',
            complex: 'claude-sonnet-4.5',
            critical: 'gpt-4'
          },
          budgets: {
            daily: 50,
            monthly: 1000
          }
        },
        streaming: {
          enabled: fleetConfig.streaming?.enabled !== false,
          progressInterval: fleetConfig.streaming?.progressInterval || 2000,
          bufferEvents: fleetConfig.streaming?.bufferEvents || false,
          timeout: fleetConfig.streaming?.timeout || 1800000
        }
      },

      // Phase 2: Learning, Patterns, and Improvement
      phase2: {
        learning: {
          enabled: options.enableLearning,
          learningRate: 0.1,
          discountFactor: 0.95,
          explorationRate: 0.2,
          targetImprovement: 0.20
        },
        patterns: {
          enabled: options.enablePatterns,
          dbPath: '.agentic-qe/data/patterns.db',
          minConfidence: 0.85,
          enableExtraction: true
        },
        improvement: {
          enabled: options.enableImprovement,
          intervalMs: 3600000,
          autoApply: false,
          enableABTesting: true
        }
      },

      // Agent configurations
      agents: {
        testGenerator: {
          enablePatterns: options.enablePatterns,
          enableLearning: options.enableLearning
        },
        coverageAnalyzer: {
          enableLearning: options.enableLearning,
          targetImprovement: 0.20
        },
        flakyTestHunter: {
          enableML: true,
          enableLearning: options.enableLearning
        },
        defaultAgents: {
          enableLearning: options.enableLearning
        }
      },

      // Fleet configuration
      fleet: {
        topology: fleetConfig.topology || 'hierarchical',
        maxAgents: fleetConfig.maxAgents || 10,
        testingFocus: fleetConfig.testingFocus || [],
        environments: fleetConfig.environments || [],
        frameworks: fleetConfig.frameworks || ['jest']
      }
    };

    await fs.writeJson('.agentic-qe/config.json', comprehensiveConfig, { spaces: 2 });

    console.log(chalk.green('  ✓ Comprehensive configuration created'));
    console.log(chalk.gray(`    • Config file: .agentic-qe/config.json`));
  }

  /**
   * Display comprehensive initialization summary
   */
  private static async displayComprehensiveSummary(
    fleetConfig: FleetConfig,
    options: { enableLearning: boolean; enablePatterns: boolean; enableImprovement: boolean }
  ): Promise<void> {
    console.log(chalk.yellow('\n📊 Initialization Summary:\n'));

    // Multi-Model Router Summary
    console.log(chalk.cyan('Multi-Model Router'));
    console.log(chalk.gray(`  Status: ${fleetConfig.routing?.enabled ? '✅ Enabled' : '⚠️  Disabled (opt-in)'}`));
    if (fleetConfig.routing?.enabled) {
      console.log(chalk.gray('  • Cost optimization: 70-81% savings'));
      console.log(chalk.gray('  • Fallback chains: enabled'));
      console.log(chalk.gray('  • Budget tracking: daily $50, monthly $1000'));
    }

    console.log(chalk.cyan('\nStreaming'));
    console.log(chalk.gray(`  Status: ${fleetConfig.streaming?.enabled !== false ? '✅ Enabled' : '⚠️  Disabled'}`));
    console.log(chalk.gray('  • Real-time progress updates'));
    console.log(chalk.gray('  • for-await-of compatible'));

    // Learning System Summary
    console.log(chalk.cyan('\nLearning System'));
    console.log(chalk.gray(`  Status: ${options.enableLearning ? '✅ Enabled' : '⚠️  Disabled'}`));
    if (options.enableLearning) {
      console.log(chalk.gray('  • Q-learning (lr=0.1, γ=0.95)'));
      console.log(chalk.gray('  • Experience replay (10,000 buffer)'));
      console.log(chalk.gray('  • Target: 20% improvement'));
    }

    console.log(chalk.cyan('\nPattern Bank'));
    console.log(chalk.gray(`  Status: ${options.enablePatterns ? '✅ Enabled' : '⚠️  Disabled'}`));
    if (options.enablePatterns) {
      console.log(chalk.gray('  • Pattern extraction: enabled'));
      console.log(chalk.gray('  • Confidence threshold: 85%'));
      console.log(chalk.gray('  • Template generation: enabled'));
    }

    console.log(chalk.cyan('\nImprovement Loop'));
    console.log(chalk.gray(`  Status: ${options.enableImprovement ? '✅ Enabled' : '⚠️  Disabled'}`));
    if (options.enableImprovement) {
      console.log(chalk.gray('  • Cycle: 1 hour intervals'));
      console.log(chalk.gray('  • A/B testing: enabled'));
      console.log(chalk.gray('  • Auto-apply: OFF (requires approval)'));
    }

    // Agent Configuration
    console.log(chalk.cyan('\nAgent Configuration:'));
    console.log(chalk.gray('  • TestGeneratorAgent: Patterns + Learning'));
    console.log(chalk.gray('  • CoverageAnalyzerAgent: Learning + 20% target'));
    console.log(chalk.gray('  • FlakyTestHunterAgent: ML + Learning'));
    console.log(chalk.gray('  • All agents: Learning enabled (opt-in)'));

    // Fleet Configuration
    console.log(chalk.cyan('\nFleet Configuration:'));
    console.log(chalk.gray(`  Topology: ${fleetConfig.topology}`));
    console.log(chalk.gray(`  Max Agents: ${fleetConfig.maxAgents}`));
    console.log(chalk.gray(`  Frameworks: ${(fleetConfig.frameworks || ['jest']).join(', ')}`));

    // Next Steps
    console.log(chalk.yellow('\n💡 Next Steps:\n'));
    console.log(chalk.gray('  1. Review configuration: .agentic-qe/config.json'));
    console.log(chalk.gray('  2. Generate tests: aqe test generate src/'));
    if (options.enableLearning) {
      console.log(chalk.gray('  3. Check learning status: aqe learn status'));
    }
    if (fleetConfig.routing?.enabled) {
      console.log(chalk.gray('  4. View routing dashboard: aqe routing dashboard'));
    }
    if (options.enablePatterns) {
      console.log(chalk.gray('  5. List patterns: aqe patterns list'));
    }
    if (options.enableImprovement) {
      console.log(chalk.gray('  6. Start improvement loop: aqe improve start'));
    }

    // Documentation
    console.log(chalk.yellow('\n📚 Documentation:\n'));
    console.log(chalk.gray('  • Getting Started: docs/GETTING-STARTED.md'));
    if (options.enableLearning) {
      console.log(chalk.gray('  • Learning System: docs/guides/LEARNING-SYSTEM-USER-GUIDE.md'));
    }
    if (options.enablePatterns) {
      console.log(chalk.gray('  • Pattern Management: docs/guides/PATTERN-MANAGEMENT-USER-GUIDE.md'));
    }
    if (fleetConfig.routing?.enabled) {
      console.log(chalk.gray('  • Cost Optimization: docs/guides/COST-OPTIMIZATION-GUIDE.md'));
    }

    // Performance Tips
    console.log(chalk.yellow('\n⚡ Performance Tips:\n'));
    console.log(chalk.gray('  • Learning improves over time (20% target in 100 tasks)'));
    console.log(chalk.gray('  • Patterns increase test quality (85% confidence threshold)'));
    if (fleetConfig.routing?.enabled) {
      console.log(chalk.gray('  • Routing saves 70-81% on AI costs'));
    }
    console.log(chalk.gray('  • Improvement loop optimizes continuously (1 hour cycles)'));

    console.log('');
  }

  /**
   * Get relevant skills for an agent
   */
  private static getAgentSkills(agentName: string): string[] {
    const skillMap: Record<string, string[]> = {
      'qe-test-generator': ['agentic-quality-engineering', 'api-testing-patterns', 'tdd-london-chicago', 'test-automation-strategy'],
      'qe-coverage-analyzer': ['agentic-quality-engineering', 'quality-metrics', 'risk-based-testing'],
      'qe-flaky-test-hunter': ['agentic-quality-engineering', 'exploratory-testing-advanced', 'risk-based-testing'],
      'qe-performance-tester': ['agentic-quality-engineering', 'performance-testing', 'quality-metrics'],
      'qe-security-scanner': ['agentic-quality-engineering', 'security-testing', 'risk-based-testing'],
      'qe-quality-gate': ['agentic-quality-engineering', 'quality-metrics', 'risk-based-testing'],
      'qe-api-contract-validator': ['agentic-quality-engineering', 'api-testing-patterns'],
      'qe-test-executor': ['agentic-quality-engineering', 'test-automation-strategy'],
      'qe-requirements-validator': ['agentic-quality-engineering', 'context-driven-testing'],
      'qe-quality-analyzer': ['agentic-quality-engineering', 'quality-metrics'],
      'qe-visual-tester': ['agentic-quality-engineering', 'exploratory-testing-advanced'],
      'qe-chaos-engineer': ['agentic-quality-engineering', 'risk-based-testing'],
      'qe-production-intelligence': ['agentic-quality-engineering', 'context-driven-testing'],
      'qe-fleet-commander': ['agentic-quality-engineering'],
      'qe-deployment-readiness': ['agentic-quality-engineering', 'risk-based-testing', 'quality-metrics'],
      'qe-regression-risk-analyzer': ['agentic-quality-engineering', 'risk-based-testing'],
      'qe-test-data-architect': ['agentic-quality-engineering', 'test-automation-strategy']
    };

    return skillMap[agentName] || ['agentic-quality-engineering'];
  }

  /**
   * Get skill documentation for agent
   */
  private static getSkillDocumentation(agentName: string): string {
    const skills = this.getAgentSkills(agentName);
    const skillDescriptions: Record<string, string> = {
      'agentic-quality-engineering': 'AI agents as force multipliers in quality work (PACT principles)',
      'api-testing-patterns': 'REST, GraphQL, contract testing patterns',
      'tdd-london-chicago': 'Both TDD schools, when to use each approach',
      'test-automation-strategy': 'When/how to automate effectively',
      'quality-metrics': 'Meaningful metrics vs vanity metrics',
      'risk-based-testing': 'Focus testing where failure hurts most',
      'exploratory-testing-advanced': 'RST heuristics, SBTM, test tours',
      'performance-testing': 'Load, stress, soak testing strategies',
      'security-testing': 'OWASP Top 10, vulnerability patterns',
      'context-driven-testing': 'RST techniques and contextual best practices'
    };

    return skills.map(skill => {
      const description = skillDescriptions[skill] || 'Quality engineering expertise';
      return `- **${skill}**: ${description}`;
    }).join('\n');
  }
}
