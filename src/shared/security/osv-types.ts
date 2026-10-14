/**
 * Agentic QE v3 - OSV API record types
 * API Documentation: https://google.github.io/osv.dev/api/
 */

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
