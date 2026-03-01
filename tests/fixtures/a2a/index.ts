/**
 * A2A Test Fixtures
 *
 * Shared test fixtures for OAuth 2.0, Push Notifications, and Dynamic Agent Discovery.
 * These fixtures provide consistent test data across unit and integration tests.
 *
 * @module tests/fixtures/a2a
 */

// ============================================================================
// OAuth 2.0 Fixtures
// ============================================================================

/**
 * Mock OAuth clients for testing various scenarios
 */
export const mockOAuthClients = {
  /**
   * Standard web application client with authorization code flow
   */
  webapp: {
    clientId: 'webapp-client-001',
    clientSecret: 'webapp-secret-xyz789',
    redirectUris: ['https://app.example.com/callback', 'https://app.example.com/oauth/callback'],
    scopes: ['agents:read', 'tasks:read', 'tasks:write', 'messages:send'],
    grantTypes: ['authorization_code', 'refresh_token'] as const,
    name: 'Example Web Application',
  },

  /**
   * Machine-to-machine service client with client credentials flow
   */
  service: {
    clientId: 'service-client-001',
    clientSecret: 'service-secret-abc123',
    redirectUris: [],
    scopes: ['agents:read', 'agents:execute', 'tasks:read', 'tasks:write', 'internal:admin'],
    grantTypes: ['client_credentials'] as const,
    name: 'QE Automation Service',
  },

  /**
   * Single-page application (public client) with PKCE
   */
  spa: {
    clientId: 'spa-client-001',
    clientSecret: '', // Public client - no secret
    redirectUris: ['https://spa.example.com/callback', 'http://localhost:3000/callback'],
    scopes: ['agents:read', 'tasks:read'],
    grantTypes: ['authorization_code', 'refresh_token'] as const,
    name: 'QE Dashboard SPA',
    requirePkce: true,
  },

  /**
   * CLI tool client
   */
  cli: {
    clientId: 'cli-client-001',
    clientSecret: 'cli-secret-def456',
    redirectUris: ['http://localhost:8080/callback', 'http://127.0.0.1:8080/callback'],
    scopes: ['agents:read', 'tasks:read', 'tasks:write'],
    grantTypes: ['authorization_code', 'refresh_token'] as const,
    name: 'QE CLI Tool',
  },
};

/**
 * Sample JWT tokens for testing (DO NOT use in production)
 */
export const mockJwtTokens = {
  /**
   * Valid access token with standard claims
   */
  validAccessToken: {
    header: { alg: 'RS256', typ: 'JWT' },
    payload: {
      iss: 'https://auth.agentic-qe.dev',
      sub: 'client:webapp-client-001',
      aud: 'https://api.agentic-qe.dev/a2a',
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      iat: Math.floor(Date.now() / 1000),
      scope: 'agents:read tasks:read tasks:write',
      client_id: 'webapp-client-001',
    },
    // Mock signature - not cryptographically valid
    signature: 'mock-signature-for-testing',
  },

  /**
   * Expired access token
   */
  expiredAccessToken: {
    header: { alg: 'RS256', typ: 'JWT' },
    payload: {
      iss: 'https://auth.agentic-qe.dev',
      sub: 'client:webapp-client-001',
      aud: 'https://api.agentic-qe.dev/a2a',
      exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      iat: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
      scope: 'agents:read',
      client_id: 'webapp-client-001',
    },
    signature: 'mock-expired-signature',
  },

  /**
   * Token with insufficient scope
   */
  limitedScopeToken: {
    header: { alg: 'RS256', typ: 'JWT' },
    payload: {
      iss: 'https://auth.agentic-qe.dev',
      sub: 'client:webapp-client-001',
      aud: 'https://api.agentic-qe.dev/a2a',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      scope: 'agents:read', // Only read scope
      client_id: 'webapp-client-001',
    },
    signature: 'mock-limited-signature',
  },
};

/**
 * OAuth scope definitions
 */
export const mockScopes = {
  read: ['agents:read', 'tasks:read', 'messages:read'],
  write: ['agents:execute', 'tasks:write', 'messages:send'],
  admin: ['internal:admin', 'agents:delete', 'tasks:delete'],
  full: ['agents:read', 'agents:execute', 'tasks:read', 'tasks:write', 'messages:read', 'messages:send'],
};

// ============================================================================
// Push Notification Fixtures
// ============================================================================

/**
 * Webhook subscription fixtures
 */
