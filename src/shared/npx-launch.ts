/**
 * npx launch arguments for the AQE MCP server (issue #1466).
 *
 * npm 12 blocks dependency install scripts unless they are allowed, and it
 * does so silently for `npx`. The MCP entries that the Claude Code plugin and
 * `aqe init` write start AQE with `npx -y agentic-qe@<x> mcp`, so
 * better-sqlite3 got no binary and hnswlib-node was never compiled, and
 * `fleet_init` failed. npm documents `--allow-scripts` for exactly this
 * one-off context (`npm exec` / `npx`); npm 10 and 11 accept the flag too.
 */

/** Dependencies of agentic-qe whose install scripts build a native addon. */
export const AQE_NATIVE_SCRIPT_PACKAGES = ['better-sqlite3', 'hnswlib-node'] as const;

/** npx option that lets those install scripts run. */
export const NPX_ALLOW_SCRIPTS_FLAG = `--allow-scripts=${AQE_NATIVE_SCRIPT_PACKAGES.join(',')}`;

/** Arguments for `npx` that start the AQE MCP server from `spec`. */
export function aqeNpxMcpArgs(spec = 'agentic-qe@latest'): string[] {
  return ['-y', NPX_ALLOW_SCRIPTS_FLAG, spec, 'mcp'];
}

/** The same arguments as YAML sequence items (double-quoted), one per line. */
export function aqeNpxMcpYamlArgs(indent: string, spec = 'agentic-qe@latest'): string {
  return aqeNpxMcpArgs(spec).map((arg) => `${indent}- ${JSON.stringify(arg)}`).join('\n');
}
