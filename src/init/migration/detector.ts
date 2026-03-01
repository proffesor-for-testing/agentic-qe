/**
 * V2 Detector
 * Detects existing v2 AQE installations
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { safeJsonParse } from '../../shared/safe-json.js';
import { openDatabase } from '../../shared/safe-db.js';

/**
 * V2 detection information
 */
export interface V2DetectionInfo {
  detected: boolean;
  version: string | undefined;
  paths: {
    memoryDb: string | undefined;
    configDir: string | undefined;
    agentsDir: string | undefined;
  };
  assets: {
    hasMemoryDb: boolean;
    hasConfig: boolean;
    hasAgents: boolean;
    hasV2ConfigFiles: boolean;
    hasV3ConfigYaml: boolean;
  };
  isV3Installation: boolean;
}

/**
 * V2 Detector class
 */
export class V2Detector {
  constructor(private projectRoot: string) {}

  /**
   * Detect v2 installation
   */
  async detect(): Promise<V2DetectionInfo> {
    const memoryDbPath = join(this.projectRoot, '.agentic-qe', 'memory.db');
    const configDir = join(this.projectRoot, '.agentic-qe', 'config');
    const agentsDir = join(this.projectRoot, '.claude', 'agents');
    const v2ConfigFile = join(this.projectRoot, '.agentic-qe', 'config', 'learning.json');
    const v3ConfigYaml = join(this.projectRoot, '.agentic-qe', 'config.yaml');

    const hasMemoryDb = existsSync(memoryDbPath);
    const hasConfig = existsSync(configDir);
    const hasAgents = existsSync(agentsDir);
    const hasV2ConfigFiles = existsSync(v2ConfigFile);
    const hasV3ConfigYaml = existsSync(v3ConfigYaml);

    // Read version from database
    let version: string | undefined;
    let isV3Installation = false;

    if (hasMemoryDb) {
      version = this.readVersionFromDb(memoryDbPath);
      if (version) {
        isV3Installation = version.startsWith('3.');
      } else {
        version = '2.x.x';
      }
    }

    // Determine if v2 detected
    const detected = !isV3Installation && hasMemoryDb && (
      !version?.startsWith('3.') ||
      (hasV2ConfigFiles && !hasV3ConfigYaml)
    );

    return {
      detected,
      version,
      paths: {
        memoryDb: hasMemoryDb ? memoryDbPath : undefined,
        configDir: hasConfig ? configDir : undefined,
        agentsDir: hasAgents ? agentsDir : undefined,
      },
      assets: {
        hasMemoryDb,
        hasConfig,
        hasAgents,
        hasV2ConfigFiles,
        hasV3ConfigYaml,
      },
      isV3Installation,
    };
  }

  /**
   * Read version from memory.db
   */
  private readVersionFromDb(dbPath: string): string | undefined {
    try {
      const db = openDatabase(dbPath, { readonly: true, fileMustExist: true });

      try {
        const tableExists = db.prepare(`
          SELECT name FROM sqlite_master
          WHERE type='table' AND name='kv_store'
        `).get();

        if (!tableExists) {
          db.close();
          return undefined;
        }

        const row = db.prepare(`
          SELECT value FROM kv_store
          WHERE key = 'aqe_version' AND namespace = '_system'
        `).get() as { value: string } | undefined;

        db.close();

        if (row) {
          return safeJsonParse<string>(row.value);
        }
        return undefined;
      } catch {
        db.close();
        return undefined;
      }
    } catch {
      return undefined;
    }
  }
}

/**
 * Create V2 detector
 */
export function createV2Detector(projectRoot: string): V2Detector {
  return new V2Detector(projectRoot);
}
