/**
 * P4 tests for skill-tree parity (ADR-113). Durable: assert the frontmatter-agnostic
 * comparison contract, independent of how stripping is implemented.
 */

import { describe, it, expect } from 'vitest';
import { stripFrontmatter, bodiesMatch, buildParityReport } from '../../../src/validation/skill-parity';

const withFrontmatter = (fm: string, body: string) => `---\n${fm}\n---\n\n${body}\n`;

describe('stripFrontmatter', () => {
  it('removes a leading YAML block and returns the trimmed body', () => {
    expect(stripFrontmatter(withFrontmatter('name: x', 'BODY'))).toBe('BODY');
  });

  it('returns the whole content trimmed when there is no frontmatter', () => {
    expect(stripFrontmatter('no frontmatter here')).toBe('no frontmatter here');
  });
});

describe('bodiesMatch (frontmatter-agnostic)', () => {
  it('treats two docs with identical bodies but different frontmatter as a match', () => {
    const a = withFrontmatter('name: x\ntrust_tier: 3', 'SAME BODY');
    const b = withFrontmatter('name: x\nallowed-tools:\n  - Read', 'SAME BODY');
    expect(bodiesMatch(a, b)).toBe(true);
  });

  it('flags differing bodies even when frontmatter is identical', () => {
    const a = withFrontmatter('name: x', 'BODY ONE');
    const b = withFrontmatter('name: x', 'BODY TWO');
    expect(bodiesMatch(a, b)).toBe(false);
  });
});

describe('buildParityReport', () => {
  const canonical = { alpha: withFrontmatter('n: a', 'A'), beta: withFrontmatter('n: b', 'B') };

  it('reports clean when every mirrored body matches', () => {
    const report = buildParityReport('assets/skills', canonical, {
      alpha: withFrontmatter('different: fm', 'A'),
      beta: withFrontmatter('n: b', 'B'),
    });
    expect(report.clean).toBe(true);
    expect(report.match).toBe(2);
  });

  it('flags drift and is not clean when a body diverges', () => {
    const report = buildParityReport('assets/skills', canonical, {
      alpha: withFrontmatter('n: a', 'A-CHANGED'),
      beta: withFrontmatter('n: b', 'B'),
    });
    expect(report.clean).toBe(false);
    expect(report.drift).toBe(1);
    expect(report.entries.find((e) => e.skill === 'alpha')?.status).toBe('drift');
  });

  it('counts absent skills separately and does not treat absence as drift', () => {
    const report = buildParityReport('assets/skills', canonical, { alpha: withFrontmatter('n: a', 'A') });
    expect(report.absent).toBe(1);
    expect(report.clean).toBe(true); // absent != drift
  });
});
