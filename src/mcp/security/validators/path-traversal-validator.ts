/**
 * Agentic QE v3 - MCP Security: Path Traversal Validator
 * Implements the Strategy Pattern for path traversal protection
 */

import {
  IPathValidationStrategy,
  PathValidationOptions,
  PathValidationResult,
  RiskLevel,
} from './interfaces';

// ============================================================================
// Constants
// ============================================================================

/**
 * Path traversal patterns to detect
 */
export const PATH_TRAVERSAL_PATTERNS = [
  /\.\./,                    // Basic traversal
  /%2e%2e/i,                 // URL encoded ..
  /%252e%252e/i,             // Double URL encoded
  /\.\.%2f/i,                // Mixed encoding
  /%2f\.\./i,                // Forward slash + ..
  /\.\.%5c/i,                // Backslash + ..
  /\.\.\\/,                  // Windows backslash traversal
  /%c0%ae/i,                 // UTF-8 overlong encoding
  /%c0%2f/i,                 // UTF-8 overlong /
  /%c1%9c/i,                 // UTF-8 overlong \
  /\0/,                      // Null byte injection
  /%00/i,                    // URL encoded null
];

/**
 * Dangerous path components (system directories)
 */
export const DANGEROUS_PATH_COMPONENTS = [
  /^\/etc\//i,
  /^\/proc\//i,
  /^\/sys\//i,
  /^\/dev\//i,
  /^\/root\//i,
  /^\/home\/.+\/\./i,
  /^[A-Z]:\\Windows/i,
  /^[A-Z]:\\System/i,
  /^[A-Z]:\\Users\\.+\\AppData/i,
];

// ============================================================================
// Path Traversal Validator Implementation
// ============================================================================

/**
 * Path Traversal Validator Strategy
 * Validates file paths to prevent directory traversal attacks
 */
export class PathTraversalValidator implements IPathValidationStrategy {
  public readonly name = 'path-traversal';

  /**
   * Get the primary risk level this validator addresses
   */
  public getRiskLevel(): RiskLevel {
    return 'critical';
  }

  /**
   * Validate a file path against traversal attacks
   */
  public validate(
    path: string,
    options: PathValidationOptions = {}
  ): PathValidationResult {
    const {
      basePath = '',
      allowAbsolute = false,
      allowedExtensions = [],
      deniedExtensions = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.dll', '.so'],
      maxDepth = 10,
      maxLength = 4096,
    } = options;

    // Check length
    if (path.length > maxLength) {
      return {
        valid: false,
        error: `Path exceeds maximum length of ${maxLength}`,
        riskLevel: 'medium',
      };
    }

    // Check for traversal patterns
    for (const pattern of PATH_TRAVERSAL_PATTERNS) {
      if (pattern.test(path)) {
        return {
          valid: false,
          error: 'Path traversal attempt detected',
          riskLevel: 'critical',
        };
      }
    }

    // Check for absolute paths
    if (!allowAbsolute && (path.startsWith('/') || /^[A-Z]:/i.test(path))) {
      return {
        valid: false,
        error: 'Absolute paths are not allowed',
        riskLevel: 'high',
      };
    }

    // Check for dangerous path components
    for (const pattern of DANGEROUS_PATH_COMPONENTS) {
      if (pattern.test(path)) {
        return {
          valid: false,
          error: 'Access to system paths is not allowed',
          riskLevel: 'critical',
        };
      }
    }

    // Normalize the path
    const normalizedPath = this.normalizePath(path);

    // Re-check for traversal after normalization
    if (normalizedPath.includes('..')) {
      return {
        valid: false,
        error: 'Path traversal detected after normalization',
        riskLevel: 'critical',
      };
    }

    // Check depth
    const depth = normalizedPath.split('/').filter(Boolean).length;
    if (depth > maxDepth) {
      return {
        valid: false,
        error: `Path depth exceeds maximum of ${maxDepth}`,
        riskLevel: 'low',
      };
    }

    // Check extension
    const ext = this.getExtension(normalizedPath);
    if (ext) {
      const extWithDot = `.${ext.toLowerCase()}`;
      const extWithoutDot = ext.toLowerCase();

      // Check denied extensions (support both .exe and exe formats)
      if (deniedExtensions.length > 0) {
        const isDenied = deniedExtensions.some(denied =>
          denied.toLowerCase() === extWithDot || denied.toLowerCase() === extWithoutDot
        );
        if (isDenied) {
          return {
            valid: false,
            error: `File extension '${ext}' is not allowed`,
            riskLevel: 'high',
          };
        }
      }

      // Check allowed extensions (support both .ts and ts formats)
      if (allowedExtensions.length > 0) {
        const isAllowed = allowedExtensions.some(allowed =>
          allowed.toLowerCase() === extWithDot || allowed.toLowerCase() === extWithoutDot
        );
        if (!isAllowed) {
          return {
            valid: false,
            error: `File extension '${ext}' is not in allowed list`,
            riskLevel: 'medium',
          };
        }
      }
    }

    // Combine with base path if provided
    const finalPath = basePath
      ? this.joinPathsAbsolute(basePath, normalizedPath)
      : normalizedPath;

    // Verify final path doesn't escape base (use normalized base for comparison)
    const normalizedBase = basePath.startsWith('/')
      ? `/${this.normalizePath(basePath)}`
      : this.normalizePath(basePath);
    if (basePath && !finalPath.startsWith(normalizedBase)) {
      return {
        valid: false,
        error: 'Path escapes base directory',
        riskLevel: 'critical',
      };
    }

    return {
      valid: true,
      normalizedPath: finalPath,
      riskLevel: 'none',
    };
  }

