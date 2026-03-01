/**
 * Sample Queries for Token Reduction Benchmark
 *
 * These queries simulate real-world questions developers
 * might ask when exploring a codebase.
 */

export interface QuerySample {
  id: string;
  query: string;
  expectedConcepts: string[];
  expectedFiles: string[];
  complexity: 'simple' | 'medium' | 'complex';
  category: 'architecture' | 'implementation' | 'security' | 'debugging' | 'testing';
}

/**
 * Queries designed to test the code intelligence system's
 * ability to find relevant context while minimizing tokens
 */
export const QUERY_SAMPLES: QuerySample[] = [
  // Architecture queries
  {
    id: 'q1',
    query: 'How does the authentication flow work?',
    expectedConcepts: ['login', 'session', 'token', 'JWT'],
    expectedFiles: ['auth-service.ts', 'auth-middleware.ts'],
    complexity: 'medium',
    category: 'architecture',
  },
  {
    id: 'q2',
    query: 'What role-based access control does the system support?',
    expectedConcepts: ['Role', 'permission', 'authorize', 'hasRole'],
    expectedFiles: ['auth-service.ts', 'auth-middleware.ts'],
    complexity: 'medium',
    category: 'architecture',
  },
  {
    id: 'q3',
    query: 'How are sessions managed?',
    expectedConcepts: ['Session', 'createSession', 'refreshToken', 'accessToken'],
    expectedFiles: ['auth-service.ts'],
    complexity: 'simple',
    category: 'architecture',
  },

  // Implementation queries
  {
    id: 'q4',
    query: 'How is password hashing implemented?',
    expectedConcepts: ['hashPassword', 'salt', 'sha512', 'verifyPassword'],
    expectedFiles: ['auth-service.ts'],
    complexity: 'simple',
    category: 'implementation',
  },
  {
    id: 'q5',
    query: 'What happens when a user fails login multiple times?',
    expectedConcepts: ['failedLoginAttempts', 'lockedUntil', 'handleFailedLogin', 'ACCOUNT_LOCKED'],
    expectedFiles: ['auth-service.ts'],
    complexity: 'medium',
    category: 'implementation',
  },
  {
    id: 'q6',
    query: 'How does token rotation work?',
    expectedConcepts: ['rotateTokens', 'refreshToken', 'blacklist', 'refreshSession'],
    expectedFiles: ['auth-service.ts'],
    complexity: 'complex',
    category: 'implementation',
  },

  // Security queries
  {
    id: 'q7',
    query: 'How is MFA handled?',
    expectedConcepts: ['mfaEnabled', 'mfaCode', 'verifyMfaCode', 'MFA_REQUIRED'],
    expectedFiles: ['auth-service.ts'],
    complexity: 'medium',
    category: 'security',
  },
  {
    id: 'q8',
    query: 'What security measures prevent brute force attacks?',
    expectedConcepts: ['maxFailedAttempts', 'lockoutDuration', 'RateLimiter'],
    expectedFiles: ['auth-service.ts', 'auth-middleware.ts'],
    complexity: 'complex',
    category: 'security',
  },
  {
    id: 'q9',
    query: 'How are tokens validated and blacklisted?',
    expectedConcepts: ['tokenBlacklist', 'isTokenBlacklisted', 'SESSION_REVOKED'],
    expectedFiles: ['auth-service.ts'],
    complexity: 'simple',
    category: 'security',
  },

  // Debugging queries
  {
    id: 'q10',
    query: 'What audit logging is available?',
    expectedConcepts: ['AuditLogger', 'AuditLogEntry', 'log', 'query'],
    expectedFiles: ['auth-middleware.ts'],
    complexity: 'simple',
    category: 'debugging',
  },
  {
    id: 'q11',
    query: 'How can I trace failed authentication attempts?',
    expectedConcepts: ['getFailures', 'result', 'reason', 'INVALID_CREDENTIALS'],
    expectedFiles: ['auth-middleware.ts', 'auth-service.ts'],
    complexity: 'medium',
    category: 'debugging',
  },

  // Testing queries
  {
    id: 'q12',
    query: 'What interfaces need to be mocked for testing auth?',
    expectedConcepts: ['User', 'Session', 'AuthResult', 'LoginCredentials'],
    expectedFiles: ['auth-service.ts'],
    complexity: 'simple',
    category: 'testing',
  },
];

/**
 * Get queries filtered by category
 */
export function getQueriesByCategory(category: QuerySample['category']): QuerySample[] {
  return QUERY_SAMPLES.filter((q) => q.category === category);
}

/**
 * Get queries filtered by complexity
 */
export function getQueriesByComplexity(complexity: QuerySample['complexity']): QuerySample[] {
  return QUERY_SAMPLES.filter((q) => q.complexity === complexity);
}

/**
 * Calculate expected token reduction based on query complexity
 * Simple queries should achieve ~85% reduction
 * Medium queries should achieve ~80% reduction
 * Complex queries should achieve ~75% reduction
 */
export function getExpectedReduction(complexity: QuerySample['complexity']): number {
  const reductions: Record<QuerySample['complexity'], number> = {
    simple: 0.85,
    medium: 0.80,
    complex: 0.75,
  };
  return reductions[complexity];
}
