/**
 * Agentic QE v3 - Security Scanner Service
 * Implements SAST and DAST security scanning capabilities
 * Includes OSV API integration for dependency vulnerability scanning
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err } from '../../../shared/types/index.js';
import type { MemoryBackend } from '../../../kernel/interfaces.js';
import type { FilePath } from '../../../shared/value-objects/index.js';
import type {
  SASTResult,
  DASTResult,
  DASTOptions,
  AuthCredentials,
  RuleSet,
  FalsePositiveCheck,
  Vulnerability,
  VulnerabilitySeverity,
  VulnerabilityCategory,
  VulnerabilityLocation,
  RemediationAdvice,
  ScanSummary,
  SecurityCoverage,
  ScanStatus,
} from '../interfaces.js';
import { OSVClient, ParsedVulnerability } from '../../../shared/security/index.js';

// ADR-051: LLM Router for AI-enhanced security analysis
import type { HybridRouter, ChatResponse } from '../../../shared/llm';

// ============================================================================
// Service Interfaces
// ============================================================================

/**
 * Dependency scan result
 */
export interface DependencyScanResult {
  readonly scanId: string;
  readonly vulnerabilities: Vulnerability[];
  readonly packagesScanned: number;
  readonly vulnerablePackages: number;
  readonly summary: ScanSummary;
  readonly scanDurationMs: number;
}

/**
 * Combined security scanner service interface
 * Note: We define separate methods for SAST and DAST to avoid interface conflicts
 */
export interface ISecurityScannerService {
  // SAST Methods
  scanFiles(files: FilePath[]): Promise<Result<SASTResult>>;
  scanWithRules(files: FilePath[], ruleSetIds: string[]): Promise<Result<SASTResult>>;
  getAvailableRuleSets(): Promise<RuleSet[]>;
  checkFalsePositive(vulnerability: Vulnerability): Promise<Result<FalsePositiveCheck>>;

  // DAST Methods
  scanUrl(targetUrl: string, options?: DASTOptions): Promise<Result<DASTResult>>;
  scanAuthenticated(
    targetUrl: string,
    credentials: AuthCredentials,
    options?: DASTOptions
  ): Promise<Result<DASTResult>>;
  getScanStatus(scanId: string): Promise<ScanStatus>;

  // Dependency Scanning (OSV)
  scanDependencies(dependencies: Record<string, string>): Promise<Result<DependencyScanResult>>;
  scanPackageJson(packageJsonPath: string): Promise<Result<DependencyScanResult>>;

  // Combined
  runFullScan(
    files: FilePath[],
    targetUrl?: string,
    options?: DASTOptions
  ): Promise<Result<FullScanResult>>;
}

export interface FullScanResult {
  readonly sastResult: SASTResult;
  readonly dastResult?: DASTResult;
  readonly combinedSummary: ScanSummary;
}

// ============================================================================
// Configuration
// ============================================================================

export interface SecurityScannerConfig {
  defaultRuleSets: string[];
  maxConcurrentScans: number;
  timeout: number;
  enableFalsePositiveDetection: boolean;
  dastMaxDepth: number;
  dastActiveScanning: boolean;
  /** ADR-051: Enable LLM-powered vulnerability analysis */
  enableLLMAnalysis: boolean;
  /** ADR-051: Model tier for LLM calls (1=Haiku, 2=Sonnet, 4=Opus) */
  llmModelTier: number;
}

/**
 * Dependencies for SecurityScannerService
 * ADR-051: Added LLM router for AI-enhanced analysis
 */
export interface SecurityScannerDependencies {
  memory: MemoryBackend;
  llmRouter?: HybridRouter;
}

const DEFAULT_CONFIG: SecurityScannerConfig = {
  defaultRuleSets: ['owasp-top-10', 'cwe-sans-25'],
  maxConcurrentScans: 4,
  timeout: 300000, // 5 minutes
  enableFalsePositiveDetection: true,
  dastMaxDepth: 5,
  dastActiveScanning: false,
  enableLLMAnalysis: true, // On by default - opt-out (ADR-051)
  llmModelTier: 4, // Opus for security analysis (needs expert reasoning)
};

// ============================================================================
// Security Pattern Definitions
// ============================================================================

/**
 * Pattern definition for vulnerability detection
 */
interface SecurityPattern {
  readonly id: string;
  readonly pattern: RegExp;
  readonly category: VulnerabilityCategory;
  readonly severity: VulnerabilitySeverity;
  readonly title: string;
  readonly description: string;
  readonly owaspId: string;
  readonly cweId: string;
  readonly remediation: string;
  readonly fixExample?: string;
}

/**
 * SQL Injection Detection Patterns
 * OWASP A03:2021 - Injection
 */
