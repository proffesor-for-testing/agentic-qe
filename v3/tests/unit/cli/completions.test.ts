/**
 * Shell Completions Tests
 * ADR-041: Shell Completions for Enhanced Developer Experience
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateCompletion,
  generateBashCompletion,
  generateZshCompletion,
  generateFishCompletion,
  generatePowerShellCompletion,
  detectShell,
  getInstallInstructions,
  DOMAINS,
  V3_QE_AGENTS,
  OTHER_AGENTS,
  ALL_AGENTS,
  TASK_TYPES,
  PRIORITIES,
  STATUSES,
  FRAMEWORKS,
  TEST_TYPES,
  MEMORY_BACKENDS,
  COMMANDS,
} from '../../../src/cli/completions/index.js';

describe('Shell Completions', () => {
  describe('Completion Data', () => {
    it('should have all 12 DDD domains', () => {
      expect(DOMAINS).toHaveLength(12);
      expect(DOMAINS).toContain('test-generation');
      expect(DOMAINS).toContain('test-execution');
      expect(DOMAINS).toContain('coverage-analysis');
      expect(DOMAINS).toContain('quality-assessment');
      expect(DOMAINS).toContain('defect-intelligence');
      expect(DOMAINS).toContain('requirements-validation');
      expect(DOMAINS).toContain('code-intelligence');
      expect(DOMAINS).toContain('security-compliance');
      expect(DOMAINS).toContain('contract-testing');
      expect(DOMAINS).toContain('visual-accessibility');
      expect(DOMAINS).toContain('chaos-resilience');
      expect(DOMAINS).toContain('learning-optimization');
    });

    it('should have 47 V3 QE agents', () => {
      expect(V3_QE_AGENTS).toHaveLength(47);
      expect(V3_QE_AGENTS).toContain('v3-qe-test-architect');
      expect(V3_QE_AGENTS).toContain('v3-qe-coverage-specialist');
      expect(V3_QE_AGENTS).toContain('v3-qe-quality-gate');
      expect(V3_QE_AGENTS).toContain('v3-qe-defect-predictor');
      expect(V3_QE_AGENTS).toContain('v3-qe-tdd-red');
      expect(V3_QE_AGENTS).toContain('v3-qe-security-scanner');
    });

    it('should have other agents including specialized ones', () => {
      expect(OTHER_AGENTS.length).toBeGreaterThan(20);
      expect(OTHER_AGENTS).toContain('tester');
      expect(OTHER_AGENTS).toContain('reviewer');
      expect(OTHER_AGENTS).toContain('security-architect');
      expect(OTHER_AGENTS).toContain('memory-specialist');
      expect(OTHER_AGENTS).toContain('queen-coordinator');
    });

    it('should combine all agents', () => {
      expect(ALL_AGENTS.length).toBe(V3_QE_AGENTS.length + OTHER_AGENTS.length);
    });

    it('should have task types', () => {
      expect(TASK_TYPES).toContain('generate-tests');
      expect(TASK_TYPES).toContain('execute-tests');
      expect(TASK_TYPES).toContain('analyze-coverage');
      expect(TASK_TYPES).toContain('scan-security');
    });

    it('should have all priority levels', () => {
      expect(PRIORITIES).toEqual(['p0', 'p1', 'p2', 'p3']);
    });

    it('should have all statuses', () => {
      expect(STATUSES).toContain('pending');
      expect(STATUSES).toContain('running');
      expect(STATUSES).toContain('completed');
      expect(STATUSES).toContain('failed');
      expect(STATUSES).toContain('cancelled');
    });

    it('should have test frameworks', () => {
      expect(FRAMEWORKS).toContain('jest');
      expect(FRAMEWORKS).toContain('vitest');
      expect(FRAMEWORKS).toContain('pytest');
      expect(FRAMEWORKS).toContain('playwright');
    });

    it('should have test types', () => {
      expect(TEST_TYPES).toEqual(['unit', 'integration', 'e2e']);
    });

    it('should have memory backends', () => {
      expect(MEMORY_BACKENDS).toEqual(['sqlite', 'agentdb', 'hybrid']);
    });

    it('should have command definitions', () => {
      expect(COMMANDS.init).toBeDefined();
      expect(COMMANDS.status).toBeDefined();
      expect(COMMANDS.task).toBeDefined();
      expect(COMMANDS.agent).toBeDefined();
      expect(COMMANDS.completions).toBeDefined();
    });
  });

  describe('Bash Completion Generator', () => {
    let script: string;

    beforeEach(() => {
      script = generateBashCompletion();
    });

    it('should generate valid bash script', () => {
      expect(script).toContain('#!/bin/bash');
      expect(script).toContain('_aqe_v3_completions()');
      expect(script).toContain('complete -F _aqe_v3_completions aqe-v3');
    });

    it('should include all main commands', () => {
      expect(script).toContain('init');
      expect(script).toContain('status');
      expect(script).toContain('health');
      expect(script).toContain('task');
      expect(script).toContain('agent');
      expect(script).toContain('completions');
    });

    it('should include domains list', () => {
      expect(script).toContain('test-generation');
      expect(script).toContain('coverage-analysis');
      expect(script).toContain('security-compliance');
    });

    it('should include v3-qe agent types', () => {
      expect(script).toContain('v3-qe-test-architect');
      expect(script).toContain('v3-qe-coverage-specialist');
      expect(script).toContain('v3-qe-quality-gate');
    });

    it('should include task types', () => {
      expect(script).toContain('generate-tests');
      expect(script).toContain('execute-tests');
      expect(script).toContain('analyze-coverage');
    });

    it('should include priority levels', () => {
      expect(script).toContain('p0');
      expect(script).toContain('p1');
      expect(script).toContain('p2');
      expect(script).toContain('p3');
    });

    it('should include subcommand handling', () => {
      expect(script).toContain('task_subcmds');
      expect(script).toContain('agent_subcmds');
      expect(script).toContain('completions_subcmds');
    });

    it('should include ADR-041 reference', () => {
      expect(script).toContain('ADR-041');
    });
  });

  describe('Zsh Completion Generator', () => {
    let script: string;

    beforeEach(() => {
      script = generateZshCompletion();
    });

    it('should generate valid zsh compdef script', () => {
      expect(script).toContain('#compdef aqe-v3');
      expect(script).toContain('_aqe_v3()');
    });

    it('should include command descriptions', () => {
      expect(script).toContain("'init:Initialize the AQE v3 system'");
      expect(script).toContain("'status:Show system status'");
      expect(script).toContain("'completions:Generate shell completions'");
    });

    it('should include domain descriptions', () => {
      expect(script).toContain('test-generation:test generation domain');
      expect(script).toContain('coverage-analysis:coverage analysis domain');
    });

    it('should include v3-qe agents', () => {
      expect(script).toContain("'v3-qe-test-architect'");
      expect(script).toContain("'v3-qe-coverage-specialist'");
    });

    it('should use zsh _arguments syntax', () => {
      expect(script).toContain('_arguments -C');
      expect(script).toContain('_describe -t commands');
    });

    it('should include ADR-041 reference', () => {
      expect(script).toContain('ADR-041');
    });
  });

  describe('Fish Completion Generator', () => {
    let script: string;

    beforeEach(() => {
      script = generateFishCompletion();
    });

    it('should generate valid fish completion script', () => {
      expect(script).toContain('complete -c aqe-v3');
      expect(script).toContain('__fish_use_subcommand');
    });

    it('should include all main commands with descriptions', () => {
      expect(script).toContain('-a "init" -d "Initialize the AQE v3 system"');
      expect(script).toContain('-a "status" -d "Show system status"');
      expect(script).toContain('-a "completions" -d "Generate shell completions"');
    });

    it('should define domains list', () => {
      expect(script).toContain('set -l domains');
      expect(script).toContain('test-generation');
    });

    it('should define v3-qe agents', () => {
      expect(script).toContain('set -l v3_qe_agents');
      expect(script).toContain('v3-qe-test-architect');
    });

    it('should include subcommand completion rules', () => {
      expect(script).toContain('__fish_seen_subcommand_from task');
      expect(script).toContain('__fish_seen_subcommand_from agent');
    });

    it('should include flag completions', () => {
      // Fish uses -l for long options in complete commands
      expect(script).toContain('-l wizard');
      expect(script).toContain('-l domain');
      expect(script).toContain('-l type');
    });

    it('should include ADR-041 reference', () => {
      expect(script).toContain('ADR-041');
    });
  });

  describe('PowerShell Completion Generator', () => {
    let script: string;

    beforeEach(() => {
      script = generatePowerShellCompletion();
    });

    it('should generate valid PowerShell script', () => {
      expect(script).toContain('Register-ArgumentCompleter -Native -CommandName');
      expect(script).toContain('param($wordToComplete, $commandAst, $cursorPosition)');
    });

    it('should define domains array', () => {
      expect(script).toContain('$script:AQE_DOMAINS = @(');
      expect(script).toContain("'test-generation'");
    });

    it('should define v3-qe agents array', () => {
      expect(script).toContain('$script:AQE_V3_QE_AGENTS = @(');
      expect(script).toContain("'v3-qe-test-architect'");
    });

    it('should define commands hashtable', () => {
      expect(script).toContain('$script:AQE_COMMANDS = @{');
      expect(script).toContain("'init' =");
    });

    it('should include completion result helper', () => {
      expect(script).toContain('function New-Completion');
      expect(script).toContain('[System.Management.Automation.CompletionResult]');
    });

    it('should handle subcommand completion', () => {
      // PowerShell uses switch statement syntax
      expect(script).toContain('switch ($mainCmd)');
      expect(script).toContain("'task'");
      expect(script).toContain("'agent'");
    });

    it('should include ADR-041 reference', () => {
      expect(script).toContain('ADR-041');
    });
  });

  describe('generateCompletion function', () => {
    it('should generate bash completion', () => {
      const script = generateCompletion('bash');
      expect(script).toContain('#!/bin/bash');
      expect(script).toContain('_aqe_v3_completions');
    });

    it('should generate zsh completion', () => {
      const script = generateCompletion('zsh');
      expect(script).toContain('#compdef aqe-v3');
      expect(script).toContain('_aqe_v3');
    });

    it('should generate fish completion', () => {
      const script = generateCompletion('fish');
      expect(script).toContain('complete -c aqe-v3');
    });

    it('should generate powershell completion', () => {
      const script = generateCompletion('powershell');
      expect(script).toContain('Register-ArgumentCompleter');
    });

    it('should throw for unsupported shell', () => {
      expect(() => generateCompletion('unsupported' as any)).toThrow('Unsupported shell');
    });
  });

  describe('detectShell function', () => {
    it('should return shell info object', () => {
      const info = detectShell();
      expect(info).toHaveProperty('name');
      expect(info).toHaveProperty('configFile');
      expect(info).toHaveProperty('detected');
    });

    it('should detect bash from SHELL env', () => {
      const originalShell = process.env.SHELL;
      process.env.SHELL = '/bin/bash';

      const info = detectShell();
      expect(info.name).toBe('bash');

      process.env.SHELL = originalShell;
    });

    it('should detect zsh from SHELL env', () => {
      const originalShell = process.env.SHELL;
      process.env.SHELL = '/usr/bin/zsh';

      const info = detectShell();
      expect(info.name).toBe('zsh');

      process.env.SHELL = originalShell;
    });

    it('should detect fish from SHELL env', () => {
      const originalShell = process.env.SHELL;
      process.env.SHELL = '/usr/bin/fish';

      const info = detectShell();
      expect(info.name).toBe('fish');

      process.env.SHELL = originalShell;
    });
  });

  describe('getInstallInstructions function', () => {
    it('should return bash install instructions', () => {
      const instructions = getInstallInstructions('bash');
      expect(instructions).toContain('~/.bashrc');
      expect(instructions).toContain('eval "$(aqe-v3 completions bash)"');
    });

    it('should return zsh install instructions', () => {
      const instructions = getInstallInstructions('zsh');
      expect(instructions).toContain('~/.zshrc');
      expect(instructions).toContain('eval "$(aqe-v3 completions zsh)"');
      expect(instructions).toContain('compinit');
    });

    it('should return fish install instructions', () => {
      const instructions = getInstallInstructions('fish');
      expect(instructions).toContain('~/.config/fish/completions');
      expect(instructions).toContain('aqe-v3.fish');
    });

    it('should return powershell install instructions', () => {
      const instructions = getInstallInstructions('powershell');
      expect(instructions).toContain('$PROFILE');
      expect(instructions).toContain('Invoke-Expression');
    });

    it('should return generic instructions for unknown shell', () => {
      const instructions = getInstallInstructions('unknown');
      expect(instructions).toContain('Shell not detected');
      expect(instructions).toContain('bash');
      expect(instructions).toContain('zsh');
      expect(instructions).toContain('fish');
      expect(instructions).toContain('powershell');
    });
  });

  describe('Agent Type Naming Convention (ADR-037)', () => {
    it('should have v3-qe-* prefix for all V3 QE agents', () => {
      for (const agent of V3_QE_AGENTS) {
        expect(agent).toMatch(/^v3-qe-/);
      }
    });

    it('should include TDD phase subagents', () => {
      expect(V3_QE_AGENTS).toContain('v3-qe-tdd-red');
      expect(V3_QE_AGENTS).toContain('v3-qe-tdd-green');
      expect(V3_QE_AGENTS).toContain('v3-qe-tdd-refactor');
    });

    it('should include reviewer subagents', () => {
      expect(V3_QE_AGENTS).toContain('v3-qe-code-reviewer');
      expect(V3_QE_AGENTS).toContain('v3-qe-integration-reviewer');
      expect(V3_QE_AGENTS).toContain('v3-qe-performance-reviewer');
      expect(V3_QE_AGENTS).toContain('v3-qe-security-reviewer');
    });
  });

  describe('Domain Coverage', () => {
    it('should have agents for test-generation domain', () => {
      expect(V3_QE_AGENTS).toContain('v3-qe-test-architect');
      expect(V3_QE_AGENTS).toContain('v3-qe-tdd-specialist');
      expect(V3_QE_AGENTS).toContain('v3-qe-property-tester');
    });

    it('should have agents for test-execution domain', () => {
      expect(V3_QE_AGENTS).toContain('v3-qe-parallel-executor');
      expect(V3_QE_AGENTS).toContain('v3-qe-flaky-hunter');
      expect(V3_QE_AGENTS).toContain('v3-qe-retry-handler');
    });

    it('should have agents for coverage-analysis domain', () => {
      expect(V3_QE_AGENTS).toContain('v3-qe-coverage-specialist');
      expect(V3_QE_AGENTS).toContain('v3-qe-gap-detector');
    });

    it('should have agents for security-compliance domain', () => {
      expect(V3_QE_AGENTS).toContain('v3-qe-security-scanner');
      expect(V3_QE_AGENTS).toContain('v3-qe-security-auditor');
    });

    it('should have agents for quality-assessment domain', () => {
      expect(V3_QE_AGENTS).toContain('v3-qe-quality-gate');
      expect(V3_QE_AGENTS).toContain('v3-qe-deployment-advisor');
    });
  });
});
