/**
 * Agentic QE v3 - Semgrep Integration
 *
 * REAL IMPLEMENTATION that integrates with Semgrep SAST scanner.
 * Semgrep is an open-source static analysis tool that finds bugs and enforces code standards.
 *
 * This module shells out to semgrep when available, with graceful fallback
 * to pattern-based scanning when semgrep is not installed.
 *
 * @module security-compliance/semgrep-integration
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { safeJsonParse } from '../../../shared/safe-json.js';

const execFileAsync = promisify(execFile);

// ============================================================================
// Types
// ============================================================================

// Semgrep's match_severity schema retains legacy/deprecated values as well as
// CRITICAL/HIGH/MEDIUM/LOW introduced in 1.72.0.
const SEMGREP_SEVERITIES = ['ERROR', 'WARNING', 'INFO', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'EXPERIMENT', 'INVENTORY'] as const;
export type SemgrepSeverity = typeof SEMGREP_SEVERITIES[number];

export interface SemgrepFinding {
  check_id: string;
  path: string;
  start: { line: number; col: number };
  end: { line: number; col: number };
  extra: {
    message: string;
    severity: SemgrepSeverity;
    lines: string;
    metadata?: {
      cwe?: string[];
      owasp?: string[];
      category?: string;
      description?: string;
      fix?: string;
      references?: string[];
      confidence?: string;
    };
  };
}

export interface SemgrepResult {
  success: boolean;
  /** Optional only for compatibility with legacy adapters. */
  status?: 'completed' | 'partial' | 'failed' | 'unavailable';
  findings: SemgrepFinding[];
  errors: string[];
  /** Sanitized non-fatal diagnostics, separate from analysis failures. */
  diagnostics?: string[];
  version?: string;
}

/**
 * Raw semgrep JSON output error entry
 */
interface SemgrepRawError {
  message?: string;
}

/**
 * Raw semgrep JSON output finding
 */
interface SemgrepRawFinding {
  check_id?: string;
  rule_id?: string;
  path: string;
  start?: { line?: number; col?: number };
  end?: { line?: number; col?: number };
  message?: string;
  severity?: string;
  extra?: {
    message?: string;
    severity?: string;
    lines?: string;
    fix?: string;
    metadata?: {
      cwe?: string[];
      owasp?: string[];
      category?: string;
      description?: string;
      fix?: string;
      references?: string[];
      confidence?: string;
    };
  };
  metadata?: {
    cwe?: string[];
    owasp?: string[];
    category?: string;
    description?: string;
    references?: string[];
    confidence?: string;
  };
}

/**
 * Raw semgrep JSON output
 */
interface SemgrepRawOutput {
  results?: SemgrepRawFinding[];
  findings?: SemgrepRawFinding[];
  errors?: SemgrepRawError[];
}

export interface SemgrepConfig {
  /** Target directory to scan */
  target: string;
  /** Semgrep config (default: 'auto') */
  config: string;
  /** Patterns to exclude */
  exclude: string[];
  /** Maximum file size to scan (bytes) */
  maxFileSize?: number;
  /** Timeout in seconds */
  timeout?: number;
  /** Include verbose output */
  verbose?: boolean;
}

// ============================================================================
// Semgrep Integration
// ============================================================================

/**
 * Check if semgrep is installed and available
 */
