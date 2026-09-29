import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cli = resolve('dist/cli/bundle.js');
const mcp = resolve('dist/mcp/bundle.js');
const built = existsSync(cli) && existsSync(mcp);

describe.skipIf(!built && !process.env.CI)('built CLI and MCP use the ancestor project store (#735)', () => {
  it.each(['sub', '.agentic-qe'])('keeps CLI status and hook storage at the project root from %s', nested => {
    const root = mkdtempSync(join(tmpdir(), 'aqe-subdir-cli-'));
    mkdirSync(join(root, '.agentic-qe'));
    mkdirSync(join(root, 'sub'));
    writeFileSync(join(root, 'fixture.ts'), 'export const fixture = true;\n');
    const env = { ...process.env, AQE_MEMORY_BACKEND: 'memory' };
    delete env.AQE_PROJECT_ROOT;
    delete env.AQE_STORAGE_PATH;
    delete env.AQE_MEMORY_PATH;
    try {
      for (const args of [['status'], ['hooks', 'post-edit', '--file', join(root, 'fixture.ts')]]) {
        const result = spawnSync(process.execPath, [cli, ...args], { cwd: join(root, nested), env, encoding: 'utf8', timeout: 30000 });
        expect(result.status, result.stderr).toBe(0);
        expect(result.stderr).not.toContain('not initialized in this directory');
        expect(existsSync(join(root, nested, '.agentic-qe'))).toBe(false);
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 65000);

  it('keeps MCP startup from creating a subfolder store', () => {
    const root = mkdtempSync(join(tmpdir(), 'aqe-subdir-mcp-'));
    mkdirSync(join(root, '.agentic-qe'));
    mkdirSync(join(root, 'sub'));
    const env = { ...process.env, AQE_MEMORY_BACKEND: 'memory', AQE_HTTP_PORT: '0' };
    delete env.AQE_PROJECT_ROOT;
    delete env.AQE_STORAGE_PATH;
    delete env.AQE_MEMORY_PATH;
    try {
      const input = [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'storage-root', version: '1' } } },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      ].map(message => JSON.stringify(message)).join('\n') + '\n';
      const result = spawnSync(process.execPath, [mcp], { cwd: join(root, 'sub'), env, input, encoding: 'utf8', timeout: 30000, maxBuffer: 5 * 1024 * 1024 });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('"tools"');
      expect(existsSync(join(root, 'sub', '.agentic-qe'))).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 35000);
});
