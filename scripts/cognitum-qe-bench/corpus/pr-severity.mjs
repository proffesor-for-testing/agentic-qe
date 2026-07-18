// pr-severity — LABELED oracle. Classify an issue/PR as blocker | major | minor.
// This mirrors the live 24/7 oss-monitor triage, which returns conf 0.05-0.35 on
// PRs at cheap tier — so this task is the direct in-house evidence for whether a
// pricier tier (or a high-tier advisor on escalation) is worth it for triage.
// v1 seed set: 6 items with ground-truth severity.
import { gradeLabel } from '../lib/grade.mjs';

const CHOICES = ['blocker', 'major', 'minor'];

const SAMPLES = [
  {
    id: 'auth-bypass',
    item: 'Report: "Setting the header `X-Debug: 1` skips the auth middleware entirely and returns any user\'s data on /v1/account." Reproduced on production.',
    gold: 'blocker',
  },
  {
    id: 'typo-readme',
    item: 'PR: fixes a spelling mistake in README.md ("recieve" → "receive"). No code change.',
    gold: 'minor',
  },
  {
    id: 'perf-regression',
    item: 'Report: a list endpoint that returned in ~80ms now takes ~1.4s after the last release because it lost an index; users notice lag but nothing is broken or lost.',
    gold: 'major',
  },
  {
    id: 'data-loss-race',
    item: 'Report: concurrent writes to the same cart drop one of the two items ~10% of the time — a race in the update path. Customer-facing, silent data loss.',
    gold: 'blocker',
  },
  {
    id: 'log-noise',
    item: 'PR: reduces noisy INFO logging in the scheduler that was filling disk slowly on long-running boxes; no behavior change.',
    gold: 'minor',
  },
  {
    id: 'broken-export',
    item: 'Report: the CSV export truncates the last row when the dataset has an odd number of rows. Wrong output, but a workaround exists (export twice) and it is not a security or data-loss issue.',
    gold: 'major',
  },
];

export default {
  id: 'pr-severity',
  title: 'Classify issue/PR severity: blocker / major / minor',
  oracleType: 'labeled',
  maxTokens: 600,
  samples: SAMPLES.map((s) => ({ id: s.id, task: s.item, gold: s.gold, choices: CHOICES })),
  buildPrompt(sample) {
    return [
      { role: 'system', content: `You are a QE triage reviewer. Classify severity as exactly one of: ${CHOICES.join(', ')}. blocker = security / data-loss / broken core flow; major = significant degradation with a workaround; minor = cosmetic / low-impact. Your VERY FIRST line must be exactly "SEVERITY: <label>"; then justify briefly.` },
      { role: 'user', content: sample.task },
    ];
  },
  async grade(sample, output) {
    return gradeLabel({ output, gold: sample.gold, choices: sample.choices });
  },
};
