/**
 * Agentic QE v3 - Git Analysis Utilities
 */

export { GitAnalyzer } from './git-analyzer';
export type {
  GitAnalyzerConfig,
  GitCommit,
  GitBlameInfo,
  FileHistory,
} from './git-analyzer';
export { assertSafeGitRef, getGitRefError } from './ref-validation';
