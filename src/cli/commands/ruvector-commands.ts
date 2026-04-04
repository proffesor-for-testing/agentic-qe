/**
 * Agentic QE v3 - RuVector CLI Commands
 * Manage RuVector feature flags and native package status.
 *
 * Subcommands:
 *   status - Show native package availability and flag status
 *   flags  - List, set, or apply profiles to feature flags
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  getRuVectorFeatureFlags,
  setRuVectorFeatureFlags,
  DEFAULT_FEATURE_FLAGS,
  type RuVectorFeatureFlags,
} from '../../integrations/ruvector/feature-flags.js';
import { HnswAdapter } from '../../kernel/hnsw-adapter.js';

// ============================================================================
// Types
// ============================================================================

/** Preset profiles for common flag configurations */
type FlagProfile = 'performance' | 'experimental' | 'safe';

interface FlagsOptions {
  set?: string;
  profile?: string;
}

/** Describes a native package and its feature flag association */
interface NativePackageInfo {
  name: string;
  flag: keyof RuVectorFeatureFlags;
  fallback: string;
}

// ============================================================================
// Constants
// ============================================================================

const NATIVE_PACKAGES: NativePackageInfo[] = [
  {
    name: '@ruvector/router',
    flag: 'useNativeHNSW',
    fallback: 'ProgressiveHnswBackend',
  },
  {
    name: 'prime-radiant-advanced-wasm',
    flag: 'useCoherenceGate',
    fallback: 'Word-frequency heuristics',
  },
  {
    name: '@ruvector/sona',
    flag: 'useSONAThreeLoop',
    fallback: 'TypeScript MicroLoRA/EWC++',
  },
];

const FLAG_DESCRIPTIONS: Record<keyof RuVectorFeatureFlags, string> = {
  useQESONA: 'Self-Optimizing Neural Architecture',
  useQEFlashAttention: 'SIMD-accelerated attention computation',
  useQEGNNIndex: 'Differentiable search and HNSW indexing',
  logMigrationMetrics: 'Log migration metrics during rollout',
  useNativeHNSW: 'Rust-based HNSW backend (@ruvector/router VectorDb)',
  useTemporalCompression: 'Temporal tensor compression (ADR-085)',
  useMetadataFiltering: 'SIMD-accelerated metadata filtering',
  useDeterministicDither: 'Cross-platform deterministic dithering',
  useNeuralRouting: 'Neural model routing via FastGRNN (ADR-082)',
  useSONAThreeLoop: 'SONA Three-Loop Engine (Task 2.2)',
  useCrossDomainTransfer: 'Cross-domain transfer learning (ADR-084)',
  useHnswHealthMonitor: 'HNSW health monitor (Task 3.4)',
  useRegretTracking: 'Regret tracking & learning health (Task 2.4)',
  useCoherenceGate: 'Sheaf-gated coherence validation (ADR-083, Task 3.1)',
  useWitnessChain: 'SHA-256 hash-chained witness records (Task 3.1)',
  useCNNVisualRegression: 'CNN visual regression testing (Task 4.3)',
  useDAGAttention: 'DAG attention for test scheduling (Task 4.2)',
  useCoherenceActionGate: 'Coherence-gated agent actions (ADR-083, Task 3.2)',
  useReasoningQEC: 'Reasoning QEC error correction (Task 4.5)',
  // RVF Cluster (ADR-065–072)
  useRVFPatternStore: 'RVF-backed PatternStore with persistent HNSW (ADR-066)',
  useAgentMemoryBranching: 'Agent memory branching via RVF COW (ADR-067)',
  useUnifiedHnsw: 'Unified HNSW provider replacing 3 legacy impls (ADR-071)',
  // Phase 5 (ADR-087)
  useHDCFingerprinting: 'HDC pattern fingerprinting (R1, ADR-087)',
  useCusumDriftDetection: 'CUSUM drift detection (R2, ADR-087)',
  useDeltaEventSourcing: 'Delta event sourcing (R3, ADR-087)',
  useEwcPlusPlusRegularization: 'EWC++ regularization (ADR-087)',
  // Phase 5 Milestone 2 (ADR-087)
  useGraphMAEEmbeddings: 'GraphMAE self-supervised embeddings (R4, ADR-087)',
  useHopfieldMemory: 'Modern Hopfield memory (R5, ADR-087)',
  useColdTierGNN: 'Cold-tier GNN training (R6, ADR-087)',
  // Phase 5 Milestone 3 (ADR-087)
  useMetaLearningEnhancements: 'Meta-learning enhancements (R7, ADR-087)',
  useSublinearSolver: 'Sublinear PageRank solver (R8, ADR-087)',
  useSpectralSparsification: 'Spectral graph sparsification (R9, ADR-087)',
  useReservoirReplay: 'Reservoir replay with coherence gating (R10, ADR-087)',
  // Phase 5 Milestone 4 (ADR-087)
  useEpropOnlineLearning: 'E-prop online learning, RL algorithm #10 (R11, ADR-087)',
  useGrangerCausality: 'Granger causality for test failure prediction (R12, ADR-087)',
  // Phase 5 Milestone 5 (ADR-087)
  useCognitiveRouting: 'Cognitive routing with predictive delta compression (R13, ADR-087)',
  useHyperbolicHnsw: 'Hyperbolic HNSW with Poincare ball embeddings (R14, ADR-087)',
};

