/**
 * Init Wizard - V2 Migration Logic
 *
 * Contains V2 installation detection, migration, and config conversion.
 * Extracted from init-wizard.ts.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, unlinkSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { createRequire } from 'module';

import { getAQEVersion } from './types.js';
import { toErrorMessage } from '../shared/error-utils.js';
import { safeJsonParse } from '../shared/safe-json.js';

// Create require for CommonJS modules (better-sqlite3) in ESM context
const require = createRequire(import.meta.url);

// ============================================================================
// V2 Detection Types
// ============================================================================

/**
 * V2 Installation Detection Result
 */
export interface V2DetectionResult {
  detected: boolean;
  memoryDbPath?: string;
  configPath?: string;
  agentsPath?: string;
  hasMemoryDb: boolean;
  hasConfig: boolean;
  hasAgents: boolean;
  version?: string;
}

// ============================================================================
// V2 Detection
// ============================================================================

/**
 * Read AQE version directly from memory.db without full initialization.
 * Returns undefined if no version is stored (v2 installations).
 */
export function readVersionFromDb(dbPath: string): string | undefined {
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

/**
 * Write AQE version to memory.db in _system namespace.
 * This marks the installation as v3.
 */
export async function writeVersionToDb(projectRoot: string, version: string): Promise<boolean> {
  const memoryDbPath = join(projectRoot, '.agentic-qe', 'memory.db');

  try {
    const dir = dirname(memoryDbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const Database = require('better-sqlite3');
    const db = new Database(memoryDbPath);

    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS kv_store (
          key TEXT NOT NULL,
          namespace TEXT NOT NULL,
          value TEXT NOT NULL,
          expires_at INTEGER,
          created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
          PRIMARY KEY (namespace, key)
        );
      `);

      const now = Date.now();
      db.prepare(`
        INSERT OR REPLACE INTO kv_store (key, namespace, value, created_at)
        VALUES (?, '_system', ?, ?)
      `).run('aqe_version', JSON.stringify(version), now);

      db.prepare(`
        INSERT OR REPLACE INTO kv_store (key, namespace, value, created_at)
        VALUES (?, '_system', ?, ?)
      `).run('init_timestamp', JSON.stringify(new Date().toISOString()), now);

      db.close();
      console.log(`  ✓ Version ${version} written to memory.db`);
      return true;
    } catch (err) {
      db.close();
      console.warn(`  ⚠ Could not write version: ${toErrorMessage(err)}`);
      return false;
    }
  } catch (err) {
    console.warn(`  ⚠ Could not open memory.db: ${toErrorMessage(err)}`);
    return false;
  }
}

/**
 * Detect existing v2 AQE installation.
 *
 * Detection logic:
 * 1. If memory.db exists, try to read aqe_version from kv_store._system
 * 2. If version exists and starts with '3.', it's v3 - not detected
 * 3. If no version or version < 3.0.0, and v2 markers exist, it's v2
 */
export async function detectV2Installation(projectRoot: string): Promise<V2DetectionResult> {
  const memoryDbPath = join(projectRoot, '.agentic-qe', 'memory.db');
  const configPath = join(projectRoot, '.agentic-qe', 'config');
  const agentsPath = join(projectRoot, '.claude', 'agents');
  const v2ConfigFile = join(projectRoot, '.agentic-qe', 'config', 'learning.json');

  const hasMemoryDb = existsSync(memoryDbPath);
  const hasConfig = existsSync(configPath);
  const hasAgents = existsSync(agentsPath);

  const hasV2ConfigFiles = existsSync(v2ConfigFile);
  const hasV3ConfigYaml = existsSync(join(projectRoot, '.agentic-qe', 'config.yaml'));

  let version: string | undefined;
  let isV3Installation = false;

  if (hasMemoryDb) {
    version = readVersionFromDb(memoryDbPath);

    if (version) {
      isV3Installation = version.startsWith('3.');
    } else {
      version = '2.x.x';
    }
  }

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

// ============================================================================
// V2 Migration
// ============================================================================

/**
 * Run v2 to v3 migration during init (when --auto-migrate is used).
 */
export async function runV2Migration(projectRoot: string, v2Detection: V2DetectionResult): Promise<void> {
  try {
    const { V2ToV3Migrator } = await import('../learning/v2-to-v3-migration.js');

    if (v2Detection.memoryDbPath) {
      console.log('  Migrating V2 data to V3 format...');
      const v3PatternsDbPath = join(projectRoot, '.agentic-qe', 'memory.db');

      const migrator = new V2ToV3Migrator({
        v2DbPath: v2Detection.memoryDbPath,
        v3PatternsDbPath,
        onProgress: (progress) => {
          console.log(`    ${progress.stage}: ${progress.message}`);
        },
      });

      const result = await migrator.migrate();

      if (result.success) {
        console.log(`  ✓ Migrated ${result.tablesMigrated.length} tables:`);
        for (const [table, count] of Object.entries(result.counts)) {
          console.log(`    - ${table}: ${count} entries`);
        }
      } else {
        console.warn(`  ⚠ Migration completed with errors: ${result.errors.join(', ')}`);
      }
    }

    await migrateV2Config(projectRoot, v2Detection);
    await removeV2QEAgents(projectRoot);

    console.log('  Writing v3 version marker...');
    await writeVersionToDb(projectRoot, '3.0.0-migrated');

    console.log('✓ V2 to V3 migration completed\n');
  } catch (error) {
    console.warn(`⚠ Migration warning: ${toErrorMessage(error)}`);
    console.log('  Continuing with init (v2 data preserved)...\n');
  }
}

/**
 * Remove v2 QE agents from .claude/agents/ root folder.
 * V2 QE agents are replaced by v3 agents in .claude/agents/v3/.
 */
export async function removeV2QEAgents(projectRoot: string): Promise<void> {
  const agentsDir = join(projectRoot, '.claude', 'agents');

  if (!existsSync(agentsDir)) {
    return;
  }

  const V2_LEGACY_AGENTS = [
    'qx-partner.md',
    'base-template-generator.md',
  ];

  try {
    const entries = readdirSync(agentsDir);
    const v2QEAgents: string[] = [];

    for (const entry of entries) {
      if (entry.startsWith('qe-') && entry.endsWith('.md')) {
        const fullPath = join(agentsDir, entry);
        const stat = statSync(fullPath);
        if (stat.isFile()) {
          v2QEAgents.push(entry);
        }
      } else if (V2_LEGACY_AGENTS.includes(entry)) {
        const fullPath = join(agentsDir, entry);
        const stat = statSync(fullPath);
        if (stat.isFile()) {
          v2QEAgents.push(entry);
        }
      }
    }

    if (v2QEAgents.length === 0) {
      return;
    }

    console.log(`  Removing ${v2QEAgents.length} v2 QE agents from .claude/agents/...`);

    const backupDir = join(projectRoot, '.agentic-qe', 'backup', 'v2-agents');
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }

    for (const agent of v2QEAgents) {
      const sourcePath = join(agentsDir, agent);
      const backupPath = join(backupDir, agent);

      try {
        copyFileSync(sourcePath, backupPath);
        unlinkSync(sourcePath);
      } catch (err) {
        console.warn(`    ⚠ Could not remove ${agent}: ${toErrorMessage(err)}`);
      }
    }

    console.log(`  ✓ Moved ${v2QEAgents.length} v2 agents to .agentic-qe/backup/v2-agents/`);
    console.log('    V3 agents will be installed to .claude/agents/v3/');
  } catch (error) {
    console.warn(`  ⚠ Could not remove v2 agents: ${toErrorMessage(error)}`);
  }
}

/**
 * Migrate v2 config files to v3 format.
 */
export async function migrateV2Config(projectRoot: string, v2Detection: V2DetectionResult): Promise<void> {
  if (!v2Detection.hasConfig) return;

  const v2ConfigDir = join(projectRoot, '.agentic-qe', 'config');
  const v3ConfigPath = join(projectRoot, '.agentic-qe', 'config.yaml');

  if (existsSync(v3ConfigPath)) {
    console.log('  ✓ V3 config already exists, preserving...');
    return;
  }

  try {
    const learningConfig = readJsonSafe(join(v2ConfigDir, 'learning.json'));
    const improvementConfig = readJsonSafe(join(v2ConfigDir, 'improvement.json'));
    const codeIntelConfig = readJsonSafe(join(v2ConfigDir, 'code-intelligence.json'));

    const v3Config = {
      version: getAQEVersion(),
      migratedFrom: v2Detection.version || '2.x.x',
      migratedAt: new Date().toISOString(),
      project: {
        name: 'migrated-project',
        root: projectRoot,
        type: 'unknown',
      },
      learning: {
        enabled: learningConfig?.enabled ?? true,
        embeddingModel: 'transformer',
        hnswConfig: { M: 8, efConstruction: 100, efSearch: 50 },
        qualityThreshold: learningConfig?.qualityThreshold ?? 0.5,
        promotionThreshold: 2,
        pretrainedPatterns: true,
        v2Settings: learningConfig,
      },
      routing: {
        mode: 'ml',
        confidenceThreshold: 0.7,
        feedbackEnabled: true,
      },
      workers: {
        enabled: ['pattern-consolidator'],
        intervals: {
          'pattern-consolidator': 1800000,
          'coverage-gap-scanner': 3600000,
          'flaky-test-detector': 7200000,
        },
        maxConcurrent: 2,
        daemonAutoStart: true,
      },
      hooks: {
        claudeCode: true,
        preCommit: false,
        ciIntegration: codeIntelConfig?.ciIntegration ?? false,
      },
      skills: {
        install: true,
        installV2: true,
        installV3: true,
        overwrite: false,
      },
      domains: {
        enabled: [
          'test-generation', 'test-execution', 'coverage-analysis',
          'quality-assessment', 'defect-intelligence', 'requirements-validation',
          'code-intelligence', 'security-compliance', 'contract-testing',
          'visual-accessibility', 'chaos-resilience', 'learning-optimization',
        ],
        disabled: [],
      },
      agents: {
        maxConcurrent: 5,
        defaultTimeout: 60000,
      },
      _v2Backup: {
        learning: learningConfig,
        improvement: improvementConfig,
        codeIntelligence: codeIntelConfig,
      },
    };

    const yaml = await import('yaml');
    const yamlContent = `# Agentic QE v3 Configuration
# Migrated from v2 on ${new Date().toISOString()}
# Original v2 settings preserved in _v2Backup section

${yaml.stringify(v3Config)}`;

    writeFileSync(v3ConfigPath, yamlContent, 'utf-8');
    console.log('  ✓ V2 config migrated to v3 format');
  } catch (error) {
    console.warn(`  ⚠ Config migration warning: ${toErrorMessage(error)}`);
  }
}

/**
 * Safely read JSON file, returning null on error.
 */
function readJsonSafe(filePath: string): Record<string, unknown> | null {
  try {
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, 'utf-8');
    return safeJsonParse<Record<string, unknown>>(content);
  } catch {
    return null;
  }
}
