/**
 * Agentic QE v3 - Security Scan Worker
 * ADR-014: Background Workers for QE Monitoring
 *
 * Reports the security state from scans the security-compliance domain
 * actually ran:
 * - Dependency vulnerabilities from the OSV dependency scan
 * - Code security issues from the SAST scan
 *
 * #1043: every finding comes from a recorded scan (`security:scan:<id>` in the
 * `security-compliance` namespace, written by DependencyScanner and
 * SASTScanner). The worker runs no scan itself — a background tick must not
 * send the project's dependency list to an external advisory API unasked — and
 * never emits a vulnerability or CVE id a scan did not report. Nothing
 * recorded → nothing stored, an "unmeasured" info finding.
 *
 * #1049: a dependency scan counts only when its OSV lookup was complete
 * (`measured: true`, `status: 'complete'`). The latest scan being incomplete,
 * failed or pre-#1049 (no `status`) leaves the dependency side unmeasured —
 * never "0 vulnerabilities" — with a finding naming the unchecked packages.
 */

import { BaseWorker } from '../base-worker';
import {
  WorkerConfig,
  WorkerContext,
  WorkerResult,
  WorkerFinding,
  WorkerRecommendation,
} from '../interfaces';

const CONFIG: WorkerConfig = {
  id: 'security-scan',
  name: 'Security Vulnerability Scanner',
  description: 'Scans for security vulnerabilities in dependencies, code patterns, and configurations',
  intervalMs: 30 * 60 * 1000, // 30 minutes
  priority: 'critical',
  targetDomains: ['security-compliance'],
  enabled: true,
  timeoutMs: 300000,
  retryCount: 3,
  retryDelayMs: 30000,
};

const SECURITY_NAMESPACE = 'security-compliance';
const SCAN_KEY_PATTERN = 'security:scan:*';
const LAST_SCAN_KEY = 'security:lastScan';
const SCHEMA_VERSION = 1;
/** The dependency scanner keeps its records for 7 days; nothing older is current. */
const MAX_SCAN_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SCAN_RECORDS = 1000;

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'informational';
const SEVERITIES: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'informational'];
const CVE_ID = /^CVE-\d{4}-\d{4,}$/;

interface ScanCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  informational: number;
}

