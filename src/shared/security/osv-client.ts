/**
 * Agentic QE v3 - OSV API Client
 * Client for querying Open Source Vulnerabilities (OSV) database
 *
 * OSV provides vulnerability information for npm, PyPI, Go, Maven, and more.
 * API Documentation: https://google.github.io/osv.dev/api/
 */

import { HttpClient } from '../http';
import {
  OSVLookupError,
  advisoryAffectsVersion,
  isAdvisoryRecord,
  isConcreteVersion,
  lookupKey,
  lookupStatus,
  parseBatchBody,
  type BatchEntry,
  type OSVBatchLookup,
  type OSVPackageQuery,
  type OSVUncheckedPackage,
} from './osv-lookup';

export { OSVLookupError } from './osv-lookup';
export type { OSVBatchLookup, OSVPackageQuery, OSVUncheckedPackage } from './osv-lookup';
import type {
  OSVAffected,
  OSVEcosystem,
  OSVQueryRequest,
  OSVSeverity,
  OSVVulnerability,
  ParsedVulnerability,
} from './osv-types';
export type {
  OSVQueryRequest,
  OSVEcosystem,
  OSVVulnerability,
  OSVSeverity,
  OSVAffected,
  OSVRange,
  OSVReference,
  OSVQueryResponse,
  OSVBatchQueryRequest,
  OSVBatchQueryResponse,
  ParsedVulnerability,
} from './osv-types';

/**
 * OSV API Client Configuration
 */
export interface OSVClientConfig {
  /** API base URL (default: $AQE_OSV_API_URL, else https://api.osv.dev) */
  baseUrl?: string;
  /** Idle request timeout in ms (default: 30000) */
  timeout?: number;
  /** Retries per request after the first attempt (default: 2) */
  retries?: number;
  /** Packages per querybatch request (default: 500; OSV accepts up to 1000) */
  batchSize?: number;
  /** Concurrent advisory-detail requests (default: 8) */
  detailConcurrency?: number;
  /** Enable advisory-detail caching (default: true) */
  enableCache?: boolean;
  /** Cache TTL in ms (default: 1 hour) */
  cacheTtl?: number;
}

const DEFAULT_BASE_URL = 'https://api.osv.dev';

/** The OSV endpoint: `AQE_OSV_API_URL` (http/https only) or the public API. */
export function resolveOSVBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.AQE_OSV_API_URL?.trim();
  if (!configured) return DEFAULT_BASE_URL;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error('AQE_OSV_API_URL must be an http(s) URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('AQE_OSV_API_URL must be an http(s) URL');
  }
  return configured.replace(/\/+$/, '');
}

type DetailOutcome = { vuln: OSVVulnerability } | { reason: string };

/**
 * OSV API Client
 * Queries the Open Source Vulnerabilities database for dependency vulnerabilities.
 *
 * #1049: a failed or partial lookup is never reported as "no vulnerabilities".
 * `lookupBatch` returns the packages it could not check; the list-returning
 * methods throw `OSVLookupError` instead of returning `[]`.
 */
export class OSVClient {
  private readonly config: Required<OSVClientConfig>;
  private readonly http: HttpClient;
  private readonly detailCache: Map<string, { data: OSVVulnerability; timestamp: number }> = new Map();

  constructor(config: OSVClientConfig = {}) {
    this.config = {
      baseUrl: config.baseUrl ?? resolveOSVBaseUrl(),
      timeout: config.timeout ?? 30000,
      retries: config.retries ?? 2,
      batchSize: Math.max(1, Math.min(1000, config.batchSize ?? 500)),
      detailConcurrency: Math.max(1, config.detailConcurrency ?? 8),
      enableCache: config.enableCache ?? true,
      cacheTtl: config.cacheTtl ?? 60 * 60 * 1000,
    };
    this.http = new HttpClient();
  }

  /** The endpoint this client queries. */
  get baseUrl(): string {
    return this.config.baseUrl;
  }

