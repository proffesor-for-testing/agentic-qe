/**
 * Agentic QE v3 - Local Plugin Source (IMP-09)
 *
 * Discovers and loads plugins from local filesystem directories.
 * Expects a `qe-plugin.json` manifest file in the plugin root.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseManifest, type QEPluginManifest } from '../manifest';

// ============================================================================
// Types
// ============================================================================

export interface PluginSource {
  type: string;
  /** Resolve the plugin manifest from this source. */
  resolve(location: string): Promise<QEPluginManifest>;
  /** Get the absolute path to the plugin directory. */
  getPluginPath(location: string): Promise<string>;
}

// ============================================================================
// LocalPluginSource
// ============================================================================

export class LocalPluginSource implements PluginSource {
  readonly type = 'local';

  async resolve(location: string): Promise<QEPluginManifest> {
    const absPath = path.resolve(location);
    const manifestPath = path.join(absPath, 'qe-plugin.json');

    if (!fs.existsSync(manifestPath)) {
      throw new Error(`No qe-plugin.json found at ${manifestPath}`);
    }

    const raw = fs.readFileSync(manifestPath, 'utf-8');
    return parseManifest(raw);
  }

  async getPluginPath(location: string): Promise<string> {
    const absPath = path.resolve(location);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Plugin directory does not exist: ${absPath}`);
    }
    return absPath;
  }
}
