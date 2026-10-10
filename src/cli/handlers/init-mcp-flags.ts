/**
 * `aqe init` MCP flag resolution (#922, #931)
 *
 * Commander maps the negatable `--no-mcp` flag to `options.mcp === false`;
 * it never sets `options.noMcp`. Reading only `noMcp` made `--no-mcp` a
 * silent no-op (#931). `noMcp` is still honoured for programmatic callers.
 *
 * `--no-mcp` and `--with-mcp` contradict each other. The CLI rejects the
 * combination at parse time (Commander `.conflicts()`); this resolver
 * rejects it for programmatic callers too, so neither path guesses.
 */

export interface InitMcpFlagInput {
  /** Commander negatable flag: `--no-mcp` sets this to false. */
  mcp?: boolean;
  /** Programmatic alias for `--no-mcp`. */
  noMcp?: boolean;
  /** `--with-mcp`: write the entry even when the agentic-qe-fleet plugin is enabled. */
  withMcp?: boolean;
}

export interface ResolvedInitMcpFlags {
  noMcp: boolean;
  withMcp: boolean;
}

export const INIT_MCP_FLAG_CONFLICT_MESSAGE =
  '--no-mcp and --with-mcp cannot be combined: --no-mcp skips the .mcp.json entry, --with-mcp forces it';

export function resolveInitMcpFlags(options: InitMcpFlagInput): ResolvedInitMcpFlags {
  const noMcp = options.mcp === false || options.noMcp === true;
  const withMcp = options.withMcp === true;
  if (noMcp && withMcp) {
    throw new Error(INIT_MCP_FLAG_CONFLICT_MESSAGE);
  }
  return { noMcp, withMcp };
}
