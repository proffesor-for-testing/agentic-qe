#!/usr/bin/env node
/**
 * Manual Test: MCP Learning Persistence
 *
 * Tests that learning data (experiences, patterns) persists correctly
 * through the aqe-mcp server to .agentic-qe/memory.db
 *
 * Run: node tests/manual/test-mcp-learning.js
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.join(__dirname, '../..');
const MCP_BIN = path.join(PROJECT_ROOT, 'bin', 'aqe-mcp');
const DB_PATH = path.join(PROJECT_ROOT, '.agentic-qe', 'memory.db');

// Test data
const TEST_AGENT_ID = `mcp-test-agent-${Date.now()}`;
const TEST_EXPERIENCE = {
  agentId: TEST_AGENT_ID,
  taskType: 'unit-test-generation',
  reward: 0.87,
  outcome: {
    testsGenerated: 5,
    coverage: 78.5,
    passed: true
  },
  metadata: {
    framework: 'jest',
    language: 'typescript',
    testFile: 'UserService.test.ts'
  }
};

const TEST_PATTERN = {
  agentId: TEST_AGENT_ID,
  pattern: 'async-await-error-handling',
  confidence: 0.92,
  domain: 'test-generation',
  metadata: {
    description: 'Pattern for handling async/await with try-catch in Jest tests',
    framework: 'jest',
    example: 'await expect(asyncFn()).rejects.toThrow()'
  }
};

let mcp = null;
let requestId = 0;
let responseBuffer = '';
const pendingResponses = new Map();

function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}${dataStr}`);
}

function sendRequest(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    pendingResponses.set(id, { resolve, reject, method });

    const requestStr = JSON.stringify(request) + '\n';
    log('debug', `Sending request: ${method}`, { id });
    mcp.stdin.write(requestStr);

    // Timeout after 10 seconds
    setTimeout(() => {
      if (pendingResponses.has(id)) {
        pendingResponses.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }
    }, 10000);
  });
}

function handleResponse(data) {
  responseBuffer += data.toString();

  // Try to parse complete JSON-RPC messages
  const lines = responseBuffer.split('\n');
  responseBuffer = lines.pop() || ''; // Keep incomplete line in buffer

  for (const line of lines) {
    if (!line.trim()) continue;

    try {
      const response = JSON.parse(line);

      if (response.id && pendingResponses.has(response.id)) {
        const { resolve, reject, method } = pendingResponses.get(response.id);
        pendingResponses.delete(response.id);

        if (response.error) {
          log('error', `Request failed: ${method}`, { error: response.error });
          reject(new Error(response.error.message || JSON.stringify(response.error)));
        } else {
          log('debug', `Response received: ${method}`, { id: response.id });
          resolve(response.result);
        }
      }
    } catch (e) {
      // Not a valid JSON line, might be a notification or partial data
      if (line.trim().length > 0) {
        log('debug', 'Non-JSON output', { line: line.substring(0, 100) });
      }
    }
  }
}

async function verifyDatabase() {
  log('info', 'Verifying database contents...');

  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`Database not found at ${DB_PATH}`);
  }

  // Use better-sqlite3 to check database
  const Database = require('better-sqlite3');
  const db = new Database(DB_PATH, { readonly: true });

  try {
    // Check experiences
    const experiences = db.prepare(`
      SELECT id, agent_id, task_type, reward, metadata
      FROM learning_experiences
      WHERE agent_id = ?
      ORDER BY created_at DESC
    `).all(TEST_AGENT_ID);

    log('info', `Found ${experiences.length} experience(s) for test agent`);

    if (experiences.length > 0) {
      const exp = experiences[0];
      log('info', 'Latest experience:', {
        id: exp.id,
        taskType: exp.task_type,
        reward: exp.reward
      });
    }

    // Check patterns
    const patterns = db.prepare(`
      SELECT id, pattern, confidence, domain, usage_count, metadata
      FROM patterns
      WHERE agent_id = ?
      ORDER BY created_at DESC
    `).all(TEST_AGENT_ID);

    log('info', `Found ${patterns.length} pattern(s) for test agent`);

    if (patterns.length > 0) {
      const pat = patterns[0];
      log('info', 'Latest pattern:', {
        id: pat.id,
        pattern: pat.pattern,
        confidence: pat.confidence,
        domain: pat.domain
      });
    }

    return { experiences, patterns };

  } finally {
    db.close();
  }
}

async function runTests() {
  log('info', '='.repeat(60));
  log('info', 'MCP Learning Persistence Test');
  log('info', '='.repeat(60));
  log('info', `Test Agent ID: ${TEST_AGENT_ID}`);
  log('info', `Database Path: ${DB_PATH}`);
  log('info', '');

  // Start MCP server
  log('info', 'Starting MCP server...');

  mcp = spawn('node', [MCP_BIN], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: PROJECT_ROOT
  });

  mcp.stdout.on('data', handleResponse);
  mcp.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) log('debug', `[MCP stderr] ${msg}`);
  });

  mcp.on('error', (err) => {
    log('error', 'MCP process error', { error: err.message });
  });

  mcp.on('close', (code) => {
    log('info', `MCP process exited with code ${code}`);
  });

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 1000));

  try {
    // 1. Initialize MCP
    log('info', '');
    log('info', 'Step 1: Initialize MCP connection');
    const initResult = await sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'learning-test', version: '1.0.0' }
    });
    log('info', 'MCP initialized', {
      serverName: initResult?.serverInfo?.name,
      version: initResult?.serverInfo?.version
    });

    // 2. Store learning experience
    log('info', '');
    log('info', 'Step 2: Store learning experience via MCP');
    const expResult = await sendRequest('tools/call', {
      name: 'mcp__agentic_qe__learning_store_experience',
      arguments: TEST_EXPERIENCE
    });

    // Parse the result content
    const expContent = expResult?.content?.[0]?.text;
    if (expContent) {
      const parsed = JSON.parse(expContent);
      if (parsed.success) {
        log('info', 'Experience stored successfully', {
          experienceId: parsed.data?.experienceId
        });
      } else {
        throw new Error(`Failed to store experience: ${parsed.error}`);
      }
    }

    // 3. Store learning pattern
    log('info', '');
    log('info', 'Step 3: Store learning pattern via MCP');
    const patResult = await sendRequest('tools/call', {
      name: 'mcp__agentic_qe__learning_store_pattern',
      arguments: TEST_PATTERN
    });

    const patContent = patResult?.content?.[0]?.text;
    if (patContent) {
      const parsed = JSON.parse(patContent);
      if (parsed.success) {
        log('info', 'Pattern stored successfully', {
          patternId: parsed.data?.patternId
        });
      } else {
        throw new Error(`Failed to store pattern: ${parsed.error}`);
      }
    }

    // 4. Query learning data via MCP
    log('info', '');
    log('info', 'Step 4: Query learning data via MCP');
    const queryResult = await sendRequest('tools/call', {
      name: 'mcp__agentic_qe__learning_query',
      arguments: {
        agentId: TEST_AGENT_ID,
        queryType: 'all',
        limit: 10
      }
    });

    const queryContent = queryResult?.content?.[0]?.text;
    if (queryContent) {
      const parsed = JSON.parse(queryContent);
      if (parsed.success) {
        log('info', 'Query successful', {
          experiences: parsed.data?.experiences?.length || 0,
          patterns: parsed.data?.patterns?.length || 0,
          qValues: parsed.data?.qValues?.length || 0
        });
      } else {
        log('warn', 'Query returned error', { error: parsed.error });
      }
    }

    // 5. Verify database directly
    log('info', '');
    log('info', 'Step 5: Verify data in database');

    // Give time for any async writes
    await new Promise(resolve => setTimeout(resolve, 500));

    const dbData = await verifyDatabase();

    // 6. Summary
    log('info', '');
    log('info', '='.repeat(60));
    log('info', 'TEST RESULTS');
    log('info', '='.repeat(60));

    const expFound = dbData.experiences.length > 0;
    const patFound = dbData.patterns.length > 0;

    if (expFound && patFound) {
      log('info', 'SUCCESS: Learning persistence is working correctly!');
      log('info', `  - Experiences stored: ${dbData.experiences.length}`);
      log('info', `  - Patterns stored: ${dbData.patterns.length}`);
      log('info', `  - Database: ${DB_PATH}`);
    } else {
      log('error', 'FAILURE: Some data was not persisted');
      log('error', `  - Experiences found: ${expFound}`);
      log('error', `  - Patterns found: ${patFound}`);
    }

    return expFound && patFound;

  } finally {
    // Cleanup: kill MCP server
    log('info', '');
    log('info', 'Stopping MCP server...');
    mcp.kill('SIGTERM');

    // Wait for process to exit
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

// Run tests
runTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    log('error', 'Test failed with error', { error: err.message });
    if (mcp) mcp.kill('SIGTERM');
    process.exit(1);
  });
