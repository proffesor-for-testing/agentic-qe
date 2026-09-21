/**
 * Test: PrimeAgentInstaller
 * Tests Prime Agent skill/subagent seeding, AGENTS.md guidance merge, and
 * the user-level MCP instruction (instruct vs auto modes).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'path';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    copyFileSync: vi.fn(),
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
  readFileSync,
} from 'fs';

const mockExistsSync = existsSync as ReturnType<typeof vi.fn>;
const mockMkdirSync = mkdirSync as ReturnType<typeof vi.fn>;
const mockWriteFileSync = writeFileSync as ReturnType<typeof vi.fn>;
const mockReadFileSync = readFileSync as ReturnType<typeof vi.fn>;
const mockCopyFileSync = copyFileSync as ReturnType<typeof vi.fn>;
const mockReaddirSync = readdirSync as ReturnType<typeof vi.fn>;
const mockStatSync = statSync as ReturnType<typeof vi.fn>;

/** Pretend the packaged asset trees exist at /test/project. */
function mockPackagedAssets(): void {
  mockExistsSync.mockImplementation((p: unknown) => {
    const s = String(p);
    return s.includes(join('..', '..', '.agents', 'skills')) ||
      s === '/test/project/.prime' ||
      s.includes('.agents') ||
      s.includes('.claude');
  });
  mockStatSync.mockImplementation((p: unknown) => ({
    isDirectory: () => !String(p).endsWith('.md'),
    isFile: () => String(p).endsWith('.md'),
  }) as never);
  mockReaddirSync.mockReturnValue([]);
}

