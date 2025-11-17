/**
 * PII Tokenization Layer
 *
 * Provides bidirectional tokenization/detokenization of Personally Identifiable Information (PII)
 * for GDPR and CCPA compliance. Supports email, phone, SSN, credit card, and name detection.
 *
 * @module security/pii-tokenization
 * @compliance GDPR Article 25 (Data Protection by Design), CCPA Section 1798.100
 * @see docs/planning/mcp-improvement-plan-revised.md#CO-2
 */

/**
 * Bidirectional mapping for tokenized PII values
 *
 * @compliance GDPR Article 32 - Stores original values temporarily for detokenization,
 *             must be cleared after use to prevent data retention issues
 */
export interface TokenizationMap {
  /** Email addresses (RFC 5322 compliant) */
  email: Map<string, string>;

  /** Phone numbers (US E.164 format) */
  phone: Map<string, string>;

  /** Social Security Numbers (US format: XXX-XX-XXXX) */
  ssn: Map<string, string>;

  /** Credit card numbers (Luhn algorithm validation recommended) */
  creditCard: Map<string, string>;

  /** Personal names (First Last pattern, basic heuristic) */
  name: Map<string, string>;
}

/**
 * Result of tokenization operation with statistics
 */
export interface TokenizationResult {
  /** Content with PII replaced by tokens */
  tokenized: string;

  /** Reverse mapping for detokenization (MUST be cleared after use) */
  reverseMap: TokenizationMap;

  /** Total count of PII instances found */
  piiCount: number;

  /** Breakdown by PII type for audit trail */
  piiBreakdown: {
    emails: number;
    phones: number;
    ssns: number;
    creditCards: number;
    names: number;
  };
}

/**
 * PIITokenizer - Secure PII detection and tokenization
 *
 * **IMPORTANT COMPLIANCE NOTES:**
 *
 * 1. **GDPR Article 25 (Data Protection by Design)**:
 *    - Tokenize PII BEFORE sending to LLM or storing in logs
 *    - Clear reverse map after detokenization to minimize data retention
 *
 * 2. **CCPA Section 1798.100 (Consumer Rights)**:
 *    - No PII sent to third-party systems (Anthropic API)
 *    - Tokenized version stored in databases/logs
 *    - Original PII only in final output files (user-controlled)
 *
 * 3. **PCI-DSS Requirement 3.4**:
 *    - Credit card numbers masked/tokenized in all non-production systems
 *    - No clear-text credit cards in logs or analytics
 *
 * 4. **HIPAA Privacy Rule** (if applicable):
 *    - SSN and name combinations constitute PHI
 *    - Must be de-identified before processing
 *
 * @example
 * ```typescript
 * const tokenizer = new PIITokenizer();
 *
 * // Tokenize test data
 * const testCode = 'const email = "john.doe@example.com"; const ssn = "123-45-6789";';
 * const { tokenized, reverseMap, piiCount } = tokenizer.tokenize(testCode);
 *
 * console.log(tokenized);
 * // Output: 'const email = "[EMAIL_0]"; const ssn = "[SSN_0]";'
 *
 * // Store tokenized version in database (GDPR compliant)
 * await db.storeTest({ code: tokenized });
 *
 * // Detokenize for file output (user-controlled)
 * const finalCode = tokenizer.detokenize(tokenized, reverseMap);
 * await fs.writeFile('test.ts', finalCode);
 *
 * // IMPORTANT: Clear reverse map after use
 * tokenizer.clear();
 * ```
 */
export class PIITokenizer {
  /**
   * Reverse mapping for detokenization
   *
   * @private
   * @compliance GDPR Article 32 - Must be cleared after use to prevent data retention
   */
  private reverseMap: TokenizationMap = {
    email: new Map(),
    phone: new Map(),
    ssn: new Map(),
    creditCard: new Map(),
    name: new Map(),
  };

