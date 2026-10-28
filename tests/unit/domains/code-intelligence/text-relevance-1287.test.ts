/**
 * #1287: relevance used to order text matches that have the same score.
 */

import { describe, it, expect } from 'vitest';
import {
  compareTextRelevance,
  identifierWords,
  textRelevance,
} from '../../../../src/domains/code-intelligence/services/text-relevance';

describe('identifierWords', () => {
  it.each([
    ['processOrder', ['process', 'order']],
    ['ProcessOrder', ['process', 'order']],
    ['process_order', ['process', 'order']],
    ['PROCESS_ORDER', ['process', 'order']],
    ['parseHTTPRequest', ['parse', 'http', 'request']],
    ['stepHandler07', ['step', 'handler07']],
  ])('splits %s', (identifier, words) => {
    expect(identifierWords(identifier)).toEqual(words);
  });
});

describe('textRelevance', () => {
  it('rates an identifier made of exactly the query words highest', () => {
    expect(textRelevance('process order', 'export function processOrder(order) {}').adjacency).toBe(2);
    expect(textRelevance('process order', 'def process_order(order):').adjacency).toBe(2);
    expect(textRelevance('processOrder', 'export function processOrder(order) {}').adjacency).toBe(2);
  });

  it('rates adjacent query words above scattered ones', () => {
    expect(textRelevance('process order', '// process order quickly').adjacency).toBe(1);
    expect(textRelevance('process order', 'processOrderItems(items)').adjacency).toBe(1);
    expect(textRelevance('process order', '// process the order').adjacency).toBe(0);
    expect(textRelevance('process order', '// order processing step').adjacency).toBe(0);
  });

  it('gives single-word queries no adjacency', () => {
    expect(textRelevance('login', 'login()').adjacency).toBe(0);
  });

  it('counts whole-word matches, not words that only contain a query word', () => {
    expect(textRelevance('process order', '// order processing').exactWords).toBe(0.5);
    expect(textRelevance('process order', '// process the order').exactWords).toBe(1);
    expect(textRelevance('login', 'loginWithPassword()').exactWords).toBe(1);
    expect(textRelevance('login', 'relogin()').exactWords).toBe(0);
  });

  it('counts the words that contain a query word', () => {
    expect(textRelevance('order', 'order.id, order.items, reorder(orders)').occurrences).toBe(4);
    expect(textRelevance('order', 'nothing here').occurrences).toBe(0);
  });
});

describe('compareTextRelevance', () => {
  const rank = (query: string, files: Record<string, string>) =>
    Object.entries(files)
      .map(([file, content]) => ({ file, relevance: textRelevance(query, content) }))
      .sort((a, b) => compareTextRelevance(a.relevance, b.relevance))
      .map((entry) => entry.file);

  it('orders identifier > adjacent > exact scattered > partial', () => {
    expect(rank('process order', {
      partial: '// order processing step; order.items; order.id; order.total',
      scattered: '// process the order',
      adjacent: '// process order now',
      identifier: 'export function processOrder(order) {}',
    })).toEqual(['identifier', 'adjacent', 'scattered', 'partial']);
  });

  it('puts more occurrences first when everything else ties', () => {
    expect(rank('order', {
      once: 'const order = 1;',
      thrice: 'order(order.id, order.items)',
    })).toEqual(['thrice', 'once']);
  });
});
