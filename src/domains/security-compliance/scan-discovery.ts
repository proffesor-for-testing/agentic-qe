import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { SecurityDiscoveryEvidence } from './scan-evidence.js';

// The established security task's source-language scope. A direct file target
// is retained even when unsupported, so its scanner disposition is observable.
const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.pyw', '.go', '.rs',
  '.java', '.kt', '.kts', '.rb', '.cs', '.php', '.swift', '.c', '.h', '.cpp',
  '.hpp', '.cc', '.scala',
]);
const EXCLUDED_DIRECTORIES = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.nyc_output',
  '__pycache__', '.venv', 'venv', '.tox', '.mypy_cache', 'target', '.gradle',
  'vendor', '.bundle', '.agentic-qe', '.claude', '.cache', '.npm', '.yarn',
  '.next', '.nuxt', '.svelte-kit', 'out', '.turbo', 'tmp', 'temp', '.tmp',
]);

export function isSecuritySourceFile(filePath: string): boolean {
  return SOURCE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export interface SecurityDiscoveryOptions {
  readonly maxFiles?: number;
  readonly maxDepth?: number;
}

/** Discover source inputs without turning failures or truncation into empty success. */
export async function discoverSecurityFiles(
  target: string,
  options: SecurityDiscoveryOptions = {},
): Promise<{ files: string[]; discovery: SecurityDiscoveryEvidence }> {
  const maxFiles = options.maxFiles ?? 5000;
  const maxDepth = options.maxDepth ?? 64;
  if (!Number.isSafeInteger(maxFiles) || maxFiles < 1
      || !Number.isSafeInteger(maxDepth) || maxDepth < 0) {
    throw new Error('Security discovery requires a positive file limit and non-negative depth limit.');
  }
  const files: string[] = [];
  const issues: { path: string; reason: string }[] = [];
  const excludedPaths: string[] = [];
  const root = path.resolve(target);
  let rootFailed = false;
  let truncated = false;

  function recordError(location: string, error: unknown): void {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    // Raw errors can include source text, arguments, URLs, or credentials.
    issues.push({ path: location, reason: typeof code === 'string' && /^[A-Z0-9_]{1,32}$/.test(code)
      ? code : 'DISCOVERY_FAILED' });
  }

  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > maxDepth) {
      issues.push({ path: directory, reason: 'DEPTH_LIMIT' });
      return;
    }
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      recordError(directory, error);
      if (directory === root) rootFailed = true;
      return;
    }
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      if (truncated) return;
      const entryPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        // Observed symlinks are explicitly excluded; their targets are not
        // claimed as scanned. Discovery does not guarantee an atomic snapshot.
        excludedPaths.push(entryPath);
      } else if (entry.isDirectory()) {
        if (EXCLUDED_DIRECTORIES.has(entry.name)) excludedPaths.push(entryPath);
        else await walk(entryPath, depth + 1);
      } else if (entry.isFile() && isSecuritySourceFile(entry.name)) {
        if (files.length === maxFiles) {
          issues.push({ path: entryPath, reason: 'FILE_LIMIT' });
          truncated = true;
          return;
        }
        files.push(entryPath);
      }
    }
  }

  try {
    const stat = await fs.lstat(root);
    if (stat.isFile()) files.push(root);
    else if (stat.isDirectory()) await walk(root, 0);
    else {
      rootFailed = true;
      issues.push({ path: root, reason: stat.isSymbolicLink() ? 'SYMLINK_TARGET' : 'NOT_REGULAR_INPUT' });
    }
  } catch (error) {
    rootFailed = true;
    recordError(root, error);
  }

  return {
    files,
    discovery: {
      status: rootFailed ? 'failed' : issues.length > 0 ? 'partial' : 'complete',
      policy: 'aqe-security-source-files@1',
      issues,
      excludedPaths,
    },
  };
}
