/**
 * Agentic QE v3 - Command Handler Interfaces
 *
 * Defines the common interfaces for all CLI command handlers.
 * Part of the CLI modularization refactoring.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { QEKernel } from '../../kernel/interfaces.js';
import { QueenCoordinator } from '../../coordination/queen-coordinator.js';
import { CrossDomainEventRouter } from '../../coordination/cross-domain-router.js';
import { WorkflowOrchestrator } from '../../coordination/workflow-orchestrator.js';
import type { PersistentScheduler } from '../scheduler/index.js';

// Define ScheduledWorkflow locally to avoid circular dependency
export interface ScheduledWorkflow {
  id: string;
  workflowId: string;
  pipelinePath: string;
  schedule: string;
  scheduleDescription: string;
  nextRun: Date;
  enabled: boolean;
  createdAt: Date;
  lastRun?: Date;
}

// ============================================================================
// CLI Context - Shared State
// ============================================================================

/**
 * Shared CLI context that command handlers can access
 */
export interface CLIContext {
  kernel: QEKernel | null;
  queen: QueenCoordinator | null;
  router: CrossDomainEventRouter | null;
  workflowOrchestrator: WorkflowOrchestrator | null;
  scheduledWorkflows: Map<string, ScheduledWorkflow>;
  persistentScheduler: PersistentScheduler | null;
  initialized: boolean;
}

/**
 * Command options common to many handlers
 */
export interface CommonOptions {
  verbose?: boolean;
  json?: boolean;
  progress?: boolean;
}

// ============================================================================
// Command Handler Interface
// ============================================================================

/**
 * Interface for all command handlers
 */
export interface ICommandHandler {
  /** Unique command name */
  readonly name: string;

  /** Command description shown in help */
  readonly description: string;

  /** Aliases for the command (e.g., 't' for 'task') */
  readonly aliases?: string[];

  /**
   * Register the command with the Commander program
   * @param program The Commander program or parent command
   * @param context Shared CLI context
   */
  register(program: Command, context: CLIContext): void;

  /**
   * Get help text for this command
   */
  getHelp(): string;
}

/**
 * Interface for command handlers that require initialization
 */
export interface IInitializableHandler extends ICommandHandler {
  /**
   * Initialize handler-specific state
   */
  initialize(context: CLIContext): Promise<void>;

  /**
   * Cleanup handler-specific state
   */
  dispose(): Promise<void>;
}

// ============================================================================
// Helper Functions for Handlers
// ============================================================================

/**
 * Get status color based on status string
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'healthy':
    case 'completed':
      return chalk.green(status);
    case 'idle':
      // Issue #205 fix: 'idle' is normal - show in cyan (neutral/ready)
      return chalk.cyan(status);
    case 'degraded':
    case 'running':
      return chalk.yellow(status);
    case 'unhealthy':
    case 'failed':
      return chalk.red(status);
    default:
      return chalk.gray(status);
  }
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * Format uptime in human-readable format
 */
export function formatUptime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${hours}h ${minutes}m ${seconds}s`;
}

/**
 * Get color function based on percentage value
 */
export function getColorForPercent(percent: number): (str: string) => string {
  if (percent >= 80) return chalk.green;
  if (percent >= 50) return chalk.yellow;
  return chalk.red;
}

/**
 * Walk directory recursively to find files
 */
export async function walkDirectory(
  dir: string,
  options: {
    extensions?: string[];
    exclude?: string[];
    maxDepth?: number;
    includeTests?: boolean;
  } = {}
): Promise<string[]> {
  const fs = await import('fs');
  const path = await import('path');

  const {
    extensions = ['.ts'],
    exclude = ['node_modules', 'dist'],
    maxDepth = 4,
    includeTests = false,
  } = options;

  const walkDir = (currentDir: string, depth: number): string[] => {
    if (depth > maxDepth) return [];

    const result: string[] = [];
    let items: string[];

    try {
      items = fs.readdirSync(currentDir);
    } catch {
      return [];
    }

    for (const item of items) {
      if (exclude.includes(item)) continue;
      if (!includeTests && (item === 'tests' || item.includes('.test.') || item.includes('.spec.'))) continue;

      const fullPath = path.join(currentDir, item);
      let stat;

      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        result.push(...walkDir(fullPath, depth + 1));
      } else {
        const hasValidExtension = extensions.some(ext => item.endsWith(ext));
        const isDeclarationFile = item.endsWith('.d.ts');

        if (hasValidExtension && !isDeclarationFile) {
          result.push(fullPath);
        }
      }
    }

    return result;
  };

  return walkDir(dir, 0);
}

// ============================================================================
// Export Types
// ============================================================================

export type { Command };