export const mockSubscriptions = {
  /**
   * Standard webhook subscription
   */
  standard: {
    id: 'sub-001',
    taskId: 'task-001',
    webhookUrl: 'https://callback.example.com/webhooks/a2a',
    secret: 'whsec_test_secret_abc123xyz',
    events: ['task.status_changed', 'task.completed', 'task.failed', 'task.artifact_added'],
    active: true,
    createdAt: new Date('2026-01-30T10:00:00Z'),
  },

  /**
   * Subscription for only completion events
   */
  completionOnly: {
    id: 'sub-002',
    taskId: 'task-002',
    webhookUrl: 'https://callback.example.com/webhooks/completion',
    secret: 'whsec_completion_secret',
    events: ['task.completed', 'task.failed'],
    active: true,
    createdAt: new Date('2026-01-30T11:00:00Z'),
  },

  /**
   * Inactive subscription
   */
  inactive: {
    id: 'sub-003',
    taskId: 'task-003',
    webhookUrl: 'https://callback.example.com/webhooks/inactive',
    secret: 'whsec_inactive_secret',
    events: ['task.status_changed'],
    active: false,
    createdAt: new Date('2026-01-30T09:00:00Z'),
  },
};

/**
 * Webhook payload fixtures
 */
export const mockWebhookPayloads = {
  /**
   * Task status change notification
   */
  statusChanged: {
    type: 'task.status_changed',
    taskId: 'task-001',
    timestamp: '2026-01-31T10:00:00.000Z',
    data: {
      previousStatus: 'submitted',
      newStatus: 'working',
      agentId: 'qe-test-architect',
      reason: 'Agent started processing',
    },
  },

  /**
   * Task completed notification
   */
  taskCompleted: {
    type: 'task.completed',
    taskId: 'task-001',
    timestamp: '2026-01-31T10:05:00.000Z',
    data: {
      status: 'completed',
      duration: 300000, // 5 minutes
      artifacts: [
        { id: 'artifact-001', name: 'Test Suite', type: 'text/plain' },
        { id: 'artifact-002', name: 'Coverage Report', type: 'application/json' },
      ],
    },
  },

  /**
   * Task failed notification
   */
  taskFailed: {
    type: 'task.failed',
    taskId: 'task-001',
    timestamp: '2026-01-31T10:03:00.000Z',
    data: {
      status: 'failed',
      error: {
        code: 'TIMEOUT',
        message: 'Task execution timed out after 30000ms',
        retryable: true,
      },
    },
  },

  /**
   * Artifact added notification
   */
  artifactAdded: {
    type: 'task.artifact_added',
    taskId: 'task-001',
    timestamp: '2026-01-31T10:02:00.000Z',
    data: {
      artifact: {
        id: 'artifact-001',
        name: 'Intermediate Results',
        type: 'application/json',
        size: 1024,
      },
    },
  },
};

/**
 * Webhook headers fixture
 */
export const mockWebhookHeaders = {
  standard: {
    'Content-Type': 'application/json',
    'X-AQE-Signature': 'sha256=mock_signature_here',
    'X-AQE-Timestamp': '1706699600',
    'X-AQE-Event-Type': 'task.status_changed',
    'X-AQE-Delivery-Id': 'delivery-001',
    'User-Agent': 'AQE-Webhook/3.0',
  },
};

// ============================================================================
// Agent Markdown Fixtures
// ============================================================================

/**
 * Sample agent markdown content for testing hot-reload
 */
export const mockAgentMarkdown = {
  /**
   * Complete agent definition
   */
  testArchitect: `---
name: qe-test-architect
version: 3.0.0
domain: test-generation
---

# QE Test Architect

AI-powered test generation specialist with comprehensive coverage analysis.

## Identity

You are the V3 QE Test Architect, the primary agent for intelligent test suite creation.
Mission: Generate comprehensive, high-quality test suites using AI-driven analysis.

## Skills

- **test-generation**: Generate comprehensive test suites with AI analysis
- **tdd-support**: Red-green-refactor guidance and TDD workflow support
- **coverage-analysis**: Identify coverage gaps and optimization opportunities

## Capabilities

- streaming: true
- pushNotifications: true
- stateTransitionHistory: true

## Input/Output

- Input: text/plain, application/json
- Output: application/json, text/plain

## Examples

\`\`\`
Generate unit tests for src/UserService.ts with 90% coverage target
\`\`\`
`,

  /**
   * Minimal agent definition
   */
  minimalAgent: `---
name: qe-minimal-agent
version: 1.0.0
---

# Minimal Agent

A simple agent for testing.
`,

  /**
   * Agent with security focus
   */
  securityScanner: `---
name: qe-security-scanner
version: 3.0.0
domain: security-compliance
---

# QE Security Scanner

OWASP vulnerability detection and security compliance verification.

## Skills

- **security-scan**: Comprehensive SAST/DAST security scanning
- **vulnerability-detection**: CVE database matching and risk assessment
- **compliance-check**: OWASP Top 10, CWE compliance verification

## Capabilities

- streaming: true
- pushNotifications: false
`,

  /**
   * Invalid agent (missing required fields)
   */
  invalidAgent: `# Invalid Agent

This agent is missing the required frontmatter.
No name or version defined.
`,
};

