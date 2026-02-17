/**
 * Phase 01: Detection
 * Detects existing AQE v2 installation and v3 markers
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';
import { safeJsonParse } from '../../shared/safe-json.js';

import {
  BasePhase,
  type InitContext,
  type V2DetectionResult,
} from './phase-interface.js';

const require = createRequire(import.meta.url);

export interface DetectionResult {
  v2Detected: boolean;
  v3Detected: boolean;
  freshInstall: boolean;
  v2Detection?: V2DetectionResult;
}

/**
 * Detection phase - checks for existing AQE installations
 */
export class DetectionPhase extends BasePhase<DetectionResult> {
  readonly name = 'detection';
  readonly description = 'Detect existing installations';
  readonly order = 10;
  readonly critical = true;

  protected async run(context: InitContext): Promise<DetectionResult> {
    const { projectRoot } = context;

    // Detect v2 installation
    const v2Detection = await this.detectV2Installation(projectRoot);

    // Check for v3 markers
    const v3ConfigYaml = existsSync(join(projectRoot, '.agentic-qe', 'config.yaml'));
    const v3Version = v2Detection.version?.startsWith('3.');

    const v2Detected = v2Detection.detected;
    const v3Detected = v3ConfigYaml || v3Version || false;
    const freshInstall = !v2Detected && !v3Detected;

    // Store v2 detection in context for other phases
    context.v2Detection = v2Detection;

    if (v2Detected && !context.options.autoMigrate) {
      context.services.log('');
      context.services.log('═'.repeat(60));
      context.services.log('⚠️  EXISTING V2 INSTALLATION DETECTED');
      context.services.log('═'.repeat(60));
      context.services.log('');
      context.services.log('Found v2 installation at:');
      if (v2Detection.hasMemoryDb) {
        context.services.log('  • Memory DB: .agentic-qe/memory.db');
      }
      if (v2Detection.hasConfig) {
        context.services.log('  • Config: .agentic-qe/config/');
      }
      if (v2Detection.hasAgents) {
        context.services.log('  • Agents: .claude/agents/');
      }
      context.services.log('');
      context.services.log('📋 RECOMMENDED: Run with --auto-migrate:');
      context.services.log('   aqe init --auto-migrate');
      context.services.log('');

      return {
        v2Detected: true,
        v3Detected,
        freshInstall: false,
        v2Detection,
      };
    }

    return {
      v2Detected,
      v3Detected,
      freshInstall,
      v2Detection,
    };
  }

  /**
   * Detect existing v2 AQE installation
   */
  private async detectV2Installation(projectRoot: string): Promise<V2DetectionResult> {
    const memoryDbPath = join(projectRoot, '.agentic-qe', 'memory.db');
    const configPath = join(projectRoot, '.agentic-qe', 'config');
    const agentsPath = join(projectRoot, '.claude', 'agents');
    const v2ConfigFile = join(projectRoot, '.agentic-qe', 'config', 'learning.json');

    const hasMemoryDb = existsSync(memoryDbPath);
    const hasConfig = existsSync(configPath);
    const hasAgents = existsSync(agentsPath);

    // Check for v2-specific markers
    const hasV2ConfigFiles = existsSync(v2ConfigFile);
    const hasV3ConfigYaml = existsSync(join(projectRoot, '.agentic-qe', 'config.yaml'));

    // Try to read version from memory.db
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

    // Detected as v2 if:
    // 1. Has memory.db but no v3 version marker, OR
    // 2. Has v2 config files but no v3 config.yaml
    const detected = !isV3Installation && hasMemoryDb && (
      !version?.startsWith('3.') ||
      (hasV2ConfigFiles && !hasV3ConfigYaml)
    );

    return {
      detected,
      memoryDbPath: hasMemoryDb ? memoryDbPath : undefined,
      configPath: hasConfig ? configPath : undefined,
      agentsPath: hasAgents ? agentsPath : undefined,
      hasMemoryDb,
      hasConfig,
      hasAgents,
      version,
    };
  }

  /**
   * Read AQE version from memory.db
   */
  private readVersionFromDb(dbPath: string): string | undefined {
    try {
      const Database = require('better-sqlite3');
      const db = new Database(dbPath, { readonly: true, fileMustExist: true });

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

// Instance exported from index.ts
