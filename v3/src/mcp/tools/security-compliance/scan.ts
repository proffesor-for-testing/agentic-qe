/**
 * Agentic QE v3 - Security Compliance MCP Tool
 *
 * qe/security/scan - Security scanning (SAST/DAST) and compliance validation
 *
 * Fix #287: Replaced hardcoded fake findings with real file scanning.
 * Now actually reads target files and applies security patterns from
 * v3/src/domains/security-compliance/services/scanners/security-patterns.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { MCPToolBase, MCPToolConfig, MCPToolContext, MCPToolSchema } from '../base';
import { ToolResult } from '../../types';
import { toErrorMessage } from '../../../shared/error-utils.js';
import {
  ALL_SECURITY_PATTERNS,
  SECRET_PATTERNS,
  MISCONFIGURATION_PATTERNS,
} from '../../../domains/security-compliance/services/scanners/security-patterns.js';
import type { SecurityPattern } from '../../../domains/security-compliance/services/scanners/scanner-types.js';

// ============================================================================
// Types
// ============================================================================

export interface SecurityScanParams {
  target?: string;
  scanType?: ('sast' | 'dast' | 'dependency' | 'secret')[];
  compliance?: ('owasp' | 'gdpr' | 'hipaa' | 'pci-dss' | 'soc2')[];
  dastUrl?: string;
  depth?: 'quick' | 'standard' | 'deep';
  failOnSeverity?: 'critical' | 'high' | 'medium' | 'low';
  [key: string]: unknown;
}

export interface SecurityScanResult {
  scanId: string;
  summary: ScanSummary;
  vulnerabilities: Vulnerability[];
  complianceResults?: ComplianceResult[];
  recommendations: string[];
  passed: boolean;
}

export interface ScanSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  informational: number;
  totalFiles: number;
  scanDurationMs: number;
}

export interface Vulnerability {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'informational';
  category: string;
  location: VulnerabilityLocation;
  description: string;
  remediation: string;
  cveId?: string;
  cweId?: string;
  references: string[];
}

export interface VulnerabilityLocation {
  file: string;
  line?: number;
  column?: number;
  snippet?: string;
  dependency?: { name: string; version: string };
}

export interface ComplianceResult {
  standard: string;
  passed: boolean;
  score: number;
  violations: ComplianceViolation[];
}

export interface ComplianceViolation {
  ruleId: string;
  ruleName: string;
  location: VulnerabilityLocation;
  details: string;
  remediation: string;
}

// ============================================================================
// Cross-language secret/config patterns (supplement security-patterns.ts)
// These catch Python, Java, Go patterns that the JS-focused patterns miss.
// ============================================================================

const CROSS_LANG_SECRET_PATTERNS: Array<{
  id: string;
  pattern: RegExp;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  cweId: string;
  remediation: string;
}> = [
  {
    id: 'secret-key-assignment',
    pattern: /(?:SECRET_KEY|secret_key|SECRET|PRIVATE_KEY)\s*=\s*['"][^'"]{4,}['"]/g,
    severity: 'critical',
    title: 'Hardcoded Secret Key',
    description: 'Secret key assigned as string literal in source code',
    cweId: 'CWE-798',
    remediation: 'Use environment variables: SECRET_KEY = os.environ["SECRET_KEY"]',
  },
  {
    id: 'cors-wildcard-credentials',
    pattern: /allow_origins\s*=\s*\[\s*["']\*["']\s*\]/g,
    severity: 'high',
    title: 'CORS Wildcard Origin',
    description: 'CORS configured to allow all origins — combined with credentials this is a security risk',
    cweId: 'CWE-942',
    remediation: 'Restrict CORS origins to specific trusted domains',
  },
  {
    id: 'cors-allow-credentials-wildcard',
    pattern: /allow_credentials\s*=\s*True/g,
    severity: 'medium',
    title: 'CORS Credentials Enabled',
    description: 'CORS credentials enabled — verify origins are restricted',
    cweId: 'CWE-942',
    remediation: 'Ensure allow_origins does not include "*" when credentials are enabled',
  },
  {
    id: 'token-hardcoded',
    pattern: /(?:token|TOKEN)\s*[:=]\s*['"][a-zA-Z0-9_\-.]{20,}['"]/g,
    severity: 'high',
    title: 'Hardcoded Token',
    description: 'Hardcoded token found in source code',
    cweId: 'CWE-798',
    remediation: 'Use environment variables or secrets manager for tokens',
  },
];

// ============================================================================
// Tool Implementation
// ============================================================================

export class SecurityScanTool extends MCPToolBase<SecurityScanParams, SecurityScanResult> {
  readonly config: MCPToolConfig = {
    name: 'qe/security/scan',
    description: 'Comprehensive security scanning including SAST, DAST, dependency analysis, and compliance validation.',
    domain: 'security-compliance',
    schema: SECURITY_SCAN_SCHEMA,
    streaming: true,
    timeout: 600000,
  };

  async execute(
    params: SecurityScanParams,
    context: MCPToolContext
  ): Promise<ToolResult<SecurityScanResult>> {
    const {
      target = '.',
      scanType = ['sast', 'dependency'],
      compliance = [],
      dastUrl,
      depth = 'standard',
      failOnSeverity = 'critical',
    } = params;

    const startTime = Date.now();

    try {
      this.emitStream(context, {
        status: 'scanning',
        message: `Starting security scan (${scanType.join(', ')})`,
        depth,
      });

      if (this.isAborted(context)) {
        return { success: false, error: 'Operation aborted' };
      }

      // Discover source files in the target directory
      const files = await discoverFiles(target, depth);

      this.emitStream(context, {
        status: 'discovered',
        message: `Found ${files.length} files to scan`,
      });

      const vulnerabilities: Vulnerability[] = [];

      // SAST scanning — apply real security patterns against real files
      if (scanType.includes('sast') || scanType.includes('secret')) {
        this.emitStream(context, { status: 'sast', message: 'Running static analysis' });
        const sastVulns = await scanFilesWithPatterns(files, scanType);
        vulnerabilities.push(...sastVulns);
      }

      // Dependency scanning — parse real package manifests
      if (scanType.includes('dependency')) {
        this.emitStream(context, { status: 'dependency', message: 'Scanning dependencies' });
        const depVulns = await scanDependencies(target);
        vulnerabilities.push(...depVulns);
      }

      // DAST scanning
      if (scanType.includes('dast') && dastUrl) {
        this.emitStream(context, { status: 'dast', message: `Scanning ${dastUrl}` });
        vulnerabilities.push(...generateDASTFindings(dastUrl));
      }

      // Compliance validation
      const complianceResults: ComplianceResult[] = compliance.map(std =>
        generateComplianceResult(std, vulnerabilities)
      );

      const summary: ScanSummary = {
        critical: vulnerabilities.filter(v => v.severity === 'critical').length,
        high: vulnerabilities.filter(v => v.severity === 'high').length,
        medium: vulnerabilities.filter(v => v.severity === 'medium').length,
        low: vulnerabilities.filter(v => v.severity === 'low').length,
        informational: vulnerabilities.filter(v => v.severity === 'informational').length,
        totalFiles: files.length,
        scanDurationMs: Date.now() - startTime,
      };

      const severityOrder = ['critical', 'high', 'medium', 'low', 'informational'];
      const failThreshold = severityOrder.indexOf(failOnSeverity);
      const worstSeverity = vulnerabilities.length > 0
        ? Math.min(...vulnerabilities.map(v => severityOrder.indexOf(v.severity)))
        : severityOrder.length;
      const passed = worstSeverity > failThreshold;

      this.emitStream(context, {
        status: 'complete',
        message: `Scan complete: ${vulnerabilities.length} vulnerabilities found in ${files.length} files`,
        progress: 100,
      });

      return {
        success: true,
        data: {
          scanId: context.requestId,
          summary,
          vulnerabilities,
          complianceResults: complianceResults.length > 0 ? complianceResults : undefined,
          recommendations: generateRecommendations(vulnerabilities, summary),
          passed,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Security scan failed: ${toErrorMessage(error)}`,
      };
    }
  }
}

// ============================================================================
// Schema
// ============================================================================

const SECURITY_SCAN_SCHEMA: MCPToolSchema = {
  type: 'object',
  properties: {
    target: {
      type: 'string',
      description: 'Target directory or file to scan',
      default: '.',
    },
    scanType: {
      type: 'array',
      description: 'Types of security scans to run',
      items: {
        type: 'string',
        description: 'Scan type',
        enum: ['sast', 'dast', 'dependency', 'secret'],
      },
      default: ['sast', 'dependency'],
    },
    compliance: {
      type: 'array',
      description: 'Compliance standards to validate against',
      items: {
        type: 'string',
        description: 'Standard',
        enum: ['owasp', 'gdpr', 'hipaa', 'pci-dss', 'soc2'],
      },
    },
    dastUrl: {
      type: 'string',
      description: 'URL for DAST scanning',
    },
    depth: {
      type: 'string',
      description: 'Scan depth',
      enum: ['quick', 'standard', 'deep'],
      default: 'standard',
    },
    failOnSeverity: {
      type: 'string',
      description: 'Fail threshold severity',
      enum: ['critical', 'high', 'medium', 'low'],
      default: 'critical',
    },
  },
};

// ============================================================================
// Real File Discovery
// ============================================================================

/** Source file extensions to scan, by language */
const SCANNABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',     // JavaScript/TypeScript
  '.py', '.pyw',                                      // Python
  '.java', '.kt', '.scala',                           // JVM
  '.go',                                              // Go
  '.rb',                                              // Ruby
  '.php',                                             // PHP
  '.rs',                                              // Rust
  '.cs',                                              // C#
  '.yaml', '.yml', '.json', '.toml', '.cfg', '.ini',  // Config
  '.env', '.env.local', '.env.production',             // Env files
  '.sh', '.bash',                                      // Shell
]);

