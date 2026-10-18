/**
 * #1115: the async conversions resolve npx with npmCliInvocation instead of a
 * shell. On Windows it returns null when npm's CLI is not next to node; the
 * callers must then take their existing failure path, not throw.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../../../src/shared/npm-cli-invocation.js', () => ({ npmCliInvocation: () => null }));

const { countTests } = await import('../../../src/domains/code-intelligence/services/metric-collector/test-counter.js');
const { runAgentBrowser, isAgentBrowserAvailable } = await import('../../../src/integrations/browser/agent-browser/command-executor.js');

describe('npx unavailable (#1115)', () => {
  const roots: string[] = [];
  afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

  it('counts jest tests from the test files when npx cannot be resolved', async () => {
    const root = mkdtempSync(join(tmpdir(), 'aqe-1115-npx-'));
    roots.push(root);
    writeFileSync(join(root, 'package.json'), JSON.stringify({ devDependencies: { jest: '29.0.0' } }));
    writeFileSync(join(root, 'math.test.js'), "test('adds', () => {});\ntest('subtracts', () => {});\n");
    const metrics = await countTests(root);
    expect(metrics.total).toBe(2);
  });

  it('reports agent-browser as an ENOENT failure instead of spawning', async () => {
    const result = await runAgentBrowser(['--version'], 1000);
    expect(result).toMatchObject({ status: null, stdout: '', error: { code: 'ENOENT' } });
    expect(await isAgentBrowserAvailable()).toBe(false);
  });
});
