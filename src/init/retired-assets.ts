/**
 * Retired shipped assets (#1017).
 *
 * Earlier releases copied files into the user's project that 3.15.6 renames.
 * Re-running `aqe init` skips skills that already exist, so an existing install
 * would keep the stale copies, and their test-glob names make the user's own
 * vitest / jest collect AQE's eval fixtures.
 *
 * Each group is retired as a unit:
 *  - A retired file is removable only when its path matches exactly, it is a
 *    regular file (not a symlink), its resolved parent directory is inside the
 *    project root (no symlinked ancestor), and its sha256 equals a version AQE
 *    actually shipped.
 *  - If ANY present file in a group is not removable (edited, symlink, outside
 *    the project, unreadable), the whole group is kept. Deleting a pristine
 *    `budget.ts` next to a kept `budget.test.ts` would break the user's test run
 *    with "Cannot find module './budget'".
 *  - After removal, the renamed replacements are installed from the package
 *    (never overwriting an existing file), and companion files that still name
 *    the old files (README, eval yaml) are refreshed only when they are AQE's
 *    unmodified shipped copies. Plain `init --auto` therefore leaves a working
 *    skill without overwriting user edits.
 */

import { createHash } from 'crypto';
import {
  copyFileSync, existsSync, lstatSync, readFileSync, realpathSync, unlinkSync,
} from 'fs';
import { dirname, join, sep } from 'path';

export interface RetiredFile {
  /** Path relative to the project root, '/'-separated. */
  readonly relPath: string;
  /** sha256 (hex) of every distinct content AQE shipped at this path. */
  readonly shippedSha256: readonly string[];
}

export interface ReplacementFile {
  /** Destination relative to the project root. */
  readonly relPath: string;
  /** Source relative to the package skills directory (assets/skills). */
  readonly source: string;
}

export interface RefreshFile extends ReplacementFile {
  /** sha256 of every earlier shipped version; only those are overwritten. */
  readonly previousSha256: readonly string[];
}

export interface RetiredAssetGroup {
  readonly id: string;
  /** Retired together: if one is kept, all are kept. */
  readonly retired: readonly RetiredFile[];
  /** Installed (if absent) once the group is retired. */
  readonly replacements: readonly ReplacementFile[];
  /** Overwritten once the group is retired, only if still AQE's unmodified copy. */
  readonly refresh: readonly RefreshFile[];
  /** Why the group was retired / what to do if it is kept. */
  readonly advice: string;
}

const QC = '.claude/skills/qe-court/evals/fixtures/seeded-mutant-delivery';
const QC_SRC = 'qe-court/evals/fixtures/seeded-mutant-delivery';
const TS = '.claude/skills/testability-scoring/resources/templates';
const TS_SRC = 'testability-scoring/resources/templates';

/**
 * Hashes are of `git show <tag>:assets/skills/<path>` over every v3 release tag.
 * Retired files: one distinct content each (v3.13.0–v3.15.5 for qe-court,
 * v3.0.0–v3.15.5 for testability-scoring); the same bytes now ship under the
 * new names, which a unit test pins. Refreshed files list every earlier shipped
 * content (qe-court.yaml changed once, at v3.14.0).
 */
export const RETIRED_ASSET_GROUPS: readonly RetiredAssetGroup[] = Object.freeze([
  {
    id: 'qe-court-seeded-mutant',
    retired: [
      { relPath: `${QC}/budget.test.ts`, shippedSha256: ['add1ff4cb05978c136f8c2c5cc50059d920f06f409e5f6f304239b7dad3cf65d'] },
      { relPath: `${QC}/budget.ts`, shippedSha256: ['11fc97cad19bb4fc0d31151a6d216ab99d0df0521b60be8fb19581d412147ef6'] },
    ],
    replacements: [
      { relPath: `${QC}/budget-tests.ts.fixture`, source: `${QC_SRC}/budget-tests.ts.fixture` },
      { relPath: `${QC}/budget.ts.fixture`, source: `${QC_SRC}/budget.ts.fixture` },
    ],
    refresh: [
      {
        relPath: `${QC}/README.md`,
        source: `${QC_SRC}/README.md`,
        previousSha256: ['d3988b92856d0023a7ae210dce3e0bdf76204f41d635fd29f7e243c168ff6109'],
      },
      {
        relPath: '.claude/skills/qe-court/evals/qe-court.yaml',
        source: 'qe-court/evals/qe-court.yaml',
        previousSha256: [
          '412899013a51a099224bad04491d49dca19f2c567c5599adedabd0e1d58556c7',
          '27c8be547dc032e2dbe488156dd7a30f79b1cc921fe92efec5b9bb0a151f0e9b',
        ],
      },
    ],
    advice:
      '3.15.6 renamed the qe-court seeded-mutant fixture to budget.ts.fixture / budget-tests.ts.fixture ' +
      'because budget.test.ts matches test-runner globs, so your vitest/jest collects it (#1017). ' +
      'The pair was left as is; delete or rename both files if you do not want your test runner to collect it',
  },
  {
    id: 'testability-scoring-spec-template',
    retired: [
      {
        relPath: `${TS}/testability-scoring.spec.template.js`,
        shippedSha256: ['e85a3e25bb458f3d090834e121b02e8db83cdc589149b5cf7549853e1a067edf'],
      },
    ],
    replacements: [
      { relPath: `${TS}/testability-scoring-spec.template.js`, source: `${TS_SRC}/testability-scoring-spec.template.js` },
    ],
    refresh: [],
    advice:
      '3.15.6 renamed it to testability-scoring-spec.template.js because its name matches the `*.spec.*` ' +
      'test glob (#1017); delete or rename it if your test runner should not collect it',
  },
]);

