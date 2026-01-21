/**
 * BrowserSecurityScanner
 * Wraps @claude-flow/browser security features for the visual-accessibility domain
 *
 * This service provides security scanning capabilities for URLs and content:
 * - SSRF and phishing detection via URL validation
 * - PII detection in page content
 * - Graceful fallback when @claude-flow/browser is not available
 *
 * @module domains/visual-accessibility/services/browser-security-scanner
 */

import { Result, ok, err } from '../../../shared/types/index.js';
import { BrowserResultAdapter } from '../../../adapters/browser-result-adapter.js';

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Result of a security scan on a URL
 */
export interface SecurityScanResult {
  /** Whether the URL is safe to visit */
  safe: boolean;
  /** List of detected threats */
  threats: string[];
  /** Security score (0-1, higher is safer) */
  score: number;
}

/**
 * Result of PII detection in content
 */
export interface PIIScanResult {
  /** Whether PII was detected */
  hasPII: boolean;
  /** Types of PII detected (email, ssn, phone, etc.) */
  detectedTypes: string[];
  /** Locations of detected PII */
  locations: Array<{ type: string; start: number; end: number }>;
}

/**
 * Result of phishing detection
 */
export interface PhishingResult {
  /** Whether the URL is likely a phishing attempt */
  isPhishing: boolean;
  /** Confidence level (0-1) */
  confidence: number;
  /** List of phishing indicators found */
  indicators: string[];
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if MCP tools are available (runtime check)
 */
function hasMcpTools(): boolean {
  // Check if running in Claude Code environment with MCP support
  return typeof (globalThis as any).mcp !== 'undefined';
}

// ============================================================================
// BrowserSecurityScanner Service
// ============================================================================

/**
 * Configuration for browser security scanner
 */
export interface BrowserSecurityScannerConfig {
  /** Timeout for scan operations in milliseconds */
  timeout?: number;
  /** Enable detailed logging */
  verbose?: boolean;
}

/**
 * Browser Security Scanner Service
 * Wraps @claude-flow/browser MCP security features with graceful fallback
 */
export class BrowserSecurityScanner {
  private initialized = false;
  private browserAvailable = false;
  private config: Required<BrowserSecurityScannerConfig>;

  constructor(config: BrowserSecurityScannerConfig = {}) {
    this.config = {
      timeout: config.timeout ?? 5000,
      verbose: config.verbose ?? false,
    };
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize the scanner and check for @claude-flow/browser availability
   * Uses lazy loading to avoid hard dependency
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Check if MCP tools are available
    this.browserAvailable = hasMcpTools();

    if (this.config.verbose) {
      console.log(`[BrowserSecurityScanner] MCP tools available: ${this.browserAvailable}`);
    }

    this.initialized = true;
  }

  /**
   * Check if browser security features are available
   */
  isAvailable(): boolean {
    return this.initialized && this.browserAvailable;
  }

  // ==========================================================================
  // URL Validation (SSRF/Phishing Detection)
  // ==========================================================================

  /**
   * Validate a URL for security threats
   * Detects SSRF attempts, phishing URLs, and other malicious patterns
   *
   * @param url URL to validate
   * @returns Security scan result
   */
  async validateUrl(url: string): Promise<Result<SecurityScanResult, Error>> {
    await this.initialize();

    if (!this.browserAvailable) {
      return this.fallbackValidateUrl(url);
    }

    try {
      // Call @claude-flow/browser MCP tool via aidefence_scan
      const mcpResult = await this.callMcpTool('aidefence_scan', { input: url });

      // Parse MCP result
      if (typeof mcpResult === 'object' && mcpResult !== null) {
        const result = mcpResult as any;

        // Extract threat information
        const threats: string[] = [];
        let safe = true;
        let score = 1.0;

        if (result.threats && Array.isArray(result.threats)) {
          threats.push(...result.threats.map((t: any) => t.type || String(t)));
          safe = threats.length === 0;
          score = Math.max(0, 1.0 - threats.length * 0.25);
        } else if (result.safe === false) {
          safe = false;
          score = 0.5;
          threats.push('URL flagged as potentially unsafe');
        }

        return ok({ safe, threats, score });
      }

      // Fallback if result format is unexpected
      return this.fallbackValidateUrl(url);
    } catch (error) {
      if (this.config.verbose) {
        console.error('[BrowserSecurityScanner] validateUrl error:', error);
      }
      return this.fallbackValidateUrl(url);
    }
  }

