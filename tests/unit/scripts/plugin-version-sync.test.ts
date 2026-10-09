import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');
const readJson = <T>(path: string): T => JSON.parse(readFileSync(resolve(root, path), 'utf8')) as T;

type McpConfig = { mcpServers?: Record<string, { args?: string[]; env?: Record<string, string> }> };

describe('Claude Code plugin version sync', () => {
  const version = readJson<{ version: string }>('package.json').version;

  it('fleet plugin version tracks package.json', () => {
    const manifest = readJson<{ version: string }>('plugins/agentic-qe-fleet/.claude-plugin/plugin.json');
    expect(manifest.version).toBe(version);
  });

  it('fleet .mcp.json pins the agentic-qe server to the package version', () => {
    const mcp = readJson<McpConfig>('plugins/agentic-qe-fleet/.mcp.json');
    const args = mcp.mcpServers?.['agentic-qe']?.args ?? [];
    expect(args).toContain(`agentic-qe@${version}`);
    expect(args.some((a) => a.endsWith('@latest'))).toBe(false);
  });

  it('every ${user_config.*} in .mcp.json is declared with a default', () => {
    const raw = readFileSync(resolve(root, 'plugins/agentic-qe-fleet/.mcp.json'), 'utf8');
    const keys = [...raw.matchAll(/\$\{user_config\.([A-Za-z0-9_]+)\}/g)].map((m) => m[1]);
    const manifest = readJson<{ userConfig?: Record<string, { default?: unknown }> }>(
      'plugins/agentic-qe-fleet/.claude-plugin/plugin.json',
    );
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(manifest.userConfig?.[key], key).toHaveProperty('default');
    }
  });

  it('repo-root manifest uses a string repository and the same pinned version', () => {
    const manifest = readJson<{ version: string; repository: unknown } & McpConfig>('.claude-plugin/plugin.json');
    expect(typeof manifest.repository).toBe('string');
    expect(manifest.version).toBe(version);
    expect(manifest.mcpServers?.['agentic-qe']?.args).toContain(`agentic-qe@${version}`);
  });

  it('sync-plugin-versions --check reports no drift and is the npm version hook', () => {
    const out = execFileSync('node', ['scripts/sync-plugin-versions.cjs', '--check'], { cwd: root, encoding: 'utf8' });
    expect(out).toContain(`in sync with package.json (${version})`);
    const scripts = readJson<{ scripts: Record<string, string> }>('package.json').scripts;
    expect(scripts.version).toContain('sync-plugin-versions.cjs');
  });
});
