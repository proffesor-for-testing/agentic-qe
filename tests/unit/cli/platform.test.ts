import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyPlatformConfiguration } from '../../../src/cli/commands/platform.js';
import { selectCodexSkills } from '../../../src/init/codex-skill-manifest.js';

describe('verifyPlatformConfiguration', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function root(): string {
    const value = mkdtempSync(join(tmpdir(), 'aqe-platform-verify-'));
    roots.push(value);
    return value;
  }

  function write(projectRoot: string, relativePath: string, content: string): void {
    const target = join(projectRoot, relativePath);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content);
  }

  function arrangeCompleteCodexInstall(projectRoot: string): void {
    write(projectRoot, '.codex/config.toml', '[mcp_servers.agentic-qe]\ncommand = "npx"\n');
    write(projectRoot, 'AGENTS.md', '<!-- BEGIN AGENTIC-QE CODEX -->\n# Quality Engineering Standards (Agentic QE)\n<!-- END AGENTIC-QE CODEX -->\n');
    write(projectRoot, '.codex/hooks.json', JSON.stringify({
      hooks: {
        SessionStart: [{ hooks: [{ command: 'node .codex/hooks/aqe-codex-hook.cjs' }] }],
      },
    }));
    write(projectRoot, '.codex/hooks/aqe-codex-hook.cjs', 'module.exports = {};\n');
    write(projectRoot, '.codex/hooks/aqe-runtime.cjs', 'module.exports = {};\n');
    for (const skill of selectCodexSkills()) {
      write(projectRoot, `.agents/skills/${skill.name}/SKILL.md`, `---\nname: ${skill.name}\n---\n`);
    }
  }

  it('should_pass_when_completeCodexSurfaceIsInstalled', () => {
    const projectRoot = root();
    arrangeCompleteCodexInstall(projectRoot);

    const result = verifyPlatformConfiguration(projectRoot, 'codex');

    expect(result.passed).toBe(true);
    expect(result.checks.map((check) => check.label)).toEqual([
      'Config file',
      'Config syntax',
      'AQE MCP entry',
      'Behavioral rules',
      'Codex guidance',
      'Lifecycle hooks',
      'Hook adapters',
      'Hook runtimes',
      'QE skills',
    ]);
  });

  it('should_reportMissingRuntime_when_CodexHooksCannotExecute', () => {
    const projectRoot = root();
    arrangeCompleteCodexInstall(projectRoot);
    write(projectRoot, '.codex/hooks.json', JSON.stringify({
      hooks: {
        SessionStart: [{ hooks: [{ command: 'node .codex/hooks/ruflo-codex-hook.cjs' }] }],
      },
    }));
    write(projectRoot, '.codex/hooks/ruflo-codex-hook.cjs', 'module.exports = {};\n');

    const result = verifyPlatformConfiguration(projectRoot, 'codex');

    expect(result.passed).toBe(false);
    expect(result.checks).toContainEqual({
      label: 'Hook runtimes',
      passed: false,
      detail: 'missing: ruflo-runtime.cjs',
    });
  });

  it('should_pass_withoutMcp_when_McpWasDeliberatelyDisabled', () => {
    const projectRoot = root();
    arrangeCompleteCodexInstall(projectRoot);
    rmSync(join(projectRoot, '.codex/config.toml'));

    const result = verifyPlatformConfiguration(projectRoot, 'codex', { expectMcp: false });

    expect(result.passed).toBe(true);
    expect(result.checks).toContainEqual({
      label: 'MCP configuration',
      passed: true,
      detail: 'intentionally disabled',
    });
  });

  it('should_pass_when_compactCodexGuidanceIsSelected', () => {
    const projectRoot = root();
    arrangeCompleteCodexInstall(projectRoot);
    write(projectRoot, 'AGENTS.md', '<!-- BEGIN AGENTIC-QE CODEX -->\n# Agentic QE\nDiscover AQE tools and skills from their live schemas.\n<!-- END AGENTIC-QE CODEX -->\n');

    const result = verifyPlatformConfiguration(projectRoot, 'codex', { guidancePolicy: 'compact' });

    expect(result.passed).toBe(true);
    expect(result.checks).toContainEqual({
      label: 'Codex guidance',
      passed: true,
      detail: 'selected=compact, detected=compact',
    });
  });

  it('should_pass_when_CodexGuidanceIsIntentionallyDisabled', () => {
    const projectRoot = root();
    arrangeCompleteCodexInstall(projectRoot);
    rmSync(join(projectRoot, 'AGENTS.md'));

    const result = verifyPlatformConfiguration(projectRoot, 'codex', { guidancePolicy: 'none' });

    expect(result.passed).toBe(true);
    expect(result.checks).toContainEqual({
      label: 'Behavioral rules',
      passed: true,
      detail: 'intentionally disabled',
    });
  });

  it('should_requireRufloSkill_only_when_RufloIsRequested', () => {
    const projectRoot = root();
    arrangeCompleteCodexInstall(projectRoot);

    const defaultResult = verifyPlatformConfiguration(projectRoot, 'codex');
    const rufloResult = verifyPlatformConfiguration(projectRoot, 'codex', { expectRuflo: true });

    expect(defaultResult.passed).toBe(true);
    expect(rufloResult.passed).toBe(false);
    expect(rufloResult.checks.find((check) => check.label === 'QE skills')?.detail)
      .toContain('aqe-ruflo');
  });

  it('should_reportEveryMissingCuratedSkill_when_installIsPartial', () => {
    const projectRoot = root();
    arrangeCompleteCodexInstall(projectRoot);
    rmSync(join(projectRoot, '.agents/skills/aqe-plan-work'), { recursive: true });
    rmSync(join(projectRoot, '.agents/skills/aqe-research'), { recursive: true });

    const result = verifyPlatformConfiguration(projectRoot, 'codex');

    expect(result.passed).toBe(false);
    expect(result.checks).toContainEqual({
      label: 'QE skills',
      passed: false,
      detail: 'missing: aqe-plan-work, aqe-research',
    });
  });

  it('should_rejectMalformedHooks_when_otherCodexComponentsExist', () => {
    const projectRoot = root();
    arrangeCompleteCodexInstall(projectRoot);
    write(projectRoot, '.codex/hooks.json', '{ not-json');

    const result = verifyPlatformConfiguration(projectRoot, 'codex');

    expect(result.passed).toBe(false);
    expect(result.checks.find((check) => check.label === 'Lifecycle hooks')).toMatchObject({
      passed: false,
    });
    expect(result.checks.find((check) => check.label === 'Hook adapters')).toMatchObject({
      passed: false,
    });
  });

  it('should_keepGenericPlatformVerificationFocused_on_configAndRules', () => {
    const projectRoot = root();
    write(projectRoot, '.cursor/mcp.json', JSON.stringify({ mcpServers: { 'agentic-qe': {} } }));
    write(projectRoot, '.cursorrules', '# Agentic QE\n');

    const result = verifyPlatformConfiguration(projectRoot, 'cursor');

    expect(result.passed).toBe(true);
    expect(result.checks).toHaveLength(4);
  });
});
