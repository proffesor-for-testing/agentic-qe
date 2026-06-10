/**
 * Agentic QE v3 - Operator Mutator for qe-arena (ADR-104)
 *
 * Generates first-order operator mutants from JavaScript source text:
 * comparison flips, boundary shifts, arithmetic swaps, logical swaps.
 * String literals, template literals, comments, and arrow tokens are
 * excluded so mutants change behavior, not error messages. Enumeration
 * order is deterministic (position-sorted), so seeded sampling over the
 * mutant list is reproducible.
 */

export interface Mutant {
  id: string;
  /** Byte offset in the source file */
  index: number;
  from: string;
  to: string;
  line: number;
}

/** Longest-first so '<=' is claimed before '<', '===' before '==' etc. */
const OPERATOR_SUBSTITUTIONS: Array<[from: string, to: string]> = [
  ['===', '!=='],
  ['!==', '==='],
  ['<=', '<'],
  ['>=', '>'],
  ['&&', '||'],
  ['||', '&&'],
  ['<', '<='],
  ['>', '>='],
  ['+', '-'],
  ['*', '+'],
];

/**
 * Mark every index that sits inside a string literal, template literal,
 * or comment — operators there must not be mutated.
 */
function excludedRanges(source: string): boolean[] {
  const excluded = new Array<boolean>(source.length).fill(false);
  let i = 0;
  let mode: 'code' | 'single' | 'double' | 'template' | 'line-comment' | 'block-comment' = 'code';
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (mode === 'code') {
      if (c === "'") mode = 'single';
      else if (c === '"') mode = 'double';
      else if (c === '`') mode = 'template';
      else if (c === '/' && next === '/') mode = 'line-comment';
      else if (c === '/' && next === '*') mode = 'block-comment';
      if (mode !== 'code') excluded[i] = true;
    } else {
      excluded[i] = true;
      if (mode === 'single' && c === "'" && source[i - 1] !== '\\') mode = 'code';
      else if (mode === 'double' && c === '"' && source[i - 1] !== '\\') mode = 'code';
      else if (mode === 'template' && c === '`' && source[i - 1] !== '\\') mode = 'code';
      else if (mode === 'line-comment' && c === '\n') mode = 'code';
      else if (mode === 'block-comment' && c === '*' && next === '/') {
        excluded[i + 1] = true;
        i++;
        mode = 'code';
      }
    }
    i++;
  }
  return excluded;
}

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

/** Enumerate all first-order mutants of a source text, position-sorted. */
export function enumerateMutants(source: string, fileLabel: string): Mutant[] {
  const excluded = excludedRanges(source);
  const claimed = new Array<boolean>(source.length).fill(false);
  const mutants: Mutant[] = [];

  for (const [from, to] of OPERATOR_SUBSTITUTIONS) {
    let pos = source.indexOf(from);
    while (pos !== -1) {
      const end = pos + from.length;
      const overlapsClaim = claimed.slice(pos, end).some(Boolean);
      const overlapsExcluded = excluded.slice(pos, end).some(Boolean);
      // '=>' protection: never mutate the '>' of an arrow; '>=' handled by ordering
      const isArrow = from === '>' && source[pos - 1] === '=';
      // avoid '<=' / '>=' double-claim from the 1-char pass
      const widerLeft = (from === '<' || from === '>') && (source[end] === '=' || source[pos - 1] === '<' || source[pos - 1] === '>');
      if (!overlapsClaim && !overlapsExcluded && !isArrow && !widerLeft) {
        for (let i = pos; i < end; i++) claimed[i] = true;
        mutants.push({
          id: `${fileLabel}:${lineOf(source, pos)}:${pos}:${from}->${to}`,
          index: pos,
          from,
          to,
          line: lineOf(source, pos),
        });
      }
      pos = source.indexOf(from, pos + 1);
    }
  }

  return mutants.sort((a, b) => a.index - b.index);
}

/** Apply one mutant to the source text. */
export function applyMutant(source: string, mutant: Mutant): string {
  return source.slice(0, mutant.index) + mutant.to + source.slice(mutant.index + mutant.from.length);
}