/** Directories to always skip */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '__pycache__', '.venv', 'venv',
  'dist', 'build', '.next', '.nuxt', 'coverage', '.tox',
]);

async function discoverFiles(target: string, depth: string): Promise<string[]> {
  const fs = await import('fs');
  const path = await import('path');
  const resolved = path.resolve(target);
  const files: string[] = [];

  // Limits based on scan depth
  const maxFiles = depth === 'quick' ? 50 : depth === 'standard' ? 500 : 2000;
  const maxDepth = depth === 'quick' ? 3 : depth === 'standard' ? 8 : 20;

  function walk(dir: string, currentDepth: number): void {
    if (files.length >= maxFiles || currentDepth > maxDepth) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // Permission denied or not a directory
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) break;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip known non-source dirs, but DO scan security-relevant dot-dirs
        // like .github (CI secrets), .docker, .aws (miscommitted credentials)
        const SCAN_DOT_DIRS = new Set(['.github', '.docker', '.aws', '.circleci', '.gitlab']);
        if (SKIP_DIRS.has(entry.name)) {
          // Always skip node_modules, .git, etc.
        } else if (entry.name.startsWith('.') && !SCAN_DOT_DIRS.has(entry.name)) {
          // Skip other dot-dirs (caches, IDE config)
        } else {
          walk(fullPath, currentDepth + 1);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        // Also scan files without extension if named like config files
        if (SCANNABLE_EXTENSIONS.has(ext) ||
            entry.name === 'Dockerfile' ||
            entry.name === 'Makefile' ||
            entry.name.startsWith('.env')) {
          files.push(fullPath);
        }
      }
    }
  }

  // Handle single file target
  try {
    const stat = fs.statSync(resolved);
    if (stat.isFile()) {
      files.push(resolved);
    } else {
      walk(resolved, 0);
    }
  } catch {
    // Target doesn't exist
  }

  return files;
}