  /**
   * Look up advisories for packages, reporting every package that could not be
   * checked. Only `status: 'complete'` may be read as a clean/measured result.
   */
  async lookupBatch(packages: OSVPackageQuery[]): Promise<OSVBatchLookup> {
    const results = new Map<string, ParsedVulnerability[]>();
    const unchecked: OSVUncheckedPackage[] = [];
    const errors: string[] = [];
    const queryable: OSVPackageQuery[] = [];

    for (const pkg of packages) {
      if (pkg.version && isConcreteVersion(pkg.version)) {
        queryable.push(pkg);
      } else {
        unchecked.push({ ...pkg, reason: pkg.version
          ? `version "${pkg.version}" is not a concrete version; advisories cannot be matched`
          : 'no version declared; advisories cannot be matched' });
      }
    }

    const pending: Array<{ pkg: OSVPackageQuery; ids: string[] }> = [];
    for (let start = 0; start < queryable.length; start += this.config.batchSize) {
      const chunk = queryable.slice(start, start + this.config.batchSize);
      const outcome = await this.postBatch(chunk);
      if ('reason' in outcome) {
        errors.push(`querybatch for ${chunk.length} package(s) failed: ${outcome.reason}`);
        for (const pkg of chunk) unchecked.push({ ...pkg, reason: outcome.reason });
        continue;
      }
      outcome.entries.forEach((entry, i) => {
        if ('reason' in entry) unchecked.push({ ...chunk[i], reason: entry.reason });
        else pending.push({ pkg: chunk[i], ids: entry.ids });
      });
    }

    const details = await this.fetchDetails([...new Set(pending.flatMap((p) => p.ids))]);
    for (const { pkg, ids } of pending) {
      const missing = ids.filter((id) => 'reason' in details.get(id)!);
      if (missing.length > 0) {
        const why = (details.get(missing[0]) as { reason: string }).reason;
        unchecked.push({ ...pkg, reason: `advisory details unavailable for ${missing.join(', ')}: ${why}` });
        continue;
      }
      // querybatch can over-match; keep only advisories whose own ranges do not exclude the version.
      const vulns = ids.map((id) => (details.get(id) as { vuln: OSVVulnerability }).vuln)
        .filter((vuln) => advisoryAffectsVersion(vuln, { name: pkg.name, ecosystem: pkg.ecosystem, version: pkg.version! }));
      results.set(lookupKey(pkg), this.parseVulnerabilities(vulns).map((v) => ({ ...v, affectedPackage: pkg.name })));
    }
    const detailFailures = [...details.values()].filter((d): d is { reason: string } => 'reason' in d);
    if (detailFailures.length > 0) {
      errors.push(`${detailFailures.length} advisory detail request(s) failed: ${detailFailures[0].reason}`);
    }

    return {
      status: lookupStatus(packages.length, results.size),
      results,
      packagesRequested: packages.length,
      packagesChecked: results.size,
      unchecked,
      errors,
    };
  }

  /** Look up npm `package.json`-style dependencies (`name -> version spec`). */
  async lookupNpmDependencies(dependencies: Record<string, string>): Promise<OSVBatchLookup> {
    return this.lookupBatch(Object.entries(dependencies).map(([name, version]) => ({
      name, ecosystem: 'npm', version: this.cleanVersion(version),
    })));
  }

  /**
   * Query OSV for vulnerabilities affecting a package.
   * @throws OSVLookupError when the advisory lookup did not complete.
   */
  async queryPackage(packageName: string, ecosystem: OSVEcosystem, version?: string): Promise<ParsedVulnerability[]> {
    const result = await this.http.post(
      `${this.config.baseUrl}/v1/query`,
      { package: { name: packageName, ecosystem, ...(version && { version }) } },
      this.requestOptions(),
    );
    const body = await this.readJson(result);
    if ('reason' in body) throw new OSVLookupError(`OSV query for ${ecosystem}:${packageName} failed: ${body.reason}`);
    const vulns = (body.value as { vulns?: unknown } | null)?.vulns;
    if (vulns === undefined && body.value && typeof body.value === 'object') return [];
    if (!Array.isArray(vulns) || !vulns.every(isAdvisoryRecord)) {
      throw new OSVLookupError(`OSV query for ${ecosystem}:${packageName} failed: malformed response`);
    }
    return this.parseVulnerabilities(vulns as unknown as OSVVulnerability[]);
  }

