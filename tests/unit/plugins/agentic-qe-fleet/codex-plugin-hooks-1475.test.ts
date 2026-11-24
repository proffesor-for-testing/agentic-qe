/**
 * #1475: Codex (0.171+) loads `<plugin>/hooks/hooks.json` by convention, and
 * follows a `hooks` path in the plugin manifest it reads, as a lifecycle-hooks
 * file whose only top-level keys are `description` and `hooks`. The aqe-mod
 * manifest (`{ description, modules }`) is a Claude Code function-hooks file,
 * so Codex warned at startup: "unknown field `modules`".
 *
 * The layout that keeps both hosts happy:
 *   - the mod manifest lives at hooks/aqe-mod.json, named by the Claude Code
 *     manifest's `hooks` field;
 *   - nothing sits at hooks/hooks.json;
 *   - .codex-plugin/plugin.json (which Codex prefers over .claude-plugin/)
 *     declares no hooks, so Codex never reaches the mod manifest.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const pluginDir = resolve(import.meta.dirname, '../../../../plugins/agentic-qe-fleet')
const readJson = (rel: string): Record<string, unknown> =>
  JSON.parse(readFileSync(resolve(pluginDir, rel), 'utf8')) as Record<string, unknown>

/** The top-level keys Codex accepts in a plugin hooks file (its error names them). */
const CODEX_HOOKS_FILE_KEYS = new Set(['description', 'hooks'])

/** Every hooks file Codex would parse for this plugin, given the manifest it reads. */
function codexHookFiles(): string[] {
  const codexManifest = '.codex-plugin/plugin.json'
  const manifest = existsSync(resolve(pluginDir, codexManifest)) ? readJson(codexManifest) : readJson('.claude-plugin/plugin.json')
  const declared = manifest.hooks
  const paths = declared === undefined ? ['./hooks/hooks.json'] : (Array.isArray(declared) ? declared : [declared])
  return paths.filter((p): p is string => typeof p === 'string').filter((p) => existsSync(resolve(pluginDir, p)))
}

describe('agentic-qe-fleet plugin hooks layout for Codex (#1475)', () => {
  it('gives Codex no hooks file it cannot parse', () => {
    for (const rel of codexHookFiles()) {
      const keys = Object.keys(readJson(rel))
      expect(keys.filter((k) => !CODEX_HOOKS_FILE_KEYS.has(k)), `${rel} top-level keys`).toEqual([])
    }
  })

  it('keeps nothing at the conventional hooks/hooks.json path', () => {
    expect(existsSync(resolve(pluginDir, 'hooks/hooks.json'))).toBe(false)
  })

  it('ships a Codex manifest that declares no hooks and matches the Claude manifest identity', () => {
    const codex = readJson('.codex-plugin/plugin.json')
    const claude = readJson('.claude-plugin/plugin.json')
    expect(codex).not.toHaveProperty('hooks')
    expect(codex.name).toBe(claude.name)
    expect(codex.version).toBe(claude.version)
  })

  it('still points Claude Code at the aqe-mod manifest, which loads ./register.ts', () => {
    const claude = readJson('.claude-plugin/plugin.json')
    expect(claude.hooks).toBe('./hooks/aqe-mod.json')
    const mod = readJson('hooks/aqe-mod.json')
    expect(mod.modules).toEqual(['./register.ts'])
    expect(existsSync(resolve(pluginDir, 'hooks/register.ts'))).toBe(true)
  })
})
