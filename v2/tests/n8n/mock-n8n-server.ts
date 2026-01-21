/**
 * Mock n8n API Server
 *
 * Simulates n8n REST API for testing n8n agents without requiring
 * a full n8n installation (which has high memory requirements).
 *
 * Endpoints implemented:
 * - GET /api/v1/workflows - List workflows
 * - GET /api/v1/workflows/:id - Get workflow by ID
 * - POST /api/v1/workflows/:id/execute - Execute workflow
 * - GET /api/v1/executions - List executions
 * - GET /api/v1/executions/:id - Get execution by ID
 * - GET /api/v1/credentials - List credentials (masked)
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { createSeededRandom } from '../../src/utils/SeededRandom';

// Seeded RNG for deterministic execution timing
const rng = createSeededRandom(25100);

// Mock data
const mockWorkflows = [
  {
    id: 'wf-001',
    name: 'Customer Onboarding',
    active: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-15T10:30:00.000Z',
    nodes: [
      {
        id: 'node-1',
        name: 'Webhook Trigger',
        type: 'n8n-nodes-base.webhook',
        position: [250, 300],
        parameters: {
          httpMethod: 'POST',
          path: 'customer-onboard',
          responseMode: 'onReceived'
        }
      },
      {
        id: 'node-2',
        name: 'Validate Data',
        type: 'n8n-nodes-base.if',
        position: [450, 300],
        parameters: {
          conditions: {
            string: [
              { value1: '={{ $json.email }}', operation: 'isNotEmpty' }
            ]
          }
        }
      },
      {
        id: 'node-3',
        name: 'Create Customer',
        type: 'n8n-nodes-base.httpRequest',
        position: [650, 250],
        parameters: {
          url: 'https://api.example.com/customers',
          method: 'POST',
          bodyParameters: {
            parameters: [
              { name: 'email', value: '={{ $json.email }}' },
              { name: 'name', value: '={{ $json.name }}' }
            ]
          }
        }
      },
      {
        id: 'node-4',
        name: 'Send Welcome Email',
        type: 'n8n-nodes-base.emailSend',
        position: [850, 250],
        parameters: {
          toEmail: '={{ $json.email }}',
          subject: 'Welcome!',
          text: 'Welcome to our platform!'
        }
      },
      {
        id: 'node-5',
        name: 'Error Handler',
        type: 'n8n-nodes-base.noOp',
        position: [650, 400],
        parameters: {}
      }
    ],
    connections: {
      'Webhook Trigger': {
        main: [[{ node: 'Validate Data', type: 'main', index: 0 }]]
      },
      'Validate Data': {
        main: [
          [{ node: 'Create Customer', type: 'main', index: 0 }],
          [{ node: 'Error Handler', type: 'main', index: 0 }]
        ]
      },
      'Create Customer': {
        main: [[{ node: 'Send Welcome Email', type: 'main', index: 0 }]]
      }
    },
    settings: {
      executionOrder: 'v1',
      saveManualExecutions: true,
      callerPolicy: 'workflowsFromSameOwner'
    },
    tags: ['onboarding', 'customer', 'automation']
  },
  {
    id: 'wf-002',
    name: 'Daily Report Generator',
    active: true,
    createdAt: '2025-01-05T00:00:00.000Z',
    updatedAt: '2025-01-14T08:00:00.000Z',
    nodes: [
      {
        id: 'node-1',
        name: 'Schedule Trigger',
        type: 'n8n-nodes-base.scheduleTrigger',
        position: [250, 300],
        parameters: {
          rule: {
            interval: [{ field: 'cronExpression', expression: '0 9 * * *' }]
          }
        }
      },
      {
        id: 'node-2',
        name: 'Fetch Sales Data',
        type: 'n8n-nodes-base.httpRequest',
        position: [450, 300],
        parameters: {
          url: 'https://api.example.com/sales/daily',
          method: 'GET',
          authentication: 'genericCredentialType',
          genericAuthType: 'httpHeaderAuth'
        }
      },
      {
        id: 'node-3',
        name: 'Transform Data',
        type: 'n8n-nodes-base.set',
        position: [650, 300],
        parameters: {
          values: {
            string: [
              { name: 'report', value: '={{ "Daily Sales: $" + $json.total }}' }
            ]
          }
        }
      },
      {
        id: 'node-4',
        name: 'Send to Slack',
        type: 'n8n-nodes-base.slack',
        position: [850, 300],
        parameters: {
          channel: '#reports',
          text: '={{ $json.report }}'
        }
      }
    ],
    connections: {
      'Schedule Trigger': {
        main: [[{ node: 'Fetch Sales Data', type: 'main', index: 0 }]]
      },
      'Fetch Sales Data': {
        main: [[{ node: 'Transform Data', type: 'main', index: 0 }]]
      },
      'Transform Data': {
        main: [[{ node: 'Send to Slack', type: 'main', index: 0 }]]
      }
    },
    settings: {
      executionOrder: 'v1',
      saveManualExecutions: true
    },
    tags: ['reports', 'scheduled', 'slack']
  },
  {
    id: 'wf-003',
    name: 'Data Sync Pipeline',
    active: false,
    createdAt: '2025-01-10T00:00:00.000Z',
    updatedAt: '2025-01-12T14:20:00.000Z',
    nodes: [
      {
        id: 'node-1',
        name: 'Poll Database',
        type: 'n8n-nodes-base.postgres',
        position: [250, 300],
        parameters: {
          operation: 'select',
          query: 'SELECT * FROM orders WHERE synced = false LIMIT 100'
        }
      },
      {
        id: 'node-2',
        name: 'Split Items',
        type: 'n8n-nodes-base.splitInBatches',
        position: [450, 300],
        parameters: {
          batchSize: 10
        }
      },
      {
        id: 'node-3',
        name: 'Sync to External',
        type: 'n8n-nodes-base.httpRequest',
        position: [650, 300],
        parameters: {
          url: 'https://external-api.example.com/sync',
          method: 'POST'
        }
      },
      {
        id: 'node-4',
        name: 'Mark as Synced',
        type: 'n8n-nodes-base.postgres',
        position: [850, 300],
        parameters: {
          operation: 'update',
          query: 'UPDATE orders SET synced = true WHERE id = $1'
        }
      }
    ],
    connections: {
      'Poll Database': {
        main: [[{ node: 'Split Items', type: 'main', index: 0 }]]
      },
      'Split Items': {
        main: [[{ node: 'Sync to External', type: 'main', index: 0 }]]
      },
      'Sync to External': {
        main: [[{ node: 'Mark as Synced', type: 'main', index: 0 }]]
      }
    },
    settings: {
      executionOrder: 'v1'
    },
    tags: ['sync', 'database', 'api']
  }
];

// Mock executions
const mockExecutions: Record<string, any> = {
  'exec-001': {
    id: 'exec-001',
    workflowId: 'wf-001',
    finished: true,
    mode: 'webhook',
    startedAt: '2025-01-15T10:00:00.000Z',
    stoppedAt: '2025-01-15T10:00:02.500Z',
    status: 'success',
    data: {
      resultData: {
        runData: {
          'Webhook Trigger': [{ startTime: 1705312800000, executionTime: 50 }],
          'Validate Data': [{ startTime: 1705312800050, executionTime: 25 }],
          'Create Customer': [{ startTime: 1705312800075, executionTime: 1500 }],
          'Send Welcome Email': [{ startTime: 1705312801575, executionTime: 800 }]
        }
      }
    }
  },
  'exec-002': {
    id: 'exec-002',
    workflowId: 'wf-001',
    finished: true,
    mode: 'webhook',
    startedAt: '2025-01-15T09:30:00.000Z',
    stoppedAt: '2025-01-15T09:30:01.200Z',
    status: 'error',
    data: {
      resultData: {
        error: {
          message: 'Email service unavailable',
          node: 'Send Welcome Email'
        },
        runData: {
          'Webhook Trigger': [{ startTime: 1705311000000, executionTime: 45 }],
          'Validate Data': [{ startTime: 1705311000045, executionTime: 30 }],
          'Create Customer': [{ startTime: 1705311000075, executionTime: 1000 }],
          'Send Welcome Email': [{ error: { message: 'Email service unavailable' } }]
        }
      }
    }
  },
  'exec-003': {
    id: 'exec-003',
    workflowId: 'wf-002',
    finished: true,
    mode: 'trigger',
    startedAt: '2025-01-15T09:00:00.000Z',
    stoppedAt: '2025-01-15T09:00:05.000Z',
    status: 'success',
    data: {
      resultData: {
        runData: {
          'Schedule Trigger': [{ startTime: 1705309200000, executionTime: 10 }],
          'Fetch Sales Data': [{ startTime: 1705309200010, executionTime: 2500 }],
          'Transform Data': [{ startTime: 1705309202510, executionTime: 50 }],
          'Send to Slack': [{ startTime: 1705309202560, executionTime: 2300 }]
        }
      }
    }
  }
};

// Mock credentials (masked)
const mockCredentials = [
  {
    id: 'cred-001',
    name: 'Slack API',
    type: 'slackApi',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-10T00:00:00.000Z'
  },
  {
    id: 'cred-002',
    name: 'PostgreSQL Production',
    type: 'postgres',
    createdAt: '2025-01-02T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z'
  },
  {
    id: 'cred-003',
    name: 'SendGrid Email',
    type: 'sendGrid',
    createdAt: '2025-01-03T00:00:00.000Z',
    updatedAt: '2025-01-12T00:00:00.000Z'
  }
];

// Execution simulation - create new execution
let executionCounter = 4;
function createExecution(workflowId: string, inputData?: any): any {
  const workflow = mockWorkflows.find(w => w.id === workflowId);
  if (!workflow) return null;

  const execId = `exec-${String(executionCounter++).padStart(3, '0')}`;
  const startedAt = new Date().toISOString();

  // Simulate execution with random timing
  const runData: Record<string, any[]> = {};
  let currentTime = Date.now();

  for (const node of workflow.nodes) {
    const execTime = Math.floor(rng.random() * 500) + 50; // 50-550ms
    runData[node.name] = [{
      startTime: currentTime,
      executionTime: execTime,
      data: { main: [[{ json: inputData || {} }]] }
    }];
    currentTime += execTime;
  }

  const execution = {
    id: execId,
    workflowId,
    finished: true,
    mode: 'manual',
    startedAt,
    stoppedAt: new Date(currentTime).toISOString(),
    status: 'success',
    data: {
      resultData: { runData }
    }
  };

  mockExecutions[execId] = execution;
  return execution;
}

// Request handler
function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method || 'GET';

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-N8N-API-KEY');
  res.setHeader('Content-Type', 'application/json');

  // Handle preflight
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API Key validation (optional, for testing auth)
  const apiKey = req.headers['x-n8n-api-key'];
  if (apiKey === 'invalid-key') {
    res.writeHead(401);
    res.end(JSON.stringify({ error: 'Invalid API key' }));
    return;
  }

  // Route handling
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      routeRequest(path, method, body, res);
    } catch (error) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });
}

function routeRequest(path: string, method: string, body: string, res: ServerResponse) {
  // GET /api/v1/workflows
  if (path === '/api/v1/workflows' && method === 'GET') {
    res.writeHead(200);
    res.end(JSON.stringify({ data: mockWorkflows }));
    return;
  }

  // GET /api/v1/workflows/:id
  const workflowMatch = path.match(/^\/api\/v1\/workflows\/([^/]+)$/);
  if (workflowMatch && method === 'GET') {
    const workflow = mockWorkflows.find(w => w.id === workflowMatch[1]);
    if (workflow) {
      res.writeHead(200);
      res.end(JSON.stringify(workflow));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Workflow not found' }));
    }
    return;
  }

  // POST /api/v1/workflows/:id/execute
  const executeMatch = path.match(/^\/api\/v1\/workflows\/([^/]+)\/execute$/);
  if (executeMatch && method === 'POST') {
    const workflowId = executeMatch[1];
    const inputData = body ? JSON.parse(body) : {};
    const execution = createExecution(workflowId, inputData);

    if (execution) {
      res.writeHead(200);
      res.end(JSON.stringify(execution));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Workflow not found' }));
    }
    return;
  }

  // GET /api/v1/executions
  if (path === '/api/v1/executions' && method === 'GET') {
    res.writeHead(200);
    res.end(JSON.stringify({ data: Object.values(mockExecutions) }));
    return;
  }

  // GET /api/v1/executions/:id
  const executionMatch = path.match(/^\/api\/v1\/executions\/([^/]+)$/);
  if (executionMatch && method === 'GET') {
    const execution = mockExecutions[executionMatch[1]];
    if (execution) {
      res.writeHead(200);
      res.end(JSON.stringify(execution));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Execution not found' }));
    }
    return;
  }

  // GET /api/v1/credentials
  if (path === '/api/v1/credentials' && method === 'GET') {
    res.writeHead(200);
    res.end(JSON.stringify({ data: mockCredentials }));
    return;
  }

  // Health check
  if (path === '/health' || path === '/healthz') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }

  // 404 for unknown routes
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found', path, method }));
}

// Server configuration
const PORT = parseInt(process.env.MOCK_N8N_PORT || '5678', 10);

export function startMockN8nServer(port: number = PORT): Promise<ReturnType<typeof createServer>> {
  return new Promise((resolve, reject) => {
    const server = createServer(handleRequest);
    server.on('error', reject);
    server.listen(port, () => {
      console.log(`Mock n8n server running at http://localhost:${port}`);
      console.log('Available endpoints:');
      console.log('  GET  /api/v1/workflows');
      console.log('  GET  /api/v1/workflows/:id');
      console.log('  POST /api/v1/workflows/:id/execute');
      console.log('  GET  /api/v1/executions');
      console.log('  GET  /api/v1/executions/:id');
      console.log('  GET  /api/v1/credentials');
      console.log('  GET  /health');
      resolve(server);
    });
  });
}

export function stopMockN8nServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

// Export mock data for direct testing
export { mockWorkflows, mockExecutions, mockCredentials };

// Start server if run directly
if (require.main === module) {
  startMockN8nServer().catch(console.error);
}
