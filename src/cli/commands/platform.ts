/**
 * Agentic QE v3 - Platform Command
 * Manage coding agent platform configurations.
 *
 * Subcommands:
 *   list   - List all supported platforms and their status
 *   setup  - Set up a specific platform by name
 *   verify - Verify a platform's configuration
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  PLATFORM_REGISTRY,
  type PlatformId,
  type PlatformDefinition,
} from '../../init/platform-config-generator.js';
import { selectCodexSkills } from '../../init/codex-skill-manifest.js';
import { toErrorMessage } from '../../shared/error-utils.js';

// ============================================================================
// Helpers
// ============================================================================

const VALID_PLATFORM_IDS = Object.keys(PLATFORM_REGISTRY) as PlatformId[];

function isValidPlatformId(name: string): name is PlatformId {
  return VALID_PLATFORM_IDS.includes(name as PlatformId);
}

function getConfigStatus(projectRoot: string, platform: PlatformDefinition): {
  configExists: boolean;
  rulesExists: boolean;
} {
  const configPath = path.join(projectRoot, platform.configPath);
  const rulesPath = path.join(projectRoot, platform.rulesPath);
  return {
    configExists: existsSync(configPath),
    rulesExists: existsSync(rulesPath),
  };
}

function parseConfigFile(filePath: string, format: string): { valid: boolean; error?: string; data?: unknown } {
  try {
    const content = readFileSync(filePath, 'utf-8');
    if (format === 'json') {
      const data = JSON.parse(content);
      return { valid: true, data };
    }
    if (format === 'toml') {
      // Basic TOML validation: check it has content and key structure
      if (content.trim().length === 0) {
        return { valid: false, error: 'File is empty' };
      }
      return { valid: true };
    }
    if (format === 'yaml') {
      // Basic YAML validation: check it has content
      if (content.trim().length === 0) {
        return { valid: false, error: 'File is empty' };
      }
      return { valid: true };
    }
    return { valid: true };
  } catch (error) {
    return { valid: false, error: toErrorMessage(error) };
  }
}

function checkAqeEntry(filePath: string, platform: PlatformDefinition): boolean {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return content.includes('agentic-qe');
  } catch {
    return false;
  }
}

export interface PlatformVerificationCheck {
  label: string;
  passed: boolean;
  detail: string;
}

export interface PlatformVerificationResult {
  platform: PlatformId;
  passed: boolean;
  checks: PlatformVerificationCheck[];
}

/** Inspect the complete installed surface for a platform without changing it. */
export function verifyPlatformConfiguration(
  projectRoot: string,
  platformId: PlatformId,
): PlatformVerificationResult {
  const platform = PLATFORM_REGISTRY[platformId];
  const checks: PlatformVerificationCheck[] = [];
  const add = (label: string, passed: boolean, detail: string): void => {
    checks.push({ label, passed, detail });
  };

  const configPath = path.join(projectRoot, platform.configPath);
  const configExists = existsSync(configPath);
  add('Config file', configExists, configExists ? platform.configPath : `missing: ${platform.configPath}`);
  if (configExists) {
    const parsed = parseConfigFile(configPath, platform.configFormat);
    add('Config syntax', parsed.valid, parsed.valid
      ? `valid ${platform.configFormat.toUpperCase()}`
      : parsed.error || 'invalid configuration');
    add('AQE MCP entry', checkAqeEntry(configPath, platform), 'agentic-qe server entry');
  }

  const rulesPath = path.join(projectRoot, platform.rulesPath);
  const rulesExists = existsSync(rulesPath);
  add('Behavioral rules', rulesExists, rulesExists ? platform.rulesPath : `missing: ${platform.rulesPath}`);
  if (platformId === 'codex' && rulesExists) {
    const rules = readFileSync(rulesPath, 'utf-8');
    add('AQE instructions', rules.includes('Quality Engineering Standards (Agentic QE)'),
      'AGENTS.md contains generated AQE guidance');
  }

  if (platformId === 'codex') {
    const hooksPath = path.join(projectRoot, '.codex', 'hooks.json');
    let hookCommands: string[] = [];
    let hooksValid = false;
    if (existsSync(hooksPath)) {
      try {
        const parsed = JSON.parse(readFileSync(hooksPath, 'utf-8')) as { hooks?: unknown };
        hooksValid = Boolean(parsed.hooks && typeof parsed.hooks === 'object');
        hookCommands = JSON.stringify(parsed).match(/\.codex\/hooks\/[a-z0-9-]+\.cjs/gi) || [];
      } catch {
        hooksValid = false;
      }
    }
    add('Lifecycle hooks', hooksValid, hooksValid ? '.codex/hooks.json is valid' : 'missing or invalid .codex/hooks.json');

    const referencedAdapters = [...new Set(hookCommands.map((command) => command.split('/').pop()!))];
    const adaptersPresent = referencedAdapters.length > 0
      && referencedAdapters.every((file) => existsSync(path.join(projectRoot, '.codex', 'hooks', file)));
    add('Hook adapters', adaptersPresent,
      referencedAdapters.length > 0 ? `${referencedAdapters.length} referenced adapter(s)` : 'no Codex hook adapters referenced');

    const runtimes = ['aqe-runtime.cjs', 'ruflo-runtime.cjs'];
    const missingRuntimes = runtimes.filter((file) => !existsSync(path.join(projectRoot, '.codex', 'hooks', file)));
    add('Hook runtimes', missingRuntimes.length === 0,
      missingRuntimes.length === 0 ? `${runtimes.length} runtime(s) present` : `missing: ${missingRuntimes.join(', ')}`);

    const skillsPath = path.join(projectRoot, '.agents', 'skills');
    const requiredSkills = selectCodexSkills();
    const missingSkills = requiredSkills
      .filter((skill) => !existsSync(path.join(skillsPath, skill.name, 'SKILL.md')))
      .map((skill) => skill.name);
    add('QE skills', missingSkills.length === 0, missingSkills.length === 0
      ? `${requiredSkills.length} required AQE skill(s) present`
      : `missing: ${missingSkills.join(', ')}`);
  }

  return { platform: platformId, passed: checks.every((check) => check.passed), checks };
}

