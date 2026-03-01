/**
 * Agentic QE v3 - Fleet Command
 *
 * Fleet operations with multi-agent progress tracking.
 */

import { Command } from 'commander';
import { secureRandomFloat } from '../../shared/utils/crypto-random.js';
import chalk from 'chalk';
import type { CLIContext } from '../handlers/interfaces.js';
import { DomainName, ALL_DOMAINS } from '../../shared/types/index.js';
import { QEKernelImpl } from '../../kernel/kernel.js';
import { CrossDomainEventRouter } from '../../coordination/cross-domain-router.js';
import { DefaultProtocolExecutor } from '../../coordination/protocol-executor.js';
import { WorkflowOrchestrator } from '../../coordination/workflow-orchestrator.js';
import { createQueenCoordinator } from '../../coordination/queen-coordinator.js';
import { createPersistentScheduler } from '../scheduler/index.js';
import { integrateCodeIntelligence, type FleetIntegrationResult } from '../../init/fleet-integration.js';
import { runFleetInitWizard, type FleetWizardResult } from '../wizards/fleet-wizard.js';
import { FleetProgressManager, createTimedSpinner } from '../utils/progress.js';
import type { QEKernel } from '../../kernel/interfaces.js';
import { type OutputFormat, writeOutput, toJSON } from '../utils/ci-output.js';

