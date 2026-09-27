/**
 * Agentic QE v3 - Git ref validation
 *
 * Caller-supplied refs (MCP tool arguments, CLI flags) are passed to git as
 * positional argv entries. Even without a shell, a value beginning with "-"
 * is parsed by git as an option (e.g. `--output=<path>` makes `git diff`
 * create or truncate an arbitrary file), so refs must be validated at the
 * boundary before reaching git.
 */

const MAX_GIT_REF_LENGTH = 256;

// Whitespace and ASCII control characters are never valid in a revision.
// eslint-disable-next-line no-control-regex
const UNSAFE_REF_CHARS = /[\s\x00-\x1f\x7f]/;

/**
 * Returns an error message when `ref` is not a safe git revision argument,
 * or undefined when it is safe. Accepts ordinary revisions such as `main`,
 * `origin/main`, `HEAD~3`, `v1.2.0^{commit}` and commit SHAs.
 */
export function getGitRefError(ref: unknown, label = 'git ref'): string | undefined {
  if (typeof ref !== 'string' || ref.length === 0) {
    return `Invalid ${label}: must be a non-empty string`;
  }
  if (ref.length > MAX_GIT_REF_LENGTH) {
    return `Invalid ${label}: longer than ${MAX_GIT_REF_LENGTH} characters`;
  }
  if (ref.startsWith('-')) {
    return `Invalid ${label} "${ref}": must not start with "-"`;
  }
  if (UNSAFE_REF_CHARS.test(ref)) {
    return `Invalid ${label}: must not contain whitespace or control characters`;
  }
  return undefined;
}

/**
 * Throws when `ref` is not a safe git revision argument.
 */
export function assertSafeGitRef(ref: unknown, label = 'git ref'): asserts ref is string {
  const error = getGitRefError(ref, label);
  if (error) {
    throw new Error(error);
  }
}
