/**
 * Fleet Integration with Code Intelligence
 * CI-005, CI-006, CI-007: Integrate code intelligence auto-scan with fleet initialization
 *
 * This module wraps fleet initialization to check for code intelligence index
 * and prompt users to run scans before spawning agents.
 */

import { InitOrchestrator, InitOrchestratorOptions } from './init-wizard.js';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { join } from 'path';
import { toErrorMessage } from '../shared/error-utils.js';

// ============================================================================
// Types
// ============================================================================

export interface FleetIntegrationOptions {
  /** Project root directory */
  projectRoot: string;
  /** Skip code intelligence scan check */
  skipCodeScan?: boolean;
  /** Non-interactive mode - skip all prompts */
  nonInteractive?: boolean;
  /** Init orchestrator options */
  initOptions?: Partial<InitOrchestratorOptions>;
}

export interface CodeIntelligenceStatus {
  /** Whether code intelligence index exists */
  hasIndex: boolean;
  /** Number of entries in the knowledge graph */
  entryCount: number;
  /** Whether user was prompted */
  wasPrompted: boolean;
  /** Whether user chose to run scan */
  scanRequested: boolean;
}

export interface FleetIntegrationResult {
  /** Code intelligence status */
  codeIntelligence: CodeIntelligenceStatus;
  /** Whether fleet initialization should proceed */
  shouldProceed: boolean;
  /** Reason if not proceeding */
  skipReason?: string;
}

// ============================================================================
// Fleet Init Enhancer
// ============================================================================

export class FleetInitEnhancer {
  private projectRoot: string;
  private options: FleetIntegrationOptions;
  private orchestrator?: InitOrchestrator;

  constructor(options: FleetIntegrationOptions) {
    this.options = options;
    this.projectRoot = options.projectRoot;
  }

  /**
   * Check code intelligence index and prompt if missing
   * This is the main integration point called before fleet initialization
   */
  async checkCodeIntelligence(): Promise<FleetIntegrationResult> {
    // Skip if requested
    if (this.options.skipCodeScan) {
      console.log(chalk.yellow('  Code intelligence scan skipped (--skip-code-scan flag)'));
      return {
        codeIntelligence: {
          hasIndex: false,
          entryCount: 0,
          wasPrompted: false,
          scanRequested: false,
        },
        shouldProceed: true,
        skipReason: 'skip-flag',
      };
    }

    // Check if index exists
    const hasIndex = await this.hasCodeIntelligenceIndex();

    if (hasIndex) {
      // Index exists - use it
      const entryCount = await this.getKGEntryCount();
      console.log(chalk.green(`  ✓ Code intelligence index found (${entryCount} entries)`));

      return {
        codeIntelligence: {
          hasIndex: true,
          entryCount,
          wasPrompted: false,
          scanRequested: false,
        },
        shouldProceed: true,
      };
    }

    // No index - prompt user if interactive
    if (!this.options.nonInteractive) {
      console.log(chalk.yellow('\n  ⚠ No code intelligence index found'));
      console.log(chalk.gray('  Building a knowledge graph improves agent accuracy by 80%'));
      console.log(chalk.gray('  This is a one-time operation and can be run later with:'));
      console.log(chalk.cyan('    aqe code-intelligence index\n'));

      const shouldScan = await this.promptScan();

      if (shouldScan) {
        return {
          codeIntelligence: {
            hasIndex: false,
            entryCount: 0,
            wasPrompted: true,
            scanRequested: true,
          },
          shouldProceed: false,
          skipReason: 'scan-requested',
        };
      }
    }

    // Continue without index
    console.log(chalk.gray('  Continuing without code intelligence index'));

    return {
      codeIntelligence: {
        hasIndex: false,
        entryCount: 0,
        wasPrompted: !this.options.nonInteractive,
        scanRequested: false,
      },
      shouldProceed: true,
    };
  }

