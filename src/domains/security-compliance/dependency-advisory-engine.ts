/**
 * Dependency advisory (OSV) engine for the scan-security task (#1049).
 *
 * Runs the security-compliance DependencyScanner on the project's package.json
 * and turns its outcome into an execution receipt. A failed or partial OSV
 * lookup is a failed/partial engine with the unchecked packages listed, never
 * a completed engine with zero findings.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { SecurityEngineEvidence } from './scan-evidence.js';
import type { Vulnerability, UncheckedDependency, LocalDependency } from './interfaces.js';
import type { DependencyScanResult } from './services/scanners/scanner-types.js';
import type { Result } from '../../shared/types/index.js';

export const DEPENDENCY_ADVISORY_ENGINE_ID = 'osv-dependency-advisories';

/** The dependency scan as reported to MCP and CLI consumers. */
export interface DependencyScanReport {
  status: 'complete' | 'incomplete' | 'failed' | 'not-run';
  measured: boolean;
  manifest?: string;
  /** Lockfile the checked versions were resolved from, or null (exact specs only). */
  lockfile?: string | null;
  packagesRequested: number;
  packagesChecked: number;
  uncheckedPackages: UncheckedDependency[];
  /** Local workspace / linked packages: not OSV subjects, excluded from the counts. */
  localPackages: LocalDependency[];
  /** Why the scan is not complete beyond individual packages (malformed lockfile, workspace root #1057). */
  resolutionErrors: string[];
  /** Only direct dependencies are checked; transitive dependencies are not. */
  scope: 'direct';
  vulnerabilities: number;
  scanId?: string;
  error?: string;
  /** One plain sentence for humans; says when advisories could not be checked. */
  message: string;
}

export interface DependencyAdvisoryOutcome {
  engine: SecurityEngineEvidence;
  vulnerabilities: Vulnerability[];
  report: DependencyScanReport;
}

interface PackageJsonScanner {
  scanPackageJson(packageJsonPath: string): Promise<Result<DependencyScanResult>>;
}

/** The package.json for a scan target: the target directory's, else the project root's. */
export async function findPackageJson(targetPath: string, env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  let dir = targetPath;
  try {
    if (!(await fs.stat(targetPath)).isDirectory()) dir = path.dirname(targetPath);
  } catch {
    dir = path.dirname(targetPath);
  }
  const candidates = [dir, env.AQE_PROJECT_ROOT ? path.resolve(env.AQE_PROJECT_ROOT) : null];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const manifest = path.join(candidate, 'package.json');
    try {
      if ((await fs.stat(manifest)).isFile()) return manifest;
    } catch { /* try next */ }
  }
  return null;
}

/** Human message for a dependency scan outcome. */
export const DEPENDENCY_SCOPE_NOTE = 'direct dependencies of this package.json only; workspace members and transitive dependencies are not checked';

export function dependencyScanMessage(report: Omit<DependencyScanReport, 'message'>): string {
  return `${statusMessage(report)} Scope: ${DEPENDENCY_SCOPE_NOTE}.`;
}

function statusMessage(report: Omit<DependencyScanReport, 'message'>): string {
  switch (report.status) {
    case 'complete':
      return report.packagesRequested === 0
        ? `No registry dependencies to check${report.localPackages.length ? ` (${report.localPackages.length} local package(s) excluded)` : ' in package.json'}; nothing to check (complete).`
        : `Dependency advisories checked for all ${report.packagesChecked} package(s): ${report.vulnerabilities} advisory finding(s).`;
    case 'incomplete':
      return (report.uncheckedPackages.length > 0
        ? `Dependency advisories could not be checked for ${report.uncheckedPackages.length} of ${report.packagesRequested} package(s); ` : '') +
        (report.resolutionErrors.length > 0 ? `${report.resolutionErrors.slice(0, 3).join('; ')}; ` : '') +
        `${report.vulnerabilities} finding(s) from the ${report.packagesChecked} checked package(s). Dependency scan is INCOMPLETE, not clean.`;
    case 'failed':
      return `${report.error ?? `Dependency advisories could not be checked for ${report.uncheckedPackages.length} package(s)`}. ` +
        'Dependency vulnerabilities are UNMEASURED, not zero.';
    default:
      return report.error ?? 'Dependency advisory scan did not run.';
  }
}

