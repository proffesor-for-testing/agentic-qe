/**
 * Test: agentic-qe-fleet plugin detection (#922)
 *
 * Uses real settings files in temp dirs — no fs mocks — so the precedence
 * and parsing behaviour are exercised exactly as init sees them.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  claudeSettingsPaths,
  detectAqeFleetPlugin,
} from '../../../src/init/claude-plugin-detection.js';

const KEY = 'agentic-qe-fleet@agentic-qe';

describe('detectAqeFleetPlugin (#922)', () => {
  let root: string;
  let project: string;
  let configDir: string;
  let home: string;

  const env = () => ({ CLAUDE_CONFIG_DIR: configDir });
  const writeJson = (path: string, value: unknown) => {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value));
  };
  const userSettings = () => join(configDir, 'settings.json');
  const projectSettings = () => join(project, '.claude', 'settings.json');
  const localSettings = () => join(project, '.claude', 'settings.local.json');

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'aqe-922-detect-'));
    project = join(root, 'project');
    configDir = join(root, 'claude-config');
    home = join(root, 'home');
    mkdirSync(project, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    mkdirSync(home, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns not enabled when no settings files exist', () => {
    expect(detectAqeFleetPlugin(project, { env: env() })).toEqual({ enabled: false });
  });

  it('detects the plugin enabled in user scope', () => {
    writeJson(userSettings(), { enabledPlugins: { [KEY]: true } });

    const result = detectAqeFleetPlugin(project, { env: env() });

    expect(result).toMatchObject({ enabled: true, pluginKey: KEY, scope: 'user', settingsPath: userSettings() });
  });

  it('detects the plugin enabled in project scope', () => {
    writeJson(projectSettings(), { enabledPlugins: { [KEY]: true } });

    expect(detectAqeFleetPlugin(project, { env: env() })).toMatchObject({ enabled: true, scope: 'project' });
  });

  it('detects the plugin enabled in local scope', () => {
    writeJson(localSettings(), { enabledPlugins: { [KEY]: true } });

    expect(detectAqeFleetPlugin(project, { env: env() })).toMatchObject({ enabled: true, scope: 'local' });
  });

  it('accepts any marketplace suffix', () => {
    writeJson(userSettings(), { enabledPlugins: { 'agentic-qe-fleet@my-fork': true } });

    expect(detectAqeFleetPlugin(project, { env: env() })).toMatchObject({
      enabled: true,
      pluginKey: 'agentic-qe-fleet@my-fork',
    });
  });

  it('ignores other plugins and look-alike names', () => {
    writeJson(userSettings(), {
      enabledPlugins: {
        'ruflo-core@ruflo': true,
        'agentic-qe-fleet-extra@agentic-qe': true,
        'my-agentic-qe-fleet@agentic-qe': true,
        'agentic-qe-fleet': true,
        'agentic-qe-fleet@': true,
      },
    });

    expect(detectAqeFleetPlugin(project, { env: env() }).enabled).toBe(false);
  });

  it('treats non-true values as not enabled', () => {
    writeJson(userSettings(), { enabledPlugins: { [KEY]: 'true' } });

    expect(detectAqeFleetPlugin(project, { env: env() }).enabled).toBe(false);
  });

  it('project false overrides user true', () => {
    writeJson(userSettings(), { enabledPlugins: { [KEY]: true } });
    writeJson(projectSettings(), { enabledPlugins: { [KEY]: false } });

    expect(detectAqeFleetPlugin(project, { env: env() }).enabled).toBe(false);
  });

  it('local false overrides project true', () => {
    writeJson(projectSettings(), { enabledPlugins: { [KEY]: true } });
    writeJson(localSettings(), { enabledPlugins: { [KEY]: false } });

    expect(detectAqeFleetPlugin(project, { env: env() }).enabled).toBe(false);
  });

  it('local true overrides project false', () => {
    writeJson(userSettings(), { enabledPlugins: { [KEY]: false } });
    writeJson(projectSettings(), { enabledPlugins: { [KEY]: false } });
    writeJson(localSettings(), { enabledPlugins: { [KEY]: true } });

    expect(detectAqeFleetPlugin(project, { env: env() })).toMatchObject({ enabled: true, scope: 'local' });
  });

  it('a scope without the key does not override an earlier true', () => {
    writeJson(userSettings(), { enabledPlugins: { [KEY]: true } });
    writeJson(localSettings(), { enabledPlugins: { 'other@x': false } });

    expect(detectAqeFleetPlugin(project, { env: env() })).toMatchObject({ enabled: true, scope: 'user' });
  });

  it('treats a malformed settings file as no opinion and never throws', () => {
    writeJson(userSettings(), { enabledPlugins: { [KEY]: true } });
    writeJson(projectSettings(), '{ "enabledPlugins": { not json');

    expect(() => detectAqeFleetPlugin(project, { env: env() })).not.toThrow();
    expect(detectAqeFleetPlugin(project, { env: env() })).toMatchObject({ enabled: true, scope: 'user' });
  });

  it('returns not enabled when the only settings file is malformed', () => {
    writeJson(userSettings(), 'not-json{{{');

    expect(detectAqeFleetPlugin(project, { env: env() })).toEqual({ enabled: false });
  });

  it('ignores enabledPlugins that is not an object', () => {
    writeJson(userSettings(), { enabledPlugins: [KEY] });
    writeJson(projectSettings(), { enabledPlugins: null });
    writeJson(localSettings(), [1, 2, 3]);

    expect(detectAqeFleetPlugin(project, { env: env() }).enabled).toBe(false);
  });

  it('treats an unreadable settings file as not enabled', () => {
    // A directory where the file should be makes readFileSync fail with EISDIR.
    mkdirSync(userSettings(), { recursive: true });

    expect(detectAqeFleetPlugin(project, { env: env() })).toEqual({ enabled: false });
  });

  it('treats a permission-denied settings file as not enabled', () => {
    if (process.getuid?.() === 0) return; // root ignores file modes
    writeJson(userSettings(), { enabledPlugins: { [KEY]: true } });
    chmodSync(userSettings(), 0o000);
    try {
      expect(detectAqeFleetPlugin(project, { env: env() })).toEqual({ enabled: false });
    } finally {
      chmodSync(userSettings(), 0o600);
    }
  });

  describe('CLAUDE_CONFIG_DIR', () => {
    it('reads user settings from CLAUDE_CONFIG_DIR, not the home dir', () => {
      writeJson(join(home, '.claude', 'settings.json'), { enabledPlugins: { [KEY]: true } });

      expect(detectAqeFleetPlugin(project, { env: env(), homeDir: home }).enabled).toBe(false);

      writeJson(userSettings(), { enabledPlugins: { [KEY]: true } });
      expect(detectAqeFleetPlugin(project, { env: env(), homeDir: home }).enabled).toBe(true);
    });

    it('falls back to ~/.claude/settings.json when CLAUDE_CONFIG_DIR is unset or blank', () => {
      writeJson(join(home, '.claude', 'settings.json'), { enabledPlugins: { [KEY]: true } });

      expect(detectAqeFleetPlugin(project, { env: {}, homeDir: home }).enabled).toBe(true);
      expect(detectAqeFleetPlugin(project, { env: { CLAUDE_CONFIG_DIR: '  ' }, homeDir: home }).enabled).toBe(true);
    });

    it('lists the settings paths in ascending precedence', () => {
      expect(claudeSettingsPaths(project, { env: env() })).toEqual([
        { scope: 'user', path: userSettings() },
        { scope: 'project', path: projectSettings() },
        { scope: 'local', path: localSettings() },
      ]);
    });
  });
});
