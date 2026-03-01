/**
 * Agentic QE v3 - MCP Security: Command Validator
 * Implements the Strategy Pattern for command injection prevention
 */

import {
  ICommandValidationStrategy,
  CommandValidationOptions,
  CommandValidationResult,
  RiskLevel,
} from './interfaces';

// ============================================================================
// Constants
// ============================================================================

/**
 * Allowed commands whitelist (default safe commands)
 */
export const DEFAULT_ALLOWED_COMMANDS = [
  'ls', 'cat', 'echo', 'grep', 'find', 'head', 'tail', 'wc',
  'npm', 'node', 'yarn', 'pnpm',
  'git', 'jest', 'vitest', 'playwright',
];

/**
 * Blocked command patterns (injection vectors)
 */
export const BLOCKED_COMMAND_PATTERNS = [
  /;/,                       // Command chaining with semicolon
  /&&/,                      // Command chaining with AND
  /\|\|/,                    // Command chaining with OR
  /\|/,                      // Piping
  /`.*`/,                    // Backtick command substitution
  /\$\(.*\)/,                // $() command substitution
  />\s*\/dev\/sd/i,          // Writing to block devices
  />\s*\/etc\//i,            // Writing to /etc
];

/**
 * Shell metacharacters (excludes parentheses which are common in normal text)
 */
const SHELL_METACHARACTERS = /[|;&$`<>{}[\]!#*?~]/g;

// ============================================================================
// Command Validator Implementation
// ============================================================================

/**
 * Command Validator Strategy
 * Validates and sanitizes shell commands to prevent injection attacks
 */
export class CommandValidator implements ICommandValidationStrategy {
  public readonly name = 'command-injection';

  private defaultAllowedCommands: string[];

  constructor(defaultAllowedCommands = DEFAULT_ALLOWED_COMMANDS) {
    this.defaultAllowedCommands = defaultAllowedCommands;
  }

  /**
   * Get the primary risk level this validator addresses
   */
  public getRiskLevel(): RiskLevel {
    return 'critical';
  }

  /**
   * Validate a command (IValidationStrategy interface)
   */
  public validate(
    command: string,
    options: CommandValidationOptions = {}
  ): CommandValidationResult {
    const allowedCommands = options.allowedCommands ?? this.defaultAllowedCommands;
    return this.validateCommand(command, allowedCommands);
  }

  /**
   * Validate and sanitize a command
   */
  public validateCommand(
    command: string,
    allowedCommands: string[] = this.defaultAllowedCommands
  ): CommandValidationResult {
    const blockedPatterns: string[] = [];

    // Check for blocked patterns
    for (const pattern of BLOCKED_COMMAND_PATTERNS) {
      if (pattern.test(command)) {
        blockedPatterns.push(pattern.source);
      }
    }

    if (blockedPatterns.length > 0) {
      return {
        valid: false,
        error: 'Command contains blocked patterns',
        blockedPatterns,
        riskLevel: 'critical',
      };
    }

    // Extract base command
    const parts = command.trim().split(/\s+/);
    const baseCommand = parts[0].split('/').pop() || '';

    // Check against whitelist
    if (!allowedCommands.includes(baseCommand)) {
      return {
        valid: false,
        error: `Command '${baseCommand}' is not in the allowed list`,
        blockedPatterns: [],
        riskLevel: 'high',
      };
    }

    // Sanitize arguments
    const sanitizedParts = parts.map((part, i) => {
      if (i === 0) return part;
      // Remove shell metacharacters from arguments
      return part.replace(SHELL_METACHARACTERS, '');
    });

    return {
      valid: true,
      sanitizedCommand: sanitizedParts.join(' '),
      blockedPatterns: [],
      riskLevel: 'none',
    };
  }

  /**
   * Escape a string for safe shell usage
   */
  public escapeShellArg(arg: string): string {
    // Wrap in single quotes and escape any internal single quotes
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }
}

// ============================================================================
// Standalone Functions (for backward compatibility)
// ============================================================================

const defaultValidator = new CommandValidator();

export const validateCommand = (
  command: string,
  allowedCommands?: string[]
): CommandValidationResult => {
  if (allowedCommands) {
    return defaultValidator.validateCommand(command, allowedCommands);
  }
  return defaultValidator.validate(command);
};

export const escapeShellArg = (arg: string): string =>
  defaultValidator.escapeShellArg(arg);
