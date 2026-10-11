/**
 * #872 upgrade path: a project initialised by an older AQE has a hook shim and
 * brain-checkpoint helper that spawn `aqe.cmd` (EINVAL on Windows). Re-running
 * init from a GLOBAL install (no node_modules/agentic-qe in the project) must
 * replace both with the package's fixed copies.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

import { HooksPhase } from '../../../../src/init/phases/07-hooks.js';
import type { InitContext } from '../../../../src/init/phases/phase-interface.js';
import { createDefaultConfig } from '../../../../src/init/types.js';

const REPO_ROOT = resolve(__dirname, '../../../..');
const STALE_SPAWN = "const AQE_BIN = process.platform === 'win32' ? 'aqe.cmd' : 'aqe';\n";

describe('HooksPhase refreshes Windows-broken hook scripts on re-init (#872)', () => {
  let projectRoot: string;
  afterEach(() => rmSync(projectRoot, { recursive: true, force: true }));

  it('should_replaceStaleShimAndBrainCheckpoint_when_reinitFromGlobalInstall', async () => {
    projectRoot = mkdtempSync(join(tmpdir(), 'aqe-872-reinit-'));
    mkdirSync(join(projectRoot, '.claude', 'hooks'), { recursive: true });
    mkdirSync(join(projectRoot, '.claude', 'helpers'), { recursive: true });
    const shim = join(projectRoot, '.claude', 'hooks', 'aqe-hook.cjs');
    const brain = join(projectRoot, '.claude', 'helpers', 'brain-checkpoint.cjs');
    writeFileSync(shim, STALE_SPAWN);
    writeFileSync(brain, STALE_SPAWN);
    const context: InitContext = {
      projectRoot,
      options: {},
      config: createDefaultConfig('demo', projectRoot),
      enhancements: { claudeFlow: false, ruvector: false },
      results: new Map(),
      services: { log: () => {}, warn: () => {}, error: () => {} },
    };

    const result = await new HooksPhase().execute(context);

    expect(result.success, result.error?.message).toBe(true);
    expect(readFileSync(shim, 'utf-8')).toBe(readFileSync(join(REPO_ROOT, '.claude/hooks/aqe-hook.cjs'), 'utf-8'));
    expect(readFileSync(brain, 'utf-8')).toBe(readFileSync(join(REPO_ROOT, '.claude/helpers/brain-checkpoint.cjs'), 'utf-8'));
    expect(readFileSync(shim, 'utf-8')).not.toMatch(/spawnSync\(\s*'aqe\.cmd'|\? 'aqe\.cmd' :/);
    expect(readFileSync(brain, 'utf-8')).not.toMatch(/\? 'aqe\.cmd' :/);
  });
});