export function createFleetCommand(
  context: CLIContext,
  cleanupAndExit: (code: number) => Promise<never>,
  ensureInitialized: () => Promise<boolean>,
  registerDomainWorkflowActions: (kernel: QEKernel, orchestrator: WorkflowOrchestrator) => void
): Command {
  const fleetCmd = new Command('fleet')
    .description('Fleet operations with multi-agent progress tracking');

  // Fleet init with wizard (ADR-041)
  fleetCmd
    .command('init')
    .description('Initialize fleet with interactive wizard')
    .option('--wizard', 'Run interactive fleet initialization wizard')
    .option('-t, --topology <type>', 'Fleet topology (hierarchical|mesh|ring|adaptive|hierarchical-mesh)', 'hierarchical-mesh')
    .option('-m, --max-agents <count>', 'Maximum agent count (5-50)', '15')
    .option('-d, --domains <domains>', 'Domains to enable (comma-separated or "all")', 'all')
    .option('--memory <backend>', 'Memory backend (sqlite|agentdb|hybrid)', 'hybrid')
    .option('--lazy', 'Enable lazy loading', true)
    .option('--skip-patterns', 'Skip loading pre-trained patterns')
    .option('--skip-code-scan', 'Skip code intelligence index check')
    .option('-F, --format <format>', 'Output format (text|json)', 'text')
    .option('-o, --output <path>', 'Write output to file')
    .action(async (options) => {
      try {
        let topology = options.topology;
        let maxAgents = parseInt(options.maxAgents, 10);
        let domains = options.domains;
        let memoryBackend = options.memory;
        let lazyLoading = options.lazy;
        let loadPatterns = !options.skipPatterns;

        // CI-005: Check code intelligence index before fleet initialization
        console.log(chalk.blue('\n Code Intelligence Check\n'));
        const ciResult: FleetIntegrationResult = await integrateCodeIntelligence(
          process.cwd(),
          {
            skipCodeScan: options.skipCodeScan,
            nonInteractive: !options.wizard,
          }
        );

        if (!ciResult.shouldProceed) {
          console.log(chalk.blue('\n  Please run the code intelligence scan first:'));
          console.log(chalk.cyan('    aqe code-intelligence index\n'));
          console.log(chalk.gray('  Then re-run fleet init when ready.\n'));
          await cleanupAndExit(0);
          return;
        }

        // Run wizard if requested (ADR-041)
        if (options.wizard) {
          console.log(chalk.blue('\n Fleet Initialization Wizard\n'));

          const wizardResult: FleetWizardResult = await runFleetInitWizard({
            defaultTopology: options.topology !== 'hierarchical-mesh' ? options.topology : undefined,
            defaultMaxAgents: options.maxAgents !== '15' ? parseInt(options.maxAgents, 10) : undefined,
            defaultDomains: options.domains !== 'all' ? options.domains.split(',') : undefined,
            defaultMemoryBackend: options.memory !== 'hybrid' ? options.memory : undefined,
          });

          if (wizardResult.cancelled) {
            console.log(chalk.yellow('\n  Fleet initialization cancelled.\n'));
            await cleanupAndExit(0);
          }

          topology = wizardResult.topology;
          maxAgents = wizardResult.maxAgents;
          domains = wizardResult.domains.join(',');
          memoryBackend = wizardResult.memoryBackend;
          lazyLoading = wizardResult.lazyLoading;
          loadPatterns = wizardResult.loadPatterns;

          console.log(chalk.green('\n  Starting fleet initialization...\n'));
        }

        // Parse domains
        const enabledDomains: DomainName[] =
          domains === 'all'
            ? [...ALL_DOMAINS]
            : domains.split(',').filter((d: string) => ALL_DOMAINS.includes(d as DomainName));

        console.log(chalk.blue('\n Fleet Configuration\n'));
        console.log(chalk.gray(`  Topology: ${topology}`));
        console.log(chalk.gray(`  Max Agents: ${maxAgents}`));
        console.log(chalk.gray(`  Domains: ${enabledDomains.length}`));
        console.log(chalk.gray(`  Memory: ${memoryBackend}`));
        console.log(chalk.gray(`  Lazy Loading: ${lazyLoading ? 'enabled' : 'disabled'}`));
        console.log(chalk.gray(`  Pre-trained Patterns: ${loadPatterns ? 'load' : 'skip'}\n`));

        // Initialize if not already done
        if (!context.initialized) {
          context.kernel = new QEKernelImpl({
            maxConcurrentAgents: maxAgents,
            memoryBackend,
            hnswEnabled: true,
            lazyLoading,
            enabledDomains,
          });

          await context.kernel.initialize();
          console.log(chalk.green('  * Kernel initialized'));

          context.router = new CrossDomainEventRouter(context.kernel.eventBus);
          await context.router.initialize();
          console.log(chalk.green('  * Cross-domain router initialized'));

          context.workflowOrchestrator = new WorkflowOrchestrator(
            context.kernel.eventBus,
            context.kernel.memory,
            context.kernel.coordinator
          );
          await context.workflowOrchestrator.initialize();

          registerDomainWorkflowActions(context.kernel, context.workflowOrchestrator);
          console.log(chalk.green('  * Workflow orchestrator initialized'));

          context.persistentScheduler = createPersistentScheduler();
          console.log(chalk.green('  * Persistent scheduler initialized'));

          const getDomainAPI = <T>(domain: DomainName): T | undefined => {
            return context.kernel!.getDomainAPI<T>(domain);
          };
          const protocolExecutor = new DefaultProtocolExecutor(
            context.kernel.eventBus,
            context.kernel.memory,
            getDomainAPI
          );

          context.queen = createQueenCoordinator(
            context.kernel,
            context.router,
            protocolExecutor,
            undefined
          );
          await context.queen.initialize();
          console.log(chalk.green('  * Queen coordinator initialized'));

          context.initialized = true;
        }

        const format = (options.format || 'text') as OutputFormat;
        if (format === 'json') {
          writeOutput(toJSON({
            status: 'initialized',
            topology,
            maxAgents,
            domains: enabledDomains,
            memoryBackend,
            lazyLoading,
            loadPatterns,
          }), options.output);
        } else {
          console.log(chalk.green('\n Fleet initialized successfully!\n'));
          console.log(chalk.white('Next steps:'));
          console.log(chalk.gray('  1. Spawn agents: aqe fleet spawn --domains test-generation'));
          console.log(chalk.gray('  2. Run operation: aqe fleet run test --target ./src'));
          console.log(chalk.gray('  3. Check status: aqe fleet status\n'));
        }

        await cleanupAndExit(0);
      } catch (error) {
        console.error(chalk.red('\n Fleet initialization failed:'), error);
        await cleanupAndExit(1);
      }
    });

  fleetCmd
    .command('spawn')
    .description('Spawn multiple agents with progress tracking')
    .option('-d, --domains <domains>', 'Comma-separated domains', 'test-generation,coverage-analysis')
    .option('-t, --type <type>', 'Agent type for all', 'worker')
    .option('-c, --count <count>', 'Number of agents per domain', '1')
    .action(async (options) => {
      if (!await ensureInitialized()) return;

      try {
        const domains = options.domains.split(',') as DomainName[];
        const countPerDomain = parseInt(options.count, 10);

        console.log(chalk.blue('\n Fleet Spawn Operation\n'));

        const progress = new FleetProgressManager({
          title: 'Agent Spawn Progress',
          showEta: true,
        });

        const totalAgents = domains.length * countPerDomain;
        progress.start(totalAgents);

        const spawnedAgents: Array<{ id: string; domain: string; success: boolean }> = [];
        let agentIndex = 0;

        for (const domain of domains) {
          for (let i = 0; i < countPerDomain; i++) {
            const agentName = `${domain}-${options.type}-${i + 1}`;
            const agentId = `agent-${agentIndex++}`;

            progress.addAgent({
              id: agentId,
              name: agentName,
              status: 'pending',
              progress: 0,
            });

            progress.updateAgent(agentId, 10, { status: 'running' });

            try {
              progress.updateAgent(agentId, 30, { message: 'Initializing...' });

              const result = await context.queen!.requestAgentSpawn(
                domain,
                options.type,
                ['general']
              );

              progress.updateAgent(agentId, 80, { message: 'Configuring...' });

              if (result.success) {
                progress.completeAgent(agentId, true);
                spawnedAgents.push({ id: result.value as string, domain, success: true });
              } else {
                progress.completeAgent(agentId, false);
                spawnedAgents.push({ id: agentId, domain, success: false });
              }
            } catch {
              progress.completeAgent(agentId, false);
              spawnedAgents.push({ id: agentId, domain, success: false });
            }
          }
        }

        progress.stop();

        const successful = spawnedAgents.filter(a => a.success).length;
        const failed = spawnedAgents.filter(a => !a.success).length;

        console.log(chalk.blue('\n Fleet Summary:'));
        console.log(chalk.gray(`   Domains: ${domains.join(', ')}`));
        console.log(chalk.green(`   Successful: ${successful}`));
        if (failed > 0) {
          console.log(chalk.red(`   Failed: ${failed}`));
        }
        console.log('');

        await cleanupAndExit(failed > 0 ? 1 : 0);

      } catch (error) {
        console.error(chalk.red('\n Fleet spawn failed:'), error);
        await cleanupAndExit(1);
      }
    });

  fleetCmd
    .command('run')
    .description('Run a coordinated fleet operation')
    .argument('<operation>', 'Operation type (test|analyze|scan)')
    .option('-t, --target <path>', 'Target path', '.')
    .option('--parallel <count>', 'Number of parallel agents', '4')
    .action(async (operation: string, options) => {
      if (!await ensureInitialized()) return;

      try {
        const parallelCount = parseInt(options.parallel, 10);

        console.log(chalk.blue(`\n Fleet Operation: ${operation}\n`));

        const progress = new FleetProgressManager({
          title: `${operation.charAt(0).toUpperCase() + operation.slice(1)} Progress`,
          showEta: true,
        });

        progress.start(parallelCount);

        const domainMap: Record<string, DomainName> = {
          test: 'test-generation',
          analyze: 'coverage-analysis',
          scan: 'security-compliance',
        };

        const domain = domainMap[operation] || 'test-generation';

        const agentOperations = Array.from({ length: parallelCount }, (_, i) => {
          const agentId = `${operation}-agent-${i + 1}`;
          return {
            id: agentId,
            name: `${operation}-worker-${i + 1}`,
            domain,
          };
        });

        for (const op of agentOperations) {
          progress.addAgent({
            id: op.id,
            name: op.name,
            status: 'pending',
            progress: 0,
          });
        }

        const results = await Promise.all(
          agentOperations.map(async (op, index) => {
            await new Promise(resolve => setTimeout(resolve, index * 200));

            progress.updateAgent(op.id, 0, { status: 'running' });

            try {
              for (let p = 10; p <= 90; p += 20) {
                await new Promise(resolve => setTimeout(resolve, secureRandomFloat(300, 500)));
                progress.updateAgent(op.id, p, {
                  eta: Math.round((100 - p) * 50),
                });
              }

              const taskResult = await context.queen!.submitTask({
                type: operation === 'test' ? 'generate-tests' :
                      operation === 'analyze' ? 'analyze-coverage' :
                      'scan-security',
                priority: 'p1',
                targetDomains: [domain],
                payload: { target: options.target, workerId: op.id },
                timeout: 60000,
              });

              progress.completeAgent(op.id, taskResult.success);
              return { id: op.id, success: taskResult.success };
            } catch {
              progress.completeAgent(op.id, false);
              return { id: op.id, success: false };
            }
          })
        );

        progress.stop();

        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        console.log(chalk.blue('\n Operation Summary:'));
        console.log(chalk.gray(`   Operation: ${operation}`));
        console.log(chalk.gray(`   Target: ${options.target}`));
        console.log(chalk.green(`   Successful: ${successful}`));
        if (failed > 0) {
          console.log(chalk.red(`   Failed: ${failed}`));
        }
        console.log('');

        await cleanupAndExit(failed > 0 ? 1 : 0);

      } catch (error) {
        console.error(chalk.red('\n Fleet operation failed:'), error);
        await cleanupAndExit(1);
      }
    });

  fleetCmd
    .command('status')
    .description('Show fleet status with agent progress')
    .option('-w, --watch', 'Watch mode with live updates')
    .option('-F, --format <format>', 'Output format (text|json)', 'text')
    .option('-o, --output <path>', 'Write output to file')
    .action(async (options) => {
      if (!await ensureInitialized()) return;

      try {
        const showStatus = async () => {
          const health = context.queen!.getHealth();
          const metrics = context.queen!.getMetrics();

          console.log(chalk.blue('\n Fleet Status\n'));

          const utilizationBar = '\u2588'.repeat(Math.min(Math.round(metrics.agentUtilization * 20), 20)) +
                                 '\u2591'.repeat(Math.max(20 - Math.round(metrics.agentUtilization * 20), 0));
          console.log(chalk.white(`Fleet Utilization ${chalk.cyan(utilizationBar)} ${(metrics.agentUtilization * 100).toFixed(0)}%`));
          console.log('');

          console.log(chalk.white('Agent Progress:'));
          for (const [domain, domainHealth] of health.domainHealth) {
            const active = domainHealth.agents.active;
            const total = domainHealth.agents.total;
            const progressPercent = total > 0 ? Math.round((active / total) * 100) : 0;

            const statusIcon = domainHealth.status === 'healthy' ? chalk.green('\u2713') :
                              domainHealth.status === 'degraded' ? chalk.yellow('\u25B6') :
                              chalk.red('\u2717');

            const bar = '\u2588'.repeat(Math.round(progressPercent / 5)) +
                        '\u2591'.repeat(20 - Math.round(progressPercent / 5));

            console.log(`  ${domain.padEnd(28)} ${chalk.cyan(bar)} ${progressPercent.toString().padStart(3)}% ${statusIcon}`);
          }

          console.log('');
          console.log(chalk.gray(`  Active: ${health.activeAgents}/${health.totalAgents} agents`));
          console.log(chalk.gray(`  Tasks: ${health.runningTasks} running, ${health.pendingTasks} pending`));
          console.log('');
        };

        const format = (options.format || 'text') as OutputFormat;
        if (format === 'json') {
          const health = context.queen!.getHealth();
          const metrics = context.queen!.getMetrics();
          const domainStatus: Record<string, unknown> = {};
          for (const [domain, domainHealth] of health.domainHealth) {
            domainStatus[domain] = {
              status: domainHealth.status,
              agents: domainHealth.agents,
              errors: domainHealth.errors.length,
            };
          }
          writeOutput(toJSON({
            status: health.status,
            utilization: metrics.agentUtilization,
            activeAgents: health.activeAgents,
            totalAgents: health.totalAgents,
            runningTasks: health.runningTasks,
            pendingTasks: health.pendingTasks,
            domains: domainStatus,
          }), options.output);
          await cleanupAndExit(0);
          return;
        }

        if (options.watch) {
          const spinner = createTimedSpinner('Watching fleet status (Ctrl+C to exit)');

          spinner.spinner.stop();
          await showStatus();

          const interval = setInterval(async () => {
            console.clear();
            await showStatus();
          }, 2000);
          interval.unref?.();

          process.once('SIGINT', async () => {
            clearInterval(interval);
            console.log(chalk.yellow('\nStopped watching.'));
            await cleanupAndExit(0);
          });
        } else {
          await showStatus();
          await cleanupAndExit(0);
        }

      } catch (error) {
        console.error(chalk.red('\n Failed to get fleet status:'), error);
        await cleanupAndExit(1);
      }
    });

  return fleetCmd;
}
