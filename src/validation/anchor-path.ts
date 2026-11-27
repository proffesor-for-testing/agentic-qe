/**
 * Where the pinned ADR-117 anchor ships (#1454).
 *
 * The frozen anchor is a package asset, not a project file: it ships in the
 * npm tarball (package.json#files) and is read from the agentic-qe package
 * root. Resolving it from `process.cwd()` or the user's project root breaks
 * every project except the AQE repo itself, and a fixed `../../../` from
 * `import.meta.url` breaks under the bundled CLI/MCP (`dist/cli/bundle.js`,
 * `dist/mcp/bundle.js`), which sit at a different depth than `src/`.
 * `findPackageRoot` walks up to the `agentic-qe` package.json, so one answer
 * holds for src/ (tsx), dist/ (tsc) and the esbuild bundles.
 */

import path from 'node:path';
import { findPackageRoot } from '../init/find-package-root.js';

/** The pinned anchor, relative to the agentic-qe package root (ADR-117). */
export const DEFAULT_ANCHOR_RELATIVE_PATH = 'verification/anchors/qe-anchor-v1.json';

/**
 * Absolute path of the shipped default anchor.
 * Throws when the agentic-qe package root cannot be found (a broken install),
 * rather than guessing a path in the user's project.
 */
export function defaultAnchorPath(): string {
  const root = findPackageRoot(import.meta.url);
  if (!root) {
    throw new Error(
      `Cannot locate the agentic-qe package root to read the pinned anchor ${DEFAULT_ANCHOR_RELATIVE_PATH}; reinstall agentic-qe or pass an explicit anchor path`,
    );
  }
  return path.join(root, DEFAULT_ANCHOR_RELATIVE_PATH);
}
