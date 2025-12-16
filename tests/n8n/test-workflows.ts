/**
 * Test Workflow Definitions for N8n Agent Testing
 *
 * Contains sample workflows for testing all n8n agents from Phase 1-4
 */

// Workflow with various node types for comprehensive testing
export const customerOnboardingWorkflow = {
  id: 'wf-test-001',
  name: 'Customer Onboarding Test Workflow',
  active: true,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-12-15T10:00:00.000Z',
  nodes: [
    {
      id: 'node-trigger',
      name: 'Webhook Trigger',
      type: 'n8n-nodes-base.webhook',
      position: [250, 300],
      parameters: {
        httpMethod: 'POST',
        path: 'customer-onboard',
        responseMode: 'onReceived',
        authentication: 'headerAuth',
        headerAuth: {
          name: 'X-API-Key',
          value: '={{ $env.WEBHOOK_SECRET }}'
        }
      }
    },
    {
      id: 'node-validate',
      name: 'Validate Input',
      type: 'n8n-nodes-base.if',
      position: [450, 300],
      parameters: {
        conditions: {
          string: [
            { value1: '={{ $json.email }}', operation: 'isNotEmpty' },
            { value1: '={{ $json.name }}', operation: 'isNotEmpty' }
          ]
        }
      }
    },
    {
      id: 'node-transform',
      name: 'Transform Data',
      type: 'n8n-nodes-base.set',
      position: [650, 250],
      parameters: {
        values: {
          string: [
            { name: 'fullName', value: '={{ $json.name.toUpperCase() }}' },
            { name: 'email', value: '={{ $json.email.toLowerCase() }}' },
            { name: 'tier', value: '={{ $json.spend > 1000 ? "gold" : "standard" }}' }
          ]
        }
      }
    },
    {
      id: 'node-code',
      name: 'Calculate Discount',
      type: 'n8n-nodes-base.code',
      position: [850, 250],
      parameters: {
        jsCode: `
// Calculate customer discount based on tier and history
function calculateDiscount(customer) {
  const { tier, orderHistory = [] } = customer;
  let discount = 0;

  // Tier discount
  if (tier === 'gold') discount += 15;
  else if (tier === 'silver') discount += 10;
  else if (tier === 'bronze') discount += 5;

  // Loyalty discount
  if (orderHistory.length > 10) discount += 5;

  // Cap at 25%
  return Math.min(discount, 25);
}

for (const item of $input.all()) {
  item.json.discount = calculateDiscount(item.json);
}

return $input.all();
        `
      }
    },
    {
      id: 'node-http',
      name: 'Create Customer',
      type: 'n8n-nodes-base.httpRequest',
      position: [1050, 250],
      parameters: {
        url: 'https://api.example.com/customers',
        method: 'POST',
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        bodyParameters: {
          parameters: [
            { name: 'email', value: '={{ $json.email }}' },
            { name: 'name', value: '={{ $json.fullName }}' },
            { name: 'tier', value: '={{ $json.tier }}' },
            { name: 'discount', value: '={{ $json.discount }}' }
          ]
        },
        options: {
          timeout: 30000,
          retry: {
            maxRetries: 3,
            retryInterval: 1000
          }
        }
      },
      credentials: {
        httpHeaderAuth: {
          id: 'cred-api-001',
          name: 'Customer API Key'
        }
      }
    },
    {
      id: 'node-email',
      name: 'Send Welcome Email',
      type: 'n8n-nodes-base.emailSend',
      position: [1250, 250],
      parameters: {
        toEmail: '={{ $json.email }}',
        subject: 'Welcome to Our Platform!',
        text: 'Hello {{ $json.fullName }}, welcome! Your tier is {{ $json.tier }}.'
      },
      credentials: {
        smtp: {
          id: 'cred-smtp-001',
          name: 'Email SMTP'
        }
      }
    },
    {
      id: 'node-slack',
      name: 'Notify Slack',
      type: 'n8n-nodes-base.slack',
      position: [1450, 250],
      parameters: {
        channel: '#new-customers',
        text: 'New customer: {{ $json.fullName }} ({{ $json.tier }} tier)'
      },
      credentials: {
        slackApi: {
          id: 'cred-slack-001',
          name: 'Slack Bot'
        }
      }
    },
    {
      id: 'node-error',
      name: 'Error Handler',
      type: 'n8n-nodes-base.noOp',
      position: [650, 400],
      parameters: {}
    }
  ],
  connections: {
    'Webhook Trigger': {
      main: [[{ node: 'Validate Input', type: 'main', index: 0 }]]
    },
    'Validate Input': {
      main: [
        [{ node: 'Transform Data', type: 'main', index: 0 }],
        [{ node: 'Error Handler', type: 'main', index: 0 }]
      ]
    },
    'Transform Data': {
      main: [[{ node: 'Calculate Discount', type: 'main', index: 0 }]]
    },
    'Calculate Discount': {
      main: [[{ node: 'Create Customer', type: 'main', index: 0 }]]
    },
    'Create Customer': {
      main: [[{ node: 'Send Welcome Email', type: 'main', index: 0 }]]
    },
    'Send Welcome Email': {
      main: [[{ node: 'Notify Slack', type: 'main', index: 0 }]]
    }
  },
  settings: {
    executionOrder: 'v1',
    saveManualExecutions: true,
    callerPolicy: 'workflowsFromSameOwner'
  },
  tags: ['customer', 'onboarding', 'automation']
};

