/**
 * Init Wizard
 * ADR-025: Enhanced Init with Self-Configuration
 *
 * Interactive wizard for AQE initialization with visual feedback.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
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

      // Step 3: Initialize learning system
      const patternsLoaded = await this.runStep('Learning System Setup', async () => {
        if (config.learning.enabled && !this.options.skipPatterns) {
          return await this.initializeLearningSystem(config);
        }
        return 0;
      });

      // Step 4: Configure hooks
      const hooksConfigured = await this.runStep('Hooks Configuration', async () => {
        if (config.hooks.claudeCode) {
          return await this.configureHooks(config);
        }
        return false;
      });

      // Step 5: Start workers
      const workersStarted = await this.runStep('Background Workers', async () => {
        if (config.workers.daemonAutoStart) {
          return await this.startWorkers(config);
        }
        return 0;
      });

      // Step 6: Install skills
      const skillsInstalled = await this.runStep('Skills Installation', async () => {
        if (config.skills.install) {
          return await this.installSkills(config);
        }
        return 0;
      });

      // Step 7: Write configuration file
      await this.runStep('Save Configuration', async () => {
        return await this.saveConfig(config);
      });

      return {
        success: true,
        config,
        steps: this.steps,
        summary: {
          projectAnalyzed: true,
          configGenerated: true,
          patternsLoaded,
          skillsInstalled,
          hooksConfigured,
          workersStarted,
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
          patternsLoaded: 0,
          skillsInstalled: 0,
          hooksConfigured: false,
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
      databasePath: join(dataDir, 'patterns.db'),
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

    // Configure hooks based on config
    const hooks: Record<string, unknown> = {
      // Pre-tool hooks for learning
      PreToolUse: [
        {
          matcher: 'Edit|Write|MultiEdit',
          hooks: [
            {
              type: 'command',
              command: `npx @claude-flow/cli@latest hooks pre-edit --file "$AQE_FILE"`,
            },
          ],
        },
        {
          matcher: 'Bash',
          hooks: [
            {
              type: 'command',
              command: `npx @claude-flow/cli@latest hooks pre-command --command "$AQE_COMMAND"`,
            },
          ],
        },
      ],

      // Post-tool hooks for learning
      PostToolUse: [
        {
          matcher: 'Edit|Write|MultiEdit',
          hooks: [
            {
              type: 'command',
              command: `npx @claude-flow/cli@latest hooks post-edit --file "$AQE_FILE" --success "$AQE_SUCCESS"`,
            },
          ],
        },
        {
          matcher: 'Bash',
          hooks: [
            {
              type: 'command',
              command: `npx @claude-flow/cli@latest hooks post-command --command "$AQE_COMMAND" --exit-code "$AQE_EXIT_CODE"`,
            },
          ],
        },
      ],

      // Session hooks
      SessionStart: [
        {
          type: 'command',
          command: `npx @claude-flow/cli@latest hooks session-start`,
        },
      ],

      SessionEnd: [
        {
          type: 'command',
          command: `npx @claude-flow/cli@latest hooks session-end --save-state`,
        },
      ],
    };

    // Merge with existing settings
    settings.hooks = {
      ...(settings.hooks as Record<string, unknown> || {}),
      ...hooks,
    };

    // Add AQE metadata
    settings.aqe = {
      version: config.version,
      initialized: new Date().toISOString(),
      hooksConfigured: true,
    };

    // Write settings
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

    return true;
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

# Start daemon
npx @claude-flow/cli@latest daemon start --project "$PROJECT_ROOT" &
echo $! > "$PID_FILE"
echo "Daemon started (PID: $!)"
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
      installPlatformSkills: config.skills.installPlatform,
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

    // Skills section
    lines.push('skills:');
    lines.push(`  install: ${config.skills.install}`);
    lines.push(`  installV2: ${config.skills.installV2}`);
    lines.push(`  installV3: ${config.skills.installV3}`);
    lines.push(`  installPlatform: ${config.skills.installPlatform}`);
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
  lines.push(`│  Patterns Loaded: ${String(result.summary.patternsLoaded).padEnd(39)} │`);
  lines.push(`│  Workers Started: ${String(result.summary.workersStarted).padEnd(39)} │`);
  lines.push(`│  Hooks Configured: ${result.summary.hooksConfigured ? 'Yes' : 'No'.padEnd(38)} │`);

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
