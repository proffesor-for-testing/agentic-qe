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

/** A recorded dependency (OSV) or SAST scan, or `null` when the record is not one. */
function parseRecordedScan(raw: unknown, now: number): { kind: 'dependency' | 'sast'; scan: RecordedScan } | null {
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
  return {
    kind,
    scan: { scanId: raw.scanId, scannedAt, summary, vulnerabilities: vulnerabilities as ReportedVulnerability[], total },
  };
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

    const scan = await this.readRecordedScans(context);

    if (!scan) {
      findings.push({
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
          itemsAnalyzed: 0,
          issuesFound: 0,
          healthScore: 100,
          trend: 'stable',
          domainMetrics: {
            dependencyScan: 'unmeasured',
            codeScan: 'unmeasured',
            dependencyVulnerabilities: 'unmeasured',
            codeSecurityIssues: 'unmeasured',
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

    const healthScore = this.calculateHealthScore(scan);
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
        },
      },
      findings,
      recommendations
    );
  }

  /** The most recent recorded dependency and SAST scans, or `null` when neither exists (#1043). */
  private async readRecordedScans(context: WorkerContext): Promise<MeasuredSecurityScan | null> {
    const keys = await context.memory.search(SCAN_KEY_PATTERN, MAX_SCAN_RECORDS, { namespace: SECURITY_NAMESPACE });
    const now = Date.now();
    let dependency: RecordedScan | null = null;
    let code: RecordedScan | null = null;
    const newer = (a: RecordedScan, b: RecordedScan | null) => !b || Date.parse(a.scannedAt) > Date.parse(b.scannedAt);

    for (const key of keys) {
      const parsed = parseRecordedScan(await context.memory.get<unknown>(key, { namespace: SECURITY_NAMESPACE }), now);
      if (!parsed) continue;
      if (parsed.kind === 'dependency' && newer(parsed.scan, dependency)) dependency = parsed.scan;
      if (parsed.kind === 'sast' && newer(parsed.scan, code)) code = parsed.scan;
    }

    if (!dependency && !code) return null;
    return {
      measured: true,
      schemaVersion: SCHEMA_VERSION,
      evaluatedAt: new Date().toISOString(),
      dependency: dependency ? { ...dependency, source: 'osv' } : null,
      code: code ? { ...code, source: 'sast' } : null,
    };
  }

  private analyzeDependencyVulnerabilities(
    scan: RecordedScan,
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): void {
    const critical = scan.vulnerabilities.filter(v => v.severity === 'critical');
    const high = scan.vulnerabilities.filter(v => v.severity === 'high');

    for (const vuln of [...critical, ...high]) {
      const pkg = vuln.package ?? vuln.title;
      findings.push({
        type: `${vuln.severity}-vulnerability`,
        severity: vuln.severity as 'critical' | 'high',
        domain: 'security-compliance',
        title: `${vuln.severity === 'critical' ? 'Critical' : 'High Severity'} Vulnerability in ${pkg}`,
        description: vuln.description ? `${vuln.title}: ${vuln.description}` : vuln.title,
        resource: pkg,
        context: {
          advisorySource: 'osv',
          scanId: scan.scanId,
          scannedAt: scan.scannedAt,
          ...(vuln.cve ? { cve: vuln.cve } : {}),
          ...(vuln.fixedIn ? { fixedIn: vuln.fixedIn } : {}),
          references: vuln.references,
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
