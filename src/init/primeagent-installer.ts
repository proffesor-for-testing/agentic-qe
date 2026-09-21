/**
 * Prime Agent Platform Installer
 *
 * Installs the Prime Agent (https://github.com/anthropics/agents — Agent
 * Skills standard) surface for a project:
 *   - `.prime/agent/skills/` with the curated AQE skills
 *   - a generated `aqe-fleet` skill that seeds curated QE agent roles as
 *     spawnable subagents (Prime Agent has no file-based agents)
 *   - an owned AGENTS.md guidance section (shared sentinel semantics with
 *     the Codex installer)
 *   - an MCP connection instruction — Prime Agent ignores project-level MCP
 *     config for execution (a repository must not start local processes), so
 *     the exact `prime-agent mcp add` command is reported for the user to
 *     run, or executed directly when `installMcp: 'auto'` and the binary is
 *     available on PATH.
 *
 * Follows the Codex/Kiro installer pattern (ADR-025).
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
  copyFileSync,
  readFileSync,
} from 'fs';
import { join, dirname } from 'path';
import { spawnSync } from 'child_process';
import { toErrorMessage } from '../shared/error-utils.js';
import { findPackageRoot } from './find-package-root.js';
import {
  assertOwnedSectionsWellFormed,
  markOwnedSection,
  measureOwnedSection,
  mergeOwnedSection,
  removeOwnedSections,
} from './agents-md-section.js';
import { selectPrimeAgentSkills, PRIME_AGENT_SUBAGENT_ROLES } from './primeagent-skill-manifest.js';

// ============================================================================
// Types
// ============================================================================

/**
 * MCP wiring mode. Prime Agent cannot be auto-configured from the repo:
 * project MCP settings are ignored for execution, so the default is to
 * instruct the user with the exact `prime-agent mcp add` command.
 */
export type PrimeAgentMcpMode = 'instruct' | 'auto' | 'none';

export interface PrimeAgentInstallerOptions {
  projectRoot: string;
  overwrite?: boolean;
  /**
   * MCP wiring: 'instruct' (default) reports the command for the user;
   * 'auto' executes it when `prime-agent` is on PATH (falls back to
   * 'instruct' with an error when it is not); 'none' skips the step.
   */
  installMcp?: PrimeAgentMcpMode;
  /** Install optional Ruflo guidance (SKILL.md only, no runtime). */
  includeRuflo?: boolean;
  /**
   * Kept for parity with sibling installers. The registration command no
   * longer carries env values (Prime Agent rejects static values); the AQE
   * MCP server defaults to a database-free backend, so this option does not
   * change the emitted command.
   */
  memoryBackend?: 'memory';
  /** Test seam: binary name/path to use instead of the PATH lookup. */
  primeAgentBinary?: string;
  /** Test seam: command runner used by the 'auto' MCP mode. */
  runCommand?: (argv: string[]) => { status: number | null; stderr: string };
}

export interface PrimeAgentComponentOutcome {
  status: 'installed' | 'updated' | 'preserved' | 'skipped' | 'unavailable' | 'failed';
  error?: string;
}

export interface PrimeAgentInstallResult {
  success: boolean;
  /** Effective MCP mode after the install ran. */
  mcpMode: PrimeAgentMcpMode;
  /** True when the exact MCP command was reported for the user to run. */
  mcpInstructed: boolean;
  /** True when 'auto' mode executed the MCP add successfully. */
  mcpAdded: boolean;
  /** The exact command for the user (instruct mode, or auto fallback). */
  mcpCommand: string;
  agentsMdInstalled: boolean;
  skillsInstalled: number;
  subagentsSeeded: number;
  errors: string[];
  agentsMdPath: string;
  skillsPath: string;
  /** Path of the generated aqe-fleet subagent skill. */
  fleetSkillPath: string;
  ownedGuidanceBytes: number;
  /** Per-component outcomes. */
  components: {
    mcp: PrimeAgentComponentOutcome;
    rules: PrimeAgentComponentOutcome;
    skills: PrimeAgentComponentOutcome;
    subagents: PrimeAgentComponentOutcome;
  };
}

// ============================================================================
// Guidance Content
// ============================================================================

const PRIME_AGENT_SENTINEL_ID = 'PRIME-AGENT';

