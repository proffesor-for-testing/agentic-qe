// security-triage — LABELED oracle. Classify a SAST/dependency finding as
// exploitable | false-positive | needs-review. This is a real QE task where a
// cheap model tends to over-flag (everything "needs-review") or miss real
// exploits. v1 seed set: 6 findings with expert ground-truth verdicts.
import { gradeLabel } from '../lib/grade.mjs';

const CHOICES = ['exploitable', 'false-positive', 'needs-review'];

const SAMPLES = [
  {
    id: 'sqli-concat',
    finding: 'SAST: string-concatenated SQL. Code: `db.query("SELECT * FROM users WHERE id = " + req.query.id)`. req.query.id flows unvalidated from an HTTP handler into a raw query.',
    gold: 'exploitable',
  },
  {
    id: 'sqli-parameterized',
    finding: 'SAST flagged possible SQL injection. Code: `db.query("SELECT * FROM users WHERE id = $1", [req.query.id])`. Uses a parameterized query with a bound placeholder.',
    gold: 'false-positive',
  },
  {
    id: 'eval-const',
    finding: 'SAST: use of eval(). Code: `eval("1 + 2")` — the argument is a hardcoded constant string literal with no external input.',
    gold: 'false-positive',
  },
  {
    id: 'path-traversal',
    finding: 'SAST: path traversal. Code: `fs.readFile(path.join("/data", req.params.name))` where req.params.name is user-controlled and not sanitized against "../".',
    gold: 'exploitable',
  },
  {
    id: 'weak-hash-nonsecurity',
    finding: 'SAST: weak hash MD5. Code: `crypto.createHash("md5").update(fileBytes)` used to compute a cache key / ETag for static assets (not passwords, not signatures).',
    gold: 'needs-review',
  },
  {
    id: 'dep-cve-unreachable',
    finding: 'Dependency scan: HIGH CVE in `lodash.template` (prototype pollution). The package is a transitive dep; the vulnerable `template()` export is never imported or called anywhere in the codebase per grep.',
    gold: 'needs-review',
  },
];

export default {
  id: 'security-triage',
  title: 'Triage a security finding: exploitable / false-positive / needs-review',
  oracleType: 'labeled',
  maxTokens: 600,
  samples: SAMPLES.map((s) => ({ id: s.id, task: s.finding, gold: s.gold, choices: CHOICES })),
  buildPrompt(sample) {
    return [
      { role: 'system', content: `You are a security QE reviewer. Classify the finding as exactly one of: ${CHOICES.join(', ')}. "exploitable" = a real reachable exploit; "false-positive" = the tool is wrong / no real risk; "needs-review" = genuinely ambiguous or context-dependent. Your VERY FIRST line must be exactly "VERDICT: <label>"; then justify briefly.` },
      { role: 'user', content: sample.task },
    ];
  },
  async grade(sample, output) {
    return gradeLabel({ output, gold: sample.gold, choices: sample.choices });
  },
};
