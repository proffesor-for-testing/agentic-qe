/**
 * #1170: security_scan_comprehensive reported critical 1 + high 1 for one
 * eval(): SAST's CWE-95 finding plus a generic eval/exec duplicate whose path
 * was only the file name. Only that duplicate is dropped; generic secret,
 * CORS and debug findings on a line SAST also matched are kept, so no distinct
 * or higher-severity finding is lost.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { registerSecurityHandlers } from '../../../../src/coordination/handlers/security-handlers';
import {
  dropGenericEvalCoveredBySast, GENERIC_EVAL_EXEC_TITLE,
} from '../../../../src/domains/security-compliance/generic-finding-dedup';
import type { TaskHandlerContext } from '../../../../src/coordination/handlers/handler-types';
import type { FilePath } from '../../../../src/shared/value-objects/index.js';

let root: string;
const file = (name: string) => path.join(root, 'src', name);

beforeAll(() => {
  vi.stubEnv('AQE_PROJECT_ROOT', realpathSync(tmpdir()));
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'aqe-1170-sec-')));
  mkdirSync(path.join(root, 'src'));
  writeFileSync(file('danger.ts'), 'export function run(expr: string): unknown {\n  // evaluate user input\n  return eval(expr);\n}\n');
  writeFileSync(file('run.py'), 'def run(expr):\n    return eval(expr)\n');
  writeFileSync(file('multi.ts'), 'export const cfg = { password: "hunter22x", auth_token: "abcdefghijklmnop" };\n');
  writeFileSync(file('server.ts'), 'import cors from "cors";\nexport const DEBUG = true;\napp.use(cors({ origin: \'*\' }));\n');
  writeFileSync(file('both.ts'), 'import * as cp from "node:child_process";\nexport const a = (s: string) => eval(s);\nexport const b = (c: string) => cp.exec(c);\nexport const c = (s: string) => { eval(s); cp.exec(s); };\n');
});

afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

type Sast = { title: string; severity: string; category: string; line: number; cwe: string };
/** What the SAST pattern scanner reports for each fixture (titles and CWEs as in security-patterns.ts). */
const SAST_BY_FILE: Record<string, Sast[]> = {
  'danger.ts': [{ title: 'Code Injection via eval()', severity: 'critical', category: 'xss', line: 3, cwe: 'CWE-95' }],
  'multi.ts': [{ title: 'Hardcoded Password Detected', severity: 'high', category: 'sensitive-data', line: 1, cwe: 'CWE-798' }],
  'server.ts': [
    { title: 'Debug Mode Enabled', severity: 'low', category: 'security-misconfiguration', line: 2, cwe: 'CWE-489' },
    { title: 'CORS Wildcard Origin', severity: 'medium', category: 'security-misconfiguration', line: 3, cwe: 'CWE-942' },
  ],
  'both.ts': [
    { title: 'Code Injection via eval()', severity: 'critical', category: 'xss', line: 2, cwe: 'CWE-95' },
    { title: 'Code Injection via eval()', severity: 'critical', category: 'xss', line: 4, cwe: 'CWE-95' },
  ],
};

const sastScanner = {
  scanFiles: vi.fn(async (files: FilePath[]) => {
    const vulnerabilities = files.flatMap(f => (SAST_BY_FILE[path.basename(f.value)] ?? []).map(v => ({
      id: `${v.title}-${v.line}`, title: v.title, description: `${v.title} [${v.cwe}]`,
      severity: v.severity, category: v.category, location: { file: f.value, line: v.line },
      remediation: { description: 'fix' },
      references: [`https://cwe.mitre.org/data/definitions/${v.cwe.replace('CWE-', '')}.html`],
    })));
    const count = (s: string) => vulnerabilities.filter(v => v.severity === s).length;
    return {
      success: true,
      value: {
        vulnerabilities,
        summary: { critical: count('critical'), high: count('high'), medium: count('medium'), low: count('low'), informational: 0, totalFiles: files.length, linesScanned: 1 },
        coverage: { filesScanned: files.length, linesScanned: 1 },
      },
    };
  }),
};

type Finding = { title: string; severity: string; location: { file: string; line: number } };

async function scan(target: string) {
  let handler: ((task: { payload: unknown }) => Promise<unknown>) | undefined;
  const ctx = {
    registerHandler: (type: string, fn: typeof handler) => { if (type === 'scan-security') handler = fn; },
    getSecurityScanner: () => sastScanner,
  } as unknown as TaskHandlerContext;
  registerSecurityHandlers(ctx);
  const result = await handler!({ payload: { target, sast: true, dast: false, compliance: [] } }) as
    { success: boolean; value: { critical: number; high: number; findings: Finding[] } };
  expect(result.success).toBe(true);
  return result.value;
}

