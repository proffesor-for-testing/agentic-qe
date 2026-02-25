/**
 * Security scanning task handlers.
 *
 * Extracted from task-executor.ts registerHandlers().
 * Covers: scan-security
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ok, err } from '../../shared/types';
import { toError, toErrorMessage } from '../../shared/error-utils.js';
import { FilePath } from '../../shared/value-objects/index.js';
import type { TaskHandlerContext } from './handler-types';
import { discoverSourceFiles, generateSecurityRecommendations } from './handler-utils';

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
      const scanner = ctx.getSecurityScanner();
      const targetPath = payload.target || process.cwd();

      // Discover files to scan
      const filesToScan = await discoverSourceFiles(targetPath);

      if (filesToScan.length === 0) {
        return ok({
          vulnerabilities: 0,
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          informational: 0,
          topVulnerabilities: [],
          recommendations: ['No source files found to scan'],
          scanTypes: {
            sast: payload.sast !== false,
            dast: payload.dast || false,
          },
          warning: `No source files found in ${targetPath}`,
        });
      }

      // Separate files by language capability
      const jstsFiles = filesToScan.filter(f => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f));
      const otherFiles = filesToScan.filter(f => !/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f));

      // Run basic cross-language security patterns on non-JS/TS files
      const crossLangVulns: Array<{
        title: string; severity: 'critical' | 'high' | 'medium' | 'low' | 'informational';
        location: { file: string; line: number }; description: string; category: string;
      }> = [];

      // Run secret/CORS patterns on ALL files (not just otherFiles) to catch JS/TS secrets too
      for (const filePath of filesToScan) {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.split('\n');
          const relPath = filePath.startsWith(targetPath)
            ? filePath.slice(targetPath.length).replace(/^\//, '')
            : filePath;

          // Pattern: Hardcoded secrets/keys
          // Fix #287: Use \w* around keywords to match SECRET_KEY, JWT_SECRET, API_TOKEN, etc.
          const secretPatterns = [
            { regex: /\w*(?:secret|password|passwd|api_key|apikey|private_key|jwt_secret)\w*\s*[=:]\s*['"][^'"]{4,}['"]/gi, title: 'Hardcoded secret', severity: 'critical' as const },
            { regex: /\w*(?:token|auth_token|access_key|secret_key)\w*\s*[=:]\s*['"][^'"]{8,}['"]/gi, title: 'Hardcoded credential', severity: 'critical' as const },
            { regex: /(?:AWS_SECRET|GITHUB_TOKEN|SLACK_TOKEN|OPENAI_API_KEY)\s*[=:]\s*['"][^'"]+['"]/gi, title: 'Hardcoded cloud credential', severity: 'critical' as const },
          ];

          for (const pattern of secretPatterns) {
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
          for (const corsPattern of corsPatterns) {
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
          if (/\b(?:eval|exec)\s*\(/i.test(content)) {
            crossLangVulns.push({
              title: 'Dangerous eval/exec usage',
              severity: 'high',
              location: { file: relPath, line: lines.findIndex(l => /\b(?:eval|exec)\s*\(/.test(l)) + 1 },
              description: 'eval/exec can lead to code injection — avoid using with user input',
              category: 'injection',
            });
          }
        } catch {
          // Skip unreadable files
        }
      }

      // Also check dependency manifests for known vulnerable packages
      const depManifests = ['requirements.txt', 'pyproject.toml', 'Gemfile', 'go.mod', 'Cargo.toml'];
      for (const manifest of depManifests) {
        const manifestPath = path.join(targetPath, manifest);
        try {
          const manifestContent = await fs.readFile(manifestPath, 'utf-8');
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
        } catch {
          // Manifest doesn't exist
        }
      }

      // Convert JS/TS file paths to FilePath value objects for the SAST scanner
      const filePathObjects = jstsFiles.map(filePath => FilePath.create(filePath));

      // Run SAST scan on JS/TS files if requested and files exist
      let sastResult = null;
      if (payload.sast !== false && filePathObjects.length > 0) {
        const result = await scanner.scanFiles(filePathObjects);
        if (result.success) {
          sastResult = result.value;
        }
      }

      // Run DAST scan if URL provided and dast is enabled
      let dastResult = null;
      if (payload.dast && payload.targetUrl) {
        const result = await scanner.scanUrl(payload.targetUrl, {
          activeScanning: true,
          maxDepth: 3,
          timeout: 30000,
        });
        if (result.success) {
          dastResult = result.value;
        }
      }

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
      const recommendations = generateSecurityRecommendations(allVulns);

      return ok({
        vulnerabilities: allVulns.length,
        critical: summary.critical,
        high: summary.high,
        medium: summary.medium,
        low: summary.low,
        informational: summary.informational,
        topVulnerabilities,
        recommendations,
        scanTypes: {
          sast: payload.sast !== false,
          dast: payload.dast || false,
        },
        filesScanned: filesToScan.length,
        jstsFilesScanned: jstsFiles.length,
        otherFilesScanned: otherFiles.length,
        coverage: sastResult?.coverage,
        ...(otherFiles.length > 0 && jstsFiles.length === 0 ? {
          note: 'Non-JS/TS files were scanned with cross-language pattern matching. For deeper analysis, use language-specific security tools.',
        } : {}),
      });
    } catch (error) {
      return err(toError(error));
    }
  });
}
