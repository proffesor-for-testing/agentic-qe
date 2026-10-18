/**
 * #1125 review: decide which requested files the sast-scan task may read.
 *
 * The task reads every file it is given. Its payload can come from MCP
 * task_submit, so the same rule as code indexing (#1096) applies: a file is
 * scanned only when its realpath is a regular file inside the project root's
 * realpath. A symlink out of the project, a device such as /dev/zero or a
 * directory is refused by name, and so is a file over the size limit.
 */
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { findProjectRoot } from '../../kernel/project-root.js';
import { confineIndexPaths } from '../code-intelligence/index-path-guard.js';

/** Largest file the pattern scanner reads whole into memory. */
export const MAX_SAST_FILE_BYTES = 2 * 1024 * 1024;

export interface ConfinedSastFiles {
  accepted: string[];
  skipped: Array<{ path: string; reason: string }>;
}

export async function confineSastFiles(
  paths: readonly string[],
  projectRoot: string = findProjectRoot(),
): Promise<ConfinedSastFiles> {
  const confined = await confineIndexPaths(paths, projectRoot);
  const skipped: ConfinedSastFiles['skipped'] = [...confined.skipped];
  const accepted: string[] = [];
  for (const file of confined.accepted) {
    const stat = await fs.stat(path.resolve(file)).catch(() => null);
    if (!stat) skipped.push({ path: file, reason: 'unreadable' });
    else if (stat.size > MAX_SAST_FILE_BYTES) skipped.push({ path: file, reason: 'too-large' });
    else accepted.push(file);
  }
  return { accepted, skipped };
}
