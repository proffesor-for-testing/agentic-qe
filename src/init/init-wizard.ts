/**
 * Init Wizard
 * ADR-025: Enhanced Init with Self-Configuration
 *
 * Interactive wizard for AQE initialization with visual feedback.
 *
 * This is a facade module. Implementation details are extracted to:
 * - init-wizard-hooks.ts     (hook configuration, MCP, CLAUDE.md generation)
 * - init-wizard-migration.ts (V2 detection, migration, config conversion)
 * - init-wizard-steps.ts     (persistence, learning, workers, skills, agents, config)
 */

import { join } from 'path';

import type {
  ProjectAnalysis,
  AQEInitConfig,
  InitResult,
  InitStepResult,
  WizardStep,
  PretrainedLibrary,
} from './types.js';
import { createDefaultConfig } from './types.js';
import { ProjectAnalyzer, createProjectAnalyzer } from './project-analyzer.js';
import { SelfConfigurator, createSelfConfigurator } from './self-configurator.js';

// Re-export V2DetectionResult from migration module for backward compatibility
export type { V2DetectionResult } from './init-wizard-migration.js';

// Import from extracted modules
import type { V2DetectionResult } from './init-wizard-migration.js';
import {
  detectV2Installation,
  runV2Migration,
  writeVersionToDb,
} from './init-wizard-migration.js';

import {
  configureHooks,
  configureMCP,
  generateCLAUDEmd,
} from './init-wizard-hooks.js';