const PRIME_AGENT_GUIDANCE = `# Quality Engineering Standards (Agentic QE — Prime Agent)

This project uses Agentic QE for AI-powered quality engineering. AQE ships
skills under \`.prime/agent/skills/\` (Agent Skills standard) and a fleet of QE
subagent roles under \`.prime/agent/skills/aqe-fleet/\`.

## AQE MCP server

The AQE MCP server is registered at the user level, not in the repo (Prime
Agent ignores project MCP settings for execution). If it is not yet connected,
run the command reported by \`aqe init\` once (one registration per project; a
second project reuses the name with \`--force\` or its own server name):

    prime-agent mcp add aqe --cwd <this project root> -- npx -y agentic-qe@latest mcp

Always call \`fleet_init\` before using other AQE tools to initialize the fleet.

## Working rules

1. Prefer the installed AQE skills (aqe-plan-quality, aqe-plan-work,
   aqe-research, aqe-review-quality, aqe-test-change) for QE planning and
   review tasks.
2. Spawn aqe-fleet subagent roles for focused audits (coverage, flakiness,
   security, defect prediction, root cause, impact).
3. Test pyramid: 70% unit, 20% integration, 10% e2e; AAA pattern.
4. \`quality_assess\` before marking tasks complete; \`security_scan_comprehensive\`
   after changes to auth, security, or middleware code.
5. \`memory_query\` before starting work; \`memory_store\` successful patterns
   after task completion.
`;

// ============================================================================
// Installer
// ============================================================================

export class PrimeAgentInstaller {
  private static readonly MCP_SERVER_NAME = 'aqe';

  private readonly projectRoot: string;
  private readonly overwrite: boolean;

  constructor(private readonly options: PrimeAgentInstallerOptions) {
    this.projectRoot = options.projectRoot;
    this.overwrite = options.overwrite ?? false;
  }

  async install(): Promise<PrimeAgentInstallResult> {
    const result: PrimeAgentInstallResult = {
      success: true,
      mcpMode: this.options.installMcp ?? 'instruct',
      mcpInstructed: false,
      mcpAdded: false,
      mcpCommand: '',
      agentsMdInstalled: false,
      skillsInstalled: 0,
      subagentsSeeded: 0,
      errors: [],
      agentsMdPath: join(this.projectRoot, 'AGENTS.md'),
      skillsPath: join(this.projectRoot, '.prime', 'agent', 'skills'),
      fleetSkillPath: join(this.projectRoot, '.prime', 'agent', 'skills', 'aqe-fleet'),
      ownedGuidanceBytes: 0,
      components: {
        mcp: { status: 'skipped' },
        rules: { status: 'skipped' },
        skills: { status: 'unavailable' },
        subagents: { status: 'unavailable' },
      },
    };

    try {
      this.installMcpConnection(result);
    } catch (error) {
      this.recordComponentFailure(result, 'mcp', error);
    }

    try {
      this.installAgentsMdGuidance(result);
    } catch (error) {
      this.recordComponentFailure(result, 'rules', error);
    }

    try {
      const skills = this.installSkills();
      result.skillsInstalled = skills.count;
      result.components.skills.status = skills.status;
    } catch (error) {
      this.recordComponentFailure(result, 'skills', error);
    }

    try {
      const fleet = this.installFleetSkill();
      result.subagentsSeeded = fleet.count;
      result.components.subagents.status = fleet.status;
    } catch (error) {
      this.recordComponentFailure(result, 'subagents', error);
    }

    result.success = result.errors.length === 0;
    return result;
  }

  // ------------------------------------------------------------------
  // MCP
  // ------------------------------------------------------------------

  /**
   * Build the exact user-level MCP registration command.
   *
   * `--cwd <projectRoot>` makes the AQE server resolve its default
   * `.agentic-qe` storage relative to this project. No `--env` is used:
   * Prime Agent only accepts environment-variable *references* (never
   * static values), and the AQE MCP server's defaults are correct without
   * them — the default memory backend is database-free, and users who want
   * persistent SQLite can export `AQE_MEMORY_PATH`/`AQE_MEMORY_BACKEND` and
   * pass them as references on the same command.
   */
  private buildMcpInvocation(): { argv: string[] } {
    const argv = [
      'mcp', 'add', PrimeAgentInstaller.MCP_SERVER_NAME,
      '--cwd', this.projectRoot,
      '--',
      'npx', '-y', 'agentic-qe@latest', 'mcp',
    ];
    return { argv };
  }

