#!/usr/bin/env node
//
// scripts/check-pr-body.js
//
// Parses a PR body and enforces the two rules from issue #401:
//   1. The load-bearing failure-modes checkbox (added by the #401 follow-up
//      PR template update) must be checked.
//   2. No "hand-wavy dismissal" reasoning about failure modes — phrases
//      like "I believe it's unlikely" and "can't see how this would fail"
//      must be accompanied by a tracking issue reference (#NNN) in the
//      same paragraph.
//
// Both rules are HARD FAILS. Forbidden phrases with a same-paragraph
// `#NNN` reference are allowed — the phrase is acceptable when the
// failure mode is at least being tracked.
//
// Usage:
//   node scripts/check-pr-body.js <path-to-pr-body.md>
//   cat pr-body.md | node scripts/check-pr-body.js -
//
// Exit codes:
//   0   PR body is valid
//   1   PR body has one or more violations (details on stderr)
//   2   usage / input error
//
// Refs: https://github.com/proffesor-for-testing/agentic-qe/issues/408

'use strict';

const fs = require('fs');

// -----------------------------------------------------------------------------
// Rule 1: the load-bearing failure-modes checkbox
// -----------------------------------------------------------------------------
//
// The template anchors on the phrase "Every failure mode mentioned in this
// PR description". We match on that phrase (not on the surrounding
// markdown) so minor reformatting — extra whitespace, line breaks inside
// the bullet, slightly different bold syntax — doesn't defeat the check.
//
// Returns: { present: bool, checked: bool, matchedLine: string|null }
function findRequiredCheckbox(body) {
  const ANCHOR = /-\s*\[([ xX])\]\s*\*{0,2}\s*Every failure mode mentioned in this PR description/;
  const match = body.match(ANCHOR);
  if (!match) {
    return { present: false, checked: false, matchedLine: null };
  }
  const state = match[1];
  return {
    present: true,
    checked: state === 'x' || state === 'X',
    matchedLine: match[0],
  };
}

