/**
 * Phase 13: Governance
 * ADR-058: @claude-flow/guidance Governance Integration
 *
 * Installs governance configuration files (.claude/guidance/).
 * ENABLED BY DEFAULT - use --no-governance to skip.
 *
 * This phase:
 * - Installs constitution.md (7 unbreakable QE invariants)
 * - Installs 12 domain-specific shard files
 * - Enables agent governance, memory protection, and trust-based routing
 */

import {
  BasePhase,
  type InitContext,
} from './phase-interface.js';
import { createGovernanceInstaller } from '../governance-installer.js';

export interface GovernanceResult {
  /** Files installed */
  filesInstalled: number;
  /** Files skipped (already exist) */
  filesSkipped: number;
  /** Whether constitution was installed */
  constitutionInstalled: boolean;
  /** Number of shards installed */
  shardsInstalled: number;
  /** Target directory */
  governanceDir: string;
  /** Whether governance was skipped entirely */
  skippedByFlag: boolean;
}

/**
 * Governance phase - installs governance configuration
 *
 * ENABLED BY DEFAULT (opt-out with --no-governance)
 *
 * Why enabled by default:
 * - Governance prevents agent degradation (rule drift, runaway loops, memory corruption)
 * - Feature flags provide fine-grained opt-out for individual gates
 * - Non-strict mode logs violations but doesn't block (graceful degradation)
 * - If it's worth building, it's worth using
 */
export class GovernancePhase extends BasePhase<GovernanceResult> {
  readonly name = 'governance';
  readonly description = 'Install governance configuration';
  readonly order = 95; // After assets (90), before workers (100)
  readonly critical = false; // Non-critical - init succeeds even if governance fails
  readonly requiresPhases = ['configuration'] as const;

  /**
   * Run unless --no-governance flag is set
   */
  async shouldRun(context: InitContext): Promise<boolean> {
    // Check for --no-governance flag (via noGovernance option)
    if (context.options.noGovernance) {
      context.services.log('  Governance skipped (--no-governance flag)');
      return false;
    }

    // Skip in minimal mode
    if (context.options.minimal) {
      context.services.log('  Governance skipped (minimal mode)');
      return false;
    }

    return true;
  }

  protected async run(context: InitContext): Promise<GovernanceResult> {
    const { projectRoot, options } = context;

    // Determine overwrite mode: --upgrade flag
    const shouldOverwrite = options.upgrade;

    // Create installer
    const installer = createGovernanceInstaller({
      projectRoot,
      overwrite: shouldOverwrite,
    });

    // Check if already installed (and not upgrading)
    if (installer.isInstalled() && !shouldOverwrite) {
      const existingShards = installer.getInstalledShards();
      context.services.log(`  Governance already installed (${existingShards.length} shards)`);
      context.services.log(`  Use --upgrade to overwrite existing files`);

      return {
        filesInstalled: 0,
        filesSkipped: 1 + existingShards.length,
        constitutionInstalled: false,
        shardsInstalled: 0,
        governanceDir: `${projectRoot}/.claude/guidance`,
        skippedByFlag: false,
      };
    }

    // Install governance files
    const result = await installer.install();

    // Log results
    if (result.errors.length > 0) {
      for (const error of result.errors) {
        context.services.warn(`  ${error}`);
      }
    }

    context.services.log(`  Constitution: ${result.constitutionInstalled ? 'installed' : 'skipped'}`);
    context.services.log(`  Shards: ${result.shardsInstalled} installed, ${result.skipped.filter(s => s.startsWith('shards/')).length} skipped`);

    if (result.installed.length > 0) {
      context.services.log(`  Governance enabled (non-strict mode by default)`);
      context.services.log(`  Set GOVERNANCE_STRICT_MODE=true for strict enforcement`);
    }

    return {
      filesInstalled: result.installed.length,
      filesSkipped: result.skipped.length,
      constitutionInstalled: result.constitutionInstalled,
      shardsInstalled: result.shardsInstalled,
      governanceDir: result.governanceDir,
      skippedByFlag: false,
    };
  }
}

// Instance exported from index.ts
