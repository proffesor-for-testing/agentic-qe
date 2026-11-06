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
 *     measured evidence) is not a success to learn from;
 *   - #1369/#1370: a test-generation result that generated no test (only
 *     scaffolds, or nothing testable) is not a success: learning from it
 *     recorded a success experience, pattern usage and a new test-template
 *     pattern for output that is not a test.
 *
 * Fail-closed: a coverage result without provenance is not learnable.
 */

const INSUFFICIENT = 'insufficient-evidence';

export function isLearnableResult(domain: string, data: unknown): boolean {
  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  if (record && (record.status === INSUFFICIENT || record.evidenceStatus === INSUFFICIENT)) return false;
  if (domain === 'coverage-analysis') return record?.measured === true;
  if (domain === 'test-generation' && record && 'testsGenerated' in record) {
    return typeof record.testsGenerated === 'number' && record.testsGenerated > 0;
  }
  return true;
}
