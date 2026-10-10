/**
 * Claude Code plugin detection (#922)
 *
 * The `agentic-qe-fleet` Claude Code plugin bundles its own `agentic-qe` MCP
 * server (exposed as `mcp__plugin_agentic-qe-fleet_agentic-qe__*`). When that
 * plugin is enabled, `aqe init` must not also register a project-level
 * `agentic-qe` server in `.mcp.json`, or AQE ends up registered twice.
 *
 * Detection reads `enabledPlugins` from the three Claude Code settings scopes
 * and merges them per key with Claude Code's precedence (local > project >
 * user):
 *   - user:    `$CLAUDE_CONFIG_DIR/settings.json` (default `~/.claude/settings.json`)
 *   - project: `<project>/.claude/settings.json`
 *   - local:   `<project>/.claude/settings.local.json`
 *
 * A key `agentic-qe-fleet@<marketplace>` whose merged value is `true` means
 * the plugin is enabled. Missing, unreadable or invalid files count as "no
 * opinion"; detection never throws.
 */

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { safeJsonParse } from '../shared/safe-json.js';

/** Plugin name as published in the `agentic-qe` marketplace. */
export const AQE_FLEET_PLUGIN_NAME = 'agentic-qe-fleet';

export type ClaudeSettingsScope = 'user' | 'project' | 'local';

export interface PluginDetectionOptions {
  /** Environment to read CLAUDE_CONFIG_DIR from (defaults to process.env). */
  env?: NodeJS.ProcessEnv;
  /** Home directory used when CLAUDE_CONFIG_DIR is unset (defaults to os.homedir()). */
  homeDir?: string;
}

export interface PluginDetectionResult {
  /** True when at least one `agentic-qe-fleet@*` key resolves to `true`. */
  enabled: boolean;
  /** The enabled plugin key, e.g. `agentic-qe-fleet@agentic-qe`. */
  pluginKey?: string;
  /** Scope whose setting decided the enabled key. */
  scope?: ClaudeSettingsScope;
  /** Settings file that decided the enabled key. */
  settingsPath?: string;
}

/**
 * Settings files in ascending precedence order (later entries win).
 */
export function claudeSettingsPaths(
  projectRoot: string,
  options: PluginDetectionOptions = {},
): Array<{ scope: ClaudeSettingsScope; path: string }> {
  const env = options.env ?? process.env;
  const configDir = env.CLAUDE_CONFIG_DIR?.trim()
    ? env.CLAUDE_CONFIG_DIR.trim()
    : join(options.homeDir ?? homedir(), '.claude');
  return [
    { scope: 'user', path: join(configDir, 'settings.json') },
    { scope: 'project', path: join(projectRoot, '.claude', 'settings.json') },
    { scope: 'local', path: join(projectRoot, '.claude', 'settings.local.json') },
  ];
}

/** Read `enabledPlugins` from one settings file; null on any failure. */
function readEnabledPlugins(path: string): Record<string, unknown> | null {
  try {
    const parsed = safeJsonParse<unknown>(readFileSync(path, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const plugins = (parsed as Record<string, unknown>).enabledPlugins;
    if (!plugins || typeof plugins !== 'object' || Array.isArray(plugins)) return null;
    return plugins as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isFleetPluginKey(key: string): boolean {
  const at = key.lastIndexOf('@');
  const name = at === -1 ? key : key.slice(0, at);
  return name === AQE_FLEET_PLUGIN_NAME && at > 0 && at < key.length - 1;
}

/**
 * Detect whether the `agentic-qe-fleet` Claude Code plugin is enabled for
 * `projectRoot`. Never throws.
 */
export function detectAqeFleetPlugin(
  projectRoot: string,
  options: PluginDetectionOptions = {},
): PluginDetectionResult {
  try {
    const merged = new Map<string, { value: unknown; scope: ClaudeSettingsScope; path: string }>();
    for (const { scope, path } of claudeSettingsPaths(projectRoot, options)) {
      const plugins = readEnabledPlugins(path);
      if (!plugins) continue;
      for (const [key, value] of Object.entries(plugins)) {
        if (isFleetPluginKey(key)) merged.set(key, { value, scope, path });
      }
    }
    for (const [key, entry] of merged) {
      if (entry.value === true) {
        return { enabled: true, pluginKey: key, scope: entry.scope, settingsPath: entry.path };
      }
    }
  } catch {
    // Detection is advisory; fall through to "not enabled".
  }
  return { enabled: false };
}

/** One-line notice printed when init skips the project MCP entry. */
export const AQE_PLUGIN_MCP_SKIP_MESSAGE =
  '  MCP: skipped — the agentic-qe-fleet plugin already provides the AQE MCP server ' +
  '(mcp__plugin_agentic-qe-fleet_agentic-qe__* tools); run `aqe init --with-mcp` to add the project entry anyway';

/**
 * One-line notice printed when the plugin is enabled but `.mcp.json` already
 * has an `agentic-qe` entry (e.g. an upgrade from 3.15.1). Init never deletes
 * user config, so the entry is kept and the user is told how to remove it.
 */
export const AQE_PLUGIN_MCP_EXISTING_ENTRY_MESSAGE =
  '  MCP: kept the existing project `agentic-qe` entry in .mcp.json — it duplicates the agentic-qe-fleet ' +
  "plugin's AQE MCP server (mcp__plugin_agentic-qe-fleet_agentic-qe__* tools); to remove it, delete the " +
  '`agentic-qe` key from .mcp.json or run `claude mcp remove agentic-qe -s project`';

/** True when `<projectRoot>/.mcp.json` declares an `agentic-qe` server. Never throws. */
export function hasProjectAqeMcpEntry(projectRoot: string): boolean {
  try {
    const parsed = safeJsonParse<unknown>(readFileSync(join(projectRoot, '.mcp.json'), 'utf-8'));
    if (!parsed || typeof parsed !== 'object') return false;
    const servers = (parsed as Record<string, unknown>).mcpServers;
    return !!servers && typeof servers === 'object' && !Array.isArray(servers) &&
      Object.prototype.hasOwnProperty.call(servers, 'agentic-qe');
  } catch {
    return false;
  }
}

/** The notice to print when init skips the project entry because of the plugin. */
export function aqePluginMcpSkipMessage(projectRoot: string): string {
  return hasProjectAqeMcpEntry(projectRoot)
    ? AQE_PLUGIN_MCP_EXISTING_ENTRY_MESSAGE
    : AQE_PLUGIN_MCP_SKIP_MESSAGE;
}
