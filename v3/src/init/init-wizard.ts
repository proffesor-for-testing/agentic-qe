/**
 * Init Wizard
 * ADR-025: Enhanced Init with Self-Configuration
 *
 * Interactive wizard for AQE initialization with visual feedback.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, unlinkSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { createRequire } from 'module';

// Create require for CommonJS modules (better-sqlite3) in ESM context
const require = createRequire(import.meta.url);
import type {
  ProjectAnalysis,
  AQEInitConfig,
  InitResult,
  InitStepResult,
  WizardStep,
  WizardState,
  PretrainedLibrary,
} from './types.js';
import { createDefaultConfig, DEFAULT_SKILLS_CONFIG } from './types.js';
import { ProjectAnalyzer, createProjectAnalyzer } from './project-analyzer.js';
import { SelfConfigurator, createSelfConfigurator } from './self-configurator.js';
import { SkillsInstaller, createSkillsInstaller, type SkillsInstallResult } from './skills-installer.js';
import { AgentsInstaller, createAgentsInstaller, type AgentsInstallResult } from './agents-installer.js';
import { N8nInstaller, createN8nInstaller, type N8nInstallResult } from './n8n-installer.js';

// ============================================================================
// Internal Types
// ============================================================================

/**
 * Worker registration entry for daemon registry
 */
interface WorkerRegistration {
  name: string;
  enabled: boolean;
  interval: number;
  lastRun: string | null;
  status: 'pending' | 'running' | 'completed' | 'error';
}

// ============================================================================
// Wizard Step Definitions
// ============================================================================

const WIZARD_STEPS: WizardStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to AQE v3',
    description: 'This wizard will configure Agentic QE for your project.',
    type: 'info',
  },
  {
    id: 'project-type',
    title: 'Project Type',
    description: 'What type of project is this?',
    type: 'choice',
    options: [
      { value: 'auto', label: 'Auto-detect', description: 'Let AQE analyze your project', recommended: true },
      { value: 'single', label: 'Single Package', description: 'Standard single-package project' },
      { value: 'monorepo', label: 'Monorepo', description: 'Multi-package workspace' },
      { value: 'library', label: 'Library', description: 'Publishable package/library' },
    ],
    default: 'auto',
  },
  {
    id: 'learning-mode',
    title: 'Learning System',
    description: 'How should AQE learn from your project?',
    type: 'choice',
    options: [
      { value: 'full', label: 'Full Learning', description: 'Transformer embeddings + SQLite persistence', recommended: true },
      { value: 'basic', label: 'Basic Learning', description: 'Hash-based embeddings, in-memory' },
      { value: 'disabled', label: 'Disabled', description: 'No pattern learning' },
    ],
    default: 'full',
  },
  {
    id: 'load-patterns',
    title: 'Pre-trained Patterns',
    description: 'Load pre-trained QE patterns for faster results?',
    type: 'confirm',
    default: true,
  },
  {
    id: 'hooks',
    title: 'Claude Code Integration',
    description: 'Enable Claude Code hooks for seamless integration?',
    type: 'confirm',
    default: true,
  },
  {
    id: 'workers',
    title: 'Background Workers',
    description: 'Start background workers for continuous monitoring?',
    type: 'confirm',
    default: true,
  },
  {
    id: 'skills',
    title: 'Install Skills',
    description: 'Install AQE skills (v2 methodology + v3 domain skills)?',
    type: 'confirm',
    default: true,
  },
  {
    id: 'agents',
    title: 'Install Agents',
    description: 'Install V3 QE agents for Claude Code Task tool?',
    type: 'confirm',
    default: true,
  },
];

// ============================================================================
// Init Orchestrator
// ============================================================================

export interface InitOrchestratorOptions {
  /** Project root directory */
  projectRoot: string;
  /** Skip wizard and use auto-configuration */
  autoMode?: boolean;
  /** Skip pattern loading */
  skipPatterns?: boolean;
  /** Minimal configuration */
  minimal?: boolean;
  /** Pre-trained patterns library */
  pretrainedLibrary?: PretrainedLibrary;
  /** Custom wizard answers */
  wizardAnswers?: Record<string, unknown>;
  /** Install n8n workflow testing agents and skills */
  withN8n?: boolean;
  /** N8n API configuration */
  n8nApiConfig?: {
    baseUrl?: string;
    apiKey?: string;
  };
  /** Automatically migrate from v2 if detected */
  autoMigrate?: boolean;
}

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

export class InitOrchestrator {
  private projectRoot: string;
  private options: InitOrchestratorOptions;
  private analyzer: ProjectAnalyzer;
  private configurator: SelfConfigurator;
  private steps: InitStepResult[] = [];

  constructor(options: InitOrchestratorOptions) {
    this.options = options;
    this.projectRoot = options.projectRoot;
    this.analyzer = createProjectAnalyzer(options.projectRoot);
    this.configurator = createSelfConfigurator({ minimal: options.minimal });
  }

  /**
   * Read AQE version directly from memory.db without full initialization
   * Returns undefined if no version is stored (v2 installations)
   */
  private readVersionFromDb(dbPath: string): string | undefined {
    try {
      // Use require (via createRequire) for synchronous loading of native module
      const Database = require('better-sqlite3');
      const db = new Database(dbPath, { readonly: true, fileMustExist: true });

      try {
        // Check if kv_store table exists
        const tableExists = db.prepare(`
          SELECT name FROM sqlite_master
          WHERE type='table' AND name='kv_store'
        `).get();

        if (!tableExists) {
          db.close();
          return undefined;
        }

        // Try to read aqe_version from _system namespace
        const row = db.prepare(`
          SELECT value FROM kv_store
          WHERE key = 'aqe_version' AND namespace = '_system'
        `).get() as { value: string } | undefined;

        db.close();

        if (row) {
          return JSON.parse(row.value) as string;
        }
        return undefined;
      } catch {
        db.close();
        return undefined;
      }
    } catch {
      // Database doesn't exist or can't be opened
      return undefined;
    }
  }

