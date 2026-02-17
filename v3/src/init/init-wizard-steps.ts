/**
 * Init Wizard - Step Implementations
 *
 * Contains initialization step implementations: learning system, workers,
 * skills, agents, n8n, persistence, code intelligence, and config save.
 * Extracted from init-wizard.ts.
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import type { AQEInitConfig, PretrainedLibrary, ProjectAnalysis } from './types.js';
import { createSkillsInstaller } from './skills-installer.js';
import { createAgentsInstaller } from './agents-installer.js';
import { createN8nInstaller } from './n8n-installer.js';
import { toErrorMessage } from '../shared/error-utils.js';

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
// Persistence Database
// ============================================================================

/**
 * Initialize the persistence database (REQUIRED).
 * Creates the SQLite database file with proper schema.
 * This MUST succeed or initialization fails - no fallbacks.
 */
export async function initializePersistenceDatabase(projectRoot: string): Promise<boolean> {
  type DatabaseConstructor = new (filename: string) => import('better-sqlite3').Database;
  let Database: DatabaseConstructor | null = null;
  try {
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

  const dataDir = join(projectRoot, '.agentic-qe');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = join(dataDir, 'memory.db');

  try {
    const db = new Database!(dbPath);

    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');

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

    const tableCheck = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='kv_store'
    `).get();

    if (!tableCheck) {
      throw new Error('Failed to create kv_store table');
    }

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

// ============================================================================
// Code Intelligence
// ============================================================================

/**
 * Check if code intelligence index exists.
 */
export async function checkCodeIntelligenceIndex(projectRoot: string): Promise<boolean> {
  const dbPath = join(projectRoot, '.agentic-qe', 'memory.db');
  if (!existsSync(dbPath)) {
    return false;
  }

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
 * Run code intelligence scan.
 * Indexes all source files into the knowledge graph.
 */
export async function runCodeIntelligenceScan(
  projectPath: string
): Promise<{ status: string; entries: number }> {
  try {
    const { KnowledgeGraphService } = await import('../domains/code-intelligence/services/knowledge-graph.js');
    const { InMemoryBackend } = await import('../kernel/memory-backend.js');

    const memory = new InMemoryBackend();
    await memory.initialize();

    const kgService = new KnowledgeGraphService(memory, {
      namespace: 'code-intelligence:kg',
      enableVectorEmbeddings: true,
    });

    const glob = await import('fast-glob');
    const files = await glob.default([
      '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.py'
    ], {
      cwd: projectPath,
      ignore: ['node_modules/**', 'dist/**', 'coverage/**', '.agentic-qe/**'],
    });

    const result = await kgService.index({
      paths: files.map(f => join(projectPath, f)),
      incremental: false,
      includeTests: true,
    });

    kgService.destroy();

    if (result.success) {
      return {
        status: 'indexed',
        entries: result.value.nodesCreated + result.value.edgesCreated
      };
    }

    return { status: 'error', entries: 0 };
  } catch (error) {
    console.warn('Code intelligence scan warning:', toErrorMessage(error));
    return { status: 'skipped', entries: 0 };
  }
}

/**
 * Get count of KG entries from existing database.
 */
export async function getKGEntryCount(projectRoot: string): Promise<number> {
  const dbPath = join(projectRoot, '.agentic-qe', 'memory.db');
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

// ============================================================================
// Learning System
// ============================================================================

/**
 * Initialize the learning system.
 * Creates database, initializes HNSW index, loads pre-trained patterns.
 */
export async function initializeLearningSystem(
  projectRoot: string,
  config: AQEInitConfig,
  pretrainedLibrary?: PretrainedLibrary
): Promise<number> {
  if (!config.learning.enabled) {
    return 0;
  }

  const dataDir = join(projectRoot, '.agentic-qe', 'data');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const hnswDir = join(dataDir, 'hnsw');
  if (!existsSync(hnswDir)) {
    mkdirSync(hnswDir, { recursive: true });
  }

  const learningConfigPath = join(dataDir, 'learning-config.json');
  const learningConfig = {
    embeddingModel: config.learning.embeddingModel,
    hnswConfig: config.learning.hnswConfig,
    qualityThreshold: config.learning.qualityThreshold,
    promotionThreshold: config.learning.promotionThreshold,
    databasePath: join(dataDir, 'memory.db'),
    hnswIndexPath: join(hnswDir, 'index.bin'),
    initialized: new Date().toISOString(),
  };
  writeFileSync(learningConfigPath, JSON.stringify(learningConfig, null, 2), 'utf-8');

  let patternsLoaded = 0;

  if (config.learning.pretrainedPatterns && pretrainedLibrary) {
    const library = pretrainedLibrary;

    const patternsByDomain = new Map<string, typeof library.patterns>();
    for (const pattern of library.patterns) {
      const domain = pattern.domain || 'general';
      if (!patternsByDomain.has(domain)) {
        patternsByDomain.set(domain, []);
      }
      patternsByDomain.get(domain)!.push(pattern);
    }

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

    for (const [domain, patterns] of patternsByDomain) {
      const domainDir = join(dataDir, 'patterns', domain);
      if (!existsSync(domainDir)) {
        mkdirSync(domainDir, { recursive: true });
      }

      const patternsPath = join(domainDir, 'patterns.json');
      writeFileSync(patternsPath, JSON.stringify(patterns, null, 2), 'utf-8');
      patternsLoaded += patterns.length;
    }

    return patternsLoaded;
  }

  return 0;
}

// ============================================================================
// Workers
// ============================================================================

/**
 * Start background workers.
 * Writes worker configuration for daemon and optionally starts workers.
 */
export async function startWorkers(projectRoot: string, config: AQEInitConfig): Promise<number> {
  if (!config.workers.daemonAutoStart || config.workers.enabled.length === 0) {
    return 0;
  }

  const workersDir = join(projectRoot, '.agentic-qe', 'workers');
  if (!existsSync(workersDir)) {
    mkdirSync(workersDir, { recursive: true });
  }

  const workerRegistry: Record<string, WorkerRegistration> = {};

  const defaultIntervals: Record<string, number> = {
    'pattern-consolidator': 60000,
    'coverage-gap-scanner': 300000,
    'flaky-test-detector': 600000,
    'routing-accuracy-monitor': 120000,
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

  const registryPath = join(workersDir, 'registry.json');
  const registryData = {
    version: config.version,
    maxConcurrent: config.workers.maxConcurrent,
    workers: workerRegistry,
    createdAt: new Date().toISOString(),
    daemonPid: null,
  };
  writeFileSync(registryPath, JSON.stringify(registryData, null, 2), 'utf-8');

  for (const workerName of config.workers.enabled) {
    const workerConfigPath = join(workersDir, `${workerName}.json`);
    const workerConfig = {
      name: workerName,
      enabled: true,
      interval: config.workers.intervals[workerName] || defaultIntervals[workerName] || 60000,
      projectRoot: projectRoot,
      dataDir: join(projectRoot, '.agentic-qe', 'data'),
      createdAt: new Date().toISOString(),
    };
    writeFileSync(workerConfigPath, JSON.stringify(workerConfig, null, 2), 'utf-8');
  }

  const daemonScriptPath = join(workersDir, 'start-daemon.cjs');
  const daemonScript = `#!/usr/bin/env node
// AQE v3 Worker Daemon Startup Script (cross-platform)
// Generated by aqe init

console.log("AQE v3 hooks work via CLI commands (no daemon required)");
console.log("Use: npx aqe hooks session-start");
`;
  writeFileSync(daemonScriptPath, daemonScript);

  return config.workers.enabled.length;
}

// ============================================================================
// Skills & Agents Installation
// ============================================================================

/**
 * Install AQE skills.
 */
export async function installSkills(projectRoot: string, config: AQEInitConfig): Promise<number> {
  if (!config.skills.install) {
    return 0;
  }

  const installer = createSkillsInstaller({
    projectRoot,
    installV2Skills: config.skills.installV2,
    installV3Skills: config.skills.installV3,
    overwrite: config.skills.overwrite,
  });

  const result = await installer.install();

  if (result.errors.length > 0) {
    console.warn('Skills installation warnings:', result.errors);
  }

  return result.installed.length;
}

/**
 * Install V3 QE agents.
 */
export async function installAgents(projectRoot: string): Promise<number> {
  const installer = createAgentsInstaller({
    projectRoot,
    installQEAgents: true,
    installSubagents: true,
    overwrite: false,
  });

  const result = await installer.install();

  if (result.errors.length > 0) {
    console.warn('Agents installation warnings:', result.errors);
  }

  return result.installed.length;
}

/**
 * Install n8n platform agents and skills.
 */
export async function installN8n(
  projectRoot: string,
  config: AQEInitConfig,
  n8nApiConfig?: { baseUrl?: string; apiKey?: string }
): Promise<{ agents: number; skills: number }> {
  const installer = createN8nInstaller({
    projectRoot,
    installAgents: true,
    installSkills: true,
    overwrite: false,
    n8nApiConfig,
  });

  const result = await installer.install();

  if (result.errors.length > 0) {
    console.warn('N8n installation warnings:', result.errors);
  }

  if (!config.platforms) {
    config.platforms = {};
  }
  config.platforms.n8n = {
    enabled: true,
    installAgents: true,
    installSkills: true,
    installTypeScriptAgents: false,
    n8nApiConfig,
  };

  return {
    agents: result.agentsInstalled.length,
    skills: result.skillsInstalled.length,
  };
}

// ============================================================================
// Config Save
// ============================================================================

/**
 * Save configuration to file.
 * Creates .agentic-qe directory and writes config.yaml.
 */
export async function saveConfig(projectRoot: string, config: AQEInitConfig): Promise<void> {
  if (!config) {
    throw new Error('No configuration to save');
  }

  const configDir = join(projectRoot, '.agentic-qe');
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  const yaml = configToYAML(config);
  const configPath = join(configDir, 'config.yaml');
  writeFileSync(configPath, yaml, 'utf-8');
}

/**
 * Convert config object to YAML string.
 */
export function configToYAML(config: AQEInitConfig): string {
  const lines: string[] = [
    '# Agentic QE v3 Configuration',
    '# Generated by aqe init',
    `# ${new Date().toISOString()}`,
    '',
  ];

  lines.push(`version: "${config.version}"`);
  lines.push('');

  lines.push('project:');
  lines.push(`  name: "${config.project.name}"`);
  lines.push(`  root: "${config.project.root}"`);
  lines.push(`  type: "${config.project.type}"`);
  lines.push('');

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

  lines.push('routing:');
  lines.push(`  mode: "${config.routing.mode}"`);
  lines.push(`  confidenceThreshold: ${config.routing.confidenceThreshold}`);
  lines.push(`  feedbackEnabled: ${config.routing.feedbackEnabled}`);
  lines.push('');

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

  lines.push('hooks:');
  lines.push(`  claudeCode: ${config.hooks.claudeCode}`);
  lines.push(`  preCommit: ${config.hooks.preCommit}`);
  lines.push(`  ciIntegration: ${config.hooks.ciIntegration}`);
  lines.push('');

  lines.push('skills:');
  lines.push(`  install: ${config.skills.install}`);
  lines.push(`  installV2: ${config.skills.installV2}`);
  lines.push(`  installV3: ${config.skills.installV3}`);
  lines.push(`  overwrite: ${config.skills.overwrite}`);
  lines.push('');

  lines.push('autoTuning:');
  lines.push(`  enabled: ${config.autoTuning.enabled}`);
  lines.push('  parameters:');
  for (const param of config.autoTuning.parameters) {
    lines.push(`    - "${param}"`);
  }
  lines.push(`  evaluationPeriodMs: ${config.autoTuning.evaluationPeriodMs}`);
  lines.push('');

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

  lines.push('agents:');
  lines.push(`  maxConcurrent: ${config.agents.maxConcurrent}`);
  lines.push(`  defaultTimeout: ${config.agents.defaultTimeout}`);
  lines.push('');

  return lines.join('\n');
}