// -----------------------------------------------------------------------------
// Rule 2: forbidden dismissal phrases
// -----------------------------------------------------------------------------
//
// Each pattern is anchored on enough surrounding context to avoid false
// positives on legitimate usage. For example, "I believe" is not
// forbidden; "I believe it's unlikely" (applied to a failure mode) is.
//
// Label is used in error output so the author knows which rule they hit.
const FORBIDDEN_PHRASES = [
  { label: "I believe it's unlikely",           re: /\bI\s+believe\s+it'?s\s+unlikely\b/i },
  { label: "I don't think this can happen",     re: /\bI\s+don'?t\s+think\s+this\s+can\s+happen\b/i },
  { label: "I don't think this will happen",    re: /\bI\s+don'?t\s+think\s+this\s+will\s+happen\b/i },
  { label: "unlikely to happen",                re: /\bunlikely\s+to\s+happen\b/i },
  { label: "highly unlikely",                   re: /\bhighly\s+unlikely\b/i },
  { label: "shouldn't happen but",              re: /\bshouldn'?t\s+happen\s+but\b/i },
  { label: "shouldn't happen in practice",      re: /\bshouldn'?t\s+happen\s+in\s+practice\b/i },
  { label: "probably won't happen",             re: /\bprobably\s+won'?t\s+happen\b/i },
  { label: "can't see how this would fail/break/happen",
                                                re: /\bcan'?t\s+see\s+how\s+this\s+would\s+(fail|break|happen)\b/i },
  { label: "edge case we don't need",           re: /\bedge\s+case\s+we\s+don'?t\s+need\b/i },
  { label: "I doubt this will/can",             re: /\bI\s+doubt\s+this\s+(will|can)\b/i },
  { label: "in theory this won't/can't/shouldn't",
                                                re: /\bin\s+theory\s+this\s+(won'?t|can'?t|shouldn'?t)\b/i },
  { label: "theoretical concern",               re: /\btheoretical\s+concern\b/i },
];

// Splits body into paragraphs (blank-line separated). Each returned
// paragraph has its original start index preserved so we can point at
// the exact location later if needed.
function paragraphs(body) {
  const paras = [];
  const lines = body.split('\n');
  let current = [];
  let startLine = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '') {
      if (current.length > 0) {
        paras.push({ text: current.join('\n'), startLine });
        current = [];
      }
      startLine = i + 1;
    } else {
      if (current.length === 0) startLine = i;
      current.push(lines[i]);
    }
  }
  if (current.length > 0) {
    paras.push({ text: current.join('\n'), startLine });
  }
  return paras;
}

// A phrase is "tracked" when the SAME paragraph that contains the
// forbidden phrase also contains an issue reference like `#123`. This
// lets authors acknowledge a failure mode AND link a tracking issue
// without getting blocked.
function hasIssueReference(paragraphText) {
  return /#\d+\b/.test(paragraphText);
}

// Matches the template's own checkbox paragraph. The stock instruction
// text contains the phrase "I don't think this can happen but..." as
// an example of what NOT to write — so if we scanned that paragraph
// like any other, the template itself would trip the linter. Skip any
// paragraph whose text matches this anchor.
const TEMPLATE_CHECKBOX_ANCHOR = /Every failure mode mentioned in this PR description/;

function findForbiddenPhraseViolations(body) {
  const violations = [];
  const paras = paragraphs(body);
  for (const para of paras) {
    // Skip the template's self-describing checkbox paragraph — it
    // contains the forbidden phrase as a teaching example, not as
    // author reasoning.
    if (TEMPLATE_CHECKBOX_ANCHOR.test(para.text)) {
      continue;
    }
    for (const phrase of FORBIDDEN_PHRASES) {
      if (phrase.re.test(para.text) && !hasIssueReference(para.text)) {
        violations.push({
          label: phrase.label,
          paragraphLine: para.startLine + 1, // 1-indexed for human output
          paragraphPreview: para.text.length > 200
            ? para.text.slice(0, 200) + '…'
            : para.text,
        });
      }
    }
  }
  return violations;
}

// -----------------------------------------------------------------------------
// Entry point
// -----------------------------------------------------------------------------
function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: check-pr-body.js <path> | check-pr-body.js -');
    process.exit(2);
  }

  let body;
  try {
    if (arg === '-') {
      body = fs.readFileSync(0, 'utf8'); // stdin
    } else {
      body = fs.readFileSync(arg, 'utf8');
    }
  } catch (err) {
    console.error(`ERROR: could not read ${arg}: ${err.message}`);
    process.exit(2);
  }

  const errors = [];

  // Rule 1: checkbox
  const checkbox = findRequiredCheckbox(body);
  if (!checkbox.present) {
    errors.push(
      'Required failure-modes checkbox is missing from PR body.\n' +
      '  The PR template (see .github/PULL_REQUEST_TEMPLATE.md) includes a\n' +
      '  checkbox anchored on the phrase "Every failure mode mentioned in\n' +
      '  this PR description". Removing the entire Required-check section\n' +
      '  is not allowed — reinstate it and mark it [x] if accurate.\n' +
      '  Context: https://github.com/proffesor-for-testing/agentic-qe/issues/401'
    );
  } else if (!checkbox.checked) {
    errors.push(
      'Required failure-modes checkbox is present but unchecked.\n' +
      '  Matched line: ' + checkbox.matchedLine + '\n' +
      '  Every failure mode mentioned in this PR description must have\n' +
      '  either (a) a test that exercises it, or (b) a linked tracking\n' +
      '  issue. Tick the box when that is true, or add the missing tests\n' +
      '  or tracking issues first.\n' +
      '  Context: https://github.com/proffesor-for-testing/agentic-qe/issues/401'
    );
  }

  // Rule 2: forbidden phrases
  const phraseViolations = findForbiddenPhraseViolations(body);
  for (const v of phraseViolations) {
    errors.push(
      `Forbidden dismissal phrase "${v.label}" at line ${v.paragraphLine} ` +
      'without a tracking issue reference in the same paragraph.\n' +
      '  Paragraph preview:\n' +
      '  > ' + v.paragraphPreview.split('\n').join('\n  > ') + '\n' +
      '  Either test the failure mode, or open a tracking issue and\n' +
      '  reference it (e.g. "see #NNN") in the same paragraph as the\n' +
      '  phrase. "I believe it\'s unlikely" is not verification.\n' +
      '  Context: https://github.com/proffesor-for-testing/agentic-qe/issues/401'
    );
  }

  if (errors.length === 0) {
    console.log('PR body passes template checks (checkbox checked, no untracked dismissal phrases).');
    process.exit(0);
  }

  console.error(`PR body check failed with ${errors.length} violation(s):\n`);
  for (let i = 0; i < errors.length; i++) {
    console.error(`[${i + 1}] ${errors[i]}\n`);
  }
  process.exit(1);
}

if (require.main === module) {
  main();
}

// Exported for self-test
module.exports = {
  findRequiredCheckbox,
  findForbiddenPhraseViolations,
  paragraphs,
  FORBIDDEN_PHRASES,
};
