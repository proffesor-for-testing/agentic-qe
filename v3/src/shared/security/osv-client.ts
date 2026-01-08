/**
 * Agentic QE v3 - OSV API Client
 * Client for querying Open Source Vulnerabilities (OSV) database
 *
 * OSV provides vulnerability information for npm, PyPI, Go, Maven, and more.
 * API Documentation: https://google.github.io/osv.dev/api/
 */

import { HttpClient } from '../http';

/**
 * OSV query request
 */
export interface OSVQueryRequest {
  /** Package name */
  package?: {
    name: string;
    ecosystem: OSVEcosystem;
    version?: string;
  };
  /** Git commit hash */
  commit?: string;
  /** Package lock file version (for version ranges) */
  version?: string;
}

/**
 * Supported ecosystems
 */
export type OSVEcosystem =
  | 'npm'
  | 'PyPI'
  | 'Go'
  | 'Maven'
  | 'crates.io'
  | 'NuGet'
  | 'Packagist'
  | 'RubyGems'
  | 'Hex'
  | 'Pub';

/**
 * OSV vulnerability record
 */
export interface OSVVulnerability {
  id: string;
  summary: string;
  details?: string;
  aliases?: string[]; // CVE IDs
  modified: string;
  published?: string;
  withdrawn?: string;
  severity?: OSVSeverity[];
  affected: OSVAffected[];
  references?: OSVReference[];
  database_specific?: Record<string, unknown>;
}

/**
 * OSV severity rating
 */
export interface OSVSeverity {
  type: 'CVSS_V2' | 'CVSS_V3';
  score: string;
}

/**
 * OSV affected package information
 */
export interface OSVAffected {
  package: {
    name: string;
    ecosystem: string;
    purl?: string;
  };
  ranges?: OSVRange[];
  versions?: string[];
  ecosystem_specific?: Record<string, unknown>;
  database_specific?: Record<string, unknown>;
}

/**
 * OSV version range
 */
export interface OSVRange {
  type: 'SEMVER' | 'ECOSYSTEM' | 'GIT';
  repo?: string;
  events: Array<{
    introduced?: string;
    fixed?: string;
    last_affected?: string;
    limit?: string;
  }>;
}

/**
 * OSV reference link
 */
export interface OSVReference {
  type:
    | 'ADVISORY'
    | 'ARTICLE'
    | 'DETECTION'
    | 'DISCUSSION'
    | 'REPORT'
    | 'FIX'
    | 'GIT'
    | 'PACKAGE'
    | 'EVIDENCE'
    | 'WEB';
  url: string;
}

/**
 * OSV query response
 */
export interface OSVQueryResponse {
  vulns: OSVVulnerability[];
}

/**
 * OSV batch query request
 */
export interface OSVBatchQueryRequest {
  queries: OSVQueryRequest[];
}

/**
 * OSV batch query response
 */
export interface OSVBatchQueryResponse {
  results: Array<{
    vulns?: OSVVulnerability[];
  }>;
}

/**
 * Parsed vulnerability for easier consumption
 */
export interface ParsedVulnerability {
  id: string;
  cveIds: string[];
  summary: string;
  details: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'unknown';
  cvssScore: number | null;
  affectedPackage: string;
  affectedVersions: string[];
  fixedVersions: string[];
  publishedDate: Date | null;
  references: string[];
}

/**
 * OSV API Client Configuration
 */
export interface OSVClientConfig {
  /** API base URL (default: https://api.osv.dev) */
  baseUrl?: string;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Enable response caching (default: true) */
  enableCache?: boolean;
  /** Cache TTL in ms (default: 1 hour) */
  cacheTtl?: number;
}

const DEFAULT_CONFIG: Required<OSVClientConfig> = {
  baseUrl: 'https://api.osv.dev',
  timeout: 30000,
  enableCache: true,
  cacheTtl: 60 * 60 * 1000, // 1 hour
};

