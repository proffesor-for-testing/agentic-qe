/**
 * N8n Secrets Hygiene Auditor Agent
 *
 * Audits workflows for credential hygiene and secret management:
 * - Credential scoping validation (least privilege)
 * - Masked field detection and verification
 * - Secret leakage into logs/outputs detection
 * - Environment separation validation (dev/staging/prod)
 * - Hardcoded secrets detection
 * - Credential rotation compliance
 * - Access pattern analysis
 */

import { N8nBaseAgent, N8nAgentConfig } from './N8nBaseAgent';
import { N8nWorkflow, N8nNode } from './types';
import { QETask, AgentCapability } from '../../types';

/**
 * Secret hygiene issue severity
 */
export type SecretHygieneIssueSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * Types of secret hygiene issues
 */
export type SecretHygieneIssueType =
  | 'hardcoded-secret'
  | 'excessive-scope'
  | 'unmasked-field'
  | 'log-leakage'
  | 'output-exposure'
  | 'env-mismatch'
  | 'rotation-overdue'
  | 'shared-credential'
  | 'weak-credential'
  | 'missing-encryption'
  | 'insecure-storage'
  | 'credential-in-url'
  | 'bearer-token-exposure'
  | 'api-key-in-query';

/**
 * Credential scope analysis
 */
export interface CredentialScopeAnalysis {
  credentialId: string;
  credentialName: string;
  credentialType: string;
  usedByNodes: string[];
  scopeLevel: 'workflow' | 'project' | 'organization' | 'global';
  isOverscoped: boolean;
  requiredPermissions: string[];
  actualPermissions: string[];
  recommendations: string[];
}

/**
 * Masked field analysis
 */
export interface MaskedFieldAnalysis {
  nodeId: string;
  nodeName: string;
  sensitiveFields: SensitiveFieldInfo[];
  unmaskedFields: string[];
  maskingStatus: 'complete' | 'partial' | 'none';
  recommendations: string[];
}

export interface SensitiveFieldInfo {
  fieldName: string;
  fieldPath: string;
  isMasked: boolean;
  exposureRisk: 'high' | 'medium' | 'low';
  detectionMethod: 'pattern' | 'naming' | 'context';
}

/**
 * Log leakage analysis
 */
export interface LogLeakageAnalysis {
  nodeId: string;
  nodeName: string;
  hasLogging: boolean;
  loggingNodes: string[];
  potentialLeaks: PotentialLeak[];
  recommendations: string[];
}

export interface PotentialLeak {
  fieldPath: string;
  leakType: 'log' | 'error' | 'debug' | 'output';
  severity: SecretHygieneIssueSeverity;
  description: string;
}

/**
 * Environment separation analysis
 */
export interface EnvironmentAnalysis {
  detectedEnvironment: 'development' | 'staging' | 'production' | 'unknown';
  environmentIndicators: EnvironmentIndicator[];
  crossEnvironmentRisks: CrossEnvironmentRisk[];
  recommendations: string[];
}

export interface EnvironmentIndicator {
  source: string;
  indicator: string;
  suggestedEnvironment: string;
  confidence: number;
}

export interface CrossEnvironmentRisk {
  type: string;
  description: string;
  severity: SecretHygieneIssueSeverity;
  affectedResources: string[];
}

/**
 * Hardcoded secret finding
 */
export interface HardcodedSecretFinding {
  nodeId: string;
  nodeName: string;
  fieldPath: string;
  secretType: string;
  severity: SecretHygieneIssueSeverity;
  partialValue: string; // First/last chars only
  recommendation: string;
}

/**
 * Credential access analysis
 */
export interface CredentialAccessAnalysis {
  credentialId: string;
  credentialName: string;
  accessFrequency: 'high' | 'medium' | 'low';
  lastRotated?: string;
  rotationStatus: 'compliant' | 'due' | 'overdue' | 'unknown';
  accessingWorkflows: string[];
  recommendations: string[];
}

/**
 * Entropy bucket for distribution analysis
 */
export interface EntropyBucket {
  range: string;
  count: number;
  percentage: number;
}

/**
 * Secrets hygiene audit result
 */
export interface SecretsHygieneAuditResult {
  workflowId: string;
  workflowName: string;
  overallScore: number;
  overallRisk: SecretHygieneIssueSeverity;
  credentialScopes: CredentialScopeAnalysis[];
  maskedFields: MaskedFieldAnalysis[];
  logLeakage: LogLeakageAnalysis[];
  environment: EnvironmentAnalysis;
  hardcodedSecrets: HardcodedSecretFinding[];
  credentialAccess: CredentialAccessAnalysis[];
  issues: SecretHygieneIssue[];
  recommendations: string[];
  auditDuration: number;
  // NEW: Entropy analysis result
  entropyAnalysis?: EntropyAnalysisResult;
}

export interface SecretHygieneIssue {
  id: string;
  type: SecretHygieneIssueType;
  severity: SecretHygieneIssueSeverity;
  nodeId?: string;
  nodeName?: string;
  description: string;
  remediation: string;
  cweId?: string; // Common Weakness Enumeration
}

/**
 * Secrets hygiene audit task
 */
export interface SecretsHygieneAuditTask extends QETask {
  type: 'secrets-hygiene-audit';
  target: string; // workflowId
  workflow?: N8nWorkflow;
  options?: {
    checkScoping?: boolean;
    checkMasking?: boolean;
    checkLogLeakage?: boolean;
    checkEnvironment?: boolean;
    checkHardcoded?: boolean;
    rotationPolicyDays?: number;
    targetEnvironment?: 'development' | 'staging' | 'production';
    // NEW: Entropy-based detection
    runEntropyAnalysis?: boolean; // Scan for high-entropy strings
    entropyThreshold?: number; // Min entropy to flag (default: 4.5)
    minSecretLength?: number; // Min length for entropy scan (default: 16)
  };
}

/**
 * Entropy analysis result for detecting high-entropy secrets
 */
export interface EntropyAnalysisResult {
  totalStringsScanned: number;
  highEntropyFindings: HighEntropyFinding[];
  entropyDistribution: EntropyBucket[];
  recommendations: string[];
}

/**
 * A high-entropy string that may be a secret
 */
export interface HighEntropyFinding {
  nodeId: string;
  nodeName: string;
  fieldPath: string;
  entropy: number;
  entropyRating: 'very-high' | 'high' | 'moderate';
  length: number;
  charsetAnalysis: CharsetAnalysis;
  likelySecretType: string;
  confidence: number;
  partialValue: string;
  recommendation: string;
}

