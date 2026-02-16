/**
 * Unit Tests - Security Patterns
 * Tests for vulnerability detection pattern definitions and rule sets
 */

import { describe, it, expect } from 'vitest';
import {
  ALL_SECURITY_PATTERNS,
  BUILT_IN_RULE_SETS,
  SQL_INJECTION_PATTERNS,
} from '../../../../../src/domains/security-compliance/services/scanners/security-patterns';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Security Patterns', () => {

  // =========================================================================
  // ALL_SECURITY_PATTERNS
  // =========================================================================

  describe('ALL_SECURITY_PATTERNS', () => {
    it('should_containPatterns', () => {
      expect(ALL_SECURITY_PATTERNS.length).toBeGreaterThan(0);
    });

    it('should_haveUniqueIds', () => {
      // Arrange
      const ids = ALL_SECURITY_PATTERNS.map((p) => p.id);

      // Act
      const uniqueIds = new Set(ids);

      // Assert
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should_haveValidSeverityValues', () => {
      // Arrange
      const validSeverities = ['critical', 'high', 'medium', 'low', 'informational'];

      // Act & Assert
      for (const pattern of ALL_SECURITY_PATTERNS) {
        expect(validSeverities).toContain(pattern.severity);
      }
    });

    it('should_haveValidRegexPatterns', () => {
      // Act & Assert - each pattern should be a valid RegExp
      for (const pattern of ALL_SECURITY_PATTERNS) {
        expect(pattern.pattern).toBeInstanceOf(RegExp);
      }
    });

    it('should_haveRemediationAdvice_forEveryPattern', () => {
      // Act & Assert
      for (const pattern of ALL_SECURITY_PATTERNS) {
        expect(pattern.remediation).toBeTruthy();
        expect(pattern.remediation.length).toBeGreaterThan(0);
      }
    });

    it('should_haveOWASPReference_forEveryPattern', () => {
      // Act & Assert
      for (const pattern of ALL_SECURITY_PATTERNS) {
        expect(pattern.owaspId).toBeTruthy();
        expect(pattern.owaspId).toMatch(/^A\d{2}:\d{4}$/);
      }
    });

    it('should_haveCWEReference_forEveryPattern', () => {
      // Act & Assert
      for (const pattern of ALL_SECURITY_PATTERNS) {
        expect(pattern.cweId).toBeTruthy();
        expect(pattern.cweId).toMatch(/^CWE-\d+$/);
      }
    });
  });

  // =========================================================================
  // SQL_INJECTION_PATTERNS
  // =========================================================================

  describe('SQL_INJECTION_PATTERNS', () => {
    it('should_detectStringConcatenationInQuery', () => {
      // Arrange
      const code = 'db.query("SELECT * FROM users WHERE id = " + userId + "")';
      const pattern = SQL_INJECTION_PATTERNS.find((p) => p.id === 'sqli-string-concat');

      // Act & Assert
      expect(pattern).toBeDefined();
      expect(pattern!.pattern.test(code)).toBe(true);
    });

    it('should_notMatchSafeParameterizedQueries', () => {
      // Arrange
      const safeCode = 'db.query("SELECT * FROM users WHERE id = $1", [userId])';
      const pattern = SQL_INJECTION_PATTERNS.find((p) => p.id === 'sqli-string-concat');

      // Act
      // Reset regex state
      const regex = new RegExp(pattern!.pattern.source, pattern!.pattern.flags);

      // Assert
      expect(regex.test(safeCode)).toBe(false);
    });

    it('should_allBeCategorizedAsInjection', () => {
      for (const pattern of SQL_INJECTION_PATTERNS) {
        expect(pattern.category).toBe('injection');
      }
    });
  });

  // =========================================================================
  // BUILT_IN_RULE_SETS
  // =========================================================================

  describe('BUILT_IN_RULE_SETS', () => {
    it('should_includeOWASPTop10', () => {
      const owasp = BUILT_IN_RULE_SETS.find((rs) => rs.id === 'owasp-top-10');
      expect(owasp).toBeDefined();
      expect(owasp!.name).toContain('OWASP');
    });

    it('should_includeCWESANS25', () => {
      const cwe = BUILT_IN_RULE_SETS.find((rs) => rs.id === 'cwe-sans-25');
      expect(cwe).toBeDefined();
    });

    it('should_havePositiveRuleCount_forAllSets', () => {
      for (const ruleSet of BUILT_IN_RULE_SETS) {
        expect(ruleSet.ruleCount).toBeGreaterThan(0);
      }
    });

    it('should_haveAtLeastOneCategory_perRuleSet', () => {
      for (const ruleSet of BUILT_IN_RULE_SETS) {
        expect(ruleSet.categories.length).toBeGreaterThan(0);
      }
    });

    it('should_haveUniqueRuleSetIds', () => {
      const ids = BUILT_IN_RULE_SETS.map((rs) => rs.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });
});
