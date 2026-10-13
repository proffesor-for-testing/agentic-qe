/**
 * Agentic QE v3 - MCP result-cache scope (#998)
 *
 * The protocol server reuses results of read-only tools through the session
 * cache. A result is only reusable for the same project and the same inputs,
 * so the cache key carries:
 * - the resolved project root and working directory, and
 * - for each path argument, its absolute path plus an mtime/size fingerprint,
 *   so an edited requirements file misses the cache.
 *
 * A directory argument cannot be fingerprinted cheaply (editing a file inside
 * it does not change the directory's mtime), so a call that reads a directory
 * tree is reported as not reusable and runs every time.
 *
 * @module mcp/tool-cache-scope
 */

import * as fs from 'fs';
import * as path from 'path';
import { findProjectRoot } from '../kernel/project-root.js';
import type { CacheScope } from '../optimization/session-cache.js';

/** Argument names that tools treat as filesystem paths. */
export const PATH_ARGUMENTS = [
  'target', 'requirementsPath', 'contractPath', 'testPath', 'path', 'filePath', 'file',
] as const;

interface PathFingerprint {
  path: string;
  exists: boolean;
  kind?: 'file' | 'directory' | 'other';
  size?: number;
  mtimeMs?: number;
}

function fingerprintPath(value: string, cwd: string): PathFingerprint {
  const absolute = path.resolve(cwd, value);
  try {
    const stat = fs.statSync(absolute);
    return {
      path: absolute,
      exists: true,
      kind: stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : 'other',
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    };
  } catch {
    return { path: absolute, exists: false };
  }
}

/**
 * Tools that scan the working directory tree when their path argument is
 * omitted. Such a call reads mutable files that no fingerprint here covers.
 */
const IMPLICIT_DIRECTORY_ARGUMENT: Record<string, (typeof PATH_ARGUMENTS)[number]> = {
  requirements_validate: 'requirementsPath',
};

export interface ToolCacheScope {
  scope: CacheScope;
  /** False when the call reads a directory tree, so no cached result may be reused. */
  reusable: boolean;
}

/**
 * Build the cache scope for one tool call: project root, working directory
 * and a fingerprint of every path argument (relative ones resolved to
 * absolute paths against the working directory).
 */
export function buildToolCacheScope(
  toolName: string,
  params: Record<string, unknown> | undefined,
): ToolCacheScope {
  const cwd = process.cwd();
  const projectRoot = path.resolve(findProjectRoot());
  const inputs: Record<string, PathFingerprint> = {};
  let reusable = true;
  for (const name of PATH_ARGUMENTS) {
    const value = params?.[name];
    if (typeof value === 'string' && value.length > 0) {
      const fingerprint = fingerprintPath(value, cwd);
      inputs[name] = fingerprint;
      if (fingerprint.kind === 'directory') reusable = false;
    }
  }
  const implicit = IMPLICIT_DIRECTORY_ARGUMENT[toolName];
  if (implicit && inputs[implicit] === undefined) reusable = false;
  return { scope: { projectRoot, cwd, inputs }, reusable };
}
