/**
 * #1454: the pinned ADR-117 anchor is a package asset. `aqe quality-gate`
 * (and `qe/quality/gate`, which shares the runner) must read it from the
 * agentic-qe package root, not from the user's project root or cwd — that
 * failed with ENOENT in every project but the AQE repo itself.
 */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const shippedAnchor = join(repoRoot, 'verification/anchors/qe-anchor-v1.json');

// The user's project: a directory that holds no verification/ folder.
const userProject = mkdtempSync(join(tmpdir(), 'aqe-1454-project-'));
vi.mock('../../../src/kernel/unified-memory.js', () => ({ findProjectRoot: () => userProject }));
// Lets one test simulate a broken install where the package root is not found.
const packageRoot = vi.hoisted(() => ({ missing: false }));
vi.mock('../../../src/init/find-package-root.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../src/init/find-package-root.js')>();
  return { findPackageRoot: (url: string) => (packageRoot.missing ? null : real.findPackageRoot(url)) };
});

const { defaultAnchorPath, DEFAULT_ANCHOR_RELATIVE_PATH } = await import('../../../src/validation/anchor-path.js');
const { listChecklistIds, loadChecklist } = await import('../../../src/validation/quality-gate-runner.js');

describe('pinned anchor resolution (#1454)', () => {
  beforeAll(() => {
    mkdirSync(join(userProject, 'custom'), { recursive: true });
    copyFileSync(shippedAnchor, join(userProject, 'custom/anchor.json'));
  });

  afterAll(() => {
    rmSync(userProject, { recursive: true, force: true });
  });

  it('resolves the default anchor from the agentic-qe package root', () => {
    expect(defaultAnchorPath()).toBe(join(repoRoot, DEFAULT_ANCHOR_RELATIVE_PATH));
  });

  it('lists checklist ids in a project that has no verification/ folder', () => {
    expect(listChecklistIds()).toEqual(['A1-inRange', 'A2-letterGrade', 'A3-isBlank', 'A4-countAbove', 'A5-parseBool']);
  });

  it('loads a pinned checklist by id in that project', () => {
    expect(loadChecklist('A1-inRange').requirements.length).toBeGreaterThan(0);
  });

  it('still resolves a caller-named relative anchor from the project root', () => {
    expect(listChecklistIds('custom/anchor.json')).toContain('A1-inRange');
    expect(() => listChecklistIds('missing/anchor.json')).toThrow(join(userProject, 'missing/anchor.json'));
  });

  it('fails with a clear error, not a project-relative guess, when the package root is missing', () => {
    packageRoot.missing = true;
    try {
      expect(() => listChecklistIds()).toThrow(/Cannot locate the agentic-qe package root/);
    } finally {
      packageRoot.missing = false;
    }
  });

  it('ships only the default anchor in package.json#files', () => {
    const files = (JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as { files: string[] }).files;
    expect(files).toContain(DEFAULT_ANCHOR_RELATIVE_PATH);
    expect(files.filter((f) => f.startsWith('verification'))).toEqual([DEFAULT_ANCHOR_RELATIVE_PATH]);
  });
});
