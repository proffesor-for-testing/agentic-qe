/**
 * #1388: test generation applies a pattern without a measured success only
 * when it is a built-in seed or a pattern a person imported. Imports carry a
 * positive `context.curation = 'user-import'` marker that no automatic writer
 * sets; seed names must match every seed AQE ships.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  BUILTIN_SEED_PATTERN_NAMES, isBuiltinSeedName, isUserCurated, markUserCurated,
} from '../../../src/learning/curated-patterns';
import { PRETRAINED_PATTERNS } from '../../../src/learning/pretrained-patterns';

const mocks = vi.hoisted(() => ({ initializeLearningSystem: vi.fn(), printJson: vi.fn() }));
vi.mock('../../../src/cli/commands/learning-helpers.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../src/cli/commands/learning-helpers.js')>(),
  initializeLearningSystem: mocks.initializeLearningSystem,
  printJson: mocks.printJson,
}));
import { createLearningCommand } from '../../../src/cli/commands/learning.js';

const repo = resolve(__dirname, '../../..');
/** `name: '…'` values of the object literals in a source span (template variables excluded). */
function seedNamesIn(file: string, from: string, to: string): string[] {
  const source = readFileSync(join(repo, file), 'utf8');
  const span = source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));
  return [...span.matchAll(/^\s*name: '([^']+)',\s*$/gm)].map((m) => m[1]);
}

describe('#1388 built-in seed names', () => {
  it('include every pretrained pattern', () => {
    for (const pattern of PRETRAINED_PATTERNS) expect(BUILTIN_SEED_PATTERN_NAMES.has(pattern.name)).toBe(true);
  });

  it('include every seed ReasoningBankService stores into an empty bank', () => {
    const names = seedNamesIn('src/mcp/services/reasoning-bank-service.ts', 'const seedPatterns = [', '];');
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(BUILTIN_SEED_PATTERN_NAMES.has(name), name).toBe(true);
  });

  it('include every foundational pattern of the real ReasoningBank', () => {
    const names = seedNamesIn('src/learning/real-qe-reasoning-bank.ts', 'const foundationalPatterns', '    ];');
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(BUILTIN_SEED_PATTERN_NAMES.has(name), name).toBe(true);
  });

  it('accept a seed\'s cross-domain transfer, not a learned pattern\'s', () => {
    expect(isBuiltinSeedName('AAA Unit Test (from test-generation)')).toBe(true);
    expect(isBuiltinSeedName('generate-tests sourceFilessrcCalckt (from test-generation)')).toBe(false);
    expect(isBuiltinSeedName('AAA Unit Test copy')).toBe(false);
  });
});

describe('#1388 curation marker', () => {
  it('marks a context and overrides an incoming marker', () => {
    expect(markUserCurated({ tags: ['a'], curation: 'something-else' }, 'user-import')).toEqual({ tags: ['a'], curation: 'user-import' });
    expect(markUserCurated(undefined, 'user-import')).toEqual({ curation: 'user-import' });
  });

  it('recognises only the user-import marker', () => {
    expect(isUserCurated({ curation: 'user-import' })).toBe(true);
    expect(isUserCurated({ curation: 'automatic' })).toBe(false);
    expect(isUserCurated({ tags: ['user-import'] })).toBe(false);
    expect(isUserCurated(null)).toBe(false);
  });

  it('is set by no automatic writer in src/', () => {
    const { execSync } = require('node:child_process') as typeof import('node:child_process');
    const hits = execSync(`grep -rln "user-import" src --include=*.ts`, { cwd: repo, encoding: 'utf8' })
      .split('\n').filter(Boolean).sort();
    expect(hits).toEqual([
      'src/cli/commands/learning.ts',
      'src/learning/curated-patterns.ts',
      'src/learning/qe-patterns.ts',
    ]);
  });
});

describe('#1388 aqe learning import marks patterns as curated', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aqe-1388-import-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  beforeEach(() => vi.clearAllMocks());

  const file = join(dir, 'export.json');
  writeFileSync(file, JSON.stringify({ version: '3', patterns: [
    { patternType: 'test-template', name: 'team-a', description: 'd', template: { type: 'prompt', content: 'x', variables: [] }, context: { tags: ['kotlin'], language: 'kotlin' } },
    { patternType: 'test-template', name: 'team-b', description: 'd', template: { type: 'prompt', content: 'x', variables: [] } },
  ] }));
  const stored = () => ({ success: true as const, value: { id: 'x', embedding: [0.1] } });

  it.each([['import'], ['import-merge']])('aqe learning %s', async (command) => {
    const storePattern = vi.fn(async () => stored());
    mocks.initializeLearningSystem.mockResolvedValue({
      storePattern, searchPatterns: vi.fn().mockResolvedValue({ success: true, value: [] }),
    });

    await createLearningCommand().exitOverride().parseAsync(['node', 'learning', command, '-i', file, '--json']);

    expect(storePattern.mock.calls.map(([options]) => (options as { context: unknown }).context)).toEqual([
      { tags: ['kotlin'], language: 'kotlin', curation: 'user-import' },
      { curation: 'user-import' },
    ]);
  });
});
