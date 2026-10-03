/**
 * Agentic QE v3 - CI/CD Configuration Parser
 *
 * Parses and validates .aqe-ci.yml files for CI/CD pipeline integration.
 * Provides a higher-level CI-specific config that maps to existing domain APIs.
 */

import * as fs from 'fs';
import * as path from 'path';
import { isCollection, isScalar, parseDocument, visit } from 'yaml';

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
  /** Invalid phase selections fail before execution and retain a fresh report. */
  configurationError?: string;
  config: string;
  startedAt: Date;
  completedAt: Date;
  duration: number;
  phases: CIPhaseResult[];
  /** True only when at least one gate ran and every gate passed. */
  qualityGatePassed: boolean;
  qualityGateStatus: 'passed' | 'failed' | 'not-run';
  qualityGateEnforced: boolean;
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

const YAML_MAX_LINES = 10000;
const YAML_MAX_LINE_LENGTH = 10000;
const YAML_MAX_DEPTH = 20;
const UNSAFE_YAML_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

/** Keep the previous parser's input bounds; reject unsafe expanded aliases too. */
function parseCIYAML(content: string): Record<string, unknown> {
  const lines = content.split('\n');
  if (lines.length > YAML_MAX_LINES) throw new Error(`YAML exceeds maximum allowed lines (${YAML_MAX_LINES})`);
  if (lines.some(line => line.length > YAML_MAX_LINE_LENGTH)) {
    throw new Error(`YAML exceeds maximum line length (${YAML_MAX_LINE_LENGTH})`);
  }
  const document = parseDocument(content, { prettyErrors: false, merge: true });
  if (document.errors.length) throw new Error(document.errors.map(error => error.message).join('; '));
  visit(document, {
    Collection: (_key, _node, ancestry) => {
      if (ancestry.filter(isCollection).length >= YAML_MAX_DEPTH) {
        throw new Error(`YAML exceeds maximum depth (${YAML_MAX_DEPTH})`);
      }
    },
    Pair: (_key, pair) => {
      if (isScalar(pair.key) && UNSAFE_YAML_KEYS.has(String(pair.key.value))) {
        throw new Error(`Unsafe YAML key: ${pair.key.value}`);
      }
    },
  });
  const parsed: unknown = document.contents === null ? {} : document.toJS({ maxAliasCount: 100 });
  // Alias references may add nesting or cycles that the syntax tree does not show.
  function checkExpanded(value: unknown, depth: number, ancestors: Set<object>): void {
    if (value === null || typeof value !== 'object') return;
    if (depth > YAML_MAX_DEPTH) throw new Error(`YAML exceeds maximum depth (${YAML_MAX_DEPTH})`);
    if (ancestors.has(value)) throw new Error('Cyclic YAML aliases are not supported');
    ancestors.add(value);
    for (const child of Object.values(value)) checkExpanded(child, depth + 1, ancestors);
    ancestors.delete(value);
  }
  checkExpanded(parsed, 0, new Set());
  if (!isRecord(parsed)) throw new Error('CI config must be a YAML mapping');
  return parsed;
}

