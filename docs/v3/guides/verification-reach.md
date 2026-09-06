# Verification Reach Manifests

AQE quality gates separate two questions:

1. Did the artifact satisfy the mechanical and specification checks?
2. Could the supplied evidence directly observe every material failure mode?

An overall `pass` requires both `qualityVerdict: "pass"` and
`coverageVerdict: "pass"`. Requests made without a reach manifest remain
supported during migration, but return `verification.kind: "legacy-unknown"`,
`coverageVerdict: "inconclusive"`, and cannot produce an overall pass.

## Create a manifest

Use the exported helpers so the artifact bytes and manifest content are hashed
canonically:

```ts
import {
  computeVerificationArtifactDigest,
  createVerificationReachManifest,
} from 'agentic-qe';

const artifact = await readArtifact();
const target = {
  revision: process.env.GITHUB_SHA!,
  digest: computeVerificationArtifactDigest(artifact),
  environment: 'github-actions/ubuntu-24.04',
};

const manifest = createVerificationReachManifest({
  id: 'release-reach-v1',
  systemUnderTest: 'my-service',
  artifact: target,
  generatedAt: new Date().toISOString(),
  risks: [{
    riskId: 'service-does-not-start',
    failureMode: 'the service cannot accept requests after deployment',
    severity: 'critical',
    requiredOracle: 'health-response-oracle-v1',
    requiredObservations: ['runtime'],
    dispositionWhenUncovered: 'fail',
    checks: [{
      checkId: 'boot-probe',
      channel: 'runtime',
      reach: 'direct',
      evidenceClass: 'EXECUTED',
      executionStatus: 'passed',
      target,
      oracleRef: 'health-response-oracle-v1',
      observedAt: new Date().toISOString(),
      limitations: ['does not exercise concurrent writes'],
    }],
  }],
});
```

Pass the serialized manifest to the CLI with
`--verification-manifest reach.json`, or provide the same object as
`verificationManifest` to the `qe/quality/gate` MCP tool.

## Reach rules

- Only fresh `EXECUTED` evidence with `reach: "direct"`, a passing execution,
  the exact target, the required observation channel, and the required oracle
  can cover a failure mode.
- `partial` and `none` reach remain visible in results but do not count as
  direct coverage.
- Static evidence cannot establish runtime behavior. Browser evidence cannot
  establish API, telemetry, concurrency, or hardware behavior unless those
  channels have their own directly applicable checks.
- Failed checks fail the affected risk. Missing, stale, future-dated,
  unavailable, wrong-target, or inferred evidence follows the risk's configured
  `fail`, `inconclusive`, or `human-review` disposition.
- The manifest hash binds the target, risks, checks, timestamps, limitations,
  and costs. Changing any bound field invalidates the manifest.

Text output lists direct checks, partial checks, and uncovered channels for each
risk. JSON output retains the complete manifest evaluation for automation and
audit.
