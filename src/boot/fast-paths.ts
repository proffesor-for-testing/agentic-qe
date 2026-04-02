/**
 * IMP-06: Startup Fast Paths
 *
 * Mode detection and fast-path helpers that allow trivial CLI commands
 * (--version, health) to bypass full kernel initialization.
 *
 * Integration into cli/index.ts and mcp/entry.ts is deferred to a follow-up wave.
 */

export type BootMode = 'cli-version' | 'cli-health' | 'cli-full' | 'mcp' | 'http';

/**
 * Detect the boot mode from process argv and environment variables.
 * Checked in priority order: version flag > health subcommand > env-based modes > full CLI.
 */
export function detectBootMode(argv: string[]): BootMode {
  // Check for version flag first (fastest path — no kernel needed)
  if (argv.includes('--version') || argv.includes('-v')) return 'cli-version';

  // Check for health subcommand (second arg after node + script)
  const subcommand = argv[2];
  if (subcommand === 'health') return 'cli-health';

  // Check environment for MCP/HTTP mode
  if (process.env.AQE_MCP === '1' || process.env.AQE_MCP_MODE === '1') return 'mcp';
  if (process.env.AQE_HTTP_PORT) return 'http';

  return 'cli-full';
}

/**
 * Returns true when argv contains --version or -v.
 * Disabled via AQE_FAST_PATHS=false.
 */
export function isVersionFastPath(argv: string[]): boolean {
  if (process.env.AQE_FAST_PATHS === 'false') return false;
  return argv.includes('--version') || argv.includes('-v');
}

/**
 * Returns true when the first positional argument is "health".
 */
export function isHealthFastPath(argv: string[]): boolean {
  return argv[2] === 'health';
}
