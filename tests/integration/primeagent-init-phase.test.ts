/**
 * Integration Test: Prime Agent wiring through the AssetsPhase
 *
 * Drives the real AssetsPhase.run() (not the installer directly) so the
 * CLI flag → orchestrator → phase → installer wiring is covered:
 *   - --with-prime-agent installs the skills, fleet, and AGENTS.md guidance
 *   - --with-ruflo reaches the installer (aqe-ruflo SKILL.md)
 *   - --no-mcp maps to the 'none' MCP mode (no registration step)
 *   - default is instruct-only: the exact registration command is logged
 *
 * Uses real temporary directories — no mocking.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AssetsPhase } from '../../src/init/phases/09-assets.js';
import type { InitContext } from '../../src/init/phases/phase-interface.js';
import type { AQEInitConfig } from '../../src/init/types.js';

let tempDir: string;
let logs: string[];

function fileExists(relativePath: string): boolean {
  return fs.existsSync(path.join(tempDir, relativePath));
}

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-phase-pa-'));
}

/** Minimal phase context: --no-claude --minimal plus Prime Agent flags. */
function createContext(options: Partial<InitContext['options']> = {}): InitContext {
  return {
    projectRoot: tempDir,
    options: {
      autoMode: false,
      upgrade: false,
      minimal: true,
      noClaude: true,
      ...options,
    },
    config: {
      version: '0.0.0-test',
      project: { name: 'test', root: tempDir, type: 'single' },
      skills: { install: false, installV2: false, installV3: false, overwrite: false },
    } as AQEInitConfig,
    services: {
      log: (msg: string) => logs.push(msg),
      warn: (msg: string) => logs.push(`WARN: ${msg}`),
      error: (msg: string) => logs.push(`ERROR: ${msg}`),
    },
    phaseResults: new Map(),
  };
}

describe('AssetsPhase - Prime Agent wiring', () => {
  beforeEach(() => {
    tempDir = createTempDir();
    logs = [];
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('installs the Prime Agent surface from the phase with --with-prime-agent', async () => {
    const phase = new AssetsPhase();
    const result = await (phase as unknown as { run(c: InitContext): Promise<unknown> }).run(
      createContext({ withPrimeAgent: true }),
    );

    expect(result).toBeDefined();
    // Curated skills under the dedicated tree
    expect(fileExists(path.join('.prime', 'agent', 'skills', 'aqe-plan-quality', 'SKILL.md'))).toBe(true);
    // aqe-fleet subagent skill with role files
    expect(fileExists(path.join('.prime', 'agent', 'skills', 'aqe-fleet', 'SKILL.md'))).toBe(true);
    expect(
      fs.existsSync(path.join(tempDir, '.prime', 'agent', 'skills', 'aqe-fleet', 'agents', 'qe-test-architect.md')),
    ).toBe(true);
    // AGENTS.md guidance section
    const agentsMd = fs.readFileSync(path.join(tempDir, 'AGENTS.md'), 'utf-8');
    expect(agentsMd).toContain('<!-- BEGIN AGENTIC-QE PRIME-AGENT -->');
    // Default MCP mode is instruct: the exact command is reported, not executed
    expect(logs.some((l) => l.includes('Prime Agent MCP (run once): prime-agent mcp add aqe'))).toBe(true);
    // No warnings from the Prime Agent component
    expect(logs.some((l) => l.startsWith('WARN: Prime Agent'))).toBe(false);
  });

  it('maps --no-mcp to the none MCP mode (no registration step)', async () => {
    const phase = new AssetsPhase();
    await (phase as unknown as { run(c: InitContext): Promise<unknown> }).run(
      createContext({ withPrimeAgent: true, noMcp: true }),
    );

    // Skills and guidance still install…
    expect(fileExists(path.join('.prime', 'agent', 'skills', 'aqe-plan-quality', 'SKILL.md'))).toBe(true);
    expect(fs.readFileSync(path.join(tempDir, 'AGENTS.md'), 'utf-8')).toContain(
      '<!-- BEGIN AGENTIC-QE PRIME-AGENT -->',
    );
    // …but no MCP registration command is reported.
    expect(logs.some((l) => l.includes('Prime Agent MCP'))).toBe(false);
  });

  it('forwards --with-ruflo to the Prime Agent installer', async () => {
    const phase = new AssetsPhase();
    await (phase as unknown as { run(c: InitContext): Promise<unknown> }).run(
      createContext({ withPrimeAgent: true }),
    );
    expect(fileExists(path.join('.prime', 'agent', 'skills', 'aqe-ruflo', 'SKILL.md'))).toBe(false);

    const phase2 = new AssetsPhase();
    await (phase2 as unknown as { run(c: InitContext): Promise<unknown> }).run(
      createContext({ withPrimeAgent: true, withRuflo: true }),
    );
    expect(fileExists(path.join('.prime', 'agent', 'skills', 'aqe-ruflo', 'SKILL.md'))).toBe(true);
  });
});
