/**
 * Registered qe/tests/schedule (qe_tests_schedule) must reject option-shaped git refs through the
 * real MCP protocol server (CLI parity: tests/unit/shared/git-ref-validation.test.ts).
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MCPProtocolServer } from '../../../src/mcp/protocol-server.js';

describe('qe/tests/schedule gitRef validation via tools/call', () => {
  let server: MCPProtocolServer;
  let repo: string;
  const originalCwd = process.cwd();

  async function callTool(name: string, args: Record<string, unknown>) {
    const response = await server['handleRequest']({
      jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args },
    }) as { content: Array<{ text: string }> };
    return JSON.parse(response.content[0].text) as { success: boolean; error?: string };
  }

  beforeAll(async () => {
    repo = mkdtempSync(join(tmpdir(), 'aqe-gitref-mcp-'));
    execFileSync('git', ['init', '-q'], { cwd: repo });
    writeFileSync(join(repo, 'a.ts'), 'export const a = 1;\n');
    process.chdir(repo);
    vi.stubEnv('AQE_PROJECT_ROOT', repo);
    vi.stubEnv('AQE_MEMORY_BACKEND', 'memory');
    vi.stubEnv('AQE_LOOP_DETECTION_ENABLED', 'false');
    vi.stubEnv('AQE_LLM_ROUTER_DISABLED', 'true');
    vi.stubEnv('AQE_LEARNING_ENABLED', 'false');
    const { createMCPProtocolServer } = await import('../../../src/mcp/protocol-server.js');
    server = createMCPProtocolServer();
    const fleet = await callTool('fleet_init', { memoryBackend: 'memory', maxAgents: 2 });
    expect(fleet.success).toBe(true);
  }, 60000);

  afterAll(async () => {
    await server?.stop();
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
    rmSync(repo, { recursive: true, force: true });
  });

  it('rejects a gitRef that git would parse as an option and writes nothing', async () => {
    const marker = join(repo, 'pwned');
    const result = await callTool('qe/tests/schedule', { cwd: repo, gitRef: `--output=${marker}` });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid gitRef');
    expect(existsSync(marker)).toBe(false);
  });
});