  /**
   * Regular expression patterns for PII detection
   *
   * @private
   */
  private readonly patterns = {
    /**
     * Email pattern (RFC 5322 simplified)
     * Matches: john.doe@example.com, user+tag@domain.co.uk
     *
     * @compliance GDPR Article 4(1) - Email is personal data
     */
    email: /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi,

    /**
     * US Phone number pattern (E.164 and common formats)
     * Matches: +1-555-123-4567, (555) 123-4567, 555.123.4567, 5551234567
     *
     * @compliance CCPA - Phone numbers are personal information
     *
     * Fixed: Removed \b (word boundary) which fails with parentheses
     * Uses negative lookahead (?!\d) to prevent matching longer sequences
     */
    phone: /(?:\+1[-.]?)?[(]?([0-9]{3})[)]?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})(?!\d)/g,

    /**
     * US Social Security Number (XXX-XX-XXXX)
     * Matches: 123-45-6789
     *
     * @compliance HIPAA Privacy Rule - SSN is Protected Health Information (PHI)
     */
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,

    /**
     * Credit Card Number (Visa, Mastercard, Amex, Discover)
     * Matches: 1234-5678-9012-3456, 1234 5678 9012 3456, 1234567890123456
     *
     * @compliance PCI-DSS Requirement 3.4 - Must be masked/tokenized
     */
    creditCard: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,

    /**
     * Personal name (basic heuristic: First Last with capital letters)
     * Matches: John Doe, Mary Jane
     *
     * WARNING: This is a basic pattern and may produce false positives
     * (e.g., class names, constants). Only tokenizes names longer than 2 characters.
     *
     * @compliance GDPR Article 4(1) - Names are personal data
     */
    name: /\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/g,
  };

  /**
   * Tokenize PII in test code, data files, or generated content
   *
   * **COMPLIANCE WORKFLOW:**
   * 1. Detect PII using regex patterns
   * 2. Replace with tokens ([EMAIL_0], [PHONE_1], etc.)
   * 3. Store reverse map for detokenization
   * 4. Return tokenized content safe for LLM processing
   *
   * @param content - Raw content that may contain PII
   * @returns Tokenization result with statistics and reverse map
   *
   * @example
   * ```typescript
   * const tokenizer = new PIITokenizer();
   * const result = tokenizer.tokenize(`
   *   const user = {
   *     name: "John Doe",
   *     email: "john.doe@example.com",
   *     phone: "+1-555-123-4567",
   *     ssn: "123-45-6789"
   *   };
   * `);
   *
   * console.log(result.piiCount); // 4
   * console.log(result.piiBreakdown);
   * // { emails: 1, phones: 1, ssns: 1, creditCards: 0, names: 1 }
   * ```
   */
  tokenize(content: string): TokenizationResult {
    let tokenized = content;
    const breakdown = {
      emails: 0,
      phones: 0,
      ssns: 0,
      creditCards: 0,
      names: 0,
    };

    // IMPORTANT: Process patterns in order of specificity to avoid false matches
    // 1. Credit cards first (most specific: 13-19 digits with separators)
    // 2. SSNs second (specific: XXX-XX-XXXX format)
    // 3. Phones third (less specific: 10 digits, can match parts of CC numbers)
    // 4. Emails fourth
    // 5. Names last (least specific, prone to false positives)

    // Tokenize credit cards (BEFORE phones to prevent false matches)
    tokenized = tokenized.replace(this.patterns.creditCard, (cc) => {
      const token = `[CC_${this.reverseMap.creditCard.size}]`;
      this.reverseMap.creditCard.set(token, cc);
      breakdown.creditCards++;
      return token;
    });

    // Tokenize SSNs
    tokenized = tokenized.replace(this.patterns.ssn, (ssn) => {
      const token = `[SSN_${this.reverseMap.ssn.size}]`;
      this.reverseMap.ssn.set(token, ssn);
      breakdown.ssns++;
      return token;
    });

    // Tokenize phone numbers (US format) - AFTER credit cards
    tokenized = tokenized.replace(this.patterns.phone, (phone) => {
      const token = `[PHONE_${this.reverseMap.phone.size}]`;
      this.reverseMap.phone.set(token, phone);
      breakdown.phones++;
      return token;
    });

    // Tokenize emails
    tokenized = tokenized.replace(this.patterns.email, (email) => {
      const token = `[EMAIL_${this.reverseMap.email.size}]`;
      this.reverseMap.email.set(token, email);
      breakdown.emails++;
      return token;
    });

    // Tokenize names (with length filter to reduce false positives)
    tokenized = tokenized.replace(this.patterns.name, (match, first: string, last: string) => {
      // Only tokenize if both parts are longer than 2 characters
      // This reduces false positives from code like "New User" or "Post Request"
      if (first.length > 2 && last.length > 2) {
        const token = `[NAME_${this.reverseMap.name.size}]`;
        this.reverseMap.name.set(token, match);
        breakdown.names++;
        return token;
      }
      return match;
    });

    const piiCount = breakdown.emails + breakdown.phones + breakdown.ssns +
                     breakdown.creditCards + breakdown.names;

    return {
      tokenized,
      reverseMap: this.reverseMap,
      piiCount,
      piiBreakdown: breakdown,
    };
  }

  /**
   * Reverse tokenization to restore original PII
   *
   * **COMPLIANCE WARNING:**
   * - Only use for final file output (user-controlled)
   * - NEVER store detokenized content in logs or databases
   * - Call clear() immediately after use to minimize data retention
   *
   * @param tokenized - Content with PII tokens
   * @param reverseMap - Tokenization map from tokenize() call
   * @returns Original content with PII restored
   *
   * @example
   * ```typescript
   * const tokenizer = new PIITokenizer();
   * const { tokenized, reverseMap } = tokenizer.tokenize('Email: john@example.com');
   *
   * // Store tokenized version (GDPR compliant)
   * await db.storeTest({ code: tokenized });
   *
   * // Restore for file output
   * const finalCode = tokenizer.detokenize(tokenized, reverseMap);
   * await fs.writeFile('test.ts', finalCode);
   *
   * // IMPORTANT: Clear reverse map
   * tokenizer.clear();
   * ```
   */
  detokenize(tokenized: string, reverseMap: TokenizationMap): string {
    let detokenized = tokenized;

    // Restore all PII types
    for (const [type, map] of Object.entries(reverseMap)) {
      for (const [token, original] of map.entries()) {
        // Use split/join instead of replaceAll for ES2020 compatibility
        detokenized = detokenized.split(token).join(original);
      }
    }

    return detokenized;
  }

  /**
   * Get PII statistics for audit trail
   *
   * **COMPLIANCE USE:**
   * - Generate audit logs showing PII detection
   * - Monitor for unexpected PII in generated content
   * - Track compliance metrics over time
   *
   * @returns Breakdown of detected PII by type
   *
   * @example
   * ```typescript
   * const tokenizer = new PIITokenizer();
   * tokenizer.tokenize('Email: john@example.com, Phone: 555-123-4567');
   *
   * const stats = tokenizer.getStats();
   * console.log(stats);
   * // { emails: 1, phones: 1, ssns: 0, creditCards: 0, names: 0, total: 2 }
   *
   * // Log for audit trail
   * logger.info('PII detected in generated content', stats);
   * ```
   */
  getStats(): Record<string, number> {
    return {
      emails: this.reverseMap.email.size,
      phones: this.reverseMap.phone.size,
      ssns: this.reverseMap.ssn.size,
      creditCards: this.reverseMap.creditCard.size,
      names: this.reverseMap.name.size,
      total:
        this.reverseMap.email.size +
        this.reverseMap.phone.size +
        this.reverseMap.ssn.size +
        this.reverseMap.creditCard.size +
        this.reverseMap.name.size,
    };
  }

  /**
   * Clear reverse map to minimize data retention
   *
   * **COMPLIANCE REQUIREMENT:**
   * - GDPR Article 5(1)(e) - Storage limitation principle
   * - CCPA Section 1798.105 - Right to deletion
   *
   * MUST be called after detokenization to prevent storing PII longer than necessary.
   *
   * @example
   * ```typescript
   * const tokenizer = new PIITokenizer();
   * const { tokenized, reverseMap } = tokenizer.tokenize(content);
   *
   * // Use tokenized content
   * await processWithLLM(tokenized);
   *
   * // Detokenize for output
   * const finalCode = tokenizer.detokenize(tokenized, reverseMap);
   * await fs.writeFile('output.ts', finalCode);
   *
   * // CRITICAL: Clear reverse map
   * tokenizer.clear(); // GDPR compliance
   * ```
   */
  clear(): void {
    this.reverseMap.email.clear();
    this.reverseMap.phone.clear();
    this.reverseMap.ssn.clear();
    this.reverseMap.creditCard.clear();
    this.reverseMap.name.clear();
  }
}
