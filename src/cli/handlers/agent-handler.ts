/**
 * Agentic QE v3 - Agent Command Handler
 *
 * Handles the 'aqe agent' command group for agent management.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  ICommandHandler,
  CLIContext,
  getStatusColor,
} from './interfaces.js';
import { DomainName } from '../../shared/types/index.js';
import { createTimedSpinner } from '../utils/progress.js';

// ============================================================================
// Agent Handler
// ============================================================================

export class AgentHandler implements ICommandHandler {
  readonly name = 'agent';
  readonly description = 'Manage QE agents';

  private cleanupAndExit: (code: number) => Promise<never>;
  private ensureInitialized: () => Promise<boolean>;

  constructor(
    cleanupAndExit: (code: number) => Promise<never>,
    ensureInitialized: () => Promise<boolean>
  ) {
    this.cleanupAndExit = cleanupAndExit;
    this.ensureInitialized = ensureInitialized;
  }

  register(program: Command, context: CLIContext): void {
    const agentCmd = program
      .command('agent')
      .description(this.description);

    // agent list
    agentCmd
      .command('list')
      .description('List all agents')
      .option('-d, --domain <domain>', 'Filter by domain')
      .option('-s, --status <status>', 'Filter by status')
      .action(async (options) => {
        await this.executeList(options, context);
      });

    // agent spawn
    agentCmd
      .command('spawn <domain>')
      .description('Spawn an agent in a domain')
      .option('-t, --type <type>', 'Agent type', 'worker')
      .option('-c, --capabilities <caps>', 'Comma-separated capabilities', 'general')
      .option('--no-progress', 'Disable progress indicator')
      .action(async (domain: string, options) => {
        await this.executeSpawn(domain, options, context);
      });
  }

  private async executeList(options: ListOptions, context: CLIContext): Promise<void> {
    if (!await this.ensureInitialized()) return;

    try {
      let agents = options.domain
        ? context.queen!.getAgentsByDomain(options.domain as DomainName)
        : context.queen!.listAllAgents();

      if (options.status) {
        agents = agents.filter(a => a.status === options.status);
      }

      console.log(chalk.blue(`\n  Agents (${agents.length})\n`));

      if (agents.length === 0) {
        console.log(chalk.gray('  No agents found'));
      } else {
        // Group by domain
        const byDomain = new Map<DomainName, typeof agents>();
        for (const agent of agents) {
          if (!byDomain.has(agent.domain)) {
            byDomain.set(agent.domain, []);
          }
          byDomain.get(agent.domain)!.push(agent);
        }

        const domainEntries = Array.from(byDomain.entries());
        for (const [domain, domainAgents] of domainEntries) {
          console.log(chalk.cyan(`  ${domain}:`));
          for (const agent of domainAgents) {
            console.log(`    ${agent.id}`);
            console.log(`      Type: ${agent.type}`);
            console.log(`      Status: ${getStatusColor(agent.status)}`);
            if (agent.startedAt) {
              console.log(chalk.gray(`      Started: ${agent.startedAt.toISOString()}`));
            }
          }
          console.log('');
        }
      }

    } catch (error) {
      console.error(chalk.red('\n  Failed to list agents:'), error);
      await this.cleanupAndExit(1);
    }
  }

  private async executeSpawn(domain: string, options: SpawnOptions, context: CLIContext): Promise<void> {
    if (!await this.ensureInitialized()) return;

    try {
      const capabilities = options.capabilities.split(',');

      console.log(chalk.blue(`\n  Spawning agent in ${domain}...\n`));

      // Use spinner for spawn operation
      const spinner = options.progress !== false
        ? createTimedSpinner(`Spawning ${options.type} agent`)
        : null;

      const result = await context.queen!.requestAgentSpawn(
        domain as DomainName,
        options.type,
        capabilities
      );

      if (spinner) {
        if (result.success) {
          spinner.succeed(`Agent spawned successfully`);
        } else {
          spinner.fail(`Failed to spawn agent`);
        }
      }

      if (result.success) {
        console.log(chalk.cyan(`   ID: ${result.value}`));
        console.log(chalk.gray(`   Domain: ${domain}`));
        console.log(chalk.gray(`   Type: ${options.type}`));
        console.log(chalk.gray(`   Capabilities: ${capabilities.join(', ')}`));
      } else {
        console.log(chalk.red(`   Error: ${(result as { success: false; error: Error }).error.message}`));
      }

      console.log('');

    } catch (error) {
      console.error(chalk.red('\n  Failed to spawn agent:'), error);
      await this.cleanupAndExit(1);
    }
  }

  getHelp(): string {
    return `
Manage QE agents including listing and spawning.

Usage:
  aqe agent <command> [options]

Commands:
  list              List all agents
  spawn <domain>    Spawn an agent in a domain

List Options:
  -d, --domain <domain>    Filter by domain
  -s, --status <status>    Filter by status

Spawn Options:
  -t, --type <type>              Agent type (default: worker)
  -c, --capabilities <caps>      Comma-separated capabilities (default: general)
  --no-progress                  Disable progress indicator

Examples:
  aqe agent list
  aqe agent list --domain test-generation
  aqe agent list --status running
  aqe agent spawn test-generation --type worker
  aqe agent spawn coverage-analysis --capabilities analysis,reporting
`;
  }
}

// ============================================================================
// Types
// ============================================================================

interface ListOptions {
  domain?: string;
  status?: string;
}

interface SpawnOptions {
  type: string;
  capabilities: string;
  progress?: boolean;
}

// ============================================================================
// Factory
// ============================================================================

export function createAgentHandler(
  cleanupAndExit: (code: number) => Promise<never>,
  ensureInitialized: () => Promise<boolean>
): AgentHandler {
  return new AgentHandler(cleanupAndExit, ensureInitialized);
}
