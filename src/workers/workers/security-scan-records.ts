/**
 * Agentic QE v3 - security-scan worker: recorded scan parsing (#1043, #1049)
 *
 * Parses the `security:scan:<id>` records the security-compliance domain writes
 * (OSV dependency scans and SAST scans) into what the security-scan worker
 * reports. Nothing is filled in: a field a record does not carry stays absent.
 */

export const SCHEMA_VERSION = 1;
/** The dependency scanner keeps its records for 7 days; nothing older is current. */
export const MAX_SCAN_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'informational';
export const SEVERITIES: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'informational'];
export const CVE_ID = /^CVE-\d{4}-\d{4,}$/;

export interface ScanCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  informational: number;
}

/** A vulnerability as a recorded scan reported it; nothing is filled in. */
export interface ReportedVulnerability {
  severity: Severity;
  title: string;
  description: string;
  category: string;
  /** Dependency name (dependency scan) — only when the record names it. */
  package?: string;
  /** `file:line` (SAST) — only when the record locates it. */
  location?: string;
  /** CVE id exactly as the advisory carried it; absent when it carried none. */
  cve?: string;
  fixedIn?: string;
  references: string[];
}

export interface RecordedScan {
  scanId: string;
  scannedAt: string;
  summary: ScanCounts;
  /** Vulnerabilities the record lists (SAST keeps only critical/high). */
  vulnerabilities: ReportedVulnerability[];
  /** Total the scan found, including ones the record does not list. */
  total: number;
}

/** A package the OSV lookup could not check (#1049 record contract). */
export interface UncheckedPackage {
  name: string;
  version: string;
  reason: string;
}

/**
 * A dependency scan whose OSV lookup was not complete (#1049): `incomplete`,
 * `failed`, or a pre-#1049 record without `status` — which cannot be told
 * apart from a failed lookup recorded as clean. Never "0 vulnerabilities".
 */
export interface IncompleteDependencyScan {
  scan: RecordedScan;
  status: 'incomplete' | 'failed' | 'unknown';
  error?: string;
  uncheckedPackages: UncheckedPackage[];
  /** Packages the lookup did check, when the record states it. */
  packagesChecked?: number;
}

/** The `security:lastScan` record: only scans that actually ran (#1043). */
export interface MeasuredSecurityScan {
  measured: true;
  schemaVersion: typeof SCHEMA_VERSION;
  evaluatedAt: string;
  dependency: (RecordedScan & { source: 'osv' }) | null;
  code: (RecordedScan & { source: 'sast' }) | null;
}

export const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
export const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function parseCounts(raw: unknown): ScanCounts | null {
  if (!isRecord(raw)) return null;
  const counts = {} as ScanCounts;
  for (const s of SEVERITIES) {
    if (!isCount(raw[s])) return null;
    counts[s] = raw[s] as number;
  }
  return counts;
}

/** `scannedAt` when the record's timestamp is valid, not in the future and within the scanner's retention. */
export function parseScannedAt(raw: unknown, now: number): string | null {
  if (typeof raw !== 'string') return null;
  const t = Date.parse(raw);
  if (!Number.isFinite(t) || t > now + 60_000 || now - t > MAX_SCAN_AGE_MS) return null;
  return raw;
}

export function parseVulnerability(raw: unknown, kind: 'dependency' | 'sast'): ReportedVulnerability | null {
  if (!isRecord(raw)) return null;
  const severity = raw.severity as Severity;
  if (!SEVERITIES.includes(severity) || typeof raw.title !== 'string') return null;
  const location = isRecord(raw.location) ? raw.location : {};
  const remediation = isRecord(raw.remediation) ? raw.remediation : {};
  const vuln: ReportedVulnerability = {
    severity,
    title: raw.title,
    description: typeof raw.description === 'string' ? raw.description : '',
    category: typeof raw.category === 'string' ? raw.category : 'other',
    references: Array.isArray(raw.references) ? raw.references.filter((r): r is string => typeof r === 'string') : [],
  };
  if (typeof raw.cveId === 'string' && CVE_ID.test(raw.cveId)) vuln.cve = raw.cveId;
  if (kind === 'dependency') {
    const dep = isRecord(location.dependency) && typeof location.dependency.name === 'string'
      ? location.dependency.name
      : typeof location.snippet === 'string' ? /^"([^"]+)":/.exec(location.snippet)?.[1] : undefined;
    if (dep) vuln.package = dep;
    const fixed = typeof remediation.fixExample === 'string' ? /@([^@\s]+)$/.exec(remediation.fixExample)?.[1] : undefined;
    if (fixed) vuln.fixedIn = fixed;
  } else if (typeof location.file === 'string') {
    vuln.location = typeof location.line === 'number' ? `${location.file}:${location.line}` : location.file;
  }
  return vuln;
}

