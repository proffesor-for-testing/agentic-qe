import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { HooksPhase } from '../../../../src/init/phases/07-hooks.js';
import type { InitContext } from '../../../../src/init/phases/phase-interface.js';

describe('HooksPhase database-free configuration', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it.each([false, true])('restores persistent settings after memory mode (custom paths: %s)', async (customPaths) => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'aqe-hooks-roundtrip-'));
    roots.push(projectRoot);
    const settingsPath = join(projectRoot, '.claude', 'settings.json');
    const context: InitContext = {
      projectRoot,
      options: { memoryBackend: undefined },
      config: { hooks: { claudeCode: true }, learning: { enabled: true } } as InitContext['config'],
      enhancements: { claudeFlow: false, ruvector: false },
      results: new Map(),
      services: { log: () => {}, warn: () => {}, error: () => {} },
    };
    const phase = new HooksPhase();
    const run = async () => {
      const result = await phase.execute(context);
      expect(result.success, result.error?.message).toBe(true);
      return JSON.parse(readFileSync(settingsPath, 'utf8'));
    };
    const original = await run();
    if (customPaths) {
      original.env.AQE_MEMORY_PATH = '/custom/project.db';
      original.env.AQE_V3_REASONING_BANK = '/custom/reasoning.db';
      writeFileSync(settingsPath, JSON.stringify(original));
    }

    context.options.memoryBackend = 'memory';
    const memory = await run();
    expect(memory.env.AQE_MEMORY_BACKEND).toBe('memory');
    expect(memory.env.AQE_LEARNING_ENABLED).toBe('false');
    expect(memory.env.AQE_WORKERS_ENABLED).toBe('false');
    if (customPaths) {
      expect(memory.env.AQE_MEMORY_PATH).toBe(original.env.AQE_MEMORY_PATH);
      expect(memory.env.AQE_V3_REASONING_BANK).toBe(original.env.AQE_V3_REASONING_BANK);
    }

    context.options.memoryBackend = undefined;
    const restored = await run();
    expect(restored.env).toEqual(original.env);
    expect(restored.v3Learning.enabled).toBe(true);
    expect(restored.v3Learning.reasoningBank.dbPath).toBeDefined();
    expect((await run()).env).toEqual(restored.env);
  });

  it('replaces stale database settings on a memory-mode re-init', async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'aqe-hooks-memory-'));
    roots.push(projectRoot);
    mkdirSync(join(projectRoot, '.claude'));
    writeFileSync(join(projectRoot, '.claude', 'settings.json'), JSON.stringify({
      env: {
        USER_SETTING: 'keep',
        AQE_MEMORY_PATH: '.agentic-qe/memory.db',
        AQE_V3_REASONING_BANK: '.agentic-qe/memory.db',
        AQE_LEARNING_ENABLED: 'true',
      },
      v3Learning: { reasoningBank: { dbPath: '.agentic-qe/memory.db' } },
    }));

    const context: InitContext = {
      projectRoot,
      options: { memoryBackend: 'memory' },
      config: { hooks: { claudeCode: true }, learning: { enabled: true } } as InitContext['config'],
      enhancements: { claudeFlow: false, ruvector: false },
      results: new Map(),
      services: { log: () => {}, warn: () => {}, error: () => {} },
    };
    const result = await new HooksPhase().execute(context);
    expect(result.success, result.error?.message).toBe(true);
    const settings = JSON.parse(readFileSync(join(projectRoot, '.claude', 'settings.json'), 'utf8'));
    expect(settings.env.USER_SETTING).toBe('keep');
    expect(settings.env.AQE_MEMORY_BACKEND).toBe('memory');
    expect(settings.env.AQE_LEARNING_ENABLED).toBe('false');
    expect(settings.env).not.toHaveProperty('AQE_MEMORY_PATH');
    expect(settings.env).not.toHaveProperty('AQE_V3_REASONING_BANK');
    expect(settings.v3Learning.enabled).toBe(false);
    expect(settings.v3Learning.reasoningBank).not.toHaveProperty('dbPath');
  });
});
