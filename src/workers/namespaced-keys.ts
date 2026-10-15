/**
 * Agentic QE v3 - namespaced search keys (#1049)
 *
 * Kernel memory backends disagree on what a namespaced `search` returns: the
 * hybrid (sqlite) backend returns bare keys, the in-memory backend returns
 * `<namespace>:<key>`. A worker that passes a search result straight back to
 * `get(key, { namespace })` then double-prefixes the key and reads nothing.
 */

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 's');
}

/**
 * The bare key for a key returned by `search(pattern, limit, { namespace })`.
 * A result that already matches `pattern` is bare (keys may legitimately start
 * with the namespace name, e.g. `defect-intelligence:predictor:…`); otherwise a
 * leading `<namespace>:` is the backend's prefix and is removed.
 */
export function bareSearchKey(found: string, namespace: string, pattern: string): string {
  if (globToRegExp(pattern).test(found)) return found;
  return found.startsWith(`${namespace}:`) ? found.slice(namespace.length + 1) : found;
}
