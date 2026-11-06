/**
 * #1371: does a generated test reference the module under test, in the import
 * forms its language actually uses?
 *
 * The gate used to look only for quoted JS specifiers whose last segment is
 * the source file's basename. That rejected valid tests:
 * - Python `from src.calc import add` / `import src.calc as calc` (unquoted);
 * - Go tests in the source's own package (`package calc`, no import);
 * - Java/Kotlin tests in the source's package (no import needed);
 * - TS `paths` aliases (`@math`) and directory-index imports (`../src/utils`
 *   for utils/index.ts).
 *
 * Verdicts:
 * - 'found': the test references the source;
 * - 'missing': it plainly does not (the gate reports no-source-import);
 * - 'unjudged': the gate cannot tell for this language or without the
 *   source text (C#, Rust, Swift, ...), so it reports nothing.
 */
import * as path from 'path';
import ts from 'typescript';
import { findProjectRoot } from '../../../kernel/project-root.js';
import { isJavaScriptFamily } from './test-substance.js';

export type SourceImportVerdict = 'found' | 'missing' | 'unjudged';

export interface SourceImportSubject {
  /** The file the test was generated from, with its real extension (selects the language). */
  sourceFilePath: string;
  /** The module path the test should import when it differs (inline sourceCode's logical path). */
  importTarget?: string;
  /** The source text, when it was readable. */
  sourceCode?: string;
}

const JS_EXT = /\.(?:d\.)?(?:tsx?|jsx?|mjs|cjs|mts|cts)$/i;

const stripSlashComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const stripHashComments = (code: string) =>
  code.replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, '').replace(/#[^\n]*/g, '');

function lastSegment(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop() ?? '';
}

// ---------------------------------------------------------------------------
// JavaScript / TypeScript
// ---------------------------------------------------------------------------

/** Every module specifier: import/export ... from, side-effect import, import(), require(), vi/jest.mock(). */
function jsSpecifiers(testCode: string): string[] {
  const specs: string[] = [];
  const patterns = [
    /\b(?:import|export)\s[^'";]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) for (const m of testCode.matchAll(re)) specs.push(m[1]);
  return specs;
}

interface TsPaths { baseDir: string; paths: Record<string, string[]> }

/** No file enumeration: only compilerOptions are needed, not the program's files. */
const OPTIONS_ONLY_HOST: ts.ParseConfigHost = {
  ...ts.sys,
  readDirectory: () => [],
};

/**
 * compilerOptions.paths from the project's tsconfig.json, following `extends`
 * the way tsc does (comments allowed).
 */
function readTsPaths(root: string): TsPaths | undefined {
  const configPath = path.join(root, 'tsconfig.json');
  if (!ts.sys.fileExists(configPath)) return undefined;
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error || !read.config) return undefined;
  const { options } = ts.parseJsonConfigFileContent(read.config, OPTIONS_ONLY_HOST, root, undefined, configPath);
  if (!options.paths) return undefined;
  // tsc resolves `paths` against baseUrl, else against the config that declared them.
  const baseDir = options.baseUrl ?? (options as { pathsBasePath?: string }).pathsBasePath ?? root;
  return { baseDir: path.resolve(root, baseDir), paths: options.paths };
}

/** The files an aliased specifier can resolve to, extension-less. */
function aliasTargets(spec: string, tsPaths: TsPaths): string[] {
  const out: string[] = [];
  for (const [pattern, targets] of Object.entries(tsPaths.paths)) {
    const star = pattern.indexOf('*');
    let captured: string | undefined;
    if (star < 0) captured = pattern === spec ? '' : undefined;
    else if (spec.startsWith(pattern.slice(0, star)) && spec.endsWith(pattern.slice(star + 1))
      && spec.length >= pattern.length - 1) {
      captured = spec.slice(star, spec.length - (pattern.length - star - 1));
    }
    if (captured === undefined) continue;
    for (const target of targets) {
      out.push(path.resolve(tsPaths.baseDir, target.replace('*', captured)).replace(JS_EXT, ''));
    }
  }
  return out;
}

function javascriptVerdict(testCode: string, subject: SourceImportSubject): SourceImportVerdict {
  const root = path.resolve(findProjectRoot());
  const target = subject.importTarget || subject.sourceFilePath;
  const sourceNoExt = path.resolve(root, target).replace(JS_EXT, '');
  const baseName = lastSegment(sourceNoExt);
  const isIndex = baseName === 'index';
  const dirName = lastSegment(path.dirname(sourceNoExt));
  const tsPaths = readTsPaths(root);

  const matches = (spec: string): boolean => {
    const clean = spec.replace(/[?#].*$/, '').replace(JS_EXT, '').replace(/\/index$/, '');
    const last = lastSegment(clean);
    // `./math`, `./math.js`, `../src/math`; `../utils/index` or `../utils` for utils/index.ts.
    if (!isIndex && last === baseName) return true;
    if (isIndex && last === dirName) return true;
    // A tsconfig `paths` alias that resolves to the source (`@math`, `~/lib/math`).
    if (tsPaths && !spec.startsWith('.') && !path.isAbsolute(spec)) {
      return aliasTargets(spec, tsPaths).some(t => t === sourceNoExt || (isIndex && t === path.dirname(sourceNoExt)));
    }
    return false;
  };
  return jsSpecifiers(stripSlashComments(testCode)).some(matches) ? 'found' : 'missing';
}

// ---------------------------------------------------------------------------
// Python
// ---------------------------------------------------------------------------

/** Dotted module names a test imports, plus `from pkg import name` names. */
function pythonImports(testCode: string): { modules: string[]; fromNames: string[] } {
  const code = stripHashComments(testCode);
  const modules: string[] = [];
  const fromNames: string[] = [];
  for (const m of code.matchAll(/^\s*from\s+([.\w]+)\s+import\s+(\([^)]*\)|[^\n]+)/gm)) {
    modules.push(m[1]);
    fromNames.push(...m[2].replace(/[()]/g, '').split(',').map(n => n.trim().split(/\s+as\s+/)[0]).filter(Boolean));
  }
  for (const m of code.matchAll(/^\s*import\s+([^\n]+)/gm)) {
    modules.push(...m[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0]).filter(Boolean));
  }
  // importlib.import_module("src.calc") / __import__("calc")
  for (const m of code.matchAll(/\b(?:import_module|__import__)\s*\(\s*['"]([.\w]+)['"]/g)) modules.push(m[1]);
  return { modules, fromNames };
}

function pythonVerdict(testCode: string, subject: SourceImportSubject): SourceImportVerdict {
  const target = (subject.importTarget || subject.sourceFilePath).replace(/\\/g, '/').replace(/\.py$/i, '');
  // An importTarget may already be dotted (`src.calc`); a path is split on `/`.
  const segments = (target.includes('/') ? target.split('/') : target.split('.')).filter(Boolean);
  let module = segments[segments.length - 1] ?? '';
  // A package's __init__.py is imported by the package name.
  if (module === '__init__') module = segments[segments.length - 2] ?? '';
  if (!module) return 'unjudged';
  const { modules, fromNames } = pythonImports(testCode);
  // `from src.calc import add`, `import src.calc`, `from .calc import add`, `from calc import add` (conftest / sys.path).
  if (modules.some(m => m.split('.').filter(Boolean).pop() === module)) return 'found';
  // `from src import calc`, `from . import calc`.
  return fromNames.includes(module) ? 'found' : 'missing';
}

// ---------------------------------------------------------------------------
// Go
// ---------------------------------------------------------------------------

/** Top-level declared names in Go/Java/Kotlin source (functions, types, classes, objects). */
function declaredNames(sourceCode: string): string[] {
  const names = new Set<string>();
  const re = /\b(?:func(?:\s*\([^)]*\))?|type|class|interface|object|enum|record|fun|val|var)\s+([A-Za-z_]\w*)/g;
  for (const m of stripSlashComments(sourceCode).matchAll(re)) names.add(m[1]);
  return [...names];
}

function mentionsAny(testCode: string, names: string[]): boolean {
  return names.some(n => new RegExp(`\\b${n}\\b`).test(testCode));
}

function goImports(code: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(/^\s*import\s+(?:[\w.]+\s+)?"([^"]+)"/gm)) out.push(m[1]);
  for (const block of code.matchAll(/^\s*import\s*\(([\s\S]*?)\)/gm)) {
    for (const m of block[1].matchAll(/"([^"]+)"/g)) out.push(m[1]);
  }
  return out;
}

function goVerdict(testCode: string, subject: SourceImportSubject): SourceImportVerdict {
  const code = stripSlashComments(testCode);
  const testPackage = code.match(/^\s*package\s+(\w+)/m)?.[1];
  const sourcePackage = subject.sourceCode?.match(/^\s*package\s+(\w+)/m)?.[1];
  if (!testPackage || !sourcePackage) return sourcePackage ? 'missing' : 'unjudged';
  // Same package (white-box test): no import; it must call something the source declares.
  if (testPackage === sourcePackage) return mentionsAny(code, declaredNames(subject.sourceCode ?? '')) ? 'found' : 'missing';
  // External test package: the source package must be imported by its module path.
  const dirName = lastSegment(path.dirname(subject.sourceFilePath));
  const targetPath = subject.importTarget?.replace(/\\/g, '/');
  const imported = goImports(code).some(p => p === targetPath || [sourcePackage, dirName].includes(lastSegment(p)));
  return imported ? 'found' : 'missing';
}

// ---------------------------------------------------------------------------
// Java / Kotlin
// ---------------------------------------------------------------------------

function jvmVerdict(testCode: string, subject: SourceImportSubject): SourceImportVerdict {
  if (subject.sourceCode === undefined) return 'unjudged';
  const code = stripSlashComments(testCode);
  const sourcePackage = subject.sourceCode.match(/^\s*package\s+([\w.]+)/m)?.[1] ?? '';
  const testPackage = code.match(/^\s*package\s+([\w.]+)/m)?.[1] ?? '';
  const names = declaredNames(subject.sourceCode);
  const stem = path.basename(subject.sourceFilePath).replace(/\.[^.]+$/, '');
  if (names.length === 0) names.push(stem);
  // Same package: no import is needed, but the test must use what the source declares.
  if (testPackage === sourcePackage) return mentionsAny(code, names) ? 'found' : 'missing';
  if (!sourcePackage) return 'missing'; // the default package cannot be imported
  // `import com.example.Calc;`, `import com.example.*`, `import static com.example.Calc.add;`, Kotlin `import com.ex.add`.
  const imported = [...code.matchAll(/^\s*import\s+(?:static\s+)?([\w.]+(?:\.\*)?)/gm)].some(m => {
    const imp = m[1];
    if (!imp.startsWith(`${sourcePackage}.`)) return false;
    const next = imp.slice(sourcePackage.length + 1).split('.')[0];
    return next === '*' || names.includes(next) || next === stem;
  });
  return imported ? 'found' : 'missing';
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/** Quoted-path import (Dart `import 'package:app/calc.dart'`), the gate's original check. */
function quotedPathVerdict(testCode: string, subject: SourceImportSubject): SourceImportVerdict {
  const baseName = lastSegment(subject.importTarget || subject.sourceFilePath);
  return jsSpecifiers(testCode).some(spec => lastSegment(spec) === baseName) ? 'found' : 'missing';
}

export function sourceImportVerdict(testCode: string, subject: SourceImportSubject): SourceImportVerdict {
  const file = subject.sourceFilePath;
  if (isJavaScriptFamily(file)) return javascriptVerdict(testCode, subject);
  if (/\.py$/i.test(file)) return pythonVerdict(testCode, subject);
  if (/\.go$/i.test(file)) return goVerdict(testCode, subject);
  if (/\.(?:java|kt|kts)$/i.test(file)) return jvmVerdict(testCode, subject);
  if (/\.dart$/i.test(file)) return quotedPathVerdict(testCode, subject);
  // C# namespaces, Rust `use crate::`/in-module tests, Swift `@testable import Module`:
  // the module name is not derivable from the file, so the gate does not judge it.
  return 'unjudged';
}
