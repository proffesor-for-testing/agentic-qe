/**
 * Agentic QE v3 - Text match relevance (#1287)
 *
 * Text matching scores a file by the share of query words it contains, so
 * every file containing all of them scores 1.0. This ranks those ties by how
 * well the file matches the query, without changing the score itself.
 */

/** How well one file's text matches a query. Higher fields rank first, in this order. */
export interface TextRelevance {
  /**
   * 2: an identifier is exactly the query words (`processOrder`, `process_order`
   * for "process order"); 1: the query words appear next to each other
   * (`process the order` does not, `process order` and `processOrderItems` do);
   * 0: scattered, or the query is a single word.
   */
  adjacency: number;
  /** Share of query words found as a whole word (`order`), not only inside one (`orders`, `reorder`). */
  exactWords: number;
  /** Number of words in the file that contain a query word. */
  occurrences: number;
}

/** Splits an identifier into lowercase words: `processOrder`, `process_order`, `PROCESS_ORDER` → process, order. */
export function identifierWords(identifier: string): string[] {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.toLowerCase());
}

function identifiers(text: string): string[] {
  return text.split(/[^\w]+/).filter((token) => token.length > 0);
}

/** Whether `words` appears in `stream` as consecutive entries. */
function containsRun(stream: string[], words: string[]): boolean {
  outer: for (let i = 0; i + words.length <= stream.length; i++) {
    for (let j = 0; j < words.length; j++) {
      if (stream[i + j] !== words[j]) continue outer;
    }
    return true;
  }
  return false;
}

/**
 * Relevance of `content` to `query`. Words are compared case-insensitively,
 * and identifiers are split into words, so the query `process order` matches
 * the identifier `processOrder` as adjacent whole words.
 */
export function textRelevance(query: string, content: string): TextRelevance {
  const queryWords = identifiers(query).flatMap(identifierWords);
  const contentIdentifiers = identifiers(content);
  const lowerIdentifiers = contentIdentifiers.map((token) => token.toLowerCase());
  const splitIdentifiers = contentIdentifiers.map(identifierWords);
  const contentWords = new Set([...lowerIdentifiers, ...splitIdentifiers.flat()]);
  const queryTokens = identifiers(query.toLowerCase());

  let adjacency = 0;
  if (queryWords.length > 1) {
    const phrase = queryWords.join(' ');
    if (splitIdentifiers.some((words) => words.join(' ') === phrase)) adjacency = 2;
    else if (containsRun(splitIdentifiers.flat(), queryWords)) adjacency = 1;
  }

  return {
    adjacency,
    exactWords: queryWords.length === 0
      ? 0
      : queryWords.filter((word) => contentWords.has(word)).length / queryWords.length,
    occurrences: lowerIdentifiers.filter((token) => queryTokens.some((qt) => token.includes(qt))).length,
  };
}

/** Sort comparator: more relevant first. */
export function compareTextRelevance(a: TextRelevance, b: TextRelevance): number {
  return b.adjacency - a.adjacency || b.exactWords - a.exactWords || b.occurrences - a.occurrences;
}
