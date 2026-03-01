/**
 * Test: SkillsInstaller
 * Tests skill installation, filtering, validation infrastructure, and index creation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

describe('SkillsInstaller', () => {
  const testDir = join(process.cwd(), '.test-skills-installer');
  const projectDir = join(testDir, 'project');

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(projectDir, { recursive: true });

    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  describe('SkillsInstaller result shape', () => {
    it('should return correct result shape', async () => {
      const { createSkillsInstaller } = await import('../../../src/init/skills-installer.js');
      const installer = createSkillsInstaller({ projectRoot: projectDir });

      const result = await installer.install();

      expect(result).toHaveProperty('installed');
      expect(result).toHaveProperty('skipped');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('totalCount');
      expect(result).toHaveProperty('skillsDir');
      expect(result).toHaveProperty('validationInstalled');
      expect(Array.isArray(result.installed)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should set skillsDir to project .claude/skills', async () => {
      const { createSkillsInstaller } = await import('../../../src/init/skills-installer.js');
      const installer = createSkillsInstaller({ projectRoot: projectDir });

      const result = await installer.install();

      expect(result.skillsDir).toBe(join(projectDir, '.claude', 'skills'));
    });
  });

  describe('SkillsInstaller with real source', () => {
    // Check if real skills directory exists in dev environment
    const realSkillsCheck = join(process.cwd(), '.claude', 'skills');
    const hasRealSkills = existsSync(realSkillsCheck);

    it.skipIf(!hasRealSkills)('should install QE skills from source', async () => {
      const { createSkillsInstaller } = await import('../../../src/init/skills-installer.js');
      const installer = createSkillsInstaller({ projectRoot: projectDir });

      const result = await installer.install();

      expect(result.installed.length).toBeGreaterThan(0);
      // Verify no excluded skills were installed
      const excludedNames = [
        'v3-core-implementation', 'agentdb-advanced',
        'flow-nexus-neural', 'swarm-orchestration',
      ];
      for (const installed of result.installed) {
        expect(excludedNames).not.toContain(installed.name);
      }
    });

    it.skipIf(!hasRealSkills)('should skip existing skills when overwrite is false', async () => {
      const { createSkillsInstaller } = await import('../../../src/init/skills-installer.js');

      // First install
      const installer1 = createSkillsInstaller({ projectRoot: projectDir, overwrite: false });
      await installer1.install();

      // Second install
      const installer2 = createSkillsInstaller({ projectRoot: projectDir, overwrite: false });
      const result = await installer2.install();

      expect(result.skipped.length).toBeGreaterThan(0);
    });

    it.skipIf(!hasRealSkills)('should overwrite when overwrite option is true', async () => {
      const { createSkillsInstaller } = await import('../../../src/init/skills-installer.js');

      // First install
      const installer1 = createSkillsInstaller({ projectRoot: projectDir });
      await installer1.install();

      // Second install with overwrite
      const installer2 = createSkillsInstaller({ projectRoot: projectDir, overwrite: true });
      const result = await installer2.install();

      expect(result.installed.length).toBeGreaterThan(0);
    });

    it.skipIf(!hasRealSkills)('should filter by include list', async () => {
      const { createSkillsInstaller } = await import('../../../src/init/skills-installer.js');
      const installer = createSkillsInstaller({
        projectRoot: projectDir,
        include: ['qe-test-generation'],
      });

      const result = await installer.install();

      // Should only install the included skill (if it exists in source)
      for (const skill of result.installed) {
        expect(skill.name).toBe('qe-test-generation');
      }
    });

    it.skipIf(!hasRealSkills)('should filter by exclude list', async () => {
      const { createSkillsInstaller } = await import('../../../src/init/skills-installer.js');
      const installer = createSkillsInstaller({
        projectRoot: projectDir,
        exclude: ['chaos'],
      });

      const result = await installer.install();

      // No installed skill should contain "chaos"
      for (const skill of result.installed) {
        expect(skill.name).not.toContain('chaos');
      }
    });

    it.skipIf(!hasRealSkills)('should skip V3 skills when installV3Skills is false', async () => {
      const { createSkillsInstaller } = await import('../../../src/init/skills-installer.js');
      const installer = createSkillsInstaller({
        projectRoot: projectDir,
        installV3Skills: false,
      });

      const result = await installer.install();

      // No V3 domain skills should be installed
      const v3DomainSkillNames = [
        'qe-test-generation', 'qe-test-execution', 'qe-coverage-analysis',
      ];
      for (const skill of result.installed) {
        expect(v3DomainSkillNames).not.toContain(skill.name);
      }
    });

    it.skipIf(!hasRealSkills)('should classify skill types correctly', async () => {
      const { createSkillsInstaller } = await import('../../../src/init/skills-installer.js');
      const installer = createSkillsInstaller({ projectRoot: projectDir });

      const result = await installer.install();

      for (const skill of result.installed) {
        expect(['v2-methodology', 'v3-domain']).toContain(skill.type);
      }
    });

    it.skipIf(!hasRealSkills)('should create README.md index file', async () => {
      const { createSkillsInstaller } = await import('../../../src/init/skills-installer.js');
      const installer = createSkillsInstaller({ projectRoot: projectDir });

      await installer.install();

      const readmePath = join(projectDir, '.claude', 'skills', 'README.md');
      expect(existsSync(readmePath)).toBe(true);

      const content = readFileSync(readmePath, 'utf-8');
      expect(content).toContain('AQE Skills Index');
    });
  });

  describe('SkillsInstaller source resolution', () => {
    it('should gracefully handle when no source skills are found for target project', async () => {
      const { createSkillsInstaller } = await import('../../../src/init/skills-installer.js');
      const installer = createSkillsInstaller({
        projectRoot: '/tmp/nonexistent-skills-test-xyz',
      });

      const result = await installer.install();

      // Either errors out with "not found" or installs 0 skills
      // (depends on whether dev environment has global skills path)
      expect(result).toBeDefined();
      expect(result.skillsDir).toContain('.claude/skills');
    });
  });

  describe('installSkills convenience function', () => {
    it('should exist and be callable', async () => {
      const { installSkills } = await import('../../../src/init/skills-installer.js');

      expect(typeof installSkills).toBe('function');
    });
  });
});