export async function isSemgrepAvailable(): Promise<boolean> {
  try {
    await execFileAsync('semgrep', ['--version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get semgrep version if available
 */
export async function getSemgrepVersion(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('semgrep', ['--version'], { timeout: 5000 });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Run semgrep scan on target directory
 */
export async function runSemgrep(config: Partial<SemgrepConfig>): Promise<SemgrepResult> {
  const fullConfig: SemgrepConfig = {
    target: config.target || '.',
    config: config.config || 'auto',
    exclude: config.exclude || ['node_modules', '.git', 'dist', 'build', 'coverage'],
    maxFileSize: config.maxFileSize || 5000000, // 5MB
    timeout: config.timeout || 300,
    verbose: config.verbose || false,
  };

  // Check availability
  const available = await isSemgrepAvailable();
  if (!available) {
    return {
      success: false,
      status: 'unavailable',
      findings: [],
      errors: ['Semgrep is unavailable.'],
    };
  }

  try {
    // Build command arguments array (prevents shell injection)
    const args: string[] = [
      'scan',
      `--config=${fullConfig.config}`,
      '--json',
      fullConfig.verbose ? '--verbose' : '--quiet',
      `--max-target-bytes=${fullConfig.maxFileSize}`,
    ];

    // Add exclude patterns safely as separate arguments
    for (const excludePattern of fullConfig.exclude) {
      args.push(`--exclude=${excludePattern}`);
    }

    // Add target path last
    args.push(fullConfig.target);

    const timeoutMs = (fullConfig.timeout ?? 300) * 1000;
    // Use execFileAsync with array args to prevent command injection
    const { stdout, stderr } = await execFileAsync('semgrep', args, {
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large results
      cwd: path.isAbsolute(fullConfig.target) ? undefined : process.cwd(),
    });

    const result = parseSemgrepOutput(stdout);
    if (stderr && fullConfig.verbose) {
      result.diagnostics = ['Semgrep emitted diagnostic output.'];
    }

    result.version = await getSemgrepVersion() || undefined;
    return result;
  } catch (error: unknown) {
    const execError = error as { stdout?: string; code?: unknown; killed?: boolean; signal?: unknown };
    if (typeof execError.stdout === 'string' && execError.stdout.length > 0) {
      const result = parseSemgrepOutput(execError.stdout);
      // Exit 1 can represent findings with --error. Other process failures cannot
      // be converted into success just because stdout contains valid JSON.
      if (execError.code === 1 && !execError.killed && !execError.signal && result.success && result.findings.length > 0) {
        return result;
      }
      return { ...result, success: false, status: 'failed',
        errors: [...result.errors, 'Semgrep process did not complete successfully.'] };
    }
    return {
      success: false, status: 'failed', findings: [],
      errors: ['Semgrep execution failed.'],
    };
  }
}

/**
 * Parse semgrep JSON output
 */
function parseSemgrepOutput(stdout: string): SemgrepResult {
  try {
    const parsed = safeJsonParse(stdout) as SemgrepRawOutput;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Expected a JSON object');
    }
    const rawResults = parsed.results ?? parsed.findings;
    if (!Array.isArray(rawResults) || (parsed.errors !== undefined && !Array.isArray(parsed.errors))) {
      throw new Error('Missing or invalid result collection');
    }
    const isRecord = (value: unknown): value is Record<string, unknown> =>
      !!value && typeof value === 'object' && !Array.isArray(value);
    const optionalText = (value: unknown): boolean => value === undefined || typeof value === 'string';
    const validSeverity = (value: unknown): boolean => value === undefined
      || (typeof value === 'string' && (SEMGREP_SEVERITIES as readonly string[]).includes(value));
    const validPosition = (value: unknown): boolean => value === undefined || (isRecord(value)
      && ['line', 'col'].every(key => value[key] === undefined
        || (typeof value[key] === 'number' && Number.isSafeInteger(value[key]) && (value[key] as number) > 0)));
    const validMetadata = (value: unknown): boolean => value === undefined || (isRecord(value)
      && ['cwe', 'owasp', 'references'].every(key => value[key] === undefined
        || (Array.isArray(value[key]) && (value[key] as unknown[]).every(item => typeof item === 'string')))
      && ['category', 'description', 'fix', 'confidence'].every(key => optionalText(value[key])));
    const validFinding = (value: SemgrepRawFinding): boolean => {
      if (!isRecord(value)) return false;
      const id = value.check_id ?? value.rule_id;
      if (typeof value.path !== 'string' || value.path.length === 0 || typeof id !== 'string' || id.length === 0
          || !validPosition(value.start) || !validPosition(value.end)
          || !optionalText(value.message) || !validSeverity(value.severity) || !validMetadata(value.metadata)) return false;
      const extra: unknown = value.extra;
      return extra === undefined || (isRecord(extra)
        && ['message', 'lines', 'fix'].every(key => optionalText(extra[key]))
        && validSeverity(extra.severity) && validMetadata(extra.metadata));
    };
    const results = rawResults.filter(validFinding);
    const malformed = rawResults.length - results.length;
    const errors: string[] = [];
    if (parsed.errors?.length) errors.push(`Semgrep reported ${parsed.errors.length} analysis error(s).`);
    if (malformed) errors.push(`Semgrep returned ${malformed} malformed finding(s).`);

    return {
      success: errors.length === 0,
      status: errors.length === 0 ? 'completed' : 'partial',
      findings: results.map(r => ({
        check_id: r.check_id || r.rule_id || 'unknown',
        path: r.path,
        start: { line: r.start?.line || 1, col: r.start?.col || 1 },
        end: { line: r.end?.line || r.start?.line || 1, col: r.end?.col || 1 },
        extra: {
          message: r.extra?.message || r.message || 'Security issue detected',
          severity: (r.extra?.severity || r.severity || 'WARNING') as SemgrepSeverity,
          lines: r.extra?.lines || '',
          metadata: {
            cwe: r.extra?.metadata?.cwe || r.metadata?.cwe,
            owasp: r.extra?.metadata?.owasp || r.metadata?.owasp,
            category: r.extra?.metadata?.category || r.metadata?.category,
            description: r.extra?.metadata?.description || r.metadata?.description,
            fix: r.extra?.metadata?.fix || r.extra?.fix,
            references: r.extra?.metadata?.references || r.metadata?.references,
            confidence: r.extra?.metadata?.confidence || r.metadata?.confidence,
          },
        },
      })),
      errors,
    };
  } catch {
    return {
      success: false,
      status: 'failed',
      findings: [],
      errors: ['Invalid Semgrep output.'],
    };
  }
}

/**
 * Run semgrep with specific rule sets
 */
export async function runSemgrepWithRules(
  target: string,
  rules: string[],
  options?: Partial<SemgrepConfig>
): Promise<SemgrepResult> {
  // Map rule IDs to semgrep configs
  const configMapping: Record<string, string> = {
    'owasp-top-10': 'p/owasp-top-ten',
    'cwe-sans-25': 'p/cwe-top-25',
    'nodejs-security': 'p/nodejs',
    'typescript-security': 'p/typescript',
    'javascript-security': 'p/javascript',
    'react-security': 'p/react',
    'express-security': 'p/express',
    'secrets': 'p/secrets',
    'sql-injection': 'p/sql-injection',
    'xss': 'p/xss',
    'command-injection': 'p/command-injection',
    'path-traversal': 'p/path-traversal',
  };

  // Convert rule IDs to semgrep configs
  const configs = rules
    .map((r) => configMapping[r] || `p/${r}`)
    .join(',');

  return runSemgrep({
    ...options,
    target,
    config: configs || 'auto',
  });
}

/**
 * Map semgrep severity to standard severity
 */
export function mapSemgrepSeverity(
  severity: SemgrepSeverity
): 'critical' | 'high' | 'medium' | 'low' {
  const mapping: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
    ERROR: 'high',
    WARNING: 'medium',
    INFO: 'low',
    CRITICAL: 'critical',
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low',
    // Retain the existing non-risky INFO mapping for deprecated categories.
    EXPERIMENT: 'low',
    INVENTORY: 'low',
  };
  return mapping[severity] || 'medium';
}

/**
 * Convert semgrep findings to a generic format
 */
export function convertSemgrepFindings(findings: SemgrepFinding[]): Array<{
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  file: string;
  line: number;
  column: number;
  snippet: string;
  cweId?: string;
  owaspCategory?: string;
  remediation: string;
  references: string[];
}> {
  return findings.map((f) => ({
    id: f.check_id,
    title: f.check_id.split('.').pop() || f.check_id,
    description: f.extra.message,
    severity: mapSemgrepSeverity(f.extra.severity),
    file: f.path,
    line: f.start.line,
    column: f.start.col,
    snippet: f.extra.lines,
    cweId: f.extra.metadata?.cwe?.[0],
    owaspCategory: f.extra.metadata?.owasp?.[0],
    remediation: f.extra.metadata?.fix || 'Review and fix the identified security issue',
    references: f.extra.metadata?.references || [],
  }));
}
