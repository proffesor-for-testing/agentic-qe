/**
 * `aqe init` negatable flag resolution (#922, #931, #935)
 *
 * Commander maps a negatable `--no-<name>` flag to `options.<name> === false`;
 * it never sets `options.no<Name>`. Reading `noMcp` / `noGovernance` made
 * `--no-mcp` (#931) and `--no-governance` (#935) silent no-ops. Every
 * negatable init flag is resolved here, the same way, so the handler never
 * reads a Commander option name by hand.
 *
 * The `no<Name>: true` spelling is still honoured for programmatic callers.
 *
 * `--no-mcp` and `--with-mcp` contradict each other. The CLI rejects the
 * combination at parse time (Commander `.conflicts()`); this resolver
 * rejects it for programmatic callers too, so neither path guesses.
 */

export interface InitFlagInput {
  /** `--no-mcp` sets this to false. */
  mcp?: boolean;
  /** `--no-governance` sets this to false. */
  governance?: boolean;
  /** `--no-claude` sets this to false (#532). */
  claude?: boolean;
  /** `--no-statusline` sets this to false (#591). */
  statusline?: boolean;
  /** `--no-database` sets this to false. */
  database?: boolean;
  /** Programmatic aliases. */
  noMcp?: boolean;
  noGovernance?: boolean;
  noClaude?: boolean;
  noStatusLine?: boolean;
  /** `--with-mcp`: write the entry even when the agentic-qe-fleet plugin is enabled. */
  withMcp?: boolean;
}

export interface ResolvedInitFlags {
  noMcp: boolean;
  withMcp: boolean;
  noGovernance: boolean;
  noClaude: boolean;
  noStatusLine: boolean;
  noDatabase: boolean;
}

export const INIT_MCP_FLAG_CONFLICT_MESSAGE =
  '--no-mcp and --with-mcp cannot be combined: --no-mcp skips the .mcp.json entry, --with-mcp forces it';

/** True when the negatable flag was turned off, or the programmatic alias was set. */
function isOff(value: boolean | undefined, alias: boolean | undefined): boolean {
  return value === false || alias === true;
}

export function resolveInitFlags(options: InitFlagInput): ResolvedInitFlags {
  const resolved: ResolvedInitFlags = {
    noMcp: isOff(options.mcp, options.noMcp),
    withMcp: options.withMcp === true,
    noGovernance: isOff(options.governance, options.noGovernance),
    noClaude: isOff(options.claude, options.noClaude),
    noStatusLine: isOff(options.statusline, options.noStatusLine),
    noDatabase: options.database === false,
  };
  if (resolved.noMcp && resolved.withMcp) {
    throw new Error(INIT_MCP_FLAG_CONFLICT_MESSAGE);
  }
  return resolved;
}
