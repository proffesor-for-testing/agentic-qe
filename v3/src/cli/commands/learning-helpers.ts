/**
 * Agentic QE v3 - Learning Command Helpers
 * Extracted from learning.ts - Shared utilities, state, types, display functions
 */

import chalk from 'chalk';
import path from 'node:path';
import { findProjectRoot } from '../../kernel/unified-memory.js';
import { existsSync, writeFileSync, readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat, unlink } from 'node:fs/promises';
import { createGzip, createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import {
  QEReasoningBank,
  createQEReasoningBank,
} from '../../learning/qe-reasoning-bank.js';
import { openDatabase } from '../../shared/safe-db.js';
import { HybridMemoryBackend } from '../../kernel/hybrid-backend.js';
import { QEDomain, QE_DOMAIN_LIST } from '../../learning/qe-patterns.js';
import type {
  DashboardData,
} from '../../learning/metrics-tracker.js';

// ============================================================================
// Learning State
// ============================================================================

interface LearningSystemState {
  reasoningBank: QEReasoningBank | null;
  initialized: boolean;
}

const state: LearningSystemState = {
  reasoningBank: null,
  initialized: false,
};

/**
 * Initialize the learning system
 */
export async function initializeLearningSystem(): Promise<QEReasoningBank> {
  if (state.initialized && state.reasoningBank) {
    return state.reasoningBank;
  }

  const projectRoot = findProjectRoot();
  const dataDir = path.join(projectRoot, '.agentic-qe');

  const backend = new HybridMemoryBackend({
    sqlite: {
      path: path.join(dataDir, 'memory.db'),
      walMode: true,
      poolSize: 3,
      busyTimeout: 5000,
    },
    enableFallback: true,
    defaultNamespace: 'qe-patterns',
  });

  await backend.initialize();

  state.reasoningBank = createQEReasoningBank(backend, undefined, {
    enableLearning: true,
    enableGuidance: true,
    enableRouting: true,
    embeddingDimension: 384,
    useONNXEmbeddings: true,
  });

  await state.reasoningBank.initialize();

  // Wire RVF dual-writer for vector replication (optional, best-effort)
  try {
    const { getSharedRvfDualWriter } = await import('../../integrations/ruvector/shared-rvf-dual-writer.js');
    const dualWriter = await getSharedRvfDualWriter();
    if (dualWriter) state.reasoningBank.setRvfDualWriter(dualWriter);
  } catch (e) {
    if (process.env.DEBUG) console.debug('[learning] RVF wiring skipped:', e instanceof Error ? e.message : e);
  }

  state.initialized = true;

  return state.reasoningBank;
}

// ============================================================================
// Print Helpers
// ============================================================================

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printSuccess(message: string): void {
  console.log(chalk.green('✓'), message);
}

export function printError(message: string): void {
  console.error(chalk.red('✗'), message);
}

export function printInfo(message: string): void {
  console.log(chalk.blue('ℹ'), message);
}

// ============================================================================
// Dashboard Display
// ============================================================================

/**
 * Display the learning dashboard
 */
export function displayDashboard(dashboard: DashboardData): void {
  const { current, topDomains } = dashboard;

  const BOX = {
    tl: '┌', tr: '┐', bl: '└', br: '┘',
    h: '─', v: '│', ml: '├', mr: '┤',
  };

  const WIDTH = 55;
  const HR = BOX.h.repeat(WIDTH - 2);

  console.log('');
  console.log(`${BOX.tl}${HR}${BOX.tr}`);
  console.log(`${BOX.v}${centerText('AQE LEARNING DASHBOARD', WIDTH - 2)}${BOX.v}`);
  console.log(`${BOX.ml}${HR}${BOX.mr}`);

  const patternToday = current.patternsCreatedToday > 0
    ? chalk.green(` (+${current.patternsCreatedToday} today)`)
    : '';
  console.log(`${BOX.v} Patterns:          ${padRight(String(current.totalPatterns) + patternToday, 32)}${BOX.v}`);

  const expToday = current.experiencesToday > 0
    ? chalk.green(` (+${current.experiencesToday} today)`)
    : '';
  console.log(`${BOX.v} Experiences:       ${padRight(String(current.totalExperiences) + expToday, 32)}${BOX.v}`);

  console.log(`${BOX.v} Q-Values:          ${padRight(String(current.totalQValues), 32)}${BOX.v}`);

  const rewardStr = current.avgReward.toFixed(2);
  const rewardTrend = current.avgRewardDelta >= 0
    ? chalk.green(`(↑ ${Math.abs(current.avgRewardDelta).toFixed(2)} from last week)`)
    : chalk.red(`(↓ ${Math.abs(current.avgRewardDelta).toFixed(2)} from last week)`);
  console.log(`${BOX.v} Avg Reward:        ${padRight(`${rewardStr} ${rewardTrend}`, 32)}${BOX.v}`);

  const successPct = (current.successRate * 100).toFixed(1);
  console.log(`${BOX.v} Success Rate:      ${padRight(`${successPct}%`, 32)}${BOX.v}`);

  console.log(`${BOX.v} Short-term:        ${padRight(String(current.shortTermPatterns), 32)}${BOX.v}`);
  console.log(`${BOX.v} Long-term:         ${padRight(String(current.longTermPatterns), 32)}${BOX.v}`);

  console.log(`${BOX.v}${' '.repeat(WIDTH - 2)}${BOX.v}`);

  console.log(`${BOX.v} ${chalk.bold('Domain Coverage:')}${' '.repeat(WIDTH - 19)}${BOX.v}`);

  if (topDomains.length === 0) {
    console.log(`${BOX.v}   ${chalk.dim('No patterns yet')}${' '.repeat(WIDTH - 19)}${BOX.v}`);
  } else {
    const maxCount = Math.max(...topDomains.map(d => d.count), 1);
    const barWidth = 14;

    for (const { domain, count } of topDomains) {
      const filledBars = Math.round((count / maxCount) * barWidth);
      const emptyBars = barWidth - filledBars;
      const bar = chalk.green('█'.repeat(filledBars)) + chalk.dim('░'.repeat(emptyBars));
      const domainName = padRight(domain, 20);
      const countStr = padLeft(String(count), 3);
      console.log(`${BOX.v}   ${domainName} ${bar} ${countStr} patterns ${BOX.v}`);
    }

    const shownDomains = new Set(topDomains.map(d => d.domain));
    const zeroDomains = QE_DOMAIN_LIST.filter(d => !shownDomains.has(d)).slice(0, 3);
    for (const domain of zeroDomains) {
      const bar = chalk.dim('░'.repeat(barWidth));
      const domainName = padRight(domain, 20);
      console.log(`${BOX.v}   ${domainName} ${bar}   0 patterns ${BOX.v}`);
    }
  }

  console.log(`${BOX.bl}${HR}${BOX.br}`);
  console.log('');
}

// ============================================================================
// String Utilities
// ============================================================================

function centerText(text: string, width: number): string {
  const stripped = stripAnsi(text);
  const padding = Math.max(0, width - stripped.length);
  const leftPad = Math.floor(padding / 2);
  const rightPad = padding - leftPad;
  return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
}

export function padRight(text: string, width: number): string {
  const stripped = stripAnsi(text);
  const padding = Math.max(0, width - stripped.length);
  return text + ' '.repeat(padding);
}

export function padLeft(text: string, width: number): string {
  const stripped = stripAnsi(text);
  const padding = Math.max(0, width - stripped.length);
  return ' '.repeat(padding) + text;
}

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

// ============================================================================
// Database Utilities
// ============================================================================

/**
 * Get the learning database path
 */
export function getDbPath(): string {
  const projectRoot = findProjectRoot();
  return path.join(projectRoot, '.agentic-qe', 'memory.db');
}

/**
 * Compress a file using gzip
 */
export async function compressFile(inputPath: string, outputPath?: string): Promise<string> {
  const gzPath = outputPath || `${inputPath}.gz`;
  await pipeline(
    createReadStream(inputPath),
    createGzip(),
    createWriteStream(gzPath)
  );
  return gzPath;
}

/**
 * Decompress a gzipped file
 */
export async function decompressFile(gzPath: string, outputPath: string): Promise<void> {
  await pipeline(
    createReadStream(gzPath),
    createGunzip(),
    createWriteStream(outputPath)
  );
}

/**
 * Verify database integrity using SQLite's built-in check
 */
export async function verifyDatabaseIntegrity(dbPath: string): Promise<{ valid: boolean; message: string }> {
  try {
    const db = openDatabase(dbPath, { readonly: true });

    const result = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    db.close();

    if (result.integrity_check === 'ok') {
      return { valid: true, message: 'Database integrity verified' };
    } else {
      return { valid: false, message: `Integrity check failed: ${result.integrity_check}` };
    }
  } catch (error) {
    return {
      valid: false,
      message: `Failed to verify: ${error instanceof Error ? error.message : 'unknown error'}`
    };
  }
}

/**
 * Get database schema version
 */
export async function getSchemaVersion(dbPath: string): Promise<number> {
  try {
    const db = openDatabase(dbPath, { readonly: true });

    const tableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
    ).get();

    if (!tableExists) {
      db.close();
      return 0;
    }

    const result = db.prepare('SELECT version FROM schema_version WHERE id = 1').get() as { version: number } | undefined;
    db.close();

    return result?.version ?? 0;
  } catch {
    return 0;
  }
}

