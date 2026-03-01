/**
 * Agentic QE v3 - CI/CD Configuration Parser
 *
 * Parses and validates .aqe-ci.yml files for CI/CD pipeline integration.
 * Provides a higher-level CI-specific config that maps to existing domain APIs.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseYAMLContent } from './workflow-parser.js';

// ============================================================================
// CI Config Types
// ============================================================================

/** Phase types with well-known CI semantics */
export type CIPhaseType = 'test' | 'coverage' | 'security' | 'quality-gate' | 'code-intelligence' | 'custom';

/** A single CI phase */
export interface CIPhase {
  /** Phase name (used in output and reports) */
  name: string;
  /** Phase type determines which domain API to call */
  type: CIPhaseType;
  /** Whether this phase is enabled (default: true) */
  enabled: boolean;
  /** Phase-specific configuration */
  config: Record<string, unknown>;
  /** Continue pipeline on failure (default: false) */
  continueOnFailure: boolean;
  /** Timeout in seconds */
  timeout: number;
}

/** Output configuration */
export interface CIOutputConfig {
  /** Default format for all phases (overridable per-phase) */
  format: string;
  /** Directory for output artifacts */
  directory: string;
  /** Whether to generate a combined report */
  combinedReport: boolean;
}

/** Quality gate configuration */
export interface CIQualityGate {
  /** Whether the quality gate is enforced */
  enforced: boolean;
  /** Threshold criteria */
  thresholds: {
    coverage?: number;
    security?: string;  // 'none' | 'low' | 'medium' | 'high'
    quality?: number;
  };
}

/** Top-level CI config */
export interface CIConfig {
  /** Config version */
  version: string;
  /** Project name */
  name: string;
  /** Phases to execute */
  phases: CIPhase[];
  /** Output configuration */
  output: CIOutputConfig;
  /** Quality gate */
  qualityGate: CIQualityGate;
}

/** Result of running a single phase */
export interface CIPhaseResult {
  phase: string;
  type: CIPhaseType;
  status: 'passed' | 'failed' | 'skipped' | 'warning';
  duration: number;
  exitCode: number;
  summary: string;
  artifacts: string[];
  details?: Record<string, unknown>;
}

/** Result of the full CI run */
export interface CIRunResult {
  config: string;
  startedAt: Date;
  completedAt: Date;
  duration: number;
  phases: CIPhaseResult[];
  qualityGatePassed: boolean;
  overallStatus: 'passed' | 'failed' | 'warning';
  exitCode: number;
}

// ============================================================================
// Default Config
// ============================================================================

const DEFAULT_CI_CONFIG: CIConfig = {
  version: '1',
  name: 'aqe-ci',
  phases: [
    {
      name: 'Test Generation',
      type: 'test',
      enabled: true,
      config: { target: '.', framework: 'vitest', type: 'unit' },
      continueOnFailure: false,
      timeout: 300,
    },
    {
      name: 'Coverage Analysis',
      type: 'coverage',
      enabled: true,
      config: { target: '.', threshold: 80 },
      continueOnFailure: true,
      timeout: 300,
    },
    {
      name: 'Security Scan',
      type: 'security',
      enabled: true,
      config: { sast: true },
      continueOnFailure: true,
      timeout: 300,
    },
    {
      name: 'Quality Gate',
      type: 'quality-gate',
      enabled: true,
      config: {},
      continueOnFailure: false,
      timeout: 60,
    },
  ],
  output: {
    format: 'json',
    directory: '.aqe-ci-output',
    combinedReport: true,
  },
  qualityGate: {
    enforced: true,
    thresholds: {
      coverage: 80,
      security: 'medium',
      quality: 70,
    },
  },
};

// ============================================================================
// Config Discovery
// ============================================================================

const CONFIG_FILENAMES = ['.aqe-ci.yml', '.aqe-ci.yaml', 'aqe-ci.yml', 'aqe-ci.yaml'];

/**
 * Find .aqe-ci.yml config file by searching up from given directory.
 */
