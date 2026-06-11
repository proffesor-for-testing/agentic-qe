/**
 * Mutation tests for the ADR-107 invariant verifier (scripts/verify-shipped-invariants.ts).
 *
 * The verifier's job is to catch section-level stripping that keyword greps
 * miss (the verify_editions.py lesson) — so these tests mutate agent content
 * and assert the verifier reacts.
 */
import { describe, it, expect } from 'vitest';
import {
  extractSection,
  checkSections,
  checkDivergence,
  type RequiredSection,
} from '../../../scripts/verify-shipped-invariants.js';

const REQUIRED: RequiredSection[] = [
  { tag: 'identity', minChars: 50, why: 'role' },
  { tag: 'memory_namespace', minChars: 50, why: 'namespaces' },
];

const CONFORMING_AGENT = `---
name: qe-fixture
version: "3.0.0"
---
<qe_agent_definition>
<identity>
This fixture agent exists to test the invariant verifier. It has a role,
a mission, and more than fifty characters of substance in this section.
</identity>
<memory_namespace>
Reads aqe/v3/domains/fixture/*; writes aqe/v3/domains/fixture/results.
Never writes outside the fixture namespace. Over fifty chars of contract.
</memory_namespace>
</qe_agent_definition>
`;

describe('extractSection', () => {
  it('should_returnInnerContent_when_tagPairPresent', () => {
    const body = extractSection(CONFORMING_AGENT, 'identity');
    expect(body).toContain('fixture agent exists');
  });

  it('should_returnNull_when_tagAbsent', () => {
    expect(extractSection(CONFORMING_AGENT, 'learning_protocol')).toBeNull();
  });
});

describe('checkSections (mutation: section stripping)', () => {
  it('should_passCleanly_when_allRequiredSectionsHaveSubstance', () => {
    expect(checkSections('qe-fixture.md', CONFORMING_AGENT, REQUIRED)).toHaveLength(0);
  });

  it('should_failHollow_when_sectionBodyStrippedButTagSurvives', () => {
    // The keyword-grep killer: tag (and its words) survive, body is gone.
    const mutated = CONFORMING_AGENT.replace(
      /<memory_namespace>[\s\S]*?<\/memory_namespace>/,
      '<memory_namespace>aqe memory namespace</memory_namespace>',
    );
    const violations = checkSections('qe-fixture.md', mutated, REQUIRED);
    expect(violations).toEqual([
      expect.objectContaining({ rule: 'required-section-hollow', file: 'qe-fixture.md' }),
    ]);
  });

  it('should_failMissing_when_sectionRemovedEntirely', () => {
    const mutated = CONFORMING_AGENT.replace(/<identity>[\s\S]*?<\/identity>\n/, '');
    const violations = checkSections('qe-fixture.md', mutated, REQUIRED);
    expect(violations).toEqual([
      expect.objectContaining({ rule: 'required-section-missing' }),
    ]);
  });

  it('should_pass_when_nonInvariantProseRewordedOnly', () => {
    // Legitimate edits OUTSIDE required sections must NOT trip the gate:
    // tweak the frontmatter description and add prose after the closing tag.
    const reworded = CONFORMING_AGENT
      .replace('name: qe-fixture', 'name: qe-fixture\ndescription: reworded for clarity')
      + '\n<notes>Some non-invariant prose added later.</notes>\n';
    expect(checkSections('qe-fixture.md', reworded, REQUIRED)).toHaveLength(0);
  });
});

describe('checkDivergence (mutation: hand-sync drift)', () => {
  it('should_pass_when_shippedAndSourceIdentical', () => {
    expect(checkDivergence('qe-fixture.md', CONFORMING_AGENT, CONFORMING_AGENT, REQUIRED)).toHaveLength(0);
  });

  it('should_failDivergence_when_requiredSectionEditedOnlyInSource', () => {
    const editedSource = CONFORMING_AGENT.replace('Never writes outside', 'May write outside');
    const violations = checkDivergence('qe-fixture.md', CONFORMING_AGENT, editedSource, REQUIRED);
    expect(violations).toEqual([
      expect.objectContaining({ rule: 'shipped-source-divergence' }),
    ]);
  });

  it('should_pass_when_divergenceIsOutsideRequiredSections', () => {
    // Frontmatter/comment drift is the version-policy check's job, not divergence.
    const editedSource = CONFORMING_AGENT.replace('version: "3.0.0"', 'version: "3.1.0"');
    expect(checkDivergence('qe-fixture.md', CONFORMING_AGENT, editedSource, REQUIRED)).toHaveLength(0);
  });
});
