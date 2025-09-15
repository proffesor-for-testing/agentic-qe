import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';

const execAsync = promisify(exec);

interface DeploymentResults {
  successful: string[];
  failed: string[];
}

interface ExecResult {
  stdout: string;
  stderr: string;
}

const agents: string[] = [
  'requirements-explorer',
  'exploratory-testing-navigator',
  'tdd-pair-programmer',
  'deployment-guardian',
  'risk-oracle',
  'production-observer'
];

async function deployAgent(agentName: string): Promise<boolean> {
  const agentPath = path.join(__dirname, '..', 'agents', agentName);
  const configPath = path.join(agentPath, 'agent.yaml');

  try {
    await fs.access(configPath);
  } catch {
    console.log(chalk.yellow(`⚠️  Agent ${agentName} config not found at ${configPath}`));
    return false;
  }

  console.log(chalk.blue(`🚀 Deploying ${agentName}...`));

  try {
    // Check if claude-flow CLI is available
    await execAsync('npx claude-flow --version');

    // Deploy the agent
    const { stdout, stderr }: ExecResult = await execAsync(`npx claude-flow agent deploy ${agentPath}`);

    if (stderr) {
      console.log(chalk.yellow(`Warning: ${stderr}`));
    }

    console.log(chalk.green(`✓ ${agentName} deployed successfully`));
    if (stdout) {
      console.log(stdout);
    }

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`✗ Failed to deploy ${agentName}: ${errorMessage}`));
    return false;
  }
}

async function deployAllAgents(): Promise<void> {
  console.log(chalk.blue('🤖 Deploying Agentic QE Agents\n'));

  const results: DeploymentResults = {
    successful: [],
    failed: []
  };

  for (const agent of agents) {
    const success = await deployAgent(agent);
    if (success) {
      results.successful.push(agent);
    } else {
      results.failed.push(agent);
    }
    console.log('');
  }

  console.log(chalk.blue('\n📊 Deployment Summary:'));
  console.log(chalk.green(`✓ Successful: ${results.successful.length}`));
  if (results.successful.length > 0) {
    results.successful.forEach(agent => {
      console.log(`  • ${agent}`);
    });
  }

  if (results.failed.length > 0) {
    console.log(chalk.red(`\n✗ Failed: ${results.failed.length}`));
    results.failed.forEach(agent => {
      console.log(`  • ${agent}`);
    });
  }

  const exitCode = results.failed.length > 0 ? 1 : 0;
  process.exit(exitCode);
}

async function main(): Promise<void> {
  // Check for specific agent deployment
  const specificAgent = process.argv[2];

  if (specificAgent) {
    if (agents.includes(specificAgent)) {
      try {
        const success = await deployAgent(specificAgent);
        process.exit(success ? 0 : 1);
      } catch (error) {
        console.error(chalk.red(`Error deploying ${specificAgent}:`, error));
        process.exit(1);
      }
    } else {
      console.log(chalk.red(`Unknown agent: ${specificAgent}`));
      console.log(chalk.yellow(`Available agents: ${agents.join(', ')}`));
      process.exit(1);
    }
  } else {
    await deployAllAgents();
  }
}

// Run the main function if this script is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red('Unexpected error:'), error);
    process.exit(1);
  });
}

export { deployAgent, deployAllAgents, agents };