// ============================================================================
// Real SAST Scanning
// ============================================================================

async function scanFilesWithPatterns(
  files: string[],
  scanTypes: string[]
): Promise<Vulnerability[]> {
  const fs = await import('fs');
  const path = await import('path');
  const vulnerabilities: Vulnerability[] = [];
  let vulnCounter = 0;

  // Select patterns based on scan type
  const patterns: Array<{
    id: string;
    pattern: RegExp;
    severity: string;
    title: string;
    description: string;
    cweId?: string;
    remediation: string;
    category?: string;
  }> = [];

  if (scanTypes.includes('sast')) {
    // Use ALL patterns from the real security patterns module
    for (const p of ALL_SECURITY_PATTERNS) {
      patterns.push({
        id: p.id,
        pattern: new RegExp(p.pattern.source, p.pattern.flags),
        severity: p.severity,
        title: p.title,
        description: p.description,
        cweId: p.cweId,
        remediation: p.remediation,
        category: p.category,
      });
    }
    // Add cross-language patterns
    for (const p of CROSS_LANG_SECRET_PATTERNS) {
      patterns.push({
        id: p.id,
        pattern: new RegExp(p.pattern.source, p.pattern.flags),
        severity: p.severity,
        title: p.title,
        description: p.description,
        cweId: p.cweId,
        remediation: p.remediation,
        category: 'sensitive-data',
      });
    }
  }

  if (scanTypes.includes('secret')) {
    // Only secret patterns
    for (const p of SECRET_PATTERNS) {
      if (!patterns.some(existing => existing.id === p.id)) {
        patterns.push({
          id: p.id,
          pattern: new RegExp(p.pattern.source, p.pattern.flags),
          severity: p.severity,
          title: p.title,
          description: p.description,
          cweId: p.cweId,
          remediation: p.remediation,
          category: p.category,
        });
      }
    }
    for (const p of CROSS_LANG_SECRET_PATTERNS) {
      if (!patterns.some(existing => existing.id === p.id)) {
        patterns.push({
          ...p,
          category: 'sensitive-data',
        });
      }
    }
  }

  for (const filePath of files) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue; // Can't read file, skip
    }

    // Skip binary files or very large files
    if (content.includes('\0') || content.length > 1_000_000) continue;

    const lines = content.split('\n');
    const relPath = path.relative(process.cwd(), filePath);

    for (const patternDef of patterns) {
      // Reset regex state for each file
      const regex = new RegExp(patternDef.pattern.source, patternDef.pattern.flags);
      let match: RegExpExecArray | null;

      while ((match = regex.exec(content)) !== null) {
        vulnCounter++;
        const lineNum = content.substring(0, match.index).split('\n').length;
        const matchedLine = lines[lineNum - 1] || '';
        // Truncate snippet to avoid exposing full secrets
        const snippet = matchedLine.trim().length > 100
          ? matchedLine.trim().substring(0, 100) + '...'
          : matchedLine.trim();

        vulnerabilities.push({
          id: `${patternDef.id}-${vulnCounter}`,
          title: patternDef.title,
          severity: patternDef.severity as Vulnerability['severity'],
          category: patternDef.category || 'security-misconfiguration',
          location: {
            file: relPath,
            line: lineNum,
            snippet,
          },
          description: patternDef.description,
          remediation: patternDef.remediation,
          cweId: patternDef.cweId,
          references: [],
        });

        // Limit findings per pattern per file to avoid noise
        if (vulnCounter > 200) break;
      }
    }
  }

  return vulnerabilities;
}

