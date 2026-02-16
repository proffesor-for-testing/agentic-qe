/**
 * Agentic QE v3 - Security Auditor Secret Scanner
 * Extracted from security-auditor.ts - Secret/credential detection
 */

import * as fs from 'fs/promises';
import type { FilePath } from '../../../shared/value-objects/index.js';
import type {
  DetectedSecret,
  VulnerabilityLocation,
} from '../interfaces.js';

// ============================================================================
// Secret Detection Pattern Definitions
// ============================================================================

interface SecretPattern {
  name: string;
  type: DetectedSecret['type'];
  regex: RegExp;
  entropyThreshold?: number;
}

/**
 * Get the comprehensive set of secret detection patterns
 */
export function getSecretPatterns(): SecretPattern[] {
  return [
    // AWS Keys
    {
      name: 'AWS Access Key ID',
      type: 'api-key',
      regex: /AKIA[0-9A-Z]{16}/g,
    },
    {
      name: 'AWS Secret Access Key',
      type: 'api-key',
      regex: /(?:aws[_-]?secret[_-]?access[_-]?key|AWS_SECRET_ACCESS_KEY)['"]?\s*[:=]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/gi,
      entropyThreshold: 4.0,
    },
    // GitHub Tokens
    {
      name: 'GitHub Personal Access Token',
      type: 'token',
      regex: /ghp_[A-Za-z0-9]{36}/g,
    },
    {
      name: 'GitHub OAuth Access Token',
      type: 'token',
      regex: /gho_[A-Za-z0-9]{36}/g,
    },
    {
      name: 'GitHub App Token',
      type: 'token',
      regex: /(?:ghu|ghs)_[A-Za-z0-9]{36}/g,
    },
    // Generic API Keys
    {
      name: 'Generic API Key',
      type: 'api-key',
      regex: /(?:api[_-]?key|apikey|api_secret)['"]?\s*[:=]\s*['"]([A-Za-z0-9_\-]{20,})['"]?/gi,
      entropyThreshold: 3.5,
    },
    // OpenAI API Key
    {
      name: 'OpenAI API Key',
      type: 'api-key',
      regex: /sk-[A-Za-z0-9]{48}/g,
    },
    // Stripe Keys
    {
      name: 'Stripe Secret Key',
      type: 'api-key',
      regex: /sk_live_[A-Za-z0-9]{24,}/g,
    },
    {
      name: 'Stripe Publishable Key',
      type: 'api-key',
      regex: /pk_live_[A-Za-z0-9]{24,}/g,
    },
    // Private Keys
    {
      name: 'RSA Private Key',
      type: 'private-key',
      regex: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/gi,
    },
    {
      name: 'PGP Private Key',
      type: 'private-key',
      regex: /-----BEGIN\s+PGP\s+PRIVATE\s+KEY\s+BLOCK-----/gi,
    },
    {
      name: 'SSH Private Key',
      type: 'private-key',
      regex: /-----BEGIN\s+(?:OPENSSH|DSA|EC)?\s*PRIVATE\s+KEY-----/gi,
    },
    // Passwords
    {
      name: 'Password Assignment',
      type: 'password',
      regex: /(?:password|passwd|pwd|secret)['"]?\s*[:=]\s*['"]([^'"\s]{8,})['"]?/gi,
      entropyThreshold: 3.0,
    },
    // Database Connection Strings
    {
      name: 'Database Connection String',
      type: 'password',
      regex: /(?:mongodb|postgres|mysql|redis):\/\/[^:]+:[^@]+@[^\s'"]+/gi,
    },
    // JWT Tokens
    {
      name: 'JWT Token',
      type: 'token',
      regex: /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g,
      entropyThreshold: 4.0,
    },
    // Slack Tokens
    {
      name: 'Slack Token',
      type: 'token',
      regex: /xox[baprs]-[A-Za-z0-9-]{10,}/g,
    },
    // Google API Key
    {
      name: 'Google API Key',
      type: 'api-key',
      regex: /AIza[A-Za-z0-9_-]{35}/g,
    },
    // Twilio
    {
      name: 'Twilio API Key',
      type: 'api-key',
      regex: /SK[A-Za-z0-9]{32}/g,
    },
    // SendGrid
    {
      name: 'SendGrid API Key',
      type: 'api-key',
      regex: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g,
    },
    // Certificates
    {
      name: 'X.509 Certificate',
      type: 'certificate',
      regex: /-----BEGIN\s+CERTIFICATE-----/gi,
    },
  ];
}

// ============================================================================
// Secret Scanning Utilities
// ============================================================================

/**
 * Calculate Shannon entropy of a string
 */
export function calculateEntropy(str: string): number {
  if (!str || str.length === 0) return 0;

  const charFrequency: Record<string, number> = {};

  for (const char of str) {
    charFrequency[char] = (charFrequency[char] || 0) + 1;
  }

  let entropy = 0;
  const len = str.length;

  for (const char in charFrequency) {
    const probability = charFrequency[char] / len;
    entropy -= probability * Math.log2(probability);
  }

  return entropy;
}

/**
 * Create a masked snippet for display
 */
export function createMaskedSnippet(line: string, matchIndex: number, matchLength: number): string {
  const contextBefore = 20;
  const contextAfter = 10;

  const start = Math.max(0, matchIndex - contextBefore);
  const end = Math.min(line.length, matchIndex + matchLength + contextAfter);

  let snippet = line.substring(start, end);

  // Mask the secret value (show first 4 and last 4 characters)
  const secretStart = matchIndex - start;
  const secretInSnippet = snippet.substring(secretStart, secretStart + matchLength);

  if (secretInSnippet.length > 8) {
    const masked = secretInSnippet.substring(0, 4) + '...' + secretInSnippet.substring(secretInSnippet.length - 4);
    snippet = snippet.substring(0, secretStart) + masked + snippet.substring(secretStart + matchLength);
  }

  if (start > 0) snippet = '...' + snippet;
  if (end < line.length) snippet = snippet + '...';

  return snippet;
}

/**
 * Validate if a detected secret is likely valid (basic validation)
 */
export function validateSecret(type: DetectedSecret['type'], value: string): boolean {
  switch (type) {
    case 'api-key':
      return value.length >= 20 && /[a-z]/.test(value) && /[A-Z0-9]/.test(value);
    case 'token':
      return value.length >= 20;
    case 'password':
      return !['password', 'secret', 'changeme', '12345678', 'qwerty'].includes(value.toLowerCase());
    case 'private-key':
      return true;
    case 'certificate':
      return true;
    default:
      return true;
  }
}

/**
 * Scan a single file for secrets
 */
export async function scanFileForSecrets(file: FilePath): Promise<DetectedSecret[]> {
  const secrets: DetectedSecret[] = [];

  try {
    const content = await fs.readFile(file.value, 'utf-8');
    const lines = content.split('\n');
    const secretPatterns = getSecretPatterns();

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const lineNumber = lineIndex + 1;

      for (const pattern of secretPatterns) {
        pattern.regex.lastIndex = 0;

        let match: RegExpExecArray | null;
        while ((match = pattern.regex.exec(line)) !== null) {
          const matchedValue = match[1] || match[0];

          const entropy = calculateEntropy(matchedValue);

          if (pattern.entropyThreshold && entropy < pattern.entropyThreshold) {
            continue;
          }

          const snippet = createMaskedSnippet(line, match.index, matchedValue.length);

          const location: VulnerabilityLocation = {
            file: file.value,
            line: lineNumber,
            column: match.index + 1,
            snippet,
          };

          secrets.push({
            type: pattern.type,
            location,
            entropy,
            isValid: validateSecret(pattern.type, matchedValue),
          });
        }
      }
    }
  } catch (error) {
    console.error(`Failed to scan file for secrets: ${file.value}`, error);
  }

  return secrets;
}
