/**
 * #1466: under npm 12, `npx -y agentic-qe@<x> mcp` silently skips the install
 * scripts of better-sqlite3 and hnswlib-node, so fleet_init fails. Every npx
 * launch of the MCP server that we ship or generate must allow them.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { NPX_ALLOW_SCRIPTS_FLAG, aqeNpxMcpArgs } from '../../../src/shared/npx-launch.js';

const ROOT = join(__dirname, '../../..');
const PLUGIN_MANIFESTS = ['.claude-plugin/plugin.json', 'plugins/agentic-qe-fleet/.mcp.json'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

describe('npx launches allow the native install scripts (#1466)', () => {
  it('should_allow_both_native_packages_in_the_flag', () => {
    expect(NPX_ALLOW_SCRIPTS_FLAG).toBe('--allow-scripts=better-sqlite3,hnswlib-node');
  });

  it('should_put_the_flag_before_the_package_spec', () => {
    expect(aqeNpxMcpArgs('agentic-qe@1.2.3')).toEqual([
      '-y', '--allow-scripts=better-sqlite3,hnswlib-node', 'agentic-qe@1.2.3', 'mcp',
    ]);
  });

  it.each(PLUGIN_MANIFESTS)('should_launch_the_plugin_server_with_the_flag_in_%s', (file) => {
    const manifest = JSON.parse(readFileSync(join(ROOT, file), 'utf-8'));
    const args: string[] = manifest.mcpServers['agentic-qe'].args;
    const pin = args.findIndex((arg) => arg.startsWith('agentic-qe@'));

    expect(manifest.mcpServers['agentic-qe'].command).toBe('npx');
    expect(args.indexOf(NPX_ALLOW_SCRIPTS_FLAG)).toBeGreaterThanOrEqual(0);
    expect(args.indexOf(NPX_ALLOW_SCRIPTS_FLAG)).toBeLessThan(pin);
  });

  // Array, TOML and YAML forms of an npx launch whose first arg after -y/--yes is
  // the package itself, i.e. one that does not pass the flag.
  const LAUNCH_WITHOUT_FLAG = [
    /['"]-y['"],\s*['"]agentic-qe(?:@|['"])/,
    /['"]--yes['"],\s*['"]agentic-qe(?:@|['"])/,
    /-\s+"?-y"?\s*\r?\n\s*-\s+"?agentic-qe/,
  ];

  it('should_leave_no_npx_launch_without_the_flag_in_src', () => {
    const offenders = sourceFiles(join(ROOT, 'src')).filter((file) => {
      const text = readFileSync(file, 'utf-8');
      return LAUNCH_WITHOUT_FLAG.some((re) => re.test(text));
    });
    expect(offenders).toEqual([]);
  });

  it.each([
    "args: ['-y', 'agentic-qe@latest', 'mcp']",
    'args = ["-y", "agentic-qe@latest", "mcp"]',
    "['--yes', 'agentic-qe', 'mcp']",
    '    args:\n      - "-y"\n      - agentic-qe@latest\n      - mcp',
  ])('should_flag_the_old_launch_form_%#', (text) => {
    expect(LAUNCH_WITHOUT_FLAG.some((re) => re.test(text))).toBe(true);
  });
});
