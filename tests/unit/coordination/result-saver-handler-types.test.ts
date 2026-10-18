/**
 * #1125 review: task_orchestrate and `aqe fleet run` submit the concrete
 * handler types sast-scan and analyze-quality. ResultSaver saves them through
 * the security and quality savers instead of as generic JSON.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ResultSaver } from '../../../src/coordination/result-saver';
import type { TaskType } from '../../../src/coordination/queen-coordinator';

const sastResult = {
  scanId: 's1',
  vulnerabilities: [{
    title: 'Code Injection via eval()', category: 'injection', severity: 'critical',
    location: { file: '/p/src/unsafe.js', line: 2 }, description: 'eval() executes arbitrary code',
  }],
  summary: { critical: 1, high: 0, medium: 0, low: 0, informational: 0, totalFiles: 1, scanDurationMs: 3 },
  coverage: { filesScanned: 1, linesScanned: 3, rulesApplied: 40 },
  evidence: { completeness: 'complete' },
};

const qualityResult = {
  score: { overall: 83, coverage: -1, complexity: 1, maintainability: 71.73, security: -1 },
  metrics: [{ name: 'complexity', value: 1 }, { name: 'maintainability', value: 71.73 }],
  recommendations: [],
  unmeasured: [{ metric: 'coverage', reason: 'no measured coverage' }],
};

describe('ResultSaver for concrete handler types (#1125)', () => {
  let baseDir: string;
  let saver: ResultSaver;

  beforeEach(() => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-1125-saver-'));
    saver = new ResultSaver(path.join(baseDir, '.agentic-qe'));
    vi.stubEnv('AQE_MEMORY_BACKEND', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  it('saves a sast-scan result as a security report with its findings', async () => {
    const saved = await saver.save('t1', 'sast-scan' as TaskType, sastResult);

    expect(saved.taskType).toBe('sast-scan');
    expect(saved.files.map(f => path.basename(path.dirname(f.path)))).toEqual(['security', 'security', 'security']);
    expect(saved.summary).toMatchObject({ status: 'completed', vulnerabilities: 1, critical: 1, high: 0 });
    const report = fs.readFileSync(saved.files.find(f => f.format === 'markdown')!.path, 'utf8');
    expect(report).toContain('Code Injection via eval()');
  });

  it('saves an analyze-quality result as a quality report without a gate verdict', async () => {
    const saved = await saver.save('t2', 'analyze-quality' as TaskType, qualityResult);

    expect(saved.files.map(f => path.basename(path.dirname(f.path)))).toEqual(['quality', 'quality']);
    const report = fs.readFileSync(saved.files.find(f => f.format === 'markdown')!.path, 'utf8');
    expect(report).toContain('INSUFFICIENT EVIDENCE (not passed)');
    expect(report).toContain('Not evaluated (static analysis only)');
    expect(report).toContain('Unmeasured:** coverage');
  });
});
