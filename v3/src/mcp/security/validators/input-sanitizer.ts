/**
 * Agentic QE v3 - MCP Security: Input Sanitizer
 * Implements the Strategy Pattern for input sanitization
 */

import {
  IInputSanitizationStrategy,
  SanitizationOptions,
  RiskLevel,
} from './interfaces';

// ============================================================================
// Constants
// ============================================================================

/**
 * HTML escape characters mapping
 */
export const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

/**
 * SQL injection patterns to detect and remove
 */
export const SQL_INJECTION_PATTERNS = [
  /('|")\s*;\s*--/i,
  /'\s*OR\s+'1'\s*=\s*'1/i,
  /"\s*OR\s+"1"\s*=\s*"1/i,
  /UNION\s+SELECT/i,
  /INSERT\s+INTO/i,
  /DROP\s+TABLE/i,
  /DELETE\s+FROM/i,
  /UPDATE\s+.*\s+SET/i,
  /EXEC(\s+|\()sp_/i,
  /xp_cmdshell/i,
];

/**
 * Shell metacharacters (excludes parentheses which are common in normal text)
 */
export const SHELL_METACHARACTERS = /[|;&$`<>{}[\]!#*?~]/g;

/**
 * Dangerous control characters that should be stripped:
 * - Null byte (\x00): String termination attacks, filter bypass
 * - Backspace (\x08): Log manipulation
 * - Bell (\x07): Terminal escape attacks
 * - Vertical tab (\x0B): Filter bypass
 * - Form feed (\x0C): Filter bypass
 * - Escape (\x1B): Terminal escape sequences (ANSI attacks)
 * - Delete (\x7F): Buffer manipulation
 */
export const DANGEROUS_CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

// ============================================================================
// Input Sanitizer Implementation
// ============================================================================

/**
 * Input Sanitizer Strategy
 * Sanitizes user input to prevent XSS, SQL injection, and command injection
 */
export class InputSanitizer implements IInputSanitizationStrategy {
  public readonly name = 'input-sanitization';

  /**
   * Get the primary risk level this sanitizer addresses
   */
  public getRiskLevel(): RiskLevel {
    return 'high';
  }

  /**
   * Sanitize input string with configurable options
   */
  public sanitize(input: string, options: SanitizationOptions = {}): string {
    const {
      maxLength = 10000,
      allowedChars,
      stripHtml = true,
      stripSql = true,
      escapeShell = true,
      trim = true,
      stripControlChars = true,
    } = options;

    let result = input;

    // Strip dangerous control characters first (null bytes, escape sequences, etc.)
    // This must happen early to prevent bypass of later sanitization steps
    if (stripControlChars) {
      result = result.replace(DANGEROUS_CONTROL_CHARS, '');
    }

    // Trim
    if (trim) {
      result = result.trim();
    }

    // Max length
    if (result.length > maxLength) {
      result = result.substring(0, maxLength);
    }

    // Strip HTML
    if (stripHtml) {
      result = this.stripHtmlTags(result);
    }

    // Strip SQL injection attempts
    if (stripSql) {
      for (const pattern of SQL_INJECTION_PATTERNS) {
        result = result.replace(pattern, '');
      }
    }

    // Escape shell metacharacters
    if (escapeShell) {
      result = result.replace(SHELL_METACHARACTERS, '');
    }

    // Filter to allowed characters
    if (allowedChars) {
      // Filter character by character to respect the provided regex
      result = result.split('').filter(char => allowedChars.test(char)).join('');
    }

    return result;
  }

  /**
   * Escape HTML special characters
   */
  public escapeHtml(str: string): string {
    return str.replace(/[&<>"'`=/]/g, char => HTML_ESCAPE_MAP[char] || char);
  }

  /**
   * Strip HTML tags from a string
   * Handles both complete tags and incomplete/malformed tags to prevent XSS
   */
  public stripHtmlTags(str: string): string {
    // Limit input length to prevent ReDoS
    const MAX_LENGTH = 100000;
    if (str.length > MAX_LENGTH) {
      str = str.slice(0, MAX_LENGTH);
    }

    let result = str;
    let prevLength: number;

    // Loop until no more changes (handles nested/malformed tags like <script<script>>)
    do {
      prevLength = result.length;
      // Remove complete HTML tags using a non-backtracking approach
      // Process character by character to avoid regex backtracking
      let cleaned = '';
      let inTag = false;
      for (let i = 0; i < result.length; i++) {
        const char = result[i];
        if (char === '<') {
          inTag = true;
        } else if (char === '>' && inTag) {
          inTag = false;
        } else if (!inTag) {
          cleaned += char;
        }
      }
      result = cleaned;
    } while (result.length < prevLength && result.length > 0);

    // Encode any remaining angle brackets
    result = result.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return result;
  }
}

// ============================================================================
// Standalone Functions (for backward compatibility)
// ============================================================================

const defaultSanitizer = new InputSanitizer();

export const sanitizeInput = (
  input: string,
  options?: SanitizationOptions
): string => defaultSanitizer.sanitize(input, options);

export const escapeHtml = (str: string): string =>
  defaultSanitizer.escapeHtml(str);

export const stripHtmlTags = (str: string): string =>
  defaultSanitizer.stripHtmlTags(str);
