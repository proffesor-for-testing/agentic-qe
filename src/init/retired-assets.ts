/**
 * Retired shipped assets (#1017).
 *
 * Earlier releases copied files into the user's project that a newer release
 * renames or drops. Re-running `aqe init` never removes them on its own, so an
 * existing install keeps the stale copy next to the new one. For the #1017
 * files that matters: their names match common test globs, so the user's own
 * vitest / jest run collects AQE's eval fixtures.
 *
 * A retired asset is removed only when BOTH hold:
 *   - the path matches exactly (relative to the project root), and
 *   - the file's sha256 equals the content of a version AQE actually shipped.
 * A file the user edited (any other hash), a symlink, or a non-file is kept
 * and reported, so init never deletes user work.
 */

import { createHash } from 'crypto';
import { lstatSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';

export interface RetiredAsset {
  /** Path relative to the project root, '/'-separated. */
  readonly relPath: string;
  /** sha256 (hex) of every distinct content AQE shipped at this path. */
  readonly shippedSha256: readonly string[];
  /** Why it was retired, shown when a modified copy is kept. */
  readonly reason: string;
}

const QE_COURT_FIXTURE = '.claude/skills/qe-court/evals/fixtures/seeded-mutant-delivery';
const TEST_GLOB_REASON =
  'renamed in 3.15.6 because its name matches test-runner globs (#1017)';

/**
 * Hashes are of `git show <tag>:assets/skills/<path>` for every v3 release tag
 * that shipped the file (v3.13.0–v3.15.5 for qe-court, v3.0.0–v3.15.5 for
 * testability-scoring); each path shipped one distinct content. The same bytes
 * now ship under the new name, which a unit test pins.
 */
export const RETIRED_ASSETS: readonly RetiredAsset[] = Object.freeze([
  {
    relPath: `${QE_COURT_FIXTURE}/budget.test.ts`,
    shippedSha256: ['add1ff4cb05978c136f8c2c5cc50059d920f06f409e5f6f304239b7dad3cf65d'],
    reason: `${TEST_GLOB_REASON}; now budget-tests.ts.fixture`,
  },
  {
    relPath: `${QE_COURT_FIXTURE}/budget.ts`,
    shippedSha256: ['11fc97cad19bb4fc0d31151a6d216ab99d0df0521b60be8fb19581d412147ef6'],
    reason: 'renamed in 3.15.6 to budget.ts.fixture with its test file (#1017)',
  },
  {
    relPath: '.claude/skills/testability-scoring/resources/templates/testability-scoring.spec.template.js',
    shippedSha256: ['e85a3e25bb458f3d090834e121b02e8db83cdc589149b5cf7549853e1a067edf'],
    reason: `${TEST_GLOB_REASON}; now testability-scoring-spec.template.js`,
  },
]);

export interface RetireResult {
  /** Removed: exact path and shipped content. */
  removed: string[];
  /** Kept because the content differs from every shipped version (user edit) or is not a regular file. */
  kept: Array<{ relPath: string; reason: string }>;
}

export function sha256Hex(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Remove retired assets AQE shipped unmodified; keep and report anything else. */
export function retireShippedAssets(
  projectRoot: string,
  assets: readonly RetiredAsset[] = RETIRED_ASSETS,
): RetireResult {
  const result: RetireResult = { removed: [], kept: [] };
  for (const asset of assets) {
    const full = join(projectRoot, ...asset.relPath.split('/'));
    let stat;
    try {
      stat = lstatSync(full);
    } catch {
      continue; // not present
    }
    if (!stat.isFile()) {
      result.kept.push({ relPath: asset.relPath, reason: `not a regular file; ${asset.reason}` });
      continue;
    }
    let hash: string;
    try {
      hash = sha256Hex(readFileSync(full));
    } catch (error) {
      result.kept.push({
        relPath: asset.relPath,
        reason: `unreadable (${error instanceof Error ? error.message : String(error)}); ${asset.reason}`,
      });
      continue;
    }
    if (!asset.shippedSha256.includes(hash)) {
      result.kept.push({ relPath: asset.relPath, reason: `modified since AQE installed it; ${asset.reason}` });
      continue;
    }
    try {
      unlinkSync(full);
      result.removed.push(asset.relPath);
    } catch (error) {
      result.kept.push({
        relPath: asset.relPath,
        reason: `could not remove (${error instanceof Error ? error.message : String(error)}); ${asset.reason}`,
      });
    }
  }
  return result;
}
