import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../../..');

describe('Claude lifecycle hook contract', () => {
  it('should_avoidPackageManagerResolution_when_hooksRun', () => {
    const hookShim = readFileSync(resolve(repoRoot, '.claude/hooks/aqe-hook.cjs'), 'utf8');
    const checkpoint = readFileSync(resolve(repoRoot, '.claude/helpers/brain-checkpoint.cjs'), 'utf8');

    expect(hookShim).not.toMatch(/spawnSync\(['"]npx/);
    expect(hookShim).not.toContain('--prefer-offline');
    expect(checkpoint).not.toMatch(/execFileSync\(\s*['"]npx/);
  });

  it('should_keepInternalHookBudgetBelowClaudeStopBudget', () => {
    const hookShim = readFileSync(resolve(repoRoot, '.claude/hooks/aqe-hook.cjs'), 'utf8');

    expect(hookShim).toContain("FAST_HOOKS.has(args[0]) ? 2500 : 4500");
  });
});
