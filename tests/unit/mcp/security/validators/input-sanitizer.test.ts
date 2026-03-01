import { describe, it, expect } from 'vitest';
import {
  InputSanitizer,
  HTML_ESCAPE_MAP,
  SQL_INJECTION_PATTERNS,
  SHELL_METACHARACTERS,
  DANGEROUS_CONTROL_CHARS,
  sanitizeInput,
  escapeHtml,
  stripHtmlTags,
} from '../../../../../src/mcp/security/validators/input-sanitizer.js';

describe('InputSanitizer', () => {
  const sanitizer = new InputSanitizer();

  describe('sanitize', () => {
    it('should return clean input unchanged', () => {
      const result = sanitizer.sanitize('hello world');
      expect(result).toBe('hello world');
    });

    it('should trim whitespace by default', () => {
      expect(sanitizer.sanitize('  hello  ')).toBe('hello');
    });

    it('should enforce max length', () => {
      const long = 'a'.repeat(20000);
      const result = sanitizer.sanitize(long, { maxLength: 100 });
      expect(result.length).toBeLessThanOrEqual(100);
    });

    it('should strip HTML tags', () => {
      const result = sanitizer.sanitize('<script>alert("xss")</script>hello');
      expect(result).not.toContain('<script>');
      expect(result).toContain('hello');
    });

    it('should strip SQL injection patterns (UNION SELECT)', () => {
      const result = sanitizer.sanitize("1 UNION SELECT * FROM users");
      expect(result).not.toMatch(/UNION\s+SELECT/i);
    });

    it('should strip SQL injection patterns (DROP TABLE)', () => {
      const result = sanitizer.sanitize("'; DROP TABLE users; --");
      expect(result).not.toMatch(/DROP\s+TABLE/i);
    });

    it('should strip SQL injection patterns (OR 1=1)', () => {
      const result = sanitizer.sanitize("' OR '1'='1");
      expect(result).not.toMatch(/OR\s+'1'\s*=\s*'1/i);
    });

    it('should remove shell metacharacters', () => {
      const result = sanitizer.sanitize('echo $HOME | cat');
      expect(result).not.toContain('$');
      expect(result).not.toContain('|');
    });

    it('should strip dangerous control characters', () => {
      const result = sanitizer.sanitize('hello\x00world\x1Btest');
      expect(result).not.toContain('\x00');
      expect(result).not.toContain('\x1B');
    });

    it('should strip null bytes', () => {
      const result = sanitizer.sanitize('file.txt\x00.jpg');
      expect(result).not.toContain('\x00');
    });

    it('should filter to allowed characters when specified', () => {
      const result = sanitizer.sanitize('abc123!@#', {
        allowedChars: /[a-z0-9]/,
        stripHtml: false,
        stripSql: false,
        escapeShell: false,
      });
      expect(result).toBe('abc123');
    });

    it('should skip trimming when disabled', () => {
      const result = sanitizer.sanitize('  hello  ', {
        trim: false,
        stripHtml: false,
        stripSql: false,
        escapeShell: false,
        stripControlChars: false,
      });
      expect(result).toBe('  hello  ');
    });

    it('should handle empty string', () => {
      expect(sanitizer.sanitize('')).toBe('');
    });

    it('should handle nested malicious patterns', () => {
      const result = sanitizer.sanitize('<img onerror="alert(1)" src=x>click me');
      expect(result).not.toContain('<img');
      expect(result).toContain('click me');
    });
  });

  describe('escapeHtml', () => {
    it('should escape & character', () => {
      expect(sanitizer.escapeHtml('a & b')).toContain('&amp;');
    });

    it('should escape < and > characters', () => {
      const result = sanitizer.escapeHtml('<div>');
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
    });

    it('should escape quotes', () => {
      expect(sanitizer.escapeHtml('"hello"')).toContain('&quot;');
    });

    it('should escape single quotes', () => {
      expect(sanitizer.escapeHtml("it's")).toContain('&#x27;');
    });

    it('should escape backticks', () => {
      expect(sanitizer.escapeHtml('`code`')).toContain('&#x60;');
    });

    it('should handle empty string', () => {
      expect(sanitizer.escapeHtml('')).toBe('');
    });

    it('should escape all mapped characters', () => {
      for (const [char, escaped] of Object.entries(HTML_ESCAPE_MAP)) {
        expect(sanitizer.escapeHtml(char)).toBe(escaped);
      }
    });
  });

  describe('stripHtmlTags', () => {
    it('should remove simple HTML tags', () => {
      expect(sanitizer.stripHtmlTags('<b>bold</b>')).toBe('bold');
    });

    it('should remove script tags but preserve inner text', () => {
      const result = sanitizer.stripHtmlTags('<script>alert(1)</script>safe');
      expect(result).not.toContain('<script');
      expect(result).toContain('safe');
    });

    it('should handle nested tags', () => {
      const result = sanitizer.stripHtmlTags('<div><span>text</span></div>');
      expect(result).toBe('text');
    });

    it('should handle malformed tags by stripping tag structures', () => {
      const result = sanitizer.stripHtmlTags('<script<script>>alert(1)</script>');
      // The malformed tag is partially stripped; remaining content is encoded
      expect(result).not.toContain('<script');
    });

    it('should encode remaining angle brackets', () => {
      const result = sanitizer.stripHtmlTags('5 < 10 > 3');
      expect(result).not.toContain('<');
    });

    it('should handle empty string', () => {
      expect(sanitizer.stripHtmlTags('')).toBe('');
    });

    it('should handle very long input', () => {
      const input = '<p>' + 'x'.repeat(200000) + '</p>';
      const result = sanitizer.stripHtmlTags(input);
      expect(result.length).toBeLessThanOrEqual(100000);
    });
  });

  describe('getRiskLevel', () => {
    it('should return high', () => {
      expect(sanitizer.getRiskLevel()).toBe('high');
    });
  });

  describe('standalone functions', () => {
    it('sanitizeInput should work', () => {
      expect(sanitizeInput('hello')).toBe('hello');
    });

    it('escapeHtml should work', () => {
      expect(escapeHtml('<')).toBe('&lt;');
    });

    it('stripHtmlTags should work', () => {
      expect(stripHtmlTags('<b>text</b>')).toBe('text');
    });
  });

  describe('constants', () => {
    it('SQL_INJECTION_PATTERNS should cover major attacks', () => {
      expect(SQL_INJECTION_PATTERNS.length).toBeGreaterThanOrEqual(8);
    });

    it('SHELL_METACHARACTERS should match pipe', () => {
      expect(SHELL_METACHARACTERS.test('|')).toBe(true);
    });

    it('DANGEROUS_CONTROL_CHARS should match null byte', () => {
      expect(DANGEROUS_CONTROL_CHARS.test('\x00')).toBe(true);
    });

    it('DANGEROUS_CONTROL_CHARS should match escape sequence', () => {
      // Reset lastIndex since regex has /g flag
      DANGEROUS_CONTROL_CHARS.lastIndex = 0;
      expect(DANGEROUS_CONTROL_CHARS.test('\x1B')).toBe(true);
    });
  });
});