/**
 * Agent file paths for testing
 */
export const mockAgentPaths = {
  testArchitect: '.claude/agents/v3/qe-test-architect.md',
  securityScanner: '.claude/agents/v3/qe-security-scanner.md',
  coverageSpecialist: '.claude/agents/v3/qe-coverage-specialist.md',
  learningCoordinator: '.claude/agents/v3/qe-learning-coordinator.md',
  qualityGate: '.claude/agents/v3/qe-quality-gate.md',
};

// ============================================================================
// A2A Protocol Fixtures
// ============================================================================

/**
 * A2A message fixtures
 */
export const mockA2AMessages = {
  /**
   * Simple text message
   */
  textMessage: {
    role: 'user' as const,
    parts: [{ type: 'text' as const, text: 'Generate unit tests for the UserService class' }],
  },

  /**
   * Message with data part
   */
  dataMessage: {
    role: 'user' as const,
    parts: [
      { type: 'text' as const, text: 'Analyze this coverage report' },
      {
        type: 'data' as const,
        data: {
          totalLines: 1000,
          coveredLines: 850,
          coveragePercent: 85,
          uncoveredFiles: ['src/utils.ts', 'src/helpers.ts'],
        },
      },
    ],
  },

  /**
   * Agent response message
   */
  agentResponse: {
    role: 'agent' as const,
    parts: [
      { type: 'text' as const, text: 'I have generated 15 unit tests for UserService.' },
      {
        type: 'data' as const,
        data: {
          testsGenerated: 15,
          expectedCoverage: 92,
          testFramework: 'vitest',
        },
      },
    ],
  },
};

/**
 * A2A task fixtures
 */
export const mockA2ATasks = {
  /**
   * Newly submitted task
   */
  submitted: {
    id: 'task-001',
    contextId: 'ctx-001',
    status: 'submitted' as const,
    message: mockA2AMessages.textMessage,
    artifacts: [],
    metadata: {
      createdAt: new Date('2026-01-31T10:00:00Z'),
      updatedAt: new Date('2026-01-31T10:00:00Z'),
      agentId: 'qe-test-architect',
    },
  },

  /**
   * Task in progress
   */
  working: {
    id: 'task-002',
    contextId: 'ctx-002',
    status: 'working' as const,
    message: mockA2AMessages.textMessage,
    artifacts: [],
    metadata: {
      createdAt: new Date('2026-01-31T09:55:00Z'),
      updatedAt: new Date('2026-01-31T10:00:00Z'),
      agentId: 'qe-test-architect',
    },
  },

  /**
   * Completed task with artifacts
   */
  completed: {
    id: 'task-003',
    contextId: 'ctx-003',
    status: 'completed' as const,
    message: mockA2AMessages.textMessage,
    artifacts: [
      {
        id: 'artifact-001',
        name: 'Generated Tests',
        parts: [{ type: 'text' as const, text: 'describe("UserService", () => { ... })' }],
      },
    ],
    metadata: {
      createdAt: new Date('2026-01-31T09:50:00Z'),
      updatedAt: new Date('2026-01-31T10:00:00Z'),
      agentId: 'qe-test-architect',
      completedAt: new Date('2026-01-31T10:00:00Z'),
    },
  },

  /**
   * Failed task with error
   */
  failed: {
    id: 'task-004',
    contextId: 'ctx-004',
    status: 'failed' as const,
    message: mockA2AMessages.textMessage,
    artifacts: [],
    error: {
      message: 'Failed to parse source file',
      code: 'PARSE_ERROR',
    },
    metadata: {
      createdAt: new Date('2026-01-31T09:45:00Z'),
      updatedAt: new Date('2026-01-31T09:50:00Z'),
      agentId: 'qe-test-architect',
    },
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a mock timestamp for consistent testing
 */
export function createMockTimestamp(offsetMs: number = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

/**
 * Create a unique ID for testing
 */
export function createMockId(prefix: string = 'mock'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Deep clone a fixture to avoid mutation
 */
export function cloneFixture<T>(fixture: T): T {
  return JSON.parse(JSON.stringify(fixture));
}