// Workflow with security vulnerabilities for security testing
export const vulnerableWorkflow = {
  id: 'wf-test-002',
  name: 'Vulnerable Workflow (For Testing)',
  active: false,
  createdAt: '2025-01-05T00:00:00.000Z',
  updatedAt: '2025-12-10T00:00:00.000Z',
  nodes: [
    {
      id: 'node-webhook-noauth',
      name: 'Insecure Webhook',
      type: 'n8n-nodes-base.webhook',
      position: [250, 300],
      parameters: {
        httpMethod: 'POST',
        path: 'vulnerable-endpoint',
        authentication: 'none'  // SECURITY ISSUE: No authentication
      }
    },
    {
      id: 'node-sql-injection',
      name: 'Database Query',
      type: 'n8n-nodes-base.postgres',
      position: [450, 300],
      parameters: {
        operation: 'executeQuery',
        // SECURITY ISSUE: SQL injection vulnerability
        query: "SELECT * FROM users WHERE email = '{{ $json.email }}'"
      }
    },
    {
      id: 'node-hardcoded-secret',
      name: 'External API',
      type: 'n8n-nodes-base.httpRequest',
      position: [650, 300],
      parameters: {
        url: 'http://api.internal.com/data',  // SECURITY ISSUE: HTTP not HTTPS
        method: 'GET',
        headers: {
          // SECURITY ISSUE: Hardcoded API key
          'Authorization': 'Bearer sk-test-hardcoded-api-key-12345'
        }
      }
    },
    {
      id: 'node-command-injection',
      name: 'Process File',
      type: 'n8n-nodes-base.executeCommand',
      position: [850, 300],
      parameters: {
        // SECURITY ISSUE: Command injection
        command: 'cat /tmp/{{ $json.filename }}'
      }
    }
  ],
  connections: {
    'Insecure Webhook': {
      main: [[{ node: 'Database Query', type: 'main', index: 0 }]]
    },
    'Database Query': {
      main: [[{ node: 'External API', type: 'main', index: 0 }]]
    },
    'External API': {
      main: [[{ node: 'Process File', type: 'main', index: 0 }]]
    }
  },
  settings: {
    executionOrder: 'v1'
  },
  tags: ['test', 'security']
};

// Workflow for compliance testing with PII data
export const complianceTestWorkflow = {
  id: 'wf-test-003',
  name: 'Compliance Test Workflow',
  active: true,
  createdAt: '2025-01-10T00:00:00.000Z',
  updatedAt: '2025-12-14T00:00:00.000Z',
  nodes: [
    {
      id: 'node-trigger',
      name: 'Customer Data Webhook',
      type: 'n8n-nodes-base.webhook',
      position: [250, 300],
      parameters: {
        httpMethod: 'POST',
        path: 'customer-data',
        authentication: 'headerAuth'
      }
    },
    {
      id: 'node-store-pii',
      name: 'Store Customer PII',
      type: 'n8n-nodes-base.postgres',
      position: [450, 300],
      parameters: {
        operation: 'insert',
        table: 'customers',
        columns: 'email,name,phone,ssn,date_of_birth,address'
        // Note: SSN is PII requiring special handling
      }
    },
    {
      id: 'node-third-party',
      name: 'Send to Analytics',
      type: 'n8n-nodes-base.httpRequest',
      position: [650, 300],
      parameters: {
        url: 'https://analytics.thirdparty.com/track',
        method: 'POST'
        // Potential GDPR issue: sending PII to third party
      }
    }
  ],
  connections: {
    'Customer Data Webhook': {
      main: [[{ node: 'Store Customer PII', type: 'main', index: 0 }]]
    },
    'Store Customer PII': {
      main: [[{ node: 'Send to Analytics', type: 'main', index: 0 }]]
    }
  },
  settings: {
    executionOrder: 'v1'
  },
  tags: ['compliance', 'pii', 'gdpr']
};

