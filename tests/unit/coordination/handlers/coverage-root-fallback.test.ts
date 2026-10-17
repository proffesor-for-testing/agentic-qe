import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { registerCoverageHandlers } from '../../../../src/coordination/handlers/coverage-handlers';
import { runJsCoverage, type JsCoverageRun } from '../../../../src/coordination/handlers/coverage-runner';
import type { InstanceTaskHandler } from '../../../../src/coordination/handlers/handler-types';

vi.mock('../../../../src/coordination/handlers/coverage-runner', async (original) => {
  const actual = await original<typeof import('../../../../src/coordination/handlers/coverage-runner')>();
  return { ...actual, runJsCoverage: vi.fn() };
});
const dirs: string[] = [];
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-root-empty-')));
  dirs.push(root);
  const pkg = path.join(root, 'packages/a');
  fs.mkdirSync(path.join(pkg, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ workspaces: ['packages/*'], devDependencies: { vitest: '*' } }));
  fs.writeFileSync(path.join(root, 'vitest.config.mjs'), "export default { test: { include: ['tests/**/*.test.js'] } };\n");
  fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'a', devDependencies: { vitest: '*' } }));
  fs.writeFileSync(path.join(pkg, 'src/a.js'), 'export const a = 1;\n');
  vi.stubEnv('AQE_PROJECT_ROOT', root);
  return { root, pkg, target: path.join(pkg, 'src') };
}
const outcome = (count: number | null): JsCoverageRun => ({
  data: null, numTotalTests: count, numPassedTests: count, numFailedTests: 0,
  numPendingTests: 0, numFailedTestSuites: 0, exitedCleanly: true,
  exitCode: 0, missing: false, timedOut: false, runner: 'vitest', stderrTail: '', timeoutMs: 1000,
});
async function analyze(target: string) {
  let handler!: InstanceTaskHandler;
  registerCoverageHandlers({ registerHandler: (_type: string, fn: InstanceTaskHandler) => { handler = fn; }, getCoverageAnalyzer: () => ({}) } as never);
  return handler({ payload: { target, detectGaps: false } } as never);
}
describe('adopted workspace runner with root-only test globs', () => {
  it('retries once from the nearest package when the root explicitly ran zero tests', async () => {
    const { root, pkg, target } = fixture();
    vi.mocked(runJsCoverage).mockResolvedValueOnce(outcome(0)).mockResolvedValueOnce(outcome(0));
    await analyze(target);
    expect(vi.mocked(runJsCoverage).mock.calls.map(([cwd, opts]) => [cwd, opts?.pathFilter])).toEqual([[root, 'packages/a/'], [pkg, undefined]]);
  });
  it.each([1, null])('does not retry a root run with count %s', async (count) => {
    const { root, target } = fixture();
    vi.mocked(runJsCoverage).mockResolvedValue(outcome(count));
    await analyze(target);
    expect(runJsCoverage).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runJsCoverage).mock.calls[0][0]).toBe(root);
  });
  it.each([
    ['timeout', { timedOut: true, exitCode: null, exitedCleanly: false }],
    ['missing runner', { missing: true }],
    ['failed suite without tests', { numFailedTestSuites: 1, exitCode: 1, exitedCleanly: false }],
    ['failed tests', { numFailedTests: 1, exitCode: 1, exitedCleanly: false }],
    ['signal or unknown exit', { exitCode: null, exitedCleanly: false }],
    ['abnormal exit', { exitCode: 2, exitedCleanly: false }],
  ] as Array<[string, Partial<JsCoverageRun>]>)('does not retry a zero-count %s', async (_label, overrides) => {
    const { target } = fixture();
    vi.mocked(runJsCoverage).mockResolvedValue({ ...outcome(0), ...overrides });
    await analyze(target);
    expect(runJsCoverage).toHaveBeenCalledTimes(1);
  });
  it('preserves the intentional missing-root-runner fallback', async () => {
    const { root, pkg, target } = fixture();
    vi.mocked(runJsCoverage).mockResolvedValueOnce({ ...outcome(null), missing: true, exitCode: null, exitedCleanly: false }).mockResolvedValueOnce(outcome(0));
    await analyze(target);
    expect(vi.mocked(runJsCoverage).mock.calls.map(([cwd]) => cwd)).toEqual([root, pkg]);
  });
  it('allows a normal zero-tests exit 1', async () => {
    const { root, pkg, target } = fixture();
    vi.mocked(runJsCoverage).mockResolvedValueOnce({ ...outcome(0), exitCode: 1, exitedCleanly: false }).mockResolvedValueOnce(outcome(0));
    await analyze(target);
    expect(vi.mocked(runJsCoverage).mock.calls.map(([cwd]) => cwd)).toEqual([root, pkg]);
  });
  it('does not retry a standalone package with zero tests', async () => {
    const { pkg, target } = fixture();
    fs.writeFileSync(path.join(pkg, 'vitest.config.mjs'), 'export default {};');
    vi.mocked(runJsCoverage).mockResolvedValue(outcome(0));
    await analyze(target);
    expect(runJsCoverage).toHaveBeenCalledTimes(1);
  });
});
