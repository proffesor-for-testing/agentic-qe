/**
 * Agent Template Management Module
 *
 * Handles copying and creation of QE Fleet agent templates from package to user project.
 * Extracted from init.ts for better modularity and maintainability.
 */

import chalk from 'chalk';
import * as fs from 'fs-extra';
import * as path from 'path';
import { FleetConfig } from '../../types';

/**
 * Copy agent templates from agentic-qe package to user's .claude/agents directory
 *
 * This function:
 * 1. Searches for agent templates in package locations
 * 2. Copies all agent definition files (.md) to .claude/agents
 * 3. Copies subagent definitions if they exist
 * 4. Creates missing agents programmatically if needed
 * 5. Validates all 19 expected agents are present
 *
 * @param config - Fleet configuration (currently unused but available for future enhancements)
 * @param force - If true, overwrites existing agent files
 */
export async function copyAgentTemplates(config?: FleetConfig, force: boolean = false): Promise<void> {
  console.log(chalk.cyan('  🔍 Searching for agent templates...'));

  // Find the agentic-qe package location (handles both npm install and local dev)
  const possiblePaths = [
    path.join(__dirname, '../../../.claude/agents'),  // From dist/cli/init
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
    console.warn(chalk.yellow('  ℹ️  Falling back to programmatic generation (all 20 agents)'));
    await createBasicAgents(force);
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
  let updatedFiles = 0;
  let skippedFiles = 0;
  for (const templateFile of templateFiles) {
    const sourceFile = path.join(sourcePath, templateFile);
    const targetFile = path.join(targetPath, templateFile);

    // Skip if source and target are the same file
    const sourceResolved = path.resolve(sourceFile);
    const targetResolved = path.resolve(targetFile);
    if (sourceResolved === targetResolved) {
      skippedFiles++;
      continue;
    }

    const targetExists = await fs.pathExists(targetFile);

    // Copy if target doesn't exist OR force flag is set
    if (!targetExists || force) {
      await fs.copy(sourceFile, targetFile);
      if (targetExists) {
        updatedFiles++;
      } else {
        copiedFiles++;
      }
    }
  }

  // Copy subagents folder if it exists
  const subagentsSourcePath = path.join(sourcePath, 'subagents');
  const subagentsTargetPath = path.join(targetPath, 'subagents');

  if (await fs.pathExists(subagentsSourcePath)) {
    console.log(chalk.cyan('  📦 Copying subagent definitions...'));
    await fs.ensureDir(subagentsTargetPath);

    const subagentFiles = await fs.readdir(subagentsSourcePath);
    const subagentTemplates = subagentFiles.filter(f => f.endsWith('.md'));

    let subagentsCopied = 0;
    let subagentsUpdated = 0;

    for (const subagentFile of subagentTemplates) {
      const sourceFile = path.join(subagentsSourcePath, subagentFile);
      const targetFile = path.join(subagentsTargetPath, subagentFile);

      const targetExists = await fs.pathExists(targetFile);

      if (!targetExists || force) {
        await fs.copy(sourceFile, targetFile);
        if (targetExists) {
          subagentsUpdated++;
        } else {
          subagentsCopied++;
        }
      }
    }

    if (force && subagentsUpdated > 0) {
      console.log(chalk.green(`  ✓ Updated ${subagentsUpdated} existing subagent definitions`));
    }
    console.log(chalk.green(`  ✓ Copied ${subagentsCopied} new subagent definitions (${subagentTemplates.length} total subagents)`));
  }

  // Copy n8n folder if it exists (n8n workflow testing agents)
  const n8nSourcePath = path.join(sourcePath, 'n8n');
  const n8nTargetPath = path.join(targetPath, 'n8n');

  if (await fs.pathExists(n8nSourcePath)) {
    console.log(chalk.cyan('  📦 Copying n8n workflow testing agent definitions...'));
    await fs.ensureDir(n8nTargetPath);

    const n8nFiles = await fs.readdir(n8nSourcePath);
    const n8nTemplates = n8nFiles.filter(f => f.endsWith('.md'));

    let n8nCopied = 0;
    let n8nUpdated = 0;

    for (const n8nFile of n8nTemplates) {
      const sourceFile = path.join(n8nSourcePath, n8nFile);
      const targetFile = path.join(n8nTargetPath, n8nFile);

      const targetExists = await fs.pathExists(targetFile);

      if (!targetExists || force) {
        await fs.copy(sourceFile, targetFile);
        if (targetExists) {
          n8nUpdated++;
        } else {
          n8nCopied++;
        }
      }
    }

    if (force && n8nUpdated > 0) {
      console.log(chalk.green(`  ✓ Updated ${n8nUpdated} existing n8n agent definitions`));
    }
    console.log(chalk.green(`  ✓ Copied ${n8nCopied} new n8n agent definitions (${n8nTemplates.length} total n8n agents)`));
  }

  if (force && updatedFiles > 0) {
    console.log(chalk.green(`  ✓ Updated ${updatedFiles} existing agent definitions`));
  }
  console.log(chalk.green(`  ✓ Copied ${copiedFiles} new agent definitions`));

  const copiedCount = await countAgentFiles(targetPath);
  console.log(chalk.cyan(`  📋 Total agents in target: ${copiedCount}`));

  // Verify all 18 agents exist (17 QE agents + 1 base template generator)
  const expectedAgents = 18;
  if (copiedCount < expectedAgents) {
    console.warn(chalk.yellow(`  ⚠️  Expected ${expectedAgents} agents, found ${copiedCount}`));
    console.warn(chalk.yellow(`  ℹ️  Creating missing agents programmatically...`));

    // Get list of files that actually exist in TARGET (not source!)
    const targetFiles = await fs.readdir(targetPath);
    const existingTargetFiles = targetFiles.filter(f => f.endsWith('.md'));

    await createMissingAgents(targetPath, existingTargetFiles, force);
  } else {
    console.log(chalk.green(`  ✓ All ${expectedAgents} agents present and ready`));
  }
}

/**
 * Create all 18 agent definitions programmatically when templates are not found
 */
async function createBasicAgents(force: boolean = false): Promise<void> {
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

      // Skip if file exists and force is not set
      if (!force && await fs.pathExists(agentFile)) {
        continue;
      }

      const agentType = agentName.replace('qe-', '');
      const skills = getAgentSkills(agentName);
      const description = getAgentDescription(agentName);

      const content = `---
name: ${agentName}
description: ${description}
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
//   state: "jest-unit-test",
//   action: "parallel-execution",
//   avgReward: 0.92,
//   useCount: 156
// }

// 3. Predict best action
const nextAction = agent.predictBestAction("jest-unit-test");
console.log(nextAction); // "parallel-execution"

// 4. Export learned knowledge
await agent.exportLearning("./learning-data.json");
\`\`\`

### Learning Behavior

**What it learns:**
- Test framework selection (Jest, Mocha, Vitest)
- Execution strategies (parallel vs sequential)
- Coverage optimization paths
- Flaky test patterns
- Performance bottlenecks

**How it learns:**
1. Execute task → observe outcome
2. Calculate reward (success=1.0, failure=0.0, partial=0.5)
3. Update Q-table: Q(s,a) = Q(s,a) + α[r + γmax Q(s',a') - Q(s,a)]
4. Gradually reduce exploration (ε-greedy)

**Continuous improvement:**
- Initially explores different strategies (ε=0.2)
- Converges to best-performing actions (ε→0.01)
- Persists learning across sessions via AgentDB
- Shares successful patterns with fleet via \`aqe/patterns/\` namespace

## Skills

This agent can use the following Claude Code Skills:

${getSkillDocumentation(agentName)}

## Coordination Protocol

This agent uses **AQE hooks** (Agentic QE native hooks) for coordination (zero external dependencies, 100-500x faster than external hooks).

## Code Execution Workflows

Instead of multiple MCP tool calls, write code to orchestrate ${agentType} workflows. This approach is **352x faster** (Agent Booster WASM) and reduces token usage by 98.7%.

### Basic Workflow

\\\`\\\`\\\`typescript
import { /* tools */ } from './servers/qe-tools/${agentType}';

// Example workflow code
const result = await executeWorkflow({
  type: '${agentType}',
  config: { /* ... */ }
});
\\\`\\\`\\\`

## Integration with Agentic QE CLI

\`\`\`bash
# Use this agent via CLI
aqe ${agentType} --help

# Or spawn programmatically
aqe fleet spawn ${agentName}
\`\`\`

## Memory Coordination

Uses the **\`aqe/*\` memory namespace** for state sharing:
- \`aqe/test-plan/*\` - Test requirements
- \`aqe/coverage/*\` - Coverage data
- \`aqe/quality/*\` - Quality metrics
- \`aqe/patterns/*\` - Learned patterns (Phase 2)
- \`aqe/learning/${agentName}\` - Q-learning state (Phase 2)
- \`aqe/swarm/coordination\` - Cross-agent sync

## CLI Integration

This agent is fully integrated with the AQE CLI and can be invoked programmatically or interactively.

### Direct Execution
\`\`\`bash
# Execute via CLI
aqe ${agentType} [options]

# Example
aqe test-generator --framework jest --coverage 80
\`\`\`

### Programmatic Usage
\`\`\`typescript
import { ${agentName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')} } from 'agentic-qe';

const agent = new ${agentName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}();
const result = await agent.execute({ /* config */ });
\`\`\`
`;

      await fs.writeFile(agentFile, content);
    }

    const finalCount = await countAgentFiles(targetPath);
    console.log(chalk.green(`  ✓ Created ${finalCount} agent definitions successfully`));

  } catch (error) {
    console.error(chalk.red(`  ❌ Error creating basic agents: ${error}`));
    throw error;
  }
}

