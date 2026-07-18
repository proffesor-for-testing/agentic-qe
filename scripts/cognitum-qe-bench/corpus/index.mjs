// Corpus index — assembles the QE task set. v1 ships all 7 tasks spanning the
// oracle-provenance ladder: execution (test-exec, strongest) → labeled → structural.
import testGeneration from './test-generation.mjs';
import securityTriage from './security-triage.mjs';
import prSeverity from './pr-severity.mjs';
import coverageGap from './coverage-gap.mjs';
import mutationAdequacy from './mutation-adequacy.mjs';
import flakyDiagnosis from './flaky-diagnosis.mjs';
import adversarialReview from './adversarial-review.mjs';

export const TASKS = [
  testGeneration, mutationAdequacy,       // execution oracle (delivered quality)
  securityTriage, prSeverity, flakyDiagnosis, adversarialReview, // labeled
  coverageGap,                            // structural (proxy)
];

export function selectTasks(spec) {
  if (!spec || spec === 'all') return TASKS;
  const ids = spec.split(',').map((s) => s.trim());
  return TASKS.filter((t) => ids.includes(t.id));
}