  private installMcpConnection(result: PrimeAgentInstallResult): void {
    const mode = this.options.installMcp ?? 'instruct';
    if (mode === 'none') {
      result.mcpMode = 'none';
      result.components.mcp.status = 'skipped';
      return;
    }

    const { argv } = this.buildMcpInvocation();
    const binary = this.options.primeAgentBinary ?? 'prime-agent';
    const fullCommand = `${binary} ${argv.join(' ')}`;
    result.mcpCommand = fullCommand;

    if (mode === 'instruct') {
      result.mcpMode = 'instruct';
      result.mcpInstructed = true;
      result.components.mcp.status = 'preserved';
      return;
    }

    // 'auto': verify the binary responds, then execute the registration.
    result.mcpMode = 'auto';
    const probe = this.runCommand([binary, '--version']);
    if (probe.status !== 0) {
      result.errors.push(
        `Prime Agent binary not available on PATH (${binary}); run this command yourself: ${fullCommand}`,
      );
      result.mcpInstructed = true;
      result.components.mcp = {
        status: 'failed',
        error: `prime-agent not found or failed to start: ${probe.stderr.trim()}`,
      };
      return;
    }

    const run = this.runCommand([binary, ...argv]);
    if (run.status === 0) {
      result.mcpAdded = true;
      result.components.mcp.status = 'installed';
    } else {
      result.errors.push(
        `prime-agent mcp add failed (${run.status}); run this command yourself: ${fullCommand}`,
      );
      result.mcpInstructed = true;
      result.components.mcp = {
        status: 'failed',
        error: run.stderr.trim() || `exit code ${run.status}`,
      };
    }
  }

  private runCommand(argv: string[]): { status: number | null; stderr: string } {
    if (this.options.runCommand) {
      return this.options.runCommand(argv);
    }
    const spawned = spawnSync(argv[0], argv.slice(1), { encoding: 'utf-8' });
    return {
      status: spawned.status,
      stderr: spawned.stderr ?? (spawned.error ? String(spawned.error) : ''),
    };
  }

  // ------------------------------------------------------------------
  // AGENTS.md guidance
  // ------------------------------------------------------------------

  private installAgentsMdGuidance(result: PrimeAgentInstallResult): void {
    const agentsMdPath = result.agentsMdPath;
    const exists = existsSync(agentsMdPath);

    if (!exists) {
      const marked = markOwnedSection(PRIME_AGENT_GUIDANCE, PRIME_AGENT_SENTINEL_ID);
      writeFileSync(agentsMdPath, marked);
      result.agentsMdInstalled = true;
      result.ownedGuidanceBytes = Buffer.byteLength(marked);
      result.components.rules.status = 'installed';
      return;
    }

    const existing = readFileSync(agentsMdPath, 'utf-8');
    assertOwnedSectionsWellFormed(existing, PRIME_AGENT_SENTINEL_ID, 'Prime Agent');

    if (this.overwrite || !existing.includes(`BEGIN AGENTIC-QE ${PRIME_AGENT_SENTINEL_ID}`)) {
      const merged = mergeOwnedSection(existing, PRIME_AGENT_GUIDANCE, PRIME_AGENT_SENTINEL_ID, 'Prime Agent');
      if (merged !== existing) {
        writeFileSync(agentsMdPath, merged);
        result.agentsMdInstalled = true;
        result.components.rules.status = 'updated';
      } else {
        result.components.rules.status = 'preserved';
      }
    } else {
      result.components.rules.status = 'preserved';
    }
    result.ownedGuidanceBytes = measureOwnedSection(
      readFileSync(agentsMdPath, 'utf-8'),
      PRIME_AGENT_SENTINEL_ID,
      'Prime Agent',
    );
  }

  /** Remove the owned guidance section (uninstall / policy none). */
  removeGuidance(): void {
    const agentsMdPath = join(this.projectRoot, 'AGENTS.md');
    if (!existsSync(agentsMdPath)) return;
    const existing = readFileSync(agentsMdPath, 'utf-8');
    const updated = removeOwnedSections(existing, PRIME_AGENT_SENTINEL_ID, 'Prime Agent');
    if (updated !== existing) {
      writeFileSync(agentsMdPath, updated);
    }
  }

  // ------------------------------------------------------------------
  // Skills
  // ------------------------------------------------------------------

  private installSkills(): { count: number; status: PrimeAgentComponentOutcome['status'] } {
    const sourceRoot = this.resolvePackageRoot();
    if (!sourceRoot) return { count: 0, status: 'unavailable' };
    const sourceSkills = join(sourceRoot, '.agents', 'skills');
    if (!existsSync(sourceSkills)) return { count: 0, status: 'unavailable' };

    const targetSkills = join(this.projectRoot, '.prime', 'agent', 'skills');
    mkdirSync(targetSkills, { recursive: true });
    let installed = 0;
    let updated = 0;
    for (const skill of selectPrimeAgentSkills({ includeRuflo: this.options.includeRuflo })) {
      const source = join(sourceSkills, skill.name);
      if (!existsSync(source) || !statSync(source).isDirectory()) {
        throw new Error(`Missing packaged Prime Agent skill directory: ${skill.name}`);
      }
      const target = join(targetSkills, skill.name);
      if (existsSync(target) && !this.overwrite) continue;
      const targetExisted = existsSync(target);
      if (skill.files) {
        mkdirSync(target, { recursive: true });
        for (const relativeFile of skill.files) {
          const from = join(source, relativeFile);
          if (!existsSync(from) || !statSync(from).isFile()) {
            throw new Error(`Missing packaged Prime Agent skill file: ${skill.name}/${relativeFile}`);
          }
          const to = join(target, relativeFile);
          mkdirSync(dirname(to), { recursive: true });
          copyFileSync(from, to);
        }
      } else {
        this.copyDirectory(source, target);
      }
      if (targetExisted) updated++;
      else installed++;
    }
    const count = installed + updated;
    return {
      count,
      status: updated > 0 ? 'updated' : installed > 0 ? 'installed' : 'preserved',
    };
  }