export interface RetireOptions {
  /** Package skills directory (assets/skills) used for replacements and refreshes. */
  sourceSkillsDir?: string;
  groups?: readonly RetiredAssetGroup[];
}

export interface RetireResult {
  /** Retired files removed (exact path + shipped content). */
  removed: string[];
  /** Renamed replacements installed. */
  installed: string[];
  /** Companion files updated from AQE's unmodified copy. */
  refreshed: string[];
  /** Groups left in place, with the files, the cause, and what to do. */
  kept: Array<{ group: string; files: string[]; why: string; advice: string }>;
  /** Replacements that could not be installed (missing package source or unsafe target). */
  missingReplacements: string[];
}

export function sha256Hex(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/** True when `full`'s resolved parent directory is inside the resolved project root. */
function parentInsideRoot(rootReal: string, full: string): boolean {
  let parentReal: string;
  try {
    parentReal = realpathSync(dirname(full));
  } catch {
    return false;
  }
  return parentReal === rootReal || parentReal.startsWith(rootReal + sep);
}

type Probe = { state: 'absent' } | { state: 'removable' } | { state: 'blocked'; why: string };

function probe(rootReal: string, full: string, name: string, shippedSha256: readonly string[]): Probe {
  let stat;
  try {
    stat = lstatSync(full);
  } catch {
    return { state: 'absent' };
  }
  if (!parentInsideRoot(rootReal, full)) {
    return { state: 'blocked', why: `${name} resolves outside the project (symlinked directory)` };
  }
  if (!stat.isFile()) return { state: 'blocked', why: `${name} is not a regular file` };
  try {
    if (!shippedSha256.includes(sha256Hex(readFileSync(full)))) {
      return { state: 'blocked', why: `${name} was modified since AQE installed it` };
    }
  } catch (error) {
    return { state: 'blocked', why: `${name} is unreadable (${error instanceof Error ? error.message : String(error)})` };
  }
  return { state: 'removable' };
}

/** Remove retired assets AQE shipped unmodified, install replacements; keep anything else. */
export function retireShippedAssets(projectRoot: string, options: RetireOptions = {}): RetireResult {
  const groups = options.groups ?? RETIRED_ASSET_GROUPS;
  const result: RetireResult = { removed: [], installed: [], refreshed: [], kept: [], missingReplacements: [] };
  let rootReal: string;
  try {
    rootReal = realpathSync(projectRoot);
  } catch {
    return result;
  }
  const abs = (rel: string) => join(projectRoot, ...rel.split('/'));

  for (const group of groups) {
    const probes = group.retired.map((file) => ({
      file,
      probe: probe(rootReal, abs(file.relPath), file.relPath.split('/').pop()!, file.shippedSha256),
    }));
    const present = probes.filter((p) => p.probe.state !== 'absent');
    if (present.length === 0) continue;

    const blocked = present.filter((p) => p.probe.state === 'blocked');
    if (blocked.length > 0) {
      result.kept.push({
        group: group.id,
        files: present.map((p) => p.file.relPath),
        why: blocked.map((p) => (p.probe as { why: string }).why).join('; '),
        advice: group.advice,
      });
      continue;
    }

    for (const { file } of present) {
      try {
        unlinkSync(abs(file.relPath));
        result.removed.push(file.relPath);
      } catch (error) {
        result.kept.push({
          group: group.id,
          files: [file.relPath],
          why: `could not remove (${error instanceof Error ? error.message : String(error)})`,
          advice: group.advice,
        });
      }
    }

    for (const replacement of group.replacements) {
      const target = abs(replacement.relPath);
      const source = options.sourceSkillsDir ? join(options.sourceSkillsDir, ...replacement.source.split('/')) : undefined;
      if (existsSync(target)) continue; // never overwrite
      if (!source || !existsSync(source)) {
        result.missingReplacements.push(replacement.relPath);
        continue;
      }
      try {
        // The retired files lived in the same directories, so they exist; a
        // missing one is not created (it could sit under a symlinked ancestor).
        if (!existsSync(dirname(target)) || !parentInsideRoot(rootReal, target)) {
          result.missingReplacements.push(replacement.relPath);
          continue;
        }
        copyFileSync(source, target);
        result.installed.push(replacement.relPath);
      } catch {
        result.missingReplacements.push(replacement.relPath);
      }
    }

    for (const refresh of group.refresh) {
      const target = abs(refresh.relPath);
      const source = options.sourceSkillsDir ? join(options.sourceSkillsDir, ...refresh.source.split('/')) : undefined;
      if (!source || !existsSync(source)) continue;
      try {
        const stat = lstatSync(target);
        if (!stat.isFile() || !parentInsideRoot(rootReal, target)) continue;
        if (!refresh.previousSha256.includes(sha256Hex(readFileSync(target)))) continue; // user-edited or current
        copyFileSync(source, target);
        result.refreshed.push(refresh.relPath);
      } catch {
        // absent or unreadable: nothing to refresh
      }
    }
  }
  return result;
}
