/**
 * URL policy for accessibility audits (#1465).
 *
 * Only http: and https: pages are audited. Local and private hosts are allowed
 * on purpose: auditing a local dev server is the main use case. Other schemes
 * (file:, javascript:, data:, ...) are a caller input error, never a result.
 */

import { CallerInputError } from '../../../shared/error-utils.js';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/** The reason `url` may not be audited, or null when it may. */
export function auditUrlProblem(url: unknown): string | null {
  if (typeof url !== 'string' || url.trim() === '') return 'url must be a non-empty http or https URL';
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return `url is not a valid absolute URL: ${JSON.stringify(url)}`;
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return `url scheme ${parsed.protocol} is not allowed; only http: and https: pages can be audited`;
  }
  return null;
}

/** Throws a CallerInputError when `url` may not be audited. */
export function assertAuditableUrl(url: unknown): asserts url is string {
  const problem = auditUrlProblem(url);
  if (problem) throw new CallerInputError(problem);
}