// ============================================================================
// Platform Command
// ============================================================================

export function createPlatformCommand(): Command {
  const platformCmd = new Command('platform')
    .description('Manage coding agent platform configurations');

  // ── list ──────────────────────────────────────────────────────────────
  platformCmd
    .command('list')
    .description('List all supported platforms and their configuration status')
    .action(async () => {
      const projectRoot = process.cwd();

      console.log('');
      console.log(chalk.bold.blue('  Supported Platforms'));
      console.log(chalk.gray('  ─────────────────────────'));
      console.log('');

      const nameWidth = 18;
      const configWidth = 36;
      const statusWidth = 14;

      console.log(
        chalk.gray(
          `  ${'Platform'.padEnd(nameWidth)}${'Config Path'.padEnd(configWidth)}${'Status'.padEnd(statusWidth)}`
        )
      );
      console.log(chalk.gray(`  ${'─'.repeat(nameWidth + configWidth + statusWidth)}`));

      for (const id of VALID_PLATFORM_IDS) {
        const platform = PLATFORM_REGISTRY[id];
        const { configExists, rulesExists } = getConfigStatus(projectRoot, platform);
        const configured = configExists && rulesExists;
        const partial = configExists || rulesExists;

        const statusText = configured
          ? chalk.green('configured')
          : partial
          ? chalk.yellow('partial')
          : chalk.gray('not configured');

        console.log(
          `  ${chalk.white(platform.name.padEnd(nameWidth))}${chalk.gray(platform.configPath.padEnd(configWidth))}${statusText}`
        );
      }

      console.log('');
      console.log(chalk.gray('  Use "aqe platform setup <name>" to configure a platform'));
      console.log(chalk.gray('  Use "aqe init --with-all-platforms" to configure all at once'));
      console.log('');
    });

  // ── setup ─────────────────────────────────────────────────────────────
  platformCmd
    .command('setup <name>')
    .description('Set up a specific platform configuration')
    .option('--overwrite', 'Overwrite existing configuration files')
    .action(async (name: string, options: { overwrite?: boolean }) => {
      const projectRoot = process.cwd();

      if (!isValidPlatformId(name)) {
        console.log('');
        console.log(chalk.red(`  Unknown platform: ${name}`));
        console.log(chalk.gray(`  Valid platforms: ${VALID_PLATFORM_IDS.join(', ')}`));
        console.log('');
        process.exit(1);
      }

      const platform = PLATFORM_REGISTRY[name];
      console.log('');
      console.log(chalk.bold.blue(`  Setting up ${platform.name}`));
      console.log(chalk.gray('  ─────────────────────────────────'));
      console.log('');

      try {
        // Dynamic import of the installer
        const installerModule = await import(`../../init/${name}-installer.js`);

        // Resolve the factory function name: create<Name>Installer
        const factoryName = `create${name.charAt(0).toUpperCase()}${name.slice(1).replace(/([a-z])([A-Z])/g, '$1$2')}Installer`;

        // Find the factory function (try common naming patterns)
        const possibleNames = [
          factoryName,
          `create${capitalize(name)}Installer`,
        ];

        let factory: ((opts: { projectRoot: string; overwrite?: boolean }) => { install: () => Promise<unknown> }) | undefined;
        for (const fn of possibleNames) {
          if (typeof installerModule[fn] === 'function') {
            factory = installerModule[fn];
            break;
          }
        }

        if (!factory) {
          // Fallback: look for any exported create*Installer function
          for (const key of Object.keys(installerModule)) {
            if (key.startsWith('create') && key.endsWith('Installer') && typeof installerModule[key] === 'function') {
              factory = installerModule[key];
              break;
            }
          }
        }

        if (!factory) {
          console.log(chalk.red(`  Could not find installer factory for ${name}`));
          process.exit(1);
        }

        const installer = factory({
          projectRoot,
          overwrite: options.overwrite,
        });

        const result = await installer.install() as {
          success: boolean;
          mcpConfigured?: boolean;
          rulesInstalled?: boolean;
          agentsMdInstalled?: boolean;
          hooksConfigured?: boolean;
          skillsInstalled?: number;
          errors?: string[];
        };

        if (result.success) {
          console.log(chalk.green(`  ${platform.name} configured successfully`));
          if (result.mcpConfigured) {
            console.log(chalk.gray(`    MCP config: ${platform.configPath}`));
          }
          if (result.rulesInstalled || result.agentsMdInstalled) {
            console.log(chalk.gray(`    Rules: ${platform.rulesPath}`));
          }
          if (name === 'codex') {
            if (result.hooksConfigured) console.log(chalk.gray('    Hooks: .codex/hooks.json'));
            console.log(chalk.gray(`    QE skills: ${result.skillsInstalled ?? 0} installed`));
          }
        } else {
          console.log(chalk.red(`  ${platform.name} setup failed`));
          if (result.errors) {
            for (const err of result.errors) {
              console.log(chalk.red(`    ${err}`));
            }
          }
        }
      } catch (error) {
        console.log(chalk.red(`  Failed to set up ${platform.name}: ${toErrorMessage(error)}`));
      }

      console.log('');
    });

  // ── verify ────────────────────────────────────────────────────────────
  platformCmd
    .command('verify <name>')
    .description('Verify a platform configuration is correct')
    .action(async (name: string) => {
      const projectRoot = process.cwd();

      if (!isValidPlatformId(name)) {
        console.log('');
        console.log(chalk.red(`  Unknown platform: ${name}`));
        console.log(chalk.gray(`  Valid platforms: ${VALID_PLATFORM_IDS.join(', ')}`));
        console.log('');
        process.exit(1);
      }

      const platform = PLATFORM_REGISTRY[name];
      console.log('');
      console.log(chalk.bold.blue(`  Verifying ${platform.name}`));
      console.log(chalk.gray('  ─────────────────────────────────'));
      console.log('');

      const verification = verifyPlatformConfiguration(projectRoot, name);
      for (const check of verification.checks) {
        const message = `  [${check.passed ? 'pass' : 'fail'}] ${check.label}: ${check.detail}`;
        console.log(check.passed ? chalk.green(message) : chalk.red(message));
      }

      console.log('');
      if (verification.passed) {
        console.log(chalk.green(`  ${platform.name} configuration is valid`));
      } else {
        console.log(chalk.yellow(`  ${platform.name} configuration has issues`));
        console.log(chalk.gray(`  Run "aqe platform setup ${name}" to fix`));
        process.exitCode = 1;
      }
      console.log('');
    });

  return platformCmd;
}

// ============================================================================
// Helpers
// ============================================================================

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default createPlatformCommand;