/** A vulnerability as a recorded scan reported it; nothing is filled in. */
interface ReportedVulnerability {
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

interface RecordedScan {
  scanId: string;
  scannedAt: string;
  summary: ScanCounts;
  /** Vulnerabilities the record lists (SAST keeps only critical/high). */
  vulnerabilities: ReportedVulnerability[];
  /** Total the scan found, including ones the record does not list. */
  total: number;
}

/** A package the OSV lookup could not check (#1049 record contract). */
interface UncheckedPackage {
  name: string;
  version: string;
  reason: string;
}

/**
 * A dependency scan whose OSV lookup was not complete (#1049): `incomplete`,
 * `failed`, or a pre-#1049 record without `status` — which cannot be told
 * apart from a failed lookup recorded as clean. Never "0 vulnerabilities".
 */
interface IncompleteDependencyScan {
  scan: RecordedScan;
  status: 'incomplete' | 'failed' | 'unknown';
  error?: string;
  uncheckedPackages: UncheckedPackage[];
  /** Packages the lookup did check, when the record states it. */
  packagesChecked?: number;
}

/** The `security:lastScan` record: only scans that actually ran (#1043). */
interface MeasuredSecurityScan {
  measured: true;
  schemaVersion: typeof SCHEMA_VERSION;
  evaluatedAt: string;
  dependency: (RecordedScan & { source: 'osv' }) | null;
  code: (RecordedScan & { source: 'sast' }) | null;
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function parseCounts(raw: unknown): ScanCounts | null {
  if (!isRecord(raw)) return null;
  const counts = {} as ScanCounts;
  for (const s of SEVERITIES) {
    if (!isCount(raw[s])) return null;
    counts[s] = raw[s] as number;
  }
  return counts;
}

/** `scannedAt` when the record's timestamp is valid, not in the future and within the scanner's retention. */
function parseScannedAt(raw: unknown, now: number): string | null {
  if (typeof raw !== 'string') return null;
  const t = Date.parse(raw);
  if (!Number.isFinite(t) || t > now + 60_000 || now - t > MAX_SCAN_AGE_MS) return null;
  return raw;
}

function parseVulnerability(raw: unknown, kind: 'dependency' | 'sast'): ReportedVulnerability | null {
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

function parseUnchecked(raw: unknown): UncheckedPackage[] {
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
function dependencyCompleteness(raw: Record<string, unknown>):
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

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical', high: 'High Severity', medium: 'Medium Severity', low: 'Low Severity', informational: 'Informational',
};

/** Health penalty for the real critical/high advisories of a partial dependency scan (#1049). */
function partialDependencyPenalty(incomplete: IncompleteDependencyScan | null): number {
  return incomplete ? incomplete.scan.summary.critical * 20 + incomplete.scan.summary.high * 10 : 0;
}

/** What a partial dependency scan did check; the dependency totals stay 'unmeasured' (#1049). */
function partialDependencyMetrics(incomplete: IncompleteDependencyScan | null): Record<string, number> {
  return incomplete
    ? { dependencyVulnerabilitiesInCheckedPackages: incomplete.scan.total, dependencyPackagesUnchecked: incomplete.uncheckedPackages.length }
    : {};
}

type ParsedScan =
  | { kind: 'sast'; scan: RecordedScan }
  | { kind: 'dependency'; scan: RecordedScan; completeness: ReturnType<typeof dependencyCompleteness> };

/** A recorded dependency (OSV) or SAST scan, or `null` when the record is not one. */
function parseRecordedScan(raw: unknown, now: number): ParsedScan | null {
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

export class SecurityScanWorker extends BaseWorker {
  constructor() {
    super(CONFIG);
  }

  protected async doExecute(context: WorkerContext): Promise<WorkerResult> {
    const startTime = Date.now();
    context.logger.info('Starting security vulnerability scan');

    const findings: WorkerFinding[] = [];
    const recommendations: WorkerRecommendation[] = [];

    const { scan, incompleteDependency } = await this.readRecordedScans(context);

    if (incompleteDependency) {
      this.reportIncompleteDependencyScan(incompleteDependency, findings, recommendations);
    }

    if (!scan) {
      if (!incompleteDependency) findings.push({
        type: 'security-unmeasured',
        severity: 'info',
        domain: 'security-compliance',
        title: 'Security Scan Unmeasured',
        description: 'No dependency or SAST scan has been recorded in the last 7 days, so no vulnerabilities are ' +
          'reported and nothing was stored. Run security_scan_comprehensive (or `aqe security`) to scan the project.',
      });
      context.logger.info('Security scan complete', { measured: false });
      return this.createResult(
        Date.now() - startTime,
        {
          itemsAnalyzed: incompleteDependency?.scan.total ?? 0,
          issuesFound: findings.filter((f) => f.severity !== 'info').length,
          healthScore: Math.max(0, 100 - partialDependencyPenalty(incompleteDependency)),
          trend: 'stable',
          domainMetrics: {
            dependencyScan: 'unmeasured',
            codeScan: 'unmeasured',
            dependencyVulnerabilities: 'unmeasured',
            codeSecurityIssues: 'unmeasured',
            ...partialDependencyMetrics(incompleteDependency),
          },
        },
        findings,
        recommendations
      );
    }

    if (scan.dependency) this.analyzeDependencyVulnerabilities(scan.dependency, findings, recommendations);
    if (scan.code) this.analyzeCodeSecurityIssues(scan.code, findings, recommendations);

    await context.memory.set(LAST_SCAN_KEY, scan);
    await context.memory.set('security:lastScanTime', scan.evaluatedAt);

    const healthScore = Math.max(0, this.calculateHealthScore(scan) - partialDependencyPenalty(incompleteDependency));
    context.logger.info('Security scan complete', {
      measured: true,
      healthScore,
      dependencyScanId: scan.dependency?.scanId ?? null,
      codeScanId: scan.code?.scanId ?? null,
    });

    return this.createResult(
      Date.now() - startTime,
      {
        itemsAnalyzed: (scan.dependency?.total ?? 0) + (scan.code?.total ?? 0),
        issuesFound: findings.length,
        healthScore,
        trend: 'stable',
        domainMetrics: {
          dependencyScan: scan.dependency ? scan.dependency.scannedAt : 'unmeasured',
          codeScan: scan.code ? scan.code.scannedAt : 'unmeasured',
          dependencyVulnerabilities: scan.dependency ? scan.dependency.total : 'unmeasured',
          codeSecurityIssues: scan.code ? scan.code.total : 'unmeasured',
          ...partialDependencyMetrics(incompleteDependency),
        },
      },
      findings,
      recommendations
    );
  }

  /** The most recent recorded dependency and SAST scans, or `null` when neither exists (#1043). */
  private async readRecordedScans(context: WorkerContext): Promise<{
    scan: MeasuredSecurityScan | null;
    incompleteDependency: IncompleteDependencyScan | null;
  }> {
    const keys = await context.memory.search(SCAN_KEY_PATTERN, MAX_SCAN_RECORDS, { namespace: SECURITY_NAMESPACE });
    const now = Date.now();
    let latestDependency: Extract<ParsedScan, { kind: 'dependency' }> | null = null;
    let code: RecordedScan | null = null;
    const newer = (a: RecordedScan, b: RecordedScan | null) => !b || Date.parse(a.scannedAt) > Date.parse(b.scannedAt);

    for (const key of keys) {
      const parsed = parseRecordedScan(await context.memory.get<unknown>(key, { namespace: SECURITY_NAMESPACE }), now);
      if (!parsed) continue;
      if (parsed.kind === 'dependency' && newer(parsed.scan, latestDependency?.scan ?? null)) latestDependency = parsed;
      if (parsed.kind === 'sast' && newer(parsed.scan, code)) code = parsed.scan;
    }

    // #1049: only the latest dependency scan counts, and only when its lookup
    // was complete — an older complete scan must not mask a newer failure.
    const completeness = latestDependency?.completeness;
    const dependency = latestDependency && completeness?.complete ? latestDependency.scan : null;
    const incompleteDependency: IncompleteDependencyScan | null = latestDependency && completeness && !completeness.complete
      ? {
        scan: latestDependency.scan,
        status: completeness.status,
        ...(completeness.error ? { error: completeness.error } : {}),
        uncheckedPackages: completeness.uncheckedPackages,
        ...(completeness.packagesChecked !== undefined ? { packagesChecked: completeness.packagesChecked } : {}),
      }
      : null;

    if (!dependency && !code) return { scan: null, incompleteDependency };
    return { incompleteDependency, scan: {
      measured: true,
      schemaVersion: SCHEMA_VERSION,
      evaluatedAt: new Date().toISOString(),
      dependency: dependency ? { ...dependency, source: 'osv' } : null,
      code: code ? { ...code, source: 'sast' } : null,
    } };
  }

  /**
   * #1049: a dependency scan whose lookup was not complete is unmeasured —
   * never "0 vulnerabilities". Advisories OSV did return for checked packages
   * are real and still reported, marked as coming from a partial scan.
   */
  private reportIncompleteDependencyScan(
    incomplete: IncompleteDependencyScan,
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): void {
    const { scan, status, error, uncheckedPackages, packagesChecked } = incomplete;
    const unchecked = uncheckedPackages.map((p) => `${p.name}@${p.version} (${p.reason})`);
    const counts = scan.summary;
    const inChecked = scan.total > 0
      ? ` OSV reported ${scan.total} advisory finding(s) in the ${packagesChecked ?? ''}${packagesChecked === undefined ? '' : ' '}checked package(s)` +
        ` (${counts.critical} critical, ${counts.high} high, ${counts.medium} medium, ${counts.low} low); they are listed as separate findings.`
      : '';
    const why = status === 'unknown'
      ? 'was recorded before scans stated whether every package was checked, so a failed lookup cannot be told apart from a clean one'
      : `is ${status}${error ? ` (${error})` : ''}`;
    findings.push({
      type: 'dependency-scan-incomplete',
      severity: 'info',
      domain: 'security-compliance',
      title: 'Dependency Scan Unmeasured',
      description: `The latest dependency scan (${scan.scannedAt}) ${why}; its result is not a vulnerability count.` +
        (unchecked.length > 0 ? ` Unchecked packages: ${unchecked.join(', ')}.` : '') + inChecked +
        ' Re-run the dependency scan.',
      context: {
        scanId: scan.scanId, status, ...(error ? { error } : {}), uncheckedPackages,
        ...(packagesChecked !== undefined ? { packagesChecked } : {}),
        advisoriesInCheckedPackages: scan.total,
      },
    });
    this.analyzeDependencyVulnerabilities(scan, findings, recommendations, true);
  }

  private analyzeDependencyVulnerabilities(
    scan: RecordedScan,
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[],
    partialScan = false
  ): void {
    const critical = scan.vulnerabilities.filter(v => v.severity === 'critical');
    const high = scan.vulnerabilities.filter(v => v.severity === 'high');
    // #1049: a complete scan carries medium/low in its counts; a partial scan has
    // no measured count, so every advisory OSV returned for a checked package is relayed.
    const relayed = partialScan
      ? SEVERITIES.flatMap((s) => scan.vulnerabilities.filter(v => v.severity === s))
      : [...critical, ...high];

    for (const vuln of relayed) {
      const pkg = vuln.package ?? vuln.title;
      findings.push({
        type: `${vuln.severity}-vulnerability`,
        severity: vuln.severity === 'informational' ? 'info' : vuln.severity,
        domain: 'security-compliance',
        title: `${SEVERITY_LABEL[vuln.severity]} Vulnerability in ${pkg}`,
        description: vuln.description ? `${vuln.title}: ${vuln.description}` : vuln.title,
        resource: pkg,
        context: {
          advisorySource: 'osv',
          scanId: scan.scanId,
          scannedAt: scan.scannedAt,
          ...(vuln.cve ? { cve: vuln.cve } : {}),
          ...(vuln.fixedIn ? { fixedIn: vuln.fixedIn } : {}),
          references: vuln.references,
          ...(partialScan ? { partialScan: true } : {}),
        },
      });
    }

    if (critical.length > 0) {
      recommendations.push({
        priority: 'p0',
        domain: 'security-compliance',
        action: 'Update Critical Vulnerabilities Immediately',
        description: `The dependency scan of ${scan.scannedAt} reported ${critical.length} critical vulnerabilities. Update to patched versions.`,
        estimatedImpact: 'high',
        effort: 'low',
        autoFixable: true,
      });
    }

    if (high.length > 0) {
      recommendations.push({
        priority: 'p1',
        domain: 'security-compliance',
        action: 'Address High Severity Vulnerabilities',
        description: `The dependency scan of ${scan.scannedAt} reported ${high.length} high severity vulnerabilities. Plan updates within current sprint.`,
        estimatedImpact: 'high',
        effort: 'low',
        autoFixable: true,
      });
    }
  }

  private analyzeCodeSecurityIssues(
    scan: RecordedScan,
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): void {
    for (const issue of scan.vulnerabilities) {
      findings.push({
        type: `code-security-${issue.category}`,
        severity: issue.severity === 'informational' ? 'info' : issue.severity,
        domain: 'security-compliance',
        title: `Security Issue: ${issue.title}`,
        description: issue.description || issue.title,
        ...(issue.location ? { resource: issue.location } : {}),
        context: {
          category: issue.category,
          scanId: scan.scanId,
          scannedAt: scan.scannedAt,
          ...(issue.cve ? { cve: issue.cve } : {}),
        },
      });
    }

    const injectionIssues = scan.vulnerabilities.filter(v => v.category === 'injection');
    if (injectionIssues.length > 0) {
      recommendations.push({
        priority: 'p0',
        domain: 'security-compliance',
        action: 'Fix Injection Vulnerabilities',
        description: `The SAST scan of ${scan.scannedAt} reported ${injectionIssues.length} potential injection vulnerabilities. Use parameterized queries and avoid eval().`,
        estimatedImpact: 'high',
        effort: 'medium',
        autoFixable: false,
      });
    }

    const cryptoIssues = scan.vulnerabilities.filter(v => v.category === 'sensitive-data');
    if (cryptoIssues.length > 0) {
      recommendations.push({
        priority: 'p1',
        domain: 'security-compliance',
        action: 'Review Sensitive Data Handling',
        description: `The SAST scan of ${scan.scannedAt} reported ${cryptoIssues.length} sensitive-data issues. Ensure secure algorithms and key management.`,
        estimatedImpact: 'high',
        effort: 'high',
        autoFixable: false,
      });
    }
  }

  /** Score from the recorded scans' own severity counts. */
  private calculateHealthScore(scan: MeasuredSecurityScan): number {
    let score = 100;
    if (scan.dependency) {
      score -= scan.dependency.summary.critical * 20;
      score -= scan.dependency.summary.high * 10;
    }
    if (scan.code) {
      score -= scan.code.summary.critical * 15;
      score -= scan.code.summary.high * 8;
    }
    return Math.max(0, Math.round(score));
  }
}
