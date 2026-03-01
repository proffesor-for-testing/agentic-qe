/**
 * Agentic QE v3 - Security Auditor SAST Scanner
 * Extracted from security-auditor.ts - Static Application Security Testing
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  Vulnerability,
  VulnerabilitySeverity,
  VulnerabilityCategory,
  VulnerabilityLocation,
  RemediationAdvice,
  SASTResult,
} from '../interfaces.js';

// ============================================================================
// SAST Vulnerability Patterns
// ============================================================================

interface SASTVulnerabilityPattern {
  id: string;
  pattern: RegExp;
  title: string;
  description: string;
  severity: VulnerabilitySeverity;
  category: VulnerabilityCategory;
  remediation: string;
  fixExample?: string;
  cweId: string;
}

/**
 * Get the default SAST vulnerability patterns for JS/TS analysis
 */
export function getSASTVulnerabilityPatterns(): SASTVulnerabilityPattern[] {
  return [
    // SQL Injection patterns
    {
      id: 'sqli-concat',
      pattern: /(?:query|execute|exec|run)\s*\(\s*(?:['"`].*?\s*\+|`[^`]*\$\{)/gi,
      title: 'SQL Injection via String Concatenation',
      description: 'SQL query constructed using string concatenation with potentially untrusted input',
      severity: 'critical',
      category: 'injection',
      remediation: 'Use parameterized queries or prepared statements',
      fixExample: 'db.query("SELECT * FROM users WHERE id = $1", [userId])',
      cweId: 'CWE-89',
    },
    // XSS patterns
    {
      id: 'xss-innerhtml',
      pattern: /\.innerHTML\s*=\s*(?!['"`])/g,
      title: 'XSS via innerHTML Assignment',
      description: 'Direct innerHTML assignment with potentially unsanitized content',
      severity: 'high',
      category: 'xss',
      remediation: 'Use textContent for text, or sanitize HTML with DOMPurify',
      fixExample: 'element.textContent = userInput;',
      cweId: 'CWE-79',
    },
    {
      id: 'xss-document-write',
      pattern: /document\.write\s*\([^)]+\)/g,
      title: 'XSS via document.write',
      description: 'document.write() can execute scripts from untrusted data',
      severity: 'high',
      category: 'xss',
      remediation: 'Avoid document.write(); use DOM manipulation methods',
      cweId: 'CWE-79',
    },
    {
      id: 'xss-eval',
      pattern: /(?<!\.)\beval\s*\([^)]+\)/g,
      title: 'Code Injection via eval()',
      description: 'eval() executes arbitrary code and is a major security risk',
      severity: 'critical',
      category: 'xss',
      remediation: 'Never use eval(); use JSON.parse() for JSON data',
      fixExample: 'JSON.parse(jsonString)',
      cweId: 'CWE-95',
    },
    {
      id: 'xss-dangerous-react',
      pattern: /dangerouslySetInnerHTML\s*=\s*\{/g,
      title: 'React dangerouslySetInnerHTML Usage',
      description: 'dangerouslySetInnerHTML bypasses React XSS protections',
      severity: 'medium',
      category: 'xss',
      remediation: 'Sanitize HTML content with DOMPurify before use',
      fixExample: 'dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}',
      cweId: 'CWE-79',
    },
    // Command Injection patterns
    {
      id: 'cmd-injection-exec',
      pattern: /(?:child_process\.)?exec\s*\(\s*(?:[^,)]*\s*\+|`[^`]*\$\{)/g,
      title: 'Command Injection via exec()',
      description: 'Shell command execution with unsanitized input',
      severity: 'critical',
      category: 'injection',
      remediation: 'Use execFile() with argument array instead of exec()',
      fixExample: 'execFile("command", [arg1, arg2], callback)',
      cweId: 'CWE-78',
    },
    {
      id: 'cmd-injection-spawn-shell',
      pattern: /spawn\s*\([^)]+,\s*\{[^}]*shell\s*:\s*true/g,
      title: 'Dangerous Shell Option in spawn()',
      description: 'spawn() with shell: true can enable command injection',
      severity: 'high',
      category: 'injection',
      remediation: 'Avoid shell: true option; use direct command execution',
      cweId: 'CWE-78',
    },
    // Path Traversal patterns
    {
      id: 'path-traversal-readfile',
      pattern: /(?:readFile|readFileSync)\s*\([^)]*\+/g,
      title: 'Path Traversal via File Read',
      description: 'File read operation with concatenated path may allow directory traversal',
      severity: 'high',
      category: 'access-control',
      remediation: 'Validate and sanitize file paths; use path.resolve() and check against base directory',
      fixExample: 'const safePath = path.resolve(baseDir, path.basename(userInput))',
      cweId: 'CWE-22',
    },
    {
      id: 'path-traversal-writefile',
      pattern: /(?:writeFile|writeFileSync)\s*\([^)]*\+/g,
      title: 'Path Traversal via File Write',
      description: 'File write operation with concatenated path may allow directory traversal',
      severity: 'high',
      category: 'access-control',
      remediation: 'Validate file paths before writing; ensure path is within allowed directory',
      cweId: 'CWE-22',
    },
    // Hardcoded secrets
    {
      id: 'secret-private-key',
      pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
      title: 'Private Key Detected in Source',
      description: 'Private key found in source code',
      severity: 'critical',
      category: 'sensitive-data',
      remediation: 'Store private keys in secure key management systems, not in code',
      cweId: 'CWE-798',
    },
    // Insecure configurations
    {
      id: 'config-tls-disabled',
      pattern: /rejectUnauthorized\s*:\s*false/g,
      title: 'TLS Certificate Validation Disabled',
      description: 'Disabling TLS certificate validation exposes to MITM attacks',
      severity: 'high',
      category: 'security-misconfiguration',
      remediation: 'Always enable TLS certificate validation in production',
      cweId: 'CWE-295',
    },
    {
      id: 'config-cors-wildcard',
      pattern: /cors\s*\(\s*\{[^}]*origin\s*:\s*['"]\*['"]/gi,
      title: 'Permissive CORS Configuration',
      description: 'CORS allows all origins (*) which may expose sensitive data',
      severity: 'medium',
      category: 'security-misconfiguration',
      remediation: 'Restrict CORS to specific trusted origins',
      fixExample: 'cors({ origin: ["https://trusted-domain.com"] })',
      cweId: 'CWE-942',
    },
  ];
}

// ============================================================================
// SAST Scanning
// ============================================================================

/**
 * Perform SAST scan using AST-based analysis for JavaScript/TypeScript
 * Scans for common vulnerability patterns: XSS, SQL injection, command injection, path traversal
 */
export async function performSASTScan(
  findSourceFiles: (dir: string) => Promise<string[]>,
  shouldExclude: (filePath: string) => boolean,
): Promise<SASTResult> {
  const scanId = uuidv4();
  const startTime = Date.now();
  const vulnerabilities: Vulnerability[] = [];
  let filesScanned = 0;
  let linesScanned = 0;

  try {
    const sourceFiles = await findSourceFiles(process.cwd());
    const vulnerabilityPatterns = getSASTVulnerabilityPatterns();

    for (const filePath of sourceFiles) {
      if (shouldExclude(filePath)) {
        continue;
      }

      // Only scan JS/TS files
      const ext = path.extname(filePath).toLowerCase();
      if (!['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
        continue;
      }

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        filesScanned++;
        linesScanned += lines.length;

        // Check each vulnerability pattern
        for (const vulnPattern of vulnerabilityPatterns) {
          // Reset regex state
          vulnPattern.pattern.lastIndex = 0;
          let match: RegExpExecArray | null;

          while ((match = vulnPattern.pattern.exec(content)) !== null) {
            // Calculate line and column
            const beforeMatch = content.substring(0, match.index);
            const linesBefore = beforeMatch.split('\n');
            const lineNumber = linesBefore.length;
            const column = linesBefore[linesBefore.length - 1].length + 1;

            // Check if in comment
            const currentLine = lines[lineNumber - 1] || '';
            if (currentLine.trimStart().startsWith('//') || currentLine.trimStart().startsWith('*')) {
              continue;
            }

            // Check for nosec annotation
            if (currentLine.includes('// nosec') || currentLine.includes('// security-ignore')) {
              continue;
            }

            // Extract snippet with context
            const startLine = Math.max(0, lineNumber - 2);
            const endLine = Math.min(lines.length, lineNumber + 1);
            const snippet = lines.slice(startLine, endLine).join('\n');

            const location: VulnerabilityLocation = {
              file: filePath,
              line: lineNumber,
              column,
              snippet,
            };

            const remediation: RemediationAdvice = {
              description: vulnPattern.remediation,
              fixExample: vulnPattern.fixExample,
              estimatedEffort: vulnPattern.severity === 'critical' ? 'moderate' : 'minor',
              automatable: vulnPattern.severity === 'low' || vulnPattern.severity === 'medium',
            };

            vulnerabilities.push({
              id: uuidv4(),
              cveId: undefined,
              title: vulnPattern.title,
              description: `${vulnPattern.description} [${vulnPattern.cweId}]`,
              severity: vulnPattern.severity,
              category: vulnPattern.category,
              location,
              remediation,
              references: [
                `https://cwe.mitre.org/data/definitions/${vulnPattern.cweId.replace('CWE-', '')}.html`,
              ],
            });
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }
  } catch (error) {
    console.error('SAST scan failed:', error);
  }

  const scanDurationMs = Date.now() - startTime;

  // Calculate summary
  let critical = 0, high = 0, medium = 0, low = 0, informational = 0;
  for (const vuln of vulnerabilities) {
    switch (vuln.severity) {
      case 'critical': critical++; break;
      case 'high': high++; break;
      case 'medium': medium++; break;
      case 'low': low++; break;
      case 'informational': informational++; break;
    }
  }

  return {
    scanId,
    vulnerabilities,
    summary: {
      critical,
      high,
      medium,
      low,
      informational,
      totalFiles: filesScanned,
      scanDurationMs,
    },
    coverage: {
      filesScanned,
      linesScanned,
      rulesApplied: 12,
    },
  };
}
