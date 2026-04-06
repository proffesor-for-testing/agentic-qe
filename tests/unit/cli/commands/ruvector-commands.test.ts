/**
 * RuVector CLI Commands Tests
 * Tests for aqe ruvector status/flags subcommands
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRuVectorCommand } from '../../../../src/cli/commands/ruvector-commands.js';
import {
  resetRuVectorFeatureFlags,
  getRuVectorFeatureFlags,
  setRuVectorFeatureFlags,
} from '../../../../src/integrations/ruvector/feature-flags.js';
import type { Command } from 'commander';

// ============================================================================
// Test Helpers
// ============================================================================

let mockConsoleLog: ReturnType<typeof vi.spyOn>;
let mockExit: ReturnType<typeof vi.spyOn>;

async function executeCommand(cmd: Command, args: string[]): Promise<void> {
  cmd.exitOverride();
  cmd.configureOutput({
    writeOut: () => {},
    writeErr: () => {},
  });
  await cmd.parseAsync(args, { from: 'user' });
}

function getLogOutput(): string {
  return mockConsoleLog.mock.calls.map(call => call.join(' ')).join('\n');
}

// ============================================================================
// Tests
// ============================================================================

describe('RuVector CLI Commands', () => {
  let command: ReturnType<typeof createRuVectorCommand>;

  beforeEach(() => {
    resetRuVectorFeatureFlags();
    command = createRuVectorCommand();
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    resetRuVectorFeatureFlags();
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Command Structure
  // --------------------------------------------------------------------------

  describe('createRuVectorCommand', () => {
    it('should create a command with name "ruvector"', () => {
      expect(command.name()).toBe('ruvector');
    });

    it('should have a description', () => {
      expect(command.description()).toBeTruthy();
      expect(command.description()).toContain('RuVector');
    });

    it('should have status and flags subcommands', () => {
      const subcommandNames = command.commands.map(c => c.name());
      expect(subcommandNames).toContain('status');
      expect(subcommandNames).toContain('flags');
    });
  });

  // --------------------------------------------------------------------------
  // Status Subcommand
  // --------------------------------------------------------------------------

  describe('status subcommand', () => {
    it('should display native package information', async () => {
      await executeCommand(command, ['status']);

      const output = getLogOutput();
      expect(output).toContain('RuVector Integration Status');
      expect(output).toContain('Native Packages');
      // hnswlib-node replaced @ruvector/router for the native HNSW backend
      // in #399 / ADR-090.
      expect(output).toContain('hnswlib-node');
      expect(output).toContain('prime-radiant-advanced-wasm');
      expect(output).toContain('@ruvector/sona');
    });

    it('should display feature flag section', async () => {
      await executeCommand(command, ['status']);

      const output = getLogOutput();
      expect(output).toContain('Feature Flags');
      expect(output).toContain('useNativeHNSW');
      expect(output).toContain('useTemporalCompression');
      expect(output).toContain('useMetadataFiltering');
      expect(output).toContain('useDeterministicDither');
    });

    it('should show default marker for unmodified flags', async () => {
      await executeCommand(command, ['status']);

      const output = getLogOutput();
      expect(output).toContain('(default)');
    });

    it('should show modified marker when flag is changed', async () => {
      // useNativeHNSW history: was flipped to false in v3.9.5 (deadlock fix),
      // then flipped back to true after the #399 / ADR-090 hnswlib-node
      // migration. The default is now true, so setting it to false here
      // makes the value differ from the default and triggers the
      // (modified) marker.
      setRuVectorFeatureFlags({ useNativeHNSW: false });
      await executeCommand(command, ['status']);

      const output = getLogOutput();
      expect(output).toContain('(modified)');
    });

    it('should show compression details when temporal compression is enabled', async () => {
      setRuVectorFeatureFlags({ useTemporalCompression: true });
      await executeCommand(command, ['status']);

      const output = getLogOutput();
      expect(output).toContain('Temporal Compression');
      expect(output).toContain('8-bit');
      expect(output).toContain('5-bit');
      expect(output).toContain('3-bit');
    });

    it('should not show compression details when temporal compression is disabled', async () => {
      setRuVectorFeatureFlags({ useTemporalCompression: false });
      await executeCommand(command, ['status']);

      const output = getLogOutput();
      expect(output).not.toContain('Temporal Compression');
    });

    it('should show status for each native package', async () => {
      await executeCommand(command, ['status']);

      const output = getLogOutput();
      // Packages may be installed or show fallback info.
      // hnswlib-node and @ruvector/sona should be available.
      expect(output).toContain('hnswlib-node');
      expect(output).toContain('@ruvector/sona');
    });
  });

  // --------------------------------------------------------------------------
  // Flags Subcommand - Listing
  // --------------------------------------------------------------------------

  describe('flags subcommand - listing', () => {
    it('should list all feature flags with defaults', async () => {
      await executeCommand(command, ['flags']);

      const output = getLogOutput();
      expect(output).toContain('RuVector Feature Flags');
      expect(output).toContain('useQESONA');
      expect(output).toContain('useQEFlashAttention');
      expect(output).toContain('useQEGNNIndex');
      expect(output).toContain('logMigrationMetrics');
      expect(output).toContain('useNativeHNSW');
      expect(output).toContain('useTemporalCompression');
      expect(output).toContain('useMetadataFiltering');
      expect(output).toContain('useDeterministicDither');
    });

    it('should show descriptions for flags', async () => {
      await executeCommand(command, ['flags']);

      const output = getLogOutput();
      expect(output).toContain('Self-Optimizing Neural Architecture');
      expect(output).toContain('SIMD-accelerated attention');
    });

    it('should show profile hints', async () => {
      await executeCommand(command, ['flags']);

      const output = getLogOutput();
      expect(output).toContain('performance');
      expect(output).toContain('experimental');
      expect(output).toContain('safe');
    });
  });

  // --------------------------------------------------------------------------
  // Flags Subcommand - Setting Flags
  // --------------------------------------------------------------------------

  describe('flags subcommand - setting', () => {
    it('should set a flag to true', async () => {
      setRuVectorFeatureFlags({ useNativeHNSW: false });
      expect(getRuVectorFeatureFlags().useNativeHNSW).toBe(false);

      await executeCommand(command, ['flags', '--set', 'useNativeHNSW=true']);

      expect(getRuVectorFeatureFlags().useNativeHNSW).toBe(true);
      const output = getLogOutput();
      expect(output).toContain('useNativeHNSW');
    });

    it('should set a flag to false', async () => {
      expect(getRuVectorFeatureFlags().useQESONA).toBe(true);

      await executeCommand(command, ['flags', '--set', 'useQESONA=false']);

      expect(getRuVectorFeatureFlags().useQESONA).toBe(false);
    });

    it('should reject unknown flag names', async () => {
      await executeCommand(command, ['flags', '--set', 'unknownFlag=true']);

      expect(mockExit).toHaveBeenCalledWith(1);
      const output = getLogOutput();
      expect(output).toContain('Unknown flag');
    });

    it('should reject invalid values', async () => {
      await executeCommand(command, ['flags', '--set', 'useNativeHNSW=maybe']);

      expect(mockExit).toHaveBeenCalledWith(1);
      const output = getLogOutput();
      expect(output).toContain('Invalid value');
    });

    it('should reject malformed set syntax', async () => {
      await executeCommand(command, ['flags', '--set', 'invalidformat']);

      expect(mockExit).toHaveBeenCalledWith(1);
      const output = getLogOutput();
      expect(output).toContain('Invalid format');
    });
  });

  // --------------------------------------------------------------------------
  // Flags Subcommand - Profiles
  // --------------------------------------------------------------------------

  describe('flags subcommand - profiles', () => {
    it('should apply the performance profile', async () => {
      await executeCommand(command, ['flags', '--profile', 'performance']);

      const flags = getRuVectorFeatureFlags();
      expect(flags.useNativeHNSW).toBe(true);
      expect(flags.useTemporalCompression).toBe(true);
      expect(flags.useDeterministicDither).toBe(true);

      const output = getLogOutput();
      expect(output).toContain('performance');
    });

    it('should apply the experimental profile', async () => {
      await executeCommand(command, ['flags', '--profile', 'experimental']);

      const flags = getRuVectorFeatureFlags();
      expect(flags.useNativeHNSW).toBe(true);
      expect(flags.useTemporalCompression).toBe(true);
      expect(flags.useMetadataFiltering).toBe(true);
      expect(flags.useDeterministicDither).toBe(true);
      expect(flags.useQESONA).toBe(true);
      expect(flags.useQEFlashAttention).toBe(true);
      expect(flags.useQEGNNIndex).toBe(true);
      expect(flags.logMigrationMetrics).toBe(true);
    });

    it('should apply the safe profile', async () => {
      // First enable everything
      setRuVectorFeatureFlags({
        useNativeHNSW: true,
        useTemporalCompression: true,
        useMetadataFiltering: true,
        useDeterministicDither: true,
      });

      await executeCommand(command, ['flags', '--profile', 'safe']);

      const flags = getRuVectorFeatureFlags();
      // Original 4 flags stay on
      expect(flags.useQESONA).toBe(true);
      expect(flags.useQEFlashAttention).toBe(true);
      expect(flags.useQEGNNIndex).toBe(true);
      expect(flags.logMigrationMetrics).toBe(true);
      // New flags turned off by safe profile
      expect(flags.useNativeHNSW).toBe(false);
      expect(flags.useTemporalCompression).toBe(false);
      expect(flags.useMetadataFiltering).toBe(false);
      expect(flags.useDeterministicDither).toBe(false);
    });

    it('should reject unknown profile names', async () => {
      await executeCommand(command, ['flags', '--profile', 'turbo']);

      expect(mockExit).toHaveBeenCalledWith(1);
      const output = getLogOutput();
      expect(output).toContain('Unknown profile');
    });

    it('should display the flags being set by a profile', async () => {
      await executeCommand(command, ['flags', '--profile', 'performance']);

      const output = getLogOutput();
      expect(output).toContain('useNativeHNSW');
      expect(output).toContain('useTemporalCompression');
      expect(output).toContain('useDeterministicDither');
    });
  });
});