/**
 * Character set analysis for a string
 */
export interface CharsetAnalysis {
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasDigits: boolean;
  hasSpecial: boolean;
  charsetSize: number;
  isBase64Like: boolean;
  isHexLike: boolean;
}

// Sensitive field patterns by name
const SENSITIVE_FIELD_PATTERNS = [
  // Authentication
  /password/i,
  /passwd/i,
  /pwd/i,
  /secret/i,
  /token/i,
  /apikey/i,
  /api[_-]?key/i,
  /auth/i,
  /credential/i,
  /bearer/i,
  /jwt/i,
  /oauth/i,

  // Keys and certificates
  /private[_-]?key/i,
  /ssh[_-]?key/i,
  /pem/i,
  /certificate/i,
  /cert/i,
  /ssl/i,
  /tls/i,

  // Database
  /connection[_-]?string/i,
  /db[_-]?pass/i,
  /database[_-]?password/i,

  // Cloud providers
  /aws[_-]?access/i,
  /aws[_-]?secret/i,
  /azure[_-]?key/i,
  /gcp[_-]?key/i,

  // Payment
  /card[_-]?number/i,
  /cvv/i,
  /cvc/i,
  /stripe/i,
  /merchant/i,

  // Personal data
  /ssn/i,
  /social[_-]?security/i,
];

// Hardcoded secret patterns
const HARDCODED_SECRET_PATTERNS = [
  // API Keys
  { pattern: /sk[_-]live[_-][a-zA-Z0-9]{24,}/g, type: 'Stripe Secret Key', severity: 'critical' as const },
  { pattern: /sk[_-]test[_-][a-zA-Z0-9]{24,}/g, type: 'Stripe Test Key', severity: 'high' as const },
  { pattern: /pk[_-]live[_-][a-zA-Z0-9]{24,}/g, type: 'Stripe Publishable Key', severity: 'medium' as const },
  { pattern: /xoxb-[0-9]{10,}-[0-9]{10,}-[a-zA-Z0-9]{24}/g, type: 'Slack Bot Token', severity: 'critical' as const },
  { pattern: /xoxp-[0-9]{10,}-[0-9]{10,}-[0-9]{10,}-[a-f0-9]{32}/g, type: 'Slack User Token', severity: 'critical' as const },
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, type: 'GitHub Personal Token', severity: 'critical' as const },
  { pattern: /gho_[a-zA-Z0-9]{36}/g, type: 'GitHub OAuth Token', severity: 'critical' as const },
  { pattern: /ghu_[a-zA-Z0-9]{36}/g, type: 'GitHub User Token', severity: 'critical' as const },
  { pattern: /AKIA[0-9A-Z]{16}/g, type: 'AWS Access Key ID', severity: 'critical' as const },
  { pattern: /[a-zA-Z0-9\/+=]{40}/g, type: 'Potential AWS Secret Key', severity: 'high' as const },
  { pattern: /AIza[0-9A-Za-z_-]{35}/g, type: 'Google API Key', severity: 'high' as const },
  { pattern: /ya29\.[0-9A-Za-z_-]+/g, type: 'Google OAuth Token', severity: 'high' as const },

  // JWT and Bearer tokens
  { pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, type: 'JWT Token', severity: 'high' as const },
  { pattern: /bearer\s+[a-zA-Z0-9_-]{20,}/gi, type: 'Bearer Token', severity: 'high' as const },

  // Passwords and generic secrets
  { pattern: /password["\s:=]+["']?[a-zA-Z0-9!@#$%^&*()_+]{8,}["']?/gi, type: 'Hardcoded Password', severity: 'critical' as const },
  { pattern: /secret["\s:=]+["']?[a-zA-Z0-9!@#$%^&*()_+]{16,}["']?/gi, type: 'Hardcoded Secret', severity: 'critical' as const },

  // Connection strings
  { pattern: /mongodb(\+srv)?:\/\/[^:\s]+:[^@\s]+@/gi, type: 'MongoDB Connection String', severity: 'critical' as const },
  { pattern: /postgres(ql)?:\/\/[^:\s]+:[^@\s]+@/gi, type: 'PostgreSQL Connection String', severity: 'critical' as const },
  { pattern: /mysql:\/\/[^:\s]+:[^@\s]+@/gi, type: 'MySQL Connection String', severity: 'critical' as const },
  { pattern: /redis:\/\/[^:\s]*:[^@\s]+@/gi, type: 'Redis Connection String', severity: 'critical' as const },

  // Private keys
  { pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, type: 'Private Key', severity: 'critical' as const },
  { pattern: /-----BEGIN PGP PRIVATE KEY BLOCK-----/g, type: 'PGP Private Key', severity: 'critical' as const },
];

// Environment indicators
const ENVIRONMENT_INDICATORS = {
  development: [
    'localhost', '127.0.0.1', 'dev.', '.dev', '-dev', '_dev',
    'development', 'local', 'test', 'sandbox', 'mock',
  ],
  staging: [
    'staging', 'stage', 'stg.', '.stg', '-stg', '_stg',
    'preprod', 'pre-prod', 'uat', 'qa',
  ],
  production: [
    'prod.', '.prod', '-prod', '_prod', 'production',
    'live', 'api.', 'www.', '.com', '.io', '.net',
  ],
};

// Log/output nodes that might leak secrets
const LOGGING_NODE_TYPES = [
  'n8n-nodes-base.set',
  'n8n-nodes-base.function',
  'n8n-nodes-base.code',
  'n8n-nodes-base.httpRequest',
  'n8n-nodes-base.slack',
  'n8n-nodes-base.discord',
  'n8n-nodes-base.telegram',
  'n8n-nodes-base.email',
  'n8n-nodes-base.gmail',
];

/**
 * N8n Secrets Hygiene Auditor Agent
 *
 * Comprehensive auditing of secret management and credential hygiene
 * in n8n workflows.
 */