// Workflow version 2 for version comparison testing
export const customerOnboardingWorkflowV2 = {
  ...customerOnboardingWorkflow,
  id: 'wf-test-001',
  updatedAt: '2025-12-15T12:00:00.000Z',
  nodes: [
    ...customerOnboardingWorkflow.nodes.filter(n => n.name !== 'Error Handler'),
    {
      id: 'node-new-validation',
      name: 'Stock Check',
      type: 'n8n-nodes-base.httpRequest',
      position: [550, 200],
      parameters: {
        url: 'https://api-v2.example.com/inventory/check',  // URL changed
        method: 'GET',
        timeout: 60000  // Timeout increased
      }
    }
  ]
};

// Test data generators
export function generateTestCustomer(overrides: Partial<any> = {}) {
  return {
    email: 'test@example.com',
    name: 'Test User',
    phone: '+1-555-0123',
    spend: 1500,
    orderHistory: [{ id: 1 }, { id: 2 }],
    ...overrides
  };
}

export function generateTestExecution(workflowId: string, status: 'success' | 'error' = 'success') {
  const startTime = Date.now();
  return {
    id: `exec-${Date.now()}`,
    workflowId,
    finished: true,
    mode: 'webhook',
    startedAt: new Date(startTime).toISOString(),
    stoppedAt: new Date(startTime + 2500).toISOString(),
    status,
    data: {
      resultData: {
        runData: {
          'Webhook Trigger': [{ startTime, executionTime: 50 }],
          'Validate Input': [{ startTime: startTime + 50, executionTime: 25 }],
          'Transform Data': [{ startTime: startTime + 75, executionTime: 30 }],
          'Calculate Discount': [{ startTime: startTime + 105, executionTime: 45 }],
          'Create Customer': [{ startTime: startTime + 150, executionTime: 1500 }],
          'Send Welcome Email': [{ startTime: startTime + 1650, executionTime: 600 }],
          'Notify Slack': [{ startTime: startTime + 2250, executionTime: 200 }]
        },
        ...(status === 'error' ? {
          error: {
            message: 'External API timeout',
            node: 'Create Customer'
          }
        } : {})
      }
    }
  };
}

// BDD scenario data
export const bddScenarios = {
  customerOnboarding: {
    feature: 'Customer Onboarding',
    scenarios: [
      {
        name: 'Successful gold tier customer onboarding',
        given: 'a customer with spend over $1000',
        when: 'they submit the onboarding form',
        then: 'they should be assigned gold tier and receive 15% discount'
      },
      {
        name: 'Standard tier customer onboarding',
        given: 'a customer with spend under $1000',
        when: 'they submit the onboarding form',
        then: 'they should be assigned standard tier with no discount'
      },
      {
        name: 'Invalid email rejection',
        given: 'a customer with invalid email',
        when: 'they submit the onboarding form',
        then: 'the request should be rejected with validation error'
      }
    ]
  }
};

// Performance test configuration
export const performanceTestConfig = {
  baseline: {
    vus: 1,
    duration: '30s'
  },
  load: {
    stages: [
      { duration: '30s', target: 10 },
      { duration: '1m', target: 50 },
      { duration: '30s', target: 0 }
    ]
  },
  stress: {
    stages: [
      { duration: '30s', target: 50 },
      { duration: '1m', target: 100 },
      { duration: '1m', target: 200 },
      { duration: '30s', target: 0 }
    ]
  },
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.01']
  }
};

// Chaos test scenarios
export const chaosScenarios = {
  serviceFailure: {
    name: 'External API Failure',
    fault: { type: 'http_error', statusCode: 503 },
    duration: 60,
    target: 'Create Customer'
  },
  latencyInjection: {
    name: 'High Latency',
    fault: { type: 'latency', delayMs: 2000 },
    duration: 120,
    target: 'Create Customer'
  },
  timeout: {
    name: 'Request Timeout',
    fault: { type: 'timeout' },
    duration: 30,
    target: 'Create Customer'
  }
};

export default {
  customerOnboardingWorkflow,
  vulnerableWorkflow,
  complianceTestWorkflow,
  customerOnboardingWorkflowV2,
  generateTestCustomer,
  generateTestExecution,
  bddScenarios,
  performanceTestConfig,
  chaosScenarios
};
