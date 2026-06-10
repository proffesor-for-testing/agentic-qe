#!/usr/bin/env node
/**
 * ADR-103 — Publish the verdict JSON Schemas from the compiled contracts
 * module to schemas/*.schema.json. The TypeScript validators in
 * src/contracts/verdicts.ts are the source of truth; run this after
 * changing them (requires a prior `npx tsc` emit).
 *
 * Usage: node scripts/generate-verdict-schemas.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { VERDICT_SCHEMAS } = await import(join(root, 'dist', 'contracts', 'verdicts.js'));

const outDir = join(root, 'schemas');
mkdirSync(outDir, { recursive: true });

for (const [name, schema] of Object.entries(VERDICT_SCHEMAS)) {
  const file = join(outDir, `${name}.schema.json`);
  writeFileSync(file, JSON.stringify(schema, null, 2) + '\n');
  console.log(`wrote ${file}`);
}