const inFile = (findings: Finding[], name: string) =>
  findings.filter(f => f.location.file === file(name)).map(f => `${f.severity} ${f.title} :${f.location.line}`).sort();

describe('scan-security finding deduplication (#1170)', () => {
  it('counts one eval() once, as SAST reported it, with the real path', async () => {
    const { findings } = await scan(path.join(root, 'src'));
    expect(inFile(findings, 'danger.ts')).toEqual(['critical Code Injection via eval() :3']);
  });

  it('keeps a generic eval/exec finding SAST did not cover, with the real path rather than a bare file name', async () => {
    const { findings } = await scan(path.join(root, 'src'));
    expect(inFile(findings, 'run.py')).toEqual([`high ${GENERIC_EVAL_EXEC_TITLE} :2`]);
    expect(findings.some(f => f.location.file === 'run.py' || f.location.file === 'danger.ts')).toBe(false);
  });

  it('keeps every generic secret on a line where SAST matched one secret', async () => {
    const { findings } = await scan(path.join(root, 'src'));
    expect(inFile(findings, 'multi.ts')).toEqual([
      'critical Hardcoded credential :1',
      'critical Hardcoded secret :1',
      'high Hardcoded Password Detected :1',
    ]);
  });

  it('keeps generic CORS and debug findings next to lower-severity SAST ones', async () => {
    const { findings } = await scan(path.join(root, 'src'));
    expect(inFile(findings, 'server.ts')).toEqual([
      'high CORS wildcard origin :3',
      'low Debug Mode Enabled :2',
      'medium CORS Wildcard Origin :3',
      'medium Debug mode enabled :2',
    ]);
  });

  it('reports exec() on its own line and on a line that also calls eval()', async () => {
    const { findings } = await scan(path.join(root, 'src'));
    expect(inFile(findings, 'both.ts')).toEqual([
      'critical Code Injection via eval() :2',
      'critical Code Injection via eval() :4',
      `high ${GENERIC_EVAL_EXEC_TITLE} :3`,
      `high ${GENERIC_EVAL_EXEC_TITLE} :4`,
    ]);
  });
});

describe('dropGenericEvalCoveredBySast', () => {
  const sast = [{ severity: 'critical', description: 'Code Injection via eval() [CWE-95]', location: { file: '/p/src/a.ts', line: 3 } }];
  const evalFinding = (file: string, line: number) => ({ title: GENERIC_EVAL_EXEC_TITLE, severity: 'high', location: { file, line } });

  it('drops an eval-only generic match on the same real file and line', async () => {
    expect(await dropGenericEvalCoveredBySast([evalFinding('/p/src/../src/a.ts', 3)], sast, () => true)).toEqual([]);
  });

  it('keeps a match on another line or file, a line that also calls exec(), and other rules', async () => {
    const generic = [
      evalFinding('/p/src/a.ts', 4),
      evalFinding('/p/src/b.ts', 3),
      { title: 'Hardcoded secret', location: { file: '/p/src/a.ts', line: 3 } },
    ];
    expect(await dropGenericEvalCoveredBySast(generic, sast, () => true)).toEqual(generic);
    const execLine = [evalFinding('/p/src/a.ts', 3)];
    expect(await dropGenericEvalCoveredBySast(execLine, sast, () => false)).toEqual(execLine);
  });

  it('keeps the generic match when the SAST CWE-95 finding on that line is lower severity', async () => {
    const lower = [{ ...sast[0], severity: 'medium' }];
    const generic = [evalFinding('/p/src/a.ts', 3)];
    expect(await dropGenericEvalCoveredBySast(generic, lower, () => true)).toEqual(generic);
  });

  it('keeps the generic match when the SAST CWE-95 finding has no known severity', async () => {
    const unknown = [{ description: sast[0].description, location: sast[0].location }];
    const generic = [evalFinding('/p/src/a.ts', 3)];
    expect(await dropGenericEvalCoveredBySast(generic, unknown, () => true)).toEqual(generic);
  });

  it('keeps the generic match when the SAST finding on that line is not CWE-95', async () => {
    const other = [{ description: 'Command injection [CWE-78]', location: { file: '/p/src/a.ts', line: 3 } }];
    const generic = [evalFinding('/p/src/a.ts', 3)];
    expect(await dropGenericEvalCoveredBySast(generic, other, () => true)).toEqual(generic);
  });
});
