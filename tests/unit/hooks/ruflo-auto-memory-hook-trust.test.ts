/**
 * ruflo auto-memory-hook trust boundary.
 *
 * .claude/settings.json runs `auto-memory-hook.mjs import` on SessionStart and
 * falls back to ~/.claude/helpers when the project has no helper of its own.
 * A home-level helper can therefore serve an untrusted project, which is passed
 * in via CLAUDE_PROJECT_DIR. The project directory may supply DATA (the memory
 * store), but executable modules must resolve from the helper's own install
 * root — otherwise opening a repo runs its JavaScript at session start.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const REPO_ROOT = resolve(__dirname, '../../..');
const HELPER = resolve(REPO_ROOT, '.claude/helpers/auto-memory-hook.mjs');

/** Write an ES module that drops `marker` when it is evaluated. */
function plantPayload(file: string, marker: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)}, 'executed');\n`);
}

/** Plant every module location the memory loader probes inside `projectDir`. */
function plantProject(projectDir: string): string[] {
  const markers = ['sidecar', 'local-dist', 'node-modules'].map((name) => join(projectDir, `${name}.pwned`));
  const sidecarPayload = join(projectDir, 'payload', 'index.js');
  plantPayload(sidecarPayload, markers[0]);
  mkdirSync(join(projectDir, '.claude-flow'), { recursive: true });
  writeFileSync(join(projectDir, '.claude-flow', 'memory-package.json'), JSON.stringify({ distPath: sidecarPayload }));
  plantPayload(join(projectDir, 'v3/@claude-flow/memory/dist/index.js'), markers[1]);
  plantPayload(join(projectDir, 'node_modules/@claude-flow/memory/dist/index.js'), markers[2]);
  writeFileSync(join(projectDir, 'package.json'), '{"name":"untrusted","type":"module"}');
  return markers;
}

/** Install a copy of the helper at <root>/.claude/helpers and run `import`. */
function runImport(helperRoot: string, projectDir: string): void {
  const helperCopy = join(helperRoot, '.claude', 'helpers', 'auto-memory-hook.mjs');
  mkdirSync(dirname(helperCopy), { recursive: true });
  copyFileSync(HELPER, helperCopy);
  spawnSync('node', [helperCopy, 'import'], {
    cwd: projectDir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    encoding: 'utf8',
    timeout: 15000,
  });
}

describe('ruflo auto-memory-hook module trust', () => {
  it('does not execute modules from an untrusted CLAUDE_PROJECT_DIR when served from a home-level helper', () => {
    const base = mkdtempSync(join(tmpdir(), 'aqe-automem-trust-'));
    const homeRoot = join(base, 'home');
    const projectDir = join(base, 'untrusted-project');
    const markers = plantProject(projectDir);

    runImport(homeRoot, projectDir);

    for (const marker of markers) {
      expect(existsSync(marker), `${marker} should not exist`).toBe(false);
    }
  });

  it('still loads the memory package from the helper root when the helper lives in the project', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'aqe-automem-local-'));
    const marker = join(projectDir, 'local-dist.loaded');
    plantPayload(join(projectDir, 'v3/@claude-flow/memory/dist/index.js'), marker);

    runImport(projectDir, projectDir);

    expect(existsSync(marker)).toBe(true);
  });
});
