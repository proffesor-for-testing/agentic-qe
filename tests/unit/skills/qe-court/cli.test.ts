import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runRefereeCli } from '../../../../src/skills/qe-court/cli';

const dirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('aqe-court-referee consumer entrypoint (#632)', () => {
  it('validates a host-neutral court config', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aqe-court-'));
    dirs.push(dir);
    const file = join(dir, 'config.json');
    writeFileSync(file, JSON.stringify({
      routing: {
        writer: { provider: 'codex' },
        jury: { provider: 'claude-code' },
      },
      options: { writerIsNeverJuror: true, minDistinctVendors: 2 },
    }));
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    expect(runRefereeCli(['validate-config', file])).toBe(0);
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"valid":true'));
  });

  it.each([
    'overturn-catches-mutant',
    'overturn-disabled',
    'writer-not-juror',
    'vendor-diversity',
    'doe-score-gate',
    'verdict-classes',
  ])('runs shipped oracle %s without repository tests', (oracle) => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    expect(runRefereeCli(['self-test', oracle])).toBe(0);
  });
});
