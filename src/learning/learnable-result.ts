/**
 * Agentic QE v3 - Which tool results may become learning (#1014)
 *
 * A tool run that produced no evidence must not be learned from as if it did:
 *
 *   - coverage-analysis results are learnable only when they are MEASURED
 *     (`measured === true`). A static estimate or an UNMEASURED target is a
 *     hypothesis / an absence — learning from it records invented coverage in
 *     coverage_sessions, captured experiences and pattern-usage success;
 *   - any result whose status is `insufficient-evidence` (quality gate without
 *     measured evidence) is not a success to learn from.
 *
 * Fail-closed: a coverage result without provenance is not learnable.
 */

const INSUFFICIENT = 'insufficient-evidence';

export function isLearnableResult(domain: string, data: unknown): boolean {
  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  if (record && (record.status === INSUFFICIENT || record.evidenceStatus === INSUFFICIENT)) return false;
  if (domain === 'coverage-analysis') return record?.measured === true;
  return true;
}
