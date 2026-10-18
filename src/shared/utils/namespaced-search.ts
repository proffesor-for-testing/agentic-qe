/**
 * Agentic QE v3 - namespaced kv key scans (#1049, #1071)
 *
 * Two problems with reading every key of a family through
 * `MemoryBackend.search()`:
 *
 * 1. Kernel backends disagree on what a namespaced `search` returns: the
 *    hybrid (sqlite) backend returns bare keys, the in-memory backend returns
 *    `<namespace>:<key>`. A caller that passes a result straight back to
 *    `get(key, { namespace })` double-prefixes the key and reads nothing.
 * 2. `search()` takes a row limit and has no offset or ordering, so a single
 *    call with a fixed cap silently drops every key past the cap.
 *
 * `searchAllKeys` addresses both: it returns every matching key, bare and in
 * a stable order.
 */

import type { MemoryBackend, RetrieveOptions } from '../../kernel/interfaces.js';

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

/** First request size for `searchAllKeys`. Each further request doubles it. */
export const DEFAULT_KEY_SCAN_PAGE_SIZE = 10_000;

export interface SearchAllKeysOptions {
  /** Namespace for the scan. Omit for the backend default. */
  retrieve?: RetrieveOptions;
  /** First request size (tests). Defaults to `DEFAULT_KEY_SCAN_PAGE_SIZE`. */
  pageSize?: number;
}

/**
 * Most `search()` requests one scan may make (#1106). The limit doubles each
 * time, so this covers more keys than any store holds (2^31 x the first page)
 * while still guaranteeing the loop ends for a backend that never returns a
 * short page.
 */
export const MAX_KEY_SCAN_REQUESTS = 32;

/**
 * Every key matching `pattern`, bare (usable with `get(key, retrieve)`),
 * de-duplicated and sorted.
 *
 * `search()` has no offset, so this widens the request until the backend
 * returns fewer keys than were asked for. That is the only point at which the
 * result is known to be complete; no cap ever truncates it.
 *
 * #1106: a backend that always returns at least `limit` keys (for example
 * one that pads or repeats results) never gives a short page. After
 * MAX_KEY_SCAN_REQUESTS this throws instead of looping forever or returning a
 * list that may be incomplete, because callers select patterns to archive
 * from it. A backend that ignores `limit` and returns every key still ends:
 * the limit doubles past the key count.
 */
export async function searchAllKeys(
  memory: MemoryBackend,
  pattern: string,
  options: SearchAllKeysOptions = {},
): Promise<string[]> {
  let limit = Math.max(1, Math.floor(options.pageSize ?? DEFAULT_KEY_SCAN_PAGE_SIZE));
  let found = await memory.search(pattern, limit, options.retrieve);
  for (let requests = 1; found.length >= limit; requests++) {
    if (requests >= MAX_KEY_SCAN_REQUESTS) {
      throw new Error(
        `searchAllKeys('${pattern}'): the backend never returned a short page after ${requests} requests ` +
        `(last limit ${limit}); refusing to return a possibly incomplete key list`
      );
    }
    limit *= 2;
    found = await memory.search(pattern, limit, options.retrieve);
  }
  const namespace = options.retrieve?.namespace;
  const keys = namespace ? found.map((key) => bareSearchKey(key, namespace, pattern)) : found;
  return [...new Set(keys)].sort();
}
