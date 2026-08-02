import { describe, expect, it } from 'vitest';
import {
  extractGuidanceToolNames,
  extractRegisteredToolNames,
  verifyCodexPackage,
} from '../../../scripts/verify-codex-package.js';

describe('Codex package verification', () => {
  it('should extract only tool identifiers from generated guidance', () => {
    expect(extractGuidanceToolNames('Use `fleet_init` and `quality_assess`.\n## Best Practices\n`not_a_tool`'))
      .toEqual(['fleet_init', 'quality_assess']);
  });

  it('should extract MCP tool definitions without parameter names', () => {
    const source = `definition: { name: 'fleet_init', parameters: [{ name: 'topology' }] }`;
    expect([...extractRegisteredToolNames(source)]).toEqual(['fleet_init']);
  });

  it('should report missing assets, Ruflo leakage, and guidance drift', () => {
    const result = verifyCodexPackage(process.cwd(), [
      '.agents/skills/ruflo/SKILL.md',
      '.agents/skills/aqe-plan-quality/SKILL.md',
    ]);

    expect(result.errors).toContain('vendored Ruflo runtime leaked into package (1 files)');
    expect(result.errors).toContain('missing Codex hook asset: .codex/hooks.json');
    expect(result.errors).toContain('missing curated Codex skill asset: .agents/skills/aqe-research/SKILL.md');
    expect(result.errors.some((error) => error.includes('unregistered MCP tool'))).toBe(false);
  });
});
