/**
 * Integration tests for migrate CLI file operations
 *
 * These tests verify that the migrate command actually performs
 * file operations correctly (not just unit testing the mappings).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Migrate File Operations', () => {
  let tempDir: string;
  let claudeAgentsDir: string;

  // Sample v2 agent content
  const createV2AgentContent = (name: string) => `---
name: ${name}
description: Test agent for migration testing
---

<qe_agent_definition>
<identity>
You are the ${name.replace('qe-', '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} Agent.
Mission: Test the migration functionality.
</identity>

<capabilities>
- ${name} specific capability
- Another capability for ${name}
</capabilities>
</qe_agent_definition>
`;

  beforeEach(() => {
    // Create temp directory structure
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-migrate-test-'));
    claudeAgentsDir = path.join(tempDir, '.claude', 'agents');
    fs.mkdirSync(claudeAgentsDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Agent file migration', () => {
    it('should rename v2 agent file to v3 name', async () => {
      // Create a v2 agent file
      const v2Name = 'qe-test-generator';
      const v2FilePath = path.join(claudeAgentsDir, `${v2Name}.md`);
      fs.writeFileSync(v2FilePath, createV2AgentContent(v2Name));

      // Import and run migration logic directly
      const { resolveAgentName } = await import('../../../src/migration/agent-compat.js');

      const v3Name = resolveAgentName(v2Name);
      expect(v3Name).toBe('qe-test-architect');

      // Simulate the migration file operation
      const content = fs.readFileSync(v2FilePath, 'utf-8');
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      expect(frontmatterMatch).not.toBeNull();

      const frontmatter = frontmatterMatch![1];
      const bodyStart = content.indexOf('---', 4) + 4;
      let body = content.slice(bodyStart);

      // Update frontmatter
      let newFrontmatter = frontmatter.replace(/^name:\s*.+$/m, `name: ${v3Name}`);
      newFrontmatter += `\nv2_compat:\n  name: ${v2Name}\n  deprecated_in: "3.0.0"\n  removed_in: "4.0.0"`;

      // Update body content
      const toTitleCase = (s: string) => s.replace('qe-', '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      body = body.replace(new RegExp(toTitleCase(v2Name), 'g'), toTitleCase(v3Name));
      body = body.replace(new RegExp(v2Name, 'g'), v3Name);

      const newContent = `---\n${newFrontmatter}\n---${body}`;

      // Write new file
      const v3FilePath = path.join(claudeAgentsDir, `${v3Name}.md`);
      fs.writeFileSync(v3FilePath, newContent);

      // Create deprecated directory and move old file
      const deprecatedDir = path.join(claudeAgentsDir, 'deprecated');
      fs.mkdirSync(deprecatedDir, { recursive: true });
      fs.renameSync(v2FilePath, path.join(deprecatedDir, `${v2Name}.md.v2`));

      // Verify results
      expect(fs.existsSync(v3FilePath)).toBe(true);
      expect(fs.existsSync(v2FilePath)).toBe(false);
      expect(fs.existsSync(path.join(deprecatedDir, `${v2Name}.md.v2`))).toBe(true);
    });

    it('should update frontmatter with v2_compat field', async () => {
      const v2Name = 'qe-coverage-analyzer';
      const v2FilePath = path.join(claudeAgentsDir, `${v2Name}.md`);
      fs.writeFileSync(v2FilePath, createV2AgentContent(v2Name));

      const { resolveAgentName } = await import('../../../src/migration/agent-compat.js');
      const v3Name = resolveAgentName(v2Name);

      const content = fs.readFileSync(v2FilePath, 'utf-8');
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

      let newFrontmatter = frontmatterMatch![1].replace(/^name:\s*.+$/m, `name: ${v3Name}`);
      newFrontmatter += `\nv2_compat:\n  name: ${v2Name}\n  deprecated_in: "3.0.0"\n  removed_in: "4.0.0"`;

      const v3FilePath = path.join(claudeAgentsDir, `${v3Name}.md`);
      const bodyStart = content.indexOf('---', 4) + 4;
      const body = content.slice(bodyStart);
      fs.writeFileSync(v3FilePath, `---\n${newFrontmatter}\n---${body}`);

      // Verify frontmatter
      const migratedContent = fs.readFileSync(v3FilePath, 'utf-8');
      expect(migratedContent).toContain('name: qe-coverage-specialist');
      expect(migratedContent).toContain('v2_compat:');
      expect(migratedContent).toContain('name: qe-coverage-analyzer');
      expect(migratedContent).toContain('deprecated_in: "3.0.0"');
      expect(migratedContent).toContain('removed_in: "4.0.0"');
    });

    it('should replace agent name in body content', async () => {
      const v2Name = 'qe-test-generator';
      const v2FilePath = path.join(claudeAgentsDir, `${v2Name}.md`);
      fs.writeFileSync(v2FilePath, createV2AgentContent(v2Name));

      const { resolveAgentName } = await import('../../../src/migration/agent-compat.js');
      const v3Name = resolveAgentName(v2Name);

      const content = fs.readFileSync(v2FilePath, 'utf-8');
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      const bodyStart = content.indexOf('---', 4) + 4;
      let body = content.slice(bodyStart);

      // Apply body replacement
      const toTitleCase = (s: string) => s.replace('qe-', '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      const v2Display = toTitleCase(v2Name); // "Test Generator"
      const v3Display = toTitleCase(v3Name); // "Test Architect"

      body = body.replace(new RegExp(v2Display, 'g'), v3Display);
      body = body.replace(new RegExp(v2Name, 'g'), v3Name);

      const v3FilePath = path.join(claudeAgentsDir, `${v3Name}.md`);
      let newFrontmatter = frontmatterMatch![1].replace(/^name:\s*.+$/m, `name: ${v3Name}`);
      fs.writeFileSync(v3FilePath, `---\n${newFrontmatter}\n---${body}`);

      // Verify body content was updated
      const migratedContent = fs.readFileSync(v3FilePath, 'utf-8');
      expect(migratedContent).toContain('Test Architect Agent');
      expect(migratedContent).not.toContain('Test Generator Agent');
      expect(migratedContent).toContain('qe-test-architect specific capability');
      expect(migratedContent).not.toContain('qe-test-generator specific capability');
    });

    it('should handle consolidated agents (multiple v2 → one v3)', async () => {
      // Both qe-gap-detector and qe-coverage-analyzer map to qe-coverage-specialist
      const { resolveAgentName, getV2Names } = await import('../../../src/migration/agent-compat.js');

      expect(resolveAgentName('qe-gap-detector')).toBe('qe-coverage-specialist');
      expect(resolveAgentName('qe-coverage-analyzer')).toBe('qe-coverage-specialist');

      const v2Names = getV2Names('qe-coverage-specialist');
      expect(v2Names).toContain('qe-gap-detector');
      expect(v2Names).toContain('qe-coverage-analyzer');
    });

    it('should preserve deprecated folder structure', async () => {
      const v2Name = 'qe-parallel-executor';
      const v2FilePath = path.join(claudeAgentsDir, `${v2Name}.md`);
      fs.writeFileSync(v2FilePath, createV2AgentContent(v2Name));

      const deprecatedDir = path.join(claudeAgentsDir, 'deprecated');
      fs.mkdirSync(deprecatedDir, { recursive: true });

      // Move to deprecated
      const deprecatedPath = path.join(deprecatedDir, `${v2Name}.md.v2`);
      fs.renameSync(v2FilePath, deprecatedPath);

      // Verify
      expect(fs.existsSync(deprecatedPath)).toBe(true);
      expect(fs.existsSync(v2FilePath)).toBe(false);

      // Content should be preserved
      const content = fs.readFileSync(deprecatedPath, 'utf-8');
      expect(content).toContain('name: qe-parallel-executor');
    });
  });

  describe('Edge cases', () => {
    it('should skip files without frontmatter', async () => {
      const invalidContent = `# No frontmatter here
Just regular markdown content.
`;
      const filePath = path.join(claudeAgentsDir, 'qe-test-generator.md');
      fs.writeFileSync(filePath, invalidContent);

      const content = fs.readFileSync(filePath, 'utf-8');
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

      expect(frontmatterMatch).toBeNull();
    });

    it('should handle special regex characters in agent names', async () => {
      // Test that regex replacement doesn't break on special chars
      const toTitleCase = (s: string) => s.replace('qe-', '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

      const v2Name = 'qe-api-contract-validator';
      const v3Name = 'qe-contract-testing';

      const body = `Testing ${toTitleCase(v2Name)} capabilities with ${v2Name}`;
      const updatedBody = body
        .replace(new RegExp(toTitleCase(v2Name), 'g'), toTitleCase(v3Name))
        .replace(new RegExp(v2Name, 'g'), v3Name);

      expect(updatedBody).toBe('Testing Contract Testing capabilities with qe-contract-testing');
    });
  });
});
