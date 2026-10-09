import type { PluginOptions } from 'claude-code'

/**
 * The guard's mode. `enforce` (default): refuse. `notify`: let the call run,
 * toast and count it. `off`: read nothing.
 */
export type GuardMode = 'off' | 'notify' | 'enforce'
export const GUARD_MODES: readonly GuardMode[] = ['off', 'notify', 'enforce']

/** The plugin's `userConfig`, validated: a missing or unknown value is the default, enforce. */
export type ModOptions = { readonly mode: GuardMode }

/** The userConfig key this mod reads. */
export const OPTION_KEY = 'guardMode'

/** `on`/`true` read as enforce and `false` as off, so a boolean-style setting still means what it says. */
export function asMode(value: unknown): GuardMode | undefined {
  if (value === true || value === 'on' || value === 'true') return 'enforce'
  if (value === false || value === 'false') return 'off'
  return GUARD_MODES.find(m => m === value)
}

export function readOptions(options: PluginOptions | Readonly<Record<string, unknown>> | undefined): ModOptions {
  const o = (options ?? {}) as Readonly<Record<string, unknown>>
  return { mode: asMode(o[OPTION_KEY]) ?? 'enforce' }
}