  /**
   * Batch query multiple packages.
   * @throws OSVLookupError when any package could not be checked.
   */
  async queryBatch(
    packages: Array<{ name: string; ecosystem: OSVEcosystem; version?: string }>
  ): Promise<Map<string, ParsedVulnerability[]>> {
    const lookup = await this.lookupBatch(packages);
    if (lookup.status !== 'complete') throw OSVLookupError.fromLookup(lookup);
    return lookup.results;
  }

  /**
   * Query vulnerabilities by advisory/CVE id. An id OSV does not know (404) is [].
   * @throws OSVLookupError on any other failure.
   */
  async queryByCVE(cveId: string): Promise<ParsedVulnerability[]> {
    const outcome = await this.fetchDetail(cveId);
    if ('vuln' in outcome) return this.parseVulnerabilities([outcome.vuln]);
    if (outcome.reason === 'HTTP 404') return [];
    throw new OSVLookupError(`OSV lookup for ${cveId} failed: ${outcome.reason}`);
  }

  /**
   * Scan npm dependencies for vulnerabilities.
   * @throws OSVLookupError when any dependency could not be checked; use
   *   `lookupNpmDependencies` to get partial results with the unchecked list.
   */
  async scanNpmDependencies(dependencies: Record<string, string>): Promise<ParsedVulnerability[]> {
    const lookup = await this.lookupNpmDependencies(dependencies);
    if (lookup.status !== 'complete') throw OSVLookupError.fromLookup(lookup);
    return [...lookup.results.values()].flat();
  }

  /**
   * Scan a Python requirements.txt file content. Only `==` pins are concrete
   * versions; other requirements are reported as unchecked.
   * @throws OSVLookupError when any requirement could not be checked.
   */
  async scanPythonRequirements(requirements: string): Promise<ParsedVulnerability[]> {
    const packages = requirements.split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && !line.startsWith('-'))
      .map((line) => line.match(/^([a-zA-Z0-9_.-]+)(?:\s*==\s*([^\s;#,]+))?/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => ({ name: m[1], ecosystem: 'PyPI' as OSVEcosystem, version: m[2] }));
    const lookup = await this.lookupBatch(packages);
    if (lookup.status !== 'complete') throw OSVLookupError.fromLookup(lookup);
    return [...lookup.results.values()].flat();
  }

  /** Clear the advisory-detail cache. */
  clearCache(): void {
    this.detailCache.clear();
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  private requestOptions(): { timeout: number; retries: number } {
    return { timeout: this.config.timeout, retries: this.config.retries };
  }

  /** Read a JSON body; any transport failure, non-2xx status or parse failure is a reason. */
  private async readJson(
    result: Awaited<ReturnType<HttpClient['get']>>
  ): Promise<{ value: unknown } | { reason: string }> {
    if (!result.success) return { reason: `${result.error.code}: ${result.error.message}` };
    const response = result.value;
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return { reason: `HTTP ${response.status}${response.status === 429 ? ' (rate limited)' : ''}` };
    }
    let text: string;
    try {
      text = await response.text();
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      return { reason: `${timedOut ? 'TIMEOUT' : 'BODY_READ_FAILED'}: response body could not be read` };
    }
    try {
      return { value: JSON.parse(text) as unknown };
    } catch {
      return { reason: 'malformed JSON response' };
    }
  }

  private async postBatch(chunk: OSVPackageQuery[]): Promise<{ entries: BatchEntry[] } | { reason: string }> {
    const queries: OSVQueryRequest[] = chunk.map((pkg) => ({
      package: { name: pkg.name, ecosystem: pkg.ecosystem as OSVEcosystem, version: pkg.version },
    }));
    const result = await this.http.post(`${this.config.baseUrl}/v1/querybatch`, { queries }, this.requestOptions());
    const body = await this.readJson(result);
    if ('reason' in body) return body;
    const entries = parseBatchBody(body.value, chunk.length);
    return entries ? { entries } : { reason: 'malformed OSV querybatch response (results do not match the queries)' };
  }

  /** Fetch full advisory records (querybatch returns only ids) with bounded concurrency. */
  private async fetchDetails(ids: string[]): Promise<Map<string, DetailOutcome>> {
    const out = new Map<string, DetailOutcome>();
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < ids.length) {
        const id = ids[next++];
        out.set(id, await this.fetchDetail(id));
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.config.detailConcurrency, ids.length) }, worker));
    return out;
  }

