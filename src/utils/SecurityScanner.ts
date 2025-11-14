/**
 * Real Security Scanner Implementation
 * Integrates ESLint Security, Semgrep, and NPM Audit
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface VulnerabilityFinding {
  id: string;
  type: 'sast' | 'dast' | 'dependency' | 'container';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  location: string;
  cwe?: string;
  cve?: string;
  cvss?: number;
  remediation?: string;
  references?: string[];
}

export interface ScanResult {
  findings: VulnerabilityFinding[];
  scanType: string;
  duration: number;
  success: boolean;
  error?: string;
}

/**
 * Real Security Scanner using actual tools
 */
export class RealSecurityScanner {
  private workingDir: string;

  constructor(workingDir: string = process.cwd()) {
    this.workingDir = workingDir;
  }

  /**
   * Run ESLint security scan
   */
  async runESLintScan(target: string): Promise<ScanResult> {
    const startTime = Date.now();
    const findings: VulnerabilityFinding[] = [];

    try {
      // Create temporary ESLint config with security plugin
      const eslintConfig = {
        env: { node: true, es2021: true },
        extends: ['eslint:recommended'],
        plugins: ['security'],
        rules: {
          'security/detect-object-injection': 'warn',
          'security/detect-non-literal-fs-filename': 'warn',
          'security/detect-eval-with-expression': 'error',
          'security/detect-non-literal-regexp': 'warn',
          'security/detect-unsafe-regex': 'error',
          'security/detect-buffer-noassert': 'error',
          'security/detect-child-process': 'warn',
          'security/detect-disable-mustache-escape': 'error',
          'security/detect-no-csrf-before-method-override': 'error',
          'security/detect-non-literal-require': 'warn',
          'security/detect-possible-timing-attacks': 'warn',
          'security/detect-pseudoRandomBytes': 'error'
        }
      };

      const configPath = path.join(this.workingDir, '.eslintrc.security.json');
      await fs.promises.writeFile(configPath, JSON.stringify(eslintConfig, null, 2));

      // Run ESLint
      const result = spawnSync('npx', [
        'eslint',
        '--config', configPath,
        '--format', 'json',
        '--no-eslintrc',
        target
      ], {
        cwd: this.workingDir,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      // Clean up config
      try {
        fs.unlinkSync(configPath);
      } catch (err) {
        // Ignore cleanup errors
      }

      if (result.stdout) {
        const eslintResults = JSON.parse(result.stdout);

        // Parse ESLint results
        for (const file of eslintResults) {
          if (file.messages && file.messages.length > 0) {
            for (const message of file.messages) {
              const severity = this.mapESLintSeverity(message.severity);
              const cwe = this.extractCWE(message.ruleId);

              findings.push({
                id: `eslint-${Date.now()}-${findings.length}`,
                type: 'sast',
                severity,
                title: message.ruleId || 'ESLint Security Issue',
                description: message.message,
                location: `${file.filePath}:${message.line}:${message.column}`,
                cwe,
                remediation: this.getESLintRemediation(message.ruleId)
              });
            }
          }
        }
      }

      return {
        findings,
        scanType: 'eslint-security',
        duration: Date.now() - startTime,
        success: result.status === 0 || result.status === 1 // 0=clean, 1=issues found
      };
    } catch (error) {
      return {
        findings,
        scanType: 'eslint-security',
        duration: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Run Semgrep SAST scan
   */
  async runSemgrepScan(target: string): Promise<ScanResult> {
    const startTime = Date.now();
    const findings: VulnerabilityFinding[] = [];

    try {
      // Run Semgrep with auto config (community rules)
      const result = spawnSync('npx', [
        'semgrep',
        '--config', 'auto',
        '--json',
        '--quiet',
        target
      ], {
        cwd: this.workingDir,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 60000 // 60 second timeout
      });

      if (result.stdout) {
        try {
          const semgrepOutput = JSON.parse(result.stdout);

          if (semgrepOutput.results && Array.isArray(semgrepOutput.results)) {
            for (const finding of semgrepOutput.results) {
              const severity = this.mapSemgrepSeverity(finding.extra?.severity);
              const cwe = finding.extra?.metadata?.cwe?.[0];
              const cve = finding.extra?.metadata?.cve;

              findings.push({
                id: `semgrep-${finding.check_id}-${findings.length}`,
                type: 'sast',
                severity,
                title: finding.check_id,
                description: finding.extra?.message || finding.check_id,
                location: `${finding.path}:${finding.start.line}`,
                cwe: cwe ? `CWE-${cwe}` : undefined,
                cve,
                remediation: finding.extra?.metadata?.remediation,
                references: finding.extra?.metadata?.references
              });
            }
          }
        } catch (parseError) {
          // Semgrep output might not be valid JSON in some cases
          console.warn('Failed to parse Semgrep output:', parseError);
        }
      }

      return {
        findings,
        scanType: 'semgrep-sast',
        duration: Date.now() - startTime,
        success: result.status === 0 || result.status === 1
      };
    } catch (error) {
      return {
        findings,
        scanType: 'semgrep-sast',
        duration: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Run NPM Audit scan
   */
  async runNPMAuditScan(): Promise<ScanResult> {
    const startTime = Date.now();
    const findings: VulnerabilityFinding[] = [];

    try {
      const result = spawnSync('npm', ['audit', '--json'], {
        cwd: this.workingDir,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024
      });

      if (result.stdout) {
        try {
          const auditOutput = JSON.parse(result.stdout);

          if (auditOutput.vulnerabilities) {
            for (const [pkgName, vulnData] of Object.entries(auditOutput.vulnerabilities)) {
              const vuln = vulnData as any;

              // NPM audit v7+ format
              if (vuln.via && Array.isArray(vuln.via)) {
                for (const viaItem of vuln.via) {
                  if (typeof viaItem === 'object' && viaItem.title) {
                    const severity = this.mapNPMSeverity(viaItem.severity);

                    findings.push({
                      id: `npm-${viaItem.cve || viaItem.source || Date.now()}-${findings.length}`,
                      type: 'dependency',
                      severity,
                      title: `Vulnerable Dependency: ${pkgName}`,
                      description: viaItem.title,
                      location: 'package.json',
                      cve: viaItem.cve,
                      cvss: viaItem.cvss?.score,
                      remediation: `Update ${pkgName} to a secure version (${vuln.fixAvailable ? 'fix available' : 'no fix available yet'})`,
                      references: viaItem.url ? [viaItem.url] : []
                    });
                  }
                }
              }
            }
          }
        } catch (parseError) {
          console.warn('Failed to parse NPM audit output:', parseError);
        }
      }

      return {
        findings,
        scanType: 'npm-audit',
        duration: Date.now() - startTime,
        success: true // NPM audit can return non-zero even on success
      };
    } catch (error) {
      return {
        findings,
        scanType: 'npm-audit',
        duration: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Run comprehensive security scan
   */
  async runComprehensiveScan(target: string): Promise<VulnerabilityFinding[]> {
    const allFindings: VulnerabilityFinding[] = [];

    // Run ESLint security scan
    const eslintResult = await this.runESLintScan(target);
    if (eslintResult.success) {
      allFindings.push(...eslintResult.findings);
    }

    // Run Semgrep scan (only if installed)
    if (this.isSemgrepAvailable()) {
      const semgrepResult = await this.runSemgrepScan(target);
      if (semgrepResult.success) {
        allFindings.push(...semgrepResult.findings);
      }
    }

    // Run NPM audit
    const npmResult = await this.runNPMAuditScan();
    if (npmResult.success) {
      allFindings.push(...npmResult.findings);
    }

    return allFindings;
  }

  /**
   * Check if Semgrep is available
   */
  private isSemgrepAvailable(): boolean {
    try {
      const result = spawnSync('npx', ['semgrep', '--version'], {
        encoding: 'utf8',
        timeout: 5000
      });
      return result.status === 0;
    } catch {
      return false;
    }
  }

  /**
   * Map ESLint severity to our severity levels
   */
  private mapESLintSeverity(severity: number): 'critical' | 'high' | 'medium' | 'low' | 'info' {
    // ESLint: 2 = error, 1 = warning
    if (severity === 2) return 'high';
    if (severity === 1) return 'medium';
    return 'info';
  }

  /**
   * Map Semgrep severity
   */
  private mapSemgrepSeverity(severity?: string): 'critical' | 'high' | 'medium' | 'low' | 'info' {
    if (!severity) return 'medium';

    const sev = severity.toLowerCase();
    if (sev === 'error' || sev === 'critical') return 'critical';
    if (sev === 'warning' || sev === 'high') return 'high';
    if (sev === 'info' || sev === 'low') return 'low';
    return 'medium';
  }

  /**
   * Map NPM audit severity
   */
  private mapNPMSeverity(severity?: string): 'critical' | 'high' | 'medium' | 'low' | 'info' {
    if (!severity) return 'medium';

    const sev = severity.toLowerCase();
    if (sev === 'critical') return 'critical';
    if (sev === 'high') return 'high';
    if (sev === 'moderate' || sev === 'medium') return 'medium';
    if (sev === 'low') return 'low';
    return 'info';
  }

  /**
   * Extract CWE from ESLint rule ID
   */
  private extractCWE(ruleId?: string): string | undefined {
    if (!ruleId) return undefined;

    // Map ESLint security rules to CWE
    const cweMap: Record<string, string> = {
      'security/detect-eval-with-expression': 'CWE-94',
      'security/detect-unsafe-regex': 'CWE-1333',
      'security/detect-buffer-noassert': 'CWE-119',
      'security/detect-child-process': 'CWE-78',
      'security/detect-non-literal-fs-filename': 'CWE-22',
      'security/detect-non-literal-regexp': 'CWE-185',
      'security/detect-non-literal-require': 'CWE-95',
      'security/detect-object-injection': 'CWE-94',
      'security/detect-possible-timing-attacks': 'CWE-208'
    };

    return cweMap[ruleId];
  }

  /**
   * Get remediation advice for ESLint rules
   */
  private getESLintRemediation(ruleId?: string): string | undefined {
    if (!ruleId) return undefined;

    const remediationMap: Record<string, string> = {
      'security/detect-eval-with-expression': 'Avoid using eval() with user input. Use safer alternatives like JSON.parse() or Function constructor with proper validation.',
      'security/detect-unsafe-regex': 'Refactor regex to avoid catastrophic backtracking. Use tools like safe-regex to validate.',
      'security/detect-buffer-noassert': 'Use assert methods for buffer operations to prevent buffer overflows.',
      'security/detect-child-process': 'Validate and sanitize all inputs to child_process methods. Avoid shell=true.',
      'security/detect-non-literal-fs-filename': 'Validate and sanitize file paths. Use path.join() and check against whitelist.',
      'security/detect-non-literal-regexp': 'Use literal regex patterns instead of constructing from user input.',
      'security/detect-non-literal-require': 'Avoid dynamic require() with user input. Use static imports or whitelist allowed modules.',
      'security/detect-object-injection': 'Validate object keys before dynamic access. Use Map instead of objects for user-controlled keys.',
      'security/detect-possible-timing-attacks': 'Use constant-time comparison functions for sensitive data like passwords or tokens.'
    };

    return remediationMap[ruleId];
  }
}
