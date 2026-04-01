/**
 * Agentic QE v3 - Plugin Security (IMP-09)
 *
 * Security validation for plugins:
 * - Name impersonation prevention (reserved namespaces)
 * - Path traversal prevention in entry points and hook handlers
 * - Non-ASCII name blocking
 * - Hook policy integration (leverages IMP-07 hook security)
 */

import type { QEPluginManifest } from './manifest';

// ============================================================================
// Types
// ============================================================================

export interface SecurityCheckResult {
  safe: boolean;
  violations: string[];
}

// ============================================================================
// Constants
// ============================================================================

/** Prefixes reserved for first-party plugins */
const RESERVED_PREFIXES = [
  'aqe-core-',
  'agentic-qe-core-',
  'agentic-qe-internal-',
];

/** Names that cannot be used (exact match) */
const RESERVED_NAMES = new Set([
  'aqe',
  'agentic-qe',
  'ruflo',
  'claude-flow',
]);

/** Dangerous path patterns */
const DANGEROUS_PATH_PATTERNS = [
  '..',             // directory traversal
  '~',              // home directory expansion
  '/etc/',          // system config
  '/proc/',         // process info
  '/dev/',          // devices
  'node_modules/',  // dependency injection
];

// ============================================================================
// Plugin Security Checks
// ============================================================================

/**
 * Run all security checks on a plugin manifest.
 */
export function checkPluginSecurity(manifest: QEPluginManifest): SecurityCheckResult {
  const violations: string[] = [];

  checkName(manifest.name, violations);
  checkEntryPoint(manifest.entryPoint, violations);
  checkHookPaths(manifest.hooks, violations);
  checkPermissions(manifest.permissions, violations);

  return {
    safe: violations.length === 0,
    violations,
  };
}

/**
 * Validate that a plugin name is safe to use.
 */
export function isNameSafe(name: string): boolean {
  const violations: string[] = [];
  checkName(name, violations);
  return violations.length === 0;
}

// ============================================================================
// Internal Checks
// ============================================================================

function checkName(name: string, violations: string[]): void {
  // Non-ASCII check
  // eslint-disable-next-line no-control-regex
  if (/[^\x20-\x7E]/.test(name)) {
    violations.push(`Plugin name "${name}" contains non-ASCII characters`);
  }

  // Reserved exact names
  if (RESERVED_NAMES.has(name.toLowerCase())) {
    violations.push(`Plugin name "${name}" is a reserved name`);
  }

  // Reserved prefixes
  for (const prefix of RESERVED_PREFIXES) {
    if (name.toLowerCase().startsWith(prefix)) {
      violations.push(`Plugin name "${name}" uses reserved prefix "${prefix}"`);
    }
  }

  // Homoglyph detection: block names that look like reserved names
  // (simplified — checks for common substitutions)
  const normalized = name
    .toLowerCase()
    .replace(/[0o]/g, 'o')
    .replace(/[1il]/g, 'l')
    .replace(/[-_]/g, '');
  if (RESERVED_NAMES.has(normalized)) {
    violations.push(`Plugin name "${name}" is visually similar to a reserved name`);
  }
}

function checkEntryPoint(entryPoint: string, violations: string[]): void {
  checkPath(entryPoint, 'entryPoint', violations);

  // Must be relative
  if (entryPoint.startsWith('/') || entryPoint.startsWith('\\')) {
    violations.push('entryPoint must be a relative path, not absolute');
  }
}

function checkHookPaths(hooks: Record<string, string> | undefined, violations: string[]): void {
  if (!hooks) return;

  for (const [event, handlerPath] of Object.entries(hooks)) {
    checkPath(handlerPath, `hook[${event}]`, violations);
  }
}

function checkPath(p: string, label: string, violations: string[]): void {
  for (const pattern of DANGEROUS_PATH_PATTERNS) {
    if (p.includes(pattern)) {
      violations.push(`${label} contains dangerous path pattern "${pattern}"`);
    }
  }

  // Check for null bytes (path injection)
  if (p.includes('\0')) {
    violations.push(`${label} contains null byte (path injection attempt)`);
  }
}

function checkPermissions(permissions: string[] | undefined, violations: string[]): void {
  if (!permissions) return;

  const dangerous = ['fs:write-root', 'net:arbitrary', 'exec:shell'];
  for (const perm of permissions) {
    if (dangerous.includes(perm)) {
      violations.push(`Plugin requests dangerous permission: ${perm}`);
    }
  }
}
