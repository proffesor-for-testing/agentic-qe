/**
 * Agentic QE v3 - Security Pattern Definitions
 * Contains all vulnerability detection patterns for SAST scanning
 */

import type { SecurityPattern, RuleSet, VulnerabilityCategory } from './scanner-types.js';

// ============================================================================
// SQL Injection Detection Patterns
// OWASP A03:2021 - Injection
// ============================================================================

export const SQL_INJECTION_PATTERNS: SecurityPattern[] = [
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

// ============================================================================
// XSS (Cross-Site Scripting) Detection Patterns
// OWASP A03:2021 - Injection (includes XSS)
// ============================================================================

export const XSS_PATTERNS: SecurityPattern[] = [
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

// ============================================================================
// Hardcoded Secrets Detection Patterns
// OWASP A02:2021 - Cryptographic Failures
// ============================================================================

export const SECRET_PATTERNS: SecurityPattern[] = [
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

// ============================================================================
// Path Traversal Detection Patterns
// OWASP A01:2021 - Broken Access Control
// ============================================================================

export const PATH_TRAVERSAL_PATTERNS: SecurityPattern[] = [
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

// ============================================================================
// Command Injection Detection Patterns
// OWASP A03:2021 - Injection
// ============================================================================

export const COMMAND_INJECTION_PATTERNS: SecurityPattern[] = [
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

// ============================================================================
// Insecure Configuration Detection Patterns
// OWASP A05:2021 - Security Misconfiguration
// ============================================================================

export const MISCONFIGURATION_PATTERNS: SecurityPattern[] = [
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

// ============================================================================
// Insecure Deserialization Patterns
// OWASP A08:2021 - Software and Data Integrity Failures
// ============================================================================

export const DESERIALIZATION_PATTERNS: SecurityPattern[] = [
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

// ============================================================================
// Authentication Weakness Patterns
// OWASP A07:2021 - Identification and Authentication Failures
// ============================================================================

export const AUTH_PATTERNS: SecurityPattern[] = [
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

// ============================================================================
// All Security Patterns Combined
// ============================================================================

export const ALL_SECURITY_PATTERNS: SecurityPattern[] = [
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

export const BUILT_IN_RULE_SETS: RuleSet[] = [
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
    ] as VulnerabilityCategory[],
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
    ] as VulnerabilityCategory[],
  },
  {
    id: 'nodejs-security',
    name: 'Node.js Security',
    description: 'Node.js specific security rules',
    ruleCount: 25,
    categories: ['injection', 'xss', 'sensitive-data', 'security-misconfiguration'] as VulnerabilityCategory[],
  },
  {
    id: 'typescript-security',
    name: 'TypeScript Security',
    description: 'TypeScript specific security rules',
    ruleCount: 20,
    categories: ['injection', 'xss', 'sensitive-data'] as VulnerabilityCategory[],
  },
];
