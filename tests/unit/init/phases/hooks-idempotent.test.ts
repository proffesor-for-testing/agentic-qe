/**
 * HooksPhase convergence (#778): a repeat run on unchanged settings must not
 * rewrite .claude/settings.json, create a backup, or restamp aqe.initialized —
 * while user edits stay preserved (v3.12.1 non-destructive contract) and a real
 * change such as a version upgrade still migrates the file.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { HooksPhase } from '../../../../src/init/phases/07-hooks.js';
import type { InitContext } from '../../../../src/init/phases/phase-interface.js';
import { createDefaultConfig } from '../../../../src/init/types.js';

describe('HooksPhase settings convergence (#778)', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function setup(): { context: InitContext; settingsPath: string; backupPath: string; run: () => Promise<void> } {
    const projectRoot = mkdtempSync(join(tmpdir(), 'aqe-hooks-idempotent-'));
    roots.push(projectRoot);
    const config = createDefaultConfig('demo', projectRoot);
    config.version = '3.14.5';
    const context: InitContext = {
      projectRoot,
      options: {},
      config,
      enhancements: { claudeFlow: false, ruvector: false },
      results: new Map(),
      services: { log: () => {}, warn: () => {}, error: () => {} },
    };
    const phase = new HooksPhase();
    const run = async (): Promise<void> => {
      const result = await phase.execute(context);
      expect(result.success, result.error?.message).toBe(true);
    };
    return {
      context,
      settingsPath: join(projectRoot, '.claude', 'settings.json'),
      backupPath: join(projectRoot, '.claude', 'settings.json.backup'),
      run,
    };
  }

  /** Age a file's mtime so a rewrite within the same millisecond is still visible. */
  function ageFile(path: string): number {
    const past = new Date(Date.now() - 60_000);
    utimesSync(path, past, past);
    return statSync(path).mtimeMs;
  }

  it('leaves unchanged settings untouched: same bytes, same mtime, no backup, original timestamp', async () => {
    const { settingsPath, backupPath, run } = setup();
    await run();
    const first = readFileSync(settingsPath, 'utf-8');
    const mtime = ageFile(settingsPath);

    await run();
    await run();

    expect(readFileSync(settingsPath, 'utf-8')).toBe(first);
    expect(statSync(settingsPath).mtimeMs).toBe(mtime);
    expect(existsSync(backupPath)).toBe(false);
  });

  it('keeps a user edit and does not rewrite when AQE has nothing to add', async () => {
    const { settingsPath, backupPath, run } = setup();
    await run();
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    settings.env.USER_FLAG = 'keep-me';
    settings.env.AQE_LEARNING_ENABLED = 'false'; // intentional user override
    settings.statusLine = { type: 'command', command: 'echo mine' };
    settings.hooks.Notification = [{ hooks: [{ type: 'command', command: 'echo user-hook' }] }];
    const userBytes = JSON.stringify(settings, null, 4); // user's own formatting
    writeFileSync(settingsPath, userBytes);
    const mtime = ageFile(settingsPath);

    await run();

    expect(readFileSync(settingsPath, 'utf-8')).toBe(userBytes);
    expect(statSync(settingsPath).mtimeMs).toBe(mtime);
    expect(existsSync(backupPath)).toBe(false);
  });

  it('restores an AQE-owned section the user removed, backing up and restamping on that real change', async () => {
    const { settingsPath, backupPath, run } = setup();
    await run();
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    const originalStamp = settings.aqe.initialized;
    settings.env.USER_FLAG = 'keep-me';
    delete settings.hooks.PreToolUse;
    delete settings.v3Learning;
    settings.aqe.initialized = '2020-01-01T00:00:00.000Z';
    const edited = JSON.stringify(settings, null, 2);
    writeFileSync(settingsPath, edited);

    await run();

    const after = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(after.env.USER_FLAG).toBe('keep-me');
    expect(after.hooks.PreToolUse).toBeDefined();
    expect(after.v3Learning).toBeDefined();
    expect(after.aqe.initialized).not.toBe('2020-01-01T00:00:00.000Z');
    expect(Date.parse(after.aqe.initialized)).toBeGreaterThanOrEqual(Date.parse(originalStamp));
    expect(readFileSync(backupPath, 'utf-8')).toBe(edited);
  });

  it('migrates an older aqe.version marker and records a fresh initialization time', async () => {
    const { settingsPath, run } = setup();
    await run();
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    settings.aqe.version = '3.12.0';
    settings.aqe.initialized = '2020-01-01T00:00:00.000Z';
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    await run();

    const after = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(after.aqe.version).toBe('3.14.5');
    expect(after.aqe.initialized).not.toBe('2020-01-01T00:00:00.000Z');

    // ...and the migrated file is itself stable on the next run.
    const migrated = readFileSync(settingsPath, 'utf-8');
    await run();
    expect(readFileSync(settingsPath, 'utf-8')).toBe(migrated);
  });

  it('rewrites when a CLI option changes the effective settings (status line opt-out)', async () => {
    const { context, settingsPath, run } = setup();
    await run();
    expect(JSON.parse(readFileSync(settingsPath, 'utf-8')).statusLine).toBeDefined();

    context.options.noStatusLine = true;
    await run();

    expect(JSON.parse(readFileSync(settingsPath, 'utf-8')).statusLine).toBeUndefined();
  });
});
