/**
 * Agentic QE v3 - npm Plugin Source (IMP-09)
 *
 * Discovers and installs plugins from the npm registry.
 * Uses `npm pack` + extract to get the plugin without polluting
 * the project's node_modules.
 */

import * as path from 'path';
import * as fs from 'fs';
import { execFileSync } from 'child_process';
import { parseManifest, type QEPluginManifest } from '../manifest';
import type { PluginSource } from './local';

// ============================================================================
// Input Validation
// ============================================================================

/** Only allow safe npm package name characters: alphanumeric, @, /, -, ., _ */
const SAFE_NPM_NAME_REGEX = /^(@[a-zA-Z0-9._-]+\/)?[a-zA-Z0-9._-]+$/;
const SAFE_VERSION_REGEX = /^[a-zA-Z0-9._\-+]+$/;

function validateNpmSpec(name: string, version?: string): void {
  if (!SAFE_NPM_NAME_REGEX.test(name)) {
    throw new Error(`Invalid npm package name "${name}": contains unsafe characters`);
  }
  if (version && !SAFE_VERSION_REGEX.test(version)) {
    throw new Error(`Invalid version "${version}": contains unsafe characters`);
  }
}

// ============================================================================
// NpmPluginSource
// ============================================================================

export class NpmPluginSource implements PluginSource {
  readonly type = 'npm';

  private readonly cacheDir: string;

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir ?? path.join(process.cwd(), '.agentic-qe', 'plugins-cache', 'npm');
  }

  async resolve(location: string): Promise<QEPluginManifest> {
    const pluginPath = await this.getPluginPath(location);
    const manifestPath = path.join(pluginPath, 'qe-plugin.json');

    if (!fs.existsSync(manifestPath)) {
      throw new Error(`No qe-plugin.json found in npm package ${location}`);
    }

    const raw = fs.readFileSync(manifestPath, 'utf-8');
    return parseManifest(raw);
  }

  async getPluginPath(location: string): Promise<string> {
    const { name, version } = this.parseLocation(location);

    // Validate inputs before using in any command
    validateNpmSpec(name, version);

    const safeName = name.replace(/\//g, '__');
    const targetDir = path.join(this.cacheDir, `${safeName}@${version || 'latest'}`);

    if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
      return targetDir;
    }

    fs.mkdirSync(targetDir, { recursive: true });

    try {
      const spec = version ? `${name}@${version}` : name;

      // Use execFileSync with array args — no shell, no injection
      const tarball = execFileSync(
        'npm', ['pack', spec, '--pack-destination', targetDir],
        { stdio: 'pipe', timeout: 60_000 },
      ).toString().trim();

      const tarPath = path.join(targetDir, tarball);
      execFileSync(
        'tar', ['-xzf', tarPath, '-C', targetDir, '--strip-components=1'],
        { stdio: 'pipe' },
      );

      if (fs.existsSync(tarPath)) {
        fs.unlinkSync(tarPath);
      }
    } catch (err) {
      fs.rmSync(targetDir, { recursive: true, force: true });
      throw new Error(
        `Failed to fetch npm package ${location}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return targetDir;
  }

  private parseLocation(location: string): { name: string; version?: string } {
    // Handle scoped packages: @scope/name@version
    const atIndex = location.lastIndexOf('@');
    if (atIndex > 0) {
      return {
        name: location.slice(0, atIndex),
        version: location.slice(atIndex + 1) || undefined,
      };
    }
    return { name: location };
  }
}
