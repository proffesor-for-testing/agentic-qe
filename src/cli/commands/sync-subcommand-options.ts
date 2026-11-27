/**
 * #1409: options of `aqe sync pull|verify|status`.
 *
 * The parent `sync` command defines `--full`, `-e, --env`, `--since`,
 * `--dry-run` and `-v, --verbose` too, and commander gives a parent's option
 * the value wherever it appears on the command line. So
 * `aqe sync pull --full --env X` set the parent's options, and the pull ran
 * incremental, from every environment. `aqe sync verify --env X` likewise
 * verified the default environment.
 *
 * A subcommand option that was not given on its own keeps the value the user
 * typed for the parent (`getOptionValueSource() === 'cli'`); defaults never
 * override what was typed.
 */
import type { Command } from 'commander';

export function subcommandOptions<T extends Record<string, unknown>>(command: Command): T {
  const own = command.opts();
  const parent = command.parent;
  if (!parent) return own as T;
  const parentValues = parent.opts();
  const merged: Record<string, unknown> = { ...own };
  for (const option of command.options) {
    const name = option.attributeName();
    if (command.getOptionValueSource(name) === 'cli') continue;
    if (parent.getOptionValueSource(name) === 'cli') merged[name] = parentValues[name];
  }
  return merged as T;
}