  /**
   * Detect phishing attempts in a URL
   *
   * @param url URL to check
   * @returns Phishing detection result
   */
  async detectPhishing(url: string): Promise<Result<PhishingResult, Error>> {
    await this.initialize();

    if (!this.browserAvailable) {
      return this.fallbackDetectPhishing(url);
    }

    try {
      // Call @claude-flow/browser MCP tool via aidefence_analyze
      const mcpResult = await this.callMcpTool('aidefence_analyze', { input: url });

      if (typeof mcpResult === 'object' && mcpResult !== null) {
        const result = mcpResult as any;

        const indicators: string[] = [];
        let isPhishing = false;
        let confidence = 0;

        // Check for phishing-specific threats
        if (result.threats && Array.isArray(result.threats)) {
          const phishingThreats = result.threats.filter((t: any) =>
            (t.type || '').toLowerCase().includes('phishing')
          );
          if (phishingThreats.length > 0) {
            isPhishing = true;
            confidence = 0.8;
            indicators.push(...phishingThreats.map((t: any) => t.description || t.type));
          }
        }

        // Check confidence score
        if (result.confidence !== undefined) {
          confidence = Math.max(confidence, result.confidence);
        }

        return ok({ isPhishing, confidence, indicators });
      }

      return this.fallbackDetectPhishing(url);
    } catch (error) {
      if (this.config.verbose) {
        console.error('[BrowserSecurityScanner] detectPhishing error:', error);
      }
      return this.fallbackDetectPhishing(url);
    }
  }

  // ==========================================================================
  // PII Detection
  // ==========================================================================

  /**
   * Scan content for Personally Identifiable Information (PII)
   * Detects emails, SSNs, phone numbers, API keys, etc.
   *
   * @param content Text content to scan
   * @returns PII scan result
   */
  async scanForPII(content: string): Promise<Result<PIIScanResult, Error>> {
    await this.initialize();

    if (!this.browserAvailable) {
      return this.fallbackScanForPII(content);
    }

    try {
      // Call @claude-flow/browser MCP tool via aidefence_has_pii
      const mcpResult = await this.callMcpTool('aidefence_has_pii', { input: content });

      if (typeof mcpResult === 'object' && mcpResult !== null) {
        const result = mcpResult as any;

        const hasPII = result.hasPII === true || result.detected === true;
        const detectedTypes: string[] = result.types || result.detectedTypes || [];
        const locations: Array<{ type: string; start: number; end: number }> =
          result.locations || [];

        return ok({ hasPII, detectedTypes, locations });
      }

      // Fallback if result format is unexpected
      return this.fallbackScanForPII(content);
    } catch (error) {
      if (this.config.verbose) {
        console.error('[BrowserSecurityScanner] scanForPII error:', error);
      }
      return this.fallbackScanForPII(content);
    }
  }

  // ==========================================================================
  // MCP Tool Invocation
  // ==========================================================================

  /**
   * Call an MCP tool (internal helper)
   * This is a placeholder that would be replaced with actual MCP tool invocation
   */
  private async callMcpTool(toolName: string, params: any): Promise<unknown> {
    // In a real implementation, this would call the MCP tool via the protocol
    // For now, we throw to trigger fallback
    throw new Error(`MCP tool ${toolName} not implemented in this context`);
  }

  // ==========================================================================
  // Fallback Implementations
  // ==========================================================================