describe('PrimeAgentInstaller', () => {
  const projectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    mockPackagedAssets();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('install() - fresh project', () => {
    beforeEach(() => {
      mockExistsSync.mockImplementation(() => false);
    });

    it('instructs the user with the exact MCP command by default', async () => {
      const { createPrimeAgentInstaller } = await import(
        '../../../src/init/primeagent-installer.js'
      );
      const installer = createPrimeAgentInstaller({ projectRoot });
      const result = await installer.install();

      expect(result.mcpMode).toBe('instruct');
      expect(result.mcpInstructed).toBe(true);
      expect(result.mcpAdded).toBe(false);
      expect(result.mcpCommand).toContain('prime-agent mcp add aqe');
      expect(result.mcpCommand).toContain('npx -y agentic-qe@latest mcp');
      expect(result.mcpCommand).toContain('AQE_V3_MODE=true');
    });

    it('uses database-free env when memoryBackend is memory', async () => {
      const { createPrimeAgentInstaller } = await import(
        '../../../src/init/primeagent-installer.js'
      );
      const installer = createPrimeAgentInstaller({ projectRoot, memoryBackend: 'memory' });
      const result = await installer.install();

      expect(result.mcpCommand).toContain('AQE_MEMORY_BACKEND=memory');
      expect(result.mcpCommand).not.toContain('AQE_MEMORY_PATH');
    });

    it('skips MCP entirely in none mode', async () => {
      const { createPrimeAgentInstaller } = await import(
        '../../../src/init/primeagent-installer.js'
      );
      const installer = createPrimeAgentInstaller({ projectRoot, installMcp: 'none' });
      const result = await installer.install();

      expect(result.mcpMode).toBe('none');
      expect(result.mcpInstructed).toBe(false);
      expect(result.mcpCommand).toBe('');
    });

    it('creates AGENTS.md with owned sentinel section', async () => {
      const { createPrimeAgentInstaller } = await import(
        '../../../src/init/primeagent-installer.js'
      );
      const installer = createPrimeAgentInstaller({ projectRoot });
      const result = await installer.install();

      const agentsCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('AGENTS.md')
      );
      expect(agentsCall).toBeDefined();
      const content = agentsCall![1] as string;
      expect(content).toContain('<!-- BEGIN AGENTIC-QE PRIME-AGENT -->');
      expect(content).toContain('<!-- END AGENTIC-QE PRIME-AGENT -->');
      expect(content).toContain('Quality Engineering Standards');
      expect(result.agentsMdInstalled).toBe(true);
      expect(result.components.rules.status).toBe('installed');
    });

    it('writes skills under .prime/agent/skills', async () => {
      // findPackageRoot walks up to the nearest package.json; make it stop
      // at the fake packaged root containing the asset trees. Nothing
      // exists yet inside the project itself.
      mockExistsSync.mockImplementation((target: unknown) => {
        const s = String(target);
        return s.endsWith('package.json') || s.includes('.agents') || s.includes('.claude');
      });
      mockReadFileSync.mockImplementation((target: unknown) => {
        if (String(target).endsWith('package.json')) return '{"name":"agentic-qe"}';
        return '';
      });
      const { createPrimeAgentInstaller } = await import(
        '../../../src/init/primeagent-installer.js'
      );
      const installer = createPrimeAgentInstaller({ projectRoot });
      const result = await installer.install();

      const mkdirCalls = mockMkdirSync.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(mkdirCalls.some((c) => c.includes(join('.prime', 'agent', 'skills')))).toBe(true);
      expect(result.skillsInstalled).toBe(5);
    });

    it('seeds the aqe-fleet subagent skill', async () => {
      mockExistsSync.mockImplementation((target: unknown) => {
        const s = String(target);
        return s.endsWith('package.json') || s.includes('.agents') || s.includes('.claude');
      });
      mockReadFileSync.mockImplementation((target: unknown) => {
        if (String(target).endsWith('package.json')) return '{"name":"agentic-qe"}';
        return '';
      });
      const { createPrimeAgentInstaller } = await import(
        '../../../src/init/primeagent-installer.js'
      );
      const installer = createPrimeAgentInstaller({ projectRoot });
      const result = await installer.install();

      expect(result.subagentsSeeded).toBe(8);
      expect(result.fleetSkillPath).toContain(join('.prime', 'agent', 'skills', 'aqe-fleet'));
      const skillCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('SKILL.md') && (c[0] as string).includes('aqe-fleet')
      );
      expect(skillCall).toBeDefined();
      expect(skillCall![1] as string).toContain('name: aqe-fleet');
    });
  });

  describe('install() - AGENTS.md merge', () => {
    it('appends the owned section to existing user content', async () => {
      mockExistsSync.mockImplementation((p: unknown) => {
        const s = String(p);
        if (s.endsWith('AGENTS.md')) return true;
        return s.includes('.agents') || s.includes('.claude');
      });
      mockReadFileSync.mockImplementation((p: unknown) => {
        if (String(p).endsWith('AGENTS.md')) {
          return '# My project\n\nUser-written guidance stays untouched.\n';
        }
        return '';
      });

      const { createPrimeAgentInstaller } = await import(
        '../../../src/init/primeagent-installer.js'
      );
      const installer = createPrimeAgentInstaller({ projectRoot, overwrite: true });
      const result = await installer.install();

      const agentsCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('AGENTS.md')
      );
      const content = agentsCall![1] as string;
      expect(content).toContain('User-written guidance stays untouched.');
      expect(content).toContain('<!-- BEGIN AGENTIC-QE PRIME-AGENT -->');
      expect(result.components.rules.status).toBe('updated');
    });

    it('replaces a previously owned section instead of duplicating it', async () => {
      const previous = [
        '# My project',
        '',
        '<!-- BEGIN AGENTIC-QE PRIME-AGENT -->',
        'Old guidance.',
        '<!-- END AGENTIC-QE PRIME-AGENT -->',
        '',
      ].join('\n');
      mockExistsSync.mockImplementation((p: unknown) => {
        const s = String(p);
        if (s.endsWith('AGENTS.md')) return true;
        return s.includes('.agents') || s.includes('.claude');
      });
      mockReadFileSync.mockImplementation((p: unknown) => {
        if (String(p).endsWith('AGENTS.md')) return previous;
        return '';
      });

      const { createPrimeAgentInstaller } = await import(
        '../../../src/init/primeagent-installer.js'
      );
      const installer = createPrimeAgentInstaller({ projectRoot, overwrite: true });
      const result = await installer.install();

      const agentsCall = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('AGENTS.md')
      );
      const content = agentsCall![1] as string;
      expect(content.match(/BEGIN AGENTIC-QE PRIME-AGENT/g)?.length).toBe(1);
      expect(content).not.toContain('Old guidance.');
      expect(result.ownedGuidanceBytes).toBeGreaterThan(0);
    });

    it('preserves a malformed sentinel file instead of merging into it', async () => {
      mockExistsSync.mockImplementation((p: unknown) => {
        const s = String(p);
        if (s.endsWith('AGENTS.md')) return true;
        return s.includes('.agents') || s.includes('.claude');
      });
      mockReadFileSync.mockImplementation((p: unknown) => {
        if (String(p).endsWith('AGENTS.md')) {
          return '<!-- BEGIN AGENTIC-QE PRIME-AGENT -->\nUnbalanced sentinel.\n';
        }
        return '';
      });

      const { createPrimeAgentInstaller } = await import(
        '../../../src/init/primeagent-installer.js'
      );
      const installer = createPrimeAgentInstaller({ projectRoot, overwrite: true });
      const result = await installer.install();

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Malformed Agentic QE Prime Agent sentinel');
      expect(result.components.rules.status).toBe('failed');
      // The malformed file is never written.
      expect(
        mockWriteFileSync.mock.calls.some((c: unknown[]) => (c[0] as string).endsWith('AGENTS.md'))
      ).toBe(false);
    });
  });

  describe('install() - MCP auto mode', () => {
    it('registers the server when the binary is available', async () => {
      mockExistsSync.mockImplementation(() => false);
      const runCommand = vi.fn((argv: string[]) => {
        expect(argv[0]).toBe('prime-agent');
        if (argv[1] === '--version') return { status: 0, stderr: '' };
        expect(argv.slice(1, 4)).toEqual(['mcp', 'add', 'aqe']);
        expect(argv).toContain('--');
        return { status: 0, stderr: '' };
      });

      const { createPrimeAgentInstaller } = await import(
        '../../../src/init/primeagent-installer.js'
      );
      const installer = createPrimeAgentInstaller({
        projectRoot,
        installMcp: 'auto',
        runCommand: runCommand as never,
      });
      const result = await installer.install();

      expect(result.mcpAdded).toBe(true);
      expect(result.mcpInstructed).toBe(false);
      expect(result.components.mcp.status).toBe('installed');
      expect(result.errors).toHaveLength(0);
    });

    it('falls back to instructing when the binary is not on PATH', async () => {
      mockExistsSync.mockImplementation(() => false);
      const runCommand = vi.fn((_argv: string[]) => ({
        status: 127,
        stderr: 'prime-agent: command not found',
      }));

      const { createPrimeAgentInstaller } = await import(
        '../../../src/init/primeagent-installer.js'
      );
      const installer = createPrimeAgentInstaller({
        projectRoot,
        installMcp: 'auto',
        runCommand: runCommand as never,
      });
      const result = await installer.install();

      expect(result.mcpAdded).toBe(false);
      expect(result.mcpInstructed).toBe(true);
      expect(result.components.mcp.status).toBe('failed');
      expect(result.errors[0]).toContain('run this command yourself');
    });
  });

  describe('removeGuidance()', () => {
    it('removes only the owned section', async () => {
      mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith('AGENTS.md'));
      mockReadFileSync.mockImplementation((p: unknown) =>
        String(p).endsWith('AGENTS.md')
          ? [
              '# My project',
              '',
              '<!-- BEGIN AGENTIC-QE PRIME-AGENT -->',
              'Guidance to remove.',
              '<!-- END AGENTIC-QE PRIME-AGENT -->',
              '',
            ].join('\n')
          : '',
      );

      const { createPrimeAgentInstaller } = await import(
        '../../../src/init/primeagent-installer.js'
      );
      const installer = createPrimeAgentInstaller({ projectRoot });
      installer.removeGuidance();

      const call = mockWriteFileSync.mock.calls.find(
        (c: unknown[]) => (c[0] as string).endsWith('AGENTS.md')
      );
      expect(call).toBeDefined();
      const content = call![1] as string;
      expect(content).toContain('# My project');
      expect(content).not.toContain('Guidance to remove.');
    });
  });
});