// ============================================================================
// Real Dependency Scanning
// ============================================================================

async function scanDependencies(target: string): Promise<Vulnerability[]> {
  const fs = await import('fs');
  const path = await import('path');
  const vulnerabilities: Vulnerability[] = [];
  const resolved = path.resolve(target);

  // Scan package.json (Node.js)
  const pkgJsonPath = path.join(resolved, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      vulnerabilities.push(...checkKnownVulnerableDeps(allDeps, 'package.json'));
    } catch { /* skip malformed */ }
  }

  // Scan pyproject.toml (Python)
  const pyprojectPath = path.join(resolved, 'pyproject.toml');
  if (fs.existsSync(pyprojectPath)) {
    try {
      const content = fs.readFileSync(pyprojectPath, 'utf-8');
      const deps = extractPythonDeps(content);
      vulnerabilities.push(...checkKnownVulnerablePythonDeps(deps, 'pyproject.toml'));
    } catch { /* skip */ }
  }

  // Scan requirements.txt (Python)
  const reqPath = path.join(resolved, 'requirements.txt');
  if (fs.existsSync(reqPath)) {
    try {
      const content = fs.readFileSync(reqPath, 'utf-8');
      const deps = extractRequirementsTxtDeps(content);
      vulnerabilities.push(...checkKnownVulnerablePythonDeps(deps, 'requirements.txt'));
    } catch { /* skip */ }
  }

  if (vulnerabilities.length === 0) {
    // Check if manifest exists but no known vulnerable deps
    const manifests = [pkgJsonPath, pyprojectPath, reqPath].filter(p => fs.existsSync(p));
    if (manifests.length > 0) {
      vulnerabilities.push({
        id: 'DEP-INFO-001',
        title: 'Dependency audit recommended',
        severity: 'informational',
        category: 'vulnerable-components',
        location: { file: path.relative(process.cwd(), manifests[0]) },
        description: `Found ${path.basename(manifests[0])} — run language-specific dependency audit for comprehensive results`,
        remediation: 'Run npm audit, pip-audit, or equivalent for full vulnerability check',
        references: [],
      });
    }
  }

  return vulnerabilities;
}

