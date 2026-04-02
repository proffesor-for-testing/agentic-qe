/**
 * Agentic QE v3 - GitHub Plugin Source (IMP-09)
 *
 * Discovers and fetches plugins from GitHub repositories.
 * Uses git clone over HTTPS (public repos only).
 */

import * as path from 'path';
import { execFileSync } from 'child_process';
import { parseManifest, type QEPluginManifest } from '../manifest';
import type { PluginSource } from './local';

// ============================================================================
// Input Validation
// ============================================================================

/** Only allow safe characters in repo owner/name and tag */
const SAFE_REPO_REGEX = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
const SAFE_TAG_REGEX = /^[a-zA-Z0-9._\-/]+$/;

function validateRepoRef(repo: string, tag?: string): void {
  if (!SAFE_REPO_REGEX.test(repo)) {
    throw new Error(`Invalid GitHub repo "${repo}": must be owner/repo with alphanumeric, dots, hyphens, underscores only`);
  }
  if (tag && !SAFE_TAG_REGEX.test(tag)) {
    throw new Error(`Invalid tag "${tag}": must be alphanumeric with dots, hyphens, underscores, slashes only`);
  }
}

// ============================================================================
// GitHubPluginSource
// ============================================================================

export class GitHubPluginSource implements PluginSource {
  readonly type = 'github';

  private readonly cacheDir: string;

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir ?? path.join(process.cwd(), '.agentic-qe', 'plugins-cache');
  }

  async resolve(location: string): Promise<QEPluginManifest> {
    const pluginPath = await this.getPluginPath(location);
    const manifestPath = path.join(pluginPath, 'qe-plugin.json');

    const fs = await import('fs');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`No qe-plugin.json found in ${location}`);
    }

    const raw = fs.readFileSync(manifestPath, 'utf-8');
    return parseManifest(raw);
  }

  async getPluginPath(location: string): Promise<string> {
    const { repo, tag } = this.parseLocation(location);

    // Validate inputs before using in any command
    validateRepoRef(repo, tag);

    const targetDir = path.join(this.cacheDir, repo.replace('/', '__'), tag || 'latest');

    const fs = await import('fs');
    if (fs.existsSync(targetDir)) {
      return targetDir;
    }

    fs.mkdirSync(targetDir, { recursive: true });

    try {
      const cloneUrl = `https://github.com/${repo}.git`;

      // Use execFileSync with array args — no shell, no injection
      const args = ['clone', '--depth', '1'];
      if (tag) {
        args.push('--branch', tag);
      }
      args.push(cloneUrl, targetDir);

      execFileSync('git', args, { stdio: 'pipe', timeout: 60_000 });
    } catch (err) {
      fs.rmSync(targetDir, { recursive: true, force: true });
      throw new Error(
        `Failed to clone ${repo}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return targetDir;
  }

  private parseLocation(location: string): { repo: string; tag?: string } {
    const [repo, tag] = location.split('@');
    if (!repo || !repo.includes('/')) {
      throw new Error(`Invalid GitHub location "${location}". Expected "owner/repo" or "owner/repo@tag"`);
    }
    return { repo, tag };
  }
}
