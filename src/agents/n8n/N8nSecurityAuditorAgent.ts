/**
 * N8nSecurityAuditorAgent
 *
 * Security vulnerability scanning for n8n workflows:
 * - Credential exposure detection
 * - Secret scanning in expressions
 * - SQL/NoSQL injection risk analysis
 * - Command injection detection
 * - SSRF detection
 * - OWASP compliance checking
 */

import { N8nBaseAgent, N8nAgentConfig } from './N8nBaseAgent';
import {
  N8nWorkflow,
  N8nNode,
  N8nExecution,
  SecurityAuditResult,
  SecurityFinding,
  SecurityFindingType,
  OWASPComplianceResult,
  N8nSecurityAuditorConfig,
} from './types';
import { QETask, AgentCapability } from '../../types';

export interface SecurityAuditTask extends QETask {
  type: 'security-audit';
  target: string; // workflowId
  options?: {
    checkSecrets?: boolean;
    checkInjection?: boolean;
    checkAuthentication?: boolean;
    checkOWASP?: boolean;
    severityThreshold?: 'critical' | 'high' | 'medium' | 'low';
    executeRuntimeChecks?: boolean;  // Actually run workflows and check for secret leakage
    testInput?: Record<string, unknown>;  // Input for runtime tests
  };
}

