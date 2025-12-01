/**
 * Documentation copying module
 *
 * Copies reference documentation to the project
 *
 * @module cli/init/documentation
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import { getPackageRoot } from './utils/path-utils';

/**
 * Copy reference documentation to project
 *
 * Copies agent reference, skills reference, and usage guides to .agentic-qe/docs
 */
export async function copyDocumentation(): Promise<void> {
  console.log(chalk.gray('  • Copying reference documentation'));

  const docsDir = '.agentic-qe/docs';
  await fs.ensureDir(docsDir);

  // 🔧 CENTRALIZED: Use getPackageRoot for robust package location
  let packageDocsPath: string;
  try {
    packageDocsPath = path.join(getPackageRoot(), 'docs', 'reference');
  } catch (error) {
    console.log(chalk.yellow('  ⚠️  Could not locate package root'));
    console.log(chalk.gray('    Creating minimal documentation stubs...'));
    await createMinimalDocs(docsDir);
    return;
  }

  // Check if source docs exist
  const sourceExists = await fs.pathExists(packageDocsPath);

  if (!sourceExists) {
    console.log(chalk.yellow('  ⚠️  Reference documentation not found in package'));
    console.log(chalk.gray('    Creating minimal documentation stubs...'));
    await createMinimalDocs(docsDir);
    return;
  }

  try {
    // Copy agent reference
    const agentsSource = path.join(packageDocsPath, 'agents.md');
    if (await fs.pathExists(agentsSource)) {
      await fs.copy(agentsSource, path.join(docsDir, 'agents.md'));
      console.log(chalk.gray('    • Agents reference'));
    }

    // Copy skills reference
    const skillsSource = path.join(packageDocsPath, 'skills.md');
    if (await fs.pathExists(skillsSource)) {
      await fs.copy(skillsSource, path.join(docsDir, 'skills.md'));
      console.log(chalk.gray('    • Skills reference'));
    }

    // Copy usage guide
    const usageSource = path.join(packageDocsPath, 'usage.md');
    if (await fs.pathExists(usageSource)) {
      await fs.copy(usageSource, path.join(docsDir, 'usage.md'));
      console.log(chalk.gray('    • Usage guide'));
    }

    console.log(chalk.green('  ✓ Documentation copied'));
  } catch (error: any) {
    console.log(chalk.yellow('  ⚠️  Error copying documentation'));
    console.log(chalk.gray(`    ${error.message}`));
    console.log(chalk.gray('    Creating minimal documentation stubs...'));
    await createMinimalDocs(docsDir);
  }
}

/**
 * Create minimal documentation stubs if package docs not available
 */
async function createMinimalDocs(docsDir: string): Promise<void> {
  // Minimal agents.md
  const agentsContent = `# Agentic QE Fleet - Agents Reference

## Available Agents

For the complete list of agents and their capabilities, please visit:
https://github.com/proffesor-for-testing/agentic-qe/blob/main/docs/reference/agents.md

## Quick Reference

- **qe-test-generator**: Generate comprehensive test suites
- **qe-coverage-analyzer**: Analyze and improve test coverage
- **qe-integration-tester**: Execute integration test scenarios
- **qe-performance-tester**: Performance and load testing
- **qe-security-scanner**: Security vulnerability scanning

Use \`aqe agent list\` to see all available agents.
`;

  // Minimal skills.md
  const skillsContent = `# Agentic QE Fleet - Skills Reference

## Available Skills

For the complete list of skills and their usage, please visit:
https://github.com/proffesor-for-testing/agentic-qe/blob/main/docs/reference/skills.md

## Quick Reference

- **agentic-quality-engineering**: Core QE principles with AI agents
- **tdd-london-chicago**: Test-driven development approaches
- **api-testing-patterns**: Comprehensive API testing strategies
- **brutal-honesty-review**: Unvarnished code review
- **sherlock-review**: Evidence-based investigation

Use \`aqe skills list\` to see all available skills.
`;

  // Minimal usage.md
  const usageContent = `# Agentic QE Fleet - Usage Guide

## Getting Started

For comprehensive usage examples and workflows, please visit:
https://github.com/proffesor-for-testing/agentic-qe/blob/main/docs/reference/usage.md

## Quick Commands

\`\`\`bash
# Initialize the fleet
aqe init

# Generate tests
aqe test generate src/

# Analyze coverage
aqe coverage analyze

# Check learning status
aqe learn status

# List learned patterns
aqe patterns list
\`\`\`

## MCP Server Integration

\`\`\`bash
# Add MCP server to Claude Code
claude mcp add agentic-qe npx aqe-mcp

# Verify connection
claude mcp list
\`\`\`

For more details, see the online documentation.
`;

  // Write minimal docs
  await fs.writeFile(path.join(docsDir, 'agents.md'), agentsContent, 'utf-8');
  await fs.writeFile(path.join(docsDir, 'skills.md'), skillsContent, 'utf-8');
  await fs.writeFile(path.join(docsDir, 'usage.md'), usageContent, 'utf-8');

  console.log(chalk.green('  ✓ Minimal documentation created'));
  console.log(chalk.gray('    • agents.md - Agent reference stub'));
  console.log(chalk.gray('    • skills.md - Skills reference stub'));
  console.log(chalk.gray('    • usage.md - Usage guide stub'));
}