/**
 * OSV API Client
 * Queries the Open Source Vulnerabilities database for dependency vulnerabilities
 */
export class OSVClient {
  private readonly config: Required<OSVClientConfig>;
  private readonly http: HttpClient;
  private readonly cache: Map<string, { data: OSVQueryResponse; timestamp: number }> =
    new Map();

  constructor(config: OSVClientConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.http = new HttpClient();
  }

  /**
   * Query OSV for vulnerabilities affecting a package
   */
  async queryPackage(
    packageName: string,
    ecosystem: OSVEcosystem,
    version?: string
  ): Promise<ParsedVulnerability[]> {
    const cacheKey = `${ecosystem}:${packageName}:${version || 'all'}`;

    // Check cache
    if (this.config.enableCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTtl) {
        return this.parseVulnerabilities(cached.data.vulns);
      }
    }

    try {
      const result = await this.http.post(
        `${this.config.baseUrl}/v1/query`,
        {
          package: {
            name: packageName,
            ecosystem,
            ...(version && { version }),
          },
        },
        { timeout: this.config.timeout }
      );

      if (!result.success) {
        console.error(`OSV query failed for ${ecosystem}:${packageName}:`, result.error);
        return [];
      }

      const response: OSVQueryResponse = await result.value.json();

      // Cache successful response
      if (this.config.enableCache && response.vulns) {
        this.cache.set(cacheKey, {
          data: response,
          timestamp: Date.now(),
        });
      }

      return this.parseVulnerabilities(response.vulns || []);
    } catch (error) {
      // Return empty on error (non-blocking)
      console.error(`OSV query failed for ${ecosystem}:${packageName}:`, error);
      return [];
    }
  }

  /**
   * Batch query multiple packages
   */
  async queryBatch(
    packages: Array<{ name: string; ecosystem: OSVEcosystem; version?: string }>
  ): Promise<Map<string, ParsedVulnerability[]>> {
    const results = new Map<string, ParsedVulnerability[]>();

    if (packages.length === 0) {
      return results;
    }

    try {
      const queries: OSVQueryRequest[] = packages.map((pkg) => ({
        package: {
          name: pkg.name,
          ecosystem: pkg.ecosystem,
          ...(pkg.version && { version: pkg.version }),
        },
      }));

      const result = await this.http.post(
        `${this.config.baseUrl}/v1/querybatch`,
        { queries },
        { timeout: this.config.timeout }
      );

      if (!result.success) {
        console.error('OSV batch query failed:', result.error);
        for (const pkg of packages) {
          results.set(`${pkg.ecosystem}:${pkg.name}`, []);
        }
        return results;
      }

      const response: OSVBatchQueryResponse = await result.value.json();

      // Map results back to packages
      for (let i = 0; i < packages.length; i++) {
        const pkg = packages[i];
        const key = `${pkg.ecosystem}:${pkg.name}`;
        const vulns = response.results[i]?.vulns || [];
        results.set(key, this.parseVulnerabilities(vulns));
      }
    } catch (error) {
      console.error('OSV batch query failed:', error);
      // Return empty results for all packages
      for (const pkg of packages) {
        results.set(`${pkg.ecosystem}:${pkg.name}`, []);
      }
    }

    return results;
  }

  /**
   * Query vulnerabilities by CVE ID
   */
  async queryByCVE(cveId: string): Promise<ParsedVulnerability[]> {
    try {
      const result = await this.http.get(
        `${this.config.baseUrl}/v1/vulns/${cveId}`,
        { timeout: this.config.timeout }
      );

      if (!result.success) {
        console.error(`OSV CVE query failed for ${cveId}:`, result.error);
        return [];
      }

      const vuln: OSVVulnerability = await result.value.json();
      return this.parseVulnerabilities([vuln]);
    } catch (error) {
      console.error(`OSV CVE query failed for ${cveId}:`, error);
      return [];
    }
  }

  /**
   * Parse npm package.json dependencies for vulnerabilities
   */
  async scanNpmDependencies(
    dependencies: Record<string, string>
  ): Promise<ParsedVulnerability[]> {
    const packages = Object.entries(dependencies).map(([name, version]) => ({
      name,
      ecosystem: 'npm' as OSVEcosystem,
      version: this.cleanVersion(version),
    }));

    const results = await this.queryBatch(packages);
    const allVulns: ParsedVulnerability[] = [];

    for (const vulns of results.values()) {
      allVulns.push(...vulns);
    }

    return allVulns;
  }

  /**
   * Scan a Python requirements.txt file content
   */
  async scanPythonRequirements(requirements: string): Promise<ParsedVulnerability[]> {
    const lines = requirements.split('\n').filter((line) => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('-');
    });

    const packages = lines
      .map((line) => {
        // Parse package==version or package>=version etc.
        const match = line.match(/^([a-zA-Z0-9_-]+)(?:[=<>!~]+([^\s;#]+))?/);
        if (!match) return null;
        return {
          name: match[1],
          ecosystem: 'PyPI' as OSVEcosystem,
          version: match[2],
        };
      })
      .filter((pkg): pkg is { name: string; ecosystem: OSVEcosystem; version: string } =>
        pkg !== null
      );

    const results = await this.queryBatch(packages);
    const allVulns: ParsedVulnerability[] = [];

    for (const vulns of results.values()) {
      allVulns.push(...vulns);
    }

    return allVulns;
  }

  /**
   * Parse vulnerabilities into a more usable format
   */
  private parseVulnerabilities(vulns: OSVVulnerability[]): ParsedVulnerability[] {
    return vulns.map((vuln) => {
      const cvssScore = this.extractCVSSScore(vuln.severity);
      const severity = this.scoreSeverity(cvssScore);
      const fixedVersions = this.extractFixedVersions(vuln.affected);

      return {
        id: vuln.id,
        cveIds: vuln.aliases?.filter((a) => a.startsWith('CVE-')) || [],
        summary: vuln.summary || 'No summary available',
        details: vuln.details || '',
        severity,
        cvssScore,
        affectedPackage: vuln.affected[0]?.package?.name || 'unknown',
        affectedVersions: vuln.affected[0]?.versions || [],
        fixedVersions,
        publishedDate: vuln.published ? new Date(vuln.published) : null,
        references: vuln.references?.map((r) => r.url) || [],
      };
    });
  }

  /**
   * Extract CVSS score from severity array
   */
  private extractCVSSScore(severity?: OSVSeverity[]): number | null {
    if (!severity || severity.length === 0) return null;

    // Prefer CVSS v3
    const v3 = severity.find((s) => s.type === 'CVSS_V3');
    if (v3) {
      const score = parseFloat(v3.score.split('/')[0]);
      return isNaN(score) ? null : score;
    }

    const v2 = severity.find((s) => s.type === 'CVSS_V2');
    if (v2) {
      const score = parseFloat(v2.score.split('/')[0]);
      return isNaN(score) ? null : score;
    }

    return null;
  }

  /**
   * Convert CVSS score to severity level
   */
  private scoreSeverity(cvss: number | null): ParsedVulnerability['severity'] {
    if (cvss === null) return 'unknown';
    if (cvss >= 9.0) return 'critical';
    if (cvss >= 7.0) return 'high';
    if (cvss >= 4.0) return 'medium';
    return 'low';
  }

  /**
   * Extract fixed versions from affected ranges
   */
  private extractFixedVersions(affected: OSVAffected[]): string[] {
    const fixed: string[] = [];

    for (const aff of affected) {
      for (const range of aff.ranges || []) {
        for (const event of range.events) {
          if (event.fixed) {
            fixed.push(event.fixed);
          }
        }
      }
    }

    return [...new Set(fixed)];
  }

  /**
   * Clean version string (remove ^ ~ etc.)
   */
  private cleanVersion(version: string): string {
    return version.replace(/^[\^~>=<]/, '').split(' ')[0];
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
