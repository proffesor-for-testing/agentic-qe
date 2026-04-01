/**
 * Agentic QE v3 - Plugin Manifest Schema & Validation (IMP-09)
 *
 * Defines the `qe-plugin.json` manifest format that external QE domain
 * plugins must provide. Includes validation logic for name, version,
 * entry point, and permissions.
 */

import type { DomainName } from '../shared/types';

// ============================================================================
// Types
// ============================================================================

export interface QEPluginManifest {
  /** Plugin name (e.g., "aqe-plugin-sap-testing") */
  name: string;
  /** Semantic version */
  version: string;
  /** Human-readable description */
  description: string;
  /** Author name or org */
  author: string;
  /** Domains this plugin adds or extends */
  domains: DomainName[];
  /** Dependencies on other plugins (name -> semver range) */
  dependencies?: Record<string, string>;
  /** Relative path to the main module entry point */
  entryPoint: string;
  /** Hook event -> handler path mappings */
  hooks?: Record<string, string>;
  /** Minimum AQE version required */
  minAqeVersion?: string;
  /** Required permissions */
  permissions?: string[];
}

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// Constants
// ============================================================================

/** Regex for valid plugin names: lowercase, alphanumeric, hyphens */
const VALID_NAME_REGEX = /^[a-z][a-z0-9-]*$/;

/** Regex for semver: major.minor.patch with optional pre-release */
const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;

/** Reserved name prefixes that third-party plugins cannot use */
const RESERVED_PREFIXES = ['aqe-core-', 'agentic-qe-core-'];

/** Maximum name length */
const MAX_NAME_LENGTH = 64;

/** Maximum description length */
const MAX_DESCRIPTION_LENGTH = 500;

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate a plugin manifest. Returns structured errors and warnings.
 */
export function validateManifest(manifest: unknown): ManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['Manifest must be a non-null object'], warnings: [] };
  }

  const m = manifest as Record<string, unknown>;

  // --- Required fields ---
  if (!m.name || typeof m.name !== 'string') {
    errors.push('name is required and must be a string');
  } else {
    validateName(m.name, errors, warnings);
  }

  if (!m.version || typeof m.version !== 'string') {
    errors.push('version is required and must be a string');
  } else if (!SEMVER_REGEX.test(m.version)) {
    errors.push(`version "${m.version}" is not valid semver (expected: major.minor.patch)`);
  }

  if (!m.description || typeof m.description !== 'string') {
    errors.push('description is required and must be a string');
  } else if (m.description.length > MAX_DESCRIPTION_LENGTH) {
    warnings.push(`description exceeds ${MAX_DESCRIPTION_LENGTH} characters`);
  }

  if (!m.author || typeof m.author !== 'string') {
    errors.push('author is required and must be a string');
  }

  if (!Array.isArray(m.domains) || m.domains.length === 0) {
    errors.push('domains is required and must be a non-empty array');
  } else {
    for (const d of m.domains) {
      if (typeof d !== 'string') {
        errors.push('Each domain must be a string');
        break;
      }
    }
  }

  if (!m.entryPoint || typeof m.entryPoint !== 'string') {
    errors.push('entryPoint is required and must be a string');
  } else {
    validateEntryPoint(m.entryPoint, errors);
  }

  // --- Optional fields ---
  if (m.dependencies !== undefined) {
    if (typeof m.dependencies !== 'object' || m.dependencies === null || Array.isArray(m.dependencies)) {
      errors.push('dependencies must be an object mapping plugin names to semver ranges');
    } else {
      for (const [depName, depVersion] of Object.entries(m.dependencies)) {
        if (typeof depVersion !== 'string') {
          errors.push(`Dependency "${depName}" must have a string version range`);
        }
      }
    }
  }

  if (m.hooks !== undefined) {
    if (typeof m.hooks !== 'object' || m.hooks === null || Array.isArray(m.hooks)) {
      errors.push('hooks must be an object mapping event names to handler paths');
    } else {
      for (const [, handlerPath] of Object.entries(m.hooks as Record<string, unknown>)) {
        if (typeof handlerPath !== 'string') {
          errors.push('Hook handler paths must be strings');
          break;
        }
        if ((handlerPath as string).includes('..')) {
          errors.push(`Hook handler path "${handlerPath}" must not contain ".." (path traversal)`);
        }
      }
    }
  }

  if (m.minAqeVersion !== undefined) {
    if (typeof m.minAqeVersion !== 'string' || !SEMVER_REGEX.test(m.minAqeVersion)) {
      warnings.push('minAqeVersion should be valid semver');
    }
  }

  if (m.permissions !== undefined) {
    if (!Array.isArray(m.permissions)) {
      errors.push('permissions must be an array of strings');
    } else {
      for (const p of m.permissions) {
        if (typeof p !== 'string') {
          errors.push('Each permission must be a string');
          break;
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Parse and validate a manifest from a JSON string or object.
 * Throws on invalid manifests.
 */
export function parseManifest(input: string | object): QEPluginManifest {
  const parsed = typeof input === 'string' ? JSON.parse(input) : input;
  const result = validateManifest(parsed);

  if (!result.valid) {
    throw new Error(`Invalid plugin manifest:\n  - ${result.errors.join('\n  - ')}`);
  }

  return parsed as QEPluginManifest;
}

// ============================================================================
// Internal Validators
// ============================================================================

function validateName(name: string, errors: string[], warnings: string[]): void {
  if (name.length > MAX_NAME_LENGTH) {
    errors.push(`name must be ${MAX_NAME_LENGTH} characters or fewer`);
  }

  if (!VALID_NAME_REGEX.test(name)) {
    errors.push('name must be lowercase alphanumeric with hyphens, starting with a letter');
  }

  // Check for non-ASCII characters
  // eslint-disable-next-line no-control-regex
  if (/[^\x00-\x7F]/.test(name)) {
    errors.push('name must contain only ASCII characters');
  }

  for (const prefix of RESERVED_PREFIXES) {
    if (name.startsWith(prefix)) {
      errors.push(`name cannot start with reserved prefix "${prefix}"`);
    }
  }

  // Warn on overly generic names
  if (['plugin', 'test', 'tool'].includes(name)) {
    warnings.push(`name "${name}" is very generic — consider a more descriptive name`);
  }
}

function validateEntryPoint(entryPoint: string, errors: string[]): void {
  // Block path traversal
  if (entryPoint.includes('..')) {
    errors.push('entryPoint must not contain ".." (path traversal)');
  }

  // Block absolute paths
  if (entryPoint.startsWith('/') || entryPoint.startsWith('\\')) {
    errors.push('entryPoint must be a relative path');
  }

  // Must end in .js or .ts
  if (!entryPoint.endsWith('.js') && !entryPoint.endsWith('.ts') && !entryPoint.endsWith('.mjs')) {
    errors.push('entryPoint must end in .js, .ts, or .mjs');
  }
}
