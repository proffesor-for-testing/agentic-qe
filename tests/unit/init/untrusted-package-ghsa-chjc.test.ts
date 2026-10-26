/**
 * GHSA-chjc-8q37-52fg: `aqe init` pre-approved and launched
 * `@anthropics/agentic-qe`, a package name AQE does not publish or control.
 *
 * New installs must not write it, and re-running init must remove what an
 * older version already wrote to `.claude/settings.json` and `.mcp.json`,
 * without touching the user's other entries.
 *
 * Real files in temp dirs, with CLAUDE_CONFIG_DIR pointing at a throwaway dir
 * so the plugin detector never reads the developer's own settings.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  applyV3Sections,
  generateV3SettingsSections,
  removeUntrustedAqeMcpServers,
  removeUntrustedAqePermissions,
  scrubUntrustedAqeMcpFile,
} from '../../../src/init/settings-merge.js';
import { MCPPhase } from '../../../src/init/phases/08-mcp.js';
import { configureMCP } from '../../../src/init/init-wizard-hooks.js';
import type { InitContext, InitOptions } from '../../../src/init/phases/phase-interface.js';
import type { AQEInitConfig } from '../../../src/init/types.js';

const UNTRUSTED_PERMISSION = 'Bash(npx @anthropics/agentic-qe:*)';
const LEGACY_SERVER = {
  command: 'npx',
  args: ['@anthropics/agentic-qe', 'mcp', 'start'],
  env: { AQE_LEARNING_ENABLED: 'true', AQE_VERBOSE: 'false' },
  autoStart: false,
};
const USER_SERVER = { command: 'node', args: ['my-server.js'] };
const PLUGIN_KEY = 'agentic-qe-fleet@agentic-qe';

describe('GHSA-chjc-8q37-52fg: settings.json permissions', () => {
  const config = { version: '3.15.15' } as AQEInitConfig;

  it('does not pre-approve @anthropics/agentic-qe on a new install', () => {
    const settings = applyV3Sections({}, generateV3SettingsSections(config));
    const allow = (settings.permissions as { allow: string[] }).allow;

    expect(allow).toEqual(['Bash(npx agentic-qe:*)', 'mcp__agentic-qe__*']);
    expect(JSON.stringify(settings)).not.toContain('@anthropics');
  });

  it('removes the entry an older init wrote and keeps the user entries', () => {
    const settings: Record<string, unknown> = {
      permissions: {
        allow: ['Bash(git status)', 'Bash(npx agentic-qe:*)', UNTRUSTED_PERMISSION, 'mcp__agentic-qe__*'],
        deny: ['Bash(rm -rf:*)'],
      },
    };

    applyV3Sections(settings, generateV3SettingsSections(config));

    expect(settings.permissions).toEqual({
      allow: ['Bash(git status)', 'Bash(npx agentic-qe:*)', 'mcp__agentic-qe__*'],
      deny: ['Bash(rm -rf:*)'],
    });
  });

  it('removes any allow entry naming the package, in any form', () => {
    expect(
      removeUntrustedAqePermissions([
        'Bash(npx @anthropics/agentic-qe mcp start)',
        'Bash(npx @Anthropics/Agentic-QE:*)',
        'Bash(npx @anthropic-ai/claude-code:*)',
        'Bash(npx agentic-qe:*)',
      ]),
    ).toEqual(['Bash(npx @anthropic-ai/claude-code:*)', 'Bash(npx agentic-qe:*)']);
  });
});

describe('GHSA-chjc-8q37-52fg: .mcp.json server entries', () => {
  let root: string;
  let project: string;
  let configDir: string;
  let log: ReturnType<typeof vi.fn>;

  const mcpPath = () => join(project, '.mcp.json');
  const readServers = () => JSON.parse(readFileSync(mcpPath(), 'utf-8')).mcpServers;
  const seedLegacyMcp = () =>
    writeFileSync(
      mcpPath(),
      JSON.stringify({ mcpServers: { 'agentic-qe': LEGACY_SERVER, 'aqe-copy': LEGACY_SERVER, mine: USER_SERVER } }),
    );
  const enablePlugin = () =>
    writeFileSync(join(configDir, 'settings.json'), JSON.stringify({ enabledPlugins: { [PLUGIN_KEY]: true } }));
  const context = (options: InitOptions = {}): InitContext => ({
    projectRoot: project,
    options,
    config: {},
    enhancements: { claudeFlow: false, ruvector: false },
    results: new Map(),
    services: { log, warn: vi.fn(), error: vi.fn() },
  });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'aqe-ghsa-chjc-'));
    project = join(root, 'project');
    configDir = join(root, 'claude-config');
    mkdirSync(project, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    vi.stubEnv('CLAUDE_CONFIG_DIR', configDir);
    log = vi.fn();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it('removeUntrustedAqeMcpServers removes only servers that launch the package', () => {
    const servers: Record<string, unknown> = {
      a: LEGACY_SERVER,
      b: { command: 'npx @anthropics/agentic-qe' },
      mine: USER_SERVER,
      odd: 'not-an-object',
    };

    expect(removeUntrustedAqeMcpServers(servers)).toEqual(['a', 'b']);
    expect(servers).toEqual({ mine: USER_SERVER, odd: 'not-an-object' });
  });

  it('scrubUntrustedAqeMcpFile leaves a file without the package byte-for-byte unchanged', () => {
    const original = '{"mcpServers":{"mine":{"command":"node"}}}';
    writeFileSync(mcpPath(), original);

    expect(scrubUntrustedAqeMcpFile(mcpPath())).toEqual([]);
    expect(readFileSync(mcpPath(), 'utf-8')).toBe(original);
  });

  it('scrubUntrustedAqeMcpFile ignores a missing or unparseable file', () => {
    expect(scrubUntrustedAqeMcpFile(mcpPath())).toEqual([]);
    writeFileSync(mcpPath(), '{ not json');
    expect(scrubUntrustedAqeMcpFile(mcpPath())).toEqual([]);
    expect(readFileSync(mcpPath(), 'utf-8')).toBe('{ not json');
  });

  it('MCPPhase replaces the legacy entry and removes copies, keeping user servers', async () => {
    seedLegacyMcp();

    await new MCPPhase().execute(context());

    const servers = readServers();
    expect(Object.keys(servers).sort()).toEqual(['agentic-qe', 'mine']);
    expect(servers['agentic-qe']).toMatchObject({ command: 'aqe-mcp', args: [] });
    expect(servers.mine).toEqual(USER_SERVER);
    expect(log.mock.calls.map((c) => String(c[0]))).toContain(
      '  MCP: removed server entry launching @anthropics/agentic-qe: agentic-qe, aqe-copy',
    );
  });

  it('MCPPhase still removes the legacy entry when the fleet plugin makes it skip', async () => {
    seedLegacyMcp();
    enablePlugin();

    const result = await new MCPPhase().execute(context());

    expect(result.data).toMatchObject({ configured: false, skippedForPlugin: PLUGIN_KEY });
    expect(readServers()).toEqual({ mine: USER_SERVER });
  });

  it('configureMCP (InitWizard path) writes aqe-mcp, not the untrusted package', async () => {
    seedLegacyMcp();

    expect(await configureMCP(project)).toBe(true);

    const servers = readServers();
    expect(Object.keys(servers).sort()).toEqual(['agentic-qe', 'mine']);
    expect(servers['agentic-qe']).toMatchObject({ command: 'aqe-mcp', args: [] });
    expect(readFileSync(mcpPath(), 'utf-8')).not.toContain('@anthropics');
  });

  it('configureMCP still removes the legacy entry when the fleet plugin makes it skip', async () => {
    seedLegacyMcp();
    enablePlugin();

    expect(await configureMCP(project)).toBe(false);
    expect(readServers()).toEqual({ mine: USER_SERVER });
  });
});
