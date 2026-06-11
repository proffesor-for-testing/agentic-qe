/**
 * ADR-107: Invariant verification for shipped agent definitions.
 *
 * Section-level assertions (content minimums inside tags), NOT keyword greps —
 * a stripped section body with a surviving heading must fail (the
 * verify_editions.py lesson from the Pattern Space assessment).
 *
 * Checks:
 *  1. Every shipped qe-*.md (non-exempt) contains each required section with
 *     at least minChars of content inside the tag.
 *  2. Shipped vs source (.claude/agents/v3) must not diverge on required
 *     sections for same-named files (exact content compare).
 *  3. assets/agents/v3 top-level .md files are qe-*.md only (+ allowlist).
 *  4. Exemptions are reported loudly as warnings, never silently skipped.
 *  5. Frontmatter version vs package.json — warn or fail per manifest policy.
 *
 * Run: npx tsx scripts/verify-shipped-invariants.ts [--repo-root <dir>]
 * Exit: 0 clean (warnings allowed), 1 on any violation.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface RequiredSection { tag: string; minChars: number; why: string; }
export interface InvariantManifest {
  shippedGlob: string;
  sourceRoot: string;
  requiredSections: RequiredSection[];
  exemptions: Record<string, string>;
  topLevelAllowlist: string[];
  versionPolicy: { mode: 'warn' | 'fail' };
}
export interface Violation { file: string; rule: string; detail: string; }
export interface VerifyResult { violations: Violation[]; warnings: Violation[]; checkedFiles: number; }

/** Extract inner content of <tag>...</tag>; null if the tag pair is absent. */
export function extractSection(content: string, tag: string): string | null {
  const m = content.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : null;
}

/** Check one shipped file against the required sections. */
export function checkSections(fileName: string, content: string, required: RequiredSection[]): Violation[] {
  const out: Violation[] = [];
  for (const sec of required) {
    const body = extractSection(content, sec.tag);
    if (body === null) {
      out.push({ file: fileName, rule: 'required-section-missing', detail: `<${sec.tag}> absent (${sec.why})` });
    } else if (body.length < sec.minChars) {
      out.push({
        file: fileName,
        rule: 'required-section-hollow',
        detail: `<${sec.tag}> has ${body.length} chars < ${sec.minChars} minimum — stripped or compressed body`,
      });
    }
  }
  return out;
}

/** Compare required sections between shipped and source copies. */
export function checkDivergence(fileName: string, shipped: string, source: string, required: RequiredSection[]): Violation[] {
  const out: Violation[] = [];
  for (const sec of required) {
    const a = extractSection(shipped, sec.tag);
    const b = extractSection(source, sec.tag);
    if (a !== b) {
      out.push({
        file: fileName,
        rule: 'shipped-source-divergence',
        detail: `<${sec.tag}> differs between assets/ and ${path.join('.claude/agents/v3')} — hand-sync drift`,
      });
    }
  }
  return out;
}

export function verify(repoRoot: string, manifest: InvariantManifest): VerifyResult {
  const violations: Violation[] = [];
  const warnings: Violation[] = [];
  const shippedDir = path.join(repoRoot, path.dirname(manifest.shippedGlob));
  const sourceDir = path.join(repoRoot, manifest.sourceRoot);
  const pkgVersion = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version as string;

  const entries = fs.readdirSync(shippedDir, { withFileTypes: true });
  const mdFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => e.name);

  // Rule 3: top-level allowlist
  for (const f of mdFiles) {
    if (!f.startsWith('qe-') && !manifest.topLevelAllowlist.includes(f)) {
      violations.push({ file: f, rule: 'non-qe-agent-shipped', detail: 'assets/agents/v3 may contain only qe-*.md (CLAUDE.md scope rule)' });
    }
  }

  const qeFiles = mdFiles.filter((f) => f.startsWith('qe-'));
  for (const f of qeFiles) {
    const shippedContent = fs.readFileSync(path.join(shippedDir, f), 'utf8');

    // Rule 4: exemptions warn loudly, never silently pass
    if (manifest.exemptions[f]) {
      warnings.push({ file: f, rule: 'exempt', detail: manifest.exemptions[f] });
    } else {
      // Rule 1: required sections
      violations.push(...checkSections(f, shippedContent, manifest.requiredSections));

      // Rule 2: divergence vs source
      const sourcePath = path.join(sourceDir, f);
      if (fs.existsSync(sourcePath)) {
        violations.push(...checkDivergence(f, shippedContent, fs.readFileSync(sourcePath, 'utf8'), manifest.requiredSections));
      } else {
        violations.push({ file: f, rule: 'orphan-shipped-file', detail: `shipped but missing from ${manifest.sourceRoot}` });
      }
    }

    // Rule 5: version policy
    const fm = shippedContent.match(/^version:\s*"?([\d.]+)"?/m);
    if (fm && fm[1] !== pkgVersion) {
      const v: Violation = { file: f, rule: 'version-mismatch', detail: `frontmatter ${fm[1]} != package.json ${pkgVersion}` };
      (manifest.versionPolicy.mode === 'fail' ? violations : warnings).push(v);
    }
  }

  return { violations, warnings, checkedFiles: qeFiles.length };
}

function main(): void {
  const rootIdx = process.argv.indexOf('--repo-root');
  const repoRoot = rootIdx > -1 ? process.argv[rootIdx + 1] : process.cwd();
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'config/agent-invariants.json'), 'utf8')) as InvariantManifest;
  const { violations, warnings, checkedFiles } = verify(repoRoot, manifest);

  for (const w of warnings) console.warn(`⚠️  [${w.rule}] ${w.file}: ${w.detail}`);
  for (const v of violations) console.error(`❌ [${v.rule}] ${v.file}: ${v.detail}`);
  console.log(`\nChecked ${checkedFiles} shipped agent definitions: ${violations.length} violation(s), ${warnings.length} warning(s).`);
  process.exit(violations.length > 0 ? 1 : 0);
}

// Only run as CLI, not on test import
if (process.argv[1]?.endsWith('verify-shipped-invariants.ts')) main();