/** Known vulnerable npm packages (high-profile CVEs) */
const KNOWN_VULNERABLE_NPM: Record<string, { maxSafe: string; cve: string; severity: string; desc: string }> = {
  'lodash': { maxSafe: '4.17.21', cve: 'CVE-2021-23337', severity: 'high', desc: 'Prototype pollution in lodash' },
  'minimist': { maxSafe: '1.2.6', cve: 'CVE-2021-44906', severity: 'critical', desc: 'Prototype pollution in minimist' },
  'node-fetch': { maxSafe: '2.6.7', cve: 'CVE-2022-0235', severity: 'high', desc: 'Information exposure in node-fetch' },
  'express': { maxSafe: '4.19.2', cve: 'CVE-2024-29041', severity: 'medium', desc: 'Open redirect in express' },
};

function checkKnownVulnerableDeps(
  deps: Record<string, string>,
  manifest: string
): Vulnerability[] {
  const vulns: Vulnerability[] = [];
  for (const [name, version] of Object.entries(deps)) {
    const known = KNOWN_VULNERABLE_NPM[name];
    if (known) {
      const cleanVersion = version.replace(/^[\^~>=<]+/, '');
      if (compareVersions(cleanVersion, known.maxSafe) < 0) {
        vulns.push({
          id: `DEP-${name}-${known.cve}`,
          title: `Vulnerable ${name} version`,
          severity: known.severity as Vulnerability['severity'],
          category: 'vulnerable-components',
          location: { file: manifest, dependency: { name, version: cleanVersion } },
          description: known.desc,
          remediation: `Upgrade ${name} to >= ${known.maxSafe}`,
          cveId: known.cve,
          references: [`https://nvd.nist.gov/vuln/detail/${known.cve}`],
        });
      }
    }
  }
  return vulns;
}

/** Known vulnerable Python packages */
const KNOWN_VULNERABLE_PYTHON: Record<string, { cve: string; severity: string; desc: string }> = {
  'python-jose': { cve: 'CVE-2024-33663', severity: 'critical', desc: 'python-jose is abandoned and has known JWT vulnerabilities' },
  'pyjwt': { cve: 'CVE-2022-29217', severity: 'high', desc: 'PyJWT algorithm confusion vulnerability (upgrade to >= 2.4.0)' },
  'python-multipart': { cve: 'CVE-2026-24486', severity: 'high', desc: 'python-multipart DoS vulnerability' },
  'jinja2': { cve: 'CVE-2024-34064', severity: 'medium', desc: 'Jinja2 XSS via template injection' },
  'urllib3': { cve: 'CVE-2023-45803', severity: 'medium', desc: 'urllib3 request body exposure on redirect' },
  'requests': { cve: 'CVE-2023-32681', severity: 'medium', desc: 'Requests proxy credential exposure' },
};