  /**
   * Write AQE version to memory.db in _system namespace
   * This marks the installation as v3
   */
  private async writeVersionToDb(version: string): Promise<boolean> {
    const memoryDbPath = join(this.projectRoot, '.agentic-qe', 'memory.db');

    try {
      // Ensure directory exists
      const dir = dirname(memoryDbPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // Use require (via createRequire) for synchronous loading of native module
      const Database = require('better-sqlite3');
      const db = new Database(memoryDbPath);

      try {
        // Ensure kv_store table exists (minimal schema for version storage)
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

        // Write version to _system namespace
        const now = Date.now();
        db.prepare(`
          INSERT OR REPLACE INTO kv_store (key, namespace, value, created_at)
          VALUES (?, '_system', ?, ?)
        `).run('aqe_version', JSON.stringify(version), now);

        // Also store init timestamp
        db.prepare(`
          INSERT OR REPLACE INTO kv_store (key, namespace, value, created_at)
          VALUES (?, '_system', ?, ?)
        `).run('init_timestamp', JSON.stringify(new Date().toISOString()), now);

        db.close();
        console.log(`  ✓ Version ${version} written to memory.db`);
        return true;
      } catch (err) {
        db.close();
        console.warn(`  ⚠ Could not write version: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
    } catch (err) {
      console.warn(`  ⚠ Could not open memory.db: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /**
   * Detect existing v2 AQE installation
   *
   * Detection logic:
   * 1. If memory.db exists, try to read aqe_version from kv_store._system
   * 2. If version exists and starts with '3.', it's v3 - not detected
   * 3. If no version or version < 3.0.0, and v2 markers exist, it's v2
   */
  async detectV2Installation(): Promise<V2DetectionResult> {
    const memoryDbPath = join(this.projectRoot, '.agentic-qe', 'memory.db');
    const configPath = join(this.projectRoot, '.agentic-qe', 'config');
    const agentsPath = join(this.projectRoot, '.claude', 'agents');
    const v2ConfigFile = join(this.projectRoot, '.agentic-qe', 'config', 'learning.json');

    const hasMemoryDb = existsSync(memoryDbPath);
    const hasConfig = existsSync(configPath);
    const hasAgents = existsSync(agentsPath);

    // Check for v2-specific markers (v3 uses config.yaml, v2 uses config/*.json)
    const hasV2ConfigFiles = existsSync(v2ConfigFile);
    const hasV3ConfigYaml = existsSync(join(this.projectRoot, '.agentic-qe', 'config.yaml'));

    // Try to read version from memory.db
    let version: string | undefined;
    let isV3Installation = false;

    if (hasMemoryDb) {
      version = this.readVersionFromDb(memoryDbPath);

      if (version) {
        // Check if it's a v3 installation (version starts with '3.')
        isV3Installation = version.startsWith('3.');
      } else {
        // No version stored - this is a v2 installation
        version = '2.x.x';
      }
    }

    // Detected as v2 if:
    // 1. Has memory.db but no v3 version marker, OR
    // 2. Has v2 config files but no v3 config.yaml
    // AND it's not already a v3 installation
    const detected = !isV3Installation && hasMemoryDb && (
      !version?.startsWith('3.') || // No v3 version in DB
      (hasV2ConfigFiles && !hasV3ConfigYaml) // v2 config files present
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
   * Run the full initialization process
   */
  async initialize(): Promise<InitResult> {
    const startTime = Date.now();

    try {
      // Step 0: Check for existing v2 installation
      const v2Detection = await this.detectV2Installation();

      if (v2Detection.detected) {
        console.log('\n' + '═'.repeat(60));
        console.log('⚠️  EXISTING V2 INSTALLATION DETECTED');
        console.log('═'.repeat(60) + '\n');
        console.log('Found v2 installation at:');
        if (v2Detection.hasMemoryDb) {
          console.log(`  • Memory DB: .agentic-qe/memory.db`);
        }
        if (v2Detection.hasConfig) {
          console.log(`  • Config: .agentic-qe/config/`);
        }
        if (v2Detection.hasAgents) {
          console.log(`  • Agents: .claude/agents/`);
        }
        console.log('');

        if (this.options.autoMigrate) {
          // Auto-migrate mode - proceed with migration integrated
          console.log('🔄 Auto-migrate mode enabled. Running migration...\n');
          await this.runV2Migration(v2Detection);
        } else {
          // Warn and suggest migration
          console.log('📋 RECOMMENDED: Run migration before init:\n');
          console.log('   npx aqe migrate status      # Check what needs migration');
          console.log('   npx aqe migrate run --dry-run  # Preview changes');
          console.log('   npx aqe migrate run         # Execute migration\n');
          console.log('Or continue with:');
          console.log('   aqe init --auto-migrate     # Auto-migrate during init\n');
          console.log('═'.repeat(60) + '\n');

          // Return early with migration-required status
          return {
            success: false,
            config: createDefaultConfig('unknown', this.projectRoot),
            steps: [{
              step: 'V2 Detection',
              status: 'error',
              message: 'Existing v2 installation detected. Run migration first.',
              durationMs: Date.now() - startTime,
            }],
            summary: {
              projectAnalyzed: false,
              configGenerated: false,
              codeIntelligenceIndexed: 0,
              patternsLoaded: 0,
              skillsInstalled: 0,
              agentsInstalled: 0,
              hooksConfigured: false,
              mcpConfigured: false,
              claudeMdGenerated: false,
              workersStarted: 0,
            },
            totalDurationMs: Date.now() - startTime,
            timestamp: new Date(),
            v2Detected: true,  // New field to indicate v2 was detected
          };
        }
      }

      // Step 1: Analyze project
      const analysis = await this.runStep('Project Analysis', async () => {
        return await this.analyzer.analyze();
      });

      // Step 2: Generate configuration
      const config = await this.runStep('Configuration Generation', async () => {
        if (this.options.autoMode) {
          return this.configurator.recommend(analysis);
        }
        return this.applyWizardAnswers(analysis);
      });

      // Step 3: Initialize persistence database (REQUIRED)
      await this.runStep('Persistence Database Setup', async () => {
        return await this.initializePersistenceDatabase();
      });

      // Step 3.5: Code Intelligence Pre-Scan (CI-003/CI-004 improvement)
      const codeIntelligenceResult = await this.runStep('Code Intelligence Pre-Scan', async () => {
        const hasIndex = await this.checkCodeIntelligenceIndex();

        if (!hasIndex) {
          // New project or no existing index - run full scan
          console.log('  Building knowledge graph for code intelligence...');
          return await this.runCodeIntelligenceScan(analysis.projectRoot);
        }

        // Existing index - use it
        const entryCount = await this.getKGEntryCount();
        console.log(`  Using existing code intelligence index (${entryCount} entries)`);
        return { status: 'existing', entries: entryCount };
      });

      // Step 4: Initialize learning system
      const patternsLoaded = await this.runStep('Learning System Setup', async () => {
        if (config.learning.enabled && !this.options.skipPatterns) {
          return await this.initializeLearningSystem(config);
        }
        return 0;
      });

      // Step 5: Configure hooks
      const hooksConfigured = await this.runStep('Hooks Configuration', async () => {
        if (config.hooks.claudeCode) {
          return await this.configureHooks(config);
        }
        return false;
      });

      // Step 6: Configure MCP server
      const mcpConfigured = await this.runStep('MCP Configuration', async () => {
        return await this.configureMCP();
      });

      // Step 7: Generate CLAUDE.md
      const claudeMdGenerated = await this.runStep('CLAUDE.md Generation', async () => {
        return await this.generateCLAUDEmd(config);
      });

      // Step 8: Start workers
      const workersStarted = await this.runStep('Background Workers', async () => {
        if (config.workers.daemonAutoStart) {
          return await this.startWorkers(config);
        }
        return 0;
      });

      // Step 9: Install skills
      const skillsInstalled = await this.runStep('Skills Installation', async () => {
        if (config.skills.install) {
          return await this.installSkills(config);
        }
        return 0;
      });

      // Step 10: Install agents
      const agentsInstalled = await this.runStep('Agents Installation', async () => {
        return await this.installAgents();
      });

      // Step 11: Install n8n platform (optional)
      let n8nInstalled: { agents: number; skills: number } | undefined;
      if (this.options.withN8n) {
        const n8nResult = await this.runStep('N8n Platform Installation', async () => {
          return await this.installN8n(config);
        });
        if (n8nResult) {
          n8nInstalled = n8nResult;
        }
      }

      // Step 12: Write configuration file
      await this.runStep('Save Configuration', async () => {
        return await this.saveConfig(config);
      });

      // Step 13: Write version marker to memory.db
      await this.runStep('Version Marker', async () => {
        return await this.writeVersionToDb(config.version);
      });

      return {
        success: true,
        config,
        steps: this.steps,
        summary: {
          projectAnalyzed: true,
          configGenerated: true,
          codeIntelligenceIndexed: codeIntelligenceResult?.entries ?? 0,
          patternsLoaded,
          skillsInstalled,
          agentsInstalled,
          hooksConfigured,
          mcpConfigured,
          claudeMdGenerated,
          workersStarted,
          n8nInstalled,
        },
        totalDurationMs: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      // Add error step
      this.steps.push({
        step: 'Initialization Failed',
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
        durationMs: 0,
      });

      return {
        success: false,
        config: createDefaultConfig('unknown', this.projectRoot),
        steps: this.steps,
        summary: {
          projectAnalyzed: false,
          configGenerated: false,
          codeIntelligenceIndexed: 0,
          patternsLoaded: 0,
          skillsInstalled: 0,
          agentsInstalled: 0,
          hooksConfigured: false,
          mcpConfigured: false,
          claudeMdGenerated: false,
          workersStarted: 0,
        },
        totalDurationMs: Date.now() - startTime,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Get wizard steps
   */
  getWizardSteps(): WizardStep[] {
    return WIZARD_STEPS;
  }

  /**
   * Run v2 to v3 migration during init (when --auto-migrate is used)
   */
  private async runV2Migration(v2Detection: V2DetectionResult): Promise<void> {
    try {
      // Import migration module dynamically to avoid circular deps
      const { V2ToV3Migrator } = await import('../learning/v2-to-v3-migration.js');

      // Step 1: Run the actual data migration (patterns, experiences, concept graph)
      if (v2Detection.memoryDbPath) {
        console.log('  Migrating V2 data to V3 format...');
        const v3PatternsDbPath = join(this.projectRoot, '.agentic-qe', 'qe-patterns.db');

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

      // Step 2: Migrate config files (v2 JSON → v3 YAML)
      await this.migrateV2Config(v2Detection);

      // Step 3: Remove v2 QE agents (they will be replaced by v3 agents)
      await this.removeV2QEAgents();

      // Step 4: Write version marker IMMEDIATELY to prevent re-detection
      // This is critical - if we don't do this, subsequent init calls will re-ask for migration
      console.log('  Writing v3 version marker...');
      await this.writeVersionToDb('3.0.0-migrated');

      console.log('✓ V2 to V3 migration completed\n');
    } catch (error) {
      console.warn(`⚠ Migration warning: ${error instanceof Error ? error.message : String(error)}`);
      console.log('  Continuing with init (v2 data preserved)...\n');
    }
  }

  /**
   * Remove v2 QE agents from .claude/agents/ root folder
   * V2 QE agents are replaced by v3 agents in .claude/agents/v3/
   * Only removes qe-* files, preserves other agents
   */
  private async removeV2QEAgents(): Promise<void> {
    const agentsDir = join(this.projectRoot, '.claude', 'agents');

    if (!existsSync(agentsDir)) {
      return;
    }

    try {
      const entries = readdirSync(agentsDir);
      const v2QEAgents: string[] = [];

      for (const entry of entries) {
        // Only remove qe-* agent files (not directories, not other agents)
        if (entry.startsWith('qe-') && entry.endsWith('.md')) {
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

      // Create backup directory
      const backupDir = join(this.projectRoot, '.agentic-qe', 'backup', 'v2-agents');
      if (!existsSync(backupDir)) {
        mkdirSync(backupDir, { recursive: true });
      }

      // Move v2 agents to backup (don't delete, just move)
      const { renameSync } = await import('fs');
      for (const agent of v2QEAgents) {
        const sourcePath = join(agentsDir, agent);
        const backupPath = join(backupDir, agent);

        try {
          // Copy to backup first
          copyFileSync(sourcePath, backupPath);
          // Then remove original
          unlinkSync(sourcePath);
        } catch (err) {
          console.warn(`    ⚠ Could not remove ${agent}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      console.log(`  ✓ Moved ${v2QEAgents.length} v2 agents to .agentic-qe/backup/v2-agents/`);
      console.log('    V3 agents will be installed to .claude/agents/v3/');
    } catch (error) {
      console.warn(`  ⚠ Could not remove v2 agents: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Migrate v2 config files to v3 format
   */
  private async migrateV2Config(v2Detection: V2DetectionResult): Promise<void> {
    if (!v2Detection.hasConfig) return;

    const v2ConfigDir = join(this.projectRoot, '.agentic-qe', 'config');
    const v3ConfigPath = join(this.projectRoot, '.agentic-qe', 'config.yaml');

    // Skip if v3 config already exists
    if (existsSync(v3ConfigPath)) {
      console.log('  ✓ V3 config already exists, preserving...');
      return;
    }

    try {
      // Read v2 config files
      const learningConfig = this.readJsonSafe(join(v2ConfigDir, 'learning.json'));
      const improvementConfig = this.readJsonSafe(join(v2ConfigDir, 'improvement.json'));
      const codeIntelConfig = this.readJsonSafe(join(v2ConfigDir, 'code-intelligence.json'));

      // Convert to v3 format
      const v3Config = {
        version: '3.0.0',
        migratedFrom: v2Detection.version || '2.x.x',
        migratedAt: new Date().toISOString(),
        project: {
          name: 'migrated-project',
          root: this.projectRoot,
          type: 'unknown',
        },
        learning: {
          enabled: learningConfig?.enabled ?? true,
          embeddingModel: 'transformer',
          hnswConfig: {
            M: 8,
            efConstruction: 100,
            efSearch: 50,
          },
          qualityThreshold: learningConfig?.qualityThreshold ?? 0.5,
          promotionThreshold: 2,
          pretrainedPatterns: true,
          // Preserve v2 learning settings
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
          enabled: ['test-generation', 'coverage-analysis', 'learning-optimization'],
          disabled: [],
        },
        agents: {
          maxConcurrent: 5,
          defaultTimeout: 60000,
        },
        // Preserve original v2 configs for reference
        _v2Backup: {
          learning: learningConfig,
          improvement: improvementConfig,
          codeIntelligence: codeIntelConfig,
        },
      };

      // Write v3 config as YAML
      const yaml = await import('yaml');
      const yamlContent = `# Agentic QE v3 Configuration
# Migrated from v2 on ${new Date().toISOString()}
# Original v2 settings preserved in _v2Backup section

${yaml.stringify(v3Config)}`;

      writeFileSync(v3ConfigPath, yamlContent, 'utf-8');
      console.log('  ✓ V2 config migrated to v3 format');
    } catch (error) {
      console.warn(`  ⚠ Config migration warning: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Safely read JSON file, returning null on error
   */
  private readJsonSafe(filePath: string): Record<string, unknown> | null {
    try {
      if (!existsSync(filePath)) return null;
      const content = readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Run a single initialization step with timing and status tracking
   */
  private async runStep<T>(
    stepName: string,
    action: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    try {
      const result = await action();
      this.steps.push({
        step: stepName,
        status: 'success',
        message: `${stepName} completed successfully`,
        durationMs: Date.now() - startTime,
      });
      return result;
    } catch (error) {
      this.steps.push({
        step: stepName,
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * Apply wizard answers to generate config
   */
  private applyWizardAnswers(analysis: ProjectAnalysis): AQEInitConfig {
    const answers = this.options.wizardAnswers || {};
    const config = this.configurator.recommend(analysis);

    // Apply project type override
    if (answers['project-type'] && answers['project-type'] !== 'auto') {
      config.project.type = answers['project-type'] as 'single' | 'monorepo' | 'library';
    }

    // Apply learning mode
    switch (answers['learning-mode']) {
      case 'full':
        config.learning.enabled = true;
        config.learning.embeddingModel = 'transformer';
        break;
      case 'basic':
        config.learning.enabled = true;
        config.learning.embeddingModel = 'hash';
        break;
      case 'disabled':
        config.learning.enabled = false;
        break;
    }

    // Apply pattern loading preference
    if (answers['load-patterns'] === false) {
      config.learning.pretrainedPatterns = false;
    }

    // Apply hooks preference
    if (answers['hooks'] === false) {
      config.hooks.claudeCode = false;
    }

    // Apply workers preference
    if (answers['workers'] === false) {
      config.workers.daemonAutoStart = false;
    }

    // Apply skills preference
    if (answers['skills'] === false) {
      config.skills.install = false;
    }

    return config;
  }

  /**
   * Check if code intelligence index exists
   * Uses memory backend to check code-intelligence:kg namespace
   */
  private async checkCodeIntelligenceIndex(): Promise<boolean> {
    // Load existing memory database if it exists
    const dbPath = join(this.projectRoot, '.agentic-qe', 'memory.db');
    if (!existsSync(dbPath)) {
      return false;
    }

    // Check for entries in code-intelligence:kg namespace
    try {
      const Database = (await import('better-sqlite3')).default;
      const db = new Database(dbPath);
      const result = db.prepare(`
        SELECT COUNT(*) as count FROM kv_store
        WHERE namespace = 'code-intelligence:kg'
      `).get() as { count: number };
      db.close();
      return result.count > 0;
    } catch {
      return false;
    }
  }

  /**
   * Run code intelligence scan
   * Indexes all source files into the knowledge graph
   */
  private async runCodeIntelligenceScan(projectPath: string): Promise<{ status: string; entries: number }> {
    try {
      // Import knowledge graph service
      const { KnowledgeGraphService } = await import('../domains/code-intelligence/services/knowledge-graph.js');
      const { InMemoryBackend } = await import('../kernel/memory-backend.js');

      // Create temporary memory backend for indexing
      const memory = new InMemoryBackend();
      await memory.initialize();

      const kgService = new KnowledgeGraphService(memory, {
        namespace: 'code-intelligence:kg',
        enableVectorEmbeddings: true,
      });

      // Find all source files
      const glob = await import('fast-glob');
      const files = await glob.default([
        '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.py'
      ], {
        cwd: projectPath,
        ignore: ['node_modules/**', 'dist/**', 'coverage/**', '.agentic-qe/**'],
      });

      // Index files
      const result = await kgService.index({
        paths: files.map(f => join(projectPath, f)),
        incremental: false,
        includeTests: true,
      });

      // Clean up
      kgService.destroy();

      if (result.success) {
        return {
          status: 'indexed',
          entries: result.value.nodesCreated + result.value.edgesCreated
        };
      }

      return { status: 'error', entries: 0 };
    } catch (error) {
      // Log error but don't fail initialization
      console.warn('Code intelligence scan warning:', error instanceof Error ? error.message : String(error));
      return { status: 'skipped', entries: 0 };
    }
  }

  /**
   * Get count of KG entries from existing database
   */
  private async getKGEntryCount(): Promise<number> {
    const dbPath = join(this.projectRoot, '.agentic-qe', 'memory.db');
    try {
      const Database = (await import('better-sqlite3')).default;
      const db = new Database(dbPath);
      const result = db.prepare(`
        SELECT COUNT(*) as count FROM kv_store
        WHERE namespace LIKE 'code-intelligence:kg%'
      `).get() as { count: number };
      db.close();
      return result.count;
    } catch {
      return 0;
    }
  }

  /**
   * Initialize the persistence database (REQUIRED)
   * Creates the SQLite database file with proper schema
   * This MUST succeed or initialization fails - no fallbacks
   */
  private async initializePersistenceDatabase(): Promise<boolean> {
    // Check that better-sqlite3 is available (use dynamic import for ESM/test compatibility)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let Database: any = null;
    try {
      // Use dynamic import for proper mocking in tests
      const mod = await import('better-sqlite3');
      Database = mod.default;
    } catch (error) {
      throw new Error(
        'SQLite persistence REQUIRED but better-sqlite3 is not installed.\n' +
        'Install it with: npm install better-sqlite3\n' +
        'If you see native compilation errors, ensure build tools are installed:\n' +
        '  - macOS: xcode-select --install\n' +
        '  - Ubuntu/Debian: sudo apt-get install build-essential python3\n' +
        '  - Alpine: apk add build-base python3'
      );
    }

    // Create .agentic-qe directory
    const dataDir = join(this.projectRoot, '.agentic-qe');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    // Create database file
    const dbPath = join(dataDir, 'memory.db');

    try {
      const db = new Database!(dbPath);

      // Configure for performance
      db.pragma('journal_mode = WAL');
      db.pragma('busy_timeout = 5000');

      // Create the kv_store table schema
      db.exec(`
        CREATE TABLE IF NOT EXISTS kv_store (
          key TEXT NOT NULL,
          namespace TEXT NOT NULL,
          value TEXT NOT NULL,
          expires_at INTEGER,
          created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
          PRIMARY KEY (namespace, key)
        );
        CREATE INDEX IF NOT EXISTS idx_kv_namespace ON kv_store(namespace);
        CREATE INDEX IF NOT EXISTS idx_kv_expires ON kv_store(expires_at) WHERE expires_at IS NOT NULL;
      `);

      // Verify the table exists
      const tableCheck = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='kv_store'
      `).get();

      if (!tableCheck) {
        throw new Error('Failed to create kv_store table');
      }

      // Write a test entry to verify write access
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO kv_store (key, namespace, value)
        VALUES (?, ?, ?)
      `);
      stmt.run('_init_test', '_system', JSON.stringify({ initialized: new Date().toISOString() }));

      db.close();

      console.log(`✓ SQLite persistence initialized: ${dbPath}`);
      return true;
    } catch (error) {
      throw new Error(
        `SQLite persistence initialization FAILED: ${error}\n` +
        `Database path: ${dbPath}\n` +
        'Ensure the directory is writable and has sufficient disk space.'
      );
    }
  }

  /**
   * Initialize the learning system
   * Creates database, initializes HNSW index, loads pre-trained patterns
   */
  private async initializeLearningSystem(config: AQEInitConfig): Promise<number> {
    if (!config.learning.enabled) {
      return 0;
    }

    // Create data directory for learning system
    const dataDir = join(this.projectRoot, '.agentic-qe', 'data');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    // Create HNSW index directory
    const hnswDir = join(dataDir, 'hnsw');
    if (!existsSync(hnswDir)) {
      mkdirSync(hnswDir, { recursive: true });
    }

    // Write learning system config for runtime use
    const learningConfigPath = join(dataDir, 'learning-config.json');
    const learningConfig = {
      embeddingModel: config.learning.embeddingModel,
      hnswConfig: config.learning.hnswConfig,
      qualityThreshold: config.learning.qualityThreshold,
      promotionThreshold: config.learning.promotionThreshold,
      databasePath: join(dataDir, 'qe-patterns.db'),
      hnswIndexPath: join(hnswDir, 'index.bin'),
      initialized: new Date().toISOString(),
    };
    writeFileSync(learningConfigPath, JSON.stringify(learningConfig, null, 2), 'utf-8');

    // Load pre-trained patterns if available
    let patternsLoaded = 0;

    if (config.learning.pretrainedPatterns && this.options.pretrainedLibrary) {
      const library = this.options.pretrainedLibrary;

      // Group patterns by domain for organization
      const patternsByDomain = new Map<string, typeof library.patterns>();
      for (const pattern of library.patterns) {
        const domain = pattern.domain || 'general';
        if (!patternsByDomain.has(domain)) {
          patternsByDomain.set(domain, []);
        }
        patternsByDomain.get(domain)!.push(pattern);
      }

      // Write patterns index for lazy loading
      const patternsIndexPath = join(dataDir, 'pretrained-index.json');
      const patternsIndex = {
        version: library.version,
        totalPatterns: library.statistics.totalPatterns,
        domains: Array.from(patternsByDomain.entries()).map(([domain, patterns]) => ({
          name: domain,
          patternCount: patterns.length,
        })),
        loadedAt: new Date().toISOString(),
      };
      writeFileSync(patternsIndexPath, JSON.stringify(patternsIndex, null, 2), 'utf-8');

      // Write actual patterns for each domain
      for (const [domain, patterns] of patternsByDomain) {
        const domainDir = join(dataDir, 'patterns', domain);
        if (!existsSync(domainDir)) {
          mkdirSync(domainDir, { recursive: true });
        }

        // Write patterns file
        const patternsPath = join(domainDir, 'patterns.json');
        writeFileSync(patternsPath, JSON.stringify(patterns, null, 2), 'utf-8');
        patternsLoaded += patterns.length;
      }

      return patternsLoaded;
    }

    // Even without pre-trained patterns, we've initialized the learning system structure
    return 0;
  }

  /**
   * Configure Claude Code hooks
   * Creates or updates .claude/settings.json with AQE hooks
   * Uses Claude Code's actual environment variables ($TOOL_INPUT_*, $TOOL_SUCCESS, etc.)
   */
  private async configureHooks(config: AQEInitConfig): Promise<boolean> {
    if (!config.hooks.claudeCode) {
      return false;
    }

    // Create .claude directory
    const claudeDir = join(this.projectRoot, '.claude');
    if (!existsSync(claudeDir)) {
      mkdirSync(claudeDir, { recursive: true });
    }

    // Load existing settings or create new
    const settingsPath = join(claudeDir, 'settings.json');
    let settings: Record<string, unknown> = {};

    if (existsSync(settingsPath)) {
      try {
        const content = readFileSync(settingsPath, 'utf-8');
        settings = JSON.parse(content);
      } catch {
        // If parse fails, start fresh
        settings = {};
      }
    }

    // Configure hooks with Claude Code's actual environment variables
    const hooks: Record<string, unknown> = {
      // Pre-tool hooks for learning
      PreToolUse: [
        {
          matcher: '^(Write|Edit|MultiEdit)$',
          hooks: [
            {
              type: 'command',
              command: '[ -n "$TOOL_INPUT_file_path" ] && npx agentic-qe hooks pre-edit --file "$TOOL_INPUT_file_path" 2>/dev/null || true',
              timeout: 5000,
              continueOnError: true,
            },
          ],
        },
        {
          matcher: '^Bash$',
          hooks: [
            {
              type: 'command',
              command: '[ -n "$TOOL_INPUT_command" ] && npx agentic-qe hooks pre-command --command "$TOOL_INPUT_command" 2>/dev/null || true',
              timeout: 5000,
              continueOnError: true,
            },
          ],
        },
        {
          matcher: '^Task$',
          hooks: [
            {
              type: 'command',
              command: '[ -n "$TOOL_INPUT_prompt" ] && npx agentic-qe hooks pre-task --task-id "task-$(date +%s)" --description "$TOOL_INPUT_prompt" 2>/dev/null || true',
              timeout: 5000,
              continueOnError: true,
            },
          ],
        },
      ],

      // Post-tool hooks for learning
      PostToolUse: [
        {
          matcher: '^(Write|Edit|MultiEdit)$',
          hooks: [
            {
              type: 'command',
              command: '[ -n "$TOOL_INPUT_file_path" ] && npx agentic-qe hooks post-edit --file "$TOOL_INPUT_file_path" --success "${TOOL_SUCCESS:-true}" 2>/dev/null || true',
              timeout: 5000,
              continueOnError: true,
            },
          ],
        },
        {
          matcher: '^Bash$',
          hooks: [
            {
              type: 'command',
              command: '[ -n "$TOOL_INPUT_command" ] && npx agentic-qe hooks post-command --command "$TOOL_INPUT_command" --success "${TOOL_SUCCESS:-true}" 2>/dev/null || true',
              timeout: 5000,
              continueOnError: true,
            },
          ],
        },
        {
          matcher: '^Task$',
          hooks: [
            {
              type: 'command',
              command: '[ -n "$TOOL_RESULT_agent_id" ] && npx agentic-qe hooks post-task --task-id "$TOOL_RESULT_agent_id" --success "${TOOL_SUCCESS:-true}" 2>/dev/null || true',
              timeout: 5000,
              continueOnError: true,
            },
          ],
        },
      ],

      // User prompt routing hook
      UserPromptSubmit: [
        {
          hooks: [
            {
              type: 'command',
              command: '[ -n "$PROMPT" ] && npx agentic-qe hooks route --task "$PROMPT" 2>/dev/null || true',
              timeout: 5000,
              continueOnError: true,
            },
          ],
        },
      ],

      // Session hooks
      SessionStart: [
        {
          hooks: [
            {
              type: 'command',
              command: '[ -n "$SESSION_ID" ] && npx agentic-qe hooks session-start --session-id "$SESSION_ID" 2>/dev/null || true',
              timeout: 10000,
              continueOnError: true,
            },
          ],
        },
      ],

      Stop: [
        {
          hooks: [
            {
              type: 'command',
              command: 'npx agentic-qe hooks session-end --save-state 2>/dev/null || true',
              timeout: 5000,
              continueOnError: true,
            },
          ],
        },
      ],
    };

    // Merge with existing settings (preserve existing hooks, add AQE hooks)
    const existingHooks = settings.hooks as Record<string, unknown[]> || {};
    const mergedHooks: Record<string, unknown[]> = {};

    // For each hook type, merge arrays
    for (const [hookType, hookArray] of Object.entries(hooks)) {
      const existing = existingHooks[hookType] || [];
      // Add AQE hooks after existing ones
      mergedHooks[hookType] = [...existing, ...(hookArray as unknown[])];
    }

    // Preserve any hooks not in our list
    for (const [hookType, hookArray] of Object.entries(existingHooks)) {
      if (!mergedHooks[hookType]) {
        mergedHooks[hookType] = hookArray;
      }
    }

    settings.hooks = mergedHooks;

    // Add AQE environment variables
    const existingEnv = settings.env as Record<string, string> || {};
    settings.env = {
      ...existingEnv,
      AQE_MEMORY_PATH: '.agentic-qe/memory.db',
      AQE_V3_MODE: 'true',
      AQE_LEARNING_ENABLED: config.learning.enabled ? 'true' : 'false',
    };

    // Add AQE metadata
    settings.aqe = {
      version: config.version,
      initialized: new Date().toISOString(),
      hooksConfigured: true,
    };

    // Add MCP server enablement
    const existingMcp = settings.enabledMcpjsonServers as string[] || [];
    if (!existingMcp.includes('aqe')) {
      settings.enabledMcpjsonServers = [...existingMcp, 'aqe'];
    }

    // Write settings
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

    return true;
  }

  /**
   * Configure MCP server
   * Creates .claude/mcp.json with AQE v3 MCP server configuration
   */
  private async configureMCP(): Promise<boolean> {
    // Create .claude directory if it doesn't exist
    const claudeDir = join(this.projectRoot, '.claude');
    if (!existsSync(claudeDir)) {
      mkdirSync(claudeDir, { recursive: true });
    }

    // Load existing MCP config or create new
    const mcpPath = join(claudeDir, 'mcp.json');
    let mcpConfig: Record<string, unknown> = {};

    if (existsSync(mcpPath)) {
      try {
        const content = readFileSync(mcpPath, 'utf-8');
        mcpConfig = JSON.parse(content);
      } catch {
        mcpConfig = {};
      }
    }

    // Ensure mcpServers object exists
    if (!mcpConfig.mcpServers) {
      mcpConfig.mcpServers = {};
    }

    // Add AQE MCP server configuration
    // Uses the globally installed aqe-mcp binary (npm install -g @agentic-qe/v3)
    const servers = mcpConfig.mcpServers as Record<string, unknown>;
    servers['aqe'] = {
      command: 'aqe-mcp',
      args: [],
      env: {
        AQE_PROJECT_ROOT: this.projectRoot,
        NODE_ENV: 'production',
      },
    };

    // Write MCP config
    writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2), 'utf-8');

    return true;
  }

  /**
   * Generate CLAUDE.md for the project
   * Creates a comprehensive guide for Claude Code with V3-specific instructions
   * If CLAUDE.md exists, creates backup and appends AQE v3 section
   */
  private async generateCLAUDEmd(config: AQEInitConfig): Promise<boolean> {
    const claudeMdPath = join(this.projectRoot, 'CLAUDE.md');

    // Generate CLAUDE.md content with V3-specific instructions
    const content = this.generateCLAUDEmdContent(config);

    // Check if CLAUDE.md already exists
    if (existsSync(claudeMdPath)) {
      const existing = readFileSync(claudeMdPath, 'utf-8');

      // Check if AQE section already exists
      if (existing.includes('## Agentic QE v3')) {
        // Already has AQE section, don't duplicate
        return true;
      }

      // Create backup before modifying
      const backupPath = join(this.projectRoot, 'CLAUDE.md.backup');
      writeFileSync(backupPath, existing, 'utf-8');

      // Append AQE section to existing CLAUDE.md
      writeFileSync(claudeMdPath, existing + '\n\n' + content, 'utf-8');
    } else {
      // Create new CLAUDE.md
      writeFileSync(claudeMdPath, content, 'utf-8');
    }

    return true;
  }

  /**
   * Generate CLAUDE.md content
   * Comprehensive AQE instructions for Claude Code integration
   */
  private generateCLAUDEmdContent(config: AQEInitConfig): string {
    const enabledDomains = config.domains.enabled.slice(0, 6).join(', ');
    const moreDomainsCount = Math.max(0, config.domains.enabled.length - 6);

    return `## Agentic QE v3

This project uses **Agentic QE v3** - a Domain-Driven Quality Engineering platform with 12 bounded contexts, ReasoningBank learning, and HNSW vector search.

---

## 🐝 AQE FLEET ORCHESTRATION

### Fleet Initialization

**For QE-specific tasks, initialize the AQE fleet:**

\`\`\`javascript
// Initialize AQE Fleet with MCP tool
mcp__agentic-qe__mcp__agentic_qe__fleet_init({
  config: {
    topology: "hierarchical",  // Queen-led for QE coordination
    maxAgents: 15,
    testingFocus: ["unit", "integration", "e2e", "performance"],
    frameworks: ["vitest", "jest", "playwright"],
    environments: ["node", "browser"]
  },
  projectContext: {
    language: "typescript",
    buildSystem: "npm"
  }
})
\`\`\`

### 12 DDD Domains → Agent Mapping

| Domain | Primary Agents | Focus Area |
|--------|---------------|------------|
| \`test-generation\` | qe-test-architect, qe-tdd-specialist | AI-powered test creation |
| \`test-execution\` | qe-parallel-executor, qe-flaky-hunter, qe-retry-handler | Parallel execution, flaky detection |
| \`coverage-analysis\` | qe-coverage-specialist, qe-gap-detector | O(log n) sublinear coverage |
| \`quality-assessment\` | qe-quality-gate, qe-deployment-advisor | Quality gates, risk scoring |
| \`defect-intelligence\` | qe-defect-predictor, qe-root-cause-analyzer | ML-powered defect prediction |
| \`learning-optimization\` | qe-learning-coordinator, qe-pattern-learner | Cross-domain pattern learning |
| \`requirements-validation\` | qe-tdd-specialist, qe-property-tester | BDD scenarios, property tests |
| \`code-intelligence\` | qe-knowledge-manager, code-analyzer | Knowledge graphs, 80% token reduction |
| \`security-compliance\` | qe-security-scanner, qe-security-auditor | OWASP, CVE detection |
| \`contract-testing\` | qe-contract-validator, qe-api-tester | Pact, schema validation |
| \`visual-accessibility\` | qe-visual-tester, qe-a11y-validator | Visual regression, WCAG |
| \`chaos-resilience\` | qe-chaos-engineer, qe-performance-tester | Fault injection, load testing |

### Fleet MCP Tools

\`\`\`javascript
// Spawn specialized QE agent
mcp__agentic-qe__mcp__agentic_qe__agent_spawn({
  spec: {
    type: "test-generator",  // or: coverage-analyzer, quality-gate, performance-tester, security-scanner, chaos-engineer, visual-tester
    capabilities: ["unit-tests", "integration-tests"],
    name: "test-gen-1"
  },
  fleetId: "fleet-123"  // From fleet_init
})

// AI-enhanced test generation
mcp__agentic-qe__mcp__agentic_qe__test_generate_enhanced({
  sourceCode: "...",
  language: "typescript",
  testType: "unit",  // unit, integration, e2e, property-based, mutation
  coverageGoal: 90,
  aiEnhancement: true,
  detectAntiPatterns: true
})

// Parallel test execution with retry
mcp__agentic-qe__mcp__agentic_qe__test_execute_parallel({
  testFiles: ["tests/**/*.test.ts"],
  parallelism: 4,
  retryFailures: true,
  maxRetries: 3,
  collectCoverage: true
})

// Orchestrate QE task across fleet
mcp__agentic-qe__mcp__agentic_qe__task_orchestrate({
  task: {
    type: "comprehensive-testing",  // or: quality-gate, defect-prevention, performance-validation
    priority: "high",
    strategy: "adaptive",
    maxAgents: 5
  },
  context: {
    project: "my-project",
    environment: "test"
  },
  fleetId: "fleet-123"
})
\`\`\`

### QE Memory Operations

\`\`\`javascript
// Store QE pattern with namespace
mcp__agentic-qe__mcp__agentic_qe__memory_store({
  key: "coverage-pattern-auth",
  value: { pattern: "...", successRate: 0.95 },
  namespace: "qe-patterns",
  ttl: 86400,  // 24 hours
  persist: true
})

// Query memory with pattern matching
mcp__agentic-qe__mcp__agentic_qe__memory_query({
  pattern: "coverage-*",
  namespace: "qe-patterns",
  limit: 10
})
\`\`\`

### QE Task Routing by Domain

| Task Type | MCP Tool | Agents Spawned |
|-----------|----------|----------------|
| Generate tests | \`test_generate_enhanced\` | qe-test-architect, qe-tdd-specialist |
| Run tests | \`test_execute_parallel\` | qe-parallel-executor, qe-retry-handler |
| Analyze coverage | \`task_orchestrate\` (coverage) | qe-coverage-specialist, qe-gap-detector |
| Quality gate | \`task_orchestrate\` (quality-gate) | qe-quality-gate, qe-deployment-advisor |
| Security scan | \`agent_spawn\` (security-scanner) | qe-security-scanner, qe-security-auditor |
| Chaos test | \`agent_spawn\` (chaos-engineer) | qe-chaos-engineer, qe-load-tester |

---

## Quick Reference

\`\`\`bash
# Run tests
npm test -- --run

# Check quality
aqe quality assess

# Generate tests
aqe test generate <file>

# Coverage analysis
aqe coverage <path>
\`\`\`

### MCP Server

The AQE v3 MCP server is configured in \`.claude/mcp.json\`. Available tools:

| Tool | Description |
|------|-------------|
| \`fleet_init\` | Initialize QE fleet with topology |
| \`agent_spawn\` | Spawn specialized QE agent |
| \`test_generate_enhanced\` | AI-powered test generation |
| \`test_execute_parallel\` | Parallel test execution with retry |
| \`task_orchestrate\` | Orchestrate multi-agent QE tasks |
| \`coverage_analyze_sublinear\` | O(log n) coverage analysis |
| \`quality_assess\` | Quality gate evaluation |
| \`memory_store\` / \`memory_query\` | Pattern storage with namespacing |
| \`security_scan_comprehensive\` | SAST/DAST scanning |
| \`fleet_status\` | Get fleet and agent status |

### Configuration

- **Enabled Domains**: ${enabledDomains}${moreDomainsCount > 0 ? ` (+${moreDomainsCount} more)` : ''}
- **Learning**: ${config.learning.enabled ? 'Enabled' : 'Disabled'} (${config.learning.embeddingModel} embeddings)
- **Max Concurrent Agents**: ${config.agents.maxConcurrent}
- **Background Workers**: ${config.workers.enabled.length > 0 ? config.workers.enabled.join(', ') : 'None'}

### V3 QE Agents

V3 QE agents are installed in \`.claude/agents/v3/\`. Use with Claude Code's Task tool:

\`\`\`javascript
// Example: Generate tests
Task({ prompt: "Generate unit tests for auth module", subagent_type: "qe-test-architect", run_in_background: true })

// Example: Analyze coverage
Task({ prompt: "Find coverage gaps in src/", subagent_type: "qe-coverage-specialist", run_in_background: true })

// Example: Security scan
Task({ prompt: "Run security audit", subagent_type: "qe-security-scanner", run_in_background: true })
\`\`\`

### Integration with Claude Flow

**AQE Fleet + Claude Flow work together:**

\`\`\`javascript
// STEP 1: Initialize Claude Flow swarm for coordination
Bash("npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 15")

// STEP 2: Initialize AQE Fleet for QE-specific work
mcp__agentic-qe__mcp__agentic_qe__fleet_init({
  config: { topology: "hierarchical", maxAgents: 10, testingFocus: ["unit", "integration"] }
})

// STEP 3: Spawn agents via Claude Code Task tool (do the actual work)
Task({ prompt: "Generate tests for auth module", subagent_type: "qe-test-architect", run_in_background: true })
Task({ prompt: "Analyze coverage gaps", subagent_type: "qe-coverage-specialist", run_in_background: true })

// STEP 4: Store learnings in both systems
mcp__agentic-qe__mcp__agentic_qe__memory_store({ key: "pattern-1", value: "...", namespace: "qe-patterns", persist: true })
Bash("npx @claude-flow/cli@latest memory store --key 'qe-pattern-1' --value '...' --namespace patterns")
\`\`\`

### Data Storage

- **Memory Backend**: \`.agentic-qe/memory.db\` (SQLite)
- **Pattern Storage**: \`.agentic-qe/data/qe-patterns.db\` (ReasoningBank)
- **HNSW Index**: \`.agentic-qe/data/hnsw/index.bin\`
- **Configuration**: \`.agentic-qe/config.yaml\`

### Best Practices

1. **Test Execution**: Always use \`npm test -- --run\` (not \`npm test\` which runs in watch mode)
2. **Coverage Targets**: Aim for 80%+ coverage on critical paths
3. **Quality Gates**: Run \`quality_assess\` before merging PRs
4. **Pattern Learning**: AQE learns from successful test patterns - consistent naming helps
5. **Fleet Coordination**: Use \`fleet_init\` before spawning multiple QE agents
6. **Memory Persistence**: Use \`persist: true\` for patterns you want to keep across sessions

### Troubleshooting

If MCP tools aren't working:
\`\`\`bash
# Verify MCP server is configured
cat .claude/mcp.json

# Check fleet status
mcp__agentic-qe__mcp__agentic_qe__fleet_status({ includeAgentDetails: true })

# Reinitialize if needed
aqe init --auto
\`\`\`

---
*Generated by AQE v3 init - ${new Date().toISOString()}*
`;
  }

  /**
   * Start background workers
   * Writes worker configuration for daemon and optionally starts workers
   */
  private async startWorkers(config: AQEInitConfig): Promise<number> {
    if (!config.workers.daemonAutoStart || config.workers.enabled.length === 0) {
      return 0;
    }

    // Create workers directory
    const workersDir = join(this.projectRoot, '.agentic-qe', 'workers');
    if (!existsSync(workersDir)) {
      mkdirSync(workersDir, { recursive: true });
    }

    // Write worker registry for daemon to load
    const workerRegistry: Record<string, WorkerRegistration> = {};

    // Default intervals for workers (in milliseconds)
    const defaultIntervals: Record<string, number> = {
      'pattern-consolidator': 60000, // 1 minute
      'coverage-gap-scanner': 300000, // 5 minutes
      'flaky-test-detector': 600000, // 10 minutes
      'routing-accuracy-monitor': 120000, // 2 minutes
    };

    for (const workerName of config.workers.enabled) {
      workerRegistry[workerName] = {
        name: workerName,
        enabled: true,
        interval: config.workers.intervals[workerName] || defaultIntervals[workerName] || 60000,
        lastRun: null,
        status: 'pending',
      };
    }

    // Write registry file
    const registryPath = join(workersDir, 'registry.json');
    const registryData = {
      version: config.version,
      maxConcurrent: config.workers.maxConcurrent,
      workers: workerRegistry,
      createdAt: new Date().toISOString(),
      daemonPid: null, // Will be set when daemon starts
    };
    writeFileSync(registryPath, JSON.stringify(registryData, null, 2), 'utf-8');

    // Write individual worker configs
    for (const workerName of config.workers.enabled) {
      const workerConfigPath = join(workersDir, `${workerName}.json`);
      const workerConfig = {
        name: workerName,
        enabled: true,
        interval: config.workers.intervals[workerName] || defaultIntervals[workerName] || 60000,
        projectRoot: this.projectRoot,
        dataDir: join(this.projectRoot, '.agentic-qe', 'data'),
        createdAt: new Date().toISOString(),
      };
      writeFileSync(workerConfigPath, JSON.stringify(workerConfig, null, 2), 'utf-8');
    }

    // Write daemon startup script
    const daemonScriptPath = join(workersDir, 'start-daemon.sh');
    const daemonScript = `#!/bin/bash
# AQE v3 Worker Daemon Startup Script
# Generated by aqe init

PROJECT_ROOT="${this.projectRoot}"
WORKERS_DIR="$PROJECT_ROOT/.agentic-qe/workers"
PID_FILE="$WORKERS_DIR/daemon.pid"

# Check if already running
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    echo "Daemon already running (PID: $PID)"
    exit 0
  fi
fi

# Start daemon (AQE v3 native - no claude-flow dependency)
# TODO: Implement aqe daemon command for background workers
# For now, hooks work via CLI without daemon
echo "AQE v3 hooks work via CLI commands (no daemon required)"
echo "Use: npx aqe hooks session-start"
`;
    writeFileSync(daemonScriptPath, daemonScript, { mode: 0o755 });

    return config.workers.enabled.length;
  }

  /**
   * Install AQE skills
   * Copies v2 methodology and v3 domain skills to the project
   */
  private async installSkills(config: AQEInitConfig): Promise<number> {
    if (!config.skills.install) {
      return 0;
    }

    const installer = createSkillsInstaller({
      projectRoot: this.projectRoot,
      installV2Skills: config.skills.installV2,
      installV3Skills: config.skills.installV3,
      overwrite: config.skills.overwrite,
    });

    const result = await installer.install();

    // Log any errors
    if (result.errors.length > 0) {
      console.warn('Skills installation warnings:', result.errors);
    }

    return result.installed.length;
  }

  /**
   * Install V3 QE agents
   * Copies agents from bundled directory to project's .claude/agents/v3/
   */
  private async installAgents(): Promise<number> {
    const installer = createAgentsInstaller({
      projectRoot: this.projectRoot,
      installQEAgents: true,
      installSubagents: true,
      overwrite: false,
    });

    const result = await installer.install();

    // Log any errors
    if (result.errors.length > 0) {
      console.warn('Agents installation warnings:', result.errors);
    }

    return result.installed.length;
  }

  /**
   * Install n8n platform agents and skills
   * Copies n8n v2 agents from .claude/agents/n8n/ to project
   */
  private async installN8n(config: AQEInitConfig): Promise<{ agents: number; skills: number }> {
    const installer = createN8nInstaller({
      projectRoot: this.projectRoot,
      installAgents: true,
      installSkills: true,
      overwrite: false,
      n8nApiConfig: this.options.n8nApiConfig,
    });

    const result = await installer.install();

    // Log any errors
    if (result.errors.length > 0) {
      console.warn('N8n installation warnings:', result.errors);
    }

    // Update config with n8n platform settings
    if (!config.platforms) {
      config.platforms = {};
    }
    config.platforms.n8n = {
      enabled: true,
      installAgents: true,
      installSkills: true,
      installTypeScriptAgents: false,
      n8nApiConfig: this.options.n8nApiConfig,
    };

    return {
      agents: result.agentsInstalled.length,
      skills: result.skillsInstalled.length,
    };
  }

  /**
   * Save configuration to file
   * Creates .agentic-qe directory and writes config.yaml
   */
  private async saveConfig(config: AQEInitConfig): Promise<void> {
    if (!config) {
      throw new Error('No configuration to save');
    }

    // Create .agentic-qe directory
    const configDir = join(this.projectRoot, '.agentic-qe');
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    // Convert config to YAML format
    const yaml = this.configToYAML(config);

    // Write config.yaml
    const configPath = join(configDir, 'config.yaml');
    writeFileSync(configPath, yaml, 'utf-8');
  }

  /**
   * Convert config object to YAML string
   */
  private configToYAML(config: AQEInitConfig): string {
    const lines: string[] = [
      '# Agentic QE v3 Configuration',
      '# Generated by aqe init',
      `# ${new Date().toISOString()}`,
      '',
    ];

    lines.push(`version: "${config.version}"`);
    lines.push('');

    // Project section
    lines.push('project:');
    lines.push(`  name: "${config.project.name}"`);
    lines.push(`  root: "${config.project.root}"`);
    lines.push(`  type: "${config.project.type}"`);
    lines.push('');

    // Learning section
    lines.push('learning:');
    lines.push(`  enabled: ${config.learning.enabled}`);
    lines.push(`  embeddingModel: "${config.learning.embeddingModel}"`);
    lines.push('  hnswConfig:');
    lines.push(`    M: ${config.learning.hnswConfig.M}`);
    lines.push(`    efConstruction: ${config.learning.hnswConfig.efConstruction}`);
    lines.push(`    efSearch: ${config.learning.hnswConfig.efSearch}`);
    lines.push(`  qualityThreshold: ${config.learning.qualityThreshold}`);
    lines.push(`  promotionThreshold: ${config.learning.promotionThreshold}`);
    lines.push(`  pretrainedPatterns: ${config.learning.pretrainedPatterns}`);
    lines.push('');

    // Routing section
    lines.push('routing:');
    lines.push(`  mode: "${config.routing.mode}"`);
    lines.push(`  confidenceThreshold: ${config.routing.confidenceThreshold}`);
    lines.push(`  feedbackEnabled: ${config.routing.feedbackEnabled}`);
    lines.push('');

    // Workers section
    lines.push('workers:');
    lines.push('  enabled:');
    for (const worker of config.workers.enabled) {
      lines.push(`    - "${worker}"`);
    }
    lines.push('  intervals:');
    for (const [key, value] of Object.entries(config.workers.intervals)) {
      lines.push(`    ${key}: ${value}`);
    }
    lines.push(`  maxConcurrent: ${config.workers.maxConcurrent}`);
    lines.push(`  daemonAutoStart: ${config.workers.daemonAutoStart}`);
    lines.push('');

    // Hooks section
    lines.push('hooks:');
    lines.push(`  claudeCode: ${config.hooks.claudeCode}`);
    lines.push(`  preCommit: ${config.hooks.preCommit}`);
    lines.push(`  ciIntegration: ${config.hooks.ciIntegration}`);
    lines.push('');

    // Skills section (QE skills only - platform skills managed by claude-flow)
    lines.push('skills:');
    lines.push(`  install: ${config.skills.install}`);
    lines.push(`  installV2: ${config.skills.installV2}`);
    lines.push(`  installV3: ${config.skills.installV3}`);
    lines.push(`  overwrite: ${config.skills.overwrite}`);
    lines.push('');

    // Auto-tuning section
    lines.push('autoTuning:');
    lines.push(`  enabled: ${config.autoTuning.enabled}`);
    lines.push('  parameters:');
    for (const param of config.autoTuning.parameters) {
      lines.push(`    - "${param}"`);
    }
    lines.push(`  evaluationPeriodMs: ${config.autoTuning.evaluationPeriodMs}`);
    lines.push('');

    // Domains section
    lines.push('domains:');
    lines.push('  enabled:');
    for (const domain of config.domains.enabled) {
      lines.push(`    - "${domain}"`);
    }
    lines.push('  disabled:');
    for (const domain of config.domains.disabled) {
      lines.push(`    - "${domain}"`);
    }
    lines.push('');

    // Agents section
    lines.push('agents:');
    lines.push(`  maxConcurrent: ${config.agents.maxConcurrent}`);
    lines.push(`  defaultTimeout: ${config.agents.defaultTimeout}`);
    lines.push('');

    return lines.join('\n');
  }
}

/**
 * Factory function to create init orchestrator
 */
export function createInitOrchestrator(
  options: InitOrchestratorOptions
): InitOrchestrator {
  return new InitOrchestrator(options);
}

/**
 * Quick initialization with auto-configuration
 */
export async function quickInit(projectRoot: string): Promise<InitResult> {
  const orchestrator = createInitOrchestrator({
    projectRoot,
    autoMode: true,
  });
  return await orchestrator.initialize();
}

/**
 * Format init result for display
 */
export function formatInitResult(result: InitResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('┌─────────────────────────────────────────────────────────────┐');
  lines.push('│                    AQE v3 Initialization                     │');
  lines.push('├─────────────────────────────────────────────────────────────┤');

  // Steps
  for (const step of result.steps) {
    const icon = step.status === 'success' ? '✓' : step.status === 'error' ? '✗' : '○';
    lines.push(`│  ${icon} ${step.step.padEnd(50)} ${step.durationMs}ms │`);
  }

  lines.push('├─────────────────────────────────────────────────────────────┤');

  // Summary
  lines.push(`│  Project: ${result.config.project.name.padEnd(47)} │`);
  lines.push(`│  Type: ${result.config.project.type.padEnd(50)} │`);
  lines.push(`│  Code Intel Indexed: ${String(result.summary.codeIntelligenceIndexed).padEnd(36)} │`);
  lines.push(`│  Patterns Loaded: ${String(result.summary.patternsLoaded).padEnd(39)} │`);
  lines.push(`│  Skills Installed: ${String(result.summary.skillsInstalled).padEnd(38)} │`);
  lines.push(`│  Agents Installed: ${String(result.summary.agentsInstalled).padEnd(38)} │`);
  lines.push(`│  Workers Started: ${String(result.summary.workersStarted).padEnd(39)} │`);
  lines.push(`│  Hooks Configured: ${result.summary.hooksConfigured ? 'Yes' : 'No'.padEnd(38)} │`);
  lines.push(`│  MCP Server: ${result.summary.mcpConfigured ? 'Yes' : 'No'.padEnd(44)} │`);
  lines.push(`│  CLAUDE.md: ${result.summary.claudeMdGenerated ? 'Yes' : 'No'.padEnd(45)} │`);

  lines.push('├─────────────────────────────────────────────────────────────┤');

  // Final status
  const status = result.success
    ? '✓ AQE v3 initialized as self-learning platform'
    : '✗ Initialization failed';
  lines.push(`│  ${status.padEnd(57)} │`);

  lines.push('└─────────────────────────────────────────────────────────────┘');
  lines.push('');

  return lines.join('\n');
}
