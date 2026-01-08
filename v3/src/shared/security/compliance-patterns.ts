/**
 * Agentic QE v3 - Compliance Pattern Analyzer
 * Detects security and compliance patterns in source code
 */

import { FileReader } from '../io';
import { TypeScriptParser } from '../parsers';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface PatternMatch {
  file: string;
  line: number;
  column?: number;
  snippet: string;
  pattern: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface CompliancePatternResult {
  category: string;
  passed: boolean;
  matches: PatternMatch[];
  missingPatterns: string[];
}

export interface EncryptionAnalysis {
  hasEncryption: boolean;
  encryptionLibraries: string[];
  unencryptedDataHandling: PatternMatch[];
  weakCrypto: PatternMatch[];
}

export interface AccessControlAnalysis {
  hasAuthMiddleware: boolean;
  unprotectedRoutes: PatternMatch[];
  missingRoleChecks: PatternMatch[];
  hardcodedCredentials: PatternMatch[];
}

export interface LoggingAnalysis {
  hasAuditLogging: boolean;
  sensitiveOperationsWithoutLogging: PatternMatch[];
  sensitiveDataInLogs: PatternMatch[];
}

export interface DataProtectionAnalysis {
  piiFields: PatternMatch[];
  unmaskedPii: PatternMatch[];
  missingValidation: PatternMatch[];
}

export interface SecurityControlsAnalysis {
  hasRateLimiting: boolean;
  hasCsrfProtection: boolean;
  hasCors: boolean;
  hasInputValidation: boolean;
  missingControls: string[];
  vulnerabilities: PatternMatch[];
}

// ============================================================================
// Pattern Definitions
// ============================================================================

const ENCRYPTION_PATTERNS = {
  // Libraries and imports indicating encryption usage
  libraries: [
    /import\s+.*\bfrom\s+['"]crypto['"]/,
    /import\s+.*\bfrom\s+['"]bcrypt['"]/,
    /import\s+.*\bfrom\s+['"]argon2['"]/,
    /import\s+.*\bfrom\s+['"]node-forge['"]/,
    /import\s+.*\bfrom\s+['"]crypto-js['"]/,
    /require\s*\(\s*['"]crypto['"]\s*\)/,
  ],
  // Encryption function calls
  encryption: [
    /\.encrypt\s*\(/,
    /\.decrypt\s*\(/,
    /createCipheriv\s*\(/,
    /createDecipheriv\s*\(/,
    /\.hash\s*\(/,
    /bcrypt\.(hash|compare)/,
    /argon2\.(hash|verify)/,
  ],
  // Weak/deprecated crypto
  weakCrypto: [
    /createCipher\s*\(\s*['"]des['"]/i,
    /createCipher\s*\(\s*['"]md5['"]/i,
    /\.createHash\s*\(\s*['"]md5['"]\s*\)/,
    /\.createHash\s*\(\s*['"]sha1['"]\s*\)/,
  ],
  // Unencrypted sensitive data handling
  unencryptedData: [
    /password\s*[:=]\s*[^{]*(?!hash|encrypt|bcrypt)/i,
    /\.parse\s*\(\s*.*password/i,
    /JSON\.stringify\s*\([^)]*password[^)]*\)/i,
  ],
};

const ACCESS_CONTROL_PATTERNS = {
  // Auth middleware patterns
  authMiddleware: [
    /\.use\s*\(\s*(?:auth|authenticate|passport|jwt|bearer)/i,
    /middleware\s*[:=].*(?:auth|authenticate|verify)/i,
    /isAuthenticated/,
    /requireAuth/,
    /checkAuth/,
  ],
  // Route protection
  routeProtection: [
    /(?:app|router)\.\w+\s*\([^)]*,\s*(?:auth|authenticate|protect)/i,
    /@(?:Auth|Authenticated|RequireAuth|Roles?)\s*\(/,
  ],
  // Missing protection patterns (routes without auth)
  unprotectedRoutes: [
    /(?:app|router)\.(?:get|post|put|delete|patch)\s*\(\s*['"][^'"]*(?:admin|user|account|profile|settings)[^'"]*['"]\s*,\s*(?:async\s*)?\([^)]*\)\s*=>/i,
  ],
  // Hardcoded credentials
  hardcodedCreds: [
    /(?:password|secret|apikey|api_key|token)\s*[:=]\s*['"][^'"]{8,}['"]/i,
    /Authorization\s*[:=]\s*['"]Bearer\s+[^'"]+['"]/i,
  ],
};

const LOGGING_PATTERNS = {
  // Audit logging
  auditLog: [
    /audit\.log/i,
    /auditLog/,
    /\.audit\s*\(/,
    /logger\.(?:audit|security)/i,
    /winston\.(?:audit)/i,
  ],
  // General logging
  generalLog: [
    /console\.(?:log|info|warn|error)/,
    /logger\.(?:log|info|warn|error|debug)/,
    /winston\.(?:log|info|warn|error)/,
    /pino\.(?:info|warn|error)/,
  ],
  // Sensitive operations that should be logged
  sensitiveOperations: [
    /\.delete\s*\(/,
    /\.remove\s*\(/,
    /\.update\s*\([^)]*(?:password|role|permission)/i,
    /\.create(?:User|Admin|Account)/i,
    /login|logout|signIn|signOut/i,
  ],
  // Sensitive data in logs (violation)
  sensitiveInLogs: [
    /console\.log\s*\([^)]*(?:password|secret|token|apikey|ssn|creditcard)/i,
    /logger\.(?:log|info|debug)\s*\([^)]*(?:password|secret|token)/i,
  ],
};

const DATA_PROTECTION_PATTERNS = {
  // PII field patterns
  piiFields: [
    /(?:email|phone|ssn|social_security|date_of_birth|dob|address|zip_code|postal)\s*[:=?]/i,
    /firstName|lastName|fullName|name\s*:/i,
    /creditCard|cardNumber|cvv|expiry/i,
    /passport|driverLicense|nationalId/i,
  ],
  // Masking patterns
  masking: [
    /\.mask\s*\(/,
    /maskPii|maskData|redact/i,
    /\*{3,}/,
    /x{3,}/i,
  ],
  // Input validation
  validation: [
    /\.validate\s*\(/,
    /Joi\.|yup\.|zod\./,
    /@IsEmail|@IsString|@IsNumber|@ValidateNested/,
    /express-validator/,
  ],
};

const SECURITY_CONTROLS_PATTERNS = {
  // Rate limiting
  rateLimiting: [
    /rateLimit|rate-limit|rateLimiter/i,
    /express-rate-limit/,
    /slowDown/,
    /throttle/i,
  ],
  // CSRF protection
  csrf: [
    /csrf|csurf/i,
    /csrfToken/,
    /@Csrf/,
  ],
  // CORS
  cors: [
    /\bcors\b/i,
    /Access-Control-Allow/,
    /\.cors\s*\(/,
  ],
  // Input sanitization
  sanitization: [
    /sanitize|escape|xss/i,
    /DOMPurify/,
    /validator\.escape/,
  ],
  // SQL injection prevention
  sqlInjection: [
    /\$\d|:\w+|\?/, // Parameterized queries
    /\.prepare\s*\(/,
    /sequelize|prisma|typeorm|knex/i,
  ],
};

// ============================================================================
// Compliance Pattern Analyzer
// ============================================================================

export class CompliancePatternAnalyzer {
  private readonly fileReader: FileReader;
  private readonly parser: TypeScriptParser;

  constructor() {
    this.fileReader = new FileReader();
    this.parser = new TypeScriptParser();
  }

  /**
   * Analyze encryption patterns in files
   */
  async analyzeEncryption(files: string[]): Promise<EncryptionAnalysis> {
    const encryptionLibraries: string[] = [];
    const unencryptedDataHandling: PatternMatch[] = [];
    const weakCrypto: PatternMatch[] = [];
    let hasEncryption = false;

    for (const file of files) {
      const result = await this.fileReader.readFile(file);
      if (!result.success) continue;

      const content = result.value;
      const lines = content.split('\n');

      // Check for encryption libraries
      for (const pattern of ENCRYPTION_PATTERNS.libraries) {
        if (pattern.test(content)) {
          hasEncryption = true;
          const match = content.match(pattern);
          if (match) {
            const lib = match[0].match(/['"]([^'"]+)['"]/)?.[1];
            if (lib && !encryptionLibraries.includes(lib)) {
              encryptionLibraries.push(lib);
            }
          }
        }
      }

      // Check for encryption usage
      for (const pattern of ENCRYPTION_PATTERNS.encryption) {
        if (pattern.test(content)) {
          hasEncryption = true;
        }
      }

      // Check for weak crypto
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const pattern of ENCRYPTION_PATTERNS.weakCrypto) {
          if (pattern.test(line)) {
            weakCrypto.push({
              file,
              line: i + 1,
              snippet: line.trim().substring(0, 100),
              pattern: 'weak-crypto',
              severity: 'critical',
            });
          }
        }

        // Check for unencrypted data handling
        for (const pattern of ENCRYPTION_PATTERNS.unencryptedData) {
          if (pattern.test(line)) {
            unencryptedDataHandling.push({
              file,
              line: i + 1,
              snippet: line.trim().substring(0, 100),
              pattern: 'unencrypted-data',
              severity: 'warning',
            });
          }
        }
      }
    }

    return {
      hasEncryption,
      encryptionLibraries,
      unencryptedDataHandling,
      weakCrypto,
    };
  }

  /**
   * Analyze access control patterns
   */
  async analyzeAccessControl(files: string[]): Promise<AccessControlAnalysis> {
    const unprotectedRoutes: PatternMatch[] = [];
    const missingRoleChecks: PatternMatch[] = [];
    const hardcodedCredentials: PatternMatch[] = [];
    let hasAuthMiddleware = false;

    for (const file of files) {
      const result = await this.fileReader.readFile(file);
      if (!result.success) continue;

      const content = result.value;
      const lines = content.split('\n');

      // Check for auth middleware
      for (const pattern of ACCESS_CONTROL_PATTERNS.authMiddleware) {
        if (pattern.test(content)) {
          hasAuthMiddleware = true;
          break;
        }
      }

      // Check for route protection
      for (const pattern of ACCESS_CONTROL_PATTERNS.routeProtection) {
        if (pattern.test(content)) {
          hasAuthMiddleware = true;
        }
      }

      // Analyze each line
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Check for unprotected routes
        for (const pattern of ACCESS_CONTROL_PATTERNS.unprotectedRoutes) {
          if (pattern.test(line)) {
            // Check if next lines have auth middleware
            const contextLines = lines.slice(i, i + 3).join('\n');
            const hasAuth = ACCESS_CONTROL_PATTERNS.authMiddleware.some((p) =>
              p.test(contextLines)
            );
            if (!hasAuth) {
              unprotectedRoutes.push({
                file,
                line: i + 1,
                snippet: line.trim().substring(0, 100),
                pattern: 'unprotected-route',
                severity: 'warning',
              });
            }
          }
        }

        // Check for hardcoded credentials
        for (const pattern of ACCESS_CONTROL_PATTERNS.hardcodedCreds) {
          if (pattern.test(line)) {
            hardcodedCredentials.push({
              file,
              line: i + 1,
              snippet: line.trim().substring(0, 50) + '...[REDACTED]',
              pattern: 'hardcoded-credential',
              severity: 'critical',
            });
          }
        }
      }
    }

    return {
      hasAuthMiddleware,
      unprotectedRoutes,
      missingRoleChecks,
      hardcodedCredentials,
    };
  }

  /**
   * Analyze logging patterns
   */
  async analyzeLogging(files: string[]): Promise<LoggingAnalysis> {
    const sensitiveOperationsWithoutLogging: PatternMatch[] = [];
    const sensitiveDataInLogs: PatternMatch[] = [];
    let hasAuditLogging = false;

    for (const file of files) {
      const result = await this.fileReader.readFile(file);
      if (!result.success) continue;

      const content = result.value;
      const lines = content.split('\n');

      // Check for audit logging
      for (const pattern of LOGGING_PATTERNS.auditLog) {
        if (pattern.test(content)) {
          hasAuditLogging = true;
          break;
        }
      }

      // Analyze each line
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Check for sensitive operations without logging
        for (const pattern of LOGGING_PATTERNS.sensitiveOperations) {
          if (pattern.test(line)) {
            // Check surrounding context for logging
            const startLine = Math.max(0, i - 5);
            const endLine = Math.min(lines.length, i + 5);
            const context = lines.slice(startLine, endLine).join('\n');

            const hasLogging = LOGGING_PATTERNS.generalLog.some((p) =>
              p.test(context)
            );
            if (!hasLogging) {
              sensitiveOperationsWithoutLogging.push({
                file,
                line: i + 1,
                snippet: line.trim().substring(0, 100),
                pattern: 'missing-audit-log',
                severity: 'warning',
              });
            }
          }
        }

        // Check for sensitive data in logs
        for (const pattern of LOGGING_PATTERNS.sensitiveInLogs) {
          if (pattern.test(line)) {
            sensitiveDataInLogs.push({
              file,
              line: i + 1,
              snippet: line.trim().substring(0, 100),
              pattern: 'sensitive-data-logged',
              severity: 'critical',
            });
          }
        }
      }
    }

    return {
      hasAuditLogging,
      sensitiveOperationsWithoutLogging,
      sensitiveDataInLogs,
    };
  }

  /**
   * Analyze data protection patterns
   */
  async analyzeDataProtection(files: string[]): Promise<DataProtectionAnalysis> {
    const piiFields: PatternMatch[] = [];
    const unmaskedPii: PatternMatch[] = [];
    const missingValidation: PatternMatch[] = [];

    for (const file of files) {
      const result = await this.fileReader.readFile(file);
      if (!result.success) continue;

      const content = result.value;
      const lines = content.split('\n');

      // Check for validation library usage
      const hasValidation = DATA_PROTECTION_PATTERNS.validation.some((p) =>
        p.test(content)
      );

      // Check for masking patterns
      const hasMasking = DATA_PROTECTION_PATTERNS.masking.some((p) =>
        p.test(content)
      );

      // Analyze each line
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Find PII fields
        for (const pattern of DATA_PROTECTION_PATTERNS.piiFields) {
          if (pattern.test(line)) {
            piiFields.push({
              file,
              line: i + 1,
              snippet: line.trim().substring(0, 100),
              pattern: 'pii-field',
              severity: 'info',
            });

            // Check if this PII field has masking
            const contextLines = lines.slice(Math.max(0, i - 2), i + 3).join('\n');
            const fieldHasMasking = DATA_PROTECTION_PATTERNS.masking.some((p) =>
              p.test(contextLines)
            );
            if (!fieldHasMasking && !hasMasking) {
              unmaskedPii.push({
                file,
                line: i + 1,
                snippet: line.trim().substring(0, 100),
                pattern: 'unmasked-pii',
                severity: 'warning',
              });
            }
          }
        }
      }

      // If file has PII but no validation
      if (piiFields.length > 0 && !hasValidation) {
        missingValidation.push({
          file,
          line: 1,
          snippet: 'File contains PII fields without input validation',
          pattern: 'missing-validation',
          severity: 'warning',
        });
      }
    }

    return {
      piiFields,
      unmaskedPii,
      missingValidation,
    };
  }

  /**
   * Analyze security controls
   */
  async analyzeSecurityControls(files: string[]): Promise<SecurityControlsAnalysis> {
    const vulnerabilities: PatternMatch[] = [];
    const missingControls: string[] = [];
    let hasRateLimiting = false;
    let hasCsrfProtection = false;
    let hasCors = false;
    let hasInputValidation = false;

    for (const file of files) {
      const result = await this.fileReader.readFile(file);
      if (!result.success) continue;

      const content = result.value;

      // Check for rate limiting
      if (SECURITY_CONTROLS_PATTERNS.rateLimiting.some((p) => p.test(content))) {
        hasRateLimiting = true;
      }

      // Check for CSRF protection
      if (SECURITY_CONTROLS_PATTERNS.csrf.some((p) => p.test(content))) {
        hasCsrfProtection = true;
      }

      // Check for CORS
      if (SECURITY_CONTROLS_PATTERNS.cors.some((p) => p.test(content))) {
        hasCors = true;
      }

      // Check for input sanitization/validation
      if (SECURITY_CONTROLS_PATTERNS.sanitization.some((p) => p.test(content))) {
        hasInputValidation = true;
      }
    }

    // Determine missing controls
    if (!hasRateLimiting) missingControls.push('Rate Limiting');
    if (!hasCsrfProtection) missingControls.push('CSRF Protection');
    if (!hasCors) missingControls.push('CORS Configuration');
    if (!hasInputValidation) missingControls.push('Input Validation/Sanitization');

    return {
      hasRateLimiting,
      hasCsrfProtection,
      hasCors,
      hasInputValidation,
      missingControls,
      vulnerabilities,
    };
  }

  /**
   * Scan files for specific data types (PII, PHI, etc.)
   */
  async scanForDataTypes(
    files: string[],
    dataTypes: Array<'pii' | 'phi' | 'financial' | 'credentials' | 'biometric'>
  ): Promise<Map<string, PatternMatch[]>> {
    const results = new Map<string, PatternMatch[]>();

    const dataTypePatterns: Record<string, RegExp[]> = {
      pii: [
        /email|phone|ssn|social_security|address|date_of_birth|dob/i,
        /firstName|lastName|fullName/i,
        /passport|driverLicense|nationalId/i,
      ],
      phi: [
        /medical|diagnosis|prescription|patient|health/i,
        /insurance|provider|treatment/i,
        /blood_type|allergy|medication/i,
      ],
      financial: [
        /creditCard|cardNumber|cvv|expiry|account_number/i,
        /bank|routing|swift|iban/i,
        /transaction|payment|billing/i,
      ],
      credentials: [
        /password|secret|apikey|api_key|token|auth/i,
        /private_key|certificate|credential/i,
      ],
      biometric: [
        /fingerprint|faceId|retina|voice_print/i,
        /biometric|facial_recognition/i,
      ],
    };

    for (const dataType of dataTypes) {
      results.set(dataType, []);
    }

    for (const file of files) {
      const readResult = await this.fileReader.readFile(file);
      if (!readResult.success) continue;

      const lines = readResult.value.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        for (const dataType of dataTypes) {
          const patterns = dataTypePatterns[dataType] || [];
          for (const pattern of patterns) {
            if (pattern.test(line)) {
              const matches = results.get(dataType) || [];
              matches.push({
                file,
                line: i + 1,
                snippet: line.trim().substring(0, 100),
                pattern: dataType,
                severity: 'info',
              });
              results.set(dataType, matches);
              break; // Only count once per line per data type
            }
          }
        }
      }
    }

    return results;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultAnalyzer: CompliancePatternAnalyzer | null = null;

export function getCompliancePatternAnalyzer(): CompliancePatternAnalyzer {
  if (!defaultAnalyzer) {
    defaultAnalyzer = new CompliancePatternAnalyzer();
  }
  return defaultAnalyzer;
}
