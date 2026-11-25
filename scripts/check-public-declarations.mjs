#!/usr/bin/env node
/**
 * Check that the published declarations type-check for a consumer (#1443).
 *
 * Our `.d.ts` files ship to every consumer. If one of them imports types from
 * a package the consumer cannot resolve types for (a devDependency, or a
 * runtime dependency whose types live in a devDependency `@types/*` package,
 * like better-sqlite3), the consumer gets TS7016/TS2307 with
 * `skipLibCheck: false` and a silent `any` with `skipLibCheck: true`.
 *
 * Usage:
 *   node scripts/check-public-declarations.mjs [distDir]
 *     Scan every emitted .d.ts for package imports whose types a consumer
 *     cannot resolve.
 *   node scripts/check-public-declarations.mjs --consumer <tarball>
 *     Install the packed tarball into a fresh project and run `tsc` with
 *     `skipLibCheck: false` over every `exports` entry that declares types.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILTINS = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));

/** `@scope/name/sub` -> `@scope/name`, `name/sub` -> `name`. */
export function packageNameOf(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** Module specifiers a declaration file imports (comments are ignored). */
export function declarationImports(text) {
  const info = ts.preProcessFile(text, true, true);
  return [
    ...info.importedFiles.map((ref) => ref.fileName),
    ...info.typeReferenceDirectives.map((ref) => ref.fileName),
  ];
}

/**
 * Does `name` ship type declarations a consumer gets by installing it?
 * Reads the package's own manifest from `nodeModulesDir`.
 */
export function shipsOwnTypes(name, nodeModulesDir) {
  const dir = path.join(nodeModulesDir, name);
  const manifestPath = path.join(dir, 'package.json');
  if (!fs.existsSync(manifestPath)) return false;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.types || manifest.typings) return true;
  if (manifest.exports && JSON.stringify(manifest.exports).includes('"types"')) return true;
  return fs.existsSync(path.join(dir, 'index.d.ts'));
}

/** `@types` package name for `name` (`@scope/x` -> `@types/scope__x`). */
export function typesPackageFor(name) {
  return `@types/${name.startsWith('@') ? name.slice(1).replace('/', '__') : name}`;
}

/**
 * Classify one package import from a declaration file. Returns null when a
 * consumer can resolve its types, otherwise a reason string.
 */
export function unresolvableReason(name, manifest, hasOwnTypes) {
  if (BUILTINS.has(name) || name === manifest.name) return null;
  const installed = {
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies,
  };
  if (!(name in installed)) {
    return manifest.devDependencies && name in manifest.devDependencies
      ? 'devDependency (not installed for consumers)'
      : 'not a dependency';
  }
  if (hasOwnTypes(name)) return null;
  const typesName = typesPackageFor(name);
  if (manifest.dependencies && typesName in manifest.dependencies) return null;
  return `ships no types and ${typesName} is not a dependency`;
}

function listDeclarations(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listDeclarations(full));
    else if (entry.name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/** Every package import in `distDir` whose types a consumer cannot resolve. */
export function findUnresolvableDeclarationImports(distDir, manifest, nodeModulesDir) {
  const ownTypes = new Map();
  const hasOwnTypes = (name) => {
    if (!ownTypes.has(name)) ownTypes.set(name, shipsOwnTypes(name, nodeModulesDir));
    return ownTypes.get(name);
  };
  const findings = [];
  for (const file of listDeclarations(distDir)) {
    for (const specifier of declarationImports(fs.readFileSync(file, 'utf8'))) {
      if (specifier.startsWith('.') || path.isAbsolute(specifier)) continue;
      const name = packageNameOf(specifier);
      const reason = unresolvableReason(name, manifest, hasOwnTypes);
      if (reason) findings.push({ file: path.relative(distDir, file), specifier, reason });
    }
  }
  return findings;
}

/** Subpaths of `exports` that declare types (`.` -> `agentic-qe`). */
export function typedExportSpecifiers(manifest) {
  return Object.entries(manifest.exports ?? {})
    .filter(([, target]) => target && typeof target === 'object' && 'types' in target)
    .map(([subpath]) => (subpath === '.' ? manifest.name : `${manifest.name}/${subpath.slice(2)}`));
}

function runConsumerCheck(tarball, manifest) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-public-dts-'));
  const tsVersion = require('typescript/package.json').version;
  const nodeTypesMajor = require('@types/node/package.json').version.split('.')[0];
  fs.writeFileSync(path.join(project, 'package.json'),
    JSON.stringify({ name: 'dts-consumer', version: '0.0.0', private: true, type: 'module' }));
  const specifiers = typedExportSpecifiers(manifest);
  fs.writeFileSync(path.join(project, 'index.ts'),
    specifiers.map((spec, i) => `export * as entry${i} from '${spec}';`).join('\n') + '\n');
  fs.writeFileSync(path.join(project, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      module: 'nodenext', moduleResolution: 'nodenext', target: 'es2022', strict: true,
      skipLibCheck: false, noEmit: true, types: ['node'],
    },
    files: ['index.ts'],
  }));
  console.log(`Consumer project: ${project}`);
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts',
    path.resolve(tarball), `typescript@${tsVersion}`, `@types/node@${nodeTypesMajor}`],
  { cwd: project, stdio: 'inherit', timeout: 600000 });
  const tsc = path.join(project, 'node_modules', 'typescript', 'bin', 'tsc');
  try {
    execFileSync(process.execPath, [tsc, '-p', '.'], { cwd: project, stdio: 'inherit', timeout: 600000 });
  } catch {
    console.error(`::error::Published declarations fail to type-check for a consumer with skipLibCheck: false (${specifiers.length} entry points).`);
    return 1;
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
  console.log(`Consumer tsc clean with skipLibCheck: false across ${specifiers.length} entry points.`);
  return 0;
}

function main(argv) {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  if (argv[0] === '--consumer') {
    if (!argv[1]) throw new Error('Usage: check-public-declarations.mjs --consumer <tarball>');
    return runConsumerCheck(argv[1], manifest);
  }
  const distDir = path.resolve(argv[0] ?? path.join(ROOT, 'dist'));
  if (!fs.existsSync(distDir)) throw new Error(`${distDir} does not exist; run npm run build first`);
  const findings = findUnresolvableDeclarationImports(distDir, manifest, path.join(ROOT, 'node_modules'));
  for (const f of findings) console.error(`::error file=dist/${f.file}::imports '${f.specifier}': ${f.reason}`);
  if (findings.length > 0) {
    console.error(`${findings.length} declaration import(s) a consumer cannot resolve types for. ` +
      'Use an AQE-owned interface instead (see src/shared/sqlite-types.ts).');
    return 1;
  }
  console.log('All package imports in published declarations resolve for consumers.');
  return 0;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
