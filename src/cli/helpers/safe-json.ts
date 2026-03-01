/**
 * Secure JSON Parsing Utilities (Re-export)
 *
 * SEC-001: Prevents prototype pollution attacks via __proto__, constructor, prototype keys.
 *
 * This module re-exports from the canonical shared location.
 * Prefer importing from '../../shared/safe-json.js' in non-CLI code.
 */

export { safeJsonParse, parseJsonOption, parseJsonFile } from '../../shared/safe-json.js';
