/**
 * Domain Whitelist for Network Policy Enforcement
 *
 * Manages allowed domains with support for wildcards and subdomains.
 * Provides O(1) lookup for exact matches and O(n) for wildcard patterns.
 *
 * @module infrastructure/network/DomainWhitelist
 * @see Issue #146 - Security Hardening: SP-3 Network Policy Enforcement
 */

/**
 * Domain whitelist with wildcard support
 *
 * Features:
 * - Exact domain matching
 * - Wildcard patterns (*.example.com)
 * - Subdomain matching
 * - Case-insensitive matching
 */
export class DomainWhitelist {
  /** Exact domain matches (normalized to lowercase) */
  private exactDomains: Set<string>;

  /** Wildcard patterns as regex */
  private wildcardPatterns: Array<{ pattern: string; regex: RegExp }>;

  /** Original domain list */
  private domains: string[];

  constructor(domains: string[] = []) {
    this.exactDomains = new Set();
    this.wildcardPatterns = [];
    this.domains = [];

    for (const domain of domains) {
      this.addDomain(domain);
    }
  }

  /**
   * Add a domain to the whitelist
   * @param domain Domain or pattern (e.g., "example.com" or "*.example.com")
   */
  addDomain(domain: string): void {
    const normalized = domain.toLowerCase().trim();

    if (this.domains.includes(normalized)) {
      return; // Already added
    }

    this.domains.push(normalized);

    if (normalized.startsWith('*.')) {
      // Wildcard pattern
      const suffix = normalized.slice(2);
      const regexPattern = `^([a-z0-9-]+\\.)*${this.escapeRegex(suffix)}$`;
      this.wildcardPatterns.push({
        pattern: normalized,
        regex: new RegExp(regexPattern, 'i'),
      });
    } else {
      // Exact domain
      this.exactDomains.add(normalized);
    }
  }

  /**
   * Remove a domain from the whitelist
   * @param domain Domain to remove
   */
  removeDomain(domain: string): void {
    const normalized = domain.toLowerCase().trim();

    const index = this.domains.indexOf(normalized);
    if (index === -1) return;

    this.domains.splice(index, 1);

    if (normalized.startsWith('*.')) {
      // Remove wildcard pattern
      this.wildcardPatterns = this.wildcardPatterns.filter((p) => p.pattern !== normalized);
    } else {
      // Remove exact domain
      this.exactDomains.delete(normalized);
    }
  }

  /**
   * Check if a domain is allowed
   * @param domain Domain to check
   * @returns true if allowed
   */
  isAllowed(domain: string): boolean {
    const normalized = domain.toLowerCase().trim();

    // Check exact match first (O(1))
    if (this.exactDomains.has(normalized)) {
      return true;
    }

    // Check wildcard patterns (O(n))
    for (const { regex } of this.wildcardPatterns) {
      if (regex.test(normalized)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a URL is allowed
   * @param url Full URL to check
   * @returns true if the domain is allowed
   */
  isUrlAllowed(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return this.isAllowed(parsedUrl.hostname);
    } catch {
      return false;
    }
  }

  /**
   * List all domains in the whitelist
   */
  listDomains(): string[] {
    return [...this.domains];
  }

  /**
   * Get the number of domains
   */
  size(): number {
    return this.domains.length;
  }

  /**
   * Clear all domains
   */
  clear(): void {
    this.exactDomains.clear();
    this.wildcardPatterns = [];
    this.domains = [];
  }

  /**
   * Check if the whitelist is empty
   */
  isEmpty(): boolean {
    return this.domains.length === 0;
  }

  /**
   * Merge another whitelist into this one
   */
  merge(other: DomainWhitelist): void {
    for (const domain of other.domains) {
      this.addDomain(domain);
    }
  }

  /**
   * Create a copy of this whitelist
   */
  clone(): DomainWhitelist {
    return new DomainWhitelist([...this.domains]);
  }

  /**
   * Get matching pattern for a domain (for debugging)
   */
  getMatchingPattern(domain: string): string | null {
    const normalized = domain.toLowerCase().trim();

    if (this.exactDomains.has(normalized)) {
      return normalized;
    }

    for (const { pattern, regex } of this.wildcardPatterns) {
      if (regex.test(normalized)) {
        return pattern;
      }
    }

    return null;
  }

  /**
   * Export to JSON
   */
  toJSON(): string[] {
    return [...this.domains];
  }

  /**
   * Create from JSON
   */
  static fromJSON(domains: string[]): DomainWhitelist {
    return new DomainWhitelist(domains);
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

/**
 * Common domain presets
 */
export const COMMON_DOMAIN_PRESETS = {
  /** Anthropic API */
  anthropic: ['api.anthropic.com'],

  /** GitHub */
  github: ['api.github.com', 'github.com', 'raw.githubusercontent.com'],

  /** npm registry */
  npm: ['registry.npmjs.org', 'www.npmjs.com'],

  /** Security databases */
  security: ['nvd.nist.gov', 'cve.mitre.org', 'osv.dev', 'security.snyk.io'],

  /** OpenAI */
  openai: ['api.openai.com'],

  /** Localhost */
  localhost: ['localhost', '127.0.0.1', '::1'],
};

/**
 * Create a whitelist from presets
 */
export function createWhitelistFromPresets(
  ...presetNames: (keyof typeof COMMON_DOMAIN_PRESETS)[]
): DomainWhitelist {
  const domains: string[] = [];

  for (const name of presetNames) {
    const preset = COMMON_DOMAIN_PRESETS[name];
    if (preset) {
      domains.push(...preset);
    }
  }

  return new DomainWhitelist(domains);
}
