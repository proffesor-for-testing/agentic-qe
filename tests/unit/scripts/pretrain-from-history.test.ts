/**
 * Unit tests for the pretrain-from-history bootstrap (ADR-077 / adoption-plan #9).
 *
 * Only the PURE helpers are tested here — no git, no DB, no live-learning path.
 * The DB-touching glue (persistTaskOutcome / consolidateExperiencesToPatterns)
 * is covered by the real-run verification against a throwaway AQE_PROJECT_ROOT
 * store, which is the right level for that integration.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyCommit,
  isTrivialSubject,
} from '../../../scripts/pretrain-from-history';
import { deriveTaskType } from '../../../src/learning/agent-routing';

describe('pretrain-from-history: classifyCommit', () => {
  describe('success signal', () => {
    it('should_markSuccess_when_normalCommit', () => {
      const result = classifyCommit('feat: add JWT auth', deriveTaskType);
      expect(result.success).toBe(true);
    });

    it('should_markFailure_when_revertCommit', () => {
      // A revert means the reverted change didn't work → failure signal.
      const result = classifyCommit('revert: broken cache layer', deriveTaskType);
      expect(result.success).toBe(false);
    });

    it('should_markFailure_when_revertIsCapitalized', () => {
      const result = classifyCommit('Revert "feat: add caching"', deriveTaskType);
      expect(result.success).toBe(false);
    });

    it('should_markFailure_when_revertUppercase', () => {
      const result = classifyCommit('REVERT bad migration', deriveTaskType);
      expect(result.success).toBe(false);
    });

    it('should_markSuccess_when_subjectMerelyContainsRevertWord', () => {
      // "reverting" appears mid-sentence, not as the leading action → success.
      const result = classifyCommit('feat: document our reverting strategy', deriveTaskType);
      expect(result.success).toBe(true);
    });
  });

  describe('domain classification (delegates to deriveTaskType)', () => {
    it('should_classifyTestGeneration_when_subjectMentionsGenerateTest', () => {
      const result = classifyCommit('generate tests for auth module', deriveTaskType);
      expect(result.domain).toBe('test-generation');
    });

    it('should_classifyCoverageAnalysis_when_subjectMentionsCoverage', () => {
      const result = classifyCommit('improve coverage on parser', deriveTaskType);
      expect(result.domain).toBe('coverage-analysis');
    });

    it('should_classifySecurityCompliance_when_subjectMentionsVulnerability', () => {
      const result = classifyCommit('fix vulnerability in token parsing', deriveTaskType);
      expect(result.domain).toBe('security-compliance');
    });

    it('should_classifyDefectIntelligence_when_subjectMentionsBug', () => {
      const result = classifyCommit('fix bug in retry logic', deriveTaskType);
      expect(result.domain).toBe('defect-intelligence');
    });

    it('should_returnUnknown_when_subjectHasNoQeKeywords', () => {
      const result = classifyCommit('bump dependency versions', deriveTaskType);
      expect(result.domain).toBe('unknown');
    });
  });

  describe('subject normalization', () => {
    it('should_trimWhitespace_when_subjectHasSurroundingSpaces', () => {
      const result = classifyCommit('   feat: thing   ', deriveTaskType);
      expect(result.subject).toBe('feat: thing');
    });
  });

  describe('classifier is injectable (isolation from production classifier)', () => {
    it('should_useInjectedClassifier_when_provided', () => {
      const stub = (_: string) => 'stubbed-domain';
      const result = classifyCommit('anything', stub);
      expect(result.domain).toBe('stubbed-domain');
    });
  });
});

describe('pretrain-from-history: isTrivialSubject', () => {
  it('should_returnTrue_when_subjectEmpty', () => {
    expect(isTrivialSubject('')).toBe(true);
  });

  it('should_returnTrue_when_subjectWhitespaceOnly', () => {
    expect(isTrivialSubject('   ')).toBe(true);
  });

  it('should_returnTrue_when_subjectIsWip', () => {
    expect(isTrivialSubject('wip')).toBe(true);
  });

  it('should_returnTrue_when_subjectIsFixupMarker', () => {
    expect(isTrivialSubject('fixup! earlier commit')).toBe(true);
  });

  it('should_returnTrue_when_subjectIsMerge', () => {
    expect(isTrivialSubject('Merge branch main into feature')).toBe(true);
  });

  it('should_returnFalse_when_subjectIsMeaningfulFeature', () => {
    expect(isTrivialSubject('feat: add pretrain bootstrap')).toBe(false);
  });

  it('should_returnFalse_when_subjectIsRevert', () => {
    // Reverts carry a (failure) signal — they are NOT trivial.
    expect(isTrivialSubject('revert: bad change')).toBe(false);
  });
});
