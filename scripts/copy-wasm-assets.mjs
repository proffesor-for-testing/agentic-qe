#!/usr/bin/env node

/**
 * Copy the Agent Booster WASM runtime files into dist/ (#1241).
 *
 * tsc emits only index.js for src/integrations/agent-booster-wasm/. The
 * wasm-bindgen glue (CommonJS, reads the .wasm via __dirname) and the binary
 * have to sit next to each other in the published package, together with the
 * directory's own package.json so Node treats the glue as CommonJS under the
 * root "type": "module".
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'src', 'integrations', 'agent-booster-wasm');
const outDir = path.join(root, 'dist', 'integrations', 'agent-booster-wasm');
const FILES = ['agent_booster_wasm.js', 'agent_booster_wasm_bg.wasm', 'package.json'];

fs.mkdirSync(outDir, { recursive: true });
for (const name of FILES) {
  fs.copyFileSync(path.join(srcDir, name), path.join(outDir, name));
}
console.log(`Copied Agent Booster WASM runtime (${FILES.join(', ')}) to ${path.relative(root, outDir)}`);