export function parseUnchecked(raw: unknown): UncheckedPackage[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map((p) => ({
    name: typeof p.name === 'string' ? p.name : '?',
    version: typeof p.version === 'string' ? p.version : '?',
    reason: typeof p.reason === 'string' ? p.reason : 'unknown',
  }));
}

/**
 * #1049: a dependency scan is a measurement only when its OSV lookup checked
 * every requested package (`measured: true` and `status: 'complete'`).
 */
export function dependencyCompleteness(raw: Record<string, unknown>):
  { complete: true } | {
    complete: false; status: IncompleteDependencyScan['status']; error?: string;
    uncheckedPackages: UncheckedPackage[]; packagesChecked?: number;
  } {
  if (raw.measured === true && raw.status === 'complete') return { complete: true };
  return {
    complete: false,
    status: raw.status === 'incomplete' || raw.status === 'failed' ? raw.status : 'unknown',
    ...(typeof raw.error === 'string' && raw.error ? { error: raw.error } : {}),
    uncheckedPackages: parseUnchecked(raw.uncheckedPackages),
    ...(isCount(raw.packagesChecked) ? { packagesChecked: raw.packagesChecked } : {}),
  };
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical', high: 'High Severity', medium: 'Medium Severity', low: 'Low Severity', informational: 'Informational',
};

/** Health penalty for the real critical/high advisories of a partial dependency scan (#1049). */
export function partialDependencyPenalty(incomplete: IncompleteDependencyScan | null): number {
  return incomplete ? incomplete.scan.summary.critical * 20 + incomplete.scan.summary.high * 10 : 0;
}

/** What a partial dependency scan did check; the dependency totals stay 'unmeasured' (#1049). */
export function partialDependencyMetrics(incomplete: IncompleteDependencyScan | null): Record<string, number> {
  return incomplete
    ? { dependencyVulnerabilitiesInCheckedPackages: incomplete.scan.total, dependencyPackagesUnchecked: incomplete.uncheckedPackages.length }
    : {};
}

export type ParsedScan =
  | { kind: 'sast'; scan: RecordedScan }
  | { kind: 'dependency'; scan: RecordedScan; completeness: ReturnType<typeof dependencyCompleteness> };

/** A recorded dependency (OSV) or SAST scan, or `null` when the record is not one. */
export function parseRecordedScan(raw: unknown, now: number): ParsedScan | null {
  if (!isRecord(raw)) return null;
  const kind = raw.scanType;
  if (kind !== 'dependency' && kind !== 'sast') return null;
  const scannedAt = parseScannedAt(raw.timestamp, now);
  const summary = parseCounts(raw.summary);
  if (typeof raw.scanId !== 'string' || !scannedAt || !summary) return null;
  const listed = kind === 'dependency' ? raw.vulnerabilities : raw.criticalVulnerabilities;
  if (!Array.isArray(listed)) return null;
  const vulnerabilities = listed.map((v) => parseVulnerability(v, kind));
  if (vulnerabilities.some((v) => v === null)) return null;
  const counted = SEVERITIES.reduce((sum, s) => sum + summary[s], 0);
  const total = kind === 'sast' && isCount(raw.vulnerabilityCount) ? raw.vulnerabilityCount : counted;
  const scan: RecordedScan = {
    scanId: raw.scanId, scannedAt, summary, vulnerabilities: vulnerabilities as ReportedVulnerability[], total,
  };
  return kind === 'sast' ? { kind, scan } : { kind, scan, completeness: dependencyCompleteness(raw) };
}