// ============================================================================
// Export Types
// ============================================================================

/**
 * Export format version for compatibility tracking
 */
export const EXPORT_FORMAT_VERSION = '3.1.0';

/**
 * Export data structure with versioning
 */
export interface LearningExportData {
  version: string;
  exportedAt: string;
  source: string;
  schemaVersion: number;
  patternCount: number;
  patterns: Array<{
    id: string;
    name: string;
    description: string;
    patternType: string;
    qeDomain: string;
    tier: string;
    confidence: number;
    successRate: number;
    successfulUses: number;
    qualityScore: number;
    template: unknown;
    context: unknown;
    createdAt?: string;
    lastUsedAt?: string;
  }>;
  trajectories?: Array<{
    id: string;
    task: string;
    agent: string;
    domain: string;
    success: number;
    stepsJson: string;
  }>;
  experiences?: Array<{
    taskType: string;
    action: string;
    reward: number;
    count: number;
  }>;
  metadata?: {
    totalExperiences?: number;
    avgReward?: number;
  };
}

// ============================================================================
// Domain/Pattern Type Mappings
// ============================================================================

/**
 * Map task types to QE domains
 */
export const DOMAIN_MAPPING: Record<string, QEDomain> = {
  'generate': 'test-generation',
  'test-generation': 'test-generation',
  'analyze': 'coverage-analysis',
  'coverage': 'coverage-analysis',
  'coverage-analysis': 'coverage-analysis',
  'run': 'test-execution',
  'test-execution': 'test-execution',
  'report': 'quality-assessment',
  'quality': 'quality-assessment',
  'quality-analysis': 'quality-assessment',
  'security': 'security-compliance',
  'sast': 'security-compliance',
  'owasp': 'security-compliance',
  'secrets': 'security-compliance',
  'audit': 'security-compliance',
  'recommend': 'defect-intelligence',
  'predict': 'defect-intelligence',
  'complexity-analysis': 'code-intelligence',
  'code-analysis': 'code-intelligence',
  'stabilize': 'chaos-resilience',
  'flaky': 'chaos-resilience',
  'quarantine': 'chaos-resilience',
  'retry': 'chaos-resilience',
  'stress': 'chaos-resilience',
  'load': 'chaos-resilience',
  'endurance': 'chaos-resilience',
  'baseline': 'chaos-resilience',
};