/**
 * Create only the missing agents that don't exist in target directory
 */
async function createMissingAgents(targetPath: string, existingFiles: string[], force: boolean = false): Promise<void> {
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
    const skills = getAgentSkills(agentName);
    const description = getAgentDescription(agentName);

    const content = `---
name: ${agentName}
description: ${description}
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

${getSkillDocumentation(agentName)}

## Coordination Protocol

This agent uses **AQE hooks** (Agentic QE native hooks) for coordination (zero external dependencies, 100-500x faster than external hooks).

## Code Execution Workflows

Instead of multiple MCP tool calls, write code to orchestrate ${agentType} workflows. This approach is **352x faster** (Agent Booster WASM) and reduces token usage by 98.7%.

### Basic Workflow

\\\`\\\`\\\`typescript
import { /* tools */ } from './servers/qe-tools/${agentType}';

// Example workflow code
const result = await executeWorkflow({
  type: '${agentType}',
  config: { /* ... */ }
});
\\\`\\\`\\\`
`;

    await fs.writeFile(agentFile, content);
  }

  console.log(chalk.green(`  ✓ Created ${missingAgents.length} missing agents successfully`));
}

/**
 * Count agent files in a directory
 */
async function countAgentFiles(dirPath: string): Promise<number> {
  if (!await fs.pathExists(dirPath)) return 0;
  const files = await fs.readdir(dirPath);
  return files.filter(f => f.endsWith('.md')).length;
}