  /**
   * Fallback URL validation using heuristics
   */
  private fallbackValidateUrl(url: string): Result<SecurityScanResult, Error> {
    const threats: string[] = [];
    let safe = true;
    let score = 1.0;

    try {
      const urlObj = new URL(url);

      // Check for suspicious patterns
      const suspiciousPatterns = [
        { pattern: /localhost|127\.0\.0\.1|0\.0\.0\.0/, threat: 'SSRF: Local network access' },
        { pattern: /192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\./, threat: 'SSRF: Private IP range' },
        { pattern: /@/, threat: 'Potential credential exposure in URL' },
        { pattern: /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/, threat: 'IP address instead of domain' },
      ];

      for (const { pattern, threat } of suspiciousPatterns) {
        if (pattern.test(url)) {
          threats.push(threat);
          safe = false;
          score -= 0.25;
        }
      }

      // Check protocol
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        threats.push(`Unsupported protocol: ${urlObj.protocol}`);
        safe = false;
        score -= 0.3;
      }

      score = Math.max(0, Math.min(1, score));

      return ok({ safe, threats, score });
    } catch (error) {
      return err(new Error(`Invalid URL: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Fallback phishing detection using heuristics
   */
  private fallbackDetectPhishing(url: string): Result<PhishingResult, Error> {
    const indicators: string[] = [];
    let isPhishing = false;
    let confidence = 0;

    try {
      const urlObj = new URL(url);

      // Check for common phishing indicators
      const phishingPatterns = [
        { pattern: /paypal|amazon|apple|microsoft|google/i, indicator: 'Impersonates known brand' },
        { pattern: /-/, indicator: 'Contains hyphens (common in phishing)' },
        { pattern: /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/, indicator: 'Uses IP address instead of domain' },
        { pattern: /@/, indicator: 'Contains @ symbol (URL obfuscation)' },
      ];

      for (const { pattern, indicator } of phishingPatterns) {
        if (pattern.test(url)) {
          indicators.push(indicator);
          confidence += 0.2;
        }
      }

      // Check for suspicious TLD
      const suspiciousTlds = ['.tk', '.ml', '.ga', '.cf', '.gq', '.xyz', '.top'];
      if (suspiciousTlds.some((tld) => urlObj.hostname.endsWith(tld))) {
        indicators.push('Uses suspicious TLD');
        confidence += 0.3;
      }

      // Check for long subdomains (common in phishing)
      const subdomains = urlObj.hostname.split('.');
      if (subdomains.length > 4) {
        indicators.push('Excessive subdomains');
        confidence += 0.15;
      }

      isPhishing = confidence > 0.5;
      confidence = Math.min(1, confidence);

      return ok({ isPhishing, confidence, indicators });
    } catch (error) {
      return err(new Error(`Invalid URL: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Fallback PII detection using regex patterns
   */
  private fallbackScanForPII(content: string): Result<PIIScanResult, Error> {
    const detectedTypes: string[] = [];
    const locations: Array<{ type: string; start: number; end: number }> = [];

    // PII detection patterns
    const patterns = [
      {
        type: 'email',
        regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      },
      {
        type: 'ssn',
        regex: /\b\d{3}-\d{2}-\d{4}\b/g,
      },
      {
        type: 'phone',
        regex: /\b(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
      },
      {
        type: 'credit-card',
        regex: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
      },
      {
        type: 'api-key',
        regex: /\b[A-Za-z0-9_-]{32,}\b/g,
      },
    ];

    for (const { type, regex } of patterns) {
      let match;
      while ((match = regex.exec(content)) !== null) {
        if (!detectedTypes.includes(type)) {
          detectedTypes.push(type);
        }
        locations.push({
          type,
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    }

    const hasPII = detectedTypes.length > 0;

    return ok({ hasPII, detectedTypes, locations });
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new BrowserSecurityScanner instance
 * @param config Optional configuration
 * @returns BrowserSecurityScanner instance
 */
export function createBrowserSecurityScanner(
  config?: BrowserSecurityScannerConfig
): BrowserSecurityScanner {
  return new BrowserSecurityScanner(config);
}