import { toErrorMessage } from '../shared/error-utils.js';
import {
  initializePersistenceDatabase,
  checkCodeIntelligenceIndex,
  runCodeIntelligenceScan,
  getKGEntryCount,
  initializeLearningSystem,
  startWorkers,
  installSkills,
  installAgents,
  installN8n,
  saveConfig,
} from './init-wizard-steps.js';

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
   * Run the full initialization process
   */
  async initialize(): Promise<InitResult> {
    const startTime = Date.now();

    try {
      // Step 0: Check for existing v2 installation
      const v2Detection = await detectV2Installation(this.projectRoot);

      if (v2Detection.detected) {
        const earlyResult = this.handleV2Detection(v2Detection, startTime);
        if (earlyResult) return earlyResult;
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
        return await initializePersistenceDatabase(this.projectRoot);
      });

      // Step 3.5: Code Intelligence Pre-Scan
      const codeIntelligenceResult = await this.runStep('Code Intelligence Pre-Scan', async () => {
        const hasIndex = await checkCodeIntelligenceIndex(this.projectRoot);
        if (!hasIndex) {
          console.log('  Building knowledge graph for code intelligence...');
          return await runCodeIntelligenceScan(analysis.projectRoot);
        }
        const entryCount = await getKGEntryCount(this.projectRoot);
        console.log(`  Using existing code intelligence index (${entryCount} entries)`);
        return { status: 'existing', entries: entryCount };
      });

      // Step 4: Initialize learning system
      const patternsLoaded = await this.runStep('Learning System Setup', async () => {
        if (config.learning.enabled && !this.options.skipPatterns) {
          return await initializeLearningSystem(this.projectRoot, config, this.options.pretrainedLibrary);
        }
        return 0;
      });

      // Step 5: Configure hooks
      const hooksConfigured = await this.runStep('Hooks Configuration', async () => {
        if (config.hooks.claudeCode) {
          return await configureHooks(this.projectRoot, config);
        }
        return false;
      });

      // Step 6: Configure MCP server
      const mcpConfigured = await this.runStep('MCP Configuration', async () => {
        return await configureMCP(this.projectRoot);
      });

      // Step 7: Generate CLAUDE.md
      const claudeMdGenerated = await this.runStep('CLAUDE.md Generation', async () => {
        return await generateCLAUDEmd(this.projectRoot, config);
      });

      // Step 8: Start workers
      const workersStarted = await this.runStep('Background Workers', async () => {
        if (config.workers.daemonAutoStart) {
          return await startWorkers(this.projectRoot, config);
        }
        return 0;
      });

      // Step 9: Install skills
      const skillsInstalled = await this.runStep('Skills Installation', async () => {
        if (config.skills.install) {
          return await installSkills(this.projectRoot, config);
        }
        return 0;
      });

      // Step 10: Install agents
      const agentsInstalled = await this.runStep('Agents Installation', async () => {
        return await installAgents(this.projectRoot);
      });

      // Step 11: Install n8n platform (optional)
      let n8nInstalled: { agents: number; skills: number } | undefined;
      if (this.options.withN8n) {
        const n8nResult = await this.runStep('N8n Platform Installation', async () => {
          return await installN8n(this.projectRoot, config, this.options.n8nApiConfig);
        });
        if (n8nResult) {
          n8nInstalled = n8nResult;
        }
      }

      // Step 12: Write configuration file
      await this.runStep('Save Configuration', async () => {
        return await saveConfig(this.projectRoot, config);
      });

      // Step 13: Write version marker to memory.db
      await this.runStep('Version Marker', async () => {
        return await writeVersionToDb(this.projectRoot, config.version);
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
      this.steps.push({
        step: 'Initialization Failed',
        status: 'error',
        message: toErrorMessage(error),
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
   * Handle V2 detection - returns early result if migration not auto, null otherwise.
   */
  private handleV2Detection(v2Detection: V2DetectionResult, startTime: number): InitResult | null {
    console.log('\n' + '='.repeat(60));
    console.log('  EXISTING V2 INSTALLATION DETECTED');
    console.log('='.repeat(60) + '\n');
    console.log('Found v2 installation at:');
    if (v2Detection.hasMemoryDb) {
      console.log(`  - Memory DB: .agentic-qe/memory.db`);
    }
    if (v2Detection.hasConfig) {
      console.log(`  - Config: .agentic-qe/config/`);
    }
    if (v2Detection.hasAgents) {
      console.log(`  - Agents: .claude/agents/`);
    }
    console.log('');

    if (this.options.autoMigrate) {
      console.log('Auto-migrate mode enabled. Running migration...\n');
      // Fire and forget - the caller will await initialize() which runs migration inline
      runV2Migration(this.projectRoot, v2Detection).catch(() => {});
      return null;
    }

    // Warn and suggest migration
    console.log('RECOMMENDED: Run migration before init:\n');
    console.log('   npx aqe migrate status      # Check what needs migration');
    console.log('   npx aqe migrate run --dry-run  # Preview changes');
    console.log('   npx aqe migrate run         # Execute migration\n');
    console.log('Or continue with:');
    console.log('   aqe init --auto-migrate     # Auto-migrate during init\n');
    console.log('='.repeat(60) + '\n');

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
      v2Detected: true,
    };
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
        message: toErrorMessage(error),
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

    if (answers['project-type'] && answers['project-type'] !== 'auto') {
      config.project.type = answers['project-type'] as 'single' | 'monorepo' | 'library';
    }

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

    if (answers['load-patterns'] === false) {
      config.learning.pretrainedPatterns = false;
    }

    if (answers['hooks'] === false) {
      config.hooks.claudeCode = false;
    }

    if (answers['workers'] === false) {
      config.workers.daemonAutoStart = false;
    }

    if (answers['skills'] === false) {
      config.skills.install = false;
    }

    return config;
  }
}

// ============================================================================
// Factory & Utility Functions
// ============================================================================

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
  lines.push('+-------------------------------------------------------------+');
  lines.push('|                    AQE v3 Initialization                     |');
  lines.push('+-------------------------------------------------------------+');

  for (const step of result.steps) {
    const icon = step.status === 'success' ? '[OK]' : step.status === 'error' ? '[!!]' : '[  ]';
    lines.push(`|  ${icon} ${step.step.padEnd(50)} ${String(step.durationMs).padStart(4)}ms |`);
  }

  lines.push('+-------------------------------------------------------------+');

  lines.push(`|  Project: ${result.config.project.name.padEnd(47)} |`);
  lines.push(`|  Type: ${result.config.project.type.padEnd(50)} |`);
  lines.push(`|  Code Intel Indexed: ${String(result.summary.codeIntelligenceIndexed).padEnd(36)} |`);
  lines.push(`|  Patterns Loaded: ${String(result.summary.patternsLoaded).padEnd(39)} |`);
  lines.push(`|  Skills Installed: ${String(result.summary.skillsInstalled).padEnd(38)} |`);
  lines.push(`|  Agents Installed: ${String(result.summary.agentsInstalled).padEnd(38)} |`);
  lines.push(`|  Workers Started: ${String(result.summary.workersStarted).padEnd(39)} |`);
  lines.push(`|  Hooks Configured: ${result.summary.hooksConfigured ? 'Yes' : 'No'.padEnd(38)} |`);
  lines.push(`|  MCP Server: ${result.summary.mcpConfigured ? 'Yes' : 'No'.padEnd(44)} |`);
  lines.push(`|  CLAUDE.md: ${result.summary.claudeMdGenerated ? 'Yes' : 'No'.padEnd(45)} |`);

  lines.push('+-------------------------------------------------------------+');

  const status = result.success
    ? '[OK] AQE v3 initialized as self-learning platform'
    : '[!!] Initialization failed';
  lines.push(`|  ${status.padEnd(57)} |`);

  lines.push('+-------------------------------------------------------------+');
  lines.push('');

  return lines.join('\n');
}
