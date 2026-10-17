/**
 * Agentic QE v3 - namespaced search keys (#1049)
 *
 * Kernel memory backends disagree on what a namespaced `search` returns: the
 * hybrid (sqlite) backend returns bare keys, the in-memory backend returns
 * `<namespace>:<key>`. A worker that passes a search result straight back to
 * `get(key, { namespace })` then double-prefixes the key and reads nothing.
 *
 * The helper lives in `shared/utils/namespaced-search` so domain services can
 * use it too (#1071); it is re-exported here for the workers.
 */

export { bareSearchKey } from '../shared/utils/namespaced-search.js';