function notRun(reason: string, manifest?: string): DependencyAdvisoryOutcome {
  const base: Omit<DependencyScanReport, 'message'> = { status: 'not-run', measured: false, ...(manifest ? { manifest } : {}),
    packagesRequested: 0, packagesChecked: 0, uncheckedPackages: [], localPackages: [],
    resolutionErrors: [], scope: 'direct',
    vulnerabilities: 0, error: reason };
  return {
    engine: { id: DEPENDENCY_ADVISORY_ENGINE_ID, requested: true, required: true, status: 'failed', scope: 'parent-directory',
      ...(manifest ? { target: manifest } : {}), analyzedFiles: 0, ruleCoverage: 'unknown', errors: [reason], limitations: [] },
    vulnerabilities: [],
    report: { ...base, message: dependencyScanMessage(base) },
  };
}

/** Run the OSV dependency scan for a target and describe it as an engine receipt. */
export async function runDependencyAdvisoryScan(
  scanner: PackageJsonScanner,
  targetPath: string,
): Promise<DependencyAdvisoryOutcome> {
  const manifest = await findPackageJson(targetPath);
  if (!manifest) return notRun('No package.json found for the dependency advisory scan.');

  let scan: Result<DependencyScanResult>;
  try {
    scan = await scanner.scanPackageJson(manifest);
  } catch (error) {
    return notRun(`Dependency advisory scan failed: ${error instanceof Error ? error.message : String(error)}`, manifest);
  }
  if (!scan.success) return notRun(`Dependency advisory scan did not run: ${scan.error.message}`, manifest);

  const value = scan.value;
  const unchecked = value.uncheckedPackages.map((p) => `${p.name}@${p.version}: ${p.reason}`);
  const base: Omit<DependencyScanReport, 'message'> = {
    status: value.status, measured: value.measured, manifest, lockfile: value.lockfile ?? null,
    packagesRequested: value.packagesScanned, packagesChecked: value.packagesChecked,
    uncheckedPackages: value.uncheckedPackages, localPackages: value.localPackages ?? [],
    resolutionErrors: value.resolutionErrors ?? [], scope: 'direct',
    vulnerabilities: value.vulnerabilities.length,
    scanId: value.scanId, ...(value.error ? { error: value.error } : {}),
  };
  return {
    engine: {
      id: DEPENDENCY_ADVISORY_ENGINE_ID, requested: true, required: true,
      status: value.status === 'complete' ? 'completed' : value.status === 'incomplete' ? 'partial' : 'failed',
      scope: 'parent-directory', target: manifest, ruleCoverage: 'unknown',
      errors: [...(value.error ? [value.error] : []), ...(value.resolutionErrors ?? []), ...unchecked.slice(0, 20),
        ...(unchecked.length > 20 ? [`... and ${unchecked.length - 20} more unchecked package(s)`] : [])],
      limitations: [
        value.lockfile
          ? `Direct dependencies are checked at the versions ${value.lockfile} resolves (when in sync with package.json); transitive dependencies are not checked.`
          : 'No lockfile: only exact versions in package.json are checked; ranges are reported unchecked. Transitive dependencies are not checked.',
        ...((value.localPackages ?? []).length > 0
          ? [`${value.localPackages!.length} local workspace/linked package(s) are not OSV subjects and were excluded.`] : []),
      ],
    },
    vulnerabilities: value.vulnerabilities,
    report: { ...base, message: dependencyScanMessage(base) },
  };
}
