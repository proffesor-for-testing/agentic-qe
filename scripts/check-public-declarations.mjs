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

/**
 * Module specifiers a declaration file imports: import/export declarations,
 * `import('x')` types, `import x = require('x')` and `/// <reference types>`.
 * Comments are ignored, and so is the name in `declare module 'x' {}`: that
 * declares or augments a module rather than importing it (imports inside the
 * block are still collected).
 */
export function declarationImports(text) {
  const source = ts.createSourceFile('x.d.ts', text, ts.ScriptTarget.Latest, false);
  const found = source.typeReferenceDirectives.map((ref) => ref.fileName);
  const add = (node) => {
    if (node && ts.isStringLiteralLike(node)) found.push(node.text);
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(node.moduleSpecifier);
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node.moduleReference.expression);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) add(node.argument.literal);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Does a `#subpath` specifier match a key of the package's `imports` field? */
export function matchesImportsField(specifier, imports) {
  return Object.keys(imports ?? {}).some((key) => {
    const star = key.indexOf('*');
    if (star === -1) return key === specifier;
    return specifier.startsWith(key.slice(0, star)) && specifier.endsWith(key.slice(star + 1))
      && specifier.length >= key.length - 1;
  });
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

/** Reasons that only matter when a typed export can reach the import. */
export const OPTIONAL_REASONS = new Set([
  'optional dependency (not guaranteed installed)',
  'optional peer dependency (not guaranteed installed)',
]);

/**
 * Classify one non-relative import from a declaration file. Returns null when
 * a consumer can resolve its types, otherwise a reason string.
 */
export function unresolvableReason(specifier, manifest, hasOwnTypes) {
  if (specifier.startsWith('#')) {
    return matchesImportsField(specifier, manifest.imports) ? null : 'no matching package.json "imports" entry';
  }
  const name = packageNameOf(specifier);
  if (BUILTINS.has(name) || name === manifest.name) return null;
  if (manifest.optionalDependencies && name in manifest.optionalDependencies) {
    return 'optional dependency (not guaranteed installed)';
  }
  const peers = manifest.peerDependencies ?? {};
  if (name in peers && manifest.peerDependenciesMeta?.[name]?.optional) {
    return 'optional peer dependency (not guaranteed installed)';
  }
  if (!(name in (manifest.dependencies ?? {})) && !(name in peers)) {
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

/** The .d.ts file a relative specifier in `fromFile` points at, if any. */
function resolveDeclaration(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const stem = base.replace(/\.(m|c)?js$/, '');
  const candidates = [`${stem}.d.ts`, base.endsWith('.d.ts') ? base : null, `${base}.d.ts`,
    path.join(base, 'index.d.ts')].filter(Boolean);
  return candidates.find((file) => fs.existsSync(file) && fs.statSync(file).isFile());
}

/** Declaration entry files named by `types` and every `exports[*].types`. */
export function typedEntryFiles(packageRoot, manifest) {
  const targets = [manifest.types, manifest.typings,
    ...Object.values(manifest.exports ?? {}).map((t) => (t && typeof t === 'object' ? t.types : null))];
  return [...new Set(targets.filter((t) => typeof t === 'string').map((t) => path.resolve(packageRoot, t)))]
    .filter((file) => fs.existsSync(file));
}

/** Declaration files a consumer's `tsc` loads from the typed entry points. */
export function reachableDeclarations(entryFiles) {
  const seen = new Set();
  const queue = [...entryFiles];
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of declarationImports(fs.readFileSync(file, 'utf8'))) {
      if (!specifier.startsWith('.')) continue;
      const target = resolveDeclaration(file, specifier);
      if (target && !seen.has(target)) queue.push(target);
    }
  }
  return seen;
}

/**
 * Every non-relative import in `distDir` whose types a consumer cannot
 * resolve. Severity is `error`, except an optional (peer) dependency in a file
 * no typed export reaches, which is a `warning`. `packageRoot` (default: the
 * parent of `distDir`) is where `types`/`exports` paths resolve.
 */
export function findUnresolvableDeclarationImports(distDir, manifest, nodeModulesDir,
  packageRoot = path.dirname(distDir)) {
  const ownTypes = new Map();
  const hasOwnTypes = (name) => {
    if (!ownTypes.has(name)) ownTypes.set(name, shipsOwnTypes(name, nodeModulesDir));
    return ownTypes.get(name);
  };
  const reachable = reachableDeclarations(typedEntryFiles(packageRoot, manifest));
  const findings = [];
  for (const file of listDeclarations(distDir)) {
    for (const specifier of declarationImports(fs.readFileSync(file, 'utf8'))) {
      if (specifier.startsWith('.') || path.isAbsolute(specifier)) continue;
      const reason = unresolvableReason(specifier, manifest, hasOwnTypes);
      if (!reason) continue;
      const isReachable = reachable.has(file);
      const severity = OPTIONAL_REASONS.has(reason) && !isReachable ? 'warning' : 'error';
      findings.push({ file: path.relative(distDir, file), path: file, specifier, reason, severity,
        reachable: isReachable });
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
  for (const f of findings) {
    const where = path.relative(process.cwd(), f.path).split(path.sep).join('/');
    const scope = f.reachable ? 'reachable from a typed export' : 'not reachable from a typed export';
    console.error(`::${f.severity} file=${where}::imports '${f.specifier}': ${f.reason} (${scope})`);
  }
  const errors = findings.filter((f) => f.severity === 'error');
  if (errors.length > 0) {
    console.error(`${errors.length} declaration import(s) a consumer cannot resolve types for. ` +
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
