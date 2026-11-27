/**
 * #1474 review round 4: a producer's own `-o` report (here `aqe test execute
 * -F junit -o junit.xml`) is AQE output. Recorded by `writeOutput` with its
 * exact content, it must not change the candidate the run's testsPassing
 * receipt was bound to, so a gate on the same commit matches.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestCommand } from '../../../src/cli/commands/test.js';
import type { CLIContext } from '../../../src/cli/handlers/interfaces.js';
import { inspectQualityEvidence } from '../../../src/domains/quality-assessment/quality-evidence.js';
import { resolveQualityEvidenceCandidate } from '../../../src/domains/quality-assessment/evidence-candidate.js';
import { createGitCandidateFixture } from '../../fixtures/quality-evidence-candidates.js';

const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function memory() {
  const store = new Map<string, unknown>();
  const k = (key: string, o?: { namespace?: string }) => `${o?.namespace ?? ''}::${key}`;
  return {
    get: vi.fn(async (key: string, o?: { namespace?: string }) => store.get(k(key, o))),
    set: vi.fn(async (key: string, v: unknown, o?: { namespace?: string }) => { store.set(k(key, o), v); }),
  };
}

async function testExecute(root: string, mem: ReturnType<typeof memory>) {
  const runTests = vi.fn().mockResolvedValue({
    success: true, value: { runId: 'run-1474', passed: 2, failed: 0, skipped: 0, duration: 1, failedTests: [] },
  });
  const context = { kernel: { getDomainAPIAsync: vi.fn().mockResolvedValue({ runTests }), memory: mem } } as unknown as CLIContext;
  const command = createTestCommand(context, vi.fn() as never, vi.fn().mockResolvedValue(true));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  await command.parseAsync(['execute', 'tests', '-F', 'junit', '-o', join(root, 'junit.xml')], { from: 'user' });
}

describe('#1474 aqe test execute -o junit.xml then gate on the same commit', () => {
  it('matches: the junit report it wrote is left out of the candidate', async () => {
    const root = createGitCandidateFixture('aqe-junit-1474-');
    dirs.push(root);
    vi.stubEnv('AQE_PROJECT_ROOT', root);
    const mem = memory();

    await testExecute(root, mem);

    expect(existsSync(join(root, 'junit.xml'))).toBe(true);
    const gated = resolveQualityEvidenceCandidate(root);
    expect(gated).toMatchObject({ dirty: false, ignored: [{ path: 'junit.xml' }] });
    const { problems } = await inspectQualityEvidence(mem as never, { candidate: gated });
    expect(problems.find((p) => p.metric === 'testsPassing')).toBeUndefined();
  });

  it('a junit.xml the user then edits counts again', async () => {
    const root = createGitCandidateFixture('aqe-junit-1474-');
    dirs.push(root);
    vi.stubEnv('AQE_PROJECT_ROOT', root);
    const mem = memory();
    await testExecute(root, mem);
    writeFileSync(join(root, 'junit.xml'), '<testsuites/>\n');
    const { problems } = await inspectQualityEvidence(mem as never, { candidate: resolveQualityEvidenceCandidate(root) });
    expect(problems.find((p) => p.metric === 'testsPassing')).toMatchObject({ code: 'mismatched' });
  });
});
