export const meta = {
  name: 'qcsd-development-review',
  description: 'QCSD Development-phase review: parallel dimension finders → adversarial refuters (majority kill) → schema-validated verdict synthesis (ADR-102)',
  whenToUse: 'In-sprint code-quality review with adversarially verified findings. Invoked by the qcsd-development-swarm skill (execution.primary: workflow). Args: { sourcePath, testPath?, dimensions?, maxFindings? }',
  phases: [
    { title: 'Find', detail: 'one finder per quality dimension' },
    { title: 'Verify', detail: '3 blind refuters per finding, majority kill' },
    { title: 'Synthesize', detail: 'deterministic finding-verdict@1 assembly' },
  ],
}

// ── Parameters ──────────────────────────────────────────────────────────────
const sourcePath = (args && args.sourcePath) || 'src/'
const testPath = (args && args.testPath) || 'tests/'
const maxFindings = (args && args.maxFindings) || 5
const REFUTERS = 3 // majority kill at >= 2 refuted votes

// ── Schemas (mirror schemas/finding-verdict.schema.json, ADR-103) ──────────
const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['findings'],
  additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'title', 'file', 'severity', 'confidence', 'evidence'],
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          file: { type: 'string' },
          severity: { enum: ['critical', 'high', 'medium', 'low', 'info'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          evidence: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}

const REFUTER_SCHEMA = {
  type: 'object',
  required: ['refuted', 'reasoning'],
  additionalProperties: false,
  properties: {
    refuted: { type: 'boolean' },
    reasoning: { type: 'string' },
  },
}

// ── Quality dimensions (qcsd-development-swarm core agent mapping) ──────────
const ALL_DIMENSIONS = [
  {
    key: 'tdd-adherence',
    agentType: 'qe-tdd-specialist',
    prompt:
      `Review the code under ${sourcePath} (tests under ${testPath}) for TDD-adherence problems: ` +
      `production code paths with no corresponding test, tests asserting implementation details instead of behavior, ` +
      `and test files that mock the unit under test. `,
  },
  {
    key: 'complexity',
    agentType: 'qe-code-complexity',
    prompt:
      `Review the code under ${sourcePath} for complexity hotspots: functions with high cyclomatic/cognitive complexity, ` +
      `deeply nested control flow, and god-functions doing unrelated work. `,
  },
  {
    key: 'coverage-gaps',
    agentType: 'qe-coverage-specialist',
    prompt:
      `Review the code under ${sourcePath} against the tests under ${testPath} for risk-weighted coverage gaps: ` +
      `error paths, boundary conditions, and concurrency-sensitive branches with no test exercising them. `,
  },
]
const wanted = args && Array.isArray(args.dimensions) ? args.dimensions : null
const DIMENSIONS = wanted ? ALL_DIMENSIONS.filter((d) => wanted.includes(d.key)) : ALL_DIMENSIONS
if (wanted && DIMENSIONS.length < wanted.length) {
  log(`unknown dimension keys ignored: ${wanted.filter((k) => !ALL_DIMENSIONS.some((d) => d.key === k)).join(', ')}`)
}

const FINDER_TAIL =
  `Report up to ${maxFindings} findings. Report every issue you find including uncertain ones — a separate ` +
  `adversarial verification step filters false positives; your job is coverage, not filtering. For each finding: ` +
  `a stable kebab-case id, a one-line title, the file path, severity (critical|high|medium|low|info), your ` +
  `confidence (0..1), and concrete evidence strings (file:line references, code excerpts). Findings without ` +
  `verifiable evidence will be killed downstream, so cite precisely. Return zero findings if the code is clean.`

// Loki-mode constraints (ADR-074): blind review — refuters see only the bare
// claim and evidence, never the finder's confidence, dimension, or each
// other's verdicts; anti-sycophancy — the refuter's job is to attack the
// claim, and uncertainty defaults to refuted.
const refuterPrompt = (finding, lens) =>
  `You are an adversarial reviewer. Try to REFUTE this code-review claim using the ${lens} lens.\n` +
  `Claim: "${finding.title}" in ${finding.file}\n` +
  `Evidence offered: ${finding.evidence.join(' | ')}\n` +
  `Read the actual code at the cited locations and judge ONLY what you can verify yourself. ` +
  `Set refuted=true unless the evidence checks out AND the claim is a real, actionable problem ` +
  `(default to refuted=true when uncertain — unverifiable claims must not survive). ` +
  `Give one-sentence reasoning.`

const LENSES = ['does-the-evidence-reproduce', 'is-it-actually-a-problem', 'is-the-cited-code-really-doing-this']

// ── Find → Verify (pipeline: no barrier between dimensions) ────────────────
const reviewed = await pipeline(
  DIMENSIONS,
  (d) =>
    agent(d.prompt + FINDER_TAIL, {
      label: `find:${d.key}`,
      phase: 'Find',
      schema: FINDINGS_SCHEMA,
      agentType: d.agentType,
    }),
  (found, d) => {
    const findings = (found && found.findings ? found.findings : []).slice(0, maxFindings)
    if (findings.length === 0) {
      log(`${d.key}: clean — no findings`)
      return []
    }
    return parallel(
      findings.map((f) => () =>
        parallel(
          LENSES.slice(0, REFUTERS).map((lens, i) => () =>
            agent(refuterPrompt(f, lens), {
              label: `refute:${f.id}:${i + 1}`,
              phase: 'Verify',
              schema: REFUTER_SCHEMA,
            })
          )
        ).then((votes) => ({ dimension: d.key, finding: f, votes: votes.filter(Boolean) }))
      )
    )
  }
)

// ── Synthesize (deterministic — plain code, no agent) ───────────────────────
// CANONICAL: this is @ruvector/adversarial-verify `synthesizeVerdict` (k-of-n
// majority kill, default-uncertain). Mirrored inline because the Workflow sandbox
// has no module resolution; src/verification/adversarial-verify is the source of
// truth and tests/unit/verification/adversarial-verify/parity.test.ts guards drift.
const all = reviewed.filter(Boolean).flat()
const verdicts = all.map(({ dimension, finding, votes }) => {
  const refutations = votes.filter((v) => v.refuted).map((v) => v.reasoning)
  // majority kill: refuted when >= ceil(N/2) of cast votes refute (2-of-3)
  const killed = votes.length > 0 && refutations.length >= Math.ceil(votes.length / 2)
  return {
    contract: 'finding-verdict@1',
    id: `${dimension}:${finding.id}`,
    title: finding.title,
    file: finding.file,
    severity: finding.severity,
    confidence: finding.confidence,
    evidence: finding.evidence,
    verdict: votes.length === 0 ? 'uncertain' : killed ? 'refuted' : 'upheld',
    refutations,
  }
})

const confirmed = verdicts.filter((v) => v.verdict === 'upheld')
const killed = verdicts.filter((v) => v.verdict === 'refuted')
log(`synthesis: ${confirmed.length} confirmed, ${killed.length} killed by adversarial verification, of ${verdicts.length} raw findings`)

return {
  contractVersion: 'finding-verdict@1',
  sourcePath,
  dimensions: DIMENSIONS.map((d) => d.key),
  rawFindingCount: verdicts.length,
  confirmed,
  killed,
}
