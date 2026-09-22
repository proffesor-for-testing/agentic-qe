/**
 * Security scanning task handlers.
 *
 * Extracted from task-executor.ts registerHandlers().
 * Covers: scan-security
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ok, err } from '../../shared/types';
import { createHash } from 'node:crypto';
import { toError } from '../../shared/error-utils.js';
import { FilePath } from '../../shared/value-objects/index.js';
import type { TaskHandlerContext } from './handler-types';
import { generateSecurityRecommendations } from './handler-utils';
import { discoverSecurityFiles, isSecuritySourceFile } from '../../domains/security-compliance/scan-discovery.js';
import type { SecurityScanEvidence, SecurityEngineEvidence, SecurityFileEvidence } from '../../domains/security-compliance/scan-evidence.js';
import type { SASTResult, DASTResult } from '../../domains/security-compliance/interfaces.js';

export function registerSecurityHandlers(ctx: TaskHandlerContext): void {
  // Register security scan handler - REAL IMPLEMENTATION
  ctx.registerHandler('scan-security', async (task) => {
    const payload = task.payload as {
      target: string;
      sast: boolean;
      dast: boolean;
      compliance: string[];
      targetUrl?: string;
    };

    try {
      const targetPath = path.resolve(payload.target || process.cwd());
      const sastRequested = payload.sast !== false;
      const discoveryResult = sastRequested ? await discoverSecurityFiles(targetPath) : undefined;
      const filesToScan = discoveryResult?.files ?? [];
      const fileEvidence: SecurityFileEvidence[] = [];
      const engines: SecurityEngineEvidence[] = [];
      const genericRules = new Map<string, string>();
      const genericErrors: string[] = [];
      const manifestErrors: string[] = [];
      const manifestRules = new Map<string, string>();
      const limitations: string[] = [];

      // Separate files by language capability
      const jstsFiles = filesToScan.filter(f => /\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(f));
      const otherFiles = filesToScan.filter(f => !/\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(f));

      // Run basic cross-language security patterns on non-JS/TS files
      const crossLangVulns: Array<{
        title: string; severity: 'critical' | 'high' | 'medium' | 'low' | 'informational';
        location: { file: string; line: number }; description: string; category: string;
      }> = [];

      // Run secret/CORS patterns on ALL files (not just otherFiles) to catch JS/TS secrets too
      for (const filePath of filesToScan) {
        if (!isSecuritySourceFile(filePath)) {
          fileEvidence.push({ path: filePath, engineId: 'generic-patterns', status: 'unsupported',
            readLines: 0, analyzedLines: 0, reason: 'Outside the declared source-language policy.' });
          continue;
        }
        try {
          const source = await fs.readFile(filePath);
          const content = source.toString('utf-8');
          const lines = content.split('\n');
          fileEvidence.push({ path: filePath, engineId: 'generic-patterns', status: 'analyzed',
            sourceDigest: createHash('sha256').update(source).digest('hex'),
            readLines: lines.length, analyzedLines: lines.length });
          const relPath = path.relative(targetPath, filePath) || path.basename(filePath);

          // Pattern: Hardcoded secrets/keys
          // Fix #287: Use \w* around keywords to match SECRET_KEY, JWT_SECRET, API_TOKEN, etc.
          const secretPatterns = [
            { regex: /\w*(?:secret|password|passwd|api_key|apikey|private_key|jwt_secret)\w*\s*[=:]\s*['"][^'"]{4,}['"]/gi, title: 'Hardcoded secret', severity: 'critical' as const },
            { regex: /\w*(?:token|auth_token|access_key|secret_key)\w*\s*[=:]\s*['"][^'"]{8,}['"]/gi, title: 'Hardcoded credential', severity: 'critical' as const },
            { regex: /(?:AWS_SECRET|GITHUB_TOKEN|SLACK_TOKEN|OPENAI_API_KEY)\s*[=:]\s*['"][^'"]+['"]/gi, title: 'Hardcoded cloud credential', severity: 'critical' as const },
          ];

          for (const [index, pattern] of secretPatterns.entries()) {
            genericRules.set(`secret-${index}`, pattern.regex.toString());
            for (let i = 0; i < lines.length; i++) {
              // Use matchAll to find ALL secrets on a single line (not just first)
              const matches = [...lines[i].matchAll(pattern.regex)];
              for (const _m of matches) {
                crossLangVulns.push({
                  title: pattern.title,
                  severity: pattern.severity,
                  location: { file: relPath, line: i + 1 },
                  description: `Potential hardcoded secret found at line ${i + 1}`,
                  category: 'sensitive-data',
                });
              }
            }
          }

          // Pattern: SQL injection risks
          const sqlPatterns = /(?:execute|query|cursor\.execute)\s*\(\s*(?:f['"]|['"].*%s|['"].*\+\s*\w)/gi;
          genericRules.set('sql-interpolation', sqlPatterns.toString());
          for (let i = 0; i < lines.length; i++) {
            if (sqlPatterns.test(lines[i])) {
              crossLangVulns.push({
                title: 'Potential SQL injection',
                severity: 'high',
                location: { file: relPath, line: i + 1 },
                description: 'String interpolation in SQL query — use parameterized queries',
                category: 'injection',
              });
            }
            sqlPatterns.lastIndex = 0;
          }

          // Pattern: CORS wildcard (multi-framework)
          const corsPatterns = [
            /allow_origins\s*=\s*\[?\s*['"]?\*['"]?\s*\]?/i,          // Python FastAPI/Flask
            /cors\(\s*\{[^}]*origin:\s*['"]?\*['"]?/i,                 // Express.js cors()
            /Access-Control-Allow-Origin['":\s]+\*/i,                   // Raw header / Nginx / .htaccess
            /@CrossOrigin\(\s*origins?\s*=\s*["']\*["']/i,             // Spring Boot
            /\.Header\(\)\.Set\(["']Access-Control-Allow-Origin["'],\s*["']\*["']/i, // Go
          ];
          for (const [index, corsPattern] of corsPatterns.entries()) {
            genericRules.set(`cors-${index}`, corsPattern.toString());
            if (corsPattern.test(content)) {
              crossLangVulns.push({
                title: 'CORS wildcard origin',
                severity: 'high',
                location: { file: relPath, line: lines.findIndex(l => corsPattern.test(l)) + 1 },
                description: 'CORS configured with wildcard (*) origin — restrict to specific domains',
                category: 'security-misconfiguration',
              });
              break; // One CORS finding per file is enough
            }
          }

          // Pattern: Debug/development mode enabled
          genericRules.set('debug-mode', /(?:DEBUG|debug)\s*[=:]\s*(?:True|true|1)/i.toString());
          if (/(?:DEBUG|debug)\s*[=:]\s*(?:True|true|1)/i.test(content)) {
            crossLangVulns.push({
              title: 'Debug mode enabled',
              severity: 'medium',
              location: { file: relPath, line: lines.findIndex(l => /DEBUG\s*[=:]\s*(?:True|true|1)/i.test(l)) + 1 },
              description: 'Debug mode should be disabled in production',
              category: 'security-misconfiguration',
            });
          }

          // Pattern: Eval/exec usage
          genericRules.set('eval-exec', /\b(?:eval|exec)\s*\(/i.toString());
          if (/\b(?:eval|exec)\s*\(/i.test(content)) {
            crossLangVulns.push({
              title: 'Dangerous eval/exec usage',
              severity: 'high',
              location: { file: relPath, line: lines.findIndex(l => /\b(?:eval|exec)\s*\(/.test(l)) + 1 },
              description: 'eval/exec can lead to code injection — avoid using with user input',
              category: 'injection',
            });
          }
        } catch (error) {
          const reason = `Source read failed: ${safeErrorCode(error)}`;
          genericErrors.push(`${filePath}: ${reason}`);
          fileEvidence.push({ path: filePath, engineId: 'generic-patterns', status: 'unreadable',
            readLines: 0, analyzedLines: 0, reason });
        }
      }

      // Also check dependency manifests for known vulnerable packages
      const depManifests = ['requirements.txt', 'pyproject.toml', 'Gemfile', 'go.mod', 'Cargo.toml'];
      for (const manifest of sastRequested ? depManifests : []) {
        const manifestPath = path.join(targetPath, manifest);
        try {
          const manifestSource = await fs.readFile(manifestPath);
          const manifestContent = manifestSource.toString('utf-8');
          const manifestLines = manifestContent.split('\n').length;
          fileEvidence.push({ path: manifestPath, engineId: 'dependency-manifest-patterns', status: 'analyzed',
            sourceDigest: createHash('sha256').update(manifestSource).digest('hex'), readLines: manifestLines, analyzedLines: manifestLines });
          manifestRules.set('dependency-audit-advisory', 'Presence of a supported dependency manifest');
          crossLangVulns.push({
            title: 'Dependency audit recommended',
            severity: 'informational',
            location: { file: manifest, line: 1 },
            description: `Found ${manifest} — run language-specific dependency audit (e.g., pip-audit, npm audit, cargo audit)`,
            category: 'dependencies',
          });

          // Check for known high-severity CVEs in Python dependencies
          if (manifest === 'requirements.txt' || manifest === 'pyproject.toml') {
            const knownCVEs: Array<{ pkg: string; pattern: RegExp; cve: string; severity: 'critical' | 'high'; title: string; description: string }> = [
              { pkg: 'python-jose', pattern: /python-jose/i, cve: 'CVE-2024-33663', severity: 'high', title: 'python-jose ECDSA key confusion (CVE-2024-33663)', description: 'python-jose allows ECDSA key confusion — upgrade to >=3.3.0 or switch to PyJWT' },
              { pkg: 'python-jose', pattern: /python-jose/i, cve: 'CVE-2024-33664', severity: 'high', title: 'python-jose JWT algorithm confusion (CVE-2024-33664)', description: 'python-jose JWT algorithm confusion vulnerability — upgrade or switch to PyJWT' },
              { pkg: 'python-multipart', pattern: /python-multipart/i, cve: 'CVE-2026-24486', severity: 'critical', title: 'python-multipart DoS (CVE-2026-24486)', description: 'python-multipart denial of service via crafted multipart data — upgrade to >=0.0.18' },
            ];

            for (const known of knownCVEs) {
              manifestRules.set(known.cve, known.pattern.toString());
              if (known.pattern.test(manifestContent)) {
                crossLangVulns.push({
                  title: known.title,
                  severity: known.severity,
                  location: { file: manifest, line: manifestContent.split('\n').findIndex(l => known.pattern.test(l)) + 1 },
                  description: known.description,
                  category: 'dependencies',
                });
              }
            }
          }
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code !== 'ENOENT' && code !== 'ENOTDIR') {
            const reason = `Manifest read failed: ${safeErrorCode(error)}`;
            manifestErrors.push(`${manifestPath}: ${reason}`);
            fileEvidence.push({ path: manifestPath, engineId: 'dependency-manifest-patterns', status: 'unreadable',
              readLines: 0, analyzedLines: 0, reason });
          }
        }
      }

      const genericAnalyzed = fileEvidence.filter(file => file.engineId === 'generic-patterns' && file.status === 'analyzed').length;
      const manifestsAnalyzed = fileEvidence.filter(file => file.engineId === 'dependency-manifest-patterns' && file.status === 'analyzed').length;
      engines.push({ id: 'dependency-manifest-patterns', requested: sastRequested, required: false,
        status: !sastRequested ? 'disabled' : manifestErrors.length > 0 ? (manifestsAnalyzed > 0 ? 'partial' : 'failed') : manifestsAnalyzed > 0 ? 'completed' : 'not-run',
        scope: 'parent-directory', target: targetPath, analyzedFiles: manifestsAnalyzed,
        ruleIds: [...manifestRules.keys()].sort(), rulesetDigest: createHash('sha256').update(JSON.stringify([...manifestRules.entries()].sort())).digest('hex'),
        ruleCoverage: 'known', errors: manifestErrors, limitations: ['Manifest name patterns are advisories, not a resolved dependency or version audit.'] });
      const genericLimitations = ['Generic text patterns do not establish language-specific or dependency vulnerability coverage.'];
      engines.push({ id: 'generic-patterns', requested: sastRequested, required: sastRequested,
        status: !sastRequested ? 'disabled' : genericErrors.length > 0 ? (genericAnalyzed > 0 ? 'partial' : 'failed')
          : genericAnalyzed === filesToScan.length && genericAnalyzed > 0 ? 'completed'
          : genericAnalyzed > 0 ? 'partial' : filesToScan.length > 0 ? 'unavailable' : 'not-run',
        scope: 'requested-files', analyzedFiles: genericAnalyzed,
        ruleIds: [...genericRules.keys()].sort(),
        rulesetDigest: createHash('sha256').update(JSON.stringify([...genericRules.entries()].sort())).digest('hex'),
        ruleCoverage: 'known', errors: genericErrors, limitations: genericLimitations });

      // Convert JS/TS file paths to FilePath value objects for the SAST scanner
      const filePathObjects = jstsFiles.map(filePath => FilePath.create(filePath));

      // Only returned execution receipts can establish SAST coverage.
      let sastResult: SASTResult | null = null;
      if (sastRequested && filePathObjects.length > 0) {
        try {
          const result = await ctx.getSecurityScanner().scanFiles(filePathObjects);
          if (result.success) {
            sastResult = result.value;
            if (sastResult.evidence) {
              fileEvidence.push(...sastResult.evidence.files);
              engines.push(...sastResult.evidence.engines);
              limitations.push(...sastResult.evidence.limitations);
            } else {
              engines.push(unverifiedEngine('sast', 'requested-files'));
            }
          } else {
            engines.push(failedEngine('sast', 'requested-files', result.error));
          }
        } catch (error) {
          engines.push(failedEngine('sast', 'requested-files', error));
        }
      } else {
        engines.push({ id: 'sast', requested: sastRequested, required: false,
          status: sastRequested ? 'not-run' : 'disabled', scope: 'requested-files', analyzedFiles: 0,
          ruleCoverage: 'unknown', errors: [], limitations: sastRequested ? ['No JS/TS files were available for language-specific SAST.'] : [] });
      }

      let dastResult: DASTResult | null = null;
      if (payload.dast && payload.targetUrl) {
        try {
          const result = await ctx.getSecurityScanner().scanUrl(payload.targetUrl, {
            activeScanning: true, maxDepth: 3, timeout: 30000,
          });
          if (result.success) {
            dastResult = result.value;
            // Legacy DAST results contain findings, but no execution coverage receipt.
            engines.push({ ...unverifiedEngine('dast', 'url'), target: payload.targetUrl });
          } else {
            engines.push({ ...failedEngine('dast', 'url', result.error), target: payload.targetUrl });
          }
        } catch (error) {
          engines.push({ ...failedEngine('dast', 'url', error), target: payload.targetUrl });
        }
      } else {
        engines.push({ id: 'dast', requested: payload.dast === true, required: payload.dast === true,
          status: payload.dast ? 'not-run' : 'disabled', scope: 'url', ruleCoverage: 'unknown',
          errors: payload.dast ? ['DAST was requested without targetUrl.'] : [], limitations: [] });
      }

      if (payload.compliance?.length) {
        engines.push({ id: 'compliance', requested: true, required: true, status: 'not-run',
          scope: 'requested-files', ruleCoverage: 'unknown', errors: [],
          limitations: ['Requested compliance checks are not executed by this task handler.'] });
      }

      const requestedPaths = new Set(filesToScan);
      const analyzedPaths = new Set(fileEvidence.filter(file =>
        file.status === 'analyzed' && requestedPaths.has(file.path)).map(file => file.path));
      const requiredEngines = engines.filter(engine => engine.requested && engine.required);
      const hasExecuted = analyzedPaths.size > 0;
      const complete = hasExecuted && requiredEngines.every(engine => engine.status === 'completed') &&
        (!discoveryResult || discoveryResult.discovery.status === 'complete');
      const evidence: SecurityScanEvidence = {
        schemaVersion: 1, completeness: complete ? 'complete' : hasExecuted ? 'partial' : 'none',
        requestedFiles: filesToScan.length, requestedPaths: filesToScan, duplicateInputs: 0,
        files: fileEvidence, engines,
        limitations: [...new Set([...limitations, ...engines.flatMap(engine => [...engine.limitations, ...engine.errors]),
          ...(discoveryResult?.discovery.issues.map(issue => `${issue.path}: ${issue.reason}`) ?? [])])],
        ...(discoveryResult ? { discovery: discoveryResult.discovery } : {}),
      };
      const deepAnalysisPerformed = Boolean(sastResult?.evidence?.engines.some(engine =>
        engine.id === 'patterns' && (engine.status === 'completed' || engine.status === 'partial') &&
        (engine.analyzedFiles ?? 0) > 0));

      // Combine results from all scan sources - SAST, DAST, and cross-language patterns
      const crossLangSeverityCounts = {
        critical: crossLangVulns.filter(v => v.severity === 'critical').length,
        high: crossLangVulns.filter(v => v.severity === 'high').length,
        medium: crossLangVulns.filter(v => v.severity === 'medium').length,
        low: crossLangVulns.filter(v => v.severity === 'low').length,
        informational: crossLangVulns.filter(v => v.severity === 'informational').length,
      };

      const summary = {
        critical: (sastResult?.summary?.critical || 0) + (dastResult?.summary?.critical || 0) + crossLangSeverityCounts.critical,
        high: (sastResult?.summary?.high || 0) + (dastResult?.summary?.high || 0) + crossLangSeverityCounts.high,
        medium: (sastResult?.summary?.medium || 0) + (dastResult?.summary?.medium || 0) + crossLangSeverityCounts.medium,
        low: (sastResult?.summary?.low || 0) + (dastResult?.summary?.low || 0) + crossLangSeverityCounts.low,
        informational: (sastResult?.summary?.informational || 0) + (dastResult?.summary?.informational || 0) + crossLangSeverityCounts.informational,
      };

      // Extract top vulnerabilities from all sources
      const allVulns = [
        ...(sastResult?.vulnerabilities || []),
        ...(dastResult?.vulnerabilities || []),
        ...crossLangVulns,
      ];

      const topVulnerabilities = allVulns
        .sort((a, b) => {
          const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, informational: 4 };
          return severityOrder[a.severity] - severityOrder[b.severity];
        })
        .slice(0, 10)
        .map(v => ({
          type: v.title,
          severity: v.severity,
          file: v.location.file,
          line: v.location.line,
          description: v.description,
        }));

      // Generate recommendations based on findings
      const recommendations = allVulns.length === 0 && evidence.completeness !== 'complete'
        ? ['No findings reported; requested analysis is incomplete or unverified. Inspect execution receipts.']
        : generateSecurityRecommendations(allVulns);

      return ok({
        vulnerabilities: allVulns.length,
        critical: summary.critical,
        high: summary.high,
        medium: summary.medium,
        low: summary.low,
        informational: summary.informational,
        topVulnerabilities,
        findings: allVulns,
        recommendations,
        scanTypes: {
          sast: payload.sast !== false,
          dast: payload.dast || false,
        },
        status: evidence.completeness === 'complete' ? 'completed' : evidence.completeness === 'partial' ? 'partial' : 'unavailable',
        evidence,
        limitations: evidence.limitations,
        filesScanned: analyzedPaths.size,
        jstsFilesScanned: jstsFiles.filter(file => analyzedPaths.has(file)).length,
        otherFilesScanned: otherFiles.filter(file => analyzedPaths.has(file)).length,
        ...(sastResult?.evidence ? { coverage: sastResult.coverage } : {}),
        deepAnalysisPerformed,
        analysisDepth: deepAnalysisPerformed
          ? (otherFiles.length > 0 ? 'sast-patterns-on-js-ts; generic-patterns-on-other-languages' : 'sast-patterns')
          : genericAnalyzed > 0 ? 'pattern-matching-only' : 'none',
        ...(!deepAnalysisPerformed ? { note: 'No verified language-specific SAST ran. Generic pattern matches and partial findings do not establish that the target is free of vulnerabilities.' } : {}),
      });
    } catch (error) {
      return err(toError(error));
    }
  });
}

function failedEngine(id: string, scope: SecurityEngineEvidence['scope'], error: unknown): SecurityEngineEvidence {
  const reason = id === 'sast' && error instanceof Error && error.message.startsWith('No valid rule sets found:')
    ? 'No valid rule sets configured.' : `${id} execution failed (${safeErrorCode(error)}).`;
  return { id, requested: true, required: true, status: 'failed', scope,
    ruleCoverage: 'unknown', errors: [reason], limitations: [] };
}

function safeErrorCode(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return typeof code === 'string' && /^[A-Z0-9_]{1,32}$/.test(code) ? code : 'UNKNOWN';
}

function unverifiedEngine(id: string, scope: SecurityEngineEvidence['scope']): SecurityEngineEvidence {
  return { id, requested: true, required: true, status: 'unverified', scope,
    ruleCoverage: 'unknown', errors: [], limitations: [`${id} returned no execution receipt; coverage is unverified.`] };
}
