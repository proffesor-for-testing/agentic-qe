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
