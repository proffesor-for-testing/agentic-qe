#!/usr/bin/env node

/**
 * Agentic QE v3 - Command Line Interface
 *
 * Provides CLI access to the v3 DDD architecture through the Queen Coordinator.
 * All commands delegate to domain services via the coordination layer.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { QEKernel } from '../kernel/interfaces';
import { QEKernelImpl } from '../kernel/kernel';
import {
  QueenCoordinator,
  createQueenCoordinator,
  TaskType,
} from '../coordination/queen-coordinator';
import { CrossDomainEventRouter } from '../coordination/cross-domain-router';
import { DefaultProtocolExecutor } from '../coordination/protocol-executor';
import { WorkflowOrchestrator } from '../coordination/workflow-orchestrator';
import { DomainName, ALL_DOMAINS, Priority } from '../shared/types';

// ============================================================================
// CLI State
// ============================================================================

interface CLIContext {
  kernel: QEKernel | null;
  queen: QueenCoordinator | null;
  router: CrossDomainEventRouter | null;
  initialized: boolean;
}

const context: CLIContext = {
  kernel: null,
  queen: null,
  router: null,
  initialized: false,
};

// ============================================================================
// Helper Functions
// ============================================================================

function getStatusColor(status: string): string {
  switch (status) {
    case 'healthy':
    case 'completed':
      return chalk.green(status);
    case 'degraded':
    case 'running':
      return chalk.yellow(status);
    case 'unhealthy':
    case 'failed':
      return chalk.red(status);
    default:
      return chalk.gray(status);
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

function formatUptime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${hours}h ${minutes}m ${seconds}s`;
}

async function ensureInitialized(): Promise<boolean> {
  if (context.initialized && context.kernel && context.queen) {
    return true;
  }

  console.log(chalk.yellow('System not initialized. Run `aqe-v3 init` first.'));
  return false;
}

// ============================================================================
// CLI Program
// ============================================================================

const program = new Command();

program
  .name('aqe-v3')
  .description('Agentic QE v3 - Domain-Driven Quality Engineering')
  .version('3.0.0-alpha.1');

// ============================================================================
// Init Command
// ============================================================================

program
  .command('init')
  .description('Initialize the AQE v3 system')
  .option('-d, --domains <domains>', 'Comma-separated list of domains to enable', 'all')
  .option('-m, --max-agents <number>', 'Maximum concurrent agents', '15')
  .option('--memory <backend>', 'Memory backend (sqlite|agentdb|hybrid)', 'hybrid')
  .option('--lazy', 'Enable lazy loading of domains')
  .action(async (options) => {
    try {
      console.log(chalk.blue('\n🚀 Initializing Agentic QE v3...\n'));

      // Determine enabled domains
      const enabledDomains: DomainName[] =
        options.domains === 'all'
          ? [...ALL_DOMAINS]
          : options.domains.split(',').filter((d: string) => ALL_DOMAINS.includes(d as DomainName));

      console.log(chalk.gray(`  Domains: ${enabledDomains.length}`));
      console.log(chalk.gray(`  Max Agents: ${options.maxAgents}`));
      console.log(chalk.gray(`  Memory: ${options.memory}`));
      console.log(chalk.gray(`  Lazy Loading: ${options.lazy ? 'enabled' : 'disabled'}\n`));

      // Create kernel
      context.kernel = new QEKernelImpl({
        maxConcurrentAgents: parseInt(options.maxAgents, 10),
        memoryBackend: options.memory,
        hnswEnabled: true,
        lazyLoading: options.lazy || false,
        enabledDomains,
      });

      await context.kernel.initialize();
      console.log(chalk.green('  ✓ Kernel initialized'));

      // Create cross-domain router
      context.router = new CrossDomainEventRouter(context.kernel.eventBus);
      await context.router.initialize();
      console.log(chalk.green('  ✓ Cross-domain router initialized'));

      // Create protocol executor
      const getDomainAPI = <T>(domain: DomainName): T | undefined => {
        return context.kernel!.getDomainAPI<T>(domain);
      };
      const protocolExecutor = new DefaultProtocolExecutor(
        context.kernel.eventBus,
        context.kernel.memory,
        getDomainAPI
      );
      console.log(chalk.green('  ✓ Protocol executor initialized'));

      // Create workflow orchestrator
      const workflowOrchestrator = new WorkflowOrchestrator(
        context.kernel.eventBus,
        context.kernel.memory,
        context.kernel.coordinator
      );
      await workflowOrchestrator.initialize();
      console.log(chalk.green('  ✓ Workflow orchestrator initialized'));

      // Create Queen Coordinator
      // Note: workflowExecutor is omitted as WorkflowOrchestrator uses different interface
      context.queen = createQueenCoordinator(
        context.kernel,
        context.router,
        protocolExecutor,
        undefined // WorkflowExecutor - optional, can be added later
      );
      await context.queen.initialize();
      console.log(chalk.green('  ✓ Queen Coordinator initialized'));

      context.initialized = true;

      console.log(chalk.green('\n✅ AQE v3 initialized successfully!\n'));

      // Show enabled domains
      console.log(chalk.blue('📦 Enabled Domains:'));
      for (const domain of enabledDomains) {
        console.log(chalk.gray(`  • ${domain}`));
      }
      console.log('');

    } catch (error) {
      console.error(chalk.red('\n❌ Failed to initialize:'), error);
      process.exit(1);
    }
  });

// ============================================================================
// Status Command
// ============================================================================

program
  .command('status')
  .description('Show system status')
  .option('-v, --verbose', 'Show detailed status')
  .action(async (options) => {
    if (!await ensureInitialized()) return;

    try {
      const health = context.queen!.getHealth();
      const metrics = context.queen!.getMetrics();

      console.log(chalk.blue('\n📊 AQE v3 Status\n'));

      // Overall health
      console.log(`  Status: ${getStatusColor(health.status)}`);
      console.log(`  Uptime: ${chalk.cyan(formatUptime(metrics.uptime))}`);
      console.log(`  Work Stealing: ${health.workStealingActive ? chalk.green('active') : chalk.gray('inactive')}`);

      // Agents
      console.log(chalk.blue('\n👥 Agents:'));
      console.log(`  Total: ${chalk.cyan(health.totalAgents)}`);
      console.log(`  Active: ${chalk.yellow(health.activeAgents)}`);
      console.log(`  Utilization: ${chalk.cyan((metrics.agentUtilization * 100).toFixed(1))}%`);

      // Tasks
      console.log(chalk.blue('\n📋 Tasks:'));
      console.log(`  Received: ${chalk.cyan(metrics.tasksReceived)}`);
      console.log(`  Completed: ${chalk.green(metrics.tasksCompleted)}`);
      console.log(`  Failed: ${chalk.red(metrics.tasksFailed)}`);
      console.log(`  Pending: ${chalk.yellow(health.pendingTasks)}`);
      console.log(`  Running: ${chalk.yellow(health.runningTasks)}`);
      if (metrics.tasksStolen > 0) {
        console.log(`  Stolen (work stealing): ${chalk.cyan(metrics.tasksStolen)}`);
      }

      // Protocols & Workflows
      if (metrics.protocolsExecuted > 0 || metrics.workflowsExecuted > 0) {
        console.log(chalk.blue('\n🔄 Coordination:'));
        console.log(`  Protocols Executed: ${chalk.cyan(metrics.protocolsExecuted)}`);
        console.log(`  Workflows Executed: ${chalk.cyan(metrics.workflowsExecuted)}`);
      }

      // Verbose domain status
      if (options.verbose) {
        console.log(chalk.blue('\n📦 Domain Status:'));
        for (const [domain, domainHealth] of health.domainHealth) {
          console.log(`  ${domain}: ${getStatusColor(domainHealth.status)}`);
          console.log(chalk.gray(`    Agents: ${domainHealth.agents.active}/${domainHealth.agents.total} active`));
          if (domainHealth.errors.length > 0) {
            console.log(chalk.red(`    Errors: ${domainHealth.errors.length}`));
          }
        }

        // Domain utilization
        console.log(chalk.blue('\n📈 Domain Load:'));
        for (const [domain, load] of metrics.domainUtilization) {
          const bar = '█'.repeat(Math.min(load, 20)) + '░'.repeat(Math.max(0, 20 - load));
          console.log(`  ${domain.padEnd(25)} ${bar} ${load}`);
        }
      }

      // Health issues
      if (health.issues.length > 0) {
        console.log(chalk.red('\n⚠️ Issues:'));
        for (const issue of health.issues) {
          const color = issue.severity === 'high' ? chalk.red :
                       issue.severity === 'medium' ? chalk.yellow : chalk.gray;
          console.log(`  ${color(`[${issue.severity}]`)} ${issue.message}`);
        }
      }

      console.log('');

    } catch (error) {
      console.error(chalk.red('\n❌ Failed to get status:'), error);
      process.exit(1);
    }
  });

// ============================================================================
// Health Command
// ============================================================================

program
  .command('health')
  .description('Check system health')
  .option('-d, --domain <domain>', 'Check specific domain health')
  .action(async (options) => {
    if (!await ensureInitialized()) return;

    try {
      if (options.domain) {
        const domain = options.domain as DomainName;
        const health = context.queen!.getDomainHealth(domain);

        if (!health) {
          console.log(chalk.red(`\n❌ Domain not found: ${domain}\n`));
          return;
        }

        console.log(chalk.blue(`\n🏥 Health: ${domain}\n`));
        console.log(`  Status: ${getStatusColor(health.status)}`);
        console.log(`  Agents: ${health.agents.active}/${health.agents.total} active`);
        console.log(`  Idle: ${health.agents.idle}`);
        console.log(`  Failed: ${health.agents.failed}`);
        if (health.lastActivity) {
          console.log(`  Last Activity: ${health.lastActivity.toISOString()}`);
        }
        if (health.errors.length > 0) {
          console.log(chalk.red(`\n  Errors:`));
          health.errors.forEach(err => console.log(chalk.red(`    • ${err}`)));
        }
      } else {
        const health = context.queen!.getHealth();

        console.log(chalk.blue('\n🏥 System Health\n'));
        console.log(`  Overall: ${getStatusColor(health.status)}`);
        console.log(`  Last Check: ${health.lastHealthCheck.toISOString()}`);

        // Summary by status
        let healthy = 0, degraded = 0, unhealthy = 0;
        for (const [, domainHealth] of health.domainHealth) {
          if (domainHealth.status === 'healthy') healthy++;
          else if (domainHealth.status === 'degraded') degraded++;
          else unhealthy++;
        }

        console.log(chalk.blue('\n📦 Domains:'));
        console.log(`  ${chalk.green('●')} Healthy: ${healthy}`);
        console.log(`  ${chalk.yellow('●')} Degraded: ${degraded}`);
        console.log(`  ${chalk.red('●')} Unhealthy: ${unhealthy}`);
      }

      console.log('');

    } catch (error) {
      console.error(chalk.red('\n❌ Health check failed:'), error);
      process.exit(1);
    }
  });

// ============================================================================
// Task Command Group
// ============================================================================

const taskCmd = program
  .command('task')
  .description('Manage QE tasks');

taskCmd
  .command('submit <type>')
  .description('Submit a task to the Queen Coordinator')
  .option('-p, --priority <priority>', 'Task priority (p0|p1|p2|p3)', 'p1')
  .option('-d, --domain <domain>', 'Target domain')
  .option('-t, --timeout <ms>', 'Task timeout in ms', '300000')
  .option('--payload <json>', 'Task payload as JSON', '{}')
  .action(async (type: string, options) => {
    if (!await ensureInitialized()) return;

    try {
      const taskType = type as TaskType;
      const payload = JSON.parse(options.payload);
      const targetDomains = options.domain ? [options.domain as DomainName] : [];

      console.log(chalk.blue(`\n📝 Submitting task: ${taskType}\n`));

      const result = await context.queen!.submitTask({
        type: taskType,
        priority: options.priority as Priority,
        targetDomains,
        payload,
        timeout: parseInt(options.timeout, 10),
      });

      if (result.success) {
        console.log(chalk.green(`✅ Task submitted successfully`));
        console.log(chalk.cyan(`   ID: ${result.value}`));
        console.log(chalk.gray(`   Type: ${taskType}`));
        console.log(chalk.gray(`   Priority: ${options.priority}`));
      } else {
        console.log(chalk.red(`❌ Failed to submit task: ${result.error.message}`));
      }

      console.log('');

    } catch (error) {
      console.error(chalk.red('\n❌ Failed to submit task:'), error);
      process.exit(1);
    }
  });

taskCmd
  .command('list')
  .description('List all tasks')
  .option('-s, --status <status>', 'Filter by status')
  .option('-p, --priority <priority>', 'Filter by priority')
  .option('-d, --domain <domain>', 'Filter by domain')
  .action(async (options) => {
    if (!await ensureInitialized()) return;

    try {
      const tasks = context.queen!.listTasks({
        status: options.status,
        priority: options.priority,
        domain: options.domain,
      });

      console.log(chalk.blue(`\n📋 Tasks (${tasks.length})\n`));

      if (tasks.length === 0) {
        console.log(chalk.gray('  No tasks found'));
      } else {
        for (const task of tasks) {
          console.log(`  ${chalk.cyan(task.taskId)}`);
          console.log(`    Type: ${task.task.type}`);
          console.log(`    Status: ${getStatusColor(task.status)}`);
          console.log(`    Priority: ${task.task.priority}`);
          if (task.assignedDomain) {
            console.log(`    Domain: ${task.assignedDomain}`);
          }
          if (task.startedAt) {
            console.log(chalk.gray(`    Started: ${task.startedAt.toISOString()}`));
          }
          console.log('');
        }
      }

    } catch (error) {
      console.error(chalk.red('\n❌ Failed to list tasks:'), error);
      process.exit(1);
    }
  });

taskCmd
  .command('cancel <taskId>')
  .description('Cancel a task')
  .action(async (taskId: string) => {
    if (!await ensureInitialized()) return;

    try {
      const result = await context.queen!.cancelTask(taskId);

      if (result.success) {
        console.log(chalk.green(`\n✅ Task cancelled: ${taskId}\n`));
      } else {
        console.log(chalk.red(`\n❌ Failed to cancel task: ${result.error.message}\n`));
      }

    } catch (error) {
      console.error(chalk.red('\n❌ Failed to cancel task:'), error);
      process.exit(1);
    }
  });

taskCmd
  .command('status <taskId>')
  .description('Get task status')
  .action(async (taskId: string) => {
    if (!await ensureInitialized()) return;

    try {
      const task = context.queen!.getTaskStatus(taskId);

      if (!task) {
        console.log(chalk.red(`\n❌ Task not found: ${taskId}\n`));
        return;
      }

      console.log(chalk.blue(`\n📋 Task: ${taskId}\n`));
      console.log(`  Type: ${task.task.type}`);
      console.log(`  Status: ${getStatusColor(task.status)}`);
      console.log(`  Priority: ${task.task.priority}`);
      if (task.assignedDomain) {
        console.log(`  Domain: ${task.assignedDomain}`);
      }
      if (task.assignedAgents.length > 0) {
        console.log(`  Agents: ${task.assignedAgents.join(', ')}`);
      }
      console.log(`  Created: ${task.task.createdAt.toISOString()}`);
      if (task.startedAt) {
        console.log(`  Started: ${task.startedAt.toISOString()}`);
      }
      if (task.completedAt) {
        console.log(`  Completed: ${task.completedAt.toISOString()}`);
        const duration = task.completedAt.getTime() - task.startedAt!.getTime();
        console.log(`  Duration: ${formatDuration(duration)}`);
      }
      if (task.error) {
        console.log(chalk.red(`  Error: ${task.error}`));
      }
      if (task.retryCount > 0) {
        console.log(chalk.yellow(`  Retries: ${task.retryCount}`));
      }

      console.log('');

    } catch (error) {
      console.error(chalk.red('\n❌ Failed to get task status:'), error);
      process.exit(1);
    }
  });

// ============================================================================
// Agent Command Group
// ============================================================================

const agentCmd = program
  .command('agent')
  .description('Manage QE agents');

agentCmd
  .command('list')
  .description('List all agents')
  .option('-d, --domain <domain>', 'Filter by domain')
  .option('-s, --status <status>', 'Filter by status')
  .action(async (options) => {
    if (!await ensureInitialized()) return;

    try {
      let agents = options.domain
        ? context.queen!.getAgentsByDomain(options.domain as DomainName)
        : context.queen!.listAllAgents();

      if (options.status) {
        agents = agents.filter(a => a.status === options.status);
      }

      console.log(chalk.blue(`\n👥 Agents (${agents.length})\n`));

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

        for (const [domain, domainAgents] of byDomain) {
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
      console.error(chalk.red('\n❌ Failed to list agents:'), error);
      process.exit(1);
    }
  });

agentCmd
  .command('spawn <domain>')
  .description('Spawn an agent in a domain')
  .option('-t, --type <type>', 'Agent type', 'worker')
  .option('-c, --capabilities <caps>', 'Comma-separated capabilities', 'general')
  .action(async (domain: string, options) => {
    if (!await ensureInitialized()) return;

    try {
      const capabilities = options.capabilities.split(',');

      console.log(chalk.blue(`\n🚀 Spawning agent in ${domain}...\n`));

      const result = await context.queen!.requestAgentSpawn(
        domain as DomainName,
        options.type,
        capabilities
      );

      if (result.success) {
        console.log(chalk.green(`✅ Agent spawned successfully`));
        console.log(chalk.cyan(`   ID: ${result.value}`));
        console.log(chalk.gray(`   Domain: ${domain}`));
        console.log(chalk.gray(`   Type: ${options.type}`));
        console.log(chalk.gray(`   Capabilities: ${capabilities.join(', ')}`));
      } else {
        console.log(chalk.red(`❌ Failed to spawn agent: ${result.error.message}`));
      }

      console.log('');

    } catch (error) {
      console.error(chalk.red('\n❌ Failed to spawn agent:'), error);
      process.exit(1);
    }
  });

// ============================================================================
// Domain Command Group
// ============================================================================

const domainCmd = program
  .command('domain')
  .description('Domain operations');

domainCmd
  .command('list')
  .description('List all domains')
  .action(async () => {
    if (!await ensureInitialized()) return;

    try {
      console.log(chalk.blue('\n📦 Domains\n'));

      for (const domain of ALL_DOMAINS) {
        const health = context.queen!.getDomainHealth(domain);
        const load = context.queen!.getDomainLoad(domain);

        console.log(`  ${chalk.cyan(domain)}`);
        console.log(`    Status: ${getStatusColor(health?.status || 'unknown')}`);
        console.log(`    Load: ${load} tasks`);
        if (health) {
          console.log(`    Agents: ${health.agents.active}/${health.agents.total}`);
        }
        console.log('');
      }

    } catch (error) {
      console.error(chalk.red('\n❌ Failed to list domains:'), error);
      process.exit(1);
    }
  });

domainCmd
  .command('health <domain>')
  .description('Get domain health')
  .action(async (domain: string) => {
    if (!await ensureInitialized()) return;

    try {
      const health = context.queen!.getDomainHealth(domain as DomainName);

      if (!health) {
        console.log(chalk.red(`\n❌ Domain not found: ${domain}\n`));
        return;
      }

      console.log(chalk.blue(`\n🏥 ${domain} Health\n`));
      console.log(`  Status: ${getStatusColor(health.status)}`);
      console.log(`  Agents Total: ${health.agents.total}`);
      console.log(`  Agents Active: ${chalk.green(health.agents.active)}`);
      console.log(`  Agents Idle: ${chalk.yellow(health.agents.idle)}`);
      console.log(`  Agents Failed: ${chalk.red(health.agents.failed)}`);
      if (health.lastActivity) {
        console.log(`  Last Activity: ${health.lastActivity.toISOString()}`);
      }

      if (health.errors.length > 0) {
        console.log(chalk.red('\n  Errors:'));
        health.errors.forEach(err => console.log(chalk.red(`    • ${err}`)));
      }

      console.log('');

    } catch (error) {
      console.error(chalk.red('\n❌ Failed to get domain health:'), error);
      process.exit(1);
    }
  });

// ============================================================================
// Protocol Command Group
// ============================================================================

const protocolCmd = program
  .command('protocol')
  .description('Execute coordination protocols');

protocolCmd
  .command('run <protocolId>')
  .description('Execute a protocol')
  .option('--params <json>', 'Protocol parameters as JSON', '{}')
  .action(async (protocolId: string, options) => {
    if (!await ensureInitialized()) return;

    try {
      const params = JSON.parse(options.params);

      console.log(chalk.blue(`\n🔄 Executing protocol: ${protocolId}\n`));

      const result = await context.queen!.executeProtocol(protocolId, params);

      if (result.success) {
        console.log(chalk.green(`✅ Protocol execution started`));
        console.log(chalk.cyan(`   Execution ID: ${result.value}`));
      } else {
        console.log(chalk.red(`❌ Failed to execute protocol: ${result.error.message}`));
      }

      console.log('');

    } catch (error) {
      console.error(chalk.red('\n❌ Failed to execute protocol:'), error);
      process.exit(1);
    }
  });

// ============================================================================
// Shortcut Commands
// ============================================================================

// aqe-v3 test generate <source>
program
  .command('test')
  .description('Test generation shortcut')
  .argument('<action>', 'Action (generate|execute)')
  .argument('[target]', 'Target file or directory')
  .option('-f, --framework <framework>', 'Test framework', 'jest')
  .action(async (action: string, target: string, options) => {
    if (!await ensureInitialized()) return;

    try {
      let taskType: TaskType;
      let payload: Record<string, unknown> = {};

      if (action === 'generate') {
        taskType = 'generate-tests';
        payload = { source: target, framework: options.framework };
      } else if (action === 'execute') {
        taskType = 'execute-tests';
        payload = { testFile: target, framework: options.framework };
      } else {
        console.log(chalk.red(`\n❌ Unknown action: ${action}\n`));
        return;
      }

      console.log(chalk.blue(`\n🧪 ${action === 'generate' ? 'Generating tests' : 'Executing tests'}...\n`));

      const result = await context.queen!.submitTask({
        type: taskType,
        priority: 'p1',
        targetDomains: [],
        payload,
        timeout: 300000,
      });

      if (result.success) {
        console.log(chalk.green(`✅ Task submitted: ${result.value}`));
        console.log(chalk.gray(`   Use 'aqe-v3 task status ${result.value}' to check progress`));
      } else {
        console.log(chalk.red(`❌ Failed: ${result.error.message}`));
      }

      console.log('');

    } catch (error) {
      console.error(chalk.red('\n❌ Failed:'), error);
      process.exit(1);
    }
  });

// aqe-v3 coverage <target>
program
  .command('coverage')
  .description('Coverage analysis shortcut')
  .argument('[target]', 'Target file or directory', '.')
  .option('--risk', 'Include risk scoring')
  .action(async (target: string, options) => {
    if (!await ensureInitialized()) return;

    try {
      console.log(chalk.blue(`\n📊 Analyzing coverage for ${target}...\n`));

      const result = await context.queen!.submitTask({
        type: 'analyze-coverage',
        priority: 'p1',
        targetDomains: ['coverage-analysis'],
        payload: { target, includeRisk: options.risk },
        timeout: 300000,
      });

      if (result.success) {
        console.log(chalk.green(`✅ Task submitted: ${result.value}`));
        console.log(chalk.gray(`   Use 'aqe-v3 task status ${result.value}' to check progress`));
      } else {
        console.log(chalk.red(`❌ Failed: ${result.error.message}`));
      }

      console.log('');

    } catch (error) {
      console.error(chalk.red('\n❌ Failed:'), error);
      process.exit(1);
    }
  });

// aqe-v3 quality
program
  .command('quality')
  .description('Quality assessment shortcut')
  .option('--gate', 'Run quality gate evaluation')
  .action(async (options) => {
    if (!await ensureInitialized()) return;

    try {
      console.log(chalk.blue(`\n🎯 Running quality assessment...\n`));

      const result = await context.queen!.submitTask({
        type: 'assess-quality',
        priority: 'p0',
        targetDomains: ['quality-assessment'],
        payload: { runGate: options.gate },
        timeout: 300000,
      });

      if (result.success) {
        console.log(chalk.green(`✅ Task submitted: ${result.value}`));
        console.log(chalk.gray(`   Use 'aqe-v3 task status ${result.value}' to check progress`));
      } else {
        console.log(chalk.red(`❌ Failed: ${result.error.message}`));
      }

      console.log('');

    } catch (error) {
      console.error(chalk.red('\n❌ Failed:'), error);
      process.exit(1);
    }
  });

// aqe-v3 security
program
  .command('security')
  .description('Security scanning shortcut')
  .option('--sast', 'Run SAST scan')
  .option('--dast', 'Run DAST scan')
  .option('--compliance <frameworks>', 'Check compliance (gdpr,hipaa,soc2)', '')
  .action(async (options) => {
    if (!await ensureInitialized()) return;

    try {
      console.log(chalk.blue(`\n🔒 Running security scan...\n`));

      const result = await context.queen!.submitTask({
        type: 'scan-security',
        priority: 'p0',
        targetDomains: ['security-compliance'],
        payload: {
          sast: options.sast,
          dast: options.dast,
          compliance: options.compliance ? options.compliance.split(',') : [],
        },
        timeout: 600000,
      });

      if (result.success) {
        console.log(chalk.green(`✅ Task submitted: ${result.value}`));
        console.log(chalk.gray(`   Use 'aqe-v3 task status ${result.value}' to check progress`));
      } else {
        console.log(chalk.red(`❌ Failed: ${result.error.message}`));
      }

      console.log('');

    } catch (error) {
      console.error(chalk.red('\n❌ Failed:'), error);
      process.exit(1);
    }
  });

// ============================================================================
// Shutdown Handler
// ============================================================================

process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n\n🛑 Shutting down...'));

  if (context.queen) {
    await context.queen.dispose();
  }
  if (context.router) {
    await context.router.dispose();
  }
  if (context.kernel) {
    await context.kernel.dispose();
  }

  console.log(chalk.green('✅ Shutdown complete\n'));
  process.exit(0);
});

// ============================================================================
// Main
// ============================================================================

program.parse();
