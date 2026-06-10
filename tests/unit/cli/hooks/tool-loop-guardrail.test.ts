/**
 * Unit tests for the tool-loop circuit breaker (ADR-100)
 *
 * Consecutive failures of the same command: warn at 3, block at 5,
 * reset on success, half-open probe after the window, strict-mode env flag.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ToolLoopGuardrail } from '../../../../src/cli/commands/hooks-handlers/tool-loop-guardrail';

describe('ToolLoopGuardrail', () => {
  let dir: string;
  let guardrail: ToolLoopGuardrail;
  const CMD = 'npm run definitely-broken';

  const failTimes = (n: number, at: number = 1_000_000) => {
    for (let i = 0; i < n; i++) {
      guardrail.record(CMD, false, at + i);
    }
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-loop-'));
    guardrail = new ToolLoopGuardrail({
      statePath: path.join(dir, 'tool-loop-state.json'),
    });
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('should allow a command below the warn threshold', () => {
    failTimes(2);

    const check = guardrail.check(CMD, 1_000_010);

    expect(check.verdict).toBe('allow');
    expect(check.consecutiveFailures).toBe(2);
  });

  it('should warn at 3 consecutive failures', () => {
    failTimes(3);

    const check = guardrail.check(CMD, 1_000_010);

    expect(check.verdict).toBe('warn');
    expect(check.consecutiveFailures).toBe(3);
    expect(check.hint).toContain('3x');
  });

  it('should block at 5 consecutive failures with a recovery hint', () => {
    failTimes(5);

    const check = guardrail.check(CMD, 1_000_010);

    expect(check.verdict).toBe('block');
    expect(check.consecutiveFailures).toBe(5);
    expect(check.hint).toContain('change the approach');
  });

  it('should reset the breaker when the command succeeds', () => {
    failTimes(5);
    guardrail.record(CMD, true, 1_000_010);

    const check = guardrail.check(CMD, 1_000_020);

    expect(check.verdict).toBe('allow');
    expect(check.consecutiveFailures).toBe(0);
  });

  it('should track distinct commands independently', () => {
    failTimes(5);
    guardrail.record('npm run other-task', false, 1_000_010);

    expect(guardrail.check('npm run other-task', 1_000_020).verdict).toBe('allow');
    expect(guardrail.check(CMD, 1_000_020).verdict).toBe('block');
  });

  it('should allow a half-open probe after the half-open window elapses', () => {
    failTimes(5, 1_000_000);

    const check = guardrail.check(CMD, 1_000_004 + 120_000);

    expect(check.verdict).toBe('warn');
    expect(check.halfOpen).toBe(true);
    expect(check.hint).toContain('probe');
  });

  it('should treat whitespace-variant commands as the same signature', () => {
    failTimes(5);

    const check = guardrail.check('  npm   run definitely-broken ', 1_000_010);

    expect(check.verdict).toBe('block');
  });

  it('should persist state across instances (fresh process per hook call)', () => {
    failTimes(5);
    const secondProcess = new ToolLoopGuardrail({
      statePath: path.join(dir, 'tool-loop-state.json'),
    });

    expect(secondProcess.check(CMD, 1_000_010).verdict).toBe('block');
  });

  it('should fail open on a corrupt state file', () => {
    fs.writeFileSync(path.join(dir, 'tool-loop-state.json'), '{not json');

    const check = guardrail.check(CMD, 1_000_000);

    expect(check.verdict).toBe('allow');
  });

  it('should report strict mode only when AQE_STRICT_TOOL_LOOP is set', () => {
    expect(ToolLoopGuardrail.isStrict({} as NodeJS.ProcessEnv)).toBe(false);
    expect(ToolLoopGuardrail.isStrict({ AQE_STRICT_TOOL_LOOP: '0' } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(ToolLoopGuardrail.isStrict({ AQE_STRICT_TOOL_LOOP: '1' } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(ToolLoopGuardrail.isStrict({ AQE_STRICT_TOOL_LOOP: 'true' } as unknown as NodeJS.ProcessEnv)).toBe(true);
  });

  it('should prune stale entries on write', () => {
    failTimes(5, 1_000_000);
    // A later failure of another command triggers a write 31 minutes on,
    // pruning the stale CMD entry
    guardrail.record('other', false, 1_000_000 + 31 * 60_000);

    const check = guardrail.check(CMD, 1_000_000 + 31 * 60_000);

    expect(check.verdict).toBe('allow');
  });
});
