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
import { stripCode } from './code-text.js';

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

/** Longest specifier or path the checks look at; longer input is not a real module path. */
const MAX_PATH_LENGTH = 4096;

/** The last `/`-separated segment, ignoring trailing slashes. String operations only (no backtracking regex). */
function lastSegment(p: string): string {
  const s = p.slice(0, MAX_PATH_LENGTH).split('\\').join('/');
  let end = s.length;
  while (end > 0 && s[end - 1] === '/') end--;
  const trimmed = s.slice(0, end);
  return trimmed.slice(trimmed.lastIndexOf('/') + 1);
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
  return specs.filter(spec => spec.length <= MAX_PATH_LENGTH);
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
    // tsc allows at most one '*' in a pattern and in each substitution; it rejects others.
    if (pattern.split('*').length > 2) continue;
    const star = pattern.indexOf('*');
    let captured: string | undefined;
    if (star < 0) captured = pattern === spec ? '' : undefined;
    else if (spec.startsWith(pattern.slice(0, star)) && spec.endsWith(pattern.slice(star + 1))
      && spec.length >= pattern.length - 1) {
      captured = spec.slice(star, spec.length - (pattern.length - star - 1));
    }
    if (captured === undefined) continue;
    for (const target of targets) {
      const parts = target.split('*');
      if (parts.length > 2) continue;
      const substituted = parts.length === 2 ? parts[0] + captured + parts[1] : target;
      out.push(path.resolve(tsPaths.baseDir, substituted).replace(JS_EXT, ''));
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
  // #1371: an import written inside a string or comment is not an import.
  const code = stripCode(testCode, 'python');
  const modules: string[] = [];
  const fromNames: string[] = [];
  for (const m of code.matchAll(/^[ \t]*from\s+([.\w]+)\s+import\s+(\([^)]*\)|[^\n]+)/gm)) {
    modules.push(m[1]);
    fromNames.push(...m[2].replace(/[()]/g, '').split(',').map(n => n.trim().split(/\s+as\s+/)[0]).filter(Boolean));
  }
  for (const m of code.matchAll(/^[ \t]*import\s+([^\n]+)/gm)) {
    modules.push(...m[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0]).filter(Boolean));
  }
  // importlib.import_module("src.calc") / __import__("calc")
  const withStrings = stripCode(testCode, 'python', true);
  for (const m of withStrings.matchAll(/\b(?:import_module|__import__)\s*\(\s*['"]([.\w]+)['"]/g)) modules.push(m[1]);
  return { modules, fromNames };
}

function pythonVerdict(testCode: string, subject: SourceImportSubject): SourceImportVerdict {
  const target = (subject.importTarget || subject.sourceFilePath).replace(/\\/g, '/').replace(/\.py$/i, '');
  // An importTarget may already be dotted (`src.calc`); a path is split on `/`.
  const segments = (target.includes('/') ? target.split('/') : target.split('.')).filter(Boolean);
  let module = segments[segments.length - 1] ?? '';
  // A package's __init__.py is imported by the package name.
  const isPackageInit = module === '__init__';
  if (isPackageInit) module = segments[segments.length - 2] ?? '';
  if (!module) return 'unjudged';
  const { modules, fromNames } = pythonImports(testCode);
  // `from . import add` in a test inside the package imports from its __init__.py.
  if (isPackageInit && modules.includes('.')) return 'found';
  // `from src.calc import add`, `import src.calc`, `from .calc import add`, `from calc import add` (conftest / sys.path).
  if (modules.some(m => m.split('.').filter(Boolean).pop() === module)) return 'found';
  // `from src import calc`, `from . import calc`.
  return fromNames.includes(module) ? 'found' : 'missing';
}

// ---------------------------------------------------------------------------
// Go
// ---------------------------------------------------------------------------

const JVM_MODIFIERS = '(?:(?:public|private|protected|internal|open|final|abstract|sealed|data|value|inline|'
  + 'annotation|enum|static|suspend|expect|actual|const|lateinit|strictfp)\\s+)*';

/**
 * Top-level declarations of Go or Java/Kotlin source: functions, methods,
 * types, classes, objects and package-level variables. #1371: a local
 * (`var err error`, `val total` inside a function) is not something a test
 * can call, so only declarations at the start of a line count (Java/Kotlin
 * members are indented in their class; Go grouped `var (...)` entries are read
 * from the block).
 */
function declaredNames(sourceCode: string, language: 'go' | 'java' | 'kotlin'): Set<string> {
  const code = stripCode(sourceCode, language);
  const names = new Set<string>();
  const add = (re: RegExp) => { for (const m of code.matchAll(re)) names.add(m[1]); };
  if (language === 'go') {
    add(/^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/gm);
    add(/^(?:type|var|const)\s+([A-Za-z_]\w*)/gm);
    for (const block of code.matchAll(/^(?:type|var|const)\s*\(([\s\S]*?)^\)/gm)) {
      for (const m of block[1].matchAll(/^[ \t]+([A-Za-z_]\w*)/gm)) names.add(m[1]);
    }
  } else {
    add(new RegExp(`^${JVM_MODIFIERS}(?:class|interface|object|enum|record|fun|val|var|typealias)\\s+`
      + '(?:<[^>]*>\\s*)?(?:[\\w.]+\\.)?([A-Za-z_]\\w*)', 'gm'));
  }
  return names;
}

/** Names a test declares itself (`var err`, `val total`, `x :=`, `func helper`); using them is not using the source. */
function testDeclaredNames(code: string): Set<string> {
  const names = new Set<string>();
  for (const m of code.matchAll(/\b(?:var|val|const|func|fun|type|class|interface|object)\s+([A-Za-z_]\w*)/g)) names.add(m[1]);
  for (const m of code.matchAll(/\b([A-Za-z_]\w*)\s*(?:,\s*[A-Za-z_]\w*\s*)*:=/g)) names.add(m[1]);
  return names;
}

/** How often each identifier occurs in `code`, and how often it is followed by `(`. One linear scan. */
function identifierCounts(code: string): { mentions: Map<string, number>; calls: Map<string, number> } {
  const mentions = new Map<string, number>();
  const calls = new Map<string, number>();
  for (const m of code.matchAll(/\b[A-Za-z_]\w*/g)) {
    const name = m[0];
    mentions.set(name, (mentions.get(name) ?? 0) + 1);
    let k = m.index! + name.length;
    while (code[k] === ' ' || code[k] === '\t') k++;
    if (code[k] === '(') calls.set(name, (calls.get(name) ?? 0) + 1);
  }
  return { mentions, calls };
}

/**
 * True when the (stripped) test uses a source declaration. A name the test
 * declares itself does not count, unless the test also calls it outside its
 * own declaration (`@Test fun add() { assertEquals(5, add(2, 3)) }`).
 */
function usesSource(code: string, sourceNames: Set<string>): boolean {
  const own = testDeclaredNames(code);
  const { mentions, calls } = identifierCounts(code);
  const declaredCalls = new Map<string, number>();
  for (const m of code.matchAll(/\b(?:fun|func|def)[ \t]+(?:\([^)\n]*\)[ \t]*)?([A-Za-z_]\w*)[ \t]*\(/g)) {
    declaredCalls.set(m[1], (declaredCalls.get(m[1]) ?? 0) + 1);
  }
  for (const name of sourceNames) {
    if (!mentions.has(name)) continue;
    if (!own.has(name) || (calls.get(name) ?? 0) > (declaredCalls.get(name) ?? 0)) return true;
  }
  return false;
}

function goImports(code: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(/^[ \t]*import\s+(?:[\w.]+\s+)?"([^"]+)"/gm)) out.push(m[1]);
  for (const block of code.matchAll(/^[ \t]*import\s*\(([\s\S]*?)\)/gm)) {
    for (const m of block[1].matchAll(/"([^"]+)"/g)) out.push(m[1]);
  }
  return out;
}

function goVerdict(testCode: string, subject: SourceImportSubject): SourceImportVerdict {
  // Imports are string literals: read them before strings are blanked.
  const imports = goImports(stripCode(testCode, 'go', true));
  const code = stripCode(testCode, 'go');
  const testPackage = code.match(/^[ \t]*package\s+(\w+)/m)?.[1];
  const sourcePackage = subject.sourceCode?.match(/^[ \t]*package\s+(\w+)/m)?.[1];
  if (!testPackage || !sourcePackage) return sourcePackage ? 'missing' : 'unjudged';
  // Same package (white-box test): no import; it must call something the source declares.
  if (testPackage === sourcePackage) return usesSource(code, declaredNames(subject.sourceCode ?? '', 'go')) ? 'found' : 'missing';
  // External test package: the source package must be imported by its module path.
  const dirName = lastSegment(path.dirname(subject.sourceFilePath));
  const targetPath = subject.importTarget?.replace(/\\/g, '/');
  const imported = imports.some(p => p === targetPath || [sourcePackage, dirName].includes(lastSegment(p)));
  return imported ? 'found' : 'missing';
}

// ---------------------------------------------------------------------------
// Java / Kotlin
// ---------------------------------------------------------------------------

function jvmVerdict(testCode: string, subject: SourceImportSubject): SourceImportVerdict {
  if (subject.sourceCode === undefined) return 'unjudged';
  const language = /\.kts?$/i.test(subject.sourceFilePath) ? 'kotlin' : 'java';
  const code = stripCode(testCode, language);
  const sourcePackage = subject.sourceCode.match(/^[ \t]*package\s+([\w.]+)/m)?.[1] ?? '';
  const testPackage = code.match(/^[ \t]*package\s+([\w.]+)/m)?.[1] ?? '';
  const names = declaredNames(subject.sourceCode, language);
  const stem = path.basename(subject.sourceFilePath).replace(/\.[^.]+$/, '');
  if (names.size === 0) names.add(stem);
  // Same package: no import is needed, but the test must use what the source declares.
  if (testPackage === sourcePackage) return usesSource(code, names) ? 'found' : 'missing';
  if (!sourcePackage) return 'missing'; // the default package cannot be imported
  // `import com.example.Calc;`, `import com.example.*`, `import static com.example.Calc.add;`, Kotlin `import com.ex.add`.
  // #1371: `\w+(?:\.\w+)*` so the `.` before a wildcard is not swallowed.
  const imported = [...code.matchAll(/^[ \t]*import\s+(?:static\s+)?(\w+(?:\.\w+)*(?:\.\*)?)/gm)].some(m => {
    const imp = m[1];
    if (!imp.startsWith(`${sourcePackage}.`)) return false;
    const next = imp.slice(sourcePackage.length + 1).split('.')[0];
    // A wildcard import counts only when the test then uses a source declaration.
    return next === '*' ? usesSource(code, names) : names.has(next) || next === stem;
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
