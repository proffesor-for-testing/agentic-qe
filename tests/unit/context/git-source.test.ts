import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitContextSource } from '../../../src/context/sources/git-source.js';

describe('GitContextSource', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function repo(): string {
    const root = mkdtempSync(join(tmpdir(), 'aqe-git-context-'));
    roots.push(root);
    execFileSync('git', ['init', '-q', root]);
    execFileSync('git', ['-C', root, 'config', 'user.name', 'AQE test']);
    execFileSync('git', ['-C', root, 'config', 'user.email', 'aqe-test@example.invalid']);
    return root;
  }

  it('does not execute shell syntax supplied as a file path', async () => {
    const root = repo();
    const marker = join(root, 'injection-ran');
    const payload = `"; touch "${marker}"; #`;
    const fragments = await new GitContextSource(root).gather({
      targetFiles: [payload], agentType: 'qe-test', taskDescription: 'route',
    });
    expect(existsSync(marker)).toBe(false);
    expect(fragments).toEqual([]);
  });

  it('retrieves history for a legitimate path containing shell characters', async () => {
    const root = repo();
    mkdirSync(join(root, 'src'));
    const file = 'src/quote" dollar$ semicolon;.ts';
    writeFileSync(join(root, file), 'export const safe = true;\n');
    execFileSync('git', ['-C', root, 'add', '--', file]);
    execFileSync('git', ['-C', root, 'commit', '-qm', 'add unusual filename']);

    const fragments = await new GitContextSource(root).gather({
      targetFiles: [file], agentType: 'qe-test', taskDescription: 'route',
    });
    expect(fragments).toHaveLength(1);
    expect(fragments[0].content).toContain('add unusual filename');
  });
});