/**
 * Get agent description based on agent name
 */
function getAgentDescription(agentName: string): string {
  const descriptions: Record<string, string> = {
    'qe-test-generator': 'AI-powered test generation agent with sublinear optimization and multi-framework support',
    'qe-test-executor': 'Multi-framework test executor with parallel execution, retry logic, and real-time reporting',
    'qe-coverage-analyzer': 'AI-powered coverage analysis with sublinear gap detection and critical path optimization',
    'qe-quality-gate': 'Intelligent quality gate with risk assessment, policy validation, and automated decision-making',
    'qe-quality-analyzer': 'Comprehensive quality metrics analysis with trend detection, predictive analytics, and actionable insights',
    'qe-performance-tester': 'Multi-tool performance testing with load orchestration, bottleneck detection, and SLA validation',
    'qe-security-scanner': 'Multi-layer security scanning with SAST/DAST, vulnerability detection, and compliance validation',
    'qe-requirements-validator': 'Validates requirements testability and generates BDD scenarios before development begins',
    'qe-production-intelligence': 'Converts production data into test scenarios through incident replay and RUM analysis',
    'qe-fleet-commander': 'Hierarchical fleet coordinator for 50+ agent orchestration with dynamic topology management and resource optimization',
    'qe-deployment-readiness': 'Aggregates quality signals to provide deployment risk assessment and go/no-go decisions',
    'qe-regression-risk-analyzer': 'Analyzes code changes to predict regression risk and intelligently select minimal test suites',
    'qe-test-data-architect': 'Generates realistic test data with privacy masking, edge case coverage, and database seeding',
    'qe-api-contract-validator': 'Contract testing with OpenAPI/GraphQL schema validation, breaking change detection, and consumer impact analysis',
    'qe-flaky-test-hunter': 'Detects, isolates, and auto-heals flaky tests through statistical analysis and root cause detection',
    'qe-visual-tester': 'Visual regression testing with AI-powered diff analysis, responsive validation, and accessibility checks',
    'qe-chaos-engineer': 'Chaos testing with fault injection, resilience validation, and disaster recovery testing'
  };

  return descriptions[agentName] || `AI-powered ${agentName.replace('qe-', '')} agent`;
}

/**
 * Get skills assigned to each agent
 */
function getAgentSkills(agentName: string): string[] {
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
function getSkillDocumentation(agentName: string): string {
  const skills = getAgentSkills(agentName);
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