export function findCIConfigFile(startDir: string = process.cwd()): string | null {
  let dir = path.resolve(startDir);

  for (let i = 0; i < 10; i++) {
    for (const filename of CONFIG_FILENAMES) {
      const filePath = path.join(dir, filename);
      if (fs.existsSync(filePath)) {
        return filePath;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

// ============================================================================
// Config Parser
// ============================================================================

export interface CIConfigParseResult {
  success: boolean;
  config?: CIConfig;
  errors: string[];
  configPath?: string;
}

/**
 * Parse a .aqe-ci.yml file into a CIConfig.
 */
export function parseCIConfigFile(filePath: string): CIConfigParseResult {
  if (!fs.existsSync(filePath)) {
    return { success: false, errors: [`Config file not found: ${filePath}`] };
  }

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    return { success: false, errors: [`Failed to read config: ${err}`] };
  }

  return parseCIConfigContent(content, filePath);
}

/**
 * Parse CI config YAML content.
 */
export function parseCIConfigContent(content: string, sourcePath?: string): CIConfigParseResult {
  const errors: string[] = [];

  let parsed: Record<string, unknown>;
  try {
    parsed = parseYAMLContent(content);
  } catch (err) {
    return { success: false, errors: [`Invalid YAML: ${err}`] };
  }

  // Build config with defaults
  const config: CIConfig = {
    version: (parsed.version as string) || DEFAULT_CI_CONFIG.version,
    name: (parsed.name as string) || DEFAULT_CI_CONFIG.name,
    phases: [],
    output: { ...DEFAULT_CI_CONFIG.output },
    qualityGate: { ...DEFAULT_CI_CONFIG.qualityGate, thresholds: { ...DEFAULT_CI_CONFIG.qualityGate.thresholds } },
  };

  // Parse output section
  if (parsed.output && typeof parsed.output === 'object') {
    const out = parsed.output as Record<string, unknown>;
    if (out.format) config.output.format = out.format as string;
    if (out.directory) config.output.directory = out.directory as string;
    if (out.combined_report !== undefined) config.output.combinedReport = out.combined_report as boolean;
  }

  // Parse quality_gate section
  if (parsed.quality_gate && typeof parsed.quality_gate === 'object') {
    const qg = parsed.quality_gate as Record<string, unknown>;
    if (qg.enforced !== undefined) config.qualityGate.enforced = qg.enforced as boolean;
    if (qg.thresholds && typeof qg.thresholds === 'object') {
      const th = qg.thresholds as Record<string, unknown>;
      if (th.coverage !== undefined) config.qualityGate.thresholds.coverage = th.coverage as number;
      if (th.security !== undefined) config.qualityGate.thresholds.security = th.security as string;
      if (th.quality !== undefined) config.qualityGate.thresholds.quality = th.quality as number;
    }
  }

  // Parse phases
  if (parsed.phases && Array.isArray(parsed.phases)) {
    for (let i = 0; i < parsed.phases.length; i++) {
      const p = parsed.phases[i] as Record<string, unknown>;
      if (!p.name) {
        errors.push(`Phase ${i + 1} must have a "name" field`);
        continue;
      }
      if (!p.type) {
        errors.push(`Phase "${p.name}" must have a "type" field`);
        continue;
      }

      const validTypes: CIPhaseType[] = ['test', 'coverage', 'security', 'quality-gate', 'code-intelligence', 'custom'];
      if (!validTypes.includes(p.type as CIPhaseType)) {
        errors.push(`Phase "${p.name}" has invalid type "${p.type}". Valid: ${validTypes.join(', ')}`);
        continue;
      }

      const phase: CIPhase = {
        name: p.name as string,
        type: p.type as CIPhaseType,
        enabled: p.enabled !== false,
        config: (p.config as Record<string, unknown>) || {},
        continueOnFailure: (p.continue_on_failure as boolean) || false,
        timeout: (p.timeout as number) || 300,
      };

      config.phases.push(phase);
    }
  } else {
    // Use defaults if no phases specified
    config.phases = [...DEFAULT_CI_CONFIG.phases];
  }

  if (config.phases.length === 0) {
    errors.push('Config must have at least one phase');
  }

  if (errors.length > 0) {
    return { success: false, config, errors };
  }

  return { success: true, config, errors: [], configPath: sourcePath };
}

/**
 * Get the default CI config (used when no .aqe-ci.yml exists).
 */
export function getDefaultCIConfig(): CIConfig {
  return {
    ...DEFAULT_CI_CONFIG,
    phases: DEFAULT_CI_CONFIG.phases.map(p => ({ ...p, config: { ...p.config } })),
    output: { ...DEFAULT_CI_CONFIG.output },
    qualityGate: { ...DEFAULT_CI_CONFIG.qualityGate, thresholds: { ...DEFAULT_CI_CONFIG.qualityGate.thresholds } },
  };
}
