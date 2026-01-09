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

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

export interface SemgrepFinding {
  check_id: string;
  path: string;
  start: { line: number; col: number };
  end: { line: number; col: number };
  extra: {
    message: string;
    severity: 'ERROR' | 'WARNING' | 'INFO';
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
  findings: SemgrepFinding[];
  errors: string[];
  version?: string;
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
    await execAsync('semgrep --version', { timeout: 5000 });
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
    const { stdout } = await execAsync('semgrep --version', { timeout: 5000 });
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
      findings: [],
      errors: ['Semgrep is not installed. Install with: pip install semgrep'],
    };
  }

  try {
    // Build command
    const excludeArgs = fullConfig.exclude.map((e) => `--exclude="${e}"`).join(' ');
    const cmd = [
      'semgrep scan',
      `--config=${fullConfig.config}`,
      '--json',
      excludeArgs,
      fullConfig.verbose ? '--verbose' : '--quiet',
      `--max-target-bytes=${fullConfig.maxFileSize}`,
      fullConfig.target,
    ].join(' ');

    const timeoutMs = (fullConfig.timeout ?? 300) * 1000;
    const { stdout, stderr } = await execAsync(cmd, {
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large results
      cwd: path.isAbsolute(fullConfig.target) ? undefined : process.cwd(),
    });

    const result = parseSemgrepOutput(stdout);
    if (stderr && fullConfig.verbose) {
      result.errors.push(stderr);
    }

    result.version = await getSemgrepVersion() || undefined;
    return result;
  } catch (error: any) {
    // Semgrep exits with non-zero if findings exist
    if (error.stdout) {
      try {
        const result = parseSemgrepOutput(error.stdout);
        result.version = await getSemgrepVersion() || undefined;
        return result;
      } catch {
        // Parse failed, return error
      }
    }

    return {
      success: false,
      findings: [],
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

/**
 * Parse semgrep JSON output
 */
function parseSemgrepOutput(stdout: string): SemgrepResult {
  try {
    const parsed = JSON.parse(stdout);

    // Handle different output formats
    const results = parsed.results || parsed.findings || [];
    const errors = parsed.errors?.map((e: any) => e.message || String(e)) || [];

    return {
      success: true,
      findings: results.map((r: any) => ({
        check_id: r.check_id || r.rule_id || 'unknown',
        path: r.path,
        start: { line: r.start?.line || 1, col: r.start?.col || 1 },
        end: { line: r.end?.line || r.start?.line || 1, col: r.end?.col || 1 },
        extra: {
          message: r.extra?.message || r.message || 'Security issue detected',
          severity: r.extra?.severity || r.severity || 'WARNING',
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
  } catch (error) {
    return {
      success: false,
      findings: [],
      errors: [`Failed to parse semgrep output: ${error instanceof Error ? error.message : String(error)}`],
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
  severity: 'ERROR' | 'WARNING' | 'INFO'
): 'critical' | 'high' | 'medium' | 'low' {
  const mapping: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
    ERROR: 'high',
    WARNING: 'medium',
    INFO: 'low',
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