  /**
   * Normalize a path by resolving . and .. components
   */
  public normalizePath(path: string): string {
    // Replace backslashes with forward slashes
    let normalized = path.replace(/\\/g, '/');

    // Remove multiple consecutive slashes
    normalized = normalized.replace(/\/+/g, '/');

    // Split and resolve
    const parts = normalized.split('/');
    const result: string[] = [];

    for (const part of parts) {
      if (part === '.' || part === '') {
        continue;
      }
      if (part === '..') {
        // Don't allow going above root
        if (result.length > 0 && result[result.length - 1] !== '..') {
          result.pop();
        }
      } else {
        result.push(part);
      }
    }

    return result.join('/');
  }

  /**
   * Safely join path components (strips leading/trailing slashes from all parts)
   */
  public joinPaths(...paths: string[]): string {
    if (paths.length === 0) return '';

    return paths
      .map(p => p.replace(/^\/+|\/+$/g, ''))
      .filter(Boolean)
      .join('/');
  }

  /**
   * Join paths preserving absolute path from first component
   */
  public joinPathsAbsolute(...paths: string[]): string {
    if (paths.length === 0) return '';

    // Check if the first path is absolute
    const isAbsolute = paths[0].startsWith('/');

    const result = paths
      // Use non-backtracking patterns with possessive-like behavior via split/join
      .map(p => {
        // Remove leading slashes by splitting and rejoining
        while (p.startsWith('/')) p = p.slice(1);
        // Remove trailing slashes
        while (p.endsWith('/')) p = p.slice(0, -1);
        return p;
      })
      .filter(Boolean)
      .join('/');

    // Preserve leading slash for absolute paths
    return isAbsolute ? `/${result}` : result;
  }

  /**
   * Get file extension from path
   */
  public getExtension(path: string): string | null {
    const match = path.match(/\.([^./\\]+)$/);
    return match ? match[1] : null;
  }
}

// ============================================================================
// Standalone Functions (for backward compatibility)
// ============================================================================

const defaultValidator = new PathTraversalValidator();

export const validatePath = (
  path: string,
  options?: PathValidationOptions
): PathValidationResult => defaultValidator.validate(path, options);

export const normalizePath = (path: string): string =>
  defaultValidator.normalizePath(path);

export const joinPaths = (...paths: string[]): string =>
  defaultValidator.joinPaths(...paths);

export const joinPathsAbsolute = (...paths: string[]): string =>
  defaultValidator.joinPathsAbsolute(...paths);

export const getExtension = (path: string): string | null =>
  defaultValidator.getExtension(path);
