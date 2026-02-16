/**
 * Test: MCPPhase (Phase 08)
 * Tests MCP server configuration, file writing, and merge behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MCPPhase } from '../../../../src/init/phases/08-mcp.js';
import type { InitContext } from '../../../../src/init/phases/phase-interface.js';

// Mock fs
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('{}'),
    writeFileSync: vi.fn(),
  };
});

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

function createMockContext(overrides: Partial<InitContext> = {}): InitContext {
  return {
    projectRoot: '/tmp/test-mcp',
    options: {},
    config: {},
    enhancements: { claudeFlow: false, ruvector: false },
    results: new Map(),
    services: {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    ...overrides,
  };
}

describe('MCPPhase', () => {
  let phase: MCPPhase;

  beforeEach(() => {
    phase = new MCPPhase();
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(mkdirSync).mockReturnValue(undefined as any);
    vi.mocked(readFileSync).mockReturnValue('{}');
    vi.mocked(writeFileSync).mockReturnValue(undefined);
  });

  describe('phase metadata', () => {
    it('should have name "mcp"', () => {
      expect(phase.name).toBe('mcp');
    });

    it('should have order 80', () => {
      expect(phase.order).toBe(80);
    });

    it('should not be critical', () => {
      expect(phase.critical).toBe(false);
    });

    it('should require configuration and database phases', () => {
      expect(phase.requiresPhases).toContain('configuration');
      expect(phase.requiresPhases).toContain('database');
    });
  });

  describe('execute', () => {
    it('should write MCP config to .mcp.json at project root', async () => {
      const context = createMockContext();
      await phase.execute(context);

      expect(writeFileSync).toHaveBeenCalledWith(
        '/tmp/test-mcp/.mcp.json',
        expect.any(String),
        'utf-8'
      );

      // Verify JSON content
      const rootCall = vi.mocked(writeFileSync).mock.calls.find(
        (call: any[]) => (call[0] as string).endsWith('.mcp.json') && !(call[0] as string).includes('.claude')
      );
      expect(rootCall).toBeDefined();
      const parsed = JSON.parse(rootCall![1] as string);
      expect(parsed.mcpServers).toBeDefined();
      expect(parsed.mcpServers['agentic-qe']).toBeDefined();
      expect(parsed.mcpServers['agentic-qe'].command).toBe('aqe-mcp');
    });

    it('should write MCP config to .claude/mcp.json as alternative', async () => {
      const context = createMockContext();
      await phase.execute(context);

      expect(writeFileSync).toHaveBeenCalledWith(
        '/tmp/test-mcp/.claude/mcp.json',
        expect.any(String),
        'utf-8'
      );
    });

    it('should create .claude directory if it does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const context = createMockContext();
      await phase.execute(context);

      expect(mkdirSync).toHaveBeenCalledWith(
        '/tmp/test-mcp/.claude',
        expect.objectContaining({ recursive: true })
      );
    });

    it('should merge with existing .mcp.json content', async () => {
      const existingConfig = JSON.stringify({
        mcpServers: {
          'existing-server': { command: 'existing' },
        },
      });

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(existingConfig);

      const context = createMockContext();
      await phase.execute(context);

      // Verify readFileSync was called (meaning existing config was read)
      expect(readFileSync).toHaveBeenCalled();

      // Check all writeFileSync calls to find merged content
      const allWriteCalls = vi.mocked(writeFileSync).mock.calls;
      // At least one written config should have both servers
      const mergedCall = allWriteCalls.find((call: any[]) => {
        try {
          const parsed = JSON.parse(call[1] as string);
          return parsed.mcpServers?.['existing-server'] && parsed.mcpServers?.['agentic-qe'];
        } catch {
          return false;
        }
      });
      expect(mergedCall).toBeDefined();
    });

    it('should handle malformed existing .mcp.json gracefully', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('not-valid-json{{{');

      const context = createMockContext();
      const result = await phase.execute(context);

      // Should still succeed by starting with empty config
      expect(result.success).toBe(true);
    });

    it('should return correct MCPResult', async () => {
      const context = createMockContext();
      const result = await phase.execute(context);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.configured).toBe(true);
      expect(result.data!.serverName).toBe('agentic-qe');
      expect(result.data!.mcpPath).toContain('.mcp.json');
      expect(result.data!.alternativePath).toContain('.claude/mcp.json');
    });

    it('should include correct environment variables in server config', async () => {
      const context = createMockContext({ projectRoot: '/my/project' });
      await phase.execute(context);

      const rootCall = vi.mocked(writeFileSync).mock.calls.find(
        (call: any[]) => (call[0] as string) === '/my/project/.mcp.json'
      );
      const parsed = JSON.parse(rootCall![1] as string);
      const env = parsed.mcpServers['agentic-qe'].env;

      expect(env.AQE_PROJECT_ROOT).toBe('/my/project');
      expect(env.AQE_LEARNING_ENABLED).toBe('true');
      expect(env.AQE_WORKERS_ENABLED).toBe('true');
      expect(env.NODE_ENV).toBe('production');
    });

    it('should log MCP configuration details', async () => {
      const logFn = vi.fn();
      const context = createMockContext({
        services: { log: logFn, warn: vi.fn(), error: vi.fn() },
      });

      await phase.execute(context);

      expect(logFn).toHaveBeenCalledWith(expect.stringContaining('MCP config'));
      expect(logFn).toHaveBeenCalledWith(expect.stringContaining('agentic-qe'));
    });
  });
});
