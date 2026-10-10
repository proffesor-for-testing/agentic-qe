import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
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

  it('aqe-mod MOD_VERSION (hooks/version.ts) equals the plugin version (#923)', () => {
    const manifest = readJson<{ version: string }>('plugins/agentic-qe-fleet/.claude-plugin/plugin.json');
    const source = readFileSync(resolve(root, 'plugins/agentic-qe-fleet/hooks/version.ts'), 'utf8');
    expect(source).toContain(`export const MOD_VERSION = '${manifest.version}'`);
    expect(source).not.toContain("'0.1.0'");
  });

  it('--check fails on a drifted MOD_VERSION and the write mode repairs it (#923)', () => {
    const tmp = mkdtempSync(resolve(tmpdir(), 'aqe-sync-'));
    try {
      const files = [
        'scripts/sync-plugin-versions.cjs',
        'package.json',
        '.claude-plugin/plugin.json',
        'plugins/agentic-qe-fleet/.claude-plugin/plugin.json',
        'plugins/agentic-qe-fleet/.mcp.json',
        'plugins/agentic-qe-fleet/hooks/version.ts',
      ];
      for (const f of files) {
        mkdirSync(dirname(resolve(tmp, f)), { recursive: true });
        cpSync(resolve(root, f), resolve(tmp, f));
      }
      const modFile = resolve(tmp, 'plugins/agentic-qe-fleet/hooks/version.ts');
      writeFileSync(modFile, "export const MOD_VERSION = '0.1.0'\n");
      const script = resolve(tmp, 'scripts/sync-plugin-versions.cjs');

      const drift = spawnSync('node', [script, '--check'], { encoding: 'utf8' });
      expect(drift.status).toBe(1);
      expect(drift.stderr).toContain(`plugins/agentic-qe-fleet/hooks/version.ts: MOD_VERSION '0.1.0', expected '${version}' (package.json)`);
      expect(readFileSync(modFile, 'utf8')).toContain("'0.1.0'");

      const write = spawnSync('node', [script], { encoding: 'utf8' });
      expect(write.status).toBe(0);
      expect(readFileSync(modFile, 'utf8')).toBe(readFileSync(resolve(root, 'plugins/agentic-qe-fleet/hooks/version.ts'), 'utf8'));
      expect(spawnSync('node', [script, '--check'], { encoding: 'utf8' }).status).toBe(0);

      // Right version, hand-edited text: --check names the file and shows what it expected.
      writeFileSync(modFile, `export const MOD_VERSION = '${version}' // edited\n`);
      const edited = spawnSync('node', [script, '--check'], { encoding: 'utf8' });
      expect(edited.status).toBe(1);
      expect(edited.stderr).toContain(`plugins/agentic-qe-fleet/hooks/version.ts: MOD_VERSION is '${version}' but the file differs from the generated text`);
      expect(edited.stderr).toContain('expected exactly:');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