const PROFILES: Record<FlagProfile, Partial<RuVectorFeatureFlags>> = {
  performance: {
    useNativeHNSW: true,
    useTemporalCompression: true,
    useDeterministicDither: true,
  },
  experimental: {
    useQESONA: true,
    useQEFlashAttention: true,
    useQEGNNIndex: true,
    logMigrationMetrics: true,
    useNativeHNSW: true,
    useTemporalCompression: true,
    useMetadataFiltering: true,
    useDeterministicDither: true,
    useNeuralRouting: true,
  },
  safe: {
    useQESONA: true,
    useQEFlashAttention: true,
    useQEGNNIndex: true,
    logMigrationMetrics: true,
    useNativeHNSW: false,
    useTemporalCompression: false,
    useMetadataFiltering: false,
    useDeterministicDither: false,
    useNeuralRouting: false,
  },
};

const VALID_FLAG_NAMES = Object.keys(DEFAULT_FEATURE_FLAGS) as Array<keyof RuVectorFeatureFlags>;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check whether a native package is installed.
 * Returns true if the package can be resolved, false otherwise.
 */
function isNativePackageInstalled(packageName: string): boolean {
  try {
    require.resolve(packageName);
    return true;
  } catch {
    return false;
  }
}

function isDefaultValue(flag: keyof RuVectorFeatureFlags, value: boolean): boolean {
  return DEFAULT_FEATURE_FLAGS[flag] === value;
}

