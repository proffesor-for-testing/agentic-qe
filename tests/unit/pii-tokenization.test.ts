/**
 * PII Tokenization Test Suite
 *
 * Comprehensive tests for PIITokenizer covering:
 * - Each PII type detection (email, phone, SSN, CC, name)
 * - Edge cases and malformed patterns
 * - Tokenization/detokenization round-trip accuracy
 * - Statistics accuracy and audit trail
 * - Performance with large datasets (1000+ samples)
 * - GDPR/CCPA compliance verification
 *
 * @module tests/unit/pii-tokenization.test
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { PIITokenizer, TokenizationMap } from '../../src/security/pii-tokenization.js';

describe('PIITokenizer', () => {
  let tokenizer: PIITokenizer;

  beforeEach(() => {
    tokenizer = new PIITokenizer();
  });

  describe('Email Detection', () => {
    it('should tokenize standard email addresses', () => {
      const content = 'Email: john.doe@example.com';
      const { tokenized, piiCount, piiBreakdown } = tokenizer.tokenize(content);

      expect(tokenized).toBe('Email: [EMAIL_0]');
      expect(piiCount).toBe(1);
      expect(piiBreakdown.emails).toBe(1);
    });

    it('should tokenize multiple email addresses', () => {
      const content = 'Contacts: alice@example.com, bob@test.org, charlie@company.co.uk';
      const { tokenized, piiCount } = tokenizer.tokenize(content);

      expect(tokenized).toBe('Contacts: [EMAIL_0], [EMAIL_1], [EMAIL_2]');
      expect(piiCount).toBe(3);
    });

    it('should handle email with plus addressing', () => {
      const content = 'user+tag@example.com';
      const { tokenized } = tokenizer.tokenize(content);

      expect(tokenized).toBe('[EMAIL_0]');
    });

    it('should handle email with dots and underscores', () => {
      const content = 'first.last_name@sub.domain.com';
      const { tokenized } = tokenizer.tokenize(content);

      expect(tokenized).toBe('[EMAIL_0]');
    });

    it('should NOT tokenize invalid email-like strings', () => {
      const content = 'not@email'; // Missing TLD
      const { piiCount } = tokenizer.tokenize(content);

      expect(piiCount).toBe(0);
    });

    it('should handle mixed case emails', () => {
      const content = 'Email: John.Doe@Example.COM';
      const { tokenized } = tokenizer.tokenize(content);

      expect(tokenized).toBe('Email: [EMAIL_0]');
    });
  });

  describe('Phone Number Detection', () => {
    it('should tokenize US phone with dashes', () => {
      const content = 'Phone: 555-123-4567';
      const { tokenized, piiBreakdown } = tokenizer.tokenize(content);

      expect(tokenized).toBe('Phone: [PHONE_0]');
      expect(piiBreakdown.phones).toBe(1);
    });

    it('should tokenize US phone with parentheses', () => {
      const content = 'Call (555) 123-4567';
      const { tokenized } = tokenizer.tokenize(content);

      expect(tokenized).toBe('Call [PHONE_0]');
    });

    it('should tokenize US phone with dots', () => {
      const content = '555.123.4567';
      const { tokenized } = tokenizer.tokenize(content);

      expect(tokenized).toBe('[PHONE_0]');
    });

    it('should tokenize US phone with +1 prefix', () => {
      const content = '+1-555-123-4567';
      const { tokenized } = tokenizer.tokenize(content);

      expect(tokenized).toBe('[PHONE_0]');
    });

    it('should tokenize US phone without separators', () => {
      const content = '5551234567';
      const { tokenized } = tokenizer.tokenize(content);

      expect(tokenized).toBe('[PHONE_0]');
    });

    it('should NOT tokenize incomplete phone numbers', () => {
      const content = '555-1234'; // Too short
      const { piiCount } = tokenizer.tokenize(content);

      expect(piiCount).toBe(0);
    });

    it('should handle multiple phone formats in same text', () => {
      const content = 'Primary: (555) 123-4567, Secondary: +1-555-987-6543';
      const { tokenized, piiCount } = tokenizer.tokenize(content);

      expect(tokenized).toBe('Primary: [PHONE_0], Secondary: [PHONE_1]');
      expect(piiCount).toBe(2);
    });
  });

  describe('SSN Detection', () => {
    it('should tokenize standard SSN format', () => {
      const content = 'SSN: 123-45-6789';
      const { tokenized, piiBreakdown } = tokenizer.tokenize(content);

      expect(tokenized).toBe('SSN: [SSN_0]');
      expect(piiBreakdown.ssns).toBe(1);
    });

    it('should tokenize multiple SSNs', () => {
      const content = 'SSNs: 123-45-6789, 987-65-4321';
      const { tokenized, piiCount } = tokenizer.tokenize(content);

      expect(tokenized).toBe('SSNs: [SSN_0], [SSN_1]');
      expect(piiCount).toBe(2);
    });

    it('should NOT tokenize SSN without dashes', () => {
      const content = '123456789'; // No dashes
      const { piiBreakdown } = tokenizer.tokenize(content);

      expect(piiBreakdown.ssns).toBe(0);
    });

    it('should NOT tokenize invalid SSN format', () => {
      const content = '12-345-6789'; // Wrong format
      const { piiBreakdown } = tokenizer.tokenize(content);

      expect(piiBreakdown.ssns).toBe(0);
    });

    it('should tokenize SSN in code context', () => {
      const content = 'const ssn = "123-45-6789";';
      const { tokenized } = tokenizer.tokenize(content);

      expect(tokenized).toBe('const ssn = "[SSN_0]";');
    });
  });

  describe('Credit Card Detection', () => {
    it('should tokenize credit card with dashes', () => {
      const content = 'CC: 1234-5678-9012-3456';
      const { tokenized, piiBreakdown } = tokenizer.tokenize(content);

      expect(tokenized).toBe('CC: [CC_0]');
      expect(piiBreakdown.creditCards).toBe(1);
    });

    it('should tokenize credit card with spaces', () => {
      const content = '1234 5678 9012 3456';
      const { tokenized } = tokenizer.tokenize(content);

      expect(tokenized).toBe('[CC_0]');
    });

    it('should tokenize credit card without separators', () => {
      const content = '1234567890123456';
      const { tokenized } = tokenizer.tokenize(content);

      expect(tokenized).toBe('[CC_0]');
    });

    it('should tokenize multiple credit cards', () => {
      const content = 'Cards: 1234-5678-9012-3456, 9876-5432-1098-7654';
      const { tokenized, piiCount } = tokenizer.tokenize(content);

      expect(tokenized).toBe('Cards: [CC_0], [CC_1]');
      expect(piiCount).toBe(2);
    });

    it('should NOT tokenize incomplete credit card', () => {
      const content = '1234-5678-9012'; // Too short
      const { piiBreakdown } = tokenizer.tokenize(content);

      expect(piiBreakdown.creditCards).toBe(0);
    });
  });

  describe('Name Detection', () => {
    it('should tokenize standard first and last name', () => {
      const content = 'Name: John Doe';
      const { tokenized, piiBreakdown } = tokenizer.tokenize(content);

      expect(tokenized).toBe('Name: [NAME_0]');
      expect(piiBreakdown.names).toBe(1);
    });

    it('should tokenize multiple names', () => {
      const content = 'Attendees: Alice Johnson, Bob Smith, Charlie Brown';
      const { tokenized, piiCount } = tokenizer.tokenize(content);

      expect(tokenized).toBe('Attendees: [NAME_0], [NAME_1], [NAME_2]');
      expect(piiCount).toBe(3);
    });

    it('should NOT tokenize short names (false positive prevention)', () => {
      const content = 'New User'; // Common code pattern
      const { piiBreakdown } = tokenizer.tokenize(content);

      expect(piiBreakdown.names).toBe(0);
    });

    it('should NOT tokenize lowercase names', () => {
      const content = 'john doe'; // Not capitalized
      const { piiBreakdown } = tokenizer.tokenize(content);

      expect(piiBreakdown.names).toBe(0);
    });

    it('should tokenize names longer than 2 characters', () => {
      const content = 'Customer: Mary Jane';
      const { tokenized } = tokenizer.tokenize(content);

      expect(tokenized).toBe('Customer: [NAME_0]');
    });

    it('should handle names in sentences', () => {
      const content = 'The user John Doe submitted a request.';
      const { tokenized } = tokenizer.tokenize(content);

      expect(tokenized).toBe('The user [NAME_0] submitted a request.');
    });
  });

  describe('Edge Cases and Malformed Patterns', () => {
    it('should handle empty string', () => {
      const { tokenized, piiCount } = tokenizer.tokenize('');

      expect(tokenized).toBe('');
      expect(piiCount).toBe(0);
    });

    it('should handle string with no PII', () => {
      const content = 'This is a normal string with no PII data.';
      const { tokenized, piiCount } = tokenizer.tokenize(content);

      expect(tokenized).toBe(content);
      expect(piiCount).toBe(0);
    });

    it('should handle malformed email in code', () => {
      const content = 'const email = "not-an-email";';
      const { piiBreakdown } = tokenizer.tokenize(content);

      expect(piiBreakdown.emails).toBe(0);
    });

    it('should handle phone number edge case (000-000-0000)', () => {
      const content = '000-000-0000';
      const { tokenized } = tokenizer.tokenize(content);

      expect(tokenized).toBe('[PHONE_0]'); // Still matches pattern
    });

    it('should handle very long strings without performance degradation', () => {
      const longString = 'x'.repeat(100000);
      const startTime = Date.now();

      const { tokenized } = tokenizer.tokenize(longString);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
      expect(tokenized).toBe(longString);
    });

    it('should handle special characters near PII', () => {
      const content = 'Email: <john@example.com>, Phone: (555)123-4567!';
      const { tokenized } = tokenizer.tokenize(content);

      expect(tokenized).toBe('Email: <[EMAIL_0]>, Phone: [PHONE_0]!');
    });

    it('should handle multiple PII types on same line', () => {
      const content = 'Contact: John Doe, john@example.com, 555-123-4567, SSN: 123-45-6789';
      const { tokenized, piiCount } = tokenizer.tokenize(content);

      expect(piiCount).toBe(4); // name, email, phone, SSN
      expect(tokenized).toContain('[NAME_0]');
      expect(tokenized).toContain('[EMAIL_0]');
      expect(tokenized).toContain('[PHONE_0]');
      expect(tokenized).toContain('[SSN_0]');
    });
  });

  describe('Tokenization/Detokenization Round-Trip', () => {
    it('should perfectly restore original content', () => {
      const original = 'User: John Doe, john.doe@example.com, 555-123-4567, SSN: 123-45-6789, CC: 1234-5678-9012-3456';
      const { tokenized, reverseMap } = tokenizer.tokenize(original);

      const restored = tokenizer.detokenize(tokenized, reverseMap);

      expect(restored).toBe(original);
    });

    it('should maintain exact whitespace and formatting', () => {
      const original = `
        const user = {
          name: "Alice Johnson",
          email: "alice@example.com",
          phone: "+1-555-987-6543"
        };
      `;
      const { tokenized, reverseMap } = tokenizer.tokenize(original);

      const restored = tokenizer.detokenize(tokenized, reverseMap);

      expect(restored).toBe(original);
    });

    it('should handle detokenization with empty map', () => {
      const content = 'No PII here';
      const { tokenized, reverseMap } = tokenizer.tokenize(content);

      const restored = tokenizer.detokenize(tokenized, reverseMap);

      expect(restored).toBe(content);
    });

    it('should handle partial detokenization', () => {
      const content = 'Email: john@example.com, Name: John Doe';
      const { tokenized, reverseMap } = tokenizer.tokenize(content);

      // Only detokenize emails
      const partialMap: TokenizationMap = {
        email: reverseMap.email,
        phone: new Map(),
        ssn: new Map(),
        creditCard: new Map(),
        name: new Map(),
      };

      const partial = tokenizer.detokenize(tokenized, partialMap);

      expect(partial).toContain('john@example.com');
      expect(partial).toContain('[NAME_0]');
    });

    it('should handle large-scale round-trip (1000 emails)', () => {
      const emails = Array.from({ length: 1000 }, (_, i) => `user${i}@example.com`);
      const original = emails.join(', ');

      const { tokenized, reverseMap } = tokenizer.tokenize(original);
      const restored = tokenizer.detokenize(tokenized, reverseMap);

      expect(restored).toBe(original);
      expect(reverseMap.email.size).toBe(1000);
    });
  });

  describe('Statistics and Audit Trail', () => {
    it('should provide accurate statistics', () => {
      const content = `
        Email: john@example.com
        Phone: 555-123-4567
        SSN: 123-45-6789
        CC: 1234-5678-9012-3456
        Name: John Doe
      `;
      tokenizer.tokenize(content);

      const stats = tokenizer.getStats();

      expect(stats.emails).toBe(1);
      expect(stats.phones).toBe(1);
      expect(stats.ssns).toBe(1);
      expect(stats.creditCards).toBe(1);
      expect(stats.names).toBe(1);
      expect(stats.total).toBe(5);
    });

    it('should update statistics incrementally', () => {
      tokenizer.tokenize('Email: alice@example.com');
      let stats = tokenizer.getStats();
      expect(stats.emails).toBe(1);
      expect(stats.total).toBe(1);

      tokenizer.tokenize('Email: bob@example.com, Phone: 555-123-4567');
      stats = tokenizer.getStats();
      expect(stats.emails).toBe(2);
      expect(stats.phones).toBe(1);
      expect(stats.total).toBe(3);
    });

    it('should return breakdown in TokenizationResult', () => {
      const { piiBreakdown } = tokenizer.tokenize('john@example.com, 555-123-4567');

      expect(piiBreakdown).toEqual({
        emails: 1,
        phones: 1,
        ssns: 0,
        creditCards: 0,
        names: 0,
      });
    });

    it('should maintain statistics across multiple tokenizations', () => {
      tokenizer.tokenize('john@example.com');
      tokenizer.tokenize('555-123-4567');
      tokenizer.tokenize('123-45-6789');

      const stats = tokenizer.getStats();

      expect(stats.total).toBe(3);
    });
  });

  describe('Performance with Large Datasets', () => {
    it('should process 1000 emails in reasonable time', () => {
      const emails = Array.from({ length: 1000 }, (_, i) => `user${i}@example.com`).join('\n');
      const startTime = Date.now();

      const { piiCount } = tokenizer.tokenize(emails);

      const duration = Date.now() - startTime;
      expect(piiCount).toBe(1000);
      expect(duration).toBeLessThan(500); // Should complete in under 500ms
    });

    it('should process 1000 phone numbers in reasonable time', () => {
      const phones = Array.from({ length: 1000 }, (_, i) => {
        const n = String(i).padStart(4, '0');
        return `555-123-${n}`;
      }).join('\n');

      const startTime = Date.now();
      const { piiCount } = tokenizer.tokenize(phones);

      const duration = Date.now() - startTime;
      expect(piiCount).toBe(1000);
      expect(duration).toBeLessThan(500);
    });

    it('should process mixed PII dataset (5000 total items)', () => {
      const dataset = [
        ...Array.from({ length: 1000 }, (_, i) => `user${i}@example.com`),
        ...Array.from({ length: 1000 }, (_, i) => `555-${String(i).padStart(3, '0')}-${String(i).padStart(4, '0')}`),
        ...Array.from({ length: 1000 }, (_, i) => `${String(i).padStart(3, '0')}-${String(i).padStart(2, '0')}-${String(i).padStart(4, '0')}`),
        ...Array.from({ length: 1000 }, (_, i) => `${String(i).padStart(4, '0')}-${String(i).padStart(4, '0')}-${String(i).padStart(4, '0')}-${String(i).padStart(4, '0')}`),
        ...Array.from({ length: 1000 }, (_, i) => `User${i} Test${i}`),
      ].join('\n');

      const startTime = Date.now();
      const { piiCount } = tokenizer.tokenize(dataset);

      const duration = Date.now() - startTime;
      expect(piiCount).toBe(5000);
      expect(duration).toBeLessThan(2000); // Should complete in under 2 seconds
    });

    it('should handle memory efficiently with large reverse map', () => {
      const largeContent = Array.from({ length: 5000 }, (_, i) => `user${i}@example.com`).join('\n');

      tokenizer.tokenize(largeContent);

      const stats = tokenizer.getStats();
      expect(stats.emails).toBe(5000);

      // Memory should be released after clear
      tokenizer.clear();
      const clearedStats = tokenizer.getStats();
      expect(clearedStats.total).toBe(0);
    });
  });

  describe('GDPR/CCPA Compliance', () => {
    it('should prevent PII leakage in tokenized content', () => {
      const content = 'Contact: John Doe, john@example.com, 555-123-4567, SSN: 123-45-6789';
      const { tokenized } = tokenizer.tokenize(content);

      expect(tokenized).not.toContain('john@example.com');
      expect(tokenized).not.toContain('555-123-4567');
      expect(tokenized).not.toContain('123-45-6789');
      expect(tokenized).not.toContain('John Doe');
    });

    it('should allow clearing reverse map for data minimization', () => {
      tokenizer.tokenize('john@example.com');

      let stats = tokenizer.getStats();
      expect(stats.emails).toBe(1);

      tokenizer.clear();

      stats = tokenizer.getStats();
      expect(stats.emails).toBe(0);
      expect(stats.total).toBe(0);
    });

    it('should provide audit trail via statistics', () => {
      const content = 'User: Alice Johnson, alice@example.com, 555-123-4567';
      const { piiCount, piiBreakdown } = tokenizer.tokenize(content);

      // Audit trail shows exactly what PII was detected
      expect(piiBreakdown).toEqual({
        emails: 1,
        phones: 1,
        ssns: 0,
        creditCards: 0,
        names: 1,
      });

      expect(piiCount).toBe(3);
    });

    it('should demonstrate safe logging workflow', () => {
      const original = 'SSN: 123-45-6789, CC: 1234-5678-9012-3456';
      const { tokenized, reverseMap } = tokenizer.tokenize(original);

      // Safe to log tokenized version
      console.log('Test generation result (tokenized):', tokenized);

      // NOT safe to log original
      // console.log('Original:', original); // GDPR violation!

      // Only restore for file output
      const finalCode = tokenizer.detokenize(tokenized, reverseMap);

      // Clear after use
      tokenizer.clear();

      expect(finalCode).toBe(original);
    });

    it('should validate compliance with empty tokenized content', () => {
      const { tokenized } = tokenizer.tokenize('Email: john@example.com');

      // Validate no PII remains
      const newTokenizer = new PIITokenizer();
      const validation = newTokenizer.tokenize(tokenized);

      expect(validation.piiCount).toBe(0); // No PII in tokenized content
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle realistic test file with mixed PII', () => {
      const testFile = `
        describe('UserService', () => {
          it('should create user', async () => {
            const user = {
              name: 'Alice Johnson',
              email: 'alice.johnson@example.com',
              phone: '+1-555-123-4567',
              ssn: '123-45-6789',
              paymentMethod: {
                cardNumber: '1234-5678-9012-3456',
                expiryDate: '12/25'
              }
            };

            const result = await userService.create(user);
            expect(result).toBeDefined();
          });
        });
      `;

      const { tokenized, piiCount, piiBreakdown } = tokenizer.tokenize(testFile);

      expect(piiCount).toBe(5); // name, email, phone, SSN, CC
      expect(piiBreakdown.names).toBe(1);
      expect(piiBreakdown.emails).toBe(1);
      expect(piiBreakdown.phones).toBe(1);
      expect(piiBreakdown.ssns).toBe(1);
      expect(piiBreakdown.creditCards).toBe(1);

      expect(tokenized).toContain('[NAME_0]');
      expect(tokenized).toContain('[EMAIL_0]');
      expect(tokenized).toContain('[PHONE_0]');
      expect(tokenized).toContain('[SSN_0]');
      expect(tokenized).toContain('[CC_0]');
    });

    it('should handle API response with user data', () => {
      const apiResponse = JSON.stringify({
        users: [
          {
            id: 1,
            name: 'John Doe',
            email: 'john.doe@example.com',
            phone: '555-123-4567',
          },
          {
            id: 2,
            name: 'Jane Smith',
            email: 'jane.smith@example.com',
            phone: '555-987-6543',
          },
        ],
      }, null, 2);

      const { tokenized, piiCount } = tokenizer.tokenize(apiResponse);

      expect(piiCount).toBe(6); // 2 names, 2 emails, 2 phones
    });

    it('should handle SQL seed data with PII', () => {
      const seedData = `
        INSERT INTO users (name, email, phone, ssn) VALUES
        ('Alice Johnson', 'alice@example.com', '555-111-2222', '111-11-1111'),
        ('Bob Williams', 'bob@example.com', '555-333-4444', '222-22-2222'),
        ('Charlie Brown', 'charlie@example.com', '555-555-6666', '333-33-3333');
      `;

      const { tokenized, piiCount } = tokenizer.tokenize(seedData);

      expect(piiCount).toBe(12); // 3 names, 3 emails, 3 phones, 3 SSNs
    });
  });

  describe('Clear Operation', () => {
    it('should clear all reverse maps', () => {
      tokenizer.tokenize('john@example.com, 555-123-4567, 123-45-6789, John Doe, 1234-5678-9012-3456');

      tokenizer.clear();

      const stats = tokenizer.getStats();
      expect(stats.emails).toBe(0);
      expect(stats.phones).toBe(0);
      expect(stats.ssns).toBe(0);
      expect(stats.creditCards).toBe(0);
      expect(stats.names).toBe(0);
      expect(stats.total).toBe(0);
    });

    it('should allow reuse after clear', () => {
      tokenizer.tokenize('john@example.com');
      tokenizer.clear();

      const { tokenized, piiCount } = tokenizer.tokenize('alice@example.com');

      expect(tokenized).toBe('[EMAIL_0]'); // Resets to 0
      expect(piiCount).toBe(1);
    });
  });
});
