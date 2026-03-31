/**
 * Lightweight test value generators — replaces @faker-js/faker in generators.
 *
 * These produce plausible string literals for generated test code.
 * They do NOT need cryptographic randomness or statistical distributions —
 * they only produce placeholder values embedded in source code output.
 */

import { randomBytes, randomInt, randomUUID } from 'node:crypto';

function randomHex(bytes: number): string {
  return randomBytes(bytes).toString('hex');
}

export const testValues = {
  uuid: (): string => randomUUID(),
  email: (): string => `user_${randomHex(3)}@example.com`,
  fullName: (): string => {
    const first = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank'];
    const last = ['Smith', 'Jones', 'Lee', 'Garcia', 'Chen', 'Novak'];
    return `${first[randomInt(first.length)]} ${last[randomInt(last.length)]}`;
  },
  url: (): string => `https://example.com/${randomHex(4)}`,
  recentDate: (): string => new Date(Date.now() - randomInt(7 * 86400000)).toISOString(),
  phone: (): string => `+1${String(randomInt(2000000000, 9999999999))}`,
  streetAddress: (): string => `${randomInt(1, 9999)} Main St`,
  word: (): string => {
    const words = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'];
    return words[randomInt(words.length)];
  },
  int: (min = 1, max = 100): number => {
    if (min > max) { const t = min; min = max; max = t; }
    return randomInt(min, max + 1);
  },
  float: (min = 0, max = 100, fractionDigits = 2): number => {
    if (min > max) { const t = min; min = max; max = t; }
    if (min === max) return min;
    const raw = min + (randomInt(0, 1_000_001) / 1_000_000) * (max - min);
    return Number(raw.toFixed(fractionDigits));
  },
};