export class N8nSecretsHygieneAuditorAgent extends N8nBaseAgent {
  constructor(config: N8nAgentConfig) {
    const capabilities: AgentCapability[] = [
      {
        name: 'secrets-hygiene-audit',
        version: '1.0.0',
        description: 'Audit credential hygiene and secret management',
        parameters: {},
      },
      {
        name: 'credential-scoping',
        version: '1.0.0',
        description: 'Validate credential scoping and least privilege',
        parameters: {},
      },
      {
        name: 'log-leakage-detection',
        version: '1.0.0',
        description: 'Detect potential secret leakage into logs',
        parameters: {},
      },
      {
        name: 'environment-validation',
        version: '1.0.0',
        description: 'Validate environment separation',
        parameters: {},
      },
      {
        name: 'entropy-analysis',
        version: '1.0.0',
        description: 'Shannon entropy analysis for secret detection',
        parameters: {},
      },
    ];

    super({
      ...config,
      type: 'n8n-secrets-hygiene-auditor' as any,
      capabilities: [...capabilities, ...(config.capabilities || [])],
    });
  }

  protected async performTask(task: QETask): Promise<SecretsHygieneAuditResult> {
    const hygieneTask = task as SecretsHygieneAuditTask;

    if (hygieneTask.type !== 'secrets-hygiene-audit') {
      throw new Error(`Unsupported task type: ${hygieneTask.type}`);
    }

    return this.auditSecretsHygiene(hygieneTask.target, hygieneTask.workflow, hygieneTask.options);
  }

  /**
   * Run secrets hygiene audit on a workflow
   */
  async auditSecretsHygiene(
    workflowId: string,
    providedWorkflow?: N8nWorkflow,
    options?: SecretsHygieneAuditTask['options']
  ): Promise<SecretsHygieneAuditResult> {
    const startTime = Date.now();

    // Get workflow
    let workflow: N8nWorkflow;
    if (providedWorkflow) {
      workflow = providedWorkflow;
    } else {
      workflow = await this.getWorkflow(workflowId);
    }

    const opts = options || {};
    const issues: SecretHygieneIssue[] = [];

    // Run all analyses
    const credentialScopes = opts.checkScoping !== false
      ? await this.analyzeCredentialScopes(workflow, issues)
      : [];

    const maskedFields = opts.checkMasking !== false
      ? this.analyzeMaskedFields(workflow, issues)
      : [];

    const logLeakage = opts.checkLogLeakage !== false
      ? this.analyzeLogLeakage(workflow, issues)
      : [];

    const environment = opts.checkEnvironment !== false
      ? this.analyzeEnvironment(workflow, opts.targetEnvironment, issues)
      : { detectedEnvironment: 'unknown' as const, environmentIndicators: [], crossEnvironmentRisks: [], recommendations: [] };

    const hardcodedSecrets = opts.checkHardcoded !== false
      ? this.findHardcodedSecrets(workflow, issues)
      : [];

    const credentialAccess = await this.analyzeCredentialAccess(
      workflow,
      opts.rotationPolicyDays || 90,
      issues
    );

    // NEW: Run entropy analysis if requested
    let entropyAnalysis: EntropyAnalysisResult | undefined;
    if (opts.runEntropyAnalysis !== false) {
      entropyAnalysis = this.runEntropyAnalysis(
        workflow,
        opts.entropyThreshold || 4.5,
        opts.minSecretLength || 16,
        issues
      );
    }

    // Calculate overall score and risk
    const overallScore = this.calculateHygieneScore(issues);
    const overallRisk = this.determineOverallRisk(issues);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      credentialScopes,
      maskedFields,
      logLeakage,
      environment,
      hardcodedSecrets,
      credentialAccess,
      issues
    );

