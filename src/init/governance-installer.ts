/**
 * Governance Installer
 * ADR-058: @claude-flow/guidance Governance Integration
 *
 * Installs governance configuration files to user projects.
 * Governance is ENABLED BY DEFAULT (opt-out via --no-governance).
 *
 * Installs:
 * - .claude/guidance/constitution.md - 7 unbreakable QE invariants
 * - .claude/guidance/shards/*.shard.md - 12 domain-specific governance rules
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { toErrorMessage } from '../shared/error-utils.js';

// ============================================================================
// Types
// ============================================================================

export interface GovernanceInstallResult {
  /** Files successfully installed */
  installed: string[];
  /** Files skipped (already exist) */
  skipped: string[];
  /** Errors encountered */
  errors: string[];
  /** Target governance directory */
  governanceDir: string;
  /** Whether constitution was installed */
  constitutionInstalled: boolean;
  /** Number of shards installed */
  shardsInstalled: number;
}

export interface GovernanceInstallerOptions {
  /** Project root directory */
  projectRoot: string;
  /** Overwrite existing files (default: false) */
  overwrite?: boolean;
  /** Skip shard installation (just constitution) */
  skipShards?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Path to bundled governance assets
 */
function getGovernanceAssetsPath(): string {
  // In development: src/init -> assets/governance
  // In production: dist/init -> dist/assets/governance (copied during build)
  const devPath = join(__dirname, '../../assets/governance');
  const prodPath = join(__dirname, '../assets/governance');

  if (existsSync(devPath)) return devPath;
  if (existsSync(prodPath)) return prodPath;

  // Fallback to assets (when running from project root)
  const fallbackPath = join(process.cwd(), 'assets/governance');
  if (existsSync(fallbackPath)) return fallbackPath;

  throw new Error('Governance assets not found. Package may be corrupted.');
}

// ============================================================================
// Installer
// ============================================================================

/**
 * Governance Installer
 * Installs governance configuration to user projects
 */
export class GovernanceInstaller {
  private projectRoot: string;
  private overwrite: boolean;
  private skipShards: boolean;
  private assetsPath: string;

  constructor(options: GovernanceInstallerOptions) {
    this.projectRoot = options.projectRoot;
    this.overwrite = options.overwrite ?? false;
    this.skipShards = options.skipShards ?? false;
    this.assetsPath = getGovernanceAssetsPath();
  }

  /**
   * Install governance files to project
   */
  async install(): Promise<GovernanceInstallResult> {
    const installed: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    // Target directory: .claude/guidance/
    const governanceDir = join(this.projectRoot, '.claude', 'guidance');
    const shardsDir = join(governanceDir, 'shards');

    // Create directories
    try {
      mkdirSync(governanceDir, { recursive: true });
      if (!this.skipShards) {
        mkdirSync(shardsDir, { recursive: true });
      }
    } catch (error) {
      errors.push(`Failed to create governance directory: ${toErrorMessage(error)}`);
      return {
        installed,
        skipped,
        errors,
        governanceDir,
        constitutionInstalled: false,
        shardsInstalled: 0,
      };
    }

    // Install constitution.md
    let constitutionInstalled = false;
    const constitutionSrc = join(this.assetsPath, 'constitution.md');
    const constitutionDest = join(governanceDir, 'constitution.md');

    if (existsSync(constitutionSrc)) {
      try {
        if (!existsSync(constitutionDest) || this.overwrite) {
          copyFileSync(constitutionSrc, constitutionDest);
          installed.push('constitution.md');
          constitutionInstalled = true;
        } else {
          skipped.push('constitution.md');
        }
      } catch (error) {
        errors.push(`Failed to install constitution.md: ${toErrorMessage(error)}`);
      }
    } else {
      errors.push('constitution.md not found in assets');
    }

    // Install shards
    let shardsInstalled = 0;
    if (!this.skipShards) {
      const shardsSrcDir = join(this.assetsPath, 'shards');

      if (existsSync(shardsSrcDir)) {
        try {
          const shardFiles = readdirSync(shardsSrcDir).filter(f => f.endsWith('.shard.md'));

          for (const shardFile of shardFiles) {
            const shardSrc = join(shardsSrcDir, shardFile);
            const shardDest = join(shardsDir, shardFile);

            try {
              if (!existsSync(shardDest) || this.overwrite) {
                copyFileSync(shardSrc, shardDest);
                installed.push(`shards/${shardFile}`);
                shardsInstalled++;
              } else {
                skipped.push(`shards/${shardFile}`);
              }
            } catch (error) {
              errors.push(`Failed to install ${shardFile}: ${toErrorMessage(error)}`);
            }
          }
        } catch (error) {
          errors.push(`Failed to read shards directory: ${toErrorMessage(error)}`);
        }
      } else {
        errors.push('Shards directory not found in assets');
      }
    }

    return {
      installed,
      skipped,
      errors,
      governanceDir,
      constitutionInstalled,
      shardsInstalled,
    };
  }

  /**
   * Check if governance is already installed
   */
  isInstalled(): boolean {
    const constitutionPath = join(this.projectRoot, '.claude', 'guidance', 'constitution.md');
    return existsSync(constitutionPath);
  }

  /**
   * Get list of installed shards
   */
  getInstalledShards(): string[] {
    const shardsDir = join(this.projectRoot, '.claude', 'guidance', 'shards');
    if (!existsSync(shardsDir)) return [];

    try {
      return readdirSync(shardsDir).filter(f => f.endsWith('.shard.md'));
    } catch {
      return [];
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a governance installer instance
 */
export function createGovernanceInstaller(options: GovernanceInstallerOptions): GovernanceInstaller {
  return new GovernanceInstaller(options);
}