const SQL_INJECTION_PATTERNS: SecurityPattern[] = [
  {
    id: 'sqli-string-concat',
    pattern: /query\s*\(\s*['"`].*\+.*['"`]\s*\)/g,
    category: 'injection',
    severity: 'critical',
    title: 'SQL Injection via String Concatenation',
    description: 'SQL query constructed using string concatenation with potentially untrusted input',
    owaspId: 'A03:2021',
    cweId: 'CWE-89',
    remediation: 'Use parameterized queries or prepared statements instead of string concatenation',
    fixExample: 'db.query("SELECT * FROM users WHERE id = $1", [userId])',
  },
  {
    id: 'sqli-template-literal',
    pattern: /execute\s*\(\s*`[^`]*\$\{[^}]+\}[^`]*`\s*\)/g,
    category: 'injection',
    severity: 'critical',
    title: 'SQL Injection via Template Literal',
    description: 'SQL query constructed using template literals with embedded expressions',
    owaspId: 'A03:2021',
    cweId: 'CWE-89',
    remediation: 'Use parameterized queries instead of template literals for SQL',
    fixExample: 'db.execute("DELETE FROM users WHERE id = ?", [userId])',
  },
  {
    id: 'sqli-raw-query',
    pattern: /\.raw\s*\(\s*['"`].*\+|\.raw\s*\(\s*`[^`]*\$\{/g,
    category: 'injection',
    severity: 'high',
    title: 'SQL Injection via Raw Query',
    description: 'Raw SQL query with potential user input interpolation',
    owaspId: 'A03:2021',
    cweId: 'CWE-89',
    remediation: 'Avoid raw queries with user input; use ORM methods or parameterized queries',
  },
  {
    id: 'sqli-exec',
    pattern: /exec(?:ute)?(?:Sql|Query)?\s*\([^)]*\+[^)]*\)/gi,
    category: 'injection',
    severity: 'critical',
    title: 'SQL Injection via Dynamic Execution',
    description: 'Dynamic SQL execution with string concatenation detected',
    owaspId: 'A03:2021',
    cweId: 'CWE-89',
    remediation: 'Never concatenate user input into SQL queries',
  },
];

/**
 * XSS (Cross-Site Scripting) Detection Patterns
 * OWASP A03:2021 - Injection (includes XSS)
 */
const XSS_PATTERNS: SecurityPattern[] = [
  {
    id: 'xss-innerhtml',
    pattern: /\.innerHTML\s*=\s*[^'"`;\n]+/g,
    category: 'xss',
    severity: 'high',
    title: 'XSS via innerHTML Assignment',
    description: 'Direct innerHTML assignment with potentially unsanitized content',
    owaspId: 'A03:2021',
    cweId: 'CWE-79',
    remediation: 'Use textContent for text, or sanitize HTML with DOMPurify before innerHTML assignment',
    fixExample: 'element.textContent = userInput; // or DOMPurify.sanitize(userInput)',
  },
  {
    id: 'xss-document-write',
    pattern: /document\.write\s*\([^)]+\)/g,
    category: 'xss',
    severity: 'high',
    title: 'XSS via document.write',
    description: 'document.write() can execute scripts from untrusted data',
    owaspId: 'A03:2021',
    cweId: 'CWE-79',
    remediation: 'Avoid document.write(); use DOM manipulation methods instead',
    fixExample: 'document.body.appendChild(document.createTextNode(text))',
  },
  {
    id: 'xss-dangerously-set',
    pattern: /dangerouslySetInnerHTML\s*=\s*\{/g,
    category: 'xss',
    severity: 'medium',
    title: 'React dangerouslySetInnerHTML Usage',
    description: 'dangerouslySetInnerHTML bypasses React XSS protections',
    owaspId: 'A03:2021',
    cweId: 'CWE-79',
    remediation: 'Sanitize HTML content with DOMPurify before using dangerouslySetInnerHTML',
    fixExample: 'dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}',
  },
  {
    id: 'xss-eval',
    pattern: /eval\s*\([^)]+\)/g,
    category: 'xss',
    severity: 'critical',
    title: 'Code Injection via eval()',
    description: 'eval() executes arbitrary code and is a major security risk',
    owaspId: 'A03:2021',
    cweId: 'CWE-95',
    remediation: 'Never use eval(); use JSON.parse() for JSON data or safer alternatives',
    fixExample: 'JSON.parse(jsonString) // instead of eval(jsonString)',
  },
  {
    id: 'xss-new-function',
    pattern: /new\s+Function\s*\([^)]+\)/g,
    category: 'xss',
    severity: 'critical',
    title: 'Code Injection via Function Constructor',
    description: 'Function constructor can execute arbitrary code like eval()',
    owaspId: 'A03:2021',
    cweId: 'CWE-95',
    remediation: 'Avoid the Function constructor; use predefined functions instead',
  },
  {
    id: 'xss-outerhtml',
    pattern: /\.outerHTML\s*=\s*[^'"`;\n]+/g,
    category: 'xss',
    severity: 'high',
    title: 'XSS via outerHTML Assignment',
    description: 'Direct outerHTML assignment with potentially unsanitized content',
    owaspId: 'A03:2021',
    cweId: 'CWE-79',
    remediation: 'Sanitize content before outerHTML assignment',
  },
];

/**
 * Hardcoded Secrets Detection Patterns
 * OWASP A02:2021 - Cryptographic Failures
 */
const SECRET_PATTERNS: SecurityPattern[] = [
  {
    id: 'secret-aws-access-key',
    pattern: /['"`]AKIA[0-9A-Z]{16}['"`]/g,
    category: 'sensitive-data',
    severity: 'critical',
    title: 'AWS Access Key Detected',
    description: 'Hardcoded AWS Access Key ID found in source code',
    owaspId: 'A02:2021',
    cweId: 'CWE-798',
    remediation: 'Use environment variables or AWS Secrets Manager for credentials',
    fixExample: 'const accessKey = process.env.AWS_ACCESS_KEY_ID',
  },
  {
    id: 'secret-aws-secret-key',
    pattern: /['"`][A-Za-z0-9/+=]{40}['"`]/g,
    category: 'sensitive-data',
    severity: 'critical',
    title: 'Potential AWS Secret Key Detected',
    description: 'Potential hardcoded AWS Secret Access Key found',
    owaspId: 'A02:2021',
    cweId: 'CWE-798',
    remediation: 'Store secrets in environment variables or secrets manager',
  },
  {
    id: 'secret-openai-key',
    pattern: /['"`]sk-[a-zA-Z0-9]{48,}['"`]/g,
    category: 'sensitive-data',
    severity: 'critical',
    title: 'OpenAI API Key Detected',
    description: 'Hardcoded OpenAI API key found in source code',
    owaspId: 'A02:2021',
    cweId: 'CWE-798',
    remediation: 'Use environment variables for API keys',
    fixExample: 'const apiKey = process.env.OPENAI_API_KEY',
  },
  {
    id: 'secret-generic-password',
    pattern: /password\s*[:=]\s*['"`][^'"`]{4,}['"`]/gi,
    category: 'sensitive-data',
    severity: 'high',
    title: 'Hardcoded Password Detected',
    description: 'Hardcoded password found in source code',
    owaspId: 'A02:2021',
    cweId: 'CWE-798',
    remediation: 'Never hardcode passwords; use environment variables or secrets manager',
    fixExample: 'const password = process.env.DB_PASSWORD',
  },
  {
    id: 'secret-api-key',
    pattern: /api[_-]?key\s*[:=]\s*['"`][a-zA-Z0-9_\-]{16,}['"`]/gi,
    category: 'sensitive-data',
    severity: 'high',
    title: 'Hardcoded API Key Detected',
    description: 'Hardcoded API key found in source code',
    owaspId: 'A02:2021',
    cweId: 'CWE-798',
    remediation: 'Use environment variables for API keys',
    fixExample: 'const apiKey = process.env.API_KEY',
  },
  {
    id: 'secret-jwt',
    pattern: /['"`]eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+['"`]/g,
    category: 'sensitive-data',
    severity: 'high',
    title: 'Hardcoded JWT Token Detected',
    description: 'Hardcoded JWT token found in source code',
    owaspId: 'A02:2021',
    cweId: 'CWE-798',
    remediation: 'Generate JWT tokens dynamically; never hardcode them',
  },
  {
    id: 'secret-private-key',
    pattern: /-----BEGIN\s+(RSA|EC|OPENSSH|DSA)?\s*PRIVATE\s+KEY-----/g,
    category: 'sensitive-data',
    severity: 'critical',
    title: 'Private Key Detected',
    description: 'Private key found in source code',
    owaspId: 'A02:2021',
    cweId: 'CWE-798',
    remediation: 'Store private keys in secure key management systems, not in code',
  },
  {
    id: 'secret-github-token',
    pattern: /['"`]ghp_[a-zA-Z0-9]{36}['"`]|['"`]github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}['"`]/g,
    category: 'sensitive-data',
    severity: 'critical',
    title: 'GitHub Token Detected',
    description: 'Hardcoded GitHub personal access token found',
    owaspId: 'A02:2021',
    cweId: 'CWE-798',
    remediation: 'Use environment variables or GitHub Actions secrets',
  },
  {
    id: 'secret-slack-token',
    pattern: /['"`]xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*['"`]/g,
    category: 'sensitive-data',
    severity: 'high',
    title: 'Slack Token Detected',
    description: 'Hardcoded Slack token found in source code',
    owaspId: 'A02:2021',
    cweId: 'CWE-798',
    remediation: 'Use environment variables for Slack tokens',
  },
];

/**
 * Path Traversal Detection Patterns
 * OWASP A01:2021 - Broken Access Control
 */
const PATH_TRAVERSAL_PATTERNS: SecurityPattern[] = [
  {
    id: 'path-traversal-readfile',
    pattern: /(?:readFile|readFileSync)\s*\([^)]*\+/g,
    category: 'access-control',
    severity: 'high',
    title: 'Path Traversal via File Read',
    description: 'File read operation with concatenated path may allow directory traversal',
    owaspId: 'A01:2021',
    cweId: 'CWE-22',
    remediation: 'Validate and sanitize file paths; use path.resolve() and check against base directory',
    fixExample: 'const safePath = path.resolve(baseDir, path.basename(userInput))',
  },
  {
    id: 'path-traversal-pattern',
    pattern: /\.\.\/.*\.\.\//g,
    category: 'access-control',
    severity: 'medium',
    title: 'Path Traversal Pattern Detected',
    description: 'Suspicious path traversal pattern (../) found in code',
    owaspId: 'A01:2021',
    cweId: 'CWE-22',
    remediation: 'Validate paths and ensure they resolve within expected directories',
  },
  {
    id: 'path-traversal-writefile',
    pattern: /(?:writeFile|writeFileSync)\s*\([^)]*\+/g,
    category: 'access-control',
    severity: 'high',
    title: 'Path Traversal via File Write',
    description: 'File write operation with concatenated path may allow directory traversal',
    owaspId: 'A01:2021',
    cweId: 'CWE-22',
    remediation: 'Validate file paths before writing; ensure path is within allowed directory',
  },
  {
    id: 'path-traversal-createstream',
    pattern: /createReadStream\s*\([^)]*\+/g,
    category: 'access-control',
    severity: 'high',
    title: 'Path Traversal via Stream',
    description: 'Stream creation with concatenated path may allow directory traversal',
    owaspId: 'A01:2021',
    cweId: 'CWE-22',
    remediation: 'Validate and sanitize file paths before creating streams',
  },
];

/**
 * Command Injection Detection Patterns
 * OWASP A03:2021 - Injection
 */
const COMMAND_INJECTION_PATTERNS: SecurityPattern[] = [
  {
    id: 'cmd-injection-exec',
    pattern: /exec\s*\([^)]*\+[^)]*\)|exec\s*\(\s*`[^`]*\$\{/g,
    category: 'injection',
    severity: 'critical',
    title: 'Command Injection via exec()',
    description: 'Shell command execution with unsanitized input',
    owaspId: 'A03:2021',
    cweId: 'CWE-78',
    remediation: 'Use execFile() with argument array instead of exec() with string concatenation',
    fixExample: 'execFile("command", [arg1, arg2], callback)',
  },
  {
    id: 'cmd-injection-spawn',
    pattern: /spawn\s*\(\s*[^,]+\+|spawn\s*\(\s*`[^`]*\$\{/g,
    category: 'injection',
    severity: 'critical',
    title: 'Command Injection via spawn()',
    description: 'Process spawn with potentially unsanitized command',
    owaspId: 'A03:2021',
    cweId: 'CWE-78',
    remediation: 'Use spawn with command and args array; validate inputs',
    fixExample: 'spawn("command", [sanitizedArg1, sanitizedArg2])',
  },
  {
    id: 'cmd-injection-shell-true',
    pattern: /spawn\s*\([^)]+,\s*\{[^}]*shell\s*:\s*true/g,
    category: 'injection',
    severity: 'high',
    title: 'Dangerous Shell Option in spawn()',
    description: 'spawn() with shell: true can enable command injection',
    owaspId: 'A03:2021',
    cweId: 'CWE-78',
    remediation: 'Avoid shell: true option; use direct command execution',
  },
];

/**
 * Insecure Configuration Detection Patterns
 * OWASP A05:2021 - Security Misconfiguration
 */
const MISCONFIGURATION_PATTERNS: SecurityPattern[] = [
  {
    id: 'misc-cors-wildcard',
    pattern: /cors\s*\(\s*\{[^}]*origin\s*:\s*['"]\*['"]/gi,
    category: 'security-misconfiguration',
    severity: 'medium',
    title: 'Permissive CORS Configuration',
    description: 'CORS allows all origins (*) which may expose sensitive data',
    owaspId: 'A05:2021',
    cweId: 'CWE-942',
    remediation: 'Restrict CORS to specific trusted origins',
    fixExample: 'cors({ origin: ["https://trusted-domain.com"] })',
  },
  {
    id: 'misc-debug-enabled',
    pattern: /debug\s*[:=]\s*true|DEBUG\s*[:=]\s*['"]?true['"]?/gi,
    category: 'security-misconfiguration',
    severity: 'low',
    title: 'Debug Mode Enabled',
    description: 'Debug mode may expose sensitive information in production',
    owaspId: 'A05:2021',
    cweId: 'CWE-489',
    remediation: 'Disable debug mode in production environments',
  },
  {
    id: 'misc-ssl-disabled',
    pattern: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0['"]?/g,
    category: 'security-misconfiguration',
    severity: 'high',
    title: 'TLS Certificate Validation Disabled',
    description: 'Disabling TLS certificate validation exposes to MITM attacks',
    owaspId: 'A05:2021',
    cweId: 'CWE-295',
    remediation: 'Always enable TLS certificate validation in production',
  },
  {
    id: 'misc-helmet-missing',
    pattern: /app\.use\s*\(\s*express\s*\(\s*\)\s*\)/g,
    category: 'security-misconfiguration',
    severity: 'low',
    title: 'Express App Without Security Headers',
    description: 'Express app initialized without helmet or security headers',
    owaspId: 'A05:2021',
    cweId: 'CWE-693',
    remediation: 'Use helmet middleware for security headers',
    fixExample: 'app.use(helmet())',
  },
];

/**
 * Insecure Deserialization Patterns
 * OWASP A08:2021 - Software and Data Integrity Failures
 */
const DESERIALIZATION_PATTERNS: SecurityPattern[] = [
  {
    id: 'deser-yaml-load',
    pattern: /yaml\.load\s*\([^)]+\)/g,
    category: 'insecure-deserialization',
    severity: 'high',
    title: 'Unsafe YAML Deserialization',
    description: 'yaml.load() can execute arbitrary code from untrusted YAML',
    owaspId: 'A08:2021',
    cweId: 'CWE-502',
    remediation: 'Use yaml.safeLoad() or schema-constrained loading',
    fixExample: 'yaml.load(content, { schema: yaml.SAFE_SCHEMA })',
  },
  {
    id: 'deser-serialize-js',
    pattern: /serialize\s*\([^)]+\)|unserialize\s*\([^)]+\)/g,
    category: 'insecure-deserialization',
    severity: 'high',
    title: 'Unsafe Serialization Function',
    description: 'Node serialize/unserialize functions can execute arbitrary code',
    owaspId: 'A08:2021',
    cweId: 'CWE-502',
    remediation: 'Use JSON.parse/stringify for serialization',
  },
];

/**
 * Authentication Weakness Patterns
 * OWASP A07:2021 - Identification and Authentication Failures
 */
const AUTH_PATTERNS: SecurityPattern[] = [
  {
    id: 'auth-weak-jwt-secret',
    pattern: /jwt\.sign\s*\([^)]+,\s*['"][a-zA-Z0-9]{1,16}['"]/g,
    category: 'broken-auth',
    severity: 'high',
    title: 'Weak JWT Secret',
    description: 'JWT signed with a weak or short secret key',
    owaspId: 'A07:2021',
    cweId: 'CWE-327',
    remediation: 'Use a strong, randomly generated secret of at least 256 bits',
  },
  {
    id: 'auth-no-algorithm',
    pattern: /jwt\.verify\s*\([^)]+\)\s*(?!.*algorithm)/g,
    category: 'broken-auth',
    severity: 'medium',
    title: 'JWT Without Algorithm Specification',
    description: 'JWT verification without explicit algorithm can be exploited',
    owaspId: 'A07:2021',
    cweId: 'CWE-347',
    remediation: 'Always specify the expected algorithm in JWT verification',
    fixExample: 'jwt.verify(token, secret, { algorithms: ["HS256"] })',
  },
];

/**
 * All security patterns combined by category for rule set application
 */
const ALL_SECURITY_PATTERNS: SecurityPattern[] = [
  ...SQL_INJECTION_PATTERNS,
  ...XSS_PATTERNS,
  ...SECRET_PATTERNS,
  ...PATH_TRAVERSAL_PATTERNS,
  ...COMMAND_INJECTION_PATTERNS,
  ...MISCONFIGURATION_PATTERNS,
  ...DESERIALIZATION_PATTERNS,
  ...AUTH_PATTERNS,
];

// ============================================================================
// Built-in Rule Sets
// ============================================================================

const BUILT_IN_RULE_SETS: RuleSet[] = [
  {
    id: 'owasp-top-10',
    name: 'OWASP Top 10',
    description: 'OWASP Top 10 most critical security risks',
    ruleCount: 45,
    categories: [
      'injection',
      'broken-auth',
      'sensitive-data',
      'xxe',
      'access-control',
      'security-misconfiguration',
      'xss',
      'insecure-deserialization',
      'vulnerable-components',
      'insufficient-logging',
    ],
  },
  {
    id: 'cwe-sans-25',
    name: 'CWE/SANS Top 25',
    description: 'Most dangerous software errors',
    ruleCount: 38,
    categories: [
      'injection',
      'xss',
      'access-control',
      'sensitive-data',
      'broken-auth',
    ],
  },
  {
    id: 'nodejs-security',
    name: 'Node.js Security',
    description: 'Node.js specific security rules',
    ruleCount: 25,
    categories: ['injection', 'xss', 'sensitive-data', 'security-misconfiguration'],
  },
  {
    id: 'typescript-security',
    name: 'TypeScript Security',
    description: 'TypeScript specific security rules',
    ruleCount: 20,
    categories: ['injection', 'xss', 'sensitive-data'],
  },
];

// ============================================================================
// Mutable Summary Type for Internal Use
// ============================================================================

interface MutableScanSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  informational: number;
  totalFiles: number;
  scanDurationMs: number;
}

// ============================================================================
// Security Scanner Service Implementation
// ============================================================================

export class SecurityScannerService implements ISecurityScannerService {
  private readonly config: SecurityScannerConfig;
  private readonly activeScans: Map<string, ScanStatus> = new Map();
  private readonly osvClient: OSVClient;
  private readonly memory: MemoryBackend;
  private readonly llmRouter?: HybridRouter;

  constructor(
    dependencies: SecurityScannerDependencies | MemoryBackend,
    config: Partial<SecurityScannerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.osvClient = new OSVClient({ enableCache: true });

    // Support both old and new constructor signatures
    if ('memory' in dependencies) {
      this.memory = dependencies.memory;
      this.llmRouter = dependencies.llmRouter;
    } else {
      this.memory = dependencies;
    }
  }

  // ============================================================================
  // ADR-051: LLM Enhancement Methods
  // ============================================================================

  /**
   * Check if LLM analysis is available and enabled
   */
  private isLLMAnalysisAvailable(): boolean {
    return this.config.enableLLMAnalysis && this.llmRouter !== undefined;
  }

  /**
   * Get model ID for the configured tier
   */
  private getModelForTier(tier: number): string {
    switch (tier) {
      case 1: return 'claude-3-5-haiku-20241022';
      case 2: return 'claude-sonnet-4-20250514';
      case 3: return 'claude-sonnet-4-20250514';
      case 4: return 'claude-opus-4-5-20251101';
      default: return 'claude-opus-4-5-20251101'; // Default to Opus for security
    }
  }

  /**
   * Analyze vulnerability with LLM for deeper insights
   * Provides context-aware remediation advice
   */
  private async analyzeVulnerabilityWithLLM(
    vuln: Vulnerability,
    codeContext: string
  ): Promise<RemediationAdvice> {
    if (!this.llmRouter) {
      return this.getDefaultRemediation(vuln);
    }

    try {
      const modelId = this.getModelForTier(this.config.llmModelTier);

      const response: ChatResponse = await this.llmRouter.chat({
        messages: [
          {
            role: 'system',
            content: `You are a senior security engineer. Analyze the vulnerability and provide:
1. Detailed explanation of the risk
2. Code example showing the fix
3. Effort estimate (trivial/minor/moderate/major)
4. Whether it's automatable
Be specific to the code context provided. Return JSON with: { "description": "", "fixExample": "", "estimatedEffort": "minor", "automatable": false }`,
          },
          {
            role: 'user',
            content: `Vulnerability: ${vuln.title} (${vuln.category})
Severity: ${vuln.severity}
Description: ${vuln.description}

Code context:
\`\`\`
${codeContext}
\`\`\`

Provide detailed remediation advice specific to this code.`,
          },
        ],
        model: modelId,
        maxTokens: 1500,
        temperature: 0.2, // Low temperature for accurate security advice
      });

      if (response.content) {
        try {
          const jsonMatch = response.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const analysis = JSON.parse(jsonMatch[0]);
            return {
              description: analysis.description || vuln.remediation?.description || 'Review and fix the vulnerability',
              fixExample: analysis.fixExample || vuln.remediation?.fixExample,
              estimatedEffort: analysis.estimatedEffort || vuln.remediation?.estimatedEffort || 'moderate',
              automatable: analysis.automatable ?? vuln.remediation?.automatable ?? false,
              llmEnhanced: true,
            };
          }
        } catch {
          // JSON parse failed - use default
        }
      }
    } catch (error) {
      console.warn('[SecurityScanner] LLM analysis failed:', error);
    }

    return this.getDefaultRemediation(vuln);
  }

  /**
   * Get default remediation advice without LLM
   */
  private getDefaultRemediation(vuln: Vulnerability): RemediationAdvice {
    return vuln.remediation || {
      description: 'Review and fix the vulnerability following security best practices',
      estimatedEffort: 'moderate',
      automatable: false,
    };
  }

  // ==========================================================================
  // SAST Methods
  // ==========================================================================

  /**
   * Scan files for security vulnerabilities using static analysis
   */
  async scanFiles(files: FilePath[]): Promise<Result<SASTResult>> {
    return this.scanWithRules(files, this.config.defaultRuleSets);
  }

  /**
   * Scan with specific rule sets
   */
  async scanWithRules(
    files: FilePath[],
    ruleSetIds: string[]
  ): Promise<Result<SASTResult>> {
    const scanId = uuidv4();

    try {
      if (files.length === 0) {
        return err(new Error('No files provided for scanning'));
      }

      this.activeScans.set(scanId, 'running');
      const startTime = Date.now();

      // Get applicable rule sets
      const ruleSets = BUILT_IN_RULE_SETS.filter((rs) =>
        ruleSetIds.includes(rs.id)
      );

      if (ruleSets.length === 0) {
        return err(new Error(`No valid rule sets found: ${ruleSetIds.join(', ')}`));
      }

      // Perform static analysis on each file
      const vulnerabilities: Vulnerability[] = [];
      let linesScanned = 0;

      for (const file of files) {
        const fileVulns = await this.analyzeFile(file, ruleSets);
        vulnerabilities.push(...fileVulns.vulnerabilities);
        linesScanned += fileVulns.linesScanned;
      }

      const scanDurationMs = Date.now() - startTime;

      // Calculate summary
      const summary = this.calculateSummary(
        vulnerabilities,
        files.length,
        scanDurationMs
      );

      // Calculate coverage
      const coverage: SecurityCoverage = {
        filesScanned: files.length,
        linesScanned,
        rulesApplied: ruleSets.reduce((acc, rs) => acc + rs.ruleCount, 0),
      };

      // Store scan results in memory
      await this.storeScanResults(scanId, 'sast', vulnerabilities, summary);

      this.activeScans.set(scanId, 'completed');

      return ok({
        scanId,
        vulnerabilities,
        summary,
        coverage,
      });
    } catch (error) {
      this.activeScans.set(scanId, 'failed');
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get available rule sets
   */
  async getAvailableRuleSets(): Promise<RuleSet[]> {
    // Return built-in rule sets plus any custom ones from memory
    const customRuleSets = await this.memory.get<RuleSet[]>(
      'security:custom-rule-sets'
    );

    return [...BUILT_IN_RULE_SETS, ...(customRuleSets || [])];
  }

  /**
   * Check if vulnerability is a false positive
   */
  async checkFalsePositive(
    vulnerability: Vulnerability
  ): Promise<Result<FalsePositiveCheck>> {
    try {
      if (!this.config.enableFalsePositiveDetection) {
        return ok({
          isFalsePositive: false,
          confidence: 0,
          reason: 'False positive detection is disabled',
        });
      }

      // Analyze vulnerability using heuristics-based false positive detection
      const analysis = await this.analyzeFalsePositive(vulnerability);

      // Store the check result for learning
      await this.memory.set(
        `security:fp-check:${vulnerability.id}`,
        { vulnerability, analysis },
        { namespace: 'security-compliance', ttl: 86400 * 30 } // 30 days
      );

      return ok(analysis);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ==========================================================================
  // DAST Methods
  // ==========================================================================

  /**
   * Scan running application using dynamic analysis
   */
  async scanUrl(
    targetUrl: string,
    options?: DASTOptions
  ): Promise<Result<DASTResult>> {
    const scanId = uuidv4();

    try {
      this.activeScans.set(scanId, 'running');
      const startTime = Date.now();

      const mergedOptions: DASTOptions = {
        maxDepth: options?.maxDepth ?? this.config.dastMaxDepth,
        activeScanning: options?.activeScanning ?? this.config.dastActiveScanning,
        timeout: options?.timeout ?? this.config.timeout,
        excludePatterns: options?.excludePatterns ?? [],
      };

      // Perform dynamic analysis
      const result = await this.performDynamicScan(targetUrl, mergedOptions);

      const scanDurationMs = Date.now() - startTime;

      const summary = this.calculateSummary(
        result.vulnerabilities,
        1,
        scanDurationMs
      );

      // Store results
      await this.storeScanResults(scanId, 'dast', result.vulnerabilities, summary);

      this.activeScans.set(scanId, 'completed');

      return ok({
        scanId,
        targetUrl,
        vulnerabilities: result.vulnerabilities,
        summary,
        crawledUrls: result.crawledUrls,
      });
    } catch (error) {
      this.activeScans.set(scanId, 'failed');
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Scan authenticated endpoints
   */
  async scanAuthenticated(
    targetUrl: string,
    credentials: AuthCredentials,
    options?: DASTOptions
  ): Promise<Result<DASTResult>> {
    const scanId = uuidv4();

    try {
      this.activeScans.set(scanId, 'running');
      const startTime = Date.now();

      // Validate credentials
      const credValidation = this.validateCredentials(credentials);
      if (!credValidation.valid) {
        return err(new Error(credValidation.reason));
      }

      const mergedOptions: DASTOptions = {
        maxDepth: options?.maxDepth ?? this.config.dastMaxDepth,
        activeScanning: options?.activeScanning ?? this.config.dastActiveScanning,
        timeout: options?.timeout ?? this.config.timeout,
        excludePatterns: options?.excludePatterns ?? [],
      };

      // Perform authenticated dynamic analysis
      const result = await this.performAuthenticatedScan(
        targetUrl,
        credentials,
        mergedOptions
      );

      const scanDurationMs = Date.now() - startTime;

      const summary = this.calculateSummary(
        result.vulnerabilities,
        1,
        scanDurationMs
      );

      // Store results (without credentials)
      await this.storeScanResults(scanId, 'dast-auth', result.vulnerabilities, summary);

      this.activeScans.set(scanId, 'completed');

      return ok({
        scanId,
        targetUrl,
        vulnerabilities: result.vulnerabilities,
        summary,
        crawledUrls: result.crawledUrls,
      });
    } catch (error) {
      this.activeScans.set(scanId, 'failed');
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get scan status
   */
  async getScanStatus(scanId: string): Promise<ScanStatus> {
    return this.activeScans.get(scanId) ?? 'pending';
  }

  // ==========================================================================
  // Combined Scanning
  // ==========================================================================

  /**
   * Run combined SAST and DAST scan
   */
  async runFullScan(
    files: FilePath[],
    targetUrl?: string,
    options?: DASTOptions
  ): Promise<Result<FullScanResult>> {
    try {
      // Run SAST scan
      const sastResult = await this.scanWithRules(files, this.config.defaultRuleSets);
      if (sastResult.success === false) {
        return err(sastResult.error);
      }

      // Run DAST scan if target URL provided
      let dastResult: DASTResult | undefined;
      if (targetUrl) {
        const dastScan = await this.scanUrl(targetUrl, options);
        if (dastScan.success) {
          dastResult = dastScan.value;
        }
        // Don't fail the full scan if DAST fails
      }

      // Combine summaries
      const combinedSummary = this.combineSummaries(
        sastResult.value.summary,
        dastResult?.summary
      );

      return ok({
        sastResult: sastResult.value,
        dastResult,
        combinedSummary,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  /**
   * Analyze a file for security vulnerabilities using pattern-based detection
   */
  private async analyzeFile(
    file: FilePath,
    ruleSets: RuleSet[]
  ): Promise<{ vulnerabilities: Vulnerability[]; linesScanned: number }> {
    const vulnerabilities: Vulnerability[] = [];
    const filePath = file.value;
    const extension = file.extension;

    // Read file content
    let content: string;
    let lines: string[];
    try {
      const fs = await import('fs/promises');
      content = await fs.readFile(filePath, 'utf-8');
      lines = content.split('\n');
    } catch (error) {
      // File not accessible - return empty results
      return { vulnerabilities: [], linesScanned: 0 };
    }

    const linesScanned = lines.length;

    // Only scan supported file types
    const supportedExtensions = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'];
    if (!supportedExtensions.includes(extension)) {
      return { vulnerabilities: [], linesScanned };
    }

    // Get applicable categories from rule sets
    const applicableCategories = new Set(ruleSets.flatMap((rs) => rs.categories));

    // Filter patterns to only those matching applicable categories
    const applicablePatterns = ALL_SECURITY_PATTERNS.filter((pattern) =>
      applicableCategories.has(pattern.category)
    );

    // Scan content for each pattern
    for (const securityPattern of applicablePatterns) {
      const matches = this.findPatternMatches(content, lines, securityPattern);
      for (const match of matches) {
        // Skip if in comments or string that looks like documentation
        if (this.isInComment(content, match.index) || this.isInDocumentation(match.snippet)) {
          continue;
        }

        // Skip nosec annotations
        if (this.hasNosecAnnotation(lines, match.line)) {
          continue;
        }

        vulnerabilities.push(
          this.createVulnerabilityFromPattern(securityPattern, filePath, match)
        );
      }
    }

    return { vulnerabilities, linesScanned };
  }

  /**
   * Find all matches of a security pattern in the file content
   */
  private findPatternMatches(
    content: string,
    lines: string[],
    securityPattern: SecurityPattern
  ): Array<{ index: number; line: number; column: number; snippet: string }> {
    const matches: Array<{ index: number; line: number; column: number; snippet: string }> = [];

    // Reset regex state for global patterns
    const pattern = new RegExp(securityPattern.pattern.source, securityPattern.pattern.flags);

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const index = match.index;
      const { line, column } = this.getLineAndColumn(content, index);

      // Extract snippet with context (the matched line plus surrounding context)
      const snippetLines: string[] = [];
      const startLine = Math.max(0, line - 2);
      const endLine = Math.min(lines.length - 1, line + 1);
      for (let i = startLine; i <= endLine; i++) {
        snippetLines.push(lines[i]);
      }
      const snippet = snippetLines.join('\n');

      matches.push({ index, line: line + 1, column: column + 1, snippet }); // 1-indexed
    }

    return matches;
  }

  /**
   * Convert character index to line and column numbers
   */
  private getLineAndColumn(content: string, index: number): { line: number; column: number } {
    const beforeMatch = content.substring(0, index);
    const lines = beforeMatch.split('\n');
    const line = lines.length - 1;
    const column = lines[lines.length - 1].length;
    return { line, column };
  }

  /**
   * Check if the match is inside a comment
   */
  private isInComment(content: string, index: number): boolean {
    const beforeMatch = content.substring(0, index);

    // Check for single-line comment
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const currentLine = beforeMatch.substring(lastNewline + 1);
    if (currentLine.includes('//')) {
      const commentStart = currentLine.indexOf('//');
      if (index - (beforeMatch.length - currentLine.length) > commentStart) {
        return true;
      }
    }

    // Check for multi-line comment
    const lastBlockCommentStart = beforeMatch.lastIndexOf('/*');
    const lastBlockCommentEnd = beforeMatch.lastIndexOf('*/');
    if (lastBlockCommentStart > lastBlockCommentEnd) {
      return true;
    }

    return false;
  }

  /**
   * Check if the snippet appears to be in documentation or test code examples
   */
  private isInDocumentation(snippet: string): boolean {
    const docPatterns = [
      /\*\s*@example/i,
      /\*\s*@description/i,
      /\/\/\s*example:/i,
      /\/\/\s*e\.g\./i,
      /```[\s\S]*```/,
    ];
    return docPatterns.some((pattern) => pattern.test(snippet));
  }

  /**
   * Check if the line has a nosec annotation
   */
  private hasNosecAnnotation(lines: string[], lineNumber: number): boolean {
    const lineIndex = lineNumber - 1;
    if (lineIndex < 0 || lineIndex >= lines.length) {
      return false;
    }

    const currentLine = lines[lineIndex];
    const previousLine = lineIndex > 0 ? lines[lineIndex - 1] : '';

    const nosecPatterns = [
      /\/\/\s*nosec/i,
      /\/\/\s*security-ignore/i,
      /\/\*\s*nosec\s*\*\//i,
      /#\s*nosec/i,
    ];

    return nosecPatterns.some(
      (pattern) => pattern.test(currentLine) || pattern.test(previousLine)
    );
  }

  /**
   * Create a Vulnerability object from a pattern match
   */
  private createVulnerabilityFromPattern(
    pattern: SecurityPattern,
    file: string,
    match: { line: number; column: number; snippet: string }
  ): Vulnerability {
    const location: VulnerabilityLocation = {
      file,
      line: match.line,
      column: match.column,
      snippet: match.snippet,
    };

    const remediation: RemediationAdvice = {
      description: pattern.remediation,
      fixExample: pattern.fixExample,
      estimatedEffort: this.getEffortForSeverity(pattern.severity),
      automatable: pattern.severity === 'low' || pattern.severity === 'informational',
    };

    return {
      id: uuidv4(),
      cveId: undefined,
      title: pattern.title,
      description: `${pattern.description} [${pattern.cweId}]`,
      severity: pattern.severity,
      category: pattern.category,
      location,
      remediation,
      references: [
        `https://owasp.org/Top10/${pattern.owaspId.replace(':', '_')}/`,
        `https://cwe.mitre.org/data/definitions/${pattern.cweId.replace('CWE-', '')}.html`,
      ],
    };
  }

  private getEffortForSeverity(
    severity: VulnerabilitySeverity
  ): RemediationAdvice['estimatedEffort'] {
    const efforts: Record<VulnerabilitySeverity, RemediationAdvice['estimatedEffort']> = {
      critical: 'major',
      high: 'moderate',
      medium: 'minor',
      low: 'trivial',
      informational: 'trivial',
    };
    return efforts[severity];
  }

  /**
   * Perform dynamic (DAST) scanning on a target URL
   * Makes actual HTTP requests to detect security vulnerabilities
   *
   * **Capabilities:**
   * - Security header analysis (HSTS, CSP, X-Frame-Options, etc.)
   * - Cookie security (Secure, HttpOnly, SameSite flags)
   * - CORS misconfiguration detection
   * - Sensitive file exposure (/.git, /.env, etc.)
   * - Link crawling with same-origin scope
   * - XSS reflection testing (GET parameters)
   * - SQL injection error-based detection (GET parameters)
   * - Form security analysis (CSRF tokens, autocomplete, action URLs)
   *
   * **Limitations:**
   * - Injection testing: GET parameters only (POST form submission not implemented)
   * - Crawling: Same-origin only, max 10 links per page, single depth
   * - Auth flows: Header-based only, no login form automation
   * - No JavaScript execution (static response analysis only)
   * - No session management testing beyond cookie attributes
   */
  private async performDynamicScan(
    targetUrl: string,
    options: DASTOptions
  ): Promise<{ vulnerabilities: Vulnerability[]; crawledUrls: number }> {
    const vulnerabilities: Vulnerability[] = [];
    let crawledUrls = 0;

    try {
      // Validate and parse URL
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(targetUrl);
      } catch {
        // Invalid URL - return informational finding
        vulnerabilities.push({
          id: uuidv4(),
          title: 'Invalid Target URL',
          description: 'The provided target URL is not valid',
          severity: 'informational',
          category: 'security-misconfiguration',
          location: { file: targetUrl },
          remediation: { description: 'Provide a valid URL', estimatedEffort: 'trivial', automatable: false },
          references: [],
        });
        return { vulnerabilities, crawledUrls: 0 };
      }

      const timeout = options.timeout ?? this.config.timeout;
      const maxDepth = options.maxDepth ?? this.config.dastMaxDepth;

      // Perform main page scan
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), Math.min(timeout, 30000));

      try {
        const response = await fetch(targetUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'AgenticQE-DAST-Scanner/3.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          signal: controller.signal,
          redirect: 'follow',
        });

        clearTimeout(timeoutId);
        crawledUrls++;

        // Security header analysis
        const headers = response.headers;

        // Check for missing security headers
        const headerChecks = [
          { header: 'strict-transport-security', title: 'Missing HSTS Header', severity: 'medium' as VulnerabilitySeverity, remediation: 'Add Strict-Transport-Security header' },
          { header: 'x-content-type-options', title: 'Missing X-Content-Type-Options', severity: 'low' as VulnerabilitySeverity, remediation: 'Add X-Content-Type-Options: nosniff' },
          { header: 'x-frame-options', title: 'Missing X-Frame-Options', severity: 'medium' as VulnerabilitySeverity, remediation: 'Add X-Frame-Options: DENY or SAMEORIGIN' },
          { header: 'content-security-policy', title: 'Missing Content-Security-Policy', severity: 'medium' as VulnerabilitySeverity, remediation: 'Implement a Content-Security-Policy' },
          { header: 'referrer-policy', title: 'Missing Referrer-Policy', severity: 'low' as VulnerabilitySeverity, remediation: 'Add Referrer-Policy header' },
          { header: 'permissions-policy', title: 'Missing Permissions-Policy', severity: 'low' as VulnerabilitySeverity, remediation: 'Add Permissions-Policy header' },
        ];

        for (const check of headerChecks) {
          if (!headers.get(check.header)) {
            vulnerabilities.push({
              id: uuidv4(),
              title: check.title,
              description: `Security header ${check.header} is not present in the response`,
              severity: check.severity,
              category: 'security-misconfiguration',
              location: { file: targetUrl, snippet: `Missing: ${check.header}` },
              remediation: { description: check.remediation, estimatedEffort: 'minor', automatable: true },
              references: ['https://owasp.org/www-project-secure-headers/'],
            });
          }
        }

        // Check for insecure protocol
        if (parsedUrl.protocol === 'http:') {
          vulnerabilities.push({
            id: uuidv4(),
            title: 'Insecure HTTP Protocol',
            description: 'Application is accessible over unencrypted HTTP',
            severity: 'high',
            category: 'sensitive-data',
            location: { file: targetUrl },
            remediation: { description: 'Redirect all HTTP traffic to HTTPS', estimatedEffort: 'moderate', automatable: false },
            references: ['https://owasp.org/www-project-web-security-testing-guide/'],
          });
        }

        // Check for cookie security
        const setCookie = headers.get('set-cookie');
        if (setCookie) {
          const cookieLower = setCookie.toLowerCase();
          if (!cookieLower.includes('secure')) {
            vulnerabilities.push({
              id: uuidv4(),
              title: 'Cookie Missing Secure Flag',
              description: 'Cookie is set without the Secure attribute',
              severity: 'medium',
              category: 'sensitive-data',
              location: { file: targetUrl, snippet: `Set-Cookie header without Secure flag` },
              remediation: { description: 'Add Secure flag to all cookies', estimatedEffort: 'trivial', automatable: true },
              references: ['https://owasp.org/www-community/controls/SecureCookieAttribute'],
            });
          }
          if (!cookieLower.includes('httponly')) {
            vulnerabilities.push({
              id: uuidv4(),
              title: 'Cookie Missing HttpOnly Flag',
              description: 'Cookie is accessible to client-side JavaScript',
              severity: 'medium',
              category: 'sensitive-data',
              location: { file: targetUrl, snippet: `Set-Cookie header without HttpOnly flag` },
              remediation: { description: 'Add HttpOnly flag to session cookies', estimatedEffort: 'trivial', automatable: true },
              references: ['https://owasp.org/www-community/HttpOnly'],
            });
          }
        }

        // Check for server version disclosure
        const serverHeader = headers.get('server') || headers.get('x-powered-by');
        if (serverHeader && /\d+\.\d+/.test(serverHeader)) {
          vulnerabilities.push({
            id: uuidv4(),
            title: 'Server Version Disclosure',
            description: `Server version information exposed: ${serverHeader}`,
            severity: 'low',
            category: 'security-misconfiguration',
            location: { file: targetUrl, snippet: `Server: ${serverHeader}` },
            remediation: { description: 'Remove or obfuscate server version headers', estimatedEffort: 'trivial', automatable: true },
            references: ['https://owasp.org/www-project-web-security-testing-guide/'],
          });
        }

        // Scan for sensitive file exposure (only if active scanning is enabled)
        if (options.activeScanning ?? this.config.dastActiveScanning) {
          const sensitiveEndpoints = [
            { path: '/.git/config', name: 'Git Configuration' },
            { path: '/.env', name: 'Environment File' },
            { path: '/robots.txt', name: 'Robots.txt' },
            { path: '/sitemap.xml', name: 'Sitemap' },
            { path: '/.htaccess', name: 'htaccess File' },
            { path: '/web.config', name: 'IIS Configuration' },
          ];

          for (const endpoint of sensitiveEndpoints) {
            if (crawledUrls >= maxDepth * 10) break; // Limit crawling

            try {
              const testUrl = new URL(endpoint.path, parsedUrl.origin).toString();
              const testResponse = await fetch(testUrl, {
                method: 'GET',
                signal: AbortSignal.timeout(5000),
              });

              if (testResponse.ok) {
                crawledUrls++;
                const contentType = testResponse.headers.get('content-type') || '';
                const text = await testResponse.text();

                // Verify it's not a custom 404 page
                if (text.length > 20 && !text.toLowerCase().includes('not found') && !text.toLowerCase().includes('404')) {
                  // Check for sensitive content markers
                  const isSensitive =
                    endpoint.path.includes('.git') ||
                    endpoint.path.includes('.env') ||
                    endpoint.path.includes('.htaccess') ||
                    endpoint.path.includes('web.config');

                  if (isSensitive) {
                    vulnerabilities.push({
                      id: uuidv4(),
                      title: `Sensitive File Exposed: ${endpoint.name}`,
                      description: `${endpoint.name} is publicly accessible`,
                      severity: endpoint.path.includes('.git') || endpoint.path.includes('.env') ? 'high' : 'medium',
                      category: 'sensitive-data',
                      location: { file: testUrl },
                      remediation: { description: `Restrict access to ${endpoint.path}`, estimatedEffort: 'trivial', automatable: true },
                      references: ['https://owasp.org/www-project-web-security-testing-guide/'],
                    });
                  }
                }
              }
            } catch {
              // File not accessible - this is expected/good
            }
          }
        }

        // CORS analysis
        try {
          const corsResponse = await fetch(targetUrl, {
            method: 'OPTIONS',
            headers: {
              'Origin': 'https://evil-attacker.com',
              'Access-Control-Request-Method': 'GET',
            },
            signal: AbortSignal.timeout(5000),
          });

          const allowOrigin = corsResponse.headers.get('access-control-allow-origin');
          if (allowOrigin === '*' || allowOrigin === 'https://evil-attacker.com') {
            vulnerabilities.push({
              id: uuidv4(),
              title: 'Overly Permissive CORS Policy',
              description: allowOrigin === '*' ? 'CORS allows all origins' : 'CORS reflects arbitrary origin',
              severity: 'medium',
              category: 'access-control',
              location: { file: targetUrl, snippet: `Access-Control-Allow-Origin: ${allowOrigin}` },
              remediation: { description: 'Restrict CORS to specific trusted origins', estimatedEffort: 'minor', automatable: false },
              references: ['https://owasp.org/www-community/attacks/CORS_OriginHeaderScrutiny'],
            });
          }
        } catch {
          // OPTIONS request failed - CORS might be properly restricted
        }

        // ============================================================
        // ENHANCED DAST: Link crawling, injection testing, form analysis
        // ============================================================

        if (options.activeScanning ?? this.config.dastActiveScanning) {
          const responseText = await response.clone().text();

          // 1. LINK CRAWLING - Extract and scan discovered links
          const discoveredUrls = await this.extractAndCrawlLinks(
            responseText,
            parsedUrl,
            crawledUrls,
            maxDepth,
            vulnerabilities
          );
          crawledUrls = discoveredUrls;

          // 2. INJECTION TESTING - Test URL parameters for XSS/SQLi
          if (parsedUrl.search) {
            await this.testInjectionVulnerabilities(
              targetUrl,
              parsedUrl,
              vulnerabilities
            );
          }

          // 3. FORM DISCOVERY - Analyze forms for security issues
          await this.analyzeFormsForSecurityIssues(
            responseText,
            targetUrl,
            vulnerabilities
          );
        }

      } catch (fetchError) {
        clearTimeout(timeoutId);
        const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);

        if (errorMsg.includes('CERT') || errorMsg.includes('SSL') || errorMsg.includes('TLS') || errorMsg.includes('certificate')) {
          vulnerabilities.push({
            id: uuidv4(),
            title: 'TLS Certificate Error',
            description: `SSL/TLS error: ${errorMsg}`,
            severity: 'high',
            category: 'security-misconfiguration',
            location: { file: targetUrl },
            remediation: { description: 'Fix TLS certificate configuration', estimatedEffort: 'moderate', automatable: false },
            references: ['https://owasp.org/www-project-web-security-testing-guide/'],
          });
        } else if (errorMsg.includes('timeout') || errorMsg.includes('abort')) {
          vulnerabilities.push({
            id: uuidv4(),
            title: 'Connection Timeout',
            description: `Target did not respond within timeout: ${errorMsg}`,
            severity: 'informational',
            category: 'security-misconfiguration',
            location: { file: targetUrl },
            remediation: { description: 'Verify target is accessible', estimatedEffort: 'trivial', automatable: false },
            references: [],
          });
        }
      }

    } catch (error) {
      console.error('DAST scan error:', error);
    }

    return { vulnerabilities, crawledUrls };
  }

  /**
   * Perform authenticated dynamic scanning with credentials
   * Supports basic auth, bearer token, OAuth, and cookie-based authentication
   */
  private async performAuthenticatedScan(
    targetUrl: string,
    credentials: AuthCredentials,
    options: DASTOptions
  ): Promise<{ vulnerabilities: Vulnerability[]; crawledUrls: number }> {
    const vulnerabilities: Vulnerability[] = [];
    let crawledUrls = 0;

    try {
      // Build authentication headers based on credential type
      const authHeaders: Record<string, string> = {};

      switch (credentials.type) {
        case 'basic':
          if (credentials.username && credentials.password) {
            const encoded = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
            authHeaders['Authorization'] = `Basic ${encoded}`;
          }
          break;
        case 'bearer':
        case 'oauth':
          if (credentials.token) {
            authHeaders['Authorization'] = `Bearer ${credentials.token}`;
          }
          break;
        case 'cookie':
          if (credentials.token) {
            authHeaders['Cookie'] = credentials.token;
          }
          break;
      }

      // Validate and parse URL
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(targetUrl);
      } catch {
        vulnerabilities.push({
          id: uuidv4(),
          title: 'Invalid Target URL',
          description: 'The provided target URL is not valid',
          severity: 'informational',
          category: 'security-misconfiguration',
          location: { file: targetUrl },
          remediation: { description: 'Provide a valid URL', estimatedEffort: 'trivial', automatable: false },
          references: [],
        });
        return { vulnerabilities, crawledUrls: 0 };
      }

      const timeout = options.timeout ?? this.config.timeout;
      const maxDepth = options.maxDepth ?? this.config.dastMaxDepth;

      // Test authentication by making an authenticated request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), Math.min(timeout, 30000));

      try {
        const response = await fetch(targetUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'AgenticQE-DAST-Scanner/3.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            ...authHeaders,
          },
          signal: controller.signal,
          redirect: 'follow',
        });

        clearTimeout(timeoutId);
        crawledUrls++;

        // Check if authentication was successful
        if (response.status === 401 || response.status === 403) {
          vulnerabilities.push({
            id: uuidv4(),
            title: 'Authentication Failed',
            description: `Authentication returned ${response.status} status`,
            severity: 'informational',
            category: 'broken-auth',
            location: { file: targetUrl },
            remediation: { description: 'Verify credentials are correct', estimatedEffort: 'trivial', automatable: false },
            references: [],
          });
        }

        // Perform all the standard header checks from unauthenticated scan
        const headers = response.headers;

        // Security header analysis (same as unauthenticated)
        const headerChecks = [
          { header: 'strict-transport-security', title: 'Missing HSTS Header', severity: 'medium' as VulnerabilitySeverity },
          { header: 'x-content-type-options', title: 'Missing X-Content-Type-Options', severity: 'low' as VulnerabilitySeverity },
          { header: 'x-frame-options', title: 'Missing X-Frame-Options', severity: 'medium' as VulnerabilitySeverity },
          { header: 'content-security-policy', title: 'Missing Content-Security-Policy', severity: 'medium' as VulnerabilitySeverity },
        ];

        for (const check of headerChecks) {
          if (!headers.get(check.header)) {
            vulnerabilities.push({
              id: uuidv4(),
              title: check.title,
              description: `Security header ${check.header} is not present`,
              severity: check.severity,
              category: 'security-misconfiguration',
              location: { file: targetUrl, snippet: `Missing: ${check.header}` },
              remediation: { description: `Add ${check.header} header`, estimatedEffort: 'minor', automatable: true },
              references: ['https://owasp.org/www-project-secure-headers/'],
            });
          }
        }

        // Check for session token in URL (authenticated-specific)
        if (parsedUrl.search.includes('token=') || parsedUrl.search.includes('session=') || parsedUrl.search.includes('auth=')) {
          vulnerabilities.push({
            id: uuidv4(),
            title: 'Session Token in URL',
            description: 'Authentication token appears in URL query string',
            severity: 'high',
            category: 'sensitive-data',
            location: { file: targetUrl, snippet: parsedUrl.search.substring(0, 50) },
            remediation: { description: 'Send tokens in headers or request body, not URL', estimatedEffort: 'moderate', automatable: false },
            references: ['https://owasp.org/www-community/vulnerabilities/Information_exposure_through_query_strings_in_url'],
          });
        }

        // Test for authorization bypass on protected endpoints (authenticated-specific)
        if (options.activeScanning ?? this.config.dastActiveScanning) {
          const protectedEndpoints = [
            '/admin',
            '/dashboard',
            '/api/users',
            '/api/admin',
            '/settings',
            '/profile',
          ];

          for (const endpoint of protectedEndpoints) {
            if (crawledUrls >= maxDepth * 15) break;

            try {
              const testUrl = new URL(endpoint, parsedUrl.origin).toString();

              // First, try with authentication
              const authResponse = await fetch(testUrl, {
                method: 'GET',
                headers: { ...authHeaders },
                signal: AbortSignal.timeout(5000),
              });

              if (authResponse.ok) {
                crawledUrls++;

                // Now try without authentication
                const unauthResponse = await fetch(testUrl, {
                  method: 'GET',
                  signal: AbortSignal.timeout(5000),
                });

                // If both succeed, there might be missing authentication
                if (unauthResponse.ok && unauthResponse.status === 200) {
                  const authText = await authResponse.text();
                  const unauthText = await unauthResponse.text();

                  // Check if the responses are similar (both returning actual content)
                  if (authText.length > 100 && unauthText.length > 100 &&
                      Math.abs(authText.length - unauthText.length) < authText.length * 0.1) {
                    vulnerabilities.push({
                      id: uuidv4(),
                      title: 'Missing Authentication on Protected Endpoint',
                      description: `Endpoint ${endpoint} is accessible without authentication`,
                      severity: 'high',
                      category: 'broken-auth',
                      location: { file: testUrl },
                      remediation: { description: 'Implement proper authentication checks', estimatedEffort: 'moderate', automatable: false },
                      references: ['https://owasp.org/www-project-web-security-testing-guide/'],
                    });
                  }
                }
              }
            } catch {
              // Endpoint not accessible - expected
            }
          }

          // Test for Insecure Direct Object References (IDOR)
          const idorEndpoints = [
            '/api/users/1',
            '/api/users/2',
            '/api/orders/1',
            '/profile/1',
          ];

          for (const endpoint of idorEndpoints.slice(0, 2)) {
            if (crawledUrls >= maxDepth * 15) break;

            try {
              const testUrl = new URL(endpoint, parsedUrl.origin).toString();
              const response = await fetch(testUrl, {
                method: 'GET',
                headers: { ...authHeaders },
                signal: AbortSignal.timeout(5000),
              });

              if (response.ok) {
                crawledUrls++;
                const text = await response.text();

                // If we can access other users' data, that's an IDOR
                if (text.includes('email') || text.includes('password') || text.includes('phone')) {
                  vulnerabilities.push({
                    id: uuidv4(),
                    title: 'Potential Insecure Direct Object Reference (IDOR)',
                    description: `Endpoint ${endpoint} may expose other users' data`,
                    severity: 'high',
                    category: 'access-control',
                    location: { file: testUrl },
                    remediation: { description: 'Implement proper authorization checks for resource access', estimatedEffort: 'moderate', automatable: false },
                    references: ['https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/04-Testing_for_Insecure_Direct_Object_References'],
                  });
                }
              }
            } catch {
              // Endpoint not accessible
            }
          }
        }

        // Cookie security checks
        const setCookie = headers.get('set-cookie');
        if (setCookie) {
          const cookieLower = setCookie.toLowerCase();
          if (!cookieLower.includes('secure')) {
            vulnerabilities.push({
              id: uuidv4(),
              title: 'Session Cookie Missing Secure Flag',
              description: 'Authenticated session cookie is not marked as Secure',
              severity: 'high', // Higher severity for authenticated sessions
              category: 'sensitive-data',
              location: { file: targetUrl },
              remediation: { description: 'Add Secure flag to session cookies', estimatedEffort: 'trivial', automatable: true },
              references: ['https://owasp.org/www-community/controls/SecureCookieAttribute'],
            });
          }
          if (!cookieLower.includes('httponly')) {
            vulnerabilities.push({
              id: uuidv4(),
              title: 'Session Cookie Missing HttpOnly Flag',
              description: 'Session cookie is accessible to JavaScript',
              severity: 'high',
              category: 'sensitive-data',
              location: { file: targetUrl },
              remediation: { description: 'Add HttpOnly flag to session cookies', estimatedEffort: 'trivial', automatable: true },
              references: ['https://owasp.org/www-community/HttpOnly'],
            });
          }
        }

      } catch (fetchError) {
        clearTimeout(timeoutId);
        const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);

        if (errorMsg.includes('CERT') || errorMsg.includes('SSL') || errorMsg.includes('TLS')) {
          vulnerabilities.push({
            id: uuidv4(),
            title: 'TLS Certificate Error',
            description: `SSL/TLS error during authenticated scan: ${errorMsg}`,
            severity: 'high',
            category: 'security-misconfiguration',
            location: { file: targetUrl },
            remediation: { description: 'Fix TLS certificate configuration', estimatedEffort: 'moderate', automatable: false },
            references: [],
          });
        }
      }

    } catch (error) {
      console.error('Authenticated DAST scan error:', error);
    }

    return { vulnerabilities, crawledUrls };
  }

  private validateCredentials(credentials: AuthCredentials): {
    valid: boolean;
    reason?: string;
  } {
    switch (credentials.type) {
      case 'basic':
        if (!credentials.username || !credentials.password) {
          return { valid: false, reason: 'Basic auth requires username and password' };
        }
        break;
      case 'bearer':
      case 'oauth':
        if (!credentials.token) {
          return { valid: false, reason: 'Bearer/OAuth auth requires token' };
        }
        break;
      case 'cookie':
        if (!credentials.token) {
          return { valid: false, reason: 'Cookie auth requires session cookie' };
        }
        break;
    }
    return { valid: true };
  }

  /**
   * Analyze if a vulnerability detection is a false positive using heuristics
   * Future enhancement: integrate ML/AI models for improved false positive detection
   */
  private async analyzeFalsePositive(
    vulnerability: Vulnerability
  ): Promise<FalsePositiveCheck> {
    let isFalsePositive = false;
    let confidence = 0.5;
    let reason = 'Manual review recommended';

    // Check for common false positive patterns
    if (vulnerability.severity === 'informational') {
      confidence = 0.3;
      reason = 'Low severity findings often require manual verification';
    }

    if (
      vulnerability.location.snippet?.includes('test') ||
      vulnerability.location.file.includes('test')
    ) {
      isFalsePositive = true;
      confidence = 0.8;
      reason = 'Vulnerability found in test code';
    }

    if (vulnerability.location.snippet?.includes('// nosec')) {
      isFalsePositive = true;
      confidence = 0.95;
      reason = 'Explicitly marked as ignored with nosec comment';
    }

    return { isFalsePositive, confidence, reason };
  }

  private calculateSummary(
    vulnerabilities: Vulnerability[],
    totalFiles: number,
    scanDurationMs: number
  ): ScanSummary {
    const summary: MutableScanSummary = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      informational: 0,
      totalFiles,
      scanDurationMs,
    };

    for (const vuln of vulnerabilities) {
      summary[vuln.severity]++;
    }

    return summary as ScanSummary;
  }

  private combineSummaries(
    sast: ScanSummary,
    dast?: ScanSummary
  ): ScanSummary {
    if (!dast) return sast;

    return {
      critical: sast.critical + dast.critical,
      high: sast.high + dast.high,
      medium: sast.medium + dast.medium,
      low: sast.low + dast.low,
      informational: sast.informational + dast.informational,
      totalFiles: sast.totalFiles + dast.totalFiles,
      scanDurationMs: sast.scanDurationMs + dast.scanDurationMs,
    };
  }

  private async storeScanResults(
    scanId: string,
    scanType: string,
    vulnerabilities: Vulnerability[],
    summary: ScanSummary
  ): Promise<void> {
    await this.memory.set(
      `security:scan:${scanId}`,
      {
        scanId,
        scanType,
        vulnerabilities,
        summary,
        timestamp: new Date().toISOString(),
      },
      { namespace: 'security-compliance', ttl: 86400 * 7 } // 7 days
    );
  }

  // ==========================================================================
  // Dependency Scanning Methods (OSV API)
  // ==========================================================================

  /**
   * Scan npm dependencies for known vulnerabilities using OSV API
   */
  async scanDependencies(
    dependencies: Record<string, string>
  ): Promise<Result<DependencyScanResult>> {
    const scanId = uuidv4();
    const startTime = Date.now();

    try {
      if (Object.keys(dependencies).length === 0) {
        return err(new Error('No dependencies provided for scanning'));
      }

      this.activeScans.set(scanId, 'running');

      // Query OSV for vulnerabilities
      const osvVulns = await this.osvClient.scanNpmDependencies(dependencies);

      // Convert OSV vulnerabilities to our format
      const vulnerabilities = this.convertOSVVulnerabilities(osvVulns);

      const scanDurationMs = Date.now() - startTime;

      // Calculate unique vulnerable packages
      const vulnerablePackageNames = new Set(
        osvVulns.map((v) => v.affectedPackage)
      );

      // Calculate summary
      const summary = this.calculateSummary(
        vulnerabilities,
        Object.keys(dependencies).length,
        scanDurationMs
      );

      // Store scan results
      await this.storeScanResults(scanId, 'dependency', vulnerabilities, summary);
      this.activeScans.set(scanId, 'completed');

      return ok({
        scanId,
        vulnerabilities,
        packagesScanned: Object.keys(dependencies).length,
        vulnerablePackages: vulnerablePackageNames.size,
        summary,
        scanDurationMs,
      });
    } catch (error) {
      this.activeScans.set(scanId, 'failed');
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Scan a package.json file for dependency vulnerabilities
   */
  async scanPackageJson(packageJsonPath: string): Promise<Result<DependencyScanResult>> {
    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);

      // Combine all dependency types
      const allDependencies: Record<string, string> = {
        ...(packageJson.dependencies || {}),
        ...(packageJson.devDependencies || {}),
        ...(packageJson.peerDependencies || {}),
        ...(packageJson.optionalDependencies || {}),
      };

      if (Object.keys(allDependencies).length === 0) {
        return err(new Error('No dependencies found in package.json'));
      }

      return this.scanDependencies(allDependencies);
    } catch (error) {
      if (error instanceof SyntaxError) {
        return err(new Error(`Invalid JSON in package.json: ${error.message}`));
      }
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Convert OSV vulnerabilities to our internal format
   */
  private convertOSVVulnerabilities(
    osvVulns: ParsedVulnerability[]
  ): Vulnerability[] {
    return osvVulns.map((osv) => {
      const location: VulnerabilityLocation = {
        file: 'package.json',
        line: 1,
        column: 1,
        snippet: `"${osv.affectedPackage}": "..."`,
      };

      const remediation: RemediationAdvice = {
        description: osv.fixedVersions.length > 0
          ? `Update to version ${osv.fixedVersions[0]} or later`
          : 'No fixed version available; consider alternative packages',
        fixExample: osv.fixedVersions.length > 0
          ? `npm install ${osv.affectedPackage}@${osv.fixedVersions[0]}`
          : undefined,
        estimatedEffort: 'minor',
        automatable: true,
      };

      return {
        id: uuidv4(),
        cveId: osv.cveIds[0],
        title: `${osv.affectedPackage}: ${osv.summary.substring(0, 80)}`,
        description: osv.details || osv.summary,
        severity: this.mapOSVSeverity(osv.severity),
        category: 'dependencies' as VulnerabilityCategory,
        location,
        remediation,
        references: osv.references.slice(0, 5),
      };
    });
  }

  /**
   * Map OSV severity to our severity type
   */
  private mapOSVSeverity(
    osvSeverity: ParsedVulnerability['severity']
  ): VulnerabilitySeverity {
    const mapping: Record<ParsedVulnerability['severity'], VulnerabilitySeverity> = {
      critical: 'critical',
      high: 'high',
      medium: 'medium',
      low: 'low',
      unknown: 'medium',
    };
    return mapping[osvSeverity];
  }

  // ============================================================
  // ENHANCED DAST METHODS
  // ============================================================

  /**
   * Extract links from HTML and crawl discovered pages
   * Implements basic web crawling within same origin
   */
  private async extractAndCrawlLinks(
    html: string,
    baseUrl: URL,
    currentCrawled: number,
    maxDepth: number,
    vulnerabilities: Vulnerability[]
  ): Promise<number> {
    let crawledUrls = currentCrawled;
    const maxCrawl = maxDepth * 5; // Allow more pages based on depth

    // Extract links from HTML using regex (no DOM parser needed)
    const linkPattern = /href=["']([^"']+)["']/gi;
    const discoveredLinks = new Set<string>();
    let match;

    while ((match = linkPattern.exec(html)) !== null) {
      const href = match[1];
      // Only follow same-origin links
      try {
        const linkUrl = new URL(href, baseUrl.origin);
        if (linkUrl.origin === baseUrl.origin && !discoveredLinks.has(linkUrl.pathname)) {
          discoveredLinks.add(linkUrl.pathname);
        }
      } catch {
        // Invalid URL - skip
      }
    }

    // Crawl discovered links (limited)
    const linksToCrawl = Array.from(discoveredLinks).slice(0, Math.min(10, maxCrawl - crawledUrls));

    for (const path of linksToCrawl) {
      if (crawledUrls >= maxCrawl) break;

      try {
        const crawlUrl = new URL(path, baseUrl.origin).toString();
        const crawlResponse = await fetch(crawlUrl, {
          method: 'GET',
          headers: { 'User-Agent': 'AgenticQE-DAST-Scanner/3.0' },
          signal: AbortSignal.timeout(5000),
          redirect: 'follow',
        });

        crawledUrls++;

        // Check for security issues on crawled pages
        if (crawlResponse.ok) {
          // Check for sensitive data exposure in URLs
          if (path.includes('password') || path.includes('token') || path.includes('api_key')) {
            vulnerabilities.push({
              id: uuidv4(),
              title: 'Sensitive Data in URL Path',
              description: `URL path may contain sensitive parameter names: ${path}`,
              severity: 'medium',
              category: 'sensitive-data',
              location: { file: crawlUrl },
              remediation: { description: 'Avoid sensitive data in URL paths', estimatedEffort: 'minor', automatable: false },
              references: ['https://owasp.org/www-community/vulnerabilities/Information_exposure_through_query_strings_in_url'],
            });
          }

          // Check for directory listing
          const responseText = await crawlResponse.text();
          if (responseText.includes('Index of /') || responseText.includes('Directory listing for')) {
            vulnerabilities.push({
              id: uuidv4(),
              title: 'Directory Listing Enabled',
              description: `Directory listing is enabled at: ${crawlUrl}`,
              severity: 'medium',
              category: 'security-misconfiguration',
              location: { file: crawlUrl },
              remediation: { description: 'Disable directory listing in server configuration', estimatedEffort: 'trivial', automatable: true },
              references: ['https://owasp.org/www-project-web-security-testing-guide/'],
            });
          }
        }
      } catch {
        // Page not accessible - expected for some links
      }
    }

    return crawledUrls;
  }

  /**
   * Test URL parameters for injection vulnerabilities (XSS, SQLi)
   * Uses safe payloads that reveal vulnerability without exploitation
   */
  private async testInjectionVulnerabilities(
    targetUrl: string,
    parsedUrl: URL,
    vulnerabilities: Vulnerability[]
  ): Promise<void> {
    const params = new URLSearchParams(parsedUrl.search);
    const paramNames = Array.from(params.keys());

    // Safe test payloads that reveal vulnerability without harm
    const xssPayloads = [
      { payload: '<script>alert(1)</script>', name: 'Basic XSS' },
      { payload: '"><img src=x onerror=alert(1)>', name: 'Attribute Injection' },
      { payload: "'-alert(1)-'", name: 'JavaScript Injection' },
    ];

    const sqliPayloads = [
      { payload: "' OR '1'='1", name: 'SQL OR Injection' },
      { payload: "1; DROP TABLE test--", name: 'SQL Statement Injection' },
      { payload: "1' AND '1'='1", name: 'SQL AND Injection' },
    ];

    // Test each parameter with injection payloads
    for (const paramName of paramNames.slice(0, 3)) { // Limit to first 3 params
      // Test XSS
      for (const xss of xssPayloads) {
        try {
          const testParams = new URLSearchParams(parsedUrl.search);
          testParams.set(paramName, xss.payload);
          const testUrl = `${parsedUrl.origin}${parsedUrl.pathname}?${testParams.toString()}`;

          const response = await fetch(testUrl, {
            method: 'GET',
            headers: { 'User-Agent': 'AgenticQE-DAST-Scanner/3.0' },
            signal: AbortSignal.timeout(5000),
          });

          if (response.ok) {
            const text = await response.text();
            const escapedPayload = xss.payload
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#x27;');

            // Check for XSS vulnerability:
            // 1. Payload reflected unescaped (definite XSS)
            // 2. Payload partially escaped but critical chars remain (potential bypass)
            const hasUnescapedPayload = text.includes(xss.payload);
            const hasEscapedPayload = text.includes(escapedPayload);

            // Only flag if payload is reflected AND it's unescaped
            if (hasUnescapedPayload && !hasEscapedPayload) {
              vulnerabilities.push({
                id: uuidv4(),
                title: `Reflected XSS: ${xss.name}`,
                description: `Parameter '${paramName}' reflects unsanitized input - payload executed without encoding`,
                severity: 'critical',
                category: 'xss',
                location: { file: targetUrl, snippet: `Parameter: ${paramName}, Payload: ${xss.payload.substring(0, 30)}...` },
                remediation: { description: 'HTML-encode all user input before rendering. Use framework auto-escaping.', estimatedEffort: 'moderate', automatable: false },
                references: ['https://owasp.org/www-community/attacks/xss/', 'https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html'],
              });
              break; // One XSS finding per parameter is enough
            }

            // Check for partial escaping (< escaped but not > or vice versa) - potential bypass
            const hasPartialEscape =
              (text.includes('&lt;') && text.includes('>') && text.includes(xss.payload.replace(/</g, '&lt;'))) ||
              (text.includes('<') && text.includes('&gt;') && text.includes(xss.payload.replace(/>/g, '&gt;')));

            if (hasPartialEscape) {
              vulnerabilities.push({
                id: uuidv4(),
                title: `Potential XSS: Inconsistent Encoding`,
                description: `Parameter '${paramName}' has inconsistent HTML encoding - some characters escaped, others not`,
                severity: 'medium',
                category: 'xss',
                location: { file: targetUrl, snippet: `Parameter: ${paramName}` },
                remediation: { description: 'Use consistent HTML encoding for all special characters', estimatedEffort: 'minor', automatable: false },
                references: ['https://owasp.org/www-community/attacks/xss/'],
              });
              break;
            }
          }
        } catch {
          // Request failed - target may be blocking
        }
      }

      // Test SQLi (look for error-based indicators)
      for (const sqli of sqliPayloads) {
        try {
          const testParams = new URLSearchParams(parsedUrl.search);
          testParams.set(paramName, sqli.payload);
          const testUrl = `${parsedUrl.origin}${parsedUrl.pathname}?${testParams.toString()}`;

          const response = await fetch(testUrl, {
            method: 'GET',
            headers: { 'User-Agent': 'AgenticQE-DAST-Scanner/3.0' },
            signal: AbortSignal.timeout(5000),
          });

          const text = await response.text();
          // Look for SQL error indicators
          const sqlErrorPatterns = [
            /SQL syntax.*MySQL/i,
            /Warning.*mysql/i,
            /PostgreSQL.*ERROR/i,
            /ORA-\d{5}/i,
            /SQLite.*error/i,
            /SQLITE_ERROR/i,
            /unclosed quotation mark/i,
            /quoted string not properly terminated/i,
          ];

          for (const pattern of sqlErrorPatterns) {
            if (pattern.test(text)) {
              vulnerabilities.push({
                id: uuidv4(),
                title: `SQL Injection: ${sqli.name}`,
                description: `Parameter '${paramName}' appears vulnerable to SQL injection - database error message exposed`,
                severity: 'critical',
                category: 'injection',
                location: { file: targetUrl, snippet: `Parameter: ${paramName}` },
                remediation: { description: 'Use parameterized queries or prepared statements', estimatedEffort: 'moderate', automatable: false },
                references: ['https://owasp.org/www-community/attacks/SQL_Injection'],
              });
              break;
            }
          }
        } catch {
          // Request failed
        }
      }
    }
  }

  /**
   * Analyze HTML forms for security issues
   * Checks for CSRF protection, autocomplete settings, and action targets
   */
  private async analyzeFormsForSecurityIssues(
    html: string,
    baseUrl: string,
    vulnerabilities: Vulnerability[]
  ): Promise<void> {
    // Extract forms using regex
    const formPattern = /<form[^>]*>([\s\S]*?)<\/form>/gi;
    let formMatch;
    let formIndex = 0;

    while ((formMatch = formPattern.exec(html)) !== null && formIndex < 10) {
      formIndex++;
      const formHtml = formMatch[0];
      const formContent = formMatch[1];

      // Check for CSRF token
      const hasCsrfToken =
        /name=["']?csrf/i.test(formContent) ||
        /name=["']?_token/i.test(formContent) ||
        /name=["']?authenticity_token/i.test(formContent) ||
        /name=["']?__RequestVerificationToken/i.test(formContent);

      // Check form method
      const isPostForm = /method=["']?post/i.test(formHtml);

      if (isPostForm && !hasCsrfToken) {
        vulnerabilities.push({
          id: uuidv4(),
          title: 'Missing CSRF Token',
          description: `POST form #${formIndex} does not appear to have CSRF protection`,
          severity: 'medium',
          category: 'broken-auth',
          location: { file: baseUrl, snippet: `Form #${formIndex}` },
          remediation: { description: 'Add CSRF token to all state-changing forms', estimatedEffort: 'minor', automatable: false },
          references: ['https://owasp.org/www-community/attacks/csrf'],
        });
      }

      // Check for password fields without autocomplete=off
      if (/type=["']?password/i.test(formContent)) {
        const hasAutocompleteOff =
          /autocomplete=["']?(off|new-password)/i.test(formContent) ||
          /autocomplete=["']?(off|new-password)/i.test(formHtml);

        if (!hasAutocompleteOff) {
          vulnerabilities.push({
            id: uuidv4(),
            title: 'Password Field Allows Autocomplete',
            description: `Form #${formIndex} has password field that may be cached by browser`,
            severity: 'low',
            category: 'sensitive-data',
            location: { file: baseUrl, snippet: `Form #${formIndex}` },
            remediation: { description: 'Add autocomplete="new-password" to password fields', estimatedEffort: 'trivial', automatable: true },
            references: ['https://owasp.org/www-project-web-security-testing-guide/'],
          });
        }
      }

      // Check for insecure form action
      const actionMatch = /action=["']?([^"'\s>]+)/i.exec(formHtml);
      if (actionMatch) {
        const action = actionMatch[1];
        if (action.startsWith('http://') && !action.includes('localhost') && !action.includes('127.0.0.1')) {
          vulnerabilities.push({
            id: uuidv4(),
            title: 'Form Submits to Insecure HTTP',
            description: `Form #${formIndex} submits data over insecure HTTP: ${action}`,
            severity: 'high',
            category: 'sensitive-data',
            location: { file: baseUrl, snippet: `Action: ${action}` },
            remediation: { description: 'Change form action to use HTTPS', estimatedEffort: 'trivial', automatable: true },
            references: ['https://owasp.org/www-project-web-security-testing-guide/'],
          });
        }
      }
    }
  }
}
