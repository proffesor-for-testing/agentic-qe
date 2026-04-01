/**
 * Agentic QE v3 - Plugin CLI Commands (IMP-09)
 *
 * Commands for managing external QE domain plugins:
 *   aqe plugin install <location> [--source local|github|npm]
 *   aqe plugin list
 *   aqe plugin remove <name> [--version <ver>]
 *   aqe plugin info <name>
 */

import { Command } from 'commander';
import { PluginLifecycleManager } from '../../plugins/lifecycle';
import { PluginCache } from '../../plugins/cache';
import { GitHubPluginSource } from '../../plugins/sources/github';
import { NpmPluginSource } from '../../plugins/sources/npm';

// ============================================================================
// Plugin Command
// ============================================================================

export function createPluginCommand(): Command {
  const manager = createManager();

  const plugin = new Command('plugin')
    .description('Manage external QE domain plugins')
    .addHelpText('after', `
Examples:
  aqe plugin install ./my-plugin          Install from local directory
  aqe plugin install owner/repo --source github   Install from GitHub
  aqe plugin install aqe-plugin-sap --source npm  Install from npm
  aqe plugin list                         List installed plugins
  aqe plugin remove my-plugin             Remove a plugin
  aqe plugin info my-plugin               Show plugin details
`);

  // --- install ---
  plugin
    .command('install <location>')
    .description('Install a QE plugin from a local directory, GitHub repo, or npm package')
    .option('-s, --source <type>', 'Source type: local, github, npm', 'local')
    .action(async (location: string, options: { source: string }) => {
      try {
        console.log(`Installing plugin from ${options.source}: ${location}...`);
        const result = await manager.install(location, options.source);

        if (result.success) {
          console.log(`\n  Plugin installed successfully!`);
          console.log(`  Name:    ${result.manifest!.name}`);
          console.log(`  Version: ${result.manifest!.version}`);
          console.log(`  Domains: ${result.manifest!.domains.join(', ')}`);
          console.log(`  Cache:   ${result.cachePath}\n`);
        } else {
          console.error(`\n  Installation failed:`);
          for (const err of result.errors) {
            console.error(`    - ${err}`);
          }
          if (result.securityViolations.length > 0) {
            console.error(`\n  Security violations:`);
            for (const v of result.securityViolations) {
              console.error(`    - ${v}`);
            }
          }
          process.exitCode = 1;
        }
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      }
    });

  // --- list ---
  plugin
    .command('list')
    .description('List installed QE plugins')
    .action(() => {
      const plugins = manager.list();

      if (plugins.length === 0) {
        console.log('\n  No plugins installed.\n');
        console.log('  Install one with: aqe plugin install <location>\n');
        return;
      }

      console.log(`\n  Installed plugins (${plugins.length}):\n`);
      for (const p of plugins) {
        console.log(`  ${p.name}@${p.version}`);
        console.log(`    ${p.description}`);
        console.log(`    Domains: ${p.domains.join(', ')}`);
        console.log('');
      }
    });

  // --- remove ---
  plugin
    .command('remove <name>')
    .description('Remove an installed QE plugin')
    .option('-v, --version <version>', 'Remove specific version (default: all)')
    .action((name: string, options: { version?: string }) => {
      const removed = manager.remove(name, options.version);

      if (removed) {
        const versionStr = options.version ? `@${options.version}` : ' (all versions)';
        console.log(`\n  Removed: ${name}${versionStr}\n`);
      } else {
        console.log(`\n  Plugin not found: ${name}\n`);
        process.exitCode = 1;
      }
    });

  // --- info ---
  plugin
    .command('info <name>')
    .description('Show detailed info about an installed plugin')
    .action((name: string) => {
      const plugins = manager.list().filter(p => p.name === name);

      if (plugins.length === 0) {
        console.log(`\n  Plugin not found: ${name}\n`);
        process.exitCode = 1;
        return;
      }

      const p = plugins[0];
      console.log(`\n  Plugin: ${p.name}`);
      console.log(`  Version:     ${p.version}`);
      console.log(`  Description: ${p.description}`);
      console.log(`  Domains:     ${p.domains.join(', ')}`);
      console.log(`  Source:      ${p.source}`);
      console.log(`  Cache:       ${p.cachePath}\n`);
    });

  return plugin;
}

// ============================================================================
// Internal
// ============================================================================

function createManager(): PluginLifecycleManager {
  const cache = new PluginCache();
  return new PluginLifecycleManager({
    cache,
    sources: [
      new GitHubPluginSource(),
      new NpmPluginSource(),
    ],
  });
}
