/**
 * #1170: security_scan_comprehensive reported critical 1 + high 1 for one
 * eval(): SAST's finding plus a generic-pattern duplicate whose path was only
 * the file name. A generic match on a line SAST already reported is now
 * dropped, and generic findings name the real scanned path.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { registerSecurityHandlers } from '../../../../src/coordination/handlers/security-handlers';
import { dropGenericFindingsCoveredBySast } from '../../../../src/domains/security-compliance/generic-finding-dedup';
import type { TaskHandlerContext } from '../../../../src/coordination/handlers/handler-types';
import type { FilePath } from '../../../../src/shared/value-objects/index.js';

let root: string;
let dangerFile: string;
let pyFile: string;

beforeAll(() => {
  vi.stubEnv('AQE_PROJECT_ROOT', realpathSync(tmpdir()));
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'aqe-1170-sec-')));
  mkdirSync(path.join(root, 'src'));
  dangerFile = path.join(root, 'src', 'danger.ts');
  pyFile = path.join(root, 'src', 'run.py');
  writeFileSync(dangerFile, 'export function run(expr: string): unknown {\n  // evaluate user input\n  return eval(expr);\n}\n');
  writeFileSync(pyFile, 'def run(expr):\n    return eval(expr)\n');
});

afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

/** SAST that reports eval() on line 3 of every JS/TS file it is given, as the pattern scanner does. */
const sastScanner = {
  scanFiles: vi.fn(async (files: FilePath[]) => ({
    success: true,
    value: {
      vulnerabilities: files.map(file => ({
        id: 'v1', title: 'Code Injection via eval()', description: 'eval() executes arbitrary code [CWE-95]',
        severity: 'critical', category: 'xss', location: { file: file.value, line: 3 },
        remediation: { description: 'Never use eval()' }, references: [],
      })),
      summary: { critical: files.length, high: 0, medium: 0, low: 0, informational: 0, totalFiles: files.length, linesScanned: 4 },
      coverage: { filesScanned: files.length, linesScanned: 4 },
    },
  })),
};

async function scan(target: string) {
  let handler: ((task: { payload: unknown }) => Promise<unknown>) | undefined;
  const ctx = {
    registerHandler: (type: string, fn: typeof handler) => { if (type === 'scan-security') handler = fn; },
    getSecurityScanner: () => sastScanner,
  } as unknown as TaskHandlerContext;
  registerSecurityHandlers(ctx);
  const result = await handler!({ payload: { target, sast: true, dast: false, compliance: [] } }) as
    { success: boolean; value: { critical: number; high: number; findings: Array<{ title: string; severity: string; location: { file: string; line: number } }> } };
  expect(result.success).toBe(true);
  return result.value;
}

describe('scan-security finding deduplication (#1170)', () => {
  it('counts one eval() once, as SAST reported it', async () => {
    const result = await scan(path.join(root, 'src'));

    const tsFindings = result.findings.filter(f => f.location.file.endsWith('danger.ts'));
    expect(tsFindings).toEqual([expect.objectContaining({ title: 'Code Injection via eval()', severity: 'critical' })]);
    expect(tsFindings[0].location.file).toBe(dangerFile);
  });

  it('keeps generic findings SAST did not cover, with the real path rather than a bare file name', async () => {
    const result = await scan(path.join(root, 'src'));

    const pyFindings = result.findings.filter(f => f.location.file.endsWith('run.py'));
    expect(pyFindings).toEqual([expect.objectContaining({ title: 'Dangerous eval/exec usage', severity: 'high' })]);
    expect(pyFindings[0].location.file).toBe(pyFile);
    expect(result.critical).toBe(1);
    expect(result.high).toBe(1);
  });
});

describe('dropGenericFindingsCoveredBySast', () => {
  const sast = [{ category: 'xss', location: { file: '/p/src/a.ts', line: 3 } }];

  it('drops a generic injection match on the same real file and line', async () => {
    const kept = await dropGenericFindingsCoveredBySast(
      [{ category: 'injection', location: { file: '/p/src/../src/a.ts', line: 3 } }], sast);
    expect(kept).toEqual([]);
  });

  it('keeps a generic match on another line, file or uncovered category', async () => {
    const generic = [
      { category: 'injection', location: { file: '/p/src/a.ts', line: 4 } },
      { category: 'injection', location: { file: '/p/src/b.ts', line: 3 } },
      { category: 'sensitive-data', location: { file: '/p/src/a.ts', line: 3 } },
    ];
    expect(await dropGenericFindingsCoveredBySast(generic, sast)).toEqual(generic);
  });
});
