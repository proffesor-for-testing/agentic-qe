# Security scan execution evidence

Security findings and execution completeness are separate results. A completed
scan may contain critical findings. An empty finding list may mean that no
analysis ran.

This implements the execution-truth portion of [#694](https://github.com/proffesor-for-testing/agentic-qe/issues/694).
It does not provide full SAST assurance, add a secret-scanning engine, or close
all of that issue's scope and reuse requirements.

## Receipt and counting semantics

`SASTResult.evidence` is additive and uses `schemaVersion: 1`. The production
SAST scanner supplies it. Consumers treat a legacy result without evidence as
unverified; they must not infer successful analysis from its finding count or
old coverage numbers.

- `requestedPaths` is captured before engine execution. Paths are normalized
  absolute paths and deduplicated lexically; symlink aliases are not resolved.
  `duplicateInputs` counts repeated normalized inputs.
- Each built-in file analysis records its disposition, SHA-256 of the exact
  bytes read when readable, `readLines`, and `analyzedLines`. Unsupported
  readable inputs have a digest and read count but zero analyzed lines.
- `coverage.filesScanned` and `linesScanned` count completed built-in JS/TS
  pattern analyses. `rulesApplied` counts unique selected rules actually
  evaluated, with `rulesAppliedScope: 'built-in-patterns'`. It is independent
  of the number of findings. Unknown requested rule-set IDs are rejected.
- Engines carry their requested/required flags, execution status, declared
  scope, known rule IDs/digest, errors, and limitations. Unknown external
  file membership and rule coverage remain unknown.
- `completeness: complete` means the **declared required scope** completed;
  `partial` retains completed work alongside gaps; `none` establishes no
  completed required file analysis. These values never mean a system is safe.

Line counts retain the existing `content.split('\n').length` convention.
The per-engine digest identifies bytes read, not an atomic repository snapshot:
files can change between discovery and reads, or between independent engines.

## Discovery and engine boundaries

CLI and comprehensive MCP scanning share the `aqe-security-source-files@1`
discovery policy. Directory scans select established source extensions, exclude
known dependency/build/private-state directories, and do not follow observed
symlinks. Direct file targets are retained so unsupported inputs are visible.
Missing/unreadable roots, unreadable subtrees, and file/depth limits have
separate discovery dispositions. A completely inventoried empty directory does
not imply any analysis executed. Limits default to 5,000 files and 64 levels.

The SAST domain runs its existing JavaScript/TypeScript patterns. Comprehensive
MCP scanning also runs its existing generic source-text patterns and optional
manifest-name advisories. Its `filesScanned` counts unique requested source
paths with a completed analysis; the nested `coverage` retains the narrower
built-in SAST counts. Generic patterns on Python or other source languages do
not establish language-specific SAST coverage. `deepAnalysisPerformed` now
requires a returned built-in SAST execution receipt; it is not a claim of
semantic completeness.

Semgrep remains optional (`required: false`). Its absence, process failure,
malformed output, partial errors, or clean completion are distinct. Valid
findings survive partial output. Semgrep still targets the common parent
directory and can return findings outside the requested file list; its receipt
makes that scope explicit and does not invent per-file/rule coverage. An
optional Semgrep failure does not invalidate completed required built-in
checks. Callers requiring Semgrep must inspect that engine's receipt.

## Consumer changes

- `aqe security` now actually runs SAST by default and passes `FilePath` values
  to the domain API. Incomplete, unavailable, failed, or unverified requested
  checks exit nonzero. Complete scans retain the existing severity codes:
  critical/high = 1, medium = 2, otherwise 0.
- CLI text, JSON, Markdown, and SARIF retain execution status. SARIF
  `executionSuccessful` describes execution, independently of findings. The
  CLI's existing `--dast` placeholder is explicitly not-run. Compliance checks
  preserve skipped/unverified/failed execution separately from violations.
- `security_scan_comprehensive` retains findings, execution receipts,
  discovery, scope limitations, and actual counts through the registered MCP
  path. Its result can be `partial`, `unavailable`, or `unverified` in addition
  to `completed`. Transport/task success does not mean scan completeness.
  `targetUrl` describes the DAST target; current receiptless DAST output remains
  unverified. Requested compliance that this task does not implement is
  explicitly not-run. Saved security reports also retain execution status.
- The exported TypeScript `SecurityAuditProtocol` no longer estimates a clean
  secret scan. It reports that implementation unavailable and blocks its
  deployment recommendation when requested checks are failed, incomplete, or
  unverified, including the protocol's placeholder compliance reports. Trigger
  scope is honored: pre-release requires secrets; dependency-update requests
  dependency scanning. This protocol is tested directly; the registered comprehensive
  MCP route uses a different task handler.

Security receipt errors use bounded codes/static explanations rather than raw
provider error text. Findings retain the existing source snippets; receipts
are not a redaction mechanism for findings or user-supplied paths/URLs.

## Remaining work in #694

This change does not add an atomic source snapshot, alias identity resolution,
per-file Semgrep execution proof, a mandatory-external-engine policy, or new
DAST/secret-scanner implementations. It does not add cross-run receipt reuse
or integration with a general release gate. The comprehensive MCP tool already
bypasses the session result cache; integration tests verify that changing a
file and repeating the same call returns a fresh digest and findings. That is
a freshness control, not a new cache invalidation mechanism.