/**
 * Map task types to valid QE pattern types
 */
export const PATTERN_TYPE_MAPPING: Record<string, string> = {
  'generate': 'test-template',
  'test-generation': 'test-template',
  'analyze': 'coverage-strategy',
  'coverage': 'coverage-strategy',
  'coverage-analysis': 'coverage-strategy',
  'run': 'test-template',
  'test-execution': 'test-template',
  'report': 'assertion-pattern',
  'quality': 'assertion-pattern',
  'quality-analysis': 'assertion-pattern',
  'security': 'assertion-pattern',
  'sast': 'assertion-pattern',
  'owasp': 'assertion-pattern',
  'secrets': 'assertion-pattern',
  'audit': 'assertion-pattern',
  'recommend': 'assertion-pattern',
  'predict': 'assertion-pattern',
  'complexity-analysis': 'assertion-pattern',
  'code-analysis': 'assertion-pattern',
  'stabilize': 'flaky-fix',
  'flaky': 'flaky-fix',
  'quarantine': 'flaky-fix',
  'retry': 'flaky-fix',
  'stress': 'perf-benchmark',
  'load': 'perf-benchmark',
  'endurance': 'perf-benchmark',
  'baseline': 'perf-benchmark',
  'mock': 'mock-pattern',
  'dependency': 'mock-pattern',
};