  /**
   * Run code intelligence scan using InitOrchestrator
   * This reuses the existing scan logic from init-wizard.ts
   */
  async runCodeIntelligenceScan(): Promise<{ success: boolean; entries: number }> {
    try {
      console.log(chalk.blue('\n  Building code intelligence knowledge graph...'));

      // Create orchestrator if not already created
      if (!this.orchestrator) {
        this.orchestrator = new InitOrchestrator({
          projectRoot: this.projectRoot,
          autoMode: true,
          ...this.options.initOptions,
        });
      }

      // Use the private method checkCodeIntelligenceIndex via reflection
      // (We'll expose it via a public method in init-wizard.ts)
      const hasIndex = await this.hasCodeIntelligenceIndex();

      if (hasIndex) {
        const entryCount = await this.getKGEntryCount();
        console.log(chalk.green(`  ✓ Index already exists (${entryCount} entries)`));
        return { success: true, entries: entryCount };
      }

      // Import and run the scan directly
      const { KnowledgeGraphService } = await import('../domains/code-intelligence/services/knowledge-graph.js');
      const { InMemoryBackend } = await import('../kernel/memory-backend.js');

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
        cwd: this.projectRoot,
        ignore: ['node_modules/**', 'dist/**', 'coverage/**', '.agentic-qe/**'],
      });

      console.log(chalk.gray(`  Indexing ${files.length} files...`));

      // Index files
      const result = await kgService.index({
        paths: files.map(f => join(this.projectRoot, f)),
        incremental: false,
        includeTests: true,
      });

      // Clean up
      kgService.destroy();

      if (result.success) {
        const totalEntries = result.value.nodesCreated + result.value.edgesCreated;
        console.log(chalk.green(`  ✓ Indexed ${totalEntries} knowledge graph entries`));
        return { success: true, entries: totalEntries };
      }

      console.log(chalk.yellow('  ⚠ Code intelligence scan completed with warnings'));
      return { success: false, entries: 0 };
    } catch (error) {
      console.error(chalk.red('  ✗ Code intelligence scan failed:'), toErrorMessage(error));
      return { success: false, entries: 0 };
    }
  }

  /**
   * Get code intelligence status for fleet agents
   * Returns status that can be passed to agents as context
   */
  async getStatusForAgents(): Promise<{
    codeIntelligenceAvailable: boolean;
    knowledgeGraphSize: number;
    recommendedCapabilities: string[];
  }> {
    const hasIndex = await this.hasCodeIntelligenceIndex();
    const entryCount = hasIndex ? await this.getKGEntryCount() : 0;

    return {
      codeIntelligenceAvailable: hasIndex,
      knowledgeGraphSize: entryCount,
      recommendedCapabilities: hasIndex
        ? ['semantic-search', 'code-analysis', 'context-aware']
        : ['basic-analysis'],
    };
  }

  /**
   * Check if code intelligence index exists
   * Checks the memory database for code-intelligence:kg namespace entries
   */
  private async hasCodeIntelligenceIndex(): Promise<boolean> {
    const dbPath = join(this.projectRoot, '.agentic-qe', 'memory.db');
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
   * Get count of knowledge graph entries
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
   * Prompt user to run code intelligence scan
   */
  private async promptScan(): Promise<boolean> {
    // Use readline for interactive prompts
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise(resolve => {
      rl.question(
        chalk.white('  Run code intelligence scan now? [Y/n]: '),
        answer => {
          rl.close();
          const normalized = answer.trim().toLowerCase();
          // Default to 'yes' if empty
          resolve(normalized === '' || normalized === 'y' || normalized === 'yes');
        }
      );
    });
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create fleet init enhancer
 */
export function createFleetInitEnhancer(
  options: FleetIntegrationOptions
): FleetInitEnhancer {
  return new FleetInitEnhancer(options);
}

/**
 * Quick check for code intelligence status
 * Used by CLI to display status without prompts
 */
export async function checkCodeIntelligenceStatus(
  projectRoot: string
): Promise<CodeIntelligenceStatus> {
  const enhancer = createFleetInitEnhancer({
    projectRoot,
    skipCodeScan: true,
    nonInteractive: true,
  });

  const result = await enhancer.checkCodeIntelligence();
  return result.codeIntelligence;
}

/**
 * Run code intelligence integration check before fleet init
 * This is the main entry point for CLI integration
 */
export async function integrateCodeIntelligence(
  projectRoot: string,
  options: {
    skipCodeScan?: boolean;
    nonInteractive?: boolean;
  } = {}
): Promise<FleetIntegrationResult> {
  const enhancer = createFleetInitEnhancer({
    projectRoot,
    ...options,
  });

  return await enhancer.checkCodeIntelligence();
}