// Secret patterns to detect - Extended: 40+ patterns (from ~11)
const SECRET_PATTERNS: Array<{ pattern: RegExp; name: string; severity: 'critical' | 'high'; category?: string }> = [
  // ============================================================================
  // Generic Secrets
  // ============================================================================
  { pattern: /api[_-]?key["\s:=]+["']?[\w-]{20,}/i, name: 'API Key', severity: 'critical', category: 'generic' },
  { pattern: /bearer\s+[\w-]{20,}/i, name: 'Bearer Token', severity: 'critical', category: 'generic' },
  { pattern: /password["\s:=]+["']?[^"'\s]{8,}/i, name: 'Password', severity: 'critical', category: 'generic' },
  { pattern: /secret["\s:=]+["']?[\w-]{20,}/i, name: 'Secret', severity: 'critical', category: 'generic' },
  { pattern: /token["\s:=]+["']?[\w-]{20,}/i, name: 'Token', severity: 'critical', category: 'generic' },
  { pattern: /-----BEGIN.*PRIVATE KEY-----/, name: 'Private Key', severity: 'critical', category: 'crypto' },
  { pattern: /-----BEGIN.*RSA PRIVATE KEY-----/, name: 'RSA Private Key', severity: 'critical', category: 'crypto' },
  { pattern: /-----BEGIN.*EC PRIVATE KEY-----/, name: 'EC Private Key', severity: 'critical', category: 'crypto' },
  { pattern: /-----BEGIN.*OPENSSH PRIVATE KEY-----/, name: 'OpenSSH Private Key', severity: 'critical', category: 'crypto' },
  { pattern: /-----BEGIN.*PGP PRIVATE KEY BLOCK-----/, name: 'PGP Private Key', severity: 'critical', category: 'crypto' },

  // ============================================================================
  // Cloud Providers
  // ============================================================================
  // AWS
  { pattern: /AKIA[0-9A-Z]{16}/i, name: 'AWS Access Key ID', severity: 'critical', category: 'aws' },
  { pattern: /aws[_-]?secret[_-]?access[_-]?key/i, name: 'AWS Secret Key Reference', severity: 'critical', category: 'aws' },
  { pattern: /[a-zA-Z0-9\/+]{40}/, name: 'AWS Secret Access Key (potential)', severity: 'high', category: 'aws' },
  // GCP
  { pattern: /AIza[0-9A-Za-z-_]{35}/, name: 'Google API Key', severity: 'critical', category: 'gcp' },
  { pattern: /[0-9]+-[0-9A-Za-z_]{32}\.apps\.googleusercontent\.com/, name: 'Google OAuth Client ID', severity: 'high', category: 'gcp' },
  { pattern: /"type"\s*:\s*"service_account"/, name: 'GCP Service Account JSON', severity: 'critical', category: 'gcp' },
  // Azure
  { pattern: /[a-zA-Z0-9+\/]{43}=/, name: 'Azure Storage Key (potential)', severity: 'high', category: 'azure' },
  { pattern: /DefaultEndpointsProtocol=https;AccountName=/i, name: 'Azure Connection String', severity: 'critical', category: 'azure' },

  // ============================================================================
  // AI/LLM Providers
  // ============================================================================
  { pattern: /sk-[a-zA-Z0-9]{32,}/, name: 'OpenAI API Key', severity: 'critical', category: 'ai' },
  { pattern: /sk-ant-api[0-9a-zA-Z-]{90,}/, name: 'Anthropic API Key', severity: 'critical', category: 'ai' },
  { pattern: /sk-or-[a-zA-Z0-9-]{40,}/, name: 'OpenRouter API Key', severity: 'critical', category: 'ai' },
  { pattern: /r8_[a-zA-Z0-9]{37}/, name: 'Replicate API Key', severity: 'critical', category: 'ai' },
  { pattern: /hf_[a-zA-Z0-9]{34}/, name: 'Hugging Face Token', severity: 'critical', category: 'ai' },

  // ============================================================================
  // Version Control & CI/CD
  // ============================================================================
  { pattern: /ghp_[a-zA-Z0-9]{36}/, name: 'GitHub Personal Access Token', severity: 'critical', category: 'vcs' },
  { pattern: /gho_[a-zA-Z0-9]{36}/, name: 'GitHub OAuth Token', severity: 'critical', category: 'vcs' },
  { pattern: /ghu_[a-zA-Z0-9]{36}/, name: 'GitHub User Token', severity: 'critical', category: 'vcs' },
  { pattern: /ghs_[a-zA-Z0-9]{36}/, name: 'GitHub Server Token', severity: 'critical', category: 'vcs' },
  { pattern: /github_pat_[a-zA-Z0-9_]{22,}/, name: 'GitHub Fine-grained PAT', severity: 'critical', category: 'vcs' },
  { pattern: /glpat-[a-zA-Z0-9_-]{20}/, name: 'GitLab Personal Access Token', severity: 'critical', category: 'vcs' },
  { pattern: /gloas-[a-zA-Z0-9_-]{20}/, name: 'GitLab OAuth App Secret', severity: 'critical', category: 'vcs' },
  { pattern: /ATBB[a-zA-Z0-9]{24}/, name: 'Bitbucket App Token', severity: 'critical', category: 'vcs' },

  // ============================================================================
  // Communication Platforms
  // ============================================================================
  { pattern: /xox[baprs]-[\w-]+/, name: 'Slack Token', severity: 'critical', category: 'comms' },
  { pattern: /hooks\.slack\.com\/services\/T[a-zA-Z0-9_]+\/B[a-zA-Z0-9_]+\/[a-zA-Z0-9_]+/, name: 'Slack Webhook URL', severity: 'high', category: 'comms' },
  { pattern: /[MN][A-Za-z\d]{23,27}\.[A-Za-z\d_-]{6}\.[A-Za-z\d_-]{27,}/, name: 'Discord Bot Token', severity: 'critical', category: 'comms' },
  { pattern: /discord\.com\/api\/webhooks\/[0-9]+\/[a-zA-Z0-9_-]+/, name: 'Discord Webhook URL', severity: 'high', category: 'comms' },
  { pattern: /[0-9]+:AA[a-zA-Z0-9_-]{33}/, name: 'Telegram Bot Token', severity: 'critical', category: 'comms' },
  { pattern: /EAA[a-zA-Z0-9]+/, name: 'Facebook Access Token', severity: 'critical', category: 'comms' },

  // ============================================================================
  // Payment & Financial
  // ============================================================================
  { pattern: /sk_live_[a-zA-Z0-9]{24,}/, name: 'Stripe Live Secret Key', severity: 'critical', category: 'payments' },
  { pattern: /sk_test_[a-zA-Z0-9]{24,}/, name: 'Stripe Test Secret Key', severity: 'high', category: 'payments' },
  { pattern: /pk_live_[a-zA-Z0-9]{24,}/, name: 'Stripe Live Publishable Key', severity: 'high', category: 'payments' },
  { pattern: /rk_live_[a-zA-Z0-9]{24,}/, name: 'Stripe Live Restricted Key', severity: 'critical', category: 'payments' },
  { pattern: /sq0atp-[a-zA-Z0-9_-]{22}/, name: 'Square Access Token', severity: 'critical', category: 'payments' },
  { pattern: /sq0csp-[a-zA-Z0-9_-]{43}/, name: 'Square OAuth Secret', severity: 'critical', category: 'payments' },
  { pattern: /access_token\$production\$[a-z0-9]{16}\$[a-f0-9]{32}/, name: 'PayPal Access Token', severity: 'critical', category: 'payments' },

  // ============================================================================
  // Database Connection Strings
  // ============================================================================
  { pattern: /mongodb(\+srv)?:\/\/[^:]+:[^@]+@/, name: 'MongoDB Connection String', severity: 'critical', category: 'database' },
  { pattern: /postgres:\/\/[^:]+:[^@]+@/, name: 'PostgreSQL Connection String', severity: 'critical', category: 'database' },
  { pattern: /mysql:\/\/[^:]+:[^@]+@/, name: 'MySQL Connection String', severity: 'critical', category: 'database' },
  { pattern: /redis:\/\/:[^@]+@/, name: 'Redis Connection String', severity: 'critical', category: 'database' },

  // ============================================================================
  // Email & SMS Providers
  // ============================================================================
  { pattern: /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/, name: 'SendGrid API Key', severity: 'critical', category: 'email' },
  { pattern: /key-[a-f0-9]{32}/, name: 'Mailgun API Key', severity: 'critical', category: 'email' },
  { pattern: /AC[a-f0-9]{32}/, name: 'Twilio Account SID', severity: 'high', category: 'sms' },
  { pattern: /SK[a-f0-9]{32}/, name: 'Twilio API Key', severity: 'critical', category: 'sms' },
];

// Injection patterns to detect - Extended: 20+ patterns (from ~4)
const INJECTION_PATTERNS: Array<{
  pattern: RegExp;
  name: string;
  type: SecurityFindingType;
  severity: 'critical' | 'high' | 'medium';
  cwe?: string;
}> = [
  // ============================================================================
  // SQL Injection Patterns
  // ============================================================================
  {
    pattern: /'?\s*\+\s*\$json\./,
    name: 'SQL String Concatenation',
    type: 'sql_injection',
    severity: 'high',
    cwe: 'CWE-89',
  },
  {
    pattern: /'\{\{\s*\$json\.[^}]+\}\}'/,
    name: 'SQL Injection via Expression',
    type: 'sql_injection',
    severity: 'high',
    cwe: 'CWE-89',
  },
  {
    pattern: /SELECT\s+.*\s+FROM\s+.*\s+WHERE\s+.*\{\{/i,
    name: 'Dynamic SQL WHERE clause',
    type: 'sql_injection',
    severity: 'high',
    cwe: 'CWE-89',
  },
  {
    pattern: /INSERT\s+INTO\s+.*VALUES\s*\(.*\{\{/i,
    name: 'Dynamic SQL INSERT values',
    type: 'sql_injection',
    severity: 'high',
    cwe: 'CWE-89',
  },
  {
    pattern: /UPDATE\s+.*SET\s+.*=\s*.*\{\{/i,
    name: 'Dynamic SQL UPDATE values',
    type: 'sql_injection',
    severity: 'high',
    cwe: 'CWE-89',
  },
  {
    pattern: /ORDER\s+BY\s+\{\{/i,
    name: 'Dynamic SQL ORDER BY',
    type: 'sql_injection',
    severity: 'medium',
    cwe: 'CWE-89',
  },

  // ============================================================================
  // NoSQL Injection Patterns
  // ============================================================================
  {
    pattern: /\$where\s*:\s*.*\{\{/,
    name: 'MongoDB $where injection',
    type: 'sql_injection',
    severity: 'critical',
    cwe: 'CWE-943',
  },
  {
    pattern: /\$regex\s*:\s*.*\{\{/,
    name: 'MongoDB $regex injection',
    type: 'sql_injection',
    severity: 'high',
    cwe: 'CWE-943',
  },
  {
    pattern: /\{\s*"\$[a-z]+"\s*:\s*\{\{/i,
    name: 'MongoDB operator injection',
    type: 'sql_injection',
    severity: 'high',
    cwe: 'CWE-943',
  },

  // ============================================================================
  // Command Injection Patterns
  // ============================================================================
  {
    pattern: /\$\{?\$json\.[^}]*\}?\s*[;&|`]/,
    name: 'Shell Metacharacter Injection',
    type: 'command_injection',
    severity: 'critical',
    cwe: 'CWE-78',
  },
  {
    pattern: /\{\{\s*\$json\..*\}\}\s*[;&|`$]/,
    name: 'Command Chaining via Expression',
    type: 'command_injection',
    severity: 'critical',
    cwe: 'CWE-78',
  },
  {
    pattern: /eval\s*\(\s*\{\{/,
    name: 'Dynamic Code Evaluation',
    type: 'command_injection',
    severity: 'critical',
    cwe: 'CWE-95',
  },
  {
    pattern: /exec\s*\(\s*["'].*\{\{/,
    name: 'exec() with user input',
    type: 'command_injection',
    severity: 'critical',
    cwe: 'CWE-78',
  },
  {
    pattern: /child_process.*spawn.*\{\{/,
    name: 'Child process with user input',
    type: 'command_injection',
    severity: 'critical',
    cwe: 'CWE-78',
  },

  // ============================================================================
  // XSS Patterns
  // ============================================================================
  {
    pattern: /\{\{\s*\$json\.[^}]+\}\}/,
    name: 'Unescaped Template Expression',
    type: 'xss',
    severity: 'medium',
    cwe: 'CWE-79',
  },
  {
    pattern: /<script[^>]*>.*\{\{/i,
    name: 'Script Tag with Expression',
    type: 'xss',
    severity: 'critical',
    cwe: 'CWE-79',
  },
  {
    pattern: /on\w+\s*=\s*["'][^"']*\{\{/i,
    name: 'Event Handler with Expression',
    type: 'xss',
    severity: 'high',
    cwe: 'CWE-79',
  },
  {
    pattern: /javascript\s*:\s*.*\{\{/i,
    name: 'javascript: URI with Expression',
    type: 'xss',
    severity: 'high',
    cwe: 'CWE-79',
  },
  {
    pattern: /innerHTML\s*=\s*.*\{\{/,
    name: 'innerHTML with Expression',
    type: 'xss',
    severity: 'high',
    cwe: 'CWE-79',
  },

  // ============================================================================
  // Path Traversal Patterns
  // ============================================================================
  {
    pattern: /\.\.\/.*\{\{/,
    name: 'Path Traversal via Expression',
    type: 'ssrf',
    severity: 'high',
    cwe: 'CWE-22',
  },
  {
    pattern: /file:\/\/.*\{\{/,
    name: 'Local File Access via Expression',
    type: 'ssrf',
    severity: 'critical',
    cwe: 'CWE-22',
  },
  {
    pattern: /\{\{\s*\$json\..*\}\}.*\.(txt|log|json|xml|csv|yml|yaml|env|config)/i,
    name: 'Dynamic File Extension',
    type: 'ssrf',
    severity: 'medium',
    cwe: 'CWE-22',
  },

  // ============================================================================
  // SSRF Patterns
  // ============================================================================
  {
    pattern: /https?:\/\/\{\{/,
    name: 'Full URL from User Input',
    type: 'ssrf',
    severity: 'high',
    cwe: 'CWE-918',
  },
  {
    pattern: /https?:\/\/[^/]*\{\{\s*\$json/,
    name: 'Dynamic Host in URL',
    type: 'ssrf',
    severity: 'critical',
    cwe: 'CWE-918',
  },
  {
    pattern: /localhost|127\.0\.0\.1|0\.0\.0\.0|::1/,
    name: 'Internal IP Reference',
    type: 'ssrf',
    severity: 'medium',
    cwe: 'CWE-918',
  },
  {
    pattern: /169\.254\.169\.254/,
    name: 'AWS Metadata URL',
    type: 'ssrf',
    severity: 'critical',
    cwe: 'CWE-918',
  },

  // ============================================================================
  // XML/XXE Patterns
  // ============================================================================
  {
    pattern: /<!ENTITY\s+/i,
    name: 'XML Entity Declaration',
    type: 'xss',
    severity: 'high',
    cwe: 'CWE-611',
  },
  {
    pattern: /<!DOCTYPE\s+.*\[/i,
    name: 'XML DOCTYPE with DTD',
    type: 'xss',
    severity: 'medium',
    cwe: 'CWE-611',
  },
  {
    pattern: /SYSTEM\s+["']file:\/\//i,
    name: 'XXE Local File Inclusion',
    type: 'xss',
    severity: 'critical',
    cwe: 'CWE-611',
  },
];

export class N8nSecurityAuditorAgent extends N8nBaseAgent {
  private readonly securityConfig: N8nSecurityAuditorConfig;

  constructor(config: N8nAgentConfig & Partial<N8nSecurityAuditorConfig>) {
    const capabilities: AgentCapability[] = [
      {
        name: 'secret-scanning',
        version: '1.0.0',
        description: 'Detect exposed secrets and credentials',
        parameters: {},
      },
      {
        name: 'injection-detection',
        version: '1.0.0',
        description: 'Detect SQL, command, and other injection risks',
        parameters: {},
      },
      {
        name: 'authentication-audit',
        version: '1.0.0',
        description: 'Audit authentication configurations',
        parameters: {},
      },
      {
        name: 'owasp-compliance',
        version: '1.0.0',
        description: 'Check OWASP Top 10 compliance',
        parameters: {},
      },
    ];

    super({
      ...config,
      type: 'n8n-security-auditor' as any,
      capabilities: [...capabilities, ...(config.capabilities || [])],
    });

    this.securityConfig = {
      n8nConfig: config.n8nConfig,
      secretPatterns: config.secretPatterns || SECRET_PATTERNS.map(p => p.pattern),
      owaspChecks: config.owaspChecks || [
        'A01', 'A02', 'A03', 'A04', 'A05',
        'A06', 'A07', 'A08', 'A09', 'A10',
      ],
      severityThreshold: config.severityThreshold || 'low',
    };
  }

  protected async performTask(task: QETask): Promise<SecurityAuditResult> {
    const securityTask = task as SecurityAuditTask;

    if (securityTask.type !== 'security-audit') {
      throw new Error(`Unsupported task type: ${securityTask.type}`);
    }

    return this.auditWorkflow(securityTask.target, securityTask.options);
  }

  /**
   * Perform full security audit on workflow
   *
   * PRODUCTION DEFAULT: Runtime checks are ENABLED by default.
   * This ensures actual secret leakage detection, not just static analysis.
   * Set executeRuntimeChecks: false to disable if workflow cannot be executed.
   */
  async auditWorkflow(
    workflowId: string,
    options?: SecurityAuditTask['options']
  ): Promise<SecurityAuditResult> {
    const workflow = await this.getWorkflow(workflowId);
    const findings: SecurityFinding[] = [];

    // Secret scanning (static analysis)
    if (options?.checkSecrets !== false) {
      findings.push(...this.scanForSecrets(workflow));
    }

    // Injection detection (static analysis)
    if (options?.checkInjection !== false) {
      findings.push(...this.detectInjectionRisks(workflow));
    }

    // Authentication audit (static analysis)
    if (options?.checkAuthentication !== false) {
      findings.push(...this.auditAuthentication(workflow));
    }

    // Runtime secret leakage detection - ENABLED BY DEFAULT
    // This is critical for production - static analysis alone misses runtime leaks
    // Set executeRuntimeChecks: false explicitly to skip
    if (options?.executeRuntimeChecks !== false) {
      try {
        const runtimeFindings = await this.detectRuntimeSecretLeakage(
          workflowId,
          options?.testInput
        );
        findings.push(...runtimeFindings);
      } catch (error) {
        // If runtime execution fails, emit warning but continue with static results
        this.emitEvent('security.runtime.skipped', {
          workflowId,
          reason: error instanceof Error ? error.message : 'Runtime execution failed',
          note: 'Static analysis completed, but runtime leakage detection was skipped',
        }, 'low');
      }
    }

    // OWASP compliance
    let owaspCompliance: OWASPComplianceResult;
    if (options?.checkOWASP !== false) {
      owaspCompliance = this.checkOWASPCompliance(workflow, findings);
    } else {
      owaspCompliance = { score: 0, categories: {} };
    }

    // Calculate risk score
    const riskScore = this.calculateRiskScore(findings);

    // Filter by severity threshold if specified
    const filteredFindings = options?.severityThreshold
      ? this.filterBySeverity(findings, options.severityThreshold)
      : findings;

    const result: SecurityAuditResult = {
      workflowId,
      workflowName: workflow.name,
      auditDate: new Date().toISOString(),
      riskScore,
      findings: filteredFindings,
      owaspCompliance,
      summary: {
        critical: findings.filter(f => f.severity === 'critical').length,
        high: findings.filter(f => f.severity === 'high').length,
        medium: findings.filter(f => f.severity === 'medium').length,
        low: findings.filter(f => f.severity === 'low').length,
        info: findings.filter(f => f.severity === 'info').length,
      },
    };

    // Store result
    await this.storeTestResult(`security-audit:${workflowId}`, result);

    // Emit events for critical findings
    if (result.summary.critical > 0) {
      this.emitEvent('security.finding.critical', {
        workflowId,
        count: result.summary.critical,
        findings: findings.filter(f => f.severity === 'critical'),
      }, 'critical');
    }

    // Emit completion event
    this.emitEvent('security.audit.completed', {
      workflowId,
      riskScore,
      findingsCount: findings.length,
    });

    return result;
  }

  /**
   * Scan workflow for exposed secrets
   */
  private scanForSecrets(workflow: N8nWorkflow): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    let findingId = 1;

    for (const node of workflow.nodes) {
      const nodeJson = JSON.stringify(node.parameters);

      for (const secretPattern of SECRET_PATTERNS) {
        if (secretPattern.pattern.test(nodeJson)) {
          findings.push({
            id: `SEC-${String(findingId++).padStart(3, '0')}`,
            type: 'hardcoded_secret',
            severity: secretPattern.severity,
            node: node.name,
            message: `${secretPattern.name} detected in node parameters`,
            details: `Found pattern matching ${secretPattern.name}. Hardcoded secrets should be moved to n8n credentials.`,
            remediation: 'Move the secret to n8n credential store and reference it via credentials configuration.',
            owaspCategory: 'A02',
            cwe: 'CWE-798',
          });
        }
      }
    }

    return findings;
  }

  /**
   * Detect injection vulnerabilities
   */
  private detectInjectionRisks(workflow: N8nWorkflow): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    let findingId = 100;

    for (const node of workflow.nodes) {
      // Check SQL nodes
      if (node.type.includes('postgres') || node.type.includes('mysql') || node.type.includes('mssql')) {
        const query = node.parameters.query as string;
        if (query) {
          for (const pattern of INJECTION_PATTERNS.filter(p => p.type === 'sql_injection')) {
            if (pattern.pattern.test(query)) {
              findings.push({
                id: `SEC-${String(findingId++).padStart(3, '0')}`,
                type: 'sql_injection',
                severity: pattern.severity,
                node: node.name,
                message: `SQL injection vulnerability: ${pattern.name}`,
                details: `Query uses string interpolation with user input. Attack vector: ${this.getSQLAttackVector(query)}`,
                remediation: 'Use parameterized queries instead of string concatenation.',
                owaspCategory: 'A03',
                cwe: 'CWE-89',
              });
            }
          }
        }
      }

      // Check Execute Command nodes
      if (node.type === 'n8n-nodes-base.executeCommand') {
        const command = node.parameters.command as string;
        if (command) {
          if (/\{\{\s*\$json\./.test(command)) {
            findings.push({
              id: `SEC-${String(findingId++).padStart(3, '0')}`,
              type: 'command_injection',
              severity: 'critical',
              node: node.name,
              message: 'Command injection vulnerability',
              details: `Command includes user-controlled input. Attack vector: User input could contain shell metacharacters.`,
              remediation: 'Avoid using Execute Command with user input. If necessary, sanitize and escape all input.',
              owaspCategory: 'A03',
              cwe: 'CWE-78',
            });
          }
        }
      }

      // Check HTTP Request nodes for SSRF
      if (node.type === 'n8n-nodes-base.httpRequest') {
        const url = node.parameters.url as string;
        if (url && /\{\{\s*\$json\./.test(url)) {
          findings.push({
            id: `SEC-${String(findingId++).padStart(3, '0')}`,
            type: 'ssrf',
            severity: 'high',
            node: node.name,
            message: 'Potential SSRF vulnerability',
            details: 'URL is constructed from user input, allowing potential Server-Side Request Forgery.',
            remediation: 'Validate and whitelist allowed URLs. Do not allow user input to control request destination.',
            owaspCategory: 'A10',
            cwe: 'CWE-918',
          });
        }

        // Check for insecure HTTP
        if (url && url.startsWith('http://') && !url.includes('localhost') && !url.includes('127.0.0.1')) {
          findings.push({
            id: `SEC-${String(findingId++).padStart(3, '0')}`,
            type: 'insecure_http',
            severity: 'medium',
            node: node.name,
            message: 'Insecure HTTP connection',
            details: `URL uses HTTP instead of HTTPS: ${url}`,
            remediation: 'Use HTTPS for all external API calls.',
            owaspCategory: 'A02',
            cwe: 'CWE-319',
          });
        }
      }
    }

    return findings;
  }

  /**
   * Audit authentication configurations
   */
  private auditAuthentication(workflow: N8nWorkflow): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    let findingId = 200;

    for (const node of workflow.nodes) {
      // Check webhook authentication
      if (node.type.includes('webhook')) {
        const auth = node.parameters.authentication as string;
        if (!auth || auth === 'none') {
          findings.push({
            id: `SEC-${String(findingId++).padStart(3, '0')}`,
            type: 'unauthenticated_webhook',
            severity: 'high',
            node: node.name,
            message: 'Webhook has no authentication',
            details: 'Anyone can trigger this webhook without credentials.',
            remediation: 'Configure header authentication, basic auth, or JWT validation.',
            owaspCategory: 'A01',
            cwe: 'CWE-306',
          });
        }
      }

      // Check for basic auth over HTTP
      if (node.type === 'n8n-nodes-base.httpRequest') {
        const url = node.parameters.url as string;
        const auth = node.parameters.authentication as string;
        if (url?.startsWith('http://') && auth === 'basicAuth') {
          findings.push({
            id: `SEC-${String(findingId++).padStart(3, '0')}`,
            type: 'weak_auth',
            severity: 'high',
            node: node.name,
            message: 'Basic auth over insecure connection',
            details: 'Basic authentication credentials sent over unencrypted HTTP.',
            remediation: 'Use HTTPS when using basic authentication.',
            owaspCategory: 'A02',
            cwe: 'CWE-523',
          });
        }
      }
    }

    return findings;
  }

  /**
   * Check OWASP Top 10 compliance
   */
  private checkOWASPCompliance(
    workflow: N8nWorkflow,
    findings: SecurityFinding[]
  ): OWASPComplianceResult {
    const categories: OWASPComplianceResult['categories'] = {
      'A01_Broken_Access_Control': { status: 'pass', findings: 0 },
      'A02_Cryptographic_Failures': { status: 'pass', findings: 0 },
      'A03_Injection': { status: 'pass', findings: 0 },
      'A04_Insecure_Design': { status: 'pass', findings: 0 },
      'A05_Security_Misconfiguration': { status: 'pass', findings: 0 },
      'A06_Vulnerable_Components': { status: 'pass', findings: 0 },
      'A07_Auth_Failures': { status: 'pass', findings: 0 },
      'A08_Data_Integrity_Failures': { status: 'pass', findings: 0 },
      'A09_Logging_Monitoring_Failures': { status: 'pass', findings: 0 },
      'A10_SSRF': { status: 'pass', findings: 0 },
    };

    // Map findings to OWASP categories
    const owaspMapping: Record<string, string> = {
      'A01': 'A01_Broken_Access_Control',
      'A02': 'A02_Cryptographic_Failures',
      'A03': 'A03_Injection',
      'A04': 'A04_Insecure_Design',
      'A05': 'A05_Security_Misconfiguration',
      'A06': 'A06_Vulnerable_Components',
      'A07': 'A07_Auth_Failures',
      'A08': 'A08_Data_Integrity_Failures',
      'A09': 'A09_Logging_Monitoring_Failures',
      'A10': 'A10_SSRF',
    };

    for (const finding of findings) {
      if (finding.owaspCategory && owaspMapping[finding.owaspCategory]) {
        const category = owaspMapping[finding.owaspCategory];
        categories[category].findings++;
        if (finding.severity === 'critical' || finding.severity === 'high') {
          categories[category].status = 'fail';
        } else if (categories[category].status !== 'fail') {
          categories[category].status = 'warn';
        }
      }
    }

    // Calculate compliance score
    const totalCategories = Object.keys(categories).length;
    const passedCategories = Object.values(categories).filter(c => c.status === 'pass').length;
    const score = Math.round((passedCategories / totalCategories) * 100);

    return { score, categories };
  }

  /**
   * Calculate overall risk score
   */
  private calculateRiskScore(findings: SecurityFinding[]): number {
    const weights = { critical: 25, high: 15, medium: 8, low: 3, info: 1 };

    let totalPenalty = 0;
    for (const finding of findings) {
      totalPenalty += weights[finding.severity] || 0;
    }

    // Cap at 100
    return Math.max(0, 100 - Math.min(totalPenalty, 100));
  }

  /**
   * Filter findings by severity threshold
   */
  private filterBySeverity(
    findings: SecurityFinding[],
    threshold: 'critical' | 'high' | 'medium' | 'low'
  ): SecurityFinding[] {
    const severityOrder = ['info', 'low', 'medium', 'high', 'critical'];
    const thresholdIndex = severityOrder.indexOf(threshold);

    return findings.filter(f => {
      const findingIndex = severityOrder.indexOf(f.severity);
      return findingIndex >= thresholdIndex;
    });
  }

  /**
   * Get example SQL attack vector
   */
  private getSQLAttackVector(query: string): string {
    if (query.includes("'{{")) {
      return "Input: ' OR '1'='1' -- would bypass authentication";
    }
    if (query.includes('" + $json')) {
      return "Input containing SQL metacharacters could modify query logic";
    }
    return "User input could manipulate SQL query structure";
  }

  /**
   * Quick security check (just critical and high issues)
   */
  async quickCheck(workflowId: string): Promise<{
    secure: boolean;
    criticalIssues: number;
    highIssues: number;
    topIssue: string | null;
  }> {
    const result = await this.auditWorkflow(workflowId, {
      severityThreshold: 'high',
    });

    return {
      secure: result.summary.critical === 0 && result.summary.high === 0,
      criticalIssues: result.summary.critical,
      highIssues: result.summary.high,
      topIssue: result.findings[0]?.message || null,
    };
  }

  /**
   * Detect secret leakage at runtime by executing workflow and scanning output
   * This catches secrets that are exposed through execution data, logs, or responses
   */
  private async detectRuntimeSecretLeakage(
    workflowId: string,
    testInput?: Record<string, unknown>
  ): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];
    let findingId = 300;

    try {
      // Execute workflow with test input
      const execution = await this.executeWorkflow(workflowId, testInput || {}, {
        waitForCompletion: true,
        timeout: 30000,
      });

      // Wait for completion
      const completedExecution = await this.waitForExecution(execution.id, 30000);

      // Scan all execution output for secrets
      const outputData = JSON.stringify(completedExecution.data || {});

      for (const secretPattern of SECRET_PATTERNS) {
        if (secretPattern.pattern.test(outputData)) {
          // Find which node leaked the secret
          const leakingNode = this.findLeakingNode(completedExecution, secretPattern.pattern);

          findings.push({
            id: `SEC-${String(findingId++).padStart(3, '0')}`,
            type: 'secret_leakage',
            severity: 'critical',
            node: leakingNode || 'unknown',
            message: `Runtime secret leakage detected: ${secretPattern.name}`,
            details: `Secret of type "${secretPattern.name}" was found in workflow execution output. This may expose sensitive data to downstream systems or logs.`,
            remediation: 'Ensure secrets are never passed through workflow data. Use n8n credentials and reference them directly in nodes.',
            owaspCategory: 'A02',
            cwe: 'CWE-200',
          });
        }
      }

      // Check for PII in output (email, phone, SSN patterns)
      const piiPatterns = [
        { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, name: 'Email Address' },
        { pattern: /\b\d{3}-\d{2}-\d{4}\b/, name: 'SSN' },
        { pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/, name: 'Phone Number' },
        { pattern: /\b\d{16}\b/, name: 'Credit Card Number' },
      ];

      for (const pii of piiPatterns) {
        if (pii.pattern.test(outputData)) {
          findings.push({
            id: `SEC-${String(findingId++).padStart(3, '0')}`,
            type: 'pii_exposure',
            severity: 'high',
            node: 'workflow_output',
            message: `PII detected in execution output: ${pii.name}`,
            details: `Sensitive PII (${pii.name}) was found in workflow execution data.`,
            remediation: 'Mask or redact PII before passing through workflow. Use data transformation nodes.',
            owaspCategory: 'A02',
            cwe: 'CWE-359',
          });
        }
      }

      // Check for secrets in error messages
      const errorData = completedExecution.data?.resultData?.error;
      if (errorData) {
        const errorStr = JSON.stringify(errorData);
        for (const secretPattern of SECRET_PATTERNS.slice(0, 10)) { // Check top patterns
          if (secretPattern.pattern.test(errorStr)) {
            findings.push({
              id: `SEC-${String(findingId++).padStart(3, '0')}`,
              type: 'secret_in_error',
              severity: 'critical',
              node: errorData.node || 'unknown',
              message: `Secret exposed in error message: ${secretPattern.name}`,
              details: 'Secrets should never appear in error messages as they may be logged or displayed.',
              remediation: 'Catch errors and sanitize messages before propagation.',
              owaspCategory: 'A02',
              cwe: 'CWE-209',
            });
          }
        }
      }
    } catch (error) {
      // Log but don't fail the entire audit
      console.error('Runtime security check failed:', error);
    }

    return findings;
  }

  /**
   * Find which node is leaking the secret
   */
  private findLeakingNode(
    execution: N8nExecution,
    pattern: RegExp
  ): string | null {
    const runData = execution.data?.resultData?.runData;
    if (!runData) return null;

    for (const [nodeName, nodeRuns] of Object.entries(runData)) {
      for (const run of nodeRuns) {
        const nodeOutput = JSON.stringify(run.data || {});
        if (pattern.test(nodeOutput)) {
          return nodeName;
        }
      }
    }

    return null;
  }

  /**
   * Wait for workflow execution to complete
   */
  private async waitForExecution(
    executionId: string,
    timeoutMs: number
  ): Promise<N8nExecution> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const execution = await this.getExecution(executionId);

      if (execution.status !== 'running' && execution.status !== 'waiting') {
        return execution;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    throw new Error(`Execution ${executionId} timed out after ${timeoutMs}ms`);
  }
}
