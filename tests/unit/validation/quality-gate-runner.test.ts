/**
 * ADR-119/ADR-120 quality-gate orchestrator.
 *
 * Verifies the ONE CLI/MCP-parity code path: it loads a real pinned checklist
 * from the frozen ADR-117 anchor, runs the two-gate verdict, and threads the
 * three-valued outcome through. The judge is faked (no network); the anchor is
 * the real committed `verification/anchors/qe-anchor-v1.json`.
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  runQualityGate,
  loadChecklist,
  listChecklistIds,
} from '../../../src/validation/quality-gate-runner.js';
import type { Judge, JudgeOpinion } from '../../../src/validation/quality-verdict.js';

const ANCHOR = path.resolve(__dirname, '../../../verification/anchors/qe-anchor-v1.json');

/** A judge with configurable preflight + a scripted opinion sequence. */
function fakeJudge(opinions: JudgeOpinion[], ready = true): Judge {
  let i = 0;
  return {
    preflight: () => ready,
    grade: () => opinions[Math.min(i++, opinions.length - 1)],
  };
}

const passingOracle = { passed: true, baselinePassed: true };

describe('runQualityGate', () => {
  it('should_returnPass_when_oraclePassesAndJudgeFullCoverage', async () => {
    // Arrange
    const judge = fakeJudge([{ ran: true, coverage: 1.0, unmet: [] }]);

    // Act
    const result = await runQualityGate({
      oracleResult: passingOracle,
      artifact: 'test source',
      checklistId: 'A1-inRange',
      judge,
      anchorPath: ANCHOR,
    });

    // Assert
    expect(result.verdict).toBe('pass');
    expect(result.mechanical).toBe('pass');
    expect(result.specCoverage).toBe(1.0);
  });

  it('should_returnFail_when_oracleDidNotRun', async () => {
    // Arrange: null oracle ⇒ mechanical fail, judge never consulted
    const judge = fakeJudge([{ ran: true, coverage: 1.0, unmet: [] }]);

    // Act
    const result = await runQualityGate({
      oracleResult: null,
      artifact: 'test source',
      checklistId: 'A1-inRange',
      judge,
      anchorPath: ANCHOR,
    });

    // Assert
    expect(result.verdict).toBe('fail');
    expect(result.mechanical).toBe('fail');
  });

  it('should_returnInconclusive_when_judgePreflightFails', async () => {
    // Arrange: dead judge (preflight false) but oracle passed
    const judge = fakeJudge([{ ran: true, coverage: 1.0, unmet: [] }], false);

    // Act
    const result = await runQualityGate({
      oracleResult: passingOracle,
      artifact: 'test source',
      checklistId: 'A1-inRange',
      judge,
      anchorPath: ANCHOR,
    });

    // Assert
    expect(result.verdict).toBe('inconclusive');
    expect(result.reason).toContain('preflight');
  });

  it('should_returnFail_when_twoRealOpinionsBelowThreshold', async () => {
    // Arrange: two short real opinions over the real 4-requirement checklist
    const judge = fakeJudge([
      { ran: true, coverage: 0.5, unmet: ['the low boundary is included'] },
      { ran: true, coverage: 0.75, unmet: ['the high boundary is included'] },
    ]);

    // Act
    const result = await runQualityGate({
      oracleResult: passingOracle,
      artifact: 'weak test source',
      checklistId: 'A1-inRange',
      judge,
      anchorPath: ANCHOR,
    });

    // Assert
    expect(result.verdict).toBe('fail');
    expect(result.specCoverage).toBe(0.75); // best of the two real opinions
  });

  it('should_throw_when_checklistIdUnknown', async () => {
    // Arrange
    const judge = fakeJudge([{ ran: true, coverage: 1.0, unmet: [] }]);

    // Act + Assert
    await expect(
      runQualityGate({
        oracleResult: passingOracle,
        artifact: 'x',
        checklistId: 'does-not-exist',
        judge,
        anchorPath: ANCHOR,
      }),
    ).rejects.toThrow(/Unknown checklist id/);
  });
});

describe('loadChecklist', () => {
  it('should_returnConstantDenominatorChecklist_fromFrozenAnchor', () => {
    // Act
    const checklist = loadChecklist('A2-letterGrade', ANCHOR);

    // Assert
    expect(checklist.id).toBe('A2-letterGrade');
    expect(checklist.requirements).toHaveLength(4);
    expect(checklist.requirements[0]).toContain('90');
  });
});

describe('listChecklistIds', () => {
  it('should_listAllAnchorItemIds', () => {
    // Act
    const ids = listChecklistIds(ANCHOR);

    // Assert
    expect(ids).toEqual(['A1-inRange', 'A2-letterGrade', 'A3-isBlank', 'A4-countAbove', 'A5-parseBool']);
  });
});
