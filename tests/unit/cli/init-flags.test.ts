/**
 * Test: `aqe init` negatable flags through the real Commander parser
 * (#922, #931, #935)
 *
 * `--no-<name>` is a Commander negatable flag, so it arrives as
 * `options.<name> === false`, never as `options.no<Name>`. These tests parse
 * real argv with the real InitHandler registration and assert what reaches
 * the modular init orchestrator.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command, CommanderError } from 'commander';

const captured: { options?: Record<string, unknown> } = {};

vi.mock('../../../src/init/orchestrator.js', () => ({
  createModularInitOrchestrator: (options: Record<string, unknown>) => {
    captured.options = options;
    return {
      initialize: async () => {
        throw new Error('stop-after-capture');
      },
    };
  },
}));

import { InitHandler } from '../../../src/cli/handlers/init-handler.js';
import {
  INIT_MCP_FLAG_CONFLICT_MESSAGE,
  resolveInitFlags,
} from '../../../src/cli/handlers/init-flags.js';
import type { CLIContext } from '../../../src/cli/handlers/interfaces.js';

function buildProgram() {
  const errors: string[] = [];
  const program = new Command();
  program.exitOverride();
  program.configureOutput({ writeErr: (s) => errors.push(s), writeOut: () => {} });
  const cleanupAndExit = vi.fn(async () => undefined as never);
  const handler = new InitHandler(cleanupAndExit);
  handler.register(program, {} as CLIContext);
  return { program, handler, errors, cleanupAndExit };
}

/** Parse argv with the real registration but capture options instead of running init. */
async function parseOptions(args: string[]): Promise<Record<string, unknown>> {
  const { program, handler } = buildProgram();
  let options: Record<string, unknown> = {};
  vi.spyOn(handler, 'execute').mockImplementation(async (opts) => {
    options = opts as unknown as Record<string, unknown>;
  });
  await program.parseAsync(['node', 'aqe', 'init', ...args]);
  return options;
}

describe('aqe init negatable flags (#931, #935)', () => {
  beforeEach(() => {
    captured.options = undefined;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Commander parsing', () => {
    it('--no-mcp parses to mcp === false (never noMcp)', async () => {
      const options = await parseOptions(['--no-mcp']);

      expect(options.mcp).toBe(false);
      expect(options.noMcp).toBeUndefined();
      expect(resolveInitFlags(options)).toMatchObject({ noMcp: true, withMcp: false });
    });

    it('no MCP flags resolves to the default (entry written)', async () => {
      const options = await parseOptions([]);

      expect(options.mcp).toBe(true);
      expect(resolveInitFlags(options)).toMatchObject({ noMcp: false, withMcp: false });
    });

    it('--with-mcp resolves to withMcp', async () => {
      const options = await parseOptions(['--with-mcp']);

      expect(resolveInitFlags(options)).toMatchObject({ noMcp: false, withMcp: true });
    });

    it('--no-governance parses to governance === false and resolves noGovernance (#935)', async () => {
      const options = await parseOptions(['--no-governance']);

      expect(options.governance).toBe(false);
      expect(options.noGovernance).toBeUndefined();
      expect(resolveInitFlags(options)).toMatchObject({ noGovernance: true, noMcp: false });
    });

    it('no flags resolves every negatable flag to its default (on)', async () => {
      const options = await parseOptions([]);

      expect(resolveInitFlags(options)).toEqual({
        noMcp: false,
        withMcp: false,
        noGovernance: false,
        noClaude: false,
        noStatusLine: false,
        noDatabase: false,
      });
    });

    it.each([
      ['--no-mcp', 'noMcp'],
      ['--no-governance', 'noGovernance'],
      ['--no-claude', 'noClaude'],
      ['--no-statusline', 'noStatusLine'],
      ['--no-database', 'noDatabase'],
    ])('%s resolves %s and nothing else', async (flag, key) => {
      const resolved = resolveInitFlags(await parseOptions([flag]));

      const on = Object.entries(resolved).filter(([, v]) => v).map(([k]) => k);
      expect(on).toEqual([key]);
    });

    it.each([
      [['--no-mcp', '--with-mcp']],
      [['--with-mcp', '--no-mcp']],
    ])('rejects %j with a clear parse error', async (args) => {
      const { program, handler, errors } = buildProgram();
      const execute = vi.spyOn(handler, 'execute').mockResolvedValue(undefined);

      const parse = program.parseAsync(['node', 'aqe', 'init', ...args]);

      await expect(parse).rejects.toBeInstanceOf(CommanderError);
      await parse.catch((e: CommanderError) => expect(e.code).toBe('commander.conflictingOption'));
      expect(errors.join('')).toMatch(/--with-mcp.*cannot be used with.*--no-mcp|--no-mcp.*cannot be used with.*--with-mcp/);
      expect(execute).not.toHaveBeenCalled();
    });
  });

  describe('argv to orchestrator options (real execute)', () => {
    it('--auto --no-mcp passes noMcp: true to the modular orchestrator', async () => {
      const { program } = buildProgram();

      await program.parseAsync(['node', 'aqe', 'init', '--auto', '--no-mcp']);

      expect(captured.options).toMatchObject({ noMcp: true, withMcp: false });
    });

    it('--auto alone passes noMcp: false', async () => {
      const { program } = buildProgram();

      await program.parseAsync(['node', 'aqe', 'init', '--auto']);

      expect(captured.options).toMatchObject({ noMcp: false, withMcp: false });
    });

    it('--auto --no-governance passes noGovernance: true (#935)', async () => {
      const { program } = buildProgram();

      await program.parseAsync(['node', 'aqe', 'init', '--auto', '--no-governance']);

      expect(captured.options).toMatchObject({ noGovernance: true, noMcp: false });
    });

    it('--auto alone passes noGovernance: false', async () => {
      const { program } = buildProgram();

      await program.parseAsync(['node', 'aqe', 'init', '--auto']);

      expect(captured.options).toMatchObject({ noGovernance: false, noClaude: false, noStatusLine: false });
    });

    it('--auto --with-mcp passes withMcp: true', async () => {
      const { program } = buildProgram();

      await program.parseAsync(['node', 'aqe', 'init', '--auto', '--with-mcp']);

      expect(captured.options).toMatchObject({ noMcp: false, withMcp: true });
    });
  });

  describe('resolveInitFlags (programmatic callers)', () => {
    it('honours the programmatic no<Name> aliases', () => {
      expect(resolveInitFlags({ noMcp: true })).toMatchObject({ noMcp: true, withMcp: false });
      expect(resolveInitFlags({ noGovernance: true })).toMatchObject({ noGovernance: true });
      expect(resolveInitFlags({ noClaude: true, noStatusLine: true })).toMatchObject({ noClaude: true, noStatusLine: true });
    });

    it('throws on a contradictory combination', () => {
      expect(() => resolveInitFlags({ noMcp: true, withMcp: true })).toThrow(INIT_MCP_FLAG_CONFLICT_MESSAGE);
      expect(() => resolveInitFlags({ mcp: false, withMcp: true })).toThrow(INIT_MCP_FLAG_CONFLICT_MESSAGE);
    });
  });
});