    return {
      workflowId: workflow.id?.toString() || workflowId,
      workflowName: workflow.name,
      overallScore,
      overallRisk,
      credentialScopes,
      maskedFields,
      logLeakage,
      environment,
      hardcodedSecrets,
      credentialAccess,
      issues,
      recommendations,
      auditDuration: Date.now() - startTime,
      entropyAnalysis,
    };
  }

  /**
   * Analyze credential scoping
   */
  private async analyzeCredentialScopes(
    workflow: N8nWorkflow,
    issues: SecretHygieneIssue[]
  ): Promise<CredentialScopeAnalysis[]> {
    const results: CredentialScopeAnalysis[] = [];
    const credentialUsage = new Map<string, string[]>();

    // Collect credential usage across nodes
    for (const node of workflow.nodes) {
      const credentials = node.credentials;
      if (credentials) {
        for (const [credType, credInfo] of Object.entries(credentials)) {
          const credId = typeof credInfo === 'object' && credInfo !== null
            ? (credInfo as { id?: string }).id || credType
            : credType;

          if (!credentialUsage.has(credId)) {
            credentialUsage.set(credId, []);
          }
          credentialUsage.get(credId)!.push(node.name);
        }
      }
    }

    // Analyze each credential
    for (const [credId, usedByNodes] of credentialUsage) {
      const analysis = this.analyzeCredential(credId, usedByNodes, workflow);
      results.push(analysis);

      // Check for over-scoping issues
      if (analysis.isOverscoped) {
        issues.push({
          id: `scope-${credId}`,
          type: 'excessive-scope',
          severity: 'medium',
          description: `Credential "${analysis.credentialName}" has excessive scope`,
          remediation: 'Reduce credential permissions to minimum required',
          cweId: 'CWE-250', // Execution with Unnecessary Privileges
        });
      }

      // Check for shared credentials
      if (usedByNodes.length > 3) {
        issues.push({
          id: `shared-${credId}`,
          type: 'shared-credential',
          severity: 'low',
          description: `Credential "${analysis.credentialName}" is shared across ${usedByNodes.length} nodes`,
          remediation: 'Consider using separate credentials for different operations',
        });
      }
    }

    return results;
  }

  private analyzeCredential(
    credId: string,
    usedByNodes: string[],
    workflow: N8nWorkflow
  ): CredentialScopeAnalysis {
    const recommendations: string[] = [];
    const requiredPermissions: string[] = [];
    const actualPermissions: string[] = [];

    // Infer required permissions from node operations
    for (const nodeName of usedByNodes) {
      const node = workflow.nodes.find(n => n.name === nodeName);
      if (node) {
        const operation = (node.parameters?.operation as string) || '';
        const resource = (node.parameters?.resource as string) || '';
        if (operation) {
          requiredPermissions.push(`${resource}:${operation}`);
        }
      }
    }

    // Determine scope level based on usage pattern
    let scopeLevel: 'workflow' | 'project' | 'organization' | 'global' = 'workflow';
    if (usedByNodes.length > 5) {
      scopeLevel = 'project';
    }

    // Check if over-scoped (simplified check)
    const isOverscoped = actualPermissions.length > requiredPermissions.length;

    if (requiredPermissions.length === 1) {
      recommendations.push('Consider creating a dedicated credential for this single operation');
    }

    return {
      credentialId: credId,
      credentialName: credId, // Would need API call to get actual name
      credentialType: 'unknown', // Would need API call
      usedByNodes,
      scopeLevel,
      isOverscoped,
      requiredPermissions: [...new Set(requiredPermissions)],
      actualPermissions,
      recommendations,
    };
  }

  /**
   * Analyze masked fields
   */
  private analyzeMaskedFields(
    workflow: N8nWorkflow,
    issues: SecretHygieneIssue[]
  ): MaskedFieldAnalysis[] {
    const results: MaskedFieldAnalysis[] = [];

    for (const node of workflow.nodes) {
      const analysis = this.analyzeNodeMasking(node);
      results.push(analysis);

      // Add issues for unmasked fields
      for (const field of analysis.unmaskedFields) {
        issues.push({
          id: `unmask-${node.id}-${field}`,
          type: 'unmasked-field',
          severity: 'high',
          nodeId: node.id,
          nodeName: node.name,
          description: `Sensitive field "${field}" is not masked in ${node.name}`,
          remediation: 'Add field to masked/sensitive fields configuration',
          cweId: 'CWE-312', // Cleartext Storage of Sensitive Information
        });
      }
    }

    return results;
  }

  private analyzeNodeMasking(node: N8nNode): MaskedFieldAnalysis {
    const sensitiveFields: SensitiveFieldInfo[] = [];
    const unmaskedFields: string[] = [];
    const recommendations: string[] = [];

    // Analyze node parameters for sensitive fields
    this.findSensitiveFields(node.parameters || {}, '', sensitiveFields);

    // Check which are masked
    for (const field of sensitiveFields) {
      if (!field.isMasked) {
        unmaskedFields.push(field.fieldName);
      }
    }

    // Determine masking status
    let maskingStatus: 'complete' | 'partial' | 'none' = 'complete';
    if (unmaskedFields.length === sensitiveFields.length && sensitiveFields.length > 0) {
      maskingStatus = 'none';
    } else if (unmaskedFields.length > 0) {
      maskingStatus = 'partial';
    }

    if (unmaskedFields.length > 0) {
      recommendations.push(`Mask ${unmaskedFields.length} sensitive field(s) in this node`);
    }

    return {
      nodeId: node.id,
      nodeName: node.name,
      sensitiveFields,
      unmaskedFields,
      maskingStatus,
      recommendations,
    };
  }

  private findSensitiveFields(
    obj: Record<string, unknown>,
    path: string,
    results: SensitiveFieldInfo[]
  ): void {
    for (const [key, value] of Object.entries(obj)) {
      const fieldPath = path ? `${path}.${key}` : key;

      // Check if field name matches sensitive patterns
      for (const pattern of SENSITIVE_FIELD_PATTERNS) {
        if (pattern.test(key)) {
          results.push({
            fieldName: key,
            fieldPath,
            isMasked: this.isFieldMasked(value),
            exposureRisk: this.determineExposureRisk(key),
            detectionMethod: 'pattern',
          });
          break;
        }
      }

      // Recurse into nested objects
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        this.findSensitiveFields(value as Record<string, unknown>, fieldPath, results);
      }
    }
  }

  private isFieldMasked(value: unknown): boolean {
    if (typeof value !== 'string') return true;
    // Check if value looks masked (all asterisks or placeholder)
    return (
      value === '********' ||
      value === '***' ||
      value.includes('{{') || // Expression reference
      value.startsWith('$') // Variable reference
    );
  }

  private determineExposureRisk(fieldName: string): 'high' | 'medium' | 'low' {
    const lowercaseName = fieldName.toLowerCase();
    if (
      lowercaseName.includes('password') ||
      lowercaseName.includes('secret') ||
      lowercaseName.includes('private') ||
      lowercaseName.includes('token')
    ) {
      return 'high';
    }
    if (
      lowercaseName.includes('key') ||
      lowercaseName.includes('auth')
    ) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Analyze log leakage potential
   */
  private analyzeLogLeakage(
    workflow: N8nWorkflow,
    issues: SecretHygieneIssue[]
  ): LogLeakageAnalysis[] {
    const results: LogLeakageAnalysis[] = [];

    for (const node of workflow.nodes) {
      const analysis = this.analyzeNodeLogLeakage(node, workflow);
      if (analysis.potentialLeaks.length > 0) {
        results.push(analysis);

        // Add issues
        for (const leak of analysis.potentialLeaks) {
          issues.push({
            id: `leak-${node.id}-${leak.fieldPath}`,
            type: 'log-leakage',
            severity: leak.severity,
            nodeId: node.id,
            nodeName: node.name,
            description: leak.description,
            remediation: 'Filter or mask sensitive data before logging/output',
            cweId: 'CWE-532', // Information Exposure Through Log Files
          });
        }
      }
    }

    return results;
  }

  private analyzeNodeLogLeakage(node: N8nNode, workflow: N8nWorkflow): LogLeakageAnalysis {
    const potentialLeaks: PotentialLeak[] = [];
    const loggingNodes: string[] = [];
    const recommendations: string[] = [];

    const isLoggingNode = LOGGING_NODE_TYPES.some(
      t => node.type.toLowerCase().includes(t.replace('n8n-nodes-base.', ''))
    );

    if (isLoggingNode) {
      loggingNodes.push(node.name);

      // Check if node outputs might contain sensitive data
      const params = node.parameters || {};
      const paramsStr = JSON.stringify(params);

      // Check for console.log or similar
      if (paramsStr.includes('console.log') || paramsStr.includes('console.error')) {
        potentialLeaks.push({
          fieldPath: 'code',
          leakType: 'log',
          severity: 'high',
          description: `Console logging in ${node.name} may expose sensitive data`,
        });
      }

      // Check for full object output
      if (paramsStr.includes('$json') && !paramsStr.includes('$json.')) {
        potentialLeaks.push({
          fieldPath: '$json',
          leakType: 'output',
          severity: 'medium',
          description: `Full JSON output in ${node.name} may contain secrets`,
        });
      }

      // Check for sending to external services
      if (node.type.includes('slack') || node.type.includes('discord') || node.type.includes('telegram')) {
        // Check if message contains potential secrets
        const message = params.text || params.message || params.content || '';
        if (typeof message === 'string' && message.includes('$json')) {
          potentialLeaks.push({
            fieldPath: 'message',
            leakType: 'output',
            severity: 'high',
            description: `Message in ${node.name} may leak sensitive data to external service`,
          });
        }
      }
    }

    if (potentialLeaks.length > 0) {
      recommendations.push('Review and filter sensitive data before output');
      recommendations.push('Use allowlist approach to explicitly select safe fields');
    }

    return {
      nodeId: node.id,
      nodeName: node.name,
      hasLogging: isLoggingNode,
      loggingNodes,
      potentialLeaks,
      recommendations,
    };
  }

  /**
   * Analyze environment configuration
   */
  private analyzeEnvironment(
    workflow: N8nWorkflow,
    targetEnvironment: string | undefined,
    issues: SecretHygieneIssue[]
  ): EnvironmentAnalysis {
    const indicators: EnvironmentIndicator[] = [];
    const crossEnvironmentRisks: CrossEnvironmentRisk[] = [];
    const recommendations: string[] = [];

    // Collect environment indicators from workflow
    const workflowStr = JSON.stringify(workflow);

    for (const [env, patterns] of Object.entries(ENVIRONMENT_INDICATORS)) {
      for (const pattern of patterns) {
        if (workflowStr.toLowerCase().includes(pattern.toLowerCase())) {
          indicators.push({
            source: 'workflow-config',
            indicator: pattern,
            suggestedEnvironment: env,
            confidence: pattern.includes('.') ? 0.8 : 0.6,
          });
        }
      }
    }

    // Determine most likely environment
    const envCounts = {
      development: 0,
      staging: 0,
      production: 0,
    };

    for (const indicator of indicators) {
      const env = indicator.suggestedEnvironment as keyof typeof envCounts;
      if (env in envCounts) {
        envCounts[env] += indicator.confidence;
      }
    }

    type EnvType = 'development' | 'staging' | 'production' | 'unknown';
    let detectedEnvironment: EnvType = 'unknown';
    const maxCount = Math.max(...Object.values(envCounts));
    if (maxCount > 0) {
      const foundEnv = Object.entries(envCounts).find(
        ([, count]) => count === maxCount
      )?.[0];
      if (foundEnv === 'development' || foundEnv === 'staging' || foundEnv === 'production') {
        detectedEnvironment = foundEnv;
      }
    }

    // Check for cross-environment risks
    if (detectedEnvironment === 'production') {
      // Check for dev indicators in production
      const devIndicators = indicators.filter(i => i.suggestedEnvironment === 'development');
      if (devIndicators.length > 0) {
        crossEnvironmentRisks.push({
          type: 'dev-in-prod',
          description: 'Development indicators found in production workflow',
          severity: 'high',
          affectedResources: devIndicators.map(i => i.indicator),
        });

        issues.push({
          id: 'env-dev-in-prod',
          type: 'env-mismatch',
          severity: 'high',
          description: 'Development configuration detected in production workflow',
          remediation: 'Remove development URLs and use production credentials',
          cweId: 'CWE-489', // Active Debug Code
        });
      }
    }

    // Check for target environment mismatch
    if (targetEnvironment && detectedEnvironment !== 'unknown' && detectedEnvironment !== targetEnvironment) {
      crossEnvironmentRisks.push({
        type: 'environment-mismatch',
        description: `Expected ${targetEnvironment} but detected ${detectedEnvironment}`,
        severity: 'medium',
        affectedResources: [],
      });

      issues.push({
        id: 'env-mismatch',
        type: 'env-mismatch',
        severity: 'medium',
        description: `Environment mismatch: expected ${targetEnvironment}, detected ${detectedEnvironment}`,
        remediation: 'Verify workflow is deployed to correct environment',
      });
    }

    if (detectedEnvironment === 'unknown') {
      recommendations.push('Add environment indicators to workflow for better traceability');
    }

    if (crossEnvironmentRisks.length > 0) {
      recommendations.push('Review and fix environment-specific configurations');
    }

    return {
      detectedEnvironment,
      environmentIndicators: indicators,
      crossEnvironmentRisks,
      recommendations,
    };
  }

  /**
   * Find hardcoded secrets
   */
  private findHardcodedSecrets(
    workflow: N8nWorkflow,
    issues: SecretHygieneIssue[]
  ): HardcodedSecretFinding[] {
    const findings: HardcodedSecretFinding[] = [];

    for (const node of workflow.nodes) {
      const nodeFindings = this.scanNodeForSecrets(node);
      findings.push(...nodeFindings);

      // Add issues
      for (const finding of nodeFindings) {
        issues.push({
          id: `hardcoded-${finding.nodeId}-${finding.secretType}`,
          type: 'hardcoded-secret',
          severity: finding.severity,
          nodeId: finding.nodeId,
          nodeName: finding.nodeName,
          description: `Hardcoded ${finding.secretType} found in ${finding.nodeName}`,
          remediation: 'Move secret to n8n credentials store or environment variable',
          cweId: 'CWE-798', // Use of Hard-coded Credentials
        });
      }
    }

    return findings;
  }

  private scanNodeForSecrets(node: N8nNode): HardcodedSecretFinding[] {
    const findings: HardcodedSecretFinding[] = [];
    const nodeStr = JSON.stringify(node.parameters || {});

    for (const { pattern, type, severity } of HARDCODED_SECRET_PATTERNS) {
      const matches = nodeStr.match(pattern);
      if (matches) {
        for (const match of matches) {
          // Don't flag obvious placeholders or expressions
          if (
            match.includes('{{') ||
            match.includes('$') ||
            match === '********' ||
            match.includes('example') ||
            match.includes('placeholder')
          ) {
            continue;
          }

          findings.push({
            nodeId: node.id,
            nodeName: node.name,
            fieldPath: 'parameters',
            secretType: type,
            severity,
            partialValue: this.maskSecret(match),
            recommendation: `Move ${type} to credential store`,
          });
        }
      }
    }

    // Check for secrets in URLs
    const urlPattern = /(https?:\/\/[^\s"']+)/gi;
    const urls = nodeStr.match(urlPattern) || [];
    for (const url of urls) {
      // Check for credentials in URL
      if (url.includes('@') && url.includes(':')) {
        findings.push({
          nodeId: node.id,
          nodeName: node.name,
          fieldPath: 'url',
          secretType: 'Credentials in URL',
          severity: 'critical',
          partialValue: this.maskUrl(url),
          recommendation: 'Use authentication parameters instead of URL credentials',
        });
      }

      // Check for API key in query string
      if (url.includes('api_key=') || url.includes('apikey=') || url.includes('key=')) {
        findings.push({
          nodeId: node.id,
          nodeName: node.name,
          fieldPath: 'url',
          secretType: 'API Key in URL',
          severity: 'high',
          partialValue: this.maskUrl(url),
          recommendation: 'Move API key to headers or credential store',
        });
      }
    }

    return findings;
  }

  private maskSecret(secret: string): string {
    if (secret.length <= 8) {
      return '***';
    }
    return `${secret.substring(0, 4)}...${secret.substring(secret.length - 4)}`;
  }

  private maskUrl(url: string): string {
    try {
      const parsed = new URL(url);
      if (parsed.password) {
        parsed.password = '***';
      }
      if (parsed.username) {
        parsed.username = '***';
      }
      // Mask query params
      for (const [key] of parsed.searchParams) {
        if (key.toLowerCase().includes('key') || key.toLowerCase().includes('token')) {
          parsed.searchParams.set(key, '***');
        }
      }
      return parsed.toString();
    } catch {
      return '***masked-url***';
    }
  }

  /**
   * Analyze credential access patterns
   */
  private async analyzeCredentialAccess(
    workflow: N8nWorkflow,
    rotationPolicyDays: number,
    issues: SecretHygieneIssue[]
  ): Promise<CredentialAccessAnalysis[]> {
    const results: CredentialAccessAnalysis[] = [];
    const credentialUsage = new Map<string, string[]>();

    // Collect credential usage
    for (const node of workflow.nodes) {
      const credentials = node.credentials;
      if (credentials) {
        for (const [credType, credInfo] of Object.entries(credentials)) {
          const credId = typeof credInfo === 'object' && credInfo !== null
            ? (credInfo as { id?: string }).id || credType
            : credType;

          if (!credentialUsage.has(credId)) {
            credentialUsage.set(credId, []);
          }
          credentialUsage.get(credId)!.push(workflow.name);
        }
      }
    }

    // Analyze each credential
    type RotationStatusType = 'compliant' | 'due' | 'overdue' | 'unknown';
    for (const [credId, accessingWorkflows] of credentialUsage) {
      const accessFrequency: 'high' | 'medium' | 'low' =
        accessingWorkflows.length > 5 ? 'high' :
        accessingWorkflows.length > 2 ? 'medium' : 'low';

      // Rotation status would need actual credential metadata from n8n API
      // Currently always 'unknown' until n8n exposes credential metadata
      const rotationStatus: RotationStatusType = 'unknown';
      // TODO: Add actual rotation check when n8n API supports credential metadata
      // const actualStatus = await this.checkRotationStatus(credId);
      // if (actualStatus === 'overdue') { ... }

      const recommendations: string[] = [];
      // Note: rotationStatus check is placeholder for future API support
      // When n8n exposes credential metadata, uncomment and implement rotation checking

      results.push({
        credentialId: credId,
        credentialName: credId,
        accessFrequency,
        rotationStatus,
        accessingWorkflows,
        recommendations,
      });
    }

    return results;
  }

  /**
   * Calculate hygiene score
   */
  private calculateHygieneScore(issues: SecretHygieneIssue[]): number {
    let score = 100;

    for (const issue of issues) {
      switch (issue.severity) {
        case 'critical':
          score -= 25;
          break;
        case 'high':
          score -= 15;
          break;
        case 'medium':
          score -= 8;
          break;
        case 'low':
          score -= 3;
          break;
        case 'info':
          score -= 1;
          break;
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Determine overall risk level
   */
  private determineOverallRisk(issues: SecretHygieneIssue[]): SecretHygieneIssueSeverity {
    if (issues.some(i => i.severity === 'critical')) {
      return 'critical';
    }
    if (issues.some(i => i.severity === 'high')) {
      return 'high';
    }
    if (issues.some(i => i.severity === 'medium')) {
      return 'medium';
    }
    if (issues.some(i => i.severity === 'low')) {
      return 'low';
    }
    return 'info';
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    credentialScopes: CredentialScopeAnalysis[],
    maskedFields: MaskedFieldAnalysis[],
    logLeakage: LogLeakageAnalysis[],
    environment: EnvironmentAnalysis,
    hardcodedSecrets: HardcodedSecretFinding[],
    credentialAccess: CredentialAccessAnalysis[],
    issues: SecretHygieneIssue[]
  ): string[] {
    const recommendations: string[] = [];

    // Critical: Hardcoded secrets
    if (hardcodedSecrets.length > 0) {
      recommendations.push(
        `CRITICAL: Remove ${hardcodedSecrets.length} hardcoded secret(s) and use credential store`
      );
    }

    // High: Log leakage
    if (logLeakage.some(l => l.potentialLeaks.length > 0)) {
      recommendations.push(
        'HIGH: Review logging/output nodes for potential secret leakage'
      );
    }

    // High: Unmasked fields
    const unmaskedCount = maskedFields.reduce((sum, m) => sum + m.unmaskedFields.length, 0);
    if (unmaskedCount > 0) {
      recommendations.push(
        `HIGH: Mask ${unmaskedCount} sensitive field(s) to prevent exposure`
      );
    }

    // Medium: Environment issues
    if (environment.crossEnvironmentRisks.length > 0) {
      recommendations.push(
        'MEDIUM: Resolve environment configuration mismatches'
      );
    }

    // Medium: Over-scoped credentials
    const overscopedCount = credentialScopes.filter(c => c.isOverscoped).length;
    if (overscopedCount > 0) {
      recommendations.push(
        `MEDIUM: Reduce scope of ${overscopedCount} over-privileged credential(s)`
      );
    }

    // Low: Rotation
    const rotationDue = credentialAccess.filter(
      c => c.rotationStatus === 'due' || c.rotationStatus === 'overdue'
    ).length;
    if (rotationDue > 0) {
      recommendations.push(
        `LOW: ${rotationDue} credential(s) need rotation`
      );
    }

    // General best practices
    if (issues.length === 0) {
      recommendations.push('Excellent! No secret hygiene issues detected');
    } else {
      recommendations.push(
        `Address ${issues.filter(i => i.severity === 'critical' || i.severity === 'high').length} high-priority issue(s) first`
      );
    }

    return recommendations;
  }

  // ============================================================================
  // Shannon Entropy Analysis
  // ============================================================================

  /**
   * Run entropy-based secret detection
   * High-entropy strings are statistically likely to be secrets
   */
  runEntropyAnalysis(
    workflow: N8nWorkflow,
    entropyThreshold: number,
    minLength: number,
    issues: SecretHygieneIssue[]
  ): EntropyAnalysisResult {
    const findings: HighEntropyFinding[] = [];
    const allEntropies: number[] = [];
    let totalStringsScanned = 0;

    // Scan each node for high-entropy strings
    for (const node of workflow.nodes) {
      const nodeFindings = this.scanNodeForHighEntropyStrings(
        node,
        entropyThreshold,
        minLength
      );

      for (const finding of nodeFindings) {
        findings.push(finding);
        allEntropies.push(finding.entropy);
        totalStringsScanned++;

        // Add as issue if confidence is high enough
        if (finding.confidence >= 0.7) {
          issues.push({
            id: `entropy-${node.id}-${finding.fieldPath}`,
            type: 'hardcoded-secret',
            severity: this.entropyToSeverity(finding.entropy, finding.confidence),
            nodeId: node.id,
            nodeName: node.name,
            description: `High-entropy string detected (${finding.entropy.toFixed(2)} bits): likely ${finding.likelySecretType}`,
            remediation: finding.recommendation,
            cweId: 'CWE-798',
          });
        }
      }
    }

    // Calculate entropy distribution
    const entropyDistribution = this.calculateEntropyDistribution(allEntropies);

    // Generate recommendations
    const recommendations: string[] = [];
    if (findings.length > 0) {
      const veryHighCount = findings.filter(f => f.entropyRating === 'very-high').length;
      const highCount = findings.filter(f => f.entropyRating === 'high').length;

      if (veryHighCount > 0) {
        recommendations.push(
          `CRITICAL: ${veryHighCount} string(s) with very high entropy (>5.5 bits) detected - likely secrets`
        );
      }
      if (highCount > 0) {
        recommendations.push(
          `HIGH: ${highCount} string(s) with high entropy (${entropyThreshold}-5.5 bits) detected`
        );
      }
      recommendations.push('Review flagged strings and move actual secrets to credential store');
    } else {
      recommendations.push('No high-entropy strings detected');
    }

    // Emit event
    this.emitEvent('secrets.entropy-analysis.completed', {
      workflowId: workflow.id,
      totalScanned: totalStringsScanned,
      highEntropyCount: findings.length,
    });

    return {
      totalStringsScanned,
      highEntropyFindings: findings,
      entropyDistribution,
      recommendations,
    };
  }

  /**
   * Scan a single node for high-entropy strings
   */
  private scanNodeForHighEntropyStrings(
    node: N8nNode,
    threshold: number,
    minLength: number
  ): HighEntropyFinding[] {
    const findings: HighEntropyFinding[] = [];

    this.extractAndAnalyzeStrings(
      node.parameters || {},
      '',
      node,
      threshold,
      minLength,
      findings
    );

    return findings;
  }

  /**
   * Recursively extract strings and analyze their entropy
   */
  private extractAndAnalyzeStrings(
    obj: unknown,
    path: string,
    node: N8nNode,
    threshold: number,
    minLength: number,
    findings: HighEntropyFinding[]
  ): void {
    if (typeof obj === 'string') {
      // Skip if too short or is a template expression
      if (obj.length < minLength || obj.includes('{{') || obj.startsWith('$')) {
        return;
      }

      // Skip known non-secrets (URLs without credentials, common strings)
      if (this.isKnownNonSecret(obj)) {
        return;
      }

      const entropy = this.calculateShannonEntropy(obj);
      if (entropy >= threshold) {
        const charsetAnalysis = this.analyzeCharset(obj);
        const likelyType = this.inferSecretType(obj, charsetAnalysis, entropy);
        const confidence = this.calculateConfidence(obj, charsetAnalysis, entropy, path);

        findings.push({
          nodeId: node.id,
          nodeName: node.name,
          fieldPath: path,
          entropy,
          entropyRating: this.getEntropyRating(entropy),
          length: obj.length,
          charsetAnalysis,
          likelySecretType: likelyType,
          confidence,
          partialValue: this.maskSecret(obj),
          recommendation: `Move ${likelyType} to n8n credential store`,
        });
      }
    } else if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        this.extractAndAnalyzeStrings(
          item,
          `${path}[${index}]`,
          node,
          threshold,
          minLength,
          findings
        );
      });
    } else if (obj && typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        this.extractAndAnalyzeStrings(
          value,
          path ? `${path}.${key}` : key,
          node,
          threshold,
          minLength,
          findings
        );
      }
    }
  }

  /**
   * Calculate Shannon entropy of a string
   * Higher entropy = more randomness = more likely to be a secret
   */
  calculateShannonEntropy(str: string): number {
    if (str.length === 0) return 0;

    // Count character frequencies
    const frequencies = new Map<string, number>();
    for (const char of str) {
      frequencies.set(char, (frequencies.get(char) || 0) + 1);
    }

    // Calculate entropy: -Σ p(x) * log2(p(x))
    let entropy = 0;
    const len = str.length;

    for (const count of frequencies.values()) {
      const probability = count / len;
      entropy -= probability * Math.log2(probability);
    }

    return entropy;
  }

  /**
   * Analyze character set composition
   */
  private analyzeCharset(str: string): CharsetAnalysis {
    const hasUppercase = /[A-Z]/.test(str);
    const hasLowercase = /[a-z]/.test(str);
    const hasDigits = /[0-9]/.test(str);
    const hasSpecial = /[^A-Za-z0-9]/.test(str);

    // Calculate effective charset size
    let charsetSize = 0;
    if (hasUppercase) charsetSize += 26;
    if (hasLowercase) charsetSize += 26;
    if (hasDigits) charsetSize += 10;
    if (hasSpecial) charsetSize += 32; // Common special chars

    // Check if base64-like (only alphanumeric + /+=)
    const isBase64Like = /^[A-Za-z0-9+/=]+$/.test(str) && str.length % 4 === 0;

    // Check if hex-like
    const isHexLike = /^[A-Fa-f0-9]+$/.test(str);

    return {
      hasUppercase,
      hasLowercase,
      hasDigits,
      hasSpecial,
      charsetSize,
      isBase64Like,
      isHexLike,
    };
  }

  /**
   * Infer likely secret type from characteristics
   */
  private inferSecretType(
    str: string,
    charset: CharsetAnalysis,
    entropy: number
  ): string {
    // Check for known prefixes
    if (str.startsWith('sk_live_') || str.startsWith('sk_test_')) {
      return 'Stripe Secret Key';
    }
    if (str.startsWith('pk_live_') || str.startsWith('pk_test_')) {
      return 'Stripe Publishable Key';
    }
    if (str.startsWith('ghp_') || str.startsWith('gho_')) {
      return 'GitHub Token';
    }
    if (str.startsWith('AKIA')) {
      return 'AWS Access Key';
    }
    if (str.startsWith('xoxb-') || str.startsWith('xoxp-')) {
      return 'Slack Token';
    }
    if (str.startsWith('eyJ')) {
      return 'JWT Token';
    }

    // Infer from characteristics
    if (charset.isBase64Like && str.length >= 32) {
      return 'Base64 Encoded Secret';
    }
    if (charset.isHexLike && str.length >= 32) {
      return 'Hex Encoded Secret/Hash';
    }
    if (charset.isHexLike && str.length === 64) {
      return 'SHA-256 Hash or Private Key';
    }
    if (str.length >= 40 && entropy > 5.0) {
      return 'API Key or Access Token';
    }
    if (str.length >= 20 && charset.hasUppercase && charset.hasLowercase && charset.hasDigits) {
      return 'Random Access Token';
    }

    return 'Unknown High-Entropy Secret';
  }

  /**
   * Calculate confidence that string is actually a secret
   */
  private calculateConfidence(
    str: string,
    charset: CharsetAnalysis,
    entropy: number,
    path: string
  ): number {
    let confidence = 0.5; // Base confidence

    // Higher entropy = higher confidence
    if (entropy > 5.5) confidence += 0.2;
    else if (entropy > 5.0) confidence += 0.15;
    else if (entropy > 4.5) confidence += 0.1;

    // Longer strings more likely to be secrets
    if (str.length >= 64) confidence += 0.1;
    else if (str.length >= 32) confidence += 0.05;

    // Base64 or hex encoding suggests secret
    if (charset.isBase64Like) confidence += 0.1;
    if (charset.isHexLike) confidence += 0.1;

    // Mixed case + digits suggests generated token
    if (charset.hasUppercase && charset.hasLowercase && charset.hasDigits) {
      confidence += 0.1;
    }

    // Field name suggests secret
    const pathLower = path.toLowerCase();
    const secretFieldPatterns = ['key', 'token', 'secret', 'password', 'auth', 'credential'];
    if (secretFieldPatterns.some(p => pathLower.includes(p))) {
      confidence += 0.15;
    }

    // Reduce confidence for common false positives
    if (str.includes(' ')) confidence -= 0.2; // Spaces suggest natural text
    if (/\.(com|org|net|io)/.test(str)) confidence -= 0.1; // URL-like

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Get entropy rating label
   */
  private getEntropyRating(entropy: number): 'very-high' | 'high' | 'moderate' {
    if (entropy >= 5.5) return 'very-high';
    if (entropy >= 5.0) return 'high';
    return 'moderate';
  }

  /**
   * Convert entropy to severity
   */
  private entropyToSeverity(
    entropy: number,
    confidence: number
  ): SecretHygieneIssueSeverity {
    if (entropy >= 5.5 && confidence >= 0.8) return 'critical';
    if (entropy >= 5.0 && confidence >= 0.7) return 'high';
    if (entropy >= 4.5 && confidence >= 0.6) return 'medium';
    return 'low';
  }

  /**
   * Check if string is a known non-secret (false positive)
   */
  private isKnownNonSecret(str: string): boolean {
    // URLs without credentials
    if (/^https?:\/\/[^:@]+$/.test(str)) return true;

    // Email addresses
    if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(str)) return true;

    // UUIDs (not secrets, just identifiers)
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)) return true;

    // Common placeholder values
    const placeholders = [
      'your-api-key-here',
      'replace-with-your-key',
      'xxx',
      'placeholder',
      'example',
      'test',
      'sample',
    ];
    if (placeholders.some(p => str.toLowerCase().includes(p))) return true;

    // File paths
    if (str.startsWith('/') || str.includes('\\') || str.includes('://')) return true;

    // Natural language (multiple spaces suggest text)
    if ((str.match(/ /g) || []).length > 3) return true;

    return false;
  }

  /**
   * Calculate entropy distribution buckets
   */
  private calculateEntropyDistribution(entropies: number[]): EntropyBucket[] {
    if (entropies.length === 0) {
      return [
        { range: '0-2', count: 0, percentage: 0 },
        { range: '2-3', count: 0, percentage: 0 },
        { range: '3-4', count: 0, percentage: 0 },
        { range: '4-5', count: 0, percentage: 0 },
        { range: '5-6', count: 0, percentage: 0 },
        { range: '6+', count: 0, percentage: 0 },
      ];
    }

    const buckets: EntropyBucket[] = [
      { range: '0-2', count: 0, percentage: 0 },
      { range: '2-3', count: 0, percentage: 0 },
      { range: '3-4', count: 0, percentage: 0 },
      { range: '4-5', count: 0, percentage: 0 },
      { range: '5-6', count: 0, percentage: 0 },
      { range: '6+', count: 0, percentage: 0 },
    ];

    for (const e of entropies) {
      if (e < 2) buckets[0].count++;
      else if (e < 3) buckets[1].count++;
      else if (e < 4) buckets[2].count++;
      else if (e < 5) buckets[3].count++;
      else if (e < 6) buckets[4].count++;
      else buckets[5].count++;
    }

    const total = entropies.length;
    for (const bucket of buckets) {
      bucket.percentage = Math.round((bucket.count / total) * 100);
    }

    return buckets;
  }

  /**
   * Quick entropy check for a single string
   */
  quickEntropyCheck(str: string): {
    entropy: number;
    isLikelySecret: boolean;
    secretType: string | null;
  } {
    const entropy = this.calculateShannonEntropy(str);
    const charset = this.analyzeCharset(str);
    const isLikelySecret = entropy >= 4.5 && !this.isKnownNonSecret(str);

    return {
      entropy,
      isLikelySecret,
      secretType: isLikelySecret ? this.inferSecretType(str, charset, entropy) : null,
    };
  }
}
