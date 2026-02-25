/**
 * Phase 09: Assets
 * Installs skills and agents
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  BasePhase,
  type InitContext,
} from './phase-interface.js';
import { createSkillsInstaller } from '../skills-installer.js';
import { createAgentsInstaller } from '../agents-installer.js';
import { createN8nInstaller } from '../n8n-installer.js';
import type { AQEInitConfig } from '../types.js';

export interface AssetsResult {
  skillsInstalled: number;
  agentsInstalled: number;
  n8nAgents: number;
  n8nSkills: number;
  openCodeAgents: number;
  openCodeSkills: number;
  kiroAgents: number;
  kiroSkills: number;
  kiroHooks: number;
}

/**
 * Assets phase - installs skills and agents
 */
export class AssetsPhase extends BasePhase<AssetsResult> {
  readonly name = 'assets';
  readonly description = 'Install skills and agents';
  readonly order = 90;
  readonly critical = false;
  readonly requiresPhases = ['configuration'] as const;

  protected async run(context: InitContext): Promise<AssetsResult> {
    const config = context.config as AQEInitConfig;
    const { projectRoot, options } = context;

    // Auto-upgrade if version differs (v3.5.3+)
    const isVersionUpgrade = this.detectVersionUpgrade(context);

    // Determine overwrite mode: --upgrade flag, config setting, OR auto-mode with version change
    const shouldOverwrite = options.upgrade || config.skills.overwrite ||
      (options.autoMode && isVersionUpgrade);

    let skillsInstalled = 0;
    let agentsInstalled = 0;
    let n8nAgents = 0;
    let n8nSkills = 0;
    let openCodeAgents = 0;
    let openCodeSkills = 0;
    let kiroAgents = 0;
    let kiroSkills = 0;
    let kiroHooks = 0;

    if (options.upgrade) {
      context.services.log(`  Upgrade mode: overwriting existing files`);
    } else if (options.autoMode && isVersionUpgrade) {
      context.services.log(`  Version upgrade detected: updating skills and agents`);
    }

    // Install skills
    if (config.skills.install) {
      const skillsInstaller = createSkillsInstaller({
        projectRoot,
        installV2Skills: config.skills.installV2,
        installV3Skills: config.skills.installV3,
        overwrite: shouldOverwrite,
      });

      const skillsResult = await skillsInstaller.install();
      skillsInstalled = skillsResult.installed.length;

      if (skillsResult.errors.length > 0) {
        context.services.warn(`Skills warnings: ${skillsResult.errors.join(', ')}`);
      }
    }

    // Install agents
    const agentsInstaller = createAgentsInstaller({
      projectRoot,
      installQEAgents: true,
      installSubagents: true,
      overwrite: shouldOverwrite,
    });

    const agentsResult = await agentsInstaller.install();
    agentsInstalled = agentsResult.installed.length;

    if (agentsResult.errors.length > 0) {
      context.services.warn(`Agents warnings: ${agentsResult.errors.join(', ')}`);
    }

    // Install n8n platform (optional)
    if (options.withN8n) {
      const n8nInstaller = createN8nInstaller({
        projectRoot,
        installAgents: true,
        installSkills: true,
        overwrite: shouldOverwrite,
        n8nApiConfig: options.n8nApiConfig,
      });

      const n8nResult = await n8nInstaller.install();
      n8nAgents = n8nResult.agentsInstalled.length;
      n8nSkills = n8nResult.skillsInstalled.length;

      if (n8nResult.errors.length > 0) {
        context.services.warn(`N8n warnings: ${n8nResult.errors.join(', ')}`);
      }
    }

    // Install OpenCode platform (optional)
    const autoOpenCode = options.autoMode && existsSync(join(projectRoot, 'opencode.json'));
    if (options.withOpenCode || autoOpenCode) {
      const { createOpenCodeInstaller } = await import('../opencode-installer.js');
      const openCodeInstaller = createOpenCodeInstaller({
        projectRoot,
        installAgents: true,
        installSkills: true,
        installTools: true,
        overwrite: shouldOverwrite,
      });

      const ocResult = await openCodeInstaller.install();
      openCodeAgents = ocResult.agentsInstalled.length;
      openCodeSkills = ocResult.skillsInstalled.length;

      if (ocResult.errors.length > 0) {
        context.services.warn(`OpenCode warnings: ${ocResult.errors.join(', ')}`);
      }
    }

    context.services.log(`  Skills: ${skillsInstalled}`);
    context.services.log(`  Agents: ${agentsInstalled}`);
    if (options.withN8n) {
      context.services.log(`  N8n agents: ${n8nAgents}`);
      context.services.log(`  N8n skills: ${n8nSkills}`);
    }
    if (options.withOpenCode || autoOpenCode) {
      context.services.log(`  OpenCode agents: ${openCodeAgents}`);
      context.services.log(`  OpenCode skills: ${openCodeSkills}`);
    }

    // Install Kiro platform (optional)
    const autoKiro = options.autoMode && existsSync(join(projectRoot, '.kiro'));
    if (options.withKiro || autoKiro) {
      const { createKiroInstaller } = await import('../kiro-installer.js');
      const kiroInstaller = createKiroInstaller({
        projectRoot,
        installAgents: true,
        installSkills: true,
        installHooks: true,
        installSteering: true,
        overwrite: shouldOverwrite,
      });

      const kiroResult = await kiroInstaller.install();
      kiroAgents = kiroResult.agentsInstalled.length;
      kiroSkills = kiroResult.skillsInstalled.length;
      kiroHooks = kiroResult.hooksInstalled.length;

      if (kiroResult.errors.length > 0) {
        context.services.warn(`Kiro warnings: ${kiroResult.errors.join(', ')}`);
      }

      context.services.log(`  Kiro agents: ${kiroAgents}`);
      context.services.log(`  Kiro skills: ${kiroSkills}`);
      context.services.log(`  Kiro hooks: ${kiroHooks}`);
      context.services.log(`  Kiro steering: ${kiroResult.steeringInstalled.length}`);
      if (kiroResult.mcpConfigured) {
        context.services.log(`  Kiro MCP: .kiro/settings/mcp.json`);
      }
    }

    return {
      skillsInstalled,
      agentsInstalled,
      n8nAgents,
      n8nSkills,
      openCodeAgents,
      openCodeSkills,
      kiroAgents,
      kiroSkills,
      kiroHooks,
    };
  }

  /**
   * Detect if this is a version upgrade by comparing existing config version
   * with the new version being installed
   */
  private detectVersionUpgrade(context: InitContext): boolean {
    const configPath = join(context.projectRoot, '.agentic-qe', 'config.yaml');
    if (!existsSync(configPath)) {
      return false;
    }

    try {
      const content = readFileSync(configPath, 'utf-8');
      const versionMatch = content.match(/version:\s*"?([^"\n]+)"?/);
      const existingVersion = versionMatch?.[1];
      const newVersion = (context.config as AQEInitConfig).version;

      // If versions differ, this is an upgrade
      return existingVersion !== undefined && existingVersion !== newVersion;
    } catch {
      return false;
    }
  }
}

// Instance exported from index.ts