function extractPythonDeps(tomlContent: string): string[] {
  const deps: string[] = [];
  // Match dependencies = [...] section
  const depMatch = tomlContent.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
  if (depMatch) {
    const matches = depMatch[1].matchAll(/["']([a-zA-Z0-9_-]+)/g);
    for (const m of matches) {
      deps.push(m[1].toLowerCase());
    }
  }
  return deps;
}

function extractRequirementsTxtDeps(content: string): string[] {
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split(/[>=<!~\[]/)[0].trim().toLowerCase())
    .filter(Boolean);
}

function checkKnownVulnerablePythonDeps(deps: string[], manifest: string): Vulnerability[] {
  const vulns: Vulnerability[] = [];
  for (const dep of deps) {
    const known = KNOWN_VULNERABLE_PYTHON[dep];
    if (known) {
      vulns.push({
        id: `DEP-py-${dep}-${known.cve}`,
        title: `Vulnerable Python dependency: ${dep}`,
        severity: known.severity as Vulnerability['severity'],
        category: 'vulnerable-components',
        location: { file: manifest, dependency: { name: dep, version: 'any' } },
        description: known.desc,
        remediation: dep === 'python-jose' ? 'Migrate to PyJWT or joserfc' : `Check for updates to ${dep}`,
        cveId: known.cve,
        references: [`https://nvd.nist.gov/vuln/detail/${known.cve}`],
      });
    }
  }
  return vulns;
}

/** Simple semver comparison: returns -1 if a < b, 0 if equal, 1 if a > b */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va < vb) return -1;
    if (va > vb) return 1;
  }
  return 0;
}

// ============================================================================
// DAST Findings (requires live URL — kept as placeholder with clear note)
// ============================================================================

function generateDASTFindings(url: string): Vulnerability[] {
  // DAST requires HTTP requests to a live URL — return informational note
  return [
    {
      id: 'DAST-INFO-001',
      title: 'DAST scan target noted',
      severity: 'informational',
      category: 'security-misconfiguration',
      location: { file: url },
      description: `DAST target ${url} recorded. Full DAST requires integration with a dynamic scanner (e.g., ZAP, Burp).`,
      remediation: 'Configure a DAST tool to scan the live application',
      references: ['https://owasp.org/www-project-zap/'],
    },
  ];
}

// ============================================================================
// Compliance & Recommendations
// ============================================================================

function generateComplianceResult(standard: string, vulnerabilities: Vulnerability[]): ComplianceResult {
  const relevantVulns = vulnerabilities.filter(v => {
    if (standard === 'owasp') return true;
    if (standard === 'pci-dss') return v.category === 'injection' || v.category === 'sensitive-data';
    if (standard === 'gdpr') return v.category === 'sensitive-data';
    return false;
  });

  return {
    standard,
    passed: relevantVulns.filter(v => v.severity === 'critical' || v.severity === 'high').length === 0,
    score: Math.max(0, 100 - relevantVulns.length * 15),
    violations: relevantVulns.map(v => ({
      ruleId: v.id,
      ruleName: v.title,
      location: v.location,
      details: v.description,
      remediation: v.remediation,
    })),
  };
}

function generateRecommendations(vulnerabilities: Vulnerability[], summary: ScanSummary): string[] {
  const recs: string[] = [];

  if (summary.critical > 0) {
    recs.push('URGENT: Address critical vulnerabilities immediately');
  }
  if (summary.high > 0) {
    recs.push('Prioritize high-severity issues in next sprint');
  }
  if (vulnerabilities.some(v => v.category === 'injection')) {
    recs.push('Review input validation across the application');
  }
  if (vulnerabilities.some(v => v.category === 'sensitive-data')) {
    recs.push('Implement proper secrets management');
  }
  if (vulnerabilities.some(v => v.category === 'vulnerable-components')) {
    recs.push('Run full dependency audit and update vulnerable packages');
  }

  if (recs.length === 0) {
    recs.push('No critical issues found. Continue regular security reviews.');
  }

  return recs;
}
