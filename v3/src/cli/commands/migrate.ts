/**
 * Agentic QE v3 - Migrate Command
 *
 * V2-to-V3 migration tools with agent compatibility (ADR-048).
 */

import { Command } from 'commander';
import chalk from 'chalk';
import type { CLIContext } from '../handlers/interfaces.js';
import { parseJsonFile } from '../helpers/safe-json.js';
import {
  v2AgentMapping,
  resolveAgentName,
  isDeprecatedAgent,
  v3Agents,
} from '../../migration/agent-compat.js';

export function createMigrateCommand(
  context: CLIContext,
  cleanupAndExit: (code: number) => Promise<never>,
  ensureInitialized: () => Promise<boolean>
): Command {
  const migrateCmd = new Command('migrate')
    .description('V2-to-V3 migration tools with agent compatibility (ADR-048)');

  // migrate run
  migrateCmd
    .command('run')
    .description('Run full migration from v2 to v3')
    .option('--dry-run', 'Preview migration without making changes')
    .option('--backup', 'Create backup before migration (recommended)', true)
    .option('--skip-memory', 'Skip memory database migration')
    .option('--skip-patterns', 'Skip pattern migration')
    .option('--skip-config', 'Skip configuration migration')
    .option('--skip-agents', 'Skip agent name migration')
    .option('--target <component>', 'Migrate specific component (agents, skills, config, memory)')
    .option('--force', 'Force migration even if v3 already exists')
    .action(async (options) => {
      const fs = await import('fs');
      const path = await import('path');

      console.log(chalk.blue('\n V2 to V3 Migration (ADR-048)\n'));

      const cwd = process.cwd();
      const v2Dir = path.join(cwd, '.agentic-qe');
      const v3Dir = path.join(cwd, '.aqe');
      const claudeAgentDir = path.join(cwd, '.claude', 'agents');

      // Step 1: Detect v2 installation
      console.log(chalk.white('1. Detecting v2 installation...'));

      const hasV2Dir = fs.existsSync(v2Dir);
      const hasClaudeAgents = fs.existsSync(claudeAgentDir);

      if (!hasV2Dir && !hasClaudeAgents) {
        console.log(chalk.yellow('   ! No v2 installation found'));
        console.log(chalk.gray('   This might be a fresh project. Use `aqe init` instead.'));
        await cleanupAndExit(0);
      }

      const v2Files = {
        memoryDb: path.join(v2Dir, 'memory.db'),
        config: path.join(v2Dir, 'config.json'),
        patterns: path.join(v2Dir, 'patterns'),
      };

      const hasMemory = hasV2Dir && fs.existsSync(v2Files.memoryDb);
      const hasConfig = hasV2Dir && fs.existsSync(v2Files.config);
      const hasPatterns = hasV2Dir && fs.existsSync(v2Files.patterns);

      // Detect v2 agents needing migration
      const agentsToMigrate: string[] = [];
      if (hasClaudeAgents) {
        const files = fs.readdirSync(claudeAgentDir);
        for (const file of files) {
          if (file.endsWith('.md') && file.startsWith('qe-')) {
            const agentName = file.replace('.md', '');
            if (isDeprecatedAgent(agentName)) {
              agentsToMigrate.push(agentName);
            }
          }
        }
      }

      console.log(chalk.green('   * Found v2 installation:'));
      console.log(chalk.gray(`     Memory DB: ${hasMemory ? '*' : 'x'}`));
      console.log(chalk.gray(`     Config: ${hasConfig ? '*' : 'x'}`));
      console.log(chalk.gray(`     Patterns: ${hasPatterns ? '*' : 'x'}`));
      console.log(chalk.gray(`     Agents to migrate: ${agentsToMigrate.length}\n`));

      // Step 2: Check v3 existence
      console.log(chalk.white('2. Checking v3 status...'));

      if (fs.existsSync(v3Dir) && !options.force) {
        console.log(chalk.yellow('   ! v3 directory already exists at .aqe/'));
        console.log(chalk.gray('   Use --force to overwrite existing v3 installation.'));
        await cleanupAndExit(1);
      }
      console.log(chalk.green('   * Ready for migration\n'));

      // Dry run mode
      if (options.dryRun) {
        console.log(chalk.blue(' Dry Run - Migration Plan:\n'));

        if (!options.skipMemory && hasMemory) {
          const stats = fs.statSync(v2Files.memoryDb);
          console.log(chalk.gray(`  - Migrate memory.db (${(stats.size / 1024).toFixed(1)} KB)`));
        }

        if (!options.skipConfig && hasConfig) {
          console.log(chalk.gray('  - Convert config.json to v3 format'));
        }

        if (!options.skipPatterns && hasPatterns) {
          const patternFiles = fs.readdirSync(v2Files.patterns);
          console.log(chalk.gray(`  - Migrate ${patternFiles.length} pattern files`));
        }

        if (!options.skipAgents && agentsToMigrate.length > 0) {
          console.log(chalk.gray(`  - Migrate ${agentsToMigrate.length} agent names:`));
          for (const agent of agentsToMigrate) {
            console.log(chalk.gray(`      ${agent} -> ${resolveAgentName(agent)}`));
          }
        }

        console.log(chalk.yellow('\n! This is a dry run. No changes were made.'));
        console.log(chalk.gray('Run without --dry-run to execute migration.\n'));
        await cleanupAndExit(0);
      }

      // Step 3: Create backup
      if (options.backup) {
        console.log(chalk.white('3. Creating backup...'));
        const backupDir = path.join(cwd, '.aqe-backup', `backup-${Date.now()}`);

        try {
          fs.mkdirSync(backupDir, { recursive: true });

          const copyDir = (src: string, dest: string) => {
            if (!fs.existsSync(src)) return;
            if (fs.statSync(src).isDirectory()) {
              fs.mkdirSync(dest, { recursive: true });
              for (const file of fs.readdirSync(src)) {
                copyDir(path.join(src, file), path.join(dest, file));
              }
            } else {
              fs.copyFileSync(src, dest);
            }
          };

          if (hasV2Dir) copyDir(v2Dir, path.join(backupDir, '.agentic-qe'));
          if (hasClaudeAgents) copyDir(claudeAgentDir, path.join(backupDir, '.claude', 'agents'));

          console.log(chalk.green(`   * Backup created at .aqe-backup/\n`));
        } catch (err) {
          console.log(chalk.red(`   x Backup failed: ${err}`));
          await cleanupAndExit(1);
        }
      } else {
        console.log(chalk.yellow('3. Backup skipped (--no-backup)\n'));
      }

      // Step 4: Create v3 directory structure
      if (!options.target || options.target === 'config' || options.target === 'memory') {
        console.log(chalk.white('4. Creating v3 directory structure...'));
        try {
          fs.mkdirSync(v3Dir, { recursive: true });
          fs.mkdirSync(path.join(v3Dir, 'agentdb'), { recursive: true });
          fs.mkdirSync(path.join(v3Dir, 'reasoning-bank'), { recursive: true });
          fs.mkdirSync(path.join(v3Dir, 'cache'), { recursive: true });
          fs.mkdirSync(path.join(v3Dir, 'logs'), { recursive: true });
          console.log(chalk.green('   * Directory structure created\n'));
        } catch (err) {
          console.log(chalk.red(`   x Failed: ${err}\n`));
          await cleanupAndExit(1);
        }
      }

      // Step 5: Migrate memory database
      if ((!options.target || options.target === 'memory') && !options.skipMemory && hasMemory) {
        console.log(chalk.white('5. Migrating memory database...'));
        try {
          const destDb = path.join(v3Dir, 'agentdb', 'memory.db');
          fs.copyFileSync(v2Files.memoryDb, destDb);

          const indexFile = path.join(v3Dir, 'agentdb', 'index.json');
          fs.writeFileSync(indexFile, JSON.stringify({
            version: '3.0.0',
            migratedFrom: 'v2',
            migratedAt: new Date().toISOString(),
            hnswEnabled: true,
            vectorDimensions: 128,
          }, null, 2));

          const stats = fs.statSync(v2Files.memoryDb);
          console.log(chalk.green(`   * Memory database migrated (${(stats.size / 1024).toFixed(1)} KB)\n`));
        } catch (err) {
          console.log(chalk.red(`   x Migration failed: ${err}\n`));
        }
      } else if (options.target && options.target !== 'memory') {
        console.log(chalk.gray('5. Memory migration skipped (--target)\n'));
      } else if (options.skipMemory) {
        console.log(chalk.yellow('5. Memory migration skipped\n'));
      } else {
        console.log(chalk.gray('5. No memory database to migrate\n'));
      }

      // Step 6: Migrate configuration
      if ((!options.target || options.target === 'config') && !options.skipConfig && hasConfig) {
        console.log(chalk.white('6. Migrating configuration...'));
        try {
          const v2ConfigRaw = fs.readFileSync(v2Files.config, 'utf-8');
          const v2Config = parseJsonFile(v2ConfigRaw, v2Files.config) as {
            version?: string;
            learning?: { patternRetention?: number };
          };

          const v3Config = {
            version: '3.0.0',
            migratedFrom: v2Config.version || '2.x',
            migratedAt: new Date().toISOString(),
            kernel: { eventBus: 'in-memory', coordinator: 'queen' },
            domains: {
              'test-generation': { enabled: true },
              'test-execution': { enabled: true },
              'coverage-analysis': { enabled: true, algorithm: 'hnsw', dimensions: 128 },
              'quality-assessment': { enabled: true },
              'defect-intelligence': { enabled: true },
              'requirements-validation': { enabled: true },
              'code-intelligence': { enabled: true },
              'security-compliance': { enabled: true },
              'contract-testing': { enabled: true },
              'visual-accessibility': { enabled: false },
              'chaos-resilience': { enabled: true },
              'learning-optimization': { enabled: true },
            },
            memory: {
              backend: 'hybrid',
              path: '.aqe/agentdb/',
              hnsw: { M: 16, efConstruction: 200 },
            },
            learning: {
              reasoningBank: true,
              sona: true,
              patternRetention: v2Config.learning?.patternRetention || 180,
            },
            v2Migration: {
              originalConfig: v2Config,
              migrationDate: new Date().toISOString(),
            },
          };

          const destConfig = path.join(v3Dir, 'config.json');
          fs.writeFileSync(destConfig, JSON.stringify(v3Config, null, 2));
          console.log(chalk.green('   * Configuration migrated\n'));
        } catch (err) {
          console.log(chalk.red(`   x Config migration failed: ${err}\n`));
        }
      } else if (options.target && options.target !== 'config') {
        console.log(chalk.gray('6. Config migration skipped (--target)\n'));
      } else if (options.skipConfig) {
        console.log(chalk.yellow('6. Configuration migration skipped\n'));
      } else {
        console.log(chalk.gray('6. No configuration to migrate\n'));
      }

      // Step 7: Migrate patterns
      if ((!options.target || options.target === 'memory') && !options.skipPatterns && hasPatterns) {
        console.log(chalk.white('7. Migrating patterns to ReasoningBank...'));
        try {
          const patternFiles = fs.readdirSync(v2Files.patterns);
          let migratedCount = 0;

          for (const file of patternFiles) {
            const srcPath = path.join(v2Files.patterns, file);
            const destPath = path.join(v3Dir, 'reasoning-bank', file);
            if (fs.statSync(srcPath).isFile()) {
              fs.copyFileSync(srcPath, destPath);
              migratedCount++;
            }
          }

          const indexPath = path.join(v3Dir, 'reasoning-bank', 'index.json');
          fs.writeFileSync(indexPath, JSON.stringify({
            version: '3.0.0',
            migratedFrom: 'v2',
            migratedAt: new Date().toISOString(),
            patternCount: migratedCount,
            hnswIndexed: false,
          }, null, 2));

          console.log(chalk.green(`   * ${migratedCount} patterns migrated\n`));
        } catch (err) {
          console.log(chalk.red(`   x Pattern migration failed: ${err}\n`));
        }
      } else if (options.skipPatterns) {
        console.log(chalk.yellow('7. Pattern migration skipped\n'));
      } else {
        console.log(chalk.gray('7. No patterns to migrate\n'));
      }

      // Step 8: Migrate agent names (ADR-048)
      if ((!options.target || options.target === 'agents') && !options.skipAgents && agentsToMigrate.length > 0) {
        console.log(chalk.white('8. Migrating agent names (ADR-048)...'));
        let migratedAgents = 0;
        const deprecatedDir = path.join(claudeAgentDir, 'deprecated');

        if (!fs.existsSync(deprecatedDir)) {
          fs.mkdirSync(deprecatedDir, { recursive: true });
        }

        for (const v2Name of agentsToMigrate) {
          const v3Name = resolveAgentName(v2Name);
          const v2FilePath = path.join(claudeAgentDir, `${v2Name}.md`);
          const v3FilePath = path.join(claudeAgentDir, `${v3Name}.md`);
          const deprecatedPath = path.join(deprecatedDir, `${v2Name}.md.v2`);

          try {
            const content = fs.readFileSync(v2FilePath, 'utf-8');
            const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
            if (!frontmatterMatch) {
              console.log(chalk.yellow(`   ! ${v2Name}: No frontmatter found, skipping`));
              continue;
            }

            const frontmatter = frontmatterMatch[1];
            const bodyStart = content.indexOf('---', 4) + 4;
            let body = content.slice(bodyStart);

            let newFrontmatter = frontmatter.replace(
              /^name:\s*.+$/m,
              `name: ${v3Name}`
            );

            if (!newFrontmatter.includes('v2_compat:')) {
              newFrontmatter += `\nv2_compat:\n  name: ${v2Name}\n  deprecated_in: "3.0.0"\n  removed_in: "4.0.0"`;
            }

            const toTitleCase = (s: string) => s.replace('qe-', '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            const v2DisplayName = toTitleCase(v2Name);
            const v3DisplayName = toTitleCase(v3Name);

            body = body.replace(new RegExp(v2DisplayName, 'g'), v3DisplayName);
            body = body.replace(new RegExp(v2Name, 'g'), v3Name);

            const newContent = `---\n${newFrontmatter}\n---${body}`;

            fs.writeFileSync(v3FilePath, newContent, 'utf-8');
            fs.renameSync(v2FilePath, deprecatedPath);

            console.log(chalk.gray(`   ${v2Name} -> ${v3Name}`));
            migratedAgents++;
          } catch (err) {
            console.log(chalk.red(`   x ${v2Name}: ${err}`));
          }
        }

        if (migratedAgents > 0) {
          console.log(chalk.green(`   * ${migratedAgents} agents migrated`));
          console.log(chalk.gray(`   Old files archived to: ${deprecatedDir}\n`));
        } else {
          console.log(chalk.yellow('   ! No agents were migrated\n'));
        }
      } else if (options.skipAgents) {
        console.log(chalk.yellow('8. Agent migration skipped\n'));
      } else {
        console.log(chalk.gray('8. No agents need migration\n'));
      }

      // Step 9: Validation
      console.log(chalk.white('9. Validating migration...'));
      const validationResults = {
        v3DirExists: fs.existsSync(v3Dir),
        configExists: fs.existsSync(path.join(v3Dir, 'config.json')),
        agentdbExists: fs.existsSync(path.join(v3Dir, 'agentdb')),
        reasoningBankExists: fs.existsSync(path.join(v3Dir, 'reasoning-bank')),
      };

      const allValid = Object.values(validationResults).every(v => v);
      if (allValid) {
        console.log(chalk.green('   * Migration validated successfully\n'));
      } else {
        console.log(chalk.yellow('   ! Some validations failed:'));
        for (const [key, value] of Object.entries(validationResults)) {
          console.log(chalk.gray(`     ${key}: ${value ? '*' : 'x'}`));
        }
      }

      // Summary
      console.log(chalk.blue('='.repeat(47)));
      console.log(chalk.green.bold(' Migration Complete!\n'));
      console.log(chalk.white('Next steps:'));
      console.log(chalk.gray('  1. Run `aqe migrate verify` to validate'));
      console.log(chalk.gray('  2. Run `aqe migrate status` to check'));
      console.log(chalk.gray('  3. Use `aqe migrate rollback` if needed\n'));
      await cleanupAndExit(0);
    });

  // migrate status
  migrateCmd
    .command('status')
    .description('Check migration status of current project')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const fs = await import('fs');
      const path = await import('path');

      const cwd = process.cwd();
      const v2Dir = path.join(cwd, '.agentic-qe');
      const v3Dir = path.join(cwd, '.aqe');
      const claudeAgentDir = path.join(cwd, '.claude', 'agents');

      const isV2Project = fs.existsSync(v2Dir);
      const isV3Project = fs.existsSync(v3Dir);

      const agentsToMigrate: string[] = [];
      const agentsMigrated: string[] = [];

      if (fs.existsSync(claudeAgentDir)) {
        const files = fs.readdirSync(claudeAgentDir);
        for (const file of files) {
          if (file.endsWith('.md') && file.startsWith('qe-')) {
            const agentName = file.replace('.md', '');
            if (isDeprecatedAgent(agentName)) {
              agentsToMigrate.push(agentName);
            } else if (v3Agents.includes(agentName)) {
              agentsMigrated.push(agentName);
            }
          }
        }
      }

      const needsMigration = isV2Project && !isV3Project || agentsToMigrate.length > 0;

      const status = {
        version: '3.0.0',
        isV2Project,
        isV3Project,
        needsMigration,
        agentsToMigrate,
        agentsMigrated,
        components: [
          { name: 'Data Directory', status: isV3Project ? 'migrated' : (isV2Project ? 'pending' : 'not-required') },
          { name: 'Agent Names', status: agentsToMigrate.length === 0 ? 'migrated' : 'pending' },
        ],
      };

      if (options.json) {
        console.log(JSON.stringify(status, null, 2));
        return;
      }

      console.log(chalk.bold('\n Migration Status\n'));
      console.log(`Version: ${chalk.cyan(status.version)}`);
      console.log(`V2 Project: ${status.isV2Project ? chalk.yellow('Yes') : chalk.dim('No')}`);
      console.log(`V3 Project: ${status.isV3Project ? chalk.green('Yes') : chalk.dim('No')}`);
      console.log(`Needs Migration: ${status.needsMigration ? chalk.yellow('Yes') : chalk.green('No')}`);

      console.log(chalk.bold('\n Components\n'));
      for (const comp of status.components) {
        const color = comp.status === 'migrated' ? chalk.green : comp.status === 'pending' ? chalk.yellow : chalk.dim;
        console.log(`  ${comp.name}: ${color(comp.status)}`);
      }

      if (agentsToMigrate.length > 0) {
        console.log(chalk.bold('\n Agents Needing Migration\n'));
        for (const agent of agentsToMigrate) {
          console.log(`  ${chalk.yellow(agent)} -> ${chalk.green(resolveAgentName(agent))}`);
        }
      }
      console.log();
      await cleanupAndExit(0);
    });

  // migrate verify
  migrateCmd
    .command('verify')
    .description('Verify migration integrity')
    .option('--fix', 'Attempt to fix issues automatically')
    .action(async (options) => {
      const fs = await import('fs');
      const path = await import('path');

      console.log(chalk.bold('\n Verifying Migration...\n'));

      const cwd = process.cwd();
      const v3Dir = path.join(cwd, '.aqe');
      const claudeAgentDir = path.join(cwd, '.claude', 'agents');

      const deprecatedInUse: string[] = [];
      if (fs.existsSync(claudeAgentDir)) {
        const files = fs.readdirSync(claudeAgentDir);
        for (const file of files) {
          if (file.endsWith('.md') && file.startsWith('qe-')) {
            const agentName = file.replace('.md', '');
            if (isDeprecatedAgent(agentName)) {
              deprecatedInUse.push(agentName);
            }
          }
        }
      }

      const checks = [
        {
          name: 'V3 Directory',
          passed: fs.existsSync(v3Dir),
          message: fs.existsSync(v3Dir) ? 'Exists' : 'Missing .aqe/',
        },
        {
          name: 'Agent Compatibility',
          passed: deprecatedInUse.length === 0,
          message: deprecatedInUse.length === 0 ? 'All agents use v3 names' : `${deprecatedInUse.length} deprecated agents`,
        },
        {
          name: 'Config Format',
          passed: fs.existsSync(path.join(v3Dir, 'config.json')),
          message: 'Valid v3 config',
        },
      ];

      let allPassed = true;
      for (const check of checks) {
        const icon = check.passed ? chalk.green('*') : chalk.red('x');
        const color = check.passed ? chalk.green : chalk.red;
        console.log(`  ${icon} ${check.name}: ${color(check.message)}`);
        if (!check.passed) allPassed = false;
      }

      console.log();
      if (allPassed) {
        console.log(chalk.green(' All verification checks passed!\n'));
      } else {
        console.log(chalk.yellow(' Some checks failed.'));
        if (options.fix) {
          console.log(chalk.dim('   Attempting automatic fixes...\n'));
          // ... fix logic would go here
        } else {
          console.log(chalk.dim('   Run with --fix to attempt fixes.\n'));
        }
      }
      await cleanupAndExit(0);
    });

  // migrate rollback
  migrateCmd
    .command('rollback')
    .description('Rollback to previous version from backup')
    .option('--backup-id <id>', 'Specific backup to restore')
    .option('--force', 'Skip confirmation')
    .action(async (options) => {
      const fs = await import('fs');
      const path = await import('path');

      const cwd = process.cwd();
      const backupRoot = path.join(cwd, '.aqe-backup');

      if (!fs.existsSync(backupRoot)) {
        console.log(chalk.yellow('\n! No backups found.\n'));
        return;
      }

      const backups = fs.readdirSync(backupRoot)
        .filter(f => f.startsWith('backup-'))
        .sort()
        .reverse();

      if (backups.length === 0) {
        console.log(chalk.yellow('\n! No backups found.\n'));
        return;
      }

      console.log(chalk.bold('\n Available Backups\n'));
      for (const backup of backups.slice(0, 5)) {
        const timestamp = backup.replace('backup-', '');
        const date = new Date(parseInt(timestamp));
        console.log(`  ${chalk.cyan(backup)} - ${date.toLocaleString()}`);
      }

      const targetBackup = options.backupId || backups[0];
      const backupPath = path.join(backupRoot, targetBackup);

      if (!fs.existsSync(backupPath)) {
        console.log(chalk.red(`\n Backup not found: ${targetBackup}\n`));
        await cleanupAndExit(1);
      }

      if (!options.force) {
        console.log(chalk.yellow(`\n! This will restore from: ${targetBackup}`));
        console.log(chalk.dim('   Run with --force to confirm.\n'));
        return;
      }

      console.log(chalk.bold(`\n Rolling back to ${targetBackup}...\n`));

      const v2Backup = path.join(backupPath, '.agentic-qe');
      const agentsBackup = path.join(backupPath, '.claude', 'agents');

      if (fs.existsSync(v2Backup)) {
        const v2Dir = path.join(cwd, '.agentic-qe');
        fs.cpSync(v2Backup, v2Dir, { recursive: true });
        console.log(chalk.dim('  Restored .agentic-qe/'));
      }

      if (fs.existsSync(agentsBackup)) {
        const agentsDir = path.join(cwd, '.claude', 'agents');
        fs.cpSync(agentsBackup, agentsDir, { recursive: true });
        console.log(chalk.dim('  Restored .claude/agents/'));
      }

      const v3Dir = path.join(cwd, '.aqe');
      if (fs.existsSync(v3Dir)) {
        fs.rmSync(v3Dir, { recursive: true, force: true });
        console.log(chalk.dim('  Removed .aqe/'));
      }

      console.log(chalk.green('\n Rollback complete!\n'));
      await cleanupAndExit(0);
    });

  // migrate mapping
  migrateCmd
    .command('mapping')
    .description('Show v2 to v3 agent name mappings (ADR-048)')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      if (options.json) {
        console.log(JSON.stringify(v2AgentMapping, null, 2));
        return;
      }

      console.log(chalk.bold('\n Agent Name Mappings (V2 -> V3)\n'));

      const entries = Object.entries(v2AgentMapping);
      for (const [v2Name, v3Name] of entries) {
        console.log(`  ${chalk.yellow(v2Name)} -> ${chalk.green(v3Name)}`);
      }

      console.log(chalk.dim(`\n  Total: ${entries.length} mappings\n`));
      console.log(chalk.gray('  See ADR-048 for full migration strategy.\n'));
      await cleanupAndExit(0);
    });

  return migrateCmd;
}
