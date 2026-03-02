/**
 * URL Security Validation MCP Tool
 *
 * Validates URLs for security threats (XSS, injection, unsafe protocols)
 * and scans URL/query parameters for PII exposure (emails, SSNs, phone
 * numbers, credit card numbers).
 */

import {
  MCPToolBase,
  MCPToolConfig,
  MCPToolContext,
  MCPToolSchema,
} from '../base.js';
import { ToolResult } from '../../types.js';
import { toErrorMessage } from '../../../shared/error-utils.js';

// ============================================================================
// Types
// ============================================================================

export interface URLSecurityParams {
  url: string;
  enablePII?: boolean;
  [key: string]: unknown;
}

export interface URLSecurityResult {
  url: string;
  urlSecurity: {
    valid: boolean;
    riskLevel: string;
    issues: Array<{ type: string; description: string; severity: string }>;
  };
  piiExposure: {
    scanned: boolean;
    found: boolean;
    types: string[];
    details: Array<{ type: string; location: string; masked: string }>;
  };
  summary: string;
}

// ============================================================================
// PII Patterns
// ============================================================================

const PII_PATTERNS: Array<{
  type: string;
  pattern: RegExp;
  mask: (match: string) => string;
}> = [
  {
    type: 'email',
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    mask: (m) => m[0] + '***@' + m.split('@')[1],
  },
  {
    type: 'ssn',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    mask: () => '***-**-****',
  },
  {
    type: 'credit-card',
    pattern: /\b(?:\d[ -]*?){13,19}\b/g,
    mask: (m) => '****-****-****-' + m.replace(/\D/g, '').slice(-4),
  },
  {
    type: 'phone',
    pattern: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g,
    mask: (m) => m.slice(0, 3) + '***' + m.slice(-2),
  },
  {
    type: 'api-key',
    // Common API key patterns: long hex/base64 strings in query params
    pattern: /(?:key|token|api_key|apikey|secret|password|passwd|auth)=([A-Za-z0-9_\-]{16,})/gi,
    mask: () => '***REDACTED***',
  },
];

// ============================================================================
// Tool Implementation
// ============================================================================

export class VisualSecurityTool extends MCPToolBase<URLSecurityParams, URLSecurityResult> {
  readonly config: MCPToolConfig = {
    name: 'qe/security/url-validate',
    description:
      'Validate URL security: checks for XSS/injection patterns, unsafe protocols, ' +
      'and scans URL query parameters for PII exposure (emails, SSNs, credit cards, API keys).',
    domain: 'security-compliance',
    schema: this.buildSchema(),
  };

  private buildSchema(): MCPToolSchema {
    return {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to validate for security threats and PII exposure',
        },
        enablePII: {
          type: 'boolean',
          description: 'Enable PII exposure scanning in URL and query parameters',
          default: true,
        },
      },
      required: ['url'],
    };
  }

  async execute(
    params: URLSecurityParams,
    context: MCPToolContext
  ): Promise<ToolResult<URLSecurityResult>> {
    try {
      const urlSecurity = this.validateURLSecurity(params.url);
      const piiExposure = params.enablePII !== false
        ? this.scanForPII(params.url)
        : { scanned: false, found: false, types: [] as string[], details: [] as URLSecurityResult['piiExposure']['details'] };

      const issueCount = urlSecurity.issues.length + (piiExposure.found ? piiExposure.types.length : 0);
      const summary = issueCount === 0
        ? `URL passed all checks (security: clean, PII: ${piiExposure.scanned ? 'none found' : 'not scanned'})`
        : `URL has ${urlSecurity.issues.length} security issue(s)${piiExposure.found ? ` and ${piiExposure.types.length} PII type(s) exposed in URL` : ''}`;

      return {
        success: true,
        data: {
          url: params.url,
          urlSecurity,
          piiExposure,
          summary,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: toErrorMessage(error),
      };
    }
  }

  private validateURLSecurity(url: string): URLSecurityResult['urlSecurity'] {
    const issues: Array<{ type: string; description: string; severity: string }> = [];
    let riskLevel = 'none';

    try {
      const parsed = new URL(url);

      if (!['http:', 'https:'].includes(parsed.protocol)) {
        issues.push({
          type: 'unsafe-protocol',
          description: `Protocol ${parsed.protocol} is not allowed`,
          severity: 'high',
        });
        riskLevel = 'high';
      }

      // XSS patterns
      const xssPatterns = [/<script/i, /javascript:/i, /on\w+=/i, /data:text\/html/i];
      for (const pattern of xssPatterns) {
        if (pattern.test(url)) {
          issues.push({
            type: 'xss',
            description: 'Potential XSS pattern detected in URL',
            severity: 'critical',
          });
          riskLevel = 'critical';
          break;
        }
      }

      // SQL injection patterns
      const sqlPatterns = [/'.*or.*'/i, /union.*select/i, /drop.*table/i, /;\s*--/i];
      for (const pattern of sqlPatterns) {
        if (pattern.test(url)) {
          issues.push({
            type: 'sql-injection',
            description: 'Potential SQL injection pattern detected in URL',
            severity: 'critical',
          });
          riskLevel = 'critical';
          break;
        }
      }

      // Path traversal
      if (/\.\.[/\\]/.test(url)) {
        issues.push({
          type: 'path-traversal',
          description: 'Potential path traversal pattern (../) detected',
          severity: 'high',
        });
        if (riskLevel !== 'critical') riskLevel = 'high';
      }

      // Open redirect via query param
      const redirectParams = ['redirect', 'url', 'next', 'return', 'returnUrl', 'goto'];
      for (const param of redirectParams) {
        const value = parsed.searchParams.get(param);
        if (value && /^https?:\/\//.test(value)) {
          issues.push({
            type: 'open-redirect',
            description: `Query parameter "${param}" contains an external URL — potential open redirect`,
            severity: 'medium',
          });
          if (riskLevel === 'none') riskLevel = 'medium';
        }
      }
    } catch {
      issues.push({
        type: 'invalid-url',
        description: 'URL could not be parsed',
        severity: 'critical',
      });
      riskLevel = 'critical';
    }

    return { valid: issues.length === 0, riskLevel, issues };
  }

  private scanForPII(url: string): URLSecurityResult['piiExposure'] {
    const details: URLSecurityResult['piiExposure']['details'] = [];
    const typesFound = new Set<string>();

    // Decode URL to catch encoded PII
    let decoded: string;
    try {
      decoded = decodeURIComponent(url);
    } catch {
      decoded = url;
    }

    // Determine which part of the URL the PII is in
    let queryString = '';
    let pathString = '';
    try {
      const parsed = new URL(decoded);
      queryString = parsed.search;
      pathString = parsed.pathname;
    } catch {
      queryString = decoded;
    }

    for (const { type, pattern, mask } of PII_PATTERNS) {
      // Reset regex lastIndex for global patterns
      pattern.lastIndex = 0;

      let match;
      while ((match = pattern.exec(decoded)) !== null) {
        typesFound.add(type);
        const location = queryString.includes(match[0])
          ? 'query-parameter'
          : pathString.includes(match[0])
            ? 'path'
            : 'url';
        details.push({
          type,
          location,
          masked: mask(match[0]),
        });
      }
    }

    return {
      scanned: true,
      found: typesFound.size > 0,
      types: Array.from(typesFound),
      details,
    };
  }
}
