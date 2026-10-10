/**
 * Test: `aqe init` MCP flags through the real Commander parser (#931, #922)
 *
 * `--no-mcp` is a Commander negatable flag, so it arrives as
 * `options.mcp === false`, never as `options.noMcp`. These tests parse real
 * argv with the real InitHandler registration and assert what reaches the
 * modular init orchestrator.
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
  resolveInitMcpFlags,
} from '../../../src/cli/handlers/init-mcp-flags.js';
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

describe('aqe init MCP flags (#931)', () => {
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
      expect(resolveInitMcpFlags(options)).toEqual({ noMcp: true, withMcp: false });
    });

    it('no MCP flags resolves to the default (entry written)', async () => {
      const options = await parseOptions([]);

      expect(options.mcp).toBe(true);
      expect(resolveInitMcpFlags(options)).toEqual({ noMcp: false, withMcp: false });
    });

    it('--with-mcp resolves to withMcp', async () => {
      const options = await parseOptions(['--with-mcp']);

      expect(resolveInitMcpFlags(options)).toEqual({ noMcp: false, withMcp: true });
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

    it('--auto --with-mcp passes withMcp: true', async () => {
      const { program } = buildProgram();

      await program.parseAsync(['node', 'aqe', 'init', '--auto', '--with-mcp']);

      expect(captured.options).toMatchObject({ noMcp: false, withMcp: true });
    });
  });

  describe('resolveInitMcpFlags (programmatic callers)', () => {
    it('honours the legacy noMcp alias', () => {
      expect(resolveInitMcpFlags({ noMcp: true })).toEqual({ noMcp: true, withMcp: false });
    });

    it('throws on a contradictory combination', () => {
      expect(() => resolveInitMcpFlags({ noMcp: true, withMcp: true })).toThrow(INIT_MCP_FLAG_CONFLICT_MESSAGE);
      expect(() => resolveInitMcpFlags({ mcp: false, withMcp: true })).toThrow(INIT_MCP_FLAG_CONFLICT_MESSAGE);
    });
  });
});