  // ------------------------------------------------------------------
  // aqe-fleet subagent skill
  // ------------------------------------------------------------------

  /**
   * Seed the `aqe-fleet` skill: curated QE agent roles copied from
   * `.claude/agents/v3/` plus a generated SKILL.md that explains how to
   * spawn each role as a Prime Agent subagent.
   */
  private installFleetSkill(): { count: number; status: PrimeAgentComponentOutcome['status'] } {
    const sourceRoot = this.resolvePackageRoot();
    if (!sourceRoot) return { count: 0, status: 'unavailable' };
    const sourceAgents = join(sourceRoot, '.claude', 'agents', 'v3');
    if (!existsSync(sourceAgents)) return { count: 0, status: 'unavailable' };

    const fleetPath = join(this.projectRoot, '.prime', 'agent', 'skills', 'aqe-fleet');
    const agentsPath = join(fleetPath, 'agents');
    mkdirSync(agentsPath, { recursive: true });

    let seeded = 0;
    for (const role of PRIME_AGENT_SUBAGENT_ROLES) {
      const source = join(sourceAgents, `${role}.md`);
      if (!existsSync(source) || !statSync(source).isFile()) {
        throw new Error(`Missing packaged QE agent role: ${role}.md`);
      }
      const target = join(agentsPath, `${role}.md`);
      if (existsSync(target) && !this.overwrite) continue;
      copyFileSync(source, target);
      seeded++;
    }

    const skillMd = this.renderFleetSkillMd();
    const skillPath = join(fleetPath, 'SKILL.md');
    if (!existsSync(skillPath) || this.overwrite) {
      writeFileSync(skillPath, skillMd);
    }

    return { count: seeded, status: seeded > 0 ? 'installed' : 'preserved' };
  }

  private renderFleetSkillMd(): string {
    const roles = PRIME_AGENT_SUBAGENT_ROLES.map(
      (role) => `- \`${role}\` — see \`agents/${role}.md\` for the full role prompt`,
    ).join('\n');
    return `---
name: aqe-fleet
description: Spawn Agentic QE specialist subagents (test architect, coverage, flakiness, security, defect prediction, root cause, impact, quality gate). Use when a quality-engineering audit or generation task matches one of the seeded QE roles.
---

# AQE Fleet Subagents

Curated QE agent roles from Agentic QE v3, seeded for Prime Agent. Prime
Agent has no file-based agents; spawn a role as a subagent with its role
file as the task prompt:

    handle = await rlm.spawn(readText('agents/<role>.md') + '\\n\\nTask: <your task here>', name='<role>')

## Seeded roles

${roles}

## Notes

- Role files are self-contained Claude Code agent definitions (frontmatter +
  prompt body); they work as subagent task prompts directly.
- Prefer the AQE MCP tools (fleet_init, coverage_analyze_sublinear,
  quality_assess) when the AQE MCP server is connected.
`;
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private recordComponentFailure(
    result: PrimeAgentInstallResult,
    component: keyof PrimeAgentInstallResult['components'],
    error: unknown,
  ): void {
    const message = toErrorMessage(error);
    result.components[component] = { status: 'failed', error: message };
    result.errors.push(`Prime Agent ${component} installation failed: ${message}`);
  }

  private copyDirectory(source: string, target: string): void {
    mkdirSync(target, { recursive: true });
    for (const entry of readdirSync(source)) {
      const from = join(source, entry);
      const to = join(target, entry);
      if (statSync(from).isDirectory()) {
        this.copyDirectory(from, to);
      } else {
        copyFileSync(from, to);
      }
    }
  }

  private resolvePackageRoot(): string | undefined {
    // Development checkout or installed package: the shipped asset trees
    // (.agents/skills, .claude/agents/v3) live at the package root. The
    // shared findPackageRoot walks up from this module — it survives the
    // esbuild chunk layout (dist/cli/chunks/...) where fixed ../.. hops
    // land at dist/ instead of the package root.
    return findPackageRoot(import.meta.url) ?? undefined;
  }
}


// ============================================================================
// Factory Function
// ============================================================================

export function createPrimeAgentInstaller(options: PrimeAgentInstallerOptions): PrimeAgentInstaller {
  return new PrimeAgentInstaller(options);
}
