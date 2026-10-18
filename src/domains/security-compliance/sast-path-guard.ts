/**
 * #1125 review: decide which requested files the sast-scan task may read.
 *
 * The task reads every file it is given. Its payload can come from MCP
 * task_submit, so the same rule as code indexing (#1096) applies: a file is
 * scanned only when its realpath is a regular file inside the project root's
 * realpath. A symlink out of the project, a device such as /dev/zero or a
 * directory is refused by name, and so is a file over the size limit.
 */
import { findProjectRoot } from '../../kernel/project-root.js';
import {
  confinePayloadPaths, MAX_PAYLOAD_FILE_BYTES, type SkippedPayloadPath,
} from '../../shared/io/payload-path-guard.js';

/** Largest file the pattern scanner reads whole into memory. */
export const MAX_SAST_FILE_BYTES = MAX_PAYLOAD_FILE_BYTES;

export interface ConfinedSastFiles {
  accepted: string[];
  skipped: SkippedPayloadPath[];
}

export async function confineSastFiles(
  paths: readonly string[],
  projectRoot: string = findProjectRoot(),
): Promise<ConfinedSastFiles> {
  return confinePayloadPaths(paths, { projectRoot, maxBytes: MAX_SAST_FILE_BYTES });
}
