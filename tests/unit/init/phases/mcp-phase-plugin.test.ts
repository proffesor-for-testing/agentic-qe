/**
 * Test: MCPPhase skips the project .mcp.json entry when the agentic-qe-fleet
 * Claude Code plugin is enabled (#922).
 *
 * Real files in temp dirs: the phase's default detector reads the settings
 * scopes from disk, with CLAUDE_CONFIG_DIR pointing at a throwaway dir.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MCPPhase } from '../../../../src/init/phases/08-mcp.js';
import { configureMCP } from '../../../../src/init/init-wizard-hooks.js';
import type { InitContext, InitOptions } from '../../../../src/init/phases/phase-interface.js';

const KEY = 'agentic-qe-fleet@agentic-qe';

describe('MCPPhase with the agentic-qe-fleet plugin (#922)', () => {
  let root: string;
  let project: string;
  let configDir: string;
  let log: ReturnType<typeof vi.fn>;

  const mcpPath = () => join(project, '.mcp.json');
  const enablePluginForUser = (value = true) => {
    writeFileSync(join(configDir, 'settings.json'), JSON.stringify({ enabledPlugins: { [KEY]: value } }));
  };
  const context = (options: InitOptions = {}): InitContext => ({
    projectRoot: project,
    options,
    config: {},
    enhancements: { claudeFlow: false, ruvector: false },
    results: new Map(),
    services: { log, warn: vi.fn(), error: vi.fn() },
  });
  const loggedLines = () => log.mock.calls.map((c) => String(c[0]));

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'aqe-922-mcp-'));
    project = join(root, 'project');
    configDir = join(root, 'claude-config');
    mkdirSync(project, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    vi.stubEnv('CLAUDE_CONFIG_DIR', configDir);
    log = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it('skips .mcp.json and prints one notice when the plugin is enabled', async () => {
    enablePluginForUser();

    const result = await new MCPPhase().execute(context());

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ configured: false, skippedForPlugin: KEY });
    expect(existsSync(mcpPath())).toBe(false);
    const notices = loggedLines().filter((l) => l.includes('agentic-qe-fleet plugin'));
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain('mcp__plugin_agentic-qe-fleet_agentic-qe__');
    expect(notices[0]).toContain('aqe init --with-mcp');
  });

  it('writes the entry exactly as before when the plugin is not enabled', async () => {
    const result = await new MCPPhase().execute(context());

    expect(result.data).toMatchObject({ configured: true, serverName: 'agentic-qe' });
    expect(readFileSync(mcpPath(), 'utf-8')).toBe(
      JSON.stringify(
        {
          mcpServers: {
            'agentic-qe': {
              command: 'aqe-mcp',
              args: [],
              env: { AQE_LEARNING_ENABLED: 'true', AQE_WORKERS_ENABLED: 'true', NODE_ENV: 'production' },
            },
          },
        },
        null,
        2,
      ),
    );
  });

  it('writes the entry when the plugin is installed but disabled', async () => {
    enablePluginForUser(false);

    const result = await new MCPPhase().execute(context());

    expect(result.data!.configured).toBe(true);
    expect(existsSync(mcpPath())).toBe(true);
  });

  it('--with-mcp forces the entry even with the plugin enabled', async () => {
    enablePluginForUser();

    const result = await new MCPPhase().execute(context({ withMcp: true }));

    expect(result.data).toMatchObject({ configured: true, serverName: 'agentic-qe' });
    const parsed = JSON.parse(readFileSync(mcpPath(), 'utf-8'));
    expect(parsed.mcpServers['agentic-qe'].command).toBe('aqe-mcp');
  });

  it('leaves an existing agentic-qe entry and other servers untouched', async () => {
    enablePluginForUser();
    const existing = JSON.stringify(
      { mcpServers: { 'agentic-qe': { command: 'custom-aqe', args: ['x'] }, other: { command: 'o' } } },
      null,
      2,
    );
    writeFileSync(mcpPath(), existing);

    await new MCPPhase().execute(context());

    expect(readFileSync(mcpPath(), 'utf-8')).toBe(existing);
  });

  it('reports a kept agentic-qe entry as a duplicate and says how to remove it (upgrade from 3.15.1)', async () => {
    enablePluginForUser();
    const existing = JSON.stringify(
      { mcpServers: { 'agentic-qe': { command: 'aqe-mcp', args: [] } } },
      null,
      2,
    );
    writeFileSync(mcpPath(), existing);

    const result = await new MCPPhase().execute(context());

    expect(result.data).toMatchObject({ configured: false, skippedForPlugin: KEY });
    expect(readFileSync(mcpPath(), 'utf-8')).toBe(existing);
    const mcpLines = loggedLines().filter((l) => l.includes('MCP:'));
    expect(mcpLines).toHaveLength(1);
    expect(mcpLines[0]).toContain('kept the existing project `agentic-qe` entry');
    expect(mcpLines[0]).toContain('duplicates the agentic-qe-fleet');
    expect(mcpLines[0]).toContain('delete the `agentic-qe` key from .mcp.json');
    expect(mcpLines[0]).toContain('claude mcp remove agentic-qe -s project');
    expect(mcpLines[0]).not.toContain('--with-mcp');
  });

  it('uses the plain skip notice when .mcp.json has only other servers', async () => {
    enablePluginForUser();
    writeFileSync(mcpPath(), JSON.stringify({ mcpServers: { other: { command: 'o' } } }));

    await new MCPPhase().execute(context());

    const mcpLines = loggedLines().filter((l) => l.includes('MCP:'));
    expect(mcpLines).toHaveLength(1);
    expect(mcpLines[0]).toContain('aqe init --with-mcp');
    expect(mcpLines[0]).not.toContain('kept the existing');
  });

  it('uses the plain skip notice when .mcp.json is malformed', async () => {
    enablePluginForUser();
    writeFileSync(mcpPath(), '{ "mcpServers": { "agentic-qe": ');

    const result = await new MCPPhase().execute(context());

    expect(result.success).toBe(true);
    expect(loggedLines().filter((l) => l.includes('MCP:'))[0]).toContain('aqe init --with-mcp');
    expect(readFileSync(mcpPath(), 'utf-8')).toBe('{ "mcpServers": { "agentic-qe": ');
  });

  it('honours a project-scope enable written in the project itself', async () => {
    mkdirSync(join(project, '.claude'), { recursive: true });
    writeFileSync(join(project, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { [KEY]: true } }));

    const result = await new MCPPhase().execute(context());

    expect(result.data!.configured).toBe(false);
    expect(existsSync(mcpPath())).toBe(false);
  });

  it('--no-claude still wins over plugin detection', async () => {
    enablePluginForUser();

    const result = await new MCPPhase().execute(context({ noClaude: true }));

    expect(result.data!.skippedForPlugin).toBeUndefined();
    expect(loggedLines().some((l) => l.includes('--no-claude'))).toBe(true);
  });

  it('uses an injected detector when provided', async () => {
    const detector = vi.fn().mockReturnValue({ enabled: true, pluginKey: 'agentic-qe-fleet@fork' });

    const result = await new MCPPhase(detector).execute(context());

    expect(detector).toHaveBeenCalledWith(project);
    expect(result.data!.skippedForPlugin).toBe('agentic-qe-fleet@fork');
  });

  describe('legacy wizard configureMCP', () => {
    it('skips the entry when the plugin is enabled', async () => {
      enablePluginForUser();
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const configured = await configureMCP(project);

      expect(configured).toBe(false);
      expect(existsSync(mcpPath())).toBe(false);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('aqe init --with-mcp'));
      spy.mockRestore();
    });

    it('reports a kept agentic-qe entry and does not touch it', async () => {
      enablePluginForUser();
      const existing = JSON.stringify({ mcpServers: { 'agentic-qe': { command: 'aqe-mcp' } } });
      writeFileSync(mcpPath(), existing);
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

      expect(await configureMCP(project)).toBe(false);

      expect(readFileSync(mcpPath(), 'utf-8')).toBe(existing);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('claude mcp remove agentic-qe -s project'));
      spy.mockRestore();
    });

    it('writes the entry with force even when the plugin is enabled', async () => {
      enablePluginForUser();

      expect(await configureMCP(project, { force: true })).toBe(true);
      expect(JSON.parse(readFileSync(mcpPath(), 'utf-8')).mcpServers['agentic-qe']).toBeDefined();
    });

    it('writes the entry when the plugin is not enabled', async () => {
      expect(await configureMCP(project)).toBe(true);
      expect(existsSync(mcpPath())).toBe(true);
    });
  });
});
