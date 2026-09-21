/** Evidence of executed security analysis; findings alone do not establish coverage. */
export type SecurityFileDisposition =
  | 'analyzed' | 'unsupported' | 'unreadable' | 'excluded'
  | 'failed' | 'unavailable' | 'not-run';

export interface SecurityFileEvidence {
  /** Normalized absolute path; normalization does not resolve symlinks. */
  readonly path: string;
  readonly engineId: string;
  readonly status: SecurityFileDisposition;
  /** SHA-256 of the exact source bytes read by this engine. */
  readonly sourceDigest?: string;
  readonly readLines: number;
  readonly analyzedLines: number;
  /** A bounded error code or static description; never source contents. */
  readonly reason?: string;
}

export interface SecurityEngineEvidence {
  readonly id: string;
  readonly requested: boolean;
  /** Whether this engine is required for the declared analysis scope. */
  readonly required: boolean;
  readonly status: 'completed' | 'partial' | 'failed' | 'unavailable' | 'disabled' | 'unverified' | 'not-run';
  readonly scope: 'requested-files' | 'parent-directory' | 'url';
  readonly target?: string;
  /** Only populated when input membership was actually established. */
  readonly analyzedFiles?: number;
  readonly ruleIds?: readonly string[];
  /** SHA-256 of selected rule definitions, when these are locally known. */
  readonly rulesetDigest?: string;
  readonly ruleCoverage: 'known' | 'unknown';
  readonly version?: string;
  readonly errors: readonly string[];
  readonly limitations: readonly string[];
}

export interface SecurityScanEvidence {
  readonly schemaVersion: 1;
  /** Completeness of required declared scope, not absence of vulnerabilities. */
  readonly completeness: 'complete' | 'partial' | 'none';
  /** Unique normalized absolute requested paths, without resolving symlinks. */
  readonly requestedFiles: number;
  readonly requestedPaths: readonly string[];
  readonly duplicateInputs: number;
  /** A path may have separate receipts for independently executed engines. */
  readonly files: readonly SecurityFileEvidence[];
  readonly engines: readonly SecurityEngineEvidence[];
  readonly limitations: readonly string[];
  /** Discovery describes the declared source-file policy, not every repository file. */
  readonly discovery?: SecurityDiscoveryEvidence;
}

export interface SecurityDiscoveryEvidence {
  readonly status: 'complete' | 'partial' | 'failed';
  readonly policy: 'aqe-security-source-files@1';
  readonly issues: readonly { readonly path: string; readonly reason: string }[];
  readonly excludedPaths: readonly string[];
}