  private async fetchDetail(id: string): Promise<DetailOutcome> {
    const cached = this.config.enableCache ? this.detailCache.get(id) : undefined;
    if (cached && Date.now() - cached.timestamp < this.config.cacheTtl) return { vuln: cached.data };
    const result = await this.http.get(`${this.config.baseUrl}/v1/vulns/${encodeURIComponent(id)}`, this.requestOptions());
    const body = await this.readJson(result);
    if ('reason' in body) return body;
    if (!isAdvisoryRecord(body.value)) return { reason: 'malformed OSV advisory record' };
    const vuln = body.value as unknown as OSVVulnerability;
    if (this.config.enableCache) this.detailCache.set(id, { data: vuln, timestamp: Date.now() });
    return { vuln };
  }

  /**
   * Parse vulnerabilities into a more usable format
   */
  private parseVulnerabilities(vulns: OSVVulnerability[]): ParsedVulnerability[] {
    return vulns.map((vuln) => {
      const cvssScore = this.extractCVSSScore(vuln.severity);
      return {
        id: vuln.id,
        cveIds: vuln.aliases?.filter((a) => a.startsWith('CVE-')) || [],
        summary: vuln.summary || 'No summary available',
        details: vuln.details || '',
        severity: this.scoreSeverity(cvssScore, vuln.database_specific),
        cvssScore,
        affectedPackage: vuln.affected?.[0]?.package?.name || 'unknown',
        affectedVersions: vuln.affected?.[0]?.versions || [],
        fixedVersions: this.extractFixedVersions(vuln.affected ?? []),
        publishedDate: vuln.published ? new Date(vuln.published) : null,
        references: vuln.references?.map((r) => r.url) || [],
      };
    });
  }

  /**
   * Extract a numeric CVSS score. OSV usually carries a CVSS vector string
   * ("CVSS:3.1/AV:N/..."), which holds no base score: that yields null.
   */
  private extractCVSSScore(severity?: OSVSeverity[]): number | null {
    if (!severity || severity.length === 0) return null;
    const entry = severity.find((s) => s.type === 'CVSS_V3') ?? severity.find((s) => s.type === 'CVSS_V2');
    if (!entry || typeof entry.score !== 'string' || entry.score.startsWith('CVSS:')) return null;
    const score = parseFloat(entry.score.split('/')[0]);
    return isNaN(score) ? null : score;
  }

  /**
   * Severity from a numeric CVSS score, else the advisory's own severity label
   * (GitHub advisories carry `database_specific.severity`), else unknown.
   */
  private scoreSeverity(cvss: number | null, databaseSpecific?: Record<string, unknown>): ParsedVulnerability['severity'] {
    if (cvss !== null) {
      if (cvss >= 9.0) return 'critical';
      if (cvss >= 7.0) return 'high';
      if (cvss >= 4.0) return 'medium';
      return 'low';
    }
    const label = typeof databaseSpecific?.severity === 'string' ? databaseSpecific.severity.toLowerCase() : '';
    if (label === 'critical' || label === 'high' || label === 'low') return label;
    if (label === 'medium' || label === 'moderate') return 'medium';
    return 'unknown';
  }

  /**
   * Extract fixed versions from affected ranges
   */
  private extractFixedVersions(affected: OSVAffected[]): string[] {
    const fixed: string[] = [];
    for (const aff of affected) {
      for (const range of aff.ranges || []) {
        for (const event of range.events || []) {
          if (event.fixed) fixed.push(event.fixed);
        }
      }
    }
    return [...new Set(fixed)];
  }

  /**
   * Clean a version spec ("^4.17.15" -> "4.17.15", ">=1.2.3 <2" -> "1.2.3").
   */
  private cleanVersion(version: string): string {
    return version.trim().replace(/^[\^~>=<v\s]+/, '').split(/\s+/)[0];
  }
}
