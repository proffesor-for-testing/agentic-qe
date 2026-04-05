/**
 * Shared utility: find the agentic-qe package root directory.
 *
 * When esbuild bundles the CLI with code-splitting, `import.meta.url`
 * resolves to `dist/cli/chunks/chunk-XXX.js` (3+ levels deep) instead
 * of the expected `dist/init/skills-installer.js` (2 levels deep).
 * Fixed `../../` traversals land at `dist/` instead of the package root,
 * so skills/agents/helpers can't be found.
 *
 * This module walks up from the caller's directory until it finds a
 * `package.json` with `name === "agentic-qe"`, which works regardless
 * of how deep the bundle puts the calling file.
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Find the agentic-qe package root by walking up from `import.meta.url`.
 *
 * @param callerMetaUrl – pass `import.meta.url` from the calling module
 * @param maxDepth      – how many parent directories to check (default 10)
 * @returns absolute path to the package root, or null if not found
 */
export function findPackageRoot(callerMetaUrl: string, maxDepth = 10): string | null {
  let dir = dirname(fileURLToPath(callerMetaUrl));

  for (let i = 0; i < maxDepth; i++) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.name === 'agentic-qe') {
          return dir;
        }
      } catch {
        // Malformed JSON — keep walking
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }

  return null;
}