/** Parse CI YAML faithfully, validating typed fields before any phase executes. */
export function parseCIConfigContent(content: string, sourcePath?: string): CIConfigParseResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = parseCIYAML(content);
  } catch (err) {
    return { success: false, errors: [`Invalid YAML: ${err}`] };
  }
  const errors: string[] = [];
  const config = getDefaultCIConfig();
  function readString(record: Record<string, unknown>, key: string, fallback: string, label: string): string {
    const value = record[key];
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !value.trim()) {
      errors.push(`${label} must be a non-empty string`);
      return fallback;
    }
    return value;
  }
  function readBoolean(record: Record<string, unknown>, key: string, fallback: boolean, label: string): boolean {
    const value = record[key];
    if (value === undefined) return fallback;
    if (typeof value !== 'boolean') {
      errors.push(`${label} must be a boolean`);
      return fallback;
    }
    return value;
  }
  if (parsed.version !== undefined) {
    if (typeof parsed.version === 'number' && Number.isFinite(parsed.version)) config.version = String(parsed.version);
    else config.version = readString(parsed, 'version', config.version, 'version');
  }
  config.name = readString(parsed, 'name', config.name, 'name');
  if (parsed.output !== undefined) {
    if (!isRecord(parsed.output)) errors.push('output must be a mapping');
    else {
      config.output.format = readString(parsed.output, 'format', config.output.format, 'output.format');
      config.output.directory = readString(parsed.output, 'directory', config.output.directory, 'output.directory');
      config.output.combinedReport = readBoolean(parsed.output, 'combined_report', config.output.combinedReport, 'output.combined_report');
    }
  }
  if (parsed.quality_gate !== undefined) {
    if (!isRecord(parsed.quality_gate)) errors.push('quality_gate must be a mapping');
    else {
      const gate = parsed.quality_gate;
      config.qualityGate.enforced = readBoolean(gate, 'enforced', config.qualityGate.enforced, 'quality_gate.enforced');
      if (gate.thresholds !== undefined) {
        if (!isRecord(gate.thresholds)) errors.push('quality_gate.thresholds must be a mapping');
        else {
          for (const key of ['coverage', 'quality'] as const) {
            const value = gate.thresholds[key];
            if (value === undefined) continue;
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
              errors.push(`quality_gate.thresholds.${key} must be a finite number between 0 and 100`);
            } else config.qualityGate.thresholds[key] = value;
          }
          if (gate.thresholds.security !== undefined) {
            const value = gate.thresholds.security;
            if (typeof value !== 'string' || !['none', 'low', 'medium', 'high'].includes(value)) {
              errors.push('quality_gate.thresholds.security must be none, low, medium or high');
            } else config.qualityGate.thresholds.security = value;
          }
        }
      }
    }
  }
  if (parsed.phases !== undefined) {
    config.phases = [];
    if (!Array.isArray(parsed.phases)) errors.push('phases must be a sequence');
    else for (const [index, value] of parsed.phases.entries()) {
      if (!isRecord(value)) {
        errors.push(`Phase ${index + 1} must be a mapping`);
        continue;
      }
      if (value.name === undefined) errors.push(`Phase ${index + 1} must have a name`);
      const name = readString(value, 'name', '', `Phase ${index + 1} name`);
      const validTypes: CIPhaseType[] = ['test', 'coverage', 'security', 'quality-gate', 'code-intelligence', 'custom'];
      if (!validTypes.includes(value.type as CIPhaseType)) {
        errors.push(`Phase "${name}" has invalid type "${value.type}". Valid: ${validTypes.join(', ')}`);
        continue;
      }
      let timeout = 300;
      if (value.timeout !== undefined) {
        if (typeof value.timeout !== 'number' || !Number.isFinite(value.timeout) || value.timeout <= 0) {
          errors.push(`Phase "${name}" timeout must be a positive finite number`);
        } else timeout = value.timeout;
      }
      if (value.config !== undefined && !isRecord(value.config)) errors.push(`Phase "${name}" config must be a mapping`);
      config.phases.push({
        name, type: value.type as CIPhaseType, timeout,
        enabled: readBoolean(value, 'enabled', true, `Phase "${name}" enabled`),
        continueOnFailure: readBoolean(value, 'continue_on_failure', false, `Phase "${name}" continue_on_failure`),
        config: isRecord(value.config) ? { ...value.config } : {},
      });
    }
  }
  if (config.phases.length === 0) errors.push('Config must have at least one phase');
  // Paths in a file are relative to that file's project, not the caller's cwd.
  // Resolve existing ancestors too so a symlink cannot bypass containment.
  const root = path.resolve(sourcePath ? path.dirname(sourcePath) : process.cwd());
  function canonicalAncestor(candidate: string): string {
    let ancestor = candidate;
    const suffix: string[] = [];
    while (!fs.existsSync(ancestor)) {
      const parent = path.dirname(ancestor);
      if (parent === ancestor) break;
      suffix.unshift(path.basename(ancestor));
      ancestor = parent;
    }
    return path.resolve(fs.realpathSync(ancestor), ...suffix);
  }
  function containedPath(value: unknown, label: string): string | undefined {
    if (typeof value !== 'string' || !value.trim() || value.includes('\0')) {
      errors.push(`${label} must be a non-empty relative path`);
      return undefined;
    }
    const resolved = path.resolve(root, value);
    const relative = path.relative(root, resolved);
    if (path.isAbsolute(value) || path.win32.isAbsolute(value) ||
        relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      errors.push(`${label} must stay inside the project and use a relative path`);
      return undefined;
    }
    try {
      const realRelative = path.relative(canonicalAncestor(root), canonicalAncestor(resolved));
      if (realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) {
        errors.push(`${label} must stay inside the project (symlink escapes are not allowed)`);
        return undefined;
      }
    } catch (error) {
      errors.push(`${label} cannot be resolved safely: ${error}`);
      return undefined;
    }
    return sourcePath ? resolved : value;
  }
  config.output.directory = containedPath(config.output.directory, 'output.directory') ?? config.output.directory;
  for (const phase of config.phases) {
    if (phase.config.target !== undefined) {
      const target = containedPath(phase.config.target, `Phase "${phase.name}" config.target`);
      if (target !== undefined) phase.config.target = target;
    }
  }
  if (errors.length > 0) return { success: false, config, errors };
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