function padRight(str: string, length: number): string {
  return str.padEnd(length);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

function isValidFlagName(name: string): name is keyof RuVectorFeatureFlags {
  return VALID_FLAG_NAMES.includes(name as keyof RuVectorFeatureFlags);
}

function isValidProfile(name: string): name is FlagProfile {
  return name in PROFILES;
}

// ============================================================================
// Command: ruvector status
// ============================================================================

function executeStatus(): void {
  const flags = getRuVectorFeatureFlags();

  console.log('');
  console.log(chalk.bold.blue('RuVector Integration Status:'));

  // Native packages section
  console.log(chalk.cyan('  Native Packages:'));
  for (const pkg of NATIVE_PACKAGES) {
    const installed = isNativePackageInstalled(pkg.name);
    const statusText = installed
      ? chalk.green('installed')
      : chalk.gray(`not installed (fallback: ${pkg.fallback})`);
    console.log(`    ${padRight(pkg.name + ':', 30)} ${statusText}`);
  }

  // Feature flags section
  console.log('');
  console.log(chalk.cyan('  Feature Flags:'));
  for (const flagName of VALID_FLAG_NAMES) {
    const value = flags[flagName];
    const isDefault = isDefaultValue(flagName, value);
    const valueText = value ? chalk.green('true') : chalk.gray('false');
    const suffix = isDefault ? chalk.gray(' (default)') : chalk.yellow(' (modified)');
    console.log(`    ${padRight(flagName + ':', 30)} ${valueText}${suffix}`);
  }

  // HNSW Memory Usage
  const indexNames = HnswAdapter.listIndexes();
  if (indexNames.length > 0) {
    console.log('');
    console.log(chalk.cyan('  HNSW Memory Usage:'));
    let totalVectors = 0;
    let totalEstimatedBytes = 0;
    for (const name of indexNames) {
      const adapter = HnswAdapter.get(name);
      if (adapter) {
        const count = adapter.size();
        const dims = adapter.dimensions();
        // Raw vectors + HNSW graph overhead (~2x)
        const rawBytes = count * dims * 4;
        const estimatedBytes = rawBytes * 3;
        totalVectors += count;
        totalEstimatedBytes += estimatedBytes;
        console.log(
          `    ${padRight(name + ':', 20)} ${chalk.white(String(count))} vectors, ` +
          `${chalk.white(dims)}d, ~${chalk.white(formatBytes(estimatedBytes))}`,
        );
      }
    }
    console.log(
      chalk.gray(`    ${'─'.repeat(50)}`),
    );
    console.log(
      `    ${padRight('Total:', 20)} ${chalk.bold.white(String(totalVectors))} vectors, ` +
      `~${chalk.bold.white(formatBytes(totalEstimatedBytes))}`,
    );
  } else {
    console.log('');
    console.log(chalk.cyan('  HNSW Memory Usage:'));
    console.log(chalk.gray('    No active indexes (indexes are created on first use)'));
  }

  // Memory info when compression is enabled
  if (flags.useTemporalCompression) {
    console.log('');
    console.log(chalk.cyan('  Temporal Compression:'));
    console.log(chalk.gray('    Hot tier:  8-bit quantization (frequently accessed patterns)'));
    console.log(chalk.gray('    Warm tier: 5-bit quantization (moderately accessed patterns)'));
    console.log(chalk.gray('    Cold tier: 3-bit quantization (rarely accessed patterns)'));
    console.log(chalk.gray('    Estimated memory savings: 40-60% for cold patterns'));
  }

  console.log('');
}

// ============================================================================
// Command: ruvector flags
// ============================================================================

function executeFlags(options: FlagsOptions): void {
  // Handle --profile
  if (options.profile) {
    if (!isValidProfile(options.profile)) {
      console.log('');
      console.log(chalk.red(`  Unknown profile: ${options.profile}`));
      console.log(chalk.gray(`  Valid profiles: ${Object.keys(PROFILES).join(', ')}`));
      console.log('');
      process.exit(1);
      return;
    }

    const profileFlags = PROFILES[options.profile];
    setRuVectorFeatureFlags(profileFlags);

    console.log('');
    console.log(chalk.bold.blue(`Setting ${options.profile} profile:`));
    for (const [key, value] of Object.entries(profileFlags)) {
      const valueText = value ? chalk.green('true') : chalk.gray('false');
      console.log(`  ${padRight(key + ':', 30)} ${valueText}`);
    }
    console.log('');
    return;
  }

  // Handle --set
  if (options.set) {
    const eqIdx = options.set.indexOf('=');
    if (eqIdx <= 0) {
      console.log('');
      console.log(chalk.red('  Invalid format. Use: --set flagName=true|false'));
      console.log('');
      process.exit(1);
      return;
    }

    const flagName = options.set.substring(0, eqIdx);
    const flagValue = options.set.substring(eqIdx + 1);

    if (!isValidFlagName(flagName)) {
      console.log('');
      console.log(chalk.red(`  Unknown flag: ${flagName}`));
      console.log(chalk.gray(`  Valid flags: ${VALID_FLAG_NAMES.join(', ')}`));
      console.log('');
      process.exit(1);
      return;
    }

    if (flagValue !== 'true' && flagValue !== 'false') {
      console.log('');
      console.log(chalk.red(`  Invalid value: ${flagValue}. Use true or false.`));
      console.log('');
      process.exit(1);
      return;
    }

    const boolValue = flagValue === 'true';
    setRuVectorFeatureFlags({ [flagName]: boolValue });

    const valueText = boolValue ? chalk.green('true') : chalk.gray('false');
    console.log('');
    console.log(chalk.green(`  Set ${flagName} = ${valueText}`));
    console.log('');
    return;
  }

  // Default: list all flags
  const flags = getRuVectorFeatureFlags();

  console.log('');
  console.log(chalk.bold.blue('RuVector Feature Flags:'));
  console.log('');

  console.log(chalk.bold(
    '  ' + padRight('Flag', 28) + padRight('Value', 10) + 'Description'
  ));
  console.log(chalk.gray('  ' + '-'.repeat(78)));

  for (const flagName of VALID_FLAG_NAMES) {
    const value = flags[flagName];
    const isDefault = isDefaultValue(flagName, value);
    const valueText = value ? chalk.green('true') : chalk.gray('false');
    const suffix = isDefault ? '' : chalk.yellow(' *');
    const description = FLAG_DESCRIPTIONS[flagName];
    console.log(
      '  ' +
      padRight(flagName, 28) +
      padRight(String(value), 10) +
      chalk.gray(description) +
      suffix
    );
  }

  console.log('');
  console.log(chalk.gray('  * = modified from default'));
  console.log('');
  console.log(chalk.gray('  Profiles: performance, experimental, safe'));
  console.log(chalk.gray('  Usage:'));
  console.log(chalk.gray('    aqe ruvector flags --set useNativeHNSW=true'));
  console.log(chalk.gray('    aqe ruvector flags --profile=performance'));
  console.log('');
}

// ============================================================================
// Command Factory
// ============================================================================

/**
 * Create the ruvector command group
 */
export function createRuVectorCommand(): Command {
  const ruvectorCmd = new Command('ruvector')
    .description('RuVector integration management')
    .addHelpText('after', `
Examples:
  $ aqe ruvector status                     Show native packages and flags
  $ aqe ruvector flags                      List all feature flags
  $ aqe ruvector flags --set useNativeHNSW=true   Toggle a flag
  $ aqe ruvector flags --profile=performance      Apply a preset profile
`);

  // ruvector status
  ruvectorCmd
    .command('status')
    .description('Show native package availability and feature flag status')
    .action(() => {
      executeStatus();
    });

  // ruvector flags
  ruvectorCmd
    .command('flags')
    .description('List, set, or apply profiles to feature flags')
    .option('-s, --set <flag=value>', 'Set a feature flag (e.g., useNativeHNSW=true)')
    .option('-p, --profile <name>', 'Apply a preset profile (performance|experimental|safe)')
    .action((options: FlagsOptions) => {
      executeFlags(options);
    });

  return ruvectorCmd;
}

export default createRuVectorCommand;
