/**
 * Issue #1413: `aqe init --with-claude-flow` must write the ruflo MCP entry and the
 * install hints from RUFLO_PINNED_SPEC, refresh entries that are exactly an old AQE
 * default, and leave every user-customised entry alone.
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/adapters/claude-flow/detect.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/adapters/claude-flow/detect.js')>();
  return {
    ...actual,
    detectClaudeFlow: vi.fn(() => ({ available: true, method: 'local-binary', version: '3.76.0' })),
  };
});

import {
  isLegacyAqeRufloEntry,
  rufloMcpServerEntry,
  setupClaudeFlowIntegration,
} from '../../../../src/cli/commands/claude-flow-setup.js';
import { getClaudeFlowNotFoundMessage } from '../../../../src/adapters/claude-flow/detect.js';
import { RUFLO_PINNED_SPEC } from '../../../../src/shared/pinned-tools.js';

const PINNED_ENTRY = { command: 'npx', args: [RUFLO_PINNED_SPEC, 'mcp'], env: {} };

describe('ruflo MCP pin written by aqe init (#1413)', () => {
  let projectRoot: string;
  let settingsPath: string;

  const writeSettings = (settings: unknown) => writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  const readServers = () => JSON.parse(readFileSync(settingsPath, 'utf8')).mcpServers as Record<string, unknown>;
  const runSetup = async () => {
    const result = await setupClaudeFlowIntegration({ projectRoot, force: true });
    expect(result.error).toBeUndefined();
  };

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'aqe-1413-'));
    mkdirSync(join(projectRoot, '.claude'), { recursive: true });
    // aqe init creates .agentic-qe before the Claude Flow step runs.
    mkdirSync(join(projectRoot, '.agentic-qe'), { recursive: true });
    settingsPath = join(projectRoot, '.claude', 'settings.json');
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('should_writePinnedRufloEntry_when_settingsHaveNoRufloServer', async () => {
    await runSetup();

    expect(readServers().ruflo).toEqual(PINNED_ENTRY);
  });

  it('should_upgradeEntry_when_itIsExactlyTheOldAqeRuflo3518Default', async () => {
    writeSettings({ mcpServers: { ruflo: { command: 'npx', args: ['ruflo@3.5.18', 'mcp'], env: {} } } });

    await runSetup();

    expect(readServers().ruflo).toEqual(PINNED_ENTRY);
  });

  it('should_upgradeClaudeFlowKeyInPlace_when_itIsTheOldAnthropicClaudeFlowDefault', async () => {
    writeSettings({ mcpServers: { 'claude-flow': { command: 'npx', args: ['@anthropic/claude-flow', 'mcp'], env: {} } } });

    await runSetup();

    const servers = readServers();
    expect(servers['claude-flow']).toEqual(PINNED_ENTRY);
    expect(servers.ruflo).toBeUndefined();
  });

  it.each([
    ['an env var', { command: 'npx', args: ['ruflo@3.5.18', 'mcp'], env: { RUFLO_DEBUG: '1' } }],
    ['another version', { command: 'npx', args: ['ruflo@3.60.0', 'mcp'], env: {} }],
    ['a global binary', { command: 'ruflo', args: ['mcp', 'start'] }],
    ['an extra key', { command: 'npx', args: ['ruflo@3.5.18', 'mcp'], env: {}, autoStart: false }],
    ['extra args', { command: 'npx', args: ['-y', 'ruflo@3.5.18', 'mcp'], env: {} }],
  ])('should_keepUserValue_when_rufloEntryHas %s', async (_label, entry) => {
    writeSettings({ mcpServers: { ruflo: entry } });

    await runSetup();

    expect(readServers().ruflo).toEqual(entry);
  });

  it('should_preserveOtherSettings_when_upgradingTheLegacyEntry', async () => {
    const other = { command: 'aqe-mcp', args: [] };
    writeSettings({
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo hi' }] }] },
      mcpServers: { ruflo: { command: 'npx', args: ['ruflo@3.5.18', 'mcp'], env: {} }, other },
    });

    await runSetup();

    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(settings.hooks.Stop[0].hooks[0].command).toBe('echo hi');
    expect(settings.mcpServers.other).toEqual(other);
    expect(settings.mcpServers.ruflo).toEqual(PINNED_ENTRY);
  });

  it('should_leaveSettingsByteIdentical_when_rerunAfterUpgrade', async () => {
    writeSettings({ mcpServers: { ruflo: { command: 'npx', args: ['ruflo@3.5.18', 'mcp'], env: {} } } });
    await runSetup();
    const afterFirst = readFileSync(settingsPath, 'utf8');

    await runSetup();

    expect(readFileSync(settingsPath, 'utf8')).toBe(afterFirst);
  });

  it('should_matchOnlyExactLegacyDefaults_when_classifyingEntries', () => {
    expect(isLegacyAqeRufloEntry({ command: 'npx', args: ['ruflo@3.5.18', 'mcp'] })).toBe(true);
    expect(isLegacyAqeRufloEntry(rufloMcpServerEntry())).toBe(false);
    expect(isLegacyAqeRufloEntry({ command: 'npx', args: ['ruflo@3.5.18 mcp'] })).toBe(false);
    expect(isLegacyAqeRufloEntry({ command: 'npx', args: ['ruflo@3.5.18', 'mcp'], env: [] })).toBe(false);
    expect(isLegacyAqeRufloEntry(undefined)).toBe(false);
    expect(isLegacyAqeRufloEntry(['npx'])).toBe(false);
  });

  it('should_pinBothInstallHints_when_claudeFlowIsNotFound', () => {
    const message = getClaudeFlowNotFoundMessage();

    expect(message).toContain(`npm install -g ${RUFLO_PINNED_SPEC}`);
    expect(message).toContain(`claude mcp add ruflo -- npx -y ${RUFLO_PINNED_SPEC} mcp`);
    expect(message).not.toMatch(/ruflo@3\.5\.18|npm install -g ruflo\s*$/m);
  });
});
